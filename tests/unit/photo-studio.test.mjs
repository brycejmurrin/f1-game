/* PhotoStudio: camera borrowing, readback ordering, bounded composition,
 * cancellation and local persistence failure, without renderer hardware.
 * Also PHOTO LIGHTING: TUNE_DEFS clone/restore via the ltStore dep game.js passes (no latching setLightTune). */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";
import { makeDom } from "../helpers/mini-dom.mjs";
import { gameSource } from "../helpers/game-source.mjs";
const source = fs.readFileSync(new URL("../../js/ui/photo-studio.js", import.meta.url), "utf8").replace(/^const PhotoStudio/m, "var PhotoStudio");
const bodySource = fs.readFileSync(new URL("../../js/ui/photo-studio-ui.js", import.meta.url), "utf8").replace(/^const PhotoStudioBody/m, "var PhotoStudioBody");
// The light-store deps game.js passes to PhotoStudio.create, read from its one call site.
const GAME_JS = gameSource();
const GAME_CALL = GAME_JS.slice(GAME_JS.indexOf("PhotoStudio.create(G, {"), GAME_JS.indexOf("function openExperiencePhoto("));
const GAME_DEPS = new Set(["ltStore", "ltSet", "ltApply"].filter((k) => new RegExp("[{,]\\s*" + k + "\\s*[,:}]").test(GAME_CALL)));
function boot(options = {}) {
  const dom = makeDom(), order = [], downloads = [], canvasOps = [], storage = new Map(options.storage || []);
  const create = dom.document.createElement;
  dom.document.createElement = (tag) => {
    const el = create(tag);
    if (tag === "canvas") {
      el.getContext = () => ({
        createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: (image) => { el.pixel = image.data[0]; canvasOps.push(["pixels", el.pixel]); },
        getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(el.pixel) }),
        drawImage: (src, ...args) => { el.pixel = src.pixel; canvasOps.push(["draw", ...args]); },
        fillRect: (...args) => canvasOps.push(["caption", ...args]), fillText: () => {},
      });
      el.toDataURL = () => "data:image/jpeg;base64,ZmFrZQ==";
      el.toBlob = (cb) => options.encode ? options.encode(cb) : cb(options.nullBlob ? null : new Blob(["photo"], { type: "image/png" }));
    }
    if (tag === "a") el.click = () => downloads.push(el.download);
    return el;
  };
  let closed = 0, restored = null, overlays = true, current = options.priorCamera || { open: false };
  const ltProfiles = { value: options.profiles || {} };
  const LT = options.LT || { exposureMul: 1, contrast: 1, sunElev: 12 };
  const G = { $: dom.byId, canvas: dom.byId("game"), track: { name: "Monza", total: 1000 }, photoMode: !!options.priorPhoto,
    player: options.player || null, raceTimeOfDay: "day", raceWeather: "dry", weatherArc: options.arc || null,
    setTimeOfDay(v) { if (v !== undefined) G.raceTimeOfDay = v; return G.raceTimeOfDay; },
    weather(v) { if (v !== undefined) { G.weatherArc = null; G.raceWeather = v; } return G.raceWeather; },
    photoCam: { pos: [1, 2, 3], yaw: 1, pitch: 0.3, fov: 60 },
    get _ltStore() { return ltProfiles.value; }, set _ltStore(v) { ltProfiles.value = v; },
    gfx: { capturePixels: () => { order.push("read"); return options.readback || Promise.resolve({ width: 160, height: 90, data: new Uint8ClampedArray(160 * 90 * 4).fill(123) }); } } };
  const freeCam = {
    state: () => current,
    setOverlaysVisible: (on) => { overlays = on; },
    enterFrom: () => { order.push("enter"); G.photoMode = true; return true; },
    panel: () => dom.byId("freecam-inner"),
    close: (_pause, keep) => { closed++; order.push("close"); if (!keep) G.photoMode = false; },
    cmd: (v) => { current = v; restored = v; },
  };
  const garage = { prepareCapture: options.prepareCapture, snapshot: () => ({ az: 1, spin: options.garageSpin ?? true }), shot: (v) => order.push("shot:" + v), restore: (v) => { restored = v; order.push("restore"); },
    looks: options.looks, looked: options.looked, currentFov: () => 36 };
  const scene = { value: options.homeScene || "photo" };
  const ltWrites = [], latchWrites = [];
  const windowEvents = new Map();
  const ctx = vm.createContext({ document: dom.document, window: { dispatchEvent: () => {}, matchMedia: options.matchMedia,
    addEventListener: (type, fn) => windowEvents.set(type, fn),
    removeEventListener: (type, fn) => { if (windowEvents.get(type) === fn) windowEvents.delete(type); } },
    localStorage: { getItem: (k) => storage.get(k), setItem: (k, v) => { if (options.storageFull) throw new Error("Quota"); storage.set(k, v); }, removeItem: (k) => storage.delete(k) },
    CustomEvent: class {}, URL: { createObjectURL: () => "blob:photo", revokeObjectURL: () => {} },
    Log: { info: () => {}, warn: () => {} }, Tracks: { sample: (_t, s, out) => {
      out.p = [s, 2, 0]; out.t = [1, 0, 0]; out.r = [0, .6, .8]; // the right vector after banking
    } }, setTimeout: options.setTimeout || (() => 0), clearTimeout: () => {}, queueMicrotask, requestAnimationFrame: options.requestAnimationFrame || ((fn) => fn()), Blob, Uint8ClampedArray, indexedDB: options.indexedDB,
    AppearanceStudio: { setScene(mode) { scene.value = mode; return { durable: true }; } },
    VisorOptics: options.visorOptics, NativeDownload: options.nativeDownload, GLX: { isMobile: !!options.mobile },
    LightTune: options.noLightTune ? undefined : {
      LT,
      TUNE_DEFS: options.tuneDefs || [
        { id: "exposureMul", group: "IMAGE & COLOUR", label: "Exposure", min: 0.2, max: 3, step: 0.05 },
        { id: "contrast", group: "IMAGE & COLOUR", label: "Contrast", min: 0.5, max: 2, step: 0.05 },
        { id: "sunElev", group: "SUN & MOON", label: "Sun elevation", min: -20, max: 90, step: 1 },
      ],
    },
    LightStore: { reapply: () => { Object.assign(LT, ltProfiles.value["test|day|dry"]); order.push("lt-reapply"); } },
    DrivingLine: { shown: () => true, setPhoto: () => {} },
    GameStore: { store: { get: (k, d) => (k === "homeScene" ? scene.value : d), set: (k, v) => { if (k === "homeScene") scene.value = v; },
      // js/core/store.js rawSet/rawDel: false (never a throw) when the write fails.
      rawSet: (k, v) => { try { ctx.localStorage.setItem(k, v); return true; } catch (_) { return false; } },
      rawDel: (k) => { try { ctx.localStorage.removeItem(k); return true; } catch (_) { return false; } } } },
    createImageBitmap: options.bitmap || (async () => ({ width: 1024, height: 768, close: () => {} })) });
  vm.runInContext(fs.readFileSync(new URL("../../js/ui/setting-row.js", import.meta.url), "utf8"), ctx);
  ctx.SettingRow = ctx.window.SettingRow;
  if (options.withModalFocus) {
    dom.document.readyState = "loading";
    vm.runInContext(fs.readFileSync(new URL("../../js/ui/modal.js", import.meta.url), "utf8"), ctx, { filename: absSrc("js/ui/modal.js") });
    ctx.TopModal = ctx.window.TopModal;
  }
  vm.runInContext(bodySource, ctx, { filename: absSrc("js/ui/photo-studio-ui.js") }); vm.runInContext(source, ctx, { filename: absSrc("js/ui/photo-studio.js") });
  // LightStore.set's shape: the live LT plus whatever profiles object G._ltStore holds right now.
  const ltStore = { set: (id, v) => {
    ltWrites.push([id, v]); LT[id] = v;
    const key = "test|day|dry", prof = ltProfiles.value[key] || (ltProfiles.value[key] = {});
    prof[id] = v; return true;
  } };
  // game.js's setLightTune: the same store write, plus the renderer-recovery latch clears
  // (light-tune-edit.js). Photo Studio must never reach it (#5040).
  G.setLightTune = (id, v) => { latchWrites.push([id, v]); storage.delete("apex26.perChunkOff"); storage.delete("apex26.envProbeOff"); return ltStore.set(id, v); };
  // The light-store deps exactly as game.js hands them over, so this boot cannot pass while production differs.
  const PS = ctx.PhotoStudio, api = PS.create(G, { freeCam, garage, renderFrame: () => { order.push("draw"); options.renderSample?.(ctx.PhotoStudioBody.sampling); },
    ltStore: GAME_DEPS.has("ltStore") ? ltStore : undefined, ltSet: GAME_DEPS.has("ltSet") ? ltStore.set : undefined,
    borrowCar: options.borrowCar ? () => options.borrowCar(G) : undefined });
  return { api, PS, Body: ctx.PhotoStudioBody, dom, order, downloads, canvasOps, G, storage, scene, LT, ltProfiles, ltWrites, latchWrites, windowEvents,
    closed: () => closed, restored: () => restored, overlays: () => overlays };
}

test("garage and race lens controls keep POV independent and pass the same focus to capture", async () => {
  let capturedLens, b;
  b = boot({ renderSample: () => { capturedLens = b.PS.lens(); } });
  b.G.gfx.photoFocusAvailable = () => true;
  b.G.gfx.aspect = 2;
  b.G.canvas.getBoundingClientRect = () => ({ left: 20, top: 40, width: 900, height: 450 });
  const send = (type, x, y, extras) => b.windowEvents.get(type)({
    isPrimary: true, pointerId: 3, button: 0, target: b.G.canvas, clientX: x, clientY: y, ...extras,
  });
  const reticle = b.dom.byId("ps-focus-reticle"), slider = b.dom.byId("ps-focal-length");
  const auto = b.dom.byId("ps-focus-auto"), status = b.dom.byId("ps-focus-status");
  const depth = b.dom.byId("ps-depth-focus");
  // Depth focus ships opt-in: a tap does nothing until the toggle is on.
  assert.equal(b.api.open({ source: "home" }), true);
  assert.equal(depth.value, "off");
  assert.match(status.textContent, /Depth focus is off/);
  send("pointerdown", 245, 130); send("pointerup", 245, 130);
  assert.equal(b.PS.lens().focus, undefined, "Depth focus off: no focus at all, not autofocus (#6445)");
  assert.equal(reticle.hidden, true);
  depth.value = "on"; b.dom.dispatch(depth, { type: "change" });
  assert.equal(b.storage.get("apex26.photoDepthFocus"), "1");
  b.api.close(false);
  for (const [source, initial] of [["home", "28"], ["race", "16"]]) {
    assert.equal(b.api.open({ source }), true);
    assert.equal(depth.value, "on");
    assert.equal(slider.value, initial);
    const commands = b.order.slice(), pose = b.restored();
    slider.value = "80"; b.dom.dispatch(slider, { type: "input" });
    assert.equal(b.PS.lens().mm, 80);
    assert.deepEqual(b.order, commands);
    assert.equal(b.restored(), pose);
    assert.equal(b.PS.focalMm(b.PS.focalFov(80, 2), 2), 80);
    assert.ok(b.PS.focalFov(80, 2) < b.PS.focalFov(24, 2));

    send("pointerdown", 245, 130, { target: slider }); send("pointerup", 245, 130);
    send("pointerdown", 245, 130); send("pointermove", 275, 130); send("pointerup", 245, 130);
    send("pointerdown", 245, 130); send("pointercancel", 245, 130); send("pointerup", 245, 130);
    send("pointerdown", 245, 130); send("pointerdown", 251, 131, { isPrimary: false, pointerId: 4 }); send("pointerup", 245, 130);
    assert.equal(b.PS.lens().focus, null);
    assert.equal(reticle.hidden, true);
    for (const pointerType of ["mouse", "touch"]) {
      send("pointerdown", 245, 130, { pointerType }); send("pointerup", 245, 130, { pointerType });
      assert.deepEqual({ ...b.PS.lens().focus }, { x: 0.25, y: 0.8 });
    }
    assert.equal(reticle.hidden, false);
    assert.equal(status.textContent, "Focus distance locked.");
    const lock = b.PS.lens().focus;
    assert.equal(await b.api.capture(), true);
    assert.equal(capturedLens.focus, lock);
    assert.equal(capturedLens.mm, 80);
    b.dom.dispatch(auto, { type: "click" });
    assert.equal(b.PS.lens().focus, null);
    assert.equal(reticle.hidden, true);
    b.api.close(false);
    assert.equal(b.PS.lens(), null);
    assert.equal(b.windowEvents.has("pointerdown"), false);
  }
  b.G.gfx.photoFocusAvailable = () => false;
  b.api.open({ source: "home" });
  assert.match(status.textContent, /unavailable/);
  send("pointerdown", 245, 130); send("pointerup", 245, 130);
  assert.equal(b.PS.lens().focus, null);
  assert.equal(auto.disabled, true);
  b.G.gfx.photoFocusAvailable = () => true;
  assert.equal(b.PS.lens().focus, null, "a garage renderer that becomes ready starts in auto focus");
  assert.match(status.textContent, /Tap or click/);
});

test("a shot preset or a FOV slider hands the zoom back from FOCAL LENGTH (#6422 row 1)", async () => {
  // render() lets lens.mm override every fovY, so a stale focal length froze DETAIL/WIDE and the FOV sliders.
  const b = boot();
  b.G.gfx.aspect = 2;
  const slider = b.dom.byId("ps-focal-length"), frame = b.dom.byId("ps-car-frame");
  const focal = (mm) => { slider.value = String(mm); b.dom.dispatch(slider, { type: "input" }); };
  for (const source of ["garage", "race"]) {
    assert.equal(b.api.open({ source }), true);
    focal(80); assert.equal(b.PS.lens().mm, 80);
    b.dom.dispatch(frame, { type: "click" });
    assert.equal(b.PS.lens().mm, null, source + ": a preset drops the focal override");
    b.api.close(false);
  }
  assert.equal(b.api.open({ source: "race" }), true);
  for (const id of ["pc-fov", "fc-fov"]) {
    focal(50);
    b.windowEvents.get("input")({ target: { id: "ps-samples" } });
    assert.equal(b.PS.lens().mm, 50, "an unrelated input keeps the lens");
    b.windowEvents.get("input")({ target: { id } });
    assert.equal(b.PS.lens().mm, null, id + " drops the focal override");
  }
  await Promise.resolve();
  b.api.close(false);
  assert.equal(b.windowEvents.has("input"), false);
});

const shot = (b, label) => b.dom.byId("ps-shots").children.find((el) => el.textContent === label);

