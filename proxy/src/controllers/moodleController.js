import config from "../config/env.js";
import { getUserCourses } from "../services/moodle.service.js";

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

export async function getUserInfoById(request, reply) {
  const rawId = request.params?.id;
  const userId = Number(rawId);

  if (!Number.isInteger(userId) || userId <= 0) {
    reply.code(400);
    return {
      status: "error",
      message: "Invalid user ID",
    };
  }

  try {
    const userInfo = await getUserInfoById(userId);

    return {
      staus: "ok",
      userId: userId,
      firstname: userInfo.firstname,
      lastname: userInfo.lastname,
      fullname: userInfo.fullname,
      email: userInfo.email,
    };
  } catch (error) {
    request.log.error(
      { error },
      `Failed to get info for user ${request.params.userId}`
    );
    reply.code(500);
    return {
      status: "error",
      message: error.message,
    };
  }
}

export async function getUserCoursesById(request, reply) {
  const rawId = request.params?.id;
  const userId = Number(rawId);

  if (!Number.isInteger(userId) || userId <= 0) {
    reply.code(400);
    return {
      status: "error",
      message: "Invalid user ID",
    };
  }

  try {
    const courses = await getUserCourses(userId);

    return {
      status: "ok",
      userId: userId,
      courses: courses.map((course) => ({
        id: course.id,
        name: course.fullname,
        shortname: course.shortname,
      })),
    };
  } catch (error) {
    request.log.error(
      { error },
      `Failed to get courses for user ${request.params.userId}`
    );
    reply.code(500);
    return {
      status: "error",
      message: error.message,
    };
  }
}
