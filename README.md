# Praxium Interactive Network Map

Professional documentation for the Praxium interactive map project.

**Purpose**

This repository contains a small, static front-end interactive map (Leaflet) that visualizes organizations and their connections. The map is data-driven: organization data is stored as a single JSON array and can be updated by an administrator using the included admin JSON editor.

**Contents**

- `organization-network-map.html` — Primary embeddable interactive map page. Loads data from `DATA_URL` (configurable in the file) and renders markers, connections, legend, and filters. Supports light/dark tile layers and a programmatic API (`window.praxiumNetwork`).
- `organization-network-map.json` — Example/sample dataset (array of organization objects).
- `organization-map.html` — Alternate map layout (if present); similar behavior and data loading.
- `admin-editor/` — Small static admin UI to edit, paste, load, and export the JSON dataset (offline/bulk-edit path — see "Admin workflow" below).
  - `admin-editor/index.html` — Admin UI page.
  - `admin-editor/app.js` — Editor logic: parsing, edit/add/delete, copy/download JSON.
  - `admin-editor/styles.css` — Editor styling.
  - `admin-editor/README.md` — Quick local instructions for admin editor.
- `admin/` — Web-based board admin (recommended path): passphrase login, add/edit/delete organization form with geocoding, publishes straight to the Gist. Deployed as its own Vercel project — see "Board publishing admin (Vercel)" below.
- `api/` — Vercel serverless functions backing `admin/`: `auth.js`, `gist.js`, `geocode.js`, `publish.js`, `logout.js`, plus shared helpers in `api/_lib/`.
- `test/api.test.js` — Functional tests for the `/api` functions against an in-memory fake Gist (run with `node test/api.test.js`; also runs in CI).
- `categories.json` — Canonical categories list used by the admin editor, the web admin, and the map to keep category names consistent and ordered. `categories.js` / `categories.legacy.js` are auto-generated from it.


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

There are three ways to update the dataset the map uses, in order of recommendation:

A) Web admin (recommended for routine, single-organization edits)
- A board member goes to the deployed `/admin` page (see "Board publishing admin (Vercel)" below), logs in with the shared passphrase, and uses a simple form (name, website, address, category, description, contact, connections) to add, edit, or delete an organization.
- The address is automatically geocoded to a map pin (editable/draggable if the match is off).
- No JSON, no GitHub UI — the board member just clicks Publish and the change goes live on the map within moments.

B) Electron desktop admin editor (offline use or bulk edits)
- Open `admin-editor/index.html` (or the packaged desktop app — see "Desktop Application" below), paste or load your dataset, click `Parse & Preview`.
- Use the editor UI to Add/Edit/Delete organizations. When finished, use `Copy JSON` or `Download JSON` to get the updated JSON.
- Paste or upload the exported JSON to your hosted Gist. Useful when you're offline, or doing a large batch of edits where going through the web admin's geocoding/publish round-trip per organization would be slow.

C) Manual Gist edit (emergency fallback)
- Edit the Gist's JSON directly at gist.github.com. `DATA_URL` in `organization-network-map.html` points at the Gist's stable "latest" raw URL, so any edit saved there appears on the map automatically (no need to update `DATA_URL` again).

Notes on categories
- `categories.json` defines the canonical category list used by the admin editor and the map. The admin editor pre-selects canonical categories and supports a `Custom...` option for one-off values.
- The map reads this file (when available) to order the legend and filter options and to assign the 20-color palette deterministically.
- `categories.js` and `categories.legacy.js` are auto-generated from `categories.json` — don't hand-edit them, regenerate them from `categories.json` instead.

Board publishing admin (Vercel)

The `/admin` page and its backing `/api` functions are a separate deployment from the public map (the map keeps its existing hosting/URL unchanged). Deploy this repo as its own Vercel project to get a working board admin.

