/* GARAGE BAY ERROR PATHS (#7339, garage+car hunt 2026-11-27).
 * G1 a refill that throws must free the previous atlas handle (live and dress paths null their slot first);
 * G2 a room build that throws must leave no freed mesh handle truthy, so the next rebuild frees nothing twice;
 * G3 fitHome returns null, never a non-finite lens shift, when every probe fails.
 * Slices of js/garage/scene.js run in a VM with a stub gfx, as garage-followups does; experience.js runs whole. */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { absSrc } from "../helpers/abs-src.mjs";

const read = (p) => readFileSync(new URL("../../" + p, import.meta.url), "utf8");
const SCENE = "js/garage/scene.js";
function sceneSlice() {
  const src = read(SCENE), start = src.indexOf("function reuploadTex("), end = src.indexOf("// Squeegeed resin:", start);
  assert.ok(start > 0 && end > start, "reuploadTex..rebuild slice moved");
  return src.slice(start, end);
}
function freeLog() {
  const freed = [];
  return { freed, once: (h) => freed.filter((x) => x === h).length };
}

test("G1: uploadLive frees the previous live texture once when refillTexture throws", () => {
  const prev = { id: "prev" }, log = freeLog();
  const c = vm.createContext({
    liveTex: prev, liveCanvas: {}, liveMesh: {}, liveMeshesReady: true, liveFail: 0, liveRetryAt: 0, traceFail: 0, lastTrace: 0,
    paintLive() {}, paintTrace() {}, GarageExperience: { paintCareer() {} }, LiveryTex: {}, Log: { warn() {} },
    _gfx: { createTexture: () => ({ id: "new" }), createTexMesh() {}, freeTexture: (t) => log.freed.push(t),
      refillTexture() { throw Error("refill"); } },
  });
  vm.runInContext(sceneSlice(), c, { filename: absSrc(SCENE) });
  c.uploadLive({}, {}, { ambient: false }, 0);
  assert.equal(c.liveTex, null);
  assert.equal(c.liveFail, 1);
  assert.equal(log.once(prev), 1, "the 512² atlas the throw orphaned is freed exactly once");
});

test("G1: a refill that declines then a createTexture that throws still frees the previous texture only once", () => {
  const prev = { id: "prev" }, log = freeLog();
  const c = vm.createContext({
    liveTex: prev, liveCanvas: {}, liveMesh: {}, liveMeshesReady: true, liveFail: 0, liveRetryAt: 0, traceFail: 0, lastTrace: 0,
    paintLive() {}, paintTrace() {}, GarageExperience: { paintCareer() {} }, LiveryTex: {}, Log: { warn() {} },
    _gfx: { createTexture() { throw Error("create"); }, createTexMesh() {}, freeTexture: (t) => log.freed.push(t),
      refillTexture: () => false },
  });
  vm.runInContext(sceneSlice(), c, { filename: absSrc(SCENE) });
  c.uploadLive({}, {}, { ambient: false }, 0);
  assert.equal(log.once(prev), 1, "no double free");
});

test("G1: the dress atlas frees its previous texture once when refillTexture throws", () => {
  const prev = { id: "dress-prev" }, log = freeLog();
  const c = vm.createContext({
    roomKeys: () => ({ geom: "g", live: "l", dressId: "d", board: "b2", key: "k2" }), performance: { now: () => 0 },
    cacheKey: "k1", geomKey: "g", shellMesh: {}, liveKey: "l", liveTex: {}, liveFail: 0, liveRetryAt: 0,
    dressIdKey: "d", dressFullKey: "d|b1", dressCanvas: {}, dressTex: prev, dressMesh: {}, dressMeshesReady: true,
    dressFail: 0, dressRetryAt: 0, SIDES: [], LiveryTex: {}, paintDress: () => ({ canvas: {} }), paintBoards() {},
    buildDress: () => ({}), Log: { warn() {} },
    _gfx: { createTexture: () => ({}), createTexMesh() {}, freeTexture: (t) => log.freed.push(t),
      refillTexture() { throw Error("refill"); } },
  });
  vm.runInContext(sceneSlice(), c, { filename: absSrc(SCENE) });
  c.rebuild({}, {}, {}, {});
  assert.equal(c.dressTex, null);
  assert.equal(log.once(prev), 1);
});

