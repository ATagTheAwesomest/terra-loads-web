// App shell: boot sequence, header stats, loads drawer, new-load flow, updates.

import { loadParts, partCount } from './parts.js';
import { JOB_NUMBERS, createLoad, jobHasSequences, jobLabel, loadSequences, loadTotals, formatWeight, refreshPieceWeights } from './model.js';
import { enterCheck, initCheck, renderCheck, submitCheck } from './check-ui.js';
import { checkSummary } from './check.js';
import { initLayout, isMobile, renderStacksMobile } from './mobile.js';
import { focusScanner, initScanner, renderScanbar } from './scanner.js';
import { initStacks, renderStacks } from './stacks.js';
import * as store from './store.js';
import { APP_VERSION, checkForUpdate, forceUpdate, registerServiceWorker } from './updater.js';

const $ = (sel) => document.querySelector(sel);

const MODE_KEY = 'terra.mode';

export const state = {
  load: null,
  // 'load' scans pieces into stacks; 'check' checks them off on the truck.
  mode: localStorage.getItem(MODE_KEY) === 'check' ? 'check' : 'load',
};

export function isChecking() {
  return Boolean(state.load) && state.mode === 'check';
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function toast(message, ms = 2500) {
  const el = $('#toast');
  // Modal dialogs sit in the top layer, above anything in the page body, so
  // the toast moves into the topmost open dialog to stay visible.
  const dialogs = document.querySelectorAll('dialog[open]');
  const host = dialogs[dialogs.length - 1] ?? document.body;
  if (el.parentElement !== host) host.appendChild(el);
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
  $('#stat-job').textContent = load ? jobLabel(load) : '';
  $('#stat-job').classList.toggle('missing', Boolean(load && !load.job));
  const noSeqJob = load && !jobHasSequences(load.job);
  $('#stat-seq').textContent = seqs.length ? seqs.join(', ') : noSeqJob ? 'None' : '—';
  $('#stat-seq').classList.toggle('muted', Boolean(noSeqJob));
  $('#mode-badge').hidden = !isChecking();
  document.body.classList.toggle('mode-check', isChecking());
  $('#truck-check-label').textContent = isChecking() ? 'Back to loading' : 'Truck check';
  $('#stat-pieces').textContent = totals.pieces.toLocaleString('en-US');
  $('#stat-weight').textContent = formatWeight(totals.weight);
}

export function renderWorkspace() {
  const ws = $('#workspace');
  $('#colhead').hidden = !state.load || isChecking() || isMobile();
  if (!state.load) {
    ws.innerHTML = `
      <div class="empty">
        <h1>No load open</h1>
        <p class="muted">Create a load to start scanning, or open a saved one from Loads.</p>
        <button class="btn btn-primary btn-lg" type="button" data-action="new-load">+ New Load</button>
      </div>`;
    return;
  }
  if (isChecking()) ws.innerHTML = renderCheck(state.load);
  else ws.innerHTML = isMobile() ? renderStacksMobile(state.load) : renderStacks(state.load);
}

// Switches between loading ('load') and the truck check ('check').
export async function setMode(mode) {
  const next = mode === 'check' ? 'check' : 'load';
  if (next === 'check' && !state.load) {
    toast('Open a load first');
    return;
  }
  state.mode = next;
  localStorage.setItem(MODE_KEY, next);
  if (next === 'check' && !state.load.truckCheck) {
    enterCheck(state.load);
    await saveCurrentLoad();
  } else render();
  document.getElementById('workspace').scrollTop = 0;
  focusScanner();
  toast(next === 'check' ? `Truck check: scan every piece of ${state.load.name}` : 'Back to loading');
}

export function render() {
  renderStats();
  renderScanbar();
  renderWorkspace();
}

// ---- Loads ---------------------------------------------------------------

export async function openLoad(id) {
  state.load = id ? await store.getLoad(id) : null;
  if (partCount() && refreshPieceWeights(state.load)) store.saveLoad(state.load).catch(console.error);
  store.setActiveLoadId(state.load?.id ?? null);
  render();
  focusScanner();
}

// Persists the open load and refreshes the screen. The journal write inside
// saveLoad() is synchronous, so the screen updates without waiting on IndexedDB.
export async function saveCurrentLoad() {
  if (!state.load) return;
  const saved = store.saveLoad(state.load);
  render();
  try {
    await saved;
  } catch (err) {
    console.error(err);
    toast('Could not save. Storage may be full.', 5000);
  }
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
      <span class="load-row-meta">${escapeHtml(jobLabel(l))} &middot; ${t.pieces} pcs &middot; ${formatWeight(t.weight)} &middot; ${when}</span>
      ${checkSummary(l) ? `<span class="load-row-meta check-meta-line">${escapeHtml(checkSummary(l))}</span>` : ''}
    </button></li>`;
  }).join('');
}

export function setDrawer(open) {
  $('#drawer').classList.toggle('open', open);
  $('#drawer').setAttribute('aria-hidden', String(!open));
  $('#btn-loads').setAttribute('aria-expanded', String(open));
  $('#scrim').hidden = !open;
  if (open) renderLoadList();
}

// Right-hand menu: share, print, update.
export function setMenu(open) {
  $('#menu').classList.toggle('open', open);
  $('#menu').setAttribute('aria-hidden', String(!open));
  $('#btn-menu').setAttribute('aria-expanded', String(open));
  $('#scrim').hidden = !open;
}

export function showNewLoadDialog() {
  setDrawer(false);
  $('#input-load-name').value = '';
  $('#new-load-jobs').querySelectorAll('input').forEach((r) => { r.checked = false; });
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
  const job = $('#form-new-load').elements.job?.value;
  if (!job) {
    error.textContent = 'Pick a job number.';
    return;
  }
  const load = createLoad(name, job);
  await store.saveLoad(load);
  $('#dlg-new-load').close();
  document.getElementById('dlg-manage')?.close();
  state.load = load;
  store.setActiveLoadId(load.id);
  render();
  focusScanner();
  toast(`Created ${name}`);
}

// ---- Updates -------------------------------------------------------------

async function refreshUpdateBadge() {
  const check = await checkForUpdate();
  $('#update-badge').hidden = !check?.available;
  $('#menu-badge').hidden = !check?.available;
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

function renderJobChoices() {
  $('#new-load-jobs').insertAdjacentHTML('beforeend', JOB_NUMBERS.map((job) => `
    <label class="job-option"><input type="radio" name="job" value="${escapeHtml(job)}"><span>${escapeHtml(job)}</span></label>`).join(''));
}

function bindEvents() {
  renderJobChoices();
  const ctx = {
    get load() { return state.load; },
    get checking() { return isChecking(); },
    save: saveCurrentLoad, render, toast, setMode, checkScan: submitCheck,
  };
  initLayout(render);
  initScanner(ctx);
  initStacks(ctx);
  initCheck(ctx);
  $('#btn-truck-check').addEventListener('click', () => setMode(isChecking() ? 'load' : 'check'));
  $('#btn-loads').addEventListener('click', () => setDrawer(true));
  $('#btn-drawer-close').addEventListener('click', () => setDrawer(false));
  $('#scrim').addEventListener('click', () => { setDrawer(false); setMenu(false); });
  $('#btn-menu').addEventListener('click', () => setMenu(true));
  $('#btn-menu-close').addEventListener('click', () => setMenu(false));
  $('#menu').addEventListener('click', (e) => { if (e.target.closest('.menu-item')) setMenu(false); });
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
