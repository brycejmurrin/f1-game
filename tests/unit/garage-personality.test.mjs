/* THE GARAGE'S PERSONALITY on an arrival and the RACE! drive-out:
 *  - the two team-colour uplights swell as the shutter lifts (GarageScene.live,
 *    ctx.door from setup-camera.js), and only then;
 *  - the engine idles and revs with the car on the way out, started and
 *    stopped by the drive-out itself (sound on only), so the race builds its
 *    own engine graph exactly as before;
 *  - the rain light is on rolling in or out at night or in the wet;
 *  - one team radio line as the car rolls, through the flyby radio check's gates.
 *
 * Run: node --test tests/unit/garage-personality.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function sceneHarness() {
  const gfx = { createMesh: () => ({}), createTexMesh: () => ({}), freeMesh() {}, freeTexture() {},
    createTexture: () => ({}), draw() {}, drawDecal() {}, drawGlow() {} };
  const ctx = vm.createContext({ console, Math, Object, Array, Number, String, JSON, Float32Array, Uint16Array,
    Uint32Array, isFinite, parseFloat, parseInt, Date, Log: { info() {}, warn() {}, error() {}, debug() {}, enabled: () => false } });
  for (const f of ["js/track/core/geom.js", "js/track/core/pit.js", "js/garage/scene-prims.js", "js/garage/scene-equipment.js",
                   "js/garage/scene-live.js", "js/garage/scene-dress.js", "js/garage/experience.js", "js/garage/scene.js"])
    vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  const GarageScene = vm.runInContext("GarageScene", ctx);
  GarageScene.init(gfx);
  return GarageScene;
}
const LIV = { c1: [0.95, 0.45, 0.05], c2: [0.05, 0.05, 0.06], accent: [0.1, 0.7, 0.9] };
/** Total emitted energy of the records whose colour is the team's (c1-proportional). */
function teamEnergy(rig) {
  let e = 0;
  for (let i = 0; i + 14 < rig.length; i += 15) {
    const r = rig[i + 3], g = rig[i + 4], b = rig[i + 5];
    if (r > 0 && Math.abs(g / r - LIV.c1[1] / LIV.c1[0]) < 1e-6 && Math.abs(b / r - LIV.c1[2] / LIV.c1[0]) < 1e-6) e += r + g + b;
  }
  return e;
}

test("the team uplights swell as the shutter lifts, and sit at their usual level otherwise", () => {
  const S = sceneHarness();
  const base = teamEnergy(S.live(LIV, 0, { night: false, ambient: true }).slice());
  const open = teamEnergy(S.live(LIV, 0, { night: false, ambient: true, door: 1 }).slice());
  const mid = teamEnergy(S.live(LIV, 0, { night: false, ambient: true, door: 0.5 }).slice());
  const shut = teamEnergy(S.live(LIV, 0, { night: false, ambient: true, door: 0 }).slice());
  assert.ok(base > 0, "the dado uplights are lit in the team colour");
  assert.ok(Math.abs(open - base) < 1e-9 && Math.abs(shut - base) < 1e-9, "closed or fully open: the usual level");
  assert.ok(mid > base * 2.9 && mid < base * 3.5, `mid-lift: ~3x (${(mid / base).toFixed(2)}x)`);
  const again = teamEnergy(S.live(LIV, 0, { night: false, ambient: true }).slice());
  assert.ok(Math.abs(again - base) < 1e-9, "written in place and restored: no swell leaks into the next frame");
});

function driveOutHarness({ soundOn = true } = {}) {
  const calls = [];
  const GameAudio = new Proxy({}, { get: (_, k) => (...args) => { calls.push([k, ...args]); } });
  let now = 0;
  const c = { Math, Object, Number, String, Array, isFinite, JSON,
    performance: { now: () => now }, GameAudio, Log: { info() {}, warn() {} },
    Teams: { LIST: [{ engine: "v6-test" }] },
    G: { soundOn, teamIdx: 0, store: { get: () => ({ enabled: true, speed: 1 }) } },
    reducedMotion: () => false, endHome() {} };
  vm.createContext(c);
  vm.runInContext(read("js/garage/crew-draw.js"), c, { filename: absSrc("js/garage/crew-draw.js") });
  vm.runInContext(read("js/garage/arrival.js"), c, { filename: absSrc("js/garage/arrival.js") });
  const cam = read("js/garage/setup-camera.js");
  const a = cam.indexOf("let driveOut = null;"), b = cam.indexOf("// THE ARRIVAL PREVIEW", a);
  vm.runInContext(cam.slice(a, b) + "\nglobalThis.__out = { startDriveOut, stepDriveOut, stop() { driveOut = null; driveOutEngine(false); } };", c);
  return { calls, out: c.__out, tick(ms) { now += ms; } };
}