test("visor capture snapshots the rendered pose before asynchronous readback", async () => {
  let resolve, painted;
  const b = boot({ visorOptics: {
    captureSnapshot: G => ({ eye: G.camEye.slice() }),
    captureLight: (_image, _G, options) => { painted = options.snapshot; }
  } });
  b.G.camEye = [1, 2, 3];
  b.G.gfx.capturePixels = () => new Promise(r => { resolve = r; });
  b.api.open({ source: "race" });
  shot(b, "HELMET").click();
  const row = b.dom.byId("ps-visor-level"); row.value = "medium"; b.dom.dispatch(row, { type: "change" });
  const capture = b.api.capture();
  b.G.camEye[0] = 99;
  resolve({ width: 160, height: 90, data: new Uint8ClampedArray(160 * 90 * 4) });
  assert.equal(await capture, true);
  assert.deepEqual(painted.eye, [1, 2, 3]);
});

// #6397: Bryce saw the helmet's port surround painted into a photo taken from outside the car.
// The visor frame and its light belong to the HELMET seat only; every other angle captures plain.
test("visor frame and lighting are the HELMET seat's only, baked once before cropping, saving or downloading", async () => {
  const calls = [], ports = [], b = boot({ visorOptics: { captureSnapshot: () => undefined, captureLight(image, G, options) {
    calls.push({ width: image.width, height: image.height, options: { ...options }, G });
  }, capturePort(image) { ports.push(image.width); return true; } } });
  b.api.open({ source: "race" });
  assert.equal(b.dom.byId("ps-group-visor").hidden, true, "a free-camera angle shows no visor rows");
  for (const [key, value] of [["level", "strong"], ["beams", "off"], ["style", "compact"]]) {
    const el = b.dom.byId("ps-visor-" + key); el.value = value; b.dom.dispatch(el, { type: "change" });
  }
  assert.equal(b.dom.byId("ps-message").textContent, "Press Capture to preview the new visor look.");
  assert.equal(await b.api.capture(), true);
  assert.deepEqual([calls.length, ports.length], [0, 0], "no visor light or frame outside the helmet");
  shot(b, "COCKPIT").click();
  assert.equal(b.dom.byId("ps-group-visor").hidden, true, "the cockpit seat has no visor");
  assert.equal(await b.api.capture(), true);
  assert.deepEqual([calls.length, ports.length], [0, 0]);
  shot(b, "HELMET").click();
  assert.equal(b.dom.byId("ps-group-visor").hidden, false);
  assert.equal(await b.api.capture(), true);
  assert.equal(calls.length, 1); assert.deepEqual(ports, [160]);
  assert.deepEqual(calls[0].options, { frame: "on", level: "strong", beams: "off", style: "compact", helmet: true, snapshot: undefined });
  assert.deepEqual([calls[0].width, calls[0].height], [160, 90]);
  assert.equal(calls[0].G, b.G);
  const frame = b.dom.byId("ps-aspect"); frame.value = "square"; b.dom.dispatch(frame, { type: "change" });
  await b.api.exportPhoto(); await b.api.savePhoto(); b.dom.byId("ps-background").click();
  assert.equal(calls.length, 1, "recomposition and outputs reuse the same lit pixels");
  const hide = b.dom.byId("ps-visor-frame"); hide.value = "off"; b.dom.dispatch(hide, { type: "change" });
  assert.equal(await b.api.capture(), true);
  assert.deepEqual([calls.length, ports.length], [2, 1], "VISOR FRAME › HIDDEN keeps the light, drops the frame");
  shot(b, "CHASE").click();
  assert.equal(b.dom.byId("ps-group-visor").hidden, true, "leaving the seat hides the visor rows");
  assert.equal(await b.api.capture(), true); assert.equal(calls.length, 2);
  b.api.close(false); b.api.open({ source: "garage" });
  assert.equal(b.dom.byId("ps-group-visor").hidden, true, "garage has its own lighting pipeline");
  await b.api.capture(); assert.equal(calls.length, 2);
});

test("HELMET and COCKPIT presets seat the free camera in the race camera's driver's eye", () => {
  const { POV_SHOTS, visorOptions } = boot().Body;
  assert.deepEqual(Object.keys(POV_SHOTS), ["helmet", "cockpit"]);
  assert.deepEqual([POV_SHOTS.helmet.visor, POV_SHOTS.cockpit.visor], [true, false]);
  const v = { frame: "on", level: "light", beams: "medium", style: "classic" };
  const plain = (o) => JSON.parse(JSON.stringify(o));   // VM-realm objects
  assert.deepEqual(plain(visorOptions(false, "helmet", v)), { ...v, helmet: true });
  for (const [garage, pov] of [[false, "cockpit"], [false, null], [false, "chase"], [true, "helmet"]]) {
    assert.deepEqual(plain(visorOptions(garage, pov, v)), { level: "off", frame: "off", helmet: false }, garage + " " + pov);
  }
  const b = boot();
  b.api.open({ source: "race" });
  const labels = b.dom.byId("ps-shots").children.map((el) => el.textContent);
  assert.deepEqual(labels, ["CHASE", "WIDE", "DETAIL", "CORNER", "HELMET", "COCKPIT"]);
  for (const id of ["helmet", "cockpit"]) {
    shot(b, id.toUpperCase()).click();
    assert.equal(b.restored().pov, id, "FreeCam is asked for the race rig's seat");
    assert.equal(b.restored().fov, 64, "the race camera's standstill lens (CamFeel fallback)");
    assert.equal(b.restored().eye, undefined, "the seat's eye is solved by render, not placed here");
  }
  shot(b, "WIDE").click();
  assert.equal(b.restored().pov, undefined, "any other shot leaves the seat");
  b.api.close(false); b.api.open({ source: "garage" });
  assert.equal(shot(b, "HELMET"), undefined, "the garage keeps its own shot list");
});

test("a driver's-eye seat rides the placed car instead of reframing to CHASE", () => {
  const player = { s: 100, x: 0, px: 100, pz: 0, head: 0, yawVis: 0, speed: 0 };
  const b = boot({ player });
  b.G.paused = true;
  b.api.open({ source: "race" });
  shot(b, "COCKPIT").click();
  const seat = b.restored();
  b.dom.byId("ps-car-position-fwd").dispatchEvent({ type: "click", detail: 0 });
  assert.ok(Math.abs(player.s - 101) < 1e-9, "one metre along the lap");
  assert.equal(b.restored(), seat, "no CHASE reframe while seated");
  shot(b, "CHASE").click();
  b.dom.byId("ps-car-position-fwd").dispatchEvent({ type: "click", detail: 0 });
  assert.notEqual(b.restored().eye, undefined, "off the seat, placement reframes as before");
  b.api.close(false);
});

test("circuit position steps in metres along the lap and wraps at the line", () => {
  const { stepPosition, holdMetres, positionLabel } = boot().Body;
  assert.equal(stepPosition(50, 1000, 1), 50.1);
  assert.equal(stepPosition(50, 1000, -1), 49.9);
  assert.ok(Math.abs(stepPosition(99.95, 1000, 1) - 0.05) < 1e-9, "forward past the line wraps to the start");
  assert.ok(Math.abs(stepPosition(0, 1000, -1) - 99.9) < 1e-9, "back past the line wraps to the end");
  assert.equal(stepPosition(25, 0, 1), 25, "no lap length: unchanged");
  assert.deepEqual([0, 11, 12, 29, 30, 200].map(holdMetres), [1, 1, 5, 5, 25, 25], "a held press speeds up");
  assert.equal(positionLabel(25, 5793), "1448 m");
  assert.equal(positionLabel(25, 0), "25.0%");
});

test("◀ ▶, a held press and keyboard arrows drive the same metre step", () => {
  const timers = [];
  const player = { s: 500, x: 0, px: 500, pz: 0, head: 0, yawVis: 0, speed: 0 };
  const b = boot({ player, setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; } });
  b.G.paused = true;
  b.api.open({ source: "race" });
  const slider = b.dom.byId("ps-car-position"), fwd = b.dom.byId("ps-car-position-fwd"), back = b.dom.byId("ps-car-position-back");
  assert.equal(slider.step, "any", "the thumb itself is continuous (no snapping off the metre)");
  assert.equal(b.dom.byId("ps-car-position-value").textContent, "500 m");
  back.dispatchEvent({ type: "click", detail: 0 });
  assert.equal(player.s, 499); assert.equal(b.dom.byId("ps-car-position-value").textContent, "499 m");
  fwd.dispatchEvent({ type: "pointerdown", button: 0 });
  assert.equal(player.s, 500, "a press steps at once");
  fwd.dispatchEvent({ type: "click", detail: 1 });
  assert.equal(player.s, 500, "the pointer's click does not step twice");
  assert.equal(timers.at(-1).ms, 380);
  timers.at(-1).fn();
  for (let i = 0; i < 12; i++) timers.at(-1).fn();
  assert.equal(timers.at(-1).ms, 70);
  assert.equal(player.s, 500 + 11 + 2 * 5, "1 m ticks, then 5 m");
  fwd.dispatchEvent({ type: "pointerup" });
  const before = player.s;
  let prevented = false;
  slider.dispatchEvent({ type: "keydown", key: "ArrowLeft", isTrusted: true, preventDefault: () => { prevented = true; } });
  assert.equal(player.s, before - 1); assert.equal(prevented, true);
  slider.dispatchEvent({ type: "keydown", key: "ArrowRight", shiftKey: true, isTrusted: true, preventDefault() {} });
  assert.equal(player.s, before + 9, "Shift steps 10 m");
  slider.dispatchEvent({ type: "keydown", key: "ArrowRight", isTrusted: false, preventDefault() { throw new Error("pad arrows walk focus"); } });
  assert.equal(player.s, before + 9);
  b.api.close(false);
});

test("the seat-only visor rows follow the seat, and nudges wait while a capture is busy", async () => {
  let resolve;
  const player = { s: 500, x: 0, px: 500, pz: 0, head: 0, yawVis: 0, speed: 0 };
  const b = boot({ player });
  b.G.paused = true;
  b.api.open({ source: "race" });
  shot(b, "HELMET").click();
  assert.equal(b.dom.byId("ps-group-visor").hidden, false);
  b.restored().pov = null;                                   // FreeCam left the seat on fly input
  b.windowEvents.get("keyup")({ code: "KeyW" });
  assert.equal(b.dom.byId("ps-group-visor").hidden, true, "a fly key's release repaints the rows");
  b.G.gfx.capturePixels = () => new Promise(r => { resolve = r; });
  const capture = b.api.capture();
  const fwd = b.dom.byId("ps-car-position-fwd"), value = b.dom.byId("ps-car-position").value;
  fwd.dispatchEvent({ type: "click", detail: 0 });
  fwd.dispatchEvent({ type: "pointerdown", button: 0 });
  assert.equal(b.dom.byId("ps-car-position").value, value, "no readout drift while the car cannot move");
  assert.equal(player.s, 500);
  resolve({ width: 160, height: 90, data: new Uint8ClampedArray(160 * 90 * 4) });
  assert.equal(await capture, true);
  b.api.close(false);
});

test("a garage still waits for a fresh capture draw even when a previous photo exists", async () => {
  const b = boot();
  b.api.open({source: "garage"});
  assert.equal(await b.api.capture(), true);
  b.G.gfx.renderCaptureFrame = () => false;
  assert.equal(await b.api.capture(), false);
  assert.equal(b.dom.byId("ps-message").textContent,
    "Capture failed: The scene is still getting ready. Try again once the scene is ready.");
  assert.equal(b.order.filter(action => action === "read").length, 1);
  b.G.gfx.renderCaptureFrame = draw => { draw(); return true; };
  assert.equal(await b.api.capture(), true);
});

function chooseSamples(b, count) {
  const row = b.dom.byId("ps-samples");
  row.value = String(count);
  b.dom.dispatch(row, { type: "change" });
}

for (const count of [8, 32]) test(`${count}-sample capture freezes the camera and averages distinct subpixel renders`, async () => {
  const positions = [], views = [];
  const b = boot({
    setTimeout(fn, ms) { if (!ms) queueMicrotask(fn); return 1; },
    renderSample(pass) {
      const proj = new Float32Array(16), view = new Float32Array(16);
      proj[8] = pass.index + 0.25; view[12] = pass.index + 42;
      pass.project(proj, view, 4, 2);
      positions.push([(proj[8] - 0.25) * 2, proj[9]]);
      views.push(view[12]);
    },
  });
  b.api.open({ source: "garage" });
  assert.equal(b.api.state().samples, 1);
  chooseSamples(b, count);
  b.G.gfx.capturePixels = () => ({ width: 4, height: 2, data: new Uint8ClampedArray(32).fill(2 * positions.length) });
  assert.equal(await b.api.capture(), true);
  assert.equal(positions.length, count);
  for (const axis of [0, 1]) {
    const offsets = positions.map(p => p[axis]);
    assert.equal(new Set(offsets).size, count);
    assert.ok(offsets.every(v => Math.abs(v) < 0.5));
    assert.equal(offsets.reduce((a, v) => a + v, 0), 0);
  }
  assert.ok(views.every(v => v === 42));
  assert.equal(b.canvasOps.filter(op => op[0] === "pixels").at(-1)[1], count + 1);
  assert.equal(b.dom.byId("ps-body").inert, false);
});

test("closing a sampled capture cancels its pending read, releases controls and keeps online capture instant", async () => {
  const owners = [], cancelled = [];
  let currentPass;
  const b = boot({ renderSample(pass) {
    currentPass = pass;
    pass?.project(new Float32Array(16), new Float32Array(16), 4, 2);
  } });
  b.api.open();
  chooseSamples(b, 8);
  b.G.gfx.capturePixels = owner => { owners.push(owner); return new Promise(() => {}); };
  b.G.gfx.cancelCapture = (_msg, owner) => cancelled.push(owner);
  const first = b.api.capture();
  assert.ok(b.dom.byId("ps-body").inert);
  assert.equal(currentPass.pump, true);
  b.api.close(false);
  assert.deepEqual(cancelled, owners);
  assert.equal(await first, false);
  assert.equal(b.dom.byId("ps-body").inert, false);
  b.G.netPlay = { active: () => true };
  b.api.open();
  assert.equal(b.dom.byId("ps-samples").disabled, true);
  assert.equal(b.dom.byId("ps-samples").value, "1");
  b.G.gfx.capturePixels = () => ({ width: 4, height: 2, data: new Uint8ClampedArray(32) });
  assert.equal(await b.api.capture(), true);
  assert.equal(currentPass, null);
});

