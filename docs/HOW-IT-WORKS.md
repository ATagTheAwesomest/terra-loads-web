# How terra-loads-web works

Detail for anyone changing the app. Setup is in the [README](../README.md).

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | App shell: header stats, workspace, loads drawer, dialogs |
| `css/app.css` | Dark industrial theme, 48px+ tap targets, print base |
| `js/app.js` | Boot, rendering, loads drawer, new-load flow, update UI |
| `js/check.js` | Truck check logic: matches check scans to the load's pieces |
| `js/check-ui.js` | Truck check screen: checklist, extras, undo and start over |
| `js/mobile.js` | Phone layout toggle and its own stack/row markup (`css/mobile.css`) |
| `js/manage.js` | Manage Loads screen: job numbers, open, export, hold-to-delete |
| `js/drag.js` | Dragging a row between stacks, and always cleaning up its floating copy |
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
the Manage Loads screen. Jobs in `NO_SEQUENCE_JOBS` (26111) show no sequences.

A mark is only unique within a job, so every lookup is job plus mark. The
master list may carry a `Job` column (`26123` or `26123 - 25-418`); rows with
no job, like the current file, match a mark on any job.

## Truck check

Menu → **Truck check** turns the open load into a checklist. Each scan checks
off one piece with the same job and mark; a scan with nothing left to check
off shows red and is listed under Extras. The check is saved on the load as
`truckCheck { startedAt, updatedAt, scans: [{ id, mark, manual, scannedAt }] }`;
which piece each scan ticks is worked out on every read, so editing the load
afterwards never leaves a stale check. Hold a row's undo button 1.5 s to
uncheck it, or **Start over** 4 s to clear the check. Printed tickets fill the
✓ column from the check.

## Phone layout

Menu → **Phone layout** switches this device to a separate phone layout
(`js/mobile.js` + `css/mobile.css`, all scoped under `body.layout-mobile`).
It turns on by itself the first time on a phone-sized screen.

## Storage

`store.saveLoad(load)` writes the whole load to a localStorage journal
synchronously, then commits it to IndexedDB and clears the journal entry. On
launch, `store.recover()` replays any journal entry newer than its IndexedDB
copy, so a tab killed mid-save loses nothing. Without IndexedDB (some private
modes) the journal is the store.

## Master parts list

`data/master_parts.csv` is the fabrication export as-is (`Main Mk`, `Shape`,
`Dimension`, `Length`, `Grade`, `Qty`, `Ref #`, `Assembly Weight` like
`581.48#`). Each row shows size, length, grade and ref, uses the assembly
weight, and shows a running "2 of 4" count against `Qty` (red when over).
A plain `Mark,Description,Weight` list also works.

To update it, overwrite `data/master_parts.csv` with a new export and bump the
version. `tests/fixtures/sample_parts.csv` is the small list the tests use.
