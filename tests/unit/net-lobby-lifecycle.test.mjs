import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const SOURCE = await readFile(new URL("../../js/net/lobby.js", import.meta.url), "utf8");
// The REAL NetPlay: the lobby registers its QUALI/QLIVE receivers and senders
// through NetPlay.bindQuali / qualiReporters (one validation site for both
// phases), and a stub of those would only pin the stub.
const NETPLAY = await readFile(new URL("../../js/net/netplay.js", import.meta.url), "utf8");

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

function harness({ wakeLock, prefetchIce, scanFactory, teams, netSession, transportStatus, handshake, parts,
                   href = "https://x.test/play?renderer=glx#keep=1&vs=invite" } = {}) {
  const elements = new Map();
  const element = (id) => {
    const el = { id, hidden: true, value: "", textContent: "", focus() {} };
    elements.set(id, el);
    return el;
  };
  element("vsfriend");
  element("vs-pick");
  const room = element("vs-room");
  const status = element("vs-status");
  status.classList = { toggle() {} };
  for (const id of ["vs-close", "vs-invite-more", "vs-host", "vs-join", "vs-make-answer", "vs-accept",
                    "vs-scan-invite", "vs-scan-answer", "vs-scan-cancel", "vs-code-host", "vs-code-join"]) element(id);
  const scan = element("vs-scan");
  const video = element("vs-scan-video");
  const listeners = new Map();
  const document = {
    hidden: false,
    visibilityState: "visible",
    getElementById: (id) => elements.get(id) || null,
    querySelector: () => null,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
  };
  const transports = [];
  const replacements = [];
  const location = { href, hash: href.includes("#") ? href.slice(href.indexOf("#")) : "" };
  const history = {
    state: { route: "menu" },
    replaceState(state, _title, next) {
      replacements.push({ state, next: String(next) });
      location.href = String(next);
      location.hash = location.href.includes("#") ? location.href.slice(location.href.indexOf("#")) : "";
    },
  };
  const context = vm.createContext({
    console,
    document,
    history,
    location,
    URL,
    navigator: { wakeLock, clipboard: {} },
    performance,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    NetTransport: {
      prefetchIce: prefetchIce || (() => null),
      supported: () => true,
    },
    NetHandshake: Object.assign({
      createInvite: async () => ({ ok: true, code: "invite" }),
      inviteFromUrl: () => null,
      inviteUrl: (code) => "https://x.test/#vs=" + code,
      consumeInviteUrl: () => false,
    }, handshake || null),
    NetQr: { draw: () => false },
    Parts: parts || { BUDGET: 780, getFactorySetup: () => "factory", getCost: () => 0 },
    NetScan: {
      supported: () => true,
      create: () => scanFactory(),
    },
    NetRendezvous: {},
    NetSession: { create: netSession || (() => { throw new Error("no NetSession in this harness"); }) },
    NetPlay: null,
    Teams: { LIST: teams || [{ id: "alpha", short: "ALP", name: "Alpha", color: [1, 0, 0], drivers: [] }] },
    Tracks: { LIST: [{ id: "track" }] },
  });
  seedLog(context);
  context.NetPlay = vm.runInContext(NETPLAY + ";NetPlay", context, { filename: "netplay.js" });
  const NetLobby = vm.runInContext(SOURCE + ";NetLobby", context, { filename: "lobby.js" });
  const G = {
    teamIdx: 0, driverIdx: 0, trackIdx: 0, raceLaps: 3,
    raceWeather: "dry", raceTimeOfDay: "day", raceQuali: false, difficulty: "normal",
    store: { get: (_k, dflt) => dflt, set() {} },
  };
  const lobby = NetLobby.create(G);
  lobby.setTransportFactory(({ role }) => {
    transports.push(role);
    return { status: transportStatus || "new", onClose() {}, close() {} };
  });
  return {
    lobby, elements, scan, video, transports, replacements, location, G, room, status,
    click(id) { const el = elements.get(id); return el && el.onclick ? el.onclick() : undefined; },
    emit(type) { for (const fn of listeners.get(type) || []) fn(); },
  };
}

