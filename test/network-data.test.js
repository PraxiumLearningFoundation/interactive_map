const {
  computeMetrics,
  getConnectionPairs,
  normalizeCategory,
  normalizeDataset,
  safeHttpUrl,
} = require('../network-data');

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function test(name, callback) {
  try {
    callback();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

const categories = ['Arts & Culture', 'Non-Profit', 'Other'];

test('normalizes equivalent category punctuation and casing', () => {
  assert(normalizeCategory('non profit', categories) === 'Non-Profit', 'category should be canonical');
});

test('accepts an empty organization array', () => {
  const result = normalizeDataset([], categories);
  assert(result.valid, 'empty arrays are valid datasets');
  assert(result.organizations.length === 0, 'empty arrays stay empty');
});

test('rejects a non-array top-level value', () => {
  const result = normalizeDataset({ organizations: [] }, categories);
  assert(!result.valid, 'object payload should be invalid');
  assert(result.organizations.length === 0, 'invalid payload should not yield organizations');
});

test('skips unsafe or unusable records without breaking valid records', () => {
  const result = normalizeDataset([
    { id: 1, name: 'Valid', coordinates: [49, -123], category: 'non profit' },
    { id: 2, name: '', coordinates: [49, -123] },
    { id: 3, name: 'Bad coordinates', coordinates: [900, -123] },
  ], categories);

  assert(result.organizations.length === 1, 'only the valid record should remain');
  assert(result.organizations[0].category === 'Non-Profit', 'valid record should be normalized');
  assert(result.warnings.length === 2, 'each skipped record should produce a warning');
});

test('skips later records with duplicate organization IDs', () => {
  const result = normalizeDataset([
    { id: 7, name: 'Original', coordinates: [1, 1] },
    { id: 7, name: 'Duplicate', coordinates: [2, 2] },
  ], categories);

  assert(result.organizations.length === 1, 'only the first unique ID should be retained');
  assert(result.organizations[0].name === 'Original', 'the first organization should win');
  assert(result.warnings.some((warning) => warning.includes('duplicated')), 'duplicate should be reported');
});

test('assigns a deterministic ID when one is missing', () => {
  const result = normalizeDataset([
    { id: 1, name: 'One', coordinates: [1, 1] },
    { name: 'Two', coordinates: [2, 2] },
  ], categories);

  assert(result.organizations[1].id === 2, 'missing ID should use the next available positive integer');
});

test('preserves impact-story fields and strips unsafe website links', () => {
  const result = normalizeDataset([
    {
      id: 1,
      name: 'Story Org',
      location: 'Vancouver, Canada',
      country: 'Canada',
      coordinates: [49.28, -123.12],
      category: 'Non-Profit',
      description: 'A partner.',
      relationship: 'We share a community learning project.',
      contact: { website: 'javascript:alert(1)', email: 'hello@example.org' },
    },
  ], categories);

  const organization = result.organizations[0];
  assert(organization.country === 'Canada', 'country should be retained');
  assert(organization.relationship.includes('community learning'), 'relationship should be retained');
  assert(!organization.contact.website, 'unsafe website should be removed');
  assert(organization.contact.email === 'hello@example.org', 'safe contact fields should be retained');
});

test('removes self-links, duplicate links, and links to unknown IDs', () => {
  const result = normalizeDataset([
    { id: 1, name: 'One', coordinates: [1, 1], connections: [1, 2, 2, 99] },
    { id: 2, name: 'Two', coordinates: [2, 2], connections: [] },
  ], categories);

  assert(
    JSON.stringify(result.organizations[0].connections) === JSON.stringify([2]),
    'only one valid external connection should remain',
  );
  assert(result.warnings.some((warning) => warning.includes('99')), 'unknown ID should be reported');
});

test('counts one-way and reciprocal relationships only once', () => {
  const rows = [
    { id: 1, connections: [2, 3], category: 'A', location: 'X', country: 'Canada' },
    { id: 2, connections: [1], category: 'B', location: 'Y', country: 'Canada' },
    { id: 3, connections: [], category: 'A', location: 'X', country: 'Peru' },
  ];

  assert(getConnectionPairs(rows).length === 2, 'two unique pairs should be returned');
  const metrics = computeMetrics(rows);
  assert(metrics.organizations === 3, 'organization count should be accurate');
  assert(metrics.categories === 2, 'category count should be unique');
  assert(metrics.locations === 2, 'location count should be unique');
  assert(metrics.countries === 2, 'country count should be unique');
  assert(metrics.connections === 2, 'relationship count should be unique');
});

test('allows only http and https organization links', () => {
  assert(safeHttpUrl('https://example.org') === 'https://example.org/', 'https should be accepted');
  assert(safeHttpUrl('javascript:alert(1)') === '', 'script URLs should be rejected');
  assert(safeHttpUrl('not a url') === '', 'malformed URLs should be rejected');
});

console.log('\nNETWORK DATA TESTS PASSED');
