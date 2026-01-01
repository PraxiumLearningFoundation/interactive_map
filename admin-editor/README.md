# Praxium Network — Admin JSON Editor

Simple, self-contained frontend to edit the `organization-network-map.json` data that feeds the interactive map.

How to use
- Open `admin-editor/index.html` in your browser (no server required, but for cross-file fetch some browsers block local fetches; use the file input or paste clipboard JSON if needed).
- Paste your current JSON into the left textarea or use the file input to load a file.
- Click `Parse & Preview` to populate the editable list.
- Use `Edit` on any card to change fields, or `Add Organization` to create a new one.
- Click `Copy JSON` to copy the updated JSON to your clipboard, or `Download JSON` to save locally.
- Paste the copied/downloaded JSON into your Gist to update the map data.

Notes
- This tool is offline-first and does not upload anything to a server.
- Connections are maintained as arrays of numeric IDs; use comma-separated IDs when editing.
