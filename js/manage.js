// Manage Loads screen: every saved load with its job number, totals, open and
// export actions, and a 7.5 second hold to delete.

import { escapeHtml, openLoad, render, setDrawer, showNewLoadDialog, state, toast } from './app.js';
import { checkSummary } from './check.js';
import { shareLoadFile } from './export.js';
import { bindHold } from './hold.js';
import { JOB_NUMBERS, formatWeight, loadTotals } from './model.js';
import { setLoadJob } from './ops.js';
import * as store from './store.js';

const LOAD_HOLD_MS = 7500;

const $ = (sel) => document.querySelector(sel);
const dialog = $('#dlg-manage');

// The open load is edited in place so the workspace never saves a stale copy.
async function loadById(id) {
  return state.load?.id === id ? state.load : store.getLoad(id);
}

function jobSelect(load) {
  const options = JOB_NUMBERS.map((job) =>
    `<option value="${escapeHtml(job)}"${load.job === job ? ' selected' : ''}>${escapeHtml(job)}</option>`);
  if (!load.job) options.unshift('<option value="" selected disabled>No job: pick one</option>');
  return `<select class="job-select${load.job ? '' : ' missing'}" data-action="job" aria-label="Job number for ${escapeHtml(load.name)}">${options.join('')}</select>`;
}

async function renderList() {
  const loads = await store.listLoads();
  const list = $('#manage-list');
  if (!loads.length) {
    list.innerHTML = '<li class="muted manage-empty">No saved loads yet.</li>';
    return;
  }
  list.innerHTML = loads.map((l) => {
    const t = loadTotals(l);
    const when = new Date(l.updatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    const open = l.id === state.load?.id;
    return `
      <li class="manage-row${open ? ' active' : ''}" data-load-id="${l.id}">
        <div class="manage-info">
          <span class="manage-name">${escapeHtml(l.name)}${open ? ' <span class="badge badge-active">Open</span>' : ''}</span>
          <span class="load-row-meta">${t.pieces} pcs &middot; ${formatWeight(t.weight)} &middot; ${l.stacks.length} stack${l.stacks.length === 1 ? '' : 's'} &middot; ${when}${checkSummary(l) ? ` &middot; ${escapeHtml(checkSummary(l))}` : ''}</span>
        </div>
        ${jobSelect(l)}
        <div class="manage-actions">
          <button class="btn" type="button" data-action="open">Open</button>
          <button class="btn" type="button" data-action="share">Export</button>
          <button class="btn btn-hold manage-delete" type="button" data-hold="load" data-hold-ms="${LOAD_HOLD_MS}" aria-label="Hold 7.5 seconds to delete ${escapeHtml(l.name)}">&#128465; Delete</button>
        </div>
      </li>`;
  }).join('');
}

export async function openManage() {
  setDrawer(false);
  await renderList();
  if (!dialog.open) dialog.showModal();
}

async function deleteLoad(btn) {
  const id = btn.closest('[data-load-id]')?.dataset.loadId;
  const load = id && (await loadById(id));
  if (!load) return;
  await store.deleteLoad(id);
  if (state.load?.id === id) {
    state.load = null;
    render();
  }
  toast(`Deleted ${load.name}`);
  renderList();
}

$('#btn-manage-loads').addEventListener('click', openManage);
$('#btn-manage-close').addEventListener('click', () => dialog.close());
$('#btn-manage-new').addEventListener('click', showNewLoadDialog);

dialog.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  const id = btn?.closest('[data-load-id]')?.dataset.loadId;
  if (!id) return;
  if (btn.dataset.action === 'open') {
    dialog.close();
    await openLoad(id);
  } else if (btn.dataset.action === 'share') {
    const load = await loadById(id);
    if (load && (await shareLoadFile(load)) === 'downloaded') toast('Load file downloaded');
  }
});

dialog.addEventListener('change', async (e) => {
  const select = e.target.closest('select[data-action="job"]');
  const id = select?.closest('[data-load-id]')?.dataset.loadId;
  const load = id && (await loadById(id));
  if (!load || !setLoadJob(load, select.value)) return;
  await store.saveLoad(load);
  if (load === state.load) render();
  toast(`${load.name} filed under job ${load.job}`);
  renderList();
});

bindHold(dialog, {
  onComplete: deleteLoad,
  onTap: (_btn, secs) => toast(`Hold for ${secs} seconds to delete this load.`),
});
