"use strict";
/* Apex 26 — FLYBY SHOT SEQUENCER: the pre-race loading screen's camera.
 *
 * WHAT IT REPLACES. The menu camera was one continuous crawl: `s` advanced with
 * the wall clock and camVantage("cinematic") solved a broadcast rig around it.
 * That rig has no idea what is standing beside the track — its only lateral
 * guard, `corr`, is applied on STREET circuits and is Infinity everywhere else —
 * so on an open circuit the eye sat 22 m off the racing line and flew through
 * whatever was there. Reported as "the flyby goes through a building".
 *
 * WHAT A SHOT IS. A list of shots, each a move from one camera pose to another
 * over a duration. Poses are TRACK-RELATIVE and anchored on landmarks, never on
 * world coordinates:
 *
 *   { at: "start"|"pole"|"grid"|"corner", n, off, x, y }   along the lap
 *   { at: "centre", bear, distR, yR }                      the whole circuit
 *   { at: "landmark", rank, bear, distK, yK }              this circuit's own
 *
 *   off     metres of arc from the anchor, signed along the racing direction
 *   x       lateral metres, + is right of the centreline
 *   y       metres above the road surface at that point
 *   n       a corner by number, or by ROLE: "first" | "mid" | "late"
 *   bear    radians around the anchor
 *   distR/yR   multiples of the LAP's radius — one establishing shot fits any circuit
 *   distK/yK   multiples of the LANDMARK's own size — one shot fits a tower or a stand
 *
 * That is what makes one shot list mean the same thing on every circuit: "rise
 * up the middle of the grid" is the same instruction at Monza and at Monaco.
 *
 * CLEARANCE. Every built circuit carries a registry of its scenery as
 * world-space boxes (`track.props`), which is how a camera can finally be told
 * it is inside a building. `clearEye` lifts the eye over anything solid it
 * lands in. It is a floor under authoring mistakes, not a substitute for
 * framing a shot properly.
 */
