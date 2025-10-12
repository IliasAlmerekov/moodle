import config from "../config/env.js";

export async function callMoodleAPI(functionName, params = {}) {
  // check if moodle configured
  if (!config.moodle.isConfigured) {
    throw new Error("Moodle is not configured");
  }

  // create parameters for url
  const urlParams = new URLSearchParams({
    wstoken: config.moodle.token,
    wsfunction: functionName,
    moodlewsrestformat: "json",
    ...params,
  });

  const url = `${config.moodle.url}/webservice/rest/server.php?${urlParams}`;

  try {
    // make the API call
    const response = await fetch(url);

    // check status
    if (!response.ok) {
      throw new Error(`Moodle API error! status: ${response.statusText}`);
    }

    // parse JSON response
    const data = await response.json();

    // check for moodle error
    if (data.exception) {
      throw new Error(`Moodle error: ${data.message || data.exception}`);
    }

    return data;
  } catch (error) {
    console.error(`Failed to call Moodle API (${functionName});`, error);
    throw error;
  }
}

export async function getSiteInfo() {
  return callMoodleAPI("core_webservice_get_site_info");
}

export async function getUserInfo(userId) {
  const result = await callMoodleAPI("core_user_get_users_by_field", {
    field: "id",
    "values[0]": userId,
  });

  if (result && result.length > 0) {
    return result[0];
  }

  throw new Error(`User with ID ${userId} not found`);
}

export async function getUserCourses(userId) {
  return callMoodleAPI("core_enrol_get_users_courses", {
    userid: userId,
  });
}

// Get all available courses (for admin token)
export async function getAllCourses() {
  return callMoodleAPI("core_course_get_courses");
}

// Get detailed course contents (sections, modules, resources)
export async function getCourseContents(courseId) {
  return callMoodleAPI("core_course_get_contents", {
    courseid: courseId,
  });
}

// Get full content of module
export async function getModuleContent(moduleId) {
  return callMoodleAPI("core_course_get_course_module", {
    cmid: moduleId,
  });
}
