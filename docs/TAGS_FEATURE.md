# Organization Tags (shipped in v1.1.0)

The original engineering spec, kept for reference.

## Goal
Board members can attach free-form **tags** (e.g. "youth", "literacy", "indigenous-led")
to each organization in the admin portal. The admin portal lists every tag in use.
Visitors to the public map can search by tag and filter by tag.

## Data model
Optional `tags: string[]` on each Gist record.
- Trimmed, internal whitespace collapsed, max **40** chars each, max **12** per org.
- De-duplicated case-insensitively (first spelling wins); empty array → field omitted.
- Legacy records without `tags` stay valid. A comma-separated string is accepted on read
  (defensive for hand-edited Gists) but the API always writes an array.

## Shared library — `network-data.js`
- `normalizeTags(value)` → clean array (rules above).
- `normalizeDataset` emits `tags` on every organization.
- `collectTags(orgs)` → `[{ tag, count }]` sorted by count desc then name, case-insensitive merge.

## API — `api/src/functions/publish.js`
- `validateOrgPayload`: `tags` optional; must be an array of strings; reject >12 tags,
  any tag >40 chars, or non-string entries with clear messages.
- `finalizeOrgFields`: persist normalized tags; remove field when empty. Updates without a
  `tags` key keep existing tags.
- Unit tests in `test/api.test.js`.

## Admin portal — `admin/`
- Form: "Tags" chip input. Enter/comma adds a tag, × removes it, Backspace on empty input
  removes the last one; `<datalist>` suggests tags already in use. Limits enforced in UI.
- List panel: "Tags in use" section listing every tag with its count; clicking one filters the
  organization list (click again to clear). Org cards display their tags. Admin search matches tags.
- All values rendered via `textContent`/escaping (Gist content is untrusted).

## Public map — `map.js`, `organization-network-map.html`, `map.css`
- Search matches tags (substring, case-insensitive). Placeholder mentions tags.
- New "Tag" `<select id="tag-filter">` (hidden when no org has tags) with counts; combines
  with search + focus area (AND). "Clear filters" and org selection reset it.
- Popup shows tags as buttons; clicking one applies that tag filter. Cards show up to 3 tags.
- `window.praxiumNetwork` unchanged except data now carries tags.

## Testing
- Unit: normalizeTags/collectTags/normalizeDataset; API validation/finalize.
- Playwright: admin add/remove tags, publish payload, tags-in-use list + filter; map tag
  search, tag filter, popup tag click, hidden filter when no tags. Mobile project too.

## Release
Branch `feature/org-tags` → PR → CI green → tag `v1.1.0-rc.1` → deploy to the `staging`
Azure SWA environment → Playwright review against staging admin + map.
