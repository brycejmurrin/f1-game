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
 *   x       lateral metres, + is right of the centreline — EXCEPT at a corner,
 *           where + is the OUTSIDE of that corner, whichever way it turns
 *   y       metres above the road surface at that point
 *   n       a corner by number, or by ROLE: "first" | "mid" | "late"
 *   bear    radians around the anchor, 0 = FACING THE TRACK: for `centre` the
 *           side the start line is on, for `landmark` the side its nearest
 *           stretch of track is on
 *   distR/yR   multiples of the LAP's radius — one establishing shot fits any circuit
 *   distK/yK   multiples of the LANDMARK's own size — one shot fits a tower or a stand
 *
 * That is what makes one shot list mean the same thing on every circuit: "rise
 * up the middle of the grid" is the same instruction at Monza and at Monaco.
 * It is also why bearings and corner sides are RELATIVE. A world bearing names
 * a different picture at every circuit — the same `bear: 0.55` looked down on
 * Monza's towers against bare grass, with no sky and no track in frame — and a
 * fixed lateral sign put corner shots on the INSIDE at some circuits, peering
 * through trunks and lamp posts (Monaco's hairpin from its apex). "From the
 * track side" and "from the outside of the turn" port; a number does not.
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
  /* THE PLAYER'S OWN SLOT. gridUp() (js/game.js) seats the local player at P12
     (slot 11) unless a qualifying order exists, and menuGridCars() seats the
     flyby's field the same way and tells us here — so `{ at: "slot", n:
     "player" }` is the car the race is about to start from, not a stranger. */
  const PLAYER_SLOT_DEFAULT = 11;
  let _playerSlot = PLAYER_SLOT_DEFAULT;
  function setPlayerSlot(k) { _playerSlot = (k >= 0 && k === (k | 0)) ? k : PLAYER_SLOT_DEFAULT; }
  function slotIndex(pose) { return pose.n === "player" || pose.n === undefined ? _playerSlot : Math.max(0, pose.n | 0); }
  /** gridSlot()'s stagger (js/track/core/mesh.js): even slots left, odd right,
   *  min(0.4 hw, 3) m off the centreline — pinned against mesh.js by the test. */
  const _gs = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 10 };
  function slotX(track, k, s) {
    Tracks.sample(track, s, _gs);
    return (k % 2 === 0 ? -1 : 1) * Math.min((_gs.hw || 7) * 0.4, 3);
  }

  /* HOW THE FLYBY IS RENDERED, not where it is pointed — and the reason those
   * two live in the same file. The shots are VISTAS: a crane 190 m up looking
   * down a 5.8 km circuit is nothing like a chase cam 8 m behind a car, so the
   * cinematic renders with the far plane pushed out and the fog thinned, the
   * way photo mode does.
   *
   * BOTH ENDS READ THESE. The live screen (js/game.js's flyby branch) and the
   * EDITOR's preview (__apex.flybyCam, through dbgCam) used to pick their own:
   * the preview got photo mode's 6000 m and 15 % fog, the live screen got
   * gameplay's 900 m and 100 % fog, and the same shot came out clear in the
   * editor and a wall of haze on the loading screen. Reported as "why does the
   * loading flyby look way more foggy than what's shown in the editor" — it was
   * not the lighting, it was the lens. One pair of numbers, so they cannot
   * disagree again. */
  const FAR = 6000;               // metres of far clip — a whole circuit, not a corner
  const FOG = 0.15;               // × the session's fog density (photo mode's value)
  // Near plane. Pinned rather than inherited: gameplay picks 0.3 for cockpit and
  // hood (the wheel sits 0.46 m from the eye) and 0.9 for everything else, so a
  // flyby would have taken whichever camera MODE the player last raced in —
  // the same shot rendered with two different depth budgets. Nothing is within
  // a metre of a crane, and 0.9:6000 is the better ratio of the two.
  const NEAR = 0.9;

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
  const _near = [];
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
      _near.sort((a, b) => a - b);
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
  // No `gantry`: a gantry spans the road, so "the track side of it" is the
  // road under it — Buenos Aires's start gantry was its landmark2, framed from
  // its own footprint. The start line has the grid shots.
  const LM_WEIGHT = { tower: 3, building: 1.6, grandstand: 1.3, motorhome: 1, structure: 0.9 };
  const LM_MIN_H = 8;             // shorter than this reads as trackside furniture
  // metres — two boxes of one grandstand are one landmark, and so is a CLUSTER:
  // at 80 m Monza's three towers (84 m apart) were ranks 0 and 1, so the second
  // landmark shot was the first one again from a little closer.
  const LM_APART = 300;
  const LM_KEEP = 6;
  const LM_SPAN = 0.45;           // how much of a landmark's footprint counts as its framing size
  const LM_MIN_SIZE = 40;         // metres — nothing is framed as if it were smaller
  const LM_NEAR = 220;            // metres from the centreline — beyond this it is scenery, not a landmark
  const LM_EDGE = 5;              // metres past the road edge — nearer than this it is ON the track, not beside it

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
      if (TERRAIN.indexOf(r.kind) !== -1 || !LM_WEIGHT[r.kind]) continue;
      // Scored on the part ABOVE GROUND (lmBase): Hockenheim's stands are 30 m
      // hulls sunk 16 m into a bank, and Red Bull Ring's tower stands in a
      // valley — ranked on their hull heights they framed a buried box.
      const hv = lmH(track, r);
      const sc = landmarkScore(hv === r.h ? r : Object.assign({}, r, { h: hv }));
      if (!(sc > 0)) continue;
      // ON the road is not beside it: a box whose centre is within LM_EDGE of
      // the road edge straddles the track (a bridge, an overhead sign), and its
      // "track side" is the tarmac under it.
      const pr = Tracks.project(track, r.x, r.z);
      if (pr) {
        Tracks.sample(track, pr.s, _smp);
        if (Math.abs(pr.lat) - (_smp.hw || 10) < LM_EDGE) continue;
      }
      scored.push({ r: r, score: sc });
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

  /** Where a landmark's VISIBLE part starts: its hull bottom, or the ground
   *  under its centre when the hull is sunk into a bank. Cached per record on
   *  the track, never written onto the shared record. */
  function lmBase(track, r) {
    const cache = track._fbLmBase || (track._fbLmBase = new Map());
    if (cache.has(r)) return cache.get(r);
    const bottom = r.y - r.h / 2, top = r.y + r.h / 2;
    const g = groundAt(track, r.x, r.z, top);
    const base = (isFinite(g) && g > bottom) ? Math.min(g, top) : bottom;
    cache.set(r, base);
    return base;
  }
  function lmH(track, r) { return r.y + r.h / 2 - lmBase(track, r); }
  function lmMid(track, r) { return lmBase(track, r) + lmH(track, r) / 2; }

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
    // FACE: the bearing from the centroid to the start line (pts[0] is s = 0),
    // which is what a `centre` bearing of 0 means — the establishing shot then
    // has the main straight, the grid and the pits in its foreground.
    const face = Math.atan2(pts[0][2] - cz, pts[0][0] - cx);
    track._fbBounds = { x: cx, y: cy, z: cz, rad: rad, pts: pts, face: face };
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
    const c = cs[Math.min(cornerIndex(track, cs, n), cs.length - 1)];
    return (c && typeof c.f === "number") ? c.f * track.total : 0;
  }
  function cornerIndex(track, cs, n) {
    // A shot list is written once for every circuit, and circuits do not agree
    // on how many corners they have — Monza has 11, Suzuka 18. Naming a ROLE
    // ("the first corner", "something mid-lap") ports; naming corner 14 does not.
    let i;
    if (n === "first") i = roleCorner(track, cs, 0);
    else if (n === "mid") i = roleCorner(track, cs, Math.floor(cs.length * 0.45));
    else if (n === "late") i = roleCorner(track, cs, Math.floor(cs.length * 0.78));
    else if (n === "slowest" || n === "fastest") i = extremeCorner(track, cs, n === "slowest");
    else if (n === "lore") { const L = loreCorner(track, cs), slow = extremeCorner(track, cs, true); i = L >= 0 && track._fbFilmable[L] ? L : slow; }
    else i = Math.min(Math.max(1, n | 0), cs.length) - 1;
    return i;
  }

  /* ONE CORNER, ONE SHOT. Roles resolve independently, so two can name the
     same corner: Monza's "first" and "fastest" are both T1, and 14 of 52
     circuits filmed one corner twice in a single flyby (a third of varied
     loads). bindCorners() resolves a list's roles in order and moves a clash to
     that role's NEXT choice — the next-slowest, the next-fastest, else the
     nearest filmable corner — returning a copy whose corner poses carry plain
     corner numbers. Cached per list, so the per-shot caches downstream hold. */
  function roleRank(track, cs, n, home) {
    const ok = track._fbFilmable || (track._fbFilmable = cs.map((c) => filmable(track, c)));
    const idx = [];
    for (let k = 0; k < cs.length; k++) if (ok[k] && k !== home) idx.push(k);
    if (n === "slowest" || n === "fastest" || n === "lore") {   // lore's own fallback is the slowest
      const sg = n === "fastest" ? -1 : 1, r = (k) => (cs[k].r > 0 ? sg * cs[k].r : Infinity);
      return idx.sort((a, b) => r(a) - r(b));
    }
    return idx.sort((a, b) => Math.abs(a - home) - Math.abs(b - home) || b - a);
  }
  function shotCorner(shot) {
    const poses = [shot.eye[0], shot.eye[1], shot.look[0], shot.look[1]];
    for (let i = 0; i < 4; i++) if (poses[i] && poses[i].at === "corner") return poses[i].n === undefined ? 1 : poses[i].n;
    return null;
  }
  const SAME_M = 120;
  function bindCorners(track, list) {
    const cache = track._fbBind || (track._fbBind = new WeakMap());
    let out = cache.get(list);
    if (out) return out;
    cornerS(track, 1);
    const cs = track._fbCorners, used = [], total = track.total || 1;
    // By PLACE, not index: the measured list can hold one corner twice (Monza's
    // T1 and T2 are both s = 592, the two halves of the Rettifilo).
    const taken = (k) => used.some((j) => { const d = Math.abs(cs[j].f - cs[k].f) * total; return Math.min(d, total - d) < SAME_M; });
    // A corner the author NUMBERED is theirs: it is never moved (the editor's
    // CORNER field must film what it says), but it is claimed first, so the
    // roles steer around it.
    const numbered = (n) => typeof n !== "string";
    for (let i = 0; i < list.length; i++) {
      const role = shotCorner(list[i]);
      if (role !== null && cs.length && numbered(role)) used.push(Math.min(cornerIndex(track, cs, role), cs.length - 1));
    }
    out = list.map((shot) => {
      const role = shotCorner(shot);
      if (role === null || !cs.length || numbered(role)) return shot;
      let k = Math.min(cornerIndex(track, cs, role), cs.length - 1);
      if (taken(k)) {
        const alt = roleRank(track, cs, role, k).filter((j) => !taken(j));
        if (alt.length) k = alt[0];
      }
      used.push(k);
      const bind = (p) => (p && p.at === "corner" && (p.n === undefined ? 1 : p.n) === role ? Object.assign({}, p, { n: k + 1 }) : p);
      return Object.assign({}, shot, { eye: shot.eye.map(bind), look: shot.look.map(bind) });
    });
    cache.set(list, out);
    return out;
  }

  /* A ROLE NAMES A CORNER WORTH FILMING. The measured list counts kinks and
     chicane flicks as corners, and a role landing on one filmed a straight:
     Mont-Tremblant's "first" turns 0 degrees net over +-40 m, Sochi's 20,
     Jeddah's "late" 17, Buenos Aires's "mid" 21 — and a camera on "the outside"
     of a chicane is on the inside of its other half (Montreal's late, 42 net of
     75 swept). A role therefore takes the NEAREST corner (forward first) that
     turns at least TURN_MIN net over TURN_WIN either side, and a chicane — one
     that sweeps half as much again as it nets — only at TURN_CHICANE. Numbered
     corners are the author's own choice and are never moved. */
  const TURN_WIN = 40, TURN_MIN = 35 * Math.PI / 180, TURN_CHICANE = 45 * Math.PI / 180;
  const _tA = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 10 };
  function cornerTurn(track, s) {
    let net = 0, swept = 0, prev = null;
    for (let d = -TURN_WIN; d <= TURN_WIN; d += 4) {
      Tracks.sample(track, wrapS(track, s + d), _tA);
      const a = Math.atan2(_tA.t[2], _tA.t[0]);
      if (prev !== null) {
        const x = Math.atan2(Math.sin(a - prev), Math.cos(a - prev));
        net += x; swept += Math.abs(x);
      }
      prev = a;
    }
    return { net: Math.abs(net), swept: swept };
  }
  function filmable(track, c) {
    if (!c || typeof c.f !== "number") return false;
    const t = cornerTurn(track, c.f * track.total);
    return t.net >= TURN_MIN && (t.swept <= 1.5 * t.net || t.net >= TURN_CHICANE);
  }
  /* CORNERS BY CHARACTER. "first/mid/late" are positions; a circuit is known
     for its hairpin, its flat-out sweep, or the corner the announcer names
     (js/data/circuit-lore.js `corner`). `slowest`/`fastest` read the measured
     apex RADIUS (TrackMaps.corners `r`; its `v` is peak CURVATURE, not speed —
     reading `v` as a speed swapped the two) among FILMABLE corners; `lore` pulls
     "Turn N" out of the lore line and falls back to the slowest. All three
     cache like the others (cornerSide keys by n). */
  function extremeCorner(track, cs, slow) {
    const ok = track._fbFilmable || (track._fbFilmable = cs.map((c) => filmable(track, c)));
    let best = -1;
    for (let k = 0; k < cs.length; k++) {
      if (!ok[k] || !(cs[k].r > 0)) continue;
      if (best < 0 || (slow ? cs[k].r < cs[best].r : cs[k].r > cs[best].r)) best = k;
    }
    return best >= 0 ? best : 0;
  }
  const NUM_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
  function loreCorner(track, cs) {
    let line = "";
    try {
      const L = typeof CircuitLore !== "undefined" && track.def ? CircuitLore.forId(track.def.id) : null;
      line = (L && L.corner) || "";
    } catch (_) { line = ""; }
    const m = /\bturns? (\d+|[a-z]+)\b/i.exec(line);
    if (!m) return -1;
    const n = /^\d+$/.test(m[1]) ? +m[1] : NUM_WORDS.indexOf(m[1].toLowerCase());
    return n >= 1 && n <= cs.length ? n - 1 : -1;
  }
  function roleCorner(track, cs, i) {
    const ok = track._fbFilmable || (track._fbFilmable = cs.map((c) => filmable(track, c)));
    for (let d = 0; d < cs.length; d++) {
      if (i + d < cs.length && ok[i + d]) return i + d;
      if (d && i - d >= 0 && ok[i - d]) return i - d;
    }
    return i;
  }

  function anchorS(track, pose) {
    const total = track.total || 1;
    const off = pose.off || 0;
    switch (pose.at) {
      case "pole": return wrapS(track, total - POLE_BACK + off);
      case "grid": return wrapS(track, total - POLE_BACK - (GRID_ROWS - 1) * GRID_SPACING + off);
      case "corner": return wrapS(track, cornerS(track, pose.n || 1) + off);
      case "slot": return wrapS(track, total - POLE_BACK - slotIndex(pose) * GRID_SPACING + off);
      default: return wrapS(track, off);          // "start" — the line is s = 0 by construction
    }
  }

  const _smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 10 };

  /** The bearing from a landmark to its nearest stretch of track — what a
   *  landmark `bear` of 0 means. Shot from that side, the circuit sits between
   *  the camera and the landmark, so the frame says "this tower, at THIS
   *  track" instead of framing a tower against whatever is behind it. Cached
   *  on the track, keyed by the record, and never written onto the record: the
   *  props registry is shared with everything else that reads scenery. */
  function lmFace(track, r) {
    const cache = track._fbLmFace || (track._fbLmFace = new Map());
    if (cache.has(r)) return cache.get(r);
    const pts = bounds(track).pts;
    let best = Infinity, bx = r.x, bz = r.z;
    for (let j = 0; j < pts.length; j++) {
      const d = Math.hypot(r.x - pts[j][0], r.z - pts[j][2]);
      if (d < best) { best = d; bx = pts[j][0]; bz = pts[j][2]; }
    }
    const a = Math.atan2(bz - r.z, bx - r.x);
    cache.set(r, a);
    return a;
  }

  /* A LANDMARK SHOT STANDS ON THE TRACK SIDE, NOT A BLOCK BEYOND IT. The eye
     is `distK` landmark sizes out, and a size is the landmark's HEIGHT, so a
     170 m Las Vegas tower 60 m from the road put the eye 157-170 m past the
     track, inside the next tower along, and the planned lift then cleared
     that one by 40 m. Past LM_REACH beyond the landmark's own distance to the
     centreline the extra distance is taken at a quarter: the dolly between the
     two ends survives, the overshoot does not. */
  const LM_REACH = 40, LM_REACH_MIN = 60;
  function lmNear(track, r) {
    const cache = track._fbLmNear || (track._fbLmNear = new Map());
    if (cache.has(r)) return cache.get(r);
    const pr = Tracks.project(track, r.x, r.z);
    const d = pr ? Math.abs(pr.lat) : 0;
    cache.set(r, d);
    return d;
  }
  function lmDist(track, r, d) {
    const cap = Math.max(LM_REACH_MIN, lmNear(track, r) + LM_REACH);
    return d <= cap ? d : cap + (d - cap) * 0.25;
  }

  /** +1 when a corner turns LEFT (its outside is the road's +right), -1 when it
   *  turns right. The heading change is SUMMED in short steps across the apex:
   *  one comparison either side reads a hairpin backwards, because Monaco's
   *  Loews turns more than 180 degrees inside 60 m. A camera placement, the
   *  broadcast column — never a force on any car. */
  const _cA = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 10 };
  const _cB = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 10 };
  function cornerSide(track, n) {
    const cache = track._fbCornerSide || (track._fbCornerSide = {});
    const key = String(n === undefined ? 1 : n);
    if (cache[key] !== undefined) return cache[key];
    const s = cornerS(track, n === undefined ? 1 : n);
    // Each step: the next heading against this step's right vector, i.e. the
    // sine of the turn over 4 m. Swinging toward +right is a right-hander.
    let turnRight = 0;
    Tracks.sample(track, wrapS(track, s - 24), _cA);
    for (let i = -5; i <= 6; i++) {
      Tracks.sample(track, wrapS(track, s + i * 4), _cB);
      turnRight += _cB.t[0] * _cA.r[0] + _cB.t[2] * _cA.r[2];
      for (let j = 0; j < 3; j++) { _cA.t[j] = _cB.t[j]; _cA.r[j] = _cB.r[j]; }
    }
    cache[key] = turnRight > 0 ? -1 : 1;
    return cache[key];
  }

  /* A TRACKSIDE CAMERA STANDS AT THE FENCE. On a street circuit the outside of
     a corner is a building a few metres past the barrier, so a lateral offset
     that frames an open circuit well lands the eye inside a block — lifted
     30 m over Monaco's Ste Devote — or out over another stretch of road across
     a hairpin, staring down at tarmac. Capping |x| just beyond this side's
     barrier keeps the shot on the fence line. STREET circuits only: past an
     open circuit's barrier is run-off and trees, and Monza's chicane barriers
     sit 8 m out — capping there pulled good shots onto the kerbs. */
  const FENCE = 1.5;              // metres beyond the barrier line

  /** A track pose's lateral offset in the road's +right frame, capped at the
   *  fence at arc `s`. Capped per ENDPOINT, never along a move: barrier
   *  distances step between nodes, and a per-frame cap would print that step
   *  onto the camera path. */
  function poseX(track, pose, s) {
    let x = pose.x || 0;
    if (pose.at === "corner" && x) x *= cornerSide(track, pose.n);
    // A slot pose's x is relative to THAT car, so "x: 0" is right behind it.
    if (pose.at === "slot") { const k = slotIndex(pose); x += slotX(track, k, wrapS(track, (track.total || 1) - POLE_BACK - k * GRID_SPACING)); }
    if (x && track.def && track.def.street && Tracks.wallAt) {
      const w = Tracks.wallAt(track, s, x > 0 ? 1 : -1);
      if (w > 0 && Math.abs(x) > w + FENCE) x = (x > 0 ? 1 : -1) * (w + FENCE);
    }
    return x;
  }

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
      // ZERO MEANS THE CENTROID. The clamps are for a camera; the establishing
      // shots' LOOK pose is {distR: 0, yR: 0}, "at the middle of the lap", and
      // clamping it too aimed every one of them at a point 200 m out towards the
      // start line and 55 m up — off-centre and above the horizon of a low shot.
      const dR = pose.distR === undefined ? 1.4 : pose.distR;
      const yR = pose.yR === undefined ? 0.5 : pose.yR;
      const d = dR > 0 ? Math.max(C_DMIN, Math.min(C_DMAX, dR * b.rad)) : 0;
      const h = yR > 0 ? Math.max(C_HMIN, Math.min(C_HMAX, yR * b.rad)) : yR * b.rad;
      const a = b.face + (pose.bear || 0);
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
      // NO LANDMARK: the whole circuit instead. This used to be "start + 20 m",
      // which for a LOOK pose sat 8 m above an eye that the same fallback put
      // at start + 12 m — the camera stared straight up. A whole-circuit pose
      // keeps an eye an eye and a look a look (solve() swaps the whole shot for
      // landmarkFallback(); this is for callers that solve one pose).
      if (!lm.length) {
        const eye = (pose.distK || 0) > 0;
        return posePoint(track, { at: "centre", bear: pose.bear || 0, distR: eye ? 0.8 : 0, yR: eye ? 0.25 : 0 }, out);
      }
      const r = lm[Math.min(pose.rank || 0, lm.length - 1)];
      // HEIGHT FIRST, footprint at a discount. The longest side made a 162 m x
      // 21 m grandstand "162 m big", so Monza's was framed from ~290 m as a
      // sliver behind the trees; a tower's height is still its size. And a
      // floor, because a shot's `y` is in metres: Bahrain's 15 m pavilion,
      // framed from 1.6 of its own size, put a 12 m-high eye 29 m away looking
      // down at the roof.
      // Heights are of the part ABOVE GROUND (lmBase), centred on its middle.
      const size = lmSize(track, r);
      const d = lmDist(track, r, (pose.distK === undefined ? 0 : pose.distK) * size);
      const a = lmFace(track, r) + (pose.bear || 0);
      out[0] = r.x + Math.cos(a) * d;
      out[1] = lmMid(track, r) + (pose.yK === undefined ? 0 : pose.yK) * lmH(track, r) + (pose.y || 0);
      out[2] = r.z + Math.sin(a) * d;
      return out;
    }
    const s = anchorS(track, pose);
    Tracks.sample(track, s, _smp);
    const x = poseX(track, pose, s);
    out[0] = _smp.p[0] + _smp.r[0] * x;
    out[1] = _smp.p[1] + (pose.y || 0);
    out[2] = _smp.p[2] + _smp.r[2] * x;
    return out;
  }

  // ---- the inverse: a world point back to a pose ---------------------------
  //
  // THE FREE CAMERA'S "COPY AS FLYBY POSE". A camera flown to a good spot is a
  // world point, and a world point is exactly what a shot list must not hold
  // (see the header: it names a different picture on every circuit). This
  // re-expresses the point in the anchor it is nearest, so the result can be
  // pasted into the editor and still means "just outside turn 3" rather than
  // "x = 412". Every answer is re-solved through posePoint() and the miss is
  // reported as `err`, so a caller never has to trust the inversion.

  const _inv = [0, 0, 0];
  const r2 = (n) => Math.round(n * 100) / 100;
  const r5 = (n) => Math.round(n * 1e5) / 1e5;
  function wrapAng(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

  /** Arc distance from `s` to the nearest corner apex, signed along the lap. */
  function nearestCorner(track, s) {
    cornerS(track, 1);                           // fills track._fbCorners
    const cs = track._fbCorners || [], total = track.total || 1;
    let best = null;
    for (let i = 0; i < cs.length; i++) {
      if (!cs[i] || typeof cs[i].f !== "number") continue;
      let off = s - cs[i].f * total;
      off -= Math.round(off / total) * total;    // wrap into (-total/2, total/2]
      if (!best || Math.abs(off) < Math.abs(best.off)) best = { n: i + 1, off };
    }
    return best;
  }

  function trackPose(track, p, opts) {
    const pr = Tracks.project(track, p[0], p[2]);
    // project() measures `lat` along the interpolated right vector from the
    // nearest point on the node CHORD, but that vector is not square to the
    // chord inside a corner, and posePoint() walks it from sample(s). At 18 m
    // out on a Monza corner that is 0.8 m of miss. A few Newton steps in the
    // XZ plane solve posePoint's own equation, p = sample(s).p + r(s) * x.
    let s = pr.s, x = pr.lat;
    for (let it = 0; it < 4; it++) {
      Tracks.sample(track, s, _smp);
      const ex = p[0] - _smp.p[0] - _smp.r[0] * x, ez = p[2] - _smp.p[2] - _smp.r[2] * x;
      const tl = Math.hypot(_smp.t[0], _smp.t[2]) || 1, rl = Math.hypot(_smp.r[0], _smp.r[2]) || 1;
      s += (ex * _smp.t[0] + ez * _smp.t[2]) / tl;
      x += (ex * _smp.r[0] + ez * _smp.r[2]) / rl / rl;
    }
    s = wrapS(track, s); pr.s = s; pr.lat = x;
    Tracks.sample(track, s, _smp);
    const y = r2(p[1] - _smp.p[1]);
    const win = opts.cornerWindow == null ? 150 : opts.cornerWindow;
    const c = opts.at === "start" ? null : nearestCorner(track, pr.s);
    if (c && (opts.at === "corner" || Math.abs(c.off) <= win)) {
      // A corner's +x is its OUTSIDE (poseX multiplies by cornerSide), and the
      // side is ±1, so dividing it back out is multiplying by it.
      return { at: "corner", n: c.n, off: r2(c.off), x: r2(pr.lat * cornerSide(track, c.n)), y };
    }
    const total = track.total || 1;
    return { at: "start", off: r2(pr.s > total / 2 ? pr.s - total : pr.s), x: r2(pr.lat), y };
  }

  // posePoint's helicopter clamps, mirrored: a `centre` pose cannot say "closer
  // than 200 m" or "further than 850 m", so outside them it is not an answer.
  const C_DMIN = 200, C_DMAX = 850, C_HMIN = 55, C_HMAX = 190;
  function centrePose(track, p) {
    const b = bounds(track);
    const d = Math.hypot(p[0] - b.x, p[2] - b.z);
    if (d < C_DMIN || d > C_DMAX) return null;
    const dy = p[1] - b.y, h = Math.max(C_HMIN, Math.min(C_HMAX, dy));
    const pose = { at: "centre", bear: r5(wrapAng(Math.atan2(p[2] - b.z, p[0] - b.x) - b.face)),
      distR: r5(d / b.rad), yR: r5(h / b.rad) };
    if (Math.abs(dy - h) > 0.005) pose.y = r2(dy - h);   // the part the clamp cannot carry
    return pose;
  }

  function lmSize(track, r) { return Math.max(LM_MIN_SIZE, lmH(track, r), LM_SPAN * Math.max(r.w, r.d)); }

  /** The nearest landmark to `p` in XZ as {rank, r, d}, or null. */
  function nearestLandmark(track, p) {
    const lm = landmarks(track);
    let best = null;
    for (let i = 0; i < lm.length; i++) {
      const d = Math.hypot(p[0] - lm[i].x, p[2] - lm[i].z);
      if (!best || d < best.d) best = { rank: i, r: lm[i], d };
    }
    return best;
  }
  function landmarkPose(track, p, rank) {
    const lm = landmarks(track);
    if (!lm.length) return null;
    const i = Math.max(0, Math.min(rank | 0, lm.length - 1)), r = lm[i];
    const d = Math.hypot(p[0] - r.x, p[2] - r.z);
    const bear = d > 1e-6 ? wrapAng(Math.atan2(p[2] - r.z, p[0] - r.x) - lmFace(track, r)) : 0;
    // lmDist() inverted: past the reach cap a world metre is four authored ones.
    const cap = Math.max(LM_REACH_MIN, lmNear(track, r) + LM_REACH);
    const da = d <= cap ? d : cap + (d - cap) * 4;
    return { at: "landmark", rank: i, bear: r5(bear), distK: r5(da / lmSize(track, r)), yK: 0, y: r2(p[1] - lmMid(track, r)) };
  }

  /** A world point → the pose that names it, with its round-trip miss.
   *  opts.at: "auto" (default) | "track" | "corner" | "start" | "centre" | "landmark"
   *  opts.rank (landmark), opts.cornerWindow (m, default 150), opts.trackMax
   *  (m from the centreline beyond which "auto" stops anchoring on the road,
   *  default 80). "auto" picks the road when near it, then a landmark the point
   *  is within three sizes of, then the whole circuit — and the road whenever
   *  the others cannot represent the point, since a track pose always can. */
  function poseFromWorld(track, p, opts) {
    opts = opts || {};
    const at = opts.at || "auto";
    let pose = null;
    if (at === "centre") pose = centrePose(track, p);
    else if (at === "landmark") {
      const nl = opts.rank == null ? nearestLandmark(track, p) : null;
      pose = landmarkPose(track, p, opts.rank != null ? opts.rank : (nl ? nl.rank : 0));
    } else if (at === "auto") {
      const pr = Tracks.project(track, p[0], p[2]);
      const trackMax = opts.trackMax == null ? 80 : opts.trackMax;
      if (pr.dist > trackMax) {
        const nl = nearestLandmark(track, p);
        if (nl && nl.d <= 3 * lmSize(track, nl.r)) pose = landmarkPose(track, p, nl.rank);
        else pose = centrePose(track, p);
      }
    }
    if (!pose) pose = trackPose(track, p, { at, cornerWindow: opts.cornerWindow });
    posePoint(track, pose, _inv);
    const err = Math.hypot(_inv[0] - p[0], _inv[1] - p[1], _inv[2] - p[2]);
    return { pose, err: Math.round(err * 1000) / 1000 };
  }

  /** The free camera's current view as a HELD one-shot list entry — eye and
   *  look both converted, same pose at both ends — ready for the editor. The
   *  look is anchored on the road unless the eye framed a landmark it is
   *  looking at, so a pan along the track later follows the track. */
  function shotFromView(track, eye, target, fov, opts) {
    opts = opts || {};
    const e = poseFromWorld(track, eye, opts);
    let lookOpts = { at: "track" };
    if (e.pose.at === "landmark") {
      const nl = nearestLandmark(track, target);
      if (nl && nl.rank === e.pose.rank && nl.d <= lmSize(track, nl.r)) lookOpts = { at: "landmark", rank: nl.rank };
    }
    const t = poseFromWorld(track, target, lookOpts);
    const f = Math.round((fov || 50) * 10) / 10;
    return {
      shot: { id: opts.id || "freecam", dur: opts.dur || 0.1, ease: "inOut",
        eye: [e.pose, Object.assign({}, e.pose)], look: [t.pose, Object.assign({}, t.pose)], fov: [f, f] },
      err: { eye: e.err, look: t.err },
    };
  }

  // ---- easing --------------------------------------------------------------

  const EASE = {
    linear: (u) => u,
    in: (u) => u * u,
    out: (u) => 1 - (1 - u) * (1 - u),
    inOut: (u) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u)),
  };

  function trackAnchored(p) {
    return p && p.at !== "centre" && p.at !== "landmark";
  }

  /** A MOVE ALONG THE TRACK FOLLOWS THE TRACK. Interpolating two track-anchored
   *  poses as world points draws a straight line between them, which cuts every
   *  corner in between: the closing grid shot runs ~200 m from behind the back
   *  row to the line, and at Bahrain that chord left the road by up to 49 m —
   *  a shot authored as "up the middle of the grid" ended up in the run-off.
   *  Track-anchored pairs therefore interpolate in TRACK space (arc, lateral,
   *  height) and convert once, which also handles a move that crosses the
   *  start line, where the raw arc numbers jump by a lap.
   *
   *  A pair that is not track-anchored (the whole-circuit and landmark orbits)
   *  has no arc to walk, so those still interpolate as world points. */
  function lerpPose(track, a, b, u, out) {
    if (trackAnchored(a) && trackAnchored(b)) {
      const total = track.total || 1;
      const sa = anchorS(track, a), sb = anchorS(track, b);
      let d = sb - sa;
      while (d > total / 2) d -= total;          // go the short way round the lap
      while (d < -total / 2) d += total;
      const xa = poseX(track, a, sa), xb = poseX(track, b, sb);
      Tracks.sample(track, wrapS(track, sa + d * u), _smp);
      const x = xa + (xb - xa) * u;
      out[0] = _smp.p[0] + _smp.r[0] * x;
      out[1] = _smp.p[1] + (a.y || 0) + ((b.y || 0) - (a.y || 0)) * u;
      out[2] = _smp.p[2] + _smp.r[2] * x;
      return out;
    }
    posePoint(track, a, _pa);
    posePoint(track, b, _pb);
    out[0] = _pa[0] + (_pb[0] - _pa[0]) * u;
    out[1] = _pa[1] + (_pb[1] - _pa[1]) * u;
    out[2] = _pa[2] + (_pb[2] - _pa[2]) * u;
    return out;
  }
  const _pa = [0, 0, 0], _pb = [0, 0, 0];

  // ---- the shipped sequence ------------------------------------------------

  /* NINE SHOTS OVER FLY_MS (24 s), ~2.4-3.1 s each. Durations stay fractions
     so retuning the budget rebalances all of them rather than truncating the
     last.

     PANS ARE SLOW AND SHORT. The first cut swung 0.45 rad in 1.2 s and read as a
     camera being yanked; the same 0.2 rad over 3 s reads as a crane.

     EVERY SHOT HAS A SUBJECT, and the bearings/sides are the relative ones the
     header describes, so the subject is the same thing on every circuit:
       wide        the start straight in the foreground, the lap behind it
       wide2       the far side of the lap, lower and closer
       landmark1/2 this circuit's own buildings, from the TRACK side, low,
                   looking UP so they stand against the sky with the circuit
                   in front of them (it used to look DOWN at them from above
                   their centre — towers against grass, no horizon, no track)
       turn-*      from the OUTSIDE of the turn, raised like a trackside stand
       grid-crane  up behind the back row: the whole field, long lens
       grid        up the aisle between the columns, ending among the front
                   rows with the start gantry ahead */
  const DEFAULT = [
    // ---- establish: where are we -------------------------------------------
    {
      id: "wide", dur: 0.11, ease: "inOut",
      eye: [{ at: "centre", bear: -0.30, distR: 1.10, yR: 0.36 },
            { at: "centre", bear: -0.12, distR: 1.00, yR: 0.32 }],
      look: [{ at: "centre", distR: 0, yR: 0 }, { at: "centre", distR: 0, yR: 0 }],
      fov: [36, 38],
    },
    {
      id: "wide2", dur: 0.09, ease: "inOut",
      eye: [{ at: "centre", bear: 2.35, distR: 0.80, yR: 0.30 },
            { at: "centre", bear: 2.55, distR: 0.70, yR: 0.25 }],
      look: [{ at: "centre", distR: 0, yR: 0 }, { at: "centre", distR: 0, yR: 0 }],
      fov: [36, 39],
    },
    // ---- this circuit in particular ----------------------------------------
    {
      id: "landmark1", dur: 0.10, ease: "inOut",
      eye: [{ at: "landmark", rank: 0, bear: -0.28, distK: 1.7, yK: -0.15, y: 12 },
            { at: "landmark", rank: 0, bear: -0.08, distK: 1.5, yK: -0.1, y: 12 }],
      look: [{ at: "landmark", rank: 0, distK: 0, yK: 0.2 }, { at: "landmark", rank: 0, distK: 0, yK: 0.25 }],
      fov: [38, 40],
    },
    {
      id: "landmark2", dur: 0.09, ease: "inOut",
      eye: [{ at: "landmark", rank: 1, bear: 0.30, distK: 1.8, yK: -0.1, y: 12 },
            { at: "landmark", rank: 1, bear: 0.10, distK: 1.6, yK: -0.05, y: 12 }],
      look: [{ at: "landmark", rank: 1, distK: 0, yK: 0.15 }, { at: "landmark", rank: 1, distK: 0, yK: 0.2 }],
      fov: [38, 41],
    },
    // ---- the corners you will actually drive --------------------------------
    {
      id: "turn-first", dur: 0.10, ease: "inOut",
      eye: [{ at: "corner", n: "first", off: -60, x: 16, y: 9 },
            { at: "corner", n: "first", off: 0, x: 18, y: 8 }],
      look: [{ at: "corner", n: "first", off: -12, x: 0, y: 0.6 },
             { at: "corner", n: "first", off: 30, x: 0, y: 0.6 }],
      fov: [38, 42],
    },
    {
      id: "turn-mid", dur: 0.09, ease: "inOut",
      eye: [{ at: "corner", n: "lore", off: -35, x: 16, y: 9 },
            { at: "corner", n: "lore", off: 0, x: 18, y: 8 }],
      // Held on the APEX and 20 m past it, not 15-55 m down the road: the lore
      // corner is often the slowest one, and past a 10 m hairpin that aim swung
      // behind the camera (frame-report, 16 circuits: 40 -> 52; renders agree).
      // An apex aim once filmed a kerb from above from a fence-line camera;
      // 16-18 m out and 8-9 m up, this one keeps the whole bend and its exit.
      look: [{ at: "corner", n: "lore", off: 0, x: 0, y: 0.6 },
             { at: "corner", n: "lore", off: 20, x: 0, y: 0.6 }],
      fov: [42, 44],
    },
    {
      id: "turn-late", dur: 0.09, ease: "inOut",
      eye: [{ at: "corner", n: "fastest", off: -35, x: 13, y: 6 },
            { at: "corner", n: "fastest", off: 20, x: 14, y: 5 }],
      look: [{ at: "corner", n: "fastest", off: 5, x: 0, y: 0.6 },
             { at: "corner", n: "fastest", off: 45, x: 0, y: 0.6 }],
      fov: [40, 43],
    },
    // ---- and then the grid you start from ------------------------------------
    // The road's slope-scaled depth bias used to hide every car seen from ahead
    // of pole (fixed in PR #248: the road draws unbiased), so the grid can now
    // be filmed from the front again.
    {
      id: "grid-crane", dur: 0.10, ease: "inOut",
      // A slow crane up behind the back row, long lens: the whole field stacked
      // up towards the lights.
      // On the aisle's line and tight behind the last row: from 6 m left and
      // 38 m back, Bahrain's crane stood by the final bend and filmed its
      // trackside hoarding across two thirds of the frame.
      eye: [{ at: "grid", off: -16, x: -1, y: 2.2 }, { at: "grid", off: -8, x: 0, y: 5.8 }],
      // Aimed at MID-GRID, not at pole: a grid that runs out of the final bend
      // (Bahrain's) puts pole round the corner, and the sightline to it crossed
      // the grandstand on the inside of the curve.
      look: [{ at: "grid", off: 45, x: 0, y: 0.8 }, { at: "grid", off: 85, x: 0, y: 0.8 }],
      fov: [30, 32],
    },
    {
      id: "grid-front", dur: 0.11, ease: "inOut",
      // THE FRONT ROW, FROM THE START LINE, looking back down the grid: pole
      // big in frame and the field stacked behind it. Close and a little off
      // the aisle — measured with frame-report across eight circuits, 40+ m
      // out on a long lens left the cars at 1-2 % of the frame and put the
      // eye inside Bahrain's and Istanbul's main grandstands.
      eye: [{ at: "pole", off: 14, x: 3.5, y: 2.2 }, { at: "pole", off: 10, x: 2.5, y: 1.8 }],
      look: [{ at: "pole", off: -12, x: 0, y: 0.6 }, { at: "pole", off: -12, x: 0, y: 0.6 }],
      fov: [40, 40],
    },
    {
      id: "grid-mine", dur: 0.12, ease: "out",
      // YOUR CAR, in the slot the race starts you from (menuGridCars seats the
      // field as gridUp will, and tells FlybySeq which slot is yours): a low
      // push-in from two rows back that settles just behind the car, looking
      // past it at the lights — the frame the race's own camera takes over from.
      eye: [{ at: "slot", n: "player", off: -22, x: 0, y: 1.9 }, { at: "slot", n: "player", off: -9, x: 0, y: 1.5 }],
      look: [{ at: "slot", n: "player", off: 6, x: 0, y: 0.9 }, { at: "start", off: 30, x: 0, y: 1.2 }],
      fov: [36, 40],
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
  /** Plan every shot of `shots` now (solve() caches a plan per shot on first
   *  use) so the flyby never plans mid-sequence: vary() builds new shots each
   *  load, and a cold corner plan is a visible stall at the cut. */
  function warm(track, shots) {
    const list = (shots && shots.length) ? shots : DEFAULT;
    let total = 0, acc = 0;
    for (let i = 0; i < list.length; i++) total += list[i].dur || 0;
    for (let i = 0; i < list.length && total > 0; i++) { solve(track, (acc + (list[i].dur || 0) / 2) / total, list); acc += list[i].dur || 0; }
    reset();
  }
  function solve(track, u, shots) {
    const list = bindCorners(track, (shots && shots.length) ? shots : DEFAULT);
    let total = 0;
    for (let i = 0; i < list.length; i++) total += list[i].dur || 0;
    if (!(total > 0)) total = 1;
    let at = Math.max(0, Math.min(1, u)) * total, idx = 0, acc = 0;
    for (; idx < list.length - 1; idx++) {
      if (at < acc + (list[idx].dur || 0)) break;
      acc += list[idx].dur || 0;
    }
    const shot = landmarkFallback(track, list[idx]);
    const dur = shot.dur || 1;
    const t = Math.max(0, Math.min(1, (at - acc) / dur));
    const e = (EASE[shot.ease] || EASE.inOut)(t);

    // The PLAN is the authored shot after every per-shot correction (grid
    // sightline, corner step-in, pan budget, lift profile) — see planShot().
    const plan = planShot(track, shot, dur / total);
    lerpPose(track, plan.eye[0], plan.eye[1], e, _eye);
    lerpPose(track, plan.look[0], plan.look[1], e, _tgt);
    const authoredY = _eye[1];
    // A shot that runs low along the track is trusted as authored (see onRoadPose).
    if (!plan.onRoad) {
      _eye[1] += liftAt(plan.prof, e);
      floorEye(track, clearEye(track, _eye));   // safety net only: the profile already cleared every sample
    }
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

  /* THE LIFT IS PLANNED PER SHOT, NOT DISCOVERED PER FRAME. clearEye() alone
     runs on the frame the eye enters a box, so the camera popped straight up
     mid-shot the instant it touched one: 17 m in a single frame on Monza's
     turn-late, 54 m on Shanghai's turn-mid, at 27 circuits. The shot's path is
     sampled once (LIFT_N points along the eased parameter), the lift each
     sample needs is recorded, and the lift at any point is the largest of
     those needs FADED linearly over LIFT_W of the shot either side — so the
     camera is already rising before it reaches the obstruction and settles
     after it.

     AND A CORNER SHOT IS MOVED IN BEFORE IT IS LIFTED. Only street circuits
     get the fence cap, so a corner eye 15-18 m out on an open circuit grazed
     Shanghai's, Mexico's and Sochi's trackside structures and was lifted 30-54
     m clear of them — a crane shot of a roof instead of a corner. When a
     corner shot needs more than LIFT_OK, both eyes step towards the road
     together, 1.5 m at a time (never inside IN_MIN of the centreline), and the
     least-lifted plan wins. Cached per shot object on the track; an edited
     list is new objects and recomputes. */
  const LIFT_N = 32, LIFT_W = 0.3, LIFT_OK = 4, IN_STEP = 1.5, IN_MIN = 9;

  /* TREES ARE OBSTACLES TO A PLAN, NOT TO A FRAME. Canopies are not in the
     solid set — a camera brushing a hedge is not a camera inside a wall, and
     lifting every frame over every pine would make forest circuits all crane
     — but a PLANNED eye should not sit in one: the frame report found Monza's
     turn-first eye inside a stone-pine canopy, a screen of leaves. So the
     plan's profile clears tall trees too (TREE_H up, their full box, TREE_M
     over the top), which is what the step-in then works to avoid, and the
     per-frame safety net (clearEye) still ignores them. */
  const TREES = ["pine", "stonePine", "cypress", "broadleafFall", "palm", "acacia", "tree"];
  const TREE_H = 8, TREE_M = 1;
  function treeBlockers(track) {
    if (track._fbTrees) return track._fbTrees;
    const out = [];
    const list = track.props && track.props.list;
    if (list) for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (r && r.h >= TREE_H && TREES.indexOf(r.kind) !== -1) out.push(r);
    }
    track._fbTrees = out;
    return out;
  }
  function clearTrees(track, eye) {
    const b = treeBlockers(track);
    const near = nearBoxes(track._fbTreeGrid || (track._fbTreeGrid = boxGrid(b)), eye[0], eye[2], 0);
    for (let n = 0; n < near.length; n++) {
      const r = b[near[n]];
      if (Math.abs(eye[0] - r.x) < r.w / 2 && Math.abs(eye[2] - r.z) < r.d / 2 &&
          eye[1] > r.y - r.h / 2 && eye[1] < r.y + r.h / 2 + TREE_M) eye[1] = r.y + r.h / 2 + TREE_M;
    }
    return eye;
  }

  const _lp = [0, 0, 0];
  /* The profile is SAMPLED, and the per-frame safety net is not: an eye that
     grazes a box's corner between two samples was lifted 27 m for one frame
     at Sochi's turn-late. So the plan clears solids with the safety net's
     margin PLUS half the widest gap between its samples — anything the net
     could catch between two samples, the plan has already cleared. */
  const _lq = [0, 0, 0];
  function profileOf(track, eye0, eye1) {
    const prof = new Float32Array(LIFT_N + 1);
    let max = 0, gap = 0;
    lerpPose(track, eye0, eye1, 0, _lq);
    for (let j = 1; j <= LIFT_N; j++) {
      lerpPose(track, eye0, eye1, j / LIFT_N, _lp);
      gap = Math.max(gap, Math.hypot(_lp[0] - _lq[0], _lp[1] - _lq[1], _lp[2] - _lq[2]));
      _lq[0] = _lp[0]; _lq[1] = _lp[1]; _lq[2] = _lp[2];
    }
    const m = CLEAR_M + gap / 2 + 0.25;
    for (let j = 0; j <= LIFT_N; j++) {
      lerpPose(track, eye0, eye1, j / LIFT_N, _lp);
      const y0 = _lp[1];
      for (let k = 0; k < 3; k++) {
        const y = _lp[1];
        floorEye(track, clearTrees(track, clearEye(track, _lp, m)));
        if (_lp[1] === y) break;
      }
      prof[j] = _lp[1] - y0;
      if (prof[j] > max) max = prof[j];
    }
    return { prof: bridge(prof), max: max };
  }
  /* A LIFT HOLDS ACROSS A SHORT GAP. Two obstructions a little apart left the
     faded profile with a valley between them, and the camera dipped 8 m and
     rose again inside one shot (Mont-Tremblant's turn-late, through a pine
     wood with one clearing) — a bob, and at 20 m up a fast pitch. A valley
     narrower than BRIDGE of the shot is filled at the lower of its two sides. */
  const BRIDGE = 0.6;
  function bridge(prof) {
    const n = prof.length, w = Math.round(BRIDGE * (n - 1)), out = new Float32Array(n);
    for (let j = 0; j < n; j++) {
      let l = 0, r = 0;
      for (let i = Math.max(0, j - w); i <= j; i++) if (prof[i] > l) l = prof[i];
      for (let i = j; i <= Math.min(n - 1, j + w); i++) if (prof[i] > r) r = prof[i];
      out[j] = Math.max(prof[j], Math.min(l, r));
    }
    return out;
  }
  /** A corner eye k steps towards the road; a landmark eye k steps towards its
   *  landmark (LM_STEP of the distance each, never under LM_IN_MIN of it). */
  const LM_STEP = 0.08, LM_IN_MIN = 0.6;
  function inset(pose, k) {
    if (pose.at === "landmark") {
      if (!((pose.distK || 0) > 0)) return pose;
      const o = Object.assign({}, pose);
      o.distK = pose.distK * Math.max(LM_IN_MIN, 1 - k * LM_STEP);
      return o;
    }
    const x = pose.x || 0, ax = Math.abs(x);
    if (pose.at !== "corner" || ax <= IN_MIN) return pose;
    const o = Object.assign({}, pose);
    o.x = (x > 0 ? 1 : -1) * Math.max(IN_MIN, ax - k * IN_STEP);
    return o;
  }

  /* NO LANDMARK TO FILM. A circuit with one landmark filmed it twice (the
     rank clamps), and one with none filmed the start line from 20 m up. A
     landmark shot whose rank this circuit does not have becomes a whole-circuit
     shot from a side the establishing shots do not use (FB_BEAR, by rank), so
     the sequence still has as many different pictures as it has shots. Cached
     per shot object, like the plan. */
  const FB_BEAR = [1.25, -1.75];
  function landmarkFallback(track, shot) {
    let rank = -1;
    const poses = [shot.eye[0], shot.eye[1], shot.look[0], shot.look[1]];
    for (let i = 0; i < 4; i++) if (poses[i] && poses[i].at === "landmark") rank = Math.max(rank, poses[i].rank || 0);
    if (rank < 0 || rank < landmarks(track).length) return shot;
    const cache = track._fbFallback || (track._fbFallback = new WeakMap());
    let fb = cache.get(shot);
    if (fb) return fb;
    const bear = FB_BEAR[Math.min(rank, FB_BEAR.length - 1)];
    fb = Object.assign({}, shot, {
      eye: [{ at: "centre", bear: bear - 0.1, distR: 0.75, yR: 0.24 },
            { at: "centre", bear: bear + 0.1, distR: 0.66, yR: 0.2 }],
      look: [{ at: "centre", distR: 0, yR: 0 }, { at: "centre", distR: 0, yR: 0 }],
    });
    cache.set(shot, fb);
    return fb;
  }

  /* A SIGHTLINE DOWN THE GRID STAYS OVER THE GRID. The grid shots look 60-110
     m up the road from an eye on the centreline; on a grid that runs out of a
     bend (Bahrain's, Jeddah's, Magny-Cours's) that chord crossed the infield —
     13.6 m past the road edge at Bahrain, a crane shot of the inside
     grandstand. A shot whose eye runs down the road (onRoadPose) and whose
     look is a road pose too has each look's LEAD over its eye shortened, in
     steps, until the chord stays within SIGHT_EDGE of the road edge at every
     sample, never below SIGHT_MIN of the authored lead. */
  const SIGHT_EDGE = 1, SIGHT_MIN = 0.3;
  const _sa = [0, 0, 0], _sb = [0, 0, 0], _sm = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 10 };
  function arcDelta(track, a, b) {
    const total = track.total || 1;
    let d = anchorS(track, b) - anchorS(track, a);
    while (d > total / 2) d -= total;
    while (d < -total / 2) d += total;
    return d;
  }
  function sightOff(track, eye, look) {
    let worst = -Infinity;
    for (let j = 0; j <= 4; j++) {
      lerpPose(track, eye[0], eye[1], j / 4, _sa);
      lerpPose(track, look[0], look[1], j / 4, _sb);
      for (let k = 1; k <= 8; k++) {
        const f = k / 8;
        const pr = Tracks.project(track, _sa[0] + (_sb[0] - _sa[0]) * f, _sa[2] + (_sb[2] - _sa[2]) * f);
        if (!pr) continue;
        Tracks.sample(track, pr.s, _sm);
        const off = Math.abs(pr.lat) - (_sm.hw || 10);
        if (off > worst) worst = off;
      }
    }
    return worst;
  }
  function planLook(track, eye, look) {
    if (!(onRoadPose(eye[0]) && onRoadPose(eye[1]) && trackAnchored(look[0]) && trackAnchored(look[1]) &&
          look[0].at !== "corner" && look[1].at !== "corner")) return look;
    if (sightOff(track, eye, look) <= SIGHT_EDGE) return look;
    const lead = [arcDelta(track, eye[0], look[0]), arcDelta(track, eye[1], look[1])];
    let best = look;
    for (let f = 0.9; f >= SIGHT_MIN - 1e-9; f -= 0.1) {
      const cand = [0, 1].map((i) => Object.assign({}, look[i], { off: (look[i].off || 0) - (1 - f) * lead[i] }));
      best = cand;
      if (sightOff(track, eye, cand) <= SIGHT_EDGE) break;
    }
    return best;
  }

  /* PANS HAVE A SPEED LIMIT. Eye and look are interpolated separately, so a
     corner shot whose eye sweeps round the outside of a hairpin while its look
     slides through it turned the view 150-200 degrees a second at the ease's
     peak (Bahrain's turn-late 206, Monaco's turn-mid 152) — a whip pan, read
     as a glitch. The plan measures the peak rate over REF_S (the loading
     screen's FLY_MS; the unit test pins the two together) and, while it is
     over PAN_MAX, squeezes the shot's travel about its middle (both pairs, the
     same factor), down to PAN_MIN_K of it. */
  const REF_S = 24, PAN_MAX = 40 * Math.PI / 180, PAN_K = 0.85, PAN_MIN_K = 0.1, PAN_N = 48;
  const _pe = [0, 0, 0], _pt = [0, 0, 0];
  function panRate(track, shot, frac, eye, look, prof) {
    const ease = EASE[shot.ease] || EASE.inOut;
    let peak = 0, px = 0, py = 0, pz = 0;
    for (let j = 0; j <= PAN_N; j++) {
      const e = ease(j / PAN_N);
      lerpPose(track, eye[0], eye[1], e, _pe);
      if (prof) _pe[1] += liftAt(prof, e);
      lerpPose(track, look[0], look[1], e, _pt);
      let dx = _pt[0] - _pe[0], dy = _pt[1] - _pe[1], dz = _pt[2] - _pe[2];
      const l = Math.hypot(dx, dy, dz) || 1;
      dx /= l; dy /= l; dz /= l;
      if (j) {
        const a = Math.acos(Math.max(-1, Math.min(1, dx * px + dy * py + dz * pz)));
        if (a > peak) peak = a;
      }
      px = dx; py = dy; pz = dz;
    }
    return peak * PAN_N / (Math.max(1e-6, frac) * REF_S);
  }
  function squeeze(track, pair, k) {
    const a = pair[0], b = pair[1];
    if (trackAnchored(a) && trackAnchored(b)) {
      const d = arcDelta(track, a, b) * (1 - k) / 2;
      if (!d) return pair;
      return [Object.assign({}, a, { off: (a.off || 0) + d }), Object.assign({}, b, { off: (b.off || 0) - d })];
    }
    if (a.at === b.at && (a.at === "centre" || a.at === "landmark") && (a.bear || 0) !== (b.bear || 0)) {
      const d = ((b.bear || 0) - (a.bear || 0)) * (1 - k) / 2;
      return [Object.assign({}, a, { bear: (a.bear || 0) + d }), Object.assign({}, b, { bear: (b.bear || 0) - d })];
    }
    return pair;
  }

  /** Eye poses with the least lift: authored, else stepped in (corners towards
   *  the road, landmarks towards the landmark), the least-lifted winning. */
  function planEye(track, eye) {
    const e0 = eye[0], e1 = eye[1];
    let best = profileOf(track, e0, e1), out = eye;
    if (best.max > LIFT_OK && (e0.at === "corner" || e1.at === "corner" || e0.at === "landmark" || e1.at === "landmark")) {
      for (let k = 1; k <= 8; k++) {
        const a = inset(e0, k), b = inset(e1, k);
        if (a === e0 && b === e1) break;
        const p = profileOf(track, a, b);
        if (p.max < best.max) { best = p; out = [a, b]; }
        if (p.max <= LIFT_OK) break;
      }
      // STEPPING IN CAN RUN OUT OF ROOM: a thin structure or a treeline standing
      // AT the fence (Sochi's turn-mid, 16 m of sparse hull at 9 m out) is in
      // the way at every inset. Stepping OUT past it, OUT_STEP at a time to
      // OUT_MAX, is the other side of the same obstacle; still the least lift wins.
      for (let k = 1; best.max > LIFT_OK && k <= OUT_N; k++) {
        const a = outset(e0, k), b = outset(e1, k);
        if (a === e0 && b === e1) break;
        const p = profileOf(track, a, b);
        if (p.max < best.max - 0.5) { best = p; out = [a, b]; }
      }
      // Last, SLIDE the move: a corner eye along the arc, a landmark eye round
      // its landmark. An obstruction at one END of a move (Istanbul's turn-mid
      // began inside a 24 m hull and craned down out of it) is often a few
      // metres from a clean start.
      const base = out;
      for (let i = 0; best.max > LIFT_OK && i < NUDGE.length; i++) {
        const a = nudge(base[0], NUDGE[i]), b = nudge(base[1], NUDGE[i]);
        if (a === base[0] && b === base[1]) continue;
        const p = profileOf(track, a, b);
        if (p.max < best.max - 0.5) { best = p; out = [a, b]; }
      }
      // A CORNER WALLED IN BY TREES has no clear eye at the fence at any
      // inset, outset or slide (Mont-Tremblant's turn-late craned 17-21 m up a
      // pine wood and still looked through canopy). Last resort: drop to the
      // road's OUTER EDGE, low — nothing grows on the tarmac, and a road-level
      // camera looks down the tree tunnel at the corner instead of over it.
      if (best.max > TREE_ROAD && e0.at === "corner" && e1.at === "corner") {
        const a = roadEdge(e0), b = roadEdge(e1);
        const p = profileOf(track, a, b);
        if (p.max < best.max) { best = p; out = [a, b]; }
      }
    }
    return { eye: out, prof: best.prof };
  }
  const TREE_ROAD = 8, EDGE_X = 5.5, EDGE_Y = 3.2;
  function roadEdge(pose) {
    const o = Object.assign({}, pose);
    o.x = (pose.x >= 0 ? 1 : -1) * EDGE_X;
    o.y = Math.min(pose.y || EDGE_Y, EDGE_Y);
    return o;
  }
  const NUDGE = [1, -1, 2, -2];
  function nudge(pose, k) {
    if (pose.at === "corner") return Object.assign({}, pose, { off: (pose.off || 0) + k * 8 });
    if (pose.at === "landmark" && (pose.distK || 0) > 0) return Object.assign({}, pose, { bear: (pose.bear || 0) + k * 0.2 });
    return pose;
  }
  const OUT_STEP = 2, OUT_N = 6, OUT_MAX = 30;
  function outset(pose, k) {
    const x = pose.x || 0, ax = Math.abs(x);
    if (pose.at !== "corner" || !x) return pose;
    const o = Object.assign({}, pose);
    o.x = (x > 0 ? 1 : -1) * Math.min(OUT_MAX, ax + k * OUT_STEP);
    return o;
  }

  function planShot(track, shot, frac) {
    const cache = track._fbPlan || (track._fbPlan = new WeakMap());
    let plan = cache.get(shot);
    if (plan && plan.frac === frac) return plan;
    const onRoad = onRoadPose(shot.eye[0]) && onRoadPose(shot.eye[1]);
    const noLift = new Float32Array(LIFT_N + 1);
    const baseLook = planLook(track, shot.eye, shot.look);
    let eye = shot.eye, look = baseLook;
    let pe = onRoad ? { eye: eye, prof: noLift } : planEye(track, eye);
    let k = 1;
    while (panRate(track, shot, frac, pe.eye, look, pe.prof) > PAN_MAX && k * PAN_K >= PAN_MIN_K) {
      k *= PAN_K;
      const ey = squeeze(track, shot.eye, k), lk = squeeze(track, baseLook, k);
      if (ey === shot.eye && lk === baseLook) break;
      eye = ey;
      pe = onRoad ? { eye: ey, prof: noLift } : planEye(track, ey);
      look = lk;
    }
    // The squeezed look keeps the sightline rule: re-plan it against the eye.
    if (look !== shot.look) look = planLook(track, pe.eye, look);
    plan = { eye: pe.eye, look: look, prof: pe.prof, onRoad: onRoad, frac: frac, squeeze: k };
    cache.set(shot, plan);
    return plan;
  }
  function liftAt(prof, e) {
    let best = 0;
    for (let j = 0; j <= LIFT_N; j++) {
      if (!(prof[j] > 0)) continue;
      const f = 1 - Math.abs(e - j / LIFT_N) / LIFT_W;
      if (f > 0 && prof[j] * f > best) best = prof[j] * f;
    }
    return best;
  }

  /* A DIFFERENT FLYBY EACH LOAD. The same nine shots on the fifth load of a
     circuit is a loading screen; the same LANGUAGE redrawn is a broadcast.
     vary() jitters the establishing bearings, sometimes films the second
     landmark first, sometimes runs a pan the other way, and draws the three
     corner shots from roles without repeats. The grid finale is fixed — it is
     the handoff to the race. Pure and seeded (never the sim RNG): the same
     seed is the same flyby, which is what the test holds it to. */
  const VARY_ROLES = ["first", "lore", "slowest", "fastest", "mid", "late"];
  function vary(list, seed) {
    let h = (seed >>> 0) || 1;
    const rnd = () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
    const used = {}, swapLm = rnd() < 0.35;   // decided ONCE: swapping one landmark shot alone films the same landmark twice
    return list.map((shot) => {
      if (/^grid/.test(shot.id || "")) return shot;
      const o = JSON.parse(JSON.stringify(shot));
      const at = o.eye[0] && o.eye[0].at;
      if (at === "centre") { const j = (rnd() - 0.5) * 0.5; o.eye.forEach((p) => { p.bear = (p.bear || 0) + j; }); }
      if (at === "landmark" && swapLm) [o.eye, o.look].forEach((a) => a.forEach((p) => { p.rank = (p.rank | 0) === 0 ? 1 : 0; }));
      if (at === "corner") {
        const free = VARY_ROLES.filter((r) => !used[r]);
        const n = free.length ? free[Math.floor(rnd() * free.length)] : o.eye[0].n;
        used[n] = true;
        [o.eye, o.look].forEach((a) => a.forEach((p) => { p.n = n; }));
      } else if (rnd() < 0.4) { o.eye.reverse(); o.look.reverse(); o.fov.reverse(); }
      return o;
    });
  }

  /** Called when a run begins, so the first frame of the first shot reads as a
   *  cut and the camera does not glide in from wherever it last was. */
  function reset() { _lastIdx = -1; }

  return {
    solve, reset, clearEye, floorEye, groundAt, insideProp, blockers, isSolid, onRoadPose,
    landmarks, bounds, landmarkScore, lmBase, landmarkFallback, planShot, treeBlockers,
    anchorS, posePoint, cornerS, cornerSide, cornerTurn, lmFace,
    poseFromWorld, shotFromView, nearestCorner, vary, setPlayerSlot, slotIndex, bindCorners, warm,
    DEFAULT, EASE,
    POLE_BACK, GRID_SPACING, GRID_ROWS, MIN_FILL, MIN_H, FAR, FOG, NEAR, FENCE, REF_S, PAN_MAX,
  };
})();
Object.freeze(FlybySeq);
