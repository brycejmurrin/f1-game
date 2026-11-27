/* car-fields-lifetimes-vm.test.mjs — the per-car reset table (js/race/car-fields.js RESETS, #6945 U1.1 of #6920).
 *
 * gridUp (a new race), rescuePlayer (RECOVER, the auto-rescue, an incident handback), redFlagRestart (a standing
 * re-grid) and __apex.reset() (an agent episode, #6946 U1.2) used to reset car fields with hand-kept inline runs
 * (and, for the episode, apex.js's EPISODE_TRANSIENTS list). The fields they reset now live in ONE table, each row a key, a lifetime tag, the ops that
 * reset it with a value per op, and a why note; CarFields.resetFor(c, op) applies it.
 *
 * What is pinned:
 *   1. THE HASH PROOF. A digest of every own field of all cars, after gridUp and again after G.rescuePlayer on a
 *      player placed off the road with sentinels in the rescue fields. The two constants were captured on the
 *      PRE-MIGRATION tip (16237b50) and are never regenerated in a refactor: determinism-replay-vm and
 *      agent-determinism-vm compare a replay against a replay inside one build, so a consistent behaviour change
 *      passes them. A real behaviour change to these paths updates the constants in its own PR, with the reason.
 *   2. resetFor(o, op) on a PLAIN object stamped with sentinels resets exactly the rows that name `op`, to their
 *      declared values, and leaves every other row alone (a plain object: sentinel stamps on a live car would widen
 *      its shared V8 field representations for the rest of the VM).
 *   3. On a live car resetFor adds no key (Object.keys order identical) and the car stays in fast mode.
 *   4. Every 'keep' and every 'caller' row has a why note; the ops are exactly newRace, rescue, redFlag and episode,
 *      each applied by its one call site, which writes none of its rows inline; EPISODE_TRANSIENTS is gone.
 *   5. declareNewRace (the named-store ADDs for the fields a spawned car lacks) matches the table and a real spawn,
 *      so no newRace row is silently skipped by resetFor's keyed loop over existing fields.
 *
 * Run: node --test tests/unit/car-fields-lifetimes-vm.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import v8 from "node:v8";
import { symbolSource } from "../helpers/game-source.mjs";
import { fnSource } from "../helpers/fn-source.mjs";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const SRC = readFileSync(new URL("../../js/race/car-fields.js", import.meta.url), "utf8");
const CF = new Function(SRC.replace(/^const CarFields\b/m, "var CarFields") + "\nreturn CarFields;")();

// Captured on the pre-migration tip 16237b50 (node --test this file with APEX_PRINT_DIGEST=1). NEVER regenerate in
// a refactor: a change here means the migration changed a car field.
const DIGEST_GRID = "035ff5eb4e69a35dfd26e76301d200ff3549b00d5ddd6206368e447e957a6334";
const DIGEST_RESCUE = "104b218716076d5c6adbcda2e3217890104d62631d7c7d1580013025a1b8a886";

/** Object.is-exact serialisation: -0, NaN and undefined kept apart; an object by its own key list; another car by
 * its index; the circuit by name. */
function ser(v, cars, G, depth, seen) {
  if (v === undefined) return "u";
  if (v === null) return "n";
  const t = typeof v;
  if (t === "number") return Object.is(v, -0) ? "-0" : String(v);
  if (t === "string") return JSON.stringify(v);
  if (t === "boolean") return v ? "T" : "F";
  if (t === "function") return "fn";
  if (t !== "object") return t;
  const ci = cars.indexOf(v);
  if (ci >= 0) return "car#" + ci;
  if (v === G.track) return "track";
  if (seen.has(v)) return "cyc";
  if (depth > 6) return "deep";
  seen.add(v);
  let out;
  if (ArrayBuffer.isView(v)) out = v.constructor.name + "[" + Array.from(v, (x) => ser(x, cars, G, depth + 1, seen)).join(",") + "]";
  else if (Array.isArray(v)) out = "[" + v.map((x) => ser(x, cars, G, depth + 1, seen)).join(",") + "]";
  else out = "{" + Object.keys(v).map((k) => k + ":" + ser(v[k], cars, G, depth + 1, seen)).join(",") + "}";
  seen.delete(v);
  return out;
}

