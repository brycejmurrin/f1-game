import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const SOURCE = await readFile(new URL("../../js/net/lobby.js", import.meta.url), "utf8");

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

function harness({ wakeLock, prefetchIce, scanFactory } = {}) {
  const elements = new Map();
  const element = (id) => {
    const el = { id, hidden: true, value: "", textContent: "", focus() {} };
    elements.set(id, el);
    return el;
  };
  element("vsfriend");
  element("vs-pick");
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
  const context = vm.createContext({
    console,
    document,
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
    NetHandshake: {
      createInvite: async () => ({ ok: true, code: "invite" }),
      inviteFromUrl: () => null,
    },
    NetScan: {
      supported: () => true,
      create: () => scanFactory(),
    },
    NetRendezvous: {},
    NetPlay: { EV: { SETTINGS: "settings" } },
    Teams: { LIST: [{ id: "alpha", short: "ALP", name: "Alpha", color: [1, 0, 0], drivers: [] }] },
    Tracks: { LIST: [{ id: "track" }] },
  });
  seedLog(context);
  const NetLobby = vm.runInContext(SOURCE + ";NetLobby", context, { filename: "lobby.js" });
  const G = {
    teamIdx: 0, driverIdx: 0, trackIdx: 0, raceLaps: 3,
    raceWeather: "dry", raceTimeOfDay: "day", raceQuali: false, difficulty: "normal",
    store: { get: (_k, dflt) => dflt, set() {} },
  };
  const lobby = NetLobby.create(G);
  lobby.setTransportFactory(({ role }) => {
    transports.push(role);
    return { status: "new", onClose() {}, close() {} };
  });
  return {
    lobby, elements, scan, video, transports,
    emit(type) { for (const fn of listeners.get(type) || []) fn(); },
  };
}

test("peer leave refreshes the friend-quali gate so a dropped rival unlocks the sheet", () => {
  assert.match(SOURCE, /renderRoom\(\); if \(G\.refreshQualiGate\) G\.refreshQualiGate\(\);/);
  assert.match(SOURCE, /if \(!sessions\.size\) \{ clearInterval\(pumpTimer\); pumpTimer = null; close\(\); return; \}/);
  assert.match(SOURCE, /if \(G\.quitToMenu\) G\.quitToMenu\(\)/);
  assert.match(SOURCE, /cancel\(\);\s*\n\s*if \(G\.quitToMenu\) G\.quitToMenu\(\)/);
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
