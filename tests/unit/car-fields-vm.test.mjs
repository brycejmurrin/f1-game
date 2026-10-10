/* car-fields-vm.test.mjs — PERF-1: every car is born with the fields the frame loop used to add later.
 *
 * js/race/car-fields.js pre-declares ~68 late-added car fields as `undefined` in makeCars(), so the 22
 * cars share ONE V8 hidden class from frame 0 instead of drifting into 4-5 (polymorphic hot paths,
 * "wrong map" deopts, boxed doubles: scratch/hunt-consolidate/round2-perf.md PERF-1).
 *
 * What is pinned, against the real game.js in the game-vm harness:
 *   1. every listed key is present on every car right after the race is built, and a plain race adds no
 *      key the table does not list (the table is the shape — a new late field must be added to it);
 *   2. the simulation is IDENTICAL with and without the pre-declaration (per-car state hash over N steps);
 *   3. the pre-declaration is `undefined`, never 0: a control run with steerSm = 0 diverges (game.js seeds
 *      `if (c.steerSm === undefined) c.steerSm = steer`), so a "tidy" 0 default fails here;
 *   4. all cars share one hidden class (%HaveSameMap) after the frame loop ran, and without the call they
 *      do not — so the check discriminates.
 * Plus the module's own contract (idempotent, never overwrites, one key list) and the manifest entry.
 *
 * Run: node --test tests/unit/car-fields-vm.test.mjs   (npm run test:game-vm)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import v8 from "node:v8";

const require = createRequire(import.meta.url);
const { createGame, ROOT } = require("../../tools/lib/game-vm.cjs");
const MANIFEST = require("../../tools/manifest.cjs");

const FILE = "js/race/car-fields.js";
const SRC = readFileSync(new URL("../../" + FILE, import.meta.url), "utf8");
const CarFieldsStandalone = new Function(SRC.replace(/^const CarFields\b/m, "var CarFields") + "\nreturn CarFields;")();
const KEYS = CarFieldsStandalone.KEYS;

/** Boot the game. `predeclare` false swaps the module's call for a no-op BEFORE the race is built. Until
 * the manifest lists the file the module is injected the way the manifest would (the manifest test below
 * is what fails in that case, so the wiring cannot be forgotten). */
async function boot({ predeclare = true, storage = {}, patch } = {}) {
  const g = await createGame({
    storage,
    onSandbox(sandbox, ctx) {
      if (!MANIFEST.FULL.includes(FILE)) vm.runInContext(SRC.replace(/^const\b/gm, "var"), ctx, { filename: ROOT + "/" + FILE });
    },
  });
  g.ctx.GLX.makeFrustumPlanes = undefined;
  if (!predeclare) g.ctx.CarFields.predeclare = (c) => c;
  else if (patch) g.ctx.CarFields.predeclare = patch(g.ctx.CarFields.predeclare);
  await g.race("monza");
  return g;
}

function stateHash(g) {
  let h = 0;
  for (const c of g.G.cars) h += c.s * 1.37 + c.x * 7.1 + c.speed * 0.013 + (c.lap || 0) + c.prog * 0.31 + (c.rpm || 0) * 1e-4;
  return h;
}

/** Same simulation, driven by physics steps only (no render): the hash a hidden-class change must not move. */
async function simHash(opts, steps) {
  const g = await boot(opts);
  try {
    g.apex.setInput({ throttle: true, steer: 0.15 });
    for (let i = 0; i < steps; i++) g.step(1, 1 / 60);
    return stateHash(g);
  } finally { g.close(); }
}

test("table: unique keys, every group commented, one flat list", () => {
  assert.ok(KEYS.length >= 60, "the frame loop adds ~68 fields; a short table means the probe was not rerun");
  assert.equal(new Set(KEYS).size, KEYS.length, "a key listed twice");
  for (const [why, ks] of CarFieldsStandalone.GROUPS) {
    assert.ok(typeof why === "string" && why.length > 10, "a group without its reason");
    assert.ok(ks.length > 0);
  }
  assert.deepEqual(KEYS, CarFieldsStandalone.GROUPS.flatMap((x) => x[1]));
});

