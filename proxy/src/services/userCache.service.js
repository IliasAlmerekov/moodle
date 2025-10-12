const TTL = 5 * 60 * 1000; // 5 minutes
const profileCache = new Map();

export function getCachedUser(userId) {
  const entry = profileCache.get(userId);
  if (!entry || Date.now() - entry.fetchedAt > TTL) {
    return null;
  }
  return entry.data;
}

export function setCachedUser(userId, data) {
  profileCache.set(userId, { data, fetchedAt: Date.now() });
}
