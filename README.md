# Praxium Global Network Map

A polished, accessible Leaflet experience for showing the Praxium Learning Foundation's allies, partners, locations, focus areas, and mapped relationships. The public map is intentionally static so it can be hosted on GitHub Pages and embedded safely in Squarespace or another website builder.

## Architecture

The repository has three related surfaces:

1. **Public impact map** — GitHub Pages
   - `organization-network-map.html` — semantic page structure and metadata
   - `praxium-tokens-v2.css` — shared Praxium paper/ink/clay design tokens
   - `map.css` — responsive visual system for desktop, mobile, and iframes
   - `map.js` — map interactions, filters, theme, status handling, and embed API
   - `network-data.js` — reusable validation, normalization, metrics, and connection de-duplication
   - `categories.json` / `categories.legacy.js` — canonical categories and the `file://` fallback
2. **Board publishing admin** — currently implemented for Vercel Functions
   - `admin/` — passphrase login and form-driven editor
   - `api/` — authentication, Gist publishing, and geocoding functions
3. **Offline/bulk editor**
   - `admin-editor/` — browser-based JSON editor
   - `electron/` — desktop wrapper and native file operations

Organization records continue to live in the public GitHub Gist configured by the `praxium-data-url` meta tag in `organization-network-map.html`.

`praxium-contrast-comparison.html` is the retained design rationale for the
accessible clay split: `#A3826C` remains the recognizable display/decorative
color, while `#85624B` is used for small interactive text and button fills.

## What the public map now communicates

- A branded impact narrative instead of a utility-only map
- Live counts for organizations, focus areas, locations/countries, and mapped relationships
- Search and category filtering with visible result counts and empty states
- Clickable, keyboard-accessible organization cards and map markers
- De-duplicated relationship lines, including support for one-way legacy connection data
- Secure popup rendering: untrusted Gist content is inserted as text, not executable HTML
- Website-matching light mode by default, an optional token-consistent dark
  mode, full-network reset, mobile explorer drawer, legend, and expand control
- Website-aligned Epilogue/Poppins typography, warm paper/ink surfaces, accessible
  clay interactions, and the same asymmetric field shape used by the main site
- Last-known-good local cache plus clear stale/error messages when the Gist is unavailable
- Parent-page messages for iframe integrations and a stable `window.praxiumNetwork` API

The current live data has no mapped connections, so connection metrics and the relationship key stay hidden until the board records real relationships. This avoids claiming impact that the dataset does not yet support.

## Local development

Node.js 22.12+ is required for the current Electron toolchain. The public map
itself has no build step.

```bash
# If you use nvm, this selects the version recorded in .nvmrc
nvm use

# Install the locked dependencies
npm ci

# Validate JavaScript syntax and run all automated tests
npm run validate

# Build an unpacked desktop app for the current platform
npm run pack

# Serve the repository with any static web server, then open the map page
python3 -m http.server 8000
# http://localhost:8000/organization-network-map.html
```

Opening with `file://` is not recommended because browsers may block JSON requests. The map can still use `categories.legacy.js` as a category fallback in that environment.

## Public data model

Each Gist entry should follow this shape:

```json
{
  "id": 1,
  "name": "Organization name",
  "location": "City, region, country",
  "country": "Canada",
  "coordinates": [49.2827, -123.1207],
  "category": "Non-Profit",
  "description": "Public-facing description of the organization.",
  "relationship": "Optional explanation of how this organization and Praxium work together.",
  "contact": {
    "website": "https://example.org/",
    "email": "optional@example.org",
    "phone": "+1 555 555 5555"
  },
  "connections": [2, 3]
}
```

### Field guidance

- `id` must be a unique positive integer.
- `coordinates` must be `[latitude, longitude]` within valid ranges.
- `category` should come from `categories.json` unless a deliberate custom category is needed.
- `country` is optional but recommended. When more than one explicit country is present, the impact card reports countries; otherwise it conservatively reports unique locations.
- `relationship` is optional but highly recommended. It turns a directory entry into an impact story by explaining the actual collaboration.
- `connections` contains organization IDs. The web admin keeps these links reciprocal, but the public map also handles one-way legacy links and draws each pair only once.
- Website links are limited to `http`/`https`; malformed or unsafe schemes are ignored.

Invalid individual records are skipped without taking down the entire map. Unknown/self/duplicate connections are ignored, and warnings are surfaced without exposing technical details to visitors.

## Publishing the public map with GitHub Pages

`.github/workflows/static.yml` deploys only the public assets on changes to `main`:

- `organization-network-map.html` (also copied to `index.html`)
- `praxium-tokens-v2.css`
- `map.css`
- `map.js`
- `network-data.js`
- `categories.json`
- `categories.legacy.js`

The admin UI, serverless functions, local sample data, and repository files are not included in the Pages artifact.

Production URLs:

```text
https://praxiumlearningfoundation.github.io/interactive_map/
https://praxiumlearningfoundation.github.io/interactive_map/organization-network-map.html
```

Use pull requests rather than pushing feature work directly to `main`; CI validates JSON, checks JavaScript syntax, and runs the public-map and API tests before merge.

## Embedding in Squarespace or another site

Recommended embed:

```html
<iframe
  src="https://praxiumlearningfoundation.github.io/interactive_map/"
  title="Praxium Global Network of allies and partners"
  width="100%"
  height="720"
  loading="lazy"
  allow="fullscreen"
  style="display:block;width:100%;border:0;border-radius:20px;overflow:hidden;"
></iframe>
```

Notes:

