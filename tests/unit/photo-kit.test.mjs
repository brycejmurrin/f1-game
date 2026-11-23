/* photo-kit.test.mjs — composition grids, DoF hint, freecam bookmarks.
 * Also Photomode enter scale bump + FOV clamp (HUNT-PHOTO 2026-11-03) — kept
 * here so the suite stays in the registered photo-kit unit file (OWNED
 * tests/unit/photo-*; a new photo-cam.test.mjs would need groups.json + gen). */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const srcFile = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/^const\b/gm, "var");

function load() {
  const ctx = {
    Log: { info() {} },
    M4: { clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v) },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, "js/camera/photo-looks.js"), "utf8") + "\n" +
    fs.readFileSync(path.join(ROOT, "js/camera/photo-kit.js"), "utf8") + "\nthis.exported = PhotoKit;",
    ctx, { filename: absSrc("js/camera/photo-kit.js") });
  return ctx.exported;
}

function memStore() {
  const disk = new Map();
  return {
    get(k, d) { return disk.has(k) ? disk.get(k) : d; },
    set(k, v) { disk.set(k, v); return true; },
    _disk: disk,
  };
}

test("nextGrid cycles off → thirds → golden → off", () => {
  const PK = load();
  assert.equal(PK.nextGrid("off"), "thirds");
  assert.equal(PK.nextGrid("thirds"), "golden");
  assert.equal(PK.nextGrid("golden"), "off");
});

test("saveMark / marksFor round-trip per track, capped at MAX_MARKS", () => {
  const PK = load();
  const store = memStore();
  for (let i = 0; i < PK.MAX_MARKS + 3; i++) {
    PK.saveMark(store, "monza", {
      name: "m" + i,
      eye: [i, 2, 0],
      target: [i, 1, 10],
      fov: 50,
      roll: 0,
    });
  }
  const list = PK.marksFor(store, "monza");
  assert.equal(list.length, PK.MAX_MARKS);
  assert.equal(list[0].name, "m3", "oldest dropped");
  assert.equal(PK.marksFor(store, "spa").length, 0, "other tracks untouched");
});

test("saveMark refuses non-finite or short eye/target (HUNT-PHOTO #1)", () => {
  const PK = load(), store = memStore();
  assert.equal(PK.saveMark(store, "monza", { eye: [NaN, 1, 2], target: [0, 1, 10] }), null);
  assert.equal(PK.saveMark(store, "monza", { eye: [1, 2], target: [0, 1, 10] }), null);
  assert.equal(PK.saveMark(store, "monza", { eye: [1, 2, 3], target: [0, Infinity, 10] }), null);
  assert.equal(PK.marksFor(store, "monza").length, 0, "nothing persisted");
  // Corrupt rows already on disk stay hidden from LOAD.
  store.set("freecamMarks", { monza: [
    { name: "bad", eye: [NaN, 0, 0], target: [1, 2, 3], fov: 60, roll: 0 },
    { name: "ok", eye: [1, 2, 3], target: [4, 5, 6], fov: 50, roll: 0 },
  ] });
  const list = PK.marksFor(store, "monza");
  assert.equal(list.length, 1);
  assert.equal(list[0].name, "ok");
});

test("applyDof writes cam.dof and drives overlay CSS vars", () => {
  const PK = load();
  const cam = {};
  const style = new Map();
  const overlay = {
    hidden: true,
    style: { setProperty(k, v) { style.set(k, v); } },
    setAttribute() {},
  };
  const r = PK.applyDof(cam, 0.5, 0.5, overlay);
  assert.equal(cam.dof.focus, 0.5);
  assert.equal(cam.dof.blur, 0.5);
  assert.equal(r.blur, 0.5);
  assert.equal(overlay.hidden, false);
  assert.ok(style.get("--fc-dof-blur").endsWith("px"));
  PK.applyDof(cam, 0.5, 0, overlay);
  assert.equal(overlay.hidden, true, "blur ~0 hides the overlay");
});

