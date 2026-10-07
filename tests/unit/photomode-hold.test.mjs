/* photomode-hold.test.mjs — the fly-cam UP/DOWN hold buttons must not let go
 * of a thumb that is still down.
 *
 * 2026-09-02 bug hunt. wirePhotoHold released on `pointerleave`, which under
 * pointer capture is a BOUNDARY event: setPointerCapture retargets the pointer
 * and the browser fires leave on the element the same press just took (the
 * trap js/game.js holdSetupCtl documents). It also released on ANY
 * lostpointercapture — and WebKit keeps one capture slot, so a second finger
 * on the other hold button stole capture from the first with its thumb still
 * down. Both now go through js/input/input.js holdTargetGone, the same test
 * the pedals use: a lost capture is a release only when the button was taken
 * away mid-hold.
 *
 * Run: node --test tests/unit/photomode-hold.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/^const\b/gm, "var");

test("rotation never resurfaces the pause card over an active photo camera", () => {
  const source = src("js/game.js");
  const fn = source.slice(source.indexOf("function syncRotateBlocker("), source.indexOf("if (rotateBlockMql.addEventListener)"));
  for (const photoMode of [false, true]) for (const active of [false, true]) {
    const box = { setAttribute() {} }, pausemenu = { hidden: false };
    const ctx = vm.createContext({ $: () => box, getComputedStyle: () => ({ display: active ? "flex" : "none" }),
      rotateBlockMql: { matches: true }, paused: true, photoMode, els: { pausemenu } });
    vm.runInContext(fn, ctx); ctx.syncRotateBlocker(false);
    assert.equal(pausemenu.hidden, active || photoMode);
  }
});

test('online Photo camera input integrates while shared physics continues; solo Photo holds physics', () => {
  const source = src('js/game.js');
  const tick = source.slice(source.indexOf('function tickBody(now) {'), source.indexOf('// ---------- car setup panel ----------'));
  for (const [online, photo] of [[false, true], [true, true], [true, false]]) {
    const calls = { photo: 0, render: 0, physics: 0 };
    const sandbox = { Math, lastFrame: 0, paused: true, state: 'race', gfx: { warming: () => false },
      Input: { poll() {}, clearEdges() {}, setTimeScale() {} }, BrakeCue: { tick() {} }, onboard: { tick() {} },
      netPlay: { tick() {}, active: () => online }, PerfGov: { tick() {}, recordSimulation() {} },
      // Deploy tip's tickBody also ticks the TV director and gates on mirror
      // preparation; stub both so this fixture stays about Photo / shared-physics.
      director: { tick() {}, reset() {} },
      mirrorPass: { preparing: () => false },
      replayBuf: { isScrubbing: () => false, tickScrub() {}, onTick() {} }, feedReplayScrubAudio() {}, raceT: 0,
      _poseAt: null, photoMode: photo, setupPreviewOn: false,
      els: { lighting: { hidden: true }, camtune: { hidden: true }, flyby: { hidden: true } },
      announceT: 0, hitStop: 0, frozen: false, physAcc: 0, PHYS_DT: 1 / 60, cars: [], renderAlpha: 0,
      clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)), updateHud() {},
      render: () => calls.render++, updatePhotoCam: () => calls.photo++, update: () => calls.physics++ };
    vm.runInNewContext(tick + '\ntickBody(20);', sandbox);
    assert.equal(calls.photo, photo ? 1 : 0, `${online ? 'online' : 'solo'} photo camera`);
    assert.equal(calls.render, 1);
    assert.equal(calls.physics, online ? 1 : 0, 'one player taking a photo cannot freeze a shared world');
  }
});

function boot() {
  const dom = makeDom();
  const listeners = new Map();
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, Promise, Date, Error, parseFloat, parseInt, isFinite,
    document: dom.document,
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    removeEventListener(type, fn) { const list = listeners.get(type); if (list) { const i = list.indexOf(fn); if (i >= 0) list.splice(i, 1); } },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, requestAnimationFrame: () => 0,
    getComputedStyle: () => ({ display: "block", visibility: "visible" }),
    navigator: { getGamepads: () => [], maxTouchPoints: 5, userAgent: "node" },
    matchMedia: () => ({ matches: true, addEventListener() {} }),
    screen: { orientation: { type: "landscape-primary", angle: 0, addEventListener() {} } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { search: "" }, performance: { now: () => 0 }, innerWidth: 1000, innerHeight: 600,
    GameAudio: { uiSelect() {}, uiTick() {} }, PerfGov: { tier: () => 0, setAutoRes() {} },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  for (const f of ["js/core/log.js", "js/core/mat4.js", "js/input/bindings.js", "js/input/pad-menu.js", "js/input/haptics.js", "js/input/hold-buttons.js", "js/input/input.js", "js/camera/photo-cam.js"]) vm.runInContext(src(f), ctx, { filename: f });
  const G = {
    $: (id) => dom.byId(id), gfx: {}, photoCam: { pos: [0, 0, 0], pitch: 0, yaw: 0, fov: 60 },
    photoKeys: {}, photoMouse: {}, photoMove: {}, photoLook: {},
    applyResMode() {}, snapGameCam() {}, camEye: [0, 0, 0], camTgt: [0, 0, -1], camFov: 60,
  };
  const api = vm.runInContext("Photomode", ctx).create(G);
  return { dom, G, api, key: (e) => { const list = listeners.get(e.type); if (list && list.length) list.at(-1)(e); } };
}

test("Photo Studio buttons keep activation and arrows while WASD still flies and keyups release", () => {
  const { dom, G, api, key } = boot();
  Object.assign(G.photoKeys, { up: false, pu: false, yl: false, w: false }); api.enterPhotoMode();
  const panel = dom.byId("ps-panel"), button = dom.document.createElement("button"); panel.appendChild(button); button.focus();
  const event = (code, type = "keydown") => ({ code, type, prevented: false, preventDefault() { this.prevented = true; }, stopPropagation() {} });
  for (const code of ["Space", "Enter", "NumpadEnter", "ArrowUp", "ArrowLeft"]) {
    const e = event(code); key(e); assert.equal(e.prevented, false, code + " belongs to the focused control");
  }
  assert.equal(G.photoKeys.up, false); assert.equal(G.photoKeys.pu, false); assert.equal(G.photoKeys.yl, false); assert.equal(G.photoKeys.w, false);
  const move = event("KeyW"); key(move); api.updatePhotoCam(0.05);
  assert.equal(move.prevented, true, "W is a camera control even when DONE has keyboard focus");
  assert.ok(G.photoCam.pos[2] < -1, "the camera moves forward from the focused Studio button");
  const field = dom.document.createElement("input"); panel.appendChild(field); field.focus();
  G.photoKeys.w = false;
  const editing = event("KeyW"); key(editing);
  assert.equal(editing.prevented, false, "form fields retain their typing keys");
  assert.equal(G.photoKeys.w, false, "typing in an input cannot fly the camera");
  G.photoKeys.w = true; G.photoKeys.up = true;
  key(event("KeyW", "keyup")); key(event("Space", "keyup"));
  assert.equal(G.photoKeys.w, false); assert.equal(G.photoKeys.up, false);
  const escape = event("Escape"); key(escape); assert.equal(escape.prevented, false, "Escape reaches the canonical layer close door");
});

test("fly-cam UP hold survives the boundary pointerleave and a capture steal; a hidden button releases", () => {
  const { dom, G } = boot();
  const el = dom.byId("pc-up");
  el.isConnected = true;   // mini-dom has no isConnected — this is a live, visible button
  dom.dispatch(el, { type: "pointerdown", pointerId: 7 });
  assert.equal(G.photoAlt, 1, "precondition: the press is held");
  dom.dispatch(el, { type: "pointerleave", pointerId: 7 });
  assert.equal(G.photoAlt, 1, "pointerleave under capture is a boundary event, not a lift");
  dom.dispatch(el, { type: "lostpointercapture", pointerId: 7 });
  assert.equal(G.photoAlt, 1, "a capture steal by the other hold button is not a lift (the button is still there)");
  el.hidden = true;
  dom.dispatch(el, { type: "lostpointercapture", pointerId: 7 });
  assert.equal(G.photoAlt, 0, "the button being taken away mid-hold IS a release (HIDE HUD, a .screen.dim opening)");
  el.hidden = false;
  dom.dispatch(el, { type: "pointerdown", pointerId: 8 });
  assert.equal(G.photoAlt, 1);
  dom.dispatch(el, { type: "pointerup", pointerId: 8 });
  assert.equal(G.photoAlt, 0, "a plain lift still releases");
});

test("opposite altitude holds cancel together and releasing either preserves the other pointer", () => {
  for (const first of ["up", "down"]) {
    const { dom, G } = boot(), second = first === "up" ? "down" : "up";
    dom.dispatch(dom.byId("pc-" + first), { type: "pointerdown", pointerId: 1 });
    dom.dispatch(dom.byId("pc-" + second), { type: "pointerdown", pointerId: 2 });
    assert.equal(G.photoAlt, 0, "opposing holds cancel");
    dom.dispatch(dom.byId("pc-" + first), { type: "pointerup", pointerId: 1 });
    assert.equal(G.photoAlt, second === "up" ? 1 : -1, "the other pointer remains held");
    dom.dispatch(dom.byId("pc-" + second), { type: "pointercancel", pointerId: 2 }); assert.equal(G.photoAlt, 0);
  }
});
