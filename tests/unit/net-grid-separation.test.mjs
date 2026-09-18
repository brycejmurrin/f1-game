/* separateGrid() — the one place a multiplayer grid can disagree across peers.
 *
 * WHAT IT IS FOR. gridUp()'s pace branch splices THE LOCAL player to P12, and it
 * runs on every machine, so out of the box each peer's own car and every rival's
 * sit in the same slot — rivals posed directly inside you. separateGrid() fixes
 * that with no extra message: every peer sorts the humans by wireId and lays
 * that order into consecutive boxes, starting from a number all of them compute
 * the same way.
 *
 * THE DEFECT, found by survey 2026-09-18. That number was `localCar.gridPos`,
 * which is 12 on every peer ONLY on the pace grid. A grid built from a
 * pre-order — qualifying — takes no P12 step at all: every car holds its
 * qualified slot on every machine, so `localCar.gridPos` is wherever THIS
 * player qualified, each peer anchors the human block somewhere else, and each
 * swaps a different set of AI cars out of the way. Two peers would then
 * disagree about who is standing where on the grid, before a wheel turns.
 *
 * Run: node --test tests/unit/net-grid-separation.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seedLogGlobal } from "../helpers/seed-log.mjs";

// The same loader tests/unit/net-authority.test.mjs uses: netplay.js closes over
// NetSnapshot and NetSession as globals, and the real ones cost nothing.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
seedLogGlobal();
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
globalThis.M4 = eval(src("js/core/mat4.js") + ";M4");
globalThis.NetSnapshot = eval(src("js/net/snapshot.js") + ";NetSnapshot");
globalThis.NetSession = eval(src("js/net/session.js") + ";NetSession");
const NetPlay = eval(src("js/net/netplay.js") + ";NetPlay");

/** A grid of `n` cars, with the swaps separateGrid asks for recorded rather than
 *  performed — the question is WHETHER it re-lays the grid, not what a swap does.
 *
 *  gridPos runs BACKWARDS (car i at n - i) for one reason: pickRemoteSlot seats
 *  the peers in cars[1] and cars[2], and if those already sat at the two slots
 *  after the local car's, separateGrid would correctly do nothing and the
 *  pace-grid test would pass against a gutted function. A grid the humans are
 *  NOT already consecutive on is what makes that test able to fail. */
function gridG(n, { preOrdered }) {
  const cars = [];
  for (let i = 0; i < n; i++) {
    cars.push({ idx: i, local: i === 0, human: i === 0, isPlayer: i === 0, gridPos: n - i,
      s: i * 10, x: 0, px: 0, pz: 0, speed: 0, head: 0, lap: 0, mods: null,
      name: "D" + i, code: "D" + i, driverId: "drv" + i });
  }
  const G = {
    cars, player: cars[0], track: { total: 5000, n: 500 },
    netStart: null, netNow: null, announcements: [], swaps: [],
    gridPreOrdered: preOrdered,
    wireId: (c) => c.idx,
    setCarRole: (c, human, local) => { c.human = human; c.local = local; },
    announce: (m) => G.announcements.push(m),
    swapGridSlots: (a, b) => { G.swaps.push([a.idx, b.idx]); const t = a.gridPos; a.gridPos = b.gridPos; b.gridPos = t; },
    applyCaution() {}, onPeerQuali() {}, onPeerQualiLive() {},
    COUNTDOWN_S: 3,
  };
  return G;
}

/** The session surface NetPlay binds to — the same shape
 *  tests/unit/net-authority.test.mjs feeds it. */
function fakeSession() {
  const handlers = new Map();
  const closeHandlers = [];
  return {
    sent: [], closed: 0,
    clearHandlers() { handlers.clear(); closeHandlers.length = 0; return this; },
    onState() { return this; },
    onClose(fn) { closeHandlers.push(fn); return this; },
    onEvent(t, fn) { if (!handlers.has(t)) handlers.set(t, []); handlers.get(t).push(fn); return this; },
    sendEvent(t, d) { this.sent.push({ t, d }); return true; },
    sendState() { return true; },
    pump() { return true; },
    alive: () => true, lagMs: () => 0, rtt: () => 0, synced: () => true,
    peerToLocal: (t) => t, localToPeer: (t) => t, stats: () => ({}),
    close() { this.closed++; handlers.clear(); closeHandlers.length = 0; return true; },
  };
}

/** Start a host holding two guests, so THREE humans share the grid. */
function startWithPeers(G) {
  const net = NetPlay.create(G);
  const sa = fakeSession(), sb = fakeSession();
  const r = net.start({ role: "host", session: sa,
    sessions: [{ id: "a", session: sa }, { id: "b", session: sb }],
    peers: [{ id: "a" }, { id: "b" }] });
  assert.equal(r.ok, true, `start() must seat two guests: ${r.error || ""}`);
  return net;
}

test("a PACE grid is re-laid, because every peer's own car is at P12", () => {
  // The behaviour that must not regress: without this, remote cars are posed
  // inside the local one.
  const G = gridG(8, { preOrdered: false });
  startWithPeers(G);
  assert.ok(G.swaps.length > 0,
    "separateGrid must still lay the humans into consecutive boxes on the pace grid — that is the defect it exists for");
});

test("a QUALIFYING grid is left exactly as qualifying laid it", () => {
  const G = gridG(8, { preOrdered: true });
  const before = G.cars.map((c) => c.gridPos);
  startWithPeers(G);
  assert.deepEqual(G.swaps, [],
    "a pre-ordered grid is already peer-identical, and re-anchoring it on the LOCAL car's slot puts the humans " +
    "in different boxes on every machine");
  assert.deepEqual(G.cars.map((c) => c.gridPos), before, "and no car may have moved");
});
