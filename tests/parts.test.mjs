// Run with: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadParts, lookupPart } from '../js/parts.js';
import { createLoad, pieceCounts } from '../js/model.js';
import { addScan, addStack } from '../js/ops.js';

const FAB_EXPORT = [
  'Category,Dwg,Qty,Main Mk,Piece Mk,Shape,Dimension,Length,Seq,Ref #,Grade,Assembly Weight,Weight,Finish',
  ',52311000,2,52311000,52311000,W,8 x 35,13\'-11,5231,523104-06,A992,581.48#,487.08#,3-1',
  ',55310001,1,55310001,55310001,L,4 x 4 x 3/8,6\'-3,5531,,A529-50,"1,204.50#",99.00#,3-1',
].join('\n');

async function useCsv(csv) {
  globalThis.fetch = async () => new Response(csv);
  return loadParts();
}

test('fabrication export: main mark, assembly weight, built description, qty', async () => {
  assert.equal(await useCsv(FAB_EXPORT), 2);
  assert.deepEqual(lookupPart('52311000'), {
    mark: '52311000',
    description: "W8x35 · 13'-11 · A992 · Ref 523104-06",
    weight: 581.48,
    qty: 2,
  });
  const angle = lookupPart('55310001');
  assert.equal(angle.weight, 1204.5);
  assert.equal(angle.description, "L4x4x3/8 · 6'-3 · A529-50");
});

test('piece counts run across stacks and go over the master quantity', async () => {
  await useCsv(FAB_EXPORT);
  const load = createLoad('T');
  const a = addScan(load, '52311000');
  addStack(load);
  const b = addScan(load, '52311000', { manual: true });
  const c = addScan(load, '52311000');
  const unknown = addScan(load, '99999999');
  const counts = pieceCounts(load);
  assert.deepEqual(counts.get(a.id), { n: 1, of: 2 });
  assert.deepEqual(counts.get(b.id), { n: 2, of: 2 });
  assert.deepEqual(counts.get(c.id), { n: 3, of: 2 });
  assert.equal(counts.has(unknown.id), false);
});
