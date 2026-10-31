# dsh-gridcraft

[中文](README.zh.md)

GridCraft spreadsheet plugin for DeepSeek Harness: embed the official
[GridCraft](https://github.com/storytold/gridcraft) web build in a
**right-sidebar** tab, open workspace spreadsheets into it, and save/export
back through the host.

## What it does

- **Right-sidebar tab** — the `Spreadsheets` guide card in the right sidebar
  opens a blank page tab; `keepMounted` preserves the iframe and its workbook
  state across tab switches, sidebar collapse and Session changes. All plugin
  copy (toolbar, status, tab title, guide card) is bilingual zh/en and follows
  the host's interface language live. The embedded GridCraft app itself ships
  19 languages (Chinese included): the plugin writes the host language into
  the same-origin `localStorage['gridcraft.ui'].language`, and the app picks
  it up on its next boot (a running iframe does not hot-switch; a language
  changed inside the app is overwritten by the host language on the next DSH
  reload).
- **Default opener for spreadsheets (switch on the plugin's page)** — the plugin claims
  `dsh-resource://file/` addresses of `xlsx / xls / csv / tsv / ods` at the
  `extension` band: clicking a conversation file card, an inline file mention,
  an @file reference or a Files-sidebar row opens it straight in a GridCraft
  tab (clicking the same file again reveals the existing tab; after a file is
  regenerated, clicking it reloads the new bytes in place). The bundle's own
  detail page (Plugins → dsh-gridcraft-plugin) carries an
  `Open spreadsheets with GridCraft by default` switch below the description
  (`plugins.bundle.config` slot + the host half's `Config` schema): off sends
  those entries back to the built-in preview and hides the
  card button; the write reaches the client's routing live (the plugin fiber
  restarts once). The card's
  WPS icon + ▼ menu is the OS "open with" picker (queried from the OS; plugins
  cannot join it), but the card's action area gains an `Open in Spreadsheets`
  button that resolves the card's coordinates through
  `/api/dsh-gridcraft/resolve` into the declared path and opens the address.
- **Open workspace files** — the panel scans the selected Session's workspace
  (via `remote.workspaceFiles`) for `xlsx / xls / csv / tsv / ods` files and
  opens them into GridCraft through the official `gridcraft:open` postMessage
  bridge.
- **Save / export through the host** — GridCraft's own Save, Save As and
  Export PDF arrive as `gridcraft:save` posts; the panel writes the bytes into
  the owning Session's workspace through the plugin's HTTP route
  (`POST /api/dsh-gridcraft/save`), which resolves the real workspace root
  from the live Session header, containment-checks the path and writes
  atomically (temp file + rename).
- **Session scope** — the toolbar defaults to the Session currently shown in
  the main view; a dropdown switches to any other Session with a workspace.
- **Dirty state + reveal** — a dot mirrors the app's `gridcraft:dirty`, and a
  button reveals the open file in the OS file manager
  (`session.openWorkspacePath`).

## Install / build

```sh
# one-time: fetch the official web build into static/ (not in git)
npm install
npm run fetch-gridcraft

# build both halves
npm run build

# host-side unit tests (path containment, save/static routes)
npm test

# install into a profile
dsh plugin --profile web add link:<path-to-this-plugin>
```

`static/` holds the upstream `gridcraft-web-<v>.zip` contents (MIT OR
Apache-2.0, © ArtCraft Team). The plugin embeds the unmodified official build;
per upstream brand rules the ArtCraft marks stay inside the app UI only.

## Architecture

```
panel (client)                       host routes
┌──────────────────────────┐   GET   /api/dsh-gridcraft/app/*   ← static/ build
│ SpreadsheetPanel         │   POST  /api/dsh-gridcraft/save    ← atomic write
│  toolbar + iframe        │
│  bridge.ts (postMessage) │   workspace reads go through the standard
└──────────────────────────┘   remote.workspaceFiles namespace
```

- Host half: `index.ts` (mount), `routes.ts` (static + save + presented
  coordinate resolve), `types.ts`.
- Client half: `src/client/` — `index.tsx` (two-stage right-sidebar tab
  registration + file-card button), `SpreadsheetPanel.tsx` (toolbar + iframe +
  bridge), `TabTitle.tsx` (live tab title), `OpenInGridcraft.tsx` (file-card
  button), `address.ts` (resource address parse/build), `bridge.ts` (wire
  shapes), `api.ts` (workspace scan + save fetch), `locales.ts`,
  `gridcraft.css`.
- `scripts/fetch-gridcraft.mjs` — downloads/extracts the release zip,
  flattening one nested folder level if needed; idempotent (`--force`
  re-downloads).

### Save-path rules

- Same extension as the open file → overwrite that file.
- Different extension (e.g. Export PDF from an `.xlsx`) → sibling file next to
  it, named by the app's posted name.
- Nothing open → the panel asks for a workspace-relative path (the inline
  save-as bar).

## Known limitations

- The bridge is file-level: no cell-level read/write API exists upstream.
- Every opened file keeps its own tab (one WASM instance each); `keepMounted`
  retains them in the background.
- `remote.workspaceFiles.readBytes` caps complete files at 32 MiB.
- The web app needs `application/wasm` served with the HTML (this host does)
  and HTTPS or localhost for WebGPU/clipboard; the iframe URL forces the
  WebGL2 backend (`?webgl`) because WebGPU is unavailable in some embedded
  webviews.
- The plugin's HTTP routes follow the existing dsh-plugin posture (no extra
  auth layer of their own).