test("preparation survives only an owned Photo subject swap and restores usable focus on cancel", async () => {
  const dom = makeDom(), root = dom.document.createElement("div");
  root.id = "photo-studio"; dom.body.appendChild(root);
  const button = title => {
    const el = dom.document.createElement("button");
    el.textContent = title; el.getClientRects = () => [{}]; root.appendChild(el);
    return el;
  };
  const invoker = button("Choose subject");
  const current = button("Capture");
  root.getClientRects = () => root.hidden ? [] : [{}];
  const win = { ScreenRegions: { "photo-studio": { label:"Photo Studio", root:"#photo-studio" } } };
  let notify;
  class MutationObserver {
    constructor(update) { notify = () => queueMicrotask(update); }
    observe() {}
    disconnect() { notify = null; }
  }
  vm.runInNewContext(fs.readFileSync(absSrc("js/ui/screen-arranger.js"), "utf8"),
    { window:win, document:dom.document, MutationObserver }, { filename:absSrc("js/ui/screen-arranger.js") });
  const api = win.ScreenArranger;
  const buttons = () => [...root.querySelectorAll("button")];
  const start = () => buttons().find(el => el.textContent === "Start arranging");
  assert.equal(api.suspendPreparation("photo-studio"), null);
  assert.ok(api.prepare("photo-studio", invoker));
  const resume = api.suspendPreparation("photo-studio");
  invoker.remove();
  root.hidden = true;
  notify(); await Promise.resolve();
  assert.ok(start(), "one hidden observer tick during a scene swap retains the existing preparation");
  root.hidden = false; resume(true);
  assert.equal(dom.document.activeElement, start());
  buttons().find(el => el.textContent === "Cancel").click();
  assert.equal(dom.document.activeElement, current);
  resume(true);
  assert.equal(start(), undefined, "a stale completion cannot recreate a cancelled preparation");
  assert.ok(api.prepare("photo-studio", current));
  const failed = api.suspendPreparation("photo-studio");
  failed(false);
  assert.equal(start(), undefined);
  assert.ok(api.prepare("photo-studio", current));
  root.hidden = true; notify(); await Promise.resolve();
  assert.equal(start(), undefined, "a normal close still dismisses preparation");
});

test("Home circuit photo borrows a subject, places its complete pose, and returns ownership", () => {
  const prior = { px: 88 }, subject = {};
  let released = 0;
  const { api, G, dom, restored } = boot({ player: prior, borrowCar: (G) => {
    G.player = subject;
    return () => { G.player = prior; released++; };
  } });
  api.open({ source: "home-track" });
  assert.equal(api.hasCar(), true);
  const values = [["ps-car-position", "25"], ["ps-car-offset", "3"], ["ps-car-rotation", "90"]];
  for (const [id, value] of values) {
    const view = JSON.stringify(restored());
    dom.byId(id).value = value;
    dom.byId(id).dispatchEvent({ type: "input" });
    if (id === "ps-car-rotation") assert.equal(JSON.stringify(restored()), view, "rotating the car preserves the composed camera");
  }
  assert.equal(subject.s, 250); assert.equal(subject.x, 3);
  assert.equal(subject.px, 250); assert.equal(subject.pz, 3);
  assert.equal(subject.head, 0); assert.equal(subject.yawVis, Math.PI / 2);
  for (const [a, b] of [["rPrevS", "s"], ["rPrevX", "x"], ["rPrevPx", "px"], ["rPrevPz", "pz"], ["rPrevYawVis", "yawVis"], ["rPrevHead", "head"]]) {
    assert.equal(subject[a], subject[b], "no interpolation from a stale " + b);
  }
  api.close(false); api.close(false);
  assert.equal(released, 1); assert.equal(G.player, prior); assert.equal(api.hasCar(), false);
  assert.deepEqual(prior, { px: 88 });
  api.open({ source: "race" });
  assert.equal(api.hasCar(), false); assert.equal(G.player, prior);
});
for (const back of [false, true]) test(`race placement restores the exact paused pose on close(${back})`, () => {
  const player = { s: 432, x: 2, xVis: 1.8, px: 432, pz: 2, head: .3, yawVis: .2,
    speed: 77, rPrevS: 431, rPrevPx: 431, lap: 3, fuel: 42 };
  const before = { ...player }, b = boot({ player });
  b.G.paused = true;
  for (let visit = 0; visit < 2; visit++) {
    assert.equal(b.api.open({ source: "race" }), true);
    assert.equal(b.dom.byId("ps-group-car").hidden, false);
    assert.equal(b.api.hasCar(), true);
    assert.deepEqual(player, before, "opening never moves or stops the race car");
    assert.equal(+b.dom.byId("ps-car-position").value, 43.2);
    assert.equal(+b.dom.byId("ps-car-offset").value, 2);
    for (const [id, value] of [["ps-car-position", "25"], ["ps-car-offset", "3"], ["ps-car-rotation", "90"]]) {
      b.dom.byId(id).value = value; b.dom.byId(id).dispatchEvent({ type: "input" });
    }
    assert.equal(player.s, 250); assert.equal(player.pz, 3); assert.equal(player.speed, 0);
    assert.equal(player.head, 0); assert.equal(player.rPrevS, 250);
    b.api.close(back);
    assert.deepEqual(player, before, "including speed, interpolation history and absent properties");
    assert.equal(b.G.player, player);
  }
});

test("#6272: changing only Rotation keeps the exact paused position and offset", () => {
  const player = { s: 126.48, x: 1.234, xVis: 1.234, px: 126.5, pz: 1.2, head: .3, yawVis: 0, speed: 0 };
  const b = boot({ player }); b.G.paused = true;
  b.api.open({ source: "race" });
  // A native range snaps its value to the step (.1): model that rounding.
  b.dom.byId("ps-car-position").value = "12.6"; b.dom.byId("ps-car-offset").value = "1.2";
  b.dom.byId("ps-car-rotation").value = "45"; b.dom.byId("ps-car-rotation").dispatchEvent({ type: "input" });
  assert.equal(player.s, 126.48); assert.equal(player.x, 1.234);
  assert.equal(player.px, 126.5); assert.equal(player.pz, 1.2);
  assert.equal(player.yawVis, Math.PI / 4);
  b.dom.byId("ps-car-offset").dispatchEvent({ type: "input" });
  assert.equal(player.s, 126.48, "moving Sideways leaves the circuit position alone"); assert.equal(player.x, 1.2);
  b.api.close(false);
});
test("live online and unpaused sessions cannot reposition the race car", () => {
  for (const online of [false, true]) {
    const player = { s: 123, x: 0, speed: 80 }, b = boot({ player });
    b.G.paused = online; b.G.netPlay = { active: () => online };
    b.api.open({ source: "race" });
    assert.equal(b.api.hasCar(), false);
    assert.equal(b.dom.byId("ps-group-car").hidden, true);
    b.dom.byId("ps-car-position").value = "50";
    b.dom.byId("ps-car-position").dispatchEvent({ type: "input" });
    assert.deepEqual(player, { s: 123, x: 0, speed: 80 });
    b.api.close(false);
  }
});

// One shared object store, with serialized transactions and staged writes. A
// request's success is distinct from commit, and abort discards every staged
// mutation, so these tests exercise isolation and rollback rather than callbacks
// that immediately mutate a Map. Real multi-tab IndexedDB is the browser gate.
function photoDb(seed = []) {
  const rows = new Map(seed.map((row) => [row.id, row])), queue = [], failures = [];
  let active = false, hold = null, release = null, writes = 0;
  const start = () => {
    if (active || !queue.length) return;
    active = true; const state = queue.shift(), tx = state.tx;
    let staged = new Map(rows), ended = false;
    const finish = (error) => {
      if (ended) return; ended = true;
      if (error) { tx.error = error; if (tx.onabort) tx.onabort(); }
      else {
        if (state.mode === "readwrite") { rows.clear(); for (const row of staged) rows.set(...row); }
        if (tx.oncomplete) tx.oncomplete();
      }
      active = false; start();
    };
    tx.abort = () => finish(tx.error || new Error("Transaction aborted"));
    const step = () => {
      if (ended) return;
      const op = state.ops.shift();
      if (!op) {
        if (failures[0] === "commit" && state.mode === "readwrite") { failures.shift(); finish(new Error("Injected commit failure")); return; }
        if (state.held) { release = () => finish(); state.held(); }
        else finish();
        return;
      }
      if (failures[0] === op.kind) {
        failures.shift(); op.req.error = new Error("Injected " + op.kind + " failure");
        if (tx.onerror) tx.onerror({ target: op.req });
        setImmediate(() => finish(op.req.error)); return;
      }
      op.req.result = op.kind === "getAll" ? [...staged.values()] : op.kind === "put" ? (staged.set(op.value.id, op.value), op.value.id) : (staged.delete(op.value), undefined);
      if (op.req.onsuccess) op.req.onsuccess();
      setImmediate(step);
    };
    setImmediate(step);
  };
  const db = { close() {}, transaction(_store, mode) {
    const tx = { error: null }, state = { tx, mode, ops: [], held: mode === "readwrite" ? hold : null };
    if (mode === "readwrite") { writes++; hold = null; }
    const request = (kind, value) => {
      if (kind === "delete" && failures[0] === "delete-sync") { failures.shift(); throw new Error("Injected delete enqueue failure"); }
      const req = {}; state.ops.push({ kind, value, req }); return req;
    };
    tx.objectStore = () => ({ getAll: () => request("getAll"), put: (v) => request("put", v), delete: (v) => request("delete", v) });
    queue.push(state); setImmediate(start); return tx;
  } };
  return {
    rows, get writes() { return writes; }, failNext(kind) { failures.push(kind); },
    holdNextCommit() { return new Promise((resolve) => { hold = resolve; }); },
    releaseCommit() { const done = release; release = null; done(); },
    open() { const req = { result: db }; queueMicrotask(() => { if (req.onsuccess) req.onsuccess(); }); return req; },
  };
}
const seededPhotos = (n) => Array.from({ length: n }, (_, i) => ({ id: "old-" + i, at: i, title: "Old " + i, thumb: "data:image/jpeg;base64,ZmFrZQ==", blob: new Blob(["old"]) }));
const plain = (v) => JSON.parse(JSON.stringify(v));
const turn = () => new Promise((resolve) => setImmediate(resolve));
test("centre crops preserve composition across aspect ratios and filenames stay safe", () => {
  const { PS } = boot();
  assert.deepEqual(plain(PS.crop(1600, 900, "square")), { x: 350, y: 0, width: 900, height: 900 });
  assert.deepEqual(plain(PS.crop(1600, 900, "portrait")), { x: 440, y: 0, width: 720, height: 900 });
  assert.equal(PS.crop(1600, 900, "scene").width, 1600);
  assert.equal(PS.filename("../../My <Monza> Photo!"), "apex26-my-monza-photo.png");
});
test("PhotoStudio freeze omits unused ASPECTS and LIMIT exports", () => {
  const { PS } = boot();
  assert.equal("ASPECTS" in PS, false);
  assert.equal("LIMIT" in PS, false);
  assert.equal(typeof PS.crop, "function");
  assert.equal(typeof PS.filename, "function");
  assert.equal(typeof PS.create, "function");
});
test("import keeps small personal photos at native size (no resizeWidth upscale)", async () => {
  const calls = [];
  const b = boot({ bitmap: async (_file, opts) => {
    calls.push(opts);
    return { width: 400, height: 300, close: () => {} };
  } });
  b.api.open({ source: "garage" });
  const file = b.dom.byId("ps-import");
  file.files = [{ type: "image/jpeg", size: 1000 }];
  file.dispatchEvent({ type: "change" });
  await turn();
  assert.equal(calls.length, 1);
  assert.equal(calls[0], undefined, "createImageBitmap must not force resizeWidth on import");
  assert.equal(b.api.state().captured, true);
  // Default aspect is wide: compose centre-crops 400×300 → 400×225 (no upscale).
  assert.equal(b.api.state().width, 400);
  assert.equal(b.api.state().height, 225);
});
test("capture draws before reading a live backbuffer, omits DOM overlays and downloads actual image", async () => {
  const b = boot(); assert.equal(b.api.open({ source: "race" }), true);
  assert.equal(await b.api.capture(), true);
  assert.deepEqual(b.order.slice(-2), ["draw", "read"]);
  assert.equal(b.canvasOps[0][0], "pixels"); assert.equal(b.canvasOps[0][1], 123);
  assert.equal(b.api.state().captured, true);
  await b.api.exportPhoto(); assert.deepEqual(b.downloads, ["apex26-photo.png"]);
  b.api.close(true); assert.equal(b.closed(), 1); assert.equal(b.G.photoMode, false);
});
test("native photo export awaits the share outcome and reports a cancelled or failed download", async () => {
  for (const outcome of ["success", "cancel", "failure"]) {
    let resolve, reject, saved, calls = 0;
    const held = new Promise((yes, no) => { resolve = yes; reject = no; });
    const b = boot({ nativeDownload: { viable: () => true, isCancelled: (e) => e.name === "AbortError",
      saveBlob: (blob, name) => { calls++; saved = { blob, name }; return calls === 1 ? held : Promise.resolve(); } } });
    b.api.open(); await b.api.capture();
    const pending = b.api.exportPhoto();
    await b.api.exportPhoto();
    await new Promise(setImmediate);
    assert.equal(saved.name, "apex26-photo.png");
    assert.equal(await saved.blob.text(), "photo");
    assert.doesNotMatch(b.dom.byId("ps-message").textContent, /download requested/i);
    assert.deepEqual(b.downloads, []);
    assert.equal(calls, 1, "a second tap must not overlap the native chooser");
    assert.equal(b.api.state().busy, false, "download does not take ownership of capture/close busy state");
    assert.equal(b.dom.byId("ps-close").disabled, false);
    if (outcome === "success") resolve();
    else reject(Object.assign(new Error(outcome === "cancel" ? "Share canceled" : "disk full"), { name: outcome === "cancel" ? "AbortError" : "Error" }));
    await pending;
    // A dismissed share sheet is the player's choice, never "Download failed" (#5040).
    assert.equal(b.dom.byId("ps-message").textContent,
      outcome === "success" ? "PNG download requested." : outcome === "cancel" ? "Download cancelled." : "Download failed: disk full");
    await b.api.exportPhoto();
    assert.equal(calls, 2, "settlement allows a later export after success, cancellation, or failure");
  }
});

test("library DOWNLOAD shares the in-flight guard with PNG export and permits retry after a cancelled share", async () => {
  let reject, calls = 0;
  const held = new Promise((resolve, no) => { reject = no; });
  const b = boot({ nativeDownload: { viable: () => true, isCancelled: (e) => e.name === "AbortError",
    saveBlob: () => { calls++; return calls === 1 ? held : Promise.resolve(); } } });
  b.api.open({ source: "garage" }); await b.api.capture(); await b.api.savePhoto();
  const row = b.dom.byId("ps-library").children[0];
  const download = row.children.find((child) => child.textContent === "DOWNLOAD");
  download.click(); download.click();
  await b.api.exportPhoto();
  assert.equal(calls, 1, "library double taps and the PNG action cannot overlap native sharing");
  assert.equal(b.dom.byId("ps-close").disabled, false);
  reject(Object.assign(new Error("Share canceled"), { name: "AbortError" })); await turn();
  assert.equal(b.dom.byId("ps-message").textContent, "Download cancelled.");
  download.click(); await turn();
  assert.equal(calls, 2);
  assert.match(b.dom.byId("ps-message").textContent, /Photo download requested/);
});

