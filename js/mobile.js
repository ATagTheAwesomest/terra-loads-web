// Phone layout, switched on from the right-hand menu and remembered on this
// device. It has its own stack and row markup (rendered here) and its own
// styles (css/mobile.css, all under body.layout-mobile), so the iPad layout in
// js/stacks.js and css/app.css stays as it is.
//
// Rows are cards: mark and weight on top, description below. Tapping a card
// opens its controls and details. The click, rename, weight and
// hold-to-delete handling in js/stacks.js works on this markup too, since it
// keys on the same data attributes.

import { formatWeight, isFlagged, pieceCounts, stackTotals } from './model.js';
import { activeStack } from './ops.js';
import { ITEM_HOLD_MS, STACK_HOLD_MS, escapeHtml, expanded, renderDetail } from './stacks.js';

const LAYOUT_KEY = 'terra.layout';

export function isMobile() {
  return document.body.classList.contains('layout-mobile');
}

function applyLayout(mobile) {
  document.body.classList.toggle('layout-mobile', mobile);
  const btn = document.getElementById('btn-layout');
  btn?.setAttribute('aria-pressed', String(mobile));
  const label = document.getElementById('layout-state');
  if (label) label.textContent = mobile ? 'On' : 'Off';
}

// Picks the saved layout, or the phone layout on a phone-sized screen the
// first time. onChange re-renders after the menu toggle.
export function initLayout(onChange) {
  let saved = null;
  try { saved = localStorage.getItem(LAYOUT_KEY); } catch { /* storage blocked */ }
  applyLayout(saved ? saved === 'mobile' : matchMedia('(max-width: 600px)').matches);
  document.getElementById('btn-layout').addEventListener('click', () => {
    const mobile = !isMobile();
    applyLayout(mobile);
    try { localStorage.setItem(LAYOUT_KEY, mobile ? 'mobile' : 'tablet'); } catch { /* storage blocked */ }
    onChange();
  });
}

// ---- Rendering -----------------------------------------------------------

function renderItem(it, i, count, job) {
  const flagged = isFlagged(it);
  const open = expanded.has(it.id);
  const countBadge = count
    ? `<span class="item-count${count.n > count.of ? ' over' : ''}">${count.n} of ${count.of}</span>`
    : '';
  return `
    <li class="m-item${flagged ? ' flagged' : ''}${open ? ' expanded' : ''}" data-item-id="${it.id}">
      <div class="m-item-top">
        <span class="m-index">${i + 1}</span>
        <span class="item-mark">${escapeHtml(it.mark)}</span>
        <span class="m-weight">${formatWeight(it.weight)}</span>
      </div>
      <div class="m-item-desc">${countBadge}<span>${escapeHtml(it.description || (it.matched ? '' : 'Not in master list'))}</span></div>
      ${open ? `
      <div class="m-item-actions">
        <button class="btn" type="button" data-action="up">&#9650; Up</button>
        <button class="btn" type="button" data-action="down">&#9660; Down</button>
        ${flagged ? '<button class="btn item-weight-edit" type="button" data-action="weight">&#9998; Weight</button>' : ''}
        <button class="btn btn-hold" type="button" data-hold="item" data-hold-ms="${ITEM_HOLD_MS}" aria-label="Hold to delete">&#128465; Hold</button>
      </div>
      ${renderDetail(it, count, job)}` : ''}
    </li>`;
}

function renderStack(stack, load, counts) {
  const t = stackTotals(stack);
  const flagged = stack.items.filter(isFlagged).length;
  const active = activeStack(load) === stack;
  return `
    <section class="m-stack${active ? ' active' : ''}" data-stack-id="${stack.id}">
      <header class="m-stack-head">
        <div class="m-stack-title">
          <span class="stack-name">${escapeHtml(stack.name)}</span>
          <button class="btn btn-icon btn-ghost" type="button" data-action="rename" aria-label="Rename stack">&#9998;</button>
        </div>
        <div class="m-stack-meta">
          <span><b>${t.pieces}</b> pcs &middot; <b>${formatWeight(t.weight)}</b>${flagged ? ` &middot; <span class="stack-flagged">${flagged} flagged</span>` : ''}</span>
          ${active
            ? '<span class="badge badge-active">Scanning here</span>'
            : '<button class="btn" type="button" data-action="activate">Scan here</button>'}
          <button class="btn btn-icon btn-hold" type="button" data-hold="stack" data-hold-ms="${STACK_HOLD_MS}" aria-label="Hold 4 seconds to delete stack">&#128465;</button>
        </div>
      </header>
      ${stack.items.length
        ? `<ol class="m-items">${stack.items.map((it, i) => renderItem(it, i, counts.get(it.id), load.job)).join('')}</ol>`
        : '<p class="stack-empty">No pieces yet. Scan to add.</p>'}
    </section>`;
}

export function renderStacksMobile(load) {
  const counts = pieceCounts(load);
  return load.stacks.map((s) => renderStack(s, load, counts)).join('');
}
