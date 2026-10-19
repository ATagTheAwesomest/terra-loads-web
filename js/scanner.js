// Scan bar: the always-focused scanner input, Enter capture, success flash,
// and the on-screen keypad used for manual marks and weights.
//
// The input uses inputmode="none" so iOS keeps the soft keyboard down while a
// Bluetooth/USB scanner types into it. Manual entry goes through the keypad
// dialog, which never focuses a text field either.

import { addScan, addStack, activeStack } from './ops.js';
import { isFlagged } from './model.js';

const $ = (sel) => document.querySelector(sel);

let ctx = null;

// ---- Focus lock ----------------------------------------------------------

function canHoldFocus() {
  if (!ctx.load) return false;
  if (document.querySelector('dialog[open]')) return false;
  if ($('#drawer').classList.contains('open')) return false;
  const a = document.activeElement;
  if (a && a !== $('#scan-input') && a.matches('input, textarea, select, [contenteditable="true"]')) return false;
  return true;
}

export function focusScanner() {
  if (canHoldFocus()) $('#scan-input').focus({ preventScroll: true });
  renderFocusState();
}

function renderFocusState() {
  const focused = document.activeElement === $('#scan-input');
  $('#scanbar').classList.toggle('unfocused', !focused);
  $('#scan-hint').textContent = focused ? 'Ready to scan' : 'Tap here to resume scanning';
}

// ---- Scanning ------------------------------------------------------------

function flash(el, flagged) {
  if (!el) return;
  const cls = flagged ? 'flash-flag' : 'flash-ok';
  el.classList.remove('flash-ok', 'flash-flag');
  void el.offsetWidth; // restart the animation on back-to-back scans
  el.classList.add(cls);
}

// Adds one mark to the active stack, saves, and shows feedback.
export function submitMark(raw, { manual = false } = {}) {
  const load = ctx.load;
  if (!load) return null;
  const item = addScan(load, raw, { manual });
  if (!item) return null;
  ctx.save();
  const row = document.querySelector(`[data-item-id="${item.id}"]`);
  row?.scrollIntoView({ block: 'nearest' });
  flash(row, isFlagged(item));
  flash($('#scanbar'), isFlagged(item));
  return item;
}

function onScanKey(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const input = $('#scan-input');
  const value = input.value;
  input.value = '';
  submitMark(value);
}

export function renderScanbar() {
  const load = ctx.load;
  $('#scanbar').hidden = !load;
  if (!load) return;
  $('#scan-stack').textContent = activeStack(load)?.name ?? '—';
}

// ---- On-screen keypad ----------------------------------------------------

const DIGITS = ['7', '8', '9', '4', '5', '6', '1', '2', '3'];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

let pad = null; // { mode: 'mark' | 'weight', value, resolve }

function keyButton(key, label = key, cls = '') {
  return `<button class="btn key ${cls}" type="button" data-key="${key}">${label}</button>`;
}

function renderKeypad() {
  const weight = pad.mode === 'weight';
  const bottom = weight ? ['.', '0', 'back'] : ['-', '0', 'back'];
  const digits = [...DIGITS, ...bottom].map((k) => (k === 'back' ? keyButton('back', '&#9003;', 'key-fn') : keyButton(k))).join('');
  $('#keypad-digits').innerHTML = digits;
  $('#keypad-letters').innerHTML = weight ? '' : LETTERS.map((k) => keyButton(k)).join('') + keyButton('clear', 'Clear', 'key-fn key-wide');
  $('#keypad-letters').hidden = weight;
  $('#dlg-keypad').classList.toggle('keypad-weight', weight);
  renderKeypadValue();
}

function renderKeypadValue() {
  const display = $('#keypad-display');
  const suffix = pad.mode === 'weight' ? ' lbs' : '';
  display.textContent = pad.value ? pad.value + suffix : (pad.mode === 'weight' ? '0 lbs' : 'Type a mark');
  display.classList.toggle('placeholder', !pad.value);
  $('#keypad-ok').disabled = pad.mode === 'mark' ? !pad.value.trim() : !/^\d*\.?\d*$/.test(pad.value);
}

function pressKey(key) {
  if (!pad) return;
  if (key === 'back') pad.value = pad.value.slice(0, -1);
  else if (key === 'clear') pad.value = '';
  else if (pad.mode === 'weight') {
    if (key === '.' && pad.value.includes('.')) return;
    if (/^[\d.]$/.test(key) && pad.value.length < 9) pad.value += key;
  } else if (pad.value.length < 40) pad.value += key;
  renderKeypadValue();
}

function closeKeypad(result) {
  const p = pad;
  pad = null;
  $('#dlg-keypad').close();
  p?.resolve(result);
}

// Opens the keypad. Resolves with the entered string, or null on cancel.
export function openKeypad({ mode = 'mark', title, note = '', initial = '', okLabel } = {}) {
  if (pad) closeKeypad(null);
  return new Promise((resolve) => {
    pad = { mode, value: String(initial), resolve };
    $('#keypad-title').textContent = title ?? (mode === 'weight' ? 'Set weight' : 'Manual entry');
    $('#keypad-note').textContent = note;
    $('#keypad-ok').textContent = okLabel ?? (mode === 'weight' ? 'Save' : 'Add');
    renderKeypad();
    $('#dlg-keypad').showModal();
    $('#keypad-ok').focus({ preventScroll: true });
  });
}

async function manualEntry() {
  const value = await openKeypad({
    mode: 'mark',
    note: 'Manual marks get a trailing “-” and show orange.',
  });
  if (value) submitMark(value, { manual: true });
  focusScanner();
}

function onKeypadKeydown(e) {
  if (!pad) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    if (!$('#keypad-ok').disabled) closeKeypad(pad.value);
  } else if (e.key === 'Backspace') {
    e.preventDefault();
    pressKey('back');
  } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
    const k = e.key.toUpperCase();
    if (/^[A-Z0-9.\-]$/.test(k)) {
      e.preventDefault();
      pressKey(k);
    }
  }
}

// ---- Wiring --------------------------------------------------------------

export function initScanner(context) {
  ctx = context;
  const input = $('#scan-input');
  input.addEventListener('keydown', onScanKey);
  input.addEventListener('focus', renderFocusState);
  input.addEventListener('blur', () => setTimeout(focusScanner, 0));
  $('#scanbar').addEventListener('click', (e) => {
    if (!e.target.closest('button')) focusScanner();
  });
  // iOS only honours focus() inside a user gesture, so re-take focus at the
  // end of every tap that didn't land on another text field.
  document.addEventListener('pointerup', () => setTimeout(focusScanner, 0));
  document.addEventListener('close', () => setTimeout(focusScanner, 0), true);

  $('#btn-keypad').addEventListener('click', manualEntry);
  $('#btn-new-stack').addEventListener('click', () => {
    if (!ctx.load) return;
    const stack = addStack(ctx.load);
    ctx.save();
    document.querySelector(`[data-stack-id="${stack.id}"]`)?.scrollIntoView({ block: 'nearest' });
    ctx.toast(`Scanning into ${stack.name}`);
  });

  const dlg = $('#dlg-keypad');
  dlg.addEventListener('click', (e) => {
    const key = e.target.closest('[data-key]');
    if (key) pressKey(key.dataset.key);
  });
  dlg.addEventListener('keydown', onKeypadKeydown);
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeKeypad(null); });
  $('#keypad-cancel').addEventListener('click', () => closeKeypad(null));
  $('#keypad-ok').addEventListener('click', () => closeKeypad(pad?.value ?? null));
}