// The car's own keys SORTED: the key SET and every value are pinned, not the order a key was first added in (moving
// gridUp's run into one resetFor call adds its never-seen keys in table order, around OvertakeMode.reset's ot* adds;
// that is V8 shape, which tests/unit/car-fields-vm.test.mjs pins as one fast map, not car state).
function carText(c, cars, G) {
  return Object.keys(c).sort().map((k) => k + "=" + (k === "track" ? "track" : ser(c[k], cars, G, 0, new Set()))).join("\n");
}

function digest(G) {
  const cars = [...G.cars];
  const h = createHash("sha256");
  for (const c of cars) h.update(carText(c, cars, G) + "\n--\n");
  return h.digest("hex");
}

// Sentinels in every field rescuePlayer resets, so the digest sees the reset and not a coincidental match.
const RESCUE_SENTINELS = {
  vLat: 0.37, yawRateCur: 0.21, yawVis: 0.11, steerVis: 0.13, skidIntensity: 0.4, wheelLock: 0.3, towing: 0.6,
  boostOn: true, deploying: true, xOn: true, aeroX: 0.6, xArmed: true,
  wrongT: 1.5, wrongWay: true, offT: 2.25, offCut: true, wallT: 0.75, wasOnWall: true, rescueT: 3.5,
};

async function bootRace() {
  const g = await createGame({});
  await g.race("monza");
  return g;
}

test("gridUp and rescuePlayer leave every car field byte-identical (digest pinned on the pre-migration tip)", async () => {
  const g = await bootRace();
  try {
    const G = g.G;
    assert.ok(G.cars.length >= 20, "a full grid");
    const grid = digest(G);
    const p = G.player;
    p.x = 9;   // off the road
    Object.assign(p, RESCUE_SENTINELS);
    G.rescuePlayer(p);
    const rescue = digest(G);
    if (process.env.APEX_PRINT_DIGEST) console.log(JSON.stringify({ grid, rescue }));
    assert.equal(grid, DIGEST_GRID, "a car field after gridUp changed");
    assert.equal(rescue, DIGEST_RESCUE, "a car field after rescuePlayer changed");
  } finally { g.close(); }
});

// ── redFlag and episode (#6946 U1.2) ──────────────────────────────────────────────────────────────────────────────

// Captured on the pre-migration tip 059e6cff (U1.1 merged; APEX_PRINT_DIGEST=1). NEVER regenerate in a refactor.
// DIGEST_REDFLAG re-recorded for #7155 (wall and side-rub scrubs scale with PACE: an intended behaviour change, not a refactor; DIGEST_EPISODE unchanged).
const DIGEST_REDFLAG = "cd4a0b609e13fa9445cda5209008c3fee99f8f9c7804f019f821716a968d768a";
const DIGEST_EPISODE = "bbb8d11adc2cf50b200a73fa881c0e5200a2e48fb9dc14c4bed1ee32d5efb2e7";

// Stamp a sentinel into every listed field a car HAS (a number 0.37, a boolean true, a car reference the next car),
// so the digest sees each reset and each survivor, not a coincidental match. Only existing keys: never add one.
function stamp(G, keys, which) {
  const cars = G.cars;
  for (const i of which) {
    const c = cars[i];
    for (const k of keys) {
      if (!(k in c)) continue;
      const v = c[k];
      if (typeof v === "boolean") c[k] = !v;
      else if (typeof v === "number" || v === undefined || v === null) c[k] = k === "passOf" || k === "passFailOf" || k === "_qOf" || k === "_trOf" || k === "_alPrev" ? cars[(i + 1) % cars.length] : 0.37;
    }
  }
}
// What redFlagRestart and clearRacingScratch write with a plain value, and what a red flag must leave alone.
const REDFLAG_STAMP = ["speed", "accSm", "corridorAccel", "vLat", "yawRateCur", "steerVis", "aiHead", "aiBias", "aiFam",
  "hYieldT", "laneClr", "gear", "rpm", "xOn", "aeroX", "xArmed", "towing", "wake", "wheelLock", "contactT", "wrongWay",
  "wrongT", "rescueT", "rescueLastT", "digEscHeld", "offT", "offCut", "wallT", "wasOnWall", "kerbGripSm", "kerbCueT",
  "brakeStab", "axEstSm", "stuckT", "letPassT", "passOf", "passT", "passCool", "holdOff", "defendSide", "passFailOf",
  "passFailT", "errT", "pressT", "zoneKey", "queueT", "_qOf", "trailT", "_trOf", "_trYT", "_trYS", "calmUntil", "calm",
  "sbsT", "atkOn", "atkWant", "runT", "_alPrev", "paceF", "yawVis", "rPrevYawVis",
  // survivors: same race
  "energy", "phaseRoll", "flatSpot", "errCount", "cutWarn", "cuts", "penalty", "hits", "wallHits", "brakeTF", "brakeTR",
  "skidIntensity", "boostOn", "deploying", "shiftT", "steerSm", "brakeHeat", "slipDeg"];