test("free-cam.js wires GRID / SAVE MARK / DoF controls", () => {
  const fc = fs.readFileSync(path.join(ROOT, "js/camera/free-cam.js"), "utf8");
  assert.match(fc, /fc-grid/);
  assert.match(fc, /fc-mark-save/);
  assert.match(fc, /fc-dof-blur/);
  assert.match(fc, /PhotoKit/);
});

test("named bookmarks remain independently reachable after deleting a selected older mark", () => {
  const PK = load(), store = memStore();
  for (let i = 0; i < 12; i++) PK.saveMark(store, "spa", { name: "Angle " + i, eye: [i, 2, 3], target: [4, 5, 6], fov: 35 + i, roll: i });
  const before = PK.marksFor(store, "spa");
  assert.equal(before[0].name, "Angle 0"); assert.equal(before[5].eye[0], 5);
  PK.deleteMark(store, "spa", 5); const remaining = PK.marksFor(store, "spa");
  assert.equal(remaining.length, 11); assert.equal(remaining[5].name, "Angle 6");
  PK.saveMark(store, "spa", { name: "Replacement", eye: [90, 2, 3], target: [4, 5, 6] });
  assert.equal(PK.marksFor(store, "spa")[0].name, "Angle 0");
  PK.saveMark(store, "spa", { name: "Thirteenth", eye: [99, 2, 3], target: [4, 5, 6] });
  assert.equal(PK.marksFor(store, "spa")[0].name, "Angle 1");
});

test("photo looks expose the six named free-camera presets", () => {
  const PK = load();
  assert.deepEqual(
    Array.from(PK.LOOK_PRESETS, (look) => look.name),
    ["Clean TV", "Film", "Noir", "Golden", "Neon Night", "70s"],
  );
  assert.ok(PK.LOOK_PRESETS.every((look) => Object.isFrozen(look) && Object.isFrozen(look.values)));
});

test("applying looks then ending the session restores the exact lighting snapshot", () => {
  const PK = load();
  const live = {
    exposureMul: 1.137, contrast: 1.246, saturation: 0.913,
    gammaR: 1.021, gammaG: 0.987, gammaB: 1.044,
    vignette: 0.777, bloomMul: 1.31, fogTint: -0.42,
  };
  const before = structuredClone(live);
  const writes = [];
  const session = PK.createLookSession(
    (id) => live[id],
    (id, value) => { writes.push([id, value]); live[id] = value; return true; },
  );

  assert.equal(session.apply("Noir"), true);
  assert.equal(live.saturation, 0);
  assert.notDeepEqual(live, before);
  assert.equal(session.apply("Golden"), true, "a second look reuses the original snapshot");
  assert.equal(session.end(), true);
  assert.deepEqual(live, before);
  assert.equal(session.end(), false, "exit is idempotent");
  assert.ok(writes.length > Object.keys(before).length, "both presets and restore wrote through the live setter");
});

test("look sessions never persist and an unknown preset changes nothing", () => {
  const PK = load();
  const live = Object.fromEntries(PK.LOOK_KEYS.map((id, i) => [id, i + 0.5]));
  const before = structuredClone(live);
  const session = PK.createLookSession(
    (id) => live[id],
    (id, value) => { live[id] = value; return true; },
  );
  assert.equal(session.apply("Missing"), false);
  assert.deepEqual(live, before);
  assert.equal(session.active(), null);
});

test("mountLookControls lists every preset in the free-camera panel", () => {
  const PK = load(), applied = [];
  const node = (tag) => ({
    tag, children: [], attrs: {}, listeners: {},
    appendChild(child) { this.children.push(child); },
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(k, fn) { this.listeners[k] = fn; },
  });
  const parent = node("section");
  const group = PK.mountLookControls(parent, { apply: (name) => { applied.push(name); return true; } }, {
    createElement: node,
  });
  assert.equal(group.id, "fc-looks");
  assert.equal(group.children.length, PK.LOOK_PRESETS.length);
  assert.deepEqual(group.children.map((button) => button.textContent), Array.from(PK.LOOK_PRESETS, (look) => look.name.toUpperCase()));
  group.children[2].listeners.click();
  assert.deepEqual(applied, ["Noir"]);
  assert.equal(group.children[2].attrs["aria-pressed"], "true");
});

