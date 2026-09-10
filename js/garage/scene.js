/* Apex 26 — GarageScene: the room the setup preview happens in. Bay shell, roof truss, LED fixtures, pit equipment, the floor and the light rig — everything in the garage that is not the car. */
const GarageScene = (function () {
  "use strict";

let _gfx = null;            // renderer handle, set once by init()
function init(gfx) { Log.info("game", "GarageScene.init"); _gfx = gfx; }

// The frame clear colour (gfx reads fogColor as the clear) — the "outside" the
// bay is silhouetted against, and what the apron disc's rim fades into.
const BACKDROP = [0.035, 0.038, 0.046];   // MUTATED per ctx.night in rebuild() — game.js reads this array each frame

// SKYLIGHT replaces the preview's old sunColor:[1,1,1]. It has to come down for
// this room to work at all: a lamp's shading is att = win^2/(distC^2+1) with
// distC = max(dist, uLampNearClamp) and the clamp defaulting to 4, so NO lamp
// can ever contribute more than 1/17 = 0.059 of albedo. The preview's old rig
// (energy 0.88) was therefore delivering ~5% of the picture and the sun was
// delivering the rest — which is exactly why it read as a product shot on a
// seamless rather than a room. Ten fixtures at ~10x that energy, against a sun
// dimmed to a roof-light fill, is what puts the lighting back in the lamps.
const SKYLIGHT = [0.55, 0.55, 0.58];
const AMB_SKY = [0.200, 0.215, 0.250], AMB_GROUND = [0.130, 0.125, 0.118];

// Mesh primitives, room dimensions and the shared colours live in
// js/garage/scene-prims.js (GaragePrims); the pit equipment in scene-equipment.js
// (GarageEquipment); the live atlas in scene-live.js (GarageLive).
const { HALF_W, Z_BACK, Z_DOOR, CEIL_Y, PANEL, STEEL, DARK, panelGrid, block, cyl, tube, MAT, smooth, scale, rgb, css, pushMat, tile } = GaragePrims;

// ── the bay shell ──────────────────────────────────────────────────────────
// A CLOSED six-sided room whose every face is wound to be seen from INSIDE.
// That one decision is what lets the preview camera keep its full range: it
// orbits to SP_DIST_MAX (15 m) and to SP_EL_MAX (1.30 rad, eye y ~ 14.9 m), so
// it spends real time outside any room small enough to read as a pit bay. With
// inward faces, a wall the eye has passed is simply back-facing and culls, and
// what you get is a doll's-house cutaway rather than a black screen. The
// transition costs nothing and cannot pop, because the eye crosses a face's
// plane exactly when that face is edge-on and covers zero pixels.
let shellMesh = null;
function buildShell(out, liv) {
  const c1 = rgb(liv && liv.c1, [0.30, 0.32, 0.36]);
  const c2 = rgb(liv && (liv.accent || liv.stripe || liv.c2), [0.55, 0.57, 0.62]);
  const dado = scale(c1, 0.45), stripe = scale(c2, 0.8);
  // Wall colour by ABSOLUTE height. This used to take a 0..1 v and multiply by
  // the wall height, which was fine — the bug was that no vertex row ever
  // landed in the accent band: nv was 6 over a 5 m wall, so the rows sat at
  // 0, 0.833, 1.667, 2.5, 3.333, 4.167, 5.0 and the 1.50-1.62 band fell
  // between two of them. `stripe` was computed on every rebuild and thrown
  // away, which is why the team dado read as an 83 cm wash instead of a line.
  // The walls are now built as three stacked grids whose seams ARE the band
  // edges, so the row exists by construction.
  // The upper band is the LARGEST surface in the room — 3.38 m of every wall,
  // ~143 m2 across four — and it was one frozen grey for all eleven teams while
  // the 1.5 m of dado below it carried the livery. A bay should read as the
  // team's from any camera, not only below waist height. Held to 12% of c1 over
  // the grey: it has to stay a BACKDROP for a car that is itself team-coloured,
  // and a saturated wall would fight the thing it is behind.
  const panelC = [PANEL[0] + (c1[0] - PANEL[0]) * 0.12,
                  PANEL[1] + (c1[1] - PANEL[1]) * 0.12,
                  PANEL[2] + (c1[2] - PANEL[2]) * 0.12];
  const wallAt = (y) => (y < 1.4995 ? dado : y < 1.6205 ? stripe : panelC);
  // Battens are BAKED INTO THE WALL's vertex colour rather than modelled as
  // solid posts. A solid post is a prop, and props do not cull with the shell:
  // stood outside the bay you would see a row of dark bars hanging in front of
  // the room whose wall had already culled away. Shading them into the wall
  // means they are the wall, and they come and go exactly when it does.
  //
  // This never worked. It was keyed on `u * n` where n was the grid's OWN
  // column count, and panelGrid samples u at i/nu — so `u * n` was always an
  // integer, `(u*n)%1` always 0, and `|0 - 0.5| > 0.42` TRUE at every vertex of
  // every wall. The bright branch was unreachable: all four walls rendered as
  // one flat 62%-scaled tint with no battens at all. Key it off the column
  // INDEX instead, which is what it meant to say.
  const seamed = (col, u, n) => (Math.round(u * n) % 2 ? scale(col, 0.62) : col);
  // walls: [origin, uVec, vVec, inward normal, u-divisions]
  const W = HALF_W;
  const walls = [
    [[-W, 0, Z_BACK], [W * 2, 0, 0], [0, CEIL_Y, 0], [0, 0, 1], 8],
    [[-W, 0, Z_DOOR], [W * 2, 0, 0], [0, CEIL_Y, 0], [0, 0, -1], 8],
    [[-W, 0, Z_BACK], [0, 0, Z_DOOR - Z_BACK], [0, CEIL_Y, 0], [1, 0, 0], 9],
    [[W, 0, Z_BACK], [0, 0, Z_DOOR - Z_BACK], [0, CEIL_Y, 0], [-1, 0, 0], 9],
  ];
  // Three stacked bands per wall — dado / accent / panel — instead of one grid
  // with a colour ramp. The seams ARE the band edges, so the accent line is a
  // line rather than an 83 cm gradient between whichever rows happened to fall
  // either side of it. Column count doubled so a batten is a batten and not a
  // half-wall-wide stripe: with 8 columns the alternation reads as panelling.
  const BANDS = [[0, 1.50, 2], [1.50, 1.62, 1], [1.62, CEIL_Y, 4]];
  const wallBands = (o0, uVec, nu, nrm, y0Lo, y1Hi) => {
    for (const [y0, y1, nv] of BANDS) {
      if (y1 <= y0Lo || y0 >= y1Hi) continue;
      const a = Math.max(y0, y0Lo), b = Math.min(y1, y1Hi);
      panelGrid(out, [o0[0], o0[1] + a, o0[2]], uVec, [0, b - a, 0], nu, nv, nrm,
        (u, v) => seamed(wallAt(a + (b - a) * v), u, nu), MAT.CONCRETE);
    }
  };
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    if (i === 1) continue;                       // the door wall, below
    wallBands(w[0], w[1], w[4] * 2, w[3], 0, CEIL_Y);
  }
  // THE DOOR IS A HOLE. The roller shutter is modelled parked half open, but
  // this wall used to be a full-height opaque grid, so the "opening" under the
  // slats was interior wall paint — on the REAR preset, whose entire backdrop
  // is this wall, that painted band is 23% of the frame.
  //
  // The aperture edges sit on COLUMN BOUNDARIES (pitch 10.8/16 = 0.675 m) and
  // each jamb is an EVEN number of columns, so the batten alternation keeps its
  // phase across the split instead of stepping at the seam. y stops at 4.80,
  // just under the parked slats' 4.77, so the shutter reads as filling the top
  // of its own opening.
  const APX = 2.70, APY = 4.80;                  // k=4 and k=12 of 16
  for (const sx of [-1, 1])
    wallBands([sx > 0 ? APX : -W, 0, Z_DOOR], [W - APX, 0, 0], 4, walls[1][3], 0, CEIL_Y);
  wallBands([-APX, 0, Z_DOOR], [APX * 2, 0, 0], 8, walls[1][3], APY, CEIL_Y);
  // THE OPENING HAD NO THICKNESS. The wall is a zero-thickness grid, so the
  // aperture edge was a bare polygon boundary — no reveal, no lintel, no jamb
  // return, no threshold — and it is the backdrop of the REAR preset, seen
  // through 5.4 x 4.8 m of clear air. A door in a real building is a hole in
  // something 30 cm thick, and that returned edge is the single strongest "this
  // is a building" cue in the room. 0.30 m of reveal, in the shell so it culls
  // with its own wall.
  const RV = 0.30, revC = scale(PANEL, 0.72);
  for (const sx of [-1, 1])                                  // jamb returns
    block(out, sx * APX, APY / 2, Z_DOOR - RV / 2, 0.02, APY / 2, RV / 2, revC);
  block(out, 0, APY, Z_DOOR - RV / 2, APX, 0.02, RV / 2, revC);   // lintel soffit
  // Threshold: a raised sill across the opening, the join between the resin bay
  // floor and the pit apron 4 cm below it.
  block(out, 0, 0.022, Z_DOOR - 0.10, APX, 0.022, 0.10, scale(STEEL, 0.62), MAT.METAL);
  // No material id: the ceiling is HORIZONTAL, and every wall-like id (CONCRETE
  // included) keys its UV off world Y, which is constant here — see the note in
  // buildBayFloor. It is also dark, culled from `top` and above the frame in
  // `front`/`rear`, so there is nothing to gain by finding it a flat-keyed one.
  panelGrid(out, [-W, CEIL_Y, Z_BACK], [W * 2, 0, 0], [0, 0, Z_DOOR - Z_BACK], 4, 4,
    [0, -1, 0], () => DARK);
  // Roof truss. It lives in the shell because the ceiling culls from above and
  // looking down THROUGH the truss into the bay is the view we want up there.
  for (let s = -1; s <= 1; s += 2)
    block(out, s * 2.6, CEIL_Y - 0.42, 0, 0.06, 0.06, (Z_DOOR - Z_BACK) / 2, STEEL, MAT.METAL);
  for (let i = 0; i <= 4; i++)
    block(out, 0, CEIL_Y - 0.42, Z_BACK + (Z_DOOR - Z_BACK) * (i / 4), 2.7, 0.05, 0.06, STEEL, MAT.METAL);
}

// ── props ──────────────────────────────────────────────────────────────────
// Grouped BY WALL, and each group is drawn only while the eye is on the inside
// of its wall. The shell gets this for free from back-face culling; a solid
// prop does not, so without the grouping a tyre stack would hang in mid-air in
// front of a wall that had already culled away. The test is one sign compare.
//
// Everything at FLOOR level sits outboard of x +/-3.6: SP_FIT_HALF_W (3.10) is
// the framing radius the auto-turntable holds, so anything inside that band
// crops into the car's frame at the default distance. It is a floor rule, not
// an absolute one — the ceiling LED housings reach x 2.70 and are fine, because
// they sit at y 4.3, above the top of the frame.
const SIDES = ["nx", "px", "back", "door", "mid"];
function buildProps(g, liv) {
  const c1 = rgb(liv && liv.c1, [0.30, 0.32, 0.36]);
  const COMPOUND = [[0.85, 0.12, 0.12], [0.92, 0.80, 0.10], [0.88, 0.88, 0.90]];
  const stack = (out, x, z, seed) => {
    for (let t = 0; t < 4; t++) {
      const y = t * 0.345;
      cyl(out, x, y, z, 0.36, 0.33, [0.045, 0.045, 0.050], 14);
      cyl(out, x, y + 0.30, z, 0.305, 0.025, COMPOUND[(seed + t) % 3], 14);
    }
  };
  const toolbox = (out, x, z) => {
    const sgn = x > 0 ? -1 : 1;
    block(out, x, 0.62, z, 0.36, 0.52, 0.80, scale(c1, 0.55));
    block(out, x, 1.16, z, 0.38, 0.03, 0.82, STEEL);
    for (let d = 0; d < 4; d++) {
      block(out, x + sgn * 0.37, 0.26 + d * 0.24, z, 0.012, 0.09, 0.72, scale(STEEL, 0.8));
      block(out, x + sgn * 0.39, 0.26 + d * 0.24, z, 0.010, 0.02, 0.20, scale(STEEL, 1.15));   // drawer pull
    }
    for (let w = 0; w < 4; w++)
      cyl(out, x + (w % 2 ? 0.26 : -0.26), 0, z + (w < 2 ? 0.6 : -0.6), 0.05, 0.10, DARK, 6);
  };
  // -X wall: the engineers' monitor bank and desk, plus a tyre stack.
  toolbox(g.nx, -4.92, 3.6);
  // The -X stacks stand in the DOOR corner, not the deep bay: at z -5.4 and
  // -3.1 they were 0.46 m in front of the BUDGET board (y 0.69-1.44, z
  // -5.4..-2.4) at exactly its height, and the SIDE preset read the board
  // with a tyre stack over each end. tests/unit/garage-sign-occlusion holds it.
  stack(g.nx, -4.55, 5.30, 0); stack(g.nx, -4.55, 6.02, 2);
  block(g.nx, -5.30, 1.90, 0.6, 0.05, 0.80, 1.60, DARK);
  for (let m = 0; m < 6; m++)
    block(g.nx, -5.22, 1.45 + (m < 3 ? 0 : 0.90), 0.6 + ((m % 3) - 1) * 0.98, 0.03, 0.36, 0.46, scale(STEEL, 0.55));
  block(g.nx, -5.02, 0.86, 0.6, 0.30, 0.03, 1.30, scale(STEEL, 0.9));
  for (let s = -1; s <= 1; s += 2) cyl(g.nx, -5.02, 0, 0.6 + s * 1.15, 0.04, 0.86, STEEL, 6);
  // +X wall: the tool trolleys.
  toolbox(g.px, 4.92, -3.4); toolbox(g.px, 4.92, -1.5); toolbox(g.px, 4.92, 0.4);
  stack(g.px, 4.55, -5.4, 1); stack(g.px, 4.55, 4.6, 2);
  // Back wall: the pit board.
  cyl(g.back, 4.70, 0, -6.15, 0.03, 1.80, STEEL, 6);
  block(g.back, 4.70, 2.30, -6.12, 0.45, 0.62, 0.03, DARK);
  // The back wall is 41% of the FRONT preset's frame and carried 56 triangles:
  // one pit board and a radio post, both on +X, with the whole -X half bare.
  // Mirror the board, then run a cable ladder across at truss height with a
  // junction box under each hanger — the two things every real garage wall has
  // and the cheapest way to give 41% of a frame something to look at.
  cyl(g.back, -4.70, 0, -6.15, 0.03, 1.80, STEEL, 6);
  // Landscape, not a mirror of the +X board: this one carries the strategy
  // strip (D_STRAT), which is 4:1, and a portrait panel would letterbox it.
  block(g.back, -4.70, 2.42, -6.12, 0.52, 0.20, 0.03, DARK);
  block(g.back, -4.70, 1.92, -6.12, 0.44, 0.16, 0.025, scale(STEEL, 0.45));
  block(g.back, 0, 4.22, -6.20, 5.10, 0.035, 0.10, scale(STEEL, 0.8));
  block(g.back, 0, 4.34, -6.20, 5.10, 0.030, 0.08, scale(STEEL, 0.65));
  for (let i = -4; i <= 4; i++) {
    block(g.back, i * 1.15, 4.28, -6.20, 0.025, 0.10, 0.085, scale(STEEL, 0.55));
    if (i % 2) block(g.back, i * 1.15, 3.92, -6.17, 0.16, 0.20, 0.09, scale(STEEL, 0.45));
  }
  // Door wall: the roller shutter, parked half open. 22 m2, and the entire
  // backdrop of the REAR preset — it was grey steel for every team with one
  // wordmark decal floating on it. The slats now alternate steel and a dark
  // team tint, which is what a sponsored roller door actually looks like and
  // costs nothing but a colour.
  const shutA = scale(STEEL, 0.75), shutB = [
    STEEL[0] * 0.42 + c1[0] * 0.34, STEEL[1] * 0.42 + c1[1] * 0.34, STEEL[2] * 0.42 + c1[2] * 0.34];
  for (let i = 0; i < 11; i++)
    block(g.door, 0, 2.05 + i * 0.26, Z_DOOR - 0.10, HALF_W * 0.72, 0.12,
          (i % 2) ? 0.035 : 0.05, (i % 3) ? shutA : shutB, MAT.METAL);
  block(g.door, 0, 1.98, Z_DOOR - 0.10, HALF_W * 0.74, 0.07, 0.07, scale(STEEL, 1.1));
  // Guide rails up both jambs, so the shutter runs in something. In g.door with
  // the wall, not in g.mid: a rail left standing after its wall culled is the
  // floating-strip defect this file already fixed once for the dado lights.
  for (const sx of [-1, 1]) {
    block(g.door, sx * 2.79, 2.50, Z_DOOR - 0.10, 0.09, 5.00, 0.13, scale(STEEL, 0.9));
    block(g.door, sx * 2.79, 0.10, Z_DOOR - 0.16, 0.13, 0.20, 0.26, scale(STEEL, 0.6));
  }
  // The upper side walls carry 2.2 m2 of wordmark over 29 m2 of wall, and that
  // band is 22% of the SIDE preset — the one view that looks straight at them.
  // A service gantry per side: a shelf, its brackets, and a rail. ABOVE the
  // wordmark band (y 3.10-3.60): the shelf used to run at 3.42 with its clips
  // at z 0, so the SIDE preset saw every wordmark with its top third behind
  // the shelf and the middle one notched by a clip. Brackets from 3.62, shelf
  // at 3.84, rail and clips to 4.24 — under the fill fixtures' 4.32 housings.
  for (const sd of [-1, 1]) {
    const w = sd < 0 ? g.nx : g.px, x = sd * 5.20;
    block(w, x, 3.84, 0, 0.20, 0.04, 5.00, scale(STEEL, 0.7));
    block(w, x - sd * 0.20, 4.02, 0, 0.03, 0.16, 5.00, scale(STEEL, 0.5));
    for (let i = -2; i <= 2; i++) {
      block(w, x - sd * 0.09, 3.71, i * 2.30, 0.11, 0.09, 0.05, scale(STEEL, 0.45));
      if (i % 2 === 0)
        block(w, x - sd * 0.06, 4.06, i * 2.30, 0.14, 0.18, 0.34, scale(STEEL, 0.55));
    }
  }

  // Spare front wings on a rack — the most recognisable thing in a real bay
  // after the tyres, and the reason a garage reads as a WORKSHOP.
  const wingRack = (out, x, z, sgn) => {
    for (let r = 0; r < 2; r++) cyl(out, x, 0, z + (r ? 0.85 : -0.85), 0.035, 1.15, STEEL, 6);
    block(out, x, 1.16, z, 0.05, 0.03, 0.95, STEEL);
    for (let w = 0; w < 2; w++) {                      // two wings leaning on it
      const y = 0.52 + w * 0.46;
      block(out, x + sgn * 0.16, y, z, 0.30, 0.02, 0.86, scale(c1, 0.62));
      block(out, x + sgn * 0.34, y + 0.10, z, 0.06, 0.09, 0.84, scale(c1, 0.45));
      for (let e = -1; e <= 1; e += 2)                 // endplates
        block(out, x + sgn * 0.16, y + 0.07, z + e * 0.84, 0.26, 0.13, 0.02, DARK);
    }
  };
  wingRack(g.nx, -4.30, 1.2, 1);
  wingRack(g.px, 4.30, 2.6, -1);
  // Wheel guns on a wall rack, hoses coiled on a reel above them.
  for (let i = 0; i < 3; i++) {
    const z = -1.9 + i * 0.55;
    // The gun bodies were a hard yellow on all eleven grids. Real crews run
    // them in team colours, and they sit 1.3 m up on the wall the SIDE preset
    // looks straight at.
    block(g.px, 5.16, 1.34, z, 0.07, 0.07, 0.10, scale(c1, 0.92));
    cyl(g.px, 5.16, 0.98, z, 0.045, 0.34, scale(STEEL, 0.7), 6, MAT.METAL);
  }
  block(g.px, 5.20, 1.62, -1.35, 0.06, 0.03, 1.15, STEEL);
  for (let i = 0; i < 2; i++) {
    cyl(g.px, 5.14, 2.30 + i * 0.02, 0.9 + i * 0.8, 0.22, 0.10, scale(DARK, 1.5), 10);
    cyl(g.px, 5.14, 2.28 + i * 0.02, 0.9 + i * 0.8, 0.07, 0.14, STEEL, 6);
  }
  // Shelving of parts crates and a workbench. These live on the DOOR wall, not
  // the back wall: the back wall is where the information boards go, and a
  // prop stood 0.3 m proud of a board is a prop that hides it.
  for (let sh = 0; sh < 3; sh++) {
    const y = 0.95 + sh * 0.62;
    block(g.door, -4.02, y, 6.15, 1.25, 0.025, 0.22, STEEL);
    for (let bx = 0; bx < 3; bx++)
      block(g.door, -5.07 + bx * 0.86, y + 0.17, 6.15, 0.32, 0.15, 0.17,
        scale(bx % 2 ? c1 : STEEL, bx % 2 ? 0.5 : 0.75));
  }
  block(g.door, -4.02, 0.42, 6.05, 1.30, 0.04, 0.32, scale(STEEL, 0.85));
  for (let lg = -1; lg <= 1; lg += 2) cyl(g.door, -4.02 + lg * 1.15, 0, 6.05, 0.035, 0.42, DARK, 6);
  // Fire extinguishers — every real garage wall has a pair.
  for (let f = 0; f < 2; f++) {
    cyl(g.nx, -5.22, 0.32, -4.4 + f * 0.42, 0.075, 0.44, [0.72, 0.09, 0.07], 8);
    cyl(g.nx, -5.22, 0.76, -4.4 + f * 0.42, 0.028, 0.09, scale(STEEL, 0.6), 6);
  }
  // A bin and a wheeled stool by the desk.
  cyl(g.nx, -4.75, 0, 4.7, 0.20, 0.52, scale(STEEL, 0.5), 8);
  cyl(g.nx, -4.10, 0.52, 3.0, 0.20, 0.06, scale(c1, 0.5), 8);
  cyl(g.nx, -4.10, 0, 3.0, 0.045, 0.52, STEEL, 6);
  // Barrier stanchions across the pit-lane opening, chain height only.
  for (let i = -1; i <= 1; i += 2) {
    cyl(g.door, i * 2.2, 0, Z_DOOR - 0.55, 0.05, 0.95, scale(STEEL, 0.8), 8);
    cyl(g.door, i * 2.2, 0.95, Z_DOOR - 0.55, 0.075, 0.05, [0.80, 0.70, 0.12], 8);
  }
  block(g.door, 0, 0.92, Z_DOOR - 0.55, 2.2, 0.02, 0.02, [0.80, 0.70, 0.12]);
  // Overhead cable tray running the length of the bay, under the truss.
  for (let sd = -1; sd <= 1; sd += 2)
    block(g.mid, sd * 4.6, 3.62, 0, 0.16, 0.05, 6.2, scale(STEEL, 0.6));
  // Fuel rig and a wheel trolley in the +X/door corner (x 3.6..5.4, z 5.0..6.4),
  // the emptiest floor in the bay.
  block(g.px, 4.55, 0.62, 5.55, 0.42, 0.62, 0.36, scale(c1, 0.5));
  block(g.px, 4.55, 1.28, 5.55, 0.44, 0.05, 0.38, STEEL);
  cyl(g.px, 4.55, 1.30, 5.55, 0.14, 0.46, scale(STEEL, 0.75), 8);
  for (let w = 0; w < 4; w++)
    cyl(g.px, 4.55 + (w % 2 ? 0.3 : -0.3), 0, 5.55 + (w < 2 ? 0.26 : -0.26), 0.05, 0.10, DARK, 6);
  block(g.px, 4.30, 0.30, 4.35, 0.55, 0.03, 0.34, STEEL);          // wheel trolley
  for (let w = 0; w < 4; w++)
    cyl(g.px, 4.30 + (w % 2 ? 0.42 : -0.42), 0, 4.35 + (w < 2 ? 0.24 : -0.24), 0.05, 0.27, scale(STEEL, 0.7), 6);
  // Laptop bench beside the engineers' desk, in the -X mid-wall gap.
  block(g.nx, -5.00, 0.74, -1.85, 0.32, 0.04, 0.62, scale(STEEL, 0.9));
  for (let l = -1; l <= 1; l += 2) cyl(g.nx, -5.00, 0, -1.85 + l * 0.5, 0.035, 0.74, DARK, 6);
  for (let l = 0; l < 2; l++) {
    block(g.nx, -4.94, 0.78, -2.10 + l * 0.5, 0.16, 0.012, 0.14, scale(STEEL, 1.05));
    block(g.nx, -4.80, 0.90, -2.10 + l * 0.5, 0.015, 0.11, 0.14, DARK);
  }
  // Jack stands and a floor fan in the extinguisher run.
  for (let j = 0; j < 2; j++) {
    cyl(g.nx, -4.60, 0, -4.6 + j * 0.7, 0.16, 0.09, scale(STEEL, 0.65), 6);
    cyl(g.nx, -4.60, 0.09, -4.6 + j * 0.7, 0.05, 0.40, STEEL, 6);
  }
  cyl(g.nx, -4.35, 0, -3.05, 0.26, 0.06, DARK, 10);                 // fan base
  cyl(g.nx, -4.35, 0.06, -3.05, 0.05, 0.46, scale(STEEL, 0.7), 6);
  cyl(g.nx, -4.35, 0.52, -3.05, 0.30, 0.12, scale(STEEL, 0.55), 10);
  // Radio post at the deep end, and ceiling ducting above the truss.
  cyl(g.back, -4.60, 0, -5.95, 0.04, 1.45, STEEL, 6);
  block(g.back, -4.60, 1.45, -5.95, 0.18, 0.12, 0.10, DARK);
  // OUTBOARD, at x +/-4.4 beside the cable trays. At x +/-1.55 these ran
  // straight between an overhead camera and the car, and g.mid is drawn
  // unconditionally (unlike the per-wall groups), so the TOP preset had two
  // grey bars laid across the bay. Ceiling clutter has to live outside the
  // framing radius for the same reason floor clutter does.
  for (let d = -1; d <= 1; d += 2)
    block(g.mid, d * 4.40, 4.80, 0, 0.26, 0.18, 6.10, scale(STEEL, 0.5));
  // Floor level, inboard of every wall, so it is never on the wrong side of one.
  for (let s = -1; s <= 1; s += 2) {
    block(g.mid, s * 3.9, 0.035, 0.5, 0.09, 0.035, 5.4, DARK);
    block(g.mid, s * 4.6, 0.035, -5.9, 0.75, 0.035, 0.09, DARK);
  }
  // Front jack, parked BESIDE the nose rather than on the centreline: dead
  // ahead it draws a post straight up the middle of the FRONT camera preset,
  // which is the one view whose whole job is an unobstructed head-on car.
  block(g.mid, 1.55, 0.12, 4.35, 0.55, 0.05, 0.12, scale(STEEL, 0.8));
  cyl(g.mid, 1.55, 0.12, 4.55, 0.03, 0.85, STEEL, 6);
}

// ── pit equipment around the car ───────────────────────────────────────────
// Everything in buildProps lives against a wall; the car's own footprint was
// bare resin. A working bay has its kit AROUND the car — jacks, guns on their
// hoses, the starter, the tyres it will go out on — and that is what reads in
// every preset, because the camera always looks at the car. Kept OUTSIDE the
// car's x +/-0.95 and off the FRONT / REAR sight lines (the front jack rule).
// The car's wheels: x +/-0.79 front at z 1.7, x +/-0.76 rear at z -1.6, r 0.34
// (js/car/car3d.js AXLES) — the floor boxes and the guns are placed off those.
const { RUBBER, FAN, SCREEN } = GarageEquipment;   // the fan and screen anchors (the blades, the timing face) and the tyre rubber
// ── LED ceiling fixtures ───────────────────────────────────────────────────
// The VISIBLE source for every lamp in the rig that has a glare weight. A halo
// painted where there is no lamp reads as a smudge on the lens, which is what
// drawGlow's per-record glareW field exists to prevent — so fixture geometry
// and light record are built from ONE table.
const KEY_TINT = [1.16, 1.00, 0.78];    // ~3200 K
const FILL_TINT = [0.86, 0.95, 1.14];   // ~5600 K
const WASH_TINT = [0.90, 0.97, 1.10];
// [x, y, z, tint, energy, radius, aimX, aimY, aimZ, cosIn, cosOut, bleed, glareW, wide]
const FIXTURES = [
  [ 0.00, 4.30,  1.60, KEY_TINT, 15.0, 11, 0, -1, 0,      0.72, 0.28, 0.10, 1.1, 1],
  [ 0.00, 4.30, -1.10, KEY_TINT, 15.0, 11, 0, -1, 0,      0.72, 0.28, 0.10, 1.1, 1],
  [-3.90, 4.25,  3.40, FILL_TINT, 9.5, 12, 0.62, -0.62, -0.48, 0.80, 0.42, 0.14, 0.8, 1],
  [ 3.90, 4.25,  3.40, FILL_TINT, 9.5, 12, -0.62, -0.62, -0.48, 0.80, 0.42, 0.14, 0.8, 1],
  [-3.90, 4.25, -3.40, FILL_TINT, 9.5, 12, 0.62, -0.62, 0.48, 0.80, 0.42, 0.14, 0.8, 1],
  [ 3.90, 4.25, -3.40, FILL_TINT, 9.5, 12, -0.62, -0.62, 0.48, 0.80, 0.42, 0.14, 0.8, 1],
  // Back-wall washers. Pulled forward to z -5.20 on purpose: at -6.05 the N.L
  // on the wall (normal +Z) is ~0.10, a dead graze; here it is ~0.31, which is
  // what gives the branded wall a top-down gradient instead of flat fill.
  [-2.60, 4.60, -5.20, WASH_TINT, 8.0,  9, -0.10, -0.72, -0.69, 0.86, 0.50, 0.06, 0, 0],
  [ 2.60, 4.60, -5.20, WASH_TINT, 8.0,  9, 0.10, -0.72, -0.69, 0.86, 0.50, 0.06, 0, 0],
  // Door-end pair. Everything past z +4 — shutter, shelving, workbench, jack,
  // stanchions and the new lit sign — sat on spill only: the fills are at
  // z 3.40 and aim AWAY from the door, and the keys are 5 m off against a
  // 1/d^2 falloff.
  [-2.60, 4.55,  5.10, WASH_TINT, 7.5,  9, -0.08, -0.70, 0.71, 0.86, 0.50, 0.08, 0, 0],
  [ 2.60, 4.55,  5.10, WASH_TINT, 7.5,  9, 0.08, -0.70, 0.71, 0.86, 0.50, 0.08, 0, 0],
];
const E = 0.55;   // the same physical energy factor the track lamps use
const LED_DROP = 0.06;   // light record sits under its panel so the halo clears the housing

const ledMesh = {};
// PER SIDE, like the props and the dress, and for the same reason: a wall the
// eye is outside of is not drawn, and anything mounted ON that wall must go
// with it. This mesh used to be one unculled blob, so stepping the camera
// outside a side wall left its dado strip hanging in mid-air across the frame,
// in front of the car — a glowing bar attached to nothing. Ceiling fixtures
// stay in `mid`: they hang from the truss, not from a wall.
function buildLed(g, liv) {
  const out = g.mid;
  // THE CREST LIGHTBOX. The comment by the dress atlas says a modern garage's
  // crest wall IS a lightbox; it was one flat quad flush to the wall. The bezel
  // belongs HERE, in the LED group, not in the shell: dress quads draw through
  // drawDecal at glow 0.62 while this mesh draws emissive 1.0, so a bezel built
  // as ordinary lit geometry would be shaded by the back-wall washers and read
  // as a different material from the crest sitting inside it.
  //
  // Depth is the trap. The dress plane is only 3 cm proud of the wall, and
  // drawDecal depth-TESTS without depth-writing, so anything in front of the
  // crest quad deletes it silently — the shutter slats did exactly that to a
  // door-wall quad once. The frame is therefore built at the WALL, stopping
  // short of the crest's own z.
  {
    const c1 = rgb(liv && liv.c1, [0.30, 0.32, 0.36]);
    const zf = Z_BACK + 0.015;                 // behind the dress plane at +0.03
    const X = 1.60, Y0 = 1.24, Y1 = 3.56, T = 0.06;
    const FRAME = scale(c1, 1.15), WELL = [0.03, 0.032, 0.038];
    // Recessed well first, so the crest reads as sitting IN something.
    block(g.back, 0, (Y0 + Y1) / 2, Z_BACK + 0.008, X, (Y1 - Y0) / 2, 0.008, WELL);
    // Sill 1.21-1.27, clear of the wordmark's 1.15 top; head 3.53-3.59, under
    // the 3.76 frame edge. Measured, not eyeballed — the first pass put the
    // sill at 1.05 and it landed inside the wordmark band.
    for (const sy of [-1, 1])                  // head and sill
      block(g.back, 0, sy > 0 ? Y1 : Y0, zf, X + T, T / 2, 0.05, FRAME);
    for (const sx of [-1, 1])                  // jambs
      block(g.back, sx * X, (Y0 + Y1) / 2, zf, T / 2, (Y1 - Y0) / 2 + T, 0.05, FRAME);
  }
  for (let i = 0; i < FIXTURES.length; i++) {
    const F = FIXTURES[i], x = F[0], y = F[1] + LED_DROP, z = F[2];
    const hw = F[13] ? 1.20 : 0.26, hd = F[13] ? 0.17 : 0.12;
    block(out, x, y + 0.06, z, hw, 0.05, hd, scale(STEEL, 0.55));   // housing
    // The lit face must be brighter than 1.0 or the shader's glow gate
    // (smoothstep(0.50, 0.95, max(albedo)) plus an HDR push on max(bright-1,0))
    // never fires and it reads as white plastic instead of a light.
    block(out, x, y, z, hw * 0.95, 0.02, hd * 0.8, scale(F[3], 1.14));
    for (let s = -1; s <= 1; s += 2)
      block(out, x + s * hw * 0.8, y + 0.30, z, 0.02, 0.26, 0.02, STEEL);
  }
  // Team-colour dado uplights: cans grazing up the side walls. These are what
  // make the bay read as THIS team's garage before you notice any logo. Three
  // per side now — one pair at z 0 left the walls past |z| 3 on spill only.
  const c1 = rgb(liv && liv.c1, [0.4, 0.45, 0.55]);
  for (let s = -1; s <= 1; s += 2) {
    const w = s < 0 ? g.nx : g.px;          // mounted on THAT wall, culled with it
    for (let i = -1; i <= 1; i++) {
      cyl(w, s * 5.05, 0.02, i * 3.5, 0.11, 0.22, scale(STEEL, 0.6), 8);
      cyl(w, s * 5.05, 0.24, i * 3.5, 0.09, 0.02, scale(c1, 1.5), 8);
    }
    // The dado line. This was ONE bare emissive bar 12.6 m long standing 0.07
    // proud of a near-black wall, and it read as a floating line rather than as
    // a light — there was no fixture around it and nothing to give it a length.
    // Now it is four segments in a recessed channel, which is what a real bay
    // has: the housing is dark enough that the shader's glow gate
    // (smoothstep(0.50, 0.95, max(albedo))) never fires on it, so it can share
    // this emissive mesh with the lit face, exactly as the ceiling fixtures do.
    for (let k = 0; k < 4; k++) {
      const cz = -4.65 + k * 3.10;
      block(w, s * 5.37, 1.56, cz, 0.05, 0.085, 1.475, scale(STEEL, 0.5));   // channel
      block(w, s * 5.34, 1.56, cz, 0.03, 0.038, 1.44, scale(c1, 1.35));      // lit face
      // End caps, so a segment terminates in a fitting instead of just stopping.
      for (let e = -1; e <= 1; e += 2)
        block(w, s * 5.36, 1.56, cz + e * 1.50, 0.045, 0.075, 0.035, scale(STEEL, 0.7));
    }
  }
  // Lit fascia over the door, behind the D_SIGN wordmark (the quad sits 5 mm
  // in front of this block's face — keep that order or the sign vanishes).
  block(g.door, 0, 4.89, Z_DOOR - 0.14, 3.05, 0.13, 0.05, scale(c1, 0.55));
}
const LED_OPTS = { emissive: 1.0, roughness: 1.0, specular: 0, noAlphaWrite: true };

// ── light rig ──────────────────────────────────────────────────────────────
// Stride-15 records: [x,y,z, r,g,b, rad, dirX,dirY,dirZ, cosInner, cosOuter,
// bleed, volW, glareW] — see js/render/gfx.js. volW stays 0 (godrays are off).
const _rig = [];
let _rigKey = "";
function lights(liv) {
  const c1 = rgb(liv && liv.c1, [0.4, 0.45, 0.55]);
  const key = c1.join(",");
  if (_rig.length && key === _rigKey) return _rig;
  _rig.length = 0;
  for (let i = 0; i < FIXTURES.length; i++) {
    const F = FIXTURES[i], e = F[4] * E, t = F[3];
    _rig.push(F[0], F[1], F[2], t[0] * e, t[1] * e, t[2] * e, F[5],
              F[6], F[7], F[8], F[9], F[10], F[11], 0, F[12]);
  }
  const m = Math.max(c1[0], c1[1], c1[2]) || 1, ue = (3.0 / m) * E;
  for (let s = -1; s <= 1; s += 2)
    _rig.push(s * 5.05, 0.25, 0, c1[0] * ue, c1[1] * ue, c1[2] * ue, 6,
              -s * 0.26, 0.97, 0, 0.90, 0.55, 0.05, 0, 0.5);
  // The pit-lane GANTRY outside: four masts along the far wall. Their energy
  // and halo are set per frame from the hour (live() below) — at night they
  // are what you see through the door, by day they are unlit steel.
  for (const gx of [-9, -3, 3, 9])
    _rig.push(gx, 3.6, 12.1, 0, 0, 0, 9, 0, -0.85, -0.53, 0.80, 0.45, 0.10, 0, 0);
  // The inspection LAMP, aimed by spot(); off until a preset asks for it.
  _rig.push(0, 1.7, 0, 0, 0, 0, 7, 0, -1, 0, 0.92, 0.70, 0.05, 0, 0);
  _rigKey = key;
  return _rig;
}
// ── the animated layer ─────────────────────────────────────────────────────
// Everything here is per FRAME and costs no rebuild: the light records are
// written in place, the moving props are static meshes under a matrix.
const GANTRY_AT = FIXTURES.length + 2, LAMP_AT = GANTRY_AT + 4;   // record indices in _rig
const GANTRY_TINT = [1.0, 0.93, 0.78];
let pulseAt = -1e9, spotName = null, nightNow = false;
function pulse() { pulseAt = typeof performance !== "undefined" ? performance.now() : Date.now(); }
function spot(name) { spotName = name || null; }
// Where the work lamp stands for each preset, and what it looks at. Each
// stand is OUTSIDE that preset's frame (the fit is +/-3.1 m across the view
// axis at the car) and never on the eye-to-car line — the first pass put the
// SIDE lamp at x 2.9, z 0.4, which is a tripod planted in front of the car
// in the one view that exists to show its flank.
const SPOTS = {
  hero: [-2.6, -3.6, 0, 0.7, -1.4], bay: [-2.5, -3.8, 0, 0.7, -1.2],
  bayFront: [2.8, 4.2, 0.4, 0.6, 1.2],
  wingRear: [-2.2, -4.2, 0, 0.9, -2.7], rear: [-3.4, -4.6, 0, 0.6, -2.6],
  side: [2.6, 4.3, 0.8, 0.4, 0.6], front: [-3.4, 4.6, 0, 0.5, 2.4], wingFront: [-2.6, 4.4, 0, 0.5, 2.9],
};
const PARK = [-4.0, 2.2];
let lampAim = [PARK[0], 0, PARK[1], 0, 0, 0, 0];   // x, z, yaw, on, ax, ay, az
// The live records: gantry by hour, the lamp by preset, one washer that
// flickers, and the truss chase that runs the length of the bay for two
// seconds after a part is fitted. Returns the rig, plus the chase while it runs.
function live(liv, now, ctx) {
  const rig = lights(liv);
  nightNow = !!(ctx && ctx.night);
  const ge = nightNow ? 6.5 * E : 0;
  for (let i = 0; i < 4; i++) {
    const o = (GANTRY_AT + i) * 15;
    rig[o + 3] = GANTRY_TINT[0] * ge; rig[o + 4] = GANTRY_TINT[1] * ge; rig[o + 5] = GANTRY_TINT[2] * ge;
    rig[o + 14] = nightNow ? 1.2 : 0;
  }
  // Lamp: parked and dark while the turntable runs, else beside the preset's subject.
  const sp = (!ctx || !ctx.spin) && spotName && SPOTS[spotName];
  const lx = sp ? sp[0] : PARK[0], lz = sp ? sp[1] : PARK[1];
  const ax = sp ? sp[2] : lx, ay = sp ? sp[3] : 0, az = sp ? sp[4] : lz;
  const yaw = Math.atan2(ax - lx, az - lz);
  lampAim = [lx, lz, yaw, sp ? 1 : 0, ax, ay, az];
  {
    const o = LAMP_AT * 15, hx = lx + Math.sin(yaw) * 0.18, hz = lz + Math.cos(yaw) * 0.18, hy = 1.72;
    const dx = ax - hx, dy = ay - hy, dz = az - hz, dl = Math.hypot(dx, dy, dz) || 1;
    const le = sp ? 7.0 * E : 0;
    rig[o] = hx; rig[o + 1] = hy; rig[o + 2] = hz;
    rig[o + 3] = 1.10 * le; rig[o + 4] = 1.00 * le; rig[o + 5] = 0.82 * le;
    rig[o + 7] = dx / dl; rig[o + 8] = dy / dl; rig[o + 9] = dz / dl;
    rig[o + 14] = sp ? 0.6 : 0;
  }
  // One door-end washer with a tired ballast: three incommensurate sines, and
  // a drop only when they line up, so it flickers rarely rather than strobes.
  {
    const t = now / 1000, f = (Math.sin(t * 23.1) + Math.sin(t * 7.3) + Math.sin(t * 41.7)) / 3;
    const on = f > 0.62 ? 0.30 : f > 0.50 ? 0.72 : 1, F = FIXTURES[8], e = F[4] * E * on, o = 8 * 15;
    rig[o + 3] = F[3][0] * e; rig[o + 4] = F[3][1] * e; rig[o + 5] = F[3][2] * e;
  }
  const u = (now - pulseAt) / 2200;
  if (u < 0 || u >= 1) return rig;
  const c2 = rgb(liv && (liv.accent || liv.stripe || liv.c2), [0.6, 0.62, 0.66]);
  const m = Math.max(c2[0], c2[1], c2[2]) || 1, ce = (2.6 / m) * E * Math.sin(u * Math.PI);
  const z = Z_BACK + (Z_DOOR - Z_BACK) * u, chase = rig.slice();
  for (const sx of [-4.6, 4.6])
    chase.push(sx, 4.55, z, c2[0] * ce, c2[1] * ce, c2[2] * ce, 5, 0, -1, 0, 0.92, 0.55, 0.06, 0, 0.9);
  return chase;
}
// Column-major T * Ry(ay) * Rz(az), written into `out`.
function mk(out, tx, ty, tz, ay, az) {
  const cy = Math.cos(ay), sy = Math.sin(ay), cz = Math.cos(az), sz = Math.sin(az);
  out[0] = cy * cz;  out[1] = sz;       out[2] = -sy * cz; out[3] = 0;
  out[4] = -cy * sz; out[5] = cz;       out[6] = sy * sz;  out[7] = 0;
  out[8] = sy;       out[9] = 0;        out[10] = cy;      out[11] = 0;
  out[12] = tx;      out[13] = ty;      out[14] = tz;      out[15] = 1;
  return out;
}
let fanMesh = null, lampMesh = null, lampFace = null, passMesh = null;
const _mFan = new Float32Array(16), _mLamp = new Float32Array(16), _mPass = new Float32Array(16);
const MAT_MIRROR = new Float32Array([-1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const MIRROR_OPTS = { alpha: 0.26, roughness: 1, specular: 0, metalness: 0, clearcoat: 0, noDepthTest: true };
function ensureDynamic() {
  if (fanMesh) return;
  // Fan blades in the XY plane about the origin, turned about Z per frame.
  const f = acc();
  tube(f, [0, 0, -0.04], [0, 0, 0.06], 0.07, scale(STEEL, 0.8), 8, MAT.METAL);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2, r0 = 0.07, r1 = 0.30, w = 0.055;
    const P = (r, k) => [Math.cos(a) * r - Math.sin(a) * k, Math.sin(a) * r + Math.cos(a) * k, 0.01];
    const o = P(r0, -w), pu = P(r1, -w), pv = P(r0, w);
    panelGrid(f, o, [pu[0] - o[0], pu[1] - o[1], 0], [pv[0] - o[0], pv[1] - o[1], 0], 1, 1, [0, 0, 1], () => scale(STEEL, 0.62));
    panelGrid(f, o, [pu[0] - o[0], pu[1] - o[1], 0], [pv[0] - o[0], pv[1] - o[1], 0], 1, 1, [0, 0, -1], () => scale(STEEL, 0.5));
  }
  fanMesh = _gfx.createMesh(f);
  // The work lamp: tripod, column, head — facing +Z at the origin, yawed per preset.
  const l = acc();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    tube(l, [0, 0.95, 0], [Math.cos(a) * 0.42, 0.02, Math.sin(a) * 0.42], 0.018, STEEL, 6, MAT.METAL);
    cyl(l, Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42, 0.035, 0.03, RUBBER, 6);
  }
  cyl(l, 0, 0.3, 0, 0.025, 1.36, STEEL, 8, MAT.METAL);
  block(l, 0, 1.72, 0.10, 0.15, 0.11, 0.07, scale(STEEL, 0.55));            // head
  block(l, 0, 1.72, 0.03, 0.05, 0.05, 0.04, scale(STEEL, 0.7));             // yoke
  for (let i = 0; i < 4; i++) block(l, -0.12 + i * 0.08, 1.72, 0.18, 0.012, 0.10, 0.012, scale(STEEL, 0.8));   // guard
  lampMesh = _gfx.createMesh(l);
  const lf = acc();
  block(lf, 0, 1.72, 0.172, 0.13, 0.09, 0.006, [1.35, 1.28, 1.10]);          // the lit face (emissive draw)
  lampFace = _gfx.createMesh(lf);
  // A car passing in the pit lane: a dark silhouette with its light bar.
  const c = acc(), INK = [0.05, 0.05, 0.06];
  block(c, 0, 0.42, 0, 0.55, 0.16, 1.9, INK);                                  // body
  block(c, 0, 0.68, -0.3, 0.32, 0.12, 0.6, INK);                               // airbox/halo
  block(c, 0, 0.80, -2.2, 0.55, 0.05, 0.16, INK);                              // rear wing
  block(c, 0, 0.30, 2.5, 0.85, 0.03, 0.14, INK);                               // front wing
  for (const wx of [-0.7, 0.7]) for (const wz of [1.6, -1.55])
    tube(c, [wx - 0.17, 0.34, wz], [wx + 0.17, 0.34, wz], 0.34, [0.03, 0.03, 0.035], 10);
  block(c, 0, 0.55, -2.55, 0.04, 0.08, 0.02, [1.6, 0.2, 0.15]);                // rain light
  passMesh = _gfx.createMesh(c);
}
// GLOW_FS peaks at (0.75 + 0.28) * uStr, and LT.glareStr ships at 0.12 for
// distant track masts. A garage has its fixtures IN frame, so half a stop up.
const GLARE_STR = 0.18;
function glareStr() { return GLARE_STR; }

// ── floor ──────────────────────────────────────────────────────────────────
// Two surfaces. The APRON is a disc at y = -0.04 whose vertex colours fade to
// exactly BACKDROP at the rim, so the ground has no visible edge — the trick
// the preview already relied on. The BAY floor is a gapless TILING at y = 0,
// which is what the wheels sit on. The 4 cm step between them is a real garage
// detail (a resin bay laid over the pit apron) and it is also why nothing here
// needs a depth bias: no two floor surfaces are ever coplanar.
const BOX_HW = 2.20, BOX_ZF = 4.25, BOX_ZB = -4.00;
// The pit lane, seen through the open door. It lives in the FLOOR mesh, which
// draws unconditionally — the one thing it must not do is cull with the door
// wall, because you are looking through that wall's aperture exactly when the
// wall itself has back-faced away. Laid on the apron plane (y -0.04), not the
// bay floor (y 0): the 4 cm step between them is the resin bay over the pit
// apron, and through the doorway it reads as the threshold it is.
const PIT_HW = 10.5, PIT_Z0 = 6.45, PIT_Z1 = 11.9;
function buildPitLane(out, liv, night) {
  const APRON_Y = -0.04;
  // Outside at NIGHT: a darker lane under the gantry lights (lights() adds
  // them), the hoardings lit. By day the asphalt is the bright side.
  const NK = night ? 0.46 : 1;
  // LIGHTER than the bay floor, not darker. The first pass used 0.072, below
  // the apron's own 0.105, so the lane read as a black void through the
  // doorway — which is the exact failure the door risked in the first place.
  // Outside is the bright side: daylight asphalt against a dim bay is what
  // makes an open door look open.
  const ASPHALT = [0.20, 0.205, 0.215], LINE = [0.88, 0.89, 0.91];
  const WALL = [0.30, 0.31, 0.34], WALL_TOP = [0.46, 0.47, 0.50];
  const c1 = rgb(liv && liv.c1, [0.30, 0.32, 0.36]);
  // 21 x 5.45 m — 114 m2, the entire backdrop of the REAR preset, seen through
  // a 5.4 x 4.8 m aperture — used to be ONE `tile()`: two triangles and one
  // flat colour, so ten spot lights had nothing to fall on and the lane read as
  // a painted backdrop rather than a surface. Subdivided 12 x 4 with a little
  // vertex-colour mottle, it costs 96 triangles and starts taking light.
  panelGrid(out, [-PIT_HW, APRON_Y + 0.004, PIT_Z0], [PIT_HW * 2, 0, 0],
    [0, 0, PIT_Z1 - PIT_Z0], 12, 4, [0, 1, 0], (u, v) => {
      // Deterministic per-vertex wear: darker in the working lane against the
      // garages, and a hash so the mottle is not a gradient.
      const h = ((u * 977 + v * 613) * 4093) % 1;
      const k = (0.94 + h * 0.10 + (1 - v) * 0.05) * NK;
      return [ASPHALT[0] * k, ASPHALT[1] * k, ASPHALT[2] * k];
    }, MAT.ASPHALT);
  // Fast lane outside, working lane against the garages — the two boundary
  // lines every pit straight has.
  for (const z of [8.95, 11.70])
    tile(out, -PIT_HW, PIT_HW, z, z + 0.13, LINE, APRON_Y + 0.008, MAT.ASPHALT);
  // THE PIT BOX. A garage without its own box painted outside the door is a
  // shed: this is the one marking that says which bay this is. Team-coloured
  // outline on the lane, centred on the door.
  // The box sits in the WORKING lane (z 6.45..8.95), never across the fast lane.
  const BX0 = PIT_Z0 + 0.30, BX1 = 8.80;
  for (const q of [[-1.9, -1.78, BX0, BX1], [1.78, 1.9, BX0, BX1],
                   [-1.9, 1.9, BX0, BX0 + 0.12], [-1.9, 1.9, BX1 - 0.12, BX1]])
    tile(out, q[0], q[1], q[2], q[3], c1, APRON_Y + 0.010, MAT.ASPHALT);
  // Bollards along the FAR edge, between the outer line and the wall — never
  // mid-lane, which is where a car drives. The vertical marks are what give the
  // lane depth from the low REAR camera.
  for (let i = -3; i <= 3; i++)
    cyl(out, i * 2.9, APRON_Y + 0.008, 11.82, 0.055, 0.62,
        i % 2 ? [0.80, 0.80, 0.84] : [0.72, 0.30, 0.10], 6, MAT.METAL);
  // The garages opposite: a low run of blocks with lit fascias, so the far side
  // of the lane is a row of buildings rather than the end of the mesh.
  for (let i = -3; i <= 3; i++) {
    block(out, i * 3.0, APRON_Y + 1.60, PIT_Z1 + 1.30, 1.42, 1.10, 0.60,
          scale(WALL, i % 2 ? 0.92 : 1.06), MAT.CONCRETE);
    // A fascia BAND on the front face, not a roof slab: 0.16 m deep, so its
    // horizontal caps stay small. A wide flat cap of wall-keyed metal streaks
    // for the same reason a concrete floor does.
    block(out, i * 3.0, APRON_Y + 2.78, PIT_Z1 + 0.78, 1.46, 0.10, 0.08,
          scale(WALL_TOP, 1.1), MAT.METAL);
  }
  // A wall to stop the eye. Without it the lane runs to the apron rim and
  // fades into the clear colour, which reads as fog rather than as somewhere.
  block(out, 0, APRON_Y + 0.50, PIT_Z1 + 0.18, PIT_HW, 0.50, 0.16, WALL, MAT.CONCRETE);
  block(out, 0, APRON_Y + 1.03, PIT_Z1 + 0.18, PIT_HW, 0.05, 0.20, WALL_TOP, MAT.METAL);
  // A team-coloured hoarding along it, so the far side of the lane is a place
  // rather than a grey slab.
  for (let i = -2; i <= 2; i++)
    block(out, i * 3.6, APRON_Y + 0.62, PIT_Z1 + 0.02, 1.55, 0.26, 0.05,
          scale(c1, night ? 1.25 : (i % 2 ? 0.55 : 0.9)));
}
function buildApron(out) {
  const RINGS = 7, SEG = 40, R = 18, Y = -0.04;
  const HOT = [0.105, 0.107, 0.115];
  const push = (x, z, t) => {
    const k = smooth(t);
    out.pos.push(x, Y, z); out.nrm.push(0, 1, 0);
    out.col.push(HOT[0] + (BACKDROP[0] - HOT[0]) * k,
                 HOT[1] + (BACKDROP[1] - HOT[1]) * k,
                 HOT[2] + (BACKDROP[2] - HOT[2]) * k);
    pushMat(out, 1, MAT.ASPHALT);
  };
  const base = out.pos.length / 3;
  push(0, 0, 0);
  for (let r = 1; r <= RINGS; r++) {
    const t = r / RINGS, rad = R * t * t;
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      push(Math.cos(a) * rad, Math.sin(a) * rad, t);
    }
  }
  // CCW seen from ABOVE (gl.frontFace(CCW) + cull BACK): the ring walks +a =
  // (cos a, sin a) in (x, z), and a downward-looking camera maps world z to
  // SCREEN-DOWN, so the naive order comes out clockwise and the whole disc is
  // culled — an invisible floor that still passes every mesh assertion.
  for (let i = 0; i < SEG; i++) out.idx.push(base, base + 1 + ((i + 1) % SEG), base + 1 + i);
  for (let r = 0; r < RINGS - 1; r++) {
    const a0 = base + 1 + r * SEG, b0 = a0 + SEG;
    for (let i = 0; i < SEG; i++) {
      const j = (i + 1) % SEG;
      out.idx.push(a0 + i, b0 + j, b0 + i, a0 + i, a0 + j, b0 + j);
    }
  }
}
function buildBayFloor(out, liv) {
  const SLAB = [0.088, 0.090, 0.098], IN = [0.115, 0.118, 0.126];
  const PAINT = [0.66, 0.67, 0.70], WALK = [0.70, 0.60, 0.12];
  const band = scale(rgb(liv && liv.c1, [0.3, 0.32, 0.36]), 0.7);
  const L = -HALF_W, R = HALF_W, B = Z_BACK, F = Z_DOOR, W = 0.11;
  // ASPHALT, not CONCRETE, on a HORIZONTAL surface — and this is not a naming
  // preference. matWallLike() in js/render/glx/shaders/glsl-lit.js returns true for
  // CONCRETE, so its triplanar UV is (an.x > an.z ? z : x, worldY). On a floor
  // the normal is (0,1,0), `an.x > an.z` is false, and worldY is 0 everywhere:
  // the UV collapses to a 1-D function of x and the "concrete" renders as
  // longitudinal streaks smeared down -Z. ASPHALT is not wall-like, keys off
  // world xz, and carries the most restrained relief in the table — which is
  // what a squeegeed resin bay floor actually looks like.
  const C = MAT.ASPHALT;
  const key = rgb(liv && (liv.accent || liv.stripe || liv.c2), [0.55, 0.57, 0.62]);
  tile(out, L, R, B, B + 0.8, band, 0, C);                 // team band, deep end
  tile(out, L, R, B + 0.8, BOX_ZB - W, SLAB, 0, C);
  tile(out, L, -BOX_HW - W, BOX_ZB, BOX_ZF, SLAB, 0, C);
  tile(out, -BOX_HW, BOX_HW, BOX_ZB, BOX_ZF, IN, 0, C);    // the box itself
  tile(out, BOX_HW + W, R, BOX_ZB, BOX_ZF, SLAB, 0, C);
  tile(out, L, R, BOX_ZF + W, F, SLAB, 0, C);
  // A team keyline just outside the box edge. 130 of the 138 m2 of floor was
  // team-agnostic grey and the box — the thing the car is parked in, and 100%
  // of the TOP preset — was the greyest part of it.
  for (const q of [[L, R, BOX_ZB - W - 0.05, BOX_ZB - W], [L, R, BOX_ZF + W, BOX_ZF + W + 0.05],
                   [-BOX_HW - W - 0.05, -BOX_HW - W, BOX_ZB - W, BOX_ZF + W],
                   [BOX_HW + W, BOX_HW + W + 0.05, BOX_ZB - W, BOX_ZF + W]])
    tile(out, q[0], q[1], q[2], q[3], key, 0.001, C);
  // The four pit-box edges were FLAT — a painted colour on the same plane as
  // the slab. The floor is the biggest surface in every camera preset (100% of
  // top, ~60% of hero/rear/front) and carried 36 triangles for 138 m2, so it
  // had nothing for the ten spot lights to catch. 2 cm of height turns each
  // edge into a lit top face and a shadowed side for 48 triangles total, which
  // is what makes a painted box read as a kerb instead of a decal.
  const EH = 0.02;
  block(out, 0, EH / 2, BOX_ZB - W / 2, (R - L) / 2, EH / 2, W / 2, PAINT);   // back edge
  block(out, 0, EH / 2, BOX_ZF + W / 2, (R - L) / 2, EH / 2, W / 2, PAINT);   // front edge
  for (const sx of [-1, 1])
    block(out, sx * (BOX_HW + W / 2), EH / 2, (BOX_ZB + BOX_ZF) / 2,
          W / 2, EH / 2, (BOX_ZF - BOX_ZB) / 2, PAINT);                       // side edges
  for (let s = -1; s <= 1; s += 2) {                       // walkway lines
    tile(out, s * 4.25, s * 4.25 + 0.09, B + 0.8, BOX_ZB - W, WALK);
    tile(out, s * 4.25, s * 4.25 + 0.09, BOX_ZF + W, F, WALK);
  }
  // Expansion joints, 3 cm, laid ON TOP of the tiling at +2 mm — the one place
  // a tiny lift is simpler than splitting every band again, and 2 mm at 4-15 m
  // is far above this depth buffer's resolution.
  const J = [0.042, 0.043, 0.048];
  for (let i = -2; i <= 2; i++) {
    const x = i * 2.4;
    const b2 = out.pos.length / 3;
    const p = [[x - 0.015, B], [x + 0.015, B], [x + 0.015, F], [x - 0.015, F]];
    for (let k = 0; k < 4; k++) { out.pos.push(p[k][0], 0.002, p[k][1]); out.nrm.push(0, 1, 0); out.col.push(J[0], J[1], J[2]); }
    pushMat(out, 4, MAT.ASPHALT);
    out.idx.push(b2, b2 + 2, b2 + 1, b2, b2 + 3, b2 + 2);
  }
}

