import config from '../config/env.js';

export function toUserFacingFileUrl(fileUrl) {
  if (!fileUrl) return fileUrl;
  try {
    const base = new URL(config.moodle.url);
    const u = new URL(fileUrl, base);

    // ensure we use cookie-auth path, not webservice
    u.pathname = u.pathname.replace(/\/webservice\/pluginfile\.php/i, '/pluginfile.php');

    // remove token if present
    if (u.searchParams.has('token')) {
      u.searchParams.delete('token');
    }

    return u.toString();
  } catch {
    return fileUrl;
  }
}

export function withForcedDownload(urlString) {
  if (!urlString) return urlString;
  try {
    const u = new URL(urlString);
    if (!u.searchParams.has('forcedownload')) {
      u.searchParams.set('forcedownload', '1');
    }
    return u.toString();
  } catch {
    return urlString;
  }
}