test("closing and reopening during a photo export stays usable and ignores stale completion feedback", async () => {
  let finish, calls = 0;
  const held = new Promise((resolve) => { finish = resolve; });
  const b = boot({ nativeDownload: { viable: () => true, isCancelled: (e) => e.name === "AbortError",
    saveBlob: () => { calls++; return calls === 1 ? held : Promise.resolve(); } } });
  b.api.open({ source: "garage" }); await b.api.capture();
  const pending = b.api.exportPhoto(); await turn();
  b.api.close(false); b.api.open({ source: "garage" }); await b.api.capture();
  const message = b.dom.byId("ps-message").textContent;
  await b.api.exportPhoto();
  assert.equal(calls, 1, "the original chooser remains the in-flight download across reopen");
  finish(); await pending;
  assert.equal(b.dom.byId("ps-message").textContent, message);
  assert.equal(b.api.state().busy, false);
  await b.api.exportPhoto();
  assert.equal(calls, 2);
});
test("#3656: a live view below native resolution captures at renderScale 1, then restores the live scale", async () => {
  const b = boot(), scales = [];
  let scale = 0.5;   // the governor / a phone's title scene runs the backing store at half size
  const backing = () => ({ width: Math.round(1600 * scale), height: Math.round(900 * scale) });
  b.G.gfx.getRenderScale = () => scale;
  b.G.gfx.setRenderScale = (s) => { if (Math.abs(s - scale) < 0.02) return false; scale = s; scales.push(s); return true; };
  b.G.gfx.capturePixels = () => { const { width, height } = backing(); b.order.push("read@" + scale); return Promise.resolve({ width, height, data: new Uint8ClampedArray(width * height * 4) }); };
  b.api.open({ source: "race" }); assert.equal(await b.api.capture(), true);
  assert.deepEqual(b.order.slice(-2), ["draw", "read@1"], "the shot is drawn and read at full scale");
  const st = b.api.state();
  assert.deepEqual([st.width, st.height], [1600, 900], "photo = the full backing size, not the 800 x 450 live store");
  assert.deepEqual(scales, [1, 0.5]); assert.equal(scale, 0.5, "the live view keeps its scale");
  // A failed read still restores the live scale.
  b.G.gfx.capturePixels = () => Promise.reject(new Error("lost"));
  b.G.canvas.width = 0; scales.length = 0;
  assert.equal(await b.api.capture(), false);
  assert.deepEqual(scales, [1, 0.5]); assert.equal(scale, 0.5);
});
test("valid raw pixels finish capture even while software presentation is pending", async () => {
  const b = boot(); let rejectPresent;
  b.G.gfx.softPresent = () => true;
  b.G.gfx.invalidateSoftPresent = () => b.order.push("invalidate");
  b.G.gfx.awaitSoftPresent = () => { b.order.push("wait"); return new Promise((_, reject) => { rejectPresent = reject; }); };
  b.api.open(); const pending = b.api.capture();
  assert.deepEqual(b.order.slice(-4), ["invalidate", "wait", "draw", "read"]);
  const early = await Promise.race([pending, new Promise((resolve) => setImmediate(() => resolve("pending")))]);
  rejectPresent(new Error("2D blit timed out"));
  assert.equal(await pending, true);
  assert.equal(early, true);
  assert.deepEqual(b.canvasOps[0], ["pixels", 123]);
  assert.equal(b.order.at(-1), "read");
});
test("failed raw readback waits for the software canvas before copying it", async () => {
  const b = boot(), soft = b.dom.byId("game-soft");
  let present;
  soft.width = 160; soft.height = 90;
  b.G.gfx.softPresent = () => true;
  b.G.gfx.awaitSoftPresent = () => new Promise((resolve) => { present = resolve; });
  b.G.gfx.capturePixels = () => Promise.reject(new Error("No readback target"));
  b.api.open();
  const pending = b.api.capture();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(b.canvasOps.length, 0);
  present();
  assert.equal(await pending, true);
  assert.equal(b.canvasOps[0][0], "draw");
});
test("a backend without readback falls back to an immediate canvas copy", async () => {
  const b = boot(); b.G.canvas.width = 160; b.G.canvas.height = 90;
  b.G.gfx.capturePixels = () => { b.order.push("read-unavailable"); return Promise.reject(new Error("No readback target")); };
  b.api.open(); assert.equal(await b.api.capture(), true);
  assert.deepEqual(b.order.slice(-3), ["draw", "read-unavailable", "draw"]);
  assert.equal(b.canvasOps[0][0], "draw");
});
test("closing while readback is pending prevents an obsolete capture entering a reopened studio", async () => {
  let resolve; const b = boot({ readback: new Promise((r) => { resolve = r; }) });
  b.api.open(); const pending = b.api.capture(); b.api.close(false); b.api.open({ source: "garage" });
  resolve({ width: 160, height: 90, data: new Uint8ClampedArray(160 * 90 * 4) });
  assert.equal(await pending, false); assert.equal(b.api.state().captured, false); assert.equal(b.api.state().busy, false);
});
test("Done frees an instant read before the next capture, even without another present", async () => {
  const b = boot(), reads = [], cancelled = [];
  let queued = null;
  b.G.gfx.capturePixels = owner => {
    if (queued) return Promise.reject(new Error("capture already pending"));
    return new Promise(resolve => { queued = { owner, resolve }; reads.push(queued); });
  };
  b.G.gfx.cancelCapture = (_msg, owner) => {
    cancelled.push(owner);
    if (queued?.owner === owner) queued = null;
  };
  b.api.open();
  const first = b.api.capture();
  assert.equal(!!b.dom.byId("ps-body").inert, false, "instant capture does not use the sampled pass");
  b.dom.byId("ps-close").click();
  b.api.open({ source: "garage" });
  const second = b.api.capture();
  assert.equal(reads.length, 2, "the reopened visit has a queue slot before either read completes");
  assert.deepEqual(cancelled, [reads[0].owner]);
  assert.notEqual(reads[0].owner, reads[1].owner);
  const pixels = { width: 4, height: 2, data: new Uint8ClampedArray(32) };
  reads[0].resolve(pixels);
  assert.equal(await first, false);
  assert.equal(b.api.state().busy, true);
  assert.equal(b.api.state().captured, false);
  b.dom.byId("ps-close").click();
  assert.deepEqual(cancelled, reads.map(read => read.owner), "the old completion did not clear the second read's cancellation");
  assert.equal(await second, false);
  b.api.open({ source: "garage" });
  const third = b.api.capture();
  queued.resolve(pixels);
  assert.equal(await third, true);
});
test("a delayed save retains its original photo and cannot clear a reopened capture's busy state", async () => {
  let encode, read;
  const b = boot({ encode: (cb) => { encode = cb; } });
  b.api.open({ metadata: { title: "Old Monza photo" } }); await b.api.capture();
  const saved = b.api.savePhoto();
  b.api.close(false); b.api.open({ source: "garage", metadata: { title: "New garage" } }); await turn();
  b.G.gfx.capturePixels = () => new Promise((r) => { read = r; });
  const captured = b.api.capture();
  encode(new Blob(["old photo"], { type: "image/jpeg" })); await saved;
  assert.equal(b.api.state().busy, true, "old finally cannot enable a new operation's buttons");
  assert.match(b.dom.byId("ps-message").textContent, /Capturing/);
  assert.equal(b.dom.byId("ps-library").children[0].children[1].textContent, "Old Monza photo", "current visit displays the completed save");
  read({ width: 160, height: 90, data: new Uint8ClampedArray(160 * 90 * 4) }); await captured;
  b.api.close(false); b.api.open({ source: "garage" }); await turn();
  assert.equal(b.dom.byId("ps-library").children[0].children[1].textContent, "Old Monza photo", "persisted entry retains its initiating context");
});
test("garage camera snapshot is restored and a borrowed FreeCam returns only on normal exit", () => {
  const manual = boot({ garageSpin: false }); manual.api.open({ source: "garage" });
  assert.equal(manual.order.includes("shot:hero"), false);
  const garage = boot(); garage.api.open({ source: "garage" });
  assert.ok(garage.order.includes("shot:hero")); garage.api.close(true);
  assert.deepEqual(plain(garage.restored()), { az: 1, spin: true }); assert.equal(garage.closed(), 0);
  const prior = { open: true, speed: 25, roll: 5, lens: "flyby", eye: [1, 2, 3], target: [4, 5, 6], fov: 40 };
  const b = boot({ priorCamera: prior }); b.api.open(); b.api.close(true);
  assert.equal(b.restored(), prior); assert.equal(b.closed(), 0);
  b.api.open(); b.api.close(false); assert.equal(b.closed(), 1, "lifecycle teardown must hand ownership back to the game");
});
test("pre-existing photo mode keeps its pose on normal exit", () => {
  const b = boot({ priorPhoto: true }); b.api.open(); b.G.photoCam.pos[0] = 99; b.api.close(true);
  assert.equal(b.G.photoMode, true); assert.deepEqual(b.G.photoCam.pos, [1, 2, 3]);
});
test("DONE paints a busy state before restoring the scene (Escape door stays live)", () => {
  const frames = [], events = [];
  const b = boot({ requestAnimationFrame: (fn) => frames.push(fn) });
  b.api.open({ source: "garage", back: () => {
    events.push(b.dom.document.body.classList.contains("photo-studio-open") ? "class-on" : "class-off");
    events.push(b.dom.byId("photo-studio").hidden ? "hidden" : "visible");
    events.push("restored");
  } });
  b.api.close(true);
  assert.equal(b.api.state().busy, true);
  assert.equal(b.dom.byId("ps-close").disabled, false, "DONE stays the Escape door while CLOSING… paints");
  assert.equal(b.dom.byId("ps-close").textContent, "CLOSING…");
  assert.equal(b.dom.byId("ps-panel").getAttribute("aria-busy"), "true");
  assert.equal(b.dom.byId("photo-studio").hidden, false, "studio stays up so CLOSING… can paint");
  assert.ok(b.dom.document.body.classList.contains("photo-studio-open"));
  assert.deepEqual(events, []);
  assert.equal(b.order.includes("restore"), false);
  // A second DONE/Escape during CLOSING… must no-op (st.closing guard), not hang.
  b.api.close(true);
  assert.equal(frames.length, 1, "a second close while closing does not queue another restore");
  frames.shift()();
  assert.equal(b.order.includes("restore"), true);
  assert.deepEqual(events, ["class-off", "hidden", "restored"], "portrait rotate-device can read display after photo-studio-open is gone");
  assert.equal(b.dom.byId("photo-studio").hidden, true);
  assert.equal(b.api.state().busy, false);
  assert.equal(b.dom.byId("ps-close").textContent, "DONE");
});
test("DONE waits until after the caller's first restored paint before focusing", async () => {
  const frames = [], events = [], b = boot({ requestAnimationFrame: (fn) => frames.push(fn) });
  const overlay = b.dom.byId("overlay"), opener = b.dom.document.createElement("button"); overlay.appendChild(opener);
  const nativeFocus = opener.focus; let visible = true;
  opener.focus = () => { events.push(overlay.inert || !visible ? "blocked" : "focused"); if (!overlay.inert && visible) nativeFocus(); };
  opener.focus(); events.length = 0;
  b.api.open({ source: "home", back: () => queueMicrotask(() => { overlay.inert = false; events.push("isolated"); }) });
  overlay.inert = true; visible = false; b.api.close(true);
  assert.equal(b.dom.byId("ps-close").textContent, "CLOSING…");
  frames.shift()();
  await Promise.resolve();
  assert.deepEqual(events, ["isolated"], "the microtask settles isolation while visibility still prevents focus");
  assert.equal(b.dom.document.activeElement === b.dom.byId("ps-close"), true);
  frames.shift()();
  assert.deepEqual(events, ["isolated"], "the first frame must not focus while visibility remains hidden");
  assert.equal(frames.length, 1, "only one further frame is scheduled");
  visible = true; events.push("visible"); while (frames.length) frames.shift()();
  assert.deepEqual(events, ["isolated", "visible", "focused"]); assert.equal(b.dom.document.activeElement === opener, true);
});
test("queued opener focus cannot steal focus from a reopened Studio or a detached caller", () => {
  const frames = [], b = boot({ requestAnimationFrame: (fn) => frames.push(fn) });
  const opener = b.dom.document.createElement("button"); b.dom.document.body.appendChild(opener); opener.focus();
  b.api.open({ source: "home" }); b.api.close(true); frames.shift()(); frames.shift()(); b.api.open({ source: "garage" });
  while (frames.length) frames.shift()();
  assert.equal(b.dom.document.activeElement === b.dom.byId("ps-close"), true, "reopening between frames cancels opener focus");
  b.api.close(false); opener.focus(); b.api.open({ source: "home" }); b.api.close(true); frames.shift()();
  b.api.open({ source: "garage" }); b.api.close(false); b.dom.byId("overlay").focus();
  while (frames.length) frames.shift()();
  assert.equal(b.dom.document.activeElement === b.dom.byId("overlay"), true, "a new generation invalidates focus even after it closes");
  b.api.close(false); opener.focus(); b.api.open({ source: "home" }); b.api.close(true); frames.shift()(); opener.remove();
  while (frames.length) frames.shift()();
  assert.equal(b.dom.document.activeElement === b.dom.byId("ps-close"), true, "a detached opener is no longer a focus target");
});
test("#6259: a control focused while the restore is queued keeps focus over the opener", () => {
  const frames = [], b = boot({ requestAnimationFrame: (fn) => frames.push(fn) });
  const overlay = b.dom.byId("overlay"), opener = b.dom.document.createElement("button"), sibling = b.dom.document.createElement("button");
  overlay.appendChild(opener); overlay.appendChild(sibling); opener.focus();
  b.api.open({ source: "home", back: () => {} }); b.api.close(true);
  frames.shift()(); frames.shift()(); // DONE's frame, then the restore's first frame
  assert.equal(frames.length, 1, "the opener restore is still queued");
  sibling.focus();
  while (frames.length) frames.shift()();
  assert.equal(b.dom.document.activeElement === sibling, true, "the newer focus wins over the deferred opener restore");
  opener.focus(); b.api.open({ source: "home", back: () => {} }); b.api.close(true);
  while (frames.length) frames.shift()();
  assert.equal(b.dom.document.activeElement === opener, true, "with no newer focus the opener is still restored");
});
test("an import finishing after close is discarded and its bitmap is released", async () => {
  let resolve, disposed = 0;
  const b = boot({ bitmap: () => new Promise((r) => { resolve = r; }) }); b.api.open({ source: "garage" });
  const file = b.dom.byId("ps-import"); file.files = [{ type: "image/jpeg", size: 1000 }]; file.dispatchEvent({ type: "change" });
  b.api.close(false); b.api.open({ source: "garage" });
  resolve({ width: 1024, height: 768, close: () => disposed++ }); await turn();
  assert.equal(disposed, 1); assert.equal(b.api.state().captured, false); assert.equal(b.api.state().busy, false);
});
test("missing IndexedDB uses a visit-only library and localStorage quota failure remains recoverable", async () => {
  const b = boot({ storageFull: true }); b.api.open({ source: "garage" }); await b.api.capture(); await b.api.savePhoto();
  assert.match(b.dom.byId("ps-message").textContent, /this visit/);
  assert.equal(b.dom.byId("ps-library").children.length, 1);
  assert.equal(b.PS.setBackground("data:image/jpeg;base64,ZmFrZQ=="), false);
  assert.equal(b.PS.setBackground("javascript:alert(1)"), false);
  assert.equal(b.api.state().busy, false);
});

