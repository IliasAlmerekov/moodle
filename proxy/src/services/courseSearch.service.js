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
    const queryLower = query.toLowerCase();

    const course = courses.find(
      (c) =>
        queryLower.includes(c.name.toLowerCase()) ||
        queryLower.includes(c.shortname.toLowerCase())
    );

    if (!course) {
      return { found: false, message: "Course not found" };
    }

    const words = queryLower.split(" ");
    let relevantSections = [];

    for (const section of course.sections) {
      const sectionMatch = words.some((word) =>
        section.name.toLowerCase().includes(word)
      );

      if (sectionMatch) {
        relevantSections.push(section);
      }
    }

    if (relevantSections.length === 0) {
      relevantSections = course.sections;
    }

    const fullContents = await getCourseContents(course.id);
    const detailedSections = relevantSections.slice(0, 3).map((section) => {
      const fullSection = fullContents.find((s) => s.id === section.id);

      return {
        name: section.name,
        summary: fullSection?.summary || "",
        modules:
          fullSection?.modules?.map((module) => ({
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
                  url: sanitiseFileUrl(file.fileurl),
                })) || [],
          })) || [],
      };
    });

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

function sanitiseFileUrl(fileUrl) {
  if (!fileUrl) {
    return fileUrl;
  }

  try {
    const url = new URL(fileUrl);
    url.searchParams.delete("token");
    return url.toString();
  } catch {
    return fileUrl;
  }
}
