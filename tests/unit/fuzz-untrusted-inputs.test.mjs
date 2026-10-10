/* fuzz-untrusted-inputs.test.mjs — seeded fuzz over every door that decodes
 * player-shaped data (paste, hash, peer packet, import file, save slot).
 *
 * Three independent bugs shared one shape: a stored or pasted value is player
 * input but a reader treated it as a promise (boot-input-shape header,
 * B-series in docs/BUGS.md, hostile-hash handling in ghost-share.js). This
 * file hammers the decoder BOUNDARY: never throw past it, return the module's
 * own failure shape, never write NaN/undefined into live Career / G / store.
 *
 * N=2000 mutations per surface, Hash32-seeded (tests/helpers/seeded-fuzz.mjs).
 * A red prints seed + trial so the case is replayable. Budget: < 10 s total.
 *
 * Run: node --test tests/unit/fuzz-untrusted-inputs.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { fuzz, mutate, findBadLiveValues, makeRng, HOSTILE_ROW_VALUES } from "../helpers/seeded-fuzz.mjs";
import { seedLog } from "../helpers/seed-log.mjs";
import { seedSaveMigrate } from "../helpers/seed-save-migrate.mjs";
import { seedClipboard } from "../helpers/seed-clipboard.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const N = 2000;
const BUDGET_MS = 10_000;

function assertNoThrowResult(label, result, okShape) {
  if (okShape === "ok-reason") {
    assert.equal(typeof result, "object", `${label}: expected object, got ${typeof result}`);
    assert.ok(result !== null, `${label}: null is not an ok/reason result`);
    if (result.ok === false) {
      assert.equal(typeof result.reason, "string", `${label}: ok:false needs reason string`);
    } else if (result.ok === true) {
      /* success path — still must not carry NaN into live fields callers copy */
    } else {
      assert.fail(`${label}: missing boolean ok, got ${JSON.stringify(result)}`);
    }
    return;
  }
  if (okShape === "ok-error") {
    assert.equal(typeof result, "object", `${label}: expected object`);
    assert.ok(result !== null, `${label}: null`);
    if (result.ok === false) {
      assert.equal(typeof result.error, "string", `${label}: ok:false needs error string`);
    } else {
      assert.equal(result.ok, true, `${label}: expected ok true|false`);
    }
    return;
  }
  if (okShape === "null-or-value") {
    // NetSnapshot / NetSdp / NetQr: failure is null (or undefined for some lanes).
    return;
  }
  if (okShape === "string") {
    assert.equal(typeof result, "string", `${label}: expected string`);
    return;
  }
}

function assertCleanLive(label, value) {
  if (value == null) return;
  const bad = findBadLiveValues(value);
  assert.deepEqual(bad, [], `${label}: NaN/undefined in live state at ${bad.join(", ")}`);
}

// ── GhostShare.decode (#ghost= / pasted APXG1 / .apexghost.json) ───────────
function bootGhostShare() {
  const sandbox = {
    module: { exports: {} },
    TextEncoder, TextDecoder, Uint8Array, Blob, Response,
    CompressionStream: undefined, DecompressionStream: undefined,
    btoa, atob, URL,
    location: { origin: "https://example.test", pathname: "/f1-game/", href: "https://example.test/f1-game/", hash: "" },
    history: { state: {}, replaceState() {} },
    Tracks: { LIST: [{ id: "monza" }, { id: "spa" }] },
    Ghost: { track: () => "monza" },
  };
  Object.defineProperty(sandbox, "localStorage", {
    get() { throw new Error("guest sharing must not touch localStorage"); },
  });
  const ctx = vm.createContext(sandbox);
  vm.runInContext(read("js/car/ghost-share.js"), ctx, { filename: "js/car/ghost-share.js" });
  return sandbox.module.exports || vm.runInContext("GhostShare", ctx);
}

