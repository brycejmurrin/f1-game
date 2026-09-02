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
 * Round 2 of the same hunt added two more (js/net/netplay.js):
 *   4. a remote's `finished` is stamped from the OWNER's LAP `fin`, never from
 *      an extrapolated lap wrap after a lost packet;
 *   5. a guest whose ARMED lands after the moment was named is told START
 *      again (its first copy was pumped into the lobby, which has no handler).
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
// poseRemote samples the track for yawVis; a straight is enough here.
globalThis.Tracks = { sample: (_t, _s, out) => { out.t[0] = 0; out.t[2] = 1; return out; } };

function fakeSession() {
  const handlers = new Map();
  const sent = [];
  let onClose = null, onStateFn = null;
  return {
    sent, closed: 0,
    clearHandlers() { handlers.clear(); return this; },
    onState(fn) { onStateFn = fn; return this; },
    deliverState(bytes) { if (onStateFn) onStateFn(bytes); },
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
    lapsTarget: 3, raceT: 400,
    worldFromTrack: (s, x) => ({ x: s, z: x }),
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

// ── round 2: the finish is the OWNER's crossing, not a pose ─────────────────
test("host: the owner's LAP `fin` becomes the rival's finishT, sender-bound", () => {
  const G = stubG(3);
  const net = NetPlay.create(G);
  const sA = fakeSession(), sB = fakeSession();
  net.start({ role: "host", session: sA, sessions: [{ id: "a", session: sA }, { id: "b", session: sB }] });
  const wires = net.status().remotes.map((x) => x.wire);
  const carA = G.cars.find((c) => c.idx === wires[0]);
  const carB = G.cars.find((c) => c.idx === wires[1]);

  // B claims A's finishing lap: not B's car, so it is dropped outright.
  sB.deliver("lap", { lap: 4, time: 88.1, code: carA.code, fin: 250.25 });
  assert.equal(carA.finished, undefined, "a LAP is only ever the sender's own");
  assert.equal(carB.finished, undefined);

  sA.deliver("lap", { lap: 4, time: 88.1, code: carA.code, fin: 250.25 });
  assert.equal(carA.finished, true, "the owner's crossing finishes the car");
  assert.equal(carA.finishT, 250.25, "…at the OWNER's raceT, not this screen's");
  // A lap that does not end the race carries no fin and finishes nothing.
  sB.deliver("lap", { lap: 2, time: 90, code: carB.code });
  assert.equal(carB.finished, undefined);
});

test("guest: the host's LAP `fin` lands on the host's car, found by code", () => {
  const G = stubG(2);
  const net = NetPlay.create(G);
  const s = fakeSession();
  net.start({ role: "guest", session: s });
  const rival = G.cars[1];
  s.deliver("lap", { lap: 4, time: 88.1, code: rival.code, fin: 251.5 });
  assert.equal(rival.finished, true);
  assert.equal(rival.finishT, 251.5);
});

test("a remote is never marked finished from an EXTRAPOLATED lap wrap", () => {
  const G = stubG(2);
  const net = NetPlay.create(G);
  const s = fakeSession();
  net.start({ role: "guest", session: s, interpDelayMs: 100 });
  const rival = G.cars[1];
  const pkt = (t, car) => NetSnapshot.encodeSnapshot(t, [{ id: rival.idx, car }]);
  // Last real packet: 5 m short of the line on the final lap, then loss.
  s.deliverState(pkt(1000, { s: 4995, x: 0, head: 0, speed: 80, lap: 3 }));
  net.tick(1350);                       // target 1250 > newest.t → advance() wraps s and bumps lap
  assert.equal(rival.lap, 4, "the extrapolated pose does cross the line (scratch/interp-wrap)");
  assert.notEqual(rival.finished, true, "…but a guessed crossing must not finish the car");
  // The real packets: the car braked and was still on lap 3.
  s.deliverState(pkt(1300, { s: 4999, x: 0, head: 0, speed: 20, lap: 3 }));
  s.deliverState(pkt(1400, { s: 4999.5, x: 0, head: 0, speed: 10, lap: 3 }));
  net.tick(1450);
  assert.equal(rival.lap, 3);
  assert.notEqual(rival.finished, true);
  // A real crossing, bracketed by two packets, still stamps the fallback.
  s.deliverState(pkt(1500, { s: 10, x: 0, head: 0, speed: 20, lap: 4 }));
  s.deliverState(pkt(1600, { s: 18, x: 0, head: 0, speed: 20, lap: 4 }));
  net.tick(1650);
  assert.equal(rival.finished, true, "a non-extrapolated sample past the target finishes it");
  assert.equal(rival.finishT, G.raceT);
});

// ── round 2: a late ARMED still gets the moment ─────────────────────────────
test("host: an ARMED that lands after the moment was named is answered with START", () => {
  const G = stubG(3);
  const net = NetPlay.create(G);
  const sA = fakeSession(), sB = fakeSession();
  net.start({ role: "host", session: sA, sessions: [{ id: "a", session: sA }, { id: "b", session: sB }] });
  G.netNow = 1000;
  assert.equal(net.hostStart(), true);
  sA.deliver("armed", {});
  const starts = (s) => s.sent.filter((m) => m.t === "start");
  assert.equal(starts(sA).length, 0, "b has not armed: nothing is named yet");
  net.tick(1000 + 20000 + 1);           // ARM_WAIT expires: the moment is named without b
  assert.equal(starts(sA).length, 1);
  assert.equal(starts(sB).length, 1, "b was told too — but it was still inside startRace()");
  sB.deliver("armed", {});              // b's netplay is up now, its lobby session ate the first START
  assert.equal(starts(sB).length, 2, "the named moment is told again to the late armer");
  assert.equal(starts(sB)[1].d.at, starts(sB)[0].d.at, "the SAME moment, not a new one");
  assert.equal(starts(sA).length, 1, "nobody else hears it twice");
  // Before the moment is named a late ARMED is just an ARMED.
  const G2 = stubG(2), net2 = NetPlay.create(G2), s2 = fakeSession();
  net2.start({ role: "host", session: s2 });
  G2.netNow = 1000;
  net2.hostStart();
  s2.deliver("armed", {});
  assert.equal(starts(s2).length, 1, "all armed: named once, sent once");
});
