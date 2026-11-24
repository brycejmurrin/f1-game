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
import { renderRateStubs } from "../helpers/render-rate-stub.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";
import { symbolSource } from "../helpers/game-source.mjs";
import { absSrc } from "../helpers/abs-src.mjs";
import { boot as bootInput, fakePad } from "../helpers/key-binds-rig.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/^const\b/gm, "var");

test("rotation never resurfaces the pause card over an active photo camera", () => {
  const fn = symbolSource("function syncRotateBlocker(");
  for (const photoMode of [false, true]) for (const active of [false, true]) {
    const box = { setAttribute() {} }, pausemenu = { hidden: false };
    const ctx = vm.createContext({ $: () => box, getComputedStyle: () => ({ display: active ? "flex" : "none" }),
      rotateBlockMql: { matches: true }, paused: true, photoMode, els: { pausemenu }, garageReturn: "select" });   // not the pit garage's own pause
    vm.runInContext(fn, ctx); ctx.syncRotateBlocker(false);
    assert.equal(pausemenu.hidden, active || photoMode);
  }
});

test("rotation keeps foreground Settings above Pause until Settings closes", () => {
  const fn = symbolSource("function syncRotateBlocker(");
  let portrait = true;
  const box = { setAttribute() {} }, pausemenu = { hidden: true }, pmsettings = { hidden: false };
  const garage = { hidden: true };
  const ctx = vm.createContext({ $: id => id === "carsetup" ? garage : box,
    getComputedStyle: () => ({ display: portrait ? "flex" : "none" }),
    rotateBlockMql: { matches: true }, paused: true, photoMode: false,
    els: { pausemenu, pmsettings }, garageReturn: "select" });
  vm.runInContext(fn, ctx);
  ctx.syncRotateBlocker(false);
  assert.equal(pausemenu.hidden, true, "portrait keeps Pause away from foreground Settings");
  portrait = false;
  ctx.syncRotateBlocker(false);
  assert.equal(pmsettings.hidden, false);
  assert.equal(pausemenu.hidden, true, "landscape cannot open a second modal above Settings");
  pmsettings.hidden = true;
  ctx.syncRotateBlocker(false);
  assert.equal(pausemenu.hidden, false, "closing Settings restores the ordinary pause card");
  ctx.photoMode = true;
  ctx.syncRotateBlocker(false);
  assert.equal(pausemenu.hidden, true, "photo camera retains its existing pause ownership");
  ctx.photoMode = false; ctx.garageReturn = "pit"; garage.hidden = false;
  ctx.syncRotateBlocker(false);
  assert.equal(pausemenu.hidden, true, "pit work retains its existing pause ownership");
});

test("rotating a paused time trial leaves its HUD arrangement toolbar in the foreground", () => {
  const { document } = makeDom();
  const pausemenu = document.createElement("dialog"), pmsettings = document.createElement("dialog");
  pausemenu.hidden = pmsettings.hidden = true; // the editor temporarily hides both
  const gate = document.createElement("div");
  const ctx = vm.createContext({ document, $: () => gate, els: { pausemenu, pmsettings },
    rotateBlockMql: { matches: true }, paused: true, photoMode: false, garageReturn: "select",
    getComputedStyle: () => ({ display: "none" }) }); // RACE IN PORTRAIT is enabled
  vm.runInContext(symbolSource("function syncRotateBlocker("), ctx, { filename: absSrc("js/game.js") });
  document.body.setAttribute("data-hud-arrange", "1");
  ctx.syncRotateBlocker(false);
  assert.equal(pausemenu.hidden, true, "opening pause would cancel ARRANGE through its dialog observer");
  document.body.removeAttribute("data-hud-arrange");
  ctx.syncRotateBlocker(false);
  assert.equal(pausemenu.hidden, false, "an ordinary paused race still gets its card back");
});

