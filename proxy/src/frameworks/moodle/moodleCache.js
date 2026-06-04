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

function firstText(...values) {
  return values.find((value) => typeof value === "string" && value.trim()) ?? "";
}

function isPageHtml(module, file) {
  return (
    (module.modname === "page" || module.type === "page") &&
    (file.filename === "index.html" || file.mimetype === "text/html")
  );
}

function htmlToText(html) {
  return String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function getPageText(client, module, file) {
  if (!file.fileurl || !isPageHtml(module, file) || typeof client.getTextFile !== "function") {
    return "";
  }

  try {
    return htmlToText(await client.getTextFile(file.fileurl)).substring(0, 3000);
  } catch {
    return "";
  }
}

async function createCourseStructure(course, contents, client) {
  return {
    id: course.id,
    name: course.fullname ?? course.name ?? "",
    shortname: course.shortname ?? "",
    summary: course.summary ?? "",
    url: buildMoodleUrl(`/course/view.php?id=${course.id}`),
    sections: await Promise.all(
      contents.map(async (section) => ({
        id: section.id,
        name: section.name,
        summary: firstText(section.summary),
        modules: await Promise.all(
          (section.modules ?? []).map(async (module) => {
            const sourceFiles = (module.contents ?? []).filter((content) => content.type === "file");
            const files = await Promise.all(
              sourceFiles.map(async (file) => ({
                filename: file.filename,
                mimetype: file.mimetype,
                url: toUserFacingFileUrl(file.fileurl),
                path: file.filepath ?? "",
                text: await getPageText(client, module, file),
              })),
            );
            const pageText = firstText(...files.map((file) => file.text));

            return {
              id: module.id,
              name: module.name,
              type: module.modname ?? module.type ?? "",
              summary: firstText(module.description, module.summary, pageText),
              url:
                module.url ||
                buildMoodleUrl(`/mod/${module.modname ?? module.type}/view.php?id=${module.id}`),
              files: files.map((file) => ({
                filename: file.filename,
                mimetype: file.mimetype,
                url: file.url,
                path: file.path,
              })),
            };
          }),
        ),
      })),
    ),
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
        createCourseStructure(course, await client.getCourseContents(course.id), client),
      ),
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
      return getCachedUserEntry(
        userInfoCache,
        userId,
        client.getUserInfo.bind(client),
        "user-info",
      );
    },

    async getUserCourses(userId) {
      return getCachedUserEntry(
        userCoursesCache,
        userId,
        client.getUserCourses.bind(client),
        "user-courses",
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