test("the menu background goes through GameStore's raw lane and reads back the same text (#5023)", () => {
  const b = boot(), img = "data:image/jpeg;base64,ZmFrZQ==";
  assert.equal(b.PS.setBackground(img), true);
  assert.equal(b.storage.get("apex26.photoBackground"), img, "stored bare, never JSON-quoted");
  assert.equal(b.PS.background(), img);
  assert.equal(b.PS.setBackground(""), true);
  assert.equal(b.storage.has("apex26.photoBackground"), false);
});

test("a captured or saved photo selects its own Home scene after the image is stored", async () => {
  for (const full of [false, true]) {
    const b = boot({homeScene: "garage", storageFull: full});
    b.api.open({source: "garage"}); await b.api.capture();
    b.dom.byId("ps-background").click();
    assert.equal(b.scene.value, full ? "garage" : "photo");
    assert.equal(!!b.PS.background(), !full);
    b.scene.value = "garage";
    await b.api.savePhoto();
    const bg = b.dom.byId("ps-library").children[0].children.find(el => el.textContent === "MENU BACKGROUND");
    bg.click();
    assert.equal(b.scene.value, full ? "garage" : "photo");
  }
});

for (const [resolution, width, height] of [["normal", 1920, 1080], ["4k", 3840, 2160]]) test(`${resolution} garage capture renders at the selected size and releases it before export`, async () => {
  const b = boot(), sizes = [];
  Object.assign(b.G.gfx, {width: 800, height: 450, setPhotoCaptureSize(size) { sizes.push(size); },
    capturePixels() { const size = sizes.at(-1); return { ...size, data: new Uint8ClampedArray(size.width * size.height * 4) }; }});
  b.api.open({source: "garage"});
  const select = b.dom.byId("ps-resolution"); select.value = resolution; b.dom.dispatch(select, {type:"change"});
  assert.equal(await b.api.capture(), true);
  assert.deepEqual([sizes[0].width, sizes[0].height, sizes[1]], [width,height,null]);
  assert.deepEqual([b.api.state().width,b.api.state().height], [width,height]);
  await b.api.exportPhoto(); assert.equal(b.downloads.length,1);
});

for (const initialScale of [1, 0.6]) test(`first Home capture transfers the garage scale owner before rendering (${initialScale})`, async () => {
  let garageOwner, scale = initialScale, size = null;
  const b = boot({ prepareCapture: () => garageOwner.endGarageRes(), renderSample: () => garageOwner.endGarageRes() });
  Object.assign(b.G.gfx, {
    isMobile: true, getRenderScale: () => scale, setRenderScale: value => { scale = value; },
    setPhotoCaptureSize: value => { size = value; },
    capturePixels: () => ({ width: b.G.gfx.width, height: b.G.gfx.height,
      data: new Uint8ClampedArray(b.G.gfx.width * b.G.gfx.height * 4) }),
  });
  Object.defineProperties(b.G.gfx, {
    width: { get: () => Math.round((size?.width || 852) * scale) },
    height: { get: () => Math.round((size?.height || 393) * scale) },
  });
  // Execute the real garage owner, including its saved pre-garage scale.
  const cameraSource = fs.readFileSync(new URL("../../js/garage/setup-camera.js", import.meta.url), "utf8");
  garageOwner = vm.createContext({ gfx: b.G.gfx });
  const ownerStart = cameraSource.indexOf("const GARAGE_PHONE_SCALE");
  vm.runInContext(cameraSource.slice(ownerStart, cameraSource.indexOf("// Panel coverage")), garageOwner,
    { filename: absSrc("js/garage/setup-camera.js"), lineOffset: cameraSource.slice(0, ownerStart).split("\n").length - 1 });
  garageOwner.pinGarageRes();
  b.api.open({ source: "home" });
  for (const [id, value] of [["ps-resolution", "4k"], ["ps-aspect", "scene"]]) {
    const row = b.dom.byId(id); row.value = value; b.dom.dispatch(row, { type: "change" });
  }
  assert.equal(await b.api.capture(), true);
  assert.deepEqual([b.api.state().width, b.api.state().height], [3840, 1771]);
  assert.equal(size, null, "capture releases its backing override");
  assert.equal(scale, initialScale, "restore the pre-garage scale, not the discarded garage pin");
  garageOwner.endGarageRes(); // the following ordinary Home photo frame
  assert.equal(scale, initialScale, "the released owner cannot change the following frame");
  b.api.close(false);
  garageOwner.pinGarageRes(); // ordinary Home garage resumes its own budget
  assert.equal(scale, Math.min(initialScale, 0.72));
  garageOwner.endGarageRes();
  assert.equal(scale, initialScale);
});

test("Home photo uses the same native framing at full and half render scale", async () => {
  const b = boot();
  let scale = 1, captureSize;
  Object.defineProperties(b.G.gfx, {
    width: { get: () => Math.round(390 * scale) },
    height: { get: () => Math.round(845 * scale) },
  });
  Object.assign(b.G.gfx, {
    getRenderScale: () => scale,
    setRenderScale: value => { scale = value; },
    setPhotoCaptureSize: size => { captureSize = size; },
    capturePixels() {
      const { width, height } = captureSize;
      return { width, height, data: new Uint8ClampedArray(width * height * 4) };
    },
  });
  b.api.open({ source: "home" });
  const dimensions = () => [b.api.state().width, b.api.state().height];
  assert.equal(await b.api.capture(), true);
  const native = dimensions();
  scale = 0.5;
  assert.equal(await b.api.capture(), true);
  assert.deepEqual(dimensions(), native);
  assert.equal(scale, 0.5);
  assert.equal(captureSize, null);
});

test("multi-sample 4K captures use a fresh draw for each sample and retain the selected resolution", async () => {
  const sizes = [];
  let freshDraws = 0;
  const b = boot({
    setTimeout(fn, ms) { if (!ms) queueMicrotask(fn); return 1; },
    renderSample(pass) { pass.project(new Float32Array(16), new Float32Array(16), 3840, 2); },
  });
  Object.assign(b.G.gfx, {
    width: 1920, height: 1, setPhotoCaptureSize(size) { sizes.push(size); },
    renderCaptureFrame(draw) { freshDraws++; draw(); return true; },
    capturePixels() {
      const size = sizes.at(-1);
      return { ...size, data: new Uint8ClampedArray(size.width * size.height * 4) };
    },
  });
  b.api.open({ source: "garage" });
  const select = b.dom.byId("ps-resolution"); select.value = "4k"; b.dom.dispatch(select, { type: "change" });
  const frame = b.dom.byId("ps-aspect"); frame.value = "scene"; b.dom.dispatch(frame, { type: "change" });
  chooseSamples(b, 8);
  assert.equal(await b.api.capture(), true);
  assert.equal(b.api.state().width, 3840);
  assert.equal(freshDraws, 8);
  assert.equal(sizes.at(-1), null);
});

test("closing an unfinished 4K capture releases its backing size once", async () => {
  const b = boot(), sizes = [];
  let finish;
  Object.assign(b.G.gfx, { width: 800, height: 450, setPhotoCaptureSize(size) { sizes.push(size); },
    capturePixels() { return new Promise(resolve => { finish = resolve; }); } });
  b.api.open();
  const select = b.dom.byId("ps-resolution"); select.value = "4k"; b.dom.dispatch(select, { type: "change" });
  const pending = b.api.capture();
  b.api.close(false);
  assert.equal(sizes.at(-1), null);
  finish({ width: 1, height: 1, data: new Uint8ClampedArray(4) });
  assert.equal(await pending, false); assert.equal(sizes.length, 2);
});

test("failed PNG encoding reports a recoverable error instead of creating a bogus download", async () => {
  const b = boot({ nullBlob: true }); b.api.open(); await b.api.capture(); await b.api.exportPhoto();
  assert.equal(b.downloads.length, 0); assert.match(b.dom.byId("ps-message").textContent, /could not be encoded/);
});

test("Studio uses canonical sheet regions and enumerated controls with a persistent capture/done footer", () => {
  const b = boot(); b.api.open();
  const panel = b.dom.byId("ps-panel"), body = b.dom.byId("ps-body");
  assert.deepEqual(panel.children.map((el) => el.className), ["sheet-head", "sheet-body pane", "sheet-foot"]);
  assert.equal(b.dom.byId("ps-close").parentElement, panel.children[2]);
  assert.equal(b.dom.byId("ps-capture").parentElement, panel.children[2]);
  assert.equal(b.dom.byId("ps-capture").classList.contains("bigbtn"), true);
  assert.equal(body.contains(b.dom.byId("ps-export")), true);
  // Each saved region must resolve on the real, lazily constructed Studio
  // DOM, including collapsed panels. The framing guide cannot be displaced.
  const reg = { window: {} };
  vm.runInNewContext(fs.readFileSync(new URL("../../js/ui/screen-regions.js", import.meta.url), "utf8"), reg, { filename: absSrc("js/ui/screen-regions.js") });
  const studio = b.dom.byId("photo-studio"), guide = b.dom.byId("ps-guide");
  for (const part of Object.values(reg.window.ScreenRegions["photo-studio"].regions)) {
    const region = studio.querySelector(part.selector);
    assert.ok(region && !region.contains(guide), part.label);
  }
  const frame = b.dom.byId("ps-aspect"); frame.value = "portrait"; b.dom.dispatch(frame, { type: "change" });
  assert.equal(b.api.state().aspect, "portrait");
  b.dom.byId("ps-aspect-row-next").click(); assert.equal(b.api.state().aspect, "scene");
  const caption = b.dom.byId("ps-postcard"); caption.value = "on"; b.dom.dispatch(caption, { type: "change" });
  assert.equal(b.api.state().postcard, true);
});
test("Studio suspends a borrowed FreeCam's guides and restores them on returning to its owner", () => {
  const b = boot({ priorCamera: { open: true } }); b.api.open();
  assert.equal(b.overlays(), false); b.api.close(true); assert.equal(b.overlays(), true);
});

test("concurrent Studio saves in separate instances keep exactly six durable photos", async () => {
  const idb = photoDb(seededPhotos(6)), a = boot({ indexedDB: idb }), b = boot({ indexedDB: idb });
  a.api.open({ metadata: { title: "Tab A" } }); b.api.open({ metadata: { title: "Tab B" } });
  await Promise.all([a.api.capture(), b.api.capture()]);
  await Promise.all([a.api.savePhoto(), b.api.savePhoto()]);
  assert.equal(idb.rows.size, 6);
  assert.equal(idb.writes, 2, "each save has one atomic write transaction");
  assert.deepEqual([...idb.rows.values()].filter((row) => /^Tab /.test(row.title)).map((row) => row.title).sort(), ["Tab A", "Tab B"]);
  assert.equal(idb.rows.has("old-0"), false); assert.equal(idb.rows.has("old-1"), false);
});
test("saving repairs a previously oversized library in the same transaction", async () => {
  const idb = photoDb(seededPhotos(9)), b = boot({ indexedDB: idb });
  b.api.open(); await b.api.capture(); await b.api.savePhoto();
  assert.equal(idb.rows.size, 6); assert.equal(idb.writes, 1);
  assert.deepEqual([...idb.rows.keys()].filter((id) => id.startsWith("old-")).sort(), ["old-4", "old-5", "old-6", "old-7", "old-8"]);
});
test("a save after the device clock goes backward is committed and remains the newest photo", async () => {
  const future = Date.now() + 60_000;
  const idb = photoDb(seededPhotos(6).map((row) => ({ ...row, at: future + row.at })));
  const b = boot({ indexedDB: idb });
  b.api.open({ metadata: { title: "After clock adjustment" } });
  await b.api.capture(); await b.api.savePhoto();
  assert.equal(idb.rows.size, 6);
  assert.equal(idb.rows.has("old-0"), false);
  assert.equal((await b.api.album())[0].title, "After clock adjustment");
  assert.equal(b.dom.byId("ps-message").textContent, "Saved to My Photos on this device.");
});
test("save remains busy and unannounced until the write transaction commits", async () => {
  const idb = photoDb(seededPhotos(6)), b = boot({ indexedDB: idb });
  b.api.open(); await b.api.capture(); const held = idb.holdNextCommit(), saving = b.api.savePhoto(); await held;
  assert.equal(b.api.state().busy, true); assert.doesNotMatch(b.dom.byId("ps-message").textContent, /Saved to My Photos/);
  assert.deepEqual([...idb.rows.keys()], seededPhotos(6).map((p) => p.id), "request success has not changed durable rows");
  idb.releaseCommit(); await saving;
  assert.equal(b.api.state().busy, false); assert.match(b.dom.byId("ps-message").textContent, /Saved to My Photos/);
});
test("put, prune, and commit failures roll back all durable changes and retain a visit-only photo", async () => {
  for (const failure of ["put", "delete", "delete-sync", "commit"]) {
    const seed = seededPhotos(6), idb = photoDb(seed), b = boot({ indexedDB: idb });
    b.api.open(); await b.api.capture(); idb.failNext(failure); await b.api.savePhoto();
    assert.deepEqual([...idb.rows.keys()], seed.map((p) => p.id), failure + " cannot commit a partial save or prune");
    assert.match(b.dom.byId("ps-message").textContent, /Saved for this visit/);
    assert.equal(b.api.state().busy, false);
    assert.equal(b.dom.byId("ps-library").children[0].children[1].textContent, "Photo");
  }
});

test("a visit-only save survives clock rollback, reopen, and a later durable save", async () => {
  const future = Date.now() + 60_000;
  const seed = seededPhotos(6).map((p) => ({ ...p, at: future + p.at }));
  const db = photoDb(seed), b = boot({ indexedDB: db });
  const titles = () => Array.from(b.dom.byId("ps-library").children, (row) => row.children[1].textContent);
  b.api.open({ metadata: { title: "Visit photo" } });
  await b.api.capture(); db.failNext("put"); await b.api.savePhoto();
  assert.deepEqual([...db.rows.values()], seed);
  assert.equal(titles()[0], "Visit photo");
  b.api.close(false); b.api.open({ metadata: { title: "Durable photo" } });
  assert.deepEqual(Array.from(await b.api.album(), (p) => p.title), titles());
  assert.equal(titles()[0], "Visit photo");
  await b.api.capture(); await b.api.savePhoto();
  assert.deepEqual(titles().slice(0, 2), ["Durable photo", "Visit photo"]);
  assert.equal(titles().length, 6);
});

