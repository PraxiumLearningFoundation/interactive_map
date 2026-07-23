const { requireSession } = require('./_lib/session');
const { fetchGist } = require('./_lib/githubGist');
const { readCategories } = require('./_lib/categories');
const { sendJson, methodNotAllowed } = require('./_lib/http');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  if (!requireSession(req)) return sendJson(res, 401, { error: 'unauthorized' });

  try {
    const [{ organizations, version }, categories] = await Promise.all([
      fetchGist(),
      Promise.resolve(readCategories()),
    ]);
    return sendJson(res, 200, { organizations, categories, version });
  } catch (err) {
    console.error('GET /api/gist failed:', err);
    return sendJson(res, 502, { error: 'gist_fetch_failed' });
  }
};
