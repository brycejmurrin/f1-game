// Per-team chassis relief: TEAM_STYLE knobs must produce distinct sidepod /
// cover / floor silhouettes on the STOCK (garage free-build) recipe, so paint
// is not the only thing that separates the grid. Deterministic, no Math.random.
import test from "node:test";
import assert from "node:assert/strict";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

const S = loadParts({ shade: true });
const { Car3D, Teams } = S;
const STOCK = { engine: 1, aero: 1 };   // garage free-build: stock PU + medium aero
const SHOW = ["mercedes", "redbull", "mclaren", "haas"];

function podSample(id) {
  const a = Car3D.bodyAnchors(STOCK, id, undefined, true);
  return {
    inlet: a.podAt(0.62),
    shoulder: a.podAt(0.22),
    waist: a.podAt(-0.62),
    tail: a.podAt(-1.48),
    coverMid: a.coverAt(-1.13),
  };
}

test("TEAM_STYLE lists every 2026 constructor plus the My Team default", () => {
  const style = Car3D.TEAM_STYLE;
  for (const t of Teams.LIST) {
    assert.ok(style[t.id], `missing TEAM_STYLE.${t.id}`);
    const st = style[t.id];
    for (const k of ["inletH", "inletW", "undercutD", "waist", "floorStep", "coverCrown"]) {
      assert.equal(typeof st[k], "number", `${t.id}.${k} must be a number`);
    }
  }
  const def = Car3D.teamStyleOf("custom") || Car3D.teamStyleOf(null);
  assert.ok(def, "My Team / unknown falls back to DEFAULT_STYLE");
  for (const k of ["inletH", "inletW", "undercutD", "waist", "floorStep", "coverCrown"]) {
    assert.equal(def[k] || 0, 0, `My Team default ${k} must be 0`);
  }
});

test("stock-recipe sidepods: four showcase teams stay ≥4 cm apart at the inlet or waist", () => {
  const samples = Object.fromEntries(SHOW.map((id) => [id, podSample(id)]));
  const pairGap = (a, b) => Math.max(
    Math.abs(a.inlet.x - b.inlet.x),
    Math.abs(a.inlet.top - b.inlet.top),
    Math.abs(a.inlet.bottom - b.inlet.bottom),
    Math.abs(a.waist.x - b.waist.x),
    Math.abs(a.waist.bottom - b.waist.bottom),
  );
  const gaps = [];
  for (let i = 0; i < SHOW.length; i++) {
    for (let j = i + 1; j < SHOW.length; j++) {
      const g = pairGap(samples[SHOW[i]], samples[SHOW[j]]);
      gaps.push(`${SHOW[i]}/${SHOW[j]}=${(g * 1000).toFixed(0)}mm`);
      assert.ok(g >= 0.040, `${SHOW[i]} vs ${SHOW[j]} only ${(g * 1000).toFixed(1)} mm apart on stock parts`);
    }
  }
  // Mercedes: narrow inlet + deep undercut (outer belly climbs).
  assert.ok(samples.mercedes.inlet.x < samples.mclaren.inlet.x - 0.03,
    `Mercedes inlet ${samples.mercedes.inlet.x.toFixed(3)} is not narrower than McLaren ${samples.mclaren.inlet.x.toFixed(3)}`);
  assert.ok(samples.mercedes.shoulder.bottom > samples.haas.shoulder.bottom + 0.015,
    "Mercedes undercut does not sit above the Haas slab");
  // Red Bull: tall inlet.
  assert.ok(samples.redbull.inlet.top > samples.mclaren.inlet.top + 0.02,
    "Red Bull inlet is not taller than McLaren's low mouth");
  // Haas: slab — little undercut, wide parallel flank.
  assert.ok(samples.haas.shoulder.bottom < samples.mercedes.shoulder.bottom,
    "Haas slab should sit closer to the floor than Mercedes");
  assert.ok(samples.haas.waist.x > samples.mercedes.waist.x + 0.02,
    "Haas waist should stay wider than Mercedes coke-bottle");
  // McLaren: wide low inlet.
  assert.ok(samples.mclaren.inlet.x > samples.mercedes.inlet.x,
    "McLaren inlet should be the wide one");
  assert.ok(samples.mclaren.inlet.top < samples.redbull.inlet.top,
    "McLaren inlet should sit under Red Bull's tall mouth");
  // coverCrown stays on the two original stations; mid is interpolated.
  assert.ok(samples.mclaren.coverMid.top > samples.haas.coverMid.top + 0.025,
    `McLaren crown ${samples.mclaren.coverMid.top.toFixed(3)} is not proud of Haas ${samples.haas.coverMid.top.toFixed(3)}`);
  assert.ok(samples.redbull.coverMid.top > samples.mercedes.coverMid.top + 0.010,
    "Red Bull cover should sit above Mercedes' shallow crown");
  assert.ok(gaps.length === 6, gaps.join(" "));
});

test("TEAM_STYLE is frozen and never consults Math.random", () => {
  assert.ok(Object.isFrozen(Car3D.TEAM_STYLE));
  for (const k of Object.keys(Car3D.TEAM_STYLE)) assert.ok(Object.isFrozen(Car3D.TEAM_STYLE[k]), k);
  const src = `${S.Car3D}`;
  assert.doesNotMatch(String(src), /Math\.random/);
});