test("Photo Studio binds looks to free-camera lifetime so exit restores the snapshot", () => {
  const studio = fs.readFileSync(path.join(ROOT, "js/ui/photo-studio.js"), "utf8");
  assert.match(studio, /PhotoKit\.createLookSession/);
  assert.match(studio, /PhotoKit\.mountLookControls/);
  assert.match(studio, /MutationObserver/);
  assert.match(studio, /lookSession\.end\(\)/);
});

function bootPhotoCam(scale = 0.7) {
  const dom = makeDom();
  const scales = [scale];
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, Promise, Date, Error,
    parseFloat, parseInt, isFinite,
    document: dom.document,
    addEventListener() {}, removeEventListener() {},
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, requestAnimationFrame: () => 0,
    getComputedStyle: () => ({ display: "block", visibility: "visible" }),
    navigator: { getGamepads: () => [], maxTouchPoints: 0, userAgent: "node" },
    matchMedia: () => ({ matches: true, addEventListener() {} }),
    screen: { orientation: { type: "landscape-primary", angle: 0, addEventListener() {} } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { search: "" }, performance: { now: () => 0 }, innerWidth: 1000, innerHeight: 600,
    GameAudio: { uiSelect() {}, uiTick() {} },
    PerfGov: { tier: () => 0, setAutoRes() {} },
    DrivingLine: { shown: () => false, setPhoto() {} },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  for (const f of [
    "js/core/log.js", "js/core/mat4.js", "js/input/bindings.js", "js/input/pad-menu.js",
    "js/input/haptics.js", "js/input/pedal-travel.js", "js/input/hold-buttons.js",
    "js/input/input.js", "js/render/shared/driving-line.js", "js/camera/photo-cam.js",
  ]) vm.runInContext(srcFile(f), ctx, { filename: absSrc(f) });
  const G = {
    $: (id) => dom.byId(id),
    gfx: {
      getRenderScale: () => scales[scales.length - 1],
      setRenderScale: (s) => { scales.push(s); return true; },
    },
    photoCam: { pos: [0, 0, 0], pitch: 0, yaw: 0, fov: 60 },
    photoKeys: {}, photoMouse: {}, photoMove: {}, photoLook: {},
    applyResMode() {}, snapGameCam() {},
    camEye: [0, 5, 10], camTgt: [0, 0, 0], camFov: 60,
  };
  const api = vm.runInContext("Photomode", ctx).create(G);
  return { dom, G, api, scales };
}

test("enterPhotoMode raises a soft render scale to 1 and exit restores it (HUNT-PHOTO #2)", () => {
  const { G, api, scales } = bootPhotoCam(0.7);
  api.enterPhotoMode();
  assert.equal(G._photoPrevScale, 0.7);
  assert.equal(scales.at(-1), 1, "photo framing is sharp");
  api.exitPhotoMode();
  assert.equal(scales.at(-1), 0.7, "exit restores the pre-photo scale");
});

test("enterPhotoMode does not call setRenderScale when already at 1", () => {
  const { api, scales } = bootPhotoCam(1);
  api.enterPhotoMode();
  assert.deepEqual(scales, [1], "no redundant resize when already sharp");
  api.exitPhotoMode();
});

test("pc-fov oninput clamps to 20..110 and rejects non-finite (HUNT-PHOTO #3)", () => {
  const { dom, G, api } = bootPhotoCam(1);
  api.enterPhotoMode();
  const fov = dom.byId("pc-fov");
  fov.value = "15";
  fov.dispatchEvent({ type: "input" });
  assert.equal(G.photoCam.fov, 20);
  fov.value = "200";
  fov.dispatchEvent({ type: "input" });
  assert.equal(G.photoCam.fov, 110);
  fov.value = "72";
  fov.dispatchEvent({ type: "input" });
  assert.equal(G.photoCam.fov, 72);
  fov.value = "not-a-number";
  fov.dispatchEvent({ type: "input" });
  assert.equal(G.photoCam.fov, 60);
});
