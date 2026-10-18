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

  function sectorFrame(last, best, fieldBest) {
    const out = [];
    for (let i = 0; i < 3; i++) out.push(sector(last && last[i], best && best[i], fieldBest && fieldBest[i]));
    return { idx: out.findLastIndex((s) => s.value != null), last: out };
  }

  function battle(ranked, vScale) {
    if (!ranked || ranked.length < 2) return null;
    const input = ranked.map((c) => ({
      key: c,
      prog: Number.isFinite(c.prog) ? c.prog : 0,
      speed: Number.isFinite(c.speed) ? c.speed : 0,
    })).sort((a, b) => b.prog - a.prog);
    let fight = null;
    if (typeof Broadcast !== "undefined" && Broadcast && Broadcast.battles) {
      fight = Broadcast.battles(input, vScale)[0] || null;
    } else {
      for (let i = 1; i < input.length; i++) {
        const a = input[i - 1], b = input[i];
        const gapS = (a.prog - b.prog) / Math.max(b.speed || 0, 20 * (vScale > 0 ? vScale : 1));
        if (gapS >= 0 && gapS < 1 && (!fight || gapS < fight.gapS)) fight = { ahead: a.key, key: b.key, gapS };
      }
    }
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
    return {
      v: VERSION,
      seq: input.seq | 0,
      t: number(input.t) || 0,
      state: String(input.state || "idle"),
      track: input.track == null ? null : String(input.track),
      lap: input.lap | 0,
      laps: input.laps | 0,
      flag: String(input.flag || ""),
      rows: rowsFrom(ranked),
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

  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
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
        if (!full) {
          for (const key of ["state", "track", "lap", "laps", "flag", "rows", "battle", "sectors"]) {
            if (!same(f[key], previous[key])) out[key] = f[key];
          }
          if (f.caption && f.caption.id !== captionId) out.caption = f.caption;
          else if (!f.caption && previous.caption) out.caption = null;
        }
        if (full) lastFull = at;
        if (f.caption) captionId = f.caption.id;
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
