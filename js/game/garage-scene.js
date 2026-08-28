/* Apex 26 — GarageScene: the room the setup preview happens in. Bay shell, roof truss, LED fixtures, pit equipment, the floor and the light rig — everything in the garage that is not the car. */
const GarageScene = (function () {
  "use strict";

let _gfx = null;            // renderer handle, set once by init()
function init(gfx) { Log.info("game", "GarageScene.init"); _gfx = gfx; }

// The frame clear colour (gfx reads fogColor as the clear) — the "outside" the
// bay is silhouetted against, and what the apron disc's rim fades into.
const BACKDROP = [0.035, 0.038, 0.046];

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

// Interior, metres. The car spans z -2.69..3.18 and x +/-0.95; its nose is +Z,
// so +Z is the pit-lane end and the deep end of the bay is behind it.
const HALF_W = 5.4, Z_BACK = -6.4, Z_DOOR = 6.4, CEIL_Y = 5.0;

const PANEL  = [0.150, 0.156, 0.170];   // upper wall panels
const STEEL  = [0.230, 0.235, 0.250];
const DARK   = [0.055, 0.058, 0.066];

// ── mesh helpers ───────────────────────────────────────────────────────────
// A flat rectangle spanned by uVec/vVec from origin, subdivided nu x nv and
// shaded per-vertex by colAt(u01, v01). Winding is derived from the requested
// normal rather than assumed, which is what lets the same helper build a wall
// seen from INSIDE and a prop face seen from outside.
function panelGrid(out, origin, uVec, vVec, nu, nv, nrm, colAt) {
  const base = out.pos.length / 3;
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv, c = colAt(u, v);
      out.pos.push(origin[0] + uVec[0] * u + vVec[0] * v,
                   origin[1] + uVec[1] * u + vVec[1] * v,
                   origin[2] + uVec[2] * u + vVec[2] * v);
      out.nrm.push(nrm[0], nrm[1], nrm[2]);
      out.col.push(c[0], c[1], c[2]);
    }
  }
  const cr = [uVec[1] * vVec[2] - uVec[2] * vVec[1],
              uVec[2] * vVec[0] - uVec[0] * vVec[2],
              uVec[0] * vVec[1] - uVec[1] * vVec[0]];
  // (a,d,c)/(a,b,d) is the order that is CCW about +cr, where cr = uVec x vVec:
  // in (u,v) the quad is a(0,0) b(1,0) c(0,1) d(1,1), and a->d->c turns the same
  // way as u->v. So when cr already points along the wanted normal, THAT is the
  // order to emit; the other one faces the wall the wrong way and a room built
  // from it is a solid box that hides its own interior.
  const along = cr[0] * nrm[0] + cr[1] * nrm[1] + cr[2] * nrm[2] > 0;
  const row = nu + 1;
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = base + j * row + i, b = a + 1, c = a + row, d = c + 1;
      if (along) out.idx.push(a, d, c, a, b, d);
      else out.idx.push(a, c, d, a, d, b);
    }
  }
}

// Solid axis-aligned block, outward-wound, one flat colour. Props are SOLIDS,
// never planes: a camera that wanders inside one then sees only back faces and
// the prop silently vanishes instead of smearing across the frame.
const BOX_F = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]];
function block(out, cx, cy, cz, hx, hy, hz, col) {
  const c = [cx, cy, cz], h = [hx, hy, hz];
  for (let f = 0; f < 6; f++) {
    const n = BOX_F[f];
    const i0 = n[0] ? 1 : 0, i1 = n[2] ? 1 : 2;   // the two in-plane axes
    const base = out.pos.length / 3;
    for (let s = 0; s < 4; s++) {
      const p = [c[0] + n[0] * h[0], c[1] + n[1] * h[1], c[2] + n[2] * h[2]];
      p[i0] += ((s === 1 || s === 2) ? 1 : -1) * h[i0];
      p[i1] += (s >= 2 ? 1 : -1) * h[i1];
      out.pos.push(p[0], p[1], p[2]);
      out.nrm.push(n[0], n[1], n[2]);
      out.col.push(col[0], col[1], col[2]);
    }
    const e = [0, 0, 0]; e[i0] = 1;
    const g = [0, 0, 0]; g[i1] = 1;
    const cr = [e[1] * g[2] - e[2] * g[1], e[2] * g[0] - e[0] * g[2], e[0] * g[1] - e[1] * g[0]];
    if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] > 0)
      out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else out.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
}

