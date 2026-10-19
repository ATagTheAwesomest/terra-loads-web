// App shell: boot sequence, header stats, loads drawer, new-load flow, updates.

import { loadParts, partCount } from './parts.js';
import { createLoad, isFlagged, loadSequences, loadTotals, stackTotals, formatWeight } from './model.js';
import * as store from './store.js';
import { APP_VERSION, checkForUpdate, forceUpdate, registerServiceWorker } from './updater.js';

const $ = (sel) => document.querySelector(sel);

export const state = {
  load: null,
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function toast(message, ms = 2500) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, ms);
}

// ---- Rendering -----------------------------------------------------------

export function renderStats() {
  const load = state.load;
  const totals = loadTotals(load);
  const seqs = loadSequences(load);
  $('#stat-load').textContent = load?.name ?? '—';
  $('#stat-seq').textContent = seqs.length ? seqs.join(', ') : '—';
  $('#stat-pieces').textContent = totals.pieces.toLocaleString('en-US');
  $('#stat-weight').textContent = formatWeight(totals.weight);
}

function renderStack(stack) {
  const t = stackTotals(stack);
  const rows = stack.items.map((it, i) => `
    <li class="item${isFlagged(it) ? ' flagged' : ''}" data-item-id="${it.id}">
      <span class="item-index">${i + 1}</span>
      <span class="item-mark">${escapeHtml(it.mark)}</span>
      <span class="item-desc">${escapeHtml(it.description || (it.matched ? '' : 'Not in master list'))}</span>
      <span class="item-weight">${formatWeight(it.weight)}</span>
    </li>`).join('');
  return `
    <section class="stack" data-stack-id="${stack.id}">
      <header class="stack-head">
        <span class="stack-name">${escapeHtml(stack.name)}</span>
        <span class="stack-stats">${t.pieces} pcs &middot; ${formatWeight(t.weight)}</span>
      </header>
      ${rows ? `<ol class="items">${rows}</ol>` : '<p class="stack-empty">No pieces yet.</p>'}
    </section>`;
}

export function renderWorkspace() {
  const ws = $('#workspace');
  if (!state.load) {
    ws.innerHTML = `
      <div class="empty">
        <h1>No load open</h1>
        <p class="muted">Create a load to start scanning, or open a saved one from Loads.</p>
        <button class="btn btn-primary btn-lg" type="button" data-action="new-load">+ New Load</button>
      </div>`;
    return;
  }
  ws.innerHTML = state.load.stacks.map(renderStack).join('');
}

export function render() {
  renderStats();
  renderWorkspace();
}

// ---- Loads ---------------------------------------------------------------

export async function openLoad(id) {
  state.load = id ? await store.getLoad(id) : null;
  store.setActiveLoadId(state.load?.id ?? null);
  render();
}

// Persists the open load and refreshes the screen.
export async function saveCurrentLoad() {
  if (!state.load) return;
  await store.saveLoad(state.load);
  render();
}

