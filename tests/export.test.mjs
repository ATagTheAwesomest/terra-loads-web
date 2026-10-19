import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLoadText, fileNameFor, plainWeight } from '../js/export.js';

const load = {
  name: 'TRUCK-LOAD-101',
  job: '26123 - 25-418',
  createdAt: new Date(2026, 9, 19, 11, 15),
  stacks: [
    {
      name: 'Stack TRUCK-LOAD-101 - 1',
      items: [
        { mark: '1001-C1', weight: 500 },
        { mark: '1001-C1', weight: 500 },
        { mark: '1002-B1', weight: 250.5 },
        { mark: '1099-X1-', weight: 0, matched: false },
      ],
    },
    {
      name: 'Stack TRUCK-LOAD-101 - 2',
      items: [
        { mark: '1001-C1', weight: 500 },
        { mark: '1003-W2', weight: 99.5 },
      ],
    },
  ],
};

test('text export matches the spec layout and keeps every scan', () => {
  assert.equal(
    buildLoadText(load),
    [
      '{',
      'LOAD_NAME: TRUCK-LOAD-101',
      'JOB: 26123 - 25-418',
      'CREATED: 2026-10-19 11:15',
      'TOTAL_PIECES: 6',
      'TOTAL_WEIGHT: 1850',
      '}',
      '{STACK: Stack TRUCK-LOAD-101 - 1}',
      '1001-C1',
      '1001-C1',
      '1002-B1',
      '1099-X1-',
      '{STACK: Stack TRUCK-LOAD-101 - 2}',
      '1001-C1',
      '1003-W2',
      '',
    ].join('\n'),
  );
});

test('empty stacks still get a header', () => {
  const text = buildLoadText({ name: 'A', createdAt: 0, stacks: [{ name: 'Stack A - 1', items: [] }] });
  assert.match(text, /TOTAL_PIECES: 0\nTOTAL_WEIGHT: 0\n}\n{STACK: Stack A - 1}\n$/);
});

test('weights and file names', () => {
  assert.equal(plainWeight(12.345), '12.35');
  assert.equal(plainWeight('abc'), '0');
  assert.equal(fileNameFor({ name: 'Truck A/2' }), 'Truck_A_2.txt');
});
