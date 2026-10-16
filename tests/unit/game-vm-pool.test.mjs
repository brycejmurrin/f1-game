/* game-vm-pool.test.mjs — the pool must be a SPEED change and nothing else.
 *
 * tools/lib/game-vm-pool.cjs moved tests/unit/elevation-tracks-vm.test.mjs from
 * one VM to four (400 s -> 191-210 s on this box). That is only a fair trade while
 * a circuit probed in a worker returns exactly what the same probe returns in
 * the parent's own VM — otherwise the twin's numbers are no longer the browser
 * spec's numbers, and the thresholds it asserts mean something else.
 *
 * So this file runs the REAL probes (tests/helpers/elevation-probes.cjs, the
 * same source the twin dispatches) on two circuits, both ways, and asserts the
 * result objects are deep-equal — floats included, no tolerance. The two paths
 * are made like-for-like on purpose: ONE worker (`size: 1`) takes both circuits
 * in the same order the parent runs them, so the comparison is "same code, same
 * sequence, different thread" rather than "different warm-up".
 *
 * Also here: a worker that throws must fail ITS circuit by name (a pool that
 * swallowed an error would turn a red twin green), and the `carMeshes: false`
 * opt-out must stub the builders and refuse a caller that measures a mesh.
 *
 * Run: node --test tests/unit/game-vm-pool.test.mjs   (~20 s, two VMs)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");
const { createPool } = require("../../tools/lib/game-vm-pool.cjs");
const { INIT, GRADIENT, BANKED } = require("../helpers/elevation-probes.cjs");

// Exactly what elevation-tracks-vm boots and passes.
const BOOT = { track: "monza", carMeshes: false };
const LAUNCHES = { FLAT_LAUNCH: 40, CLIMB_LAUNCH: 10 };
const CASES = [
  { circuit: "monza", probe: GRADIENT, name: "GRADIENT" },
  { circuit: "zandvoort", probe: BANKED, name: "BANKED" },
];

let pool = null, g = null, state = null;
const pooled = [], serial = [];

before(async () => {
  pool = createPool({ boot: BOOT, init: INIT, size: 1, maxJobs: 8 });
  const jobs = CASES.map((c) => pool.run({ circuit: c.circuit, probe: c.probe, options: LAUNCHES }));
  jobs.forEach((p) => p.catch(() => {}));
  g = await createGame(BOOT);
  state = INIT(g);
  for (const c of CASES) serial.push(await c.probe(g, { circuit: c.circuit, ...LAUNCHES }, state));
  for (const p of jobs) pooled.push(await p);
});
after(async () => { if (pool) await pool.close(); if (g) g.close(); });

test("a circuit probed in a worker returns the parent's numbers exactly", () => {
  for (let i = 0; i < CASES.length; i++) {
    const c = CASES[i];
    assert.deepEqual(pooled[i].result, serial[i],
      `${c.name} on ${c.circuit} differs between the pool and the serial path — ` +
      `the twin's thresholds are asserted against these numbers`);
    assert.deepEqual(pooled[i].errors, [], `${c.circuit}: the worker logged errors the parent did not`);
    assert.equal(pooled[i].result.relief, true, `${c.circuit}: the probe never saw an elevation profile`);
  }
});

test("a probe that throws fails ITS circuit, by name", async () => {
  await assert.rejects(
    pool.run({ circuit: "bahrain", probe: () => { throw new Error("probe blew up"); } }),
    (e) => /bahrain/.test(e.message) && /probe blew up/.test(e.message),
    "a throwing probe must reject the circuit's own job with the circuit named");
});

test("carMeshes:false stubs the builders and refuses a caller that measures", () => {
  assert.equal(g.record.carMeshes, "stubbed");
  const Car3D = g.sandbox.Car3D;
  const mesh = Car3D.build("#f00", "#00f", { teamId: "ferrari" });
  assert.equal(mesh.pos.length, 0, "the stub must hand back an empty geometry, not a real car");
  assert.equal(mesh.idx.length, 0);
  assert.deepEqual(Object.keys(Car3D.buildWheelLayers(0.32)).sort(), ["fixed", "rotating"]);
  assert.throws(() => Car3D.build("#f00", "#00f", { measure: true }), /carMeshes:false/,
    "a caller that MEASURES a car mesh must fail loudly, not read a 0-vertex car");
});
