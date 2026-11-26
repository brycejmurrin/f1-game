/* factory-parts-parity — the works car races at ×1.0 speed/accel plus a half grip reserve (Bryce, 2026-11-25).
 *
 * The catalog multiplies twelve categories, so a team's FACTORY_PRESETS build read 1.1–2.8× per stat
 * (McLaren cornering 2.76) while the AI field (tierV × skill) never reads mods: a factory-kit player
 * lapped Monza at 101.7–104.8 s against 114.0 s on neutral parts. Parts.playerMods reads the player's
 * build RELATIVE to the team's works build, so:
 *   - every team's works build is exactly ×1.0 in speed and accel (the neutral car the field is tuned
 *     against); cornering and braking keep a GRIP RESERVE of max(1, raw)^0.5 (Parts.worksMods). Bryce
 *     picked that (B, #6705) after "braking and grip got worse": ×1.0 had halved the works car's grip;
 *   - the build's character survives where it never touched the stat multipliers: the fitted wing's
 *     aeroLoad and the ERS unit's ersProfile still differ team to team;
 *   - a part above the works one multiplies in exactly as it does in raw getMods (upgrades stack);
 *   - the custom team (no preset) is unchanged, and the stat bars read the team's own stats × the reserve.
 *
 * Run: node --test tests/unit/factory-parts-parity.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadParts } from "../../tools/car/parts-sweep.mjs";

const { Parts, Teams } = loadParts();
const K = ["speed", "accel", "cornering", "braking"];
const REAL = Teams.LIST.filter((t) => Parts.FACTORY_PRESETS[t.id]);
const team = (id) => Teams.LIST.find((t) => t.id === id);

test("every works build races at ×1.0 speed/accel and the half grip reserve in cornering/braking", () => {
  assert.equal(REAL.length, 11);
  assert.deepEqual({ ...Parts.RESERVE }, { speed: 0, accel: 0, cornering: 0.5, braking: 0.5 });
  for (const t of REAL) {
    const m = Parts.playerMods(Parts.getFactorySetup(t), t), w = Parts.worksMods(t);
    const raw0 = Parts.getMods(Parts.getFactorySetup(t), t);
    for (const k of K) {
      const want = k === "cornering" || k === "braking" ? Math.sqrt(Math.max(1, raw0[k])) : 1;
      assert.ok(Math.abs(w[k] - want) < 1e-12, `${t.id} ${k} worksMods ${w[k]} want ${want}`);
      assert.ok(Math.abs(m[k] - want) < 1e-12, `${t.id} ${k} ${m[k]} want ${want}`);
    }
    // The raw build it replaced was far off 1: the normalisation is doing the work.
    const raw = Parts.getMods(Parts.getFactorySetup(t), t);
    assert.ok(K.some((k) => Math.abs(raw[k] - 1) > 0.15), `${t.id} raw build is not already ×1`);
  }
});

test("the works build's character survives in the wing and the ERS unit", () => {
  const load = (id) => Parts.aeroLoad(Parts.getFactorySetup(team(id)), team(id));
  for (const lowDrag of ["williams", "haas", "cadillac"]) for (const wing of ["mclaren", "astonmartin", "redbull"])
    assert.ok(load(wing) > load(lowDrag) + 0.3, `${wing} ${load(wing).toFixed(3)} vs ${lowDrag} ${load(lowDrag).toFixed(3)}`);
  const ers = new Set(REAL.map((t) => JSON.stringify(Parts.ersProfile(Parts.getFactorySetup(t), t))));
  assert.ok(ers.size >= 6, `distinct ERS profiles across the grid: ${ers.size}`);
});

test("an upgrade above the works part multiplies in exactly as before", () => {
  let checked = 0;
  for (const t of REAL) {
    const works = Parts.getFactorySetup(t);
    for (const cat of Parts.CATALOG) {
      const cur = cat.options.find((o) => o.id === works[cat.id]);
      for (const k of K) {
        const v = (o) => (o[k] !== undefined ? o[k] : 1);
        const up = cat.options.filter((o) => Parts.isOptionAvailable(o, t) && v(o) > v(cur) * 1.01)
          .sort((a, b) => v(b) - v(a))[0];
        if (!up) continue;
        const next = Object.assign({}, works, { [cat.id]: up.id });
        const before = Parts.playerMods(works, t)[k], after = Parts.playerMods(next, t)[k];
        const rawGain = Parts.getMods(next, t)[k] / Parts.getMods(works, t)[k];
        assert.ok(after > before, `${t.id} ${cat.id}→${up.id} ${k}`);
        assert.ok(Math.abs(after / before - rawGain) < 1e-9, `${t.id} ${cat.id}→${up.id} ${k}: same gain as raw`);
        checked++;
      }
    }
  }
  assert.ok(checked > 50, `upgrade paths checked: ${checked}`);
});

test("the custom team (no preset) is untouched: playerMods is getMods", () => {
  const custom = { id: "custom", engine: null };
  const setup = { engine: Parts.CATALOG[0].options[1].id };
  const a = Parts.playerMods(setup, custom), b = Parts.getMods(setup, custom);
  for (const k of K) assert.ok(Math.abs(a[k] - b[k]) < 1e-12, k);
});

test("garage stat bars: the works car reads its team's own stats; an upgrade reads above them", () => {
  for (const t of REAL) {
    // The bars read the car the player drives: the team's own stats times the works reserve (×1.0 in
    // speed/accel, so those two bars ARE the team's stats).
    const m = Parts.playerMods(Parts.getFactorySetup(t), t), w = Parts.worksMods(t);
    for (const k of K) assert.equal(Math.round(Parts.displayStat(t.stats[k] * m[k])), Math.round(Parts.displayStat(t.stats[k] * w[k])), `${t.id} ${k}`);
    for (const k of ["speed", "accel"]) assert.equal(Math.round(Parts.displayStat(t.stats[k] * m[k])), t.stats[k], `${t.id} ${k}`);
  }
  const t = team("williams"), works = Parts.getFactorySetup(t);
  const brakes = Parts.CATALOG.find((c) => c.id === "brakes");
  const cur = brakes.options.find((o) => o.id === works.brakes);
  const up = brakes.options.filter((o) => Parts.isOptionAvailable(o, t) && (o.braking || 1) > (cur.braking || 1) * 1.05)[0];
  assert.ok(up, "a stronger brake exists for williams");
  const m = Parts.playerMods(Object.assign({}, works, { brakes: up.id }), t);
  assert.ok(Math.round(Parts.displayStat(t.stats.braking * m.braking)) > Math.round(Parts.displayStat(t.stats.braking * Parts.worksMods(t).braking)), "the bar moves up");
});

test("a career regulation keys the norm: a banned works part costs the player nothing extra", () => {
  const t = team("ferrari"), works = Parts.getFactorySetup(t);
  const banned = works.engine;
  try {
    Parts.setLegality((o) => o.id !== banned, "test-ban");
    const m = Parts.playerMods(Parts.getFactorySetup(t), t), w = Parts.worksMods(t);
    for (const k of K) assert.ok(Math.abs(m[k] - w[k]) < 1e-12, `${k} ${m[k]} vs the legal works car ${w[k]}`);
  } finally { Parts.setLegality(null, ""); }
});

test("free-play cap: the works car is free, BUDGET is the upgrade allowance on top of it", () => {
  for (const t of REAL) {
    const works = Parts.getCost(Parts.getFactorySetup(t), t);
    assert.equal(Parts.freeBudget(t) - works, Parts.BUDGET, `${t.id}: ${works} + ${Parts.BUDGET}`);
  }
  assert.equal(Parts.freeBudget({ id: "custom", engine: null }), Parts.BUDGET + Parts.getCost({}, { id: "custom", engine: null }));
});
