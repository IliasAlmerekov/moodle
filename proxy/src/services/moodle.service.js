import config from "../config/env.js";

export async function callMoodleAPI(functionName, params = {}, token) {
  // check if moodle configured
  if (!config.moodle.isConfigured) {
    throw new Error("Moodle is not configured");
  }

  const effectiveToken = token || config.moodle.token;

  if (!effectiveToken) {
    throw new Error("Missing Moodle token");
  }

  // create parameters for url
  const urlParams = new URLSearchParams({
    wstoken: effectiveToken,
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

export async function getSiteInfo(token) {
  return callMoodleAPI("core_webservice_get_site_info", {}, token);
}

export async function getUserInfo(userId, token) {
  const result = await callMoodleAPI(
    "core_user_get_users_by_field",
    {
      field: "id",
      "values[0]": userId,
    },
    token
  );

  if (result && result.length > 0) {
    return result[0];
  }

  throw new Error(`User with ID ${userId} not found`);
}

export async function getUserCourses(userId, token) {
  return callMoodleAPI(
    "core_enrol_get_users_courses",
    {
      userid: userId,
    },
    token
  );
}

export async function createUserToken(username, password) {
  if (!config.moodle.serviceShortName) {
    throw new Error(
      "MOODLE_SERVICE_SHORTNAME is not configured. Configure a Moodle external service to issue user tokens."
    );
  }

  const params = new URLSearchParams({
    username,
    password,
    service: config.moodle.serviceShortName,
  });

  const url = `${config.moodle.url}/login/token.php?${params}`;

  try {
    const response = await fetch(url, { method: "POST" });

    if (!response.ok) {
      throw new Error(`Moodle token error! status: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`Moodle token error: ${data.error}`);
    }

    if (!data.token) {
      throw new Error("Moodle did not return a token");
    }

    return data.token;
  } catch (error) {
    console.error("Failed to create Moodle user token:", error);
    throw error;
  }
}
