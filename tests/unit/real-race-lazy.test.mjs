/* real-race-lazy.test.mjs — #4978 row 6: the real-race family is off the eager boot.
 *
 * js/race/real-race-boot.js (FULL) is the RealRace game.js creates at eval; the body
 * (RealRaceBody) with RealRacePace / RealReplay / WatchTransport is LAZY_REAL_RACE.
 * Pinned here: the group is not on the boot wall; the stub answers "no real race"
 * until the body lands and then creates it ONCE; the Data Hub (the only player door
 * to a real race) and the agent surface await the bundle before anything launches.
 *
 * Run: node --test tests/unit/real-race-lazy.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = new URL("../../", import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), "utf8");
const manifest = createRequire(import.meta.url)("../../tools/manifest.cjs");
const BODY = ["js/ui/watch-transport.js", "js/race/real-replay.js", "js/race/real-race-pace.js", "js/race/real-race.js"];

test("the real-race body is LAZY_REAL_RACE, not on the boot wall; the stub is", () => {
  assert.deepEqual(manifest.LAZY_REAL_RACE, BODY);
  const html = read("index.html").replace(/<!--[\s\S]*?-->/g, "");
  const tags = new Set([...html.matchAll(/<script\b[^>]*\bsrc="([^"?#]+)/g)].map((m) => m[1]));
  for (const f of BODY) {
    assert.ok(!manifest.FULL.includes(f), f + " left FULL");
    assert.ok(!tags.has(f), f + " has no index.html tag");
  }
  assert.ok(manifest.FULL.includes("js/race/real-race-boot.js") && tags.has("js/race/real-race-boot.js"), "the RealRace stub boots eagerly");
  assert.ok(manifest.FULL.indexOf("js/race/real-race-boot.js") < manifest.FULL.indexOf("js/game.js"), "the stub evaluates before game.js creates it");
});

function stubWorld() {
  const ctx = vm.createContext({ Log: { info() {}, warn() {} }, M4: { clamp: (v, a, b) => Math.min(b, Math.max(a, v)) } });
  vm.runInContext(read("js/race/real-race-boot.js") + "\nthis.RealRace = RealRace;", ctx, { filename: absSrc("js/race/real-race-boot.js") });
  return ctx;
}

test("before the body lands the stub answers 'no real race' and never throws", () => {
  const ctx = stubWorld();
  const rr = ctx.RealRace.create({});
  assert.equal(rr.isWatch(), false);
  assert.equal(rr.isActive(), false);
  assert.equal(rr.owns({}), false);
  assert.equal(rr.raceT0(), 0);
  assert.equal(rr.intro(), null);
  assert.equal(rr.current(), null);
  assert.equal(rr.replay, null);
  assert.deepEqual({ ...rr.status() }, { active: false });
  rr.update(0.016); rr.stop();
  assert.equal(rr.launch({}, {}), null, "nothing to launch with: refused, not thrown");
  assert.deepEqual({ ...ctx.RealRace.status() }, { active: false });
  assert.equal(ctx.RealRace.isWatch(), false);
  assert.equal(ctx.RealRace.replay(), null);
  assert.equal(ctx.RealRace.cumTable, undefined, "a `RealRace.cumTable ?` guard still reads absent");
  assert.equal(typeof ctx.RealRace.dropSpeed, "function", "FlyingStart's helpers stay eager");
  assert.equal(typeof ctx.RealRace.seatOnRoad, "function");
});

test("once the body lands, the first call creates it once and every call forwards", () => {
  const ctx = stubWorld();
  const G = { id: "G" };
  const rr = ctx.RealRace.create(G);
  rr.update(0.016);
  const made = [], calls = [];
  const inst = {
    stage: () => "staged", launch: (s, o) => { calls.push(["launch", o]); return { ok: true }; }, stop: () => calls.push(["stop"]),
    update: (dt) => calls.push(["update", dt]), status: () => ({ active: true, watch: true }), intro: () => ({ title: "x" }),
    raceT0: () => 12, isActive: () => true, isWatch: () => true, current: () => "script", owns: () => true, replay: { seek() {} },
  };
  ctx.RealRaceBody = { create: (g) => { made.push(g); return inst; } };
  ctx.RealRacePace = { cumTable: () => "cum" };
  for (let i = 0; i < 3; i++) rr.update(0.5);
  assert.equal(ctx.RealRace.launch("s", { seat: "LEC" }).ok, true);
  assert.equal(rr.isWatch() && rr.isActive() && rr.owns({}), true);
  assert.equal(rr.raceT0(), 12);
  assert.equal(ctx.RealRace.status().watch, true);
  assert.equal(ctx.RealRace.replay(), inst.replay);
  assert.equal(rr.replay, inst.replay);
  assert.equal(ctx.RealRace.cumTable(), "cum", "the pace helpers forward to RealRacePace");
  assert.equal(made.length, 1, "RealRaceBody.create runs once");
  assert.equal(made[0], G, "with game.js's G");
  assert.equal(calls.filter((c) => c[0] === "update").length, 3);
});

function hubWorld() {
  const loads = [];
  let releaseRace = null;
  const ctx = vm.createContext({
    console, Promise, setTimeout, clearTimeout, queueMicrotask, URLSearchParams,
    ApexRoster: {
      DEFERRED: {}, DEFERRED_EDGES: [], LAZY_AGENT: [], LAZY_EDGES: [], LAZY_RACE: [],
      LAZY_RACE_SESSION: [], LAZY_RACE_SESSION_EDGES: [], LAZY_AUDIO: [], LAZY_AUDIO_EDGES: [],
      LAZY_TRACK_BUILD: [], LAZY_TRACK_BUILD_EDGES: [], LAZY_DATA: ["js/data/hub.js"], LAZY_DATA_EDGES: [], LAZY_NET: [], LAZY_NET_EDGES: [],
      LAZY_REAL_RACE: manifest.LAZY_REAL_RACE, LAZY_REAL_RACE_EDGES: manifest.LAZY_REAL_RACE_EDGES, SCENERY_DIR: "js/circuits/scenery",
    },
    localStorage: { getItem: () => null },
    navigator: { userAgent: "apex-game-vm" }, location: { search: "", hostname: "example.com" },
    Log: { warn() {}, info() {}, error() {}, debug() {} },
    document: { createElement() { return { dataset: {}, remove() {} }; }, head: { appendChild() {} } },
    addEventListener() {}, removeEventListener() {},
  });
  ctx.window = ctx;
  vm.runInContext(read("js/core/script-loader.js") + "\n" + read("js/core/lazy-bundles.js") + "\nthis.LazyBundles = LazyBundles;", ctx, { filename: absSrc("js/core/lazy-bundles.js") });
  const lb = ctx.LazyBundles.create({ els: {}, applyLightTuneIfReady() {}, onAudioReady() {}, getContext: () => null, bindAgent() {},
    loadBackendScripts: (files) => {
      loads.push(files.slice());
      if (files.includes("js/race/real-race.js")) {
        return new Promise((r) => { releaseRace = () => {
          ctx.WatchTransport = {}; ctx.RealReplay = {}; ctx.RealRacePace = {}; ctx.RealRaceBody = { create() { return {}; } }; r(true);
        }; });
      }
      if (files.includes("js/data/hub.js")) ctx.DataHub = { init() {} };
      return Promise.resolve(true);
    } });
  return { lb, loads, ctx, release: () => releaseRace() };
}

test("the Data Hub opens only once the real-race engine has landed (WATCH & DRIVE never launches into a stub)", async () => {
  const w = hubWorld();
  let opened = null;
  const p = w.lb.ensureDataHub().then((ok) => { opened = ok; });
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  assert.equal(opened, null, "the hub waits for the real-race bundle");
  assert.ok(w.loads.some((l) => l.includes("js/race/real-race.js")), "the hub asks for LAZY_REAL_RACE");
  w.release();
  await p;
  assert.equal(opened, true);
  assert.equal(typeof w.ctx.RealRaceBody, "object");
  await w.lb.ensureRealRace();
  assert.equal(w.loads.filter((l) => l.includes("js/race/real-race.js")).length, 1, "one inject, memoised");
});

test("the agent surface loads the real-race engine (pages and specs call RealRace.launch directly)", async () => {
  const w = hubWorld();
  const p = w.lb.loadAgentSurface();
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  assert.ok(w.loads.some((l) => l.includes("js/race/real-race.js")));
  w.release();
  await p;
  assert.equal(typeof w.ctx.RealRaceBody, "object");
});
