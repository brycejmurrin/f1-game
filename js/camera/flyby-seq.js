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
 *   { at: "start"|"pole"|"grid"|"corner", n: 1, off: -40, x: 0, y: 6 }
 *
 *   at      the landmark: the start/finish line, pole's box, the back of the
 *           grid, or the apex of turn `n`
 *   off     metres of arc from it, signed along the racing direction
 *   x       lateral metres, + is right of the centreline
 *   y       metres above the road surface at that point
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
    const c = cs[Math.min(Math.max(1, n | 0), cs.length) - 1];
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
    {
      id: "grid",
      dur: 0.38, ease: "inOut",
      // Up the middle of the grid: low behind the back row, rising to a crane
      // over the start line. x: 0 is the centreline, between the two columns.
      eye: [{ at: "grid", off: -30, x: 0, y: 1.6 }, { at: "start", off: -10, x: 0, y: 22 }],
      look: [{ at: "grid", off: 30, x: 0, y: 0.8 }, { at: "start", off: 40, x: 0, y: 0.8 }],
      fov: [38, 52],
    },
    {
      id: "turn1",
      dur: 0.34, ease: "inOut",
      // The first corner from outside the bend, drifting through the apex.
      eye: [{ at: "corner", n: 1, off: -70, x: 14, y: 9 }, { at: "corner", n: 1, off: 20, x: 16, y: 7 }],
      look: [{ at: "corner", n: 1, off: -10, x: 0, y: 0.8 }, { at: "corner", n: 1, off: 45, x: 0, y: 0.8 }],
      fov: [46, 54],
    },
    {
      id: "straight",
      dur: 0.28, ease: "out",
      // Low and level down the pit straight, back to where the race begins.
      eye: [{ at: "start", off: -140, x: -6, y: 2.2 }, { at: "start", off: -40, x: -3, y: 3.2 }],
      look: [{ at: "start", off: 20, x: 0, y: 1 }, { at: "start", off: 70, x: 0, y: 1 }],
      fov: [50, 44],
    },
  ];

  // ---- solve ---------------------------------------------------------------

  const _eye = [0, 0, 0], _tgt = [0, 0, 0];
  const _out = { eye: _eye, tgt: _tgt, fov: 50, index: 0, id: "", cut: false };

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
    clearEye(track, _eye);
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
    anchorS, posePoint, cornerS,
    DEFAULT, EASE,
    POLE_BACK, GRID_SPACING, GRID_ROWS, MIN_FILL, MIN_H,
  };
})();
Object.freeze(FlybySeq);