test("peer leave refreshes the friend-quali gate so a dropped rival unlocks the sheet", () => {
  assert.match(SOURCE, /renderRoom\(\); if \(G\.refreshQualiGate\) G\.refreshQualiGate\(\);/);
  assert.match(SOURCE, /if \(!sessions\.size\) \{ clearInterval\(pumpTimer\); pumpTimer = null; close\(\); return; \}/);
  assert.match(SOURCE, /if \(G\.quitToMenu\) G\.quitToMenu\(\)/);
  assert.match(SOURCE, /cancel\(\);\s*\n\s*if \(G\.quitToMenu\) G\.quitToMenu\(\)/);
});

test("a consumed or cancelled URL invite is removed without losing unrelated URL state", async () => {
  let consumed = 0;
  const handshake = {
    inviteFromUrl: () => "invite",
    withoutInviteUrl: () => "https://x.test/play?renderer=glx#keep=1",
    consumeInviteUrl: () => { consumed++; return true; },
    acceptInvite: async () => ({ ok: true, code: "answer", peer: null }),
  };
  const accepted = harness({ handshake, scanFactory: () => ({ stop() {}, start() {} }) });
  try {
    await accepted.lobby.join();
    assert.equal((await accepted.lobby.makeAnswer("invite")).ok, true);
    assert.equal(consumed, 1, "successful acceptance consumes the invite");
  } finally { accepted.lobby.cancel(); }

  consumed = 0;
  const cancelled = harness({ handshake, scanFactory: () => ({ stop() {}, start() {} }) });
  cancelled.lobby.wire();
  await new Promise((resolve) => setImmediate(resolve));
  cancelled.click("vs-close");
  assert.ok(consumed >= 1, "cancelling the URL-opened lobby consumes the invite");
});