async function renderLoadList() {
  const loads = await store.listLoads();
  const list = $('#load-list');
  if (!loads.length) {
    list.innerHTML = '<li class="muted">No saved loads yet.</li>';
    return;
  }
  list.innerHTML = loads.map((l) => {
    const t = loadTotals(l);
    const when = new Date(l.updatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    return `<li><button class="btn load-row${l.id === state.load?.id ? ' active' : ''}" type="button" data-load-id="${l.id}">
      <span>${escapeHtml(l.name)}</span>
      <span class="load-row-meta">${t.pieces} pcs &middot; ${formatWeight(t.weight)} &middot; ${when}</span>
    </button></li>`;
  }).join('');
}

function setDrawer(open) {
  $('#drawer').classList.toggle('open', open);
  $('#drawer').setAttribute('aria-hidden', String(!open));
  $('#btn-loads').setAttribute('aria-expanded', String(open));
  $('#scrim').hidden = !open;
  if (open) renderLoadList();
}

function showNewLoadDialog() {
  setDrawer(false);
  $('#input-load-name').value = '';
  $('#new-load-error').textContent = '';
  $('#dlg-new-load').showModal();
  $('#input-load-name').focus();
}

async function submitNewLoad(event) {
  event.preventDefault();
  const name = $('#input-load-name').value.trim().toUpperCase();
  const error = $('#new-load-error');
  if (!name) {
    error.textContent = 'Enter a load name.';
    return;
  }
  if (await store.isLoadNameTaken(name)) {
    error.textContent = `A load named “${name}” already exists.`;
    return;
  }
  const load = createLoad(name);
  await store.saveLoad(load);
  $('#dlg-new-load').close();
  state.load = load;
  store.setActiveLoadId(load.id);
  render();
  toast(`Created ${name}`);
}

// ---- Updates -------------------------------------------------------------

async function refreshUpdateBadge() {
  const check = await checkForUpdate();
  $('#update-badge').hidden = !check?.available;
  return check;
}

async function showUpdateDialog() {
  const text = $('#update-text');
  text.textContent = `Running version ${APP_VERSION}. Checking for a newer version…`;
  $('#dlg-update').showModal();
  const check = await refreshUpdateBadge();
  if (!check) text.textContent = `Running version ${APP_VERSION}. Offline, so the server can’t be checked right now.`;
  else if (check.available) text.textContent = `Version ${check.latest} is available (running ${APP_VERSION}).`;
  else text.textContent = `Running version ${APP_VERSION}, the latest. Force Update reloads every app file anyway.`;
}

async function runForceUpdate() {
  const btn = $('#btn-update-go');
  btn.disabled = true;
  btn.textContent = 'Updating…';
  const result = await forceUpdate();
  if (!result.ok) {
    $('#update-text').textContent = result.reason;
    btn.disabled = false;
    btn.textContent = 'Force Update';
  }
}

// ---- Status bar ----------------------------------------------------------

function renderStatus() {
  const offline = $('#status-offline');
  const controlled = Boolean(navigator.serviceWorker?.controller);
  offline.textContent = controlled ? 'Offline ready' : 'Offline cache installing…';
  offline.className = controlled ? 'ok' : 'warn';
  $('#status-parts').textContent = `${partCount()} master parts`;
  $('#status-storage').textContent = `Storage: ${store.storageMode()}`;
  $('#status-version').textContent = `v${APP_VERSION}${navigator.onLine ? '' : ' · offline'}`;
}

// ---- Boot ----------------------------------------------------------------

function bindEvents() {
  $('#btn-loads').addEventListener('click', () => setDrawer(true));
  $('#btn-drawer-close').addEventListener('click', () => setDrawer(false));
  $('#scrim').addEventListener('click', () => setDrawer(false));
  $('#btn-new-load-drawer').addEventListener('click', showNewLoadDialog);
  $('#load-list').addEventListener('click', async (e) => {
    const row = e.target.closest('[data-load-id]');
    if (!row) return;
    await openLoad(row.dataset.loadId);
    setDrawer(false);
  });
  $('#workspace').addEventListener('click', (e) => {
    if (e.target.closest('[data-action="new-load"]')) showNewLoadDialog();
  });
  $('#form-new-load').addEventListener('submit', submitNewLoad);
  $('#btn-new-load-cancel').addEventListener('click', () => $('#dlg-new-load').close());
  $('#btn-update').addEventListener('click', showUpdateDialog);
  $('#btn-update-cancel').addEventListener('click', () => $('#dlg-update').close());
  $('#btn-update-go').addEventListener('click', runForceUpdate);
  window.addEventListener('online', renderStatus);
  window.addEventListener('offline', renderStatus);
  navigator.serviceWorker?.addEventListener('controllerchange', renderStatus);
}

async function boot() {
  bindEvents();
  const recovered = await store.recover();
  store.requestPersistence();
  try {
    await loadParts();
  } catch (err) {
    console.error(err);
    toast('Master parts list failed to load. Scans will be flagged as unmatched.', 5000);
  }
  await openLoad(store.getActiveLoadId());
  renderStatus();
  if (recovered) toast(`Recovered ${recovered} unsaved load${recovered === 1 ? '' : 's'}.`);
  await registerServiceWorker();
  navigator.serviceWorker?.ready.then(renderStatus);
  refreshUpdateBadge();
}

boot();
