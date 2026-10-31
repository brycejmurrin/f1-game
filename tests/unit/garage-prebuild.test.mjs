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
import { absSrc } from "../helpers/abs-src.mjs";

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
  vm.runInContext(read("js/garage/prebuild.js"), ctx, { filename: absSrc("js/garage/prebuild.js") });
  return { GP: vm.runInContext("GaragePrebuild", ctx), ctx, logs };
}

const GO = {
  want: "title", kind: "none", state: "menu", setupOpen: false, starting: false, tabHidden: false, headless: false,
  surface: "title", intro: false, saveData: false, phoneHold: false, packSettled: true, worldReady: false, homePainted: false,
  worldWarm: false, warming: false, sheetOpen: false,
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

test("blockers: the title is speculative — Save-Data, the intro and the world all gate it", () => {
  const { GP } = loadModule();
  const why = (patch) => [...GP.blockers({ ...GO, ...patch })];
  assert.deepEqual(why({ saveData: true }), ["save-data"]);
  assert.deepEqual(why({ phoneHold: true }), ["phone-hold"], "phones must not hold ~11 MB idle on the title (PERF item 13)");
  assert.deepEqual(why({ packSettled: false }), [], "pack no longer blocks car/room; frames wait inside run()");
  assert.deepEqual(why({ intro: true }), ["title-intro"]);
  assert.deepEqual(why({ kind: "track" }), ["world-build"], "a circuit Home finishes its own build first");
  assert.deepEqual(why({ kind: "track", worldReady: true }), []);
  assert.deepEqual(why({ kind: "garage" }), ["home-unpainted"], "the Home garage paints before it counts as warm");
  assert.deepEqual(why({ kind: "garage", homePainted: true }), []);
  assert.deepEqual(why({ sheetOpen: true }), ["menu-sheet"], "Settings open over the title must not prebuild (D·IP2)");
});

test("blockers: race settings ignores sheetOpen — RACE! still needs that garage", () => {
  const { GP } = loadModule();
  const settings = { ...GO, want: "settings", surface: "settings", sheetOpen: true };
  assert.deepEqual([...GP.blockers(settings)], [], "pmsettings over race-settings is not a title-speculative gate");
});

test("blockers: race settings keeps its old gates — RACE! needs that garage", () => {
  const { GP } = loadModule();
  const settings = { ...GO, want: "settings", surface: "settings", saveData: true, packSettled: false, intro: true };
  assert.deepEqual([...GP.blockers(settings)], []);
  assert.deepEqual([...GP.blockers({ ...settings, surface: "title" })], ["surface"]);
});

test("blockers: race settings ignores phoneHold — RACE! still needs that garage on phones", () => {
  const { GP } = loadModule();
  const settings = { ...GO, want: "settings", surface: "settings", phoneHold: true };
  assert.deepEqual([...GP.blockers(settings)], [], "desktop-unchanged: settings prewarm still runs on a phone");
});

test("phoneHold: mobile tier / isMobile / low deviceMemory; desktop stays clear", () => {
  const { GP } = loadModule();
  assert.equal(GP.phoneHold(null, null), false);
  assert.equal(GP.phoneHold({}, null), false, "no deviceMemory and no gfx hint = desktop");
  assert.equal(GP.phoneHold({ deviceMemory: 8 }, null), false);
  assert.equal(GP.phoneHold({ deviceMemory: 2 }, null), true, "deviceMemory < 4 GB");
  assert.equal(GP.phoneHold({ deviceMemory: 0 }, null), false, "0 is unsupported / unknown");
  assert.equal(GP.phoneHold({}, { isMobile: true }), true);
  assert.equal(GP.phoneHold({}, { mobileTier: true }), true);
  assert.equal(GP.phoneHold({}, { isMobile: false, mobileTier: false }), false);
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
// `timers`: when an array, setTimeout pushes the callback so a test can fire tick().
function page({ kind = "none", painted = true, surface = "title", worldWarm = 0, quiet = true, listeners = null, timers = null } = {}) {
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
    setTimeout: timers ? (fn) => { timers.push(fn); return timers.length; } : () => 0,
    clearTimeout() {},
    ...(listeners ? { addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); } } : {}),
    Assets: { state: () => ({ supported: true, uploaded: true }) },
  });
  const deps = {
    gate, setupCam: cam, ui: () => ({ state: () => home }), studio: () => null, worldReady: () => true,
    menuIdle: async (current) => current(),
    menuSlice: () => new Promise((r) => slices.push(r)),
  };
  const pre = GP.create(G, deps);
  pre.state();                   // the quiet clock starts at its first read (the first title poll)
  if (quiet) t += GP.QUIET_MS;   // the title has sat untouched long enough (QUIET_MS); quiet:false starts at the wire
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

test("spent hidden frames do not sit until the give-up when nothing is compiling", async () => {
  const h = page();
  const done = h.pre.run(owned(h), "title");
  await h.flush(3);
  assert.equal(h.gate.garageWarm, 2, "the frames are armed and the wait has started");
  h.gate.garageWarm = 0;   // render consumed both; neither present painted
  h.advance(50);
  await h.flush();
  const last = h.pre.state().last;
  assert.equal(await done, false);
  assert.equal(last.result, "pending");
  assert.ok(last.frameMs < 1000, `frame wait was ${last.frameMs} ms, not GIVE_UP_MS`);
});

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