test('online Photo camera input integrates while shared physics continues; solo Photo holds physics', () => {
  const tick = symbolSource("function tickBody(");
  for (const [online, photo] of [[false, true], [true, true], [true, false]]) {
    const calls = { photo: 0, render: 0, physics: 0 };
    const sandbox = { ...renderRateStubs(), Math, PerfSpans: { begin() {}, end() {} }, lastFrame: 0, paused: true, state: 'race', gfx: { warming: () => false },
      Input: { poll() {}, clearEdges() {}, setTimeScale() {} }, BrakeCue: { tick() {} }, onboard: { tick() {} },
      netPlay: { tick() {}, active: () => online }, PerfGov: { tick() {}, recordSimulation() {} },
      // Deploy tip's tickBody also ticks the TV director and gates on mirror
      // preparation; stub both so this fixture stays about Photo / shared-physics.
      director: { tick() {}, reset() {} },
      mirrorPass: { preparing: () => false },
      replayBuf: { isScrubbing: () => false, tickScrub() {}, onTick() {} }, raceT: 0,
      // The paused branch's return line hands the frame to GameAudio.feedReplayScrub.
      GameAudio: { feedReplayScrub() {} }, soundOn: false, player: null, rivalAudio: null,
      naturalGear() { return 1; }, rpmFor() { return 0; }, isWetRoad() { return false; }, vTop() { return 1; },
      _poseAt: null, photoMode: photo, photomode: {}, setupPreviewOn: false,
      els: { lighting: { hidden: true }, camtune: { hidden: true }, flyby: { hidden: true } },
      announceT: 0, hitStop: 0, frozen: false, track: {}, physAcc: 0, PHYS_DT: 1 / 60, cars: [], renderAlpha: 0,   // track: the K1 null-track gate wants a built world
      banner: { tick() {}, clear() {}, announce() {}, get t() { return 0; } }, feel: { shake: 0, camRoll: 0, hitStop: 0 },
      clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)), updateHud() {},
      render: () => calls.render++, updatePhotoCam: () => calls.photo++, update: () => calls.physics++ };
    vm.runInNewContext(tick + '\ntickBody(20);', sandbox);
    assert.equal(calls.photo, photo ? 1 : 0, `${online ? 'online' : 'solo'} photo camera`);
    assert.equal(calls.render, 1);
    assert.equal(calls.physics, online ? 1 : 0, 'one player taking a photo cannot freeze a shared world');
  }
});

