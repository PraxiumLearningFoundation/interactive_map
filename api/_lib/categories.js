// Reads categories.json staged into api/ by the deploy workflow and npm pretest (copied from the repo root, never committed).
const fs = require('fs');
const path = require('path');

function readCategories() {
  const filePath = path.join(__dirname, '..', 'categories.json');
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

module.exports = { readCategories };
