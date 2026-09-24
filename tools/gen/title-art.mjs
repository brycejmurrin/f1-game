#!/usr/bin/env node
/**
 * title-art.mjs — the title screen's car art, projected from the real car mesh.
 * @doc Draws index.html's #title-car from js/car/car3d.js through the garage camera; --check fails on drift.
 *
 * WHY THIS FILE EXISTS. The art is GENERATED OUTPUT. It was hand-built once and
 * the builder lived only in a scratch directory, which meant nobody could move
 * the camera, reposition the cars or relight them without starting over. Every
 * coordinate below comes from somewhere checkable, and re-running this is how
 * you change the picture — never by editing the path data in the shell.
 *
 * WHERE THE NUMBERS COME FROM, all read out of js/car/car3d.js:
 *   AXLES {frontZ 1.7, rearZ -1.6, wheelY 0.34}   -> 3.30 m wheelbase
 *   addWheel  fronts x 0.79 r 0.34 w 0.32, rears x 0.76 r 0.34 w 0.38,
 *             both outer faces on the 0.95 tyre plane
 *   CHASSIS.nose/monocoque/cockpit                -> the lofted section stack
 *   frontCascade()                                -> wing elements, FW_SPAN 0.715
 *   the cover spine  (-0.65,0.7935) (-1.15,0.97) (-1.65,0.97) (-1.70,0.6197)
 *   rearWing(-2.30, .., -2.52, ..) half 0.51      -> NOT 0.84; it is 1.02 m wide
 *   endplateGeom     chord 0.54, z -2.15 .. -2.69
 * Guessing any of these produced a visibly wrong car every time it was tried.
 *
 * THE CAMERA is the garage's own orbit, read from a garage-angles sidecar:
 * az 0.663, el 0.055, dist 5.5 m, target (0, 0.50, -1.40). It is a real pinhole
 * projection because the render has visible perspective — wheel radii fall
 * 103 -> 80 -> 57 px across the car — which an axonometric cannot reproduce.
 * To move the camera, change these and re-run. Nudging a coordinate by hand
 * lands the part somewhere the rest of the car does not agree with.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHELL = path.join(ROOT, "index.html");
// The @gen-shell marker family is what .claude/hooks/protect-files.sh watches,
// so naming the block this way buys the "never hand-edit a generated file"
// guard for free — the hook blocks any edit landing inside the pair.
const OPEN = "    <!-- @gen-shell:title-art -->";
const CLOSE = "    <!-- @gen-shell:/title-art -->";
// The PORTRAIT drawing is a second block, not a second file: it is the same car
// mesh through a second camera, so one generator owns both.
const OPEN_TOP = "    <!-- @gen-shell:title-art-top -->";
const CLOSE_TOP = "    <!-- @gen-shell:/title-art-top -->";

// ---------------------------------------------------------------- camera
// ONE CAMERA. The landscape drawing is the garage's own orbit. The portrait
// half is not projected at all — see sceneTop, which traces a real render
// instead, because this projector cannot draw a car pointed at its own lens.
const CAM_SIDE = { az: 0.663, el: 0.055, dist: 5.5, target: [0, 0.50, -1.40] };
const FOCAL = 1000;
const sub = (a, b) => a.map((x, i) => x - b[i]);
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const norm = (v) => { const m = Math.hypot(...v); return v.map((x) => x / m); };
let TARGET, EYE, FWD, RIGHT, UPV;
/** Point the one projector at a scene. Everything downstream reads these, so a
 *  whole drawing is re-aimed by calling this before building it. */
function setCamera(c) {
  TARGET = c.target;
  EYE = [TARGET[0] + c.dist*Math.sin(c.az)*Math.cos(c.el),
         TARGET[1] + c.dist*Math.sin(c.el),
         TARGET[2] + c.dist*Math.cos(c.az)*Math.cos(c.el)];
  FWD = norm(sub(TARGET, EYE));
  RIGHT = norm(cross(FWD, [0, 1, 0]));
  UPV = cross(RIGHT, FWD);
}
setCamera(CAM_SIDE);

// Placement of THIS car, so one builder can put down two: metres rearward,
// metres left, and a yaw about its own mid-wheelbase.
let OFF = [0, 0, 0];
let PHASE = 0;          // shifts the hand-wander so two passes miss each other
let LITE = false;       // the distant car: no detail that cannot be seen
// How far the tyre marks run back, and how far they wander sideways over that
// run. Only the flank camera projects marks — it wants a LONG, drifting trail
// that crosses open frame. The portrait half draws its own in frame space (see
// trails): from behind, marks run TOWARD the lens, and 13 m of them crosses the
// eye plane and folds into a diagonal smear over the whole drawing.
const TRAIL = [13.0, -4.6];

function world(u, v, h) {
  const [du, dv, yaw] = OFF;
  if (yaw) {
    const c = Math.cos(yaw), s = Math.sin(yaw), u0 = u - 1.65;
    [u, v] = [1.65 + u0*c - v*s, u0*s + v*c];
  }
  return [-(v + dv), h, -(u + du)];
}
/** u = metres rearward of the front axle, v = metres LEFT of centreline,
 *  h = metres up. The camera sits off the car's RIGHT, so v<0 is the near side. */
function P(u, v, h) {
  const r = sub(world(u, v, h), EYE), z = dot(r, FWD);
  return [FOCAL * dot(r, RIGHT) / z, -FOCAL * dot(r, UPV) / z];
}