// ── team dress ─────────────────────────────────────────────────────────────
// One canvas atlas, one texture, one texMesh, one drawDecal: the same shape as
// the car's own decal path (js/car/car-mesh.js carDecalData), which is what
// keeps this to a single extra draw call however many branded surfaces there
// are. The crest is the real team PNG where LiveryTex has one and its
// hand-drawn vector crest where it does not — which is also the permanent path
// for a custom MY TEAM entry, since those never have a PNG.
// Everything the boards report, gathered in one place from the SAME calls the
// 2D panel makes. getParts is passed in rather than read from the store because
// career mode substitutes its own fitted set (js/game.js getTeamParts), and a
// direct store read would quietly show the wrong car.
function boardInfo(team, getParts, driverIdx) {
  if (typeof Parts === "undefined" || typeof getParts !== "function") return null;
  try {
    // ONE resolveSetup call carries everything: it already returns the stat
    // `mods`, the total `cost`, and `options` (the RESOLVED option per category,
    // which is what a supplier-locked fallback actually fitted — not the id the
    // save asked for).
    const r = Parts.resolveSetup(getParts(team.id), team);
    const base = team.stats || { speed: 85, accel: 85, cornering: 85, braking: 85 };
    const stats = Parts.STAT_KEYS.map((k) => {
      const b = base[k.key] || 75;
      const value = Math.round(Parts.displayStat(b * r.mods[k.key]));
      return { value, delta: value - b };
    });
    const spec = Parts.CATALOG.map((cat) => {
      const opt = r.options[cat.id];
      return { cat: String(cat.label || cat.id).toUpperCase(), label: (opt && opt.label) || "Stock" };
    });
    const drv = (team.drivers || [])[driverIdx | 0] || (team.drivers || [])[0] || {};
    // THE CAREER CAP, not the free-play constant. setup-ui.js resolves this the
    // same way and enforces against it, but the BUDGET board on the garage wall
    // read Parts.BUDGET (780) unconditionally — so a career at any team whose
    // factory build costs more than that showed "0 cr OF 780 REMAINING" with an
    // empty bar, two metres from a DOM panel reading the true figure, and it
    // stayed at 0 however much was unfitted. Four of the seven starter teams are
    // over 780 on the factory build alone, and MY TEAM is 900.
    const cap = (typeof Career !== "undefined" && Career.owned && Career.owned(team.id))
      ? Career.budget() : Parts.BUDGET;
    return { stats, spec, driver: drv, budget: cap,
             left: Math.max(0, cap - (r.cost || 0)) };
  } catch (e) {
    Log.warn("game", `GarageScene boardInfo failed: ${e && e.message}`);
    return null;
  }
}
// A signature of everything the boards render, for the dress cache key. Without
// the parts and the seat in here the numbers freeze the instant you fit a part
// — the texture would never be repainted.
function boardKey(info) {
  if (!info) return "-";
  let k = `${info.left}|${info.driver.num == null ? "-" : info.driver.num}`;
  for (let i = 0; i < info.stats.length; i++) k += `|${info.stats[i].value}`;
  for (let i = 0; i < info.spec.length; i++) k += `|${info.spec[i].label}`;
  return k;
}

