/* Apex 26 — levelled namespaced logging (global Log). Loads first per tools/manifest.cjs. */
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
  ];

  const RING = 500;
  const STORE_KEY = "apex26.logLevel";

  let consoleDefault = LEVELS.warn;
  let bufferDefault = LEVELS.info;
  const consoleNs = Object.create(null);   // ns -> level override
  const bufferNs = Object.create(null);

  const buf = [];
  let seq = 0;

  function parseLevel(name) {
    const level = LEVELS[String(name).trim().toLowerCase()];
    return level === undefined ? null : level;
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

  // Apply one spec string. Terms are `level`, `ns:level`, `buffer:level` or
  // `buffer:ns:level`. An unparseable term is ignored rather than thrown — a
  // typo in a URL must not take the game down.
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

  // Read the sticky sources once at load. Query wins over localStorage so a
  // link can override a stored setting without the player having to clear it;
  // repeated ?log= terms all apply, left to right.
  (function boot() {
    try {
      const stored = typeof localStorage !== "undefined" && localStorage.getItem(STORE_KEY);
      if (stored) applySpec(stored);
    } catch { /* privacy mode / no storage — the defaults stand */ }
    try {
      if (typeof location !== "undefined" && location.search) {
        for (const term of new URLSearchParams(location.search).getAll("log")) applySpec(term);
      }
    } catch { /* no URL host (Node VM) */ }
  })();

  function threshold(table, fallback, ns) {
    const level = table[ns];
    return level === undefined ? fallback : level;
  }

  const consoleAt = (ns) => threshold(consoleNs, consoleDefault, ns);

  // The buffer NEVER retains less than the console prints. Retaining more than
  // you print is what `buffer:debug` is for, but the reverse is a trap:
  // `logLevel("scenery:debug")` that only moved the console left the very next
  // __apex.logs() empty — and the ring is the thing read AFTER the fact.
  // Measured on a real page before this was a max().
  const bufferAt = (ns) => Math.max(threshold(bufferNs, bufferDefault, ns), consoleAt(ns));

  function enabled(ns, level) {
    return level <= bufferAt(ns);
  }

  // Records are flattened to a string HERE, not at read time: a record that
  // holds a live mesh or car object would keep it alive for the length of the
  // ring and turn a diagnostic into a leak.
  function flatten(args) {
    const out = [];
    for (const a of args) {
      if (typeof a === "string") out.push(a);
      else if (a instanceof Error) out.push(a.message + (a.stack ? "\n" + a.stack : ""));
      else {
        try { out.push(JSON.stringify(a)); }
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
      buf.push({ id: ++seq, t: now(), ns, level: NAMES[level], msg });
      if (buf.length > RING) buf.shift();
    }
    if (toConsole) {
      try { console[CONSOLE_FN[level]](`[${ns}] ${msg}`); } catch { /* console absent or stubbed */ }
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

    enabled,

    // No arg reads the resolved thresholds; a string applies a spec and returns
    // the new state, so __apex.logLevel("scenery:debug") is one round trip.
    level(spec) {
      if (spec !== undefined && spec !== null) applySpec(spec);
      return {
        console: NAMES[consoleDefault],
        buffer: NAMES[bufferDefault],
        consoleNs: mapNames(consoleNs),
        bufferNs: mapNames(bufferNs),
      };
    },

    // Persist a spec so it survives a reload — the shape a player follows when
    // asked to reproduce a bug with diagnostics on. null clears it.
    persist(spec) {
      try {
        if (spec === null) localStorage.removeItem(STORE_KEY);
        else localStorage.setItem(STORE_KEY, String(spec));
      } catch { return false; }
      if (spec !== null) applySpec(spec);
      return true;
    },

    // The retained records, newest last. `since` is a record id (see the `id`
    // field), so a poller can ask only for what it has not seen.
    records(filter) {
      const f = filter || {};
      const min = f.level === undefined ? LEVELS.trace : (parseLevel(f.level) ?? LEVELS.trace);
      let out = buf;
      if (f.ns) out = out.filter((r) => r.ns === f.ns);
      if (f.since) out = out.filter((r) => r.id > f.since);
      out = out.filter((r) => LEVELS[r.level] <= min);
      if (f.limit > 0 && out.length > f.limit) out = out.slice(-f.limit);
      return out.slice();
    },

    clear() { buf.length = 0; return true; },

    // Duration timing that costs nothing when the namespace is quiet:
    //   const done = Log.time("track", "build monza"); …; done();
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
