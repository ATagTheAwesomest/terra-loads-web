// Pointer drag of a list row, with a floating copy of the row (the "ghost")
// under the finger. Pointer-based so it works with touch on iPad Safari, where
// HTML5 drag and drop is unreliable.
//
// The ghost sits on <body>, above every screen, so it must never outlive the
// drag. iPad Safari doesn't always tell us the finger lifted: if the row is
// drawn again mid-drag (a scan, a change from another iPad), the pointerup goes
// to the old, detached handle and never reaches the document, and a second
// finger on another handle used to start a new drag over the first one. Either
// way the old ghost stayed on screen, over every screen, until a reload. So a
// drag also ends when:
//   - the handle it started on gets the pointerup or pointercancel (its
//     moves are followed too, even once it is off the page),
//   - a new primary pointer goes down (the old finger must have lifted),
//   - another drag starts, the page is hidden or loses focus, or the app
//     changes screen (cancelDrag()),
// and ending one sweeps away every ghost, not only its own.

let drag = null; // { row, handle, ghost, pointerId, offsetY, lastY, target, targetAt, onDrop, scrollEl, on* }

export function isDragging() {
  return Boolean(drag);
}

function clearDropMarks() {
  document.querySelectorAll('.drop-before, .drop-after, .drop-into').forEach((el) => {
    el.classList.remove('drop-before', 'drop-after', 'drop-into');
  });
}

function sweep() {
  document.querySelectorAll('.drag-ghost').forEach((g) => g.remove());
  document.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'));
  clearDropMarks();
}

function finish(commit) {
  const d = drag;
  drag = null;
  sweep();
  if (!d) return;
  d.handle.removeEventListener('pointerup', d.onUp);
  d.handle.removeEventListener('pointercancel', d.onCancel);
  d.handle.removeEventListener('pointermove', d.onMove);
  if (commit && d.target) d.onDrop(d.target);
}

// Ends any drag without dropping, and removes any ghost left on screen.
export function cancelDrag() {
  finish(false);
}

// row: the list row being dragged; handle: the element pressed.
// targetAt(x, y) -> { el, cls, ... } or null: where a drop there would land
// (el gets class cls as a marker). onDrop(target) runs on a drop on a target.
// scrollEl scrolls while the finger is held near its top or bottom edge.
export function startDrag(row, handle, e, { targetAt, onDrop, scrollEl = null }) {
  cancelDrag();
  const r = row.getBoundingClientRect();
  const ghost = row.cloneNode(true);
  ghost.classList.add('drag-ghost');
  ghost.removeAttribute('id');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.style.width = `${r.width}px`;
  ghost.style.left = `${r.left}px`;
  ghost.style.top = `${r.top}px`;
  document.body.appendChild(ghost);
  row.classList.add('dragging');
  try { handle.setPointerCapture?.(e.pointerId); } catch { /* pointer already gone */ }
  const pointerId = e.pointerId;
  const onUp = (ev) => { if (ev.pointerId === pointerId) finish(true); };
  const onCancel = (ev) => { if (ev.pointerId === pointerId) finish(false); };
  handle.addEventListener('pointerup', onUp);
  handle.addEventListener('pointercancel', onCancel);
  // Moves reach the document too while the handle is still on the page.
  const onMove = (ev) => { if (!handle.isConnected) moveDrag(ev); };
  handle.addEventListener('pointermove', onMove);
  drag = { row, handle, ghost, pointerId, offsetY: e.clientY - r.top, lastY: e.clientY, target: null, targetAt, onDrop, scrollEl, onUp, onCancel, onMove };
  autoScroll(drag);
}

function moveDrag(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  // A mouse or pen moving with no button down was released somewhere we
  // didn't hear about.
  if (e.pointerType !== 'touch' && e.buttons === 0) { finish(false); return; }
  drag.ghost.style.top = `${e.clientY - drag.offsetY}px`;
  drag.lastY = e.clientY;
  clearDropMarks();
  drag.target = drag.targetAt(e.clientX, e.clientY);
  drag.target?.el.classList.add(drag.target.cls);
}

function autoScroll(d) {
  if (drag !== d) return;
  const el = d.scrollEl;
  if (el) {
    const r = el.getBoundingClientRect();
    const edge = 70;
    if (d.lastY < r.top + edge) el.scrollTop -= 12;
    else if (d.lastY > r.bottom - edge) el.scrollTop += 12;
  }
  requestAnimationFrame(() => autoScroll(d));
}

document.addEventListener('pointermove', moveDrag);
document.addEventListener('pointerup', (e) => { if (drag && e.pointerId === drag.pointerId) finish(true); });
document.addEventListener('pointercancel', (e) => { if (drag && e.pointerId === drag.pointerId) finish(false); });
// Capture phase, so it runs before a pointerdown on a handle starts a new drag.
document.addEventListener('pointerdown', (e) => {
  if (drag && e.isPrimary && e.pointerId !== drag.pointerId) cancelDrag();
}, true);
document.addEventListener('visibilitychange', () => { if (document.hidden) cancelDrag(); });
window.addEventListener('blur', cancelDrag);
window.addEventListener('pagehide', cancelDrag);