const DRESS = 1024;
const D_CREST = { x: 0, y: 0, w: 512, h: 512 };
const D_WORD  = { x: 512, y: 0, w: 512, h: 128 };
const D_BOARD = { x: 512, y: 160, w: 256, h: 352 };
const D_SCREEN = { x: 0, y: 512, w: 512, h: 256 };
// The information boards. Everything a player is deciding on lived only in the
// 2D panel; these put it in the room, on the wall you are already looking at.
const D_STATS  = { x: 512, y: 512, w: 512, h: 256 };
const D_DRIVER = { x: 768, y: 128, w: 256, h: 256 };
const D_SPEC   = { x: 0, y: 768, w: 512, h: 256 };
const D_BUDGET = { x: 512, y: 768, w: 512, h: 128 };
// The free 256x128 block below DRIVER: a wide team wordmark for the floor and
// the lit sign over the door, drawn light-on-dark so it works on both.
const D_SIGN = { x: 768, y: 384, w: 256, h: 128 };
// The last free block, 512x128 under BUDGET. The -X pit board has existed since
// the back wall was mirrored but no dress quad was ever placed on it, so a
// team-branded panel rendered as a blank dark box in 41% of the FRONT frame.
// It gets its OWN graphic rather than a second copy of the driver board: two
// identical boards on one wall read as a copy-paste, and a real garage's second
// board is the strategy call, not the drivers again.
const D_STRAT = { x: 512, y: 896, w: 512, h: 128 };

