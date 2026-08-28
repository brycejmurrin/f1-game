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
import { loadCar3D, buildCockpit, sweep, isPale } from "../../tools/cockpit-pale-sweep.mjs";

// Pale things that are SUPPOSED to be pale, each with the reason it stays.
const ALLOWED = [
  // none today: the OT lamp and the hard-compound tyre band are both pale by
  // design, but neither is part of the cockpit BODY build (the lamp is a
  // carmesh instrument mesh, the band rides the wheels, which the cockpit
  // build drops via noWheels), so neither can appear in this sweep.
];
const allowed = (rgb) => ALLOWED.some((a) => a.rgb.every((v, i) => Math.abs(v - rgb[i]) < 0.02));

const { Car3D, Teams } = loadCar3D();
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
