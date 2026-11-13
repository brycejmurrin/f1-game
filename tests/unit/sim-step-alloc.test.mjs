/* sim-step-alloc.test.mjs — per-step garbage the simulation no longer makes, pinned per call.
 *
 * Each row was measured with the interpreter census (sampling heap profiler at 8 B, objects split from 16 B
 * boxed doubles: tools/perf/vm-alloc-census.mjs) and is real garbage on both engines, not V8 double boxing
 * (which JavaScriptCore, Bryce's iPhone, does not make). tests/helpers/alloc-per-call.mjs measures one
 * function in a child Node with a 64 MB semi-space, GC-free, after a warm-up; the pinned numbers are those
 * measurements (before the fix in brackets).
 *
 * Run: node --test tests/unit/sim-step-alloc.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { allocPerCall } from "../helpers/alloc-per-call.mjs";
import { gameSource } from "../helpers/game-source.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SPORTING = join(ROOT, "js/race/sporting-regs.js"), BAND = join(ROOT, "js/physics/ai-band.js");

test("SportingRegs pass watch: 0 B per tick on a 20-car field, caution on and off (was 201 B: Set#clear + re-grow)", () => {
  const r = allocPerCall(`(() => {
    const w = SportingRegs.createPassWatch(5), f = [];
    for (let i = 0; i < 20; i++) f.push({ id: i, prog: 100 * i + 0.5, lap: 1, retired: false, finished: false, pitState: "none" });
    const p = f[7];
    return (i) => w.tick(p, f, (i >> 6) & 1 ? 2 : 0, 1 / 60);
  })()`, { prelude: [SPORTING] });
  assert.equal(r.gcInside, false, "a GC landed inside the window: the measurement is void");
  assert.equal(r.bytesPerCall, 0, `pass watch allocates ${r.bytes} B over 20000 ticks`);
});

test("AiBand catch-up: factor(ctx) + applyVmax(…, out) on a reused ctx allocate 0 B per AI car (was 2 objects)", () => {
  const r = allocPerCall(`(() => {
    AiBand.setMode("catchup");
    const ctx = { leadProg: 0.5, carProg: 0.5, trackTotal: 5793.5, raceT: 30.5, launchT0: 0.5, bandAuth: 0.25 }, out = { vmax: 0.5, bandNow: 0.5 };
    let last = null;   // the answer escapes, as in updateCar (an unused one is escape-analysed away); a let double would box
    return (i) => { ctx.leadProg = 1200.5 + (i & 255); ctx.carProg = 900.25 + (i & 127); last = AiBand.applyVmax(80.5, AiBand.factor(ctx), 0.9, 1.08, out); };
  })()`, { prelude: [BAND] });
  assert.equal(r.gcInside, false, "a GC landed inside the window: the measurement is void");
  assert.equal(r.bytesPerCall, 0, `catch-up band allocates ${r.bytes} B over 20000 calls`);
  // The per-step caller must take the out path: no ctx literal, the shared out object.
  const src = gameSource();
  const site = src.slice(src.indexOf('AiBand.mode() === "catchup"'), src.indexOf("} else c._bandNow = 0;"));
  assert.ok(site.includes("AiBand.factor(_bandCtx") || site.includes("AiBand.factor(bc)"), "game.js must pass the reused _bandCtx to AiBand.factor");
  assert.ok(site.includes("BAND_CEIL, _bandOut)"), "game.js must pass the reused _bandOut to AiBand.applyVmax");
});
