const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML_FILE = 'organization-network-map.html';
const WORKFLOW_FILE = '.github/workflows/static.yml';

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

const html = read(HTML_FILE);
const workflow = read(WORKFLOW_FILE);

const references = [
  ...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g),
].map((match) => match[1]);

const publicAssets = [...new Set(references.filter((reference) => (
  !reference.startsWith('http://')
  && !reference.startsWith('https://')
  && !reference.startsWith('data:')
  && !reference.startsWith('#')
  && reference !== 'organization-network-map.html'
)))];

publicAssets.forEach((asset) => {
  assert(fs.existsSync(path.join(ROOT, asset)), `${asset} must exist`);
  assert(
    workflow.includes(`cp ${asset} _site/`),
    `${asset} must be copied into the GitHub Pages artifact`,
  );
});

assert(
  workflow.includes('cp organization-network-map.html _site/index.html'),
  'the GitHub Pages root must serve the map',
);
assert(
  html.includes('http-equiv="Content-Security-Policy"'),
  'the public page must define a Content Security Policy',
);
assert(
  !/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i.test(html),
  'the public page must not contain inline executable scripts',
);
assert(
  !/\binnerHTML\s*=/.test(read('map.js')),
  'the public renderer must not inject organization data with innerHTML',
);
assert(
  html.indexOf('praxium-tokens-v2.css') < html.indexOf('map.css'),
  'shared site tokens must load before map-specific component styles',
);
assert(
  /<body(?:\s[^>]*)?>/.test(html) && !/<body[^>]*\bclass="[^"]*\bdark\b/.test(html),
  'the public map must default to the website-aligned light theme',
);
assert(
  html.includes('family=Epilogue') && html.includes('family=Poppins'),
  'the public map must load the website typefaces',
);

const externalLeafletAssets = references.filter((reference) => (
  reference.includes('cdnjs.cloudflare.com/ajax/libs/leaflet/')
));
assert(externalLeafletAssets.length === 2, 'Leaflet CSS and JavaScript should both be pinned');
assert(
  (html.match(/\bintegrity="sha384-/g) || []).length >= 2,
  'external Leaflet assets must use Subresource Integrity',
);

console.log('PUBLIC ASSET TESTS PASSED');
