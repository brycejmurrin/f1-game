// The livery CREST STRIPE must not run through the driver's steering wheel.
//
// liveries.js documents `stripe` as a "bold centreline BODY stripe — runs the
// car's full length", and car3d.js draws it as four lofts from the monocoque
// (z 0.05) out to the nose tip. From a chase camera that is the whole point of
// it. From the cockpit eye at (0, 0.82, -0.20) the first two lofts start 0.25 m
// ahead — INSIDE the 0.30 m near plane — and run 1.5 m straight down the middle
// of the view at 0.12-0.13 m wide, so they foreshorten into a flat slab lying
// across the wheel instead of reading as a stripe. A player reported exactly
// that, twice, and it survived six rounds of looking because every probe built
// the car WITHOUT `opts.livery`, so the stripe was never in the mesh being
// measured. car3d.js had already learned this lesson on the HOOD accent stripe
// and gated it !ckpt; the livery stripe was missed.
//
// Two assertions, so the fix cannot be satisfied by deleting the stripe:
//   1. the COCKPIT build carries no stripe geometry inside the driver's forward
//      cone within NEAR_LIMIT metres, and
//   2. the CHASE build still does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCar3D, EYE } from "../../tools/car/cockpit-pale-sweep.mjs";

const { Car3D, Teams, Liveries, Parts } = loadCar3D();

// Beyond this the stripe is under 0.13 m wide at 1.75 m — about 4 degrees, which
// reads as a stripe on the nose. Nearer than this it is the reported slab.
const NEAR_LIMIT = 1.5;
// The steering wheel's own window from the eye (game.js _rigT: translate
// (0, 0.63, 0.26), scale 0.80). Anything inside this cone is drawn over by, or
// seen through, the wheel.
const CONE_YAW = 25 * Math.PI / 180;
const CONE_PITCH_HI = -5 * Math.PI / 180, CONE_PITCH_LO = -40 * Math.PI / 180;

// Colour matching is NOT good enough to find the stripe: "hazard" ships
// stripe [0.07,0.07,0.08], which is car3d's CARBON byte-for-byte, and
// "graphite" ships [0.08,0.08,0.10], the mirror housing. Both would report the
// bodywork as a slab. So the stripe is located by a DIFFERENTIAL build instead
// — the same mesh with and without liv.stripe — which is exact whatever colour
// the livery chose.

const team = (Teams.LIST || Teams.ALL)[1];
const parts = Parts ? Parts.getVisualTiers(Parts.DEFAULTS, team) : undefined;
const liveries = [...(Liveries.UNIVERSAL || []), ...Object.values(Liveries.BY_TEAM || {}).flat()]
  .filter((l) => l && l.stripe);

function build(liv, cockpit) {
  return Car3D.build(liv.c1, liv.c2,
    { teamId: team.id, livery: liv, noWheels: true, noDriver: true, cockpit, halo: false, parts });
}

// The stripe's own vertices: build the same car with and without liv.stripe and
// take the positions present only in the first. The stripe is a pure INSERTION
// into the vertex stream, so a single forward walk recovers it exactly.
function stripeVertices(liv, cockpit) {
  const A = build(liv, cockpit);
  const B = build(Object.assign({}, liv, { stripe: undefined }), cockpit);
  const out = [];
  const eq = (i, j) => Math.abs(A.pos[i * 3] - B.pos[j * 3]) < 1e-6 &&
                       Math.abs(A.pos[i * 3 + 1] - B.pos[j * 3 + 1]) < 1e-6 &&
                       Math.abs(A.pos[i * 3 + 2] - B.pos[j * 3 + 2]) < 1e-6;
  const na = A.pos.length / 3, nb = B.pos.length / 3;
  let i = 0, j = 0;
  while (i < na) {
    if (j < nb && eq(i, j)) { i++; j++; continue; }
    out.push([A.pos[i * 3], A.pos[i * 3 + 1], A.pos[i * 3 + 2]]);
    i++;
  }
  return out;
}

// Of those, the ones inside the driver's forward cone, nearest first.
function inCone(verts, limit) {
  let n = 0, nearest = Infinity;
  for (const p of verts) {
    const dx = p[0] - EYE[0], dy = p[1] - EYE[1], dz = p[2] - EYE[2];
    if (dz <= 0) continue;                                   // behind the eye
    const yaw = Math.atan2(dx, dz), pitch = Math.atan2(dy, dz);
    if (Math.abs(yaw) > CONE_YAW || pitch > CONE_PITCH_HI || pitch < CONE_PITCH_LO) continue;
    const d = Math.hypot(dx, dy, dz);
    if (d >= limit) continue;
    n++; nearest = Math.min(nearest, d);
  }
  return { n, nearest };
}

test("no livery crest stripe runs through the driver's steering wheel", () => {
  const bad = [];
  for (const liv of liveries) {
    const hit = inCone(stripeVertices(liv, true), NEAR_LIMIT);
    if (hit.n) bad.push(`${liv.id}: ${hit.n} stripe vertices, nearest ${hit.nearest.toFixed(2)} m`);
  }
  assert.equal(bad.length, 0,
    `${bad.length} of ${liveries.length} liveries put crest-stripe geometry inside the wheel's ` +
    `window within ${NEAR_LIMIT} m of the cockpit eye — that is the reported slab. ` +
    `Gate the monocoque/hood-crest lofts !ckpt in car3d.js (part "livery"):\n  ` +
    bad.slice(0, 6).join("\n  "));
});

test("the chase build still carries the crest stripe it is drawn for", () => {
  // Non-vacuity: deleting the stripe outright, or gating all four lofts, passes
  // the test above and silently strips the livery from every external camera.
  const missing = [];
  for (const liv of liveries) {
    const hit = inCone(stripeVertices(liv, false), NEAR_LIMIT);
    if (!hit.n) missing.push(liv.id);
  }
  assert.equal(missing.length, 0,
    `${missing.length} of ${liveries.length} liveries lost their crest stripe from the CHASE build ` +
    `too — the cockpit gate has been applied to geometry the external cameras are supposed to see: ` +
    missing.slice(0, 6).join(", "));
});