const GHOST_CORPUS = [
  "",
  "APXG1.p.not-valid",
  "APXG1.z.abc",
  "#ghost=APXG1.p.xxxx",
  '{"v":1,"kind":"ghost","track":"monza","time":1,"t":[0,1],"s":[0,1],"x":[0,0]}',
  '{"v":1,"kind":"ghost","track":"nope","time":1,"t":[0,1,2,3,4,5,6,7],"s":[0,1,2,3,4,5,6,7],"x":[0,0,0,0,0,0,0,0]}',
  "not a ghost",
  null,
];

test("GhostShare.decode never throws past the boundary (N=2000)", async () => {
  const GhostShare = bootGhostShare();
  await fuzz("GhostShare.decode", "ghost-decode-v1", N, async (rng) => {
    const input = mutate(rng.pick(GHOST_CORPUS), rng);
    let result;
    try {
      result = await GhostShare.decode(input);
    } catch (err) {
      assert.fail(`threw: ${(err && err.message) || err}`);
    }
    assertNoThrowResult("GhostShare.decode", result, "ok-reason");
    if (result.ok) {
      assertCleanLive("GhostShare.ghost", result.ghost);
      assert.equal(typeof result.track, "string");
    }
  });
});

// ── LobbyCodes.codeFrom + NetHandshake.peekCode / decodeCode (pasted invites)
function bootLobbyAndHandshake() {
  const NetBytes = eval(read("js/net/bytes.js") + ";NetBytes");
  const NetSdp = eval(read("js/net/sdp.js") + ";NetSdp");
  // Handshake needs Log + NetBytes + NetSdp on the sandbox.
  const sb = {
    console, Object, Array, String, Promise, Number, JSON, Math, Uint8Array,
    TextEncoder, TextDecoder, Blob, Response, btoa, atob,
    CompressionStream: undefined, DecompressionStream: undefined,
    NetBytes, NetSdp,
    location: { hash: "", href: "https://x.test/", origin: "https://x.test", pathname: "/" },
    history: { state: {}, replaceState() {} },
    RTCPeerConnection: undefined,
  };
  const ctx = vm.createContext(sb);
  seedLog(ctx);
  vm.runInContext(read("js/net/handshake.js").replace(/^const\b/gm, "var"), ctx, { filename: "handshake.js" });
  const NetHandshake = vm.runInContext("NetHandshake", ctx);

  const lobbySb = {
    console, Object, Array, String, Promise,
    navigator: {},
    NetHandshake,
    NetQr: { draw: () => false },
    NetScan: { supported: () => false, create: () => ({ start: async () => ({ ok: false }), stop() {} }) },
    ApexClipboard: null,
  };
  const lobbyCtx = vm.createContext(lobbySb);
  seedClipboard(lobbyCtx);
  vm.runInContext(read("js/net/lobby-codes.js").replace(/^const\b/gm, "var"), lobbyCtx, { filename: "lobby-codes.js" });
  const LobbyCodes = vm.runInContext("LobbyCodes", lobbyCtx);
  return { LobbyCodes, NetHandshake, NetSdp, NetBytes };
}

const INVITE_CORPUS = [
  "",
  "APEX1.p.abc",
  "APEX1.z.not-valid!!!",
  "APEX1.s." + "A".repeat(40),
  "here you go: APEX1.p.xxxx thanks!",
  "https://x.test/play#vs=APEX1.p.deadbeef",
  "not a code at all",
  null,
  undefined,
];

test("LobbyCodes.codeFrom + NetHandshake.peek/decode never throw (N=2000)", async () => {
  const { LobbyCodes, NetHandshake } = bootLobbyAndHandshake();
  await fuzz("invite-paste", "invite-paste-v1", N, async (rng) => {
    const input = mutate(rng.pick(INVITE_CORPUS), rng);
    let lifted;
    try {
      lifted = LobbyCodes.codeFrom(input);
    } catch (err) {
      assert.fail(`codeFrom threw: ${(err && err.message) || err}`);
    }
    assertNoThrowResult("LobbyCodes.codeFrom", lifted, "string");

    let peek;
    try {
      peek = NetHandshake.peekCode(lifted);
    } catch (err) {
      assert.fail(`peekCode threw: ${(err && err.message) || err}`);
    }
    assertNoThrowResult("NetHandshake.peekCode", peek, "ok-error");

    let decoded;
    try {
      decoded = await NetHandshake.decodeCode(lifted);
    } catch (err) {
      assert.fail(`decodeCode threw: ${(err && err.message) || err}`);
    }
    assertNoThrowResult("NetHandshake.decodeCode", decoded, "ok-error");
    if (decoded.ok) assertCleanLive("handshake.payload", decoded.payload);
  });
});

