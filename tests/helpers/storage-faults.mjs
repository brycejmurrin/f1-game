/* Deterministic persistence fault injectors for unit and VM tests.
 *
 * Browser storage failures are otherwise difficult to reproduce: private
 * browsing denial, quota exhaustion, malformed bytes and a database closed by
 * the browser all arrive through different asynchronous paths.  This helper
 * keeps those paths explicit and observable without depending on a browser or
 * a particular IndexedDB implementation.
 *
 * The returned adapters implement the small surface the game uses.  Tests can
 * change a fault after boot with `faults.set(...)`, then assert both the user
 * visible result and the exact injected operation in `events`.
 */

const ERROR_MESSAGES = Object.freeze({
  SecurityError: "storage access denied",
  QuotaExceededError: "storage quota exceeded",
  InvalidStateError: "database connection is closed",
});

export function storageError(name, message = ERROR_MESSAGES[name] || name) {
  return Object.assign(new Error(message), { name });
}

/**
 * A localStorage-shaped adapter with independently switchable read/write
 * denial, quota and corruption.  `quotaBytes` applies to the encoded value
 * plus key, making quota tests stable across hosts.
 */
export function makeStorageFaults({ initial = {}, quotaBytes = Infinity } = {}) {
  const data = new Map(Object.entries(initial).map(([k, v]) => [k, String(v)]));
  const faults = { read: false, write: false, corrupt: new Map() };
  const events = [];
  let quota = Number.isFinite(quotaBytes) ? Math.max(0, quotaBytes) : Infinity;
  const fail = (op, name) => {
    events.push({ op, fault: name });
    throw storageError(name);
  };
  const storage = {
    get length() { return data.size; },
    key(index) { return [...data.keys()][index] ?? null; },
    getItem(key) {
      if (faults.read) fail("getItem", "SecurityError");
      const value = data.has(String(key)) ? data.get(String(key)) : null;
      events.push({ op: "getItem", key: String(key), result: value });
      return faults.corrupt.has(String(key)) ? faults.corrupt.get(String(key)) : value;
    },
    setItem(key, value) {
      if (faults.write) fail("setItem", "SecurityError");
      const k = String(key), v = String(value);
      if (k.length + v.length > quota) fail("setItem", "QuotaExceededError");
      data.set(k, v); events.push({ op: "setItem", key: k, value: v });
    },
    removeItem(key) {
      if (faults.write) fail("removeItem", "SecurityError");
      data.delete(String(key)); events.push({ op: "removeItem", key: String(key) });
    },
    clear() {
      if (faults.write) fail("clear", "SecurityError");
      data.clear(); events.push({ op: "clear" });
    },
  };
  return {
    storage,
    events,
    data,
    set(next = {}) {
      if ("read" in next) faults.read = !!next.read;
      if ("write" in next) faults.write = !!next.write;
      if ("quotaBytes" in next) quota = Number.isFinite(next.quotaBytes) ? Math.max(0, next.quotaBytes) : Infinity;
      if (next.corrupt) for (const [key, value] of Object.entries(next.corrupt)) faults.corrupt.set(key, String(value));
      if (next.clearCorrupt) for (const key of next.clearCorrupt) faults.corrupt.delete(key);
      return this;
    },
    seed(key, value) { data.set(String(key), String(value)); return this; },
    corrupt(key, value = "{ definitely not JSON") { faults.corrupt.set(String(key), String(value)); return this; },
  };
}

/**
 * Minimal IndexedDB-shaped connection for testing recovery after a browser
 * closes a previously memoised handle.  It intentionally exposes no fake data
 * store: a test must provide its own transaction callback and can therefore
 * assert that the product reopens rather than silently reusing this handle.
 */
export function makeClosedDbFaults() {
  let closed = false;
  const events = [];
  const db = {
    get closed() { return closed; },
    close() { closed = true; events.push({ op: "close" }); if (typeof db.onclose === "function") db.onclose(); },
    transaction() {
      if (closed) { events.push({ op: "transaction", fault: "InvalidStateError" }); throw storageError("InvalidStateError"); }
      events.push({ op: "transaction" });
      return { abort() { events.push({ op: "abort" }); } };
    },
    onclose: null,
  };
  return { db, events, close: () => db.close(), isClosed: () => closed };
}