Setup:
1. In the Vercel dashboard, import this GitHub repo as a new project. Vercel auto-detects the `/api/*.js` files as serverless functions and serves `/admin/*` as static files; `vercel.json` at the repo root disables the install step (the functions use only Node built-ins, no dependencies) and redirects `/` to `/admin`.
2. Set these Environment Variables on the Vercel project (Project Settings → Environment Variables), scoped to Production (and Preview if you want PR preview deployments to work):
   - `GITHUB_PAT` — a GitHub personal access token scoped to **gist read/write only** (fine-grained token, gist scope), used to read and update the Gist. Never commit this token or put it in client-side code.
   - `GIST_ID` — the Gist's ID, e.g. `a139fdb216bcc3e91b67754c283f3805`.
   - `ADMIN_PASSPHRASE` — the shared passphrase board members use to log in to `/admin`.
   - `SESSION_SECRET` — a random 32+ byte string used to sign the admin session cookie (e.g. `openssl rand -hex 32`). Keep this distinct from the passphrase.
3. Deploy. Visit `https://<your-vercel-project>.vercel.app/admin`, log in with the passphrase, and confirm the organization list loads from the Gist.

How it works:
- `/api/auth` checks the passphrase (rate-limited) and issues a short-lived, signed, `HttpOnly` session cookie — no per-user accounts.
- `/api/gist` (session required) reads the current Gist contents plus `categories.json`, to populate the admin's org list and category dropdown.
- `/api/geocode` (session required) proxies address lookups to OpenStreetMap Nominatim server-side, so the browser never calls Nominatim directly.
- `/api/publish` (session required) re-fetches the Gist fresh, checks the client's `expectedVersion` against it (returns `409` if the Gist changed since the client last loaded it — reload and reapply rather than risk overwriting a concurrent edit), validates the submitted organization, applies create/update/delete (including keeping `connections` symmetric between linked organizations, and stripping a deleted organization's ID out of every other organization's `connections`), and writes the result back to the Gist.
- The `GITHUB_PAT` and `SESSION_SECRET` never leave the server — they're read from environment variables inside the `/api` functions and are never sent in any response to the browser.
- Run `node test/api.test.js` to exercise the publish/auth/gist logic against an in-memory fake Gist (no real GitHub calls, safe to run anytime); this also runs in CI on every push/PR.

Embedding on Squarespace (or other website builders)

- The project is a static HTML page. To embed into a Squarespace page, you have two common approaches:
  1. Host `organization-network-map.html` on a static host (GitHub Pages, Netlify, etc.) and use Squarespace’s Embed block or an iframe to embed the hosted page. Example iframe:

```html
<iframe src="https://your-host.example/organization-network-map.html" width="100%" height="600" style="border:0;"></iframe>
```

  2. Copy the map page HTML into a Code Block (if your site supports full HTML/JS injection) — typically not recommended because of third-party restrictions and script sanitization.

- Recommended: host the files (HTML, categories.json, JSON data) somewhere reliable (GitHub Pages or similar) and embed via iframe in Squarespace.

GitHub Pages hosting (built in)

- `.github/workflows/static.yml` automatically publishes the map to GitHub Pages on every push to `main` that touches `organization-network-map.html`, `categories.json`, or `categories.legacy.js`.
- It only publishes those three files — **not** the whole repo — so `/admin` and `/api` (which have no backend to run on static Pages anyway) are never exposed there.
- Once enabled (Settings → Pages → Source: GitHub Actions, already configured for this repo), the map is live at:

```
https://praxiumlearningfoundation.github.io/interactive_map/organization-network-map.html
```

- Use that URL directly in the iframe example above as another hosting option alongside wherever the map is already embedded.

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

- To change the canonical categories, edit `categories.json`. The admin editor, the web admin, and the map will all read it and use the updated list when loaded (regenerate `categories.js`/`categories.legacy.js` from it — see "Notes on categories" above).
- To change the color palette, edit the `COLOR_PALETTE` array in `organization-network-map.html`.
- Server-side publishing (automatic Gist updates from the board admin) is implemented — see "Board publishing admin (Vercel)" above.

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