// The decal shader sees sun + ambient + uGlow only — never the point lights. So
// rather than fight that, everything here is painted as SIGNAGE and lit by
// glow: a modern garage's crest wall IS a lightbox, the pit board IS an LED
// panel and the monitors ARE emissive. Relative brightness between surfaces is
// baked into the canvas, because glow is per-draw and there is only one draw.
function paintDress(team, liv, info) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = DRESS;
  const ctx = cv.getContext("2d");
  ctx.clearRect(0, 0, DRESS, DRESS);
  const c1 = rgb(liv && liv.c1, [0.30, 0.32, 0.36]);
  const c2 = rgb(liv && (liv.accent || liv.stripe || liv.c2), [0.6, 0.62, 0.66]);
  // ONE team signature, shared by everything on this atlas that must differ
  // between bays but has no data of its own to differ by — the strategy board's
  // stint plan and the engineers' trace shapes. team.id is already in the dress
  // cache key, so nothing extra has to be folded in.
  let sig = 0;
  for (let i = 0; i < String(team && team.id || "").length; i++)
    sig = (sig * 31 + String(team.id).charCodeAt(i)) & 0xffff;
  // Crest lightbox. The FIELD is chosen for contrast against the mark, and a
  // halo is added ONLY when the mark still lacks separation — the same rule
  // buildAtlas applies on the car. The first version passed the team's own c1
  // as the halo unconditionally, which put a same-hue glow behind a mark
  // sitting on a c1-derived field and softened it instead of separating it.
  const img = LiveryTex.LOGOS && LiveryTex.LOGOS[team.id];
  // What LANDS on this field, whichever path draws the mark: the uploaded PNG's
  // average for the custom team, else LiveryTex.markOnField — which answers
  // with the BACKING when the mark has one. Asking markBase (the horse, the
  // bulls) was the older question and the wrong one for a plated mark: Ferrari
  // returned a near-black horse, the flip below chose a white lightbox, and a
  // white field then rejected Ferrari's own yellow shield at 1.07 against the
  // 1.6 plate floor — so the wall showed a white horse on a RED shield while
  // the car showed the real black-on-yellow.
  // Keying this on img._avg ALONE is what made the flip below dead code the
  // moment the roster stopped shipping logo PNGs — it would be null for every
  // team, the ternary would always take `tinted`, and every crest would land on
  // a dark field whether or not that is the readable choice.
  const onField = (img && img._avg) ? [img._avg]
    : (LiveryTex.markOnField ? LiveryTex.markOnField(team.id, liv) : null);
  const tinted = scale(c1, 0.30);
  // A dark team field reads best, unless what sits on it is dark against it.
  // WORST-case over the list: a disc-backed mark hands back both the sun and
  // the bulls, because the bulls hang off the sun and land here too.
  const worstOn = (f) => onField.reduce(
    (m, c) => Math.min(m, LiveryTex.contrast(c, f)), Infinity);
  const field = (onField && onField.length && LiveryTex.contrast && worstOn(tinted) < 2.2)
    ? (LiveryTex.inkOn ? LiveryTex.inkOn(onField) : [0.93, 0.94, 0.96]) : tinted;
  ctx.fillStyle = css(field); ctx.fillRect(D_CREST.x, D_CREST.y, D_CREST.w, D_CREST.h);
  ctx.strokeStyle = css(c2); ctx.lineWidth = 9;
  ctx.strokeRect(D_CREST.x + 12, D_CREST.y + 12, D_CREST.w - 24, D_CREST.h - 24);
  const inner = { x: D_CREST.x + 40, y: D_CREST.y + 40, w: D_CREST.w - 80, h: D_CREST.h - 80 };
  if (LiveryTex.paintTeamMark) {
    const halo = (img && img._avg && LiveryTex.contrast && LiveryTex.contrast(img._avg, field) < 2.6 && LiveryTex.inkOn)
      ? LiveryTex.inkOn([img._avg]) : null;
    // ONE mark path for the lightbox — same logo / logo2 / logo3 routing as the
    // parts tile and fin badge, scored against the field the crest lands on.
    LiveryTex.paintTeamMark(ctx, team.id, liv, inner, field, { fullLockup: true, halo });
  }
  // Team wordmark strip — the same lockup as the lightbox, left of the name.
  ctx.fillStyle = css(scale(c1, 0.55)); ctx.fillRect(D_WORD.x, D_WORD.y, D_WORD.w, D_WORD.h);
  ctx.fillStyle = css(c2); ctx.fillRect(D_WORD.x, D_WORD.y + D_WORD.h - 9, D_WORD.w, 9);
  const wordMark = { x: D_WORD.x + 12, y: D_WORD.y + 16, w: 96, h: 96 };
  if (LiveryTex.paintTeamMark) {
    LiveryTex.paintTeamMark(ctx, team.id, liv, wordMark, [c1, c2], {});
  }
  ctx.fillStyle = "#f2f3f5";
  ctx.font = "700 48px system-ui, sans-serif";
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText(String(team.name || team.short || "").toUpperCase(),
    D_WORD.x + 120, D_WORD.y + D_WORD.h / 2 - 4, D_WORD.w - 136);
  // Pit board: team header, then the two drivers' numbers and codes.
  ctx.fillStyle = "#0a0b0d"; ctx.fillRect(D_BOARD.x, D_BOARD.y, D_BOARD.w, D_BOARD.h);
  ctx.fillStyle = css(c1); ctx.fillRect(D_BOARD.x, D_BOARD.y, D_BOARD.w, 56);
  ctx.fillStyle = "#f4f5f7"; ctx.font = "700 34px system-ui, sans-serif";
  ctx.fillText(String(team.short || ""), D_BOARD.x + D_BOARD.w / 2, D_BOARD.y + 29);
  const drv = (team && team.drivers) || [];
  for (let i = 0; i < 2; i++) {
    const d = drv[i] || {}, top = D_BOARD.y + 78 + i * 140;
    ctx.fillStyle = "#f4f5f7"; ctx.font = "700 88px system-ui, sans-serif";
    ctx.fillText(d.num == null ? "--" : String(d.num), D_BOARD.x + D_BOARD.w / 2, top + 46);
    ctx.fillStyle = css(c2); ctx.font = "700 30px system-ui, sans-serif";
    ctx.fillText(String(d.code || ""), D_BOARD.x + D_BOARD.w / 2, top + 108);
  }
  // Engineer screens: six tiles of plausible telemetry.
  ctx.fillStyle = "#05070a"; ctx.fillRect(D_SCREEN.x, D_SCREEN.y, D_SCREEN.w, D_SCREEN.h);
  for (let t = 0; t < 6; t++) {
    const tx = D_SCREEN.x + (t % 3) * (D_SCREEN.w / 3), ty = D_SCREEN.y + ((t / 3) | 0) * (D_SCREEN.h / 2);
    const tw = D_SCREEN.w / 3 - 6, th = D_SCREEN.h / 2 - 6;
    ctx.fillStyle = "#0b1016"; ctx.fillRect(tx + 3, ty + 3, tw, th);
    // Six identical sine traces in two fixed colours, for eleven teams. The
    // engineers' bank is the -X wall's centrepiece and the SIDE preset looks
    // straight at it, so every bay was quoting the same telemetry. One trace
    // colour now comes from the livery accent, and the waveform is seeded off
    // the team id: same idiom as the strategy board above, and the reason is
    // the same — a shared graphic is a bay that could belong to anyone.
    const tSeed = (sig + t * 7) % 32;
    ctx.strokeStyle = t % 2 ? css(c2) : "#e2a33c"; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 0; k <= 22; k++) {
      const px = tx + 8 + (tw - 16) * (k / 22);
      const py = ty + th * 0.55
        - Math.sin(k * (0.55 + tSeed * 0.035) + t + tSeed) * th * 0.20
        - Math.sin(k * 0.31 + tSeed) * th * 0.07
        - (k % (3 + (tSeed % 4))) * 1.4;
      if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(120,150,175,0.22)"; ctx.lineWidth = 1;
    for (let gl = 1; gl < 4; gl++) {
      ctx.beginPath(); ctx.moveTo(tx + 6, ty + th * (gl / 4)); ctx.lineTo(tx + tw, ty + th * (gl / 4)); ctx.stroke();
    }
  }
  // Strategy strip: the stint plan, in the team's own colours. Three rows of
  // compound + laps, which is what the second board in a real bay shows.
  {
    const R = D_STRAT;
    ctx.fillStyle = "#07090c"; ctx.fillRect(R.x, R.y, R.w, R.h);
    ctx.fillStyle = css(c1); ctx.fillRect(R.x, R.y, R.w, 26);
    // Light-on-dark or dark-on-light by luminance. The older boards here pin a
    // fixed near-white, which disappears on a pale livery (Haas is white).
    const hi = c1[0] * 0.30 + c1[1] * 0.59 + c1[2] * 0.11 > 0.55;
    ctx.fillStyle = hi ? "#0a0b0d" : "#f4f5f7";
    ctx.font = "700 18px system-ui, sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText("RACE PLAN", R.x + 12, R.y + 13);
    ctx.textAlign = "right";
    ctx.fillText(String(team.short || team.name || "").toUpperCase(), R.x + R.w - 12, R.y + 13);
    const h = sig;
    const COMP = [["SOFT", "#d8443c"], ["MED", "#d8b23c"], ["HARD", "#d8d8d8"]];
    for (let r = 0; r < 3; r++) {
      const y = R.y + 44 + r * 28, c = COMP[(h + r * 2 + (r === 1 ? 1 : 0)) % 3];
      ctx.fillStyle = "#101720"; ctx.fillRect(R.x + 10, y - 11, R.w - 20, 22);
      ctx.fillStyle = c[1]; ctx.beginPath(); ctx.arc(R.x + 28, y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#c8d4de"; ctx.font = "600 15px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`STINT ${r + 1}   ${c[0]}`, R.x + 46, y);
      ctx.textAlign = "right"; ctx.fillStyle = css(c2);
      ctx.fillText(`${12 + ((h >> (r * 3)) & 7) * 3} LAPS`, R.x + R.w - 18, y);
    }
  }
  // SIGN — the team wordmark on its own, for the floor mark and the lit sign
  // over the door. Transparent field so it reads on whatever it is laid on.
  ctx.clearRect(D_SIGN.x, D_SIGN.y, D_SIGN.w, D_SIGN.h);
  ctx.fillStyle = "#e9ecef"; ctx.font = "700 30px system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(String(team.name || team.short || "").toUpperCase(),
    D_SIGN.x + D_SIGN.w / 2, D_SIGN.y + D_SIGN.h / 2, D_SIGN.w - 16);
  return { canvas: cv };
}
// ── information boards ─────────────────────────────────────────────────────
// `info` is what the player is actually deciding on. Null (no parts handle
// yet, or Parts absent) leaves these regions transparent, and the quads then
// paint nothing rather than showing a board full of zeroes.
//
// A SEPARATE PASS over the SAME canvas, because these four regions are the only
// part of the atlas a part pick changes. paintDress used to be one function
// keyed on everything, so fitting a brake duct repainted the crest lightbox,
// the wordmarks, the pit board, six telemetry screens and the strategy strip
// to arrive at the same pixels — and rebuild() threw the whole bay's geometry
// away with it. The boards repaint over their own opaque panels, so no clear
// is needed between passes.
function paintBoards(cv, team, liv, info) {
  if (!info) return;
  const ctx = cv.getContext("2d");
  const c1 = rgb(liv && liv.c1, [0.30, 0.32, 0.36]);
  const c2 = rgb(liv && (liv.accent || liv.stripe || liv.c2), [0.6, 0.62, 0.66]);
  const panel = (R, title) => {
    ctx.fillStyle = "#0a0c10"; ctx.fillRect(R.x, R.y, R.w, R.h);
    ctx.fillStyle = css(scale(c1, 0.75)); ctx.fillRect(R.x, R.y, R.w, 44);
    ctx.fillStyle = "#f2f3f5"; ctx.font = "700 27px system-ui, sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(title, R.x + 18, R.y + 23);
    ctx.textAlign = "center";
  };
  // STATS — the same four numbers the panel quotes, from the same curve
  // (Parts.displayStat), so the wall and the panel can never disagree.
  panel(D_STATS, "CAR PERFORMANCE");
  const keys = Parts.STAT_KEYS;
  for (let i = 0; i < keys.length; i++) {
    const st = info.stats[i], y = D_STATS.y + 74 + i * 46;
    ctx.textAlign = "left"; ctx.fillStyle = "#9aa4b2"; ctx.font = "700 21px system-ui, sans-serif";
    ctx.fillText(keys[i].label, D_STATS.x + 18, y);
    const bx = D_STATS.x + 168, bw = 250;
    ctx.fillStyle = "#191d24"; ctx.fillRect(bx, y - 11, bw, 22);
    ctx.fillStyle = css(c2);
    ctx.fillRect(bx, y - 11, Math.max(2, bw * Math.min(1, st.value / 120)), 22);
    ctx.textAlign = "right"; ctx.fillStyle = "#f2f3f5"; ctx.font = "700 24px system-ui, sans-serif";
    ctx.fillText(String(st.value), D_STATS.x + D_STATS.w - 66, y);
    // The delta against the bare chassis is the whole point of a parts screen.
    ctx.font = "700 18px system-ui, sans-serif";
    ctx.fillStyle = st.delta > 0 ? "#4ad07a" : st.delta < 0 ? "#e2645a" : "#6b7480";
    ctx.fillText(st.delta > 0 ? "+" + st.delta : String(st.delta), D_STATS.x + D_STATS.w - 14, y);
    ctx.textAlign = "center";
  }
  // BUDGET — spent against the cap, with a bar that empties as you spend.
  panel(D_BUDGET, "BUDGET");
  ctx.textAlign = "left"; ctx.fillStyle = "#f2f3f5"; ctx.font = "700 40px system-ui, sans-serif";
  ctx.fillText(`${info.left} cr`, D_BUDGET.x + 18, D_BUDGET.y + 84);
  ctx.fillStyle = "#8f98a6"; ctx.font = "700 20px system-ui, sans-serif";
  ctx.fillText(`OF ${info.budget} REMAINING`, D_BUDGET.x + 190, D_BUDGET.y + 88);
  const rw = D_BUDGET.w - 36;
  ctx.fillStyle = "#191d24"; ctx.fillRect(D_BUDGET.x + 18, D_BUDGET.y + 104, rw, 12);
  ctx.fillStyle = css(c2);
  ctx.fillRect(D_BUDGET.x + 18, D_BUDGET.y + 104, rw * Math.max(0, Math.min(1, info.left / info.budget)), 12);
  ctx.textAlign = "center";
  // DRIVER — the SELECTED seat, not simply the first one on the entry list.
  panel(D_DRIVER, "DRIVER");
  ctx.fillStyle = css(c2); ctx.font = "700 96px system-ui, sans-serif";
  ctx.fillText(info.driver.num == null ? "--" : String(info.driver.num),
    D_DRIVER.x + D_DRIVER.w / 2, D_DRIVER.y + 122);
  ctx.fillStyle = "#f2f3f5"; ctx.font = "700 30px system-ui, sans-serif";
  ctx.fillText(String(info.driver.code || ""), D_DRIVER.x + D_DRIVER.w / 2, D_DRIVER.y + 180);
  ctx.fillStyle = "#9aa4b2"; ctx.font = "600 19px system-ui, sans-serif";
  ctx.fillText(String(info.driver.name || ""), D_DRIVER.x + D_DRIVER.w / 2, D_DRIVER.y + 218, D_DRIVER.w - 20);
  // SPEC — every fitted component, two columns of six. The row that CHANGED
  // since the last paint carries the accent, so the wall answers "what did I
  // just fit" without a glance back at the panel; the marker fades with the
  // next pick because a board full of highlights marks nothing.
  panel(D_SPEC, "FITTED SPEC");
  for (let i = 0; i < info.spec.length && i < 12; i++) {
    const col = i < 6 ? 0 : 1, row = i % 6;
    const sx = D_SPEC.x + 16 + col * (D_SPEC.w / 2), sy = D_SPEC.y + 74 + row * 30;
    const changed = lastSpec && lastSpec[i] !== undefined && lastSpec[i] !== info.spec[i].label;
    ctx.textAlign = "left";
    if (changed) { ctx.fillStyle = css(c2); ctx.fillRect(sx - 8, sy - 11, 4, 22); }
    ctx.fillStyle = changed ? css(c2) : "#79828f"; ctx.font = "700 15px system-ui, sans-serif";
    ctx.fillText(info.spec[i].cat, sx, sy);
    ctx.fillStyle = "#e8eaee"; ctx.font = "600 17px system-ui, sans-serif";
    ctx.fillText(info.spec[i].label, sx + 92, sy, D_SPEC.w / 2 - 112);
    ctx.textAlign = "center";
  }
  lastSpec = info.spec.map((s) => s.label);
}
let lastSpec = null;

