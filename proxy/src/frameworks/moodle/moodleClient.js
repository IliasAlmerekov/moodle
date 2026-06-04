import config from "../../config/env.js";

const RETRY_DELAYS_MS = [500, 1000, 2000];

function createMoodleError(message, details = {}) {
  return Object.assign(new Error(message), {
    statusCode: 502,
    retryable: false,
    ...details,
  });
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withRetry(operation) {
  let lastError;

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_DELAYS_MS.length - 1 || error.retryable === false) {
        break;
      }
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }

  throw lastError;
}

async function callMoodle(wsfunction, params = {}) {
  const urlParams = new URLSearchParams({
    wstoken: config.moodle.token,
    wsfunction,
    moodlewsrestformat: "json",
    ...params,
  });

  const url = `${config.moodle.url}/webservice/rest/server.php?${urlParams}`;

  return withRetry(async () => {
    let response;

    try {
      response = await fetch(url);
    } catch (error) {
      throw createMoodleError("Moodle request failed", { cause: error, retryable: true });
    }

    if (!response.ok) {
      throw createMoodleError(`Moodle API error: ${response.status} ${response.statusText}`, {
        moodleStatus: response.status,
        retryable: response.status === 429 || response.status >= 500,
      });
    }

    const data = await response.json();

    if (data?.exception) {
      throw createMoodleError(`Moodle error: ${data.message || data.exception}`, {
        moodleException: data.exception,
        moodleErrorCode: data.errorcode,
      });
    }

    return data;
  });
}

export const moodleClient = {
  async getAllCourses() {
    return callMoodle("core_course_get_courses");
  },

  async getCourseContents(courseId) {
    return callMoodle("core_course_get_contents", {
      courseid: courseId,
    });
  },

  async getTextFile(fileUrl) {
    const url = new URL(fileUrl, config.moodle.url);
    url.searchParams.set("token", config.moodle.token);

    return withRetry(async () => {
      let response;

      try {
        response = await fetch(url);
      } catch (error) {
        throw createMoodleError("Moodle file request failed", { cause: error, retryable: true });
      }

      if (!response.ok) {
        throw createMoodleError(`Moodle file error: ${response.status} ${response.statusText}`, {
          moodleStatus: response.status,
          retryable: response.status === 429 || response.status >= 500,
        });
      }

      return response.text();
    });
  },

  async getUserInfo(userId) {
    const users = await callMoodle("core_user_get_users_by_field", {
      field: "id",
      "values[0]": userId,
    });

    if (Array.isArray(users) && users.length > 0) {
      return users[0];
    }

    throw Object.assign(new Error(`User with ID ${userId} not found`), { statusCode: 404 });
  },

  async getUserCourses(userId) {
    return callMoodle("core_enrol_get_users_courses", {
      userid: userId,
    });
  },
};