test("a failed album deletion leaves a reopened Studio's notice alone", async () => {
  const db = photoDb(seededPhotos(1)), b = boot({ indexedDB: db });
  b.api.open(); await b.api.album();
  const remove = () => b.dom.byId("ps-library").children[0].children[4].click();
  db.failNext("delete"); remove();
  b.api.close(false); b.api.open({ source: "garage" });
  const notice = b.dom.byId("ps-message").textContent;
  await b.api.album();
  assert.equal(b.dom.byId("ps-message").textContent, notice);
  db.failNext("delete"); remove(); await b.api.album();
  assert.equal(b.dom.byId("ps-message").textContent, "Photo could not be deleted.");
  assert.equal(db.rows.size, 1);
});

test("equal timestamps prune deterministically by ID instead of request or enumeration order", async () => {
  const seed = seededPhotos(8).map((row) => ({ ...row, at: 1 })).reverse(), idb = photoDb(seed), b = boot({ indexedDB: idb });
  b.api.open(); await b.api.capture(); await b.api.savePhoto();
  assert.deepEqual([...idb.rows.keys()].filter((id) => id.startsWith("old-")).sort(), ["old-3", "old-4", "old-5", "old-6", "old-7"]);
});
test("saving to a full album evicts the last displayed photo when legacy timestamps tie", async () => {
  const db = photoDb(seededPhotos(6).map((row) => ({ ...row, at: 100 })));
  const b = boot({ indexedDB: db });
  const titles = () => Array.from(b.dom.byId("ps-library").children, (row) => row.children[1].textContent);
  b.api.open({ metadata: { title: "New capture" } });
  const before = Array.from(await b.api.album(), (photo) => photo.title);
  assert.deepEqual(titles(), before);
  await b.api.capture(); await b.api.savePhoto();
  const expected = ["New capture", ...before.slice(0, 5)];
  assert.deepEqual(titles(), expected);
  assert.deepEqual(Array.from(await b.api.album(), (photo) => photo.title), expected);
});
for (const fallback of [false, true]) test(`a late ${fallback ? "visit-only" : "durable"} save appears in the reopened album with its original bytes`, async () => {
  const db = photoDb(seededPhotos(1));
  let finishEncode, downloaded;
  const b = boot({ indexedDB: db, withModalFocus: true, encode: cb => { finishEncode = cb; },
    nativeDownload: { viable: () => true, saveBlob: blob => { downloaded = blob; return Promise.resolve(); } } });
  b.api.open({ metadata: { title: "Earlier shot" } }); await b.api.capture();
  const saving = b.api.savePhoto();
  b.api.close(false); b.api.open({ source: "garage", metadata: { title: "Current shot" } });
  await b.api.album();   // the new visit's initial gallery read finishes before the JPEG is ready
  let finishCapture;
  b.G.gfx.capturePixels = () => new Promise(resolve => { finishCapture = resolve; });
  const capturing = b.api.capture(), notice = b.dom.byId("ps-message").textContent;
  b.dom.byId("ps-library").children[0].children[4].focus();
  if (fallback) db.failNext("put");
  finishEncode(new Blob(["original capture bytes"], { type: "image/jpeg" })); await saving;
  assert.equal(b.api.state().busy, true);
  assert.equal(b.dom.byId("ps-message").textContent, notice);
  const row = b.dom.byId("ps-library").children[0];
  assert.equal(row.children[1].textContent, "Earlier shot");
  assert.equal(db.rows.size, fallback ? 1 : 2);
  assert.equal(b.dom.document.activeElement.parentElement.children[1].textContent, "Old 0", "DELETE still targets the previously focused photo");
  assert.equal(b.dom.document.activeElement.textContent, "DELETE");
  row.children.find(el => el.textContent === "DOWNLOAD").click(); await turn();
  assert.equal(await downloaded.text(), "original capture bytes");
  finishCapture({ width: 160, height: 90, data: new Uint8ClampedArray(160 * 90 * 4) }); await capturing;
});
test("a committed save from a closed Studio retains its original metadata without touching a reopened session", async () => {
  const idb = photoDb(), b = boot({ indexedDB: idb });
  b.api.open({ metadata: { title: "Earlier session" } }); await b.api.capture();
  const held = idb.holdNextCommit(), saving = b.api.savePhoto(); await held;
  b.api.close(false); b.api.open({ source: "garage", metadata: { title: "Current session" } });
  let read; b.G.gfx.capturePixels = () => new Promise((resolve) => { read = resolve; });
  const capturing = b.api.capture(); idb.releaseCommit(); await saving;
  assert.equal([...idb.rows.values()][0].title, "Earlier session");
  assert.equal(b.api.state().busy, true); assert.match(b.dom.byId("ps-message").textContent, /Capturing/);
  read({ width: 160, height: 90, data: new Uint8ClampedArray(160 * 90 * 4) }); await capturing;
});
test("the SUBJECT row shows only when the door offers one, and hands the other pick back without changing anything itself", async () => {
  const b = boot(), picks = [];
  const group = b.dom.byId("ps-subject-row").parentElement, sel = b.dom.byId("ps-subject");
  assert.equal(b.api.open({ source: "garage" }), true);
  assert.equal(group.hidden, true, "a garage or race door offers no subject");
  assert.equal(b.api.state().subject, false);
  b.api.close(false);
  assert.equal(b.api.open({ source: "home", subject: (v) => { picks.push(v); return Promise.resolve(true); } }), true);
  assert.equal(group.hidden, false);
  assert.equal(b.api.state().subject, true);
  assert.equal(sel.value, "garage", "a Home garage opens on GARAGE");
  sel.value = "garage"; sel.dispatchEvent({ type: "change" });
  assert.deepEqual(picks, [], "re-picking the shown subject is not a switch");
  sel.value = "circuit"; sel.dispatchEvent({ type: "change" });
  assert.deepEqual(picks, ["circuit"], "the pick goes to the door; the studio swaps nothing itself");
  assert.equal(b.api.state().source, "home", "still open on the garage until the door reopens it");
  b.api.close(false);
  assert.equal(b.api.open({ source: "home-track", subject: (v) => { picks.push(v); return Promise.resolve(true); } }), true);
  assert.equal(sel.value, "circuit", "a Home circuit opens on CIRCUIT");
  b.api.close(false);
  assert.equal(b.api.open({ source: "race" }), true);
  assert.equal(group.hidden, true, "the pause-menu door (already on the circuit) offers no subject");
  b.api.close(false);
});

test("leaks #1: closing the studio releases the composed canvas and its preview source", async () => {
  const b = boot(); assert.equal(b.api.open({ source: "race" }), true);
  assert.equal(await b.api.capture(), true);
  const preview = b.dom.byId("ps-preview"), removed = [], remove = preview.removeAttribute;
  preview.removeAttribute = (k) => { removed.push(k); return remove.call(preview, k); };   // mini-dom keeps `src` as a plain property
  assert.ok(preview.src, "preview holds the thumbnail while open"); assert.equal(b.api.state().captured, true);
  b.api.close(true);
  assert.equal(b.api.state().captured, false, "`last` canvas is dropped");
  assert.deepEqual(removed, ["src"], "the ~640x360 JPEG data URL is dropped"); assert.equal(preview.hidden, true);
  await b.api.exportPhoto(); assert.deepEqual(b.downloads, [], "nothing left to export after close");
});

test("deferred capture keeps its requested composition; recrop retains the uncropped frame", async () => {
  let resolve; const b = boot({ readback: new Promise((r) => { resolve = r; }) });
  b.api.open({ metadata: { title: "Requested moment" } });
  const pending = b.api.capture();
  for (const [id, value] of [["ps-aspect", "portrait"], ["ps-postcard", "on"]]) {
    const el = b.dom.byId(id); el.value = value; el.dispatchEvent({ type: "change", target: el });
  }
  resolve({ width: 160, height: 90, data: new Uint8ClampedArray(160 * 90 * 4) });
  assert.equal(await pending, true);
  assert.match(b.dom.byId("ps-message").textContent, /160 × 90/);
  assert.equal(b.canvasOps.some((op) => op[0] === "caption"), false);
  const aspect = b.dom.byId("ps-aspect"); aspect.value = "square"; aspect.dispatchEvent({ type: "change", target: aspect }); aspect.value = "portrait"; aspect.dispatchEvent({ type: "change", target: aspect });
  assert.ok(b.canvasOps.some((op) => op[0] === "draw" && op[1] === 44 && op[3] === 72));
  aspect.value = "wide"; aspect.dispatchEvent({ type: "change", target: aspect });
  assert.ok(b.canvasOps.some((op) => op[0] === "draw" && op[1] === 0 && op[3] === 160), "wide recrop recovers both clipped sides");
  b.api.close(false); const count = b.canvasOps.length;
  aspect.value = "square"; aspect.dispatchEvent({ type: "change", target: aspect });
  assert.equal(b.canvasOps.length, count, "close releases the recrop source");
});

test("coaching is optional DOM content; presets cannot move a pending capture", async () => {
  let resolve; const b = boot({ readback: new Promise((r) => { resolve = r; }) });
  b.api.open({ source: "garage" }); const pending = b.api.capture();
  b.dom.byId("ps-shots").children[1].click();
  assert.deepEqual(b.order.filter((s) => s.startsWith("shot:")), ["shot:hero"]);
  const coach = b.dom.byId("ps-coach"); coach.children[coach.children.length - 1].click();
  assert.equal(coach.hidden, true);
  resolve({ width: 160, height: 90, data: new Uint8ClampedArray(160 * 90 * 4) }); await pending;
  b.api.close(false); b.api.open({ source: "garage" }); assert.equal(coach.hidden, true);
});

test("contact sheet captures three sequential renderer frames and labels one bounded PNG", async () => {
  const b = boot(); const times = [], captureTimes = [1, 2, 3];
  assert.equal(await b.api.contactSheet(captureTimes, (t) => times.push(t), () => false), true);
  assert.deepEqual(times, captureTimes); assert.equal(b.order.filter((s) => s === "read").length, 3);
  assert.deepEqual(b.downloads, ["apex26-replay-moment.png"]);
  assert.equal(b.canvasOps.filter((op) => op[0] === "caption").length, 3);
  assert.equal(await b.api.contactSheet(captureTimes, () => {}, () => true).catch(() => false), false);
  assert.equal(b.downloads.length, 1, "cancel does not download");
});

for (const outcome of ["success", "write failure", "share cancellation"]) test(`contact sheet awaits native export ${outcome}`, async () => {
  let resolve, reject, calls = 0, saved, settled = false;
  const held = new Promise((yes, no) => { resolve = yes; reject = no; });
  const b = boot({ nativeDownload: { viable: () => true, saveBlob: (blob, name) => {
    calls++; saved = { blob, name }; return held;
  } } });
  const pending = b.api.contactSheet([1, 2, 3], () => {}, () => false);
  pending.then(() => { settled = true; }, () => { settled = true; });
  await turn();
  assert.equal(calls, 1);
  assert.equal(saved.name, "apex26-replay-moment.png");
  assert.equal(await saved.blob.text(), "photo");
  assert.deepEqual(b.downloads, [], "native export must not fall back to an anchor");
  assert.equal(settled, false, "contact-sheet completion must wait for native saving and sharing");
  if (outcome === "success") {
    resolve();
    assert.equal(await pending, true);
  } else {
    const error = new Error(outcome === "share cancellation" ? "Share canceled" : "disk full");
    const rejected = assert.rejects(pending, (caught) => caught === error);
    reject(error);
    await rejected;
  }
  assert.equal(settled, true);
});

test("album exposes bounded safe read-only thumbnails and recovers with visit photos", async () => {
  const db = photoDb(seededPhotos(8)); const b = boot({ indexedDB: { open: () => db.open() } });
  const rows = await b.PS.album(); assert.equal(rows.length, 6);
  assert.deepEqual(Object.keys(rows[0]).sort(), ["at", "id", "thumb", "title"]);
  assert.equal(Object.isFrozen(rows[0]), true);
  const fallback = boot(); await assert.rejects(fallback.PS.album(), /storage unavailable/);
  fallback.api.open(); await fallback.api.capture(); await fallback.api.savePhoto();
  assert.equal((await fallback.PS.album()).length, 1);
});

test("Studio state exposes monotonic session generation across same-open reentry", () => {
  const b = boot(); b.api.open(); const first = b.PS.state();
  assert.equal(first.open, true); assert.equal(typeof first.generation, "number");
  b.api.close(false); b.api.open(); const next = b.PS.state();
  assert.equal(next.open, first.open); assert.ok(next.generation > first.generation);
});

test("#1895: the Home title art does not paint over a live Photo Studio subject", () => {
  const css = fs.readFileSync(new URL("../../css/experience.css", import.meta.url), "utf8");
  assert.match(css, /body\.photo-studio-open #overlay\[data-home-ready="1"\] #title-car \{ display: none; \}/,
    "once the garage/track subject has painted, #title-car must be hidden while the studio is open");
});

test("game.js hands Photo Studio the light store, so PHOTO LIGHTING never needs setLightTune (#5040)", () => {
  assert.ok(GAME_CALL.length > 0, "game.js still builds Photo Studio with PhotoStudio.create(G, {...})");
  assert.ok(GAME_DEPS.has("ltStore") || GAME_DEPS.has("ltSet"), "PhotoStudio.create gets a light-store writer");
});

test("PHOTO LIGHTING sliders are this photo only: no latch clear, no saved-tune write (#5040)", () => {
  const original = { "test|day|dry": { carEnvCube: 0 } };
  const b = boot({ profiles: original, LT: { exposureMul: 1, contrast: 1, sunElev: 12 } });
  b.storage.set("apex26.perChunkOff", "1"); b.storage.set("apex26.envProbeOff", "1");
  b.api.open({ source: "race" });
  const inp = b.dom.byId("ps-lt-in-exposureMul");
  inp.value = "2"; inp.dispatchEvent({ type: "input" });
  assert.deepEqual(b.ltWrites, [["exposureMul", 2]], "the slider reached the live store");
  assert.deepEqual(b.latchWrites, [], "never through setLightTune");
  assert.equal(b.storage.get("apex26.perChunkOff"), "1"); assert.equal(b.storage.get("apex26.envProbeOff"), "1");
  b.api.close(false);
  assert.equal(b.G._ltStore, original, "the saved profiles come back untouched");
  assert.deepEqual(original, { "test|day|dry": { carEnvCube: 0 } });
});

test("Photo Lighting clones the profile store, writes via the light store, and restores the exact original reference on close", () => {
  const original = { "monza|day|dry": { exposureMul: 1.1 } };
  const b = boot({ profiles: original });
  assert.equal(b.api.open({ source: "race" }), true);
  const group = b.dom.byId("ps-lt-tabs").closest("section");
  assert.equal(group.hidden, false, "PHOTO LIGHTING shows on a circuit shoot");
  assert.equal(group.getAttribute("aria-label"), "PHOTO LIGHTING");
  assert.ok(b.dom.byId("ps-lt-tab-sun-moon"), "builds a tab per TUNE_DEFS group");
  assert.ok(b.dom.byId("ps-lt-in-exposureMul"), "lazy range for each knob");
  assert.notEqual(b.G._ltStore, original, "open swaps in a clone");
  assert.equal(JSON.stringify(b.G._ltStore), JSON.stringify(original));
  const inp = b.dom.byId("ps-lt-in-exposureMul");
  inp.value = "2"; inp.dispatchEvent({ type: "input" });
  assert.deepEqual(b.ltWrites, [["exposureMul", 2]]);
  assert.equal(b.LT.exposureMul, 2);
  assert.equal(b.dom.byId("ps-lt-reset").disabled, false);
  b.dom.byId("ps-lt-reset").click();
  assert.equal(b.order.includes("lt-reapply"), true, "RESET re-applies the snap");
  assert.equal(JSON.stringify(b.G._ltStore), JSON.stringify(original), "RESET restores open-time values");
  inp.value = "2.5"; inp.dispatchEvent({ type: "input" });
  b.api.close(false);
  assert.equal(b.G._ltStore, original, "close restores the exact original profiles reference");
  assert.equal(original["monza|day|dry"].exposureMul, 1.1, "original map was never mutated");
});

