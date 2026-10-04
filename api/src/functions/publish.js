const { app } = require('@azure/functions');
const { fetchGist, updateGist } = require('../../_lib/githubGist');
const { readCategories } = require('../../_lib/categories');
const { getClientPrincipal } = require('../../_lib/clientPrincipal');
const { jsonResponse, methodNotAllowed, unauthorized } = require('../../_lib/http');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FIELD_LIMITS = Object.freeze({
  name: 200,
  location: 300,
  country: 100,
  description: 500,
  relationship: 500,
  website: 2048,
  email: 254,
  phone: 50,
});

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
  else if (org.name.trim().length > FIELD_LIMITS.name) {
    errors.push(`name must be ${FIELD_LIMITS.name} characters or fewer`);
  }
  if (typeof org.location !== 'string' || !org.location.trim()) errors.push('location is required');
  else if (org.location.trim().length > FIELD_LIMITS.location) {
    errors.push(`location must be ${FIELD_LIMITS.location} characters or fewer`);
  }
  if (typeof org.description !== 'string' || !org.description.trim()) errors.push('description is required');
  else if (org.description.trim().length > FIELD_LIMITS.description) {
    errors.push(`description must be ${FIELD_LIMITS.description} characters or fewer`);
  }
  if (org.country !== undefined && typeof org.country !== 'string') {
    errors.push('country must be a string');
  } else if (typeof org.country === 'string' && org.country.trim().length > FIELD_LIMITS.country) {
    errors.push(`country must be ${FIELD_LIMITS.country} characters or fewer`);
  }
  if (org.relationship !== undefined && typeof org.relationship !== 'string') {
    errors.push('relationship must be a string');
  } else if (
    typeof org.relationship === 'string'
    && org.relationship.trim().length > FIELD_LIMITS.relationship
  ) {
    errors.push(`relationship must be ${FIELD_LIMITS.relationship} characters or fewer`);
  }

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
  if (
    typeof website !== 'string'
    || !website.trim()
    || website.trim().length > FIELD_LIMITS.website
    || !isValidUrl(website)
  ) {
    errors.push('contact.website is required and must be a valid http(s) URL');
  }

  const email = org.contact && org.contact.email;
  if (
    email !== undefined
    && email !== ''
    && (
      String(email).trim().length > FIELD_LIMITS.email
      || !EMAIL_RE.test(String(email).trim())
    )
  ) {
    errors.push('contact.email is not a valid email address');
  }

  const phone = org.contact && org.contact.phone;
  if (
    phone !== undefined
    && phone !== ''
    && String(phone).trim().length > FIELD_LIMITS.phone
  ) {
    errors.push(`contact.phone must be ${FIELD_LIMITS.phone} characters or fewer`);
  }

  if (org.connections !== undefined) {
    if (!Array.isArray(org.connections) || !org.connections.every((id) => Number.isInteger(id))) {
      errors.push('connections must be an array of integer organization IDs');
    }
  }

  return errors;
}