// ------------------------------------------------------------- painterly
// A brush mark, not a CAD line: the edge wanders and the width swells. Both are
// DETERMINISTIC functions of position — random() would reshuffle the whole
// drawing on every run and make diffs meaningless.
function wob(x, y, amp = 4.4) {
  const a = amp * (1 + 0.35*Math.sin(PHASE*2.1));
  return [x + a*Math.sin(0.021*y + 1.7 + PHASE) + 0.6*Math.sin(0.11*x + PHASE),
          y + a*Math.cos(0.019*x + 0.4 + PHASE) + 0.6*Math.sin(0.09*y - PHASE)];
}
const fmt = (p) => `${Math.round(p[0])} ${Math.round(p[1])}`;
/**
 * A TRACED LOOP AS CURVES, NOT AS A POLYGON — potrace's smoothing stage, which
 * is what turns a pixel-walked outline into something that reads as drawn.
 *
 * The rule: a Bezier's endpoints are the MIDPOINTS of two consecutive polygon
 * edges, and its control points sit ON those edges, so the curve is tangent to
 * the polygon where it meets it and the shape never drifts off the traced mask.
 * Every vertex also gets a corner test: potrace's `alphamax` runs 0 (leave it a
 * polygon) to 4/3 (suppress every corner), alpha is clamped to [0.55, 1], and
 * control points land at 0.5 + 0.5*alpha along each edge. A vertex sharper than
 * the threshold stays a CORNER — an F1 car is mostly hard edges, and rounding
 * the endplates and the floor made it look like a bar of soap.
 */
function curve(pts, alphamax = 0.95) {
  const n = pts.length;
  if (n < 4) return poly(pts);
  const P = pts.map((q) => wob(...q));
  const mid = (a, b) => [(a[0]+b[0])/2, (a[1]+b[1])/2];
  const lerp = (a, b, t) => [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t];
  let d = "M" + fmt(mid(P[n-1], P[0]));
  for (let i = 0; i < n; i++) {
    const prev = P[(i+n-1)%n], cur = P[i], next = P[(i+1)%n];
    const m0 = mid(prev, cur), m1 = mid(cur, next);
    // The turn at this vertex, as the sine of the exterior angle: 0 straight,
    // 1 a right angle. potrace derives alpha from the same quantity.
    const u = [cur[0]-prev[0], cur[1]-prev[1]], v = [next[0]-cur[0], next[1]-cur[1]];
    const lu = Math.hypot(...u) || 1, lv = Math.hypot(...v) || 1;
    const turn = Math.abs(u[0]*v[1] - u[1]*v[0]) / (lu*lv);
    const alpha = Math.min(1, Math.max(0.55, 1.34 * (1 - turn)));
    if (1.34 * turn > alphamax) { d += " L" + fmt(cur) + " L" + fmt(m1); continue; }
    const t = 0.5 + 0.5*alpha;
    d += " C" + fmt(lerp(m0, cur, t)) + " " + fmt(lerp(m1, cur, t)) + " " + fmt(m1);
  }
  return d + " Z";
}

const poly = (pts) => "M" + pts.map((p) => fmt(wob(...p))).join(" L") + " Z";
const line = (pts) => "M" + pts.map((p) => fmt(wob(...p))).join(" L");

// Solids remember their side too, so the near half can be knocked back over
// the far half before either is lit — without that a far-side upper surface
// glows through the near flank standing in front of it.
let SOLID = { near: [], far: [] };
// Faces remember which way they point, so the drawing can be LIT rather than
// flat, and which side they are on, so near panels can occlude far ones.
let FACES = { nearTop: [], nearFlank: [], farTop: [], farFlank: [], wheel: [] };
function resetFaces() {
  FACES = { nearTop: [], nearFlank: [], farTop: [], farFlank: [], wheel: [] };
  SOLID = { near: [], far: [] };
  SHADE = [];
}

/** The faces bucketed into n tone steps by how much light each one takes, so a
 *  drawing can be LIT from its own geometry instead of from a near/far guess. */
function shadeBands(steps = 4) {
  const out = Array.from({ length: steps }, () => []);
  for (const f of SHADE) {
    const k = Math.min(steps - 1, Math.max(0, Math.floor(f.lam * steps)));
    out[k].push(f.d);
  }
  return out.map((g) => g.join(" "));
}
const side = (v) => (v <= 0 ? "near" : "far");
function face(kind, v, d) {
  FACES[side(v) + (kind === "t" ? "Top" : "Flank")].push(d);
  SOLID[side(v)].push(d);
  return d;
}

// EVERY FACE REMEMBERS WHICH WAY IT POINTS, IN THE WORLD. The old drawing
// sorted faces by which HALF of the car they sat on, which is a stand-in for
// orientation that only holds for a camera off the flank: from behind, both
// halves face the lens equally and the split paints the car as two slabs with
// a seam. A real normal shades correctly from any camera, and it is free —
// the quad already has three world points.
let SHADE = [];                       // [{ d, lam }] lam = how much light it takes
const LIGHT = norm([-0.35, 0.86, 0.38]);
function quad(a, b, c, d) {
  const A = world(...a), B = world(...b), C = world(...c);
  const n = norm(cross(sub(B, A), sub(C, A)));
  // Two-sided: the drawing has no back faces to cull, so a face pointing away
  // is lit as if flipped rather than going black.
  const lam = Math.abs(dot(n, LIGHT));
  const path = poly([P(...a), P(...b), P(...c), P(...d)]);
  SHADE.push({ d: path, lam });
  return path;
}

function taper(a, b, faces = "rt") {
  const [L1, v1a, v1b, h1a, h1b] = a, [L2, v2a, v2b, h2a, h2b] = b, out = [];
  if (faces.includes("r")) out.push(face("r", v1a, quad([L1,v1a,h1a],[L2,v2a,h2a],[L2,v2a,h2b],[L1,v1a,h1b])));
  if (faces.includes("t")) out.push(face("t", (v1a+v1b)/2, quad([L1,v1a,h1b],[L1,v1b,h1b],[L2,v2b,h2b],[L2,v2a,h2b])));
  return out.join(" ");
}
function plate(v, u1, h1a, h1b, u2, h2a, h2b) {
  return face("r", v, quad([u1,v,h1a],[u2,v,h2a],[u2,v,h2b],[u1,v,h1b]));
}

