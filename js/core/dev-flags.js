/* Apex 26 — DevFlags: one registry for boot-time URL / hash / localStorage toggles.
   Resolution order: query string, then hash (#…&name=value), then apex26.* storage.
   Bool flags: 1/on/true → on, 0/off/false → off (the set metrics-overlay always
   took). Legacy boot readers keep their old semantics so migrated call sites
   behave as before:
   - `legacyQueryOne`: only `=1` in the URL turns the flag on, and nothing in the
     URL turns it off — the old reader was `query=1 || storage==="1"`, so
     `?upscale=0` does not override a stored "1".
   - `legacyStorageOne`: storage reads exactly "1" / "0".
   - `viaStore`: storage goes through GameStore.store.raw (the reader metrics
     used), falling back to localStorage before the store loads.
   - `ciParam`: the param name matches case-insensitively (metrics' old /i);
     every other param is case-sensitive, as its old regex was. */
const DevFlags = (function () {
  "use strict";

  const PREFIX = "apex26.";

  /** @type {Record<string, { param: string, storage?: string, kind?: "bool"|"string", legacyQueryOne?: boolean, legacyStorageOne?: boolean, viaStore?: boolean, ciParam?: boolean, noHash?: boolean, default?: boolean|string|null }>} */
  const REGISTRY = {
    upscale: { param: "upscale", storage: "spatialUpscale", legacyQueryOne: true, legacyStorageOne: true, noHash: true },
    gfxdebug: { param: "gfxdebug", storage: "gfxDebug", legacyQueryOne: true, legacyStorageOne: true, noHash: true },
    inputdebug: { param: "inputdebug", storage: "inputDebug", legacyQueryOne: true, legacyStorageOne: true, noHash: true },
    metrics: { param: "metrics", storage: "metrics", legacyStorageOne: true, viaStore: true, ciParam: true, noHash: true },
    fullIntro: { param: "fullIntro", legacyQueryOne: true, noHash: true, default: false },
    "three-devtools": { param: "three-devtools", legacyQueryOne: true, noHash: true, default: false },
    viz: { param: "viz", storage: "tlxViz", kind: "string", noHash: true, default: null },
  };

  function parseBoolish(raw) {
    if (raw == null || raw === "") return null;
    const s = String(raw).trim().toLowerCase();
    if (/^(1|on|true)$/.test(s)) return true;
    if (/^(0|off|false)$/.test(s)) return false;
    return null;
  }

  // Legacy `=1` readers: "1" turns the flag on; anything else defers to storage.
  function parseLegacyOne(raw) {
    return raw != null && String(raw).trim() === "1" ? true : null;
  }

  function searchGet(param, ci) {
    try {
      if (typeof location === "undefined" || !location.search) return null;
      const esc = param.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const m = new RegExp("[?&]" + esc + "=([^&]*)", ci ? "i" : "").exec(location.search);
      return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : null;
    } catch (_) { return null; }
  }

  function hashGet(param) {
    try {
      const h = typeof location !== "undefined" && location.hash ? String(location.hash) : "";
      if (!h) return null;
      const esc = param.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const m = new RegExp("[#&]" + esc + "=([^&]*)", "i").exec(h);
      return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : null;
    } catch (_) { return null; }
  }

  function storageGet(shortKey, viaStore) {
    if (!shortKey) return null;
    try {
      if (viaStore && typeof GameStore !== "undefined" && GameStore.store && GameStore.store.raw)
        return GameStore.store.raw(PREFIX + shortKey);
      if (typeof localStorage === "undefined") return null;
      return localStorage.getItem(PREFIX + shortKey);
    } catch (_) { return null; }
  }

  function resolveBool(def, name) {
    const param = def.param || name;
    const q = searchGet(param, def.ciParam);
    const fromQuery = def.legacyQueryOne ? parseLegacyOne(q) : parseBoolish(q);
    if (fromQuery !== null) return fromQuery;

    if (!def.noHash) {
      const fromHash = def.legacyQueryOne ? parseLegacyOne(hashGet(param)) : parseBoolish(hashGet(param));
      if (fromHash !== null) return fromHash;
    }

    if (def.storage) {
      const raw = storageGet(def.storage, def.viaStore);
      if (def.legacyStorageOne) {
        if (raw === "1") return true;
        if (raw === "0") return false;
      } else {
        const fromStore = parseBoolish(raw);
        if (fromStore !== null) return fromStore;
      }
    }

    return def.default === undefined ? false : !!def.default;
  }

  function resolveString(def, name) {
    const param = def.param || name;
    const q = searchGet(param, def.ciParam);
    if (q != null && q !== "") return q;
    if (!def.noHash) {
      const h = hashGet(param);
      if (h != null && h !== "") return h;
    }
    const raw = def.storage ? storageGet(def.storage, def.viaStore) : null;
    if (raw != null && raw !== "") return raw;
    return def.default === undefined ? null : def.default;
  }

  function get(name) {
    const def = REGISTRY[name];
    if (!def) return undefined;
    if (def.kind === "string") return resolveString(def, name);
    return resolveBool(def, name);
  }

  function flags() {
    const out = {};
    for (const name of Object.keys(REGISTRY)) out[name] = get(name);
    return out;
  }

  function names() {
    return Object.keys(REGISTRY);
  }

  return { get, flags, names, REGISTRY };
})();

if (typeof window !== "undefined") window.DevFlags = DevFlags;