test("phoneHold: title skips / releases on mobile; desktop and settings keep the prebuild", async () => {
  // Mobile stub: title speculative run is blocked (PERF item 13 — ~11 MB not held).
  const mobile = page();
  mobile.G.gfx.isMobile = true;
  assert.equal(await mobile.pre.run(owned(mobile), "title"), false);
  assert.deepEqual(mobile.built, []);
  assert.deepEqual([...mobile.pre.state().blockers], ["phone-hold"]);
  // Race settings still builds on a phone — RACE! needs that garage.
  mobile.els["race-settings"].hidden = false; mobile.els.overlay.hidden = true;
  const settings = mobile.pre.run(owned(mobile), "settings");
  await mobile.flush(2); mobile.gate.garageReady = true; await mobile.flush();
  assert.equal(await settings, true);
  assert.deepEqual(mobile.built, ["car", "room"]);

  // Low deviceMemory on the title is the same gate; desktop (no hint) still builds.
  const lowMem = page();
  lowMem.ctx.navigator = { deviceMemory: 2 };
  assert.equal(await lowMem.pre.run(owned(lowMem), "title"), false);
  assert.deepEqual([...lowMem.pre.state().blockers], ["phone-hold"]);
  const desk = page();
  const deskGo = desk.pre.run(owned(desk), "title");
  await desk.flush(2); desk.gate.garageReady = true; await desk.flush();
  assert.equal(await deskGo, true, "desktop behaviour unchanged");
  assert.deepEqual(desk.built, ["car", "room"]);

  // Idle title tick on a phone releases a held prebuild (e.g. after leaving settings).
  const timers = [];
  const hold = page({ timers });
  const built = hold.pre.run(owned(hold), "title");
  await hold.flush(2); hold.gate.garageReady = true; await hold.flush();
  assert.equal(await built, true);
  assert.equal(hold.pre.state().ready, true);
  hold.G.gfx.isMobile = true;
  hold.pre.start();
  assert.ok(timers.length >= 1, "start() arms the title poll");
  timers.shift()();
  assert.equal(hold.cam.released, 1, "phone idle tick frees the held garage");
  assert.equal(hold.gate.garageReady, false);
  assert.equal(hold.gate.garageKey, "");
  assert.equal(hold.pre.state().ready, false);
  assert.ok(hold.logs.includes("game: garage released for the race"));
});

