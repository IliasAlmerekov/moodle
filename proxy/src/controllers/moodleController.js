import config from "../config/env.js";
import {
  getUserInfo,
  getUserCourses,
  getSiteInfo,
} from "../services/moodle.service.js";

// Health check for Moodle instance
export async function getMoodlePing(request, reply) {
  if (!config.moodle.isConfigured) {
    reply.code(503);
    return { status: "error", message: "Moodle is not configured" };
  }

  try {
    const response = await fetch(config.moodle.url, { method: "HEAD" });
    return {
      status: response.ok ? "up" : "degraded",
      httpStatus: response.status,
    };
  } catch (error) {
    request.log.error({ err: error }, "Failed to reach Moodle instance");
    reply.code(502);
    return {
      status: "error",
      message: "Unable to reach Moodle",
      detail: error.message,
    };
  }
}

// getUserId
export async function getUserId(request, reply) {
  try {
    const siteInfo = await getSiteInfo();
    return {
      status: "ok",
      userId: siteInfo.userid,
      username: siteInfo.username,
      firstname: siteInfo.firstname,
      lastname: siteInfo.lastname,
    };
  } catch (error) {
    reply.code(500);
    return { status: "error", message: error.message };
  }
}

// getUserInfo
export async function getUserInformation(request, reply) {
  try {
    const userId = request.params.userId;
    const user = await getUserInfo(userId);
    return { status: "ok", data: user };
  } catch (error) {
    reply.code(500);
    return { status: "error", message: error.message };
  }
}

// getUserCourses
export async function getUserCoursesController(request, reply) {
  try {
    const userId = request.params.userId;
    const courses = await getUserCourses(userId);
    return { status: "ok", data: courses };
  } catch (error) {
    reply.code(500);
    return { status: "error", message: error.message };
  }
}