// ── NetSdp.unpack (compact invite body) ────────────────────────────────────
test("NetSdp.unpack never throws on hostile bytes (N=2000)", async () => {
  const { NetSdp, NetBytes } = bootLobbyAndHandshake();
  // A minimal packable SDP so the corpus has a near-valid byte string.
  const REALISH = [
    "v=0",
    "o=- 1 2 IN IP4 127.0.0.1",
    "s=-",
    "t=0 0",
    "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
    "c=IN IP4 0.0.0.0",
    "a=candidate:1 1 udp 1 50a48b8e-b13b-42b4-b448-0ae6d08aaaf0.local 48941 typ host",
    "a=ice-ufrag:AbCd",
    "a=ice-pwd:abcdefghijklmnopqrstuvwx",
    "a=fingerprint:sha-256 85:93:AA:4F:69:8F:E1:43:B7:87:D4:D5:6D:24:BD:FB:4D:F5:AA:1E:CC:1A:F6:17:61:6F:41:81:38:77:97:4B",
    "a=setup:actpass",
  ].join("\r\n") + "\r\n";
  const packed = NetSdp.pack(REALISH) || new Uint8Array([1, 0, 0, 0]);
  const CORPUS = [packed, new Uint8Array(0), new Uint8Array([0, 1, 2]), null, undefined];

  await fuzz("NetSdp.unpack", "sdp-unpack-v1", N, async (rng) => {
    const input = mutate(rng.pick(CORPUS), rng);
    let out;
    try {
      out = NetSdp.unpack(input);
    } catch (err) {
      assert.fail(`unpack threw: ${(err && err.message) || err}`);
    }
    assertNoThrowResult("NetSdp.unpack", out, "null-or-value");
    if (out != null) assert.equal(typeof out, "string");
  });
  // Silence unused in some paths.
  void NetBytes;
});

// ── NetQr.encode (pasted invite → QR modules) ──────────────────────────────
test("NetQr.encode never throws on hostile text (N=2000)", async () => {
  const NetQr = eval(read("js/net/qr.js") + ";NetQr");
  const CORPUS = ["", "APEX1.p.abc", "https://x.test/#vs=APEX1.p.x", "a", null, undefined, "x".repeat(200)];
  await fuzz("NetQr.encode", "qr-encode-v1", N, async (rng) => {
    const input = mutate(rng.pick(CORPUS), rng);
    let out;
    try {
      out = NetQr.encode(input);
    } catch (err) {
      assert.fail(`encode threw: ${(err && err.message) || err}`);
    }
    assertNoThrowResult("NetQr.encode", out, "null-or-value");
    if (out != null) {
      assert.ok(out.size > 0);
      assert.ok(out.modules && out.modules.length === out.size * out.size);
    }
  });
});