// ------------------------------------------------------------------ wheels
// THE WHEEL IS A CYLINDER, NOT A DISC: a sidewall plus the band of tread whose
// outward normal actually faces the camera. Sweeping the whole circumference
// would wrap the band round the back of the wheel and fill it in.
function disc(u, v, h, r, n = 28) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = 2*Math.PI*i/n; pts.push(P(u + r*Math.cos(a), v, h + r*Math.sin(a))); }
  const d = poly(pts);
  FACES.wheel.push(d); SOLID[side(v)].push(d);
  return d;
}
function ring(u, v, h, r, n = 28) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = 2*Math.PI*i/n; pts.push(P(u + r*Math.cos(a), v, h + r*Math.sin(a))); }
  return line(pts);
}
function tread(u, vIn, vOut, r, n = 48) {
  // Visibility is the sign of normal . (point - eye), asked at the mid-plane so
  // one test serves both walls; the visible tread is the longest contiguous run.
  const vm = (vIn + vOut) / 2, vis = [];
  for (let i = 0; i <= n; i++) {
    const a = 2*Math.PI*i/n;
    const w = world(u + r*Math.cos(a), vm, r + r*Math.sin(a));
    const d = [w[0]-EYE[0], w[1]-EYE[1], w[2]-EYE[2]];
    if (Math.sin(a)*d[1] - Math.cos(a)*d[2] < 0) vis.push(a);
  }
  if (vis.length < 2) return "";
  const step = 2*Math.PI/n, runs = [[vis[0]]];
  for (let i = 1; i < vis.length; i++) {
    if (vis[i] - vis[i-1] <= step*1.5) runs[runs.length-1].push(vis[i]); else runs.push([vis[i]]);
  }
  const arc = runs.reduce((a, b) => (b.length > a.length ? b : a));
  const outer = arc.map((a) => P(u + r*Math.cos(a), vOut, r + r*Math.sin(a)));
  const inner = arc.map((a) => P(u + r*Math.cos(a), vIn,  r + r*Math.sin(a)));
  const band = "M" + outer.concat(inner.reverse()).map((p) => fmt(wob(...p))).join(" L") + " Z";
  FACES.wheel.push(band); SOLID[side(vm)].push(band);
  return band;
}

// A ribbon lying on the ground that CURVES. Straight marks recede along the
// car's own axis, which is exactly where the car already is, so they are
// invisible behind it; these sweep sideways as they run back — the marks a car
// leaves on the exit of a corner — and cross open frame instead.
function groundCurve(u0, u1, v0, half, drift, steps = 26) {
  const a = [], b = [];
  for (let i = 0; i <= steps; i++) {
    const t = i/steps, u = u0 + (u1-u0)*t, v = v0 + drift*t*t;
    a.push(P(u, v - half, 0)); b.push(P(u, v + half, 0));
  }
  return "M" + a.concat(b.reverse()).map(fmt).join(" L") + " Z";
}

// A tapered ribbon along a projected polyline: a filled shape whose width
// swells at the middle and runs dry at the ends. A loaded brush, not a stroke.
function brush(pts, w0 = 1.6, wm = 7.0, w1 = 1.2) {
  const n = pts.length;
  if (n < 2) return "";
  const wid = (i) => { const t = i/(n-1), s = Math.pow(Math.sin(Math.PI*t), 0.65);
                       return w0*(1-t) + w1*t + (wm - (w0+w1)/2)*s; };
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const [px, py] = pts[Math.max(0, i-1)], [nx, ny] = pts[Math.min(n-1, i+1)];
    const dx = nx-px, dy = ny-py, m = Math.hypot(dx, dy) || 1, hw = wid(i)/2;
    L.push(wob(pts[i][0] - dy/m*hw, pts[i][1] + dx/m*hw));
    R.push(wob(pts[i][0] + dy/m*hw, pts[i][1] - dx/m*hw));
  }
  return "M" + L.concat(R.reverse()).map(fmt).join(" L") + " Z";
}

// ================================================================= the car
// Every number below is read out of js/car/car3d.js at the DEFAULT recipe
// (all engine knobs 1, no DRS) at AERO LEVEL 4, the max-downforce wing — the
// silhouette a high-downforce circuit produces, and the one where the rear wing
// clears the rear tyre instead of hiding behind it.
const RF = 0.79, RR = 0.76;   // front / rear half-track
const FACE = 0.95;            // outer tyre face, both axles
const R = 0.34;               // wheel radius
const UR = 3.30;              // rear axle, metres rearward of the front

/** Sidewall, rim, spokes and the tread band that makes it a cylinder. Fronts
 *  are 0.32 wide and rears 0.38 (car3d addWheel); the inner wall is that far
 *  inboard of the 0.95 outer face. THE SIDEWALL YOU SEE IS NOT ALWAYS THE
 *  OUTER ONE: the camera sits off the car's right, so a right-hand wheel shows
 *  its outer wall but a LEFT-hand wheel shows its INNER one (4.01 m away
 *  against the outer wall's 4.33). Drawing the rim on the outer wall of the
 *  left wheels put it behind the tyre, which is why those read as hollow rings. */
function wheel(u, outer) {
  const width = u < 0.01 ? 0.32 : 0.38;
  const inner = outer + (outer < 0 ? width : -width);
  const seen = outer < 0 ? outer : inner;
  return { disc: disc(u, seen, R, R), rim: ring(u, seen, R, R*0.58),
           tread: tread(u, Math.min(inner, outer), Math.max(inner, outer), R) };
}

/** A lofted run of {z, y, w, h, t} stations, exactly as car3d's addSpan reads
 *  them: w and h are FULL width and height and t narrows the deck. Taking them
 *  as halves put the body's underside below the ground, which is how that
 *  error was caught. u = 1.7 - z, and v = -x because the camera is on the
 *  car's right. */
function loft(sects, faces = "rt") {
  const out = [];
  for (let i = 0; i + 1 < sects.length; i++) {
    const a = sects[i], b = sects[i + 1];
    const u1 = 1.7 - a.z, u2 = 1.7 - b.z;
    const w1 = a.w/2, h1 = a.h/2, w2 = b.w/2, h2 = b.h/2;
    if (faces.includes("r"))
      out.push(face("r", -w1, quad([u1,-w1,a.y-h1],[u2,-w2,b.y-h2],[u2,-w2,b.y+h2],[u1,-w1,a.y+h1])));
    if (faces.includes("t"))
      out.push(face("t", -0.001, quad([u1,-w1*a.t,a.y+h1],[u1,w1*a.t,a.y+h1],[u2,w2*b.t,b.y+h2],[u2,-w2*b.t,b.y+h2])));
  }
  return out.join(" ");
}

