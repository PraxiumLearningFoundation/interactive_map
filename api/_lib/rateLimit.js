// Best-effort in-memory rate limiting. Serverless cold starts reset this state, so it is
// defense-in-depth on top of the passphrase itself, not a hard guarantee — acceptable for a
// small trusted-board internal tool. Do not rely on this alone for a public-facing surface.
const buckets = new Map();

function recentAttempts(key, windowMs) {
  const now = Date.now();
  const recent = (buckets.get(key) || []).filter((ts) => now - ts < windowMs);
  if (recent.length) buckets.set(key, recent);
  else buckets.delete(key);
  return recent;
}

// Returns true if the caller (keyed by e.g. IP) may make another attempt.
// Checking does not consume the budget; only failed authentication should.
function checkRateLimit(key, { max, windowMs }) {
  return recentAttempts(key, windowMs).length < max;
}

function recordRateLimitFailure(key, { windowMs }) {
  const recent = recentAttempts(key, windowMs);
  recent.push(Date.now());
  buckets.set(key, recent);
}

function clearRateLimit(key) {
  buckets.delete(key);
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown';
}

// Simple last-call throttle used for the Nominatim geocode proxy (policy: max ~1 req/sec).
let lastGeocodeCallAt = 0;
async function throttleGeocodeCall(minIntervalMs) {
  const now = Date.now();
  const wait = lastGeocodeCallAt + minIntervalMs - now;
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastGeocodeCallAt = Date.now();
}

module.exports = {
  checkRateLimit,
  recordRateLimitFailure,
  clearRateLimit,
  getClientIp,
  throttleGeocodeCall,
};
