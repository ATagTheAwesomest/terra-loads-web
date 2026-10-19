// Double-buffered local persistence.
//
// Every save is written synchronously to a localStorage journal first (survives
// a tab kill mid-write), then committed to IndexedDB, which holds all loads.
// On launch, recover() replays any journal entry that is newer than its
// IndexedDB copy. If IndexedDB is unavailable, the journal is the store.

const DB_NAME = 'terra-loads';
const DB_VERSION = 1;
const STORE = 'loads';
const JOURNAL_PREFIX = 'terra.journal.';
const ACTIVE_KEY = 'terra.activeLoadId';

let dbPromise = null;
let idbAvailable = true;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in self)) return reject(new Error('IndexedDB not supported'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id' });
        os.createIndex('nameLower', 'nameLower', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  }).catch((err) => {
    idbAvailable = false;
    console.warn('IndexedDB unavailable, using localStorage only:', err);
    return null;
  });
  return dbPromise;
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result?.result ?? result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

function readJournal() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(JOURNAL_PREFIX)) continue;
    try { out.push(JSON.parse(localStorage.getItem(key))); } catch { /* corrupt entry, skip */ }
  }
  return out;
}

function writeJournal(load) {
  try {
    localStorage.setItem(JOURNAL_PREFIX + load.id, JSON.stringify(load));
  } catch (err) {
    console.warn('localStorage journal write failed:', err);
    if (!idbAvailable) throw err;
  }
}

// Removes the journal entry once IndexedDB holds it. When rev is given, only
// clears if no newer save has been journaled since.
function clearJournal(id, rev = null) {
  if (!idbAvailable) return;
  const key = JOURNAL_PREFIX + id;
  if (rev !== null) {
    try {
      if (JSON.parse(localStorage.getItem(key))?.rev !== rev) return;
    } catch { /* fall through and clear */ }
  }
  localStorage.removeItem(key);
}

async function idbGetAll() {
  const db = await openDb();
  if (!db) return [];
  const req = await tx(db, 'readonly', (os) => os.getAll());
  return req ?? [];
}

async function idbPut(load) {
  const db = await openDb();
  if (!db) return false;
  await tx(db, 'readwrite', (os) => os.put({ ...load, nameLower: load.name.toLowerCase() }));
  return true;
}

function strip(load) {
  if (!load) return load;
  const { nameLower, ...rest } = load;
  return rest;
}

function newer(a, b) {
  return (a?.rev ?? 0) > (b?.rev ?? 0) || (a?.updatedAt ?? '') > (b?.updatedAt ?? '');
}

// Replays journal entries into IndexedDB. Call once at startup.
export async function recover() {
  await openDb();
  const journal = readJournal();
  if (!idbAvailable || journal.length === 0) return 0;
  const stored = new Map((await idbGetAll()).map((l) => [l.id, l]));
  let replayed = 0;
  for (const load of journal) {
    if (!stored.has(load.id) || newer(load, stored.get(load.id))) {
      await idbPut(load);
      replayed++;
    }
    clearJournal(load.id);
  }
  return replayed;
}

async function allLoads() {
  const merged = new Map((await idbGetAll()).map((l) => [l.id, strip(l)]));
  for (const j of readJournal()) {
    if (!merged.has(j.id) || newer(j, merged.get(j.id))) merged.set(j.id, j);
  }
  return [...merged.values()];
}

// All loads, most recently updated first.
export async function listLoads() {
  return (await allLoads()).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
}

export async function getLoad(id) {
  return (await allLoads()).find((l) => l.id === id) ?? null;
}

// Saves a whole load. The journal write is synchronous, so the data is safe
// as soon as this is called, even if the promise never settles.
export async function saveLoad(load) {
  load.updatedAt = new Date().toISOString();
  load.rev = (load.rev ?? 0) + 1;
  const rev = load.rev;
  writeJournal(load);
  if (await idbPut(load)) clearJournal(load.id, rev);
  return load;
}

export async function deleteLoad(id) {
  localStorage.removeItem(JOURNAL_PREFIX + id);
  const db = await openDb();
  if (db) await tx(db, 'readwrite', (os) => os.delete(id));
  if (getActiveLoadId() === id) setActiveLoadId(null);
}

// Case-insensitive check: "LOAD-01" and "load-01" are the same name.
export async function isLoadNameTaken(name, exceptId = null) {
  const wanted = String(name).trim().toLowerCase();
  return (await allLoads()).some((l) => l.id !== exceptId && l.name.trim().toLowerCase() === wanted);
}

export function getActiveLoadId() {
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveLoadId(id) {
  if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
}

export function storageMode() {
  return idbAvailable ? 'IndexedDB + localStorage' : 'localStorage only';
}

// Asks the browser not to evict our data under storage pressure.
export async function requestPersistence() {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
