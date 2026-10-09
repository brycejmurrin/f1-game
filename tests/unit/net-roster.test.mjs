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
 * Netplay hardening added: 6. the host lets a guest's lap rise one per driven
 *   crossing, bounds `fin` and lap times, and 7. relays LAP to the other guests.
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
globalThis.M4 = eval(src("js/core/mat4.js") + ";M4");
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
    // Mirror real NetSession.close(): fire onClose("local") so stop() teardown
    // cannot hide a re-entrant onClose the way a silent stub did.
    close() {
      this.closed++;
      const fn = onClose;
      handlers.clear();
      onClose = null;
      if (fn) fn("local");
      return true;
    },
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

// With AI replication (docs/notes/MULTIPLAYER-AI-REPLICATION.md) the car a
// guest left is the HOST's AI from then on, posed from the host's packets like
// the rest of the field; `hostAi: false` is the pre-replication behaviour,
// where the guest's own AI took it. Both: no longer a human, no stale DNF plan.
test("guest: LEFT from the host hands the named rival to the HOST's AI (posed from the wire)", () => {
  const G = stubG(3);
  const net = NetPlay.create(G);
  const s = fakeSession();
  const r = net.start({ role: "guest", session: s, peers: [{ id: "h" }, { id: "c" }] });
  assert.equal(r.ok, true, r.error || "");
  const wires = net.status().remotes.map((x) => x.wire);
  const gone = G.cars.find((c) => c.idx === wires[1]);
  const kept = G.cars.find((c) => c.idx === wires[0]);
  s.deliver("left", { wire: gone.idx, why: "peer_closed" });
  assert.equal(gone.human, false, "not a human any more");
  assert.equal(net.owns(gone), true, "the host's AI drives it; this screen poses it, never re-simulates it");
  assert.deepEqual(net.status().remotes.map((x) => x.wire), [kept.idx], "gone from the human rivals");
  assert.equal(net.owns(kept), true, "the other rival is untouched");
  assert.equal(net.active(), true);
});