function cyl(out, cx, cy, cz, rad, h, col, seg) {
  seg = seg || 10;
  const base = out.pos.length / 3;
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    for (let k = 0; k < 2; k++) {
      out.pos.push(cx + ca * rad, cy + k * h, cz + sa * rad);
      out.nrm.push(ca, 0, sa); out.col.push(col[0], col[1], col[2]);
    }
  }
  for (let i = 0; i < seg; i++) {
    const a = base + i * 2, b = base + ((i + 1) % seg) * 2;
    out.idx.push(a, b, b + 1, a, b + 1, a + 1);
  }
  const top = out.pos.length / 3;
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    out.pos.push(cx + Math.cos(a) * rad, cy + h, cz + Math.sin(a) * rad);
    out.nrm.push(0, 1, 0); out.col.push(col[0], col[1], col[2]);
  }
  for (let i = 1; i < seg - 1; i++) out.idx.push(top, top + i, top + i + 1);
}

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const scale = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const rgb = (c, dflt) => (c && c.length === 3 ? c : dflt);

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
  // Wall colour by height: team dado to 1.5 m, an accent band, grey panel above.
  const wallAt = (y01, hgt) => {
    const y = y01 * hgt;
    if (y < 1.50) return dado;
    if (y < 1.62) return stripe;
    return PANEL;
  };
  // Battens are BAKED INTO THE WALL's vertex colour rather than modelled as
  // solid posts. A solid post is a prop, and props do not cull with the shell:
  // stood outside the bay you would see a row of dark bars hanging in front of
  // the room whose wall had already culled away. Shading them into the wall
  // means they are the wall, and they come and go exactly when it does.
  const seamed = (col, u, n) => (Math.abs((u * n) % 1 - 0.5) > 0.42 ? scale(col, 0.62) : col);
  // walls: [origin, uVec, vVec, inward normal, u-divisions]
  const W = HALF_W;
  const walls = [
    [[-W, 0, Z_BACK], [W * 2, 0, 0], [0, CEIL_Y, 0], [0, 0, 1], 8],
    [[-W, 0, Z_DOOR], [W * 2, 0, 0], [0, CEIL_Y, 0], [0, 0, -1], 8],
    [[-W, 0, Z_BACK], [0, 0, Z_DOOR - Z_BACK], [0, CEIL_Y, 0], [1, 0, 0], 9],
    [[W, 0, Z_BACK], [0, 0, Z_DOOR - Z_BACK], [0, CEIL_Y, 0], [-1, 0, 0], 9],
  ];
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    panelGrid(out, w[0], w[1], w[2], w[4], 6, w[3],
      (u, v) => seamed(wallAt(v, CEIL_Y), u, w[4]));
  }
  panelGrid(out, [-W, CEIL_Y, Z_BACK], [W * 2, 0, 0], [0, 0, Z_DOOR - Z_BACK], 4, 4,
    [0, -1, 0], () => DARK);
  // Roof truss. It lives in the shell because the ceiling culls from above and
  // looking down THROUGH the truss into the bay is the view we want up there.
  for (let s = -1; s <= 1; s += 2)
    block(out, s * 2.6, CEIL_Y - 0.42, 0, 0.06, 0.06, (Z_DOOR - Z_BACK) / 2, STEEL);
  for (let i = 0; i <= 4; i++)
    block(out, 0, CEIL_Y - 0.42, Z_BACK + (Z_DOOR - Z_BACK) * (i / 4), 2.7, 0.05, 0.06, STEEL);
}

