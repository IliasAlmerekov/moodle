import config from "../config/env.js";
import {
  getUserInfo,
  getUserCourses,
  getSiteInfo,
  createUserToken,
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
    const token = extractUserToken(request);

    if (!token) {
      reply.code(401);
      return {
        status: "error",
        message: "Missing Moodle user token. Authenticate via /moodle/login.",
      };
    }

    // step 1: get userId from token
    const siteInfo = await getSiteInfo(token); // return userId
    const userId = siteInfo.userid;

    // step 2: get user info
    const userInfo = await getUserInfo(userId, token); // return {firstname, lastname}

    // step 3: get user courses
    const userCourses = await getUserCourses(userId, token); //return [{id, fullname, ...}]

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

export async function loginWithMoodleCredentials(request, reply) {
  const { username, password } = request.body || {};

  if (!username || !password) {
    reply.code(400);
    return {
      status: "error",
      message: "Username and password are required",
    };
  }

  try {
    const token = await createUserToken(username, password);

    const siteInfo = await getSiteInfo(token);
    const userId = siteInfo.userid;

    const userInfo = await getUserInfo(userId, token);
    const userCourses = await getUserCourses(userId, token);

    return {
      status: "ok",
      token,
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
    request.log.error({ error }, "Failed to authenticate Moodle user");
    reply.code(401);
    return {
      status: "error",
      message: error.message,
    };
  }
}

function extractUserToken(request) {
  const authHeader = request.headers?.authorization;

  if (!authHeader) {
    return null;
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}
