// Best-effort in-memory rate limiting. Serverless cold starts reset this state, so it is
// defense-in-depth on top of the passphrase itself, not a hard guarantee — acceptable for a
// small trusted-board internal tool. Do not rely on this alone for a public-facing surface.
const buckets = new Map();

// Returns true if the caller (keyed by e.g. IP) is within the allowed rate.
function checkRateLimit(key, { max, windowMs }) {
  const now = Date.now();
  const entry = buckets.get(key) || [];
  const recent = entry.filter((ts) => now - ts < windowMs);
  if (recent.length >= max) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  return true;
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

module.exports = { checkRateLimit, getClientIp, throttleGeocodeCall };
