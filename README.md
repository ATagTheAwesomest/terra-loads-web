# terra-loads-web

A standalone, offline iPad app for planning steel truck loads. Scan piece marks with a barcode
scanner, group them into stacks on a load, then export a Tekla-friendly text file or print a
shipping ticket. Everything stays on the iPad; it needs no server and no PowerFab.

Plain HTML, CSS and JavaScript, no build step. (The PowerFab-connected version, with shared stacks
across iPads, is [terra-tekla-client](https://github.com/ATagTheAwesomest/terra-tekla-client).)

## Requirements

- Any static web host on HTTPS (GitHub Pages works); `localhost` is fine for trying it
- iPad with Safari, and a barcode scanner that sends Enter after each scan (an on-screen keypad
  works too)

## Install

1. Host the repo on HTTPS. With GitHub Pages: Settings > Pages > Deploy from branch `main`, folder
   `/ (root)`. It then runs from `https://<user>.github.io/terra-loads-web/`.
2. Open that address in Safari and wait for the footer to say **Offline ready**.
3. Share > **Add to Home Screen**, and always open it from the home screen (iOS can clear the data
   of a plain Safari tab after a week without use).

## Run it on your own computer

```sh
python3 -m http.server 8000     # then open http://localhost:8000
node --test tests/*.test.mjs    # tests (Node 18+; the drag test uses Playwright if installed)
```

## Configure

- **Parts list:** replace `data/master_parts.csv` with a new fabrication export (`Main Mk`,
  `Qty`, `Assembly Weight`, ...; a plain `Mark,Description,Weight` file also works).
- **Job numbers:** `JOB_NUMBERS` in `js/model.js`. Jobs whose marks have no sequence go in
  `NO_SEQUENCE_JOBS`.

After either change, release an update (below).

## Update

1. Bump `self.TERRA_VERSION` in `version.js`.
2. If you added a file, add it to `PRECACHE` in `sw.js`.
3. Push to `main`.

The iPad shows a **New** badge on Update when a newer version is up; **Update** (or **Force
Update**) loads it. Saved loads are kept.

## More

[docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md): what each file does, the data model, truck check,
phone layout, storage and the parts list format.