const { LIVE, paintLive, paintTrace } = GarageLive;
let liveTex = null, liveCanvas = null;
const liveMesh = {};
const LIVE_OPTS = { glow: 0.62 }, FLOOR_DECAL_OPTS = { glow: 0 };

// UV rect for an atlas region. v is flipped because createTexture uploads with
// FLIP_Y, exactly as carDecalData's uvOf does — but U is NOT pre-flipped here:
// that flip exists to un-mirror the car, which draws through MAT_REFLECT_X
// (det -1). These quads are world-space on the identity, so flipping U would
// mirror every logo in the bay.
function uvOf(r) {
  return { uL: r.x / DRESS, uR: (r.x + r.w) / DRESS, vT: 1 - r.y / DRESS, vB: 1 - (r.y + r.h) / DRESS };
}
// corners in [BL, BR, TR, TL] as seen from the front of the quad.
function dquad(out, c, n, region) {
  const u = uvOf(region), i = out.pos.length / 3;
  const uvs = [[u.uL, u.vB], [u.uR, u.vB], [u.uR, u.vT], [u.uL, u.vT]];
  for (let k = 0; k < 4; k++) {
    out.pos.push(c[k][0], c[k][1], c[k][2]);
    out.nrm.push(n[0], n[1], n[2]);
    out.uv.push(uvs[k][0], uvs[k][1]);
  }
  out.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
}
// Grouped by wall, exactly like the props and for a sharper reason: drawDecal
// calls setCull(false), so a decal is DOUBLE-SIDED and does NOT cull with the
// wall it is painted on. Without this split, standing outside the bay you read
// the near wall's wordmark through the culled-away wall, mirrored.
function buildDress() {
  const g = {};
  for (let i = 0; i < SIDES.length; i++) g[SIDES[i]] = { pos: [], nrm: [], uv: [], idx: [] };
  const zb = Z_BACK + 0.03, zd = Z_DOOR - 0.03, xw = HALF_W - 0.03;
  // Back wall: the crest lightbox, the wordmark under it, and the pit board.
  // Height is framing, not decoration, and the ceiling here is MEASURED, not
  // guessed. The FRONT preset puts the eye at (0, 2.08, 8.28) looking at
  // SP_CAR_CTR through a 36 deg vertical fov; solving NDC.y = 1 on the plane
  // z = Z_BACK gives y = 3.76 as the exact top of the frame. A crest topped at
  // 3.75 is therefore touching the edge — its border reads as cut off — which
  // is what three successive "lower it a bit" passes kept rediscovering.
  // 3.40 is the same mark with a visible margin above it, and a fully visible
  // crest reads BIGGER than a taller one whose frame is sliced.
  // Raised 1.20-3.40 -> 1.30-3.50 to open a gap for the lightbox sill. The
  // wordmark below tops out at 1.15 and the FRONT frame tops out at 3.76, so
  // this is the whole budget: 15 cm under the crest, 26 cm over it.
  dquad(g.back, [[-1.45, 1.30, zb], [1.45, 1.30, zb], [1.45, 3.50, zb], [-1.45, 3.50, zb]], [0, 0, 1], D_CREST);
  dquad(g.back, [[-2.6, 0.42, zb], [2.6, 0.42, zb], [2.6, 1.15, zb], [-2.6, 1.15, zb]], [0, 0, 1], D_WORD);
  // ON the pit-board panel (x 4.25..5.15, y 1.68..2.92, front face z -6.09).
  // The panel moved from x 3.3 to x 4.70 and this quad did not follow it, so the
  // graphic hung 0.29 m proud of the wall in open air AND covered the right
  // third of the driver board next to it.
  dquad(g.back, [[4.30, 1.74, -6.085], [5.10, 1.74, -6.085], [5.10, 2.86, -6.085], [4.30, 2.86, -6.085]], [0, 0, 1], D_BOARD);
  // The -X board, which carried no graphic at all until now. Inset inside the
  // 0.52 x 0.20 half-extent panel above, front face at z -6.09.
  dquad(g.back, [[-5.16, 2.26, -6.085], [-4.24, 2.26, -6.085], [-4.24, 2.58, -6.085], [-5.16, 2.58, -6.085]], [0, 0, 1], D_STRAT);
  // Side walls: the wordmark repeated. Corner order is built per side so the
  // text reads the right way round from inside each wall.
  // Side-wall wordmarks, in the y 3.10-3.60 band that both walls have free.
  // They used to sit at y 2.42-2.92, which put the -X one behind the monitor
  // bank (0.19 m proud) and made the +X one COPLANAR with the spec board. The
  // +X wall now carries the three data boards over z -5.40..-2.40, so its
  // wordmarks only take the two bays forward of that.
  const wordZ = [[-4.6, -2.4], [-1.1, 1.1], [2.4, 4.6]];
  for (let i = 0; i < wordZ.length; i++) {
    const z0 = wordZ[i][0], z1 = wordZ[i][1];
    // i 0 is the deep bay, which now carries a data board on EACH wall.
    if (i > 0) dquad(g.nx, [[-xw, 3.10, z1], [-xw, 3.10, z0], [-xw, 3.60, z0], [-xw, 3.60, z1]], [1, 0, 0], D_WORD);
    if (i > 0) dquad(g.px, [[xw, 3.10, z0], [xw, 3.10, z1], [xw, 3.60, z1], [xw, 3.60, z0]], [-1, 0, 0], D_WORD);
  }
  // The information boards. STATS, BUDGET and DRIVER go on the BACK wall
  // because that is the wall the default and FRONT framings look straight at,
  // and they sit in the SAME y 1.3-3.8 band as the crest for the same reason it
  // does: the preview's vertical half-FOV is 18 deg about an aim point at
  // y 0.45 and the back wall is ~14 m out, so a board above ~y 4 is already
  // cropped by the top of the frame. (Placed higher first, and duly cut off.)
  // The shelving and pit board that used to stand here moved for them.
  // SPEC goes on the +X wall, above the trolleys, which top out around y 1.4.
  // PERFORMANCE DATA ON THE SIDE WALL, IDENTITY ON THE BACK WALL. These two
  // boards used to flank the crest, which left the mark ~100 px tall on a
  // 1000 px canvas with a board hard against each side of it. Stacked above the
  // spec sheet on +X they read just as well and the back wall becomes the team's.
  // STATS goes on the -X wall, not stacked above SPEC on +X. Solving the FRONT
  // preset's frustum on the plane x = HALF_W puts NDC.y = 1 at about y 3.2
  // there, so a board at y 3.28..4.78 showed nothing but its bottom edge; and
  // the two walls are not symmetric in this framing either, because the docked
  // sheet shifts the visible centre to the LEFT, which pulls -X content toward
  // the middle of the frame and pushes +X content off its right edge. The SIDE
  // preset also looks straight at this wall (the eye is outside +X, which culls
  // it), so the live stats get the one dead-on reading in the whole set.
  dquad(g.nx, [[-xw, 1.60, -2.40], [-xw, 1.60, -5.40], [-xw, 3.10, -5.40], [-xw, 3.10, -2.40]], [1, 0, 0], D_STATS);
  // BUDGET and FITTED SPEC used to live on +X, which NO camera preset frames:
  // `side` puts the eye at x +11.1 and back-face culls +X entirely, `front`
  // projects that wall to NDC.x ~ +0.43 which is behind the docked setup
  // sheet, and `hero` is ~84 deg off axis. Two boards a player is meant to
  // read while spending money were reachable only by manually spinning the
  // turntable. BUDGET goes under STATS on -X (the wall `side` looks straight
  // at), FITTED SPEC onto the bare left half of the back wall, which is 41%
  // of the `front` frame and already carries the crest and driver boards.
  dquad(g.nx, [[-xw, 0.69, -2.40], [-xw, 0.69, -5.40], [-xw, 1.44, -5.40], [-xw, 1.44, -2.40]], [1, 0, 0], D_BUDGET);
  // Square, because D_DRIVER is a square atlas region and a stretched quad would
  // squash the number.
  dquad(g.back, [[1.70, 1.75, zb], [3.70, 1.75, zb], [3.70, 3.75, zb], [1.70, 3.75, zb]], [0, 0, 1], D_DRIVER);
  dquad(g.back, [[-4.10, 2.15, zb], [-1.70, 2.15, zb], [-1.70, 3.35, zb], [-4.10, 3.35, zb]], [0, 0, 1], D_SPEC);
  // FLOOR WORDMARK at the deep end — the TOP framing is a bare grey expanse and
  // it is the one view where every wall mark is edge-on. D_SIGN, not D_CREST:
  // the crest carries a dark team-colour FIELD, and a dark field on a dark
  // floor lit only by sun+ambient+glow (drawDecal never sees the lamps) is
  // invisible, which is exactly how it rendered. D_SIGN is bright letters on
  // transparent, so it reads as paint on concrete the way a real bay does.
  // y 0.004 clears the floor (0) and the expansion joints (0.002).
  dquad(g.mid, [[-2.30, 0.004, -4.15], [2.30, 0.004, -4.15], [2.30, 0.004, -5.95], [-2.30, 0.004, -5.95]],
    [0, 1, 0], D_SIGN);
  // A SECOND floor mark at the door end. The deep-end one reads in the FRONT
  // framing (NDC.y about +0.14, on the floor behind the car) but not in the TOP
  // one: there the camera's right axis is -Z, so negative z lands on the RIGHT
  // of the canvas, under the docked sheet. z +4.1..+5.9 maps to NDC.x about
  // -0.57 — the open floor to the left of the car, which is the one part of the
  // TOP framing that was still bare grey. Corner order keeps U along +X and V
  // along -Z exactly as above, so the winding stays +Y-facing and the letters
  // run the same way; naively translating the first quad forward flips both.
  dquad(g.mid, [[-2.30, 0.004, 5.90], [2.30, 0.004, 5.90], [2.30, 0.004, 4.10], [-2.30, 0.004, 4.10]],
    [0, 1, 0], D_SIGN);
  // Lit team sign over the garage door, above the shutter travel (slats top at
  // y 4.77) — the first thing the REAR and door-side framings see.
  // 5 mm in front of the lit fascia's face (z 6.21; the block runs 6.21-6.31,
  // and at z 6.30 this quad was INSIDE it, drawn to nothing), inside the guide
  // rails (x 2.70-2.88) and above the lintel soffit (y 4.78-4.82).
  dquad(g.door, [[2.66, 4.83, 6.205], [-2.66, 4.83, 6.205], [-2.66, 4.99, 6.205], [2.66, 4.99, 6.205]], [0, 0, -1], D_SIGN);
  // Engineer screens above the desk, and the notice board by the door.
  dquad(g.nx, [[-5.18, 1.10, 2.15], [-5.18, 1.10, -0.95], [-5.18, 2.65, -0.95], [-5.18, 2.65, 2.15]], [1, 0, 0], D_SCREEN);
  // Clear of the shelving (x -4.87..-2.51, up to y 2.06) and the shutter rail.
  dquad(g.door, [[4.20, 1.40, zd], [5.20, 1.40, zd], [5.20, 2.75, zd], [4.20, 2.75, zd]], [0, 0, -1], D_BOARD);
  // A wordmark ON THE SHUTTER, not on the wall behind it. The REAR preset puts
  // the eye behind the back wall (which culls), so the door wall is the whole
  // backdrop from there — but the shutter slats stand at z 6.25..6.35 and the
  // dress plane is z 6.37, so a quad on the wall is depth-tested away by the
  // slats and was never visible. z 6.24 puts it on the roller door's face,
  // which is where a real garage brands it anyway.
  // y 2.60..3.20, not 3.30..3.90: the REAR preset's eye is (0, 2.28, -7.95) and
  // the same frustum solve on the plane z = Z_DOOR tops the frame out at y 3.62,
  // so the taller band lost its upper third off the top of the canvas.
  dquad(g.door, [[2.3, 2.60, 6.24], [-2.3, 2.60, 6.24], [-2.3, 3.20, 6.24], [2.3, 3.20, 6.24]], [0, 0, -1], D_WORD);
  return g;
}
// The custom team's uploaded emblem arrives asynchronously. Bump a generation
// counter when it changes and put it in the cache key, so the wall repaints on
// the very next frame instead of holding the previous mark.
let logoGen = 0;
if (typeof LiveryTex !== "undefined" && LiveryTex.onMarkChange)
  LiveryTex.onMarkChange(() => { logoGen++; });
