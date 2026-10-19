// Export, share and print for a single load (see js/model.js for the shape).
// Items are exported in array order, one line per scan, never collapsed.

import { checkStatus, hasCheck } from './check.js';
import { loadTotals, stackTotals, loadSequences, isFlagged, formatWeight, jobHasSequences, jobLabel } from './model.js';

const pad2 = (n) => String(n).padStart(2, '0');

function toDate(value) {
  const d = value instanceof Date ? value : new Date(value ?? Date.now());
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

// '2026-10-19 11:15' in the device's local time, as in the spec.
export function formatDateTime(value) {
  const d = toDate(value);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// Bare number for the text file: at most two decimals, no separators or unit.
export function plainWeight(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return String(Math.round(n * 100) / 100);
}

// Tekla-friendly text: control data lives in {} blocks, every other line is a mark.
export function buildLoadText(load) {
  const totals = loadTotals(load);
  const lines = [
    '{',
    `LOAD_NAME: ${load.name}`,
    `JOB: ${load.job || 'NONE'}`,
    `CREATED: ${formatDateTime(load.createdAt)}`,
    `TOTAL_PIECES: ${totals.pieces}`,
    `TOTAL_WEIGHT: ${plainWeight(totals.weight)}`,
    '}',
  ];
  for (const stack of load.stacks) {
    lines.push(`{STACK: ${stack.name}}`);
    for (const item of stack.items) lines.push(String(item.mark).trim());
  }
  return lines.join('\n') + '\n';
}

export function fileNameFor(load) {
  const safe = String(load.name || 'load').trim().replace(/[^A-Za-z0-9._-]+/g, '_') || 'load';
  return `${safe}.txt`;
}

function downloadText(text, fileName) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Opens the iPad share sheet (AirDrop, LocalSend, Mail, Files) with the load as a
// .txt file. Must be called from a tap handler. Falls back to a plain download
// where file sharing is unsupported. Resolves to 'shared', 'cancelled' or 'downloaded'.
export async function shareLoadFile(load) {
  const text = buildLoadText(load);
  const fileName = fileNameFor(load);
  const file = typeof File === 'function' ? new File([text], fileName, { type: 'text/plain' }) : null;

  if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return 'shared';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
      // Any other failure (e.g. permission) falls through to download.
    }
  }
  downloadText(text, fileName);
  return 'downloaded';
}

// ---- Print shipping ticket -------------------------------------------------

function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function renderPrintTicket(load, printedAt = new Date()) {
  const totals = loadTotals(load);
  const sequences = loadSequences(load);
  // A truck check, when one was run, fills in the check column.
  const check = hasCheck(load) ? checkStatus(load) : null;

  const summary = el(
    'dl',
    { class: 'pt-summary' },
    el('dt', null, 'Load'), el('dd', null, load.name),
    el('dt', null, 'Job'), el('dd', null, jobLabel(load)),
    el('dt', null, 'Created'), el('dd', null, formatDateTime(load.createdAt)),
    el('dt', null, 'Printed'), el('dd', null, formatDateTime(printedAt)),
    el('dt', null, 'Sequences'), el('dd', null, sequences.length ? sequences.join(', ') : jobHasSequences(load.job) ? 'None' : 'None (job has no sequences)'),
    el('dt', null, 'Total pieces'), el('dd', null, totals.pieces),
    el('dt', null, 'Total weight'), el('dd', null, formatWeight(totals.weight)),
    check ? el('dt', null, 'Truck check') : null,
    check ? el('dd', null, `${check.checked} of ${check.total} checked${check.extras.length ? `, ${check.extras.length} extra` : ''}`) : null,
  );

  const stacks = load.stacks.map((stack) => {
    const t = stackTotals(stack);
    const rows = stack.items.map((item, i) =>
      el(
        'tr',
        isFlagged(item) ? { class: 'pt-unmatched' } : null,
        el('td', { class: 'pt-num' }, i + 1),
        el('td', { class: 'pt-mark' }, item.mark),
        el('td', null, item.description || ''),
        el('td', { class: 'pt-num' }, plainWeight(item.weight)),
        el('td', { class: 'pt-check' }, check?.checkedBy.has(item.id) ? '✓' : ''),
      ),
    );
    return el(
      'section',
      { class: 'pt-stack' },
      el('h2', null, stack.name, el('span', null, `${t.pieces} pcs · ${formatWeight(t.weight)}`)),
      el(
        'table',
        null,
        el(
          'thead',
          null,
          el('tr', null,
            el('th', { class: 'pt-num' }, '#'),
            el('th', null, 'Mark'),
            el('th', null, 'Description'),
            el('th', { class: 'pt-num' }, 'Weight (lbs)'),
            el('th', { class: 'pt-check' }, '✓')),
        ),
        el('tbody', null, ...rows),
        el(
          'tfoot',
          null,
          el('tr', null,
            el('td', { colspan: '3' }, 'Stack subtotal'),
            el('td', { class: 'pt-num' }, plainWeight(t.weight)),
            el('td', { class: 'pt-check' }, '')),
        ),
      ),
    );
  });

  return el(
    'div',
    { id: 'print-ticket', 'aria-hidden': 'true' },
    el('h1', null, 'Shipping Ticket'),
    summary,
    ...stacks,
    el(
      'div',
      { class: 'pt-signoff' },
      el('p', null, 'Loaded by: ______________________'),
      el('p', null, 'Checked by: _____________________'),
      el('p', null, 'Driver: _________________________'),
    ),
  );
}

// Replaces any previous ticket, then opens the native print dialog.
export function printLoad(load) {
  document.getElementById('print-ticket')?.remove();
  document.body.appendChild(renderPrintTicket(load));
  window.print();
}
