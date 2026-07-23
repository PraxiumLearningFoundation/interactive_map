const { requireSession } = require('./_lib/session');
const { throttleGeocodeCall } = require('./_lib/rateLimit');
const { readJsonBody, sendJson, methodNotAllowed } = require('./_lib/http');

// Nominatim's usage policy allows ~1 request/second per app and requires an identifying
// User-Agent. This function is the *only* place that ever talks to Nominatim — the browser
// never calls it directly.
const NOMINATIM_MIN_INTERVAL_MS = 1100;
const USER_AGENT = 'Praxium-Map-Admin/1.0 (contact: hezekiahj@praxiumfoundation.com)';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!requireSession(req)) return sendJson(res, 401, { error: 'unauthorized' });

  const { address } = readJsonBody(req);
  if (typeof address !== 'string' || !address.trim()) {
    return sendJson(res, 400, { error: 'address_required' });
  }

  await throttleGeocodeCall(NOMINATIM_MIN_INTERVAL_MS);

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!resp.ok) {
      return sendJson(res, 502, { error: 'geocode_service_error' });
    }
    const results = await resp.json();
    if (!Array.isArray(results) || results.length === 0) {
      return sendJson(res, 404, { error: 'not_found' });
    }
    const best = results[0];
    return sendJson(res, 200, {
      lat: Number(best.lat),
      lng: Number(best.lon),
      displayName: best.display_name,
    });
  } catch (err) {
    console.error('POST /api/geocode failed:', err);
    return sendJson(res, 502, { error: 'geocode_service_error' });
  }
};
