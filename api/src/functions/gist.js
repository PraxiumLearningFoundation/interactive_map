const { app } = require('@azure/functions');
const { fetchGist } = require('../../_lib/githubGist');
const { readCategories } = require('../../_lib/categories');
const { getClientPrincipal } = require('../../_lib/clientPrincipal');
const { jsonResponse, methodNotAllowed, unauthorized } = require('../../_lib/http');

async function gistHandler(request) {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  if (!getClientPrincipal(request)) return unauthorized();

  try {
    const [{ organizations, version }, categories] = await Promise.all([
      fetchGist(),
      Promise.resolve(readCategories()),
    ]);
    return jsonResponse(200, { organizations, categories, version });
  } catch (err) {
    console.error('GET /api/gist failed:', err);
    return jsonResponse(502, { error: 'gist_fetch_failed' });
  }
}

app.http('gist', {
  methods: ['GET'],
  route: 'gist',
  authLevel: 'anonymous', // access is enforced by Static Web Apps routing, not a Functions key
  handler: gistHandler,
});

module.exports = { gistHandler };
