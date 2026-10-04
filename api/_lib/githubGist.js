// Thin wrapper around the GitHub Gist REST API. Uses the global `fetch` available in the
// Modern Node.js runtime — no dependency needed for two REST calls.
const DATA_FILENAME = 'organization-network-map.json';
const GITHUB_API_VERSION = '2022-11-28';

function getConfig() {
  const gistId = process.env.GIST_ID;
  const token = process.env.GITHUB_PAT;
  if (!gistId) throw new Error('GIST_ID is not configured');
  if (!token) throw new Error('GITHUB_PAT is not configured');
  return { gistId, token };
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'User-Agent': 'praxium-interactive-map-admin',
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  };
}

function getGistVersion(gist) {
  const revision = gist
    && Array.isArray(gist.history)
    && gist.history[0]
    && gist.history[0].version;
  if (typeof revision === 'string' && revision) return revision;
  if (gist && typeof gist.updated_at === 'string' && gist.updated_at) return gist.updated_at;
  throw new Error('GitHub Gist response did not include a version');
}

// Fetches the Gist and returns { organizations, version, raw }.
// `version` prefers GitHub's immutable revision id over the lower-resolution
// updated_at timestamp, making optimistic concurrency checks more reliable.
async function fetchGist() {
  const { gistId, token } = getConfig();
  const resp = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: authHeaders(token),
  });
  if (!resp.ok) {
    throw new Error(`GitHub Gist API returned ${resp.status}`);
  }
  const gist = await resp.json();
  const file = gist.files && gist.files[DATA_FILENAME];
  if (!file) {
    throw new Error(`Gist does not contain a file named ${DATA_FILENAME}`);
  }
  // Gist API truncates file content over ~1MB and instead provides raw_url; not expected at
  // this dataset's scale, but fetch raw_url as a fallback so publish never silently truncates.
  let content = file.content;
  if (file.truncated && file.raw_url) {
    const rawResp = await fetch(file.raw_url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': authHeaders(token)['User-Agent'],
      },
    });
    if (!rawResp.ok) throw new Error(`Failed to fetch truncated Gist file: ${rawResp.status}`);
    content = await rawResp.text();
  }

  let organizations;
  try {
    organizations = JSON.parse(content);
  } catch (err) {
    throw new Error('Gist file content is not valid JSON');
  }
  if (!Array.isArray(organizations)) {
    throw new Error('Gist file content must be a JSON array of organizations');
  }

  return { organizations, version: getGistVersion(gist), updatedAt: gist.updated_at, raw: content };
}

// Overwrites the Gist's data file with a new array of organizations.
async function updateGist(organizations) {
  const { gistId, token } = getConfig();
  const content = JSON.stringify(organizations, null, 2);
  const resp = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'PATCH',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: {
        [DATA_FILENAME]: { content },
      },
    }),
  });
  if (!resp.ok) {
    throw new Error(`GitHub Gist API returned ${resp.status} on update`);
  }
  const gist = await resp.json();
  return { organizations, version: getGistVersion(gist) };
}

module.exports = { fetchGist, updateGist, DATA_FILENAME };