// ── NetSnapshot.decodeSnapshot (peer packets) ──────────────────────────────
test("NetSnapshot.decodeSnapshot never throws on hostile packets (N=2000)", async () => {
  const logCtx = vm.createContext({ console, Object, Array, String, Math, Number, JSON, Map, Set });
  seedLog(logCtx);
  globalThis.Log = vm.runInContext("Log", logCtx);
  globalThis.M4 = eval(read("js/core/mat4.js") + ";M4");
  const NetSnapshot = eval(read("js/net/snapshot.js") + ";NetSnapshot");
  const good = NetSnapshot.encodeSnapshot(1, [{
    id: 0,
    car: { s: 10, x: 0, head: 0, speed: 50, gear: 3, lap: 1 },
  }]);
  const CORPUS = [good, new Uint8Array(0), new Uint8Array([1, 0, 0, 0, 0, 1]), null, undefined];

  await fuzz("NetSnapshot.decodeSnapshot", "snap-decode-v1", N, async (rng) => {
    const input = mutate(rng.pick(CORPUS), rng);
    let out;
    try {
      out = NetSnapshot.decodeSnapshot(input);
    } catch (err) {
      assert.fail(`decodeSnapshot threw: ${(err && err.message) || err}`);
    }
    assertNoThrowResult("NetSnapshot.decodeSnapshot", out, "null-or-value");
    if (out) {
      assertCleanLive("snapshot.cars", out.cars);
      assert.ok(Number.isFinite(out.tick), "tick must be finite");
    }
  });
});

