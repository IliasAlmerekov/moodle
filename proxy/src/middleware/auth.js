import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Factory for a Fastify preHandler that verifies the caller's Moodle identity.
 *
 * Trust model: the userId must NOT be taken on faith from the request body.
 * The Moodle embed snippet signs `${userId}.${ts}` server-side with a shared
 * secret (HMAC-SHA256) and ships userId/ts/sig to the browser. This preHandler
 * recomputes the signature and rejects any request whose userId is unsigned,
 * tampered with, or whose token has expired. Only after a valid signature is
 * the userId trusted (exposed as `request.verifiedUserId`).
 *
 * @param {Object} deps
 * @param {string} deps.secret  Shared HMAC secret, also configured in Moodle.
 * @param {number} [deps.tokenTtlMs=7_200_000]  Max age of a signed token in ms.
 * @param {function(): number} [deps.now=Date.now]
 * @returns {function(import("fastify").FastifyRequest, import("fastify").FastifyReply): Promise<void>}
 */
export function createVerifyMoodleUser({ secret, tokenTtlMs = 7_200_000, now = Date.now }) {
  function parseUserId(value) {
    const num = Number(value);
    return Number.isInteger(num) && num > 0 ? num : 0;
  }

  function deny(request, reply, userId) {
    request.log.warn(
      { security: true, type: "auth_failure", userId },
      "Moodle identity verification failed",
    );
    return reply.status(401).send({ statusCode: 401, error: "Unauthorized" });
  }

  return async function verifyMoodleUser(request, reply) {
    const body = request.body ?? {};
    const userId = parseUserId(body.userId);
    const ts = Number(body.ts);
    const sig = typeof body.sig === "string" ? body.sig : "";

    if (!secret || userId === 0 || !Number.isFinite(ts) || sig === "") {
      return deny(request, reply, userId);
    }

    // Reject stale tokens; abs() also tolerates minor client/server clock skew.
    if (Math.abs(now() - ts) > tokenTtlMs) {
      return deny(request, reply, userId);
    }

    const expected = createHmac("sha256", secret).update(`${userId}.${ts}`).digest("hex");

    // Constant-time comparison; length guard avoids timingSafeEqual throwing.
    const valid =
      expected.length === sig.length && timingSafeEqual(Buffer.from(expected), Buffer.from(sig));

    if (!valid) {
      return deny(request, reply, userId);
    }

    request.verifiedUserId = userId;
  };
}
