/* setup-tune.test.mjs — the SETUP sheet's contract, in a VM.
 *
 * The rule this file exists for: the WORKS sheet is exactly the car it always
 * was — every multiplier 1.0, the aero load the wing's own, the brake-bias split
 * 1/1 — for all twelve teams, and the factory (AI) path never sees a tune.
 *
 * Run: node --test tests/unit/setup-tune.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function load() {
  const stored = new Map();
  const ctx = vm.createContext({
    Math, console, Object, Array, Number, JSON, isFinite,
    GameStore: { store: { get: (k, d) => (stored.has(k) ? stored.get(k) : d), set: (k, v) => stored.set(k, v) } },
  });
  seedLog(ctx);
  ctx.window = ctx;
  for (const f of ["js/core/mat4.js", "js/physics/consts.js", "js/data/teams.js", "js/car/parts.js", "js/garage/setup-tune.js"]) {
    vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: f });
  }
  return { Teams: vm.runInContext("Teams", ctx), Parts: vm.runInContext("Parts", ctx), S: vm.runInContext("SetupTune", ctx), stored };
}
const host = (v) => JSON.parse(JSON.stringify(v));

test("the works sheet is identity for every team: mods 1.0, rake 0, brake-bias split 1/1", () => {
  const { Teams, Parts, S } = load();
  for (const t of Teams.LIST) {
    assert.deepEqual(host(S.mods(t.id)), { speed: 1, accel: 1, cornering: 1, braking: 1 }, t.id);
    assert.equal(S.rake(t.id), 0, t.id);
    assert.equal(S.isDefault(t.id), true, t.id);
    const setup = Parts.getFactorySetup(t);
    assert.equal(Parts.aeroLoad(setup, t, S.aero(t.id)), Parts.aeroLoad(setup, t), t.id + " aero");
    assert.deepEqual(host(Parts.getMods(setup, t, S.mods(t.id))), host(Parts.getMods(setup, t)), t.id + " mods");
  }
  assert.deepEqual(host(S.bbScales(S.BB_REF)), { f: 1, r: 1 });
  assert.deepEqual(host(S.bbScales(undefined)), { f: 1, r: 1 }, "no bias reads BB_REF");
});

test("bars move the four channels the way the sheet says, inside the ±5 % clamp", () => {
  const { S } = load();
  S.set("mclaren", { arbF: 11, arbR: 11 });          // stiff overall (+5 / +4 from 6/7)
  let m = S.mods("mclaren");
  assert.ok(m.cornering > 1 && m.accel < 1, "sharper turn-in, less traction");
  assert.ok(m.cornering <= 1.05 && m.accel >= 0.95, "clamped");
  S.set("mclaren", { arbF: 11, arbR: 1 });           // front-stiff split
  m = S.mods("mclaren");
  assert.ok(m.braking > 1, "stable under braking");
  S.reset("mclaren");
  assert.deepEqual(host(S.mods("mclaren")), { speed: 1, accel: 1, cornering: 1, braking: 1 });
});

test("rake adds aero load on top of the wing and clamps at the ends; the factory path ignores it", () => {
  const { Teams, Parts, S } = load();
  const t = Teams.LIST.find((x) => x.id === "williams");
  const base = Parts.aeroLoad(Parts.getFactorySetup(t), t);
  S.set(t.id, { rideF: 15, rideR: 80 });              // max rake
  const r = S.rake(t.id);
  assert.ok(r > 0 && r <= 1, "rake " + r);
  const up = Parts.aeroLoad(Parts.getFactorySetup(t), t, S.aero(t.id));
  assert.ok(Math.abs(up - Math.min(1, base + Parts.RH_GAIN * r)) < 1e-9);
  S.set(t.id, { rideF: 35, rideR: 40 });              // min rake
  assert.ok(Parts.aeroLoad(Parts.getFactorySetup(t), t, S.aero(t.id)) < base);
  assert.equal(Parts.aeroLoad(Parts.getFactorySetup(t), t), base, "no tune, no change");
  assert.equal(Parts.aeroLoad(Parts.getFactorySetup(t), t, { rake: 1 }) <= 1, true);
});

test("brake bias: forward spends the front's circle, rearward the rear's; the wheel's range is 50–62 in halves", () => {
  const { S } = load();
  const fwd = S.bbScales(0.60), rear = S.bbScales(0.52);
  assert.ok(fwd.f > 1 && fwd.r < 1);
  assert.ok(rear.f < 1 && rear.r > 1);
  S.set("ferrari", { brakeBias: 61.3 });
  assert.equal(S.get("ferrari").brakeBias, 61.5, "snapped to the 0.5 step");
  S.set("ferrari", { brakeBias: 99 });
  assert.equal(S.get("ferrari").brakeBias, 62, "clamped to the wheel's range");
  assert.equal(S.brakeBias("ferrari"), 0.62);
});

test("a damaged sheet falls back per field, and reset restores the works numbers", () => {
  const { S, stored } = load();
  stored.set("setup.haas", { arbF: "x", arbR: 3, rideF: null, brakeBias: 54 });
  const t = S.get("haas");
  assert.equal(t.arbF, S.defaults("haas").arbF);
  assert.equal(t.arbR, 3);
  assert.equal(t.rideF, S.defaults("haas").rideF);
  assert.equal(t.brakeBias, 54);
  assert.equal(S.isDefault("haas"), false);
  S.reset("haas");
  assert.deepEqual(host(S.get("haas")), host(S.defaults("haas")));
});
