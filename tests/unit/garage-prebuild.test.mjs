// The GARAGE pre-built while the title or race settings idles
// (js/garage/prebuild.js, GaragePrebuild). Tapping GARAGE used to build the
// room, the car and their programs on the tap — 1.3-1.8 s of frozen screen
// under SwiftShader. These run the real module in a VM: the pure gate
// (blockers/plan), the keyed sequence behind the menu's idle gate, and the
// tap-to-first-frame measure; and the real GarageScene.prepare(), so a
// prepared room is one the garage's first draw() does not rebuild.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

function loadModule(extra = {}) {
  const logs = [];
  const ctx = vm.createContext({
    Math, Object, Array, JSON, Promise,
    Log: { info: (ns, msg) => logs.push(ns + ": " + msg), warn: (ns, msg) => logs.push("warn " + msg), debug() {} },
    setTimeout: () => 0, clearTimeout() {},
    ...extra,
  });
  vm.runInContext(read("js/garage/prebuild.js"), ctx, { filename: "js/garage/prebuild.js" });
  return { GP: vm.runInContext("GaragePrebuild", ctx), ctx, logs };
}

const GO = {
  want: "title", kind: "none", state: "menu", setupOpen: false, starting: false, tabHidden: false, headless: false,
  surface: "title", intro: false, saveData: false, packSettled: true, worldReady: false, homePainted: false,
  worldWarm: false, warming: false,
};

test("blockers: an idle title with nothing in the way goes", () => {
  const { GP } = loadModule();
  assert.deepEqual([...GP.blockers(GO)], []);
});

test("blockers: never on a race start, with the garage open, a hidden tab or headless", () => {
  const { GP } = loadModule();
  const why = (patch) => [...GP.blockers({ ...GO, ...patch })];
  assert.deepEqual(why({ state: "race" }), ["state"]);
  assert.deepEqual(why({ starting: true }), ["race-start"], "the loading card or the drive-out studio is up");
  assert.deepEqual(why({ setupOpen: true }), ["garage-open"]);
  assert.deepEqual(why({ tabHidden: true }), ["tab-hidden"]);
  assert.deepEqual(why({ headless: true }), ["headless"]);
  assert.deepEqual(why({ surface: "" }), ["surface"], "a covered title (a dialog over it) is not idle");
  assert.deepEqual(why({ worldWarm: true }), ["world-warm"], "the menu world's hidden frames go first");
  assert.deepEqual(why({ warming: true }), ["world-warm"], "and so does a compile they started");
});

test("blockers: the title is speculative — Save-Data, the pack, the intro and the world all gate it", () => {
  const { GP } = loadModule();
  const why = (patch) => [...GP.blockers({ ...GO, ...patch })];
  assert.deepEqual(why({ saveData: true }), ["save-data"]);
  assert.deepEqual(why({ packSettled: false }), ["pack"]);
  assert.deepEqual(why({ intro: true }), ["title-intro"]);
  assert.deepEqual(why({ kind: "track" }), ["world-build"], "a circuit Home finishes its own build first");
  assert.deepEqual(why({ kind: "track", worldReady: true }), []);
  assert.deepEqual(why({ kind: "garage" }), ["home-unpainted"], "the Home garage paints before it counts as warm");
  assert.deepEqual(why({ kind: "garage", homePainted: true }), []);
});

test("blockers: race settings keeps its old gates — RACE! needs that garage", () => {
  const { GP } = loadModule();
  const settings = { ...GO, want: "settings", surface: "settings", saveData: true, packSettled: false, intro: true };
  assert.deepEqual([...GP.blockers(settings)], []);
  assert.deepEqual([...GP.blockers({ ...settings, surface: "title" })], ["surface"]);
});

test("plan: only a hidden canvas gets hidden frames; a Home garage keeps its own room", () => {
  const { GP } = loadModule();
  const p = (want, kind) => ({ ...GP.plan(want, kind) });
  assert.deepEqual(p("settings", "none"), { car: true, room: true, frames: true });
  assert.deepEqual(p("title", "none"), { car: true, room: true, frames: true });
  assert.deepEqual(p("title", "track"), { car: true, room: true, frames: false }, "the circuit is on the canvas");
  assert.deepEqual(p("title", "garage"), { car: true, room: false, frames: false }, "a setup-ctx room would be undone by the next Home frame");
  assert.deepEqual(p("title", "studio"), { car: true, room: false, frames: false });
});

