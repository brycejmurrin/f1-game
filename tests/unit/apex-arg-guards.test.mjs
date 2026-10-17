import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// Live js-debugger sweep (#2586): non-finite hook arguments wrote NaN into the player / camera / career.
function loadApex(G, extra) {
  const context = vm.createContext(Object.assign({
    CamModes: { CAM_MODES: [{ id: "chase" }, { id: "cockpit" }] }, LightTune: { TUNE_DEFS: [], LT: {} },
    AgentView: { create: () => ({}) },
  }, extra));
  vm.runInContext(fs.readFileSync(new URL("../../js/agent/apex-net.js", import.meta.url), "utf8"), context);
  vm.runInContext(fs.readFileSync(new URL("../../js/agent/apex.js", import.meta.url), "utf8"), context);
  return vm.runInContext("ApexApi", context).create(G);
}

test("jump() refuses non-finite arguments before touching the player", () => {
  const player = { prog: 100, s: 100, speed: 5, x: 0 };
  const api = loadApex({ player, track: { total: 5000 } });
  for (const bad of [[Infinity], ["x"], [{}], [0.5, NaN], [0.5, 10, Infinity]])
    assert.equal(api.jump(...bad), false, JSON.stringify(bad));
  assert.deepEqual(player, { prog: 100, s: 100, speed: 5, x: 0 });
});

test("camera() rejects NaN and fractional indices without calling setCamMode", () => {
  const calls = [];
  const api = loadApex({ track: {}, camMode: 0, setCamMode: (i) => calls.push(i) });
  for (const bad of [NaN, 1.5, -1, 2, "nope"]) assert.equal(api.camera(bad), false, String(bad));
  assert.deepEqual(calls, []);
  api.camera("cockpit");
  assert.deepEqual(calls, [1]);
});

test("careerGrant() maps a non-finite amount to the default grant", () => {
  const got = [];
  const api = loadApex({ track: {} }, { Career: { grant: (n) => { got.push(n); return 1; } } });
  for (const v of [Infinity, NaN, "x"]) api.careerGrant(v);
  api.careerGrant(250);
  assert.deepEqual(got, [undefined, undefined, undefined, 250]);
});

test("setSpeed / spin / nudge / aim / setLap refuse non-finite input and leave the player alone", () => {
  const player = { px: 0, speed: 10, head: 1, vLat: 0, lap: 2, s: 0 };
  const before = { ...player };
  const api = loadApex({ player, track: { total: 100 }, cars: [] }, { Tracks: { sample: () => {} } });
  assert.equal(api.setSpeed(), false); assert.equal(api.setSpeed(NaN), false);
  assert.equal(api.spin(), false); assert.equal(api.spin(Infinity), false);
  assert.equal(api.nudge(Infinity), false); assert.equal(api.nudge(0, NaN), false);
  assert.equal(api.aim(Infinity), false);
  assert.equal(api.setLap(Infinity), false);
  assert.deepEqual(player, before);
  assert.equal(api.rivals(-1).length, 0);
});

test("act()/step() fall back to one 1/60 s step on non-finite dt/n instead of update(NaN) or looping forever", () => {
  const dts = [];
  const G = { player: { px: 0 }, track: {}, cars: [], state: "race", update: (d) => dts.push(d), syncRenderAnchors: () => {} };
  const api = loadApex(G, { AgentView: { create: () => ({}), syncRenderAnchors: () => {}, obs: () => ({}) } });
  api.step(NaN, Infinity); api.step(-1, NaN); api.step(0.5, 2);
  assert.deepEqual(dts, [1 / 60, 1 / 60, 0.5, 0.5]);
});

test("reset() / seed() / garageParts() refuse non-finite or non-string input before mutating", () => {
  let owners = 0, saved = null;
  const player = { prog: 7 };
  const G = { player, track: { total: 100 }, seed: 5, resetEpisodeOwners: () => { owners++; },
    setupPreviewOn: true, teamIdx: 0, getTeamParts: () => ({ aero: "a" }), saveTeamParts: (t, p) => { saved = p; },
    buildSetup: () => {} };
  const api = loadApex(G, { Teams: { LIST: [{ id: "t" }] } });
  for (const bad of [[Infinity], [0, NaN], [0, 1, "x"], [0, 1, 0, NaN]]) assert.equal(api.reset(...bad), false);
  assert.equal(owners, 0); assert.equal(player.prog, 7);
  api.seed(NaN); api.seed("x"); assert.equal(G.seed, 5);
  api.seed(9); assert.equal(G.seed, 9);
  api.garageParts({ aero: Infinity, engine: {}, brakes: "carbon" });
  assert.deepEqual({ ...saved }, { aero: "a", brakes: "carbon" });
});
