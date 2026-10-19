// Run with: node --test tests/*.test.mjs
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { loadParts } from '../js/parts.js';
import { createLoad } from '../js/model.js';
import {
  activeStack, addScan, addStack, findItem, moveItem, moveItemTo,
  removeItem, removeStack, renameStack, setActiveStack, setItemWeight,
} from '../js/ops.js';

before(async () => {
  const csv = await readFile(new URL('./fixtures/sample_parts.csv', import.meta.url), 'utf8');
  globalThis.fetch = async () => new Response(csv);
  await loadParts();
});

const marks = (stack) => stack.items.map((it) => it.mark);

test('scans append in order and never collapse', () => {
  const load = createLoad('TRUCK-A');
  addScan(load, '1001-C1');
  addScan(load, '1001-c1');
  addScan(load, '  1010-B2 ');
  assert.deepEqual(marks(load.stacks[0]), ['1001-C1', '1001-C1', '1010-B2']);
  assert.equal(addScan(load, '   '), null);
  assert.equal(load.stacks[0].items.length, 3);
});

test('matched scan gets description and weight; unmatched and manual get a hyphen', () => {
  const load = createLoad('T');
  const ok = addScan(load, '1010-C1');
  assert.equal(ok.matched, true);
  assert.equal(ok.weight, 848);
  assert.ok(ok.description);
  const unknown = addScan(load, '9999-Z9');
  assert.equal(unknown.mark, '9999-Z9-');
  assert.equal(unknown.matched, false);
  assert.equal(unknown.weight, 0);
  const manual = addScan(load, '1010-C1', { manual: true });
  assert.equal(manual.mark, '1010-C1-');
  assert.equal(manual.weight, 848);
  assert.equal(addScan(load, '9999-Z9-').mark, '9999-Z9-');
});

test('new stack goes directly below the active stack and becomes active', () => {
  const load = createLoad('Truck-A');
  const s2 = addStack(load);
  assert.equal(s2.name, 'Stack Truck-A - 2');
  setActiveStack(load, load.stacks[0].id);
  const s3 = addStack(load);
  assert.equal(s3.name, 'Stack Truck-A - 3');
  assert.deepEqual(load.stacks.map((s) => s.name), ['Stack Truck-A - 1', 'Stack Truck-A - 3', 'Stack Truck-A - 2']);
  assert.equal(activeStack(load), s3);
  addScan(load, '1001-C1');
  assert.equal(s3.items.length, 1);
});

test('rename keeps the old name when blank', () => {
  const load = createLoad('T');
  const id = load.stacks[0].id;
  assert.equal(renameStack(load, id, '   '), false);
  assert.equal(renameStack(load, id, '  North   bundle '), true);
  assert.equal(load.stacks[0].name, 'North bundle');
});

test('moveItem crosses stack boundaries', () => {
  const load = createLoad('T');
  const a = addScan(load, '1001-C1');
  const b = addScan(load, '1010-B2');
  const s2 = addStack(load);
  const c = addScan(load, '1011-W1');
  assert.equal(moveItem(load, a.id, -1), false);
  assert.equal(moveItem(load, a.id, 1), true);
  assert.deepEqual(load.stacks[0].items.map((i) => i.id), [b.id, a.id]);
  assert.equal(moveItem(load, a.id, 1), true);
  assert.deepEqual(s2.items.map((i) => i.id), [a.id, c.id]);
  assert.equal(moveItem(load, a.id, -1), true);
  assert.deepEqual(load.stacks[0].items.map((i) => i.id), [b.id, a.id]);
  assert.equal(moveItem(load, c.id, 1), false);
});

test('moveItemTo uses drop-before positions', () => {
  const load = createLoad('T');
  const [a, b, c] = ['1001-C1', '1010-B2', '1011-W1'].map((m) => addScan(load, m));
  const sid = load.stacks[0].id;
  assert.equal(moveItemTo(load, a.id, sid, 3), true);
  assert.deepEqual(load.stacks[0].items.map((i) => i.id), [b.id, c.id, a.id]);
  assert.equal(moveItemTo(load, a.id, sid, 2), false);
  assert.equal(moveItemTo(load, a.id, sid, 0), true);
  assert.deepEqual(load.stacks[0].items.map((i) => i.id), [a.id, b.id, c.id]);
  const s2 = addStack(load);
  assert.equal(moveItemTo(load, b.id, s2.id, 0), true);
  assert.deepEqual(s2.items.map((i) => i.id), [b.id]);
  assert.equal(findItem(load, b.id).stack, s2);
});

test('remove item, empty stacks only, and weight edits', () => {
  const load = createLoad('T');
  const a = addScan(load, '9999-Z9');
  assert.equal(removeStack(load, load.stacks[0].id), false);
  const s2 = addStack(load);
  assert.equal(removeStack(load, load.stacks[0].id), false);
  assert.equal(removeStack(load, s2.id), true);
  assert.equal(activeStack(load), load.stacks[0]);
  assert.equal(setItemWeight(load, a.id, '-5'), false);
  assert.equal(setItemWeight(load, a.id, 'abc'), false);
  assert.equal(setItemWeight(load, a.id, '125.456'), true);
  assert.equal(a.weight, 125.46);
  assert.equal(removeItem(load, a.id), a);
  assert.equal(load.stacks[0].items.length, 0);
});