test("every lighting-tuner control stays available across race, garage and circuit Studio visits", () => {
  const knobs = vm.runInNewContext(fs.readFileSync(new URL("../../js/lighting/knobs.js", import.meta.url), "utf8") + "\nLightKnobs;", {}, { filename: absSrc("js/lighting/knobs.js") });
  const original = { "test|day|dry": { ...knobs.LT } };
  const b = boot({ profiles: original, LT: { ...knobs.LT }, tuneDefs: knobs.TUNE_DEFS });
  let firstSlider, firstClone;
  for (const source of ["race", "race", "garage", "home-track", "race"]) {
    assert.equal(b.api.open({ source }), true);
    const group = b.dom.byId("ps-group-lighting");
    assert.equal(group.hidden, source === "garage", source + " lighting visibility");
    if (source !== "garage") {
      assert.notEqual(b.G._ltStore, original);
      assert.notEqual(b.G._ltStore, firstClone, "each visit gets a fresh isolated profile");
      firstClone = b.G._ltStore;
      for (const d of knobs.TUNE_DEFS) {
        const slider = b.dom.byId("ps-lt-in-" + d.id), exact = b.dom.byId("ps-lt-num-" + d.id);
        assert.ok(slider && exact, d.id + " has range and exact-value controls");
        assert.deepEqual([slider.min, slider.max, slider.step], [String(d.min), String(d.max), String(d.step)]);
        assert.equal(+slider.value, d.def, d.id + " returns to race baseline");
        const value = d.def === d.max ? d.min : d.max;
        slider.value = String(value); slider.dispatchEvent({ type: "input" });
        assert.equal(b.LT[d.id], value, d.id + " is editable");
        assert.equal(original["test|day|dry"][d.id], d.def, d.id + " leaves saved lighting alone");
      }
      const slider = b.dom.byId("ps-lt-in-keyMul");
      if (firstSlider) assert.equal(slider, firstSlider, "reuse the panel without duplicate controls");
      firstSlider = slider;
    }
    b.api.close(false);
    assert.equal(b.G._ltStore, original);
    assert.deepEqual(b.LT, original["test|day|dry"], "every knob restores on close");
    assert.deepEqual(b.latchWrites, [], "photo edits never change renderer recovery settings");
  }
});

test("Home circuit photos resolve the selected tuner profile before showing lighting controls", () => {
  const saved = { "test|day|dry": { exposureMul: 1.7, contrast: 1.3, sunElev: 23 } };
  const b = boot({ profiles: saved });
  let applied = 0;
  b.G.applyRaceSettings = () => { applied++; Object.assign(b.LT, b.G._ltStore["test|day|dry"]); };
  b.api.open({ source: "home-track" });
  assert.equal(applied, 1, "prepare the selected atmosphere, not the authored track palette");
  for (const [id, value] of Object.entries(saved["test|day|dry"])) {
    assert.equal(+b.dom.byId("ps-lt-in-" + id).value, value);
    assert.equal(+b.dom.byId("ps-lt-num-" + id).value, value);
  }
  const exposure = b.dom.byId("ps-lt-in-exposureMul"); exposure.value = "2"; exposure.dispatchEvent({ type: "input" });
  b.api.close(false);
  assert.equal(b.G._ltStore, saved); assert.equal(b.LT.exposureMul, 1.7);
  b.api.open({ source: "race" });
  assert.equal(applied, 1, "race entry preserves the current live atmosphere, including blends");
  b.api.close(false);
});

test("lighting rows follow the selected time/weather profile and condition reset", () => {
  const b = boot();
  b.G.setTimeOfDay = v => { if (v !== undefined) { b.G.raceTimeOfDay = v; b.LT.exposureMul = v === "night" ? 1.8 : 1; } return b.G.raceTimeOfDay; };
  b.api.open({ source: "race" });
  const tod = b.dom.byId("ps-tod"); tod.value = "night"; b.dom.dispatch(tod, { type: "change" });
  assert.equal(+b.dom.byId("ps-lt-in-exposureMul").value, 1.8);
  assert.equal(+b.dom.byId("ps-lt-num-exposureMul").value, 1.8);
  b.dom.byId("ps-cond-reset").click();
  assert.equal(+b.dom.byId("ps-lt-in-exposureMul").value, 1);
});

test("online photos cannot alter or rewind the live weather when closed", () => {
  const b = boot(), arc = { from: "dry", to: "rain", progress: .4 };
  b.G.netPlay = { active: () => true }; b.G.weatherArc = arc;
  b.api.open({ source: "race" });
  assert.equal(b.dom.byId("ps-tod").disabled, true);
  assert.equal(b.dom.byId("ps-weather").disabled, true);
  for (const [id, value] of [["ps-tod", "night"], ["ps-weather", "storm"]]) {
    const el = b.dom.byId(id); el.value = value; b.dom.dispatch(el, { type: "change" });
  }
  assert.equal(b.G.raceTimeOfDay, "day"); assert.equal(b.G.raceWeather, "dry");
  b.G.raceWeather = "rain"; arc.progress = .7;
  b.api.close(false);
  assert.equal(b.G.raceWeather, "rain", "network weather progresses independently of the photo");
  assert.equal(b.G.weatherArc, arc); assert.equal(arc.progress, .7);
});

test("Photo Lighting exact entry edits the session and follows range movement and reset", () => {
  const original = { "test|day|dry": { exposureMul: 1 } };
  const b = boot({ profiles: original });
  b.api.open({ source: "race" });
  const slider = b.dom.byId("ps-lt-in-exposureMul"), exact = b.dom.byId("ps-lt-num-exposureMul");
  const change = (value, valid = true) => {
    exact.value = value;
    exact.valueAsNumber = value === "" ? NaN : Number(value);
    exact.validity = { valid }; // the mini DOM does not implement native range / step validation
    exact.dispatchEvent({ type: "change" });
  };
  assert.equal(exact.type, "number");
  assert.match(exact.getAttribute("aria-label"), /exposure/i);
  assert.deepEqual([exact.min, exact.max, exact.step], [slider.min, slider.max, slider.step]);
  exact.value = "1."; exact.dispatchEvent({ type: "input" });
  assert.deepEqual(b.ltWrites, [], "typing an incomplete decimal does not edit the session");
  change("1.35");
  assert.equal(slider.value, "1.35");
  assert.equal(b.dom.byId("ps-lt-v-exposureMul").textContent, "1.35");
  assert.equal(slider.getAttribute("aria-valuetext"), "1.35");
  for (const bad of ["", "3.5", "1.33"]) { change(bad, false); assert.equal(exact.value, "1.35"); }
  slider.value = "1.55"; slider.dispatchEvent({ type: "input" });
  assert.equal(exact.value, "1.55");
  assert.deepEqual(b.ltWrites, [["exposureMul", 1.35], ["exposureMul", 1.55]]);
  b.dom.byId("ps-lt-reset").click();
  assert.equal(exact.value, "1"); assert.equal(slider.value, "1");
  assert.equal(b.dom.byId("ps-lt-reset").disabled, true);
  b.api.close(false);
  change("2");
  assert.equal(b.ltWrites.length, 2);
  assert.equal(b.G._ltStore, original);
});

test("Photo Lighting locks both controls for desktop-only knobs on mobile", () => {
  const b = boot({ mobile: true, LT: { carShadow: 1 }, tuneDefs: [
    { id: "carShadow", label: "Car shadows", group: "Shadows", min: 0, max: 1, step: 1, desktopOnly: true },
  ] });
  b.api.open({ source: "race" });
  const slider = b.dom.byId("ps-lt-in-carShadow"), exact = b.dom.byId("ps-lt-num-carShadow");
  assert.equal(slider.disabled, true);
  assert.equal(exact.disabled, true);
  assert.match(exact.getAttribute("aria-label"), /desktop only/i);
  exact.value = "0"; exact.dispatchEvent({ type: "change" });
  assert.deepEqual(b.ltWrites, []);
});

test("Photo Lighting stays out of the garage subject", () => {
  const b = boot({ profiles: { "*": { exposureMul: 1 } } });
  b.api.open({ source: "garage" });
  assert.equal(b.dom.byId("ps-lt-tabs").closest("section").hidden, true);
  assert.equal(b.ltWrites.length, 0);
});

test("Time & weather preview changes the session live and every reset or close restores it, arc included", () => {
  const arc = { from: "dry", to: "rain" };
  const { api, G, dom } = boot({ arc });
  api.open({ source: "race" });
  const group = dom.byId("ps-tod").closest("section");
  assert.equal(group.hidden, false);
  const reset = dom.byId("ps-cond-reset");
  assert.equal(reset.disabled, true, "nothing to reset until a condition changes");
  const pick = (id, v) => { const sel = dom.byId(id); sel.value = v; sel.dispatchEvent({ type: "change" }); };
  pick("ps-tod", "night"); pick("ps-weather", "storm");
  assert.deepEqual([G.raceTimeOfDay, G.raceWeather, G.weatherArc], ["night", "storm", null]);
  assert.equal(reset.disabled, false);
  reset.click();
  assert.deepEqual([G.raceTimeOfDay, G.raceWeather, G.weatherArc], ["day", "dry", arc]);
  pick("ps-tod", "dusk");
  api.close(false);
  assert.deepEqual([G.raceTimeOfDay, G.raceWeather, G.weatherArc], ["day", "dry", arc]);
});

test("Time & weather group stays out of the garage subject", () => {
  const { api, G, dom } = boot({});
  api.open({ source: "garage" });
  assert.equal(dom.byId("ps-tod").closest("section").hidden, true);
  assert.deepEqual([G.raceTimeOfDay, G.raceWeather], ["day", "dry"]);
});

// GARAGE & LIGHTING (Bryce 2026-10-20): a garage visit offers the Team tab's GARAGE / CREW / LIGHTING pickers. Runs the
// REAL lookRowSpecs from setup-sheet.js against stateful scene stubs, so a pick in the studio must land in the same
// state the Team tab reads back on its next build.
function teamLooks(tables = {}) {
  const src = fs.readFileSync(new URL("../../js/garage/setup-sheet.js", import.meta.url), "utf8");
  const start = src.indexOf("const CREW_NAMES"), end = src.indexOf("function buildLookRows");
  assert.ok(start > 0 && end > start, "lookRowSpecs source found in setup-sheet.js");
  const state = { room: "stock", crew: "classic", mood: "shipped" }, saved = [];
  const ctx = vm.createContext({
    GaragePrims: { LOOK_IDS: Object.keys(tables.rooms || { stock: null, studio: {} }), LOOKS: tables.rooms || { stock: null, studio: { label: "Silver studio" } },
      lookId: () => state.room, setLook: (id) => { state.room = id; saved.push("garageLook=" + id); } },
    GarageCrew: { LOOKS: ["classic", "pitstop"], look: () => state.crew, setLook: (id) => { state.crew = id; saved.push("crewLook=" + id); } },
    GarageScene: { MOODS: tables.moods || { shipped: {}, night: {}, daylight: {} }, mood: () => state.mood, setMood: (id) => { state.mood = id; saved.push("garageMood=" + id); } },
  });
  vm.runInContext(src.slice(start, end), ctx);
  return { specs: vm.runInContext("lookRowSpecs", ctx), state, saved };
}
test("garage photo offers the Team tab's room, crew and lighting rows and writes the state the Team tab reads", () => {
  const team = teamLooks(); let looked = 0;
  const b = boot({ looks: team.specs, looked: () => { looked++; } });
  b.api.open({ source: "home" });
  const group = b.dom.byId("ps-look-mood-row").parentElement;
  assert.equal(group.hidden, false, "GARAGE & LIGHTING shows in the garage");
  assert.equal(group.getAttribute("aria-label"), "GARAGE & LIGHTING");
  assert.equal(group.children.filter((el) => el.tagName === "DIV").length, 3, "one row per Team tab picker");
  assert.equal(b.dom.byId("ps-tod-row").parentElement.hidden, true, "TIME & WEATHER stays a circuit control");
  const labels = (id) => b.dom.byId(id).children.map((o) => o.textContent);
  assert.deepEqual(labels("ps-look-room"), ["TEAM BAY", "SILVER STUDIO"]);
  assert.deepEqual(labels("ps-look-crew"), ["CLASSIC", "PIT STOP"]);
  assert.deepEqual(labels("ps-look-mood"), ["STANDARD", "NIGHT", "DAYLIGHT"]);
  assert.equal(b.dom.byId("ps-look-room-row").getAttribute("aria-labelledby"), "ps-look-room-row-label");
  for (const [id, v] of [["ps-look-room", "studio"], ["ps-look-crew", "pitstop"], ["ps-look-mood", "night"]]) {
    const sel = b.dom.byId(id); sel.value = v; b.dom.dispatch(sel, { type: "change" });
  }
  b.dom.byId("ps-look-mood-row-next").click();
  assert.deepEqual(team.state, { room: "studio", crew: "pitstop", mood: "daylight" });
  assert.deepEqual(team.saved, ["garageLook=studio", "crewLook=pitstop", "garageMood=night", "garageMood=daylight"]);
  // The Team tab's next build reads the picks back as current.
  assert.deepEqual([...team.specs().map((s) => s.cur)], ["studio", "pitstop", "daylight"]);
  assert.equal(b.dom.byId("ps-look-mood").value, "daylight");
  b.api.close(true);
  assert.deepEqual(team.state, { room: "studio", crew: "pitstop", mood: "daylight" }, "a garage look is a saved pick, not a preview");
  assert.equal(looked, 1, "DONE repaints the Team tab after a pick");
  b.api.open({ source: "garage" }); b.api.close(true);
  assert.equal(looked, 1, "no pick, no repaint");
});
test("race and replay photo modes keep TIME & WEATHER and never show the garage rows", () => {
  const team = teamLooks();
  for (const source of ["race", "watch", "home-track"]) {
    const b = boot({ looks: team.specs, borrowCar: () => () => {} });
    b.api.open({ source });
    assert.equal(b.dom.byId("ps-tod-row").parentElement.hidden, false, source + " keeps TIME & WEATHER");
    const looks = b.dom.byId("ps-body").children.find((el) => el.getAttribute && el.getAttribute("aria-label") === "GARAGE & LIGHTING");
    assert.equal(looks.hidden, true, source + " hides GARAGE & LIGHTING");
    assert.equal(looks.children.some((el) => el.tagName === "DIV"), false, source + " builds no garage rows");
    b.api.close(true);
  }
  assert.deepEqual(team.saved, []);
});

