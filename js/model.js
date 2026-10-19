// Pure data helpers for loads, stacks and scanned items. No storage or DOM here.
//
// Load  { id, name, createdAt, updatedAt, stacks: Stack[] }
// Stack { id, name, items: Item[] }
// Item  { id, mark, description, weight, matched, manual, scannedAt }
//
// Items are never collapsed: every scan is its own row, in scan order.

import { lookupPart, normalizeMark } from './parts.js';

export function newId() {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function defaultStackName(loadName, index) {
  return `Stack ${loadName} - ${index}`;
}

export function createStack(loadName, index) {
  return { id: newId(), name: defaultStackName(loadName, index), items: [] };
}

export function createLoad(name) {
  const now = new Date().toISOString();
  const clean = String(name).trim();
  return { id: newId(), name: clean, createdAt: now, updatedAt: now, pieceWeights: true, stacks: [createStack(clean, 1)] };
}

// Builds an item from a scanned or typed mark. Unrecognized marks and manual
// entries are flagged: the mark gets a trailing "-" and the row shows orange.
export function createItem(rawMark, { manual = false } = {}) {
  let mark = normalizeMark(rawMark);
  const part = lookupPart(mark) ?? lookupPart(mark.replace(/-+$/, ''));
  const flagged = manual || !part;
  if (flagged && !mark.endsWith('-')) mark += '-';
  return {
    id: newId(),
    mark,
    description: part?.description ?? '',
    weight: part?.weight ?? 0,
    matched: Boolean(part),
    manual,
    scannedAt: new Date().toISOString(),
  };
}

// Loads saved before v0.4 stored the whole line's assembly weight on matched
// pieces. Re-reads per-piece weights from the master list once; flagged
// (hand-weighed) items are left alone. Returns true when the load changed.
export function refreshPieceWeights(load) {
  if (!load || load.pieceWeights) return false;
  for (const s of load.stacks) {
    for (const it of s.items) {
      const part = !isFlagged(it) && lookupPart(it.mark);
      if (part) it.weight = part.weight;
    }
  }
  load.pieceWeights = true;
  return true;
}

export function isFlagged(item) {
  return item.manual || !item.matched;
}

export function stackTotals(stack) {
  return {
    pieces: stack.items.length,
    weight: stack.items.reduce((sum, it) => sum + (Number(it.weight) || 0), 0),
  };
}

export function loadTotals(load) {
  return (load?.stacks ?? []).reduce(
    (acc, s) => {
      const t = stackTotals(s);
      return { pieces: acc.pieces + t.pieces, weight: acc.weight + t.weight };
    },
    { pieces: 0, weight: 0 }
  );
}

// Unique 4-character sequence prefixes of every mark in the load, sorted.
export function loadSequences(load) {
  const seqs = new Set();
  for (const s of load?.stacks ?? []) {
    for (const it of s.items) {
      const prefix = it.mark.slice(0, 4);
      if (prefix.length === 4) seqs.add(prefix);
    }
  }
  return [...seqs].sort();
}

// Running count of each master mark across the load, in stack then scan
// order, against the quantity the master list calls for.
// Returns Map(itemId -> { n, of }) for items whose mark has a quantity.
export function pieceCounts(load) {
  const seen = new Map();
  const counts = new Map();
  for (const s of load?.stacks ?? []) {
    for (const it of s.items) {
      const base = it.mark.replace(/-+$/, '');
      const qty = lookupPart(base)?.qty;
      if (!qty) continue;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      counts.set(it.id, { n, of: qty });
    }
  }
  return counts;
}

export function formatWeight(lbs) {
  return `${Math.round(lbs).toLocaleString('en-US')} lbs`;
}
