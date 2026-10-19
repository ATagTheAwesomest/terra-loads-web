// Service worker registration, version check and Force Update.

const CURRENT = self.TERRA_VERSION;

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
  } catch (err) {
    console.warn('Service worker registration failed:', err);
    return null;
  }
}

// Fetches version.js straight from the server (bypassing every cache) and
// compares it with the running build. Returns null when offline.
export async function checkForUpdate() {
  try {
    const res = await fetch(`version.js?versioncheck=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const latest = (await res.text()).match(/TERRA_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1] ?? null;
    return { current: CURRENT, latest, available: Boolean(latest && latest !== CURRENT) };
  } catch {
    return null;
  }
}

// Drops the service worker and every app cache, then reloads from the
// network. Saved loads (IndexedDB / localStorage) are not touched. Refuses
// when the server is unreachable so an offline iPad never loses its shell.
export async function forceUpdate() {
  const check = await checkForUpdate();
  if (!check) {
    return { ok: false, reason: 'Can’t reach the server. Staying on the current version so the app keeps working offline.' };
  }
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  }
  if ('caches' in self) {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('terra-loads-')).map((k) => caches.delete(k)));
  }
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('v', Date.now().toString(36));
  location.replace(url.toString());
  return { ok: true };
}

export const APP_VERSION = CURRENT;