const FlybySeq = (function () {

  // The grid, from js/track/core/mesh.js gridSlot(): pole sits POLE_BACK metres
  // before the line and the rows are GRID_SPACING apart. Duplicated as named
  // constants rather than imported because TrackMesh is not loaded in the node
  // tests that check these shots, and a wrong number here is a framing bug, not
  // a crash — the unit test pins them against mesh.js.
  const POLE_BACK = 14, GRID_SPACING = 8, GRID_ROWS = 20;

  /** Props that a camera must not be inside. The registry also records ridges,
   *  bushes and sparse `structure` hulls whose `fill` says they are mostly air
   *  (a 56 m x 1.3 m "structure" at 5 % fill is a run of kerbing, not a wall);
   *  treating those as solid would shove the camera into the sky on every shot. */
  const SOLID = ["building", "grandstand", "tower", "motorhome", "gantry", "pit", "garage"];
  const MIN_FILL = 0.25;          // a `structure` below this is scattered parts, not a mass
  const MIN_H = 3;                // and anything shorter than this cannot swallow a camera

  function isSolid(r) {
    if (!r || !(r.h >= MIN_H)) return false;
    if (SOLID.indexOf(r.kind) !== -1) return true;
    return r.kind === "structure" && (r.fill || 0) >= MIN_FILL;
  }

  /** The solid subset, computed once per built track and cached ON the track, so
   *  it dies with the world it describes rather than in a map nobody clears. */
  function blockers(track) {
    if (track._fbSolid) return track._fbSolid;
    const out = [];
    const list = track.props && track.props.list;
    if (list) for (let i = 0; i < list.length; i++) if (isSolid(list[i])) out.push(list[i]);
    track._fbSolid = out;
    return out;
  }

  /** The record containing this point, or null. Boxes are centre + size, and the
   *  margin inflates them so the eye clears a facade rather than grazing it. */
  function insideProp(track, p, margin) {
    const b = blockers(track), m = margin || 0;
    for (let i = 0; i < b.length; i++) {
      const r = b[i];
      if (Math.abs(p[0] - r.x) < r.w / 2 + m &&
          Math.abs(p[2] - r.z) < r.d / 2 + m &&
          p[1] > r.y - r.h / 2 - m && p[1] < r.y + r.h / 2 + m) return r;
    }
    return null;
  }

  /** LIFT, never shove sideways. A lateral escape would need a direction the
   *  shot cannot know (both ways may be blocked), and it would swing the framing;
   *  going over the top keeps the subject in the same part of the screen and is
   *  always available. Bounded so a bad shot reads as a high shot, not as orbit. */
  function clearEye(track, eye, margin) {
    const m = margin === undefined ? 2.5 : margin;
    for (let i = 0; i < 4; i++) {
      const hit = insideProp(track, eye, m);
      if (!hit) break;
      eye[1] = hit.y + hit.h / 2 + m;
    }
    return eye;
  }

  // ---- what this circuit looks like ----------------------------------------

  /* TERRAIN IS NOT A LANDMARK. Ranked by raw volume the answer is always the
     scenery nobody came to see: Spa's biggest props are 240 m mountains and
     Monza's are ridges. The shot that says "this is Bahrain" frames the tower,
     not the hill behind it. */
  const TERRAIN = ["mountain", "ridge", "hill", "tree", "pine", "stonePine",
                   "cypress", "palm", "acacia", "broadleafFall", "bush"];
  /* How much each kind is worth being a shot ABOUT. A tower is the thing a
     circuit is recognised by; a grandstand says "motor racing" but not which
     circuit; a `structure` is an assembled hull and only earns a shot when it is
     both tall and mostly solid (Monaco's whole skyline arrives this way). */
  const LM_WEIGHT = { tower: 3, building: 1.6, gantry: 1.2, grandstand: 1.3, motorhome: 1, structure: 0.9 };
  const LM_MIN_H = 8;             // shorter than this reads as trackside furniture
  const LM_APART = 80;            // metres — two boxes of one grandstand are one landmark
  const LM_KEEP = 6;
  const LM_NEAR = 220;            // metres from the centreline — beyond this it is scenery, not a landmark

  function landmarkScore(r) {
    const w = LM_WEIGHT[r.kind];
    if (!w || !(r.h >= LM_MIN_H)) return 0;
    if (r.kind === "structure" && ((r.fill || 0) < 0.35 || r.h < 12)) return 0;
    const vol = Math.max(1, r.w * r.h * r.d);
    // Cube root, so a landmark twice as big in every direction is twice as
    // interesting rather than eight times — raw volume lets one mass win outright.
    return w * Math.cbrt(vol) * (1 + r.h / 60);
  }

  /** This circuit's notable built scenery, best first. Cached on the track. */
  function landmarks(track) {
    if (track._fbLandmarks) return track._fbLandmarks;
    const list = (track.props && track.props.list) || [];
    const scored = [];
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (TERRAIN.indexOf(r.kind) !== -1) continue;
      const sc = landmarkScore(r);
      if (sc > 0) scored.push({ r: r, score: sc });
    }
    // NEAR THE TRACK, OR IT IS NOT A SHOT. Bahrain's tallest structure is a
    // 126 m tower out in the desert: framed on its own at dusk it is a lit pole
    // against black sand, with no circuit anywhere in shot. A landmark earns a
    // shot by being part of the place you are about to race, so distance to the
    // centreline both gates and scores it.
    const b = bounds(track);
    for (let i = 0; i < scored.length; i++) {
      const r = scored[i].r;
      let best = Infinity;
      for (let j = 0; j < b.pts.length; j++) {
        const d = Math.hypot(r.x - b.pts[j][0], r.z - b.pts[j][2]);
        if (d < best) best = d;
      }
      scored[i].near = best;
      scored[i].score *= best <= LM_NEAR ? (1 + (LM_NEAR - best) / LM_NEAR) : 0;
    }
    scored.sort((a, b2) => b2.score - a.score);
    const keep = [];
    for (let i = 0; i < scored.length && keep.length < LM_KEEP; i++) {
      if (!(scored[i].score > 0)) break;          // sorted, so the rest are all too far
      const c = scored[i].r;
      let near = false;
      for (let j = 0; j < keep.length; j++) {
        if (Math.hypot(c.x - keep[j].x, c.z - keep[j].z) < LM_APART) { near = true; break; }
      }
      if (!near) keep.push(c);
    }
    track._fbLandmarks = keep;
    return keep;
  }

  /** Centroid and radius of the whole lap, for the establishing shots. Sampled
   *  from the centreline rather than from props, so an outlying mountain cannot
   *  drag the frame off the circuit. */
  function bounds(track) {
    if (track._fbBounds) return track._fbBounds;
    const N = 96;
    let cx = 0, cz = 0, cy = 0;
    const pts = [];
    for (let i = 0; i < N; i++) {
      Tracks.sample(track, (i / N) * track.total, _smp);
      pts.push([_smp.p[0], _smp.p[1], _smp.p[2]]);
      cx += _smp.p[0]; cy += _smp.p[1]; cz += _smp.p[2];
    }
    cx /= N; cy /= N; cz /= N;
    let rad = 1;
    for (let i = 0; i < N; i++) rad = Math.max(rad, Math.hypot(pts[i][0] - cx, pts[i][2] - cz));
    // Keep the samples: landmark selection needs "how far is this from the
    // track", and 96 points is a good enough centreline for a proximity test.
    track._fbBounds = { x: cx, y: cy, z: cz, rad: rad, pts: pts };
    return track._fbBounds;
  }

  // ---- anchors -------------------------------------------------------------

  function wrapS(track, s) {
    const total = track.total || 1;
    return ((s % total) + total) % total;
  }

  /** Corner apexes as arc metres, from the same measurement the picker's map and
   *  the loading card's turn count use. Cached with the blockers, for the same
   *  reason: it is a property of this built world. */
  function cornerS(track, n) {
    if (!track._fbCorners) {
      let cs = [];
      try {
        if (typeof TrackMaps !== "undefined" && track.def) cs = TrackMaps.corners(track.def) || [];
      } catch (_) { cs = []; }
      track._fbCorners = cs;
    }
    const cs = track._fbCorners;
    if (!cs.length) return 0;
    // A shot list is written once for every circuit, and circuits do not agree
    // on how many corners they have — Monza has 11, Suzuka 18. Naming a ROLE
    // ("the first corner", "something mid-lap") ports; naming corner 14 does not.
    let i;
    if (n === "first") i = 0;
    else if (n === "mid") i = Math.floor(cs.length * 0.45);
    else if (n === "late") i = Math.floor(cs.length * 0.78);
    else i = Math.min(Math.max(1, n | 0), cs.length) - 1;
    const c = cs[Math.min(i, cs.length - 1)];
    return (c && typeof c.f === "number") ? c.f * track.total : 0;
  }

  function anchorS(track, pose) {
    const total = track.total || 1;
    const off = pose.off || 0;
    switch (pose.at) {
      case "pole": return wrapS(track, total - POLE_BACK + off);
      case "grid": return wrapS(track, total - POLE_BACK - (GRID_ROWS - 1) * GRID_SPACING + off);
      case "corner": return wrapS(track, cornerS(track, pose.n || 1) + off);
      default: return wrapS(track, off);          // "start" — the line is s = 0 by construction
    }
  }

  const _smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 10 };

  /** A pose to a world point: arc → centreline, then lateral along the road's
   *  right vector, then height above the surface. */
  function posePoint(track, pose, out) {
    // WHOLE-CIRCUIT anchor: polar around the lap's centroid, in multiples of its
    // radius, so one establishing shot frames Monaco and Spa alike.
    if (pose.at === "centre") {
      const b = bounds(track);
      // CLAMPED, because a multiple of the radius alone is a satellite. Monza's
      // lap radius is ~800 m, so 0.85 of it put the eye 680 m up and the
      // establishing shot became a map of the circuit with no scenery, no
      // scale and nothing to recognise. These bounds are what a helicopter
      // shot actually lives in.
      const d = Math.max(250, Math.min(1200, (pose.distR === undefined ? 1.4 : pose.distR) * b.rad));
      const h = Math.max(70, Math.min(300, (pose.yR === undefined ? 0.5 : pose.yR) * b.rad));
      const a = pose.bear || 0;
      out[0] = b.x + Math.cos(a) * d;
      out[1] = b.y + h + (pose.y || 0);
      out[2] = b.z + Math.sin(a) * d;
      return out;
    }
    // LANDMARK anchor: polar around this circuit's own notable scenery, in
    // multiples of the landmark's size, so a 126 m tower is framed from further
    // out than a grandstand without a per-circuit number.
    if (pose.at === "landmark") {
      const lm = landmarks(track);
      if (!lm.length) return posePoint(track, { at: "start", off: pose.off || 0, x: pose.x, y: pose.y || 20 }, out);
      const r = lm[Math.min(pose.rank || 0, lm.length - 1)];
      const size = Math.max(r.w, r.d, r.h);
      const d = (pose.distK === undefined ? 0 : pose.distK) * size;
      const a = pose.bear || 0;
      out[0] = r.x + Math.cos(a) * d;
      out[1] = r.y + (pose.yK === undefined ? 0 : pose.yK) * r.h + (pose.y || 0);
      out[2] = r.z + Math.sin(a) * d;
      return out;
    }
    Tracks.sample(track, anchorS(track, pose), _smp);
    const x = pose.x || 0;
    out[0] = _smp.p[0] + _smp.r[0] * x;
    out[1] = _smp.p[1] + (pose.y || 0);
    out[2] = _smp.p[2] + _smp.r[2] * x;
    return out;
  }

  // ---- easing --------------------------------------------------------------

  const EASE = {
    linear: (u) => u,
    in: (u) => u * u,
    out: (u) => 1 - (1 - u) * (1 - u),
    inOut: (u) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u)),
  };

  function lerpPose(track, a, b, u, out) {
    posePoint(track, a, _pa);
    posePoint(track, b, _pb);
    out[0] = _pa[0] + (_pb[0] - _pa[0]) * u;
    out[1] = _pa[1] + (_pb[1] - _pa[1]) * u;
    out[2] = _pa[2] + (_pb[2] - _pa[2]) * u;
    return out;
  }
  const _pa = [0, 0, 0], _pb = [0, 0, 0];

  // ---- the shipped sequence ------------------------------------------------

  /** Three shots against the loading screen's flyby budget. Written to read as
   *  an arrival: the grid you are about to start from, the corner you will meet
   *  first, then the straight you will be racing down.
   *
   *  Durations are FRACTIONS of the budget, not seconds, so the sequence keeps
   *  its shape when the screen's timing is retuned (it has been, twice). */
  const DEFAULT = [
    // ---- establish: where are we -------------------------------------------
    {
      id: "wide", dur: 0.12, ease: "inOut",
      // Very high and well outside the lap, panning. distR/yR are multiples of
      // the circuit's own radius, so this frames Monaco and Spa the same way.
      eye: [{ at: "centre", bear: -0.9, distR: 1.75, yR: 0.85 },
            { at: "centre", bear: -0.45, distR: 1.5, yR: 0.72 }],
      look: [{ at: "centre", distR: 0, yR: 0 }, { at: "centre", distR: 0, yR: 0 }],
      fov: [40, 44],
    },
    {
      id: "wide2", dur: 0.11, ease: "inOut",
      // A second establishing angle from the far side, descending — one high
      // shot reads as a map, two read as arriving.
      eye: [{ at: "centre", bear: 2.1, distR: 1.5, yR: 0.7 },
            { at: "centre", bear: 2.5, distR: 1.15, yR: 0.42 }],
      look: [{ at: "centre", distR: 0, yR: 0 }, { at: "centre", distR: 0.1, yR: 0 }],
      fov: [42, 48],
    },
    // ---- this circuit in particular ----------------------------------------
    {
      id: "landmark1", dur: 0.11, ease: "inOut",
      // Sweep past the circuit's most recognisable built thing. distK/yK are
      // multiples of the landmark's OWN size, so a 126 m tower is framed from
      // further out than a grandstand with no per-circuit number anywhere.
      eye: [{ at: "landmark", rank: 0, bear: 0.3, distK: 2.6, yK: 0.55 },
            { at: "landmark", rank: 0, bear: 1.25, distK: 1.9, yK: 0.75 }],
      look: [{ at: "landmark", rank: 0, distK: 0, yK: 0 }, { at: "landmark", rank: 0, distK: 0, yK: 0.1 }],
      fov: [45, 50],
    },
    {
      id: "landmark2", dur: 0.10, ease: "inOut",
      eye: [{ at: "landmark", rank: 1, bear: 3.4, distK: 2.4, yK: 0.5 },
            { at: "landmark", rank: 1, bear: 2.6, distK: 1.8, yK: 0.35 }],
      look: [{ at: "landmark", rank: 1, distK: 0, yK: 0 }, { at: "landmark", rank: 1, distK: 0, yK: 0 }],
      fov: [46, 52],
    },
    // ---- the corners you will actually drive --------------------------------
    {
      id: "turn-first", dur: 0.10, ease: "inOut",
      eye: [{ at: "corner", n: "first", off: -70, x: 14, y: 9 },
            { at: "corner", n: "first", off: 20, x: 16, y: 7 }],
      look: [{ at: "corner", n: "first", off: -10, x: 0, y: 0.8 },
             { at: "corner", n: "first", off: 45, x: 0, y: 0.8 }],
      fov: [46, 54],
    },
    {
      id: "turn-mid", dur: 0.10, ease: "inOut",
      // Corners are named by ROLE, not by number: circuits do not agree on how
      // many they have (Monza 11, Suzuka 18) and "turn 14" ports nowhere.
      eye: [{ at: "corner", n: "mid", off: -60, x: -16, y: 11 },
            { at: "corner", n: "mid", off: 30, x: -13, y: 6 }],
      look: [{ at: "corner", n: "mid", off: 0, x: 0, y: 0.8 },
             { at: "corner", n: "mid", off: 55, x: 0, y: 0.8 }],
      fov: [48, 54],
    },
    {
      id: "turn-late", dur: 0.10, ease: "inOut",
      eye: [{ at: "corner", n: "late", off: -50, x: 12, y: 5 },
            { at: "corner", n: "late", off: 40, x: 9, y: 3.5 }],
      look: [{ at: "corner", n: "late", off: 10, x: 0, y: 0.8 },
             { at: "corner", n: "late", off: 60, x: 0, y: 0.8 }],
      fov: [50, 56],
    },
    // ---- and then the grid you start from ------------------------------------
    {
      id: "grid", dur: 0.26, ease: "inOut",
      // The finale, and the longest shot: low behind the back row on the
      // centreline, rising to a crane over the start line.
      eye: [{ at: "grid", off: -30, x: 0, y: 1.6 }, { at: "start", off: -10, x: 0, y: 22 }],
      look: [{ at: "grid", off: 30, x: 0, y: 0.8 }, { at: "start", off: 40, x: 0, y: 0.8 }],
      fov: [38, 52],
    },
  ];

  // ---- solve ---------------------------------------------------------------

  const _eye = [0, 0, 0], _tgt = [0, 0, 0];
  const _out = { eye: _eye, tgt: _tgt, fov: 50, index: 0, id: "", cut: false, lift: 0 };

  /** The camera at `u` (0..1) through the whole sequence. Returns a POOLED
   *  object — read it, do not keep it. `cut` is true on the frame a new shot
   *  starts, so the caller can snap its damping instead of smearing the cut.
   *
   *  Beyond 1 the sequence holds on its last frame rather than looping: the
   *  screen is skippable, so a player who waits should not see it restart. */
  function solve(track, u, shots) {
    const list = (shots && shots.length) ? shots : DEFAULT;
    let total = 0;
    for (let i = 0; i < list.length; i++) total += list[i].dur || 0;
    if (!(total > 0)) total = 1;
    let at = Math.max(0, Math.min(1, u)) * total, idx = 0, acc = 0;
    for (; idx < list.length - 1; idx++) {
      if (at < acc + (list[idx].dur || 0)) break;
      acc += list[idx].dur || 0;
    }
    const shot = list[idx];
    const dur = shot.dur || 1;
    const t = Math.max(0, Math.min(1, (at - acc) / dur));
    const e = (EASE[shot.ease] || EASE.inOut)(t);

    lerpPose(track, shot.eye[0], shot.eye[1], e, _eye);
    lerpPose(track, shot.look[0], shot.look[1], e, _tgt);
    const authoredY = _eye[1];
    clearEye(track, _eye);
    // How far the clearance had to lift this eye. A shot authored beside a
    // building lifts a metre or two; one authored INSIDE a grandstand lifts
    // twenty. Reported so the difference is measurable rather than a matter of
    // squinting at a height — the unit test and tools/shot/flyby.mjs both read it.
    _out.lift = _eye[1] - authoredY;
    _out.fov = shot.fov ? shot.fov[0] + (shot.fov[1] - shot.fov[0]) * e : 50;
    _out.cut = idx !== _lastIdx;
    _lastIdx = idx;
    _out.index = idx;
    _out.id = shot.id || String(idx);
    return _out;
  }
  let _lastIdx = -1;

  /** Called when a run begins, so the first frame of the first shot reads as a
   *  cut and the camera does not glide in from wherever it last was. */
  function reset() { _lastIdx = -1; }

  return {
    solve, reset, clearEye, insideProp, blockers, isSolid,
    landmarks, bounds, landmarkScore,
    anchorS, posePoint, cornerS,
    DEFAULT, EASE,
    POLE_BACK, GRID_SPACING, GRID_ROWS, MIN_FILL, MIN_H,
  };
})();
Object.freeze(FlybySeq);
