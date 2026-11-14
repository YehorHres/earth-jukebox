// Кеш результатів аналізу в IndexedDB (ключ: версія + ім'я + розмір + тривалість файлу).
const DB = "earth-jukebox", STORE = "analysis";

function open() {
  return new Promise((res, rej) => {
    if (!("indexedDB" in self)) return rej(new Error("IndexedDB недоступна"));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function cacheGet(key) {
  try {
    const db = await open();
    return await new Promise((res, rej) => {
      const q = db.transaction(STORE).objectStore(STORE).get(key);
      q.onsuccess = () => res(q.result || null);
      q.onerror = () => rej(q.error);
    });
  } catch { return null; }
}

export async function cachePut(key, value) {
  try {
    const db = await open();
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    return true;
  } catch (e) { console.warn("Кеш аналізу не збережено:", e.message); return false; }
}

export async function cacheClear() {
  try {
    const db = await open();
    await new Promise(res => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).clear(); tx.oncomplete = res; });
  } catch { /* немає кешу — нічого чистити */ }
}