// Builds the finalized org record (only the fields we persist) from a validated payload.
function finalizeOrgFields(org, id, existing = {}) {
  const contact = {};
  if (org.contact && org.contact.website) contact.website = org.contact.website.trim();
  if (org.contact && org.contact.email) contact.email = org.contact.email.trim();
  if (org.contact && org.contact.phone) contact.phone = String(org.contact.phone).trim();

  const finalized = {
    ...existing,
    id,
    name: org.name.trim(),
    location: org.location.trim(),
    coordinates: [Number(org.coordinates[0]), Number(org.coordinates[1])],
    category: org.category.trim(),
    description: org.description.trim(),
    contact,
    connections: Array.isArray(org.connections) ? [...new Set(org.connections)].filter((cid) => cid !== id) : [],
  };

  if (Object.prototype.hasOwnProperty.call(org, 'country')) {
    const country = typeof org.country === 'string' ? org.country.trim() : '';
    if (country) finalized.country = country;
    else delete finalized.country;
  }
  if (Object.prototype.hasOwnProperty.call(org, 'relationship')) {
    const relationship = typeof org.relationship === 'string' ? org.relationship.trim() : '';
    if (relationship) finalized.relationship = relationship;
    else delete finalized.relationship;
  }
  delete finalized.allowCustomCategory;

  return finalized;
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
    if (other) {
      const connections = Array.isArray(other.connections) ? other.connections : [];
      if (!connections.includes(orgId)) other.connections = [...connections, orgId];
    }
  });

  removed.forEach((otherId) => {
    const other = byId.get(otherId);
    if (other) {
      const connections = Array.isArray(other.connections) ? other.connections : [];
      other.connections = connections.filter((cid) => cid !== orgId);
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

async function publishHandler(request) {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  if (!getClientPrincipal(request)) return unauthorized();

  const { mode, org, orgId, expectedVersion } = await request.json().catch(() => ({}));
  if (!['create', 'update', 'delete'].includes(mode)) {
    return jsonResponse(400, { error: 'invalid_mode' });
  }
  if (!expectedVersion) {
    return jsonResponse(400, { error: 'expected_version_required' });
  }

  let current;
  try {
    current = await fetchGist();
  } catch (err) {
    console.error('publish: failed to re-fetch gist:', err);
    return jsonResponse(502, { error: 'gist_fetch_failed' });
  }

  if (current.version !== expectedVersion) {
    return jsonResponse(409, {
      error: 'conflict',
      currentVersion: current.version,
      message: 'Data changed since you loaded it — please reload and reapply your edit.',
    });
  }

  const organizations = current.organizations;
  const categories = readCategories();
  let resultOrgId = null;

  if (mode === 'delete') {
    if (!Number.isInteger(orgId)) return jsonResponse(400, { error: 'organization_id_required' });
    const idx = organizations.findIndex((o) => o.id === orgId);
    if (idx === -1) return jsonResponse(404, { error: 'organization_not_found' });
    organizations.splice(idx, 1);
    stripConnectionsTo(organizations, orgId);
  } else {
    const errors = validateOrgPayload(org, categories);
    const knownIds = new Set(organizations.map((organization) => organization.id));
    if (mode === 'update' && !Number.isInteger(orgId)) {
      errors.push('organization ID is required for updates');
    }
    if (Array.isArray(org && org.connections)) {
      const unknownIds = [...new Set(org.connections)].filter((id) => !knownIds.has(id));
      if (unknownIds.length) {
        errors.push(`connections reference unknown organization IDs: ${unknownIds.join(', ')}`);
      }
    }
    if (errors.length) {
      return jsonResponse(400, { error: 'validation_failed', details: errors });
    }

    if (mode === 'create') {
      const validIds = organizations
        .map((organization) => organization.id)
        .filter((id) => Number.isSafeInteger(id) && id > 0);
      const nextId = validIds.length ? Math.max(...validIds) + 1 : 1;
      const finalized = finalizeOrgFields(org, nextId);
      organizations.push(finalized);
      applyReciprocalConnections(organizations, nextId, [], finalized.connections);
      resultOrgId = nextId;
    } else {
      // update
      const idx = organizations.findIndex((o) => o.id === orgId);
      if (idx === -1) return jsonResponse(404, { error: 'organization_not_found' });
      const previousConnections = organizations[idx].connections || [];
      const finalized = finalizeOrgFields(org, orgId, organizations[idx]);
      organizations[idx] = finalized;
      applyReciprocalConnections(organizations, orgId, previousConnections, finalized.connections);
      resultOrgId = orgId;
    }
  }

  try {
    const result = await updateGist(organizations);
    const savedOrg = resultOrgId === null ? null : result.organizations.find((o) => o.id === resultOrgId);
    return jsonResponse(200, { ok: true, org: savedOrg, version: result.version });
  } catch (err) {
    console.error('publish: failed to update gist:', err);
    return jsonResponse(502, { error: 'gist_update_failed' });
  }
}

app.http('publish', {
  methods: ['POST'],
  route: 'publish',
  authLevel: 'anonymous',
  handler: publishHandler,
});

module.exports = { publishHandler };