test("guest without AI replication: LEFT from the host hands the named rival back to local AI", () => {
  const G = stubG(3);
  const net = NetPlay.create(G);
  const s = fakeSession();
  const r = net.start({ role: "guest", session: s, peers: [{ id: "h" }, { id: "c" }], hostAi: false });
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

test("a repeated start cannot abandon the active race's owned session", () => {
  const G = stubG(3);
  const net = NetPlay.create(G);
  const first = fakeSession(), second = fakeSession();
  assert.equal(net.start({ role: "guest", session: first }).ok, true);
  const owned = G.cars.find((c) => net.owns(c));

  const again = net.start({ role: "guest", session: second });

  assert.equal(again.error, "already_active");
  assert.equal(net.active(), true);
  assert.equal(net.owns(owned), true, "the first race keeps its remote car");
  assert.equal(first.closed, 0, "the first transport remains owned and live");
  assert.equal(second.closed, 0, "the refused transport remains caller-owned");
  net.stop("local");
  assert.equal(first.closed, 1, "normal teardown still closes the adopted session");
  assert.equal(second.closed, 0);
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

  // `fin` must sit near this screen's raceT (shared through netStart) and the
  // POSE must be past the target; one that lands first waits for the pose.
  G.raceT = 251;
  sA.deliver("lap", { lap: 4, time: 88.1, code: carA.code, fin: 250.25 });
  assert.equal(carA.finished, undefined, "the pose has not crossed yet: fin is held");
  assert.equal(carA._nFin, 250.25);
  carA.lap = 4;                          // the posed crossing (poseRemote) lands
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
  G.raceT = 252; rival.lap = 4;          // posed past the target, fin near raceT
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
  net.tick(1000 + 45000 + 1);           // ARM_WAIT expires: the moment is named without b
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

// ── round 3: the guest stops saying ARMED once a START was accepted ─────────
test("guest: ARMED is re-sent until a START lands, and never again once the countdown consumed it", () => {
  // rtc-e2e 2026-09-27: the guest showed startPending=true at lap 1 while the
  // host showed false. The re-send keyed on `!G.netStart` alone, the countdown
  // nulls netStart at lights-out, so the guest said ARMED every second all
  // race, the host answered each with the named moment, and the guest carried
  // a past-dated netStart into any red-flag restart (instant lights, raceT
  // re-based to the original green).
  const G = stubG(2);
  const net = NetPlay.create(G);
  const s = fakeSession();
  assert.equal(net.start({ role: "guest", session: s }).ok, true);
  const armed = () => s.sent.filter((m) => m.t === "armed").length;
  assert.equal(armed(), 1, "one ARMED from start()");
  net.tick(1000); net.tick(2100); net.tick(3200);
  const beforeStart = armed();
  assert.ok(beforeStart >= 3, `re-sent while no START has landed (${beforeStart})`);
  G.netNow = 3200;
  s.deliver("start", { at: 3200 + 4000, hold: 0.5 });
  assert.ok(G.netStart, "the START was accepted");
  G.netStart = null;                     // lights-out: game.js consumes it
  for (let t = 4300; t < 30000; t += 1000) net.tick(t);
  assert.equal(armed(), beforeStart, "no ARMED after the START was accepted — not even with netStart consumed");
  assert.equal(G.netStart, null, "and nothing re-armed a stale moment");
  // A NEW race (start() again) arms afresh.
  net.stop("local");
  const s2 = fakeSession();
  assert.equal(net.start({ role: "guest", session: s2 }).ok, true);
  net.tick(40000); net.tick(41100);
  assert.ok(s2.sent.filter((m) => m.t === "armed").length >= 2, "the next race re-sends until its own START");
  net.stop("local");
});

// ── predict() output is clamped exactly like the posed sample (NetPlay.clampWire)
// The contact solver reads c._nProg/_nX/_nSpd from predict(); they used to be
// the raw interp values while poseRemote clamped its copy, so one packet was
// refused as a pose and accepted as a collision partner.
test("predict() and the tick's _n fields are clamped through the same helper as the pose", () => {
  const G = stubG(2);
  G.lapsTarget = 5;
  const net = NetPlay.create(G);
  const s = fakeSession();
  assert.equal(net.start({ role: "guest", session: s, interpDelayMs: 0 }).ok, true);
  const rival = G.cars[1];
  const pkt = (t, car) => NetSnapshot.encodeSnapshot(t, [{ id: rival.idx, car }]);
  // Beyond the track (total 5000), beyond ±200 m laterally, beyond ±200 m/s,
  // and a lap past the target+1 clamp — every field the wire can carry wrong.
  s.deliverState(pkt(1000, { s: 40000000, x: 300, head: 3, speed: 320, lap: 200 }));
  s.deliverState(pkt(1100, { s: 40000000, x: 300, head: 3, speed: 320, lap: 200 }));
  net.tick(1100);
  const p = net.predict(rival, 1100);
  assert.ok(p, "a prediction exists");
  assert.ok(p.s <= 5000 && p.s >= 0, `s clamped to the lap, got ${p.s}`);
  assert.equal(p.x, 200); assert.equal(p.speed, 200); assert.equal(p.lap, 6);
  assert.ok(rival._nOk);
  assert.equal(rival._nX, 200); assert.equal(rival._nSpd, 200);
  assert.ok(rival._nProg <= 6 * 5000, `_nProg follows the clamped lap/s, got ${rival._nProg}`);
  assert.equal(rival.s, p.s, "the posed s and the predicted s agree (delay 0)");
  // The helper itself, on the shapes that used to hang the tab.
  const c = NetPlay.clampWire({ s: Infinity, x: NaN, head: 1e9, speed: -Infinity, lap: "7" }, 5000, 5);
  assert.deepEqual([c.s, c.x, c.speed, c.lap], [0, 0, 0, 6], "non-finite reads as 0, exactly as the pose always did");
  assert.deepEqual(NetPlay.clampWire({ s: -5, x: -999, head: 0, speed: -999, lap: -3 }, 5000, 5).speed, -200);
  assert.ok(Math.abs(c.head) <= Math.PI, "head is wrapped into one turn");
  // The wire gear is a nibble (0-15); the gearbox has 8, and gearHi(g) is undefined above them.
  const gearOf = (gear) => NetPlay.clampWire({ s: 0, x: 0, head: 0, speed: 0, lap: 1, gear }, 5000, 5).gear;
  assert.equal(gearOf(15), 8, "a corrupt 15 cannot index past the box");
  assert.equal(gearOf(0), 1);
  assert.equal(gearOf(undefined), 1);
  assert.equal(gearOf(5), 5, "a real gear passes untouched");
  net.stop("local");
});

// ── a guest cannot declare itself the winner (host side) ────────────────────
// clampWire caps a wire lap at lapsTarget+1 — exactly "finished" — so one
// packet used to latch `finished` on the host. The host now lets a remote's
// lap rise by ONE per crossing (s wrapping), after a mid-lap sighting.
function hostWithGuest() {
  const G = stubG(3);
  const net = NetPlay.create(G);
  const sA = fakeSession(), sB = fakeSession();
  const r = net.start({ role: "host", session: sA, interpDelayMs: 0,
    sessions: [{ id: "a", session: sA }, { id: "b", session: sB }] });
  assert.equal(r.ok, true, r.error || "");
  const wires = net.status().remotes.map((x) => x.wire);
  const carA = G.cars.find((c) => c.idx === wires[0]);
  const carB = G.cars.find((c) => c.idx === wires[1]);
  let t = 1000;
  // back > 0 ticks inside the last two packets: a blended, NON-extrapolated
  // pose (the only kind that may finish a car); 0 extrapolates from the newest.
  const pose = (st, back = 0) => {
    t += 50;
    sA.deliverState(NetSnapshot.encodeSnapshot(t, [{ id: carA.idx, car: Object.assign({ x: 0, head: 0, speed: 60 }, st) }]));
    net.tick(t - back);
  };
  return { G, net, sA, sB, carA, carB, pose };
}

test("host: a guest's wire lap cannot jump to the chequered flag", () => {
  const { carA, pose } = hostWithGuest();
  pose({ s: 4990, lap: 0 });
  pose({ s: 100, lap: 4 });              // one crossing, but claims lap 4 (= finished)
  assert.equal(carA.lap, 1, "one crossing earns one lap, whatever the wire says");
  assert.notEqual(carA.finished, true);
  pose({ s: 200, lap: 4 });              // no crossing: nothing earned
  assert.equal(carA.lap, 1);
});

test("host: toggling s across the line without driving the lap earns nothing", () => {
  const { carA, pose } = hostWithGuest();
  pose({ s: 4990, lap: 0 }); pose({ s: 5, lap: 1 });
  assert.equal(carA.lap, 1, "the grid's first crossing counts");
  for (let i = 0; i < 6; i++) { pose({ s: 4995, lap: 2 + i }); pose({ s: 5, lap: 2 + i }); }
  assert.equal(carA.lap, 1, "wraps with no mid-lap sighting are refused");
  assert.notEqual(carA.finished, true);
});

test("host: laps faster than the wire's speed ceiling allows are refused", () => {
  const { G, carA, pose } = hostWithGuest();
  pose({ s: 4990, lap: 0 }); pose({ s: 5, lap: 1 });
  assert.equal(carA.lap, 1);
  // Three packets a "lap", with no race clock passing: 5 laps in 1.5 s of wire.
  for (let i = 0; i < 6; i++) { pose({ s: 2500, lap: 2 + i }); pose({ s: 4500, lap: 2 + i }); pose({ s: 250, lap: 2 + i }); }
  assert.equal(carA.lap, 1, "a lap needs total / SPEED_LIMIT of race clock since the last rise");
  assert.notEqual(carA.finished, true);
  G.raceT += 90;
  pose({ s: 2500, lap: 2 }); pose({ s: 4990, lap: 2 }); pose({ s: 5, lap: 2 });
  assert.equal(carA.lap, 2, "a real lap's worth of clock later, the crossing counts");
});

test("host: a lap actually driven still counts, through to the finish", () => {
  const { G, carA, pose } = hostWithGuest();
  pose({ s: 4990, lap: 0 });
  for (let lap = 1; lap <= G.lapsTarget + 1; lap++) {
    pose({ s: 5, lap });
    assert.equal(carA.lap, lap, `lap ${lap} counted`);
    if (lap <= G.lapsTarget) { pose({ s: 2500, lap }); G.raceT += 90; pose({ s: 4990, lap }); }   // a lap takes time
  }
  assert.notEqual(carA.finished, true, "an extrapolated crossing never finishes a car");
  pose({ s: 15, lap: G.lapsTarget + 1 }, 10);
  assert.equal(carA.finished, true, "the real finish still finishes the car");
  assert.equal(carA.finishT, G.raceT);
});

test("host: a LAP `fin` far from this race clock is refused", () => {
  const { G, sA, carA } = hostWithGuest();
  carA.lap = G.lapsTarget + 1;
  sA.deliver("lap", { lap: 4, time: 88.1, code: carA.code, fin: 1 });   // raceT is 400
  assert.notEqual(carA.finished, true, "a fin minutes before now cannot win");
  assert.equal(carA._nFin, null, "and is not held for later either");
  sA.deliver("lap", { lap: 4, time: 88.1, code: carA.code, fin: G.raceT - 1 });
  assert.equal(carA.finished, true);
  assert.equal(carA.finishT, G.raceT - 1);
});

test("host: a guest's short-distance fin cannot raise or relay the chequered flag", () => {
  const { G, net, sA, sB, carA, pose } = hostWithGuest();
  carA.lap = 1;
  sA.deliver("lap", { lap: 1, code: carA.code, fin: G.raceT, invalid: true });
  assert.notEqual(carA.finished, true, "the opening crossing cannot finish a car");
  assert.equal(carA._nFin, null);
  carA.lap = 2;
  sA.deliver("lap", { lap: 2, code: carA.code, fin: G.raceT, invalid: true });
  pose({ s: 100, lap: 2 }, 10);
  assert.notEqual(carA.finished, true, "the target is three laps and no winner has finished");
  assert.equal(G.cars.some((c) => c.finished), false);
  assert.ok(sB.sent.filter((m) => m.t === "lap").every((m) => m.d.fin === undefined), "guests cannot receive an unapproved finish");
  G.raceT += 6;
  pose({ s: 200, lap: 2 }, 10);
  assert.equal(carA._nFin, null, "an early claim expires instead of waiting for the eventual real flag");
  G.player.finished = true; G.player.lap = 4;
  pose({ s: 300, lap: 2 }, 10);
  assert.notEqual(carA.finished, true, "a later legitimate winner cannot resurrect the early claim");
  net.stop();
});

test("host: a lapped fin preceding the winner's interpolated pose waits, then relays", () => {
  const { G, net, sA, sB, carA, pose } = hostWithGuest();
  carA.lap = 2;
  sA.deliver("lap", { lap: 2, code: carA.code, fin: G.raceT - 0.1, invalid: true });
  pose({ s: 100, lap: 2 }, 10);
  assert.notEqual(carA.finished, true);
  assert.equal(sB.sent.filter((m) => m.t === "lap").at(-1).d.fin, undefined);
  G.player.finished = true; G.player.lap = 4;
  pose({ s: 200, lap: 2 }, 10);
  assert.equal(carA.finished, true);
  assert.equal(carA.finishT, G.raceT - 0.1);
  const relayed = sB.sent.filter((m) => m.t === "lap").at(-1).d;
  assert.equal(relayed.fin, carA.finishT);
  assert.equal(relayed.lap, 2, "the deferred finish retains the owner's finishing crossing");
  net.stop();
});

test("host: lap times outside what can be driven never reach the car", () => {
  const { sA, carA } = hostWithGuest();
  // total 5000 m / 200 m/s wire ceiling = 25 s is the floor; QUALI_MAX_S the roof.
  for (const bad of [0.001, 10, 25, 3600, 1e9, -5, "x"]) {
    sA.deliver("lap", { lap: 2, time: bad, best: bad, code: carA.code });
    assert.notEqual(carA.lastLap, bad, `time ${bad} refused`);
    assert.notEqual(carA.best, bad, `best ${bad} refused`);
  }
  sA.deliver("lap", { lap: 2, time: 88.1, best: 87.5, code: carA.code });
  assert.equal(carA.lastLap, 88.1);
  assert.equal(carA.best, 87.5);
});

// ── 3+ players: the host relays LAP (star, not mesh) ────────────────────────
test("host: a guest's LAP is relayed to every OTHER guest, named by its seat", () => {
  const { G, sA, sB, carA } = hostWithGuest();
  const laps = (s) => s.sent.filter((m) => m.t === "lap");
  // Pose still on lap 0 (interp lag): the relay must carry the OWNER's lap,
  // not fr.car.lap — otherwise guest B finishLap()'s a stale number.
  assert.equal(carA.lap, 0, "fixture: host pose has not caught the crossing");
  // Matched by driverId, with a bogus code: the relay names the seat, not the word.
  sA.deliver("lap", { lap: 2, time: 88.1, best: 1, driverId: carA.driverId, code: "ZZZ" });
  assert.equal(laps(sA).length, 0, "never echoed to the sender");
  assert.equal(laps(sB).length, 1, "the other guest hears it");
  const out = laps(sB)[0].d;
  assert.equal(out.code, carA.code);
  assert.equal(out.driverId, carA.driverId);
  assert.equal(out.lap, 2, "owner's lap, not the host's posed lap");
  assert.equal(out.time, 88.1);
  assert.equal(out.best, null, "an impossible best is not relayed");
  // A LAP the host refused (not the sender's own) is not relayed either.
  sB.deliver("lap", { lap: 2, time: 90, code: carA.code });
  assert.equal(laps(sA).length, 0);
  assert.equal(laps(sB).length, 1);
  // The receiving guest applies the relayed time to that rival's car.
  const Gg = stubG(3), guest = NetPlay.create(Gg), sh = fakeSession();
  assert.equal(guest.start({ role: "guest", session: sh,
    peers: [{ id: "peer", profile: null }, { id: "x", profile: null }] }).ok, true);
  const other = Gg.cars.find((c) => c.code === carA.code);
  assert.ok(guest.owns(other), "the other guest's car is net-owned here");
  sh.deliver("lap", out);
  assert.equal(other.lastLap, 88.1, "guest B now sees guest A's lap time");
  void G;
});

test("host: a finishing LAP relays the owner's lap so guest B does not finish early", () => {
  const { G, sA, sB, carA } = hostWithGuest();
  // Guest A flags out at lap 4; host pose is still on lap 3 (interp delay).
  carA.lap = 3;
  sA.deliver("lap", { lap: 4, time: 88.1, best: 87.5, code: carA.code, fin: G.raceT - 0.5 });
  assert.notEqual(carA.finished, true, "host also waits — pose one crossing behind");
  assert.equal(carA._nFinLap, 4);
  const out = sB.sent.filter((m) => m.t === "lap").pop();
  assert.ok(out, "relayed to the other guest");
  assert.equal(out.d.lap, 4, "owner's finishing lap, not the posed 3");
  assert.equal(out.d.fin, G.raceT - 0.5);

  // Guest B with pose still on lap 3 must WAIT (finLap 4), not finish early.
  const Gg = stubG(3), guest = NetPlay.create(Gg), sh = fakeSession();
  assert.equal(guest.start({ role: "guest", session: sh,
    peers: [{ id: "peer", profile: null }, { id: "x", profile: null }] }).ok, true);
  const other = Gg.cars.find((c) => c.code === carA.code);
  other.lap = 3;
  sh.deliver("lap", out.d);
  assert.notEqual(other.finished, true, "pose still one crossing behind — not finished yet");
  assert.equal(other._nFin, G.raceT - 0.5);
  assert.equal(other._nFinLap, 4);
  // The stale-pose bug would have relayed lap:3 → finishLap(3)=3 → finished now.
});