test("the title poll does no work during a race; back on the title the quiet clock restarts (perf hunt 9)", async () => {
  const timers = [];
  const h = page({ timers });
  let reads = 0;
  for (const id of ["overlay", "race-settings"]) {   // create() bound G.$ already: count the element lookups it makes
    const el = h.els[id];
    Object.defineProperty(h.els, id, { get: () => { reads++; return el; } });
  }
  h.G.state = "race";
  h.pre.start();
  for (let i = 0; i < 60; i++) { h.advance(1000); timers.shift()(); }
  assert.equal(reads, 0, "60 s of race ticks read no DOM");
  assert.equal(timers.length, 1, "the poll stays armed for the return to the menu");
  h.G.state = "menu";
  timers.shift()();
  assert.ok(reads > 0, "the title poll works again on the menu");
  assert.deepEqual(h.built, [], "the first menu tick after a race is not quiet: no prebuild yet");
  assert.ok([...h.pre.state().blockers].includes("input-recent"), "the quiet clock restarted at the return");
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

test("car and room build while the pack is still uploading; frames wait for packSettled", async () => {
  const h = page();
  let pack = { supported: true, uploaded: false, error: null, tier: null };
  h.ctx.Assets = { state: () => pack };
  const done = h.pre.run(owned(h), "title");
  await h.flush(2);
  assert.deepEqual(h.built, ["car", "room"], "CPU steps do not wait on the pack");
  assert.equal(h.gate.garageWarm, 0, "frames stay unarmed until the pack settles");
  assert.equal(h.warms(), 0);
  pack = { supported: true, uploaded: true, error: null, tier: "high" };
  await h.flush(2);
  assert.equal(h.warms(), 1, "one warm once the pack is up");
  assert.equal(h.gate.garageWarm, 2);
  h.gate.garageWarm = 0; h.gate.garageReady = true;
  await h.flush();
  assert.equal(await done, true);
  assert.equal(h.pre.state().last.result, "ready");
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
  assert.match(game, /function openGarage\(from\) \{\n  loadingScreen\.stop\(\); garagePre\.markOpen\(from\);/, "the clock starts at the tap");
  assert.match(game, /garagePre\.start\(\);/, "the title poll is armed at boot");
  const openAt = game.indexOf("function openGarage(from)");
  const open = game.slice(openAt, game.indexOf("$(\"mb-garage\").onclick", openAt));
  assert.match(open, /resetSetupCam\(\);[\s\S]*else vt\(enterGarage\);/,
    "openGarage resets the camera before vt(enterGarage); endHome lets renderHome yield");
  assert.match(open, /renderSetupPreview\(0\)/,
    "enterGarage draws one bay frame on entry so vt/rAF cannot leave #game black");
  assert.doesNotMatch(open, /setupPreviewOn\s*=\s*true/,
    "openGarage must not touch game.js setupPreviewOn (openSetup owns that claim)");
});

// ── the real room: GarageScene.prepare() is the rebuild draw() runs first ──
function sceneHarness(textures = false, { crew = false } = {}) {
  const made = [], live = new Set(), handles = [], freed = [];
  const mk = (kind, extra) => { made.push(kind); const h = { id: made.length, ...extra }; live.add(h); handles.push(h); return h; };
  const gfx = {
    createMesh() { return mk("mesh"); },
    createTexMesh() { return mk("tex", { tex: true }); },
    freeMesh(h) { freed.push(h); live.delete(h); }, freeTexture(h) { freed.push(h); live.delete(h); }, createTexture() { return mk("texture"); },
    draw() {}, drawDecal() {}, drawGlow() {},
  };
  const c2d = new Proxy(function () {}, {
    get: (_, k) => k === Symbol.toPrimitive ? () => 0 : c2d, set: () => true, apply: () => c2d,
  });
  const ctx = vm.createContext({
    ...(textures ? { LiveryTex: {}, document: { createElement: () => ({ getContext: () => c2d }) } } : {}),
    console, Math, Object, Array, Number, String, JSON, Float32Array, Uint16Array, Uint32Array, isFinite, parseFloat, parseInt, Date,
    Log: { info() {}, warn() {}, error() {}, debug() {}, enabled: () => false },
  });
  for (const f of ["js/track/core/geom.js", "js/track/core/pit.js", "js/garage/scene-prims.js", "js/garage/scene-equipment.js",
                   "js/garage/scene-live.js", "js/garage/scene-dress.js", "js/garage/experience.js",
                   ...(crew ? ["js/garage/crew-draw.js", "js/garage/scene-crew.js"] : []), "js/garage/scene.js"])
    vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  const GarageScene = vm.runInContext("GarageScene", ctx);
  GarageScene.init(gfx);
  // toFixed calls made inside this VM realm (the room-key builders' kc()).
  vm.runInContext("(() => { const P = (0).constructor.prototype, f = P.toFixed; globalThis.__toFixed = 0;"
    + " P.toFixed = function (d) { globalThis.__toFixed++; return f.call(this, d); }; })()", ctx, { filename: "garage-prebuild:toFixed" });
  const countToFixed = () => vm.runInContext("__toFixed", ctx, { filename: "garage-prebuild:count" });
  return { GarageScene, made, live, handles, freed, gfx, countToFixed };
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

test("an unchanged garage frame skips the room-key strings; a paint change still rebuilds (perf hunt 9)", () => {
  const h = sceneHarness(), { GarageScene, made } = h;
  const count = h.countToFixed;   // toFixed calls inside the VM realm: the key builders' kc()
  const setupCtx = { track: { id: "monza" }, weather: "dry", tod: "default", night: false,
                     achievements: { active: true, facility: 2, wins: 1, podiums: 3, titles: 0 } };
  const liv = { c1: [0.95, 0.45, 0.05], c2: [0.05, 0.05, 0.06], accent: [0.1, 0.7, 0.9] };
  GarageScene.draw(TEAM, liv, [0, 1.6, 0], null, 0, setupCtx);
  const meshes = () => made.filter((m) => m === "mesh").length, built = meshes();
  const t0 = count();
  for (let i = 0; i < 100; i++) GarageScene.draw(TEAM, liv, [0, 1.6, 0], null, 0, { ...setupCtx, sceneNow: i });
  assert.equal(count() - t0, 0, "100 unchanged frames build no key strings");
  assert.equal(meshes(), built, "and rebuild nothing");
  liv.c1 = [0.10, 0.45, 0.95];
  GarageScene.draw(TEAM, liv, [0, 1.6, 0], null, 0, setupCtx);
  assert.ok(meshes() > built, "a new liv.c1 rebuilds the room");
  const rebuilt = meshes();
  liv.c1[0] = 0.5;   // an in-place edit is caught too
  GarageScene.draw(TEAM, liv, [0, 1.6, 0], null, 0, setupCtx);
  assert.ok(meshes() > rebuilt, "an in-place liv.c1 edit rebuilds the room");
  const again = meshes();
  setupCtx.achievements = { ...setupCtx.achievements, facility: 6 };
  GarageScene.draw(TEAM, liv, [0, 1.6, 0], null, 0, setupCtx);
  assert.ok(meshes() > again, "a career facility change rebuilds the room");
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

test("a denied global storage getter keeps GaragePrebuild.create on its default", () => {
  const { GP, ctx } = loadModule();
  vm.runInContext('Object.defineProperty(globalThis, "localStorage", { get() { throw Object.assign(new Error("blocked"), { name: "SecurityError" }); } });', ctx);
  assert.throws(() => vm.runInContext("typeof localStorage", ctx), { name: "SecurityError" });
  const pre = GP.create({ $: () => null }, {
    gate: {}, setupCam: {}, ui: () => null, studio: () => false,
  });
  assert.equal(pre.setEnabled(), true, "blocked storage uses the shipped prewarm default");
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

test("a released frameless title rebuilds its actual room before reporting ready", async () => {
  const h = page({ kind: "track" });
  const { GarageScene: room } = sceneHarness();
  const setupCtx = { track: { id: "monza" }, weather: "dry", tod: "default", night: false };
  const build = h.cam.prebuild, release = h.cam.release;
  h.cam.prebuild = (part) => {
    const ok = build(part);
    return part === "room" ? room.prepare(TEAM, LIV, null, 0, setupCtx) : ok;
  };
  h.cam.roomReady = () => room.prepared(TEAM, LIV, null, 0, setupCtx);
  h.cam.release = () => { if (!release()) return false; room.release(); return true; };
  const go = async () => { const pending = h.pre.run(owned(h), "title"); await h.flush(2); return pending; };
  assert.equal(await go(), true);
  assert.equal(h.pre.state().room, true);
  h.G.setupPreviewOn = true;
  assert.equal(h.pre.release(), false, "a visible garage retains its caches");
  assert.equal(h.pre.state().prepped, true);
  assert.equal(h.pre.state().room, true);
  h.G.setupPreviewOn = false;
  h.G.state = "count";
  assert.equal(h.pre.release(), true);
  assert.equal(h.pre.state().room, false);
  assert.equal(await h.pre.run(owned(h), "title"), false, "race entry never rebuilds the room");
  h.G.state = "menu";
  assert.equal(await go(), true);
  assert.deepEqual(h.built, ["car", "room"], "same-key return prepares the released car and room");
  assert.equal(h.pre.state().room, true, "ready means the actual room exists");
  assert.equal(h.pre.state().ready, true);
  assert.equal(h.warms(), 0, "the track Home never requests hidden program frames");
  assert.equal(await go(), false, "a live prepared room is retained on repeated polls");
  assert.deepEqual(h.built, ["car", "room"]);
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

test("garage release frees arrival crew meshes once and the next arrival rebuilds them", () => {
  const h = sceneHarness(false, { crew: true }), garage = h.GarageScene;
  const context = { ambient: false }, eye = [0, 1.6, 0];
  const pose = { door: 0.5, x: 0, z: 0 };
  garage.prepare(TEAM, LIV, null, 0, context);
  const beforeArrival = h.handles.length;
  garage.draw(TEAM, LIV, eye, null, 0, context, null, pose);
  const crew = h.handles.slice(beforeArrival);
  assert.equal(crew.length, 3, "the real arrival crew creates two figures and its pole");
  for (const mesh of crew) assert.equal(h.live.has(mesh), true);
  const afterArrival = h.handles.length;
  garage.draw(TEAM, LIV, eye, null, 0, context, null, pose);
  assert.equal(h.handles.length, afterArrival, "unchanged crew reuse their meshes");

  const liveBeforeRelease = h.live.size;
  assert.equal(garage.release(), liveBeforeRelease, "release reports room and crew handles");
  assert.equal(h.live.size, 0, "crew ownership ends with the room at race start");
  for (const mesh of crew) assert.equal(h.freed.filter((m) => m === mesh).length, 1);
  const freed = h.freed.length;
  assert.equal(garage.release(), 0);
  assert.equal(h.freed.length, freed, "releasing twice does not double-free crew");

  garage.prepare(TEAM, LIV, null, 0, context);
  const beforeNextArrival = h.handles.length;
  garage.draw(TEAM, LIV, eye, null, 0, context, null, pose);
  const rebuiltCrew = h.handles.slice(beforeNextArrival);
  assert.equal(rebuiltCrew.length, 3, "the same paint still rebuilds released crew on the next visit");
  for (const mesh of rebuiltCrew) {
    assert.equal(h.live.has(mesh), true);
    assert.equal(crew.includes(mesh), false, "no disposed crew handle is reused");
  }
  garage.release();
  assert.equal(h.live.size, 0);
  for (const mesh of rebuiltCrew) assert.equal(h.freed.filter((m) => m === mesh).length, 1);
});


test("paint and context changes retain the invariant truss and dress meshes until release", () => {
  const h = sceneHarness(true), garage = h.GarageScene;
  const context = { track: { id: "monza" }, weather: "dry", night: false };
  garage.prepare(TEAM, LIV, null, 0, context);
  // rebuild creates the shell then the truss; every tex-mesh is fixed wall UV geometry.
  const truss = h.handles[1], tex = h.handles.filter((m) => m.tex);
  assert.ok(tex.length > 4, "both live and dress quad meshes must have uploaded");
  const initialMeshCount = h.made.filter((k) => k === "mesh").length;
  for (let i = 0; i < 20; i++) {
    const team = { ...TEAM, id: i % 2 ? "ferrari" : TEAM.id };
    garage.prepare(team, { ...LIV, c1: [i / 20, 0.5, 0.7] }, null, 0,
      { ...context, night: !!(i % 2), weather: i % 2 ? "rain" : "dry" });
  }
  assert.ok(h.made.filter((k) => k === "mesh").length > initialMeshCount, "paint-dependent geometry must repaint");
  assert.equal(h.made.filter((k) => k === "tex").length, tex.length, "colour, team and context edits allocate no new wall quad meshes");
  for (const handle of [truss, ...tex]) {
    assert.equal(h.live.has(handle), true);
    assert.equal(h.freed.includes(handle), false, "invariant geometry stays with its renderer");
  }
  garage.release();
  assert.equal(h.live.size, 0);
  for (const handle of [truss, ...tex]) assert.equal(h.freed.filter((h) => h === handle).length, 1);
  garage.prepare(TEAM, LIV, null, 0, context);
  assert.equal(garage.prepared(TEAM, LIV, null, 0, context), true);
  assert.equal(h.made.filter((k) => k === "tex").length, tex.length * 2, "release makes the next prepare rebuild the UV meshes");
  garage.release(); assert.equal(h.live.size, 0);
});

test("renderer replacement releases garage resources through their original owner", () => {
  const h = sceneHarness(true, { crew: true }), garage = h.GarageScene;
  garage.prepare(TEAM, LIV, null, 0, {});
  const prepared = h.live.size;
  garage.draw(TEAM, LIV, [0, 1.6, 0], null, 0, { ambient: false }, {});
  assert.equal(h.live.size, prepared + 1, "drawing a car creates its floor-reflection fade mesh");
  const beforeArrival = h.handles.length;
  garage.draw(TEAM, LIV, [0, 1.6, 0], null, 0, { ambient: false }, {}, { door: 0.5, x: 0, z: 0 });
  const crew = h.handles.slice(beforeArrival);
  assert.equal(crew.length, 3, "the arrival creates its two figure meshes and pole");
  for (const mesh of crew) assert.equal(h.live.has(mesh), true);
  const held = h.live.size;
  const freed = h.freed.length;
  garage.init(h.gfx);
  assert.equal(h.live.size, held, "reinitializing the same renderer retains its caches");
  assert.equal(h.freed.length, freed, "same-renderer reinit frees neither room nor crew");
  const newCalls = [];
  garage.init({ freeMesh: (h) => newCalls.push(h), freeTexture: (h) => newCalls.push(h) });
  assert.equal(h.live.size, 0, "the old renderer freed every owned resource before replacement");
  for (const mesh of crew) assert.equal(h.freed.filter((m) => m === mesh).length, 1,
    "room release and crew reinit free each crew handle exactly once through its original renderer");
  assert.deepEqual(newCalls, [], "old handles never reach the new renderer");
  assert.equal(garage.prepared(TEAM, LIV, null, 0, {}), false);
});

// THE QUIET GATE (B-H8 2026-10-21): the title prebuild is one 1.0-1.5 s task at 4x CPU, and started at the
// first idle after the title wired it sat where the first tap lands (a RACE tap waited 1.2-3.5 s). It waits for
// QUIET_MS of no input on a visible title; input resets the clock and abandons a sequence in flight.
test("quiet gate: the title prebuild waits QUIET_MS after the title shows, and any input restarts the wait", async () => {
  const listeners = {};
  const h = page({ quiet: false, listeners });
  for (const ev of ["pointerdown", "keydown", "wheel", "touchstart", "visibilitychange"]) assert.ok(listeners[ev], ev + " resets the quiet clock");
  assert.deepEqual([...h.pre.state().blockers], ["input-recent"], "a title that just wired is not quiet");
  h.advance(h.GP.QUIET_MS - 1);
  assert.deepEqual([...h.pre.state().blockers], ["input-recent"]);
  listeners.pointerdown[0]();
  h.advance(h.GP.QUIET_MS - 1);
  assert.deepEqual([...h.pre.state().blockers], ["input-recent"], "a tap restarts the wait");
  h.advance(1);
  assert.deepEqual([...h.pre.state().blockers], [], "QUIET_MS untouched: go");
  assert.deepEqual([...h.GP.blockers({ ...GO, quietMs: 0, want: "settings", surface: "settings" })], [], "race settings never waits on quiet");
});

test("quiet gate: input mid-sequence abandons the rest of a title prebuild, and it never starts on the input", async () => {
  const listeners = {};
  const h = page({ listeners });
  const titleOwned = () => owned(h)() && h.pre.state().blockers.length === 0;
  const done = h.pre.run(titleOwned, "title");
  await h.flush(0);
  assert.deepEqual(h.built, ["car"]);
  listeners.keydown[0]();
  await h.flush(2);
  assert.equal(await done, false, "superseded by the input");
  assert.deepEqual(h.built, ["car"], "no room after the input");
  assert.equal(await h.pre.run(titleOwned, "title"), false, "the input's own moment starts nothing");
  assert.deepEqual(h.built, ["car"]);
});

function exteriorHarness({ load, geometry, upload, surfaceHeight } = {}) {
  const uploads = [], freed = [], draws = [], changes = [];
  let now = 10000, builds = 0;
  const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
  const context = vm.createContext({ Date: { now: () => now }, setTimeout,
    GarageExteriorGeometry: { sampleHeight: surfaceHeight, *buildSteps(def, opts) {
      builds++; yield;
      if (geometry) return geometry(def, opts);
      const geo = () => ({pos:[0,0,7,1,0,7,0,1,7], nrm:[0,1,0,0,1,0,0,1,0],col:[1,1,1,1,1,1,1,1,1],idx:[0,1,2]});
      return {ground:geo(),road:geo(),props:geo(),stats:{trackId:def.id},anchor:{s:0}};
    } } });
  vm.runInContext(read('js/garage/exterior.js'), context, {filename:absSrc('js/garage/exterior.js')});
  const API = vm.runInContext('GarageExterior', context);
  const freedSet = new Set();
  const gfx = {createMesh(data) { const mesh={data,id:uploads.length}; uploads.push(mesh); if (upload) upload(mesh); return mesh; },
    freeMesh(mesh) { assert.equal(freedSet.has(mesh),false,'owned handle freed exactly once'); freedSet.add(mesh); freed.push(mesh); },
    draw(mesh,matrix,opts) { draws.push({mesh,matrix:Array.from(matrix),opts:{...opts}}); }};
  const ext = API.create({gfx,load:load || (async s => ({id:s.trackId})),yieldTask:()=>Promise.resolve(),onChange:s=>changes.push(s)});
  const selection = (id='a', weather='dry', tod='day') => ({trackId:id,teamId:'team',weather,tod});
  return {API,ext,selection,uploads,freed,draws,changes,deferred,builds:()=>builds,advance:ms=>{now+=ms;}};
}

test('exterior coalesces work, owns its meshes, and updates weather without rebuilding geometry', async () => {
  const h=exteriorHarness(), a=h.selection(), wet=h.selection('a','wet');
  const first=h.ext.request(a), same=h.ext.request(a);
  assert.equal(first,same); assert.equal(await first,true);
  assert.equal(h.uploads.length,3); assert.equal(h.ext.ready(a),true);
  assert.equal(h.ext.draw(),true); assert.equal(h.draws[1].opts.roughness,.85);
  assert.equal(await h.ext.request(wet),true); assert.equal(h.builds(),1);
  assert.equal(h.ext.ready(a),false); assert.equal(h.ext.ready(wet),true);
  h.ext.draw(); assert.equal(h.draws[4].opts.roughness,.24);
  h.ext.release(); assert.equal(h.freed.length,3); assert.equal(h.ext.draw(),false);
});

test('exterior owns terrain, scenery, tagged lights, glass and water across draws, weather and release', async () => {
  const geo = () => ({ pos: [0,0,7,1,0,7,0,1,7], nrm: [0,1,0,0,1,0,0,1,0], col: [1,1,1,1,1,1,1,1,1], idx: [0,1,2] });
  const h = exteriorHarness({ geometry: () => Object.fromEntries(['ground','terrain','road','props','scenery','sceneryLights','glass','water'].map(k => [k, geo()])) });
  assert.equal(await h.ext.request(h.selection()), true); assert.equal(h.uploads.length, 8);
  h.ext.draw(); assert.equal(h.draws.length, 8);
  assert.equal(h.draws[6].opts.clearcoat, 1); assert.equal(h.draws[7].opts.roughness, .10);
  assert.equal(h.draws[5].opts.emissive, 0, 'daylight light faces remain ordinarily lit');
  assert.equal(await h.ext.request(h.selection('a', 'wet')), true); assert.equal(h.builds(), 1);
  h.ext.draw(); assert.equal(h.draws[15].opts.roughness, .16);
  assert.equal(await h.ext.request(h.selection('a', 'wet', 'night')), true);
  h.ext.draw(); assert.equal(h.draws[19].opts.emissive, 0, 'pit frontage keeps its local lamp rig');
  assert.equal(h.draws[20].opts.emissive, 0, 'ordinary architecture cannot become a glowing white slab');
  assert.equal(h.draws[21].opts.emissive, .78, 'only authored light-source faces receive night emission');
  h.ext.release(); assert.equal(h.freed.length, 16);
});

test('scenery-authored atmosphere uses its owned palette without changing the selected circuit', async () => {
  const palette = { zenith: [.42,.48,.52], fogDensity: .0032 };
  const geo = () => ({ pos: [0,0,7,1,0,7,0,1,7] });
  const h = exteriorHarness({ geometry: () => ({ ground: geo(), road: geo(), props: geo(), palette }) });
  const def = { id: 'a', pal: { zenith: [.1,.2,.3], fogDensity: .001 } };
  assert.equal(await h.ext.request({ ...h.selection(), def }), true);
  const lit = h.ext.lighting();
  assert.deepEqual(Array.from(lit.sky.zenith), palette.zenith); assert.equal(lit.fogDensity, .0032);
  assert.deepEqual(def.pal.zenith, [.1,.2,.3]); assert.equal(def.pal.fogDensity, .001);
});

test('exterior replacement cancels a suspended load without blocking the new selected circuit', async () => {
  let settleOld;
  const old=new Promise(resolve=>{settleOld=resolve;});
  const h=exteriorHarness({load:s=>s.trackId==='a'?old:Promise.resolve({id:s.trackId})});
  const first=h.ext.request(h.selection()); await Promise.resolve();
  const next=h.ext.request(h.selection('b'));
  assert.equal(h.ext.ready(),false); assert.equal(await first,false); assert.equal(await next,true);
  settleOld({id:'a'}); await Promise.resolve();
  assert.equal(h.ext.state().trackId,'b'); assert.equal(h.uploads.length,3);
  const replacement=h.ext.request(h.selection('c'));
  assert.equal(h.ext.draw(),false,'old world is never displayed as the new selection');
  assert.equal(h.freed.length,3); assert.equal(await replacement,true);
});

test('exterior appearance updates during preparation publish only the latest selection', async () => {
  let resolve;
  const pending=new Promise(r=>{resolve=r;});
  const h=exteriorHarness({load:()=>pending});
  const a=h.ext.request(h.selection()); await Promise.resolve();
  const wet=h.selection('a','storm'); const b=h.ext.request(wet);
  assert.equal(a,b); resolve({id:'a'}); assert.equal(await a,true);
  assert.equal(h.ext.ready(wet),true); assert.equal(h.builds(),1);
  h.ext.draw(); assert.equal(h.draws[1].opts.roughness,.24);
});

test('exterior cancellation after upload frees partial handles and never publishes them', async () => {
  let h;
  h=exteriorHarness({upload:()=>h.ext.cancel()});
  assert.equal(await h.ext.request(h.selection()),false);
  assert.equal(h.ext.state().status,'idle'); assert.equal(h.uploads.length,1); assert.equal(h.freed.length,1);
  assert.equal(h.ext.ready(),false);
});

test('exterior failures require explicit bounded retries and unsupported bays stay optional', async () => {
  let loads=0;
  const h=exteriorHarness({load:async()=>{loads++; throw new Error('offline');}}), s=h.selection();
  assert.equal(await h.ext.request(s),false); assert.equal(h.ext.state().status,'failed');
  for(let i=0;i<5;i++) assert.equal(await h.ext.request(s),false);
  assert.equal(await h.ext.retry(s),false); assert.equal(loads,1,'backoff prevents immediate retries');
  h.advance(1001); assert.equal(await h.ext.retry(s),false); assert.equal(loads,2);
  h.advance(1001); assert.equal(await h.ext.retry(s),false); assert.equal(loads,2,'two attempts maximum for selected geometry');
  const missing=exteriorHarness({geometry:()=>({supported:false,reason:'no real bay'})});
  assert.equal(await missing.ext.request(missing.selection()),false);
  assert.equal(missing.ext.state().status,'unsupported'); assert.equal(missing.uploads.length,0);
});

test('exterior rejects mismatched loads and invalid geometry, releasing prior partial uploads', async () => {
  const mismatch=exteriorHarness({load:async()=>({id:'wrong'})});
  assert.equal(await mismatch.ext.request(mismatch.selection()),false); assert.equal(mismatch.uploads.length,0);
  const h=exteriorHarness({geometry:()=>({ground:{pos:[0,0,7]},road:{pos:[NaN]},props:{pos:[]}})});
  assert.equal(await h.ext.request(h.selection()),false); assert.equal(h.freed.length,1); assert.equal(h.ext.ready(),false);
});

test('exterior lighting resolves owned day/night/weather inputs without changing circuit palettes', () => {
  const h=exteriorHarness(), palette={sunDir:[.2,.8,.4],sunColor:[1,.9,.8],ambientSky:[.4,.5,.6],ambientGround:[.2,.2,.2],zenith:[.2,.3,.5],horizon:[.5,.6,.7],fog:[.5,.5,.5],fogDensity:.001};
  const before=JSON.stringify(palette), def={id:'a',palette,night:true};
  const day=h.API.lighting({...h.selection(),def});
  const night=h.API.lighting({...h.selection('a','dry','default'),def});
  const rain=h.API.lighting({...h.selection('a','rain'),def});
  const fog=h.API.lighting({...h.selection('a','fog'),def});
  assert.equal(day.night,false); assert.equal(night.night,true); assert.equal(rain.wet,true);
  assert.ok(night.sunColor[0]<day.sunColor[0]); assert.ok(fog.fogDensity>rain.fogDensity);
  assert.equal(h.API.lighting({...h.selection('a','dry','dawn'),def}).sky.stars,0);
  day.sunColor[0]=99; day.sky.horizon[0]=99;
  assert.equal(JSON.stringify(palette),before);
});

test('exterior lighting consumes real circuit pal fields and keeps palette compatibility', () => {
  const h=exteriorHarness(), pal={sunColor:[.91,.72,.53],ambientSky:[.43,.34,.25],ambientGround:[.13,.14,.15],zenith:[.03,.04,.05],horizon:[.23,.24,.25],fogColor:[.33,.34,.35],fogDensity:.0023};
  const selected={...h.selection(),def:{id:'a',pal}};
  const value=h.API.lighting(selected);
  assert.deepEqual([...value.sunColor],pal.sunColor); assert.deepEqual([...value.ambientSky],pal.ambientSky);
  assert.deepEqual([...value.sky.zenith],pal.zenith); assert.deepEqual([...value.fogColor],pal.fogColor);
  assert.equal(value.fogDensity,pal.fogDensity);
  const fallback=h.API.lighting({...selected,def:{id:'a',palette:pal}});
  assert.deepEqual([...fallback.sunColor],pal.sunColor);
  value.fogColor[0]=0; assert.equal(pal.fogColor[0],.33);
});

test('exterior rain stays outside the bay, owns a bounded mesh and uses transform-only motion', async () => {
  const h=exteriorHarness(), rainy=h.selection('a','rain');
  await h.ext.request(rainy);
  assert.equal(h.ext.state().weather,'rain'); assert.equal(h.ext.state().rain,true);
  assert.equal(h.uploads.length,4);
  const data=h.uploads[3].data;
  assert.ok(data.idx.length/6<=96);
  for(let i=2;i<data.pos.length;i+=3) assert.ok(data.pos[i]>=6.82,'rain never enters dry service box');
  assert.equal(h.ext.drawWeather(100,false),true); assert.equal(h.ext.drawWeather(200,false),true);
  assert.notEqual(h.draws[0].matrix[13],h.draws[1].matrix[13]);
  assert.equal(h.ext.drawWeather(.3,true),true); assert.equal(h.ext.drawWeather(12,true),true);
  assert.deepEqual(h.draws[2].matrix,h.draws[3].matrix,'reduced motion holds the weather');
  assert.equal(h.uploads.length,4,'animation creates no geometry');
  assert.ok(h.draws[0].opts.alpha>0&&h.draws[0].opts.alpha<1);
  await h.ext.request(h.selection('a','storm')); assert.equal(h.uploads.length,4,'storm shares static precipitation');
  assert.equal(h.ext.state().weather,'storm');
  await h.ext.request(h.selection('a','wet'));
  assert.equal(h.ext.drawWeather(2,false),false,'wet road alone has no falling rain');
  assert.equal(h.freed.length,1,'appearance change releases rain only');
  await h.ext.request(rainy); assert.equal(h.uploads.length,5);
  h.ext.cancel(); assert.equal(h.freed.length,5,'all exterior and rain resources released once');
  assert.equal(h.ext.drawWeather(3,false),false);
});

test('exterior fitPose mirrors every sequence and preserves caller camera vector identity', () => {
  const h=exteriorHarness(), eye=[-3,2,5], aim=[1,.6,8];
  const pose={side:1,x:2,z:10,yaw:.3,eye,aim};
  assert.equal(h.API.fitPose(pose,{side:-1},false),pose);
  assert.equal(pose.side,-1); assert.equal(pose.x,-2); assert.equal(pose.yaw,-.3);
  assert.equal(pose.z,10); assert.equal(pose.eye,eye); assert.equal(pose.aim,aim);
  assert.deepEqual(eye,[3,2,5]); assert.deepEqual(aim,[-1,.6,8]);
  h.API.fitPose(pose,{side:-1},false); assert.equal(pose.x,-2,'matching side is stable');
});

test('authored exterior CUT clears actual standard, Monaco and left-side pit walls over 10001 swept poses each', () => {
  const h=exteriorHarness(), c=vm.createContext({});
  vm.runInContext(read('js/data/garage-departure-motion.js'),c,{filename:absSrc('js/data/garage-departure-motion.js')});
  const Motion=vm.runInContext('GarageDepartureMotion',c);
  const fixtures=[
    {name:'standard',side:1,bands:{work:5.5,corridor:1,fast:3.5}},
    {name:'Monaco',side:1,bands:{work:4.2,corridor:1,fast:3.2}},
    {name:'left-side',side:-1,bands:{work:4.2,corridor:1,fast:3.2}},
  ];
  for(const fixture of fixtures) {
    const anchor={...fixture,door:{z:6.4,width:5.4}}, wall=6.4+fixture.bands.work+fixture.bands.corridor+fixture.bands.fast;
    let prior=null, largestStep=0;
    for(let i=0;i<=10000;i++) {
      const pose={eye:[0,0,0],aim:[0,0,0]}; Motion.sample(i/10000,1,pose); pose.side=1;
      const eye=pose.eye,aim=pose.aim;
      h.API.fitPose(pose,anchor,true);
      assert.equal(pose.exteriorUnsupported,false,fixture.name+' supports a safe radius');
      assert.equal(pose.eye,eye); assert.equal(pose.aim,aim);
      assert.ok([...eye,...aim,pose.x,pose.z,pose.yaw].every(Number.isFinite));
      const si=Math.sin(pose.yaw),co=Math.cos(pose.yaw);
      const corners=[[-.95,-2.69],[.95,-2.69],[.95,3.18],[-.95,3.18]].map(([x,z])=>[pose.x+x*co+z*si,pose.z-x*si+z*co]);
      for(const corner of corners) assert.ok(corner[1]<=wall-.2998,fixture.name+' far-wall clearance at '+i);
      for(let edge=0;edge<4;edge++) {
        const a=corners[edge],b=corners[(edge+1)%4];
        if((a[1]-6.4)*(b[1]-6.4)<=0&&Math.abs(b[1]-a[1])>1e-10) {
          const x=a[0]+(b[0]-a[0])*(6.4-a[1])/(b[1]-a[1]);
          assert.ok(Math.abs(x)<=2.7-.01,fixture.name+' doorway clearance at '+i);
        }
      }
      if(prior) largestStep=Math.max(largestStep,Math.hypot(pose.x-prior.x,pose.z-prior.z));
      prior={x:pose.x,z:pose.z};
    }
    assert.ok(largestStep<.006,'continuous path through blended correction: '+fixture.name);
  }
});

test('exterior fitPose leaves legacy/tuner paths unadapted and explicitly flags impossible lane bands', () => {
  const h=exteriorHarness(), anchor={side:1,door:{z:6.4},bands:{work:4.2,corridor:1,fast:3.2}};
  const legacy={side:1,x:3.2,z:13,yaw:Math.PI/2,eye:[1,2,3],aim:[4,5,6]};
  const before=JSON.stringify(legacy);
  h.API.fitPose(legacy,anchor,false);
  assert.equal(JSON.stringify({...legacy,exteriorUnsupported:undefined}),before);
  const unsafe={...legacy,eye:[1,2,3],aim:[4,5,6]};
  h.API.fitPose(unsafe,{...anchor,bands:{work:1,corridor:.2,fast:1}},true);
  assert.equal(unsafe.exteriorUnsupported,true);
  const straight={side:1,x:0,z:9.8,yaw:0,eye:[1,2,3],aim:[4,5,6]};
  h.API.fitPose(straight,anchor,true);
  assert.equal(straight.x,0); assert.equal(straight.z,9.8,'no movement correction before steering begins');
});

test('reduced-motion exterior CUT retains its fixed camera over 10001 fitted departure poses per lane side', () => {
  const h=exteriorHarness(), c=vm.createContext({});
  vm.runInContext(read('js/data/garage-departure-motion.js'),c,{filename:absSrc('js/data/garage-departure-motion.js')});
  const Motion=vm.runInContext('GarageDepartureMotion',c);
  for(const side of [1,-1]) {
    const anchor={side,door:{z:6.4},bands:{work:4.2,corridor:1,fast:3.2}};
    let lastZ;
    for(let i=0;i<=10000;i++) {
      const pose={eye:[0,0,0],aim:[0,0,0]}; Motion.sample(i/10000,1,pose);
      pose.side=1; pose.calm=true;
      pose.eye[0]=-3.8; pose.eye[1]=2.1; pose.eye[2]=-4.8;
      pose.aim[0]=0; pose.aim[1]=.8; pose.aim[2]=6.2;
      const eye=pose.eye,aim=pose.aim;
      h.API.fitPose(pose,anchor,true);
      assert.equal(pose.eye,eye); assert.equal(pose.aim,aim);
      assert.deepEqual([...eye],[-3.8*side,2.1,-4.8]);
      assert.deepEqual([...aim].map(v=>v+0),[0,.8,6.2]);
      assert.equal(pose.exteriorUnsupported,false);
      lastZ=pose.z;
    }
    assert.ok(lastZ<13,'car still receives the narrower Monaco radius');
  }
});

test('exterior preparation publishes bounded profiling fields without touching per-frame rendering', async () => {
  const h=exteriorHarness(); await h.ext.request(h.selection());
  const stats=h.ext.state().stats;
  assert.equal(stats.trackId,'a');
  for(const key of ['maxSliceMs','buildWallMs','uploadMs']) assert.ok(Number.isFinite(stats[key])&&stats[key]>=0,key);
  h.ext.draw(); h.ext.draw();
  assert.equal(h.ext.state().stats,stats,'draws retain the preparation record');
});

test('garage road frame keeps four tyre contacts on a sloping plane after either lane direction and turn', () => {
  const plane=(surface,x,z)=>.11+.012*x+.025*z, h=exteriorHarness({surfaceHeight:plane});
  const surface={bounds:[-55,55,6.4,110]};
  for(const yaw of [0,.7,Math.PI/2,-Math.PI/2]) {
    const pose={x:8,z:13,yaw,eye:[2,3,4],aim:[5,1,6]}, eye=pose.eye, aim=pose.aim;
    h.API.groundPose(pose,surface,true);
    const matrix=new Float64Array(16); h.API.poseMatrix(pose,matrix);
    assert.equal(pose.eye,eye); assert.equal(pose.aim,aim);
    assert.ok(Math.abs(eye[1]-3-pose.groundY)<1e-12);
    for(const x of [-.79,.79])for(const z of [-1.6,1.7]) {
      const wx=matrix[0]*x+matrix[8]*z+matrix[12], wy=matrix[1]*x+matrix[9]*z+matrix[13], wz=matrix[2]*x+matrix[10]*z+matrix[14];
      assert.ok(Math.abs(wy-plane(surface,wx,wz))<1e-10,'each contact lies on the actual plane');
    }
    assert.ok(Math.abs(Math.hypot(matrix[0],matrix[1],matrix[2])-1)<1e-12);
    assert.ok(Math.abs(matrix[0]*matrix[4]+matrix[1]*matrix[5]+matrix[2]*matrix[6])<1e-12);
  }
  assert.equal(h.uploads.length,0,'pose fitting builds no meshes');
});

test('ground contact crosses the sill continuously and leaves the reduced-motion camera fixed', () => {
  const h=exteriorHarness({surfaceHeight:(surface,x,z)=>z<6.4?0:.03}), surface={bounds:[-55,55,6.4,110]};
  let prior=0;
  for(let i=0;i<=1000;i++){
    const pose={x:0,z:i*.01,yaw:0,calm:true,eye:[-4,3.2,15.7],aim:[3.5,.65,7]};
    h.API.groundPose(pose,surface,true);
    assert.deepEqual([...pose.eye],[-4,3.2,15.7]);assert.deepEqual([...pose.aim],[3.5,.65,7]);
    assert.ok(Math.abs(pose.groundY-prior)<.001,'no single-frame height step');prior=pose.groundY;
  }
  assert.ok(Math.abs(prior-.03)<1e-12);
});

test('explicit daylight replaces a night circuit default sky without mutating its authored palette', () => {
  const h=exteriorHarness(), def={night:true,palette:{zenith:[.06,.05,.16],horizon:[.2,.1,.05],sunDir:[.76,.21,.61],fogDensity:.0028}};
  const before=JSON.stringify(def);
  const day=h.API.lighting({def,tod:'day',weather:'dry'}), night=h.API.lighting({def,tod:'default',weather:'dry'});
  assert.equal(day.night,false);assert.equal(night.night,true);
  assert.ok(day.sky.horizon[2]>day.sky.horizon[0],'selected day is blue rather than the authored night orange');
  assert.ok(day.sunDir[1]>.6,'daylight key rises above the authored dusk angle');
  assert.equal(day.fogDensity,.0008);assert.equal(JSON.stringify(def),before);
});

test('rainy night keeps the sky shader night gate while hiding stars beneath cloud', () => {
  const h=exteriorHarness(), sky=h.API.lighting({tod:'night',weather:'rain'}).sky;
  assert.equal(sky.stars,1,'uStars selects the shader night branch');
  assert.equal(sky.starBright,0,'cloud hides stars without enabling daylight scattering');
  assert.equal(sky.moon,.85);
});

test('night pit frontage receives lighting without a whole-mesh emissive override', async () => {
  const h=exteriorHarness();await h.ext.request(h.selection('a','rain','night'));h.ext.draw();
  assert.equal(h.draws[2].opts.emissive,0);h.ext.release();
});
