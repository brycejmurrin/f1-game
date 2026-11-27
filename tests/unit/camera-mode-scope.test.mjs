/* camera-mode-scope.test.mjs — the 'camera-mode' scope on U2.1's Scopes bus (#6920 U2.2, #6950).
 *
 * A camera cut (setCamMode's changed-mode branch, snapGameCam) clears its state
 * through Scopes.exit('camera-mode', { why: 'cut', mode, snap?, track? }). Each
 * camera module registers its own clear at eval; a new camera module adds one
 * registration, not an edit at every cut site. The race-lifetime camera members
 * (results-cam + ceremony on start, the auto-cut state and a WATCH on quit)
 * ride U2.1's race whys. Left explicit in game.js: director.reset, and the
 * resultsCam pairs of startRaceFromSheet / quitToMenu / garageBack.
 *
 * Run: node --test tests/unit/camera-mode-scope.test.mjs
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");
const plain = (v) => JSON.parse(JSON.stringify(v));

const SPIES = {
  "js/camera/extra-rigs.js": `ExtraRigs = Object.assign({}, ExtraRigs, { reset(m) { __spyRec("ExtraRigs.reset:" + m); }, resetAuto() { __spyRec("ExtraRigs.resetAuto"); } })`,
  "js/camera/feel.js": `CamFeel = Object.assign({}, CamFeel, { resetFollow() { __spyRec("CamFeel.resetFollow"); }, resetFreeLook() { __spyRec("CamFeel.resetFreeLook"); }, resetLatch() { __spyRec("CamFeel.resetLatch"); } })`,
  "js/camera/trackside.js": `TracksideCams = Object.assign({}, TracksideCams, { reset(t) { __spyRec("TracksideCams.reset:" + !!t); } })`,
  "js/camera/vantage.js": `GameCams = Object.assign({}, GameCams, { resetSmoothing() { __spyRec("GameCams.resetSmoothing"); } })`,
};
function spyOnEval(rel, ctx) {
  const ev = (s) => vm.runInContext(s, ctx, { filename: "camera-mode-scope:spy" });
  if (!ctx.__spy) ev(`globalThis.__spy = { on: false, log: [] }; globalThis.__spyRec = (n) => { if (__spy.on) __spy.log.push(n); };`);
  if (SPIES[rel]) ev(SPIES[rel]);
}

const games = [];
after(() => { for (const g of games) g.close(); });

test("the camera-mode scope lists its registrants in order, all on the 'cut' why only", async () => {
  const g = await createGame({ track: "monza" });
  games.push(g);
  const S = g.sandbox.Scopes;
  assert.deepEqual(plain(S.ids("camera-mode")), ["cam-feel", "game-cams", "extra-rigs", "trackside"]);
  for (const r of plain(S.describe("camera-mode"))) assert.deepEqual([r.on, r.phase], [["cut"], null], r.id);
  assert.deepEqual(plain(S.ids("race")).filter((id) => ["results-cam", "quit-cams"].includes(id)), ["results-cam", "quit-cams"]);
});

test("the per-path camera reset golden: setCamMode, snapGameCam, startRace and quitToMenu", async () => {
  const g = await createGame({ track: "monza", onEval: spyOnEval });
  games.push(g);
  const ev = (s) => vm.runInContext(s, g.ctx, { filename: "camera-mode-scope:spy" });
  // The rigs ride LAZY_RACE_SESSION (#6957): they evaluate after createGame's onEval path, so spy them here.
  for (const f of ["js/camera/extra-rigs.js", "js/camera/trackside.js"]) ev(SPIES[f]);
  const rec = async (fn) => { ev("__spy.log = []; __spy.on = true"); try { await fn(); } finally { ev("__spy.on = false"); } return JSON.parse(ev("JSON.stringify(__spy.log)")); };
  const G = g.G, a = g.apex, seen = {};
  seen.setCamModeSame = await rec(() => G.setCamMode(G.camMode));
  seen.setCamModeChange = await rec(() => G.setCamMode(G.camMode + 1));
  seen.startRace = await rec(() => G.startRace());
  assert.equal((await g.stepUntil(() => a.info().state === "race", { maxSteps: 2000 })).ok, true);
  seen.snapGameCam = await rec(() => G.snapGameCam());
  seen.quit = await rec(() => G.quitToMenu());
  const full = ["CamFeel.resetFollow", "CamFeel.resetFreeLook", "CamFeel.resetLatch", "GameCams.resetSmoothing", "ExtraRigs.reset:chase", "TracksideCams.reset:true"];   // the lazy rigs register last (#6957)
  assert.deepEqual(seen, {
    setCamModeSame: [],   // an unchanged mode is not a cut
    setCamModeChange: ["CamFeel.resetFollow", "GameCams.resetSmoothing", "ExtraRigs.reset:chase"],   // no free-look, latch or trackside on a switch
    startRace: full,      // startRaceBody's snapGameCam (its old second free-look/latch pair was the same clear)
    snapGameCam: full,
    quit: ["ExtraRigs.resetAuto"],   // quit-cams: the auto-cut state is the race's
  });
});
