const { buildClearCookie } = require('./_lib/session');
const { sendJson, methodNotAllowed } = require('./_lib/http');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  res.setHeader('Set-Cookie', buildClearCookie());
  return sendJson(res, 200, { ok: true });
};