test("gamepad Back can end a frozen photo sampling pass without pumping it again", () => {
  const { Input, sb, fire, anyOpen } = bootInput();
  const { press } = fakePad(sb, fire);
  anyOpen.on = true;
  const layer = { id: "photo-studio" };
  sb.UiLayers.top = () => layer;
  const capture = { sampling: { pump: true } };
  let back = 0, renders = 0;
  sb.document.dispatchEvent = (event) => {
    if (event.key === "Escape") { back++; capture.sampling = null; }
    return true;
  };
  const context = vm.createContext({
    Input, lastFrame: 0, PhotoStudioBody: capture, netPlay: { active: () => false },
    render: (dt) => { assert.equal(dt, 0); renders++; },
  });
  vm.runInContext(symbolSource("function tickBody("), context, { filename: absSrc("js/game.js") });
  context.tickBody(16);
  assert.equal(renders, 1, "the frozen capture can pump a render while waiting");
  press(1); // Back on the standard Bluetooth layout
  context.tickBody(32);
  assert.equal(back, 1);
  assert.equal(capture.sampling, null);
  assert.equal(renders, 1, "the cancelled pass is not drawn again");
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
  for (const f of ["js/core/log.js", "js/core/mat4.js", "js/input/bindings.js", "js/input/pad-menu.js", "js/input/haptics.js", "js/input/pedal-travel.js", "js/input/hold-buttons.js", "js/input/input.js", "js/render/shared/driving-line.js", "js/camera/photo-cam.js"]) vm.runInContext(src(f), ctx, { filename: absSrc(f) });
  const G = {
    $: (id) => dom.byId(id), gfx: {}, photoCam: { pos: [0, 0, 0], pitch: 0, yaw: 0, fov: 60 },
    photoKeys: {}, photoMouse: {}, photoMove: {}, photoLook: {},
    applyResMode() {}, snapGameCam() {}, camEye: [0, 0, 0], camTgt: [0, 0, -1], camFov: 60,
  };
  for (const id of ["pc-move", "pc-look"]) {
    const nub = dom.document.createElement("div"); nub.className = "pc-nub";
    dom.byId(id).appendChild(nub);
  }
  const photomode = vm.runInContext("Photomode", ctx);
  const api = photomode.create(G);
  return { dom, G, api, photomode, key: (e) => {
    for (const listener of [...(listeners.get(e.type) || [])]) listener(e);
  } };
}

test("Photo Studio panel keeps native keys while an unfocused scene flies and keyups release", () => {
  const { dom, G, api, key } = boot();
  Object.assign(G.photoKeys, { up: false, pu: false, yl: false, w: false }); api.enterPhotoMode();
  const panel = dom.byId("ps-panel"), button = dom.document.createElement("button"); panel.appendChild(button); button.focus();
  const event = (code, type = "keydown") => ({ code, type, prevented: false, preventDefault() { this.prevented = true; }, stopPropagation() {} });
  for (const code of ["Space", "Enter", "NumpadEnter", "ArrowUp", "ArrowLeft", "KeyW"]) {
    const e = event(code); key(e); assert.equal(e.prevented, false, code + " belongs to the focused control");
  }
  assert.equal(G.photoKeys.up, false); assert.equal(G.photoKeys.pu, false); assert.equal(G.photoKeys.yl, false); assert.equal(G.photoKeys.w, false);
  button.blur();
  const move = event("KeyW"); key(move); api.updatePhotoCam(0.05);
  assert.equal(move.prevented, true, "W is a camera control when no panel control has focus");
  assert.ok(G.photoCam.pos[2] < -1, "the camera moves forward when the scene owns input");
  const field = dom.document.createElement("input"); panel.appendChild(field); field.focus();
  key({ type: "focusin", target: field });
  assert.equal(G.photoKeys.w, false, "moving focus to a field releases a held camera key");
  const editing = event("KeyW"); key(editing);
  assert.equal(editing.prevented, false, "form fields retain their typing keys");
  assert.equal(G.photoKeys.w, false, "typing in an input cannot fly the camera");
  G.photoKeys.w = true; G.photoKeys.up = true;
  key(event("KeyW", "keyup")); key(event("Space", "keyup"));
  assert.equal(G.photoKeys.w, false); assert.equal(G.photoKeys.up, false);
  const escape = event("Escape"); key(escape); assert.equal(escape.prevented, false, "Escape reaches the canonical layer close door");
});

test("#pc-restore and Studio buttons keep Space activation on keydown AND keyup (#3562)", () => {
  for (const host of ["pc-restore", "ps-panel", "screen-arranger"]) {
    const { dom, G, api, key } = boot();
    api.enterPhotoMode();
    let button = dom.byId(host);
    if (host !== "pc-restore") { button = dom.document.createElement("button"); dom.byId(host).appendChild(button); }
    button.focus();
    if (host === "screen-arranger") {
      G.photoKeys.up = true; G.photoKeys.w = true;
      key({type:"focusin", target:button});
      assert.equal(G.photoKeys.w, false, "entering the layout editor releases a held camera key");
    }
    for (const type of ["keydown", "keyup"]) {
      const e = { code: "Space", type, prevented: false, preventDefault() { this.prevented = true; }, stopPropagation() {} };
      key(e);
      assert.equal(e.prevented, false, host + ": Space " + type + " keeps its default (buttons activate on keyup)");
    }
    assert.equal(G.photoKeys.up, false, host + ": the activation press does not fly the camera up");
  }
});

test("either UP key can be released while its other physical alias keeps flying upward", () => {
  for (const first of ["KeyR", "Space"]) {
    const { G, api, key } = boot(), second = first === "KeyR" ? "Space" : "KeyR";
    const send = (code, type) => key({ code, type, preventDefault() {}, stopPropagation() {} });
    api.enterPhotoMode();
    send(first, "keydown"); send(first, "keydown"); send(second, "keydown");
    send(first, "keyup");
    api.updatePhotoCam(.1);
    assert.ok(G.photoCam.pos[1] > 0, second + " still owns upward movement");
    send(second, "keyup");
    const height = G.photoCam.pos[1]; api.updatePhotoCam(.1);
    assert.equal(G.photoCam.pos[1], height, "the final release stops upward movement");
  }
});

test("either Shift can be released while the other keeps the photo camera boosted", () => {
  for (const first of ["ShiftLeft", "ShiftRight"]) {
    const { G, api, key } = boot(), second = first === "ShiftLeft" ? "ShiftRight" : "ShiftLeft";
    const send = (code, type) => key({ code, type, preventDefault() {}, stopPropagation() {} });
    api.enterPhotoMode();
    send("KeyW", "keydown"); send(first, "keydown"); send(first, "keydown"); send(second, "keydown");
    send(first, "keyup"); api.updatePhotoCam(.1);
    const heldDistance = -G.photoCam.pos[2];
    send(second, "keyup"); api.updatePhotoCam(.1);
    const normalDistance = -G.photoCam.pos[2] - heldDistance;
    assert.ok(heldDistance > normalDistance * 2, "the remaining Shift keeps boost; the final release restores normal speed");
  }
});

test("ignored Studio Space and stale alias keyups do not cancel a different held key", () => {
  const { dom, G, api, key } = boot();
  const send = (code, type) => key({ code, type, preventDefault() {}, stopPropagation() {} });
  api.enterPhotoMode(); send("KeyR", "keydown");
  const panel = dom.byId("ps-panel"), button = dom.document.createElement("button"); panel.appendChild(button); button.focus();
  send("Space", "keydown"); send("Space", "keyup"); api.updatePhotoCam(.1);
  assert.ok(G.photoCam.pos[1] > 0, "activating a Studio button with Space leaves held R alone");
  button.blur();
  send("ShiftLeft", "keydown"); send("ShiftRight", "keydown");
  key({ type: "blur" });
  assert.equal(G.photoKeys.up, false); assert.equal(G.photoKeys.boost, false);
  send("ShiftLeft", "keydown"); send("ShiftLeft", "keyup");
  assert.equal(G.photoKeys.boost, false, "blur clears the other physical Shift too");
  send("Space", "keydown"); send("KeyR", "keyup");
  const before = G.photoCam.pos[1]; api.updatePhotoCam(.1);
  assert.ok(G.photoCam.pos[1] > before, "an old keyup after blur cannot cancel newly held Space");
  api.exitPhotoMode(); api.enterPhotoMode();
  send("KeyR", "keydown"); send("KeyR", "keyup");
  const resetHeight = G.photoCam.pos[1]; api.updatePhotoCam(.1);
  assert.equal(G.photoCam.pos[1], resetHeight, "re-entry clears prior alias state");
});

test("fly-cam UP hold survives the boundary pointerleave and a capture steal; a hidden button releases", () => {
  const { dom, G, api, key } = boot();
  api.enterPhotoMode();
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
  dom.dispatch(el, { type: "pointerdown", pointerId: 9 });
  dom.dispatch(el, { type: "lostpointercapture", pointerId: 9 });
  key({ type: "pointerup", pointerId: 9, target: dom.document.body });
  assert.equal(G.photoAlt, 0, "a retargeted lift still releases");
});

test("opposite altitude holds cancel together and releasing either preserves the other pointer", () => {
  for (const first of ["up", "down"]) {
    const { dom, G, api } = boot(), second = first === "up" ? "down" : "up";
    api.enterPhotoMode();
    dom.dispatch(dom.byId("pc-" + first), { type: "pointerdown", pointerId: 1 });
    dom.dispatch(dom.byId("pc-" + second), { type: "pointerdown", pointerId: 2 });
    assert.equal(G.photoAlt, 0, "opposing holds cancel");
    dom.dispatch(dom.byId("pc-" + first), { type: "pointerup", pointerId: 1 });
    assert.equal(G.photoAlt, second === "up" ? 1 : -1, "the other pointer remains held");
    dom.dispatch(dom.byId("pc-" + second), { type: "pointercancel", pointerId: 2 }); assert.equal(G.photoAlt, 0);
  }
});

test("sized movement and look sticks use visual ring geometry and keep the nub inside the local ring", () => {
  const { dom, G, api, key } = boot();
  api.enterPhotoMode();
  for (const [id, vec, size, factor] of [["pc-move", G.photoMove, 180, 1.5], ["pc-look", G.photoLook, 74, 0.75]]) {
    const el = dom.byId(id), nub = el.querySelector(".pc-nub");
    const localHeight = size - 20;
    el._rect = { width:size, height:localHeight };
    nub._rect = { width:26, height:18 };
    let reads = 0;
    el.getBoundingClientRect = () => { reads++; return {left:40, top:25, width:size * factor, height:localHeight * factor}; };
    const x = 40 + size * factor / 2, y = 25 + localHeight * factor / 2;
    const event = (type, pointerId, clientX, clientY) => dom.dispatch(el, {type,pointerId,clientX,clientY});
    event("pointerdown", 1, x, y);
    assert.deepEqual([vec.x, vec.y], [0, 0]);
    event("pointermove", 1, x + size * factor / 2, y);
    assert.deepEqual([vec.x, vec.y], [1, 0]);
    assert.equal(nub.style.transform, "translate(" + (size - 26) / 2 + "px,0px)");
    event("pointerdown", 2, x, y);
    event("pointercancel", 2, x, y);
    assert.equal(vec.x, 1, "a second contact cannot steal this stick");
    event("pointermove", 1, x, y + localHeight * factor / 2);
    assert.deepEqual([vec.x, vec.y], [0, 1]);
    assert.equal(nub.style.transform, "translate(0px," + (localHeight - 18) / 2 + "px)");
    event("lostpointercapture", 1, x, y);
    assert.deepEqual([vec.x, vec.y], [0, 1], "a second control taking capture does not release this stick");
    key({ type: "pointermove", pointerId: 1, target: dom.document.body, clientX: x, clientY: y - localHeight * factor / 2, preventDefault() {} });
    assert.deepEqual([vec.x, vec.y], [0, -1], "the original contact still updates when WebKit retargets it");
    assert.equal(reads, 1);
    key({type:"resize"});
    event("pointermove", 1, x + 30, y);
    assert.deepEqual([vec.x, vec.y], [0, 0]);
    assert.equal(nub.style.transform, "translate(0,0)");
    event("pointerdown", 3, x + 30, y);
    key({type:"focusin", target:dom.byId("screen-arranger")});
    event("pointermove", 3, x + 30, y);
    assert.deepEqual([vec.x, vec.y], [0, 0], "the editor interrupts the actual captured gesture");
    event("pointerdown", 4, x + 30, y);
    api.exitPhotoMode(); api.enterPhotoMode();
    event("pointermove", 4, x + 30, y);
    assert.deepEqual([vec.x, vec.y], [0, 0], "a stale pointer cannot drive a reopened camera");
  }
});

test("Camera focus keeps arrows in the scene and Tab returns to the initiating control", () => {
  const { dom, G, api, photomode, key } = boot();
  api.enterPhotoMode();
  const panel = dom.byId("ps-panel"), button = dom.document.createElement("button");
  panel.appendChild(button);
  assert.equal(photomode.focusScene(button), true);
  const send = (code) => key({ type: "keydown", code, preventDefault() {}, stopPropagation() {} });
  send("ArrowRight");
  send("KeyW");
  api.updatePhotoCam(.1);
  assert.ok(G.photoCam.yaw > 0);
  assert.ok(G.photoCam.pos[2] < 0);
  send("Tab");
  key({ type: "focusin", target: button });
  assert.equal(dom.document.activeElement, button);
  assert.equal(G.photoKeys.yr, false, "re-entering the panel clears held scene arrows");
  assert.equal(G.photoKeys.w, false, "re-entering the panel clears held scene movement");
  send("ArrowRight");
  send("KeyW");
  assert.equal(G.photoKeys.yr, false, "arrows belong to the panel again");
  assert.equal(G.photoKeys.w, false, "auto-repeat cannot move the camera while editing the panel");
});

test("Modified shortcuts keep their browser defaults and reset held camera keys", () => {
  const { G, api, key } = boot();
  api.enterPhotoMode();
  const event = (code, modifiers = {}) => {
    const e = { type: "keydown", code, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...modifiers };
    key(e);
    return e;
  };
  event("KeyW");
  assert.equal(G.photoKeys.w, true);
  event("MetaLeft", { metaKey: true });
  assert.equal(G.photoKeys.w, false, "Cmd releases the movement key even if macOS suppresses its keyup");
  assert.equal(event("KeyS", { metaKey: true }).defaultPrevented, undefined);
  assert.equal(event("KeyA", { ctrlKey: true }).defaultPrevented, undefined);
  assert.ok(!G.photoKeys.s);
  assert.ok(!G.photoKeys.a);
});

test("Physical and paired camera samples are bounded, independent and cleared on exit", () => {
  const { G, api } = boot();
  api.setPadInput(1, -1, 1, -1, 1);
  api.enterPhotoMode();
  api.updatePhotoCam(.1);
  assert.deepEqual(G.photoCam.pos, [0, 0, 0]);
  api.setPadInput(2, -2, 0, 0, NaN);
  api.updatePhotoCam(.1);
  assert.ok(Math.abs(G.photoCam.pos[0] - 3.4) < 1e-8);
  assert.ok(Math.abs(G.photoCam.pos[2] + 3.4) < 1e-8);
  api.setRemoteCameraInput(0, 0, 1, -1, 1);
  api.setPadInput(0, 0, 0, 0, 0);
  api.updatePhotoCam(.1);
  assert.ok(G.photoCam.yaw > 0 && G.photoCam.pitch > 0 && G.photoCam.pos[1] > 0);
  api.exitPhotoMode(); api.enterPhotoMode();
  api.updatePhotoCam(.1);
  assert.deepEqual(G.photoCam.pos, [0, 0, 0]);
  assert.equal(G.photoCam.yaw, 0);
});