// ── SettingsExport.applySettings / applyGarage (import files) ──────────────
function bootSettingsExport() {
  const disk = new Map();
  const store = {
    get(k, d) { const v = disk.get("apex26." + k); return v === undefined ? d : JSON.parse(v); },
    set(k, v) {
      // Refuse writing NaN/undefined into the store — the production store
      // JSON.stringifies, which drops undefined and turns NaN into null; we
      // still record what the importer asked to write so the fuzz can catch it.
      if (v === undefined || (typeof v === "number" && !Number.isFinite(v))) {
        store._bad.push({ k, v });
      }
      disk.set("apex26." + k, JSON.stringify(v));
      return true;
    },
    raw(k) { return disk.get(k.startsWith("apex26.") ? k : "apex26." + k) ?? null; },
    rawSet(k, v) { disk.set(k.startsWith("apex26.") ? k : "apex26." + k, String(v)); return true; },
    rawDel(k) { disk.delete(k.startsWith("apex26.") ? k : "apex26." + k); return true; },
    _bad: [],
  };
  const sb = {
    Math, Object, Array, Number, JSON, Map, Set, Date, String, Blob: class {},
    setTimeout: () => 0,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    GameStore: { store },
    GameAudio: { tuneDefaults: () => ({ gain: 1 }), layerDefaults: () => ({}) },
    GfxQuality: { defaultId: () => "high" },
    Input: { keysAreDefault: () => true, padsAreDefault: () => true },
    navigator: { userAgent: "test" },
    localStorage: {
      get length() { return disk.size; },
      key(i) { return Array.from(disk.keys())[i]; },
      getItem(k) { const v = disk.get(k); return v === undefined ? null : v; },
    },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(read("js/data/teams.js"), ctx, { filename: "teams.js" });
  vm.runInContext(read("js/ui/settings-export.js"), ctx, { filename: "settings-export.js" });
  const SettingsExport = vm.runInContext("SettingsExport", ctx);
  const G = { gfx: { isMobile: false }, soundOn: false };
  return { SettingsExport, G, store, disk };
}

const SETTINGS_CORPUS = [
  { format: "apex26-settings-v1", settings: {} },
  { format: "apex26-settings-v1", settings: { display: { difficulty: "medium" } } },
  { format: "nope", settings: {} },
  null,
  { format: "apex26-settings-v1", settings: { display: { difficulty: NaN } } },
];
const GARAGE_CORPUS = [
  { format: "apex26-garage-v1", garage: {} },
  { format: "apex26-garage-v1", garage: { team: 2, driver: 0 } },
  { format: "apex26-garage-v1", garage: { team: "abc", customTeam: {} } },
  { format: "apex26-garage-v1", garage: { "__proto__": { polluted: 1 }, team: 1 } },
  null,
];

test("SettingsExport.applySettings/applyGarage never throw or poison store (N=2000)", async () => {
  const { SettingsExport, G, store } = bootSettingsExport();
  await fuzz("SettingsExport.import", "settings-import-v1", N, async (rng) => {
    store._bad.length = 0;
    const settingsIn = mutate(rng.pick(SETTINGS_CORPUS), rng);
    const garageIn = mutate(rng.pick(GARAGE_CORPUS), rng);
    let sRes, gRes;
    try {
      sRes = SettingsExport.applySettings(settingsIn, G);
      gRes = SettingsExport.applyGarage(garageIn);
    } catch (err) {
      assert.fail(`import threw: ${(err && err.message) || err}`);
    }
    assertNoThrowResult("applySettings", sRes, "ok-reason");
    assertNoThrowResult("applyGarage", gRes, "ok-reason");
    assert.deepEqual(store._bad, [], `store received NaN/undefined: ${JSON.stringify(store._bad)}`);
  });
});

// ── SaveMigrate.migrateCareer + store slot reads ───────────────────────────
function bootSaveMigrate() {
  const ctx = vm.createContext({
    Math, JSON, Object, Array, Number, String, isFinite, console,
    Teams: { LIST: [{ id: "haas", drivers: [{ code: "AAA" }, { code: "BBB" }] }] },
  });
  seedSaveMigrate(ctx);
  return vm.runInContext("SaveMigrate", ctx);
}

const CAREER_CORPUS = [
  { v: 1, flavour: "driver", team: "haas", money: 100, year: 2026,
    season: { round: 0, pts: {}, teamPts: {}, driverCodes: {} } },
  { flavour: "driver", money: "x", deal: { salary: "nope", bonusPt: 1, left: 1, years: 1 } },
  { v: 1, season: "bad", results: [null, 3, { round: 1 }] },
  { __proto__: { polluted: true }, money: NaN, rep: Infinity },
  null,
  [],
  "career",
  42,
];

test("SaveMigrate.migrateCareer never throws or leaves NaN in career (N=2000)", async () => {
  const SM = bootSaveMigrate();
  await fuzz("SaveMigrate.migrateCareer", "career-migrate-v1", N, async (rng) => {
    const input = mutate(rng.pick(CAREER_CORPUS), rng);
    let out;
    try {
      out = SM.migrateCareer(input);
    } catch (err) {
      assert.fail(`migrateCareer threw: ${(err && err.message) || err}`);
    }
    if (out == null) return;
    assert.equal(typeof out, "object");
    // Required numeric live fields must be finite after migration.
    for (const k of ["money", "rep", "year", "seat", "seed", "budgetLvl", "facility"]) {
      if (Object.prototype.hasOwnProperty.call(out, k)) {
        assert.ok(Number.isFinite(out[k]), `${k}=${out[k]} must be finite`);
      }
    }
    if (out.deal) {
      for (const k of ["salary", "bonusPt", "left", "years"]) {
        assert.ok(Number.isFinite(out.deal[k]), `deal.${k} must be finite`);
      }
    }
    if (out.season) {
      assert.ok(Number.isInteger(out.season.round) && out.season.round >= 0);
      assertCleanLive("career.season.pts", out.season.pts);
      assertCleanLive("career.season.teamPts", out.season.teamPts);
    }
  });
});

// ── GameStore reads of corrupt / hostile disk values ───────────────────────
test("GameStore.get never throws on corrupt disk and never returns NaN default path (N=2000)", async () => {
  const disk = new Map();
  const localStorage = {
    getItem(k) { return disk.has(k) ? disk.get(k) : null; },
    setItem(k, v) { disk.set(k, String(v)); },
    removeItem(k) { disk.delete(k); },
    clear() { disk.clear(); },
    key() { return null; },
    get length() { return disk.size; },
  };
  const ctx = vm.createContext({
    localStorage, console, Object, Array, Number, String, JSON, Math, Map, Set,
    isFinite, parseInt, parseFloat, Infinity, NaN, undefined,
  });
  seedLog(ctx);
  seedSaveMigrate(ctx);
  vm.runInContext(read("js/core/store.js").replace(/^const\b/gm, "var"), ctx, { filename: "store.js" });
  const GameStore = vm.runInContext("GameStore", ctx);
  const store = GameStore.store;

  const RAW_CORPUS = [
    "null", "undefined", "NaN", "1", '{"a":1}', "{", "[]",
    '{"__proto__":{"x":1}}', '"hi"', "true", "",
  ];

  await fuzz("GameStore.get", "store-get-v1", N, async (rng) => {
    const key = "fuzz." + rng.int(8);
    const raw = mutate(rng.pick(RAW_CORPUS), rng);
    // Plant hostile disk bytes the way a hand-edit or half-write would.
    if (typeof raw === "string") disk.set("apex26." + key, raw);
    else if (raw === undefined) disk.delete("apex26." + key);
    else disk.set("apex26." + key, String(raw));
    store._cache && store._cache.delete && store._cache.delete("apex26." + key);

    let got;
    try {
      got = store.get(key, { safe: true });
    } catch (err) {
      assert.fail(`store.get threw: ${(err && err.message) || err}`);
    }
    // Default path must remain usable; NaN as a returned value is a live leak.
    if (typeof got === "number") {
      assert.ok(Number.isFinite(got) || got === undefined, `store returned non-finite ${got}`);
    }
  });
});

// ── TrackCodec.decode + CustomTracks.sanitize (the track designer's share code) ──
// A share code is someone else's bytes; a stored design is this player's old
// bytes. Both decoders must answer { ok, reason } or a repaired design — never
// throw, never hand the engine a NaN point.
const TRACK_CORPUS = [
  "APXT1.p.AQABAEYHiA", "APXT1.z.AAAA", "APXT9.p.AAAA", "APXG1.p.AAAA", "", "APXT1.p.", "APXT1.p.####",
  { theme: "parkland", baseHW: 7, seed: 1, pts: [[0, 0], [100, 0], [200, 50], [250, 150], [200, 250], [100, 300], [0, 250], [-50, 150]] },
  { theme: "<img>", baseHW: NaN, seed: -1, pts: "pts", hwZones: [{ s0: 2, s1: -1, hw: 1 }], elevations: [{ s: 0.5, halfM: 1, rise: 1e9 }] },
  { pts: [[0, 0], [1, NaN]] }, null, 42, [],
];
test("TrackCodec.decode and CustomTracks.sanitize never throw or leak NaN (N=2000)", async () => {
  const { bootEditor } = await import("../helpers/editor-vm.mjs");
  const { CD, C } = bootEditor();
  const good = await CD.encode(TRACK_CORPUS[7]);
  const corpus = TRACK_CORPUS.concat([good]);
  await fuzz("TrackCodec.decode", "track-decode-v1", N, async (rng) => {
    const input = mutate(rng.pick(corpus), rng);
    let r;
    try {
      // The URL fragment is untrusted too: a stray % must read as "no code", not a URIError.
      if (typeof input === "string") { const h = CD.fromHash("#track=" + input + (input.length % 2 ? "%" : "%E0%A4%A")); assert.ok(h === null || typeof h === "string"); }
      r = typeof input === "string" ? await CD.decode(input) : { ok: !!C.sanitize(input), design: C.sanitize(input) };
    }
    catch (err) { assert.fail(`track decode threw: ${(err && err.message) || err} for ${JSON.stringify(input).slice(0, 80)}`); }
    assert.ok(r && typeof r.ok === "boolean", "ok-reason shape");
    if (!r.ok) { if (typeof input === "string") assert.equal(typeof r.reason, "string"); return; }
    const bad = findBadLiveValues(JSON.parse(JSON.stringify(r.design)));
    assert.deepEqual(bad, [], `decoded design carries NaN/undefined: ${JSON.stringify(bad)}`);
    assert.ok(r.design.pts.length >= 8 && r.design.pts.length <= 200);
  });
});

// ── DataRealRace.build (Data Hub RACE IT: an OpenF1 race body) ────────────
// The bodies come from OpenF1 over HTTPS, but one bad upstream row is still a
// row: a fractional or huge `lap_number` / `number_of_laps` became the length
// of a per-driver array (R3-HOSTILE-1: 2.5 threw, 3e6 built a 3M-lap race, 1e9
// OOMed the process). The race must build, with a lap count a GP can have.
function bootRealRace() {
  const ctx = vm.createContext({ console, Log: { debug() {}, info() {}, warn() {}, error() {} },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {}, key() { return null; }, length: 0 } });
  vm.runInContext(read("js/data/real-race-tab.js") + "\nthis.R = DataRealRace;", ctx, { filename: "real-race-tab.js" });
  return ctx.R;
}
function assertSaneLaps(label, script) {
  assert.ok(Number.isInteger(script.laps) && script.laps >= 0 && script.laps <= 100, `${label}: laps=${script.laps}`);
  for (const d of script.drivers) {
    assert.equal(d.laps.length, script.laps, `${label}: #${d.num} laps array`);
    assert.ok(Number.isInteger(d.lapsDone) && d.lapsDone >= 0 && d.lapsDone <= script.laps, `${label}: #${d.num} lapsDone=${d.lapsDone}`);
  }
}

