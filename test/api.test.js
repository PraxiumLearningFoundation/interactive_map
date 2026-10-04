// Lightweight functional test for the /api Azure Functions, using an in-memory fake Gist
// backend (no real network calls to GitHub). Run with: node test/api.test.js
//
// Authentication itself (Microsoft Entra ID, restricted to an explicit board-member
// allow-list) is enforced by Azure Static Web Apps before a request ever reaches these
// functions — there's no local login/passphrase/rate-limiting logic left to test here.
// What IS tested: that each function still checks for a valid x-ms-client-principal
// (defense-in-depth, see api/_lib/clientPrincipal.js) and that every validation,
// optimistic-concurrency, reciprocal-connection, and cascade-delete behavior in
// publish.js carries over unchanged from the pre-migration Vercel version.
process.env.GIST_ID = 'fake-gist-id';
process.env.GITHUB_PAT = 'fake-pat-not-real';

const path = require('path');
const REPO = path.join(__dirname, '..');

// --- Fake in-memory "Gist" backing store ---
let fakeGistFile = JSON.stringify([
  { id: 1, name: 'Org One', location: 'Vancouver, BC', coordinates: [49.28, -123.12], category: 'Health', description: 'desc', contact: { website: 'https://one.example' }, connections: [2] },
  { id: 2, name: 'Org Two', location: 'Toronto, ON', coordinates: [43.65, -79.38], category: 'Non-Profit', description: 'desc2', contact: { website: 'https://two.example' }, connections: [1] },
]);
let fakeUpdatedAt = '2026-01-01T00:00:00Z';
let fakeRevision = 'revision-0';
let versionCounter = 0;

global.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith('https://api.github.com/gists/')) {
    if (!opts.method || opts.method === 'GET') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          updated_at: fakeUpdatedAt,
          history: [{ version: fakeRevision }],
          files: { 'organization-network-map.json': { content: fakeGistFile, truncated: false } },
        }),
      };
    }
    if (opts.method === 'PATCH') {
      const body = JSON.parse(opts.body);
      fakeGistFile = body.files['organization-network-map.json'].content;
      versionCounter += 1;
      fakeUpdatedAt = `2026-01-01T00:0${versionCounter}:00Z`;
      fakeRevision = `revision-${versionCounter}`;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          updated_at: fakeUpdatedAt,
          history: [{ version: fakeRevision }],
        }),
      };
    }
  }
  throw new Error('Unexpected fetch to ' + u);
};

// Builds a request matching Azure Functions v4's HttpRequest shape closely enough for our
// handlers: a `method`, a `headers.get(name)` accessor, and an async `json()` body reader.
function mockRequest({ method = 'GET', body = {}, principal = AUTHENTICATED_PRINCIPAL } = {}) {
  const headerMap = new Map();
  if (principal) {
    headerMap.set('x-ms-client-principal', Buffer.from(JSON.stringify(principal)).toString('base64'));
  }
  return {
    method,
    headers: { get: (name) => headerMap.get(String(name).toLowerCase()) ?? null },
    json: async () => body,
  };
}

const AUTHENTICATED_PRINCIPAL = {
  identityProvider: 'aad',
  userId: 'test-user-id',
  userDetails: 'board.member@praxiumfoundation.com',
  userRoles: ['anonymous', 'authenticated'],
};

function assert(cond, message) {
  if (!cond) throw new Error('Assertion failed: ' + message);
}

