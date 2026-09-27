// A friend-race start that is cancelled or throws must release the lobby's hold
// on qualifying saves (friendQualifying gates Quali.persistOrder).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seedLogGlobal } from "../helpers/seed-log.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
seedLogGlobal();
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
globalThis.M4 = eval(src("js/core/mat4.js") + ";M4");
globalThis.NetSnapshot = eval(src("js/net/snapshot.js") + ";NetSnapshot");
globalThis.NetSession = eval(src("js/net/session.js") + ";NetSession");
globalThis.NetPlay = eval(src("js/net/netplay.js") + ";NetPlay");
globalThis.NetBytes = eval(src("js/net/bytes.js") + ";NetBytes");
const NetTransport = eval(src("js/net/transport.js") + ";NetTransport");
globalThis.NetTransport = NetTransport;
globalThis.NetHandshake = eval(src("js/net/handshake.js") + ";NetHandshake");
globalThis.document = { getElementById: () => null, addEventListener: () => {} };
globalThis.Teams = { LIST: [
  { id: "alpha", name: "Alpha", drivers: [{ code: "AL1", name: "A One", num: 1 }, { code: "AL2", name: "A Two", num: 2 }] },
  { id: "bravo", name: "Bravo", drivers: [{ code: "BR1", name: "B One", num: 3 }, { code: "BR2", name: "B Two", num: 4 }] } ] };
globalThis.Tracks = { LIST: Array.from({ length: 6 }, (_, i) => ({ id: "track-" + i })) };
globalThis.ApexClipboard = eval(src("js/core/clipboard.js") + ";ApexClipboard");
globalThis.NetQr = { draw: () => false };
globalThis.NetScan = { supported: () => false, create: () => ({ start: async () => ({ ok: false }), stop() {} }) };
globalThis.LobbyCodes = eval(src("js/net/lobby-codes.js") + ";LobbyCodes");
const NetLobby = eval(src("js/net/lobby.js") + ";NetLobby");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function hostUp(startRace) {
  const G = { teamIdx: 0, driverIdx: 0, trackIdx: 0, raceLaps: 3, raceWeather: "dry", raceTimeOfDay: "day",
    raceQuali: true, raceGrid: "quali", difficulty: 1, raceChangeable: false, wxArcPlan: null,
    onPeerQuali() {}, onPeerQualiLive() {}, setNetRoom() {}, store: { get: (k, d) => d, set() {} },
    netPlay: { start: () => true }, startRace };
  G.openQualiForNet = (done) => { G._done = done; };
  const lobby = NetLobby.create(G);
  let far = null;
  lobby.setTransportFactory(() => { const p = NetTransport.loopback({ latencyMs: 0 }); far = p[1]; return p[0]; });
  const old = NetTransport.prefetchIce; NetTransport.prefetchIce = () => null;
  try { await lobby.host(); } finally { NetTransport.prefetchIce = old; }
  lobby.watchForOpen(); await sleep(400);
  const peerSays = (t, d) => { far.send("event", JSON.stringify({ t, d })); far.pump(performance.now()); };
  peerSays("hello", { team: "bravo", driver: 1 }); await sleep(80);
  peerSays("ready", { ready: true }); await sleep(80);
  lobby.setReady(true); await sleep(80);
  return { G, lobby };
}

for (const [name, startRace] of [
  ["cancelled start", async () => ({ kind: "canceled", reason: "superseded" })],
  ["failed start", async () => { throw new Error("scenery failed"); }],
]) {
  test("friendQualifying after a " + name, async () => {
    const { G, lobby } = await hostUp(startRace);
    try {
      assert.equal(lobby.startFromRoom(), true, "race started from the room");
      assert.equal(lobby.qualifying(), true, "lobby owns qualifying");
      await G._done();   // TO THE GRID -> finishStart
      assert.equal(lobby.qualifying(), false, "qualifying flag must clear once the start is over");
    } finally { lobby.cancel(); }
  });
}

test("hunt fixes: SIMULATE / no valid lap still reports a time; tyres + reliability are race rules; a paused friend race brakes the car; no garage in MP", async () => {
  const { readFileSync } = await import("node:fs");
  const r = (f) => readFileSync(new URL("../../" + f, import.meta.url), "utf8");
  const game = r("js/game.js");
  // driven(Infinity) when every lap was deleted for track limits (NO TIME), else 0.
  assert.match(game, /quali\.simulate\(qualiNet\.driven\([^\n]*\? Infinity : 0\)\);[^\n]*\s*reportModelQuali\(\);/, "SIMULATE sends the model's time");
  assert.match(game, /if \(!\(myLap > 0\)\) reportModelQuali\(\);/, "a lap with no valid time sends the model's time");
  assert.match(game, /if \(c\.local && paused && netPlay\.active\(\)\) return PAUSED_NET_INPUT;/);
  const lobby = r("js/net/lobby.js");
  assert.match(lobby, /tyres: G\.raceTyreWear, reliab: G\.raceReliability,/);
  // Applied in memory only (roomOnly puts the guest's save back) — behaviour
  // pinned in net-authority.test.mjs "never overwrite the guest's SAVED choice".
  assert.match(lobby, /if \(own\(next, "tyres"\)\) roomOnly\("tyreWear", \(\) => \{ G\.raceTyreWear = next\.tyres; \}\);/);
  assert.match(r("js/ui/hud.js"), /workBtn\.hidden = [^\n]*G\.netPlay\.active\(\)/);
});

test("a networked race clock is anchored to the SHARED green, so a peer that lost frames is not classified ahead", async () => {
  const { readFileSync } = await import("node:fs");
  const game = readFileSync(new URL("../../js/game.js", import.meta.url), "utf8");
  assert.match(game, /netGreen = netStart \? \{ base: netStart\.at - raceT \* 1000, now: netStart\.now \} : null;/,
    "set at EVERY green (a red-flag restart re-bases on the clock it resumes from); a solo green clears it");
  const body = game.match(/ {2}raceT \+= dt;\n {2}if \(netGreen\) \{[\s\S]*?\n {2}\}/)[0];
  // Run the real catch-up: 5 s in a background tab -> the local sim summed only
  // 0.25 s (the dt clamp); wall time since green is 65 s.
  let raceT = 60, dt = 0.25, now = 1000 + 65000;
  const netGreen = { base: 1000, now: () => now };
  eval(body.replace(/^ {2}/gm, ""));
  assert.equal(raceT, 65, "the clock carries the time the tab was away");
  now = 1000 + 64000; raceT = 64.9; dt = 0.016;
  eval(body.replace(/^ {2}/gm, ""));
  assert.ok(Math.abs(raceT - 64.916) < 1e-9, "never pulled BACK: the sim clock only ever catches up");
});

test("a reopened room code remembers the answers it already took (a guest's reposts are not a new joiner)", async () => {
  const { readFileSync } = await import("node:fs");
  const lobby = readFileSync(new URL("../../js/net/lobby.js", import.meta.url), "utf8");
  assert.match(lobby, /if \(!opts\.quiet \|\| !_answersSeen \|\| _answersSeen\.code !== code\) _answersSeen = \{ code, set: new Set\(\) \};/);
  assert.match(lobby, /const answersSeen = _answersSeen\.set;/);
});
