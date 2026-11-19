const DevFlags = (function () {
  "use strict";

  const PREFIX = "apex26.";

  const REGISTRY = {
    upscale: { param: "upscale", storage: "spatialUpscale", legacyQueryOne: true, legacyStorageOne: true },
    gfxdebug: { param: "gfxdebug", storage: "gfxDebug", legacyQueryOne: true, legacyStorageOne: true },
    inputdebug: { param: "inputdebug", storage: "inputDebug", legacyQueryOne: true, legacyStorageOne: true },
    metrics: { param: "metrics", storage: "metrics", legacyStorageOne: true, viaStore: true, ciParam: true },
    fullIntro: { param: "fullIntro", legacyQueryOne: true, default: false },
    "three-devtools": { param: "three-devtools", legacyQueryOne: true, default: false },
    viz: { param: "viz", storage: "tlxViz", kind: "string", default: null },
    mirMrt: { param: "tlxMirMrt", default: true },
    swFlyby: { param: "swFlyby", legacyQueryOne: true, default: false },
  };

  function parseBoolish(raw) {
    if (raw == null || raw === "") return null;
    const s = String(raw).trim().toLowerCase();
    if (/^(1|on|true)$/.test(s)) return true;
    if (/^(0|off|false)$/.test(s)) return false;
    return null;
  }

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
