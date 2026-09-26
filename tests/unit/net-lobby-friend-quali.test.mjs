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