// What apex reset()'s per-car block and its old transient list wrote, plus fields neither touches.
const EPISODE_STAMP = ["gear", "rpm", "shiftT", "steerSm", "brakeHeat", "axEstSm", "corridorAccel", "slipDeg", "aiHead",
  "aiBias", "aiFam", "stuckT", "letPassT", "passOf", "passT", "passCool", "holdOff", "defendSide", "passFailOf",
  "passFailT", "errT", "pressT", "zoneKey", "deploying", "boostOn", "xOn", "aeroX", "xArmed", "wasOnThrottle",
  "vertLoad", "laneClr", "rank", "kCur", "wasArmed", "_vmaxNow", "accSm", "onKerb", "wheelLock", "brakeTF", "brakeTR",
  "brakeFade", "contactT", "_pushD", "offroad", "queueT", "_qOf", "trailT", "_trOf", "towing", "wake", "brakeStab",
  "flatSpot", "skidIntensity", "errCount", "collideT", "_alPrev", "kTurn", "stillT", "_coastHeld", "lastLap",
  "calm", "calmUntil", "sbsT", "runT", "paceF", "kerbGripSm", "hYieldT", "wrongT", "offT", "energy"];

test("redFlagRestart and __apex.reset() leave every car field byte-identical (digests pinned on the pre-migration tip)", async () => {
  const g = await bootRace();
  let redFlag, episode;
  try {
    const G = g.G, a = g.apex;
    g.step(60 * 90);   // a lap in: the field is racing
    assert.equal(G.state, "race");
    stamp(G, REDFLAG_STAMP, [1, 5, 9, 14]);
    assert.equal(a.redFlag().state, "count");
    redFlag = digest(G);
  } finally { g.close(); }
  const g2 = await bootRace();
  try {
    const a = g2.apex;
    a.reset(0, 0, 0, 42);
    g2.step(240);   // a 4 s episode
    stamp(g2.G, EPISODE_STAMP, [0, 3, 8, 15]);
    a.reset(0, 0, 0, 42);
    episode = digest(g2.G);
  } finally { g2.close(); }
  if (process.env.APEX_PRINT_DIGEST) console.log(JSON.stringify({ redFlag, episode }));
  assert.equal(redFlag, DIGEST_REDFLAG, "a car field after redFlagRestart changed");
  assert.equal(episode, DIGEST_EPISODE, "a car field after __apex.reset() changed");
});

// ── the table ─────────────────────────────────────────────────────────────────────────────────────────────────────

test("table: one row per key, a known lifetime, a why on every row, the ops newRace, rescue, redFlag and episode", () => {
  assert.ok(CF.RESETS.length >= 150, "gridUp, rescuePlayer, redFlagRestart and reset() reset ~165 fields");
  const keys = CF.RESETS.map((r) => r.key);
  assert.equal(new Set(keys).size, keys.length, "a key listed twice");
  assert.deepEqual([...CF.OPS], ["newRace", "rescue", "redFlag", "episode"]);
  for (const r of CF.RESETS) {
    assert.ok(CF.LIVES.includes(r.life), `${r.key}: unknown lifetime ${r.life}`);
    const ops = Object.keys(r.ops);
    assert.ok(ops.length > 0, `${r.key}: a row no op resets`);
    for (const op of ops) assert.ok(CF.OPS.includes(op), `${r.key}: op ${op} has no call site yet`);
    // Every row says why, so every 'keep' and every CALLER row does.
    assert.ok(typeof r.why === "string" && r.why.length > 10, `${r.key}: no why`);
  }
  assert.throws(() => CF.resetFor({}, "restart"), /unknown op/, "an op the table does not define is an error, not a no-op");
});

