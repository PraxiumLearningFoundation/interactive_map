// Thin wrapper around the GitHub Gist REST API. Uses the global `fetch` available in the
// Node.js 18+ runtime — no dependency needed for two REST calls.
const DATA_FILENAME = 'organization-network-map.json';

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
  };
}

// Fetches the Gist and returns { organizations, version, raw }.
// `version` is the Gist's `updated_at` timestamp, used for optimistic concurrency checks.
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
    const rawResp = await fetch(file.raw_url, { headers: { 'User-Agent': authHeaders(token)['User-Agent'] } });
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

  return { organizations, version: gist.updated_at, raw: content };
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
  return { organizations, version: gist.updated_at };
}

module.exports = { fetchGist, updateGist, DATA_FILENAME };
