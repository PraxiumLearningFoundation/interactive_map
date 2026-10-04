// Reads the identity Azure Static Web Apps injects into every authenticated request.
//
// SWA's own route rules (staticwebapp.config.json: "allowedRoles": ["authenticated"]) already
// block unauthenticated requests to /api/* before they reach this code — nobody without a valid
// Entra session, who's also been explicitly assigned to the app registration, can get this far.
// This check is defense-in-depth only, in case a function is ever invoked by a path that bypasses
// the configured routes (e.g. direct Functions-level invocation during local development).
const HEADER_NAME = 'x-ms-client-principal';

// Returns the parsed principal ({ identityProvider, userId, userDetails, userRoles }) if the
// request carries a valid, authenticated SWA identity, or null otherwise.
function getClientPrincipal(request) {
  const header = request.headers.get(HEADER_NAME);
  if (!header) return null;

  let principal;
  try {
    principal = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
  } catch (err) {
    return null;
  }

  if (!principal || !Array.isArray(principal.userRoles) || !principal.userRoles.includes('authenticated')) {
    return null;
  }
  return principal;
}

module.exports = { getClientPrincipal };
