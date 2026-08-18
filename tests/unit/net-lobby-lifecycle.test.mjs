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
