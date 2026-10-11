/* car-draw-decal-budget — the decal-atlas lifecycle in js/car/car-draw.js, run on
 * the REAL CarDraw (tests/helpers/car-draw-vm.mjs) over a recording renderer:
 *   - the GARAGE reaps the preview a hi-res swap parked (it never calls
 *     flushDecals, so every livery browsed leaked ~7 MB);
 *   - the atlas LRU is bounded by BYTES, not slots (a hi-res atlas is ~26.7 MB);
 *   - a failed hi-res build is tried twice, not on every draw;
 *   - the player's LEGENDS slot names its helmet by the picked legend and keys
 *     every body mesh with it (ten legends share num 1).
 * Run: node --test tests/unit/car-draw-decal-budget.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { carDrawVm } from "../helpers/car-draw-vm.mjs";

const MB = 1024 * 1024;
function rig({ legends = false } = {}) {
  const v = carDrawVm({ legends });
  const built = [], freed = [], idle = [], hiBuilds = [];
  const fail = { hi: 0, create: false };
  v.G.gfx.createTexture = (canvas) => { if (fail.create && canvas.hi) return null; const t = { canvas }; built.push(canvas); return t; };
  v.G.gfx.freeTexture = (t) => freed.push(t.canvas);
  v.G.gfx.drawDecal = () => {};
  v.ctx.LiveryTex = {
    IS_MOBILE: false,
    playerHiResDeferred: () => true,
    buildAtlas: (teamId, _liv, num, isPlayer, hiRes) => {
      if (hiRes) { hiBuilds.push(teamId + "#" + num); if (fail.hi > 0) { fail.hi--; throw new Error("paint failed"); } }
      const side = hiRes ? 2048 : isPlayer ? 1024 : 512;
      return { id: teamId + "#" + num + (hiRes ? ":hi" : isPlayer ? ":prev" : ":half"), hi: !!hiRes, width: side, height: hiRes ? 2560 : side };
    },
  };
  v.ctx.requestIdleCallback = (cb) => { idle.push(cb); };
  v.ctx.setTimeout = (cb) => { idle.push(cb); };
  const drain = () => { while (idle.length) idle.shift()({ didTimeout: false, timeRemaining: () => 50 }); };
  return { ...v, built, freed, idle, hiBuilds, fail, drain, ids: (list) => list.map((c) => c.id) };
}
const team = (id) => ({ id, drivers: [{ num: 1 }] });
const names = (list) => list.map((c) => c.id);

test("the garage reaps the preview a hi-res swap parked; the race waits for flushDecals", () => {
  const r = rig();
  const t = team("me");
  r.carDraw.drawCarDecals(t, new Float32Array(16), true, 1, false, true);   // garage: preview, hi-res kick queued
  assert.equal(r.idle.length, 1);
  r.drain();                                                                 // the idle slot swaps the 2048 in
  assert.ok(!names(r.freed).includes("me#1:prev"), "parked until the next bind");
  r.carDraw.drawCarDecals(t, new Float32Array(16), true, 1, false, true);   // the garage's next frame
  assert.ok(names(r.freed).includes("me#1:prev"), "the next garage draw frees the parked preview");
  // The race path: one reap after the whole queue.
  const q = rig();
  q.carDraw.drawCarDecals(t, new Float32Array(16), true, 1, false, true);
  q.drain();
  q.carDraw.beginDecals();
  q.carDraw.queueCarDecals(t, new Float32Array(16), 1, false, true);
  q.carDraw.queueCarDecals(team("rival"), new Float32Array(16), 2, false, false);
  q.carDraw.flushDecals(false);
  assert.ok(names(q.freed).includes("me#1:prev"), "flushDecals still reaps, after the queue");
});

test("the atlas LRU is bounded by bytes: browsing hi-res liveries cannot hold 36 x 26.7 MB", () => {
  const r = rig();
  const m = new Float32Array(16);
  for (let i = 0; i < 12; i++) {
    r.carDraw.drawCarDecals(team("t" + i), m, true, 1, false, true);   // a garage visit per livery
    r.drain();
  }
  const hiLive = r.built.filter((c) => c.hi).length - names(r.freed).filter((id) => id.endsWith(":hi")).length;
  assert.ok(hiLive <= 160 * MB / (2048 * 2560 * 4 * 4 / 3), "at most " + Math.floor(160 * MB / (2048 * 2560 * 4 * 4 / 3)) + " hi-res atlases stay resident, saw " + hiLive);
  assert.ok(names(r.freed).includes("t0#1:hi"), "the first browsed livery's hi-res atlas was evicted");
  assert.equal(names(r.freed).includes("t11#1:hi"), false, "the one on screen never is");
});

test("a rival-sized field still fits the byte budget (nothing live is thrashed)", () => {
  const r = rig();
  const m = new Float32Array(16);
  r.carDraw.drawCarDecals(team("me"), m, false, 1, false, true);
  r.drain();
  for (let i = 0; i < 23; i++) r.carDraw.drawCarDecals(team("r" + i), m, false, 10 + i, false, false);
  assert.equal(names(r.freed).filter((id) => !id.endsWith(":prev")).length, 0, "the player's hi-res + 23 half-tier atlases (~70 MB) evict nothing");
});

test("a failed hi-res build is tried twice per key, not on every draw", () => {
  const r = rig();
  const t = team("me"), m = new Float32Array(16);
  r.fail.hi = 99;
  for (let f = 0; f < 10; f++) {
    r.carDraw.drawCarDecals(t, m, true, 1, false, true);
    r.drain();
  }
  assert.equal(r.hiBuilds.length, 2, "two attempts, then the preview stays");
  assert.equal(r.carDraw.getCarDecalTexture(t, 1, true).canvas.id, "me#1:prev", "the preview is still what draws");
  r.carDraw.invalidateDecalTextures("me");   // a livery edit mints a fresh key: it may try again
  r.carDraw.drawCarDecals(t, m, true, 1, false, true);
  r.drain();
  assert.equal(r.hiBuilds.length, 3);
});

test("a hi-res createTexture that returns nothing keeps the preview instead of caching a null", () => {
  const r = rig();
  const t = team("me"), m = new Float32Array(16);
  r.fail.create = true;
  r.carDraw.drawCarDecals(t, m, true, 1, false, true);
  r.drain();
  assert.equal(r.carDraw.getCarDecalTexture(t, 1, true).canvas.id, "me#1:prev");
});

test("the player's LEGENDS slot builds its helmet from the picked legend and keys meshes with it", () => {
  const r = rig({ legends: true });
  const lg = r.teams.find((x) => x.id === "legends");
  const opts = [];
  const real = r.ctx.Car3D.build;
  r.ctx.Car3D.build = (c1, c2, o) => { opts.push({ team: o.teamId, kind: o.silhouette ? "sh" : o.noWheels ? "body" : "whole", num: o.num, helmetKey: o.helmetKey }); return real(c1, c2, o); };
  const codes = lg.drivers.map((d) => d.code);
  const sameNum = lg.drivers.map((d, i) => i).filter((i) => lg.drivers[i].num === 1).slice(0, 2);
  assert.equal(sameNum.length, 2, "precondition: two legends share num 1");
  const meshes = [];
  for (const di of sameNum) {
    r.G.driverIdx = di;
    const car = { team: lg, num: lg.drivers[di].num, isPlayer: true };
    meshes.push([r.carDraw.playerBodyMesh(lg, car), r.carDraw.teamMesh(lg, car, false), r.carDraw.teamBodyMesh(lg, car)]);
  }
  assert.notEqual(meshes[0][0], meshes[1][0], "playerBodyMesh: a second legend with num 1 is not the first one's mesh");
  assert.notEqual(meshes[0][1], meshes[1][1], "teamMesh");
  assert.notEqual(meshes[0][2], meshes[1][2], "teamBodyMesh");
  const keys = opts.filter((o) => o.kind !== "sh").map((o) => o.helmetKey);
  assert.equal(JSON.stringify([...new Set(keys)].sort()), JSON.stringify(sameNum.map((i) => codes[i]).sort()), "each build names its legend's code");
  // Any other team: no helmetKey, and the same mesh on a repeat draw.
  const ferrari = r.teams.find((x) => x.id === "ferrari") || r.teams[0];
  opts.length = 0;
  const car = { team: ferrari, num: ferrari.drivers[0].num, isPlayer: true };
  const a = r.carDraw.playerBodyMesh(ferrari, car), b = r.carDraw.playerBodyMesh(ferrari, car);
  assert.equal(a, b);
  assert.equal(opts.length, 1);
  assert.equal(opts[0].helmetKey, undefined);
});
