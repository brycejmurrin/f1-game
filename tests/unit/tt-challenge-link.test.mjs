/* tt-challenge-link.test.mjs — #6884 A3 / #7041: any Time Trial lap shares as a challenge
 * link (circuit + conditions + APXG1 ghost + lap time as the target), and one tap through
 * DeepLink stages a time trial against that ghost in a fresh profile.
 *
 * Run: node --test tests/unit/tt-challenge-link.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";
import { seedHash32 } from "../helpers/seed-hash32.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const lap = JSON.parse(read("tests/fixtures/ghost-monza-short.json"));   // a recorded lap (js/car/ghost.js shape)

// One fresh "profile": its own realm, no storage at all (a read of localStorage throws).
function profile(opts = {}) {
  const location = { origin: "https://example.test", pathname: "/f1-game/", href: "https://example.test/f1-game/", hash: "", search: "" };
  const sandbox = {
    module: { exports: {} }, TextEncoder, TextDecoder, Uint8Array, Blob, Response, btoa, atob, URL, location,
    CompressionStream: opts.plain ? undefined : CompressionStream,
    DecompressionStream: opts.plain ? undefined : DecompressionStream,
    Tracks: { LIST: [{ id: "spa" }, { id: "monza" }] },
    Log: { info() {}, warn() {} },
  };
  Object.defineProperty(sandbox, "localStorage", { get() { throw new Error("a challenge link must not need storage"); } });
  const ctx = vm.createContext(sandbox);
  seedHash32(ctx);
  vm.runInContext(read("js/car/ghost-share.js"), ctx, { filename: absSrc("js/car/ghost-share.js") });
  vm.runInContext(read("js/ui/deep-link.js").replace(/^const DeepLink\b/m, "var DeepLink"), ctx, { filename: absSrc("js/ui/deep-link.js") });
  const calls = { stop: 0, select: [], restore: 0, open: 0, reset: 0 };
  const G = {
    flow: "title", session: "none", trackIdx: 0, raceWeather: "dry", raceTimeOfDay: "default",
    daily: { stop() { calls.stop++; }, select(day) { calls.select.push(day); } },
    resetRaceDraft() { calls.reset++; },
  };
  const hooks = { today: "2026-11-26", restoreFreePlay() { calls.restore++; }, open() { calls.open++; } };
  return { ctx, G, hooks, calls, GhostShare: sandbox.module.exports, DeepLink: ctx.DeepLink };
}
const bytes = (arr) => Buffer.from(new Float64Array(arr).buffer);
const COND = { weather: "fog", tod: "dusk" };

test("a recorded TT lap encodes to a link that decodes in a fresh profile to the same circuit, conditions, ghost and target", async () => {
  for (const plain of [false, true]) {
    const sender = profile({ plain });
    const shared = await sender.GhostShare.encode(lap, { track: "monza", context: "{}", cond: COND });
    assert.equal(shared.ok, true);
    assert.equal(shared.url, "https://example.test/f1-game/#ghost=" + shared.code, "the link is the page plus the ghost code");
    const back = await profile({ plain }).GhostShare.decode(shared.url);   // another realm: nothing shared but the text
    assert.equal(back.ok, true);
    assert.equal(back.track, "monza");
    assert.deepEqual({ ...back.cond }, COND);
    assert.equal(back.target, lap.time, "the lap time is the target");
    for (const k of ["t", "s", "x"]) assert.ok(bytes(back.ghost[k]).equals(bytes(lap[k])), k + " samples byte-equal");
  }
});

test("DeepLink.openChallenge stages a time trial on the link's circuit and conditions against its ghost", async () => {
  const shared = await profile().GhostShare.encode(lap, { track: "monza", cond: COND });
  const p = profile();
  const res = await p.DeepLink.openChallenge(shared.url, p.G, p.hooks);
  assert.equal(res.ok, true);
  assert.equal(res.target, lap.time);
  assert.equal(p.G.flow, "gp"); assert.equal(p.G.session, "tt");
  assert.equal(p.G.trackIdx, 1, "monza");
  assert.equal(p.G.raceWeather, "fog"); assert.equal(p.G.raceTimeOfDay, "dusk");
  assert.deepEqual([p.calls.stop, p.calls.restore, p.calls.reset, p.calls.open], [1, 1, 1, 1]);
  assert.equal(p.GhostShare.hasGuest("monza"), true, "the guest rival is the race's ghost");
  assert.equal(p.GhostShare.bestTime(), lap.time);
  assert.deepEqual({ ...p.GhostShare.guest().cond }, COND);
});

test("a challenge from today's Daily stays on the Daily's own plan", async () => {
  const shared = await profile().GhostShare.encode(lap, { track: "monza", day: "2026-11-26", cond: COND });
  const p = profile();
  const res = await p.DeepLink.openChallenge(shared.code, p.G, p.hooks);
  assert.equal(res.ok, true); assert.equal(res.daily, true);
  assert.deepEqual(p.calls.select, ["2026-11-26"]);
  assert.equal(p.G.raceWeather, "dry", "the Daily pins its own weather");
});

test("RACE SETTINGS stages a TT draft in the guest's conditions, else the defaults", () => {
  for (const [guest, want] of [[{ track: "monza", cond: COND }, ["fog", "dusk"]], [null, ["dry", "default"]], [{ track: "spa", cond: COND }, ["dry", "default"]]]) {
    const ctx = vm.createContext({ Log: { info() {}, warn() {} },
      GhostShare: { hasGuest: (id) => !!guest && guest.track === id, guest: () => guest } });
    vm.runInContext(read("js/race/race-settings.js").replace(/^const RaceSettings\b/m, "var RaceSettings"), ctx, { filename: absSrc("js/race/race-settings.js") });
    const G = { flow: "gp", session: "tt", trackIdx: 1, season: null, daily: null, netLobby: { roomChanged() {} },
      raceLaps: 4, raceWeather: "rain", raceTimeOfDay: "night", raceChangeable: false, store: { get: (_k, d) => d, set() { return true; } },
      $: () => null, GAME_LAPS: 3, TT_LAPS: 4, scheduleFlybyTrack() {}, buildSelect() {}, els: {} };
    const rs = ctx.RaceSettings.create(G, { Tracks: { LIST: [{ id: "spa", gpLaps: 44 }, { id: "monza", gpLaps: 53 }] },
      SettingRow: { paint() {}, disable() {}, wire() {} }, SeasonCal: { formatLaps: (n) => n } });
    rs.resetDraft();
    try { rs.openRaceSettings("select"); } catch (_) { /* the inert sheet has no DOM; stageDraft ran first */ }
    assert.deepEqual([G.raceWeather, G.raceTimeOfDay], want, JSON.stringify(guest));
  }
});