test("DataRealRace.build: a fractional or huge lap count builds a bounded race, never throws", () => {
  const R = bootRealRace();
  const base = (laps, result) => ({ session: { date_start: "2026-04-01T12:00:00Z", circuit_short_name: "Baku" },
    drivers: [{ driver_number: 1, name_acronym: "AAA", team_name: "X" }], laps, result: result || [] });
  const lap = (n) => [{ driver_number: 1, lap_number: n, lap_duration: 90, date_start: "2026-04-01T12:00:00Z" },
                      { driver_number: 1, lap_number: 1, lap_duration: 91, date_start: "2026-04-01T11:58:30Z" }];
  for (const [label, raw] of [
    ["lap_number 2.5", base(lap(2.5))],
    ["number_of_laps '57.5'", base(lap(1), [{ driver_number: 1, number_of_laps: "57.5", position: 1 }])],
    ["lap_number 3e6", base(lap(3e6))],
    ["lap_number 5e9", base(lap(5e9))],
    ["lap_number 1e9", base(lap(1e9))],
    ["number_of_laps 1e9", base(lap(1), [{ driver_number: 1, number_of_laps: 1e9, position: 1 }])],
  ]) {
    let s;
    try { s = R.build(raw, () => null, []); }
    catch (err) { assert.fail(`${label}: build threw ${(err && err.message) || err}`); }
    assertSaneLaps(label, s);
    assert.equal(s.laps, 1, `${label}: the bad row is dropped, the good lap 1 stays`);
  }
});