/** The JS literal the declare body writes for a table value. */
const lit = (v) => (v === undefined ? "undefined" : Object.is(v, Infinity) ? "Infinity" : JSON.stringify(v));

/** declareNewRace's named stores as [key, literal] pairs, in source order. */
function declared() {
  return [...CF.declareNewRace.toString().matchAll(/if \(!\("(\w+)" in c\)\) c\.(\w+) = ([^;]+);/g)].map((m) => {
    assert.equal(m[1], m[2], "a guard names one key and stores another");
    return [m[1], m[3]];
  });
}
const newRaceRows = () => CF.RESETS.filter((r) => Object.hasOwn(r.ops, "newRace") && r.ops.newRace !== CF.CALLER);

test("declareNewRace's named stores carry the table's newRace values, in table order", () => {
  const d = declared();
  assert.ok(d.length > 0);
  const want = new Map(newRaceRows().map((r) => [r.key, lit(r.ops.newRace)]));
  for (const [k, v] of d) assert.equal(v, want.get(k), `${k}: declareNewRace stores ${v}, the table says ${want.get(k)}`);
  const order = newRaceRows().map((r) => r.key).filter((k) => d.some(([dk]) => dk === k));
  assert.deepEqual(d.map(([k]) => k), order, "declareNewRace is out of table order");
});

test("declareNewRace declares exactly the newRace fields a freshly spawned car lacks (none silently skipped)", async () => {
  const spawned = [];
  const g = await createGame({});
  try {
    const CFl = g.ctx.CarFields, pre = CFl.predeclare;
    CFl.predeclare = (c) => { pre(c); spawned.push(new Set(Object.keys(c))); return c; };
    await g.race("monza");
    const fresh = spawned.slice(-g.G.cars.length);
    assert.ok(fresh.length >= 20, "makeCars spawned the field through predeclare");
    const lacking = newRaceRows().map((r) => r.key).filter((k) => fresh.some((keys) => !keys.has(k)));
    assert.deepEqual(declared().map(([k]) => k), lacking,
      "a newRace row a spawned car lacks must be in declareNewRace (resetFor's keyed loop only writes fields a car has), " +
      "and one it always has must not be (regenerate declareNewRace)");
  } finally { g.close(); }
});

/** A plain object with every table key stamped with a sentinel no row writes. */
function stamped() {
  const o = {};
  for (const r of CF.RESETS) o[r.key] = { sentinel: r.key };
  return o;
}

for (const op of ["newRace", "rescue", "redFlag", "episode"]) {
  test(`resetFor(${op}) resets exactly its rows to their declared values and leaves every other row alone`, () => {
    const o = stamped();
    assert.equal(CF.resetFor(o, op), o);
    for (const r of CF.RESETS) {
      const named = Object.hasOwn(r.ops, op) && r.ops[op] !== CF.CALLER;
      if (named) assert.ok(Object.is(o[r.key], r.ops[op]), `${r.key}: ${op} should write ${lit(r.ops[op])}, got ${lit(o[r.key])}`);
      else assert.deepEqual(o[r.key], { sentinel: r.key }, `${r.key}: ${op} does not name it (or it is a CALLER row), yet it changed`);
    }
    assert.deepEqual(Object.keys(o), CF.RESETS.map((r) => r.key), "resetFor added a key to an object that had them all");
  });
}

test("resetFor on a bare object: rescue, redFlag and episode add nothing, newRace adds its rows through named stores", () => {
  for (const op of ["rescue", "redFlag", "episode"])
    assert.deepEqual(Object.keys(CF.resetFor({}, op)), [], `${op} only writes fields a car already has`);
  const fresh = CF.resetFor({}, "newRace");
  assert.deepEqual(Object.keys(fresh), declared().map(([k]) => k), "newRace adds a missing field only through declareNewRace");
});

/** %HasFastProperties, compiled with natives syntax switched on for that one compile (car-fields-vm's helper). */
function nativeFast() {
  v8.setFlagsFromString("--allow-natives-syntax");
  let f = null;
  try { f = new Function("o", "return %HasFastProperties(o)"); } catch { f = null; }
  v8.setFlagsFromString("--no-allow-natives-syntax");
  assert.ok(f, "V8 natives syntax is unavailable on this Node: the fast-mode check would be vacuous");
  return f;
}

