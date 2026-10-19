// Share and Print buttons in the top bar, acting on the open load.

import { state, toast } from './app.js';
import { shareLoadFile, printLoad } from './export.js';

function openLoadWithItems() {
  if (state.load?.stacks.some((s) => s.items.length)) return state.load;
  toast(state.load ? 'Nothing scanned in this load yet' : 'Open a load first');
  return null;
}

document.getElementById('btn-share').addEventListener('click', async () => {
  const load = openLoadWithItems();
  if (load && (await shareLoadFile(load)) === 'downloaded') toast('Load file downloaded');
});

document.getElementById('btn-print').addEventListener('click', () => {
  const load = openLoadWithItems();
  if (load) printLoad(load);
});
