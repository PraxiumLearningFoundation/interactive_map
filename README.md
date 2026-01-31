# Praxium Interactive Network Map

Professional documentation for the Praxium interactive map project.

**Purpose**

This repository contains a small, static front-end interactive map (Leaflet) that visualizes organizations and their connections. The map is data-driven: organization data is stored as a single JSON array and can be updated by an administrator using the included admin JSON editor.

**Contents**

- `organization-network-map.html` — Primary embeddable interactive map page. Loads data from `DATA_URL` (configurable in the file) and renders markers, connections, legend, and filters. Supports light/dark tile layers and a programmatic API (`window.praxiumNetwork`).
- `organization-network-map.json` — Example/sample dataset (array of organization objects).
- `organization-map.html` — Alternate map layout (if present); similar behavior and data loading.
- `admin-editor/` — Small static admin UI to edit, paste, load, and export the JSON dataset.
  - `admin-editor/index.html` — Admin UI page.
  - `admin-editor/app.js` — Editor logic: parsing, edit/add/delete, copy/download JSON.
  - `admin-editor/styles.css` — Editor styling.
  - `admin-editor/README.md` — Quick local instructions for admin editor.
- `categories.json` — Canonical categories list used by the admin editor and map to keep category names consistent and ordered.


Getting started (local testing)

1. Open a simple static HTTP server from the project root. Many browsers block cross-file fetches when opening `file://`.

- Python 3 (recommended):

```powershell
# from project root
python -m http.server 8000
# then open http://localhost:8000/organization-network-map.html
```

- Node (http-server):

```bash
npm install -g http-server
http-server -p 8000
```

2. Open `http://localhost:8000/organization-network-map.html` in your browser.

3. To test the admin editor, open `http://localhost:8000/admin-editor/index.html`.


Admin workflow (update data)

There are two main ways to update the dataset the map uses:

A) Manual Gist / hosted file update (recommended for production)
- Host the JSON file (for example: a GitHub Gist or GitHub Pages, Netlify, or any static host) and set the `DATA_URL` constant at the top of `organization-network-map.html` to the raw URL of that JSON.
- Update the hosted JSON when you need to change the dataset.
- Note: If you use GitHub raw URLs, some browsers will block cross-origin requests — using GitHub Pages, Netlify, or another host that sets appropriate CORS headers is recommended.

B) Admin editor (generate/prepare JSON locally)
- Open `admin-editor/index.html`, paste or load your dataset into the left textarea, click `Parse & Preview`.
- Use the editor UI to Add/Edit/Delete organizations. When finished, use `Copy JSON` or `Download JSON` to get the updated JSON.
- Paste or upload the exported JSON to your hosted location (Gist/Pages) used by `DATA_URL`.

Notes on categories
- `categories.json` defines the canonical category list used by the admin editor and the map. The admin editor pre-selects canonical categories and supports a `Custom...` option for one-off values.
- The map reads this file (when available) to order the legend and filter options and to assign the 20-color palette deterministically.

Embedding on Squarespace (or other website builders)

- The project is a static HTML page. To embed into a Squarespace page, you have two common approaches:
  1. Host `organization-network-map.html` on a static host (GitHub Pages, Netlify, etc.) and use Squarespace’s Embed block or an iframe to embed the hosted page. Example iframe:

```html
<iframe src="https://your-host.example/organization-network-map.html" width="100%" height="600" style="border:0;"></iframe>
```

  2. Copy the map page HTML into a Code Block (if your site supports full HTML/JS injection) — typically not recommended because of third-party restrictions and script sanitization.

- Recommended: host the files (HTML, categories.json, JSON data) somewhere reliable (GitHub Pages or similar) and embed via iframe in Squarespace.

Developer notes

- DATA_URL: The map page looks for a `DATA_URL` constant near the top of `organization-network-map.html`. Set that to the raw JSON URL of your hosted dataset.

- window.praxiumNetwork API (available on the map page):
  - `window.praxiumNetwork.exportData()` → returns JSON string of current data
  - `window.praxiumNetwork.importData(jsonString)` → imports and reloads data
  - `window.praxiumNetwork.addOrganization(org)` → adds an org object and returns new id

- Colors and categories:
  - The map uses a 20-color palette and assigns colors deterministically based on the ordered category list.
  - `categories.json` controls canonical ordering and is used by both the admin editor and the map.

- Dark mode: the map supports a dark tile layer and a toggle; it also slightly adjusts marker colors for improved contrast in dark mode.

- CORS: If the hosted JSON or `categories.json` is served without permissive CORS headers, the browser may block fetch requests. Use a static host that sets appropriate headers (GitHub Pages, Netlify) or host on the same domain as your site to avoid CORS issues.

Troubleshooting

- Map shows no points:
  - Confirm `DATA_URL` is set correctly and returns a JSON array of organizations.
  - Check browser devtools network tab for fetch errors (CORS, 404).

- Admin Editor does not load sample:
  - When running from `file://`, fetch may be blocked. Run a local HTTP server (see above) or use the file input or paste JSON into the editor.

- Category mismatches:
  - If legacy data uses inconsistent category spellings (e.g., "Non Profit" vs "Non-Profit"), use the admin editor to normalize the values or update `categories.json` to include expected variants. I can add an automatic mapping to canonical names on import if preferred.

Contributing / Extending

- To change the canonical categories, edit `categories.json`. Both the admin editor and the map will read it and use the updated list when loaded.
- To change the color palette, edit the `COLOR_PALETTE` array in `organization-network-map.html`.
- To add server-side publishing (automatic Gist updates), implement a simple server or GitHub Action to commit/replace the hosted JSON after admin edits.

Contact / Next steps

If you want, I can:
- Add an automatic mapping layer to canonicalize common legacy category variants during import.
- Add a tiny server-side helper (GitHub Action) to update a Gist from the admin editor output.

---

## Desktop Application (Electron)

The admin editor can be packaged as a standalone desktop application using Electron.

### Download Pre-built Releases

**No installation of Node.js or Python required!**

Download the latest release for your platform from the [Releases page](https://github.com/PraxiumLearning03/interactive_map/releases):

| Platform | Download |
|----------|----------|
| Windows | `Praxium-Map-Editor-x.x.x-Windows.exe` (installer) or `...-Portable.exe` |
| macOS | `Praxium-Map-Editor-x.x.x-macOS.dmg` |
| Linux | `Praxium-Map-Editor-x.x.x-Linux.AppImage` or `.deb` |

### For Developers

If you want to run from source or build locally:

```bash
# Install dependencies
npm install

# Run the desktop app in development mode
npm start
```

### Building Installers Locally

```bash
# Build for current platform
npm run dist

# Build for specific platforms
npm run dist:win    # Windows (.exe installer)
npm run dist:mac    # macOS (.dmg)
npm run dist:linux  # Linux (.AppImage)
```

Built packages will be output to the `dist/` folder.

### Desktop App Features

- Native file dialogs for opening/saving JSON files
- Menu bar with keyboard shortcuts (Ctrl+O, Ctrl+S, etc.)
- Load sample data from bundled file
- Cross-platform support (Windows, macOS, Linux)

### Creating a New Release

1. Update the version in `package.json`
2. Commit your changes
3. Create and push a tag:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
4. GitHub Actions will automatically build and attach installers to the release

See [electron/README.md](electron/README.md) for more details.

---
README generated on December 27, 2025.
