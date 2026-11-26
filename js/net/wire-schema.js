/* NetWire — the ONE declaration of every reliable VS FRIEND event (#6859 phase 1).

   Each row names who may SEND it (`from`: host | guest | any), the largest
   frame it may arrive in (`maxBytes`, the whole {"t","d"} JSON), the rate
   bucket it draws from (`rate`, a key of RATES), and a pure decode(d) that
   returns a normalised value or null. NetSession.onEventJson runs the row
   (size, then decode, then sender role) before any handler; an undeclared
   type or a refused payload is dropped and counted, never handed on raw.

   Scalar rows decode to a FROZEN value with only their declared fields.
   Structural rows (HELLO, SETTINGS, STRATEGY, CAUTION, RESULT) decode to a
   bounded plain copy — own enumerable JSON data, no `__proto__` key, capped
   depth and width — that their owner's deep validator (LobbyRoster.cleanHello,
   normaliseSettings, applyStrategy, raceCtl.apply, validClassification) then
   narrows; it is not frozen because those owners keep and edit it.

   decode is idempotent: decode(decode(x)) equals decode(x), so a test session
   that hands raw payloads straight to a handler is wrapped by on() and sees
   the same value a NetSession would deliver.

   RATES + bucket(): ONE rate primitive for every per-connection cap (it
   replaced the lobby's and QualiWire's two copies): at most `limit` per
   rolling windowMs. */
"use strict";

