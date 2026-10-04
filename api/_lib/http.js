// Small helpers shared by the /api functions.
//
// Azure Functions' v4 Node.js model has handlers *return* a response object
// ({ status, jsonBody, headers }) instead of mutating a res parameter like
// Vercel's model did — these helpers build that object consistently.

function jsonResponse(status, payload) {
  return {
    status,
    jsonBody: payload,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  };
}

function methodNotAllowed(allowed) {
  return {
    status: 405,
    jsonBody: { error: 'method_not_allowed' },
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      Allow: allowed.join(', '),
    },
  };
}

function unauthorized() {
  return jsonResponse(401, { error: 'unauthorized' });
}

module.exports = { jsonResponse, methodNotAllowed, unauthorized };
