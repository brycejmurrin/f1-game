/*
 * Nothing in the COCKPIT build may read as a blank pale slab.
 *
 * The bug this exists for: a user reported "a little light grey box in front of
 * the steering wheel". It was not a pale constant anywhere in the car — it was
 * the livery ACCENT. Ferrari's c2 is literally [1,1,1], so every cockpit trim
 * element carrying the accent (crown rail, coaming lip, wing flaps, fin) became
 * a flat pale slab 0.8-2.9 m from the driver's eye. Every existing gate was
 * blind to it: no unit test looks at colour, and a screen-space pale-pixel
 * count returns zero both before AND after the fix because the dusk tone-map
 * washes everything warm. Ray-casting the built mesh is what found it, and this
 * is that check as a guard — it never rasterises, so it costs milliseconds.
 *
 * Fails if a new team, livery, or part reintroduces a near-neutral bright
 * surface in the driver's view. If a failure is DELIBERATE, add it to ALLOWED
 * below with the reason — do not widen isPale (see AGENTS: never widen a
 * tolerance to make a spec pass).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCar3D, buildCockpit, sweep, isPale } from "../../tools/car/cockpit-pale-sweep.mjs";

// Pale things that are SUPPOSED to be pale, each with the reason it stays.
const ALLOWED = [
  // none today: the OT lamp and the hard-compound tyre band are both pale by
  // design, but neither is part of the cockpit BODY build (the lamp is a
  // carmesh instrument mesh, the band rides the wheels, which the cockpit
  // build drops via noWheels), so neither can appear in this sweep.
];
const allowed = (rgb) => ALLOWED.some((a) => a.rgb.every((v, i) => Math.abs(v - rgb[i]) < 0.02));

const { Car3D, Teams, Liveries } = loadCar3D();
const LIST = (Teams && (Teams.LIST || Teams.ALL || Teams.teams)) || [];

test("no team's cockpit ACCENT reads as a pale slab in the driver's view", () => {
  assert.ok(LIST.length >= 8, "team list loaded");
  // The car's BODY colour is exempt and must stay exempt: racingbulls really
  // is a white car (#F4F0EC), and a driver in a white car sees white bodywork.
  // Dimming c1 would misreport the livery, which is a worse bug than the one
  // this guards. What is NOT acceptable is a pale ACCENT — trim that is meant
  // to read as a stripe and instead fills the view as a blank panel.
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 0.02);
  const offenders = [];
  for (const t of LIST) {
    const c1 = t.color || t.c1, c2 = t.color2 || t.c2;
    const r = sweep(buildCockpit(Car3D, c1, c2, t.id));
    for (const [rgb, e] of r.buckets) {
      const c = rgb.split(",").map(Number);
      if (near(c, c1) || allowed(c)) continue;
      offenders.push(`${t.id}: rgb=[${rgb}] on ${e.n} rays at ${e.tMin.toFixed(2)}m`);
    }
  }
  assert.deepEqual(offenders, [],
    "a cockpit ACCENT reads as a blank pale slab — dim it for ckpt (see _ckAcc in car3d.js) " +
    "or add it to ALLOWED with the reason");
});

test("a white accent is dimmed rather than passed through", () => {
  // The synthetic worst case: pure white accent on a dark car. Without the
  // cockpit accent dimming this is exactly the reported bug.
  const r = sweep(buildCockpit(Car3D, [0.05, 0.05, 0.06], [1, 1, 1], "ferrari"));
  assert.equal(r.pale, 0, "pure-white accent still produced a pale cockpit surface");
});

test("the sweep can actually see a pale surface (the guard is not vacuous)", () => {
  // A guard that cannot fail is not a guard: feed the same builder a car whose
  // BODY is white and confirm the sweep reports it. c1 is the body paint and is
  // deliberately NOT dimmed — a white car really is white — so this both proves
  // the detector works and pins that c1 is left alone.
  const r = sweep(buildCockpit(Car3D, [1, 1, 1], [0.1, 0.1, 0.1], "ferrari"));
  assert.ok(r.pale > 0, "sweep failed to detect an all-white car body");
});

test("isPale ignores saturated colours however bright", () => {
  assert.equal(isPale([1, 1, 1]), true);
  assert.equal(isPale([0.85, 0.85, 0.9]), true);
  assert.equal(isPale([0.9, 0.9, 0.1]), false, "yellow is an accent, not a pale slab");
  assert.equal(isPale([0, 0.71, 0.67]), false, "teal");
  assert.equal(isPale([0.1, 0.1, 0.12]), false, "dark");
});

// THE GUARD ABOVE SWEPT TEAM BASE COLOURS WITH NO LIVERY, so it could only ever
// see c1/c2 — and `opts.livery` is where nose, pod, halo, stripe and noseStripe
// come from. All five reached the cockpit undimmed: 32 of the 152 shipped
// liveries put a pale non-body surface in the driver's view, Cadillac's at 181
// rays apiece. A player racing one of those saw exactly the reported slab.
//
// Ray-casting all 152 is too slow for this suite, and unnecessary: a livery
// with no pale field cannot produce a pale surface, so the cheap colour
// pre-filter picks the only candidates and those get the real cast.
test("no shipped LIVERY puts a pale non-body surface in the driver's view", () => {
  assert.ok(Liveries && Liveries.BY_TEAM, "Liveries loaded");
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 0.02);
  // Every livery field that reaches the cockpit build. c1 is the BODY and is
  // deliberately exempt (see the note above); it is not in this list.
  const FIELDS = ["c2", "accent", "wing", "fin", "nose", "pod", "halo", "stripe", "noseStripe"];
  const candidates = [];
  for (const [team, arr] of Object.entries(Liveries.BY_TEAM)) {
    (Array.isArray(arr) ? arr : [arr]).forEach((liv, i) => {
      if (!liv || !liv.c1 || !liv.c2) return;
      if (FIELDS.some((f) => Array.isArray(liv[f]) && isPale(liv[f]))) candidates.push([`${team}[${i}]`, team, liv]);
    });
  }
  assert.ok(candidates.length > 0,
    "no livery carries a pale field — the pre-filter broke, or the palette changed");

  const offenders = [];
  for (const [label, team, liv] of candidates) {
    const m = Car3D.build(liv.c1, liv.c2,
      { teamId: team, noWheels: true, noDriver: true, cockpit: true, halo: true, livery: liv });
    for (const [rgb, e] of sweep(m).buckets) {
      const c = rgb.split(",").map(Number);
      if (near(c, liv.c1) || allowed(c)) continue;
      offenders.push(`${label}: rgb=[${rgb}] on ${e.n} rays at ${e.tMin.toFixed(2)}m`);
    }
  }
  assert.deepEqual(offenders, [],
    "a livery paint reads as a pale slab in the cockpit — route it through _ckAcc " +
    "in js/car/car3d.js (as nose/pod/halo/stripe/noseStripe now are), not around it");
});

// THE SECOND REPORT WAS NOT ABOUT PALENESS AT ALL. With a red car (ferrari c1
// [0.86,0,0]) a player pointed at "the slab just below the wheel": the cockpit
// monocoque span, whose rear cap is a closed wall the eye looks straight into
// 0.65 m away and whose deck runs out under the vanity hood. In body paint that
// is one unbroken block of colour filling the bottom of the frame the moment
// the aim pitches down — invisible to both guards above, because on ferrari it
// is the BODY colour and the body is deliberately exempt there.
//
// The tub the driver sits IN is carbon on a real car, and the pieces bracketing
// it here already are (inner tub wall, instrument shroud — both INTAKE). This
// pins that: the rear cap of CKPT_MONO_REAR carries no body paint. The vanity
// hood on top of it and the nose beyond it are NOT covered — they are the
// livery the driver looks along, and they must stay painted.
test("the cockpit tub wall under the wheel is not body paint", () => {
  const C1 = [0.86, 0, 0], C2 = [0.10, 0.40, 0.90];
  const m = Car3D.build(C1, C2,
    { teamId: "ferrari", noWheels: true, noDriver: true, cockpit: true, halo: true });
  // CKPT_MONO_REAR sits at z 0.45, y 0.24..0.40, |x| <= 0.28 (car3d.js). Nothing
  // else in the build has a vertex in that slice, so the box needs no exclusions.
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 0.02);
  let inBox = 0, painted = 0;
  for (let i = 0; i < m.pos.length; i += 3) {
    const x = m.pos[i], y = m.pos[i + 1], z = m.pos[i + 2];
    if (!(z >= 0.44 && z <= 0.46 && y >= 0.20 && y <= 0.42 && Math.abs(x) <= 0.30)) continue;
    inBox++;
    if (near([m.col[i], m.col[i + 1], m.col[i + 2]], C1)) painted++;
  }
  assert.ok(inBox >= 12, `the monocoque rear cap moved — ${inBox} vertices in the slice, expected 24`);
  assert.equal(painted, 0,
    `${painted} of ${inBox} vertices on the cockpit tub wall carry the body colour — ` +
    "that is the slab under the steering wheel; keep the ckpt monocoque span CARBON (car3d.js buildSharedChassis)");
});

// SECOND slab, same report, different box — and the reason this test exists
// separately is that the guard above PASSED while the defect was on screen. It
// slices z 0.44..0.46 (the monocoque rear cap); the dash coaming is a different
// box at z 0.52..0.68 and sailed straight through.
//
// The coaming is `addBox(out, 0, 0.36, 0.60, 0.66, 0.13, 0.16, ...)` — centre
// (0, 0.36, 0.60), size (0.66, 0.13, 0.16), so x -0.33..0.33, y 0.295..0.425,
// z 0.52..0.68. Painted c1 it put its vertical front face AND its horizontal
// top deck across the whole lower-centre of an onboard shot: the flat red table
// across the driver's lap that was reported twice.
//
// _ckAcc does not save this one. It only dims a colour whose MIN channel is
// >= 0.45, and Ferrari red is [0.863, 0, 0] — min 0 — so the brightest, most
// reported livery is exactly the one it passes through untouched.
test("the dash coaming under the wheel is not body paint", () => {
  const C1 = [0.86, 0, 0], C2 = [0.10, 0.40, 0.90];
  const m = Car3D.build(C1, C2,
    { teamId: "ferrari", noWheels: true, noDriver: true, cockpit: true, halo: true });
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 0.02);
  // The coaming's FRONT face only (constant z 0.52). Deliberately not the top
  // deck: that runs to z 0.68 and overlaps the hood box the next test claims,
  // so slicing here keeps the two guards from arguing over the same vertices.
  let inBox = 0, painted = 0;
  for (let i = 0; i < m.pos.length; i += 3) {
    const x = m.pos[i], y = m.pos[i + 1], z = m.pos[i + 2];
    if (!(z >= 0.514 && z <= 0.526 && y >= 0.29 && y <= 0.43 && Math.abs(x) <= 0.34)) continue;
    inBox++;
    if (near([m.col[i], m.col[i + 1], m.col[i + 2]], C1)) painted++;
  }
  assert.ok(inBox >= 8, `the dash coaming moved — ${inBox} vertices in the slice`);
  assert.equal(painted, 0,
    `${painted} of ${inBox} vertices on the dash coaming carry the body colour — that is the ` +
    "red slab under the steering wheel; keep the ckpt coaming CARBON (car3d.js, dash coaming)");
});

// The other half of the same change: what the driver looks ALONG must keep the
// livery. If a later pass darkens the hood or the nose too, the cockpit stops
// showing the player which car they are in — a different bug, equally reported.
test("the cockpit hood and nose keep the livery", () => {
  const C1 = [0.86, 0, 0], C2 = [0.10, 0.40, 0.90];
  const m = Car3D.build(C1, C2,
    { teamId: "ferrari", noWheels: true, noDriver: true, cockpit: true, halo: true });
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 0.02);
  let painted = 0;
  for (let i = 0; i < m.pos.length; i += 3) {
    // The vanity hood spans z 0.58..1.10 at y 0.36..0.55 (hF/hR in car3d.js).
    const y = m.pos[i + 1], z = m.pos[i + 2];
    if (!(z >= 0.58 && z <= 1.10 && y >= 0.36 && y <= 0.56)) continue;
    if (near([m.col[i], m.col[i + 1], m.col[i + 2]], C1)) painted++;
  }
  assert.ok(painted >= 8,
    `only ${painted} hood vertices carry the body colour — the driver has lost the livery ahead of them`);
});
