const { requireSession } = require('./_lib/session');
const { fetchGist, updateGist } = require('./_lib/githubGist');
const { readCategories } = require('./_lib/categories');
const { readJsonBody, sendJson, methodNotAllowed } = require('./_lib/http');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (err) {
    return false;
  }
}

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

// Validates the incoming org payload. Returns an array of error strings (empty = valid).
function validateOrgPayload(org, categories) {
  const errors = [];
  if (!org || typeof org !== 'object') return ['org payload is required'];

  if (typeof org.name !== 'string' || !org.name.trim()) errors.push('name is required');
  if (typeof org.location !== 'string' || !org.location.trim()) errors.push('location is required');
  if (typeof org.description !== 'string' || !org.description.trim()) errors.push('description is required');

  const coords = org.coordinates;
  if (
    !Array.isArray(coords) ||
    coords.length !== 2 ||
    !isFiniteNumber(coords[0]) ||
    !isFiniteNumber(coords[1]) ||
    coords[0] < -90 || coords[0] > 90 ||
    coords[1] < -180 || coords[1] > 180
  ) {
    errors.push('coordinates must be [lat, lng] within valid ranges');
  }

  if (typeof org.category !== 'string' || !org.category.trim()) {
    errors.push('category is required');
  } else if (!categories.includes(org.category) && !org.allowCustomCategory) {
    errors.push('category is not in the canonical list (set allowCustomCategory to override)');
  }

  const website = org.contact && org.contact.website;
  if (typeof website !== 'string' || !website.trim() || !isValidUrl(website)) {
    errors.push('contact.website is required and must be a valid http(s) URL');
  }

  const email = org.contact && org.contact.email;
  if (email !== undefined && email !== '' && !EMAIL_RE.test(String(email))) {
    errors.push('contact.email is not a valid email address');
  }

  if (org.connections !== undefined) {
    if (!Array.isArray(org.connections) || !org.connections.every((id) => Number.isInteger(id))) {
      errors.push('connections must be an array of integer organization IDs');
    }
  }

  return errors;
}

// Builds the finalized org record (only the fields we persist) from a validated payload.
function finalizeOrgFields(org, id) {
  const contact = {};
  if (org.contact && org.contact.website) contact.website = org.contact.website.trim();
  if (org.contact && org.contact.email) contact.email = org.contact.email.trim();
  if (org.contact && org.contact.phone) contact.phone = String(org.contact.phone).trim();

  return {
    id,
    name: org.name.trim(),
    location: org.location.trim(),
    coordinates: [Number(org.coordinates[0]), Number(org.coordinates[1])],
    category: org.category.trim(),
    description: org.description.trim(),
    contact,
    connections: Array.isArray(org.connections) ? [...new Set(org.connections)].filter((cid) => cid !== id) : [],
  };
}

// Keeps `connections` symmetric: if A links to B, B should link back to A. Given the prior
// and new connection lists for `orgId`, adds/removes the reciprocal link on the other side.
function applyReciprocalConnections(organizations, orgId, previousConnections, newConnections) {
  const prevSet = new Set(previousConnections || []);
  const nextSet = new Set(newConnections || []);

  const added = [...nextSet].filter((id) => !prevSet.has(id));
  const removed = [...prevSet].filter((id) => !nextSet.has(id));

  const byId = new Map(organizations.map((o) => [o.id, o]));

  added.forEach((otherId) => {
    const other = byId.get(otherId);
    if (other && !other.connections.includes(orgId)) {
      other.connections = [...other.connections, orgId];
    }
  });

  removed.forEach((otherId) => {
    const other = byId.get(otherId);
    if (other) {
      other.connections = other.connections.filter((cid) => cid !== orgId);
    }
  });
}

// Strips a deleted org's id out of every remaining org's connections array.
function stripConnectionsTo(organizations, removedId) {
  organizations.forEach((org) => {
    if (Array.isArray(org.connections) && org.connections.includes(removedId)) {
      org.connections = org.connections.filter((cid) => cid !== removedId);
    }
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!requireSession(req)) return sendJson(res, 401, { error: 'unauthorized' });

  const { mode, org, orgId, expectedVersion } = readJsonBody(req);
  if (!['create', 'update', 'delete'].includes(mode)) {
    return sendJson(res, 400, { error: 'invalid_mode' });
  }
  if (!expectedVersion) {
    return sendJson(res, 400, { error: 'expected_version_required' });
  }

  let current;
  try {
    current = await fetchGist();
  } catch (err) {
    console.error('publish: failed to re-fetch gist:', err);
    return sendJson(res, 502, { error: 'gist_fetch_failed' });
  }

  if (current.version !== expectedVersion) {
    return sendJson(res, 409, {
      error: 'conflict',
      currentVersion: current.version,
      message: 'Data changed since you loaded it — please reload and reapply your edit.',
    });
  }

  const organizations = current.organizations;
  const categories = readCategories();
  let resultOrgId = null;

  if (mode === 'delete') {
    const idx = organizations.findIndex((o) => o.id === orgId);
    if (idx === -1) return sendJson(res, 404, { error: 'organization_not_found' });
    organizations.splice(idx, 1);
    stripConnectionsTo(organizations, orgId);
  } else {
    const errors = validateOrgPayload(org, categories);
    if (errors.length) {
      return sendJson(res, 400, { error: 'validation_failed', details: errors });
    }

    if (mode === 'create') {
      const nextId = organizations.length ? Math.max(...organizations.map((o) => o.id)) + 1 : 1;
      const finalized = finalizeOrgFields(org, nextId);
      organizations.push(finalized);
      applyReciprocalConnections(organizations, nextId, [], finalized.connections);
      resultOrgId = nextId;
    } else {
      // update
      const idx = organizations.findIndex((o) => o.id === orgId);
      if (idx === -1) return sendJson(res, 404, { error: 'organization_not_found' });
      const previousConnections = organizations[idx].connections || [];
      const finalized = finalizeOrgFields(org, orgId);
      organizations[idx] = finalized;
      applyReciprocalConnections(organizations, orgId, previousConnections, finalized.connections);
      resultOrgId = orgId;
    }
  }

  try {
    const result = await updateGist(organizations);
    const savedOrg = resultOrgId === null ? null : result.organizations.find((o) => o.id === resultOrgId);
    return sendJson(res, 200, { ok: true, org: savedOrg, version: result.version });
  } catch (err) {
    console.error('publish: failed to update gist:', err);
    return sendJson(res, 502, { error: 'gist_update_failed' });
  }
};
