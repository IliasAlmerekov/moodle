const DEFAULT_MAX = 10;
const DEFAULT_WINDOW_MS = 60_000;
const COUNTERS_GC_THRESHOLD = 1000;

const counters = new Map();

function gcExpiredCounters(now) {
  for (const [key, entry] of counters) {
    if (now >= entry.resetAt) {
      counters.delete(key);
    }
  }
}

/**
 * Checks if a user has exceeded the per-user rate limit.
 * Uses an in-memory Map keyed by userId.
 *
 * @param {number|string} userId
 * @param {Object} [opts]
 * @param {string} [opts.ip] - Client IP for security audit logging.
 * @param {Object} [opts.log] - Logger (e.g. request.log). If provided, rate-limit hits are logged.
 * @param {number} [opts.max] - Max requests per window (default: 10).
 * @param {number} [opts.windowMs] - Window size in milliseconds (default: 60000).
 * @returns {{ allowed: boolean, remaining: number, resetAt?: number }}
 */
export function checkUserRateLimit(userId, { ip, log, max = DEFAULT_MAX, windowMs = DEFAULT_WINDOW_MS } = {}) {
  const key = String(userId ?? 0);
  const now = Date.now();

  // Periodic garbage collection of expired entries
  if (counters.size >= COUNTERS_GC_THRESHOLD) {
    gcExpiredCounters(now);
  }

  const entry = counters.get(key);
  if (!entry || now >= entry.resetAt) {
    counters.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1 };
  }

  if (entry.count >= max) {
    if (log && typeof log.warn === "function") {
      log.warn({ security: true, type: "rate_limit_exceeded", ip, userId: key });
    }
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { allowed: true, remaining: max - entry.count };
}

/**
 * Resets all rate-limit counters. Intended for tests only.
 */
export function resetCounters() {
  counters.clear();
}
