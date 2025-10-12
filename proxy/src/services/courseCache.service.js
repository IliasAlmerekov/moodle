import { getAllCourses, getCourseContents } from "./moodle.service.js";
import config from "../config/env.js";

let coursesStructure = null;
let lastUpdate = null;
const CACHE_TTL = 3600000; // 1 hour in milliseconds
const MOODLE_URL = config.moodle.url;

export async function loadCoursesStructure(logger) {
  const courses = await getAllCourses();

  const structure = await Promise.all(
    courses.map(async (course) => {
      const contents = await getCourseContents(course.id);

      return {
        id: course.id,
        name: course.fullname,
        shortname: course.shortname,
        url: `${MOODLE_URL}/course/view.php?id=${course.id}`,
        sections: contents.map((section) => ({
          id: section.id,
          name: section.name,
          modules: section.modules.map((module) => ({
            id: module.id,
            name: module.name,
            type: module.modname,
            url: `${MOODLE_URL}/mod/${module.modname}/view.php?id=${module.id}`,
          })),
        })),
      };
    })
  );

  coursesStructure = structure;
  lastUpdate = Date.now();

  logger.info(
    `Cached ${structure.length} courses, size: ~${
      JSON.stringify(structure).length / 1024
    } KB`
  );
  return structure;
}

export function getCoursesStructure() {
  if (!coursesStructure || Date.now() - lastUpdate > CACHE_TTL) {
    throw new Error("Cache expired or not loaded");
  }

  return coursesStructure;
}