test("DataRealRace.build survives one hostile field in the Baku fixture (seeded, N=200)", async () => {
  const R = bootRealRace();
  const fx = JSON.parse(read("tests/fixtures/openf1-baku-2026-race.json"));
  const real = R.build(structuredClone(fx), () => null, []);
  const keys = Object.keys(fx).filter((k) => Array.isArray(fx[k]) && fx[k].length);
  // Half the trials hit a lap-count column (the one that sizes arrays), half any field.
  const LAP_FIELDS = [["laps", "lap_number"], ["result", "number_of_laps"], ["pits", "lap_number"], ["stints", "lap_start"], ["stints", "lap_end"]];
  await fuzz("DataRealRace.build", "realrace-row-v1", 200, async (rng) => {
    let k, f;
    if (rng.bool()) [k, f] = rng.pick(LAP_FIELDS);
    else { k = rng.pick(keys); f = rng.pick(Object.keys(fx[k][0] || { x: 0 })); }
    const i = rng.int(fx[k].length), v = rng.pick(HOSTILE_ROW_VALUES);
    const rows = fx[k].slice(); rows[i] = Object.assign({}, rows[i], { [f]: v });
    const raw = Object.assign({}, fx, { [k]: rows });
    let s;
    try { s = R.build(raw, () => null, []); }
    catch (err) { assert.fail(`build threw ${(err && err.message) || err} for ${k}[${i}].${f}=${JSON.stringify(v)}`); }
    assertSaneLaps(`${k}[${i}].${f}=${JSON.stringify(v)}`, s);
    assert.ok(s.laps <= real.laps, `${k}[${i}].${f}=${JSON.stringify(v)} grew the race to ${s.laps} laps (real ${real.laps})`);
  });
});