- `allow="fullscreen"` lets the phone expand control use the browser Fullscreen API where the host permits it.
- If a host blocks fullscreen, the control still expands within the iframe viewport.
- Give the embed enough height to show the story and explorer comfortably (roughly 650–800 px on desktop). The mobile design intentionally prioritizes the map and opens the organization explorer as a drawer.
- Keep the iframe title; it identifies the map for screen-reader users.

The map emits optional parent-window messages with `source: "praxium-network-map"` and these types:

- `ready` — data has finished loading
- `selection` — an organization was selected or cleared
- `resize` — the map shell's measured height changed

A host page may listen for those events if it wants custom analytics or iframe resizing. Because `postMessage` cannot safely guess the final production parent origin, receiving pages should always validate `event.origin` and `event.data.source` before acting.

## Public JavaScript API

Available after `map.js` loads:

```js
await window.praxiumNetwork.ready;
window.praxiumNetwork.getMetrics();
window.praxiumNetwork.selectOrganization(3);
window.praxiumNetwork.resetView();
window.praxiumNetwork.exportData();
window.praxiumNetwork.importData(jsonStringOrArray);
window.praxiumNetwork.addOrganization(organizationObject);
```

The original `exportData`, `importData`, and `addOrganization` entry points remain available for compatibility.

## Updating data

### A. Web admin — recommended for routine edits

The `/admin` interface lets a board member log in, create/edit/delete organizations, geocode addresses, select relationships by organization name, and publish to the Gist without seeing JSON or a GitHub token.

Required environment variables:

- `GITHUB_PAT` — Gist read/write token; never expose it to browser code
- `GIST_ID` — production Gist ID
- `ADMIN_PASSPHRASE` — shared board passphrase
- `SESSION_SECRET` — random 32+ byte cookie-signing secret

Current implementation details:

- Signed, secure, `HttpOnly`, `SameSite=Strict` session cookie
- Passphrase attempt limiting
- Server-side validation of required fields, URLs, categories, and coordinate ranges
- Server-side Nominatim geocoding throttle
- Optimistic concurrency using the Gist version (`409` on stale edits)
- Reciprocal relationship maintenance and deleted-ID cleanup
- Mocked-Gist API tests in `test/api.test.js`

### B. Offline or bulk editor

Open `admin-editor/index.html` through a local server or run the Electron app:

```bash
npm install
npm start
```

The editor supports paste/load, form editing, copy, and JSON download. Packaged desktop builds are configured through Electron Builder.

### C. Direct Gist edit — emergency fallback

The data URL points to the stable latest Gist path. Saving a valid edit to the production Gist makes it available to the map on the next refresh without redeploying the public site.

## Azure migration path for the admin

GitHub Pages remains a good fit for the public map: it is static, free, versioned, and does not expose the admin backend. Migrate only the authenticated admin/API unless there is a separate reason to move the public map.

As of September 5, 2026, Microsoft documents a $2,000 USD annual Azure grant
for eligible nonprofits. It must be renewed, unused credit does not roll over,
and use beyond the grant can become pay-as-you-go. Add a budget and alerts
before deploying production resources.

A practical Azure target is:

1. **Azure Static Web Apps** for `admin/` and the serverless API, deployed from the same GitHub repository.
2. Keep the existing Gist as the first migration milestone so the public map URL and data contract do not change.
3. Store `GITHUB_PAT`, `GIST_ID`, `ADMIN_PASSPHRASE`, and `SESSION_SECRET` in Azure application settings (or Key Vault when the nonprofit environment is ready).
4. Port the Vercel-style request/response adapters in `api/` to Azure Functions handlers while preserving the tested validation/publishing functions.
5. Replace the shared passphrase with Microsoft Entra ID and restrict access to the Praxium tenant or an explicit administrator role.
6. Validate login, Gist read, geocoding, create/update/delete, and the deliberate two-tab conflict test in a staging environment.
7. Cut the admin URL over only after the staging checklist passes; the public GitHub Pages iframe can stay unchanged.

A later phase could move structured data from a Gist to Azure Storage or
Cosmos DB when Praxium needs richer audit, reporting, or approval workflows.
That is an operational upgrade, not a prerequisite for presenting the network
professionally.

See `docs/PROFESSIONALIZATION_ROADMAP.md` for the full content, security,
acceptance-testing, cost-control, and cutover plan.

## Testing and CI

```bash
npm run check       # JavaScript syntax checks
npm test            # network-data and mocked API tests
npm run validate    # both of the above
```

GitHub Actions:

- `.github/workflows/ci.yml` — validation on pull requests and `main`
- `.github/workflows/static.yml` — public Pages deployment
- `.github/workflows/build-release.yml` — Electron release artifacts

## Security and operational notes

- Never commit tokens, recovery codes, signing keys, or `.env` files. The repository `.gitignore` excludes the known local secret files.
- The public map treats Gist content as untrusted input and avoids `innerHTML` for organization-provided values.
- The local cache is availability fallback only; visitors are explicitly told when cached data is being shown.
- OpenStreetMap tiles require visible attribution, which remains on the map.
- Nominatim's public service is appropriate for low-volume board edits, not bulk geocoding.
- Before publishing a new impact number, make sure the supporting fields are actually maintained in the data. The interface intentionally computes only defensible metrics.

## Recommended next content step

The biggest remaining opportunity is not another animation or visual effect; it is richer verified data. For each organization, add:

- explicit `country`
- a concise `relationship` statement
- real `connections` where a documented partnership exists
- current website and description

Those fields will let the same interface truthfully communicate global reach, collaboration density, and how Praxium's network creates impact.
