const Log = (function () {
  "use strict";

  const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4, trace: 5 };
  const NAMES = ["silent", "error", "warn", "info", "debug", "trace"];
  const CONSOLE_FN = [null, "error", "warn", "info", "log", "debug"];

  const NAMESPACES = [
    "scenery",
    "track",
    "gfx",
    "game",
    "data",
    "net",
    "audio",
    "assets",
    "apex",
    "car",
    "ui",
    "input",
    "race",
    "xr",
    "sw",
    "i18n",
  ];

  const RING = 500;
  const STORE_KEY = "apex26.logLevel";

  let consoleDefault = LEVELS.warn;
  let bufferDefault = LEVELS.info;
  const consoleNs = Object.create(null);
  const bufferNs = Object.create(null);

  const buf = new Array(RING);
  let bufHead = 0;
  let bufLen = 0;
  let seq = 0;

  function parseLevel(name) {
    const level = LEVELS[String(name).trim().toLowerCase()];
    return typeof level === "number" ? level : null;
  }

  function wipe(table) { for (const k in table) delete table[k]; }

  function mapNames(table) {
    const out = {};
    for (const k in table) out[k] = NAMES[table[k]];
    return out;
  }

  function now() {
    try { return Math.round(performance.now()); } catch { return 0; }
  }

  function applySpec(spec) {
    if (!spec) return;
    for (const rawTerm of String(spec).split(",")) {
      let term = rawTerm.trim();
      if (!term) continue;
      const toBuffer = /^buffer:/i.test(term);
      if (toBuffer) term = term.slice(7);
      const colon = term.lastIndexOf(":");
      const ns = colon < 0 ? null : term.slice(0, colon).trim();
      const level = parseLevel(colon < 0 ? term : term.slice(colon + 1));
      if (level === null) continue;
      const table = toBuffer ? bufferNs : consoleNs;
      if (ns && ns !== "*") { table[ns] = level; continue; }
      if (toBuffer) bufferDefault = level;
      else consoleDefault = level;
      wipe(table);
    }
  }

  (function boot() {
    try {
      const stored = typeof localStorage !== "undefined" && localStorage.getItem(STORE_KEY);
      if (stored) applySpec(stored);
    } catch {  }
    try {
      if (typeof location !== "undefined" && location.search) {
        for (const term of new URLSearchParams(location.search).getAll("log")) applySpec(term);
      }
    } catch {  }
  })();

  function threshold(table, fallback, ns) {
    const level = table[ns];
    return level === undefined ? fallback : level;
  }

  const consoleAt = (ns) => threshold(consoleNs, consoleDefault, ns);

  const bufferAt = (ns) => Math.max(threshold(bufferNs, bufferDefault, ns), consoleAt(ns));

  function enabled(ns, level) {
    return level <= bufferAt(ns);
  }

  function flatten(args) {
    const out = [];
    for (const a of args) {
      if (typeof a === "string") out.push(a);
      else if (a instanceof Error) out.push(a.message + (a.stack ? "\n" + a.stack : ""));
      else {
        try { const j = JSON.stringify(a); out.push(j === undefined ? String(a) : j); }
        catch { out.push(String(a)); }
      }
    }
    return out.join(" ");
  }

  function emit(level, ns, args) {
    const toConsole = level <= consoleAt(ns);
    const toBuffer = level <= bufferAt(ns);
    if (!toConsole && !toBuffer) return;

    const msg = flatten(args);
    if (toBuffer) {
      buf[bufHead] = { id: ++seq, t: now(), ns, level: NAMES[level], msg };
      bufHead = (bufHead + 1) % RING;
      if (bufLen < RING) bufLen++;
    }
    if (toConsole) {
      try { console[CONSOLE_FN[level]](`[${ns}] ${msg}`); } catch {  }
    }
  }

  return {
    SILENT: 0, ERROR: 1, WARN: 2, INFO: 3, DEBUG: 4, TRACE: 5,
    LEVELS,
    NAMESPACES,

    error(ns, ...args) { emit(LEVELS.error, ns, args); },
    warn(ns, ...args) { emit(LEVELS.warn, ns, args); },
    info(ns, ...args) { emit(LEVELS.info, ns, args); },
    debug(ns, ...args) { emit(LEVELS.debug, ns, args); },
    trace(ns, ...args) { emit(LEVELS.trace, ns, args); },

    enabled,

    level(spec) {
      if (spec !== undefined && spec !== null) applySpec(spec);
      return {
        console: NAMES[consoleDefault],
        buffer: NAMES[bufferDefault],
        consoleNs: mapNames(consoleNs),
        bufferNs: mapNames(bufferNs),
      };
    },

    persist(spec) {
      try {
        if (spec === null) localStorage.removeItem(STORE_KEY);
        else localStorage.setItem(STORE_KEY, String(spec));
      } catch { return false; }
      if (spec !== null) applySpec(spec);
      return true;
    },

    records(filter) {
      const f = filter || {};
      const min = f.level === undefined ? LEVELS.trace : (parseLevel(f.level) ?? LEVELS.trace);
      const out = [];
      const start = bufLen < RING ? 0 : bufHead;
      for (let i = 0; i < bufLen; i++) {
        const r = buf[(start + i) % RING];
        if (f.ns && r.ns !== f.ns) continue;
        if (f.since && !(r.id > f.since)) continue;
        if (!(LEVELS[r.level] <= min)) continue;
        out.push(r);
      }
      if (f.limit > 0 && out.length > f.limit) return out.slice(-f.limit);
      return out;
    },

    clear() { bufHead = 0; bufLen = 0; return true; },

    time(ns, label) {
      if (!enabled(ns, LEVELS.info)) return () => {};
      const t0 = now();
      return (extra) => {
        emit(LEVELS.info, ns, [`${label} ${now() - t0}ms${extra ? ` ${extra}` : ""}`]);
      };
    },
  };
})();

if (typeof window !== "undefined") window.Log = Log;