const DRESS_OPTS = { glow: 0.62 };

// ── caches ─────────────────────────────────────────────────────────────────
// Single-slot, keyed on team + EVERY livery colour the bay consumes, so a team
// chip click or a livery edit rebuilds and the old GL buffers are freed on the
// spot. One slot cannot leak more than one generation.
//
// The key used to carry liv.c1 ALONE (and this comment used to claim a "store
// revision" term that was never there). The correct colours reached rebuild()
// on every frame — resolveLivery returns a fresh object including the unsaved
// draft — and were thrown away by the key compare, so editing ACCENT, BODY
// STRIPE, DETAIL or TEAM LOGO left the whole bay on its old paint: shell,
// props, floor band and the dress atlas with the crest and boards. The car
// repainted (setup-ui.js livePreviewDraft busts the decal atlas and the
// preview mesh key) and the bay did not, which is exactly how it was reported.
// A slot that any future dressing reads MUST be added here too.
let floorMesh = null, cacheKey = "";
const dressMesh = {};
let dressTex = null, dressFail = 0;
// TWO keys, not one. Everything above is GEOMETRY and depends on the team and
// its colours; the dress atlas additionally carries boardKey(info), which
// changes on every part pick. One combined key made a brake-duct choice
// rebuild the shell, the LED strips, the floor, every prop AND repaint the
// full 1024² atlas — measured 12 ms here on top of the car's own rebuild, and
// the owner's "the turntable stops when I pick a part". Geometry now survives a
// part pick; only the four boards repaint and re-upload.
let geomKey = "", dressCanvas = null;
const propMesh = {};
// `mat` is a PER-VERTEX MATERIAL ID, and its absence is why this whole room was
// untextured. GLX wires the attribute only when `data.mat.length === vCount`
// (createMesh() in js/render/glx/glx.js); without it every vertex reads the generic default
// aMat = 0 = MAT.FLAT and applyMaterial early-outs on `mid <= 0`
// (applyMaterial() in js/render/glx/shaders/glsl-lit.js). So the bay was flat vertex colour while the
// car standing in it sampled the baked PBR arrays. One float per vertex buys
// concrete, asphalt and metal at ZERO extra triangles and ZERO extra draw
// calls. Every primitive below takes an optional trailing `mid` defaulting to
// 0, so the ~150 call sites that do not care are unchanged.
const acc = () => ({ pos: [], nrm: [], col: [], mat: [], idx: [] });
function rebuild(team, liv, info, ctx) {
  const drv = (team && team.drivers) || [];
  // Same idiom as getCockpitWheel's _cockpitWheelKey (js/car/car-mesh.js): fold
  // every colour the build consumes, rounded, into one string.
  const kc = (c) => (c ? rgb(c, [0, 0, 0]).map((v) => v.toFixed(3)).join(",") : "-");
  const livKey = `${kc(liv && liv.c1)}/${kc(liv && (liv.accent || liv.stripe || liv.c2))}`
                 + `/${kc(liv && liv.c2)}/${kc(liv && liv.logo)}`
                 + `/${kc(liv && liv.logo2)}/${kc(liv && liv.logo3)}`;
  const gKey = `${team && team.id}|${livKey}`
               + `|${logoGen}|${drv[0] && drv[0].num}-${drv[1] && drv[1].num}`
               + `|${ctxKey(ctx)}`;
  const key = `${gKey}|${boardKey(info)}`;
  if (key === cacheKey && shellMesh) return;
  if (gKey !== geomKey || !shellMesh) {
    if (shellMesh) _gfx.freeMesh(shellMesh);
    for (let i = 0; i < SIDES.length; i++)
      if (ledMesh[SIDES[i]]) { _gfx.freeMesh(ledMesh[SIDES[i]]); ledMesh[SIDES[i]] = null; }
    if (floorMesh) _gfx.freeMesh(floorMesh);
    for (let i = 0; i < SIDES.length; i++)
      if (propMesh[SIDES[i]]) { _gfx.freeMesh(propMesh[SIDES[i]]); propMesh[SIDES[i]] = null; }
    const shell = acc();
    buildShell(shell, liv);
    shellMesh = _gfx.createMesh(shell);
    const led = {};
    for (let i = 0; i < SIDES.length; i++) led[SIDES[i]] = acc();
    buildLed(led, liv);
    for (let i = 0; i < SIDES.length; i++)
      if (led[SIDES[i]].idx.length) ledMesh[SIDES[i]] = _gfx.createMesh(led[SIDES[i]]);
    const flr = acc();
    buildApron(flr); buildPitLane(flr, liv, !!(ctx && ctx.night)); buildBayFloor(flr, liv);
    // The clear colour beyond the apron rim follows the hour outside.
    const bd = ctx && ctx.night ? [0.020, 0.022, 0.030] : [0.048, 0.052, 0.064];
    BACKDROP[0] = bd[0]; BACKDROP[1] = bd[1]; BACKDROP[2] = bd[2];
    floorMesh = _gfx.createMesh(flr);
    const g = {};
    for (let i = 0; i < SIDES.length; i++) g[SIDES[i]] = acc();
    buildProps(g, liv);
    GarageEquipment.build(g, liv, ctx);
    for (let i = 0; i < SIDES.length; i++) propMesh[SIDES[i]] = _gfx.createMesh(g[SIDES[i]]);
    for (let i = 0; i < SIDES.length; i++)
      if (dressMesh[SIDES[i]]) { _gfx.freeMesh(dressMesh[SIDES[i]]); dressMesh[SIDES[i]] = null; }
    // A new team or paint: the whole atlas repaints, and the "what changed"
    // marker on the spec board starts over — every row differs from the last
    // team's, and a board of twelve highlights marks nothing.
    dressCanvas = null; lastSpec = null;
    geomKey = gKey;
    // The live atlas follows the geometry key (team, paint, ctx): repaint it
    // here, and build its quads once.
    if (_gfx.createTexture && _gfx.createTexMesh && typeof LiveryTex !== "undefined") {
      try {
        if (!liveCanvas) { liveCanvas = document.createElement("canvas"); liveCanvas.width = liveCanvas.height = LIVE; }
        paintLive(liveCanvas, team, liv, ctx);
        if (liveTex && _gfx.freeTexture) _gfx.freeTexture(liveTex);
        liveTex = _gfx.createTexture(liveCanvas);
        if (!liveMesh.mid) {
          const lg = GarageLive.build(FIXTURES);
          for (const k in lg) if (lg[k].idx.length) liveMesh[k] = _gfx.createTexMesh(lg[k]);
        }
      } catch (e) { liveTex = null; Log.warn("game", `GarageScene live atlas failed: ${e && e.message}`); }
    }
  }
  // Team dress. Three strikes then stop trying: an unbranded bay is far better
  // than a canvas that throws once a frame forever.
  if (dressTex && _gfx.freeTexture) _gfx.freeTexture(dressTex);
  dressTex = null;
  if (dressFail < 3 && _gfx.createTexture && _gfx.createTexMesh && typeof LiveryTex !== "undefined") {
    try {
      if (!dressCanvas) dressCanvas = paintDress(team, liv).canvas;
      paintBoards(dressCanvas, team, liv, info);
      dressTex = _gfx.createTexture(dressCanvas);
      if (!dressMesh.back) {
        const dg = buildDress();
        for (let i = 0; i < SIDES.length; i++)
          if (dg[SIDES[i]].idx.length) dressMesh[SIDES[i]] = _gfx.createTexMesh(dg[SIDES[i]]);
      }
    } catch (e) {
      dressFail++; dressTex = null; dressCanvas = null;
      Log.warn("game", `GarageScene dress failed: ${e && e.message}`);
    }
  }
  cacheKey = key;
}

