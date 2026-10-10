import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { seedClipboard } from "../helpers/seed-clipboard.mjs";

const SOURCE = await readFile(new URL("../../js/net/lobby.js", import.meta.url), "utf8");
const LOBBY_CODES = await readFile(new URL("../../js/net/lobby-codes.js", import.meta.url), "utf8");
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
                   rendezvous, href = "https://x.test/play?renderer=glx#keep=1&vs=invite" } = {}) {
  const elements = new Map();
  const element = (id) => {
    const el = { id, hidden: true, value: "", textContent: "", focus() {}, setAttribute(k, v) { this[k] = v; }, removeAttribute(k) { delete this[k]; } };
    elements.set(id, el);
    return el;
  };
  element("vsfriend");
  element("vs-pick");
  const room = element("vs-room");
  const status = element("vs-status");
  status.classList = { toggle() {} };
  for (const id of ["vs-close", "vs-invite-more", "vs-host", "vs-join", "vs-make-answer", "vs-accept",
                    "vs-scan-invite", "vs-scan-answer", "vs-scan-cancel", "vs-code-host", "vs-code-join", "vs-code-in", "vs-code-head", "vs-code-hint", "vs-code-value"]) element(id);
  const scan = element("vs-scan");
  const video = element("vs-scan-video");
  const listeners = new Map();
  const document = {
    hidden: false,
    visibilityState: "visible",
    getElementById: (id) => elements.get(id) || null,
    querySelector: () => null,
    // Same shape as data-hub-picker's VM doc — blockingTitleSheet uses one
    // static #id,#id selector (no dynamic $(id) reads).
    querySelectorAll(sel) {
      const out = [];
      String(sel).split(",").forEach((part) => {
        const id = part.replace(/^#/, "").trim();
        if (id && elements.has(id)) out.push(elements.get(id));
      });
      return out;
    },
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
  const winListeners = new Map();
  const window = {
    addEventListener(type, fn) {
      if (!winListeners.has(type)) winListeners.set(type, []);
      winListeners.get(type).push(fn);
    },
  };
  const context = vm.createContext({
    console,
    window,
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
    NetRendezvous: rendezvous || { usingPrivateRelay: () => false },
    NetSession: { create: netSession || (() => { throw new Error("no NetSession in this harness"); }) },
    NetPlay: null,
    // isReal mirrors js/data/teams.js (pinned by the Legends test below).
    Teams: { LIST: teams || [{ id: "alpha", short: "ALP", name: "Alpha", color: [1, 0, 0], drivers: [] }],
             isReal: (t) => !!t && !t.custom && !t.legends },
    Tracks: { LIST: [{ id: "track" }] },
  });
  seedLog(context);
  seedClipboard(context);
  vm.runInContext(LOBBY_CODES.replace(/^const\b/gm, "var"), context, { filename: "lobby-codes.js" });
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
    lobby, elements, scan, video, transports, replacements, location, G, room, status, context,
    click(id) { const el = elements.get(id); return el && el.onclick ? el.onclick() : undefined; },
    emit(type) { for (const fn of listeners.get(type) || []) fn(); },
    emitWindow(type) { for (const fn of winListeners.get(type) || []) fn(); },
    winListeners,
  };
}

test("peer leave refreshes the friend-quali gate so a dropped rival unlocks the sheet", () => {
  assert.match(SOURCE, /renderRoom\(\); if \(G\.refreshQualiGate\) G\.refreshQualiGate\(\);/);
  assert.match(SOURCE, /if \(!sessions\.size\) \{ friendQualifying = false; clearInterval\(pumpTimer\); pumpTimer = null; close\(\); return; \}/);
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

test("an invite link opened in a RUNNING tab opens the lobby on hashchange, once", async () => {
  // #vs= was read only at boot (wire()), and a link opened into a live tab
  // changes only the fragment — no reload — so it did nothing at all.
  let hash = null;
  let consumed = 0;
  const handshake = {
    inviteFromUrl: () => hash,
    consumeInviteUrl: () => { if (!hash) return false; consumed++; hash = null; return true; },
  };
  const h = harness({ handshake, scanFactory: () => ({ stop() {}, start() {} }), href: "https://x.test/play" });
  try {
    h.lobby.wire();
    h.lobby.wire();                                   // a second wire must not stack listeners
    assert.equal((h.winListeners.get("hashchange") || []).length, 1, "one hashchange listener");
    assert.equal(h.elements.get("vsfriend").hidden, true, "no fragment at boot: nothing opens");

    hash = "abc";
    h.emitWindow("hashchange");
    await new Promise((r) => setImmediate(r));
    assert.equal(h.elements.get("vsfriend").hidden, false, "the lobby opened from the link");
    assert.deepEqual(h.transports, ["guest"], "…on the JOIN path, as at boot");

    h.emitWindow("hashchange");                       // same code, lobby already up
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(h.transports, ["guest"], "idempotent: the same invite is not re-run");

    h.click("vs-close");
    assert.equal(consumed, 1, "closing removes the fragment, as the boot path does");
    assert.equal(h.elements.get("vsfriend").hidden, true);
  } finally { h.lobby.cancel(); }
});

test("a link tapped while the host has an offer out is deferred, and close() keeps an unhandled invite", async () => {
  // Android link capture routes the host's own tapped link into the running
  // app, or the host pastes their copied link to check it: openFromUrl used to
  // join() through it and newTransport dropped the pending offer, so the
  // friend's answer failed as "too late". And close() consumed WHATEVER
  // fragment was there — a link deferred while the lobby was busy included.
  let hash = null;
  let consumed = 0;
  const handshake = {
    inviteFromUrl: () => hash,
    consumeInviteUrl: () => { if (!hash) return false; consumed++; hash = null; return true; },
  };
  const h = harness({ handshake, scanFactory: () => ({ stop() {}, start() {} }), href: "https://x.test/play" });
  try {
    h.lobby.wire();
    assert.equal((await h.lobby.host()).ok, true);
    assert.deepEqual(h.transports, ["host"], "an offer is out");
    hash = "friend";
    h.emitWindow("hashchange");
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(h.transports, ["host"], "the pending offer is not torn down by a link");
    h.click("vs-close");
    assert.equal(consumed, 0, "a link this lobby never handled survives close()");
    assert.equal(hash, "friend");
    // Opened from that link now — handled, so THIS close consumes it.
    h.emitWindow("hashchange");
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(h.transports, ["host", "guest"], "the deferred link opens the JOIN path once the host is done");
    h.click("vs-close");
    assert.equal(consumed, 1);
  } finally { h.lobby.cancel(); }
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

// ensureNet().then(open) races How to Play the same way DataHub.open does:
// both are dialog.screen, last showModal wins. Refuse while a title sheet is up.
test("open() is a no-op while How to Play is visible", () => {
  const h = harness({ scanFactory: () => ({ stop() {}, start() {} }) });
  const howto = { id: "howtoplay", hidden: false };
  h.elements.set("howtoplay", howto);
  assert.equal(h.lobby.open(), false, "must refuse under How to Play");
  assert.equal(h.elements.get("vsfriend").hidden, true, "lobby stays closed");
  howto.hidden = true;
  assert.equal(h.lobby.open(), true, "title-only: lobby opens as before");
  assert.equal(h.elements.get("vsfriend").hidden, false);
  h.lobby.cancel();
});

test("MAKE ANSWER during a join still fetching relay credentials waits for the transport", async () => {
  // rtc-e2e / rtc-e2e-3p 2026-09-27: __apex.lobbyJoin fires join() and
  // makeAnswer() back to back, and a guest who opened an invite link taps MAKE
  // ANSWER on a pre-filled code just as fast. join() builds its transport only
  // after readyIce() (up to ICE_WAIT_MS); makeAnswer read `transport` at once
  // and answered {error:"no_transport"} — "That attempt has ended" on the
  // first tap, with nothing wrong. It waits for the join in flight instead.
  const ice = deferred();
  const h = harness({
    prefetchIce: () => ice.promise,
    scanFactory: () => ({ stop() {}, start() {} }),
    handshake: { acceptInvite: async () => ({ ok: true, code: "answer", peer: null }) },
  });
  try {
    h.lobby.open();
    const joining = h.lobby.join();
    const answering = h.lobby.makeAnswer("invite");
    let settled = false;
    answering.then(() => { settled = true; });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(settled, false, "the answer must wait for the join, not fail at once");
    assert.deepEqual(h.transports, [], "no transport yet: the relay fetch is still pending");
    ice.resolve();
    assert.equal((await joining).ok, true);
    const res = await answering;
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.code, "answer");
    assert.deepEqual(h.transports, ["guest"], "one guest transport, built by the join");
    // Junk is still refused by SHAPE before anything waits on a connection.
    const junk = harness({ prefetchIce: () => new Promise(() => {}), scanFactory: () => ({ stop() {}, start() {} }),
      handshake: { peekCode: () => ({ ok: false, error: "corrupt", message: "junk" }) } });
    try {
      junk.lobby.join();
      assert.equal((await junk.lobby.makeAnswer("not-a-code")).error, "corrupt");
    } finally { junk.lobby.cancel(); }
  } finally { h.lobby.cancel(); }
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
  assert.ok(SOURCE.split("clearTimeout(codeReopenTimer)").length >= 5,
    "sealRoom, cancel, teardown and the connect-fail path must all clear the reopen timer");
  // teardown() and the ICE/timeout fail path must null codeReopen itself —
  // clearing only the timer left the string set, so the next unrelated
  // onConnected quietly reopened a dead room code (W4-AUDIT / live tip).
  const teardownAt = SOURCE.indexOf("function teardown()");
  assert.ok(teardownAt > 0, "teardown() present");
  const teardownBody = SOURCE.slice(teardownAt, SOURCE.indexOf("function failureMsg", teardownAt));
  assert.match(teardownBody, /codeReopen = null/,
    "teardown() must clear codeReopen, not only codeReopenTimer");
  // The fail path settles it through reopenRoom(), which nulls it first
  // (and re-arms the reopen only for a room still holding guests).
  assert.match(SOURCE,
    /connect fail[\s\S]{0,900}?reopenRoom\([^)]*\);\s*\n\s*dropPending\(\)/,
    "a failed ICE/timeout must settle codeReopen before dropPending/teardown");
  assert.match(SOURCE, /function reopenRoom\(ok\) \{\s*\n\s*const again = codeReopen;\s*\n\s*codeReopen = null;/,
    "reopenRoom() consumes codeReopen whether or not it reopens");
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
  assert.match(SOURCE, /const onCustom = !!mineTeam && !Teams\.isReal\(mineTeam\);/);
  assert.match(SOURCE, /const blocked = onCustom \? peerSeats\(\) : blockingSeats\(\);/,
    "a custom host must move too — blockingSeats() is empty for rank 0");
  assert.match(SOURCE, /firstFreeSeat\(onCustom \? null : mine\.team, blocked\)/,
    "never prefer the custom team itself when choosing where to move");
  assert.match(SOURCE, /\(mineTeam\.legends \? "LEGENDS" : "MY TEAM"\) \+ " cars only exist on your own screen/);
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
async function connectedGuest({ teams = TWO_TEAMS, teamIdx = 0 } = {}) {
  const made = [];
  const h = harness({ scanFactory: () => ({ stop() {}, start() {} }), teams,
    netSession: fakeNetSession(made), transportStatus: "open" });
  h.G.teamIdx = teamIdx;
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

test("a LEGENDS car is moved off in the room like MY TEAM (legends: true, no custom)", async () => {
  // The Legends entry exists only on the grid of the player who picked it, the
  // same as MY TEAM — but it carries `legends: true` and no `custom`, so the
  // old `mineTeam.custom` test let a Legends player keep a seat no peer holds.
  const teamsSrc = await readFile(new URL("../../js/data/teams.js", import.meta.url), "utf8");
  assert.match(teamsSrc, /const isReal = \(t\) => !!t && !t\.custom && !t\.legends;/,
    "the harness's isReal stub mirrors js/data/teams.js");
  const LEGENDS = { id: "legends", legends: true, short: "LEG", name: "Legends", color: [1, 1, 1],
    drivers: [{ name: "L1" }, { name: "L2" }] };
  const { h, s, hellos } = await connectedGuest({ teams: [...TWO_TEAMS, LEGENDS], teamIdx: 2 });
  try {
    s.deliver("hello", { team: "beta", driver: 0, rank: 1 });     // the host, on another car
    assert.notEqual(h.G.teamIdx, 2, "moved off the Legends car");
    assert.equal(h.G.teamIdx, 0, "…onto the first free REAL seat");
    assert.equal(hellos().at(-1).d.team, "alpha", "…and announced it");
    assert.match(h.status.textContent, /^LEGENDS cars only exist on your own screen/);
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
  return { h, scanners, made };
}

test("a host relays only validated guest qualifying laps to the other guest", async () => {
  const { h, made } = await connectedHost();
  try {
    await h.lobby.inviteAnother();
    await h.lobby.host();
    h.lobby.watchForOpen();
    for (let i = 0; i < 40 && made.length < 2; i++) await new Promise((r) => setTimeout(r, 50));
    assert.equal(made.length, 2);
    made[0].deliver("hello", { team: "beta", driver: 0 });
    made[1].deliver("hello", { team: "beta", driver: 1 });
    const before = made[1].sent.length;
    made[0].deliver("quali", { driverId: "alpha:0", t: 70 });
    made[0].deliver("quali", { driverId: "beta:0", t: "71.5" });
    made[0].deliver("qlive", { driverId: "beta:0", t: 8, frac: 0.3 });
    const relay = made[1].sent.slice(before).filter((m) => m.t === "quali" || m.t === "qlive");
    assert.equal(relay.length, 2, "the spoof is dropped and both valid event types reach the other guest");
    assert.deepEqual(relay.map((m) => [m.t, m.d.driverId, m.d.t]),
      [["quali", "beta:0", 71.5], ["qlive", "beta:0", 8]]);
    assert.equal(made[0].sent.filter((m) => m.t === "quali").length, 0, "never echo to the owner");
  } finally { h.lobby.cancel(); }
});

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

test("acceptAnswer refuses a re-entry inside the decode window and releases the guard after", async () => {
  let accepts = 0;
  let gate = deferred();
  const h = harness({
    scanFactory: () => ({ stop() {}, start() {} }), teams: TWO_TEAMS,
    handshake: { acceptAnswer: async () => { accepts++; await gate.promise; return { ok: true, peer: null }; } },
  });
  try {
    await h.lobby.host();
    const first = h.lobby.acceptAnswer("APEX1.p.X");
    // Paste + ACCEPT: the second call used to begin a new generation, cancelling the first (the
    // only caller that reaches waitForOpen) and failing on a pc already past have-local-offer.
    const second = await h.lobby.acceptAnswer("APEX1.p.X");
    assert.equal(second.error, "already_accepting");
    gate.resolve();
    assert.equal((await first).ok, true, "the first read was not cancelled by the re-entry");
    assert.equal(accepts, 1, "the handshake ran once");
    gate = deferred(); gate.resolve();
    assert.equal((await h.lobby.acceptAnswer("APEX1.p.X")).ok, true, "the guard is released once the read settles");
  } finally { h.lobby.cancel(); }
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

test("host catch-ups READY to a late joiner (same as HELLO catch-up)", async () => {
  // Live repro 2026-10-05 on github.io (apex-sha 5cc9497d): host + guest1
  // READY, invite guest2 — guest2's #vs-them showed both as "choosing".
  // HELLO was caught up; READY was only relayed on toggle.
  const { h, made } = await connectedHost();
  try {
    made[0].deliver("hello", { team: "beta", driver: 0 });
    made[0].deliver("ready", { ready: true });
    h.lobby.setReady(true);
    assert.equal((await h.lobby.inviteAnother()).ok, true);
    await h.lobby.host();
    h.lobby.watchForOpen();
    for (let i = 0; i < 40 && made.length < 2; i++) await new Promise((r) => setTimeout(r, 50));
    assert.equal(made.length, 2, "second guest session bound");
    // onConnected catch-up (before the late joiner's own HELLO)
    const fromConnect = made[1].sent.filter((m) => m.t === "ready");
    assert.ok(fromConnect.some((m) => m.d && m.d.ready && m.d.from == null),
      "must catch-up host selfReady on connect: " + JSON.stringify(fromConnect));
    assert.ok(fromConnect.some((m) => m.d && m.d.ready && m.d.from != null),
      "must catch-up guest1 READY on connect: " + JSON.stringify(fromConnect));
    // HELLO path catch-up is idempotent when the late joiner announces
    const before = made[1].sent.length;
    made[1].deliver("hello", { team: "beta", driver: 1 });
    assert.ok(made[1].sent.slice(before).some((m) => m.t === "hello" && m.d && m.d.from),
      "HELLO catch-up control");
    assert.ok(made[1].sent.slice(before).some((m) => m.t === "ready" && m.d && m.d.ready),
      "HELLO path also catch-ups READY");
  } finally { h.lobby.cancel(); }
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

// ── dirty air and AI pace are race rules; a guest's own rules come back ───────
// Both change every AI car's grip / vmax, and each peer simulated its own saved
// choice. And applySettings overwrote the guest's laps/difficulty/tyres/… in
// memory with nothing to put them back after the room or the race.
test("the host publishes dirty air and AI pace with its settings", () => {
  assert.match(SOURCE, /dirtyAir: G\.raceDirtyAir, aiPace: G\.aiPace,/);
});

function ruleGuestStubs(h) {
  const stored = new Map([["dirtyAir", "classic"]]);
  const sets = [];
  h.G.store = {
    get: (k, d) => (stored.has(k) ? stored.get(k) : d),
    set: (k, v) => { sets.push([k, v]); stored.set(k, v); },
    rawDel: (k) => stored.delete(k),
  };
  h.context.PhysicsConsts = { DirtyAir: { isLevel: (v) => ["off", "classic", "cfd"].includes(v) } };
  h.context.AiBand = { isMode: (v) => v === "scripted" || v === "catchup" };
  let dirty = "classic", pace = "scripted";
  Object.defineProperty(h.G, "raceDirtyAir", { get: () => dirty, set: (v) => { dirty = v; h.G.store.set("dirtyAir", v); }, configurable: true });
  Object.defineProperty(h.G, "aiPace", { get: () => pace, set: (v) => { pace = v; h.G.store.set("aiPace", v); }, configurable: true });
  return stored;
}

test("a guest applies dirty air and AI pace in memory, and rejects bad values", async () => {
  const { h, s } = await connectedGuest();
  try {
    const stored = ruleGuestStubs(h);
    s.deliver("settings", { laps: 5, dirtyAir: "cfd", aiPace: "catchup" });
    assert.equal(h.G.raceDirtyAir, "cfd");
    assert.equal(h.G.aiPace, "catchup");
    assert.equal(stored.get("dirtyAir"), "classic", "the guest's saved choice is put back");
    assert.equal(stored.has("aiPace"), false, "unset stays unset");
    for (const bad of [{ dirtyAir: "max" }, { dirtyAir: 1 }, { aiPace: "rubber" }, { aiPace: true }]) {
      s.deliver("settings", Object.assign({ laps: 9 }, bad));
      assert.equal(h.G.raceLaps, 5, `${JSON.stringify(bad)} must reject the payload whole`);
    }
    assert.equal(h.G.raceDirtyAir, "cfd");
    assert.equal(h.G.aiPace, "catchup");
  } finally { h.lobby.cancel(); }
});

test("leaving the room gives the guest back its own rules", async () => {
  const { h, s } = await connectedGuest();
  ruleGuestStubs(h);
  h.G.raceLaps = 3; h.G.difficulty = "normal"; h.G.seed = 77; h.G.raceRound = 1;
  try {
    s.deliver("settings", { laps: 12, difficulty: "hard", seed: 4242, round: 9, dirtyAir: "off", aiPace: "catchup" });
    s.deliver("settings", { laps: 15 });   // a second payload must not re-snapshot the host's values
    assert.equal(h.G.raceLaps, 15);
  } finally { h.lobby.cancel(); }
  assert.equal(h.G.raceLaps, 3);
  assert.equal(h.G.difficulty, "normal");
  assert.equal(h.G.seed, 77);
  assert.equal(h.G.raceRound, 1);
  assert.equal(h.G.raceDirtyAir, "classic");
  assert.equal(h.G.aiPace, "scripted");
  assert.equal(h.G.store.get("aiPace", undefined), undefined, "restoring did not persist the guest's in-memory value");
});

test("the race end (a LOCAL NetPlay stop) restores the guest's rules, a mid-race drop does not", () => {
  assert.match(SOURCE, /onStop: restoreOwnRules,/);
  assert.match(NETPLAY, /if \(!active\) \{ lastReason = null; runOnStop\(reason\); return false; \}/);
  assert.match(NETPLAY, /if \(reason != null && reason !== "local"\) return;/);
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

// ── 2026-09-27 audit: the room flag, the room's close message, a pending close, a throwing invite ──
function closableHarness(extra = {}) {
  const made = [], closers = [], flags = [];
  const h = harness(Object.assign({
    scanFactory: () => ({ stop() {}, start() {} }), teams: TWO_TEAMS,
    netSession: fakeNetSession(made), transportStatus: "open",
  }, extra));
  h.lobby.setTransportFactory(() => {
    const t = { status: "open", onClose(fn) { closers.push(fn); }, close() { t.status = "closed"; } };
    return t;
  });
  h.G.setNetRoom = (v) => flags.push(!!v);
  return { h, made, closers, flags };
}

test("CLOSE from the waiting room clears the race-settings room flag", async () => {
  // openRoom() set netRoom; only a race start cleared it. CLOSE left it set, so
  // the next solo RACE → START re-showed the hidden lobby ("CONFIRM FOR LOBBY").
  const { h, made, flags } = closableHarness();
  try {
    await h.lobby.join();
    h.lobby.watchForOpen();
    for (let i = 0; i < 40 && !made.length; i++) await new Promise((r) => setTimeout(r, 50));
    assert.equal(made.length, 1);
    assert.equal(flags[flags.length - 1], true, "the room set the flag");
  } finally { h.lobby.cancel(); }
  assert.equal(flags[flags.length - 1], false, "cancel() cleared it");
});

test("the host leaving the ROOM says so, drops the room flag and shows the pick — not 'rivals are now AI'", async () => {
  const { h, made, closers, flags } = closableHarness();
  try {
    await h.lobby.join();
    h.lobby.watchForOpen();
    for (let i = 0; i < 40 && !made.length; i++) await new Promise((r) => setTimeout(r, 50));
    assert.equal(closers.length, 1, "the connected transport registered its close handler");
    closers[0]("transport");
    assert.match(h.status.textContent, /left the room/i);
    assert.doesNotMatch(h.status.textContent, /rivals are now AI/i, "there is no race to keep racing");
    assert.equal(flags[flags.length - 1], false, "the room is over: the flag is dropped");
    assert.equal(h.elements.get("vs-pick").hidden, false, "back to HOST / JOIN");
  } finally { h.lobby.cancel(); }
});

test("the host leaving the ROOM forgets every guest it relayed, not just the host", async () => {
  // onClose deleted only this transport's id; the relayed "g2" profile lived
  // on until open()/cancel(), so the next room's roster and seat clashes saw a
  // guest from a room that no longer exists.
  const { h, made, closers } = closableHarness();
  try {
    await h.lobby.join();
    h.lobby.watchForOpen();
    for (let i = 0; i < 40 && !made.length; i++) await new Promise((r) => setTimeout(r, 50));
    made[0].deliver("hello", { team: "beta", driver: 0, rank: 1 });
    made[0].deliver("hello", { from: "g2", rank: 2, team: "beta", driver: 1 });
    assert.ok(h.lobby.roomState().peers.some((p) => p.from === "g2"), "the relayed guest is in the roster");
    closers[0]("transport");
    assert.equal(h.lobby.roomState().peers.length, 0, "the room is over: no profile survives it");
  } finally { h.lobby.cancel(); }
});

test("host leave during 3p friend quali forgets relayed rivals (QualiNet unlock)", async () => {
  // The waiting-room leave path cleared relayed "g2" profiles; the
  // friendQualifying branch only said "Keep racing" and left them in place.
  // QualiNet.waiting() falls back to roomState().peers while NetPlay is not
  // yet active, so TO THE GRID waited forever for a lap no host can relay.
  // 2p never saw it: there is no relayed roster there.
  const { h, made, closers } = closableHarness();
  h.G.raceQuali = true;
  h.G.openQualiForNet = (done) => { h.G._qualiDone = done; };
  try {
    await h.lobby.join();
    h.lobby.watchForOpen();
    for (let i = 0; i < 40 && !made.length; i++) await new Promise((r) => setTimeout(r, 50));
    assert.equal(made.length, 1);
    made[0].deliver("hello", { team: "beta", driver: 0, rank: 1 });
    made[0].deliver("hello", { from: "g2", rank: 2, team: "beta", driver: 1 });
    assert.ok(h.lobby.roomState().peers.some((p) => p.from === "g2"), "the relayed guest is in the roster");
    made[0].deliver("go", {});
    assert.equal(h.lobby.qualifying(), true, "friend quali is armed");
    assert.equal(closers.length, 1);
    closers[0]("transport");
    assert.equal(h.lobby.qualifying(), true, "still in the quali phase");
    assert.match(h.status.textContent, /rivals are now AI/i);
    assert.equal(h.lobby.roomState().peers.length, 0,
      "relayed guest must die with the host — otherwise QualiNet.waiting() stays locked");
  } finally { h.lobby.cancel(); }
});

test("mid-race one guest leaving of two keeps the other — occupancy is transports, not lobby sessions", async () => {
  // finishStart() hands sessions to NetPlay and clears the lobby sessions map,
  // but leaves transports populated. onClose used to gate "anyone left?" on
  // !sessions.size — always true after the handoff — so one guest dropping in
  // a 3p race took the empty-room path: "Connection closed." / "Your friend
  // left the room.", _peers cleared, and the multi-peer "A player left…"
  // branch (plus lobby LEFT relay) was unreachable. NetPlay still kept the
  // race; the lobby lied. 2p hides it (the only guest leaving DOES empty the
  // room). Live smoke covered 2p disconnect + 3p lobby READY, not 3p mid-race.
  const made = [], closers = [];
  const h = harness({
    scanFactory: () => ({ stop() {}, start() {} }), teams: TWO_TEAMS,
    netSession: fakeNetSession(made), transportStatus: "open",
  });
  h.lobby.setTransportFactory(() => {
    const t = { status: "open", onClose(fn) { closers.push(fn); }, close() { t.status = "closed"; } };
    return t;
  });
  h.G.startRace = async () => ({ ok: true });
  h.G.netPlay = { start: () => ({ ok: true }), hostStart() {} };
  try {
    h.lobby.wire();
    await h.lobby.host();
    h.lobby.watchForOpen();
    for (let i = 0; i < 40 && !made.length; i++) await new Promise((r) => setTimeout(r, 50));
    assert.equal(made.length, 1, "guest 1 bound");
    made[0].deliver("hello", { team: "beta", driver: 0 });
    made[0].deliver("ready", { ready: true });
    assert.equal((await h.lobby.inviteAnother()).ok, true);
    await h.lobby.host();
    h.lobby.watchForOpen();
    for (let i = 0; i < 40 && made.length < 2; i++) await new Promise((r) => setTimeout(r, 50));
    assert.equal(made.length, 2, "guest 2 bound");
    assert.equal(closers.length, 2, "two close handlers");
    made[1].deliver("hello", { team: "beta", driver: 1 });
    made[1].deliver("ready", { ready: true });
    h.lobby.setReady(true);
    assert.equal(h.lobby.startFromRoom(), true, "host starts the race");
    // finishStart is async (awaits startRace); wait for the handoff.
    for (let i = 0; i < 40 && /Starting race/.test(h.status.textContent); i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    // After finishStart, lobby sessions are empty but both transports remain.
    assert.equal(h.lobby.status().guests, 2, "transports still hold both guests");
    closers[0]("peer_closed");                       // guest 1 drops mid-race
    assert.match(h.status.textContent, /player left/i,
      "remaining guest is still in — not the empty-room copy");
    assert.doesNotMatch(h.status.textContent, /left the room|Connection closed/i);
    assert.equal(h.lobby.status().guests, 1, "one transport remains");
    assert.equal(h.lobby.roomState().peers.length, 1,
      "the surviving guest's profile must stay — finishStart keeps _peers on purpose");
  } finally { h.lobby.cancel(); }
});

test("a transport that never connected closes silently: the watcher's diagnosis is not overwritten", async () => {
  // waitForOpen() said WHICH failure it was, then dropPending() closed the
  // transport, whose close event ran the peer-leave handler synchronously and
  // replaced that line with "Connection closed." before a frame showed it.
  const { h, closers } = closableHarness();
  try {
    await h.lobby.join();                          // a pending guest transport, never connected
    assert.equal(closers.length, 1);
    h.status.textContent = "Could not connect after 60s. The invite probably went stale.";
    closers[0]("local");
    assert.match(h.status.textContent, /went stale/, "the diagnosis stands");
  } finally { h.lobby.cancel(); }
});

test("createInvite throwing becomes a typed result, not an unhandled rejection", async () => {
  const h = harness({
    scanFactory: () => ({ stop() {}, start() {} }),
    handshake: { createInvite: async () => { throw new Error("InvalidStateError: closed"); } },
  });
  try {
    const res = await h.lobby.host();
    assert.equal(res.ok, false);
    assert.equal(res.error, "invite_failed");
    assert.match(h.status.textContent, /Could not create an invite/);
  } finally { h.lobby.cancel(); }
});

test("join()'s late prompt does not wipe an error said during its ICE wait", async () => {
  // multiplayer-lobby.spec "an empty box asks for the code": JOIN, then MAKE
  // ANSWER on an empty box said "Paste their invite code first." (error) —
  // and join(), finishing its relay-credentials wait ~0.5 s later, replaced it
  // with "Paste the invite code they sent you." (no error).
  const ice = deferred();
  const h = harness({ prefetchIce: () => ice.promise, scanFactory: () => ({ stop() {}, start() {} }) });
  try {
    const joining = h.lobby.join();
    const empty = await h.lobby.makeAnswer("");
    assert.equal(empty.error, "empty");
    assert.match(h.status.textContent, /Paste their invite code first/);
    ice.resolve();
    assert.equal((await joining).ok, true);
    assert.match(h.status.textContent, /Paste their invite code first/, "the error stands; the prompt stayed quiet");
    // With nothing said meanwhile the prompt still lands.
    h.lobby.cancel();
    const ice2 = deferred();
    const q = harness({ prefetchIce: () => ice2.promise, scanFactory: () => ({ stop() {}, start() {} }) });
    try {
      const j2 = q.lobby.join();
      ice2.resolve();
      assert.equal((await j2).ok, true);
      assert.match(q.status.textContent, /Paste the invite code they sent you/);
    } finally { q.lobby.cancel(); }
  } finally { h.lobby.cancel(); }
});

// ── L8-a: the verification code on both screens, and the host's REMOVE ──────
// The room code's PBKDF2 table is precomputable once for every room, so a
// middleman can answer a sealed offer. The 4-letter code from both DTLS
// fingerprints is what the two players compare; the host removes a guest whose
// screen shows a different one.
test("a connection shows its verification code, and only the HOST can remove that guest", async () => {
  const pcs = [];
  const rendezvous = { usingPrivateRelay: () => false, verifyFor: async (pc) => (pc && pc.remoteDescription ? "K7QZ" : null) };
  const made = [], closers = [];
  const h = harness({ scanFactory: () => ({ stop() {}, start() {} }), teams: TWO_TEAMS,
    netSession: fakeNetSession(made), transportStatus: "open", rendezvous });
  let closed = 0;
  h.lobby.setTransportFactory(() => {
    const pc = { localDescription: { sdp: "l" }, remoteDescription: { sdp: "r" } };
    pcs.push(pc);
    const mine = [];
    const t = { status: "open", pc, onClose(fn) { mine.push(fn); closers.push(fn); },
      close() {   // idempotent and self-emitting, as transport.js shutdown()
        if (t.status === "closed") return;
        closed++; t.status = "closed"; for (const fn of mine) fn("local");
      } };
    return t;
  });
  try {
    h.lobby.wire();
    await h.lobby.host();
    h.lobby.watchForOpen();
    for (let i = 0; i < 40 && !made.length; i++) await new Promise((r) => setTimeout(r, 50));
    assert.equal(made.length, 1, "the host's session was bound");
    for (let i = 0; i < 20 && !Object.keys(h.lobby.verifyCodes()).length; i++) await new Promise((r) => setTimeout(r, 10));
    const codes = h.lobby.verifyCodes();
    assert.deepEqual(Object.values(codes), ["K7QZ"], "one code per direct connection");
    assert.match(h.status.textContent, /K7QZ/, "and the status line names it");
    const [id] = Object.keys(codes);
    assert.equal(h.lobby.removeGuest("nobody"), false, "an unknown id is a no-op");
    assert.equal(h.lobby.removeGuest(id), true, "the host removes the guest whose code differs");
    assert.equal(closed, 1, "by closing that guest's transport");
    assert.equal(Object.keys(h.lobby.verifyCodes()).length, 0, "and its code goes with it");
  } finally { h.lobby.cancel(); }
});

test("a guest cannot remove anybody, and a transport with no pc shows no code", async () => {
  const { h } = await connectedGuest();
  try {
    assert.equal(Object.keys(h.lobby.verifyCodes()).length, 0, "the loopback-style fake has no descriptions: no code");
    assert.equal(h.lobby.removeGuest("peer"), false, "REMOVE is the host's");
  } finally { h.lobby.cancel(); }
});

test("HOST A RACE (link) closes a room code left open by a code join", () => {
  // INVITE ANOTHER -> HOST A RACE after a guest joined by code: the reopened
  // room kept advertising a dead offer for up to JOIN_TIMEOUT_MS, and a friend
  // told the code waited on Connecting… for a NAT error. host() must stop it,
  // exactly as codeHost() does before its own generation.
  const at = SOURCE.indexOf("async function host()");
  assert.ok(at > 0, "host() present");
  const body = SOURCE.slice(at, SOURCE.indexOf("await readyIce()", at));
  assert.match(body, /stopCodeWait\(\)/);
  assert.match(body, /codeReopen = null/);
  assert.match(body, /clearTimeout\(codeReopenTimer\)/);
});

test("private room entry accepts a full shared token and public entry still asks for six characters", () => {
  for (const privateRelay of [true, false]) {
    const h = harness({ rendezvous: { usingPrivateRelay: () => privateRelay } });
    h.lobby.wire();
    try {
      h.click("vs-code-join");
      const input = h.elements.get("vs-code-in");
      assert.equal(input.maxLength, privateRelay ? 64 : 8);
      assert.equal(input["aria-label"], privateRelay ? "Private room token" : "Room code");
      assert.match(h.elements.get("vs-code-hint").textContent, privateRelay ? /32 characters/ : /Six letters/);
      assert.match(input.placeholder, privateRelay ? /32-character token/ : /ABC234/);
    } finally { h.lobby.cancel(); }
  }
});

// ── code room: a failed joiner and the last guest leaving (2026-10-05) ──────
// A host with a code room and a controllable transport per offer: each
// transport's status and close handler are the test's to drive.
function codeRoomHarness() {
  const made = [], rooms = [], ts = [], flags = [];
  const h = harness({
    scanFactory: () => ({ stop() {}, start() {} }), teams: TWO_TEAMS,
    netSession: fakeNetSession(made),
    handshake: { acceptAnswer: async () => ({ ok: true, peer: null }) },
    rendezvous: {
      usingPrivateRelay: () => false, makeCode: () => "ABC234",
      hostRoom: async (o) => {
        const room = { code: o.code, onJoiner: o.onJoiner, stopped: 0, stop() { room.stopped++; }, rotate() {} };
        rooms.push(room);
        return { ok: true, stop: () => room.stop(), rotate: () => {} };
      },
    },
  });
  h.lobby.setTransportFactory(() => {
    const t = { status: "new", closers: [], onClose(fn) { t.closers.push(fn); }, close() { t.status = "closed"; } };
    ts.push(t);
    return t;
  });
  h.G.setNetRoom = (v) => flags.push(!!v);
  const until = async (fn, what) => {
    for (let i = 0; i < 60 && !fn(); i++) await new Promise((r) => setTimeout(r, 50));
    assert.ok(fn(), what);
  };
  // codeHost, then guest 1 answers, connects, and the room is reopened quietly.
  async function withGuest() {
    assert.equal((await h.lobby.codeHost()).ok, true);
    assert.equal(rooms.length, 1);
    await rooms[0].onJoiner("g", "answer-1");
    assert.equal(rooms[0].stopped, 1, "the room closes while guest 1 negotiates");
    ts[0].status = "open";
    await until(() => made.length === 1, "guest 1's session was bound");
    await until(() => rooms.length === 2, "onConnected reopened the code for the next guest");
    assert.equal(rooms[1].code, "ABC234");
  }
  return { h, made, rooms, ts, flags, until, withGuest };
}

test("a joiner whose ICE fails while a guest is in the room reopens the SAME code", async () => {
  // onJoiner closes the code while the joiner's ICE runs; only onConnected
  // reopened it. When that ICE failed with a guest already in, the fail path
  // dropped codeReopen and returned to the room — nothing ever reopened the
  // code, so guest 2's retries went unanswered and the host had to mint a new one.
  const { h, rooms, ts, until, withGuest } = codeRoomHarness();
  try {
    await withGuest();
    await rooms[1].onJoiner("g2", "answer-2");
    assert.equal(rooms[1].stopped, 1, "the room closes while guest 2 negotiates");
    ts[ts.length - 1].status = "closed";            // guest 2's ICE fails (NAT)
    await until(() => rooms.length === 3, "the failed attempt reopened the room");
    assert.equal(rooms[2].code, "ABC234", "…under the same code, so guest 2 can retry");
    assert.equal(rooms[2].stopped, 0);
    assert.equal(h.lobby.status().guests, 1, "guest 1 is still in");
    assert.equal(h.elements.get("vs-room").hidden, false, "the host stays in the waiting room");
  } finally { h.lobby.cancel(); }
});

test("a failed joiner with NOBODY in the room does not reopen it later", async () => {
  // The other half of the same branch: teardown() owns the empty room, and a
  // stale codeReopen must not reopen it on some later, unrelated connect.
  const { h, rooms, ts } = codeRoomHarness();
  try {
    assert.equal((await h.lobby.codeHost()).ok, true);
    await rooms[0].onJoiner("g", "answer-1");
    ts[0].status = "closed";
    await new Promise((r) => setTimeout(r, 900));
    assert.equal(rooms.length, 1, "no reopen for an empty room");
    assert.equal(h.elements.get("vs-pick").hidden, false, "back to the pick");
  } finally { h.lobby.cancel(); }
});

test("the last guest leaving the ROOM seals the reopened code and restores every route", async () => {
  // The !racing branch sent the host to the pick with its peers cleared, but
  // the code onConnected reopened (and its pending transport) stayed live:
  // anyone entering the old code was answered and pulled the host back into a
  // room. And INVITE ANOTHER's hidden JOIN routes stayed hidden.
  const { h, rooms, ts, flags, withGuest } = codeRoomHarness();
  try {
    await withGuest();
    const pending = ts[ts.length - 1];
    assert.notEqual(pending, ts[0], "the reopened room minted its own pending transport");
    assert.equal((await h.lobby.inviteAnother()).ok, true);
    assert.equal(h.elements.get("vs-join").hidden, true, "INVITE ANOTHER hid JOIN");
    assert.equal(h.elements.get("vs-code-join").hidden, true);
    ts[0].closers[0]("remote");                       // guest 1 leaves
    assert.match(h.status.textContent, /left the room/i);
    assert.equal(rooms[1].stopped, 1, "the reopened code stopped advertising");
    assert.equal(pending.status, "closed", "…and its half-built transport was dropped");
    assert.equal(h.lobby.status().pending, false);
    assert.equal(flags[flags.length - 1], false, "the room flag is dropped");
    assert.equal(h.elements.get("vs-pick").hidden, false, "back to HOST / JOIN");
    assert.equal(h.elements.get("vs-join").hidden, false, "JOIN A FRIEND is offered again");
    assert.equal(h.elements.get("vs-code-join").hidden, false, "ENTER A CODE is offered again");
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(rooms.length, 2, "nothing reopens the room afterwards");
  } finally { h.lobby.cancel(); }
});

// Room-code / phone-pad acceptInvite used to pass gatherTimeoutMs: 2500 as a
// workaround for courier peer loss during a long gather. readyIce already races
// the credentials prefetch at ICE_WAIT_MS=2500; the short gather cap is leftover
// and must stay gone (handshake waitForIce honors null-candidate / re-check).
test("codeJoin and phone-pad acceptInvite do not pass gatherTimeoutMs: 2500", async () => {
  assert.match(SOURCE, /const ICE_WAIT_MS = 2500/, "readyIce prefetch race stays at 2500 ms");
  assert.ok(!/gatherTimeoutMs:\s*2500/.test(SOURCE),
    "lobby room-code acceptInvite must not force gatherTimeoutMs: 2500");
  const phone = await readFile(new URL("../../js/input/phone-pad.js", import.meta.url), "utf8");
  assert.ok(!/gatherTimeoutMs:\s*2500/.test(phone),
    "phone-pad acceptInvite must not force gatherTimeoutMs: 2500");
});

// Live build 14296 / tip after #1237: guest ICE opened and onConnected said
// "Connected.", but codeJoin's onTick (and a racing expired swap) still painted
// "Looking for that room…" / "Nobody answered…" over it during the answer
// re-post window. Once connected, status must never regress and no expiry
// error may be emitted.
test("once guest connected, status never regresses and no expiry error", async () => {
  const made = [];
  let transport = null;
  const h = harness({
    scanFactory: () => ({ stop() {}, start() {} }),
    teams: TWO_TEAMS,
    netSession: fakeNetSession(made),
    handshake: {
      acceptInvite: async () => ({ ok: true, code: "answer", peer: null }),
    },
    rendezvous: {
      usingPrivateRelay: () => false,
      normalise: (c) => String(c || "").toUpperCase().replace(/[^0-9A-Z]/g, ""),
      valid: (c) => /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/.test(String(c || "").toUpperCase()),
      swap: async (o) => {
        const out = await o.reply("host-invite");
        assert.ok(out, "guest posted an answer");
        // Open ICE while the exchange is still live (nostr ~5.2 s re-post).
        transport.status = "open";
        for (let i = 0; i < 40 && !h.lobby.status().connected; i++) {
          await new Promise((r) => setTimeout(r, 50));
        }
        assert.equal(h.lobby.status().connected, true,
          "guest reached Connected before swap settles");
        // openRoom advances past "Connected." to the waiting-room line — that
        // is forward progress. onTick/expiry must not go backwards to looking
        // or "Nobody answered…".
        const afterConnected = h.status.textContent;
        assert.doesNotMatch(afterConnected, /Looking for that room|Nobody answered/i);
        if (typeof o.onTick === "function") o.onTick();
        assert.equal(h.status.textContent, afterConnected,
          "onTick must not overwrite Connected/room status with Looking for that room");
        assert.doesNotMatch(h.status.textContent, /Looking for that room|Nobody answered/i);
        // Expiry racing clearExpire while the transport is adopted.
        return {
          ok: false,
          error: "expired",
          message: "Nobody answered that code. Check the six characters, or ask "
            + "your friend for a fresh one — if it keeps happening, both "
            + "reload the game and try a new code.",
        };
      },
    },
  });
  h.lobby.setTransportFactory(() => {
    transport = {
      status: "new",
      onClose() {},
      close() { transport.status = "closed"; },
      stats: () => ({ ice: "connected", connection: "connected" }),
    };
    return transport;
  });
  try {
    const result = await h.lobby.codeJoin("ABC234");
    assert.equal(result.ok, true, "expired + adopted transport still counts as joined");
    assert.equal(h.lobby.status().connected, true);
    assert.doesNotMatch(h.status.textContent,
      /Looking for that room|Nobody answered|Could not join/i,
      "no looking/joining/expiry line after Connected");
  } finally {
    h.lobby.cancel();
  }
});

// Host room-code expiry / courier fail (onFail) must close the half-built
// pending RTCPeerConnection + transport. Leaving it leaked blocked a retry
// from the same guest (stale pending offer / PC) after #1237's longer host
// timeout window.
test("host onFail during a half-built join closes that peer PC and clears pending", async () => {
  const made = [], rooms = [], ts = [];
  const h = harness({
    scanFactory: () => ({ stop() {}, start() {} }), teams: TWO_TEAMS,
    netSession: fakeNetSession(made),
    handshake: { acceptAnswer: async () => ({ ok: true, peer: null }) },
    rendezvous: {
      usingPrivateRelay: () => false, makeCode: () => "ABC234",
      hostRoom: async (o) => {
        const room = {
          code: o.code, onJoiner: o.onJoiner, onFail: o.onFail,
          stopped: 0, stop() { room.stopped++; }, rotate() {},
        };
        rooms.push(room);
        return { ok: true, stop: () => room.stop(), rotate: () => {} };
      },
    },
  });
  h.lobby.setTransportFactory(() => {
    const pc = {
      signalingState: "have-local-offer",
      connectionState: "new",
      closed: 0,
      close() { pc.closed++; pc.connectionState = "closed"; pc.signalingState = "closed"; },
    };
    const t = {
      status: "new", pc, closers: [],
      onClose(fn) { t.closers.push(fn); },
      close() {
        if (t.status === "closed") return;
        t.status = "closed";
        try { pc.close(); } catch (e) { /* already gone */ }
        for (const fn of t.closers) fn("local");
      },
    };
    ts.push(t);
    return t;
  });
  try {
    assert.equal((await h.lobby.codeHost()).ok, true);
    assert.equal(rooms.length, 1);
    assert.equal(typeof rooms[0].onFail, "function", "hostRoom received onFail");
    const pending = ts[0];
    assert.equal(pending.status, "new", "half-built transport is waiting for an answer");
    assert.equal(h.lobby.status().pending, true);
    assert.equal(pending.pc.closed, 0);

    // Courier expiry with nobody connected — the primary leak path.
    rooms[0].onFail({
      ok: false, error: "expired",
      message: "Nobody answered that code. Check the six characters, or ask "
        + "your friend for a fresh one.",
    });

    assert.equal(pending.status, "closed", "onFail must close the half-built transport");
    assert.equal(pending.pc.closed, 1, "…and its RTCPeerConnection");
    assert.equal(h.lobby.status().pending, false, "no pending entry left behind");
    assert.equal(h.lobby.status().guests, 0);

    // Same guest can retry: a fresh codeHost must mint a new transport/PC.
    assert.equal((await h.lobby.codeHost()).ok, true);
    assert.equal(ts.length, 2, "retry minted a fresh host transport");
    assert.notEqual(ts[1], pending);
    assert.equal(ts[1].status, "new");
    assert.equal(ts[1].pc.closed, 0);
    assert.equal(h.lobby.status().pending, true);
  } finally {
    h.lobby.cancel();
  }
});

// One connected, ready guest and a ready host: the state startFromRoom() needs.
async function readyHostRoom() {
  const made = [];
  const h = harness({
    scanFactory: () => ({ stop() {}, start() {} }), teams: TWO_TEAMS,
    netSession: fakeNetSession(made), transportStatus: "open",
  });
  h.lobby.setTransportFactory(() => ({ status: "open", onClose() {}, close() {} }));
  h.lobby.wire();
  await h.lobby.host();
  h.lobby.watchForOpen();
  for (let i = 0; i < 40 && !made.length; i++) await new Promise((r) => setTimeout(r, 50));
  assert.equal(made.length, 1, "guest bound");
  made[0].deliver("hello", { team: "beta", driver: 0 });
  made[0].deliver("ready", { ready: true });
  h.lobby.setReady(true);
  return h;
}
const settle = async (h) => {
  for (let i = 0; i < 40 && /Starting race/.test(h.status.textContent); i++) await new Promise((r) => setTimeout(r, 50));
};

test("a startRace that resolves false closes the room instead of starting NetPlay over the menu", async () => {
  // startRaceBody resolves false on a save conflict, a failed build, a lost
  // context or a changed state; only { kind: "canceled" } used to be a failure,
  // so netPlay.start()/hostStart() ran over the menu and stranded a netStart.
  const h = await readyHostRoom();
  const calls = [];
  h.G.startRace = async () => false;
  h.G.netPlay = { start: () => { calls.push("start"); return { ok: true }; }, hostStart() { calls.push("hostStart"); } };
  try {
    h.elements.get("vsfriend").hidden = false;   // the room dialog is on screen
    assert.equal(h.lobby.startFromRoom(), true);
    await settle(h);
    assert.deepEqual(calls, [], "NetPlay never started");
    assert.equal(h.elements.get("vsfriend").hidden, true, "the lobby closed");
  } finally { h.lobby.cancel(); }
});

test("a canceled startRace still closes the room (the branch the false case shares)", async () => {
  const h = await readyHostRoom();
  const calls = [];
  h.G.startRace = async () => ({ kind: "canceled", reason: "superseded" });
  h.G.netPlay = { start: () => { calls.push("start"); return { ok: true }; }, hostStart() { calls.push("hostStart"); } };
  try {
    h.elements.get("vsfriend").hidden = false;
    h.lobby.startFromRoom();
    await settle(h);
    assert.deepEqual(calls, []);
    assert.equal(h.elements.get("vsfriend").hidden, true);
  } finally { h.lobby.cancel(); }
});

test("the host rewinds its sim stream before the race builds, as the guest's applySettings does", async () => {
  // Re-assigning the seed resets the LCG state and nothing else (simSeed). The
  // host used to keep wherever earlier races left the stream, so its AI skills,
  // lanes and grid differed from the rewound guest's.
  const h = await readyHostRoom();
  const writes = [];
  let seed = 1234;
  Object.defineProperty(h.G, "seed", { get: () => seed, set: (v) => { writes.push(v); seed = v; }, configurable: true });
  h.G.startRace = async () => { writes.push("startRace"); return { ok: true }; };
  h.G.netPlay = { start: () => ({ ok: true }), hostStart() {} };
  try {
    h.lobby.startFromRoom();
    await settle(h);
    const rewind = writes.indexOf(1234), build = writes.indexOf("startRace");
    assert.ok(rewind >= 0 && rewind < build, "G.seed re-set to its own value before startRace: " + JSON.stringify(writes));
  } finally { h.lobby.cancel(); }
});