/** Build every part of ONE car at the current OFF / PHASE / LITE. Nothing is
 *  cached: the wander is a function of projected position, so a car placed
 *  somewhere else is a different set of marks. */
function build() {
  resetFaces();
  // CHASSIS.nose + .monocoque + .cockpit, verbatim, as one continuous stack.
  const BODY = loft([
  { z:  2.60, y: 0.245, w: 0.115, h: 0.072, t: 0.68 },   // nose tip
  { z:  2.00, y: 0.315, w: 0.360, h: 0.235, t: 0.86 },
  { z:  1.05, y: 0.350, w: 0.480, h: 0.360, t: 0.82 },   // nose -> monocoque
  { z:  0.05, y: 0.395, w: 0.600, h: 0.480, t: 0.72 },   // monocoque
  { z: -0.55, y: 0.435, w: 0.500, h: 0.480, t: 0.50 },   // cockpit rear
  ]);

  // ENGINE COVER: buildEngineCoverBodywork's own two anchor stations at
  // coverHeight 1 / tailWidth 1 / no spine rise. The invented box that stood
  // here crowned at y 0.92 and ran to u 3.70 at full width; the real cover is
  // lower, and it TAPERS hard — half-width 0.28 at the shoulder to 0.13 at the
  // tail, with a deck only 0.72 (then 0.70) of that.
  const COVER = loft([
  { z: -0.55, y: 0.52, w: 0.56, h: 0.62, t: 0.72 },
  { z: -2.00, y: 0.42, w: 0.26, h: 0.34, t: 0.70 },
  ]);

  // PRINCIPAL ROLL STRUCTURE, not an "airbox": car3d puts regulation structure
  // at y 0.968 — the tallest mandated point on the car — on a blade 0.15 m wide.
  // The bulbous intake drawn here before was 0.42 m wide and 0.2 m too low, and
  // it made the car's highest point the airbox instead of the hoop.
  const HOOP = loft([
  { z: -0.33, y: 0.914, w: 0.15, h: 0.108, t: 0.40 },
  { z: -0.63, y: 0.884, w: 0.13, h: 0.108, t: 0.38 },
  ]);

  // SIDEPOD: sidepodStations() at the default knobs, as {outer, bottom, top,
  // inner, innerTop}. The undercut is the point — the lower surface CLIMBS as it
  // goes outboard, so there is daylight between the pod's belly and the floor
  // edge from exactly this camera. The two-station box drawn before had a flat
  // slab side and a shoulder 0.15 m too tall.
  const POD = [
  { z:  0.62, outer: 0.66, bottom: 0.258, top: 0.460, inner: 0.30, innerTop: 0.450 },
  { z:  0.22, outer: 0.70, bottom: 0.208, top: 0.475, inner: 0.29, innerTop: 0.490 },
  { z: -0.62, outer: 0.58, bottom: 0.160, top: 0.380, inner: 0.27, innerTop: 0.420 },
  { z: -1.48, outer: 0.38, bottom: 0.134, top: 0.270, inner: 0.23, innerTop: 0.300 },
  ];
  const POD_R = POD.slice(0, -1).map((a, i) => {
  const b = POD[i + 1], u1 = 1.7 - a.z, u2 = 1.7 - b.z;
  return face("r", -a.outer, quad([u1,-a.outer,a.bottom],[u2,-b.outer,b.bottom],[u2,-b.outer,b.top],[u1,-a.outer,a.top]))
       + " " + face("t", -a.inner, quad([u1,-a.outer,a.top],[u1,-a.inner,a.innerTop],[u2,-b.inner,b.innerTop],[u2,-b.outer,b.top]));
  }).join(" ");

  // FLOOR: CHASSIS.floor {cy 0.07, cz -0.3, sx 1.5, sy 0.06, sz 3.2} -> half
  // width 0.75, y 0.04..0.10, z -1.9..1.3.
  const FLOOR = taper([0.40, -0.75, 0.75, 0.04, 0.10], [3.60, -0.75, 0.75, 0.04, 0.10]);

  // FRONT WING: frontCascade(4) verbatim — [zLE, yLE, zTE, yTE, spanFrac,
  // thick]. The elements RISE toward the trailing edge (main plane 0.048 ->
  // 0.086), which is the opposite of the slope first guessed at, and the full
  // cascade is 0.74 m deep, not the 0.28 m it was drawn as. Half-span is
  // FW_SPAN 0.715 * spanFrac — well INSIDE the 0.95 tyre face, where it had
  // been drawn wider than the tyres. Elements cost bytes, not shell nodes:
  // every solid in a pass concatenates into one path.
  const FW_SPAN = 0.715;
  const FWING = [[2.72, 0.048, 2.40, 0.086, 1.00, 0.024],   // main plane
                 [2.50, 0.092, 2.24, 0.146, 0.98, 0.020],   // flap 1
                 [2.34, 0.148, 2.10, 0.212, 0.95, 0.018],   // flap 2
                 [2.20, 0.200, 1.98, 0.272, 0.92, 0.016]]   // flap 3
    .map(([zl, yl, zt, yt, frac, th]) => {
      const hw = FW_SPAN*frac, ul = 1.7 - zl, ut = 1.7 - zt;
      return face("r", -hw, quad([ul,-hw,yl],[ut,-hw,yt],[ut,-hw,yt+th],[ul,-hw,yl+th]))
           + " " + face("t", -0.001, quad([ul,-hw,yl+th],[ul,hw,yl+th],[ut,hw,yt+th],[ut,-hw,yt+th]));
    }).join(" ");
  const fwep = (s) => plate(s*(FW_SPAN + 0.03), 1.7-2.76, 0.02, 0.40, 1.7-2.30, 0.02, 0.30);
  const FWEP_R = fwep(-1), FWEP_L = fwep(1);

  // REAR WING at aero level 4, from endplateGeom(4) + the rearWing() calls.
  // aN = 1 -> cy 0.80, sy 0.58; the rear endplate profile therefore tops at
  // 1.105 and crownY = 1.087, so upperTrailY = 1.012 with DRS shut.
  // THE HALF-SPAN IS 0.51, NOT 0.84 — the wing drawn here before was 65 % too
  // wide, wider than the rear tyres, which no F1 wing has been since 2009, and
  // it FELL toward the trailing edge where the real one rises.
  const RW_MAIN = taper([4.00, -0.51, 0.51, 0.742, 0.766], [4.22, -0.51, 0.51, 0.787, 0.811]);
  const RW_MID  = taper([4.04, -0.51, 0.51, 0.842, 0.864], [4.26, -0.51, 0.51, 0.897, 0.919]);
  const RW_FLAP = taper([4.08, -0.51, 0.51, 0.937, 0.963], [4.34, -0.51, 0.51, 1.012, 1.038]);
  const RW_TOP  = taper([4.12, -0.50, 0.50, 1.032, 1.054], [4.36, -0.50, 0.50, 1.087, 1.109]);
  const BEAM    = taper([4.06, -0.46, 0.46, 0.676, 0.698], [4.28, -0.46, 0.46, 0.716, 0.738], "r");
  // endplateGeom(4): chord 0.54, z -2.15 (0.5446..0.9854) -> -2.69 (0.525..1.105).
  // The endplate is the tallest thing at the back of a real car and the only
  // part of the wing this camera sees clear of the rear tyre.
  const rwep = (s) => plate(s*0.52, 3.85, 0.5446, 0.9854, 4.39, 0.525, 1.105);
  const RWEP_R = rwep(-1), RWEP_L = rwep(1);
  const PYLON  = plate(-0.05, 3.98, 0.44, 0.76, 4.26, 0.42, 0.74);

  // DIFFUSER at aero level 4: diffW 1.30 -> dHalf 0.728 at the exit (capped by
  // CAR_HALF - 0.04) and dThr 0.598 at the throat, ceiling yCE 0.405 / yCT
  // 0.339 over a 0.105 floor.
  const DIFF = taper([3.65, -0.598, 0.598, 0.105, 0.339], [4.22, -0.728, 0.728, 0.105, 0.405]);
  // Shark fin on the cover's spine, between the hoop and the tail.
  const FIN = plate(-0.02, 2.85, 0.64, 0.86, 3.70, 0.54, 0.74);
  const MIRROR_R = plate(-0.50, 0.90, 0.56, 0.65, 1.06, 0.56, 0.65);

  // Halo and cockpit rim: open lines, not masses.
  const HALO = line(Array.from({ length: 15 }, (_, i) => {
  const t = Math.PI*i/14;
  return P(0.72 + 0.46*(1 - Math.cos(t)), 0.38*Math.sin(t), 0.70 + 0.24*Math.sin(Math.min(t, Math.PI - t)));
  })) + " " + line([P(0.70, 0, 0.72), P(0.68, 0, 0.90)]);

  const W_FL = wheel(0,   FACE), W_RL = wheel(UR,  FACE);
  const W_FR = wheel(0,  -FACE), W_RR = wheel(UR, -FACE);

  // Ground marks, projected through the same camera so they converge the way
  // real tyre marks do, and CURVED so they cross open frame instead of hiding
  // behind the car they came from.
  const [TU, TD] = TRAIL;
  const TRACKS = [groundCurve(UR-0.3, TU, -RR, 0.26, TD),
                groundCurve(UR-0.3, TU,  RR, 0.26, TD)].join(" ");
  const SKIDS  = [groundCurve(UR+0.6, TU-2.0, -RR-0.50, 0.10, TD*0.87),
                groundCurve(UR+0.2, TU-1.0,  RR+0.44, 0.09, TD*1.11)].join(" ");

  // The lines that carry the car's shape, as loaded brush marks: nose ridge,
  // floor edge, pod shoulder, spine.
  const pl = (pts) => pts.map(([u, v, h]) => P(u, v, h));
  const BRUSH = [
  brush(pl([[-0.90,-0.06,0.28],[0,-0.18,0.40],[0.95,-0.24,0.53],[1.65,-0.25,0.60]]), 1.4, 9.0, 2.0),
  brush(pl([[-0.55,-0.75,0.07],[0.9,-0.75,0.07],[2.2,-0.75,0.07],[3.5,-0.72,0.07]]), 1.2, 7.5, 1.4),
  brush(pl([[1.1,-0.70,0.46],[2.0,-0.64,0.42],[2.9,-0.52,0.36],[3.7,-0.30,0.30]]), 1.2, 6.5, 1.2),
  brush(pl([[1.45,-0.20,0.90],[2.4,-0.14,0.78],[3.3,-0.10,0.62],[4.0,-0.08,0.52]]), 1.0, 5.5, 1.0),
  ].join(" ");

  const solids = SOLID.near.concat(SOLID.far).join(" ");
  const detail = [HALO, W_FR.rim, W_RR.rim].join(" ");
  return {
    solids, detail, brush: BRUSH, bands: shadeBands(4),
    near: SOLID.near.join(" "), far: SOLID.far.join(" "),
    tracks: LITE ? TRACKS : TRACKS + " " + SKIDS,
    wheels: FACES.wheel.join(" "),
    nearFlank: FACES.nearFlank.join(" "), nearTop: FACES.nearTop.join(" "),
    farFace: FACES.farFlank.concat(FACES.farTop).join(" "),
  };
}