// Squeegeed resin: matte enough to read as concrete, glossy enough that ten
// real spot lights streak across it. The sheen is emergent from the lamp
// energies above — it does not appear at the old rig's levels.
const FLOOR_OPTS = { roughness: 0.34, metalness: 0, specular: 0.46, clearcoat: 0 };
const SHELL_OPTS = { roughness: 0.86, metalness: 0.05, specular: 0.16, clearcoat: 0 };

const MAT_I = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
// What the ROOM shows of the game beyond the car: the selected circuit, the
// weather and time of day the next race will run, and the career's tally.
// game.js builds this once per frame; every field is optional, so the bay
// draws without a career and without a track selection.
function ctxKey(ctx) {
  if (!ctx) return "-";
  return `${ctx.track ? ctx.track.id : "-"}|${ctx.weather || "-"}|${ctx.tod || "-"}`
         + `|${ctx.wins | 0}|${ctx.night ? 1 : 0}`;
}
let lastTrace = -1e9;
function draw(team, liv, eye, getParts, driverIdx, ctx, carMesh) {
  if (!_gfx) return;
  rebuild(team, liv, boardInfo(team, getParts, driverIdx), ctx);
  ensureDynamic();
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  _gfx.draw(floorMesh, MAT_I, FLOOR_OPTS);
  // THE FLOOR REFLECTION: the car again, mirrored in y = 0, drawn faint and
  // without a depth test straight after the floor. It writes no depth, so the
  // shell, the props and the real car all paint over it wherever they pass
  // against the floor's depth — which is exactly the clip a planar reflection
  // needs, with no stencil and no second floor pass. MAT_MIRROR reflects X as
  // the preview does (MAT_REFLECT_X) and Y for the floor; det +1, no cull flip.
  if (carMesh) _gfx.draw(carMesh, MAT_MIRROR, MIRROR_OPTS);
  _gfx.draw(shellMesh, MAT_I, SHELL_OPTS);
  // Each wall's furniture AND its lighting, only while the eye is inside that
  // wall — the same decision back-face culling makes for the wall itself. A
  // camera at SP_DIST_MAX (15 m) is outside the bay on at least one axis nearly
  // always, so this test fires constantly and is what keeps the cutaway clean.
  const ex = eye ? eye[0] : 0, ez = eye ? eye[2] : 0;
  const inside = { nx: ex > -HALF_W, px: ex < HALF_W, back: ez > Z_BACK, door: ez < Z_DOOR, mid: true };
  for (let i = 0; i < SIDES.length; i++) {
    if (!inside[SIDES[i]]) continue;
    _gfx.draw(propMesh[SIDES[i]], MAT_I, SHELL_OPTS);
    if (ledMesh[SIDES[i]]) _gfx.draw(ledMesh[SIDES[i]], MAT_I, LED_OPTS);
  }
  // Dress LAST of the environment: drawDecal depth-tests but does not depth
  // write, so every opaque surface it sits on has to be down first.
  if (dressTex)
    for (let i = 0; i < SIDES.length; i++)
      if (inside[SIDES[i]] && dressMesh[SIDES[i]])
        _gfx.drawDecal(dressMesh[SIDES[i]], MAT_I, dressTex, DRESS_OPTS);
  // The moving props. Fan on the back wall (its housing is in propMesh.back);
  // the lamp wherever the preset put it; the pit-lane pass every half minute.
  if (inside.back && fanMesh) _gfx.draw(fanMesh, mk(_mFan, FAN[0], FAN[1], Z_BACK + 0.17, 0, now * 0.0065), SHELL_OPTS);
  if (lampMesh) {
    mk(_mLamp, lampAim[0], 0, lampAim[1], lampAim[2], 0);
    _gfx.draw(lampMesh, _mLamp, SHELL_OPTS);
    if (lampAim[3]) _gfx.draw(lampFace, _mLamp, LED_OPTS);
  }
  {
    const cyc = (now / 1000) % 34;
    if (cyc < 6.5 && passMesh)
      _gfx.draw(passMesh, mk(_mPass, -24 + 48 * (cyc / 6.5), -0.04, 10.3, Math.PI / 2, 0), SHELL_OPTS);
  }
  // The engineers' traces tick over every 1.5 s: repaint one region of the
  // live atlas and re-upload it (1 MB, a quarter of the dress).
  if (liveTex && liveCanvas && now - lastTrace > 1500) {
    lastTrace = now;
    try {
      paintTrace(liveCanvas, liv, now);
      if (_gfx.freeTexture) _gfx.freeTexture(liveTex);
      liveTex = _gfx.createTexture(liveCanvas);
    } catch (e) { lastTrace = 1e12; }
  }
  if (liveTex) {
    if (liveMesh.floor) _gfx.drawDecal(liveMesh.floor, MAT_I, liveTex, FLOOR_DECAL_OPTS);
    for (const k of ["mid", "nx", "px", "door"])
      if (inside[k] && liveMesh[k]) _gfx.drawDecal(liveMesh[k], MAT_I, liveTex, LIVE_OPTS);
  }
}

