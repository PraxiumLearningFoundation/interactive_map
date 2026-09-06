// Lightweight functional test for the /api handlers, using an in-memory fake Gist backend
// (no real network calls to GitHub). Run with: node test/api.test.js
process.env.SESSION_SECRET = 'test-secret-value-not-real-at-least-32-bytes';
process.env.ADMIN_PASSPHRASE = 'correct-horse-battery-staple';
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

function mockReqRes({ method = 'GET', body = {}, cookie = '', ip = '1.2.3.4' } = {}) {
  let statusCode = 200;
  let headers = {};
  let ended = '';
  const req = { method, body, headers: { cookie }, socket: { remoteAddress: ip } };
  const res = {
    status(code) { statusCode = code; return res; },
    setHeader(k, v) { headers[k] = v; return res; },
    end(payload) { ended = payload; return res; },
    _result() { return { statusCode, headers, body: ended ? JSON.parse(ended) : null }; },
  };
  return { req, res };
}

function extractCookieValue(setCookieHeader) {
  const match = setCookieHeader.match(/praxium_admin_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function assert(cond, message) {
  if (!cond) throw new Error('Assertion failed: ' + message);
}

async function run() {
  const auth = require(path.join(REPO, 'api/auth.js'));
  const gist = require(path.join(REPO, 'api/gist.js'));
  const geocode = require(path.join(REPO, 'api/geocode.js'));
  const publish = require(path.join(REPO, 'api/publish.js'));
  const logout = require(path.join(REPO, 'api/logout.js'));

  console.log('--- wrong passphrase -> 401 ---');
  {
    const { req, res } = mockReqRes({ method: 'POST', body: { passphrase: 'wrong' } });
    await auth(req, res);
    assert(res._result().statusCode === 401, 'expected 401 for wrong passphrase');
  }

  console.log('--- correct passphrase -> 200 + session cookie ---');
  let sessionCookie;
  {
    const { req, res } = mockReqRes({ method: 'POST', body: { passphrase: 'correct-horse-battery-staple' } });
    await auth(req, res);
    const r = res._result();
    assert(r.statusCode === 200, 'expected 200 for correct passphrase');
    assert(r.headers['Cache-Control'] === 'no-store', 'expected private API responses not to be cached');
    assert(
      r.headers['X-Content-Type-Options'] === 'nosniff',
      'expected API responses to disable content-type sniffing',
    );
    sessionCookie = extractCookieValue(r.headers['Set-Cookie']);
    assert(sessionCookie, 'expected a session cookie to be set');
  }

  console.log('--- rate limit kicks in after repeated wrong attempts ---');
  {
    let last;
    for (let i = 0; i < 5; i++) {
      const { req, res } = mockReqRes({
        method: 'POST',
        body: { passphrase: 'nope' + i },
        ip: '5.6.7.8',
      });
      await auth(req, res);
      last = res._result();
      assert(last.statusCode === 401, `expected failed attempt ${i + 1} to return 401`);
    }
    const { req, res } = mockReqRes({
      method: 'POST',
      body: { passphrase: 'one-too-many' },
      ip: '5.6.7.8',
    });
    await auth(req, res);
    last = res._result();
    assert(last.statusCode === 429, 'expected the request after 5 failures to be rate limited');
  }

  console.log('--- successful login clears prior failed attempts ---');
  {
    const ip = '9.8.7.6';
    for (let i = 0; i < 4; i++) {
      const { req, res } = mockReqRes({
        method: 'POST',
        body: { passphrase: 'wrong-' + i },
        ip,
      });
      await auth(req, res);
      assert(res._result().statusCode === 401, 'expected pre-success failure to return 401');
    }
    {
      const { req, res } = mockReqRes({
        method: 'POST',
        body: { passphrase: 'correct-horse-battery-staple' },
        ip,
      });
      await auth(req, res);
      assert(res._result().statusCode === 200, 'expected success before limit');
    }
    {
      const { req, res } = mockReqRes({
        method: 'POST',
        body: { passphrase: 'wrong-after-success' },
        ip,
      });
      await auth(req, res);
      assert(res._result().statusCode === 401, 'expected cleared failure bucket after success');
    }
  }

  console.log('--- GET /api/gist without session -> 401 ---');
  {
    const { req, res } = mockReqRes({ method: 'GET' });
    await gist(req, res);
    assert(res._result().statusCode === 401, 'expected 401 without session');
  }

  console.log('--- GET /api/gist with session -> 200 ---');
  let currentVersion;
  {
    const { req, res } = mockReqRes({ method: 'GET', cookie: `praxium_admin_session=${sessionCookie}` });
    await gist(req, res);
    const r = res._result();
    assert(r.statusCode === 200, 'expected 200 with session');
    assert(Array.isArray(r.body.organizations) && r.body.organizations.length === 2, 'expected 2 orgs');
    assert(Array.isArray(r.body.categories) && r.body.categories.length > 0, 'expected categories list');
    assert(r.body.version === 'revision-0', 'expected the immutable Gist revision as version');
    currentVersion = r.body.version;
  }

  console.log('--- geocode rejects overlong addresses before network access ---');
  {
    const { req, res } = mockReqRes({
      method: 'POST',
      cookie: `praxium_admin_session=${sessionCookie}`,
      body: { address: 'x'.repeat(301) },
    });
    await geocode(req, res);
    const r = res._result();
    assert(r.statusCode === 400, 'expected an overlong address to be rejected');
    assert(r.body.error === 'address_too_long', 'expected address_too_long error');
  }

  console.log('--- publish create with stale version -> 409 ---');
  {
    const { req, res } = mockReqRes({
      method: 'POST',
      cookie: `praxium_admin_session=${sessionCookie}`,
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
    });
    await publish(req, res);
    assert(res._result().statusCode === 409, 'expected 409 conflict for stale version');
  }

  console.log('--- publish create with valid version applies reciprocal connections ---');
  let newOrgId;
  {
    const { req, res } = mockReqRes({
      method: 'POST',
      cookie: `praxium_admin_session=${sessionCookie}`,
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
    });
    await publish(req, res);
    const r = res._result();
    assert(r.statusCode === 200, 'expected 200 for valid create');
    newOrgId = r.body.org.id;
    assert(newOrgId === 3, 'expected assigned id 3, got ' + newOrgId);
    assert(r.body.org.country === 'Canada', 'expected country to be persisted');
    assert(
      r.body.org.relationship === 'A shared learning and community initiative.',
      'expected relationship context to be persisted',
    );
    currentVersion = r.body.version;

    const orgs = JSON.parse(fakeGistFile);
    const orgOne = orgs.find((o) => o.id === 1);
    assert(orgOne.connections.includes(3), 'expected org 1 to reciprocally link to new org 3');
  }

  console.log('--- validation failure (missing website) -> 400 ---');
  {
    const { req, res } = mockReqRes({
      method: 'POST',
      cookie: `praxium_admin_session=${sessionCookie}`,
      body: {
        mode: 'create',
        expectedVersion: currentVersion,
        org: { name: 'Bad Org', location: 'Nowhere', coordinates: [0, 0], category: 'Health', description: 'x', contact: {}, connections: [] },
      },
    });
    await publish(req, res);
    assert(res._result().statusCode === 400, 'expected 400 validation failure');
  }

  console.log('--- validation failure (overlong fields) -> 400 ---');
  {
    const { req, res } = mockReqRes({
      method: 'POST',
      cookie: `praxium_admin_session=${sessionCookie}`,
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
    });
    await publish(req, res);
    const r = res._result();
    assert(r.statusCode === 400, 'expected 400 for an overlong field');
    assert(
      r.body.details.some((detail) => detail.includes('name must be 200')),
      'expected the name length limit in validation details',
    );
  }

  console.log('--- validation failure (unknown connection) -> 400 ---');
  {
    const { req, res } = mockReqRes({
      method: 'POST',
      cookie: `praxium_admin_session=${sessionCookie}`,
      body: {
        mode: 'create',
        expectedVersion: currentVersion,
        org: {
          name: 'Unknown Link Org', location: 'Nowhere', coordinates: [0, 0],
          category: 'Health', description: 'x',
          contact: { website: 'https://unknown.example' }, connections: [999],
        },
      },
    });
    await publish(req, res);
    const r = res._result();
    assert(r.statusCode === 400, 'expected 400 for an unknown connection ID');
    assert(
      r.body.details.some((detail) => detail.includes('999')),
      'expected the unknown connection ID in the validation details',
    );
  }

  console.log('--- update removes a connection -> reciprocal removal applies ---');
  {
    const { req, res } = mockReqRes({
      method: 'POST',
      cookie: `praxium_admin_session=${sessionCookie}`,
      body: {
        mode: 'update',
        orgId: newOrgId,
        expectedVersion: currentVersion,
        org: {
          name: 'Org Three', location: 'Calgary, AB', coordinates: [51.05, -114.07],
          category: 'Health', description: 'new org updated', contact: { website: 'https://three.example' }, connections: [],
        },
      },
    });
    await publish(req, res);
    const r = res._result();
    assert(r.statusCode === 200, 'expected 200 for update');
    assert(r.body.org.country === 'Canada', 'older update payloads should preserve country');
    assert(
      r.body.org.relationship === 'A shared learning and community initiative.',
      'older update payloads should preserve relationship context',
    );
    currentVersion = r.body.version;

    const orgs = JSON.parse(fakeGistFile);
    const orgOne = orgs.find((o) => o.id === 1);
    assert(!orgOne.connections.includes(3), 'expected reciprocal connection to be removed');
  }

  console.log('--- delete cascades connection removal ---');
  {
    const { req, res } = mockReqRes({
      method: 'POST',
      cookie: `praxium_admin_session=${sessionCookie}`,
      body: { mode: 'delete', orgId: 2, expectedVersion: currentVersion },
    });
    await publish(req, res);
    assert(res._result().statusCode === 200, 'expected 200 for delete');

    const orgs = JSON.parse(fakeGistFile);
    assert(!orgs.find((o) => o.id === 2), 'expected org 2 to be deleted');
    const orgOne = orgs.find((o) => o.id === 1);
    assert(!orgOne.connections.includes(2), 'expected org 1 to no longer reference deleted org 2');
  }

  console.log('--- logout clears cookie ---');
  {
    const { req, res } = mockReqRes({ method: 'POST' });
    await logout(req, res);
    assert(res._result().statusCode === 200, 'expected 200 for logout');
  }

  console.log('\nALL TESTS PASSED');
}

run().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