// ============================================================== the layers
/**
 * REVEAL HOOKS. Every art group — a <g> that holds a <path> directly — carries
 * `data-stage` (WHAT it is, so an animator can pick a stage) and `style="--i:N"`
 * (WHEN it draws on, so one rule can stagger by calc(var(--i) * step)). Neither
 * changes a pixel when no animation CSS applies: the custom property is inert,
 * and data-stage matches no existing rule. Existing attributes keep their order
 * and the new ones go LAST, so `<g data-trail` and every `g[data-ink]` /
 * `g:not([stroke])` selector still read the same tag.
 *
 * THE STAGES, and the groups each one names:
 *   ink    g[data-ink] with a stroke — the dilated outline passes: carLayers'
 *          bleed (inkW + 12, landscape near car only), the main contour (inkW)
 *          and the accent (4 px); tracedCar's halo and contour. The draw-on.
 *   body   the plain `stroke="none"` fill in --carbon — carLayers' knock-out
 *          and its near-half re-knock-out (occlude). No data-* hook of its own.
 *   tone   g[data-tone] — carLayers' ambient, far-face, tyre, flank and top
 *          passes; tracedCar's ambient fill and its posterised tone steps
 *          (which carry a hairline stroke).
 *   detail the fill="none" stroked lines — halo and near-side wheel rims.
 *   brush  g[data-ink][stroke="none"] — the filled loaded-brush marks.
 *   trail  g[data-trail] — the tyre marks, filled from #tc-trail(-v).
 *
 * --i IS STAGE-MAJOR, per drawing: every ink group of both cars first (in paint
 * order), then every body, tone, detail and brush group, and the trails LAST,
 * whatever their paint position. So the two cars outline together, then fill.
 * Wrappers that only place things (#tc-frame, the placement group, tracedCar's
 * per-car transform group) hold no path and carry no stage.
 *
 * pathLength="1" goes on every path that is STROKED (the ink, detail and
 * hairline tone passes), so CSS can run stroke-dasharray: 1 and animate
 * stroke-dashoffset 1 -> 0 without knowing any path's length. It only rescales
 * dash and marker distances, and nothing here dashes, so it is inert when
 * static. Fill-only paths (body, stroke="none" tone, brush, trail) do NOT get
 * it: a fill has no dash to scale, so it would be bytes that change nothing.
 */
