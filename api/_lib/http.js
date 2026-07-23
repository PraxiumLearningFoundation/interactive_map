// Small helpers shared by the /api handlers.

// Vercel's Node.js runtime auto-parses JSON bodies into req.body, but guard against it being
// a raw string (e.g. when a different content-type or invocation path is used).
function readJsonBody(req) {
  if (req.body === undefined || req.body === null) return {};
  if (typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body);
  } catch (err) {
    return {};
  }
}

function sendJson(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json').end(JSON.stringify(payload));
}

function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  sendJson(res, 405, { error: 'method_not_allowed' });
}

module.exports = { readJsonBody, sendJson, methodNotAllowed };
