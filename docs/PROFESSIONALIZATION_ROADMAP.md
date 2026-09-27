# Praxium Network Professionalization Roadmap

Last reviewed: September 6, 2026

## Goal

Present a credible, human-centered picture of Praxium's reach while keeping the
publishing workflow simple for board members and inexpensive to operate.

The guiding rule is: **show only impact that the data can support**. The
interface may be visually ambitious, but organization counts, countries,
relationships, and stories must remain verifiable.

## Current architecture

| Surface | Current role | Recommended direction |
| --- | --- | --- |
| GitHub Pages | Public, embeddable map | Keep it. Static hosting is an appropriate low-cost boundary for public content. |
| GitHub Gist | Public organization dataset | Keep during the first Azure migration so the public data contract does not change. |
| Vercel deployment | Board admin and Node serverless handlers | Migrate the authenticated admin/API to Azure after staging tests pass. |
| Electron editor | Offline and bulk-edit fallback | Retain as a recovery path, not the primary board workflow. |

## Improvements implemented on this branch

### 1. Professional public experience

- Reframed the map as an impact and partnership story rather than a technical
  directory.
- Added a branded, responsive visual system that works as a full page or iframe.
- Aligned the visual system with the foundation website's shared paper, ink,
  clay, Epilogue, Poppins, spacing, focus, button, and form-field tokens.
- Added data-derived organization, focus-area, place, and relationship metrics.
- Added a mobile-first map experience with an explorer drawer, legend, and
  expand/fullscreen behavior.
- Improved organization cards and popups with clear visual hierarchy and
  optional "How Praxium Connects" context.

### 2. Trust and accessibility

- Organization-provided values are rendered with DOM text nodes instead of
  executable HTML.
- Unsafe website schemes and invalid organization records are ignored.
- Keyboard focus, labels, result announcements, reduced-motion handling, and
  touch targets are included.
- Stale cached data is clearly identified instead of silently presented as live.
- Leaflet CDN files are version-pinned and protected with Subresource Integrity.
- A restrictive Content Security Policy limits executable and network resources.

### 3. Data quality and relationships

- A shared data utility normalizes categories, coordinates, IDs, contacts, and
  relationships.
- Connection pairs are de-duplicated even when older data records only one side
  of a relationship.
- Unknown, duplicate, and self-referential relationships are rejected or
  safely ignored.
- The web and offline editors can now maintain `country`, `relationship`,
  email, phone, and reciprocal relationship data.

### 4. Delivery quality

- Public CSS, JavaScript, and data utilities are separate assets instead of one
  large inline HTML file.
- GitHub Pages deploys only the assets required by the public map.
- CI checks the new JavaScript files and runs public data and API tests.
- Local `npm run validate` runs syntax checks and all test suites.

## Content work that unlocks the strongest impact story

The live data should be enriched before adding more claims or dashboards.

1. Add an explicit `country` to every organization.
2. Write a short, factual `relationship` statement describing the shared
   project, referral, learning activity, or collaboration.
3. Add `connections` only where a relationship can be substantiated.
4. Standardize categories that currently describe the same sector
   (`Non-Profit` and `Not-For-Profit`, for example).
5. Review public descriptions and links at least twice per year.
6. Establish a board owner for data quality and a lightweight review date.

Once those fields are maintained, future enhancements can responsibly include:

- country-level impact totals;
- a "featured collaboration" story mode;
- relationship density and cross-sector collaboration summaries;
- a timeline of new partners;
- accessible organization detail pages that are linkable from the map;
- privacy-respecting aggregate analytics for searches and organization clicks.

## Azure migration plan

Eligible nonprofits currently receive a **$2,000 USD annual Azure grant**. The
grant must be renewed and usage beyond the credit can become pay-as-you-go, so
cost controls are part of the migration rather than an afterthought.

Official references:

- [Microsoft nonprofit offerings](https://learn.microsoft.com/en-us/industry/nonprofit/microsoft-for-nonprofits/nonprofit-offerings-products)
- [Azure grant renewal guidance](https://learn.microsoft.com/en-us/industry/nonprofit/microsoft-for-nonprofits/renew-azure-grant)
- [Azure Static Web Apps authentication](https://learn.microsoft.com/en-us/azure/static-web-apps/authentication-authorization)
- [Azure Static Web Apps application settings](https://learn.microsoft.com/en-us/azure/static-web-apps/application-settings)

### Phase A — prepare without changing production

- Confirm the nonprofit Azure sponsorship is active and note its renewal date.
- Create separate resource groups for production and staging.
- Add a conservative Azure budget and alerts well below the grant limit.
- Inventory the four existing secrets: `GITHUB_PAT`, `GIST_ID`,
  `ADMIN_PASSPHRASE`, and `SESSION_SECRET`.
- Use a test Gist in staging; never test write behavior against production data.

### Phase B — port the admin/API

- Host the `admin/` frontend in Azure Static Web Apps.
- Port the Vercel handler adapters to Azure Functions while preserving the
  already-tested validation and Gist logic.
- Keep configuration in Azure application settings. These are exposed to the
  backend as environment variables and are encrypted at rest.
- Protect admin routes and API routes with Microsoft Entra ID. Restrict sign-in
  to the Praxium tenant or an explicit administrator role rather than allowing
  any authenticated Microsoft account.
- Retain the shared passphrase only as a short-lived migration fallback, then
  remove it after Entra access is verified.

### Phase C — staging acceptance tests

- Sign in and sign out with each intended board account.
- Verify unauthorized users cannot read or call admin API routes.
- Read the test Gist and geocode a sample address.
- Create, edit, connect, disconnect, and delete a test organization.
- Open the same record in two tabs and confirm the stale tab receives a
  conflict instead of overwriting newer data.
- Confirm logs do not contain passphrases, tokens, full request bodies, or
  private contact information.
- Confirm the GitHub Pages public map still reads the unchanged Gist contract.

### Phase D — production cutover

- Configure production settings and the production Gist only after staging
  passes.
- Give the board the Azure admin URL and revoke or remove the Vercel deployment
  once a rollback window has passed.
- Keep GitHub Pages as the public iframe host; moving a static map into Azure
  provides little benefit by itself.
- Document one owner for Azure billing/renewal and one owner for map content.

### Later data-platform option

Moving from a Gist to Azure Storage, Cosmos DB, or another database should be a
separate project. It becomes worthwhile when Praxium needs approval workflows,
per-user audit history, structured reporting, media assets, or significantly
larger datasets. Do not combine that change with the initial hosting migration.

## Definition of done for the next release

- The feature branch passes `npm run validate`.
- The GitHub Pages artifact contains every referenced public asset and no admin
  or secret-bearing files.
- Desktop and phone layouts are visually checked in a real browser.
- Board members can create a record with country, relationship context, and
  named connections without editing JSON.
- The iframe uses a descriptive `title` and `allow="fullscreen"`.
- The live content owner has reviewed every public record for accuracy.