// ── props ──────────────────────────────────────────────────────────────────
// Grouped BY WALL, and each group is drawn only while the eye is on the inside
// of its wall. The shell gets this for free from back-face culling; a solid
// prop does not, so without the grouping a tyre stack would hang in mid-air in
// front of a wall that had already culled away. The test is one sign compare.
//
// Everything at FLOOR level sits outboard of x +/-3.6: SP_FIT_HALF_W (3.35) is
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
  stack(g.nx, -4.55, -5.4, 0); stack(g.nx, -4.55, -3.1, 2);
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
  // Door wall: the roller shutter, parked half open.
  for (let i = 0; i < 11; i++)
    block(g.door, 0, 2.05 + i * 0.26, Z_DOOR - 0.10, HALF_W * 0.72, 0.12, (i % 2) ? 0.035 : 0.05, scale(STEEL, 0.75));
  block(g.door, 0, 1.98, Z_DOOR - 0.10, HALF_W * 0.74, 0.07, 0.07, scale(STEEL, 1.1));
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
    block(g.px, 5.16, 1.34, z, 0.07, 0.07, 0.10, [0.85, 0.62, 0.10]);
    cyl(g.px, 5.16, 0.98, z, 0.045, 0.34, scale(STEEL, 0.7), 6);
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
    block(g.door, -3.5, y, 6.15, 1.25, 0.025, 0.22, STEEL);
    for (let bx = 0; bx < 3; bx++)
      block(g.door, -4.55 + bx * 0.86, y + 0.17, 6.15, 0.32, 0.15, 0.17,
        scale(bx % 2 ? c1 : STEEL, bx % 2 ? 0.5 : 0.75));
  }
  block(g.door, -3.5, 0.42, 6.05, 1.30, 0.04, 0.32, scale(STEEL, 0.85));
  for (let lg = -1; lg <= 1; lg += 2) cyl(g.door, -3.5 + lg * 1.15, 0, 6.05, 0.035, 0.42, DARK, 6);
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
    // A continuous lit strip at the dado line, the length of the bay. Emissive
    // above 1.0 or the shader's glow gate never fires and it reads as plastic.
    block(w, s * 5.33, 1.56, 0, 0.05, 0.045, 6.30, scale(c1, 1.35));
  }
  // Lit fascia over the door, behind the D_SIGN wordmark.
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
  _rigKey = key;
  return _rig;
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
function buildApron(out) {
  const RINGS = 7, SEG = 40, R = 18, Y = -0.04;
  const HOT = [0.105, 0.107, 0.115];
  const push = (x, z, t) => {
    const k = smooth(t);
    out.pos.push(x, Y, z); out.nrm.push(0, 1, 0);
    out.col.push(HOT[0] + (BACKDROP[0] - HOT[0]) * k,
                 HOT[1] + (BACKDROP[1] - HOT[1]) * k,
                 HOT[2] + (BACKDROP[2] - HOT[2]) * k);
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
// One bay-floor rectangle at y = 0. The markings are REAL GEOMETRY in a gapless
// tiling, not decals: overlapping coplanar quads z-fight at grazing elevation,
// and a decal would miss the lamp pools entirely (the decal shader sees sun and
// ambient only, never the point lights).
function tile(out, x0, x1, z0, z1, col) {
  const base = out.pos.length / 3;
  const p = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  for (let k = 0; k < 4; k++) {
    out.pos.push(p[k][0], 0, p[k][1]); out.nrm.push(0, 1, 0);
    out.col.push(col[0], col[1], col[2]);
  }
  out.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
}
function buildBayFloor(out, liv) {
  const SLAB = [0.088, 0.090, 0.098], IN = [0.115, 0.118, 0.126];
  const PAINT = [0.66, 0.67, 0.70], WALK = [0.70, 0.60, 0.12];
  const band = scale(rgb(liv && liv.c1, [0.3, 0.32, 0.36]), 0.7);
  const L = -HALF_W, R = HALF_W, B = Z_BACK, F = Z_DOOR, W = 0.11;
  tile(out, L, R, B, B + 0.8, band);                       // team band, deep end
  tile(out, L, R, B + 0.8, BOX_ZB - W, SLAB);
  tile(out, L, R, BOX_ZB - W, BOX_ZB, PAINT);              // pit box, back edge
  tile(out, L, -BOX_HW - W, BOX_ZB, BOX_ZF, SLAB);
  tile(out, -BOX_HW - W, -BOX_HW, BOX_ZB, BOX_ZF, PAINT);  // pit box, left edge
  tile(out, -BOX_HW, BOX_HW, BOX_ZB, BOX_ZF, IN);          // the box itself
  tile(out, BOX_HW, BOX_HW + W, BOX_ZB, BOX_ZF, PAINT);    // right edge
  tile(out, BOX_HW + W, R, BOX_ZB, BOX_ZF, SLAB);
  tile(out, L, R, BOX_ZF, BOX_ZF + W, PAINT);              // front edge
  tile(out, L, R, BOX_ZF + W, F, SLAB);
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
    out.idx.push(b2, b2 + 2, b2 + 1, b2, b2 + 3, b2 + 2);
  }
}

// ── team dress ─────────────────────────────────────────────────────────────
// One canvas atlas, one texture, one texMesh, one drawDecal: the same shape as
// the car's own decal path (js/game/carmesh.js carDecalData), which is what
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
    return { stats, spec, driver: drv, budget: Parts.BUDGET,
             left: Math.max(0, Parts.BUDGET - (r.cost || 0)) };
  } catch (e) {
    Log.warn("game", "GarageScene boardInfo failed: " + (e && e.message));
    return null;
  }
}
// A signature of everything the boards render, for the dress cache key. Without
// the parts and the seat in here the numbers freeze the instant you fit a part
// — the texture would never be repainted.
function boardKey(info) {
  if (!info) return "-";
  let k = info.left + "|" + (info.driver.num == null ? "-" : info.driver.num);
  for (let i = 0; i < info.stats.length; i++) k += "|" + info.stats[i].value;
  for (let i = 0; i < info.spec.length; i++) k += "|" + info.spec[i].label;
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
const css = (c) => "rgb(" + Math.round(Math.min(1, Math.max(0, c[0])) * 255) + "," +
  Math.round(Math.min(1, Math.max(0, c[1])) * 255) + "," +
  Math.round(Math.min(1, Math.max(0, c[2])) * 255) + ")";

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
  // Crest lightbox. The FIELD is chosen for contrast against the mark, and a
  // halo is added ONLY when the mark still lacks separation — the same rule
  // buildAtlas applies on the car. The first version passed the team's own c1
  // as the halo unconditionally, which put a same-hue glow behind a mark
  // sitting on a c1-derived field and softened it instead of separating it.
  const img = LiveryTex.LOGOS && LiveryTex.LOGOS[team.id];
  // The mark's own colour, whichever path draws it: the uploaded PNG's average
  // for the custom team, the resolved vector base for the eleven shipped ones.
  // Keying this on img._avg ALONE is what made the flip below dead code the
  // moment the roster stopped shipping logo PNGs — avg would be null for every
  // team, the ternary would always take `tinted`, and every crest would land on
  // a dark field whether or not that is the readable choice.
  const avg = (img && img._avg) ||
    (LiveryTex.markBase ? LiveryTex.markBase(team.id, liv) : null);
  const tinted = scale(c1, 0.30);
  // A dark team field reads best, unless the mark itself is dark against it.
  const field = (avg && LiveryTex.contrast && LiveryTex.contrast(avg, tinted) < 2.2)
    ? (LiveryTex.inkOn ? LiveryTex.inkOn([avg]) : [0.93, 0.94, 0.96]) : tinted;
  ctx.fillStyle = css(field); ctx.fillRect(D_CREST.x, D_CREST.y, D_CREST.w, D_CREST.h);
  ctx.strokeStyle = css(c2); ctx.lineWidth = 9;
  ctx.strokeRect(D_CREST.x + 12, D_CREST.y + 12, D_CREST.w - 24, D_CREST.h - 24);
  const inner = { x: D_CREST.x + 40, y: D_CREST.y + 40, w: D_CREST.w - 80, h: D_CREST.h - 80 };
  if (img && LiveryTex.drawLogoImage) {
    const halo = (img._avg && LiveryTex.contrast && LiveryTex.contrast(img._avg, field) < 2.6 && LiveryTex.inkOn)
      ? LiveryTex.inkOn([img._avg]) : null;
    LiveryTex.drawLogoImage(ctx, img, inner, null, halo);
  } else {
    LiveryTex.drawCrest(ctx, team.id, inner, { liv, field, bare: false });
  }
  // Team wordmark strip.
  ctx.fillStyle = css(scale(c1, 0.55)); ctx.fillRect(D_WORD.x, D_WORD.y, D_WORD.w, D_WORD.h);
  ctx.fillStyle = css(c2); ctx.fillRect(D_WORD.x, D_WORD.y + D_WORD.h - 9, D_WORD.w, 9);
  ctx.fillStyle = "#f2f3f5";
  ctx.font = "700 62px system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(String(team.name || team.short || "").toUpperCase(),
    D_WORD.x + D_WORD.w / 2, D_WORD.y + D_WORD.h / 2 - 4, D_WORD.w - 30);
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
    ctx.strokeStyle = t % 2 ? "#3fd8c8" : "#e2a33c"; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 0; k <= 22; k++) {
      const px = tx + 8 + (tw - 16) * (k / 22);
      const py = ty + th * 0.55 - Math.sin(k * 0.9 + t) * th * 0.24 - (k % 5) * 1.6;
      if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(120,150,175,0.22)"; ctx.lineWidth = 1;
    for (let gl = 1; gl < 4; gl++) {
      ctx.beginPath(); ctx.moveTo(tx + 6, ty + th * (gl / 4)); ctx.lineTo(tx + tw, ty + th * (gl / 4)); ctx.stroke();
    }
  }
  // ── information boards ───────────────────────────────────────────────────
  // `info` is what the player is actually deciding on. Null (no parts handle
  // yet, or Parts absent) leaves these regions transparent, and the quads then
  // paint nothing rather than showing a board full of zeroes.
  const panel = (R, title) => {
    ctx.fillStyle = "#0a0c10"; ctx.fillRect(R.x, R.y, R.w, R.h);
    ctx.fillStyle = css(scale(c1, 0.75)); ctx.fillRect(R.x, R.y, R.w, 44);
    ctx.fillStyle = "#f2f3f5"; ctx.font = "700 27px system-ui, sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(title, R.x + 18, R.y + 23);
    ctx.textAlign = "center";
  };
  if (info) {
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
    ctx.fillText(info.left + " cr", D_BUDGET.x + 18, D_BUDGET.y + 84);
    ctx.fillStyle = "#8f98a6"; ctx.font = "700 20px system-ui, sans-serif";
    ctx.fillText("OF " + info.budget + " REMAINING", D_BUDGET.x + 190, D_BUDGET.y + 88);
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
    // SIGN — the team wordmark on its own, for the floor mark and the lit sign
    // over the door. Transparent field so it reads on whatever it is laid on.
    ctx.clearRect(D_SIGN.x, D_SIGN.y, D_SIGN.w, D_SIGN.h);
    ctx.fillStyle = "#e9ecef"; ctx.font = "700 30px system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(team.name || team.short || "").toUpperCase(),
      D_SIGN.x + D_SIGN.w / 2, D_SIGN.y + D_SIGN.h / 2, D_SIGN.w - 16);
    // SPEC — every fitted component, two columns of six.
    panel(D_SPEC, "FITTED SPEC");
    for (let i = 0; i < info.spec.length && i < 12; i++) {
      const col = i < 6 ? 0 : 1, row = i % 6;
      const sx = D_SPEC.x + 16 + col * (D_SPEC.w / 2), sy = D_SPEC.y + 74 + row * 30;
      ctx.textAlign = "left";
      ctx.fillStyle = "#79828f"; ctx.font = "700 15px system-ui, sans-serif";
      ctx.fillText(info.spec[i].cat, sx, sy);
      ctx.fillStyle = "#e8eaee"; ctx.font = "600 17px system-ui, sans-serif";
      ctx.fillText(info.spec[i].label, sx + 92, sy, D_SPEC.w / 2 - 112);
      ctx.textAlign = "center";
    }
  }
  return { canvas: cv };
}

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
  dquad(g.back, [[-1.45, 1.20, zb], [1.45, 1.20, zb], [1.45, 3.40, zb], [-1.45, 3.40, zb]], [0, 0, 1], D_CREST);
  dquad(g.back, [[-2.6, 0.42, zb], [2.6, 0.42, zb], [2.6, 1.15, zb], [-2.6, 1.15, zb]], [0, 0, 1], D_WORD);
  // ON the pit-board panel (x 4.25..5.15, y 1.68..2.92, front face z -6.09).
  // The panel moved from x 3.3 to x 4.70 and this quad did not follow it, so the
  // graphic hung 0.29 m proud of the wall in open air AND covered the right
  // third of the driver board next to it.
  dquad(g.back, [[4.30, 1.74, -6.085], [5.10, 1.74, -6.085], [5.10, 2.86, -6.085], [4.30, 2.86, -6.085]], [0, 0, 1], D_BOARD);
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
  dquad(g.px, [[xw, 0.72, -5.40], [xw, 0.72, -2.40], [xw, 1.44, -2.40], [xw, 1.44, -5.40]], [-1, 0, 0], D_BUDGET);
  // Square, because D_DRIVER is a square atlas region and a stretched quad would
  // squash the number.
  dquad(g.back, [[1.70, 1.75, zb], [3.70, 1.75, zb], [3.70, 3.75, zb], [1.70, 3.75, zb]], [0, 0, 1], D_DRIVER);
  dquad(g.px, [[xw, 1.62, -5.40], [xw, 1.62, -2.40], [xw, 3.12, -2.40], [xw, 3.12, -5.40]], [-1, 0, 0], D_SPEC);
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
  dquad(g.door, [[2.9, 4.80, 6.30], [-2.9, 4.80, 6.30], [-2.9, 4.98, 6.30], [2.9, 4.98, 6.30]], [0, 0, -1], D_SIGN);
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
// Single-slot, keyed on team + store revision + the resolved primary colour, so
// a team chip click or a livery edit rebuilds and the old GL buffers are freed
// on the spot. One slot cannot leak more than one generation.
let floorMesh = null, cacheKey = "";
const dressMesh = {};
let dressTex = null, dressFail = 0;
const propMesh = {};
const acc = () => ({ pos: [], nrm: [], col: [], idx: [] });
function rebuild(team, liv, info) {
  const drv = (team && team.drivers) || [];
  const key = (team && team.id) + "|" + (rgb(liv && liv.c1, [0, 0, 0])).join(",") +
              "|" + logoGen + "|" + ((drv[0] && drv[0].num) + "-" + (drv[1] && drv[1].num)) +
              "|" + boardKey(info);
  if (key === cacheKey && shellMesh) return;
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
  buildApron(flr); buildBayFloor(flr, liv);
  floorMesh = _gfx.createMesh(flr);
  const g = {};
  for (let i = 0; i < SIDES.length; i++) g[SIDES[i]] = acc();
  buildProps(g, liv);
  for (let i = 0; i < SIDES.length; i++) propMesh[SIDES[i]] = _gfx.createMesh(g[SIDES[i]]);
  // Team dress. Three strikes then stop trying: an unbranded bay is far better
  // than a canvas that throws once a frame forever.
  if (dressTex && _gfx.freeTexture) _gfx.freeTexture(dressTex);
  dressTex = null;
  for (let i = 0; i < SIDES.length; i++)
    if (dressMesh[SIDES[i]]) { _gfx.freeMesh(dressMesh[SIDES[i]]); dressMesh[SIDES[i]] = null; }
  if (dressFail < 3 && _gfx.createTexture && _gfx.createTexMesh && typeof LiveryTex !== "undefined") {
    try {
      dressTex = _gfx.createTexture(paintDress(team, liv, info).canvas);
      const dg = buildDress();
      for (let i = 0; i < SIDES.length; i++)
        if (dg[SIDES[i]].idx.length) dressMesh[SIDES[i]] = _gfx.createTexMesh(dg[SIDES[i]]);
    } catch (e) {
      dressFail++; dressTex = null;
      Log.warn("game", "GarageScene dress failed: " + (e && e.message));
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
function draw(team, liv, eye, getParts, driverIdx) {
  if (!_gfx) return;
  rebuild(team, liv, boardInfo(team, getParts, driverIdx));
  _gfx.draw(floorMesh, MAT_I, FLOOR_OPTS);
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
function framingHull(data) {
  const p = data && data.pos;
  if (!p || !p.length) return null;
  const pts = [];
  let ylo = 1e9, yhi = -1e9;
  for (let i = 0; i < p.length; i += 3) {
    pts.push([-p[i], p[i + 2]]);
    if (p[i + 1] < ylo) ylo = p[i + 1];
    if (p[i + 1] > yhi) yhi = p[i + 1];
  }
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross2 = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
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

function debug() {
  return { bay: [HALF_W * 2, Z_DOOR - Z_BACK, CEIL_Y], lights: lights(null).length / 15, key: cacheKey };
}

  return { init, BACKDROP, SKYLIGHT, AMB_SKY, AMB_GROUND, lights, glareStr, draw, framingHull, recentre, debug };
})();
if (typeof window !== "undefined") window.GarageScene = GarageScene;
