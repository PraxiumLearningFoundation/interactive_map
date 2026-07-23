// Signs and verifies the admin session cookie using HMAC-SHA256.
// The token is `${expiresAtMs}.${signatureHex}` — no external JWT dependency needed
// for a single-purpose, single-role session like this.
const crypto = require('crypto');

const COOKIE_NAME = 'praxium_admin_session';
const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not configured');
  return secret;
}

function sign(expiresAt) {
  const hmac = crypto.createHmac('sha256', getSecret());
  hmac.update(String(expiresAt));
  return hmac.digest('hex');
}

function createSessionToken() {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const signature = sign(expiresAt);
  return `${expiresAt}.${signature}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [expiresAtStr, signature] = parts;
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  const expectedSignature = sign(expiresAt);
  const a = Buffer.from(signature, 'hex');
  const b = Buffer.from(expectedSignature, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  cookieHeader.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    out[key] = decodeURIComponent(value);
  });
  return out;
}

function buildSessionCookie(token) {
  const maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000);
  return [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
  ].join('; ');
}

function buildClearCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

// Returns true if the request carries a valid, unexpired session cookie.
function requireSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  return verifySessionToken(cookies[COOKIE_NAME]);
}

module.exports = {
  COOKIE_NAME,
  createSessionToken,
  verifySessionToken,
  parseCookies,
  buildSessionCookie,
  buildClearCookie,
  requireSession,
};
