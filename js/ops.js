// Edits to an open load: scanning into the active stack, stack management and
// moving or deleting items. Pure functions that mutate the load in place; the
// caller persists with store.saveLoad(). No DOM here.

import { createItem, createStack, defaultStackName, isJobNumber } from './model.js';

export function findStack(load, stackId) {
  return load.stacks.find((s) => s.id === stackId) ?? null;
}

// { stack, stackIndex, index, item } for an item id, or null.
export function findItem(load, itemId) {
  for (let si = 0; si < load.stacks.length; si++) {
    const stack = load.stacks[si];
    const index = stack.items.findIndex((it) => it.id === itemId);
    if (index !== -1) return { stack, stackIndex: si, index, item: stack.items[index] };
  }
  return null;
}

// The stack new scans go into. Falls back to the last stack.
export function activeStack(load) {
  return findStack(load, load.activeStackId) ?? load.stacks[load.stacks.length - 1];
}

export function setActiveStack(load, stackId) {
  if (findStack(load, stackId)) load.activeStackId = stackId;
}

// Appends one scan to the bottom of the active stack. Returns the item, or
// null for an empty scan. Identical marks always get their own row.
export function addScan(load, rawMark, { manual = false } = {}) {
  if (!String(rawMark ?? '').trim()) return null;
  if (!load.stacks.length) load.stacks.push(createStack(load.name, 1));
  const stack = activeStack(load);
  const item = createItem(rawMark, { manual, job: load.job });
  stack.items.push(item);
  load.activeStackId = stack.id;
  return item;
}

// Next unused "Stack <load> - N" name.
function nextStackName(load) {
  const taken = new Set(load.stacks.map((s) => s.name.toLowerCase()));
  let n = load.stacks.length + 1;
  while (taken.has(defaultStackName(load.name, n).toLowerCase())) n++;
  return defaultStackName(load.name, n);
}

// Inserts a new empty stack directly below the active one and makes it active.
export function addStack(load) {
  const stack = createStack(load.name, 1);
  stack.name = nextStackName(load);
  const at = load.stacks.indexOf(activeStack(load));
  load.stacks.splice(at + 1, 0, stack);
  load.activeStackId = stack.id;
  return stack;
}

// Renames a stack. A blank name keeps the current one. Returns true if changed.
export function renameStack(load, stackId, name) {
  const stack = findStack(load, stackId);
  const clean = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!stack || !clean || clean === stack.name) return false;
  stack.name = clean;
  return true;
}

// Removes a stack and every piece in it. A load always keeps one stack, so
// removing the only stack leaves a fresh empty one in its place.
export function removeStack(load, stackId) {
  const stack = findStack(load, stackId);
  if (!stack) return false;
  const at = load.stacks.indexOf(stack);
  load.stacks.splice(at, 1);
  if (!load.stacks.length) load.stacks.push(createStack(load.name, 1));
  if (load.activeStackId === stackId || !findStack(load, load.activeStackId)) {
    load.activeStackId = load.stacks[Math.max(0, at - 1)].id;
  }
  return true;
}

// Files the load under one of JOB_NUMBERS. Returns true if changed.
export function setLoadJob(load, job) {
  if (!isJobNumber(job) || load.job === job) return false;
  load.job = job;
  return true;
}

// Moves an item one row up (dir -1) or down (dir +1). At the edge of a stack
// it crosses into the neighbouring stack: up from the top lands at the bottom
// of the stack above, down from the bottom lands at the top of the one below.
export function moveItem(load, itemId, dir) {
  const hit = findItem(load, itemId);
  if (!hit) return false;
  const { stack, stackIndex, index, item } = hit;
  const target = index + dir;
  if (target >= 0 && target < stack.items.length) {
    stack.items.splice(index, 1);
    stack.items.splice(target, 0, item);
    return true;
  }
  const neighbour = load.stacks[stackIndex + dir];
  if (!neighbour) return false;
  stack.items.splice(index, 1);
  if (dir < 0) neighbour.items.push(item);
  else neighbour.items.unshift(item);
  return true;
}

// Moves an item so it sits at position `index` of the target stack, where
// index counts rows as they are shown before the move (drop-before semantics).
export function moveItemTo(load, itemId, stackId, index) {
  const hit = findItem(load, itemId);
  const target = findStack(load, stackId);
  if (!hit || !target) return false;
  let at = Math.max(0, Math.min(index, target.items.length));
  if (hit.stack === target && hit.index < at) at--;
  if (hit.stack === target && hit.index === at) return false;
  hit.stack.items.splice(hit.index, 1);
  target.items.splice(at, 0, hit.item);
  return true;
}

export function removeItem(load, itemId) {
  const hit = findItem(load, itemId);
  if (!hit) return null;
  hit.stack.items.splice(hit.index, 1);
  return hit.item;
}

// Sets a weight in lbs. Rejects negative or non-numeric values.
export function setItemWeight(load, itemId, weight) {
  const hit = findItem(load, itemId);
  const n = Number.parseFloat(weight);
  if (!hit || !Number.isFinite(n) || n < 0) return false;
  hit.item.weight = Math.round(n * 100) / 100;
  return true;
}