test("predeclare: undefined values in table order, idempotent, never overwrites", () => {
  const c = { a: 1, rank: 3, steerSm: 0.5 };
  assert.equal(CarFieldsStandalone.predeclare(c), c);
  assert.deepEqual(Object.keys(c).slice(3), KEYS.filter((k) => k !== "rank" && k !== "steerSm"));
  for (const k of KEYS) assert.ok(k in c, k);
  assert.equal(c.rank, 3);
  assert.equal(c.steerSm, 0.5);
  const keys = Object.keys(c).join();
  CarFieldsStandalone.predeclare(c);
  assert.equal(Object.keys(c).join(), keys);
  const fresh = CarFieldsStandalone.predeclare({});
  for (const k of KEYS) assert.strictEqual(fresh[k], undefined, k + " must be undefined, never 0");
});

test("manifest loads car-fields.js before game.js", () => {
  const i = MANIFEST.FULL.indexOf(FILE);
  assert.ok(i >= 0, FILE + " is not in tools/manifest.cjs FULL (add it before js/car/field-lod.js, then node tools/gen/gen-shell.mjs)");
  assert.ok(i < MANIFEST.FULL.indexOf("js/game.js"));
});

test("game.js makeCars calls CarFields.predeclare once per spawned car", () => {
  const src = readFileSync(new URL("../../js/game.js", import.meta.url), "utf8");
  assert.equal((src.match(/CarFields\.predeclare\(/g) || []).length, 1);
});

test("every key is present on every car after the race is built, and a plain race adds none", async () => {
  const g = await boot();
  try {
    const cars = g.G.cars;
    assert.ok(cars.length >= 20, "a full grid");
    for (const c of cars) for (const k of KEYS) assert.ok(k in c, `${c.code} is missing ${k} right after makeCars`);
    const before = new Set(); for (const c of cars) Object.keys(c).forEach((k) => before.add(k));
    g.apex.setInput({ throttle: true, steer: 0 });
    let now = 1000;
    for (let i = 0; i < 1500; i++) { now += 16.667; g.pumpFrame(now); }
    const added = new Set(); for (const c of g.G.cars) Object.keys(c).forEach((k) => { if (!before.has(k)) added.add(k); });
    assert.deepEqual([...added], [], "a plain race added fields CarFields does not declare: add them to the table in js/race/car-fields.js");
    const n = new Set(g.G.cars.map((c) => Object.keys(c).length));
    assert.equal(n.size, 1, "every car has the same number of own fields");
    const order = Object.keys(g.G.cars[0]).join();
    for (const c of g.G.cars) assert.equal(Object.keys(c).join(), order, "same key ORDER on every car (hidden-class sharing)");
    // V8: one hidden class. Natives syntax is switched on for this one compile only.
    v8.setFlagsFromString("--allow-natives-syntax");
    let same = null;
    try { same = new Function("a", "b", "return %HaveSameMap(a, b)"); } catch { same = null; }
    v8.setFlagsFromString("--no-allow-natives-syntax");
    if (same) for (const c of g.G.cars) assert.ok(same(g.G.cars[0], c), `${c.code} left the shared hidden class`);
  } finally { g.close(); }
});

test("without the call the cars DO split into several hidden classes (the check discriminates)", async () => {
  const g = await boot({ predeclare: false });
  try {
    g.apex.setInput({ throttle: true, steer: 0 });
    let now = 1000;
    for (let i = 0; i < 600; i++) { now += 16.667; g.pumpFrame(now); }
    v8.setFlagsFromString("--allow-natives-syntax");
    let same = null;
    try { same = new Function("a", "b", "return %HaveSameMap(a, b)"); } catch { same = null; }
    v8.setFlagsFromString("--no-allow-natives-syntax");
    if (!same) return;   // natives unavailable on this runtime: the key-order assertions above still guard
    const maps = []; for (const c of g.G.cars) { const m = maps.find((x) => same(x, c)); if (!m) maps.push(c); }
    assert.ok(maps.length > 1, "expected the unpatched cars to diverge; if V8 changed, retire this control");
  } finally { g.close(); }
});

test("the simulation is identical with and without the pre-declaration", async () => {
  const STEPS = 420;
  const without = await simHash({ predeclare: false }, STEPS);
  const withIt = await simHash({ predeclare: true }, STEPS);
  assert.ok(Number.isFinite(withIt) && withIt !== 0);
  assert.equal(withIt, without, "pre-declaring the fields changed the simulation");
});

test("control: steerSm pre-declared as 0 (not undefined) moves the simulation", async () => {
  const STEPS = 420;
  const base = await simHash({ predeclare: true }, STEPS);
  const zero = await simHash({ predeclare: true, patch: (orig) => (c) => { orig(c); c.steerSm = 0; return c; } }, STEPS);
  assert.notEqual(zero, base, "steerSm = 0 no longer changes the sim: if game.js dropped the `=== undefined` seed, relax this control");
});
