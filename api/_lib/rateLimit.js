// Throttling helper for the outbound Nominatim geocode proxy. The passphrase
// brute-force rate limiting that used to live here was removed along with the
// passphrase itself — Microsoft Entra ID now gates sign-in, so there's no
// local login attempt to rate-limit.

// Simple last-call throttle used for the Nominatim geocode proxy (policy: max ~1 req/sec).
// Same best-effort caveat as before: serverless cold starts reset this, so it's a courtesy
// to Nominatim's shared infrastructure, not a hard per-instance guarantee.
let lastGeocodeCallAt = 0;
async function throttleGeocodeCall(minIntervalMs) {
  const now = Date.now();
  const wait = lastGeocodeCallAt + minIntervalMs - now;
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastGeocodeCallAt = Date.now();
}

module.exports = { throttleGeocodeCall };
