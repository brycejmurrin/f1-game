/* menu-car-prep-yield.test.mjs — the menu's car-asset prep yields ONE FRAME,
 * not a fixed 32 ms sleep, asked of the REAL CarDraw in a Node VM
 * (tests/helpers/car-draw-vm.mjs).
 *
 * prepareMenuCarAssets (js/car/car-draw.js) runs on RACE SETTINGS and, when
 * RACE! joins an unfinished prep, under the loading card. It slices at 8 ms;
 * after every slice it used to sleep setTimeout(32), so on a fast device the
 * prep was mostly asleep (B·H8 2026-10-20: 44 sleeps for 2.4 s of work). It now
 * resumes after the next animation frame; the 32 ms timer is only the fallback
 * for a frame that never comes (hidden tab, a soft-GL readback stall).
 *
 * The VM's clock advances 5 ms per read, so every couple of steps spends a
 * slice and yields. Timers and frames are queued, never auto-run: the test
 * decides which kind fires.
 *
 * Run: node --test tests/unit/menu-car-prep-yield.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { carDrawVm } from "../helpers/car-draw-vm.mjs";

function rig({ raf }) {
  const v = carDrawVm({ casters: true });
  let t = 0;
  v.ctx.performance.now = () => (t += 5);
  const timers = [], frames = [];
  v.ctx.setTimeout = (fn, ms) => { timers.push({ fn, ms: ms | 0 }); return timers.length; };
  if (raf) v.ctx.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
  else delete v.ctx.requestAnimationFrame;
  v.G.teamIdx = 3; v.G.driverIdx = 0;
  const flush = () => new Promise((r) => setImmediate(r));
  return { v, timers, frames, flush };
}

test("with frames arriving, the prep finishes without any 32 ms timer firing", async () => {
  const r = rig({ raf: true });
  let done = false, out;
  r.v.carDraw.prepareMenuCarAssets(() => true).then((x) => { out = x; done = true; });
  let frames = 0;
  for (let i = 0; i < 2000 && !done; i++) {
    await r.flush();
    // One frame: run its callbacks, then the 0 ms tasks they posted. 32 ms timers stay queued.
    for (const f of r.frames.splice(0)) { f(); frames++; }
    for (let k = r.timers.length - 1; k >= 0; k--) if (r.timers[k].ms === 0) r.timers.splice(k, 1)[0].fn();
  }
  assert.ok(done, "the prep completed on frames alone");
  assert.ok(frames > 1, "it yielded between slices (" + frames + " frames)");
  assert.ok(out && out.cars > 0 && out.steps > 0, "it ran to its end and returned its record");
  assert.ok(r.timers.every((x) => x.ms === 32), "only the unfired fallbacks are left");
});

test("with no animation frame (hidden tab), the 32 ms fallback still drives it", async () => {
  const r = rig({ raf: false });
  let done = false;
  r.v.carDraw.prepareMenuCarAssets(() => true).then(() => { done = true; });
  let sleeps = 0;
  for (let i = 0; i < 2000 && !done; i++) {
    await r.flush();
    for (const x of r.timers.splice(0)) { assert.equal(x.ms, 32, "the only timer is the old 32 ms sleep"); sleeps++; x.fn(); }
  }
  assert.ok(done, "the prep completed on the fallback timer");
  assert.ok(sleeps > 1, "it yielded between slices (" + sleeps + " sleeps)");
});

test("a frame and its fallback both firing resume the prep once", async () => {
  const r = rig({ raf: true });
  let done = false;
  r.v.carDraw.prepareMenuCarAssets(() => true).then(() => { done = true; });
  for (let i = 0; i < 4000 && !done; i++) {
    await r.flush();
    for (const f of r.frames.splice(0)) f();
    for (const x of r.timers.splice(0)) x.fn();   // 0 ms and 32 ms alike
  }
  assert.ok(done);
  const bodies = r.v.rec.builds.filter((b) => b.kind === "body").length;
  assert.equal(new Set(r.v.rec.builds.filter((b) => b.kind === "body").map((b) => b.team + ":" + b.num)).size, bodies,
    "no step ran twice (each body built once)");
});
