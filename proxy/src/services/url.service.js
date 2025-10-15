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

    // Ensure we use the correct Moodle base URL (not localhost or other)
    u.protocol = base.protocol;
    u.host = base.host;
    u.port = base.port;

    return u.toString();
  } catch (error) {
    console.warn('Failed to convert file URL:', fileUrl, error);
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