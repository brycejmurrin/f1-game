/* Apex 26 — flyby eye clearance: which props are solid, the lift over a roof, and the ground floor under a crane shot. FlybySeq keeps the same names. */
const FlybyClear = (function () {
  "use strict";

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
  /* A GRID INDEX over a box list, so a clearance test touches the few boxes
     near a point instead of every one. The planner tests every sample of every
     candidate eye against every solid and every tall tree; Monza's turn-first
     (~1,500 trees) took 1.35 s to plan and Suzuka's up to 3.4 s — a freeze at
     the cut, on every load now that vary() builds new shots. Candidates come
     back in LIST ORDER, which both tests depend on (first hit; sequential
     lifts), so a plan is identical to the full scan. */
  const GRID_CELL = 32;
  function boxGrid(list) {
    const cells = new Map();
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      const x0 = Math.floor((r.x - r.w / 2) / GRID_CELL), x1 = Math.floor((r.x + r.w / 2) / GRID_CELL);
      const z0 = Math.floor((r.z - r.d / 2) / GRID_CELL), z1 = Math.floor((r.z + r.d / 2) / GRID_CELL);
      for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
        const k = ix * 100003 + iz;
        let a = cells.get(k);
        if (!a) cells.set(k, a = []);
        a.push(i);
      }
    }
    return cells;
  }
  const _near = [], byIndex = (a, b) => a - b;
  function nearBoxes(cells, x, z, m) {
    _near.length = 0;
    const x0 = Math.floor((x - m) / GRID_CELL), x1 = Math.floor((x + m) / GRID_CELL);
    const z0 = Math.floor((z - m) / GRID_CELL), z1 = Math.floor((z + m) / GRID_CELL);
    let many = 0;
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const a = cells.get(ix * 100003 + iz);
      if (a) { many++; for (let j = 0; j < a.length; j++) _near.push(a[j]); }
    }
    if (many > 1) {
      _near.sort(byIndex);
      let w = 0;
      for (let j = 0; j < _near.length; j++) if (!j || _near[j] !== _near[j - 1]) _near[w++] = _near[j];
      _near.length = w;
    }
    return _near;
  }

  function insideProp(track, p, margin) {
    const b = blockers(track), m = margin || 0;
    const near = nearBoxes(track._fbSolidGrid || (track._fbSolidGrid = boxGrid(b)), p[0], p[2], m);
    for (let n = 0; n < near.length; n++) {
      const r = b[near[n]];
      if (Math.abs(p[0] - r.x) < r.w / 2 + m &&
          Math.abs(p[2] - r.z) < r.d / 2 + m &&
          p[1] > r.y - r.h / 2 - m && p[1] < r.y + r.h / 2 + m) return r;
    }
    return null;
  }

  /** THE ROAD IS ALWAYS CLEAR, so a shot that runs down it is never lifted.
   *  The props registry stores AXIS-ALIGNED boxes, and a long structure at an
   *  angle to the world axes gets a box far bigger than itself: Bahrain's main
   *  grandstand is 143 m long and lies at an angle, so its box reaches across
   *  the start straight. The closing shot, 0.85 m up the centreline, was
   *  therefore "inside a grandstand" and got lifted 21 m into a crane — the one
   *  shot whose whole point is being low. Cars drive that line at 300 km/h; if
   *  the geometry says a camera cannot be there, the geometry is wrong. */
  function onRoadPose(pose) {
    return pose && pose.at !== "centre" && pose.at !== "landmark" &&
      Math.abs(pose.x || 0) <= 8 && (pose.y || 0) <= 6;
  }

  /** LIFT, never shove sideways. A lateral escape would need a direction the
   *  shot cannot know (both ways may be blocked), and it would swing the framing;
   *  going over the top keeps the subject in the same part of the screen and is
   *  always available. Bounded so a bad shot reads as a high shot, not as orbit. */
  const CLEAR_M = 2.5;            // metres over a roof the eye is lifted to
  function clearEye(track, eye, margin) {
    const m = margin === undefined ? CLEAR_M : margin;
    for (let i = 0; i < 4; i++) {
      const hit = insideProp(track, eye, m);
      if (!hit) break;
      eye[1] = hit.y + hit.h / 2 + m;
    }
    return eye;
  }

  /** NEVER BELOW THE GROUND. `centre` and `landmark` heights are measured from
   *  a centroid and a prop's middle, not from the ground under the eye, so on a
   *  hillside (or over a road that runs above the anchor) nothing else stops an
   *  eye being authored underground: Red Bull Ring's rank-0 landmark is a 34 m
   *  tower standing in a valley, and landmark1 put the eye 6.1 m below the start
   *  straight on every sample. Terrain where there is terrain, the road where
   *  the eye is over it. Part of the PLANNED lift (profileOf), so the camera
   *  rises into the floor smoothly instead of popping up onto it. */
  const FLOOR = 1.5;
  const _fl = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 10 };
  function groundAt(track, x, z, y) {
    let g = Tracks.terrainY ? Tracks.terrainY(track, x, z) : null;
    if (g == null || !isFinite(g)) g = -Infinity;
    const pr = Tracks.project(track, x, z, null, y);
    if (pr) {
      Tracks.sample(track, pr.s, _fl);
      if (Math.abs(pr.lat) <= (_fl.hw || 10) + 2 && _fl.p[1] > g) g = _fl.p[1];
    }
    return g;
  }
  function floorEye(track, eye) {
    const g = groundAt(track, eye[0], eye[2], eye[1]);
    if (eye[1] < g + FLOOR) eye[1] = g + FLOOR;
    return eye;
  }

  return {
    isSolid, blockers, insideProp, onRoadPose, clearEye, groundAt, floorEye,
    boxGrid, nearBoxes, MIN_FILL, MIN_H, CLEAR_M,
  };
})();
Object.freeze(FlybyClear);