test("homeKind, packSettled and saveData read the real signals", () => {
  const { GP } = loadModule();
  assert.equal(GP.homeKind(null), "none");
  assert.equal(GP.homeKind({ home: false, world: { active: false } }), "none");
  assert.equal(GP.homeKind({ home: false, world: { active: true } }), "track");
  assert.equal(GP.homeKind({ home: true, scene: { mode: "garage" }, world: {} }), "garage");
  assert.equal(GP.homeKind({ home: true, scene: { mode: "night" }, world: {} }), "garage");
  assert.equal(GP.homeKind({ home: true, scene: { mode: "studio" }, world: {} }), "studio");
  assert.equal(GP.packSettled({ supported: true, uploaded: false, error: null, tier: null }), false, "in flight, or not kicked yet");
  assert.equal(GP.packSettled({ supported: true, uploaded: true }), true);
  assert.equal(GP.packSettled({ supported: true, uploaded: false, error: "no-pack" }), true);
  assert.equal(GP.packSettled({ supported: false }), true);
  assert.equal(GP.saveData({ connection: { saveData: true } }, null), true);
  assert.equal(GP.saveData({}, (q) => ({ matches: q === "(prefers-reduced-data: reduce)" })), true);
  assert.equal(GP.saveData({ connection: { saveData: false } }, () => ({ matches: false })), false);
  assert.equal(GP.saveData({}, () => { throw new Error("no media queries"); }), false);
});

// A scripted page: the gate, the camera's prebuild surface and an explicit
// slice clock (each menuSlice resolves when the test calls flush()).
function page({ kind = "none", painted = true, surface = "title", worldWarm = 0 } = {}) {
  let t = 0, team = "mclaren", meshKey = "", warms = 0, slices = [];
  const built = [];
  const els = {
    overlay: { hidden: surface !== "title", inert: false, hasAttribute: () => false },
    "race-settings": { hidden: surface !== "settings" },
  };
  const G = {
    state: "menu", setupPreviewOn: false, headlessMode: false, $: (id) => els[id],
    loadingScreen: { active: () => false },
    gfx: { warm() { warms++; }, warming: () => false },
  };
  const gate = { warm: worldWarm, garageWarm: 0, garageReady: false, garageKey: "" };
  const cam = {
    previewKey: () => team + ":parts:4",
    prebuildKey: () => team + ":parts:4|monza|day",
    prebuild(part) { built.push(part); if (part === "car") meshKey = team + ":parts:4"; return true; },
    roomReady: () => built.includes("room"),
    get meshKey() { return meshKey; }, set meshKey(v) { meshKey = v; },
    released: 0,
    // setup-camera.js release(): refused under an open garage, else frees the room and every car.
    release() { if (G.setupPreviewOn) return false; cam.released++; meshKey = ""; built.length = 0; return true; },
  };
  const home = { home: kind === "garage" || kind === "studio", painted, scene: { mode: kind === "studio" ? "studio" : "garage" },
    world: { active: kind === "track" } };
  const { GP, ctx, logs } = loadModule({
    performance: { now: () => t }, document: { hidden: false },
    navigator: {}, matchMedia: () => ({ matches: false }),
    Assets: { state: () => ({ supported: true, uploaded: true }) },
  });
  const deps = {
    gate, setupCam: cam, ui: () => ({ state: () => home }), studio: () => null, worldReady: () => true,
    menuIdle: async (current) => current(),
    menuSlice: () => new Promise((r) => slices.push(r)),
  };
  const pre = GP.create(G, deps);
  return {
    GP, G, gate, cam, pre, built, logs, ctx, els,
    warms: () => warms, setTeam(v) { team = v; },
    advance(ms) { t += ms; },
    // Settle the microtasks, then release `n` rounds of pending slices.
    async flush(n = 1) {
      const settle = async () => { for (let k = 0; k < 20; k++) await Promise.resolve(); };
      await settle();
      for (let i = 0; i < n; i++) { for (const r of slices.splice(0)) r(); await settle(); }
    },
  };
}
const owned = (h) => () => h.G.state === "menu" && !h.G.setupPreviewOn;

