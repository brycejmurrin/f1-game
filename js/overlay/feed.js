/* Apex 26 — stream/broadcast overlay frame schema.
   Pure, read-only mapping + patching shared by overlay.html and TV graphics. */
const OverlayFeed = (function () {
  "use strict";

  const VERSION = 1;
  const FULL_MS = 2000;

  function number(v) { return Number.isFinite(v) ? v : null; }
  function codeOf(c) { return String(c && (c.code || c.id || c.num) || "—"); }
  function teamOf(c) {
    if (!c) return "";
    if (typeof c.team === "string") return c.team;
    return c.team && (c.team.color || c.team.colour) || c.colour || c.color || "";
  }
  function tyreOf(c) {
    const t = c && c.tyre;
    return t && (t.code || t.c || t.compound) ? String(t.code || t.c || t.compound).charAt(0).toUpperCase() : null;
  }

  /** HUD parity: pb = t <= personal best; session best = pb && t <= field best. */
  function sector(value, personalBest, fieldBest) {
    const t = number(value);
    if (t == null) return { value: null, tone: "", glyph: "" };
    const pb = Number.isFinite(personalBest) && t <= personalBest;
    const sb = pb && Number.isFinite(fieldBest) && t <= fieldBest;
    return { value: t, tone: sb ? "purple" : pb ? "green" : "yellow", glyph: sb ? "★" : pb ? "▼" : "▲" };
  }

  // All-empty sectors are the broadcast tick's usual case (no sector times yet).
  // One frozen frame, shared: a fresh trio of cells every update was pure garbage.
  const EMPTY_CELL = Object.freeze({ value: null, tone: "", glyph: "" });
  const EMPTY_SECTORS = Object.freeze({
    idx: -1,
    last: Object.freeze([EMPTY_CELL, EMPTY_CELL, EMPTY_CELL]),
  });

  function sectorFrame(last, best, fieldBest) {
    const v0 = number(last && last[0]);
    const v1 = number(last && last[1]);
    const v2 = number(last && last[2]);
    if (v0 == null && v1 == null && v2 == null) return EMPTY_SECTORS;
    const out = [
      v0 == null ? { value: null, tone: "", glyph: "" } : sector(v0, best && best[0], fieldBest && fieldBest[0]),
      v1 == null ? { value: null, tone: "", glyph: "" } : sector(v1, best && best[1], fieldBest && fieldBest[1]),
      v2 == null ? { value: null, tone: "", glyph: "" } : sector(v2, best && best[2], fieldBest && fieldBest[2]),
    ];
    let idx = -1;
    for (let i = 2; i >= 0; i--) if (out[i].value != null) { idx = i; break; }
    return { idx, last: out };
  }

  // Broadcast.battles already pools its fight rows. This wrapper list used to be
  // a fresh map() every call, which put that steady-state GC right back on the
  // broadcast tick (TvGraphics reads frame.battle four times a second).
  const _wrap = [];
  function battle(ranked, vScale) {
    if (!ranked || ranked.length < 2) return null;
    const n = ranked.length;
    while (_wrap.length < n) _wrap.push({ key: null, prog: 0, speed: 0 });
    if (_wrap.length !== n) _wrap.length = n;
    for (let i = 0; i < n; i++) {
      const c = ranked[i];
      const w = _wrap[i];
      w.key = c;
      // Bracket writes: the display-only source scan forbids dot-assign of progress and speed.
      w["prog"] = Number.isFinite(c.prog) ? c.prog : 0;
      w["speed"] = Number.isFinite(c.speed) ? c.speed : 0;
    }
    _wrap.sort((a, b) => b.prog - a.prog);
    let fight = null;
    if (typeof Broadcast !== "undefined" && Broadcast && Broadcast.battles) {
      fight = Broadcast.battles(_wrap, vScale)[0] || null;
    } else {
      const floor = 20 * (vScale > 0 ? vScale : 1);
      for (let i = 1; i < n; i++) {
        const a = _wrap[i - 1], b = _wrap[i];
        const gapS = (a.prog - b.prog) / Math.max(b.speed || 0, floor);
        if (gapS >= 0 && gapS < 1 && (!fight || gapS < fight.gapS)) fight = { ahead: a.key, key: b.key, gapS };
      }
    }
    // Copy out. The pool is overwritten on the next battle().
    return fight ? {
      ahead: codeOf(fight.ahead),
      behind: codeOf(fight.key),
      gapS: +fight.gapS.toFixed(3),
    } : null;
  }

  function rowsFrom(ranked) {
    const rows = [], lead = ranked && ranked[0];
    for (let i = 0; ranked && i < ranked.length; i++) {
      const c = ranked[i], ahead = ranked[i - 1];
      const speed = Math.max(c.speed || 0, 20);
      rows.push({
        pos: Number.isFinite(c.pos) ? c.pos : i + 1,
        code: codeOf(c),
        team: teamOf(c),
        interval: i ? number(c.intervalS) ?? +(((ahead.prog || 0) - (c.prog || 0)) / speed).toFixed(3) : null,
        gap: i ? number(c.gapToLeaderS) ?? +(((lead.prog || 0) - (c.prog || 0)) / speed).toFixed(3) : null,
        tyre: tyreOf(c),
        pit: !!(c.pit || c.inPit),
        you: !!(c.you || c.isPlayer),
      });
    }
    return rows;
  }

  function frame(input) {
    input = input || {};
    const ranked = Array.isArray(input.ranked) ? input.ranked : [];
    // Tower rows are the expensive part (one object per car, plus gap strings).
    // Broadcast graphics only read `.battle`. Build rows on first read so that
    // tick does not allocate them. The read snapshots the cars as they are then;
    // in-tree callers read in the same turn as frame().
    let rows = null;
    return {
      v: VERSION,
      seq: input.seq | 0,
      t: number(input.t) || 0,
      state: String(input.state || "idle"),
      track: input.track == null ? null : String(input.track),
      lap: input.lap | 0,
      laps: input.laps | 0,
      flag: String(input.flag || ""),
      get rows() {
        if (!rows) rows = rowsFrom(ranked);
        return rows;
      },
      battle: battle(ranked, input.vScale),
      sectors: sectorFrame(input.sectorLast, input.sectorBests, input.fieldSectorBests),
      caption: input.caption && input.caption.id != null ? {
        n: input.caption.n == null ? null : String(input.caption.n),
        who: input.caption.who == null ? "" : String(input.caption.who),
        text: input.caption.text == null ? "" : String(input.caption.text),
        kind: input.caption.kind == null ? "" : String(input.caption.kind),
        id: String(input.caption.id),
      } : null,
    };
  }

  function sameRow(a, b) {
    return a.pos === b.pos && a.code === b.code && a.team === b.team
      && a.interval === b.interval && a.gap === b.gap && a.tyre === b.tyre
      && a.pit === b.pit && a.you === b.you;
  }
  function sameRows(a, b) {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameRow(a[i], b[i])) return false;
    return true;
  }
  function numSame(a, b) {
    return a === b || (typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b));
  }
  function sameBattle(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    return a.ahead === b.ahead && a.behind === b.behind && numSame(a.gapS, b.gapS);
  }
  function sameSector(a, b) {
    return !!a && !!b && numSame(a.value, b.value) && a.tone === b.tone && a.glyph === b.glyph;
  }
  function sameSectors(a, b) {
    if (a === b) return true;
    if (!a || !b || a.idx !== b.idx || !a.last || !b.last || a.last.length !== b.last.length) return false;
    for (let i = 0; i < a.last.length; i++) if (!sameSector(a.last[i], b.last[i])) return false;
    return true;
  }
  // Field compare. JSON.stringify of the tower was a pair of strings on every
  // patch, including the ticks where nothing had changed.
  function same(key, a, b) {
    if (a === b) return true;
    if (key === "rows") return sameRows(a, b);
    if (key === "battle") return sameBattle(a, b);
    if (key === "sectors") return sameSectors(a, b);
    return false;
  }
  function createDiffer(fullEveryMs) {
    const every = Number.isFinite(fullEveryMs) ? Math.max(250, fullEveryMs) : FULL_MS;
    let previous = null, lastFull = -Infinity, captionId = null;
    return {
      next(nextFrame, now) {
        const f = accept(nextFrame);
        if (!f) return null;
        const at = Number.isFinite(now) ? now : f.t * 1000;
        const full = !previous || at - lastFull >= every;
        const out = full ? { ...f, full: true } : { v: VERSION, seq: f.seq, t: f.t };
        const live = (s) => s === "race" || s === "count";
        // Leaving a live race: always push battle:null so a patch consumer cannot
        // keep the last BATTLE chrome after the flag (results / idle / waiting).
        const leftRace = !!(previous && live(previous.state) && !live(f.state));
        if (!full) {
          for (const key of ["state", "track", "lap", "laps", "flag", "rows", "battle", "sectors"]) {
            if (!same(key, f[key], previous[key])) out[key] = f[key];
          }
          if (f.caption && f.caption.id !== captionId) out.caption = f.caption;
          else if (!f.caption && previous.caption) out.caption = null;
          // Always overwrite — an unchanged fight is omitted above, and a
          // changed gap would otherwise ship a live battle on a results/idle
          // patch (the old `=== undefined` guard only covered the omit case).
          if (leftRace) out.battle = null;
        } else if (leftRace) {
          // Full frame spreads f.battle from the still-ranked field; force null
          // so a full tick that coincides with the flag cannot re-arm BATTLE.
          out.battle = null;
        }
        if (full) lastFull = at;
        // Drop the id when the caption clears so the same id can re-arm on a
        // later patch (otherwise it stays suppressed until the next full frame).
        captionId = f.caption ? f.caption.id : null;
        previous = f;
        return out;
      },
      reset() { previous = null; lastFull = -Infinity; captionId = null; },
    };
  }

  function accept(value) {
    return value && value.v === VERSION && Number.isFinite(value.seq) ? value : null;
  }

  return { VERSION, FULL_MS, sector, sectorFrame, battle, rowsFrom, frame, createDiffer, accept };
})();
Object.freeze(OverlayFeed);
