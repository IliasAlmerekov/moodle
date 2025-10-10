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

export async function getCurrentUserProfile(request, reply) {
  try {
    // step 1: get userId from token
    const siteInfo = await getSiteInfo(); // return userId
    const userId = siteInfo.userid;

    // step 2: get user info
    const userInfo = await getUserInfo(userId); // return {firstname, lastname}

    // step 3: get user courses
    const userCourses = await getUserCourses(userId); //return [{id, fullname, ...}]

    // step 4: return combined response
    return {
      status: "ok",
      user: {
        id: userId,
        username: siteInfo.username,
        firstname: userInfo.firstname,
        lastname: userInfo.lastname,
        email: userInfo.email || siteInfo.useremail,
      },
      courses: userCourses.map((course) => ({
        id: course.id,
        name: course.fullname,
        shortname: course.shortname,
      })),
    };
  } catch (error) {
    request.log.error({ error }, "Failed to get current user profile");
    reply.code(500);
    return {
      status: "error",
      message: error.message,
    };
  }
}