async function run() {
  const { gistHandler } = require(path.join(REPO, 'api/src/functions/gist.js'));
  const { geocodeHandler } = require(path.join(REPO, 'api/src/functions/geocode.js'));
  const { publishHandler } = require(path.join(REPO, 'api/src/functions/publish.js'));

  console.log('--- GET /api/gist without a client principal -> 401 ---');
  {
    const res = await gistHandler(mockRequest({ method: 'GET', principal: null }));
    assert(res.status === 401, 'expected 401 without an authenticated client principal');
  }

  console.log('--- GET /api/gist with an unauthenticated principal (missing "authenticated" role) -> 401 ---');
  {
    const res = await gistHandler(mockRequest({
      method: 'GET',
      principal: { identityProvider: 'aad', userId: 'x', userDetails: 'x@example.com', userRoles: ['anonymous'] },
    }));
    assert(res.status === 401, 'expected 401 when the authenticated role is missing');
  }

  console.log('--- GET /api/gist with a valid client principal -> 200 ---');
  let currentVersion;
  {
    const res = await gistHandler(mockRequest({ method: 'GET' }));
    assert(res.status === 200, 'expected 200 with a valid client principal');
    assert(Array.isArray(res.jsonBody.organizations) && res.jsonBody.organizations.length === 2, 'expected 2 orgs');
    assert(Array.isArray(res.jsonBody.categories) && res.jsonBody.categories.length > 0, 'expected categories list');
    assert(res.jsonBody.version === 'revision-0', 'expected the immutable Gist revision as version');
    assert(res.headers['Cache-Control'] === 'no-store', 'expected private API responses not to be cached');
    assert(res.headers['X-Content-Type-Options'] === 'nosniff', 'expected content-type sniffing disabled');
    currentVersion = res.jsonBody.version;
  }

  console.log('--- geocode rejects overlong addresses before network access ---');
  {
    const res = await geocodeHandler(mockRequest({ method: 'POST', body: { address: 'x'.repeat(301) } }));
    assert(res.status === 400, 'expected an overlong address to be rejected');
    assert(res.jsonBody.error === 'address_too_long', 'expected address_too_long error');
  }

  console.log('--- geocode without a client principal -> 401 ---');
  {
    const res = await geocodeHandler(mockRequest({ method: 'POST', body: { address: 'Vancouver' }, principal: null }));
    assert(res.status === 401, 'expected 401 without an authenticated client principal');
  }

  console.log('--- publish create with stale version -> 409 ---');
  {
    const res = await publishHandler(mockRequest({
      method: 'POST',
      body: {
        mode: 'create',
        expectedVersion: 'stale-version-value',
        org: {
          name: 'Org Three', location: 'Calgary, AB', coordinates: [51.05, -114.07],
          country: 'Canada', category: 'Health', description: 'new org',
          relationship: 'A shared learning and community initiative.',
          contact: { website: 'https://three.example' }, connections: [1],
        },
      },
    }));
    assert(res.status === 409, 'expected 409 conflict for stale version');
  }

  console.log('--- publish create with valid version applies reciprocal connections ---');
  let newOrgId;
  {
    const res = await publishHandler(mockRequest({
      method: 'POST',
      body: {
        mode: 'create',
        expectedVersion: currentVersion,
        org: {
          name: 'Org Three', location: 'Calgary, AB', coordinates: [51.05, -114.07],
          country: 'Canada', category: 'Health', description: 'new org',
          relationship: 'A shared learning and community initiative.',
          contact: { website: 'https://three.example' }, connections: [1],
        },
      },
    }));
    assert(res.status === 200, 'expected 200 for valid create');
    newOrgId = res.jsonBody.org.id;
    assert(newOrgId === 3, 'expected assigned id 3, got ' + newOrgId);
    assert(res.jsonBody.org.country === 'Canada', 'expected country to be persisted');
    assert(
      res.jsonBody.org.relationship === 'A shared learning and community initiative.',
      'expected relationship context to be persisted',
    );
    currentVersion = res.jsonBody.version;

    const orgs = JSON.parse(fakeGistFile);
    const orgOne = orgs.find((o) => o.id === 1);
    assert(orgOne.connections.includes(3), 'expected org 1 to reciprocally link to new org 3');
  }

  console.log('--- publish without a client principal -> 401 ---');
  {
    const res = await publishHandler(mockRequest({
      method: 'POST',
      principal: null,
      body: { mode: 'delete', orgId: newOrgId, expectedVersion: currentVersion },
    }));
    assert(res.status === 401, 'expected 401 without an authenticated client principal');
  }

  console.log('--- validation failure (missing website) -> 400 ---');
  {
    const res = await publishHandler(mockRequest({
      method: 'POST',
      body: {
        mode: 'create',
        expectedVersion: currentVersion,
        org: { name: 'Bad Org', location: 'Nowhere', coordinates: [0, 0], category: 'Health', description: 'x', contact: {}, connections: [] },
      },
    }));
    assert(res.status === 400, 'expected 400 validation failure');
  }

  console.log('--- validation failure (overlong fields) -> 400 ---');
  {
    const res = await publishHandler(mockRequest({
      method: 'POST',
      body: {
        mode: 'create',
        expectedVersion: currentVersion,
        org: {
          name: 'x'.repeat(201),
          location: 'Nowhere',
          coordinates: [0, 0],
          category: 'Health',
          description: 'x',
          contact: { website: 'https://limits.example' },
          connections: [],
        },
      },
    }));
    assert(res.status === 400, 'expected 400 for an overlong field');
    assert(
      res.jsonBody.details.some((detail) => detail.includes('name must be 200')),
      'expected the name length limit in validation details',
    );
  }

  console.log('--- validation failure (unknown connection) -> 400 ---');
  {
    const res = await publishHandler(mockRequest({
      method: 'POST',
      body: {
        mode: 'create',
        expectedVersion: currentVersion,
        org: {
          name: 'Unknown Link Org', location: 'Nowhere', coordinates: [0, 0],
          category: 'Health', description: 'x',
          contact: { website: 'https://unknown.example' }, connections: [999],
        },
      },
    }));
    assert(res.status === 400, 'expected 400 for an unknown connection ID');
    assert(
      res.jsonBody.details.some((detail) => detail.includes('999')),
      'expected the unknown connection ID in the validation details',
    );
  }

  console.log('--- update removes a connection -> reciprocal removal applies ---');
  {
    const res = await publishHandler(mockRequest({
      method: 'POST',
      body: {
        mode: 'update',
        orgId: newOrgId,
        expectedVersion: currentVersion,
        org: {
          name: 'Org Three', location: 'Calgary, AB', coordinates: [51.05, -114.07],
          category: 'Health', description: 'new org updated', contact: { website: 'https://three.example' }, connections: [],
        },
      },
    }));
    assert(res.status === 200, 'expected 200 for update');
    assert(res.jsonBody.org.country === 'Canada', 'older update payloads should preserve country');
    assert(
      res.jsonBody.org.relationship === 'A shared learning and community initiative.',
      'older update payloads should preserve relationship context',
    );
    currentVersion = res.jsonBody.version;

    const orgs = JSON.parse(fakeGistFile);
    const orgOne = orgs.find((o) => o.id === 1);
    assert(!orgOne.connections.includes(3), 'expected reciprocal connection to be removed');
  }

  console.log('--- delete cascades connection removal ---');
  {
    const res = await publishHandler(mockRequest({
      method: 'POST',
      body: { mode: 'delete', orgId: 2, expectedVersion: currentVersion },
    }));
    assert(res.status === 200, 'expected 200 for delete');

    const orgs = JSON.parse(fakeGistFile);
    assert(!orgs.find((o) => o.id === 2), 'expected org 2 to be deleted');
    const orgOne = orgs.find((o) => o.id === 1);
    assert(!orgOne.connections.includes(2), 'expected org 1 to no longer reference deleted org 2');
  }

  console.log('\nALL TESTS PASSED');
}

run().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