const STAGES = ["ink", "body", "tone", "detail", "brush", "trail"];
const SLOT = "@@I@@";
/** Which stage a group is, read off the same attributes the CSS keys on. */
function stageOf(attrs, fill) {
  if (/\bdata-trail\b/.test(attrs)) return "trail";
  if (/\bdata-tone\b/.test(attrs)) return "tone";
  if (/\bdata-ink\b/.test(attrs)) return /stroke="none"/.test(attrs) ? "brush" : "ink";
  if (!fill) return "detail";
  if (/stroke="none"/.test(attrs)) return "body";
  throw new Error(`title-art: no reveal stage for <g ${attrs}>`);
}
/** One art group. `pathAttrs` precede d= on the path; pathLength="1" is added
 *  exactly when the group paints a stroke. The --i slot is filled later by
 *  numberStages, once the whole drawing's group list is known. */
function artGroup(indent, attrs, d, pathAttrs = "", fill = true) {
  const stroked = !/stroke="none"/.test(attrs);
  const pa = pathAttrs + (stroked ? 'pathLength="1" ' : "");
  return `${indent}<g ${attrs} data-stage="${stageOf(attrs, fill)}" style="--i:${SLOT}"><path ${pa}d="${d}"/></g>`;
}
/** Fill every --i slot in one drawing: stage-major, paint order within a stage. */
function numberStages(text) {
  const stages = [...text.matchAll(/data-stage="(\w+)" style="--i:@@I@@"/g)].map((m) => m[1]);
  const idx = [];
  stages.map((s, k) => [STAGES.indexOf(s), k])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .forEach(([, k], n) => { idx[k] = n; });
  let k = 0;
  return text.replace(/@@I@@/g, () => String(idx[k++]));
}
const g = (attrs, d, fill = true) => artGroup("      ", attrs, d, fill ? "" : 'fill="none" ', fill);

/**
 * One car, as the stack of groups that paints it.
 *
 * DILATE AND KNOCK OUT. Pass one draws every panel swollen by half a stroke
 * width and inked solid; pass two draws the same panels in body colour on top.
 * What survives is the union's OUTER contour — one clean silhouette, with none
 * of the interior panel edges that made earlier drafts read as scaffolding.
 * No SVG filter is involved: a filter costs ~35 % more paint and its own layer.
 *
 * THEN LIGHT IT. The panels already know which way they face, and a silhouette
 * throws that away and reads flat. Tops catch the sky, flanks fall away, rubber
 * stays darkest — one ink, three fill-opacities, which ride as presentation
 * attributes because fill-opacity takes a plain number.
 *
 * NEAR BEFORE FAR. The tone passes used to paint every face at once, so the
 * far car's upper surfaces glowed through the near car's flank standing in
 * front of them. The far half is toned first, then knocked back to body colour
 * under the near solids, then the near half is toned over the top. Two extra
 * groups, and the only intersection that matters stops leaking.
 */
function carLayers(off, inkW, detW, opts = {}) {
  const { lite = false, topA = 0.46, flankA = 0.22, tyreA = 0.11, baseA = 0.14,
          paint = true, occlude = true } = opts;
  const at = (phase) => { OFF = off; LITE = lite; PHASE = phase; return build(); };
  // Two more passes over the same edges with the wander shifted, so the contour
  // is BUILT UP from marks that miss each other rather than one uniform stroke.
  const bleed = at(1.7).solids, accent = at(3.4).solids, p = at(0);
  const out = [];
  out.push(g('data-trail stroke="none"', p.tracks));
  if (paint) out.push(g(`data-ink stroke-width="${inkW + 12}" stroke-opacity="0.22" fill-opacity="0"`, bleed));
  out.push(g(`data-ink stroke-width="${inkW}"`, p.solids));
  // The accent goes down BEFORE the knock-out. Drawn last it strokes every
  // interior panel edge and the scaffolding comes straight back; drawn here,
  // only the stretches pushed outside the body survive.
  if (paint) out.push(g('data-ink stroke-width="4" stroke-opacity="0.75" fill-opacity="0"', accent));
  out.push(g('stroke="none"', p.solids));
  // AMBIENT: the knock-out leaves the body at --carbon, which on a near-black
  // wash reads as a void rather than a mass. One low pass lifts the whole car
  // off the background before any face is lit.
  out.push(g(`data-tone stroke="none" fill-opacity="${baseA.toFixed(2)}"`, p.solids));
  if (occlude && p.farFace) {
    out.push(g(`data-tone stroke="none" fill-opacity="${(flankA * 0.55).toFixed(2)}"`, p.farFace));
    out.push(g('stroke="none"', p.near));
  }
  out.push(g(`data-tone stroke="none" fill-opacity="${tyreA.toFixed(2)}"`, p.wheels));
  out.push(g(`data-tone stroke="none" fill-opacity="${flankA.toFixed(2)}"`, occlude ? p.nearFlank : p.nearFlank + " " + p.farFace));
  out.push(g(`data-tone stroke="none" fill-opacity="${topA.toFixed(2)}"`, p.nearTop));
  out.push(g(`stroke-width="${detW}"`, p.detail, false));
  if (paint) out.push(g('data-ink stroke="none"', p.brush));
  return out;
}