test("G2: a room build that throws nulls the freed shell, floor and exterior handles; the retry frees none twice", () => {
  const freed = [], live = new Set();
  const mk = (n) => { const h = { n }; live.add(h); return h; };
  const shell = mk("shell"), floor = mk("floor"), apron = mk("apron");
  const c = vm.createContext({
    roomKeys: () => ({ geom: "g2", live: "l", dressId: "d", board: "b", key: "k2" }), performance: { now: () => 0 },
    cacheKey: "k1", geomKey: "g1", liveKey: "l", liveTex: {}, liveFail: 0, liveRetryAt: 0, dressTex: {}, dressFail: 0,
    dressRetryAt: 0, dressFullKey: "d|b", traceFail: 0, SIDES: ["mid"], ledMesh: {}, propMesh: {},
    shellMesh: shell, floorMesh: floor, exteriorFallbackMesh: apron, mirrorFadeMesh: null, trussMesh: {}, trussLook: "",
    GaragePrims: { look: () => null, lookKey: () => "", run() { throw Error("room builder threw twice"); } },
    LiveryTex: {}, Log: { warn() {} },
    _gfx: { createMesh: () => mk("new"), freeMesh(h) { freed.push(h); assert.ok(live.delete(h), "freed a live mesh exactly once"); } },
  });
  vm.runInContext(sceneSlice(), c, { filename: absSrc(SCENE) });
  assert.throws(() => c.rebuild({}, {}, {}, {}), /room builder/);
  assert.deepEqual(freed, [shell, floor, apron]);
  assert.equal(c.shellMesh, null, "the !shellMesh guard must read 'not built' after the throw");
  assert.equal(c.floorMesh, null);
  assert.equal(c.exteriorFallbackMesh, null);
  assert.throws(() => c.rebuild({}, {}, {}, {}), /room builder/);
  assert.equal(freed.length, 3, "the retry frees no handle a second time");
});

function experience() {
  const c = vm.createContext({ Math, Number, Object, Array, String, JSON, Float32Array, Log: { warn() {}, info() {} } });
  vm.runInContext(read("js/garage/experience.js"), c, { filename: absSrc("js/garage/experience.js") });
  return vm.runInContext("GarageExperience", c);
}
const RIG = { az: 0.6, el: 0.2, fov: 36, aspect: 1.6, center: [0, 0.45, 0], minDist: 4.6, maxDist: 11 };
const PANE = { left: 0, right: 0.6, top: 0, bottom: 1 };

test("G3: fitHome on a NaN hull returns null, not a NaN lens shift", () => {
  const E = experience();
  assert.equal(E.fitHome([NaN, 0, 0, 1, 0, 0, 0, 1, 0], RIG, PANE), null);
});

test("G3: fitHome with a hull point behind the eye at maxDist returns null, not an infinite shift", () => {
  const E = experience();
  // A point 40 m out along the view axis: depth <= 0.1 at every probed distance.
  const far = [40 * Math.sin(RIG.az) * Math.cos(RIG.el), 0.45 + 40 * Math.sin(RIG.el), 40 * Math.cos(RIG.az) * Math.cos(RIG.el)];
  assert.equal(E.fitHome([...far, 1, 0, 0, 0, 1, 0], RIG, PANE), null);
});

test("G3: a hull whose LATER point is behind the eye returns null, not a shift fitted to the first point only", () => {
  const E = experience();
  const far = [40 * Math.sin(RIG.az) * Math.cos(RIG.el), 0.45 + 40 * Math.sin(RIG.el), 40 * Math.cos(RIG.az) * Math.cos(RIG.el)];
  assert.equal(E.fitHome([0, 0.45, 0, ...far, 1, 0, 0], RIG, PANE), null);
});

test("G3: a hull too wide to fit still returns the finite maxDist crop (unchanged)", () => {
  const E = experience();
  // ±5 m along the screen-right axis: every point in front of the eye, 1.7 NDC wide at maxDist vs a 1.0 pane.
  const rx = Math.cos(RIG.az) * 5, rz = -Math.sin(RIG.az) * 5;
  const fit = E.fitHome([-rx, 0.45, -rz, rx, 0.45, rz, 0, 0.6, 0], RIG, PANE);
  assert.ok(fit && fit.dist === RIG.maxDist);
  for (const k of ["shiftX", "shiftY", "width", "height"]) assert.ok(Number.isFinite(fit[k]), k);
});
