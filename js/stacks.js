// Stack and item rows in the workspace: active stack, inline rename, move
// up/down, drag and drop between stacks, weight edits and hold-to-delete.

import { isFlagged, stackTotals, formatWeight, pieceCounts } from './model.js';
import {
  activeStack, findItem, findStack, moveItem, moveItemTo, removeItem,
  removeStack, renameStack, setActiveStack, setItemWeight,
} from './ops.js';
import { focusScanner, openKeypad } from './scanner.js';

const HOLD_MS = 1500;

let ctx = null;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---- Rendering -----------------------------------------------------------

function renderItem(it, i, count) {
  const flagged = isFlagged(it);
  const countBadge = count
    ? `<span class="item-count${count.n > count.of ? ' over' : ''}" title="Piece ${count.n} of ${count.of} on the master list">${count.n} of ${count.of}</span> `
    : '';
  const weight = flagged
    ? `<button class="btn item-weight item-weight-edit" type="button" data-action="weight" title="Set weight">${formatWeight(it.weight)} <span aria-hidden="true">&#9998;</span></button>`
    : `<span class="item-weight">${formatWeight(it.weight)}</span>`;
  return `
    <li class="item${flagged ? ' flagged' : ''}" data-item-id="${it.id}">
      <span class="item-drag" data-drag aria-label="Drag to move" title="Drag to move">&#10303;</span>
      <span class="item-index">${i + 1}</span>
      <span class="item-mark">${escapeHtml(it.mark)}</span>
      <span class="item-desc">${countBadge}${escapeHtml(it.description || (it.matched ? '' : 'Not in master list'))}</span>
      ${weight}
      <span class="item-actions">
        <button class="btn btn-icon" type="button" data-action="up" aria-label="Move up">&#9650;</button>
        <button class="btn btn-icon" type="button" data-action="down" aria-label="Move down">&#9660;</button>
        <button class="btn btn-icon btn-hold" type="button" data-hold="item" aria-label="Hold to delete" title="Hold to delete">&#128465;</button>
      </span>
    </li>`;
}

export function renderStack(stack, load, counts = pieceCounts(load)) {
  const t = stackTotals(stack);
  const flagged = stack.items.filter(isFlagged).length;
  const active = activeStack(load) === stack;
  const canRemove = !stack.items.length && load.stacks.length > 1;
  return `
    <section class="stack${active ? ' active' : ''}" data-stack-id="${stack.id}">
      <header class="stack-head">
        <div class="stack-title">
          <span class="stack-name">${escapeHtml(stack.name)}</span>
          <button class="btn btn-icon btn-ghost" type="button" data-action="rename" aria-label="Rename stack" title="Rename stack">&#9998;</button>
        </div>
        <span class="stack-stats"><b>${t.pieces}</b> pcs &middot; <b>${formatWeight(t.weight)}</b>${flagged ? ` &middot; <span class="stack-flagged">${flagged} flagged</span>` : ''}</span>
        ${active
          ? '<span class="badge badge-active">Scanning here</span>'
          : '<button class="btn" type="button" data-action="activate">Scan here</button>'}
        ${canRemove ? '<button class="btn btn-icon btn-hold" type="button" data-hold="stack" aria-label="Hold to remove empty stack" title="Hold to remove empty stack">&#128465;</button>' : ''}
      </header>
      ${stack.items.length
        ? `<ol class="items">${stack.items.map((it, i) => renderItem(it, i, counts.get(it.id))).join('')}</ol>`
        : '<p class="stack-empty">No pieces yet. Scan, or drag pieces here.</p>'}
    </section>`;
}

export function renderStacks(load) {
  const counts = pieceCounts(load);
  return load.stacks.map((s) => renderStack(s, load, counts)).join('');
}

// ---- Rename --------------------------------------------------------------

function startRename(stackEl) {
  const stack = findStack(ctx.load, stackEl.dataset.stackId);
  const nameEl = stackEl.querySelector('.stack-name');
  if (!stack || !nameEl) return;
  const input = document.createElement('input');
  input.className = 'stack-rename';
  input.value = stack.name;
  input.maxLength = 60;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('aria-label', 'Stack name');
  nameEl.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    if (commit && renameStack(ctx.load, stack.id, input.value)) ctx.save();
    else ctx.render();
    focusScanner();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
}

// ---- Hold to delete ------------------------------------------------------

let hold = null; // { btn, timer, pointerId, started }
let lastHoldDone = 0;

function cancelHold() {
  if (!hold) return;
  clearTimeout(hold.timer);
  hold.btn.classList.remove('holding');
  hold = null;
}

function startHold(btn, pointerId) {
  cancelHold();
  btn.classList.add('holding');
  hold = { btn, pointerId, started: Date.now(), timer: setTimeout(() => completeHold(btn), HOLD_MS) };
}

function completeHold(btn) {
  hold = null;
  lastHoldDone = Date.now();
  btn.classList.remove('holding');
  const load = ctx.load;
  if (btn.dataset.hold === 'item') {
    const id = btn.closest('[data-item-id]')?.dataset.itemId;
    const item = id && removeItem(load, id);
    if (item) { ctx.save(); ctx.toast(`Deleted ${item.mark}`); }
  } else {
    const stackEl = btn.closest('[data-stack-id]');
    const stack = stackEl && findStack(load, stackEl.dataset.stackId);
    if (stack && removeStack(load, stack.id)) { ctx.save(); ctx.toast(`Removed ${stack.name}`); }
  }
}

// ---- Drag and drop -------------------------------------------------------
// Pointer-based so it works with touch on iPad Safari, where HTML5 drag and
// drop is unreliable.

let drag = null; // { itemId, ghost, pointerId, target, offsetY }

