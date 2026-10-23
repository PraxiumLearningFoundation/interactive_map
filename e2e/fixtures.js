// Shared test data and network mocks. Leaflet still loads from cdnjs (its SRI
// hash pins the exact CDN build), but map tiles, fonts, and data are stubbed.
const ORGANIZATIONS = [
  {
    id: 1,
    name: 'Praxium Learning Foundation',
    location: 'Vancouver, British Columbia, Canada',
    country: 'Canada',
    coordinates: [49.2827, -123.1207],
    category: 'Not-For-Profit',
    description: 'An international learning community.',
    relationship: 'Our home organization.',
    contact: { website: 'https://www.praxiumfoundation.com/', email: 'info@example.org', phone: '+1 604 555 0100' },
    connections: [2],
  },
  {
    id: 2,
    name: 'Riverbank Arts Collective',
    location: 'Toronto, Ontario, Canada',
    country: 'Canada',
    coordinates: [43.6532, -79.3832],
    category: 'Arts',
    description: 'Community murals and workshops.',
    contact: { website: 'https://riverbank.example.org/' },
    connections: [1],
  },
  {
    id: 3,
    name: 'Highland Health Network',
    location: 'Nairobi, Kenya',
    country: 'Kenya',
    coordinates: [-1.2921, 36.8219],
    category: 'Health',
    description: 'Rural clinics and outreach.',
    contact: { website: 'https://highland.example.org/' },
    connections: [],
  },
];

const CATEGORIES = ['Arts', 'Health', 'Not-For-Profit', 'Other'];
const GIST_URL = /gist\.githubusercontent\.com/;
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

async function stubExternalAssets(page) {
  await page.route(/server\.arcgisonline\.com/, (route) =>
    route.fulfill({ contentType: 'image/png', body: TRANSPARENT_PNG }));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }));
}

async function mockMapData(page, { organizations = ORGANIZATIONS, status = 200 } = {}) {
  await stubExternalAssets(page);
  await page.route(GIST_URL, (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(organizations) }));
}

module.exports = { ORGANIZATIONS, CATEGORIES, GIST_URL, stubExternalAssets, mockMapData };
