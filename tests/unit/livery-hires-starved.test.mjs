/* livery-hires-starved — the player's deferred 2048 livery must land on a busy main thread.
 * schedulePlayerHiRes (js/car/car-draw.js) queued the build with requestIdleCallback and NO
 * {timeout}, and re-queued on didTimeout or a < 10 ms slot: a thread that never offered a roomy
 * slot (llvmpipe CI, a loaded tablet) starved it forever, and garage-pick-cost saw 0 atlas uploads
 * (#2394 tally; 11-10, 11-13, 11-18). Real car-draw over the stubbed renderer of car-draw-vm.
 * Run: node --test tests/unit/livery-hires-starved.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { carDrawVm } from "../helpers/car-draw-vm.mjs";

function rig() {
  const v = carDrawVm();
  v.G.getLiveryId = () => "default";
  const built = [], uploaded = [], idle = [], opts = [];
  v.G.gfx.createTexture = (canvas) => { const t = { canvas }; built.push(canvas); return t; };
  v.G.gfx.uploadTexture = (t) => uploaded.push(t.canvas);
  v.G.gfx.freeTexture = () => {};
  v.G.gfx.drawDecal = () => {};
  v.ctx.LiveryTex = {
    IS_MOBILE: false, IS_PHONE: false,
    playerHiResDeferred: () => true,
    buildAtlas: (teamId, _liv, num, isPlayer, hiRes) => ({ id: teamId + (hiRes ? ":hi" : ":prev"), hi: !!hiRes,
      width: hiRes ? 2048 : 1024, height: hiRes ? 2560 : 1024 }),
  };
  v.ctx.requestIdleCallback = (cb, o) => { idle.push(cb); opts.push(o); };
  v.ctx.setTimeout = (cb) => { idle.push(cb); };
  return { ...v, built, uploaded, idle, opts };
}
const team = { id: "me", drivers: [{ num: 1 }] };
const hiUploads = (r) => r.uploaded.filter((c) => c.hi).length;

test("a timed-out idle callback runs the 2048 build instead of re-queueing it", () => {
  const r = rig(), m = new Float32Array(16);
  r.carDraw.drawCarDecals(team, m, true, 1, false, true);
  assert.equal(r.idle.length, 1, "the 2048 is deferred, not built inline");
  assert.ok(r.opts[0] && r.opts[0].timeout > 0, "requestIdleCallback is given a {timeout}: " + JSON.stringify(r.opts[0]));
  // Starved: every slot reports timeRemaining 0 AND didTimeout. Bounded loop: the old code never stopped.
  for (let i = 0; i < 50 && r.idle.length; i++) r.idle.shift()({ didTimeout: true, timeRemaining: () => 0 });
  assert.equal(r.idle.length, 0, "the kick ran: nothing left queued");
  assert.equal(hiUploads(r), 1, "the hi-res atlas uploaded once");
  assert.equal(r.carDraw.decalBytes().hiPending, 0, "the settle signal reads 0 once it landed");
});

test("short idle slots re-queue only until the patience cap, then the 2048 lands", () => {
  const r = rig(), m = new Float32Array(16);
  let now = 1_000_000;
  const RealDate = r.ctx.Date;
  r.ctx.Date = Object.assign(function () { return new RealDate(now); }, { now: () => now });
  r.carDraw.drawCarDecals(team, m, true, 1, false, true);
  assert.equal(r.carDraw.decalBytes().hiPending, 1, "pending while queued");
  // A short slot inside the cap waits for a roomier one (the frame-budget intent stays).
  r.idle.shift()({ didTimeout: false, timeRemaining: () => 0 });
  assert.equal(r.idle.length, 1, "a short slot inside the cap re-queues");
  assert.equal(hiUploads(r), 0);
  // Never a roomy slot, never a timeout: past the cap it runs anyway.
  for (let i = 0; i < 50 && r.idle.length; i++) { now += 500; r.idle.shift()({ didTimeout: false, timeRemaining: () => 0 }); }
  assert.equal(r.idle.length, 0, "the queue drained: the cap bounded the wait");
  assert.equal(hiUploads(r), 1, "the hi-res atlas uploaded once");
  assert.equal(r.carDraw.decalBytes().hiPending, 0);
});