test("the title builds the car, then the room, then arms two hidden frames after ONE warm request", async () => {
  const h = page();
  const done = h.pre.run(owned(h), "title");
  await h.flush(0);
  assert.deepEqual(h.built, ["car"], "the car is its own task");
  await h.flush();
  assert.deepEqual(h.built, ["car", "room"], "the room in the next one");
  await h.flush();
  assert.equal(h.warms(), 1, "the program warm is requested once");
  assert.equal(h.gate.garageWarm, 2, "render() draws the setup garage hidden");
  assert.equal(h.gate.garageKey, "mclaren:parts:4|monza|day", "keyed on the team, parts, seat and room ctx");
  // render()'s hidden branch: `if (renderSetupPreview(dt)) _menuGate.garageReady = true`.
  h.advance(40); h.gate.garageWarm = 0; h.gate.garageReady = true;
  await h.flush();
  assert.equal(await done, true);
  const st = h.pre.state();
  assert.equal(st.ready, true);
  assert.equal(st.last.result, "ready");
  assert.equal(st.last.kind, "none");
  assert.deepEqual([...st.blockers], []);
  assert.ok(h.logs.some((l) => /^game: garage prewarm ready in \d+ ms \(title, home none: car \d+ ms, room \d+ ms, frames \d+ ms\)$/.test(l)), h.logs.join("\n"));
});

test("ready is keyed: a team pick or a livery bust re-arms it, and the warm is never asked twice", async () => {
  const h = page();
  const go = async () => { const p = h.pre.run(owned(h), "title"); await h.flush(2); h.gate.garageReady = true; await h.flush(); return p; };
  assert.equal(await go(), true);
  assert.equal(await h.pre.run(owned(h), "title"), false, "nothing to do for the same key");
  assert.equal(h.built.length, 2);
  h.setTeam("ferrari");
  assert.equal(h.pre.state().ready, false, "a team pick moves the key");
  assert.equal(await go(), true);
  assert.equal(h.gate.garageKey, "ferrari:parts:4|monza|day");
  h.cam.meshKey = "";   // setup-sheet.js livery edit: G._spMeshKey = ""
  assert.equal(h.pre.state().ready, false, "a livery edit busts the cached car");
  assert.equal(await go(), true);
  assert.deepEqual(h.built.filter((p) => p === "car").length, 3, "one car build per run — the LRU sees one slot per key");
  assert.equal(h.warms(), 1, "programs do not depend on the paint: one warm request per session");
});

test("the menu world's hidden frames are waited for, never stolen", async () => {
  const h = page({ worldWarm: 2, surface: "settings" });
  const done = h.pre.run(owned(h), "settings");
  await h.flush(3);
  assert.deepEqual(h.built, [], "nothing while the circuit's warm frames are owed");
  h.gate.warm = 0;
  await h.flush(3);
  assert.deepEqual(h.built, ["car", "room"]);
  h.gate.garageReady = true; await h.flush();
  assert.equal(await done, true);
});

test("a tap mid-sequence supersedes it: no room, no frames", async () => {
  const h = page();
  const done = h.pre.run(owned(h), "title");
  await h.flush(0);
  h.G.setupPreviewOn = true;   // GARAGE opened
  await h.flush();
  assert.equal(await done, false);
  assert.deepEqual(h.built, ["car"]);
  assert.equal(h.gate.garageWarm, 0);
  assert.equal(h.pre.state().last.result, "superseded");
});

test("a Home garage already draws the room: car only, ready without a hidden frame", async () => {
  const h = page({ kind: "garage" });
  const done = h.pre.run(owned(h), "title");
  await h.flush();
  assert.equal(await done, true);
  assert.deepEqual(h.built, ["car"]);
  assert.equal(h.warms(), 0, "a warm request would hold the visible Home's presents");
  assert.equal(h.gate.garageWarm, 0);
  assert.equal(h.pre.state().ready, true);
});

test("a circuit Home gets the car and the room on the CPU, no frames over the circuit", async () => {
  const h = page({ kind: "track" });
  const done = h.pre.run(owned(h), "title");
  await h.flush(2);
  assert.equal(await done, true);
  assert.deepEqual(h.built, ["car", "room"]);
  assert.equal(h.gate.garageWarm, 0);
  assert.equal(h.warms(), 0);
});

