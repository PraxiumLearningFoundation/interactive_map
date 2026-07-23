const crypto = require('crypto');
const { createSessionToken, buildSessionCookie } = require('./_lib/session');
const { checkRateLimit, getClientIp } = require('./_lib/rateLimit');
const { readJsonBody, sendJson, methodNotAllowed } = require('./_lib/http');

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// Compares two strings in constant time regardless of length, by comparing fixed-length
// SHA-256 digests instead of the raw values (avoids leaking passphrase length via timing).
function constantTimeEquals(a, b) {
  const digestA = crypto.createHash('sha256').update(String(a)).digest();
  const digestB = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  const ip = getClientIp(req);
  if (!checkRateLimit(`auth:${ip}`, { max: MAX_ATTEMPTS, windowMs: WINDOW_MS })) {
    return sendJson(res, 429, { ok: false, error: 'too_many_attempts' });
  }

  const { passphrase } = readJsonBody(req);
  const expected = process.env.ADMIN_PASSPHRASE;
  if (!expected) {
    return sendJson(res, 500, { ok: false, error: 'server_misconfigured' });
  }

  if (typeof passphrase !== 'string' || !passphrase || !constantTimeEquals(passphrase, expected)) {
    return sendJson(res, 401, { ok: false, error: 'invalid_passphrase' });
  }

  const token = createSessionToken();
  res.setHeader('Set-Cookie', buildSessionCookie(token));
  return sendJson(res, 200, { ok: true });
};
