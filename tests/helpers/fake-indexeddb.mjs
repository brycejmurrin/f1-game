/* fakeIndexedDb — the smallest IndexedDB that answers open / transaction / put
 * / delete / getAll with the async callback shape js/core/store.js's durable
 * mirror drives. Requests settle on a microtask and a transaction's oncomplete
 * on a macrotask, like the real thing. `rows` is the store, keyed by the
 * record's `k`; pass [[fullKey, json], ...] to seed it. */
export function fakeIndexedDb(seed = []) {
  const rows = new Map(seed);
  const request = (result) => {
    const r = { result, error: null, onsuccess: null, onerror: null };
    queueMicrotask(() => { if (r.onsuccess) r.onsuccess(); });
    return r;
  };
  const db = {
    objectStoreNames: { contains: () => true },
    close() {},
    transaction(_name, _mode) {
      const t = { error: null, oncomplete: null, onerror: null, onabort: null };
      t.objectStore = () => ({
        put(row) { rows.set(row.k, row.v); return request(row.k); },
        delete(k) { rows.delete(k); return request(undefined); },
        getAll() { return request(Array.from(rows, ([k, v]) => ({ k, v }))); },
      });
      setTimeout(() => { if (t.oncomplete) t.oncomplete(); }, 0);
      return t;
    },
  };
  return {
    rows,
    open() {
      const r = { result: db, onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null };
      queueMicrotask(() => { if (r.onupgradeneeded) r.onupgradeneeded(); if (r.onsuccess) r.onsuccess(); });
      return r;
    },
  };
}
