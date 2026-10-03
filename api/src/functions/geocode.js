const { app } = require('@azure/functions');
const { throttleGeocodeCall } = require('../../_lib/rateLimit');
const { getClientPrincipal } = require('../../_lib/clientPrincipal');
const { jsonResponse, methodNotAllowed, unauthorized } = require('../../_lib/http');

// Nominatim's usage policy allows ~1 request/second per app and requires an identifying
// User-Agent. This function is the *only* place that ever talks to Nominatim — the browser
// never calls it directly.
const NOMINATIM_MIN_INTERVAL_MS = 1100;
const MAX_ADDRESS_LENGTH = 300;
const USER_AGENT = 'Praxium-Map-Admin/1.0 (contact: info@praxiumfoundation.com)';

async function geocodeHandler(request) {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  if (!getClientPrincipal(request)) return unauthorized();

  const { address } = await request.json().catch(() => ({}));
  if (typeof address !== 'string' || !address.trim()) {
    return jsonResponse(400, { error: 'address_required' });
  }
  if (address.trim().length > MAX_ADDRESS_LENGTH) {
    return jsonResponse(400, { error: 'address_too_long' });
  }

  await throttleGeocodeCall(NOMINATIM_MIN_INTERVAL_MS);

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!resp.ok) {
      return jsonResponse(502, { error: 'geocode_service_error' });
    }
    const results = await resp.json();
    if (!Array.isArray(results) || results.length === 0) {
      return jsonResponse(404, { error: 'not_found' });
    }
    const best = results[0];
    const lat = Number(best.lat);
    const lng = Number(best.lon);
    if (
      !Number.isFinite(lat)
      || !Number.isFinite(lng)
      || lat < -90
      || lat > 90
      || lng < -180
      || lng > 180
    ) {
      return jsonResponse(502, { error: 'geocode_service_error' });
    }
    return jsonResponse(200, {
      lat,
      lng,
      displayName: typeof best.display_name === 'string' ? best.display_name : address.trim(),
    });
  } catch (err) {
    console.error('POST /api/geocode failed:', err);
    return jsonResponse(502, { error: 'geocode_service_error' });
  }
}

app.http('geocode', {
  methods: ['POST'],
  route: 'geocode',
  authLevel: 'anonymous',
  handler: geocodeHandler,
});

module.exports = { geocodeHandler };
