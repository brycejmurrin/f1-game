const TrackPit = (function () {
  "use strict";

  const BANDS = { verge: 2.0, platform: 2.0, fast: 3.5, corridor: 1.0, work: 5.5 };
  const STREET = { verge: 0.6, platform: 1.6, fast: 3.2, corridor: 1.0, work: 4.2 };
  const NARROW = { verge: 0.6, platform: 0.0, fast: 3.0, corridor: 0.6, work: 3.4 };

  const BAY = { w: 10.8, gap: 0.2, depth: 12.8, h: 5.0, doorW: 5.4, doorH: 4.8 };
  const PITCH = BAY.w + BAY.gap;
  const BOX_LEN = 8;
  const SIGN = { w: 1024, h: 1024, cols: 2, cells: 12, cellW: 512, cellH: 70,
                 quadW: 5.2, quadH: 0.7, y0: 4.85, proud: 0.275,
                 crests: 12, crestPx: 160, crestCols: 6, crestY: 512, crestW: 1.8, crestY0: 1.5,
                 boards: 2, boardW: 2.4, boardH: 0.33, boardY: 1.5, boardM: [45, 110],
                 signals: 2, signalPx: 64, signalY: 848, signalW: 0.34 };
  const EXIT_WALL_W = 0.75;

  const ENTRY_MAX = 260, ENTRY_MIN = 150, EXIT_M = 110, EXIT_MIN = 40;
  const PIT_K = 0.0035, STEP = 8;
  const ENTRY_ROAD = 70, EXIT_ROAD = 90, ROAD_MIN = 30, WALL_GROW = 30;
  const MOUTH_RUN = 20;
  const EXIT_ROAD_MIN = 80;
  const ENTRY_ROAD_MIN = 60;
  const MERGE_RUN = 40;
  const LIMIT_KPH = 80, LIMIT_KPH_STREET = 60;
  const GRID_POLE_M = 14, GRID_CLEAR = 40, ROW_END = 30, ROW_TAIL = 16;
  const BAY_FLARE = 24;

  const wrap = (v, L) => ((v % L) + L) % L;
  const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

  function architecture(spec) {
    if (!spec || typeof spec !== "object" || !Array.isArray(spec.roofProfile)) return null;
    const profile = spec.roofProfile;
    if (profile.length < 2 || profile.length > 7) return null;
    let previous = -1;
    for (const knot of profile) {
      if (!Array.isArray(knot) || knot.length !== 3 || !Array.from(knot).every(Number.isFinite) ||
          knot[0] < 0 || knot[0] > 1 || knot[0] <= previous ||
          knot[1] < 9.6 || knot[1] > 18 || knot[2] < 9.6 || knot[2] > 18) return null;
      previous = knot[0];
    }
    if (profile[0][0] !== 0 || profile[profile.length - 1][0] !== 1) return null;
    const result = { roofProfile: profile.map((knot) => knot.slice()) };
    for (const key of ["roofColor", "fasciaColor", "soffitColor", "edgeColor"]) {
      const color = spec[key];
      if (color === undefined) continue;
      if (!Array.isArray(color) || color.length !== 3 ||
          !Array.from(color).every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) return null;
      result[key] = color.slice();
    }
    return result;
  }

  function resolve(def) {
    const p = (def && def.pit) || {};
    const street = !!(def && def.street);
    const mode = p.mode === "narrow" || p.mode === "full" || p.mode === "street" ? p.mode : (street ? "street" : "full");
    const b = Object.assign({}, mode === "narrow" ? NARROW : mode === "street" ? STREET : BANDS, p.bands || {});
    const off = {
      fastIn: b.verge + b.platform,
      fastOut: b.verge + b.platform + b.fast,
      corrOut: b.verge + b.platform + b.fast + b.corridor,
      workOut: b.verge + b.platform + b.fast + b.corridor + b.work,
    };
    off.outer = off.workOut;
    const painted = mode === "narrow";
    return {
      side: p.side === -1 ? -1 : 1,
      mode,
      limitKph: Number.isFinite(p.limitKph) ? p.limitKph : (painted ? LIMIT_KPH_STREET : LIMIT_KPH),
      bands: b, off,
      painted,
      hasWall: !painted && b.platform > 0,
      hasBays: !painted && p.bays !== false,
      architecture: architecture(p.architecture),
    };
  }

  function straightRun(track, curvature, s0, dir, max) {
    if (typeof curvature !== "function") return max;
    const L = track.total;
    let d = 0;
    for (; d < max; d += STEP) {
      if (Math.abs(curvature(track, wrap(s0 + dir * (d + STEP / 2), L))) > PIT_K) break;
    }
    return d;
  }

  function window(track, curvature) {
    const L = track.total;
    if (!(L > 0)) return { entryM: ENTRY_MAX, exitM: EXIT_M };
    const cap = L / 3;
    const back = straightRun(track, curvature, 0, -1, ENTRY_MAX + ENTRY_ROAD + MOUTH_RUN);
    const entryM = Math.min(Math.max(back - ENTRY_ROAD - MOUTH_RUN, ENTRY_MIN), ENTRY_MAX, cap * 0.7);
    const fwd = straightRun(track, curvature, 0, 1, EXIT_M + ROAD_MIN);
    let exitM = Math.min(EXIT_M, cap * 0.3, Math.max(EXIT_MIN, fwd - ROAD_MIN));
    const roadFor = (eM) => {
      const room = Math.max(ROAD_MIN, (L / 3 - (entryM + eM)) * 0.4);
      return Math.min(EXIT_ROAD, room,
        Math.max(EXIT_ROAD_MIN, straightRun(track, curvature, wrap(eM, L), 1, EXIT_ROAD)));
    };
    const entryRoad0 = Math.min(ENTRY_ROAD, Math.max(ROAD_MIN, (L / 3 - (entryM + exitM)) * 0.4),
      Math.max(ROAD_MIN, straightRun(track, curvature, wrap(-entryM, L), -1, ENTRY_ROAD)));
    const span = (12 - 1) * PITCH;
    const budgetFor = (eM) => {
      const grow = Math.min(WALL_GROW, entryRoad0 * 0.5, roadFor(eM) * 0.5);
      return (entryM + eM) - ROW_END - span - grow - 20;
    };
    const mergeRun = (eM) => straightRun(track, curvature, wrap(eM + roadFor(eM), L), 1, MERGE_RUN);
    if (mergeRun(exitM) < MERGE_RUN) {
      const room = Math.max(0, budgetFor(exitM));
      for (let back = 4; back <= room; back += 4) {
        const cand = exitM - back;
        if (cand < EXIT_MIN || budgetFor(cand) < 0) break;
        if (mergeRun(cand) >= MERGE_RUN) { exitM = cand; break; }
      }
    }
    return { entryM, exitM };
  }

  function row() {
    const out = [];
    const T = typeof Teams !== "undefined" ? Teams : null;
    const list = T && Array.isArray(T.LIST) ? T.LIST : [];
    for (const t of list) { if (t.legends) continue; out.push({ team: t.id, name: t.name || t.id, short: t.short || t.id.slice(0, 3).toUpperCase(),
                                     col: t.color || [0.6, 0.6, 0.65], col2: t.color2 || [0.9, 0.9, 0.9],
                                     logo3: (t.livery && t.livery.logo3) || null }); }
    const custom = T && T.DEFAULT_CUSTOM;
    const customId = custom ? custom.id : "custom";
    if (!out.some((b) => b.team === customId))
      out.push({ team: customId, name: custom ? custom.name : "MY TEAM", short: (custom && custom.short) || "MY",
                 col: (custom && custom.color) || [0.55, 0.55, 0.6], col2: (custom && custom.color2) || [0.9, 0.9, 0.9], logo3: null });
    while (out.length < 12) out.push({ team: "row" + out.length, name: "ROW " + out.length, short: "R" + out.length, col: [0.6, 0.6, 0.65], col2: [0.9, 0.9, 0.9], logo3: null });
    return out;
  }

  function build(track, def, curvature) {
    const n = track.n, L = track.total;
    if (!(n > 0) || !(L > 0)) return null;
    const r = resolve(def);
    const win = window(track, curvature);
    const ds = L / n;
    const sIn = wrap(-win.entryM, L), sOut = wrap(win.exitM, L);
    const lenM = win.entryM + win.exitM;
    const room = Math.max(ROAD_MIN, (L / 3 - lenM) * 0.4);
    const entryRoadM = Math.min(ENTRY_ROAD, room,
      Math.max(ENTRY_ROAD_MIN, straightRun(track, curvature, sIn, -1, ENTRY_ROAD)));
    const exitRoadM = Math.min(EXIT_ROAD, room,
      Math.max(EXIT_ROAD_MIN, straightRun(track, curvature, sOut, 1, EXIT_ROAD)));
    const sA = wrap(sIn - entryRoadM, L), sB = wrap(sOut + exitRoadM, L);
    const grow = Math.min(WALL_GROW, entryRoadM * 0.5, exitRoadM * 0.5);

    const w = new Float32Array(n), v = new Float32Array(n), b = new Float32Array(n), keep = new Float32Array(n);
    const rows = row();
    const through = (s) => wrap(s - sIn, L);
    const count = rows.length;
    const lo = grow + 20, hi = Math.max(lo, lenM - ROW_END);
    let pitch = PITCH;
    const fullRowFits = (count - 1) * PITCH <= hi - lo + 1e-6;
    if (!fullRowFits) pitch = Math.max(BOX_LEN + 1, (hi - lo) / (count - 1));
    const hasBays = r.hasBays && fullRowFits;
    const span = (count - 1) * pitch;
    const poleT = through(wrap(-GRID_POLE_M, L));
    const first = Math.min(Math.max(poleT + GRID_CLEAR, lo), Math.max(lo, hi - span));
    const boxes = rows.map((row_, i) => {
      const t = first + i * pitch;
      return Object.assign({}, row_, { through: t, s: wrap(sIn + t, L), k: Math.round(wrap(sIn + t, L) / ds) % n });
    });
    const rowS0 = wrap(sIn + first - pitch / 2, L), rowS1 = wrap(sIn + first + span + pitch / 2, L);
    const rowKeepS1 = wrap(sIn + first + span + pitch / 2 + ROW_TAIL, L);
    const inArc = (s, a, b) => (a <= b ? (s >= a && s <= b) : (s >= a || s <= b));
    for (let k = 0; k < n; k++) {
      if (r.painted) break;
      const s = k * ds;
      let wk = 0, vk = 0;
      if (inArc(s, sA, sIn)) {
        const d = wrap(s - sA, L);
        wk = smooth(d / Math.max(1, entryRoadM - grow));
        vk = smooth((d - (entryRoadM - grow)) / grow);
      } else if (inArc(s, sIn, sOut)) {
        wk = 1; vk = 1;
      } else if (inArc(s, sOut, sB)) {
        const d = wrap(s - sOut, L);
        vk = 1 - smooth(d / grow);
        wk = 1 - smooth((d - grow) / Math.max(1, exitRoadM - grow));
      }
      w[k] = wk; v[k] = vk;
      if (hasBays) {
        const span2 = wrap(rowS1 - rowS0, L) + 2 * BAY_FLARE;
        const d = wrap(s - wrap(rowS0 - BAY_FLARE, L), L);
        if (d <= span2) b[k] = Math.min(smooth(d / BAY_FLARE), smooth((span2 - d) / BAY_FLARE)) * wk;
      }
      if (wk > 0) {
        keep[k] = r.off.outer * wk + 0.3;
        if (hasBays && inArc(s, rowS0, rowKeepS1)) keep[k] += BAY.depth + 3.0;
      }
    }
    return {
      side: r.side, mode: r.mode, limitKph: r.limitKph, bands: r.bands, off: r.off,
      painted: r.painted, hasWall: r.hasWall, hasBays,
      architecture: r.architecture,
      sA, sIn, sOut, sB, entryM: win.entryM, exitM: win.exitM, lenM, entryRoadM, exitRoadM, grow,
      w, v, b, keep,
      row: { pitch, boxLen: BOX_LEN, first, count, boxes, s0: rowS0, s1: rowS1, tail: ROW_TAIL },
      bay: BAY,
    };
  }

  function at(track, s) {
    const p = track && track.pit;
    if (!p) return null;
    const n = track.n, L = track.total;
    const k = ((Math.round((s / L) * n) % n) + n) % n;
    const wk = p.w[k];
    if (!(wk > 0.01)) return null;
    const vk = p.v[k], sd = p.side, h = track.hw[k], o = p.off;
    const bk = p.b ? p.b[k] : wk;
    const fastIn = h + o.fastIn * vk;
    const fastOut = h + o.fastOut * wk;
    const corrOut = fastOut + (o.corrOut - o.fastOut) * bk;
    const workOut = corrOut + (o.workOut - o.corrOut) * bk;
    const lane = p.hasBays === false;
    return {
      side: sd, w: wk, v: vk,
      inner: sd * fastIn, outer: sd * workOut,
      centre: sd * (fastIn + Math.max(fastIn, fastOut)) / 2,
      fastOut: sd * fastOut, workIn: sd * (lane ? fastIn : corrOut),
      workCentre: sd * (lane ? (fastIn + fastOut) / 2 : (corrOut + workOut) / 2),
      width: Math.max(0, workOut - fastIn),
    };
  }

  function outerAt(p, k) {
    if (!p) return 0;
    const o = p.off, wk = p.w[k], bk = p.b ? p.b[k] : wk;
    return o.fastOut * wk + (o.workOut - o.fastOut) * bk;
  }

  function openBoundary(track) {
    const p = track && track.pit;
    if (!p || !track.barL || !track.barR) return;
    const bar = p.side > 0 ? track.barR : track.barL;
    for (let k = 0; k < track.n; k++) {
      if (!(p.keep[k] > 0)) continue;
      const lim = track.hw[k] + outerAt(p, k) - 0.9;
      bar[k] = lim > track.hw[k] + 1.2 ? lim : Math.max(bar[k], lim);
    }
    capTaper(track, bar, p);
  }

  function capTaper(track, bar, p) {
    const n = track.n;
    const taper = (k) => p.keep[k] > 0 && !(track.hw[k] + outerAt(p, k) - 0.9 > track.hw[k] + 1.2);
    for (let k0 = 0; k0 < n; k0++) {
      if (!taper(k0) || taper((k0 - 1 + n) % n)) continue;
      let len = 1;
      while (len < n && taper((k0 + len) % n)) len++;
      if (len >= n) return;
      const a = (k0 - 1 + n) % n, b = (k0 + len) % n;
      const wa = p.keep[a] > 0, wb = p.keep[b] > 0;
      const cap = wa === wb ? Math.max(bar[a], bar[b]) : (wa ? bar[a] : bar[b]);
      for (let i = 0; i < len; i++) {
        const k = (k0 + i) % n;
        if (bar[k] > cap) bar[k] = cap;
      }
    }
  }

  function rowOf(pit, teamId) {
    if (!pit || !teamId) return -1;
    const boxes = pit.row.boxes;
    for (let i = 0; i < boxes.length; i++) if (boxes[i].team === teamId) return i;
    return -1;
  }

  return { BANDS, BAY, SIGN, EXIT_WALL_W, PITCH, BOX_LEN, ENTRY_ROAD, EXIT_ROAD, ENTRY_ROAD_MIN, EXIT_ROAD_MIN, MOUTH_RUN,
           ENTRY_MAX, ENTRY_MIN, EXIT_M, EXIT_MIN, PIT_K, ROW_TAIL,
           resolve, window, row, build, at, outerAt, openBoundary, rowOf };
})();
Object.freeze(TrackPit);
