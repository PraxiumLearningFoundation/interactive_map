// Reads the repo's canonical categories.json (single source of truth, see Phase 1).
const fs = require('fs');
const path = require('path');

function readCategories() {
  const filePath = path.join(__dirname, '..', '..', 'categories.json');
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

module.exports = { readCategories };
