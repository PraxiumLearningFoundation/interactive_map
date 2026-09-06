(function initializePraxiumMap() {
  'use strict';

  const DATA_CACHE_KEY = 'praxium-map-cache-v2';
  const LEGACY_DATA_CACHE_KEY = 'praxium-map-cache-v1';
  const THEME_STORAGE_KEY = 'praxium-dark-mode';
  const FETCH_TIMEOUT_MS = 12000;
  const INITIAL_VIEW = { center: [20, 0], zoom: 2 };
  const FOCUS_ZOOM = 5;

  const LIGHT_TILE = {
    // No {s} subdomains: OpenStreetMap's standard tile host is tile.openstreetmap.org,
    // and the page CSP img-src only allows that exact host (a/b/c.* would be blocked).
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  };
  const DARK_TILE = {
    // The public OSM tiles remain readable in dark mode through a CSS filter.
    // This avoids requiring a client-visible third-party basemap key.
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  };

  const COLOR_PALETTE = [
    '#85624b', '#6e6c6b', '#6b7964', '#7d6c7f', '#687c80', '#9a7259', '#5c5a5a',
    '#7a7556', '#826568', '#65738a', '#8d6a52', '#6c7b70', '#776978', '#66757d',
    '#785c48', '#75706e', '#687762', '#75657e', '#64787b', '#856b58', '#4a4948',
  ];

  const dataTools = window.PraxiumData;
  const reducedMotion = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

  const refs = {
    shell: document.getElementById('map-shell'),
    sidebar: document.getElementById('sidebar'),
    sidebarToggle: document.getElementById('sidebar-toggle'),
    sidebarOverlay: document.getElementById('sidebar-overlay'),
    legend: document.getElementById('legend'),
    legendToggle: document.getElementById('legend-toggle'),
    legendClose: document.getElementById('legend-close'),
    legendItems: document.getElementById('legend-items'),
    connectionKey: document.getElementById('connection-key'),
    expandToggle: document.getElementById('map-expand-toggle'),
    themeToggle: document.getElementById('dark-mode-toggle'),
    resetView: document.getElementById('reset-view'),
    openMapLink: document.getElementById('open-map-link'),
    search: document.getElementById('search-input'),
    clearSearch: document.getElementById('clear-search'),
    category: document.getElementById('category-filter'),
    clearFilters: document.getElementById('clear-filters'),
    list: document.getElementById('organization-list'),
    emptyResults: document.getElementById('empty-results'),
    resultCount: document.getElementById('result-count'),
    loading: document.getElementById('map-loading'),
    status: document.getElementById('data-status-banner'),
    statusMessage: document.getElementById('data-status-message'),
    statusDismiss: document.getElementById('data-status-dismiss'),
    statOrganizations: document.getElementById('stat-organizations'),
    statCategories: document.getElementById('stat-categories'),
    statPlaces: document.getElementById('stat-places'),
    statPlacesLabel: document.getElementById('stat-places-label'),
    statConnections: document.getElementById('stat-connections'),
    statConnectionsCard: document.getElementById('stat-connections-card'),
    themeColor: document.querySelector('meta[name="theme-color"]'),
  };

  const state = {
    organizations: [],
    categories: [],
    categoryColors: new Map(),
    cards: new Map(),
    markers: new Map(),
    connectionLines: [],
    visibleIds: new Set(),
    selectedId: null,
    metrics: { organizations: 0, categories: 0, locations: 0, countries: 0, connections: 0 },
    usingFallbackData: false,
  };

  let map = null;
  let baseLayer = null;
  let readyResolve;
  const ready = new Promise((resolve) => { readyResolve = resolve; });

  function storageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  function readDataUrl() {
    const meta = document.querySelector('meta[name="praxium-data-url"]');
    return meta ? meta.content.trim() : '';
  }

  function isEmbedded() {
    try {
      return window.self !== window.top;
    } catch (error) {
      return true;
    }
  }

  function notifyParent(type, detail) {
    if (!isEmbedded()) return;
    window.parent.postMessage({
      source: 'praxium-network-map',
      type,
      detail: detail || {},
    }, '*');
  }

  function notifyHeight() {
    notifyParent('resize', {
      height: Math.ceil(refs.shell.getBoundingClientRect().height),
    });
  }

  function showStatus(kind, message) {
    refs.status.classList.remove('warning', 'error');
    refs.status.classList.add(kind === 'error' ? 'error' : 'warning');
    refs.statusMessage.textContent = message;
    refs.status.hidden = false;
  }

  function hideStatus() {
    refs.status.hidden = true;
  }

  function setLoadingMessage(title, message, isError) {
    refs.loading.querySelector('strong').textContent = title;
    refs.loading.querySelector('span:last-child').textContent = message;
    refs.loading.classList.toggle('map-message--error', Boolean(isError));
    refs.loading.hidden = false;
  }

  function hideLoading() {
    refs.loading.hidden = true;
    refs.loading.classList.remove('map-message--error');
  }

  function applyTheme(isDark, persist) {
    document.body.classList.toggle('dark', isDark);
    if (refs.themeColor) refs.themeColor.content = isDark ? '#3e3d3d' : '#efefee';
    refs.themeToggle.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    refs.themeToggle.setAttribute('aria-label', isDark ? 'Switch to light map' : 'Switch to dark map');
    refs.themeToggle.querySelector('.theme-icon').textContent = isDark ? '☀' : '☾';
    refs.themeToggle.querySelector('.theme-label').textContent = isDark ? 'Light' : 'Dark';

    if (persist) storageSet(THEME_STORAGE_KEY, isDark ? 'true' : 'false');
    if (map) {
      setBaseLayer(isDark ? DARK_TILE : LIGHT_TILE);
      updateMarkerIcons();
      styleConnectionLines();
    }
  }

  function setBaseLayer(tile) {
    if (!map) return;
    if (baseLayer) map.removeLayer(baseLayer);
    baseLayer = window.L.tileLayer(tile.url, {
      attribution: tile.attribution,
      maxZoom: 19,
      className: tile === DARK_TILE ? 'praxium-dark-tiles' : 'praxium-light-tiles',
    });
    baseLayer.addTo(map);
  }

  function initializeLeaflet() {
    if (!window.L || !dataTools) {
      setLoadingMessage(
        'The map could not start',
        'A required map resource did not load. Please refresh or try again later.',
        true,
      );
      refs.resultCount.textContent = 'Unavailable';
      return false;
    }

    map = window.L.map('map', {
      zoomControl: false,
      minZoom: 2,
      worldCopyJump: true,
      preferCanvas: true,
    }).setView(INITIAL_VIEW.center, INITIAL_VIEW.zoom);

    window.L.control.zoom({ position: 'bottomleft' }).addTo(map);
    map.createPane('connections');
    map.getPane('connections').style.zIndex = '350';
    map.getPane('connections').style.pointerEvents = 'auto';

    map.on('click', () => clearSelection(false));

    const savedTheme = storageGet(THEME_STORAGE_KEY);
    const useDarkTheme = savedTheme === 'true';
    applyTheme(useDarkTheme, false);
    return true;
  }

  function adjustColorForDark(hex) {
    const normalized = String(hex).replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(normalized)) return hex;
    const parts = [0, 2, 4].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16));
    return `#${parts.map((value) => Math.min(255, Math.round(value * 1.18)).toString(16).padStart(2, '0')).join('')}`;
  }

  function getCategoryColor(category) {
    const base = state.categoryColors.get(category) || '#85624b';
    return document.body.classList.contains('dark') ? adjustColorForDark(base) : base;
  }

  function buildCategoryColors() {
    state.categoryColors.clear();
    const discovered = [...new Set(state.organizations.map((organization) => organization.category))];
    const ordered = [
      ...state.categories.filter((category) => discovered.includes(category)),
      ...discovered.filter((category) => !state.categories.includes(category)).sort(),
    ];
    ordered.forEach((category, index) => {
      state.categoryColors.set(category, COLOR_PALETTE[index % COLOR_PALETTE.length]);
    });
    return ordered;
  }

  function createMarkerIcon(organization, selected) {
    const color = getCategoryColor(organization.category);
    const selectedClass = selected ? ' selected' : '';
    return window.L.divIcon({
      html: `<span class="marker-pin${selectedClass}" style="--marker-color:${color}"></span>`,
      className: 'custom-marker',
      iconSize: [24, 24],
      iconAnchor: [12, 22],
      popupAnchor: [0, -22],
    });
  }

  function appendTextElement(parent, tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    element.textContent = text;
    parent.appendChild(element);
    return element;
  }

  function getConnectedIds(organizationId) {
    const connected = new Set();
    dataTools.getConnectionPairs(state.organizations).forEach(([first, second]) => {
      if (first === organizationId) connected.add(second);
      if (second === organizationId) connected.add(first);
    });
    return connected;
  }

  function createPopup(organization) {
    const color = getCategoryColor(organization.category);
    const wrapper = document.createElement('article');
    wrapper.className = 'popup-content';
    wrapper.style.setProperty('--popup-color', color);

    const accent = document.createElement('div');
    accent.className = 'popup-accent';
    wrapper.appendChild(accent);

    const body = document.createElement('div');
    body.className = 'popup-body';
    wrapper.appendChild(body);

    appendTextElement(body, 'p', 'popup-kicker', organization.category || 'Organization');
    appendTextElement(body, 'h2', 'popup-title', organization.name);
    if (organization.location) appendTextElement(body, 'p', 'popup-location', organization.location);
    if (organization.description) appendTextElement(body, 'p', 'popup-description', organization.description);

    if (organization.relationship) {
      const relationship = document.createElement('div');
      relationship.className = 'popup-relationship';
      appendTextElement(relationship, 'strong', '', 'How we connect');
      relationship.appendChild(document.createTextNode(organization.relationship));
      body.appendChild(relationship);
    }

    const connectedNames = [...getConnectedIds(organization.id)]
      .map((id) => state.organizations.find((candidate) => candidate.id === id))
      .filter(Boolean)
      .map((candidate) => candidate.name);
    if (connectedNames.length) {
      const connections = document.createElement('p');
      connections.className = 'popup-connections';
      const label = document.createElement('strong');
      label.textContent = `${connectedNames.length} mapped connection${connectedNames.length === 1 ? '' : 's'}: `;
      connections.appendChild(label);
      connections.appendChild(document.createTextNode(connectedNames.join(', ')));
      body.appendChild(connections);
    }

    const contact = document.createElement('div');
    contact.className = 'popup-contact';

    if (organization.contact.website) {
      const website = document.createElement('a');
      website.className = 'primary';
      website.href = organization.contact.website;
      website.target = '_blank';
      website.rel = 'noopener noreferrer';
      website.textContent = 'Visit website ↗';
      website.setAttribute('aria-label', `Visit ${organization.name} website (opens in a new tab)`);
      contact.appendChild(website);
    }

    if (organization.contact.email) {
      const email = document.createElement('a');
      email.href = `mailto:${organization.contact.email}`;
      email.textContent = 'Email';
      email.setAttribute('aria-label', `Email ${organization.name}`);
      contact.appendChild(email);
    }

    if (organization.contact.phone) {
      const phoneValue = organization.contact.phone.replace(/[^+\d]/g, '');
      if (phoneValue) {
        const phone = document.createElement('a');
        phone.href = `tel:${phoneValue}`;
        phone.textContent = 'Call';
        phone.setAttribute('aria-label', `Call ${organization.name}`);
        contact.appendChild(phone);
      }
    }

    if (contact.childElementCount) body.appendChild(contact);
    return wrapper;
  }

  function createOrganizationCard(organization) {
    const color = getCategoryColor(organization.category);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'org-item';
    button.dataset.id = String(organization.id);
    button.style.setProperty('--org-color', color);
    button.setAttribute('role', 'listitem');
    button.setAttribute('aria-label', `View ${organization.name} on the map`);

    const colorBar = document.createElement('span');
    colorBar.className = 'org-color-bar';
    colorBar.setAttribute('aria-hidden', 'true');
    button.appendChild(colorBar);

    const copy = document.createElement('span');
    copy.className = 'org-card-copy';
    appendTextElement(copy, 'span', 'org-name', organization.name);
    if (organization.location) appendTextElement(copy, 'span', 'org-location', organization.location);
    button.appendChild(copy);

    appendTextElement(button, 'span', 'org-category', organization.category);

    const connectionCount = getConnectedIds(organization.id).size;
    if (connectionCount) {
      appendTextElement(
        button,
        'span',
        'org-connection-count',
        `${connectionCount} connection${connectionCount === 1 ? '' : 's'}`,
      );
    }

    button.addEventListener('click', () => selectOrganization(organization.id, { toggle: true }));
    return button;
  }

  function renderStats() {
    state.metrics = dataTools.computeMetrics(state.organizations);
    refs.statOrganizations.textContent = String(state.metrics.organizations);
    refs.statCategories.textContent = String(state.metrics.categories);

    if (state.metrics.countries > 1) {
      refs.statPlaces.textContent = String(state.metrics.countries);
      refs.statPlacesLabel.textContent = 'Countries';
    } else {
      refs.statPlaces.textContent = String(state.metrics.locations);
      refs.statPlacesLabel.textContent = 'Locations';
    }

    refs.statConnections.textContent = String(state.metrics.connections);
    refs.statConnectionsCard.hidden = state.metrics.connections === 0;
    refs.connectionKey.hidden = state.metrics.connections === 0;
  }

  function renderFiltersAndLegend() {
    const orderedCategories = buildCategoryColors();
    const selected = refs.category.value;
    refs.category.querySelectorAll('option:not([value="all"])').forEach((option) => option.remove());
    refs.legendItems.replaceChildren();

    orderedCategories.forEach((category) => {
      const count = state.organizations.filter((organization) => organization.category === category).length;
      const option = document.createElement('option');
      option.value = category;
      option.textContent = `${category} (${count})`;
      refs.category.appendChild(option);

      const legendButton = document.createElement('button');
      legendButton.type = 'button';
      legendButton.className = 'legend-item';
      legendButton.dataset.category = category;
      legendButton.setAttribute('aria-label', `Show ${category} organizations`);

      const dot = document.createElement('span');
      dot.className = 'legend-dot';
      dot.style.setProperty('--legend-color', getCategoryColor(category));
      dot.setAttribute('aria-hidden', 'true');
      legendButton.appendChild(dot);
      appendTextElement(legendButton, 'span', '', category);
      appendTextElement(legendButton, 'span', 'legend-count', String(count));

      legendButton.addEventListener('click', () => {
        refs.category.value = refs.category.value === category ? 'all' : category;
        applyFilters({ fit: true });
        if (window.innerWidth <= 720) closeLegend();
      });
      refs.legendItems.appendChild(legendButton);
    });

    refs.category.value = [...refs.category.options].some((option) => option.value === selected)
      ? selected
      : 'all';
  }

  function clearRenderedMap() {
    state.connectionLines.forEach((line) => line.remove());
    state.connectionLines = [];
    state.markers.forEach((marker) => marker.remove());
    state.markers.clear();
    state.cards.clear();
    refs.list.replaceChildren();
  }

  function renderOrganizations() {
    clearRenderedMap();

    state.organizations.forEach((organization) => {
      const marker = window.L.marker(organization.coordinates, {
        icon: createMarkerIcon(organization, false),
        keyboard: true,
        title: organization.name,
        alt: organization.name,
        riseOnHover: true,
      });
      marker.bindPopup(() => createPopup(organization), {
        maxWidth: 320,
        minWidth: 235,
        autoPanPaddingTopLeft: [20, 80],
        autoPanPaddingBottomRight: [20, 20],
      });
      marker.on('click', () => selectOrganization(organization.id, { toggle: false, moveMap: false }));
      marker.addTo(map);
      state.markers.set(organization.id, marker);

      const card = createOrganizationCard(organization);
      refs.list.appendChild(card);
      state.cards.set(organization.id, card);
    });
  }

  function lineBaseStyle() {
    const dark = document.body.classList.contains('dark');
    return {
      color: dark ? '#c7ac98' : '#85624b',
      weight: 2,
      opacity: dark ? 0.64 : 0.58,
      dashArray: '5 7',
      lineCap: 'round',
    };
  }

  function lineActiveStyle() {
    return {
      color: document.body.classList.contains('dark') ? '#eee7e2' : '#654a38',
      weight: 4,
      opacity: 0.95,
      dashArray: null,
      lineCap: 'round',
    };
  }

  function drawConnections() {
    state.connectionLines.forEach((line) => line.remove());
    state.connectionLines = [];

    dataTools.getConnectionPairs(state.organizations).forEach(([firstId, secondId]) => {
      if (!state.visibleIds.has(firstId) || !state.visibleIds.has(secondId)) return;
      const first = state.organizations.find((organization) => organization.id === firstId);
      const second = state.organizations.find((organization) => organization.id === secondId);
      if (!first || !second) return;

      const line = window.L.polyline([first.coordinates, second.coordinates], {
        ...lineBaseStyle(),
        pane: 'connections',
        interactive: true,
      });
      line.orgIds = [firstId, secondId];

      const tooltip = document.createElement('span');
      tooltip.textContent = `${first.name} ↔ ${second.name}`;
      line.bindTooltip(tooltip, { sticky: true, direction: 'top' });
      line.on('click', (event) => {
        if (event.originalEvent) window.L.DomEvent.stopPropagation(event.originalEvent);
        const targetId = state.selectedId === firstId ? secondId : firstId;
        selectOrganization(targetId, { toggle: false });
      });
      line.addTo(map);
      state.connectionLines.push(line);
    });

    styleConnectionLines();
  }

  function styleConnectionLines() {
    state.connectionLines.forEach((line) => {
      const active = state.selectedId !== null && line.orgIds.includes(state.selectedId);
      line.setStyle(active ? lineActiveStyle() : lineBaseStyle());
      if (active) line.bringToFront();
    });
  }

  function updateMarkerIcons() {
    state.organizations.forEach((organization) => {
      const marker = state.markers.get(organization.id);
      if (marker) marker.setIcon(createMarkerIcon(organization, state.selectedId === organization.id));
    });

    state.cards.forEach((card, id) => {
      const organization = state.organizations.find((candidate) => candidate.id === id);
      if (organization) card.style.setProperty('--org-color', getCategoryColor(organization.category));
    });

    refs.legendItems.querySelectorAll('.legend-item').forEach((button) => {
      const dot = button.querySelector('.legend-dot');
      if (dot) dot.style.setProperty('--legend-color', getCategoryColor(button.dataset.category));
    });
  }

  function updateSelectionStyles(options) {
    const connectedIds = state.selectedId === null ? new Set() : getConnectedIds(state.selectedId);

    state.cards.forEach((card, id) => {
      card.classList.toggle('selected', id === state.selectedId);
      card.classList.toggle('connected', connectedIds.has(id));
      card.setAttribute('aria-pressed', id === state.selectedId ? 'true' : 'false');
    });
    updateMarkerIcons();
    styleConnectionLines();

    if (state.selectedId !== null && options && options.scrollCard) {
      const card = state.cards.get(state.selectedId);
      if (card && !card.hidden) {
        card.scrollIntoView({
          behavior: reducedMotion.matches ? 'auto' : 'smooth',
          block: 'nearest',
        });
      }
    }
  }

  function fitOrganizations(organizations, animate) {
    if (!map) return;
    const rows = (organizations || []).filter(Boolean);
    if (rows.length === 0) {
      map.setView(INITIAL_VIEW.center, INITIAL_VIEW.zoom, { animate: false });
      return;
    }
    if (rows.length === 1) {
      const method = animate && !reducedMotion.matches ? 'flyTo' : 'setView';
      map[method](rows[0].coordinates, FOCUS_ZOOM, { duration: 0.65 });
      return;
    }

    const bounds = window.L.latLngBounds(rows.map((organization) => organization.coordinates));
    map.fitBounds(bounds, {
      animate: Boolean(animate && !reducedMotion.matches),
      duration: 0.75,
      paddingTopLeft: [46, 76],
      paddingBottomRight: [46, 54],
      maxZoom: FOCUS_ZOOM,
    });
  }

  function clearSelection(resetView) {
    if (state.selectedId === null && !resetView) return;
    state.selectedId = null;
    if (map) map.closePopup();
    updateSelectionStyles();
    if (resetView) {
      fitOrganizations(
        state.organizations.filter((organization) => state.visibleIds.has(organization.id)),
        true,
      );
    }
    notifyParent('selection', { organizationId: null });
  }

  function selectOrganization(idValue, options) {
    const settings = { toggle: false, moveMap: true, ...(options || {}) };
    const id = Number(idValue);
    const organization = state.organizations.find((candidate) => candidate.id === id);
    const marker = state.markers.get(id);
    if (!organization || !marker) return false;

    if (!state.visibleIds.has(id)) {
      refs.search.value = '';
      refs.category.value = 'all';
      applyFilters({ fit: false });
    }

    if (settings.toggle && state.selectedId === id) {
      clearSelection(true);
      closeSidebarOnMobile();
      return true;
    }

    state.selectedId = id;
    updateSelectionStyles({ scrollCard: true });

    if (settings.moveMap) {
      const method = reducedMotion.matches ? 'setView' : 'flyTo';
      map[method](organization.coordinates, Math.max(map.getZoom(), FOCUS_ZOOM), { duration: 0.65 });
    }
    marker.openPopup();
    closeSidebarOnMobile();
    notifyParent('selection', { organizationId: id, organizationName: organization.name });
    return true;
  }

  function normalizedSearchText(organization) {
    return [
      organization.name,
      organization.location,
      organization.country,
      organization.category,
      organization.description,
      organization.relationship,
    ].join(' ').toLocaleLowerCase();
  }

  function updateLegendSelection() {
    const selected = refs.category.value;
    refs.legendItems.querySelectorAll('.legend-item').forEach((button) => {
      const active = selected !== 'all' && button.dataset.category === selected;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function applyFilters(options) {
    const settings = { fit: false, ...(options || {}) };
    const searchTerm = refs.search.value.trim().toLocaleLowerCase();
    const selectedCategory = refs.category.value;
    state.visibleIds.clear();

    state.organizations.forEach((organization) => {
      const searchMatches = !searchTerm || normalizedSearchText(organization).includes(searchTerm);
      const categoryMatches = selectedCategory === 'all' || organization.category === selectedCategory;
      const visible = searchMatches && categoryMatches;
      const card = state.cards.get(organization.id);
      const marker = state.markers.get(organization.id);

      if (visible) {
        state.visibleIds.add(organization.id);
        if (marker && !map.hasLayer(marker)) marker.addTo(map);
      } else if (marker && map.hasLayer(marker)) {
        marker.removeFrom(map);
      }
      if (card) card.hidden = !visible;
    });

    if (state.selectedId !== null && !state.visibleIds.has(state.selectedId)) {
      clearSelection(false);
    }

    const visibleCount = state.visibleIds.size;
    refs.resultCount.textContent = `${visibleCount} of ${state.organizations.length}`;
    refs.emptyResults.hidden = visibleCount !== 0 || state.organizations.length === 0;
    refs.clearSearch.hidden = refs.search.value.length === 0;
    refs.clearFilters.hidden = !searchTerm && selectedCategory === 'all';
    updateLegendSelection();
    drawConnections();

    if (settings.fit) {
      fitOrganizations(
        state.organizations.filter((organization) => state.visibleIds.has(organization.id)),
        true,
      );
    }
  }

  function renderAll(options) {
    const settings = { resetFilters: true, ...(options || {}) };
    state.selectedId = null;
    if (settings.resetFilters) {
      refs.search.value = '';
      refs.category.value = 'all';
    }

    renderStats();
    renderFiltersAndLegend();
    renderOrganizations();
    applyFilters({ fit: false });

    if (state.organizations.length) {
      hideLoading();
      window.setTimeout(() => {
        map.invalidateSize();
        fitOrganizations(state.organizations, false);
      }, 60);
    } else {
      setLoadingMessage(
        'The network is being updated',
        'There are no organization locations to display right now.',
        false,
      );
    }

    notifyHeight();
  }

  async function fetchJson(url) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : null;
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: controller ? controller.signal : undefined,
      });
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      return await response.json();
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  }

  async function loadCategories() {
    const fallback = Array.isArray(window.CANONICAL_CATEGORIES)
      ? window.CANONICAL_CATEGORIES.map((category) => String(category).trim()).filter(Boolean)
      : [];
    try {
      const categoriesUrl = new URL('categories.json', document.baseURI).href;
      const categories = await fetchJson(categoriesUrl);
      if (Array.isArray(categories) && categories.length) {
        return [...new Set(categories.map((category) => String(category).trim()).filter(Boolean))];
      }
    } catch (error) {
      console.warn('Could not load categories.json; using the bundled fallback.', error);
    }
    return fallback;
  }

  function readCachedData() {
    const raw = storageGet(DATA_CACHE_KEY) || storageGet(LEGACY_DATA_CACHE_KEY);
    if (!raw) return null;
    try {
      const cached = JSON.parse(raw);
      return cached && Array.isArray(cached.data) ? cached : null;
    } catch (error) {
      return null;
    }
  }

  function formatCachedDate(timestamp) {
    const date = new Date(timestamp);
    return Number.isFinite(date.getTime()) ? date.toLocaleString() : 'an earlier visit';
  }

  function useDataset(rawData, sourceDescription) {
    const result = dataTools.normalizeDataset(rawData, state.categories);
    if (!result.valid) throw new Error('The data source did not contain an organization array.');
    if (rawData.length > 0 && result.organizations.length === 0) {
      throw new Error('The data source did not contain any usable organization records.');
    }

    state.organizations = result.organizations;
    if (result.warnings.length) {
      console.warn('Praxium network data warnings:', result.warnings);
      showStatus(
        'warning',
        `${sourceDescription} ${result.warnings.length} data issue${result.warnings.length === 1 ? ' was' : 's were'} safely ignored.`,
      );
    }
    return result;
  }

  async function loadNetworkData() {
    state.categories = await loadCategories();
    const dataUrl = readDataUrl();

    if (!dataUrl) {
      state.organizations = [];
      showStatus('error', 'The organization data source has not been configured.');
      renderAll();
      return;
    }

    try {
      const rawData = await fetchJson(dataUrl);
      const result = useDataset(rawData, 'The network loaded, but');
      storageSet(DATA_CACHE_KEY, JSON.stringify({ data: rawData, fetchedAt: Date.now() }));
      state.usingFallbackData = false;
      if (result.warnings.length === 0) hideStatus();
    } catch (error) {
      console.warn('Could not load the live Praxium network data.', error);
      const cached = readCachedData();
      if (cached) {
        try {
          useDataset(cached.data, 'The saved network loaded, but');
          state.usingFallbackData = true;
          showStatus(
            'warning',
            `Live updates are temporarily unavailable. Showing the last saved network from ${formatCachedDate(cached.fetchedAt)}.`,
          );
        } catch (cacheError) {
          state.organizations = [];
          showStatus('error', 'The organization network could not be loaded. Please try again later.');
        }
      } else {
        state.organizations = [];
        showStatus('error', 'The organization network could not be loaded. Please try again later.');
      }
    }

    renderAll();
  }

  function openSidebar() {
    refs.sidebar.classList.add('sidebar-open');
    refs.sidebarOverlay.classList.add('show');
    refs.sidebarOverlay.setAttribute('aria-hidden', 'false');
    refs.sidebarToggle.setAttribute('aria-expanded', 'true');
    refs.sidebarToggle.setAttribute('aria-label', 'Close network explorer');
    refs.sidebarToggle.querySelector('span').textContent = '×';
    window.setTimeout(() => refs.search.focus(), reducedMotion.matches ? 0 : 240);
  }

  function closeSidebar() {
    refs.sidebar.classList.remove('sidebar-open');
    refs.sidebarOverlay.classList.remove('show');
    refs.sidebarOverlay.setAttribute('aria-hidden', 'true');
    refs.sidebarToggle.setAttribute('aria-expanded', 'false');
    refs.sidebarToggle.setAttribute('aria-label', 'Open network explorer');
    refs.sidebarToggle.querySelector('span').textContent = '☰';
  }

  function closeSidebarOnMobile() {
    if (window.innerWidth <= 720) closeSidebar();
  }

  function openLegend() {
    refs.legend.classList.add('legend-open');
    refs.legendToggle.setAttribute('aria-expanded', 'true');
    refs.legendToggle.setAttribute('aria-label', 'Hide map legend');
  }

  function closeLegend() {
    refs.legend.classList.remove('legend-open');
    refs.legendToggle.setAttribute('aria-expanded', 'false');
    refs.legendToggle.setAttribute('aria-label', 'Show map legend');
  }

  function setFallbackExpanded(expanded) {
    refs.shell.classList.toggle('map-expanded', expanded);
    document.body.classList.toggle('map-expanded-active', expanded);
    updateExpandButton(expanded);
    window.setTimeout(() => {
      if (map) map.invalidateSize();
      notifyHeight();
    }, reducedMotion.matches ? 0 : 260);
  }

  function updateExpandButton(expanded) {
    refs.expandToggle.setAttribute('aria-pressed', expanded ? 'true' : 'false');
    refs.expandToggle.setAttribute('aria-label', expanded ? 'Exit expanded map' : 'Expand map');
    refs.expandToggle.querySelector('span').textContent = expanded ? '×' : '⛶';
  }

  async function toggleExpandedMap() {
    const fallbackExpanded = refs.shell.classList.contains('map-expanded');
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    if (fallbackExpanded) {
      setFallbackExpanded(false);
      return;
    }

    if (refs.shell.requestFullscreen) {
      try {
        await refs.shell.requestFullscreen();
        return;
      } catch (error) {
        // Cross-origin iframes need allow="fullscreen". Fall back to filling the iframe.
      }
    }
    setFallbackExpanded(true);
  }

  function bindUiEvents() {
    refs.themeToggle.addEventListener('click', () => {
      applyTheme(!document.body.classList.contains('dark'), true);
    });
    refs.resetView.addEventListener('click', () => clearSelection(true));
    refs.statusDismiss.addEventListener('click', hideStatus);

    refs.search.addEventListener('input', () => applyFilters());
    refs.search.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && refs.search.value) {
        refs.search.value = '';
        applyFilters({ fit: true });
      }
    });
    refs.category.addEventListener('change', () => applyFilters({ fit: true }));
    refs.clearSearch.addEventListener('click', () => {
      refs.search.value = '';
      refs.search.focus();
      applyFilters({ fit: true });
    });
    refs.clearFilters.addEventListener('click', () => {
      refs.search.value = '';
      refs.category.value = 'all';
      applyFilters({ fit: true });
    });

    refs.sidebarToggle.addEventListener('click', () => {
      if (refs.sidebar.classList.contains('sidebar-open')) closeSidebar();
      else openSidebar();
    });
    refs.sidebarOverlay.addEventListener('click', closeSidebar);
    refs.legendToggle.addEventListener('click', () => {
      if (refs.legend.classList.contains('legend-open')) closeLegend();
      else openLegend();
    });
    refs.legendClose.addEventListener('click', closeLegend);
    refs.expandToggle.addEventListener('click', toggleExpandedMap);

    document.addEventListener('fullscreenchange', () => {
      const expanded = document.fullscreenElement === refs.shell;
      if (expanded) setFallbackExpanded(false);
      updateExpandButton(expanded);
      window.setTimeout(() => {
        if (map) map.invalidateSize();
        notifyHeight();
      }, 80);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (refs.legend.classList.contains('legend-open')) closeLegend();
      else if (refs.sidebar.classList.contains('sidebar-open')) closeSidebar();
      else if (refs.shell.classList.contains('map-expanded')) setFallbackExpanded(false);
      else if (state.selectedId !== null) clearSelection(false);
    });

    window.addEventListener('resize', () => {
      window.requestAnimationFrame(() => {
        if (map) map.invalidateSize();
        if (window.innerWidth > 720) {
          closeSidebar();
          closeLegend();
        }
        notifyHeight();
      });
    });

    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(() => {
        if (map) map.invalidateSize({ pan: false });
        notifyHeight();
      });
      observer.observe(refs.shell);
    }
  }

  function exportNetworkData() {
    return JSON.stringify(state.organizations, null, 2);
  }

  function importNetworkData(jsonData) {
    try {
      const parsed = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      const result = dataTools.normalizeDataset(parsed, state.categories);
      if (!result.valid || (parsed.length > 0 && result.organizations.length === 0)) return false;
      state.organizations = result.organizations;
      hideStatus();
      if (result.warnings.length) {
        console.warn('Imported network data warnings:', result.warnings);
        showStatus(
          'warning',
          `The import completed with ${result.warnings.length} data issue${result.warnings.length === 1 ? '' : 's'} safely ignored.`,
        );
      }
      renderAll();
      return true;
    } catch (error) {
      console.error('Could not import Praxium network data.', error);
      return false;
    }
  }

  function addOrganization(organizationData) {
    if (!organizationData || typeof organizationData !== 'object' || Array.isArray(organizationData)) return null;
    const highestId = state.organizations.reduce((highest, organization) => Math.max(highest, organization.id), 0);
    const id = highestId + 1;
    const result = dataTools.normalizeDataset(
      [...state.organizations, { ...organizationData, id }],
      state.categories,
    );
    if (!result.valid || result.organizations.length !== state.organizations.length + 1) return null;
    state.organizations = result.organizations;
    renderAll({ resetFilters: false });
    return id;
  }

  function installPublicApi() {
    window.praxiumNetwork = {
      exportData: exportNetworkData,
      importData: importNetworkData,
      addOrganization,
      selectOrganization,
      resetView: () => clearSelection(true),
      getMetrics: () => ({ ...state.metrics }),
      ready,
    };
  }

  async function start() {
    installPublicApi();
    bindUiEvents();

    if (isEmbedded()) {
      const url = new URL(window.location.href);
      url.hash = '';
      refs.openMapLink.href = url.href;
      refs.openMapLink.hidden = false;
    }

    if (!initializeLeaflet()) {
      readyResolve({ ok: false, organizations: 0 });
      return;
    }

    await loadNetworkData();
    const detail = {
      ok: state.organizations.length > 0,
      organizations: state.organizations.length,
      metrics: { ...state.metrics },
      cached: state.usingFallbackData,
    };
    readyResolve(detail);
    document.dispatchEvent(new CustomEvent('praxium:ready', { detail }));
    notifyParent('ready', detail);
  }

  start().catch((error) => {
    console.error('Praxium network startup failed.', error);
    setLoadingMessage(
      'The map could not start',
      'Please refresh the page. If the problem continues, contact Praxium.',
      true,
    );
    refs.resultCount.textContent = 'Unavailable';
    readyResolve({ ok: false, organizations: 0 });
  });
}());
