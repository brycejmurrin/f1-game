/* frame-ledger.test.mjs — #6941 U0.3: the frame-phase ledger on the real game booted in the Node VM.
 * Behavioural only (no source pins): pumpFrame drives tickBody, so every mark that must run, runs.
 * Run: node --test tests/unit/frame-ledger.test.mjs */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const PHASES = ["input", "physics", "update", "ai", "collide", "car.brake", "car.long", "car.lat", "car.bike", "car.adv", "camera", "audio", "render", "present", "hud"];

let g = null;
before(async () => { g = await createGame({ storage: { trackId: "monza" } }); });
after(() => { if (g) g.close(); });

test("every phase is recorded by real frames", async () => {
  await g.race("monza");
  g.apex.go();
  const PerfSpans = g.sandbox.PerfSpans;
  PerfSpans.reset(); PerfSpans.on(true);
  let clock = g.sandbox.performance.now();
  for (let i = 0; i < 120; i++) { clock += 16.7; g.pumpFrame(clock); }
  const s = PerfSpans.stats();
  PerfSpans.on(false);
  for (const k of ["frame", ...PHASES]) assert.ok(s[k] && s[k].n > 0, `phase ${k} recorded (have ${Object.keys(s)})`);
  for (const k of PHASES) assert.ok(Number.isFinite(s[k].p99), `${k} p99 finite`);
});

test("nesting with a stub clock: car.* sum <= ai, update <= physics, accumulators flush once per frame", () => {
  const src = fs.readFileSync(new URL("../../js/perf/spans.js", import.meta.url), "utf8");
  const Spans = vm.runInNewContext(src + ";PerfSpans", { performance: { now: () => 0 } }, { filename: absSrc("js/perf/spans.js") });
  let t = 0;
  const ps = Spans.create(() => t);
  ps.on(true);
  for (let f = 0; f < 10; f++) {
    ps.begin("frame");
    ps.begin("physics");
    for (let step = 0; step < 2; step++) {
      ps.begin("update"); t += 1;
      ps.begin("ai");
      for (let c = 0; c < 3; c++) for (const n of ["car.brake", "car.long", "car.lat", "car.bike", "car.adv"]) { ps.begin(n); t += 0.1; ps.end(n); }
      ps.end("ai");
      ps.end("update");
    }
    ps.end("physics");
    t += 1; ps.end("frame");
  }
  const s = ps.stats();
  assert.equal(s.update.n, 10);           // one sample per frame, not per call
  assert.equal(s["car.long"].n, 10);
  assert.ok(Math.abs(s.update.p50 - 2 * (1 + 1.5)) < 1e-6, `update summed per frame: ${s.update.p50}`);
  const carSum = ["brake", "long", "lat", "bike", "adv"].reduce((a, k) => a + s["car." + k].p50, 0);
  assert.ok(carSum <= s.ai.mean * 2 + 1e-9, "car.* per frame <= ai per frame");   // ai is per call (one per step, 2 steps a frame)
  assert.ok(s.update.p50 <= s.physics.p50 + 1e-9, "update <= physics");
});