test("the drive-out starts the engine (with the team's voice), revs it with the car, and stops it", () => {
  const h = driveOutHarness();
  assert.ok(h.out.startDriveOut() > 0);
  assert.deepEqual(h.calls.slice(0, 2).map((x) => x[0]), ["setVoice", "startEngine"]);
  assert.equal(h.calls[0][1], "v6-test");
  const revs = [];
  for (let i = 0; i < 120; i++) {
    h.tick(1000 / 12); h.out.stepDriveOut();
    const e = h.calls.filter((x) => x[0] === "setEngine").pop();
    if (e) revs.push(e[1]);
  }
  assert.ok(revs.length > 50, "setEngine every step");
  assert.ok(Math.min(...revs) <= 0.12 + 1e-9, "idles while the shutter lifts");
  assert.ok(Math.max(...revs) > 0.3, "revs once it rolls");
  assert.ok(h.calls.some((x) => x[0] === "setSkid" && x[1] > 0), "a chirp as it pulls away");
  h.out.stop();
  assert.ok(h.calls.some((x) => x[0] === "stopEngine"), "stopDriveOut stops its own engine: the race starts a fresh one");
});

test("sound off: no engine at all", () => {
  const h = driveOutHarness({ soundOn: false });
  h.out.startDriveOut();
  for (let i = 0; i < 20; i++) { h.tick(100); h.out.stepDriveOut(); }
  h.out.stop();
  assert.deepEqual(h.calls, []);
});

test("rain light on rolling in or out at night or in the wet; the ctx carries the door to the scene", () => {
  const cam = read("js/garage/setup-camera.js");
  assert.match(cam, /context\.door = arriving && arriving\.active \? arriving\.door : 1;/);
  assert.match(cam, /if \(arriving && arriving\.active && \(context\.night \|\| \/rain\|wet\|storm\/\.test\(String\(context\.weather \|\| ""\)\)\) && CarMesh\.drawRearLights\)\s*CarMesh\.drawRearLights\(arrivalCar, 1\);/);
  assert.match(cam, /stopDriveOut\(\) \{ driveOut = null; driveOutEngine\(false\); \}/);
});

/** A permissive stub element for the loading screen's paint(). */
function stubEl(extra = {}) {
  const props = { dataset: {}, style: { setProperty() {} }, hidden: true, ...extra };
  return new Proxy(props, { get(t, k) { if (k in t) return t[k]; if (k === Symbol.toPrimitive || k === "then") return undefined; return () => stubEl(); },
    set(t, k, v) { t[k] = v; return true; } });
}
function loadingHarness({ chat = "normal", speaking = false } = {}) {
  const timers = [], said = [], stings = [];
  const els = new Map();
  const $ = (id) => { if (!els.has(id)) els.set(id, stubEl()); return els.get(id); };
  const sb = { Math, JSON, Object, Array, Number, String, isFinite, Date, console,
    setTimeout: (fn, ms) => { timers.push({ fn, ms, live: true }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].live = false; }, setInterval: () => 1, clearInterval() {},
    addEventListener() {}, removeEventListener() {},
    document: { getElementById: $, createElement: () => stubEl(), documentElement: stubEl() },
    navigator: { getGamepads: () => [] }, matchMedia: () => ({ matches: false }), Log: { info() {}, warn() {} },
    GameAudio: { radioLeadS: () => 0.2, radioSting: (k, s) => stings.push([k, s]) } };
  sb.window = sb;
  vm.runInNewContext(read("js/ui/loading-card.js").replace(/^const\b/gm, "var"), sb, { filename: absSrc("js/ui/loading-card.js") });
  vm.runInNewContext(read("js/ui/loading-screen.js").replace(/^const\b/gm, "var"), sb, { filename: absSrc("js/ui/loading-screen.js") });
  const radio = { sayPreRace: (text, life, lead) => { said.push({ text, life, lead }); return 1.4; } };
  const screen = sb.LoadingScreen.create({ $, store: { get: (k, d) => (k === "radioChat" ? chat : d), set() {} },
    Tracks: { LIST: [] }, TrackMaps: { corners: () => [] }, Flags: { svg: () => "" },
    radio: () => radio, announcer: () => ({ play: () => false, speaking: () => speaking, stop() {} }) });
  return { screen, timers, said, stings };
}
const info = { track: { name: "Monza", country: "Italy", id: "monza" } };