test("on a live car after the grid, resetFor adds no key and the car stays in fast mode (its own VM: it writes values)", async () => {
  const fast = nativeFast();
  const g = await bootRace();
  try {
    const CFl = g.ctx.CarFields;
    for (const c of g.G.cars) {
      const before = Object.keys(c).join();
      for (const op of ["newRace", "rescue", "redFlag", "episode"]) {
        CFl.resetFor(c, op);
        assert.equal(Object.keys(c).join(), before, `${c.code}: resetFor(${op}) changed the car's keys`);
      }
      assert.equal(fast(c), true, `${c.code} fell into dictionary mode`);
    }
  } finally { g.close(); }
});

test("gridUp and rescuePlayer each call resetFor once and no longer write the migrated fields inline", () => {
  const grid = symbolSource("function gridUp(");
  const rescue = symbolSource("function rescuePlayer(");
  assert.equal((grid.match(/CarFields\.resetFor\(c, "newRace"\)/g) || []).length, 1);
  assert.equal((rescue.match(/CarFields\.resetFor\(c, "rescue"\)/g) || []).length, 1);
  for (const [src, op, name] of [[grid, "newRace", "gridUp"], [rescue, "rescue", "rescuePlayer"]]) {
    for (const r of CF.RESETS) {
      if (!Object.hasOwn(r.ops, op) || r.ops[op] === CF.CALLER) continue;
      assert.doesNotMatch(src, new RegExp("\\bc\\." + r.key + " = "), `${name} still writes ${r.key} inline: it is a RESETS row`);
    }
  }
});

test("redFlagRestart and __apex.reset() each call resetFor once per car and write none of their rows inline", () => {
  const red = symbolSource("function redFlagRestart(");
  const APEX = readFileSync(new URL("../../js/agent/apex.js", import.meta.url), "utf8");
  const reset = fnSource(APEX, "  reset(frac, speed, x, seed) {");
  assert.equal((red.match(/CarFields\.resetFor\(c, "redFlag"\)/g) || []).length, 1);
  assert.equal((reset.match(/CarFields\.resetFor\(c, "episode"\)/g) || []).length, 1);
  for (const [src, op, name] of [[red, "redFlag", "redFlagRestart"], [reset, "episode", "__apex.reset"]]) {
    for (const r of CF.RESETS) {
      if (!Object.hasOwn(r.ops, op) || r.ops[op] === CF.CALLER) continue;
      assert.doesNotMatch(src, new RegExp("\\bc\\." + r.key + " = "), `${name} still writes ${r.key} inline: it is a RESETS row`);
    }
  }
  assert.doesNotMatch(symbolSource("function gridUp("), /clearRacingScratch/, "clearRacingScratch's fields are newRace rows");
});

test("js/agent/apex.js no longer declares EPISODE_TRANSIENTS (the episode op is the one list)", () => {
  const APEX = readFileSync(new URL("../../js/agent/apex.js", import.meta.url), "utf8");
  assert.doesNotMatch(APEX, /\bEPISODE_TRANSIENTS\b/);
});

test("the table's IDLE_RPM is PhysicsConsts.IDLE_RPM", async () => {
  const g = await createGame({});
  try {
    const want = g.ctx.PhysicsConsts.IDLE_RPM;
    for (const op of ["redFlag", "episode"]) assert.equal(CF.RESETS.find((r) => r.key === "rpm").ops[op], want, op);
  } finally { g.close(); }
});

test("SimState reads its car-state lists from CarFields.SNAPSHOT, not a second copy", async () => {
  const g = await bootRace();
  try {
    const SS = g.ctx.SimState, S = g.ctx.CarFields.SNAPSHOT;
    assert.ok(SS, "SimState is loaded once a race is built");
    assert.equal(SS.DEEP, S.DEEP);
    assert.equal(SS.STATE, S.STATE);
    assert.equal(SS.KEEP_FORWARD, S.KEEP_FORWARD);
    assert.deepEqual([...SS.STATIC], [...S.STATIC]);
    assert.deepEqual([...SS.RUNTIME], [...S.RUNTIME]);
  } finally { g.close(); }
});
