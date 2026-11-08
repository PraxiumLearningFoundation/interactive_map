let organizations = [];
let categories = [];
let currentVersion = null;
let editingOrgId = null; // null = create mode
let formTags = [];
let activeTagFilter = null; // lower-cased tag selected in "Tags in use"

// Shared with the public map (network-data.js) so both read tags identically.
const { MAX_TAGS, MAX_TAG_LENGTH } = window.PraxiumData;

let previewMap = null;
let previewMarker = null;

const listEl = document.getElementById('org-list');
const searchEl = document.getElementById('org-search');
const formPanel = document.getElementById('org-form-panel');
const listPanel = document.getElementById('org-list-panel');
const form = document.getElementById('org-form');
const formTitle = document.getElementById('form-title');
const formError = document.getElementById('form-error');
const banner = document.getElementById('admin-banner');
const lastUpdatedEl = document.getElementById('last-updated');
const tagOverviewList = document.getElementById('tag-overview-list');
const tagOverviewCount = document.getElementById('tag-overview-count');
const tagOverviewEmpty = document.getElementById('tag-overview-empty');
const tagChipsEl = document.getElementById('org-tag-chips');
const tagInput = document.getElementById('org-tag-input');
const tagSuggestions = document.getElementById('tag-suggestions');
const orgListEmpty = document.getElementById('org-list-empty');

function cleanTag(value) {
  return String(value).trim().replace(/\s+/g, ' ');
}

// Normalized exactly as the public map shows them (handles legacy string tags and
// over-limit hand edits, so re-saving an org cleans its tags instead of failing).
function orgTags(org) {
  return window.PraxiumData.normalizeTags(org && org.tags);
}

function collectTags() {
  return window.PraxiumData.collectTags(organizations);
}

function showBanner(kind, message) {
  banner.textContent = message;
  banner.className = kind;
  banner.hidden = false;
}
function hideBanner() {
  banner.hidden = true;
}
function showFormError(message) {
  formError.textContent = message;
  formError.hidden = false;
}
function hideFormError() {
  formError.hidden = true;
}

async function loadData() {
  const resp = await fetch('/api/gist', { credentials: 'same-origin' });
  if (resp.status === 401) {
    window.location.href = '/.auth/login/aad';
    return;
  }
  if (!resp.ok) {
    showBanner('error', 'Failed to load organization data. Please refresh the page.');
    return;
  }
  const data = await resp.json();
  organizations = data.organizations;
  categories = data.categories;
  currentVersion = data.version;
  lastUpdatedEl.textContent = `Last updated: ${new Date(data.updatedAt).toLocaleString()}`;
  renderTagOverview();
  renderOrgList();
}

function renderTagOverview() {
  const tags = collectTags();
  if (activeTagFilter && !tags.some((t) => t.tag.toLocaleLowerCase() === activeTagFilter)) activeTagFilter = null;
  tagOverviewList.innerHTML = '';
  tagOverviewCount.textContent = tags.length ? `(${tags.length})` : '';
  tagOverviewEmpty.hidden = tags.length > 0;
  tagSuggestions.innerHTML = '';
  tags.forEach(({ tag, count }) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tag-filter-btn';
    btn.dataset.tag = tag.toLocaleLowerCase();
    btn.setAttribute('aria-pressed', String(activeTagFilter === btn.dataset.tag));
    btn.textContent = tag;
    const countEl = document.createElement('span');
    countEl.className = 'tag-count';
    countEl.textContent = String(count);
    countEl.setAttribute('aria-label', `${count} organization${count === 1 ? '' : 's'}`);
    btn.appendChild(countEl);
    btn.addEventListener('click', () => {
      activeTagFilter = activeTagFilter === btn.dataset.tag ? null : btn.dataset.tag;
      renderTagOverview();
      renderOrgList();
    });
    li.appendChild(btn);
    tagOverviewList.appendChild(li);

    const opt = document.createElement('option');
    opt.value = tag;
    tagSuggestions.appendChild(opt);
  });
}