test("one team radio line as the car rolls out, with the radio sting, through the flyby check's gates", () => {
  const h = loadingHarness();
  h.screen.garage(info, () => {});
  const t = h.timers.find((x) => x.live && x.ms === 2600);
  assert.ok(t, "scheduled for the moment the car rolls");
  t.fn();
  assert.equal(h.said.length, 1);
  assert.match(h.said[0].text, /clear/i);
  assert.equal(h.said[0].life, 4); assert.equal(h.said[0].lead, 0.2);
  assert.deepEqual(h.stings, [["radio", 2.0]]);
  for (const gate of [{ chat: "off" }, { speaking: true }]) {
    const g = loadingHarness(gate);
    g.screen.garage(info, () => {});
    g.timers.find((x) => x.ms === 2600).fn();
    assert.equal(g.said.length, 0, JSON.stringify(gate) + ": no line");
  }
  const s = loadingHarness();
  s.screen.garage(info, () => {});
  s.screen.building(info);
  assert.equal(s.timers.find((x) => x.ms === 2600).live, false, "leaving the garage cancels it");
});

test("lighting moods: shipped is the identity, every mood finite and distinct, the switch restores", () => {
  const S = sceneHarness();
  const sum = (rig) => { let e = 0; for (let i = 0; i + 14 < rig.length; i += 15) e += rig[i + 3] + rig[i + 4] + rig[i + 5]; return e; };
  const base = sum(S.live(LIV, 0, { night: false, ambient: false }).slice()), sky = Array.from(S.SKYLIGHT);
  assert.equal(S.mood(), "shipped");
  const seen = new Set();
  for (const id of Object.keys(S.MOODS)) {
    assert.equal(S.mood(id), id);
    const ctx = S.moodCtx({ night: false, ambient: false }), rig = S.live(LIV, 0, ctx).slice(), md = S.moodDef();
    for (const v of rig) assert.ok(Number.isFinite(v), `${id}: finite rig`);
    for (const a of [S.SKYLIGHT, S.AMB_SKY, S.AMB_GROUND, S.BACKDROP]) for (const v of a) assert.ok(Number.isFinite(v) && v >= 0, `${id}: finite sky`);
    for (const k of ["exposure", "bloom", "glare", "sheen"]) assert.ok(md[k] > 0 && md[k] < 4, `${id}: ${k} in range`);
    if (md.sun) assert.ok(Math.abs(Math.hypot(...md.sun) - 1) < 0.01 && md.sun[0] === 0, `${id}: unit sun, no sideways component`);
    const sig = sum(rig).toFixed(3) + "|" + Array.from(S.SKYLIGHT).join();
    assert.ok(!seen.has(sig), `${id}: differs from every other mood`); seen.add(sig);
  }
  S.mood("nope");
  assert.equal(S.mood(), "shipped", "an unknown id falls back to shipped");
  assert.ok(Math.abs(sum(S.live(LIV, 0, { night: false, ambient: false }).slice()) - base) < 1e-9, "shipped rig restored");
  assert.deepEqual(Array.from(S.SKYLIGHT), sky, "skylight restored");
});

test("fit: every ceiling fixture's hangers reach from its housing to the ceiling, never short or through it", () => {
  const S = sceneHarness();
  for (const F of S.FIXTURES) {
    const y = F[1] + S.LED_DROP, [lo, hi] = S.hangerSpan(y);
    assert.ok(Math.abs(lo - (y + 0.11)) < 1e-9, "rod starts on the housing's top face");
    assert.ok(Math.abs(hi - S.CEIL_Y) < 1e-9, "rod ends at the ceiling");
    assert.ok(hi - lo > 0.2, `a real drop (${(hi - lo).toFixed(2)} m)`);
  }
  assert.match(read("js/garage/scene.js"), /\bh = hangerSpan\(y\)/, "buildLed builds its rods from hangerSpan");
});
