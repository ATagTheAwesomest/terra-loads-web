// Press-and-hold buttons for destructive actions. A [data-hold] button fires
// only after being held for data-hold-ms (default 1500). Its red fill grows
// over that time and resets if the finger lifts or slides off early. A short
// tap calls onTap so the screen can explain the hold.

const DEFAULT_MS = 1500;

let hold = null; // { btn, timer, pointerId, started, ms }
let lastHoldDone = 0;

export function holdMs(btn) {
  return Number(btn.dataset.holdMs) || DEFAULT_MS;
}

function cancelHold() {
  if (!hold) return;
  clearTimeout(hold.timer);
  hold.btn.classList.remove('holding');
  hold = null;
}

export function isHolding() {
  return Boolean(hold);
}

// Wires every [data-hold] inside root, or only those matching selector so two
// screens can share a root. onComplete(btn) runs when a hold finishes;
// onTap(btn, seconds) runs on a press released too early.
export function bindHold(root, { onComplete, onTap, selector = '[data-hold]' }) {
  root.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest(selector);
    if (!btn || !root.contains(btn)) return;
    cancelHold();
    const ms = holdMs(btn);
    btn.style.setProperty('--hold-ms', `${ms}ms`);
    btn.classList.add('holding');
    hold = {
      btn, ms, pointerId: e.pointerId, started: Date.now(),
      timer: setTimeout(() => {
        hold = null;
        lastHoldDone = Date.now();
        btn.classList.remove('holding');
        onComplete(btn);
      }, ms),
    };
  });
  root.addEventListener('contextmenu', (e) => {
    if (e.target.closest('[data-hold]')) e.preventDefault();
  });
  root.addEventListener('click', (e) => {
    const btn = e.target.closest(selector);
    if (btn && !hold && Date.now() - lastHoldDone > 600) onTap?.(btn, holdMs(btn) / 1000);
  });
  root.addEventListener('pointerleave', cancelHold);
  root.addEventListener('pointerout', (e) => {
    if (hold && e.target.closest?.('[data-hold]') === hold.btn && !hold.btn.contains(e.relatedTarget)) cancelHold();
  });
}

document.addEventListener('pointerup', () => {
  if (hold && Date.now() - hold.started < hold.ms) {
    const btn = hold.btn;
    cancelHold();
    btn.blur();
  }
});
document.addEventListener('pointercancel', cancelHold);