// WHEEL TO WHEEL. The LEADER is the far car and the car nearest the camera is
// the one chasing it — which this camera can only express laterally, because
// the eye sits at world z +2.93, ahead of both, so a car that is behind in the
// race is always the further one (3.6 m against 6.9 m at the shipped offsets).
// The near car therefore trails by only 0.3 m — front wheel against the
// leader's rear, 2.3 m of track between their centrelines, which is as
// wheel-to-wheel as two 2 m cars get — and wins its size on lateral proximity
// instead. Both sit at the SAME yaw rather than turned in — a
// chaser angled away from the camera shows only its own tail and reads as a
// smudge, and one exactly parallel disappears behind the leader altogether, so
// it steps 2.1 m out and squares up to present the same three-quarter face.
// Depth decides paint order, so the far car goes down first, and
// it is LITE: at half the size and a fifth of the tone it carries no legible
// spokes, suspension or brush marks, and drawing them would cost ratcheted
// shell nodes to add clutter at exactly the scale that can least afford it.
function scene() {
  return numberStages([
    ...carLayers([1.90, 0.98, 0.028], 7, 3,
                 { lite: true, topA: 0.17, flankA: 0.07, tyreA: 0.04, baseA: 0.09,
                   paint: false, occlude: false }),
    ...carLayers([2.20, -1.32, 0.030], 10, 4),
  ].join("\n"));
}

/**
 * THE PORTRAIT SCENE IS A TRACE OF A REAL RENDER, NOT A PROJECTION.
 *
 * The flank drawing is projected from a hand-built mesh in this file, and that
 * works because a car in profile is a stack of boxes. From behind it is not:
 * the shapes that carry the read are the rear wing's slot gaps, the diffuser
 * strakes, the halo over the airbox and the tyre shoulders, and a projector
 * that can draw those is a renderer. So the portrait half traces one instead.
 *
 * THE MATTE IS A DIFFERENCE, NOT A THRESHOLD. Earlier drafts traced a GARAGE
 * photo and tried to split car from floor by brightness or saturation. That
 * cannot work: the front wing, the rear wing and the diffuser are matte black
 * and so is the pit box. A cut high enough to keep the wings swallowed the pit
 * wall; a cut low enough to lose the garage lost the wings; hole filling could
 * not rescue it because from behind you see UNDER the rear wing to the floor,
 * so the bay is not an enclosed hole. Each fix traded one missing part for
 * another, and the drawing kept arriving incomplete.
 *
 * tools/car/trace-car.mjs solves it by construction: tools/carview.html renders
 * the car ALONE with no floor at all, then renders the identical camera with
 * ?hidecar=1, and every pixel that differs is car. Black bodywork still differs
 * from a dark backdrop, so nothing drops out, and there is no floor in either
 * frame to exclude. Its output is baked to title-art-top-{a,b}.json and
 * committed, so this generator needs no browser.
 */
// Two traces, not one flipped: the cars head 3 degrees apart (az -3 and +3), so
// the pair is neither parallel nor a mirror — the same difference in heading the
// flank drawing gives them, seen from behind.
//   node tools/car/trace-car.mjs --az=-3 --el=30 --dist=11 --team=ferrari \\
//     --mindetail=100000 --simplify=2.2 --box=600x800 --out=tools/gen/title-art-top-a.json
//   (and --az=3 ... -top-b.json)
const TRACE = Object.fromEntries(["a", "b"].map((k) =>
  [k, JSON.parse(fs.readFileSync(path.join(ROOT, `tools/gen/title-art-top-${k}.json`), "utf8"))]));
// Where the rear tyres meet the road, in the trace's own 600x800 box — the one
// anchor the marks need. Measured off the trace once (the widest rows below
// mid-box are the rear axle); re-measure if the camera moves.
const REAR = { y: 645, half: 58, cx: [81, 519] };

const loops = (cs) => cs.map((c) => "M" + c.map((p) => p.join(" ")).join(" L") + " Z").join(" ");

/**
 * One traced car, placed, in the FLANK drawing's language so the two halves of
 * the title screen read as one hand: a steel ink contour, a low ambient fill
 * that lifts the mass off the wash, then the tone steps — three luminance bands
 * the tracer posterised from the lit render, stacked at rising opacity, each
 * with a hairline so the panel edges read as drawn lines. No opaque knock-out:
 * the flank car is translucent, and a solid grey cut-out beside it read as a
 * different picture.
 */
