import { getCoursesStructure } from "./courseCache.service.js";
import { getCourseContents } from "./moodle.service.js";

export function findCourse(searchTerm) {
  const courses = getCoursesStructure();
  const term = searchTerm.toLowerCase();

  return courses.find(
    (course) =>
      course.name.toLowerCase().includes(term) ||
      course.shortname.toLowerCase().includes(term)
  );
}

export function findModuleInCourse(course, moduleName) {
  const term = moduleName.toLowerCase();

  for (const section of course.sections) {
    const module = section.modules.find((mod) =>
      mod.name.toLowerCase().includes(term)
    );
    if (module) {
      return { section, module };
    }
  }
  return null;
}

export async function smartSearch(query, logger) {
  try {
    const courses = getCoursesStructure();
    const tokens = tokenize(query);
    const fallbackTokens = tokens.length ? tokens : [normalize(query)];

    const directMatch = courses.find((course) =>
      courseMatchesTokens(course, fallbackTokens)
    );

    const contentMatch = directMatch
      ? null
      : findCourseByContent(courses, fallbackTokens);

    const course = directMatch ?? contentMatch?.course;
    if (!course) {
      return { found: false, message: "Course not found" };
    }

    const sectionIds =
      contentMatch?.sectionIds ?? pickSectionIds(course, fallbackTokens);

    const selectedSections = course.sections.filter((section) =>
      sectionIds.has(section.id)
    );

    const limitedSections = (selectedSections.length
      ? selectedSections
      : course.sections
    ).slice(0, 3);

    const fullContents = await getCourseContents(course.id);
    const detailedSections = limitedSections.map((section) =>
      enrichSection(section, fullContents)
    );

    return {
      found: true,
      course: {
        name: course.name,
        url: course.url,
      },
      section: detailedSections,
    };
  } catch (error) {
    logger?.warn("Smart search failed, cache not loaded:", error.message);
    return {
      found: false,
      message:
        "Course search unavailable - cache not loaded. Please create a valid Moodle token first.",
    };
  }
}

function enrichSection(section, fullContents) {
  const fullSection = fullContents.find((s) => s.id === section.id) ?? {};
  const modules = fullSection.modules ?? [];

  return {
    name: section.name,
    summary: fullSection.summary || "",
    modules: modules.map(formatModule),
  };
}

function formatModule(module) {
  return {
    name: module.name,
    type: module.modname || module.type || "",
    description: module.description || "",
    url: module.url,
    files:
      module.contents
        ?.filter((content) => content.type === "file")
        ?.map((file) => ({
          filename: file.filename,
          mimetype: file.mimetype,
          url: appendForcedDownload(sanitiseFileUrl(file.fileurl)),
        })) || [],
  };
}

function pickSectionIds(course, tokens, includeAllOnEmpty = true) {
  const ids = new Set();

  course.sections.forEach((section) => {
    const sectionName = normalize(section.name);
    const sectionMatches = tokens.some((token) =>
      sectionName.includes(token)
    );

    const moduleMatches = section.modules?.some((module) => {
      const moduleName = normalize(module.name);
      const matchesName = tokens.some((token) =>
        moduleName.includes(token)
      );

      const fileMatches = module.files?.some((file) => {
        const fileName = normalize(file.filename);
        return tokens.some((token) => fileName.includes(token));
      });

      return matchesName || fileMatches;
    });

    if (sectionMatches || moduleMatches) {
      ids.add(section.id);
    }
  });

  if (!ids.size && includeAllOnEmpty) {
    course.sections.forEach((section) => ids.add(section.id));
  }

  return ids;
}

function findCourseByContent(courses, tokens) {
  for (const course of courses) {
    const sectionIds = pickSectionIds(course, tokens, false);
    if (sectionIds.size) {
      return { course, sectionIds };
    }
  }
  return null;
}

function courseMatchesTokens(course, tokens) {
  const courseName = normalize(course.name);
  const shortName = normalize(course.shortname);

  return tokens.some(
    (token) => courseName.includes(token) || shortName.includes(token)
  );
}

function tokenize(text) {
  return text
    .split(/\s+/)
    .map((part) => normalize(part))
    .filter((part) => part.length >= 3);
}

function normalize(text) {
  return (text || "").toLowerCase().trim();
}

function sanitiseFileUrl(fileUrl) {
  if (!fileUrl) {
    return fileUrl;
  }

  try {
    const url = new URL(fileUrl);
    if (url.searchParams.has("token")) {
      url.searchParams.delete("token");
    }
    return url.toString();
  } catch {
    return fileUrl;
  }
}

function appendForcedDownload(url) {
  if (!url) {
    return url;
  }

  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("forcedownload")) {
      parsed.searchParams.set("forcedownload", "1");
    }
    return parsed.toString();
  } catch {
    return url;
  }
}
