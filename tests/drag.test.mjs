// Run with: node --test tests/*.test.mjs
// A dragged row's floating copy (the ghost) must never outlive the drag: it
// sits above every screen, so one left behind "floats" over the whole app.
// Runs js/drag.js in a real browser (Playwright's Chromium); skipped where
// Playwright isn't installed.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

let chromium = null;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { /* not installed */ }

const root = new URL('../', import.meta.url);
const page = `<!doctype html><meta charset="utf-8">
<style>.drag-ghost { position: fixed; } li { height: 40px; }</style>
<ul id="list"></ul>
<script type="module">
  import * as drag from './js/drag.js';
  window.drag = drag;
  window.drops = [];
  window.draw = () => {
    document.getElementById('list').innerHTML =
      ['a', 'b', 'c'].map((id) => '<li data-item-id="' + id + '"><span data-drag>::</span> ' + id + '</li>').join('');
  };
  window.handle = (id) => document.querySelector('[data-item-id="' + id + '"] [data-drag]');
  window.ptr = (el, type, pointerId, isPrimary = true) => el.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerId, isPrimary, pointerType: 'touch', clientX: 10, clientY: 60, buttons: 1,
  }));
  window.begin = (id, pointerId, isPrimary = true) => {
    const h = window.handle(id);
    window.ptr(h, 'pointerdown', pointerId, isPrimary);
    drag.startDrag(h.closest('li'), h, { pointerId, clientY: 20 }, {
      targetAt: () => ({ el: document.querySelector('[data-item-id="c"]'), cls: 'drop-after', id: 'c' }),
      onDrop: (t) => window.drops.push(t.id),
    });
  };
  window.ghosts = () => document.querySelectorAll('.drag-ghost').length;
  window.ready = true;
</script>`;

let server; let browser; let tab;

before(async () => {
  if (!chromium) return;
  server = createServer(async (req, res) => {
    if (req.url === '/' || req.url === '/index.html') { res.setHeader('content-type', 'text/html'); res.end(page); return; }
    try {
      const body = await readFile(new URL(`.${req.url}`, root));
      res.setHeader('content-type', 'text/javascript');
      res.end(body);
    } catch { res.statusCode = 404; res.end(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  browser = await chromium.launch();
  tab = await browser.newPage();
  await tab.goto(`http://127.0.0.1:${server.address().port}/`);
  await tab.waitForFunction(() => window.ready);
});

after(async () => {
  await browser?.close();
  server?.close();
});

const run = (fn) => tab.evaluate(fn);
const opts = { skip: !chromium && 'Playwright not installed' };

test('a normal drag and drop leaves no ghost', opts, async () => {
  const r = await run(() => {
    draw(); drops.length = 0;
    begin('a', 1);
    const during = ghosts();
    ptr(document.body, 'pointermove', 1);
    ptr(document.body, 'pointerup', 1);
    return { during, after: ghosts(), drops: [...drops], faded: document.querySelectorAll('.dragging').length };
  });
  assert.deepEqual(r, { during: 1, after: 0, drops: ['c'], faded: 0 });
});

test('the list redrawn mid-drag: the pointerup lands on the detached handle (iPad Safari) and still ends it', opts, async () => {
  const r = await run(() => {
    draw(); drops.length = 0;
    begin('a', 2);
    const old = handle('a');
    draw(); // a scan or another iPad's change redraws the stacks
    ptr(old, 'pointermove', 2);
    ptr(old, 'pointerup', 2); // detached: never bubbles to the document
    return { after: ghosts(), dragging: drag.isDragging(), drops: [...drops] };
  });
  assert.deepEqual(r, { after: 0, dragging: false, drops: ['c'] });
});

test('a second finger on another handle replaces the first drag instead of stacking ghosts', opts, async () => {
  const r = await run(() => {
    draw();
    begin('a', 3);
    begin('b', 4, false);
    const during = ghosts();
    ptr(document.body, 'pointerup', 4);
    return { during, after: ghosts() };
  });
  assert.deepEqual(r, { during: 1, after: 0 });
});

test('a lost pointerup: the next tap anywhere clears the ghost', opts, async () => {
  const r = await run(() => {
    draw();
    begin('a', 5);
    // pointer 5's pointerup never arrives; the next touch is a new primary pointer.
    ptr(document.body, 'pointerdown', 6);
    return { after: ghosts(), dragging: drag.isDragging() };
  });
  assert.deepEqual(r, { after: 0, dragging: false });
});

test('cancelDrag (screen change) removes the ghost without dropping', opts, async () => {
  const r = await run(() => {
    draw(); drops.length = 0;
    begin('a', 7);
    drag.cancelDrag();
    return { after: ghosts(), drops: [...drops] };
  });
  assert.deepEqual(r, { after: 0, drops: [] });
});