// The frameless title plans (a circuit or garage Home) build on the CPU only:
// the programs are compiled by the hidden frames, so race settings must still
// draw them — a title-ready that short-circuited RACE SETTINGS left the
// drive-out's first garage frame compiling on the tap (the freeze #930 targets).
test("a frameless title prebuild never stands in for race settings' hidden frames", async () => {
  for (const kind of ["track", "garage"]) {
    const h = page({ kind });
    const title = h.pre.run(owned(h), "title");
    await h.flush(2);
    assert.equal(await title, true, kind);
    assert.equal(h.pre.state().ready, true, kind + ": the title poll stops");
    assert.equal(h.gate.garageReady, false, kind + ": nothing was drawn, so nothing is marked drawn");
    assert.equal(h.gate.garageWarm, 0);
    // RACE SETTINGS opens on the same circuit/weather/time: same key.
    h.els["race-settings"].hidden = false; h.els.overlay.hidden = true;
    const settings = h.pre.run(owned(h), "settings");
    await h.flush(2);
    assert.equal(h.gate.garageWarm, 2, kind + ": settings arms the hidden frames instead of returning early");
    assert.equal(h.warms(), 1);
    assert.deepEqual(h.built, ["car", "room"], kind + ": the prepped car is not rebuilt; only a missing room is built");
    h.gate.garageWarm = 0; h.gate.garageReady = true;   // render()'s hidden branch drew
    await h.flush();
    assert.equal(await settings, true);
    assert.equal(h.pre.state().last.want, "settings");
    assert.equal(await h.pre.run(owned(h), "settings"), false, kind + ": drawn — now settings is ready");
  }
});

test("blocked runs build nothing: Save-Data on the title, a race start anywhere", async () => {
  const h = page();
  h.ctx.navigator = { connection: { saveData: true } };
  assert.equal(await h.pre.run(owned(h), "title"), false);
  assert.deepEqual([...h.pre.state().blockers], ["save-data"]);
  h.ctx.navigator = {};
  h.G.loadingScreen.active = () => true;
  assert.equal(await h.pre.run(owned(h), "title"), false);
  assert.deepEqual(h.built, []);
});

test("the tap-to-first-frame measure counts only the visible garage, and says whether it was prebuilt", async () => {
  const h = page({ kind: "garage" });
  let ok = false;
  const frame = h.pre.timed(() => { h.advance(30); return ok; });
  frame(0.016);   // a hidden prewarm frame: not a visit
  assert.equal(h.pre.state().firstFrame, null);
  h.pre.markOpen("menu");
  h.G.setupPreviewOn = true;
  frame(0.016);   // withheld (a compile in flight): counted as work, not as the frame
  ok = true; h.advance(10); frame(0.016);
  const ff = h.pre.state().firstFrame;
  assert.equal(ff.from, "menu");
  assert.equal(ff.calls, 2);
  assert.equal(ff.workMs, 60);
  assert.equal(ff.tapMs, 70);
  assert.equal(ff.prebuilt, false);
  assert.ok(h.logs.some((l) => /^game: garage first frame 70 ms after the tap \(60 ms in 2 frame call\(s\), prebuilt false\)$/.test(l)));
  // ...and once prebuilt, the next visit says so.
  h.G.setupPreviewOn = false;
  const p = h.pre.run(owned(h), "title"); await h.flush(); await p;
  h.pre.markOpen("menu"); h.G.setupPreviewOn = true; frame(0.016);
  assert.equal(h.pre.state().firstFrame.prebuilt, true);
});

