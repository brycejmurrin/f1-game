// BODY styles (livery `bodyStyle`, Car3D.BODY_STYLES / bodyStyleKey): a livery
// can put any chassis — a concept body or another team's — on any car. Pins that
// every body builds and actually moves the hull, that an unknown or "team" value
// falls back to the team's own, that the decal anchors key on the SAME body the
// mesh is built from (or sponsor boards float off a reshaped nose), and that no
// concept body lowers CarBodyGeom's NOSE_DROOP_FLOOR — the flap solver's floor
// is derived over every style, so a deeper droop would move every car's wing.
//
// Run: node --test tests/unit/body-styles.test.mjs   (npm run test:tooling-fast; ~3 s, no browser)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

const M = loadParts();
const { Car3D, Parts, Teams } = M;
const Liveries = (() => { const ctx = { console, Math, Object, Array, JSON, Number, String, Boolean, Map, Set };
  vm.createContext(ctx); vm.runInContext(fs.readFileSync("js/car/liveries.js", "utf8"), ctx);
  return vm.runInContext("Liveries", ctx); })();
const team = Teams.LIST.find((t) => t.id === "ferrari");
const tiers = Parts.getVisualTiers(Parts.getFactorySetup(team), team);
const build = (bodyStyle) => Car3D.buildComplete(team.color, team.color2,
  { livery: { c1: team.color, c2: team.color2, bodyStyle }, teamId: team.id, num: 16, parts: tiers });

test("bodyStyleKey: a known body wins, anything else is the team's own", () => {
  assert.equal(Car3D.bodyStyleKey("ferrari", "needle"), "needle");
  assert.equal(Car3D.bodyStyleKey("ferrari", "mclaren"), "mclaren");
  for (const v of [undefined, null, "", "team", "nope"]) assert.equal(Car3D.bodyStyleKey("ferrari", v), "ferrari", String(v));
  assert.deepEqual([...Car3D.BODY_STYLE_IDS].sort(), [...Object.keys(Car3D.BODY_STYLES), ...Object.keys(Car3D.TEAM_STYLE)].sort());
});

test("every body builds a finite car whose hull differs from the team's own", () => {
  const base = build(undefined);
  for (const id of Car3D.BODY_STYLE_IDS) {
    if (id === team.id) continue;
    const d = build(id);
    assert.ok(d.pos.every(Number.isFinite), `${id}: non-finite vertex`);
    let moved = d.pos.length !== base.pos.length ? Infinity : 0;
    for (let i = 0; moved !== Infinity && i < d.pos.length; i++) moved = Math.max(moved, Math.abs(d.pos[i] - base.pos[i]));
    assert.ok(moved >= 0.005, `${id}: hull moved only ${(moved * 1000).toFixed(1)} mm`);
  }
});

test("decal anchors follow the body the mesh is built from", () => {
  const own = Car3D.bodyAnchors(tiers, Car3D.bodyStyleKey(team.id, undefined));
  for (const id of Object.keys(Car3D.BODY_STYLES)) {
    const a = Car3D.bodyAnchors(tiers, Car3D.bodyStyleKey(team.id, id));
    assert.notEqual(a.key, own.key, `${id}: anchors key on the team, not the body`);
    assert.notDeepEqual(a.noseAt(2.1), own.noseAt(2.1), `${id}: nose anchor did not move`);
  }
});

test("no concept body lowers the flap solver's nose-droop floor", () => {
  // The CarBodyGeom NOSE_DROOP_FLOOR formula, over the team bodies alone vs all.
  const zMid = Car3D.CHASSIS.nose[1].z, zTip = Car3D.CHASSIS.nose[0].z;
  const floor = (styles) => {
    let worst = 0;
    for (const st of styles) {
      const d = st.noseDroop || 0;
      if (d >= 0) continue;
      for (const z of [2.00, 2.16]) {
        const t = Math.max(0, Math.min(1, (z - zMid) / (zTip + (st.noseTipZ || 0) - zMid)));
        worst = Math.min(worst, d * (0.4 + 0.6 * t));
      }
    }
    return worst;
  };
  const teams = Object.values(Car3D.TEAM_STYLE);
  assert.equal(floor([...teams, ...Object.values(Car3D.BODY_STYLES)]), floor(teams));
});

test("bodyStyle is a published livery field and the garage's copy list carries it", () => {
  assert.ok(Liveries.FIELDS.includes("bodyStyle"));
  assert.match(fs.readFileSync("js/car/custom-liveries.js", "utf8"), /"bodyStyle"\]/);
  assert.match(fs.readFileSync("js/garage/setup-camera.js", "utf8"), /SP_HULL_GEOM_FIELDS = \[[^\]]*"bodyStyle"/);
});