const NetWire = (function () {
  const EV = {
    MODEL: "model", STRATEGY: "strategy", // versioned reliable compatibility + tyre/pit state
    HELLO: "hello",                       // profile exchange — re-sent on every change
    SETTINGS: "settings",                 // host -> guest race setup (live, in the room)
    READY: "ready",                       // either way: I am done choosing
    GO: "go",                             // host -> guest: leave the room, build the race
    START: "start",                       // host -> guest lights-out tick
    ARMED: "armed",                       // guest -> host: my circuit is built, name the moment
    QUALI: "quali",                       // a driven qualifying lap: {driverId, t}
    QLIVE: "qlive",
    LAP: "lap",                           // completed lap / sector
    RESULT: "result",                     // final classification
    CAUTION: "caution",                   // host -> guest race control (flags)
    BYE: "bye",                           // clean leave
    LEFT: "left",                         // host -> guests: this wire id went back to AI
  };
  // Lobby-local types (NetLobby): not on NetPlay.EV, declared here all the same.
  const LOBBY_EV = {
    QABORT: "qabort",   // guest -> host "left quali sheet"
    QGO: "qgo",         // host -> guest "quali is over, I am starting the race"
  };

  // Per connection, per EVENT_WINDOW_MS. `guest` is what a GUEST accepts on its
  // one link, which is the host relaying the whole room (MAX_GUESTS + 1 = 4 seats).
  const EVENT_WINDOW_MS = 1000;
  const RATES = Object.freeze({
    roster: Object.freeze({ host: 5, guest: 5 }),     // HELLO / READY / SETTINGS (guests coalesce, latest wins)
    quali: Object.freeze({ host: 12, guest: 48 }),    // QUALI + QLIVE share one bucket (#1414, #5012)
    lap: Object.freeze({ host: 4 }),                  // host ingress only: it relays to every guest
    strategy: Object.freeze({ host: 8 }),
    model: Object.freeze({ host: 4 }),                // a start + its ack each count (#6623)
    qabort: Object.freeze({ host: 2 }),
  });

  // The shared rate primitive: at most `limit` takes in any rolling windowMs.
  // Deliberately not a refilling token bucket: one of those admits a full
  // burst AND the tokens refilled during it, up to ~2x the cap in one window,
  // which is looser than both gates it replaces promised (#6859 phase 1).
  // It holds at most `limit` stamps. `clock` is for tests.
  function bucket(limit, windowMs = EVENT_WINDOW_MS, clock) {
    const now = typeof clock === "function" ? clock : () => performance.now();
    const stamps = [];
    const expire = (t) => { while (stamps.length && t - stamps[0] > windowMs) stamps.shift(); };
    return {
      take() {
        const t = now();
        expire(t);
        if (stamps.length >= limit) return false;
        stamps.push(t);
        return true;
      },
      // ms until take() would pass (0 = now).
      waitMs() {
        const t = now();
        expire(t);
        return stamps.length < limit ? 0 : Math.max(0, windowMs - (t - stamps[0]));
      },
    };
  }
  // The bucket a row's rate key declares for this receiving role, or null (no cap).
  function gate(key, role) {
    const r = RATES[key];
    const limit = r && (role === "host" ? r.host : r.guest);
    return limit > 0 ? bucket(limit) : null;
  }

  // ---- decoders -----------------------------------------------------------
  const isObj = (d) => !!d && typeof d === "object" && !Array.isArray(d);
  const str = (v, max) => (typeof v === "string" && v.length <= max ? v : undefined);
  const fin = (v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const scalar = (v, max = 64) => (typeof v === "number" || typeof v === "boolean" || v === null) ? v
    : (typeof v === "string" && v.length <= max ? v : undefined);
  // An id the host mints ("gN") or a numeric wire id.
  const peerId = (v) => (typeof v === "number" ? fin(v) : str(v, 64));
  function frozen(o) {
    for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
    return Object.freeze(o);
  }
  const EMPTY = Object.freeze({});

  // A bounded plain copy of parsed JSON. null when it exceeds the bounds. The
  // `__proto__` key JSON.parse creates as an OWN property is dropped: an
  // Object.assign of it (the HELLO relay) would re-parent the target.
  const PLAIN = { depth: 8, keys: 256, items: 8192, string: 32768, nodes: 50000 };
  function plain(v) {
    let nodes = 0;
    function copy(x, depth) {
      if (++nodes > PLAIN.nodes) throw RangeError("nodes");
      // JSON.stringify semantics for what a wire never carries (a test double
      // hands objects straight over): undefined/function drop, in arrays null.
      if (x === undefined || typeof x === "function" || typeof x === "symbol") return undefined;
      if (x === null || typeof x === "boolean") return x;
      if (typeof x === "number") return x;
      if (typeof x === "string") { if (x.length > PLAIN.string) throw RangeError("string"); return x; }
      if (typeof x !== "object" || depth >= PLAIN.depth) throw RangeError("shape");
      if (Array.isArray(x)) {
        if (x.length > PLAIN.items) throw RangeError("items");
        const out = new Array(x.length);
        for (let i = 0; i < x.length; i++) { const c = copy(x[i], depth + 1); out[i] = c === undefined ? null : c; }
        return out;
      }
      const keys = Object.keys(x);
      if (keys.length > PLAIN.keys) throw RangeError("keys");
      const out = {};
      for (const k of keys) {
        if (k === "__proto__") continue;
        const c = copy(x[k], depth + 1);
        if (c !== undefined) out[k] = c;
      }
      return out;
    }
    try { return copy(v, 0); } catch (e) { return null; }
  }
  const plainObject = (d) => (isObj(d) ? plain(d) : null);

  // QUALI: a driven lap, bounded to one a human can drive (20 s .. 1 h). NO TIME
  // (every lap deleted) crosses as {noTime: true} and arrives as t = Infinity.
  const QUALI_MIN_S = 20, QUALI_MAX_S = 3600;
  function validQuali(d) {
    if (!isObj(d) || d.driverId == null) return null;
    const driverId = scalar(d.driverId);
    if (driverId === undefined || driverId === null) return null;
    if (d.noTime === true) return Object.freeze({ driverId, t: Infinity, noTime: true });
    const t = Number(d.t);
    if (!(Number.isFinite(t) && t > QUALI_MIN_S && t < QUALI_MAX_S)) return null;
    return Object.freeze({ driverId, t });
  }
  // QLIVE never reaches the classification — it is bounded rather than refused.
  function validQualiLive(d) {
    if (!isObj(d) || d.driverId == null) return null;
    const driverId = scalar(d.driverId);
    if (driverId === undefined || driverId === null) return null;
    const t = Number(d.t), frac = Number(d.frac);
    return Object.freeze({
      driverId,
      t: Number.isFinite(t) && t >= 0 ? Math.min(t, QUALI_MAX_S) : 0,
      frac: Number.isFinite(frac) ? Math.min(Math.max(frac, 0), 1) : 0,
    });
  }
  // A peer's LAP keeps only these scalar fields: nothing else of a hostile
  // peer's payload is pinned for the rest of the race (#6624).
  const LAP_KEYS = ["lap", "time", "best", "code", "driverId", "fin", "retired", "invalid", "epoch"];
  function lapRecord(d) {
    if (!isObj(d)) return null;
    const out = {};
    for (const k of LAP_KEYS) { const v = scalar(d[k]); if (v !== undefined) out[k] = v; }
    return Object.freeze(out);
  }
  const RESULT_KEYS = ["d", "t", "p", "lap", "classified", "r"];
  function resultRows(d) {
    if (!Array.isArray(d) || d.length > 64) return null;
    const rows = [];
    for (const e of d) {
      if (!isObj(e)) return null;
      const row = {};
      // A long reason ("DSQ — " + c.dsq) is truncated, not dropped: the guest keeps the label.
      for (const k of RESULT_KEYS) { const v = typeof e[k] === "string" ? e[k].slice(0, 128) : scalar(e[k]); if (v !== undefined) row[k] = v; }
      rows.push(row);
    }
    return rows;
  }

  // ---- the table ----------------------------------------------------------
  /** @type {Record<string, {from: string, maxBytes: number, rate: string|null, decode: (d: any) => any}>} */
  const ROWS = {
    [EV.MODEL]: { from: "any", maxBytes: 512, rate: "model", decode: (d) => !isObj(d) ? null : frozen({
      physics: scalar(d.physics), strategy: scalar(d.strategy), epoch: str(d.epoch, 64), ack: d.ack === true ? true : undefined }) },
    // A full state carries up to STINT_MAX (256) stints at ~130 B each with 64-char ids: ~33 KB.
    [EV.STRATEGY]: { from: "any", maxBytes: 65536, rate: "strategy", decode: plainObject },
    [EV.HELLO]: { from: "any", maxBytes: 16384, rate: "roster", decode: plainObject },
    [EV.SETTINGS]: { from: "host", maxBytes: 32768, rate: "roster", decode: plainObject },
    [EV.READY]: { from: "any", maxBytes: 256, rate: "roster", decode(d) {
      if (!isObj(d) || typeof d.ready !== "boolean") return null;
      if (d.revision != null && !(Number.isSafeInteger(d.revision) && d.revision >= 0)) return null;
      return frozen({ ready: d.ready, revision: d.revision == null ? undefined : d.revision, from: peerId(d.from) });
    } },
    [EV.GO]: { from: "host", maxBytes: 256, rate: null, decode(d) {
      if (d != null && !isObj(d)) return null;
      const rev = d ? d.revision : null;
      if (rev != null && !(Number.isSafeInteger(rev) && rev >= 0)) return null;
      return frozen({ revision: rev == null ? undefined : rev });
    } },
    [EV.START]: { from: "host", maxBytes: 256, rate: null, decode(d) {
      if (!isObj(d)) return null;
      const at = Number(d.at), h = Number(d.hold);
      if (d.at == null || !Number.isFinite(at)) return null;
      // A missing or hostile hold made countT NaN or 1e9: the guest sat on the grid forever.
      return frozen({ at, hold: Number.isFinite(h) ? Math.min(2, Math.max(0, h)) : 0.5 });
    } },
    [EV.ARMED]: { from: "guest", maxBytes: 128, rate: null, decode: () => EMPTY },
    [EV.QUALI]: { from: "any", maxBytes: 256, rate: "quali", decode: validQuali },
    [EV.QLIVE]: { from: "any", maxBytes: 256, rate: "quali", decode: validQualiLive },
    [EV.LAP]: { from: "any", maxBytes: 1024, rate: "lap", decode: lapRecord },
    [EV.RESULT]: { from: "host", maxBytes: 8192, rate: null, decode: resultRows },
    [EV.CAUTION]: { from: "host", maxBytes: 4096, rate: null, decode: plainObject },
    [EV.BYE]: { from: "any", maxBytes: 128, rate: null, decode: () => EMPTY },
    [EV.LEFT]: { from: "host", maxBytes: 256, rate: null, decode: (d) => !isObj(d) ? null : frozen({
      wire: fin(d.wire), why: typeof d.why === "string" && d.why ? d.why.slice(0, 32) : undefined,
      from: peerId(d.from), evicted: d.evicted === true ? true : undefined }) },
    [LOBBY_EV.QABORT]: { from: "guest", maxBytes: 128, rate: "qabort", decode: () => EMPTY },
    [LOBBY_EV.QGO]: { from: "host", maxBytes: 128, rate: null, decode: () => EMPTY },
  };
  for (const k of Object.keys(ROWS)) Object.freeze(ROWS[k]);
  Object.freeze(ROWS);
  // Nothing larger is parsed at all.
  const MAX_FRAME_BYTES = Math.max(...Object.values(ROWS).map((r) => r.maxBytes));

  const row = (t) => (typeof t === "string" && Object.prototype.hasOwnProperty.call(ROWS, t) ? ROWS[t] : null);
  // May a peer of the other role send `t` to a receiver playing `role`? A
  // receiver with no role (a bare test session) gates nothing.
  function roleOk(r, role) {
    if (!role || r.from === "any") return true;
    return role === "host" ? r.from === "guest" : r.from === "host";
  }
  // Decode a value for type t, or null. Unknown types are null.
  function decode(t, d) {
    const r = row(t);
    if (!r) return null;
    const v = r.decode(d);
    return v === undefined ? null : v;
  }
  // The full ingress check on one raw frame (string or bytes length `bytes`).
  // Returns {t, d} or {drop: reason}. Order: size, parse, type, decode, role.
  function accept(raw, bytes, role) {
    if (!(bytes <= MAX_FRAME_BYTES)) return { drop: "oversize" };
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return { drop: "malformed" }; }
    if (!msg || typeof msg !== "object" || typeof msg.t !== "string") return { drop: "malformed" };
    const r = row(msg.t);
    if (!r) return { drop: "undeclared" };
    if (bytes > r.maxBytes) return { drop: "oversize" };
    const v = r.decode(msg.d);
    if (v === null || v === undefined) return { drop: "invalid" };
    if (!roleOk(r, role)) return { drop: "role" };
    return { t: msg.t, d: v };
  }
  // Register fn for t on any session-like object. A NetSession already decodes
  // (wireDecoded); any other session (a test double) is decoded here, so a
  // handler never reads a raw payload either way.
  function on(s, t, fn) {
    if (s && s.wireDecoded === true) return s.onEvent(t, fn);
    return s.onEvent(t, (d, type) => {
      const v = decode(t, d);
      if (v !== null) fn(v, type);
    });
  }

  return Object.freeze({
    EV: Object.freeze(EV), LOBBY_EV: Object.freeze(LOBBY_EV), ROWS, RATES, EVENT_WINDOW_MS, MAX_FRAME_BYTES,
    QUALI_MIN_S, QUALI_MAX_S, LAP_KEYS,
    bucket, gate, row, roleOk, decode, accept, on,
    validQuali, validQualiLive, lapRecord, plain,
  });
})();
