# TERRA-loads-web

Offline-first iPad PWA for structural steel load planning: scan marks against a
bundled master parts list, group them into stacks within a load, and export or
print the result. Plain HTML, CSS and JavaScript with no build step.

## Run locally

Any static file server works, served over `http://localhost` or HTTPS
(service workers need a secure origin):

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Install on iPad

1. Host the repo on HTTPS. GitHub Pages works: Settings → Pages → Deploy from
   branch `main`, folder `/ (root)`. All paths are relative, so it runs from
   `https://<user>.github.io/terra-loads-web/`.
2. Open the URL in Safari, wait for the footer to say **Offline ready**.
3. Share → **Add to Home Screen**. Launch from the home screen icon.

Installed PWAs keep their storage; iOS can clear site data for un-installed
Safari tabs after a week of no use, so always run it from the home screen.

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | App shell: header stats, workspace, loads drawer, dialogs |
| `css/app.css` | Dark industrial theme, 48px+ tap targets, print base |
| `js/app.js` | Boot, rendering, loads drawer, new-load flow, update UI |
| `js/manage.js` | Manage Loads screen: job numbers, open, export, hold-to-delete |
| `js/hold.js` | Press-and-hold buttons for deletes (item 1.5 s, stack 4 s, load 7.5 s) |
| `js/model.js` | Pure helpers: create loads/stacks/items, totals, sequences, job numbers |
| `js/parts.js` | Loads and parses `data/master_parts.csv`, exact-match lookup |
| `js/store.js` | Persistence: localStorage journal + IndexedDB |
| `js/updater.js` | Service worker registration, version check, Force Update |
| `sw.js` | Precaches the app shell, serves cache-first offline |
| `version.js` | The app version (single source of truth) |
| `data/master_parts.csv` | Master parts list (fabrication export, see below) |

## Data model

```
Load  { id, name, job, createdAt, updatedAt, rev, stacks: Stack[] }
Stack { id, name, items: Item[] }
Item  { id, mark, description, weight, matched, manual, scannedAt }
```

Every scan is its own item, in scan order; identical marks are never merged.
Unmatched or manually entered marks get a trailing `-` and are flagged orange.
`job` is one of `JOB_NUMBERS` in `js/model.js`, picked when the load is created;
loads saved before job numbers existed have `job: null` until one is picked on
the Manage Loads screen.

## Storage

`store.saveLoad(load)` writes the whole load to a localStorage journal
synchronously, then commits it to IndexedDB and clears the journal entry. On
launch, `store.recover()` replays any journal entry newer than its IndexedDB
copy, so a tab killed mid-save loses nothing. Without IndexedDB (some private
modes) the journal is the store.

## Releasing an update

1. Bump `self.TERRA_VERSION` in `version.js`.
2. If you added a file, add it to `PRECACHE` in `sw.js`.
3. Push to `main`.

On launch the app checks `version.js` on the server and shows a **New** badge
on **Update** when a newer version exists. **Force Update** unregisters the
service worker, clears the app caches and reloads from the network. Saved loads
are untouched, and it refuses to run while offline so the app never loses its
offline copy.

## Master parts list

`data/master_parts.csv` is the fabrication export as-is (`Main Mk`, `Shape`,
`Dimension`, `Length`, `Grade`, `Qty`, `Ref #`, `Assembly Weight` like
`581.48#`). Each row shows size, length, grade and ref, uses the assembly
weight, and shows a running "2 of 4" count against `Qty` (red when over).
A plain `Mark,Description,Weight` list also works.

To update it, overwrite `data/master_parts.csv` with a new export and bump the
version. `tests/fixtures/sample_parts.csv` is the small list the tests use.