// ── preview framing ────────────────────────────────────────────────────────
// The turntable orbits and AIMS at one point, so THAT POINT is pinned on screen
// — but the car's SILHOUETTE is not. The car is 5.95 m long orbited at 8.5 m, so
// whichever end swings toward the camera is magnified by perspective and the
// silhouette centre swings with it: measured 0.158 NDC of drift, ~79 px on a
// 1000 px canvas, which is exactly what reads as "the rotation is not centred on
// the car". No choice of pivot fixes it — the drift is perspective, not a wrong
// aim point (the aim sat within 4 cm of the footprint's enclosing-circle centre
// and still drifted). So measure the silhouette each frame and shift the lens.
//
// framingHull is the cheap stand-in for that silhouette: the convex hull of the
// car's XZ footprint, duplicated at its Y extremes. A projected x-extreme is
// always attained on the 3D hull, and this ~32-point stack tracked the true
// centre to within 0.005 NDC (~2 px) in a sweep where the 8 bbox corners were
// out by 0.027 (~13 px). x is negated at build time because the preview draws
// the car through MAT_REFLECT_X.
//
// Sorting all ~19k points was the cost (14 ms measured, paid on every part
// pick). The Akl–Toussaint pass first finds the four axis-extreme points and
// discards everything strictly inside their quadrilateral — a point inside
// that quad is inside the hull, so the answer is unchanged and the sort runs
// over the few hundred that remain.
function framingHull(data) {
  const p = data && data.pos;
  if (!p || !p.length) return null;
  const n = p.length / 3;
  let ylo = 1e9, yhi = -1e9;
  // Eight support directions, not four: a car is a rectangle with a wheel at
  // each corner, and the axis-extreme QUAD is a diamond that leaves every
  // corner outside it (10.6k of 18.8k survived). The octagon keeps 3.6k.
  const M = 8, best = new Float64Array(M).fill(-1e9), bi = new Int32Array(M);
  const dx = new Float64Array(M), dz = new Float64Array(M);
  for (let k = 0; k < M; k++) { const a = Math.PI + 2 * Math.PI * k / M; dx[k] = Math.cos(a); dz[k] = Math.sin(a); }
  for (let i = 0; i < n; i++) {
    const x = -p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
    if (y < ylo) ylo = y;
    if (y > yhi) yhi = y;
    for (let k = 0; k < M; k++) {
      const v = x * dx[k] + z * dz[k];
      if (v > best[k]) { best[k] = v; bi[k] = i; }
    }
  }
  const cross2 = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  // The octagon, walked counter-clockwise in the (x, z) plane. Scalar edge
  // tests, no per-point allocation — arrays are minted only for the survivors.
  // A degenerate (repeated) vertex makes its edge test 0, which keeps every
  // point: slower, never wrong.
  const qx = new Float64Array(M), qz = new Float64Array(M);
  for (let k = 0; k < M; k++) { qx[k] = -p[bi[k] * 3]; qz[k] = p[bi[k] * 3 + 2]; }
  const pts = [];
  for (let i = 0; i < n; i++) {
    const x = -p[i * 3], z = p[i * 3 + 2];
    let inside = true;
    for (let k = 0; k < M && inside; k++) {
      const j = (k + 1) % M;
      if ((qx[j] - qx[k]) * (z - qz[k]) - (qz[j] - qz[k]) * (x - qx[k]) <= 0) inside = false;
    }
    if (!inside) pts.push([x, z]);
  }
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const half = (arr) => {
    const h = [];
    for (let i = 0; i < arr.length; i++) {
      const q = arr[i];
      while (h.length >= 2 && cross2(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop();
      h.push(q);
    }
    h.pop();
    return h;
  };
  const rev = pts.slice().reverse();
  const ring = half(pts).concat(half(rev));
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    out.push(ring[i][0], ylo, ring[i][1]);
    out.push(ring[i][0], yhi, ring[i][1]);
  }
  return out;
}
// Re-centre the silhouette in the visible region by nudging the lens shift.
// proj[8] adds a CONSTANT offset to NDC.x (the clip-space term is proj[8]*z_view
// and w is -z_view, so the shift is exactly -proj[8]) — which is why one pass is
// exact rather than iterative, and why the extents' relative spacing is
// untouched. Gated on `on` (the auto-turntable) for the same reason the fit
// distance is: once a player picks a preset or pans, the framing is theirs.
function recentre(proj, view, vp, panelFrac, on, hull) {
  if (!on || !hull) return;
  let lo = 1e9, hi = -1e9;
  for (let i = 0; i < hull.length; i += 3) {
    const x = hull[i], y = hull[i + 1], z = hull[i + 2];
    const w = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
    if (w <= 0.001) continue;               // behind the eye: no screen position
    const nx = (vp[0] * x + vp[4] * y + vp[8] * z + vp[12]) / w;
    if (nx < lo) lo = nx;
    if (nx > hi) hi = nx;
  }
  if (lo > hi) return;
  proj[8] += (lo + hi) / 2 + panelFrac;     // target is -panelFrac, the visible centre
  M4.mulTo(vp, proj, view);
}

// ── the turntable's car meshes ─────────────────────────────────────────────
// Keyed on team + resolved parts + livery id (js/game.js getSetupPreviewMesh
// builds the key). A garage session is A/B comparison — fit the duct, look,
// fit the other one, look again — and a single-slot cache paid Car3D.build
// (~16 ms here, several times that on a phone) for every return to an option
// already seen. Six slots, least-recently-used out; the hull is kept beside
// its mesh AND in its own map, because a colour-only repaint drops the meshes
// (the paint is baked into the vertex colours) while the silhouette it was
// computed from has not moved.
const PREVIEW_SLOTS = 6;
const previewMeshes = new Map(), previewHulls = new Map();
function previewMesh(key, hullKey, build) {
  let ent = previewMeshes.get(key);
  if (ent) { previewMeshes.delete(key); previewMeshes.set(key, ent); return ent; }
  const data = build();
  let hull = previewHulls.get(hullKey);
  if (!hull) { hull = framingHull(data); previewHulls.set(hullKey, hull); }
  ent = { mesh: _gfx.createMesh(data), hull, hullKey };
  previewMeshes.set(key, ent);
  while (previewMeshes.size > PREVIEW_SLOTS) {
    const old = previewMeshes.keys().next().value;
    const victim = previewMeshes.get(old);
    _gfx.freeMesh(victim.mesh);
    previewMeshes.delete(old);
    if (victim.hullKey) {
      let used = false;
      for (const e of previewMeshes.values()) {
        if (e.hullKey === victim.hullKey) { used = true; break; }
      }
      if (!used) previewHulls.delete(victim.hullKey);
    }
  }
  return ent;
}
// Every cached car is on the old paint after a livery edit — drop them all.
// The hulls stay: presence-keyed, and a hue never moves a vertex
// (tests/unit/setup-preview-hull.test.mjs).
function dropPreviewMeshes() {
  for (const ent of previewMeshes.values()) _gfx.freeMesh(ent.mesh);
  previewMeshes.clear();
}

function debug() {
  return { bay: [HALF_W * 2, Z_DOOR - Z_BACK, CEIL_Y], lights: lights(null).length / 15, key: cacheKey,
           geomKey, previewMeshes: previewMeshes.size, previewHulls: previewHulls.size };
}

  return { init, BACKDROP, SKYLIGHT, AMB_SKY, AMB_GROUND, lights, live, glareStr, draw, framingHull, recentre,
           previewMesh, dropPreviewMeshes, pulse, spot, debug };
})();
if (typeof window !== "undefined") window.GarageScene = GarageScene;