// LIVE-MEMORY-H12: closing kept the library rows, each an <img> with a thumbnail data URL and a DOWNLOAD
// closure over its photo blob, in the hidden studio for as long as the page lived.
test("closing the studio drops the library rows; reopening repaints them", async () => {
  const b = boot();
  b.api.open({ source: "garage" }); await b.api.capture(); await b.api.savePhoto();
  assert.ok(b.dom.byId("ps-library").children.length >= 1, "a saved photo is listed while open");
  b.api.close(false);
  assert.equal(b.dom.byId("ps-library").children.length, 0, "closed: no row (and no blob closure) left behind");
  b.api.open({ source: "garage" });
  await new Promise((r) => setImmediate(r));
  assert.ok(b.dom.byId("ps-library").children.length >= 1, "open() repaints the library");
});

test("all shipped garage styles and lighting remain shared by Team and both garage photo entry points", () => {
  const ctx = vm.createContext({ Math, Object, Array, Number, String, JSON, Float32Array, Uint16Array, Uint32Array,
    Log: { info() {}, warn() {}, error() {}, debug() {}, enabled: () => false } });
  for (const f of ["js/track/core/geom.js", "js/track/core/pit.js", "js/garage/scene-prims.js", "js/garage/scene-equipment.js",
    "js/garage/scene-live.js", "js/garage/scene-dress.js", "js/garage/experience.js", "js/garage/scene.js"])
    vm.runInContext(fs.readFileSync(new URL("../../" + f, import.meta.url), "utf8"), ctx, { filename: absSrc(f) });
  const team = teamLooks(vm.runInContext("({rooms: GaragePrims.LOOKS, moods: GarageScene.MOODS})", ctx));
  const pairs = [["porcelain", "inspection"], ["heritage", "goldenhour"], ["endurance", "endurance"]];
  let repaints = 0;
  const b = boot({ looks: team.specs, looked: () => repaints++ });
  for (const source of ["home", "garage"]) for (let i = 0; i < pairs.length; i++) {
    // Team chooses one combination before the photo studio borrows the garage.
    const [room, mood] = pairs[i], [nextRoom, nextMood] = pairs[(i + 1) % pairs.length];
    team.specs().find(s => s.key === "room").apply(room);
    team.specs().find(s => s.key === "mood").apply(mood);
    b.api.open({ source });
    for (const key of ["room", "mood"]) {
      const row = b.dom.byId("ps-look-" + key), spec = team.specs().find(s => s.key === key);
      assert.deepEqual(row.children.map(o => o.value), Array.from(spec.ids), "photo lists every production catalog option");
      assert.deepEqual(row.children.map(o => o.textContent), Array.from(spec.ids, spec.name), "labels use the shared Team definitions");
      assert.equal(row.value, key === "room" ? room : mood, "Team selection is current in Photo");
      row.value = key === "room" ? nextRoom : nextMood;b.dom.dispatch(row, { type: "change" });
    }
    b.api.close(true);
    assert.equal(team.specs().find(s => s.key === "room").cur, nextRoom, "Photo room remains selected in Team");
    assert.equal(team.specs().find(s => s.key === "mood").cur, nextMood, "Photo lighting remains selected in Team");
  }
  assert.equal(repaints, 6, "each changed photo visit refreshes the garage panel");
});

// ── hunt #5743 P1 / P3 ───────────────────────────────────────────────────────
test("#5743 P1: a borrowCar that throws hands FreeCam and photo mode back and open() answers false", () => {
  const b = boot({ borrowCar: () => { throw new Error("makeCars failed"); } });
  assert.equal(b.api.open({ source: "home-track" }), false);
  assert.equal(b.closed(), 1, "the camera handover is undone");
  assert.equal(b.G.photoMode, false);
  assert.equal(b.overlays(), true, "FreeCam's guides come back");
  assert.equal(b.api.state().open, false);
  // A later open still works.
  assert.equal(b.api.open({ source: "race" }), true);
});

test("#5743 P3: a readback that never resolves times out to Capture failed, not busy, and frees the slot", async () => {
  const timers = [];
  const b = boot({ setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; } });
  let cancelled = null, readOwner;
  b.G.gfx.capturePixels = (owner) => { readOwner = owner; return new Promise(() => {}); };
  b.G.gfx.cancelCapture = (why, owner) => { assert.ok(owner); assert.equal(owner, readOwner); cancelled = why; };
  b.api.open();
  const pending = b.api.capture();
  assert.equal(b.api.state().busy, true);
  const t = timers.find((x) => x.ms === 8000);
  assert.ok(t, "an 8 s capture timeout is armed");
  t.fn();
  assert.equal(await pending, false);
  assert.equal(b.api.state().busy, false);
  assert.equal(b.api.state().captured, false);
  assert.equal(cancelled, "capture timed out");
  assert.equal(b.dom.byId("ps-message").textContent.split(":")[0], "Capture failed");
});


test("closing a capture releases its render scale before the next capture takes ownership", async () => {
  const b = boot(), reads = [];
  let scale = 0.5;
  b.G.gfx.getRenderScale = () => scale;
  b.G.gfx.setRenderScale = (value) => { scale = value; return true; };
  b.G.gfx.capturePixels = () => new Promise((resolve) => reads.push(resolve));
  const pixels = { width: 1, height: 1, data: new Uint8ClampedArray(4) };
  b.api.open();
  const first = b.api.capture();
  b.api.close(false);
  assert.equal(scale, 0.5);
  b.G.gfx.setRenderScale(0.75);
  b.api.open();
  const second = b.api.capture();
  reads[0](pixels);
  assert.equal(await first, false);
  assert.equal(scale, 1);
  reads[1](pixels);
  assert.equal(await second, true);
  assert.equal(scale, 0.75);
});

test("a submitted read timing out after reopen leaves the next photo queued", async () => {
  const timers = [], requests = [];
  const b = boot({ setTimeout: (fn, ms) => { if (ms === 8000) timers.push(fn); return timers.length; } });
  let queued;
  b.G.gfx.capturePixels = (owner) => new Promise((resolve, reject) => {
    queued = { owner, resolve, reject }; requests.push(queued);
  });
  b.G.gfx.cancelCapture = (why, owner) => {
    if (queued && queued.owner === owner) { queued.reject(new Error(why)); queued = null; }
  };
  b.api.open();
  const first = b.api.capture();
  queued = null;   // WGX submitted this read, but its buffer has not mapped yet
  b.api.close(false); b.api.open({ source: "garage" });
  const second = b.api.capture();
  timers[0]();
  assert.equal(await first, false);
  assert.equal(queued, requests[1], "the reopened studio still owns its queued GPU read");
  queued.resolve({ width: 160, height: 90, data: new Uint8ClampedArray(160 * 90 * 4) });
  assert.equal(await second, true);
});

// Mirrors tests/specs/photo-studio.spec.js's bare page (no Log, no ScriptLoader): the
// stub must finish evaluating so PhotoStudio is defined (#4978 draft CI red).
test("boot stub evaluates and create() works without Log or ScriptLoader", () => {
  const ctx = vm.createContext({
    Object, String, Math, Promise, JSON, Error,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    window: { dispatchEvent: () => {} },
    CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } },
    GameStore: { store: { rawSet: () => true, rawDel: () => true, get: (_k, d) => d, set: () => true } },
  });
  ctx.window = ctx;
  vm.runInContext(source, ctx, { filename: absSrc("js/ui/photo-studio.js") });
  assert.equal(typeof ctx.PhotoStudio, "object");
  assert.equal(typeof ctx.PhotoStudio.create, "function");
  const api = ctx.PhotoStudio.create({ $: () => null, setTimeOfDay: () => "day", weather: () => "dry" }, { garage: {} });
  assert.equal(api.state().open, false);
  assert.equal(ctx.PhotoStudio.loaded(), false);
});

test("gallery read failure exposes retry and keeps the session gallery separate", async () => {
  const b = boot();
  b.api.open({source:"garage"});
  await turn();
  assert.equal(b.dom.byId("ps-library-error").hidden, false);
  assert.equal(b.dom.byId("ps-library").children.length, 0);
  await b.api.capture(); await b.api.savePhoto();
  assert.equal(b.dom.byId("ps-library-error").hidden, false);
  assert.equal(b.dom.byId("ps-library").children.length, 1);
  const healthy = boot({indexedDB:photoDb([])});
  healthy.api.open({source:"garage"}); await healthy.api.album();
  assert.equal(healthy.dom.byId("ps-library-error").hidden, true);
  assert.equal(healthy.dom.byId("ps-library").children[0].textContent, "Capture a frame and save it here. Photos stay on this device.");
});

test("creating a cold Photo facade and closing an unopened studio leave editor scripts unloaded", async () => {
  const loads = [];
  const ctx = vm.createContext({ScriptLoader:{create:() => ({load:async files => {loads.push(...files);return false;}})}});
  vm.runInContext(source, ctx, { filename: absSrc("js/ui/photo-studio.js") });
  const studio = ctx.PhotoStudio.create({}, {});
  assert.equal(studio.state().open, false);
  assert.equal(studio.hasCar(), false, "title render polls a synchronous boolean without loading capture UI");
  studio.close(false);
  assert.deepEqual(loads, []);
  assert.equal(await studio.ensureLoaded(), false);
  assert.deepEqual(loads, ["js/ui/photo-studio-ui.js"]);
});

// #6445 (batch #6756): with Depth focus Off the presented opts must carry photoFocus === undefined (no DOF pass);
// null is tlx-post's autofocus-on-the-car contract and belongs to Depth focus On with no tap. Both producers
// (game.js race present, garage setup-camera) pass photoLens.focus straight through.
test("Depth focus off presents photoFocus undefined; on with no tap presents null (autofocus)", () => {
  const b = boot();
  b.G.gfx.photoFocusAvailable = () => true;
  const sites = [GAME_JS, fs.readFileSync(new URL("../../js/garage/setup-camera.js", import.meta.url), "utf8")];
  const exprs = sites.map((src) => src.match(/photoFocus\s*=\s*(photoLens && gfx\.photoFocusAvailable\?\.\(\) \? photoLens\.focus : undefined)/)[1]);
  const present = (expr) => vm.runInNewContext(expr, { photoLens: b.PS.lens(), gfx: b.G.gfx }, { filename: "vm-page:photo-focus" });
  assert.equal(b.api.open({ source: "race" }), true);
  assert.equal(b.dom.byId("ps-depth-focus").value, "off");
  for (const expr of exprs) assert.equal(present(expr), undefined, "Depth focus off: no DOF / autofocus pass");
  assert.equal(b.PS.lens().mm, null);
  const slider = b.dom.byId("ps-focal-length");
  slider.value = "80"; b.dom.dispatch(slider, { type: "input" });
  assert.equal(b.PS.lens().mm, 80, "the focal length still reaches the camera with focus off");
  const depth = b.dom.byId("ps-depth-focus");
  depth.value = "on"; b.dom.dispatch(depth, { type: "change" });
  for (const expr of exprs) assert.equal(present(expr), null, "Depth focus on, no tap: autofocus (null)");
  assert.equal(b.PS.lens().mm, 80);
  depth.value = "off"; b.dom.dispatch(depth, { type: "change" });
  for (const expr of exprs) assert.equal(present(expr), undefined, "turning it off again drops the pass");
  b.api.close(false);
});

test("#7017: DOCK and HIDE toggle the sheet attributes with accessible state; the dock side persists and restores", () => {
  const b = boot(); const studio = b.dom.byId("photo-studio"), body = b.dom.document.body;
  const dock = b.dom.byId("ps-dock"), hide = b.dom.byId("ps-collapse");
  assert.equal(dock.parentElement.parentElement.className, "sheet-head", "both controls live in the sheet header");
  assert.equal(dock.getAttribute("aria-pressed"), "false");
  assert.equal(hide.getAttribute("aria-expanded"), "true");
  assert.equal(hide.getAttribute("aria-controls"), "ps-body");
  b.api.open();
  assert.equal(studio.dataset.dock, "bottom", "default stays the bottom sheet");
  assert.equal(studio.dataset.sheet, "open");
  assert.equal(body.getAttribute("data-ps-dock"), "bottom", "the photo sticks read the side from body");
  dock.click();
  assert.equal(studio.dataset.dock, "top"); assert.equal(dock.getAttribute("aria-pressed"), "true");
  assert.equal(body.getAttribute("data-ps-dock"), "top");
  assert.equal(b.storage.get("apex26.photoDock"), "top");
  assert.equal(b.api.state().dock, "top");
  hide.click();
  assert.equal(studio.dataset.sheet, "collapsed"); assert.equal(hide.getAttribute("aria-expanded"), "false");
  assert.equal(body.getAttribute("data-ps-sheet"), "collapsed", "the sticks read the fold from body");
  assert.equal(hide.textContent, "SHOW"); assert.equal(b.api.state().collapsed, true);
  assert.equal(b.storage.has("apex26.photoCollapsed"), false, "collapse is visit state, not stored");
  b.api.close(false);
  assert.equal(body.getAttribute("data-ps-dock") ?? null, null, "closing drops the body side");
  assert.equal(body.getAttribute("data-ps-sheet") ?? null, null);
  b.api.open();
  assert.equal(studio.dataset.sheet, "collapsed", "the collapse survives a reopen in the same session");
  hide.click(); assert.equal(studio.dataset.sheet, "open"); assert.equal(hide.textContent, "HIDE");
  dock.click(); assert.equal(studio.dataset.dock, "bottom"); assert.equal(b.storage.get("apex26.photoDock"), "bottom");
  const again = boot({ storage: [["apex26.photoDock", "top"]] }); again.api.open();
  assert.equal(again.dom.byId("photo-studio").dataset.dock, "top", "the next visit opens where the player left it");
  assert.equal(again.dom.byId("ps-dock").getAttribute("aria-pressed"), "true");
  const junk = boot({ storage: [["apex26.photoDock", "left"]] }); junk.api.open();
  assert.equal(junk.dom.byId("photo-studio").dataset.dock, "bottom", "an unknown stored side falls back to bottom");
  assert.equal(b.dom.byId("ps-help").textContent.startsWith("WASD move"), true, "a mouse and keyboard keep the key hints");
  const touch = boot({ matchMedia: (q) => ({ matches: q === "(pointer: coarse)" }) }); touch.api.open();
  assert.equal(touch.dom.byId("ps-help").textContent.startsWith("Left stick moves"), true, "a touch phone gets the stick wording");
  assert.equal(touch.dom.byId("ps-help").textContent.includes("WASD"), false);
  const full = boot({ storageFull: true }); full.api.open(); full.dom.byId("ps-dock").click();
  assert.equal(full.dom.byId("photo-studio").dataset.dock, "top", "a failed write still moves the sheet for this visit");
});
