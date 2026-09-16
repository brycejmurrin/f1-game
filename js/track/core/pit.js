/* Apex 26 — TrackPit: the PIT COMPLEX as one model every consumer reads.
   The lane ribbon (TrackMesh.buildPitLane), the painted boxes, the stop row
   (js/race/pit-lane.js), the wall, the garages (js/track/scenery/pits.js) and
   the GARAGE screen's frontage (js/garage/scene.js) all derive from THIS —
   there is no second copy of a width, a pitch or a position anywhere. Pure:
   reads a built centreline, writes a record; Teams is read at CALL time so the
   Node VM builds without it. docs/research/PIT-LANE-REDESIGN-2026-09.md. */
const TrackPit = (function () {
  "use strict";

  // ── THE BANDS, in metres from the racing-surface EDGE outward ─────────────
  // Appendix O 2026 §7.9: a Grade 1 pit lane is >= 12 m wide, separated from
  // the start straight by a pit wall and signalling platform. F1 SR B1.7 / FIM
  // §9.1: the FAST LANE (<= 3.5 m, by the wall), a >= 1 m CORRIDOR, then the
  // INNER lane where the work happens. FIM §9.2: 2 m verge, >= 1.5 m platform.
  //   verge → platform+wall → fast lane → corridor → working lane → garage line
  const BANDS = { verge: 2.0, platform: 2.0, fast: 3.5, corridor: 1.0, work: 5.5 };
  // A street circuit (Monaco's 480 m lane at 60 km/h is the worked example):
  // the same bands at the numbers a temporary lane between walls can hold.
  // STREET is BUILT — wall 0.6 m off the road edge (Albert Park's 2021
  // precedent), a 1.6 m platform (FIM >= 1.5), fast <= 3.5, corridor >= 1, a
  // 4.2 m working lane: 10.6 m in all, 10 m wall-to-garage (Monaco-real), and
  // 2.5 m placeable beside the road for the circuit's own walls
  // (docs/research/STREET-PIT-LANES-PLAN-2026-09.md). NARROW is the PAINTED
  // opt-out a def may still declare: no ribbon, no wall, nothing kept out.
  const STREET = { verge: 0.6, platform: 1.6, fast: 3.2, corridor: 1.0, work: 4.2 };
  const NARROW = { verge: 0.6, platform: 0.0, fast: 3.0, corridor: 0.6, work: 3.4 };

  // ONE BAY = the setup screen's room (js/garage/scene-prims.js reads these at
  // eval): 10.8 m of frontage — inside the 10-15 m a real team takes (2-3
  // units of 4-7 m) — 12.8 m deep, 5 m to the ceiling. Neighbouring bays sit
  // 0.2 m apart so two inward-wound party walls never share a plane.
  const BAY = { w: 10.8, gap: 0.2, depth: 12.8, h: 5.0, doorW: 5.4, doorH: 4.8 };
  const PITCH = BAY.w + BAY.gap;          // 11.0 m: the ONE pitch (paint, stop, door)
  const BOX_LEN = 8;                      // the FIA grid slot, and a real box's frontage
  // THE SIGN on each bay's lintel (SceneryPits lays the quad, js/garage/
  // pit-signs.js paints the atlas cell): one table so geometry and painter
  // agree. Twelve cells of 512 x 70 px on a 1024 x 512 canvas (~100 px/m on
  // a 5.2 x 0.7 m quad), the quad a centimetre proud of the lintel's face
  // (garage line - 0.265) inside its 0.8 m band over the door.
  const SIGN = { w: 1024, h: 512, cols: 2, cells: 12, cellW: 512, cellH: 70,
                 quadW: 5.2, quadH: 0.7, y0: 4.85, proud: 0.275,
                 // The BOARDS, two more cells on the atlas's seventh row (the
                 // twelve fascias fill six): cell 12 "PIT ENTRY" with an arrow
                 // at the pit side, cell 13 "PIT LANE <limit> km/h". Laid on
                 // 2.4 x 0.33 m boards (the cell's own 7.3:1) on posts, the
                 // first two on the verge of the approach before the entry
                 // road, the last on the platform at the entry line.
                 boards: 2, boardW: 2.4, boardH: 0.33, boardY: 1.5, boardM: [45, 110] };
  // The EXIT WALL (SceneryPits, game.js's clamp): the pit wall slides from the
  // platform's line to the road edge as the wall fades over the exit road, and
  // runs along the edge while the road keeps this share of its width — a
  // serviced car rejoins where the wall ends, not through it.
  const EXIT_WALL_W = 0.55;

  // Along the arc. The LIMITER window (entry line → exit line) is the old
  // pitWindow: it walks back from the line to where the last corner lets go
  // (docs/PHYSICS.md — the surface channel) and closes EXIT_M after it, or
  // sooner where the first corner starts before that — six circuits turn in
  // within 90 m of the line (Mosport 24 m, Jerez 48 m … Nürburgring 84 m), and
  // a lane that ran on into the corner put its last garages and its exit
  // road in the bend. The ENTRY ROAD peels off the racing surface before the
  // entry line and the EXIT ROAD blends back after the exit line, each only
  // while the road is still straight; the wall GROWS between the lane and the
  // track over the last WALL_GROW metres of the entry road, and shrinks over
  // the first WALL_GROW of the exit road, so the lane is reachable from the
  // track exactly where it should be and nowhere else.
  // 260 + 110 = a 370 m lane at most (was 400 + 130 = 530): at 80 km/h that is
  // ~12 s of pit loss instead of ~16.5 (PitLane.estimate), a stop that still
  // decides a strategy but no longer takes a quarter of a lap under the
  // limiter. The row (12 x 11 m) needs 201 m, and the shortest windows
  // (Jeddah's 190) were already at the floor, so nothing below moves.
  const ENTRY_MAX = 260, ENTRY_MIN = 150, EXIT_M = 110, EXIT_MIN = 40;
  const PIT_K = 0.0035, STEP = 8;         // "not actively cornering" — see docs/PHYSICS.md
  const ENTRY_ROAD = 70, EXIT_ROAD = 90, ROAD_MIN = 30, WALL_GROW = 30;
  const LIMIT_KPH = 80, LIMIT_KPH_STREET = 60;   // F1 SR 2026 B1.7.3(a); Monaco / Melbourne
  // The row starts past POLE's grid slot (14 m before the line, TrackMesh.gridSlot)
  // plus the run-up a commitment needs, and ends ROW_END short of the exit line.
  // Race control stands ROW_TAIL past the last bay (SceneryPits), inside the
  // same keep-out.
  const GRID_POLE_M = 14, GRID_CLEAR = 40, ROW_END = 30, ROW_TAIL = 16;

  const wrap = (v, L) => ((v % L) + L) % L;
  const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

  /** Resolve a def's pit choices: side, mode, limit and the band set. */
  function resolve(def) {
    const p = (def && def.pit) || {};
    const street = !!(def && def.street);
    const mode = p.mode === "narrow" || p.mode === "full" || p.mode === "street" ? p.mode : (street ? "street" : "full");
    const b = Object.assign({}, mode === "narrow" ? NARROW : mode === "street" ? STREET : BANDS, p.bands || {});
    const off = {
      fastIn: b.verge + b.platform,
      fastOut: b.verge + b.platform + b.fast,
      corrOut: b.verge + b.platform + b.fast + b.corridor,
      workOut: b.verge + b.platform + b.fast + b.corridor + b.work,   // the garage line
    };
    off.outer = off.workOut;
    // Only a NARROW lane is PAINTED on the racing surface by the lit shaders
    // (PitLane.laneUniform): no ribbon, no wall, no garages, and nothing kept
    // out of a complex that is not there. A street circuit builds the STREET
    // complex — a lane beside the road behind a real pit wall — unless its
    // def opts out; 80 km/h (F1 SR B1.7.3(a)) unless authored (Monaco and
    // Singapore run 60), the painted lane keeps the old street 60.
    const painted = mode === "narrow";
    return {
      side: p.side === -1 ? -1 : 1,
      mode,
      limitKph: Number.isFinite(p.limitKph) ? p.limitKph : (painted ? LIMIT_KPH_STREET : LIMIT_KPH),
      bands: b, off,
      painted,
      hasWall: !painted && b.platform > 0,
      hasBays: !painted && p.bays !== false,
    };
  }

  /** The limiter window: how far before the line it opens, how far after it
   *  closes. `curvature(track, s)` is injected so this file owns no spline. */
  /** How far the road stays straight from arc `s0` in direction `dir`
   *  (±1), up to `max`; `max` itself without a curvature function. */
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
    const back = straightRun(track, curvature, 0, -1, ENTRY_MAX);
    const entryM = Math.min(Math.max(back, ENTRY_MIN), ENTRY_MAX, cap * 0.7);
    // The exit line closes before the first corner, leaving the exit road its
    // minimum run to blend back on the straight.
    const fwd = straightRun(track, curvature, 0, 1, EXIT_M + ROAD_MIN);
    const exitM = Math.min(EXIT_M, cap * 0.3, Math.max(EXIT_MIN, fwd - ROAD_MIN));
    return { entryM, exitM };
  }

  /** The garage row: one bay per team in Teams.LIST order (the order a real
   *  lane is allocated in), plus the MY TEAM bay at the end. Without Teams (a
   *  bare VM) the row is twelve unnamed bays, so geometry never depends on it. */
  function row() {
    const out = [];
    const T = typeof Teams !== "undefined" ? Teams : null;
    const list = T && Array.isArray(T.LIST) ? T.LIST : [];
    // `short` and `logo3` ride along for the sign painter: the code beside the
    // crest, and the crest's outline row (team data, js/data/teams.js).
    for (const t of list) out.push({ team: t.id, name: t.name || t.id, short: t.short || t.id.slice(0, 3).toUpperCase(),
                                     col: t.color || [0.6, 0.6, 0.65], col2: t.color2 || [0.9, 0.9, 0.9],
                                     logo3: (t.livery && t.livery.logo3) || null });
    const custom = T && T.DEFAULT_CUSTOM;
    out.push({ team: custom ? custom.id : "custom", name: custom ? custom.name : "MY TEAM", short: (custom && custom.short) || "MY",
               col: (custom && custom.color) || [0.55, 0.55, 0.6], col2: (custom && custom.color2) || [0.9, 0.9, 0.9], logo3: null });
    while (out.length < 12) out.push({ team: "row" + out.length, name: "ROW " + out.length, short: "R" + out.length, col: [0.6, 0.6, 0.65], col2: [0.9, 0.9, 0.9], logo3: null });
    return out;
  }

  /** Build the model for a built centreline. Called ONCE by Tracks.build,
   *  before the terrain profile and the scenery, both of which read it. */
  function build(track, def, curvature) {
    const n = track.n, L = track.total;
    if (!(n > 0) || !(L > 0)) return null;
    const r = resolve(def);
    const win = window(track, curvature);
    const ds = L / n;
    const sIn = wrap(-win.entryM, L), sOut = wrap(win.exitM, L);
    const lenM = win.entryM + win.exitM;
    // Neither road may open or close inside a corner: each runs only while
    // the road is still straight enough, never shorter than ROAD_MIN.
    const room = Math.max(ROAD_MIN, (L / 3 - lenM) * 0.4);
    const entryRoadM = Math.min(ENTRY_ROAD, room,
      Math.max(ROAD_MIN, straightRun(track, curvature, sIn, -1, ENTRY_ROAD)));
    const exitRoadM = Math.min(EXIT_ROAD, room,
      Math.max(ROAD_MIN, straightRun(track, curvature, sOut, 1, EXIT_ROAD)));
    const sA = wrap(sIn - entryRoadM, L), sB = wrap(sOut + exitRoadM, L);
    const grow = Math.min(WALL_GROW, entryRoadM * 0.5, exitRoadM * 0.5);

    const w = new Float32Array(n), v = new Float32Array(n), keep = new Float32Array(n);
    const rows = row();
    // Through-window metres: 0 at the entry line, lenM at the exit line.
    const through = (s) => wrap(s - sIn, L);
    // THE ROW. Anchored just past pole's slot so a lap-1 stop is reachable by
    // every team, clamped so the last box is short of the exit line; a short
    // window compresses the pitch rather than spilling the row off the tarmac.
    const count = rows.length;
    const lo = grow + 20, hi = Math.max(lo, lenM - ROW_END);
    let pitch = PITCH;
    if ((count - 1) * pitch > hi - lo) pitch = Math.max(BOX_LEN + 1, (hi - lo) / (count - 1));
    // A compressed row paints its boxes closer than a bay is wide (Jeddah's
    // 190 m window: 10.0 m against 10.8), so it places no bays — two would
    // interpenetrate by the difference on every party wall.
    const hasBays = r.hasBays && pitch >= PITCH - 1e-6;
    const span = (count - 1) * pitch;
    const poleT = through(wrap(-GRID_POLE_M, L));
    const first = Math.min(Math.max(poleT + GRID_CLEAR, lo), Math.max(lo, hi - span));
    const boxes = rows.map((row_, i) => {
      const t = first + i * pitch;
      return Object.assign({}, row_, { through: t, s: wrap(sIn + t, L), k: Math.round(wrap(sIn + t, L) / ds) % n });
    });
    const rowS0 = wrap(sIn + first - pitch / 2, L), rowS1 = wrap(sIn + first + span + pitch / 2, L);
    const rowKeepS1 = wrap(sIn + first + span + pitch / 2 + ROW_TAIL, L);   // …and race control behind it
    const inArc = (s, a, b) => (a <= b ? (s >= a && s <= b) : (s >= a || s <= b));
    for (let k = 0; k < n; k++) {
      if (r.painted) break;                          // a painted lane has no ribbon and keeps nothing out
      const s = k * ds;
      let wk = 0, vk = 0;
      if (inArc(s, sA, sIn)) {                       // the entry road
        const d = wrap(s - sA, L);
        wk = smooth(d / Math.max(1, entryRoadM - grow));
        vk = smooth((d - (entryRoadM - grow)) / grow);
      } else if (inArc(s, sIn, sOut)) {              // the lane proper
        wk = 1; vk = 1;
      } else if (inArc(s, sOut, sB)) {               // the exit road
        const d = wrap(s - sOut, L);
        vk = 1 - smooth(d / grow);
        wk = 1 - smooth((d - grow) / Math.max(1, exitRoadM - grow));
      }
      w[k] = wk; v[k] = vk;
      if (wk > 0) {
        // The keep-out reaches the garage line plus its own kerb: a landmark
        // may stand AT the lane's edge (Yas Marina's hotel legs stand 14.5 m
        // out, straddling track and lane alike); a metre of margin superseded
        // them. Behind the row the bays need their depth and a service road.
        keep[k] = r.off.outer * wk + 0.3;
        if (hasBays && inArc(s, rowS0, rowKeepS1)) keep[k] += BAY.depth + 3.0;
      }
    }
    return {
      side: r.side, mode: r.mode, limitKph: r.limitKph, bands: r.bands, off: r.off,
      painted: r.painted, hasWall: r.hasWall, hasBays,
      sA, sIn, sOut, sB, entryM: win.entryM, exitM: win.exitM, lenM, entryRoadM, exitRoadM, grow,
      w, v, keep,
      row: { pitch, boxLen: BOX_LEN, first, count, boxes, s0: rowS0, s1: rowS1, tail: ROW_TAIL },
      bay: BAY,
    };
  }

  /** The lane at one arc position, in the car's own lateral frame (signed,
   *  +x right): null outside the complex. `inner` is the lane's track-side
   *  edge (the wall line once the wall has grown, the road edge on the entry
   *  road), `outer` the garage line, `centre` the fast lane's middle and
   *  `workCentre` the working lane's — where a box is and where a stop sits. */
  function at(track, s) {
    const p = track && track.pit;
    if (!p) return null;
    const n = track.n, L = track.total;
    const k = ((Math.round((s / L) * n) % n) + n) % n;
    const wk = p.w[k];
    if (!(wk > 0.01)) return null;
    const vk = p.v[k], sd = p.side, h = track.hw[k], o = p.off;
    const fastIn = h + o.fastIn * vk;
    const fastOut = h + o.fastOut * wk;
    const corrOut = h + o.corrOut * wk;
    const workOut = h + o.workOut * wk;
    return {
      side: sd, w: wk, v: vk,
      inner: sd * fastIn, outer: sd * workOut,
      centre: sd * (fastIn + Math.max(fastIn, fastOut)) / 2,
      fastOut: sd * fastOut, workIn: sd * corrOut,
      workCentre: sd * (corrOut + workOut) / 2,
      width: Math.max(0, workOut - fastIn),
    };
  }

  /** Push the driving boundary out to the complex's far edge across the
   *  window, so the barrier clamp (Tracks.wallAt) lets a car onto the lane. */
  function openBoundary(track) {
    const p = track && track.pit;
    if (!p || !track.barL || !track.barR) return;
    const bar = p.side > 0 ? track.barR : track.barL;
    for (let k = 0; k < track.n; k++) {
      if (!(p.keep[k] > 0)) continue;
      const lim = track.hw[k] + p.off.outer * p.w[k] + 1.5;
      if (bar[k] < lim) bar[k] = lim;
    }
  }

  /** The row index of a team id (teammates share a box); -1 when unknown. */
  function rowOf(pit, teamId) {
    if (!pit || !teamId) return -1;
    const boxes = pit.row.boxes;
    for (let i = 0; i < boxes.length; i++) if (boxes[i].team === teamId) return i;
    return -1;
  }

  return { BANDS, STREET, NARROW, BAY, SIGN, EXIT_WALL_W, PITCH, BOX_LEN, ENTRY_ROAD, EXIT_ROAD, ROAD_MIN, WALL_GROW,
           ENTRY_MAX, ENTRY_MIN, EXIT_M, EXIT_MIN, PIT_K, LIMIT_KPH, LIMIT_KPH_STREET, GRID_POLE_M, GRID_CLEAR,
           ROW_END, ROW_TAIL,
           resolve, window, row, build, at, openBoundary, rowOf };
})();
Object.freeze(TrackPit);
