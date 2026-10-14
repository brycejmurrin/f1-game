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
 *      do not — so the check discriminates; and every car is still in FAST mode (%HasFastProperties) after
 *      the frame loop — a control with the old keyed-store loop (`c[KEYS[i]] = undefined`) leaves them in
 *      dictionary mode, which %HaveSameMap cannot see (normalized maps are shared). PERF-HUNT-2 S2;
 *   5. predeclare's body is one NAMED store per key, in KEYS order (the source list cannot drift from GROUPS);
 *   6. warmShape (PERF-HUNT-4 B-F1, run by gridUp) changes no value, sentinel or key, and over a full lap plus a
 *      pit stop: no car field widens its value kind (integer -> fraction, undefined/null -> number ...) unless WARM
 *      names it, the simulation digest is identical with warmShape a no-op, and the cars stay in one fast map;
 *   7. MUTABLE (B-F1b: fields whose V8 constness, not representation, a late rewrite flips) is a small table of keys
 *      every car has at the grid, and a race run to results adds no car key and leaves every car in fast mode.
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
import { gameSource } from "../helpers/game-source.mjs";

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
async function boot({ predeclare = true, storage = {}, patch, warm, laps } = {}) {
  const g = await createGame({
    storage,
    onSandbox(sandbox, ctx) {
      if (!MANIFEST.FULL.includes(FILE)) vm.runInContext(SRC.replace(/^const\b/gm, "var"), ctx, { filename: ROOT + "/" + FILE });
    },
  });
  g.ctx.GLX.makeFrustumPlanes = undefined;
  if (!predeclare) g.ctx.CarFields.predeclare = (c) => c;
  else if (patch) g.ctx.CarFields.predeclare = patch(g.ctx.CarFields.predeclare);
  // warm: false swaps warmShape for a no-op; a function wraps it (called with the original).
  if (warm === false) g.ctx.CarFields.warmShape = (c) => c;
  else if (warm) g.ctx.CarFields.warmShape = warm(g.ctx.CarFields.warmShape);
  if (laps) await g.race("monza", "day", "dry", { laps });
  else await g.race("monza");
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
  const src = gameSource();
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
    const fast = nativeFast();
    if (fast) {
      const slow = [...g.G.cars].filter((c) => !fast(c)).map((c) => c.code);   // spread: a main-realm array
      assert.deepEqual(slow, [], "cars fell into dictionary mode after 1500 frames (a keyed store, a delete, or too many fields?)");
    }
  } finally { g.close(); }
});

/** %HasFastProperties, compiled with natives syntax switched on for that one compile; null when unavailable. */
function nativeFast() {
  v8.setFlagsFromString("--allow-natives-syntax");
  let f = null;
  try { f = new Function("o", "return %HasFastProperties(o)"); } catch { f = null; }
  v8.setFlagsFromString("--no-allow-natives-syntax");
  return f;
}

test("control: the old KEYED-store predeclare leaves every car in dictionary mode (the fast check discriminates)", async () => {
  const keyed = (c) => { for (let i = 0; i < KEYS.length; i++) if (!(KEYS[i] in c)) c[KEYS[i]] = undefined; return c; };
  const g = await boot({ patch: () => keyed });
  try {
    const fast = nativeFast();
    if (!fast) return;   // natives unavailable on this runtime
    assert.equal(g.G.cars.filter((c) => fast(c)).length, 0, "keyed stores no longer normalize the cars: if V8 changed, retire this control");
  } finally { g.close(); }
});

