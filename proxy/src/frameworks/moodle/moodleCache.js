import config from "../../config/env.js";
import { moodleClient } from "./moodleClient.js";

const NOOP_LOGGER = Object.freeze({
  info() {},
});

function buildMoodleUrl(path) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${config.moodle.url}${cleanPath}`;
}

function toUserFacingFileUrl(fileUrl) {
  if (!fileUrl) return fileUrl;

  try {
    const base = new URL(config.moodle.url);
    const url = new URL(fileUrl, base);
    url.pathname = url.pathname.replace(/\/webservice\/pluginfile\.php/i, "/pluginfile.php");
    url.searchParams.delete("token");
    url.protocol = base.protocol;
    url.host = base.host;
    url.port = base.port;
    return url.toString();
  } catch {
    return fileUrl;
  }
}

function isFresh(entry, ttl, now) {
  return Boolean(entry) && now() - entry.fetchedAt <= ttl;
}

function logCache(logger, message, meta) {
  logger.info(meta, message);
}

function createCourseStructure(course, contents) {
  return {
    id: course.id,
    name: course.fullname ?? course.name ?? "",
    shortname: course.shortname ?? "",
    summary: course.summary ?? "",
    url: buildMoodleUrl(`/course/view.php?id=${course.id}`),
    sections: contents.map((section) => ({
      id: section.id,
      name: section.name,
      modules: (section.modules ?? []).map((module) => ({
        id: module.id,
        name: module.name,
        type: module.modname ?? module.type ?? "",
        url: buildMoodleUrl(`/mod/${module.modname ?? module.type}/view.php?id=${module.id}`),
        files: (module.contents ?? [])
          .filter((content) => content.type === "file")
          .map((file) => ({
            filename: file.filename,
            mimetype: file.mimetype,
            url: toUserFacingFileUrl(file.fileurl),
          })),
      })),
    })),
  };
}

export function createMoodleCache({
  client = moodleClient,
  logger = NOOP_LOGGER,
  now = Date.now,
  courseTtl = config.cache.courseTtl,
  userTtl = config.cache.userTtl,
} = {}) {
  let courseEntry = null;
  const userInfoCache = new Map();
  const userCoursesCache = new Map();
  const counters = {
    courses: { hits: 0, misses: 0 },
    users: { hits: 0, misses: 0 },
  };

  async function loadCourses() {
    logCache(logger, "Moodle course cache miss", { cache: "courses" });
    counters.courses.misses += 1;

    const courses = await client.getAllCourses();
    const structure = await Promise.all(
      courses.map(async (course) =>
        createCourseStructure(course, await client.getCourseContents(course.id))
      )
    );

    courseEntry = {
      data: structure,
      fetchedAt: now(),
    };

    logCache(logger, "Moodle course cache refreshed", {
      cache: "courses",
      count: structure.length,
    });

    return structure;
  }

  async function getCourses() {
    if (isFresh(courseEntry, courseTtl, now)) {
      counters.courses.hits += 1;
      logCache(logger, "Moodle course cache hit", {
        cache: "courses",
        count: courseEntry.data.length,
      });
      return courseEntry.data;
    }

    return loadCourses();
  }

  async function getCachedUserEntry(cache, userId, loader, cacheName) {
    const entry = cache.get(userId);
    if (isFresh(entry, userTtl, now)) {
      counters.users.hits += 1;
      logCache(logger, "Moodle user cache hit", { cache: cacheName, userId });
      return entry.data;
    }

    counters.users.misses += 1;
    logCache(logger, "Moodle user cache miss", { cache: cacheName, userId });

    const data = await loader(userId);
    cache.set(userId, {
      data,
      fetchedAt: now(),
    });
    return data;
  }

  return {
    async getAllCourses() {
      return getCourses();
    },

    async getCourseContents(courseId) {
      const courses = await getCourses();
      const course = courses.find((item) => item.id === courseId);
      return course?.sections ?? [];
    },

    async getUserInfo(userId) {
      return getCachedUserEntry(userInfoCache, userId, client.getUserInfo.bind(client), "user-info");
    },

    async getUserCourses(userId) {
      return getCachedUserEntry(
        userCoursesCache,
        userId,
        client.getUserCourses.bind(client),
        "user-courses"
      );
    },

    invalidateCourseCache() {
      courseEntry = null;
      logCache(logger, "Moodle course cache invalidated", { cache: "courses" });
    },

    invalidateUserCache(userId) {
      userInfoCache.delete(userId);
      userCoursesCache.delete(userId);
      logCache(logger, "Moodle user cache invalidated", { cache: "users", userId });
    },

    get stats() {
      return {
        courses: {
          entries: courseEntry ? 1 : 0,
          count: courseEntry?.data.length ?? 0,
          hits: counters.courses.hits,
          misses: counters.courses.misses,
          ttlMs: courseTtl,
        },
        users: {
          entries: new Set([...userInfoCache.keys(), ...userCoursesCache.keys()]).size,
          hits: counters.users.hits,
          misses: counters.users.misses,
          ttlMs: userTtl,
        },
      };
    },
  };
}

export const moodleCache = createMoodleCache();