function tracedCar(x, y, sc, which, lite = false) {
  const T = TRACE[which];
  const at = `translate(${x} ${y}) scale(${sc.toFixed(3)})`;
  const t = lite ? 0.45 : 1;
  const o = (v) => (v * t).toFixed(2);
  const ink = (lite ? 4 : 6) / sc;           // constant weight ON SCREEN, so the
  const hair = 1.6 / sc;                     // leader is not also thinner-lined
  const OUT = loops(T.outline);
  const TONE = [0.20, 0.32, 0.46];           // three luminance steps, darkest first
  const EO = 'fill-rule="evenodd" ', IN = "        ";
  return [
    `      <g transform="${at}">`,
    artGroup(IN, `data-ink stroke-width="${(ink + 8 / sc).toFixed(2)}" stroke-opacity="${o(0.18)}" fill-opacity="0"`, OUT),
    artGroup(IN, `data-ink stroke-width="${ink.toFixed(2)}" stroke-opacity="${o(0.95)}" fill-opacity="0"`, OUT, EO),
    artGroup(IN, `data-tone stroke="none" fill-opacity="${o(0.24)}"`, OUT, EO),
    ...T.tone.map((step, i) => artGroup(IN,
      `data-tone stroke-width="${hair.toFixed(2)}" stroke-opacity="${o(0.55)}" fill-opacity="${o(TONE[i] || 0.38)}"`,
      loops(step), EO)),
    "      </g>",
  ].join("\n");
}

/**
 * The marks the pair left, in the FRAME's coordinates rather than a car's.
 *
 * These cannot be projected through this file's camera the way the flank ones
 * are: from behind, the marks run TOWARD the lens, so a 13 m trail crosses the
 * eye plane and folds into a diagonal smear across the whole drawing. Drawing
 * them in the frame is also the honest construction — the trace fixed the cars'
 * perspective, and the marks only have to agree with it.
 */
function trails(c, floor) {
  const out = [];
  for (let i = 0; i < 2; i++) {
    const x0 = c.x + REAR.cx[i] * c.sc, y0 = c.y + REAR.y * c.sc;
    const h0 = REAR.half * c.sc;
    // Toward the lens the marks widen and swing outward, the way a pair of
    // parallel lines does under perspective. The swing is off the FRAME's
    // centre so both cars' marks fan the same way.
    const k = (x0 - 450) / 450;
    const x1 = x0 + k * 210, h1 = h0 * 1.85;
    out.push(`M${Math.round(x0 - h0)} ${Math.round(y0)}`
      + ` L${Math.round(x0 + h0)} ${Math.round(y0)}`
      + ` L${Math.round(x1 + h1)} ${floor} L${Math.round(x1 - h1)} ${floor} Z`);
  }
  return out.join(" ");
}

function sceneTop() {
  // The flank pair's formation read from behind: side by side with clear road
  // between them, the leader on the left a nose ahead, the chaser on the right
  // nearer the lens. Not overlapping, not parallel (the traces differ by six
  // degrees of heading), and the same size to within perspective.
  const cars = [
    { x: 34, y: 490, sc: 0.66, which: "a", lite: true },
    { x: 468, y: 610, sc: 0.70, which: "b", lite: false },
  ];
  // The LEADER's marks are older and further up the road, so they go down with
  // the rest of it. One group each, not one for the pair: fill-opacity on a
  // shared group would flatten the two together and the depth cue with them.
  return numberStages([
    ...cars.map((c) => artGroup("      ", `data-trail stroke="none"${c.lite ? ' fill-opacity="0.55"' : ""}`,
      trails(c, 1600))),
    ...cars.map((c) => tracedCar(c.x, c.y, c.sc, c.which, c.lite)),
  ].join("\n"));
}

// ================================================================== output
// Where the built scene lands in the 1400x900 viewBox. Overridable from the
// environment so a recomposition is a re-run rather than an edit: the pair has
// to clear the title block on the left and stop at the menu column on the
// right, and finding that took a dozen renders.
const PLACE = process.env.TA_PLACE || "202 675";
const SCALE = process.env.TA_SCALE || "0.99";
// The portrait drawing has its own viewBox (900x1600) because it is a different
// composition, not a crop of the first one.
const PLACE_TOP = process.env.TA_TOP_PLACE || "0 0";
const SCALE_TOP = process.env.TA_TOP_SCALE || "1";
const argv = process.argv.slice(2);
// #tc-frame is the per-SHAPE framing that css/menus.css puts on top of that one
// placement: a phone in portrait wants the pair nudged off the left edge, a
// phone in landscape wants it smaller and lower so the trail clears the button
// column. The transform has to live INSIDE the svg — an offset on #title-car
// itself counts toward #overlay's scrollWidth and took `ui-scale > portrait`
// red — and whatever it moves off the viewport, the svg viewport clips.
const BLOCKS = [
  { open: OPEN, close: CLOSE, frame: "tc-frame",
    body: `    <g transform="translate(${PLACE}) scale(${SCALE})">\n${scene()}\n    </g>` },
  { open: OPEN_TOP, close: CLOSE_TOP, frame: "tc-top-frame",
    body: `    <g transform="translate(${PLACE_TOP}) scale(${SCALE_TOP})">\n${sceneTop()}\n    </g>` },
];
let shell = fs.readFileSync(SHELL, "utf8");
let wrote = 0, drift = [];
for (const blk of BLOCKS) {
  const want = `${blk.open}\n    <g id="${blk.frame}">\n${blk.body}\n    </g>\n${blk.close}`;
  const a = shell.indexOf(blk.open), b = shell.indexOf(blk.close);
  if (a < 0 || b < 0) {
    console.error(`title-art: ${blk.open.trim()} / ${blk.close.trim()} markers missing from index.html`);
    process.exit(1);
  }
  const have = shell.slice(a, b + blk.close.length);
  if (have === want) continue;
  drift.push(blk.frame);
  if (!argv.includes("--check")) {
    shell = shell.slice(0, a) + want + shell.slice(b + blk.close.length);
    wrote += want.length;
  }
}
if (argv.includes("--check")) {
  if (!drift.length) { console.log("title-art: index.html is up to date"); process.exit(0); }
  console.error(`title-art: index.html has DRIFTED from tools/gen/title-art.mjs (${drift.join(", ")}).\n` +
                "  Run `node tools/gen/title-art.mjs` (or `npm run gen`) and commit the result.");
  process.exit(1);
}
if (!drift.length) { console.log("title-art: index.html is up to date"); process.exit(0); }
fs.writeFileSync(SHELL, shell);
console.log(`title-art: wrote ${wrote} B into index.html (${drift.join(", ")})`);
