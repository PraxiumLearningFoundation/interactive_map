# Praxium Network — Admin JSON Editor

> **Board members: use the web admin instead** —
> https://wonderful-field-0cd14c010.1.azurestaticapps.net/admin/ (Microsoft sign-in).
> It publishes straight to the map, supports tags, and needs no JSON.
> This editor is the offline/bulk fallback, also packaged as the
> "Praxium Map Editor" desktop app (see the GitHub Releases page).

Simple, self-contained frontend to edit the `organization-network-map.json` data that feeds the interactive map.

How to use
- Open `admin-editor/index.html` in your browser (no server required, but for cross-file fetch some browsers block local fetches; use the file input or paste clipboard JSON if needed).
- Paste your current JSON into the left textarea or use the file input to load a file.
- Click `Parse & Preview` to populate the editable list.
- Use `Edit` on any card to change fields, or `Add Organization` to create a new
  one. The form preserves country, contact details, and the public "How Praxium
  Connects" impact note.
- Click `Copy JSON` to copy the updated JSON to your clipboard, or `Download JSON` to save locally.
- Paste the copied/downloaded JSON into your Gist to update the map data
  (emergency use only; the web admin is the normal path).

Notes
- This tool is offline-first and does not upload anything to a server.
- Connections are maintained as arrays of numeric IDs; use comma-separated IDs
  when editing. The editor keeps valid relationships reciprocal and removes
  references when an organization is deleted.