function clearDropMarks() {
  document.querySelectorAll('.drop-before, .drop-after, .drop-into').forEach((el) => {
    el.classList.remove('drop-before', 'drop-after', 'drop-into');
  });
}

// Where a drop at (x, y) would land: { stackId, index, el, cls } or null.
function dropTargetAt(x, y) {
  const el = document.elementFromPoint(x, y);
  const stackEl = el?.closest('[data-stack-id]');
  if (!stackEl) return null;
  const stackId = stackEl.dataset.stackId;
  const rows = [...stackEl.querySelectorAll('[data-item-id]')];
  const row = el.closest('[data-item-id]');
  if (row) {
    const r = row.getBoundingClientRect();
    const i = rows.indexOf(row);
    const after = y > r.top + r.height / 2;
    return { stackId, index: after ? i + 1 : i, el: row, cls: after ? 'drop-after' : 'drop-before' };
  }
  if (el.closest('.stack-head')) return { stackId, index: 0, el: rows[0] ?? stackEl, cls: rows.length ? 'drop-before' : 'drop-into' };
  return { stackId, index: rows.length, el: rows[rows.length - 1] ?? stackEl, cls: rows.length ? 'drop-after' : 'drop-into' };
}

function startDrag(handle, e) {
  const row = handle.closest('[data-item-id]');
  if (!row) return;
  e.preventDefault();
  const r = row.getBoundingClientRect();
  const ghost = row.cloneNode(true);
  ghost.classList.add('drag-ghost');
  ghost.style.width = `${r.width}px`;
  ghost.style.left = `${r.left}px`;
  ghost.style.top = `${r.top}px`;
  document.body.appendChild(ghost);
  row.classList.add('dragging');
  handle.setPointerCapture?.(e.pointerId);
  drag = { itemId: row.dataset.itemId, ghost, pointerId: e.pointerId, offsetY: e.clientY - r.top, target: null, lastY: e.clientY };
  autoScroll();
}

function moveDrag(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  drag.ghost.style.top = `${e.clientY - drag.offsetY}px`;
  drag.lastY = e.clientY;
  clearDropMarks();
  drag.target = dropTargetAt(e.clientX, e.clientY);
  drag.target?.el.classList.add(drag.target.cls);
}

// Scrolls the workspace while a drag is held near its top or bottom edge.
function autoScroll() {
  if (!drag) return;
  const ws = document.getElementById('workspace');
  const r = ws.getBoundingClientRect();
  const edge = 70;
  if (drag.lastY < r.top + edge) ws.scrollTop -= 12;
  else if (drag.lastY > r.bottom - edge) ws.scrollTop += 12;
  requestAnimationFrame(autoScroll);
}

function endDrag(e, commit = true) {
  if (!drag || (e && e.pointerId !== drag.pointerId)) return;
  const { itemId, ghost, target } = drag;
  drag = null;
  ghost.remove();
  clearDropMarks();
  document.querySelector(`[data-item-id="${itemId}"]`)?.classList.remove('dragging');
  if (commit && target && moveItemTo(ctx.load, itemId, target.stackId, target.index)) ctx.save();
}

// ---- Wiring --------------------------------------------------------------

async function editWeight(itemId) {
  const hit = findItem(ctx.load, itemId);
  if (!hit) return;
  const value = await openKeypad({
    mode: 'weight',
    title: `Weight for ${hit.item.mark}`,
    note: 'Weight in lbs for this piece.',
    initial: hit.item.weight ? String(hit.item.weight) : '',
  });
  if (value !== null && setItemWeight(ctx.load, itemId, value || '0')) ctx.save();
}

export function initStacks(context) {
  ctx = context;
  const ws = document.getElementById('workspace');

  ws.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn || !ctx.load) return;
    const stackEl = btn.closest('[data-stack-id]');
    const itemId = btn.closest('[data-item-id]')?.dataset.itemId;
    switch (btn.dataset.action) {
      case 'up':
      case 'down':
        if (moveItem(ctx.load, itemId, btn.dataset.action === 'up' ? -1 : 1)) {
          ctx.save();
          document.querySelector(`[data-item-id="${itemId}"]`)?.scrollIntoView({ block: 'nearest' });
        }
        break;
      case 'activate':
        setActiveStack(ctx.load, stackEl.dataset.stackId);
        ctx.save();
        break;
      case 'rename':
        startRename(stackEl);
        break;
      case 'weight':
        editWeight(itemId);
        break;
    }
  });

  ws.addEventListener('pointerdown', (e) => {
    const holdBtn = e.target.closest('[data-hold]');
    if (holdBtn) { startHold(holdBtn, e.pointerId); return; }
    const handle = e.target.closest('[data-drag]');
    if (handle) startDrag(handle, e);
  });
  ws.addEventListener('contextmenu', (e) => {
    if (e.target.closest('[data-hold], [data-drag]')) e.preventDefault();
  });
  ws.addEventListener('click', (e) => {
    // A short tap on a delete button explains the hold instead of deleting.
    if (e.target.closest('[data-hold]') && !hold && Date.now() - lastHoldDone > 600) ctx.toast('Hold for 1.5 seconds to delete.');
  });

  document.addEventListener('pointermove', moveDrag);
  document.addEventListener('pointerup', (e) => {
    endDrag(e);
    if (hold && Date.now() - hold.started < HOLD_MS) {
      const early = hold;
      cancelHold();
      early.btn.blur();
    }
  });
  document.addEventListener('pointercancel', (e) => { endDrag(e, false); cancelHold(); });
  ws.addEventListener('pointerleave', cancelHold);
  ws.addEventListener('pointerout', (e) => {
    if (hold && e.target.closest?.('[data-hold]') === hold.btn && !hold.btn.contains(e.relatedTarget)) cancelHold();
  });
}
