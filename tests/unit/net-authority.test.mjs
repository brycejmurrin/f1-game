/* net-authority.test.mjs — WHO IS ALLOWED TO DECLARE WHAT, over a fake wire.
 *
 * js/net/netplay.js states its authority model in one place, as two predicates:
 *
 *     function ownsRaceControl()    { return !active || role === "host"; }
 *     function ownsClassification() { return !active || role === "host"; }
 *
 * The SEND sides have always consulted it — nameTheMoment() and reportCaution()
 * both refuse outright unless this side is the host. The RECEIVE side did not,
 * and that asymmetry is not covered by the star topology. The star protects the
 * GUESTS, who only ever hear from the host; it leaves the HOST exposed, because
 * a host holds one session per guest and bound these handlers to every one of
 * them. So a guest could set the host's netStart (lights out on the host's
 * screen, at a moment of the guest's choosing), apply a caution to the host's
 * race, or fill the field whose own declaration reads "the host's
 * classification, if sent".
 *
 * This is the EVENT-channel twin of a bug the same file already fixed on the
 * STATE channel and documented at length in onState(): "Routing on entry.id
 * alone let a guest pose any car on the grid — including another player's."
 * Same shape, same file, other channel — which is the reason these tests exist
 * as behaviour rather than as a note.
 *
 * The harness drives NetPlay with a stub G and a hand-rolled session, so the
 * whole thing runs in `node --test` in milliseconds. That matters: authority is
 * exactly the kind of property worth being able to test cheaply and often, and
 * before this file the only way to reach netplay.js at all was a browser spec.
 *
 * Run: node --test tests/unit/net-authority.test.mjs   (npm run test:net-unit)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
// netplay.js closes over NetSnapshot and NetSession as globals, so they have to
// exist by the time create() runs. Loading the real ones (rather than stubbing)
// keeps the interp buffer honest and costs nothing.
const NetSnapshot = eval(src("js/net/snapshot.js") + ";NetSnapshot");
const NetSession = eval(src("js/net/session.js") + ";NetSession");
globalThis.NetSnapshot = NetSnapshot;
globalThis.NetSession = NetSession;
const NetPlay = eval(src("js/net/netplay.js") + ";NetPlay");

/** A session NetPlay can bind to, with a hand-fed inbound event channel. */
function fakeSession() {
  const handlers = new Map();
  const sent = [];
  return {
    sent,
    clearHandlers() { handlers.clear(); return this; },
    onState() { return this; },
    onClose() { return this; },
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
    /** Deliver an inbound event AS IF the peer on this connection had sent it. */
    deliver(type, data) { for (const fn of handlers.get(type) || []) fn(data); },
  };
}

/** A G façade with just enough of a grid for start() to seat one rival. */
function stubG() {
  const car = (i, local) => ({
    idx: i, local: !!local, human: !!local, isPlayer: !!local,
    s: i * 10, x: 0, px: 0, pz: 0, speed: 0, head: 0, lap: 0, mods: null,
    name: "D" + i, code: "D" + i,
  });
  const cars = [car(0, true), car(1, false)];
  const G = {
    cars,
    player: cars[0],
    track: { total: 5000, n: 500 },
    netStart: null,
    netNow: null,
    caughtCautions: [],
    wireId: (c) => c.idx,
    setCarRole: (c, human, local) => { c.human = human; c.local = local; },
    announce: () => {},
    applyCaution: (d) => { G.caughtCautions.push(d); },
    COUNTDOWN_S: 3,
  };
  return G;
}

/** A started NetPlay in `role`, plus the session its peer speaks over. */
function started(role) {
  const G = stubG();
  const net = NetPlay.create(G);
  const s = fakeSession();
  const r = net.start({ role, session: s });
  assert.equal(r.ok, true, `start() must succeed for a ${role}: ${r.error || ""}`);
  return { G, net, s };
}

test("the harness itself works — a GUEST obeys the host's START", () => {
  // ANTI-VACUITY, and the reason it is first: every test below asserts that
  // something does NOT happen, and all of them would pass just as well against
  // a harness whose events never arrive at all. This one pins that the exact
  // same delivery DOES take effect on the side that is supposed to obey it.
  const { G, s } = started("guest");
  s.deliver("start", { at: 12345, hold: 1.0 });
  assert.ok(G.netStart, "a guest must obey a START from the host");
  assert.equal(G.netStart.at, 12345);
  assert.equal(G.netStart.hold, 1.0);
});

test("a HOST ignores a START arriving from a guest", () => {
  // The host names lights-out itself, in nameTheMoment(). A START on the wire
  // can only have come from a guest, and a guest does not get to start the
  // host's race — nor to re-start it mid-race at an instant of its choosing.
  const { G, s } = started("host");
  s.deliver("start", { at: 999, hold: 5 });
  assert.equal(G.netStart, null, "a guest must not be able to set the host's netStart");
});

test("a HOST ignores a CAUTION arriving from a guest", () => {
  // reportCaution() already refuses to SEND unless host; the caution machine is
  // the host's (docs/MULTIPLAYER.md: "the HOST owns it in multiplayer"). A
  // guest that could apply one could neutralise a race it was losing.
  const { G, s } = started("host");
  s.deliver("caution", { kind: "sc", lap: 3 });
  assert.deepEqual(G.caughtCautions, [], "a guest must not apply a caution on the host");
});

test("a GUEST obeys a CAUTION from the host", () => {
  const { G, s } = started("guest");
  s.deliver("caution", { kind: "sc", lap: 3 });
  assert.deepEqual(G.caughtCautions, [{ kind: "sc", lap: 3 }], "the host's caution is authoritative");
});

test("a HOST ignores a RESULT arriving from a guest", () => {
  // peerResult is declared "the host's classification, if sent" and is consumed
  // only on the guest path — so a host that accepted one was storing a value
  // its own name says cannot exist, and publishing it through peerResult().
  const { net, s } = started("host");
  s.deliver("result", { rows: [{ pos: 1, name: "not yours" }] });
  assert.equal(net.peerResult(), null, "the host owns classification; a guest's RESULT is not it");
});

test("a GUEST obeys a RESULT from the host", () => {
  const { net, s } = started("guest");
  const rows = { rows: [{ pos: 1, name: "host order" }] };
  s.deliver("result", rows);
  assert.deepEqual(net.peerResult(), rows);
});

test("the per-peer events a host DOES own are still accepted from a guest", () => {
  // The gate must be narrow. LAP and QUALI are a peer speaking about ITSELF,
  // which is precisely what it has authority over — a fix that swallowed those
  // would silently stop a host scoring its guests, and would look exactly like
  // this one from the outside.
  const { net, s } = started("host");
  s.deliver("lap", { car: 1, lap: 2, t: 91.2 });
  assert.equal(net.peerLaps().length, 1, "a guest still reports its own laps to the host");
});
