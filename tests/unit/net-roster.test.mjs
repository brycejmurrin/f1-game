/* net-roster.test.mjs — WHO IS STILL IN THE RACE, over the same fake wire as
 * net-authority.test.mjs.
 *
 * Star, not mesh: guests only ever learn a rival exists through the host's
 * relay, and the relay simply stopped naming a dropped wire id. Nothing told
 * the other guests it was gone, so their slot stayed net-owned — updateCar
 * never simulated it and the car sat frozen on the track for the rest of the
 * race (bug hunt 2026-09-02, js/net/netplay.js). Three contracts pinned here:
 *   1. the host BROADCASTS a LEFT for the wire id whose session closed;
 *   2. a guest HANDS BACK the named rival on LEFT (AI again, no stale DNF plan);
 *   3. a local stop() SAYS BYE before the sockets close (the handler existed
 *      for a year with no sender).
 *
 * Run: node --test tests/unit/net-roster.test.mjs   (npm run test:net-unit)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seedLogGlobal } from "../helpers/seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
seedLogGlobal();
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
globalThis.M4 = eval(src("js/mat4.js") + ";M4");
const NetSnapshot = eval(src("js/net/snapshot.js") + ";NetSnapshot");
const NetSession = eval(src("js/net/session.js") + ";NetSession");
globalThis.NetSnapshot = NetSnapshot;
globalThis.NetSession = NetSession;
const NetPlay = eval(src("js/net/netplay.js") + ";NetPlay");

function fakeSession() {
  const handlers = new Map();
  const sent = [];
  let onClose = null;
  return {
    sent, closed: 0,
    clearHandlers() { handlers.clear(); return this; },
    onState() { return this; },
    onClose(fn) { onClose = fn; return this; },
    onEvent(type, fn) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(fn);
      return this;
    },
    sendEvent(t, d) { sent.push({ t, d }); return true; },
    sendState() { return true; },
    pump() { return true; },
    alive: () => true,
    lagMs: () => 0,
    rtt: () => 0,
    synced: () => true,
    peerToLocal: (t) => t,
    localToPeer: (t) => t,
    stats: () => ({}),
    close() { this.closed++; handlers.clear(); return true; },
    deliver(type, data) { for (const fn of handlers.get(type) || []) fn(data); },
    drop(why) { if (onClose) onClose(why); },
  };
}

function stubG(n) {
  const car = (i, local) => ({
    idx: i, local: !!local, human: !!local, isPlayer: !!local,
    s: i * 10, x: 0, px: 0, pz: 0, speed: 0, head: 0, lap: 0, mods: null,
    name: "D" + i, code: "D" + i, driverId: "drv" + i, dnfAt: 0.5 + i,
  });
  const cars = [];
  for (let i = 0; i < n; i++) cars.push(car(i, i === 0));
  return {
    cars, player: cars[0], track: { total: 5000, n: 500 },
    netStart: null, netNow: null, announced: [],
    wireId: (c) => c.idx,
    setCarRole: (c, human, local) => { c.human = human; c.local = local; },
    announce: (m) => { /* recorded */ },
    COUNTDOWN_S: 3,
  };
}

test("host: a guest's session closing broadcasts LEFT for that wire id to the others", () => {
  const G = stubG(3);
  const net = NetPlay.create(G);
  const sA = fakeSession(), sB = fakeSession();
  const r = net.start({ role: "host", session: sA, sessions: [{ id: "a", session: sA }, { id: "b", session: sB }] });
  assert.equal(r.ok, true, r.error || "");
  const wires = net.status().remotes.map((x) => x.wire).sort();
  assert.equal(wires.length, 2, "two rivals seated");
  const carA = G.cars.find((c) => c.idx === net.status().remotes[0].wire);
  assert.equal(net.owns(carA), true);

  sA.drop("transport");

  assert.equal(net.active(), true, "one guest leaving does not end the race");
  assert.equal(net.owns(carA), false, "the dropped rival is handed back");
  assert.equal(carA.human, false);
  assert.equal(carA.dnfAt, null, "no stale AI reliability plan may retire the returned car");
  const left = sB.sent.filter((m) => m.t === "left");
  assert.equal(left.length, 1, "exactly one LEFT reaches the remaining guest");
  assert.equal(left[0].d.wire, carA.idx);
});

test("guest: LEFT from the host hands the named rival back to AI", () => {
  const G = stubG(3);
  const net = NetPlay.create(G);
  const s = fakeSession();
  const r = net.start({ role: "guest", session: s, peers: [{ id: "h" }, { id: "c" }] });
  assert.equal(r.ok, true, r.error || "");
  const remotes = net.status().remotes.map((x) => x.wire);
  assert.equal(remotes.length, 2);
  const gone = G.cars.find((c) => c.idx === remotes[1]);
  const kept = G.cars.find((c) => c.idx === remotes[0]);

  s.deliver("left", { wire: gone.idx, why: "peer_closed" });

  assert.equal(net.owns(gone), false);
  assert.equal(gone.human, false);
  assert.equal(gone.dnfAt, null);
  assert.equal(net.owns(kept), true, "the other rival is untouched");
  assert.equal(net.active(), true);
});

test("host: a guest's LEFT is ignored — only the host speaks for the roster", () => {
  const G = stubG(3);
  const net = NetPlay.create(G);
  const sA = fakeSession(), sB = fakeSession();
  net.start({ role: "host", session: sA, sessions: [{ id: "a", session: sA }, { id: "b", session: sB }] });
  const wires = net.status().remotes.map((x) => x.wire);
  const carB = G.cars.find((c) => c.idx === wires[1]);
  sA.deliver("left", { wire: carB.idx });
  assert.equal(net.owns(carB), true);
});

test("a local stop() says BYE before closing the sessions", () => {
  const G = stubG(2);
  const net = NetPlay.create(G);
  const s = fakeSession();
  net.start({ role: "guest", session: s });
  net.stop("local");
  assert.equal(s.sent.some((m) => m.t === "bye"), true, "BYE was broadcast");
  assert.equal(s.closed, 1);
  // A drop is not a leave: no BYE is sent for a transport-reported stop.
  const G2 = stubG(2), net2 = NetPlay.create(G2), s2 = fakeSession();
  net2.start({ role: "guest", session: s2 });
  net2.stop("transport");
  assert.equal(s2.sent.some((m) => m.t === "bye"), false);
});
