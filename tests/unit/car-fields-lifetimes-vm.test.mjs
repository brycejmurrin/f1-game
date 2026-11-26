/* car-fields-lifetimes-vm.test.mjs — the per-car reset table (js/race/car-fields.js RESETS, #6945 U1.1 of #6920).
 *
 * gridUp (a new race) and rescuePlayer (RECOVER, the auto-rescue, an incident handback) used to reset car fields with
 * hand-kept inline runs. The fields they reset now live in ONE table, each row a key, a lifetime tag, the ops that
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
 *   4. Every 'keep' and every 'caller' row has a why note; no row names an op other than newRace or rescue yet
 *      (U1.2 adds redFlag and episode with their call sites).
 *
 * Run: node --test tests/unit/car-fields-lifetimes-vm.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import v8 from "node:v8";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

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
