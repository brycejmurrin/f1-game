/* StrategyWire — the versioned tyre and pit payload on the reliable channel.
   Peeled from NetPlay. create() returns the codec; strategyState, applyStrategy
   and STRATEGY_VERSION stay on NetPlay. modelRevision reads PhysicsConsts when
   a packet is built, so this file has no eval-time edge on it. The race-epoch
   counter stays in NetPlay: it numbers this peer's epochs, not the tyre payload. */
"use strict";

const StrategyWire = (function () {
  function create() {
    const STRATEGY_VERSION = 1;
    const modelRevision = () => typeof PhysicsConsts !== "undefined" ? PhysicsConsts.REVISION : "2026-09-coherence-1";
    const STRATEGY_FIELDS = { tyreWear: [0, 3], tyreWearF: [0, 3], tyreWearR: [0, 3], tyreTs: [0, 250], tyreTb: [0, 250],
      tyreGrain: [0, 1], tyreBlister: [0, 1], tyreLap0: [0, 1000], tyreStints: [0, 1000], pitStops: [0, 1000], pitT: [0, 30],
      tyreLapAdj: [0, 1], pitWorked: [0, 30], pitOutT: [0, 30] };
    const STINT_MAX = 256, COMPOUND_CODES = ["S", "M", "H", "I", "W"];
    const colourFor = (r) => Array.isArray(r.colour) && r.colour.length === 3
      ? r.colour.map(v => Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5) : [0.5, 0.5, 0.5];
    function strategyTyre(r) {
      if (!r || typeof r.id !== "string" || !Number.isInteger(r.tread) || r.tread < 0 || r.tread > 2
          || !Number.isFinite(r.life) || r.life < 0.3 || r.life > 1.2) return null;
      const mods = {};
      for (const k of ["speed", "accel", "cornering", "braking"]) if (r.mods && Number.isFinite(r.mods[k])) mods[k] = Math.max(0.5, Math.min(1.5, r.mods[k]));
      return { id: r.id.slice(0, 64), code: String(r.code || "?").slice(0, 4), life: r.life, tread: r.tread,
        off: Number.isFinite(r.off) ? Math.max(-0.2, Math.min(0.2, r.off)) : 0, colour: colourFor(r), mods };
    }
    function strategyLog(log) {
      if (!Array.isArray(log)) return null;
      const rows = [];
      for (const e of log) {
        if (!e || !COMPOUND_CODES.includes(e.code) || typeof e.id !== "string" || !Number.isFinite(e.lap0)
            || e.lap0 < 0 || e.lap0 > 1000 || (e.lap1 !== null && (!Number.isFinite(e.lap1) || e.lap1 < 0 || e.lap1 > 1000))) return null;
        rows.push({ code: e.code, id: e.id.slice(0, 64), colour: colourFor(e), lap0: e.lap0, lap1: e.lap1 });
      }
      return rows;
    }
    function boundedLog(log) {
      if (!Array.isArray(log)) return [];
      if (log.length <= STINT_MAX) return strategyLog(log) || [];
      // Keep each compound's first evidence as well as the recent strip. Simply
      // taking the tail could erase a wet exemption or the second dry compound.
      const first = new Set(COMPOUND_CODES.map(code => log.findIndex(e => e && e.code === code)));
      return strategyLog(log.filter((e, i) => first.has(i) || i >= log.length - (STINT_MAX - COMPOUND_CODES.length))) || [];
    }
    const FIELD_KEYS = Object.keys(STRATEGY_FIELDS);
    // scalarsOnly: the 1 Hz refresh between phases. The fitted set, pending set
    // and stint log only change on a phase (pit, fit, new set), which always
    // sends the full state, so the refresh omits them — the v1 receiver keeps
    // its copy of an absent extension (applyStrategy). ~742 B/car before.
    function strategyState(c, wire, track, scalarsOnly) {
      const fields = {};
      for (const k of FIELD_KEYS) if (Number.isFinite(c[k])) fields[k] = c[k];
      const d = { version: STRATEGY_VERSION, physics: modelRevision(), wire, track, fields,
        tread: c.tread, pitState: c.pitState || "none", pitArmed: !!c.pitArmed,
        pitFitted: !!c.pitFitted, tyreClass: ["soft", "medium", "hard", "inter", "wet"].includes(c.tyreClass) ? c.tyreClass : null,
        compoundShortAtFinish: typeof c.compoundShortAtFinish === "boolean" ? c.compoundShortAtFinish : null,
        tyrePhysicalOffset: Number.isFinite(c.tyrePhysicalOffset) ? Math.max(-1000, Math.min(1000, c.tyrePhysicalOffset)) : null };
      if (!scalarsOnly) { d.tyre = strategyTyre(c.tyre); d.pitNext = strategyTyre(c.pitNext); d.tyreLog = boundedLog(c.tyreLog); }
      return d;
    }
    function applyStrategy(c, d) {
      if (!c || !d || d.version !== STRATEGY_VERSION || d.physics !== modelRevision() || !d.fields) return false;
      const tyre = strategyTyre(d.tyre), next = strategyTyre(d.pitNext);
      const log = d.tyreLog === undefined ? null : Array.isArray(d.tyreLog) && d.tyreLog.length <= STINT_MAX ? strategyLog(d.tyreLog) : null;
      // Extensions are optional for older v1 senders, and validate BEFORE any
      // mutation. Never merge stale pending sets/history into a newer full state.
      if ((d.pitFitted !== undefined && typeof d.pitFitted !== "boolean") || (d.pitNext !== undefined && d.pitNext !== null && !next)
          || (d.tyreLog !== undefined && !log) || (d.tyreClass !== undefined && d.tyreClass !== null && !["soft", "medium", "hard", "inter", "wet"].includes(d.tyreClass))
          || (d.compoundShortAtFinish !== undefined && d.compoundShortAtFinish !== null && typeof d.compoundShortAtFinish !== "boolean")
          || (d.tyrePhysicalOffset !== undefined && d.tyrePhysicalOffset !== null && (!Number.isFinite(d.tyrePhysicalOffset) || Math.abs(d.tyrePhysicalOffset) > 1000))) return false;
      if (tyre) {
        c.tyre = tyre;
        c.tread = c.tyre.tread;
      } else if (Number.isInteger(d.tread) && d.tread >= 0 && d.tread <= 2) c.tread = d.tread;
      for (const [k, range] of Object.entries(STRATEGY_FIELDS)) {
        if (Number.isFinite(d.fields[k])) c[k] = Math.max(range[0], Math.min(range[1], d.fields[k]));
      }
      if (["none", "lane", "box", "out"].includes(d.pitState)) c.pitState = d.pitState;
      c.pitArmed = d.pitArmed === true;
      if (d.pitFitted !== undefined) c.pitFitted = d.pitFitted;
      if (d.pitNext !== undefined) c.pitNext = next;
      if (d.tyreClass != null) c.tyreClass = d.tyreClass;
      if (log) c.tyreLog = log;
      if (d.compoundShortAtFinish !== undefined) c.compoundShortAtFinish = d.compoundShortAtFinish;
      if (d.tyrePhysicalOffset !== undefined) c.tyrePhysicalOffset = d.tyrePhysicalOffset;
      return true;
    }
    return { strategyState, applyStrategy, STRATEGY_VERSION, modelRevision };
  }
  return { create };
})();
Object.freeze(StrategyWire);