test("a malformed or oversize challenge link is refused with no throw and stages nothing", async () => {
  const good = await profile({ plain: true }).GhostShare.encode(lap, { track: "monza", cond: COND });
  const body = good.code.split(".")[2];
  const json = (o) => "APXG1.p." + Buffer.from(JSON.stringify(o)).toString("base64url");
  const env = JSON.parse(Buffer.from(body, "base64url").toString());
  const rows = [
    ["empty", ""], ["null", null], ["number", 42], ["object", { ghost: 1 }], ["bare fragment", "#ghost="],
    ["bad base64", "#ghost=APXG1.p.!!!"], ["wrong magic", "APXG2.p." + body], ["bad mode", "APXG1.q." + body],
    ["truncated", good.code.slice(0, -40)], ["not JSON", "APXG1.p." + Buffer.from("{nope").toString("base64url")],
    ["oversize code", "APXG1.p." + "A".repeat(64 * 1024 + 1)], ["oversize pasted JSON", "{" + " ".repeat(512 * 1024 + 1) + "}"],
    ["edited time", json({ ...env, time: env.time - 5 })], ["edited sample", json({ ...env, x: env.x.map((v, i) => i === 3 ? v + 1 : v) })],
    ["unknown circuit", json({ ...env, track: "atlantis", h: undefined })], ["no circuit", json({ ...env, track: "" })],
  ];
  for (const [name, value] of rows) {
    const p = profile({ plain: true });
    let res;
    await assert.doesNotReject(async () => { res = await p.DeepLink.openChallenge(value, p.G, p.hooks); }, name);
    assert.equal(res.ok, false, name);
    assert.equal(p.G.session, "none", name + ": nothing staged");
    assert.equal(p.calls.open, 0, name);
    assert.equal(p.GhostShare.guest(), null, name + ": no guest installed");
  }
  // A garbled conditions block keeps the ghost and drops to the picker's defaults.
  for (const cond of [{ weather: "lava" }, "fog", [1], { weather: "rain", tod: "noon" }]) {
    const p = profile({ plain: true });
    const res = await p.DeepLink.openChallenge(json({ ...env, cond }), p.G, p.hooks);
    assert.equal(res.ok, true, JSON.stringify(cond));
    assert.deepEqual(res.cond ? { ...res.cond } : null, cond && cond.weather === "rain" ? { weather: "rain", tod: "default" } : null);
  }
});