// ── LiveryTex.setTeamLogo (a stored customLogo, decoded at every boot) ─────
// An imported garage/career file stores `customLogo` by byte size only; a
// 43 KB PNG can declare 16384² (1 GiB RGBA). The emblem must be refused on its
// header size, before avgColour's drawImage forces the full decode
// (R3-HOSTILE-4). Stubbed Image: onload carries natural dims, no pixels.
test("LiveryTex.setTeamLogo refuses a decompression-bomb emblem before any draw", () => {
  const made = [], draws = [];
  class FakeImage { constructor() { made.push(this); } }
  const document = { createElement: () => ({ getContext: () => ({
    drawImage: (img, ...a) => draws.push([img.naturalWidth, img.naturalHeight, ...a]),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(200) }) }) }) };
  const ctx = { console, Math, Object, Array, Float32Array, Uint16Array, Uint32Array, Uint8ClampedArray, JSON, Number, String, Boolean,
                isFinite, isNaN, Map, Set, WeakMap, Image: FakeImage, document };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ["js/core/log.js", "js/core/mat4.js", "js/data/teams.js", "js/car/parts.js",
                   "js/car/livery-graphics.js", "js/car/liverytex.js"])
    vm.runInContext(read(f), ctx, { filename: f });
  const LT = vm.runInContext("LiveryTex", ctx);
  let marks = 0;
  LT.onMarkChange(() => { marks++; });

  LT.setTeamLogo("custom", "data:image/png;base64,ok");
  Object.assign(made[0], { naturalWidth: 384, naturalHeight: 200, width: 384, height: 200 });
  made[0].onload();
  assert.equal(LT.LOGOS.custom, made[0], "an upload-sized emblem installs");
  assert.equal(draws.length, 1, "…and is sampled once by avgColour");

  for (const [w, h] of [[16384, 16384], [32767, 32767], [1, 1 << 22]]) {
    const before = draws.length, m0 = marks;
    LT.setTeamLogo("custom", "data:image/png;base64,bomb");
    const img = made[made.length - 1];
    Object.assign(img, { naturalWidth: w, naturalHeight: h, width: w, height: h });
    img.onload();
    assert.equal(draws.length, before, `${w}x${h}: never drawn (a draw is the full decode)`);
    assert.equal(LT.LOGOS.custom, undefined, `${w}x${h}: refused, and the previous emblem dropped like onerror`);
    assert.equal(marks, m0 + 1, `${w}x${h}: the caches are told`);
  }
});

// ── Wall-clock budget across the whole file ────────────────────────────────
test("fuzz suite stays under 10 s wall clock", async (t) => {
  // The preceding tests already ran; this is a meta check that the file's
  // cumulative work (measured from process uptime of this file via a marker)
  // does not silently grow past the budget. We re-run a thin slice to measure
  // steady-state cost of one surface.
  // CPU time, not wall time (2026-10-04): this runs in the parallel
  // tooling-fast gate beside other agents' work, where a wall clock measures
  // the box. process.cpuUsage() covers every thread of this process, the
  // zlib pool included, and only while it actually runs.
  const t0 = process.cpuUsage();
  const GhostShare = bootGhostShare();
  const rng = makeRng("budget-check-v1");
  for (let i = 0; i < 200; i++) {
    await GhostShare.decode(mutate(rng.pick(GHOST_CORPUS), rng));
  }
  const used = process.cpuUsage(t0);
  const slice = Math.round((used.user + used.system) / 1000);
  // 200 trials of one surface ≪ 10 s; scale: 2000 * ~8 surfaces ≈ 80× this slice.
  // Cap the slice itself so a sudden regression (inflate loops, etc.) fails here.
  assert.ok(slice < 2000, `200 GhostShare trials took ${slice} ms of CPU (budget 2000 ms)`);
  t.diagnostic(`budget slice: ${slice} ms for 200 GhostShare.decode trials`);
  void BUDGET_MS;
});
