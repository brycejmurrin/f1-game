/* carOrbit must report the car it framed, not the index it was asked for (#2976). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function loadCam(G) {
  const smp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0] };
  const ctx = vm.createContext({
    CamModes: { CAM_MODES: [{ id: "chase" }] },
    Tracks: {
      sample(track, s, out) {
        out.p[0] = 0; out.p[1] = 2; out.p[2] = s;
        out.t[0] = 0; out.t[1] = 0; out.t[2] = 1;
        out.r[0] = 1; out.r[1] = 0; out.r[2] = 0;
        return out;
      },
    },
    Object, Math, Number, Array, isFinite,
  });
  vm.runInContext(fs.readFileSync(new URL("../../js/agent/apex-cam.js", import.meta.url), "utf8"), ctx);
  return vm.runInContext("ApexCam", ctx).hooks(G, {
    smp, smp2: { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0] },
    camVantage: () => ({ eye: [0, 0, 0], tgt: [0, 0, 0], fov: 55 }),
    setCamMode() {},
    snapGameCam() {},
  });
}

function grid() {
  const player = { s: 100, x: 0, px: 1, pz: 100, speed: 40, human: true, isPlayer: true, head: 0 };
  const ai = { s: 250, x: 2, speed: 35, human: false, isPlayer: false };
  const cars = [player, ai];
  return {
    track: { total: 1000 },
    cars,
    player,
    dbgCam: null,
  };
}

test("carOrbit(1) frames the AI and echoes carIdx 1 (no fallback)", () => {
  const G = grid();
  const api = loadCam(G);
  const res = api.carOrbit(1, 180, 14, 30, 1.0);
  assert.ok(res);
  assert.equal(res.carIdx, 1);
  assert.equal(res.fallback, undefined);
  // AI has no px — look-at XZ from Frenet: x=2 → world x = 2, z = s = 250
  assert.ok(Math.abs(res.target[0] - 2) < 1e-9);
  assert.ok(Math.abs(res.target[2] - 250) < 1e-9);
});

test("carOrbit(99) falls back to the player and sets fallback: true", () => {
  const G = grid();
  const api = loadCam(G);
  const res = api.carOrbit(99, 180, 14, 25, 1.0);
  assert.ok(res);
  assert.equal(res.carIdx, 0);
  assert.equal(res.fallback, true);
  assert.ok(Math.abs(res.target[0] - 1) < 1e-9);
  assert.ok(Math.abs(res.target[2] - 100) < 1e-9);
});

test("carOrbit(0) means the player; carIdx is the player's index without a false fallback", () => {
  const G = grid();
  const api = loadCam(G);
  const res = api.carOrbit(0, 180, 14, 25, 1.0);
  assert.ok(res);
  assert.equal(res.carIdx, 0);
  assert.equal(res.fallback, undefined);
});

test("carOrbit(0) when the player is not cars[0] still reports the player index, no fallback", () => {
  const ai = { s: 50, x: 0, speed: 30, human: false, isPlayer: false };
  const player = { s: 100, x: 0, px: 1, pz: 100, speed: 40, human: true, isPlayer: true, head: 0 };
  const G = { track: { total: 1000 }, cars: [ai, player], player, dbgCam: null };
  const api = loadCam(G);
  const res = api.carOrbit(0, 180, 14, 25, 1.0);
  assert.ok(res);
  assert.equal(res.carIdx, 1);
  assert.equal(res.fallback, undefined);
  assert.ok(Math.abs(res.target[0] - 1) < 1e-9);
});
