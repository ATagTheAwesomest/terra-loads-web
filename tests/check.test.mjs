// Run with: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadParts, lookupPart } from '../js/parts.js';
import { createLoad, loadSequences, pieceCounts } from '../js/model.js';
import { addScan, addStack, removeItem } from '../js/ops.js';
import { addCheckScan, checkStatus, checkSummary, removeCheckScan, resetCheck } from '../js/check.js';

const WITH_JOBS = [
  'Job,Main Mk,Qty,Assembly Weight',
  '26123,P1,2,200#',
  '26111,P1,1,55#',
  '26111,B101,1,400#',
  ',1001-C1,1,478#',
].join('\n');

async function useCsv(csv) {
  globalThis.fetch = async () => new Response(csv);
  return loadParts();
}

test('same mark on two jobs is two different parts', async () => {
  assert.equal(await useCsv(WITH_JOBS), 4);
  assert.equal(lookupPart('P1', '26123 - 25-418').weight, 100);
  assert.equal(lookupPart('p1', '26111').weight, 55);
  assert.equal(lookupPart('P1', '26102 - 25-351'), null);
  assert.equal(lookupPart('P1'), null);
  // A row with no job matches on any job.
  assert.equal(lookupPart('1001-C1', '26111').weight, 478);
  assert.equal(lookupPart('1001-C1').weight, 478);
});

test('scans and piece counts use the load job', async () => {
  await useCsv(WITH_JOBS);
  const a = createLoad('A', '26123 - 25-418');
  const b = createLoad('B', '26111');
  const c = createLoad('C', '26102 - 25-351');
  const pa = addScan(a, 'P1');
  const pb = addScan(b, 'P1');
  const pc = addScan(c, 'P1');
  assert.equal(pa.weight, 100);
  assert.equal(pb.weight, 55);
  assert.equal(pc.matched, false);
  assert.equal(pc.mark, 'P1-');
  assert.deepEqual(pieceCounts(a).get(pa.id), { n: 1, of: 2 });
  assert.deepEqual(pieceCounts(b).get(pb.id), { n: 1, of: 1 });
});

test('job 26111 has no sequences', async () => {
  await useCsv(WITH_JOBS);
  const b = createLoad('B', '26111');
  addScan(b, 'B101');
  addScan(b, 'P1');
  assert.deepEqual(loadSequences(b), []);
  const a = createLoad('A', '26123 - 25-418');
  addScan(a, '1001-C1');
  assert.deepEqual(loadSequences(a), ['1001']);
});

test('truck check ticks off one piece per scan and logs extras', async () => {
  await useCsv(WITH_JOBS);
  const load = createLoad('T', '26123 - 25-418');
  const p1a = addScan(load, 'P1');
  addStack(load);
  const p1b = addScan(load, 'P1');
  const odd = addScan(load, 'ZZ9');      // unmatched, saved as ZZ9-
  assert.equal(odd.mark, 'ZZ9-');

  let s = checkStatus(load);
  assert.equal(s.total, 3);
  assert.equal(s.checked, 0);

  const r1 = addCheckScan(load, 'p1');
  assert.equal(r1.item.id, p1a.id);
  const r2 = addCheckScan(load, 'P1');
  assert.equal(r2.item.id, p1b.id);
  const over = addCheckScan(load, 'P1');
  assert.equal(over.extra.reason, 'over');
  assert.equal(over.extra.of, 2);
  const stranger = addCheckScan(load, 'B101');
  assert.equal(stranger.extra.reason, 'not-on-load');
  assert.equal(addCheckScan(load, 'ZZ9').item.id, odd.id); // trailing "-" ignored
  assert.equal(addCheckScan(load, '  '), null);

  s = checkStatus(load);
  assert.equal(s.checked, 3);
  assert.equal(s.missing, 0);
  assert.equal(s.extras.length, 2);
  assert.equal(s.complete, false);
  assert.equal(checkSummary(load), '3 of 3 checked, 2 extra');

  removeCheckScan(load, over.scan.id);
  removeCheckScan(load, stranger.scan.id);
  s = checkStatus(load);
  assert.equal(s.complete, true);
  assert.equal(checkSummary(load), 'Truck check done (3)');

  // Unchecking one P1 leaves one P1 missing.
  removeCheckScan(load, r1.scan.id);
  s = checkStatus(load);
  assert.equal(s.checked, 2);
  assert.equal(s.rows.find((r) => !r.scan).item.mark, 'P1');

  resetCheck(load);
  assert.equal(checkStatus(load).checked, 0);
  assert.equal(checkSummary(load), '0 of 3 checked');
});

test('truck check follows edits to the load', async () => {
  await useCsv(WITH_JOBS);
  const load = createLoad('T', '26123 - 25-418');
  const a = addScan(load, 'P1');
  addScan(load, 'P1');
  addCheckScan(load, 'P1');
  addCheckScan(load, 'P1');
  removeItem(load, a.id);
  const s = checkStatus(load);
  assert.equal(s.total, 1);
  assert.equal(s.checked, 1);
  assert.equal(s.extras.length, 1);
  assert.equal(s.extras[0].reason, 'over');
});

test('a load without a check has no summary', () => {
  assert.equal(checkSummary(createLoad('X')), null);
});