test("predeclare source: one NAMED store per key, in KEYS order", () => {
  const from = SRC.slice(SRC.indexOf("function predeclare(c)"));
  const body = from.slice(0, from.indexOf("return c;"));
  const stores = [...body.matchAll(/if \(!\("(\w+)" in c\)\) c\.(\w+) = undefined;/g)];
  for (const m of stores) assert.equal(m[1], m[2], "the `in` test and the store name differ: " + m[0]);
  assert.deepEqual(stores.map((m) => m[1]), [...KEYS], "predeclare's named stores drifted from GROUPS: regenerate the list");
  assert.ok(!/\[\s*KEYS\s*\[/.test(body), "predeclare must not use keyed stores (dictionary-mode cars)");
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

// ---- warmShape (PERF-HUNT-4 B-F1) -------------------------------------------------------------------------------

/** The value kinds whose mix decides a V8 field representation: Smi < Double < Tagged; HeapObject < Tagged. */
const kindOf = (v) => {
  if (typeof v === "number") return Number.isInteger(v) && !Object.is(v, -0) && v >= -(2 ** 30) && v < 2 ** 30 ? "smi" : "dbl";
  if (v === undefined || v === null || typeof v === "boolean") return "odd";
  return typeof v === "string" ? "str" : "obj";
};
/** Generalized representation rank of a set of kinds (higher = wider). */
function repRank(set) {
  const num = set.has("smi") || set.has("dbl"), heap = set.has("odd") || set.has("str") || set.has("obj");
  if (num && heap) return 3;
  if (num) return set.has("dbl") ? 1 : 0;
  return set.size === 1 && set.has("obj") ? 0.5 : 2;
}

test("WARM table: unique keys, every group commented, one flat list", () => {
  const W = CarFieldsStandalone.WARM;
  assert.ok(W.length >= 60, "the probe found ~110 fields; a short table means it was not rerun");
  assert.equal(new Set(W).size, W.length, "a key listed twice");
  for (const [why, ks] of CarFieldsStandalone.WARM_GROUPS) { assert.ok(typeof why === "string" && why.length > 10); assert.ok(ks.length > 0); }
  assert.deepEqual(W, CarFieldsStandalone.WARM_GROUPS.flatMap((x) => x[1]));
  for (const k of ["lastLap", "uslipHapT", "lockHapT"]) assert.ok(KEYS.includes(k), k + " is pre-declared (the first lap line / player haptics added it mid-race)");
});

test("MUTABLE table: unique keys, every group commented, one flat list, disjoint from WARM", () => {
  const M = CarFieldsStandalone.MUTABLE, W = new Set(CarFieldsStandalone.WARM);
  assert.ok(M.length > 0);
  assert.equal(new Set(M).size, M.length, "a key listed twice");
  for (const [why, ks] of CarFieldsStandalone.MUTABLE_GROUPS) { assert.ok(typeof why === "string" && why.length > 10); assert.ok(ks.length > 0); }
  assert.deepEqual(M, CarFieldsStandalone.MUTABLE_GROUPS.flatMap((x) => x[1]));
  assert.deepEqual(M.filter((k) => W.has(k)), [], "a WARM key already leaves the grid mutable (its 0.5 store)");
  // Node 22's V8 normalizes a car on a named ADD once its map has > 128 mutable out-of-object fields; the grid sits
  // at ~86 + this list. Growing it past ~40 makes the harness's (and netplay's) post-grid netInput add a dictionary.
  assert.ok(M.length <= 24, "MUTABLE is for fields first rewritten LATE (laps in); see the 128-field note in car-fields.js");
});

test("warmShape: every value and sentinel back exactly, no key added, key order kept", () => {
  const c = { prog: -14, x: 0, speed: 0, rank: undefined, aiBias: null, steerSm: undefined, flatSpot: -0, offT: NaN, other: 0,
    pitState: "none", pitStops: 0, boostOn: false, pitNext: null, cutWarn: -0 };
  const before = Object.keys(c).map((k) => [k, c[k]]);
  assert.equal(CarFieldsStandalone.warmShape(c), c);
  assert.deepEqual(Object.keys(c), before.map((e) => e[0]), "no key added, order kept");
  for (const [k, v] of before) assert.ok(Object.is(c[k], v), k + " changed");
  assert.deepEqual(Object.keys(CarFieldsStandalone.warmShape({})), [], "a field the car does not have is never added");
});

test("game.js gridUp calls CarFields.warmShape for every car", () => {
  const src = gameSource();
  assert.equal((src.match(/CarFields\.warmShape\(/g) || []).length, 1);
  const body = src.slice(src.indexOf("function gridUp("), src.indexOf("function seedPlayerPose("));
  assert.ok(/for \(const c of cars\) CarFields\.warmShape\(c\)/.test(body), "the call lives in gridUp, over every car");
});

/** A full lap plus a pit stop on monza (the player handed to the AI, one AI car's stop called at the start).
 * Returns the digest chain, `widened` (every field whose value kind generalized after the grid), `added` (keys a
 * car gained), and the fast-mode / one-map verdicts after the run. */
async function lapAndPit(opts) {
  const g = await boot({ storage: { tyreWear: "real", reliability: "off" }, laps: 3, ...opts });
  try {
    const G = g.G, A = g.apex;
    A.carRole(G.cars.indexOf(G.player), { human: false });
    const pitter = G.cars.findIndex((c) => !c.human && c !== G.player && c.gridPos === 3);
    A.pit({ car: pitter, arm: true });
    const grid = new Map(), seen = new Map(), added = new Set();
    for (const c of G.cars) for (const k of Object.keys(c)) (grid.get(k) || grid.set(k, new Set()).get(k)).add(kindOf(c[k]));
    const unknownMutable = CarFieldsStandalone.MUTABLE.filter((k) => !G.cars.every((c) => k in c));
    for (const [k, s] of grid) seen.set(k, new Set(s));
    const P = G.cars[pitter];
    const snap = () => G.cars.map((c) => [c.s, c.x, c.speed, c.head, c.lap, c.prog, c.energy, c.tyreWear, c.pitStops, c.rpm].join(",")).join(";");
    const done = () => (P.pitStops || 0) >= 1 && (P.pitState || "none") === "none" && G.cars.every((c) => c.retired || c.lap >= 2);
    let chain = "", steps = 0;
    while (steps < 12000 && !done()) {
      g.step(1, 1 / 60); steps++;
      if (steps % 300 === 0) chain += snap() + "|";
      if (steps % 3) continue;
      for (const c of G.cars) for (const k of Object.keys(c)) {
        let s = seen.get(k);
        if (!s) { s = new Set(); seen.set(k, s); added.add(k); }
        s.add(kindOf(c[k]));
      }
    }
    chain += snap();
    const widened = [];
    for (const [k, g0] of grid) if (repRank(seen.get(k)) > repRank(g0)) widened.push(k);
    const fast = nativeFast();
    v8.setFlagsFromString("--allow-natives-syntax");
    let sameFn = null;
    try { sameFn = new Function("a", "b", "return %HaveSameMap(a, b)"); } catch { sameFn = null; }
    v8.setFlagsFromString("--no-allow-natives-syntax");
    return {
      digest: chain, widened, added: [...added], steps, pitted: P.pitStops || 0, done: done(), unknownMutable,
      slow: fast ? [...G.cars].filter((c) => !fast(c)).map((c) => c.code) : null,   // spread: a main-realm array
      // The AI field only: the harness's carRole() hand-over gives the player car a `netInput` key no race adds.
      same: sameFn ? [...G.cars].filter((c) => c !== G.player).every((c, i, ai) => sameFn(ai[0], c)) : null,
    };
  } finally { g.close(); }
}

test("a lap plus a pit stop: warmShape changes no value, no field widens outside WARM, the sim is identical", async () => {
  const bad = [];
  const on = await lapAndPit({
    warm: (orig) => (c) => {
      const before = Object.keys(c).map((k) => [k, c[k]]);
      orig(c);
      if (Object.keys(c).join() !== before.map((e) => e[0]).join()) bad.push(c.code + ": keys changed");
      for (const [k, v] of before) if (!Object.is(c[k], v)) bad.push(c.code + "." + k);
      return c;
    },
  });
  assert.deepEqual(bad, [], "warmShape changed a value or a key");
  assert.ok(on.done, `the run must reach a full lap and a completed stop (${on.steps} steps, ${on.pitted} stop)`);
  const W = new Set(CarFieldsStandalone.WARM);
  assert.ok(on.widened.length > 10, `the scan must see the race widen fields (${on.widened.length}), or the next check proves nothing`);
  assert.deepEqual(on.widened.filter((k) => !W.has(k)), [],
    "a race widened these car fields' value kinds after the grid: add them to WARM_GROUPS in js/race/car-fields.js");
  assert.deepEqual(on.added, [], "a lap plus a pit stop added keys CarFields does not declare");
  assert.deepEqual(on.unknownMutable, [], "MUTABLE names a field the cars do not have at the grid (renamed? drop it)");
  if (on.slow) assert.deepEqual(on.slow, [], "cars fell into dictionary mode (warmShape must never add a key)");
  if (on.same != null) assert.ok(on.same, "every car still shares one hidden class");
  const off = await lapAndPit({ warm: false });
  assert.equal(off.steps, on.steps, "the same run length with warmShape a no-op");
  assert.equal(off.digest, on.digest, "warmShape changed the simulation");
});

// ---- the finish (PERF-HUNT-4 B-F1b) -----------------------------------------------------------------------------
// coast() gave a finished car `_coastHeld` and endRace gave every car `classified`, both as NEW keys. By the flag a
// car's map holds > 128 mutable out-of-object fields, and Node 22's V8 (12.4, --max-fast-properties) turns an object
// into a DICTIONARY on a named add past that: each finisher left the shared map for the rest of the race (a burst
// of ~30 "wrong map" deopts at the first finish), and every car was a dictionary at results. CarFields declares both.
test("a race to the flag and results adds no car key and leaves every car in fast mode", async () => {
  const g = await boot({ storage: { tyreWear: "real", reliability: "off" }, laps: 1 });
  try {
    const G = g.G;
    g.apex.carRole(G.cars.indexOf(G.player), { human: false });
    const before = new Set(); for (const c of G.cars) Object.keys(c).forEach((k) => before.add(k));
    let steps = 0;
    while (G.state !== "results" && steps < 20000) { g.step(1, 1 / 60); steps++; }
    assert.equal(G.state, "results", `the race must reach results (${steps} steps)`);
    assert.ok(G.cars.some((c) => c._coastHeld), "a finisher coasted to the floor (else the _coastHeld path is not exercised)");
    const added = new Set(); for (const c of G.cars) Object.keys(c).forEach((k) => { if (!before.has(k)) added.add(k); });
    added.delete("netInput");   // the harness's carRole() hand-over, not the race
    assert.deepEqual([...added], [], "the finish added car keys CarFields does not declare");
    const fast = nativeFast();
    if (fast) assert.deepEqual([...G.cars].filter((c) => !fast(c)).map((c) => c.code), [], "cars fell into dictionary mode by results");
  } finally { g.close(); }
});
