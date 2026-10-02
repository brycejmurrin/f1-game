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
  for (const f of ["js/core/log.js", "js/core/mat4.js", "js/input/input.js", "js/camera/photo-cam.js"]) vm.runInContext(src(f), ctx, { filename: f });
  const G = {
    $: (id) => dom.byId(id), gfx: {}, photoCam: { pos: [0, 0, 0], pitch: 0, yaw: 0, fov: 60 },
    photoKeys: {}, photoMouse: {}, photoMove: {}, photoLook: {},
    applyResMode() {}, snapGameCam() {}, camEye: [0, 0, 0], camTgt: [0, 0, -1], camFov: 60,
  };
  const api = vm.runInContext("Photomode", ctx).create(G);
  return { dom, G, api, key: (e) => { const list = listeners.get(e.type); if (list && list.length) list.at(-1)(e); } };
}

test("Photo Studio focused buttons keep Space and arrows while camera keyups still release", () => {
  const { dom, G, api, key } = boot();
  Object.assign(G.photoKeys, { up: false, pu: false, yl: false, w: false }); api.enterPhotoMode();
  const panel = dom.byId("ps-panel"), button = dom.document.createElement("button"); panel.appendChild(button); button.focus();
  const event = (code, type = "keydown") => ({ code, type, prevented: false, preventDefault() { this.prevented = true; }, stopPropagation() {} });
  for (const code of ["Space", "ArrowUp", "ArrowLeft", "KeyW"]) {
    const e = event(code); key(e); assert.equal(e.prevented, false, code + " belongs to the focused control");
  }
  assert.equal(G.photoKeys.up, false); assert.equal(G.photoKeys.pu, false); assert.equal(G.photoKeys.yl, false); assert.equal(G.photoKeys.w, false);
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
