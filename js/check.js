// Truck check: turns a load into a checklist. Each scan checks off one piece
// of the load with the same job and mark; a scan with nothing left to check
// off is logged as an extra. Pure functions, no DOM; the caller persists with
// store.saveLoad().
//
// load.truckCheck { startedAt, updatedAt, scans: CheckScan[] }
// CheckScan       { id, mark, manual, scannedAt }
//
// Only the scans are stored. Which piece each scan checks off is worked out
// again on every read (checkStatus), in stack and row order, so moving or
// deleting pieces in the load never leaves a check pointing at nothing.

import { newId } from './model.js';
import { normalizeMark, partKey } from './parts.js';

// The mark without the trailing "-" that flags manual and unmatched pieces,
// so a scan of 1099-X1 checks off a piece saved as 1099-X1-.
export function baseMark(mark) {
  return normalizeMark(mark).replace(/-+$/, '');
}

// Job plus mark: the same mark on another job is a different piece.
function keyOf(load, mark) {
  return partKey(load.job, baseMark(mark));
}

export function hasCheck(load) {
  return Boolean(load?.truckCheck);
}

export function startCheck(load) {
  if (!load.truckCheck) {
    const now = new Date().toISOString();
    load.truckCheck = { startedAt: now, updatedAt: now, scans: [] };
  }
  return load.truckCheck;
}

export function resetCheck(load) {
  delete load.truckCheck;
  startCheck(load);
}

// Matches the check scans against the load.
// Returns {
//   rows:   [{ item, stack, scan|null }] every piece in stack then row order,
//   extras: [{ scan, reason: 'not-on-load' | 'over', of }] newest last,
//   checkedBy: Map(itemId -> scan), byScan: Map(scanId -> item | null),
//   total, checked, missing, complete,
// }
export function checkStatus(load) {
  const rows = [];
  const queues = new Map(); // key -> rows not yet checked off, in order
  const counts = new Map(); // key -> pieces of that mark on the load
  for (const stack of load?.stacks ?? []) {
    for (const item of stack.items) {
      const row = { item, stack, scan: null };
      rows.push(row);
      const key = keyOf(load, item.mark);
      if (!queues.has(key)) queues.set(key, []);
      queues.get(key).push(row);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const extras = [];
  const checkedBy = new Map();
  const byScan = new Map();
  for (const scan of load?.truckCheck?.scans ?? []) {
    const key = keyOf(load, scan.mark);
    const row = queues.get(key)?.shift();
    if (row) {
      row.scan = scan;
      checkedBy.set(row.item.id, scan);
      byScan.set(scan.id, row.item);
    } else {
      const of = counts.get(key) ?? 0;
      extras.push({ scan, reason: of ? 'over' : 'not-on-load', of });
      byScan.set(scan.id, null);
    }
  }
  const total = rows.length;
  const checked = checkedBy.size;
  return {
    rows, extras, checkedBy, byScan, total, checked,
    missing: total - checked,
    complete: total > 0 && checked === total && extras.length === 0,
  };
}

// Logs one check scan. Returns null for an empty scan, otherwise
// { scan, item } when it checked off a piece, or { scan, extra } when it
// didn't (extra.reason is 'not-on-load' or 'over').
export function addCheckScan(load, rawMark, { manual = false } = {}) {
  const mark = baseMark(rawMark);
  if (!mark) return null;
  const check = startCheck(load);
  const scan = { id: newId(), mark, manual, scannedAt: new Date().toISOString() };
  check.scans.push(scan);
  check.updatedAt = scan.scannedAt;
  const status = checkStatus(load);
  const item = status.byScan.get(scan.id);
  if (item) return { scan, item };
  return { scan, extra: status.extras.find((x) => x.scan.id === scan.id) };
}

// Removes a check scan: un-checks a piece, or drops an extra.
export function removeCheckScan(load, scanId) {
  const scans = load?.truckCheck?.scans;
  const at = scans?.findIndex((s) => s.id === scanId) ?? -1;
  if (at < 0) return null;
  const [scan] = scans.splice(at, 1);
  load.truckCheck.updatedAt = new Date().toISOString();
  return scan;
}

// Short line for load lists: "38 of 40 checked", or null before a check.
export function checkSummary(load) {
  if (!hasCheck(load)) return null;
  const s = checkStatus(load);
  if (s.complete) return `Truck check done (${s.total})`;
  return `${s.checked} of ${s.total} checked${s.extras.length ? `, ${s.extras.length} extra` : ''}`;
}