test("host-leave copy is honest about the AI takeover", () => {
  assert.doesNotMatch(SOURCE, /host left[^"\n]*race is over/i);
  assert.match(SOURCE, /host left[^"\n]*rivals (?:are )?now AI/i);
});

test("a newer join operation prevents a late host continuation", async () => {
  const ice = deferred();
  const h = harness({ prefetchIce: () => ice.promise, scanFactory: () => ({ stop() {}, start() {} }) });
  const hosting = h.lobby.host();
  const joining = h.lobby.join();
  ice.resolve();

  assert.equal((await hosting).error, "cancelled");
  assert.equal((await joining).ok, true);
  assert.deepEqual(h.transports, ["guest"], "the stale host must not create or replace a transport");
  h.lobby.cancel();
});

test("cancel then reopen prevents the prior lobby generation from attaching", async () => {
  const ice = deferred();
  const h = harness({ prefetchIce: () => ice.promise, scanFactory: () => ({ stop() {}, start() {} }) });
  const staleHost = h.lobby.host();
  h.lobby.cancel();
  h.lobby.open();
  const currentJoin = h.lobby.join();
  ice.resolve();

  assert.equal((await staleHost).error, "cancelled");
  assert.equal((await currentJoin).ok, true);
  assert.deepEqual(h.transports, ["guest"], "only the reopened generation may create a transport");
  h.lobby.cancel();
});

test("scanner completion is guarded by scanner identity and generation", async () => {
  const starts = [deferred(), deferred()];
  const scanners = starts.map((start) => ({
    stops: 0,
    stop() { this.stops++; },
    start() { return start.promise; },
  }));
  let next = 0;
  const h = harness({ scanFactory: () => scanners[next++] });

  const first = h.lobby.scan("invite");
  const second = h.lobby.scan("answer");
  starts[1].resolve({ ok: true });
  assert.equal((await second).ok, true);
  assert.equal(h.scan.hidden, false);

  starts[0].resolve({ ok: false, error: "denied" });
  assert.equal((await first).error, "cancelled");
  assert.ok(scanners[0].stops >= 2, "the late scanner is stopped again after start() settles");
  assert.equal(h.scan.hidden, false, "a stale failure must not hide the current scanner");

  h.lobby.stopScan();
  assert.equal(h.scan.hidden, true);
  assert.equal(scanners[1].stops, 1);
  h.lobby.cancel();
});

test("wake-lock requests coalesce and a lock granted after close is released", async () => {
  const granted = deferred();
  let requests = 0;
  const sentinel = { releases: 0, addEventListener() {}, release() { this.releases++; } };
  const h = harness({
    wakeLock: { request: () => { requests++; return granted.promise; } },
    scanFactory: () => ({ stop() {}, start() {} }),
  });

  h.lobby.open();
  h.lobby.open();
  assert.equal(requests, 1, "repeated opens while permission is pending share one request");
  h.lobby.cancel();
  granted.resolve(sentinel);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sentinel.releases, 1, "the late sentinel must not survive the closed lobby");
});

test("an old wake sentinel's release event cannot clear the current sentinel", async () => {
  const sentinels = [];
  let requests = 0;
  const makeSentinel = () => {
    let releaseListener = null;
    const s = {
      releases: 0,
      addEventListener(type, fn) { if (type === "release") releaseListener = fn; },
      release() { this.releases++; },
      emitRelease() { if (releaseListener) releaseListener(); },
    };
    sentinels.push(s);
    return s;
  };
  const h = harness({
    wakeLock: { request: () => { requests++; return Promise.resolve(makeSentinel()); } },
    scanFactory: () => ({ stop() {}, start() {} }),
  });

  h.lobby.open();
  await new Promise((resolve) => setImmediate(resolve));
  sentinels[0].emitRelease();
  h.emit("visibilitychange");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests, 2);

  sentinels[0].emitRelease();                 // stale duplicate platform event
  h.lobby.open();                             // must observe sentinel #2 as held
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests, 2);
  h.lobby.cancel();
});

// ── round 8: every timer has an owner; the lobby writes no storage ───────────
test("the reopen, watch and clash timers are all owned and cancellable", () => {
  // The 250 ms codeReopen timer's handle used to be discarded — and the late
  // codeHost() begins its OWN generation, so invalidateOperations() could not
  // stale it: 250 ms after leaving the lobby it minted a fresh
  // RTCPeerConnection and six relay sockets. Now: stored handle, cleared on
  // sealRoom/cancel/teardown, generation captured OUTSIDE the callback.
  assert.match(SOURCE, /codeReopenTimer = setTimeout\(/);
  assert.match(SOURCE, /const gen = operationGeneration;\s*\n\s*clearTimeout\(codeReopenTimer\);/);
  assert.ok(SOURCE.split("clearTimeout(codeReopenTimer)").length >= 4,
    "sealRoom, cancel and teardown must all clear the reopen timer");
  // waitForOpen: the deadline applies even while the transport is still being
  // built — the old early return skipped the timeout check and the poll spun
  // at 4 Hz forever with no message.
  assert.match(SOURCE,
    /if \(!watched\) \{\s*\n[\s\S]{0,700}?CONNECT_TIMEOUT_MS\) \{\s*\n\s*clearInterval\(pollTimer\);\s*\n\s*say\(failureMsg\(null,/,
    "the never-materialised branch must hit the deadline");
  // grace(): the re-render timer rides the clashSince record and every
  // teardown path goes through clashDrop/clashClear.
  assert.match(SOURCE, /clashSince\.set\(id, \{ at: now, timer \}\)/);
  assert.match(SOURCE, /function clashClear\(\) \{\s*\n\s*for \(const rec of clashSince\.values\(\)\) if \(rec\.timer\) clearTimeout\(rec\.timer\);/);
  assert.ok(!/clashSince\.clear\(\);/.test(SOURCE.replace(/function clashClear[\s\S]{0,200}?\n    \}/, "")),
    "no caller bypasses clashClear()");
});

test("a seat-clash move is in-memory only — the lobby never writes the saved team", () => {
  // resolveSeatClash() used to persist the imposed move (G.store.set("team"…/
  // "driver"…)), silently rewriting the saved solo/career team for every
  // session after the friend race. The move the race needs is G.teamIdx/
  // driverIdx; the store is the player's, not the room's.
  assert.ok(!/G\.store\.set\("team"/.test(SOURCE), "no store.set(\"team\") in the lobby");
  assert.ok(!/G\.store\.set\("driver"/.test(SOURCE), "no store.set(\"driver\") in the lobby");
  assert.match(SOURCE, /IN-MEMORY only, deliberately/);
});

test("a MY TEAM (custom) car is moved off in the room, whatever the player's rank", () => {
  // makeCars() builds the custom car only for the local player who picked it,
  // so a peer's grid holds no slot (and no wireId) for it: every snapshot from
  // a custom-team player was dropped and the rival sat frozen on the grid.
  assert.match(SOURCE, /const onCustom = !!\(mineTeam && mineTeam\.custom\);/);
  assert.match(SOURCE, /const blocked = onCustom \? peerSeats\(\) : blockingSeats\(\);/,
    "a custom host must move too — blockingSeats() is empty for rank 0");
  assert.match(SOURCE, /firstFreeSeat\(onCustom \? null : mine\.team, blocked\)/,
    "never prefer the custom team itself when choosing where to move");
  assert.match(SOURCE, /MY TEAM cars only exist on your own screen/);
});

// ── round 2 (bug hunt 2026-09-02): two guests on one seat must SETTLE ───────
// blockingSeats() for a guest was every peer seat regardless of rank, so two
// guests who picked the same car both yielded, both took the next seat, both
// yielded again — HELLO ping-pong for ever (scratch/seat-clash.mjs). Now a
// guest yields only to the host and to guests the host's relay tags with a
// LOWER join rank; the host tells each guest its own rank in its HELLO.
function fakeNetSession(made) {
  return () => {
    const handlers = new Map();
    const s = {
      sent: [],
      onEvent(t, fn) { handlers.set(t, fn); return s; },
      onState() { return s; }, onClose() { return s; },
      sendEvent(t, d) { s.sent.push({ t, d }); return true; },
      deliver(t, d) { const fn = handlers.get(t); if (fn) fn(d); },
      pump() {}, close() {}, clearHandlers() {},
    };
    made.push(s);
    return s;
  };
}
const TWO_TEAMS = [
  { id: "alpha", short: "ALP", name: "Alpha", color: [1, 0, 0], drivers: [{ name: "A1" }, { name: "A2" }] },
  { id: "beta", short: "BET", name: "Beta", color: [0, 0, 1], drivers: [{ name: "B1" }, { name: "B2" }] },
];
async function connectedGuest() {
  const made = [];
  const h = harness({ scanFactory: () => ({ stop() {}, start() {} }), teams: TWO_TEAMS,
    netSession: fakeNetSession(made), transportStatus: "open" });
  await h.lobby.join();
  h.lobby.watchForOpen();                     // the 250 ms poll sees "open" and binds the session
  for (let i = 0; i < 40 && !made.length; i++) await new Promise((r) => setTimeout(r, 50));
  assert.equal(made.length, 1, "the guest's session was bound");
  return { h, s: made[0], hellos: () => made[0].sent.filter((m) => m.t === "hello") };
}

// try/finally: a failed assertion must still cancel(), or the lobby's 25 ms
// pump interval keeps the process alive and a red run reads as a hang.
test("a guest keeps its seat against a LATER guest relayed onto it", async () => {
  const { h, s, hellos } = await connectedGuest();
  try {
    s.deliver("hello", { team: "beta", driver: 0, rank: 1 });   // the host, seated elsewhere: we are guest #1
    const before = hellos().length;
    s.deliver("hello", { from: "g2", rank: 2, team: "alpha", driver: 0 });   // guest #2 picked OUR car
    assert.equal(h.G.driverIdx, 0, "rank 1 does not yield to rank 2");
    assert.equal(h.G.teamIdx, 0);
    assert.equal(hellos().length, before, "no re-announce, so no ping-pong");
  } finally { h.lobby.cancel(); }
});

test("a guest drops another guest the host says has LEFT the lobby", async () => {
  // Bug hunt 2026-09-22: only the host saw a guest's connection close, and it
  // told nobody — the others kept the leaver in their roster, so their quali
  // gate waited forever and the start seated a car no packet would move.
  const { h, s } = await connectedGuest();
  try {
    s.deliver("hello", { team: "beta", driver: 0, rank: 1 });
    s.deliver("hello", { from: "g2", rank: 2, team: "beta", driver: 1 });
    assert.ok(h.lobby.roomState().peers.some((p) => p.from === "g2"), "the relayed guest is in the roster");
    s.deliver("left", { from: "g2" });
    assert.equal(h.lobby.roomState().peers.some((p) => p.from === "g2"), false, "…and gone once the host says so");
  } finally { h.lobby.cancel(); }
});

test("a guest yields its seat to the host and to an EARLIER guest", async () => {
  const { h, s, hellos } = await connectedGuest();
  try {
    s.deliver("hello", { team: "beta", driver: 0, rank: 2 });   // we are guest #2
    s.deliver("hello", { from: "g1", rank: 1, team: "alpha", driver: 0 });   // guest #1 holds our car
    assert.equal(h.G.driverIdx, 1, "moved to the team's other seat");
    assert.equal(hellos().at(-1).d.driver, 1, "…and said so");
    // The host always wins the seat, whatever we were told.
    h.G.driverIdx = 0;
    s.deliver("hello", { team: "alpha", driver: 0 });
    assert.equal(h.G.driverIdx, 1, "the host outranks every guest");
  } finally { h.lobby.cancel(); }
});

test("the host tags relayed HELLOs and its own with the join rank", () => {
  assert.match(SOURCE, /Object\.assign\(\{\}, p, \{ from: id, rank: joinRank\(id\) \}\)/);
  assert.match(SOURCE, /Object\.assign\(\{\}, prof, \{ from: k, rank: joinRank\(k\) \}\)/);
  assert.match(SOURCE, /role === "host" \? \{ rank: joinRank\(id\) \} : null/);
});

// ── a peer's parts must fit the budget the garage enforces ──────────────────
// Ids-not-multipliers stops {cornering: 9}; it did not stop every top-tier id
// at once, which is a legal set of ids no garage would let a player afford.
test("modsFromProfile falls back to the factory setup when the declared parts exceed the budget", () => {
  const h = harness({
    scanFactory: () => ({ stop() {}, start() {} }),
    parts: { BUDGET: 780, getFactorySetup: (team) => "factory:" + team.id,
             getCost: (setup) => (setup === "rich" ? 781 : 700) },
  });
  h.G.modsFor = (team, parts) => ({ team: team.id, parts });
  assert.deepEqual(h.lobby.modsFromProfile({ team: "alpha", parts: "rich" }), { team: "alpha", parts: "factory:alpha" });
  assert.deepEqual(h.lobby.modsFromProfile({ team: "alpha", parts: "fair" }), { team: "alpha", parts: "fair" });
  assert.deepEqual(h.lobby.modsFromProfile({ team: "alpha" }), { team: "alpha", parts: "factory:alpha" });
  assert.equal(h.lobby.modsFromProfile({ team: "nope", parts: "fair" }), null);
  h.lobby.cancel();
});

// ── the camera never outlives the step that opened it ───────────────────────
// X on a sub-step while in a room kept the room (right) but never called
// stopScan() (wrong); INVITE ANOTHER had the same hole.
async function connectedHost(extra = {}) {
  const made = [];
  const scanners = [];
  const h = harness(Object.assign({
    scanFactory: () => { const s = { stops: 0, stop() { this.stops++; }, start: async () => ({ ok: true }) }; scanners.push(s); return s; },
    teams: TWO_TEAMS, netSession: fakeNetSession(made), transportStatus: "open",
  }, extra));
  h.lobby.wire();
  await h.lobby.host();
  h.lobby.watchForOpen();
  for (let i = 0; i < 40 && !made.length; i++) await new Promise((r) => setTimeout(r, 50));
  assert.equal(made.length, 1, "the host's session was bound");
  return { h, scanners };
}

test("X on a sub-step while in a room stops the scanner as well as keeping the room", async () => {
  const { h, scanners } = await connectedHost();
  try {
    await h.lobby.inviteAnother();                 // leaves the room step for the pick step
    assert.equal((await h.lobby.scan("answer")).ok, true);
    assert.equal(h.scan.hidden, false);
    h.room.hidden = true;                           // on a sub-step
    h.click("vs-close");
    assert.equal(scanners[0].stops, 1, "the camera is stopped");
    assert.equal(h.scan.hidden, true);
    assert.equal(h.room.hidden, false, "…and the room is still there");
    assert.equal(h.lobby.status().connected, true);
  } finally { h.lobby.cancel(); }
});

test("INVITE ANOTHER stops a scanner left running from the previous sub-step", async () => {
  const { h, scanners } = await connectedHost();
  try {
    assert.equal((await h.lobby.scan("answer")).ok, true);
    await h.lobby.inviteAnother();
    assert.equal(scanners[0].stops, 1);
    assert.equal(h.scan.hidden, true);
  } finally { h.lobby.cancel(); }
});

// ── one answer per invite ───────────────────────────────────────────────────
// The paste event and MAKE ANSWER both route to makeAnswer(); a paste then a
// click ran acceptInvite twice on one RTCPeerConnection and the second
// setRemoteDescription threw out of an async click handler with nothing on
// screen.
test("makeAnswer refuses a second run for the same invite and reports a thrown handshake", async () => {
  let accepts = 0;
  const gate = deferred();
  const h = harness({
    scanFactory: () => ({ stop() {}, start() {} }),
    handshake: { acceptInvite: async () => { accepts++; await gate.promise; return { ok: true, code: "answer", peer: null }; } },
  });
  try {
    await h.lobby.join();
    const first = h.lobby.makeAnswer("APEX1.s.X");
    const second = await h.lobby.makeAnswer("APEX1.s.X");
    assert.equal(second.error, "already_answered", "the re-entry is refused while the first is in flight");
    assert.match(h.status.textContent, /already answered/i);
    gate.resolve();
    assert.equal((await first).ok, true);
    assert.equal(accepts, 1, "acceptInvite ran once");
  } finally { h.lobby.cancel(); }

  const boom = harness({
    scanFactory: () => ({ stop() {}, start() {} }),
    handshake: { acceptInvite: async () => { throw new Error("setRemoteDescription: bad SDP"); } },
  });
  try {
    await boom.lobby.join();
    const res = await boom.lobby.makeAnswer("APEX1.s.X");
    assert.equal(res.error, "answer_failed", "a throw is a typed failure, not an unhandled rejection");
    assert.match(boom.status.textContent, /bad SDP/);
    assert.equal((await boom.lobby.makeAnswer("APEX1.s.X")).error, "answer_failed", "…and the guard is released for a retry");
  } finally { boom.lobby.cancel(); }
});

test("a pc that already took an offer is not answered again", async () => {
  const h = harness({ scanFactory: () => ({ stop() {}, start() {} }),
    handshake: { acceptInvite: async () => ({ ok: true, code: "answer", peer: null }) } });
  h.lobby.setTransportFactory(() => ({ status: "new", onClose() {}, close() {},
    pc: { signalingState: "stable", remoteDescription: { type: "offer" } } }));
  try {
    await h.lobby.join();
    assert.equal((await h.lobby.makeAnswer("APEX1.s.X")).error, "already_answered");
  } finally { h.lobby.cancel(); }
});

/* ── READY survives a later guest (source guard) ──────────────────────────────
 *
 * Found by survey 2026-09-18. openRoom() is onConnected()'s last line, so it
 * runs on EVERY connection, and it began `selfReady = false; _ready.clear()`.
 * In a 3-4 player room that threw away the READY of everyone already in when
 * the next guest arrived. Nothing asks a peer to re-announce, and peersReady()
 * needs every id in peerIds() truthy, so START could never enable again unless
 * each earlier guest happened to toggle READY a second time. Two players never
 * saw it — there is nobody "already in the room" there — which is why it shipped.
 *
 * A SOURCE GUARD, AND THAT IS A LIMITATION, not a preference. Everything else in
 * this file drives ONE guest joining; proving this behaviourally needs a host
 * harness holding two sequential guest connections plus an observable for the
 * ready set, and status() exposes neither. Building that is a bigger change than
 * the fix, so this pins the invariant rather than the behaviour, and says so.
 */
test("openRoom resets READY only for a FRESH room, not on every connection", () => {
  const open = SOURCE.slice(SOURCE.indexOf("function openRoom()"));
  const body = open.slice(0, open.indexOf("\n    }"));
  assert.match(body, /if \(sessions\.size <= 1\) \{ selfReady = false; _ready\.clear\(\); \}/,
    "openRoom must clear the ready set only when it is opening a fresh room — an unconditional clear discards " +
    "the READY of every guest already in a 3-4 player room each time another one connects");
  assert.doesNotMatch(body, /^\s*_ready\.clear\(\);\s*$/m,
    "no unconditional _ready.clear() may remain in openRoom");
});

test("READY is host-relayed with from, and guests key _ready by from||id", () => {
  // BUGS.md B3: without a host relay, guests never learn each other's READY
  // (their only peer connection is the host). Mirror the HELLO pattern.
  assert.match(SOURCE, /sess\.sendEvent\(NetPlay\.EV\.READY,\s*tagged\)/,
    "host must relay READY to every other guest");
  assert.match(SOURCE, /ready:\s*!!\(d && d\.ready\),\s*from:\s*id/,
    "relayed READY carries from like HELLO");
  assert.match(SOURCE, /const who = role === "host" \? id : \(\(d && d\.from != null\) \? d\.from : id\);/,
    "guests key _ready by from when present, else the connection id");
});

// ── the sim seed and race round travel with the host's settings ─────────────
// Every reproducible draw — reliability DNFs, the weather arc, the AI
// restart/skill rolls, the AI qualifying times that set the grid — hashes on
// (seed, round). Until 2026-09-22 neither was published, so a tab that had run
// a Daily Challenge or a few solo races saw different cars retire on different
// laps, and a different grid, from its rival's; only the human rival's car was
// actually kept in sync. The lobby's own comment admitted "peers do not share a
// sim seed" and fixed one consumer (the weather arc) by shipping the plan.
test("the host publishes seed and round with its settings", () => {
  assert.match(SOURCE, /seed: G\.seed, round: G\.raceRound,/);
});

test("a guest applies the host's seed and round, and keeps its own on a payload without them", async () => {
  const { h, s } = await connectedGuest();
  try {
    h.G.seed = 1; h.G.raceRound = 0;
    s.deliver("settings", { laps: 5, seed: 4242, round: 3 });
    assert.equal(h.G.seed, 4242, "seed applied");
    assert.equal(h.G.raceRound, 3, "round applied");
    assert.equal(h.G.raceLaps, 5, "the rest of the payload still applies");
    s.deliver("settings", { laps: 7 });
    assert.equal(h.G.seed, 4242, "a payload without the fields leaves the guest's values alone");
    assert.equal(h.G.raceRound, 3);
    assert.equal(h.G.raceLaps, 7);
  } finally { h.lobby.cancel(); }
});

test("an invalid seed or round rejects the whole payload, as every other field does", async () => {
  const { h, s } = await connectedGuest();
  try {
    h.G.seed = 9; h.G.raceRound = 2; h.G.raceLaps = 3;
    for (const bad of [{ seed: 0 }, { seed: 1.5 }, { seed: "7" }, { seed: 2 ** 32 }, { round: -1 }, { round: 0.5 }, { round: null }]) {
      s.deliver("settings", Object.assign({ laps: 9 }, bad));
      assert.equal(h.G.seed, 9, `${JSON.stringify(bad)} must not change the seed`);
      assert.equal(h.G.raceRound, 2, `${JSON.stringify(bad)} must not change the round`);
      assert.equal(h.G.raceLaps, 3, `${JSON.stringify(bad)} must reject the payload whole`);
    }
  } finally { h.lobby.cancel(); }
});

// ── a typo is refused as a typo, even before the transport exists ─────────────
// join() awaits the ICE prefetch (up to ICE_WAIT_MS) before it creates the
// transport, and the player can paste in that window. makeAnswer checked
// `!transport` FIRST, so junk pasted early was answered with "That attempt has
// ended" — the multiplayer-lobby spec's junk-code test raced the TURN fetch on
// every slow network. The code's shape is now checked before the connection.
test("makeAnswer and acceptAnswer refuse a malformed code before they need a transport", async () => {
  const peekCode = (c) => (String(c).startsWith("APEX1.") ? { ok: true }
    : { ok: false, error: "bad_code", message: "That does not look like an Apex invite code." });
  const h = harness({ scanFactory: () => ({ stop() {}, start() {} }), handshake: { peekCode } });
  try {
    const a = await h.lobby.makeAnswer("not-a-real-code");
    assert.equal(a.error, "bad_code", "no transport yet, but the shape is wrong: say so");
    assert.match(a.message, /apex invite code/i);
    const b = await h.lobby.acceptAnswer("not-a-real-code");
    assert.equal(b.error, "bad_code");
    const c = await h.lobby.makeAnswer("APEX1.p.e30");
    assert.equal(c.error, "no_transport", "a well-shaped code with no connection is the transport's problem");
  } finally { h.lobby.cancel(); }
});