function renderOrgList() {
  const term = searchEl.value.trim().toLowerCase();
  listEl.innerHTML = '';
  const rows = organizations
    .filter((o) => {
      const tags = orgTags(o).map((t) => t.toLocaleLowerCase());
      if (activeTagFilter && !tags.includes(activeTagFilter)) return false;
      return !term
        || o.name.toLowerCase().includes(term)
        || (o.category || '').toLowerCase().includes(term)
        || tags.some((t) => t.includes(term));
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  rows.forEach((org) => {
    const li = document.createElement('li');
    li.className = 'org-card';
    li.innerHTML = `
      <div class="org-card-main">
        <strong>${escapeHtml(org.name)}</strong>
        <span class="org-card-category">${escapeHtml(org.category || '')}</span>
      </div>
      <button type="button" class="edit-link">Edit</button>
    `;
    const tags = orgTags(org);
    if (tags.length) {
      const ul = document.createElement('ul');
      ul.className = 'org-card-tags';
      ul.setAttribute('aria-label', 'Tags');
      tags.forEach((tag) => {
        const item = document.createElement('li');
        item.textContent = tag;
        ul.appendChild(item);
      });
      li.querySelector('.org-card-main').appendChild(ul);
    }
    li.querySelector('.edit-link').addEventListener('click', () => openForm(org));
    listEl.appendChild(li);
  });
  orgListEmpty.hidden = rows.length > 0 || organizations.length === 0;
}

function renderTagChips() {
  tagChipsEl.innerHTML = '';
  formTags.forEach((tag, index) => {
    const li = document.createElement('li');
    li.className = 'tag-chip';
    const label = document.createElement('span');
    label.textContent = tag;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Remove tag ${tag}`);
    remove.addEventListener('click', () => {
      formTags.splice(index, 1);
      renderTagChips();
      tagInput.focus();
    });
    li.append(label, remove);
    tagChipsEl.appendChild(li);
  });
  tagInput.disabled = formTags.length >= MAX_TAGS;
  tagInput.placeholder = formTags.length >= MAX_TAGS ? 'Tag limit reached' : 'Type a tag and press Enter';
}

// Adds each comma-separated tag in `raw`; returns false if anything was rejected.
function addTags(raw) {
  let ok = true;
  // Reuse the existing spelling so "youth" joins an existing "Youth" tag.
  const known = new Map(collectTags().map(({ tag }) => [tag.toLocaleLowerCase(), tag]));
  String(raw).split(',').map(cleanTag).filter(Boolean).forEach((tag) => {
    const key = tag.toLocaleLowerCase();
    if (formTags.some((t) => t.toLocaleLowerCase() === key)) return;
    if (tag.length > MAX_TAG_LENGTH || formTags.length >= MAX_TAGS) { ok = false; return; }
    formTags.push(known.get(key) || tag);
  });
  renderTagChips();
  return ok;
}

function commitTagInput() {
  if (!tagInput.value.trim()) return true;
  const ok = addTags(tagInput.value);
  tagInput.value = '';
  if (!ok) showFormError(`Tags are limited to ${MAX_TAGS} per organization and ${MAX_TAG_LENGTH} characters each.`);
  return ok;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function populateCategorySelect(selectedCategory) {
  const sel = document.getElementById('org-category');
  sel.innerHTML = '';
  const addOpt = (v, t) => {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = t || v;
    sel.appendChild(o);
  };
  addOpt('', '-- Select category --');
  categories.forEach((c) => addOpt(c, c));
  addOpt('custom', 'Custom...');

  const customWrap = document.getElementById('custom-category-wrap');
  const customInput = document.getElementById('org-category-custom');
  if (selectedCategory && categories.includes(selectedCategory)) {
    sel.value = selectedCategory;
    customWrap.hidden = true;
  } else if (selectedCategory) {
    sel.value = 'custom';
    customWrap.hidden = false;
    customInput.value = selectedCategory;
  } else {
    sel.value = '';
    customWrap.hidden = true;
    customInput.value = '';
  }
}

function populateConnectionsSelect(selectedIds, excludeId) {
  const sel = document.getElementById('org-connections');
  sel.innerHTML = '';
  organizations
    .filter((o) => o.id !== excludeId)
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((o) => {
      const opt = document.createElement('option');
      opt.value = String(o.id);
      opt.textContent = o.name;
      if (selectedIds && selectedIds.includes(o.id)) opt.selected = true;
      sel.appendChild(opt);
    });
}

function initPreviewMap(lat, lng) {
  if (!previewMap) {
    previewMap = L.map('preview-map').setView([lat || 20, lng || 0], lat ? 12 : 2);
    // Esri's keyless community basemap (not OSM's own tile servers) — see map.js
    // for why hotlinking tile.openstreetmap.org directly violates OSM's tile
    // usage policy, and why CARTO isn't used either (it now requires an API key).
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      attribution:
        'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors, and the GIS User Community',
      maxZoom: 19,
      maxNativeZoom: 16,
    }).addTo(previewMap);
    previewMarker = L.marker([lat || 20, lng || 0], { draggable: true }).addTo(previewMap);
    previewMarker.on('dragend', () => {
      const pos = previewMarker.getLatLng();
      document.getElementById('org-lat').value = pos.lat.toFixed(6);
      document.getElementById('org-lng').value = pos.lng.toFixed(6);
    });
  } else {
    previewMap.setView([lat || 20, lng || 0], lat ? 12 : 2);
    previewMarker.setLatLng([lat || 20, lng || 0]);
  }
  setTimeout(() => previewMap.invalidateSize(), 50);
}

function updatePreviewMarker() {
  const lat = parseFloat(document.getElementById('org-lat').value);
  const lng = parseFloat(document.getElementById('org-lng').value);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    initPreviewMap(lat, lng);
  }
}

function openForm(org) {
  hideFormError();
  editingOrgId = org ? org.id : null;
  formTitle.textContent = org ? 'Edit Organization' : 'Add Organization';
  document.getElementById('org-id').value = org ? org.id : '';
  document.getElementById('org-name').value = org ? org.name : '';
  document.getElementById('org-website').value = (org && org.contact && org.contact.website) || '';
  document.getElementById('org-email').value = (org && org.contact && org.contact.email) || '';
  document.getElementById('org-phone').value = (org && org.contact && org.contact.phone) || '';
  document.getElementById('org-location').value = org ? org.location : '';
  document.getElementById('org-country').value = (org && org.country) || '';
  document.getElementById('org-lat').value = org ? org.coordinates[0] : '';
  document.getElementById('org-lng').value = org ? org.coordinates[1] : '';
  document.getElementById('org-description').value = org ? org.description : '';
  document.getElementById('description-count').textContent = (org && org.description)
    ? org.description.length
    : 0;
  document.getElementById('org-relationship').value = (org && org.relationship) || '';
  document.getElementById('relationship-count').textContent = (org && org.relationship)
    ? org.relationship.length
    : 0;
  document.getElementById('geocode-status').textContent = '';
  document.getElementById('delete-btn').hidden = !org;
  formTags = [...orgTags(org)];
  tagInput.value = '';
  renderTagChips();

  populateCategorySelect(org ? org.category : '');
  populateConnectionsSelect(org ? org.connections : [], org ? org.id : null);

  listPanel.hidden = true;
  formPanel.hidden = false;
  initPreviewMap(org ? org.coordinates[0] : null, org ? org.coordinates[1] : null);
}

function closeForm() {
  formPanel.hidden = true;
  listPanel.hidden = false;
  editingOrgId = null;
}

document.getElementById('add-org-btn').addEventListener('click', () => openForm(null));
document.getElementById('cancel-btn').addEventListener('click', closeForm);
searchEl.addEventListener('input', renderOrgList);

tagInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    if (tagInput.value.trim() && commitTagInput()) hideFormError();
  } else if (e.key === 'Backspace' && !tagInput.value && formTags.length) {
    formTags.pop();
    renderTagChips();
  }
});
// Picking a datalist suggestion fires "input" with the full value; add it straight away.
tagInput.addEventListener('input', (e) => {
  if (e.inputType === 'insertReplacementText' || e.inputType === undefined) {
    if (collectTags().some((t) => t.tag === tagInput.value)) commitTagInput();
  }
});

document.getElementById('org-category').addEventListener('change', (e) => {
  document.getElementById('custom-category-wrap').hidden = e.target.value !== 'custom';
});

document.getElementById('org-description').addEventListener('input', (e) => {
  document.getElementById('description-count').textContent = e.target.value.length;
});

document.getElementById('org-relationship').addEventListener('input', (e) => {
  document.getElementById('relationship-count').textContent = e.target.value.length;
});

document.getElementById('org-lat').addEventListener('change', updatePreviewMarker);
document.getElementById('org-lng').addEventListener('change', updatePreviewMarker);

document.getElementById('geocode-btn').addEventListener('click', async () => {
  const address = document.getElementById('org-location').value.trim();
  const statusEl = document.getElementById('geocode-status');
  if (!address) {
    statusEl.textContent = 'Enter an address first.';
    return;
  }
  statusEl.textContent = 'Looking up coordinates…';
  try {
    const resp = await fetch('/api/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    });
    if (resp.status === 401) {
      window.location.href = '/.auth/login/aad';
      return;
    }
    if (resp.status === 404) {
      statusEl.textContent = 'No match found — enter coordinates manually.';
      return;
    }
    if (!resp.ok) {
      statusEl.textContent = 'Lookup failed — enter coordinates manually.';
      return;
    }
    const data = await resp.json();
    document.getElementById('org-lat').value = data.lat.toFixed(6);
    document.getElementById('org-lng').value = data.lng.toFixed(6);
    statusEl.textContent = `Matched: ${data.displayName}`;
    initPreviewMap(data.lat, data.lng);
  } catch (err) {
    statusEl.textContent = 'Lookup failed — enter coordinates manually.';
  }
});

document.getElementById('delete-btn').addEventListener('click', async () => {
  if (!editingOrgId) return;
  if (!confirm('Delete this organization? This cannot be undone.')) return;

  try {
    const resp = await fetch('/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'delete', orgId: editingOrgId, expectedVersion: currentVersion }),
    });
    const data = await resp.json();
    if (resp.status === 401) { window.location.href = '/.auth/login/aad'; return; }
    if (resp.status === 409) {
      showFormError(data.message + ' Reloading current data…');
      await loadData();
      return;
    }
    if (!resp.ok) {
      showFormError('Delete failed: ' + (data.error || 'unknown error'));
      return;
    }
    closeForm();
    await loadData();
    showBanner('success', 'Organization deleted.');
  } catch (err) {
    showFormError('Delete failed: could not reach the server.');
  }
});

document.getElementById('logout-btn').addEventListener('click', () => {
  // Azure Static Web Apps' built-in auth handles sign-out; there's no local
  // session/cookie of our own to clear anymore.
  window.location.href = '/.auth/logout';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideFormError();
  // Text still in the tag box is added on publish; a rejected tag blocks the publish.
  if (!commitTagInput()) return;

  const categorySelect = document.getElementById('org-category');
  const categoryCustom = document.getElementById('org-category-custom').value.trim();
  const category = categorySelect.value === 'custom' ? categoryCustom : categorySelect.value;
  const allowCustomCategory = categorySelect.value === 'custom';

  const connectionsSelect = document.getElementById('org-connections');
  const connections = Array.from(connectionsSelect.selectedOptions).map((o) => Number(o.value));

  const org = {
    name: document.getElementById('org-name').value.trim(),
    location: document.getElementById('org-location').value.trim(),
    country: document.getElementById('org-country').value.trim(),
    coordinates: [parseFloat(document.getElementById('org-lat').value), parseFloat(document.getElementById('org-lng').value)],
    category,
    allowCustomCategory,
    description: document.getElementById('org-description').value.trim(),
    relationship: document.getElementById('org-relationship').value.trim(),
    contact: {
      website: document.getElementById('org-website').value.trim(),
      email: document.getElementById('org-email').value.trim(),
      phone: document.getElementById('org-phone').value.trim(),
    },
    connections,
    tags: [...formTags],
  };

  const mode = editingOrgId ? 'update' : 'create';
  const payload = { mode, org, expectedVersion: currentVersion };
  if (editingOrgId) payload.orgId = editingOrgId;

  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Publishing…';

  try {
    const resp = await fetch('/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();

    if (resp.status === 401) { window.location.href = '/.auth/login/aad'; return; }

    if (resp.status === 409) {
      showFormError(data.message);
      currentVersion = data.currentVersion;
      return;
    }
    if (resp.status === 400) {
      showFormError('Please fix: ' + (data.details || []).join('; '));
      return;
    }
    if (!resp.ok) {
      showFormError('Publish failed: ' + (data.error || 'unknown error'));
      return;
    }

    closeForm();
    await loadData();
    showBanner('success', 'Published successfully.');
  } catch (err) {
    showFormError('Publish failed: could not reach the server.');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Publish';
  }
});

loadData();
