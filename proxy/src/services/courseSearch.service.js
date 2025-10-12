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

  const detailedSections = await Promise.all(
    relevantSections.slice(0, 3).map(async (section) => {
      const fullContents = await getCourseContents(course.id);
      const fullSection = fullContents.find((s) => s.id === section.id);

      return {
        name: section.name,
        summary: fullSection?.summary || "",
        modules:
          fullSection?.modules?.map((module) => ({
            name: mod.name,
            type: module.type,
            description: module.description || "",
            url: module.url,
          })) || [],
      };
    })
  );

  return {
    found: true,
    course: {
      name: course.name,
      url: course.url,
    },
    section: detailedSections,
  };
}