test("GaragePrebuild.instance() is the page's one instance (for __apex.garagePrebuild)", () => {
  const h = page();
  assert.equal(h.GP.instance(), h.pre);
  const apex = read("js/agent/apex.js");
  assert.match(apex, /garagePrebuild: \(\) => \(typeof GaragePrebuild !== "undefined" && GaragePrebuild\.instance\(\) \? GaragePrebuild\.instance\(\)\.state\(\) : null\)/);
  const game = read("js/game.js");
  assert.match(game, /const renderSetupPreview = garagePre\.timed\(setupCam\.renderSetupPreview\);/, "every garage frame render() draws is measured");
  assert.match(game, /function openGarage\(from\) \{\n  garagePre\.markOpen\(from\);/, "the clock starts at the tap");
  assert.match(game, /garagePre\.start\(\);/, "the title poll is armed at boot");
  const openAt = game.indexOf("function openGarage(from)");
  const open = game.slice(openAt, game.indexOf("$(\"mb-garage\").onclick", openAt));
  assert.match(open, /resetSetupCam\(\);[\s\S]*else vt\(openSetup\);/,
    "openGarage resets the camera before vt(openSetup); endHome lets renderHome yield");
  assert.doesNotMatch(open, /setupPreviewOn\s*=\s*true/,
    "openGarage must not touch game.js setupPreviewOn (openSetup owns that claim)");
});

// ── the real room: GarageScene.prepare() is the rebuild draw() runs first ──
function sceneHarness() {
  const made = [], live = new Set();
  const mk = (kind, extra) => { made.push(kind); const h = { id: made.length, ...extra }; live.add(h); return h; };
  const gfx = {
    createMesh() { return mk("mesh"); },
    createTexMesh() { return mk("tex", { tex: true }); },
    freeMesh(h) { live.delete(h); }, freeTexture(h) { live.delete(h); }, createTexture() { return mk("texture"); },
    draw() {}, drawDecal() {}, drawGlow() {},
  };
  const ctx = vm.createContext({
    console, Math, Object, Array, Number, String, JSON, Float32Array, Uint16Array, Uint32Array, isFinite, parseFloat, parseInt, Date,
    Log: { info() {}, warn() {}, error() {}, debug() {}, enabled: () => false },
  });
  for (const f of ["js/track/core/geom.js", "js/track/core/pit.js", "js/garage/scene-prims.js", "js/garage/scene-equipment.js",
                   "js/garage/scene-live.js", "js/garage/experience.js", "js/garage/scene.js"])
    vm.runInContext(read(f), ctx, { filename: f });
  const GarageScene = vm.runInContext("GarageScene", ctx);
  GarageScene.init(gfx);
  return { GarageScene, made, live };
}
const TEAM = { id: "mclaren", name: "McLaren", short: "MCL",
               drivers: [{ name: "A", code: "AAA", num: 4 }, { name: "B", code: "BBB", num: 81 }] };
const LIV = { c1: [0.95, 0.45, 0.05], c2: [0.05, 0.05, 0.06], accent: [0.1, 0.7, 0.9] };

test("a prepared room is the one the first garage draw uses: no rebuild on the tap", () => {
  const { GarageScene, made } = sceneHarness();
  const setupCtx = { track: { id: "monza" }, weather: "dry", tod: "default", night: false };
  assert.equal(GarageScene.prepared(TEAM, LIV, null, 0, setupCtx), false);
  assert.equal(GarageScene.prepare(TEAM, LIV, null, 0, setupCtx), true);
  assert.equal(GarageScene.prepared(TEAM, LIV, null, 0, setupCtx), true);
  const before = made.filter((m) => m === "mesh").length;
  assert.ok(before > 0, "the room was built");
  GarageScene.draw(TEAM, LIV, [0, 1.6, 0], null, 0, setupCtx);
  assert.equal(made.filter((m) => m === "mesh").length, before, "the first draw() found the room built");
  // The Home garage borrows the room with its own ctx (night forced off, or the studio): that is a different room.
  assert.equal(GarageScene.prepared(TEAM, LIV, null, 0, { ...setupCtx, studio: true }), false);
  assert.equal(GarageScene.ctxKey(setupCtx), GarageScene.ctxKey({ ...setupCtx, sceneNow: 123, ambient: true }),
    "the scene clock and ambient motion never move the room's key");
});

test("the A/B switch: apex26.garagePrewarm=\"off\" at boot, or setEnabled(false), stops the TITLE prebuild only", async () => {
  const { GP } = loadModule();
  const store = (v) => ({ getItem: (k) => (k === "apex26.garagePrewarm" ? v : null) });
  assert.equal(GP.readSwitch(store(null)), true, "on by default");
  for (const v of ["off", '"off"', "0", "false"]) assert.equal(GP.readSwitch(store(v)), false, v);
  assert.equal(GP.readSwitch({ getItem() { throw new Error("blocked storage"); } }), true);
  assert.deepEqual([...GP.blockers({ ...GO, off: true })], ["off"]);
  assert.deepEqual([...GP.blockers({ ...GO, off: true, want: "settings", surface: "settings" })], [], "RACE!'s prewarm is not switched");
  const h = page();
  assert.equal(h.pre.setEnabled(false), false);
  assert.equal(await h.pre.run(owned(h), "title"), false);
  assert.deepEqual(h.built, []);
  assert.equal(h.pre.state().enabled, false);
  assert.deepEqual([...h.pre.state().blockers], ["off"]);
  assert.equal(h.pre.setEnabled(true), true);
  const p = h.pre.run(owned(h), "title"); await h.flush(2); h.gate.garageReady = true; await h.flush();
  assert.equal(await p, true);
  assert.equal(h.pre.state().ready, true);
  // setEnabled(true) re-arms: a shared page's earlier garage visit can never stand in for a fresh cycle.
  assert.equal(h.pre.setEnabled(true), true);
  assert.equal(h.pre.state().ready, false);
  assert.equal(h.pre.state().last, null);
  assert.equal(h.gate.garageKey, "");
  const again = h.pre.run(owned(h), "title"); await h.flush(2); h.gate.garageReady = true; await h.flush();
  assert.equal(await again, true);
  assert.equal(h.pre.state().last.result, "ready");
});

// RACE START RELEASES THE GARAGE (~12.5 MB GPU + ~5 MB canvases had stayed resident
// through every race after the first visit): the prebuild forgets readiness, so the
// next idle title builds it again; an open garage (drive-out studio, pit visit) is kept.
test("release at race start frees the garage and re-arms the next title prebuild", async () => {
  const h = page();
  const go = async () => { const p = h.pre.run(owned(h), "title"); await h.flush(2); h.gate.garageReady = true; await h.flush(); return p; };
  assert.equal(await go(), true);
  assert.equal(h.pre.state().ready, true);
  h.G.setupPreviewOn = true;
  assert.equal(h.pre.release(), false, "a garage on screen is never freed under itself");
  assert.equal(h.pre.state().ready, true);
  h.G.setupPreviewOn = false; h.G.state = "count";
  assert.equal(h.pre.release(), true);
  assert.equal(h.cam.released, 1);
  assert.equal(h.gate.garageReady, false);
  assert.equal(h.gate.garageKey, "");
  assert.equal(h.pre.state().ready, false, "readiness is forgotten with the meshes");
  assert.ok(h.logs.includes("game: garage released for the race"));
  assert.equal(await h.pre.run(owned(h), "title"), false, "nothing is rebuilt during the race");
  h.G.state = "menu";
  assert.equal(await go(), true, "the next idle title builds it again");
  assert.deepEqual(h.built, ["car", "room"]);
  assert.equal(h.pre.state().ready, true);
  const game = read("js/game.js");
  assert.match(game, /  clearMenuScreens\(\); garagePre\.release\(\);/, "startRaceBody releases it once the garage screen is down");
});

test("GarageScene.release frees every garage handle; the next draw rebuilds the room", () => {
  const { GarageScene, live } = sceneHarness();
  const setupCtx = { track: { id: "monza" }, weather: "dry", tod: "default", night: false };
  GarageScene.draw(TEAM, LIV, [0, 1.6, 0], null, 0, setupCtx);
  const car = { pos: [-1, 0, -2, 1, 0, -2, 1, 1, 2, -1, 1, 2], nrm: [], col: [], idx: [0, 1, 2] };
  GarageScene.previewMesh("mclaren:a:4", "mclaren:a:4|h", () => car);
  GarageScene.previewMesh("mclaren:b:4", "mclaren:b:4|h", () => car);
  const held = live.size;
  assert.ok(held > 10, "the room, its atlases, the props and two cars are resident: " + held);
  assert.equal(GarageScene.release(), held, "every handle the garage created is freed");
  assert.equal(live.size, 0);
  assert.equal(GarageScene.debug().previewMeshes, 0);
  assert.equal(GarageScene.debug().key, "");
  assert.equal(GarageScene.prepared(TEAM, LIV, null, 0, setupCtx), false, "a released room is not prepared");
  assert.equal(GarageScene.release(), 0, "a second release frees nothing");
  GarageScene.draw(TEAM, LIV, [0, 1.6, 0], null, 0, setupCtx);
  assert.equal(GarageScene.prepared(TEAM, LIV, null, 0, setupCtx), true, "draw() rebuilt it");
  const rebuilt = live.size;
  assert.ok(rebuilt > 0);
  assert.equal(GarageScene.release(), rebuilt, "…and it can be released again");
  assert.equal(live.size, 0);
});
