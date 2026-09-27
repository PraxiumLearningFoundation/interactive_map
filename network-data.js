(function exposePraxiumData(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.PraxiumData = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function createPraxiumData() {
  'use strict';

  const DEFAULT_CATEGORY = 'Other';

  function asText(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
  }

  function simplifyCategory(value) {
    return asText(value)
      .toLowerCase()
      .replace(/[-_]+/g, ' ')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeCategory(value, canonicalCategories) {
    const raw = asText(value);
    if (!raw) return DEFAULT_CATEGORY;

    const categories = Array.isArray(canonicalCategories) ? canonicalCategories : [];
    const direct = categories.find((category) => asText(category).toLowerCase() === raw.toLowerCase());
    if (direct) return asText(direct);

    const simplified = simplifyCategory(raw);
    const equivalent = categories.find((category) => simplifyCategory(category) === simplified);
    if (equivalent) return asText(equivalent);

    return raw
      .split(/\s+/)
      .map((word) => word ? word.charAt(0).toUpperCase() + word.slice(1) : '')
      .join(' ');
  }

  function safeHttpUrl(value) {
    const raw = asText(value);
    if (!raw) return '';
    try {
      const parsed = new URL(raw);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
    } catch (error) {
      return '';
    }
  }

  function normalizeId(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
  }

  function normalizeCoordinates(value) {
    if (!Array.isArray(value) || value.length !== 2) return null;
    const latitude = Number(value[0]);
    const longitude = Number(value[1]);
    if (
      !Number.isFinite(latitude)
      || !Number.isFinite(longitude)
      || latitude < -90
      || latitude > 90
      || longitude < -180
      || longitude > 180
    ) {
      return null;
    }
    return [latitude, longitude];
  }

  function nextAvailableId(usedIds) {
    let id = 1;
    while (usedIds.has(id)) id += 1;
    return id;
  }

  function normalizeDataset(input, canonicalCategories) {
    if (!Array.isArray(input)) {
      return {
        organizations: [],
        warnings: ['The data source must contain a JSON array.'],
        valid: false,
      };
    }

    const warnings = [];
    const organizations = [];
    const usedIds = new Set();

    input.forEach((rawOrganization, index) => {
      if (!rawOrganization || typeof rawOrganization !== 'object' || Array.isArray(rawOrganization)) {
        warnings.push(`Entry ${index + 1} was skipped because it is not an organization object.`);
        return;
      }

      const name = asText(rawOrganization.name);
      const coordinates = normalizeCoordinates(
        rawOrganization.coordinates
        || (
          rawOrganization.lat !== undefined && rawOrganization.lng !== undefined
            ? [rawOrganization.lat, rawOrganization.lng]
            : null
        ),
      );

      if (!name) {
        warnings.push(`Entry ${index + 1} was skipped because it has no organization name.`);
        return;
      }
      if (!coordinates) {
        warnings.push(`${name} was skipped because its coordinates are missing or invalid.`);
        return;
      }

      let id = normalizeId(rawOrganization.id);
      if (id !== null && usedIds.has(id)) {
        warnings.push(`${name} was skipped because organization ID ${id} is duplicated.`);
        return;
      }
      if (id === null) {
        id = nextAvailableId(usedIds);
        warnings.push(`${name} was assigned organization ID ${id} because its ID was missing or invalid.`);
      }
      usedIds.add(id);

      const rawContact = (
        rawOrganization.contact
        && typeof rawOrganization.contact === 'object'
        && !Array.isArray(rawOrganization.contact)
      ) ? rawOrganization.contact : {};

      const contact = {};
      const website = safeHttpUrl(rawContact.website);
      const email = asText(rawContact.email);
      const phone = asText(rawContact.phone);
      if (website) contact.website = website;
      if (email) contact.email = email;
      if (phone) contact.phone = phone;

      const rawConnections = Array.isArray(rawOrganization.connections)
        ? rawOrganization.connections
        : [];
      const connections = [...new Set(
        rawConnections
          .map(normalizeId)
          .filter((connectionId) => connectionId !== null && connectionId !== id),
      )];

      organizations.push({
        ...rawOrganization,
        id,
        name,
        location: asText(rawOrganization.location),
        country: asText(rawOrganization.country),
        coordinates,
        category: normalizeCategory(
          rawOrganization.category || rawOrganization.type,
          canonicalCategories,
        ),
        description: asText(rawOrganization.description),
        relationship: asText(rawOrganization.relationship),
        contact,
        connections,
      });
    });

    const knownIds = new Set(organizations.map((organization) => organization.id));
    organizations.forEach((organization) => {
      const removed = organization.connections.filter((connectionId) => !knownIds.has(connectionId));
      if (removed.length) {
        warnings.push(
          `${organization.name} referenced unknown organization ID${removed.length === 1 ? '' : 's'} `
          + `${removed.join(', ')}; ${removed.length === 1 ? 'it was' : 'they were'} ignored.`,
        );
      }
      organization.connections = organization.connections.filter((connectionId) => knownIds.has(connectionId));
    });

    return { organizations, warnings, valid: true };
  }

  function getConnectionPairs(organizations) {
    const rows = Array.isArray(organizations) ? organizations : [];
    const knownIds = new Set(rows.map((organization) => normalizeId(organization.id)).filter(Boolean));
    const pairs = new Map();

    rows.forEach((organization) => {
      const sourceId = normalizeId(organization.id);
      if (!sourceId || !Array.isArray(organization.connections)) return;

      organization.connections.forEach((connectionValue) => {
        const targetId = normalizeId(connectionValue);
        if (!targetId || targetId === sourceId || !knownIds.has(targetId)) return;
        const low = Math.min(sourceId, targetId);
        const high = Math.max(sourceId, targetId);
        pairs.set(`${low}:${high}`, [low, high]);
      });
    });

    return [...pairs.values()];
  }

  function computeMetrics(organizations) {
    const rows = Array.isArray(organizations) ? organizations : [];
    const categories = new Set();
    const locations = new Set();
    const countries = new Set();

    rows.forEach((organization) => {
      const category = asText(organization.category);
      const location = asText(organization.location);
      const country = asText(organization.country);
      if (category) categories.add(category.toLowerCase());
      if (location) locations.add(location.toLowerCase());
      if (country) countries.add(country.toLowerCase());
    });

    return {
      organizations: rows.length,
      categories: categories.size,
      locations: locations.size,
      countries: countries.size,
      connections: getConnectionPairs(rows).length,
    };
  }

  return {
    DEFAULT_CATEGORY,
    asText,
    computeMetrics,
    getConnectionPairs,
    normalizeCategory,
    normalizeCoordinates,
    normalizeDataset,
    normalizeId,
    safeHttpUrl,
  };
}));
