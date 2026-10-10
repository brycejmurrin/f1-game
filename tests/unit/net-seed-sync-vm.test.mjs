/* Friend race: host and guest must build the SAME AI field and grid.
 * makeCars draws a lane and a skill roll per car and gridUp a jitter per car
 * from the sim stream. The guest's applySettings rewinds that stream to the
 * host's seed; the host used to keep wherever its earlier races left it
 * (lobby.beginRace now rewinds it with the same `G.seed = G.seed`). Two real
 * game VMs, no network; the host's race is started by the REAL js/net/lobby.js
 * (startFromRoom -> beginRace -> finishStart), so deleting the rewind there
 * turns the first test red. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { seedLog } from "../helpers/seed-log.mjs";
const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const src = (p) => readFileSync(new URL("../../js/" + p, import.meta.url), "utf8");
const grid = (G) => G.cars.slice().sort((a, b) => a.gridPos - b.gridPos).map((c) => c.code).join(",");
const skills = (G) => G.cars.map((c) => c.skill).join(",");

// The real lobby on top of a real game's G: seed/startRace go straight to the
// game VM (counting every seed write), everything else is the lobby's own state.
async function hostLobby(game) {
  const el = (id) => ({ id, hidden: true, value: "", textContent: "", focus() {}, classList: { toggle() {} },
    setAttribute() {}, removeAttribute() {}, appendChild() {}, addEventListener() {}, removeEventListener() {} });
  const elements = new Map();
  for (const id of ["vsfriend", "vs-pick", "vs-room", "vs-status", "vs-close", "vs-invite-more", "vs-host", "vs-join",
    "vs-make-answer", "vs-accept", "vs-scan-invite", "vs-scan-answer", "vs-scan-cancel", "vs-code-host", "vs-code-join",
    "vs-code-in", "vs-code-head", "vs-code-hint", "vs-code-value", "vs-scan", "vs-scan-video"]) elements.set(id, el(id));
  const document = {
    hidden: false, visibilityState: "visible", querySelector: () => null, addEventListener() {},
    getElementById: (id) => elements.get(id) || null,
    querySelectorAll: () => [], createElement: (t) => Object.assign(el(t), { dataset: {} }),
  };
  const context = vm.createContext({
    console, window: { addEventListener() {} }, document, URL, performance, setTimeout, clearTimeout, setInterval, clearInterval,
    history: { state: { route: "menu" }, replaceState() {} }, location: { href: "https://x.test/", hash: "" },
    navigator: { clipboard: {} },
    NetTransport: { prefetchIce: () => null, supported: () => true },
    NetHandshake: { inviteFromUrl: () => null, inviteUrl: (c) => c, consumeInviteUrl: () => false, createInvite: async () => ({ ok: true, code: "i" }) },
    NetQr: { draw: () => false }, NetScan: { supported: () => true, create: () => ({ stop() {}, start() {} }) },
    NetRendezvous: { usingPrivateRelay: () => false },
    Parts: { BUDGET: 780, getFactorySetup: () => "factory", getCost: () => 0 },
    Teams: { LIST: [{ id: "alpha", short: "ALP", name: "Alpha", color: [1, 0, 0], drivers: [{ name: "A1" }] },
                    { id: "beta", short: "BET", name: "Beta", color: [0, 0, 1], drivers: [{ name: "B1" }] }],
             isReal: (t) => !!t && !t.custom && !t.legends },
    Tracks: { LIST: [{ id: "track" }] },
    NetPlay: null,
  });
  seedLog(context);
  vm.runInContext(src("net/lobby-codes.js").replace(/^const\b/gm, "var"), context, { filename: "lobby-codes.js" });
  context.NetPlay = vm.runInContext(src("net/netplay.js") + ";NetPlay", context, { filename: "netplay.js" });
  const writes = [];
  const sessions = [];
  const built = { promise: null };
  context.NetSession = { create: () => {
    const h = new Map();
    const s = { onEvent(t, fn) { h.set(t, fn); return s; }, onState() { return s; }, onClose() { return s; },
      sendEvent() { return true; }, deliver(t, d) { const fn = h.get(t); if (fn) fn(d); }, pump() {}, close() {}, clearHandlers() {} };
    sessions.push(s); return s;
  } };
  const NetLobby = vm.runInContext(src("net/lobby.js") + ";NetLobby", context, { filename: "lobby.js" });
  const own = { teamIdx: 0, driverIdx: 0, trackIdx: 0, raceLaps: 3, raceWeather: "dry", raceTimeOfDay: "day",
    raceQuali: false, difficulty: "normal", store: { get: (_k, d) => d, set() {} },
    netPlay: { start: () => ({ ok: true }), hostStart() {} } };
  const G = new Proxy(own, {
    get: (t, k) => k === "seed" ? game.G.seed : k === "startRace" ? () => (built.promise = game.G.startRace()) : t[k],
    set: (t, k, v) => { if (k === "seed") { writes.push(v); game.G.seed = v; } else t[k] = v; return true; },
  });
  const lobby = NetLobby.create(G);
  lobby.setTransportFactory(() => ({ status: "open", onClose() {}, close() {} }));
  lobby.wire();
  await lobby.host();
  lobby.watchForOpen();
  for (let i = 0; i < 60 && !sessions.length; i++) await new Promise((r) => setTimeout(r, 50));
  assert.equal(sessions.length, 1, "the guest's session was bound");
  sessions[0].deliver("hello", { team: "beta", driver: 0 });
  sessions[0].deliver("ready", { ready: true });
  lobby.setReady(true);
  return { lobby, writes, G, built };
}

test("a host that has raced before builds the guest's field once both rewind to the host's seed", async () => {
  const host = await createGame({}), guest = await createGame({});
  let h = null;
  try {
    await host.G.startRace();
    host.apex.headless(true); host.apex.go(); host.step(120);
    host.G.quitToMenu();
    h = await hostLobby(host);
    const seedBefore = host.G.seed;
    assert.equal(h.lobby.startFromRoom(), true, "the host's room started");
    // finishStart awaits G.startRace; let the real race build before reading the field
    for (let i = 0; i < 400 && !h.built.promise; i++) await new Promise((r) => setTimeout(r, 25));
    assert.ok(h.built.promise, "the lobby started the race through G.startRace");
    await h.built.promise;
    assert.deepEqual(h.writes, [seedBefore], "beginRace re-set G.seed to its own value exactly once, before the build");
    // The guest: applySettings sets the host's seed (rewinds), then beginRace re-sets it.
    guest.G.seed = host.G.seed;
    guest.G.seed = guest.G.seed;
    await guest.G.startRace();
    assert.equal(skills(guest.G), skills(host.G), "same AI skills");
    assert.equal(grid(guest.G), grid(host.G), "same grid order");
  } finally { if (h) h.lobby.cancel(); host.close(); guest.close(); }
});

test("without the host rewind the second race diverges (the premise of the fix)", async () => {
  const host = await createGame({}), guest = await createGame({});
  try {
    await host.G.startRace();
    host.apex.headless(true); host.apex.go(); host.step(120);
    host.G.quitToMenu();
    await host.G.startRace();                 // no rewind: the old host path
    guest.G.seed = host.G.seed;
    await guest.G.startRace();
    assert.notEqual(skills(guest.G), skills(host.G));
  } finally { host.close(); guest.close(); }
});
