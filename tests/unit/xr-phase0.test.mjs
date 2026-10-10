/* XR Phase 0 — pure rig math + controller mapping (no WebXR runtime). */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";
import { waitXrFrames, installIwerFixture } from "../helpers/iwer-install.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

// Virtual page clock: progress comes from the XR producer, not the waiter.
function xrWaitPage(countAt) {
  let now = 0, evaluations = 0;
  const context = vm.createContext({
    performance: { now: () => now },
    XrSession: { frameCount: () => countAt(now) },
    setTimeout: (callback, delay) => { queueMicrotask(() => { now += delay; callback(); }); },
  });
  return {
    page: { evaluate: (fn, arg) => {
      evaluations++;
      context.arg = arg;
      return vm.runInContext(`(${fn.toString()})(arg)`, context);
    } },
    evaluations: () => evaluations,
  };
}

test("XR waiter uses one evaluation and requires progress beyond a nonzero baseline", async () => {
  const h = xrWaitPage((now) => now < 2200 ? 9 : 12);
  assert.equal(await waitXrFrames(h.page, 2), 9);
  assert.equal(h.evaluations(), 1);
});

test("XR waiter rejects frozen and exactly-delta frames within the original budget", async () => {
  for (const countAt of [() => 0, (now) => now > 0 ? 2 : 0]) {
    const h = xrWaitPage(countAt);
    await assert.rejects(waitXrFrames(h.page, 2, { timeout: 2400 }), /timed out after 2400ms/);
    assert.equal(h.evaluations(), 1);
  }
});

test("XR waiter cannot accept progress first observed at the deadline", async () => {
  const h = xrWaitPage((now) => now >= 2000 ? 3 : 0);
  await assert.rejects(waitXrFrames(h.page, 2, { timeout: 2000 }), /base=0, fc=3/);
  assert.equal(h.evaluations(), 1);
});

test("XR waiter's Node watchdog rejects a blocked evaluation without page timers", async () => {
  let evaluations = 0;
  const page = { evaluate: () => { evaluations++; return new Promise(() => {}); } };
  await assert.rejects(waitXrFrames(page, 2, { timeout: 20 }), /after 20ms.*evaluation or timers stalled/);
  assert.equal(evaluations, 1);
});

function bootXr() {
  const ctx = vm.createContext({
    console, Math, Float32Array, performance: { now: () => 0 },
  });
  seedLog(ctx);
  // M4 is a dependency of xr-rig.
  vm.runInContext(read("js/core/mat4.js").replace(/^const\b/gm, "var"), ctx, { filename: "mat4.js" });
  vm.runInContext(read("js/xr/xr-rig.js").replace(/^const\b/gm, "var"), ctx, { filename: "xr-rig.js" });
  vm.runInContext(read("js/xr/xr-input.js").replace(/^const\b/gm, "var"), ctx, { filename: "xr-input.js" });
  return ctx;
}

test("XrRig.stickToSteer deadzones and signs", () => {
  const { XrRig } = bootXr();
  assert.equal(XrRig.stickToSteer(0), 0);
  assert.equal(XrRig.stickToSteer(0.05), 0);
  assert.ok(XrRig.stickToSteer(1) > 0.99);
  assert.ok(XrRig.stickToSteer(-1) < -0.99);
  assert.ok(XrRig.stickToSteer(0.5) > 0 && XrRig.stickToSteer(0.5) < 1);
});

test("XrRig.composeEye puts the seated eye at the world anchor with identity HMD", () => {
  const { XrRig, M4 } = bootXr();
  const out = {
    view: M4.ident(), proj: M4.ident(), viewProj: M4.ident(),
    invProj: M4.ident(), invViewProj: M4.ident(), eye: [0, 0, 0],
  };
  // Identity view (no HMD offset) + identity proj → eye lands on the anchor.
  const ident = M4.ident();
  XrRig.composeEye(
    { eye: [10, 2, -5], fwd: [0, 0, 1], up: [0, 1, 0] },
    ident,
    ident,
    out,
  );
  assert.ok(Math.abs(out.eye[0] - 10) < 1e-4, `eye.x=${out.eye[0]}`);
  assert.ok(Math.abs(out.eye[1] - 2) < 1e-4, `eye.y=${out.eye[1]}`);
  assert.ok(Math.abs(out.eye[2] - -5) < 1e-4, `eye.z=${out.eye[2]}`);
});

test("XrRig recenter defines the seated origin in the base space, not an inverse pose", () => {
  const { XrRig, M4 } = bootXr();
  const pose = M4.ident();
  pose[12] = 1.5; pose[13] = 1.65; pose[14] = -2;
  const off = XrRig.recenterOffsetFromPose(pose);
  assert.deepEqual({ ...off.position }, { x: 1.5, y: pose[13], z: -2 });
  assert.deepEqual({ ...off.orientation }, { x: 0, y: 0, z: 0, w: 1 });
});

test("XrInput.mapFrame: right trigger thr, left brake, stick steer, squeeze held, edges", () => {
  const { XrInput } = bootXr();
  const latch = { primary: false, secondary: false };
  const sources = [
    {
      handedness: "right",
      gamepad: {
        buttons: [
          { value: 0.8 }, // trigger
          { value: 1 },   // squeeze → held
          { value: 0 },
          { value: 0 },
          { value: 0 }, // A
          { value: 0 },
        ],
        axes: [0, 0, 0, 0],
      },
    },
    {
      handedness: "left",
      gamepad: {
        buttons: [
          { value: 0.6 },
          { value: 0 },
          { value: 0 },
          { value: 0 },
          { value: 0 },
          { value: 0 },
        ],
        axes: [0, 0, 0.9, 0],
      },
    },
  ];
  const m = XrInput.mapFrame(sources, latch);
  assert.ok(m.sample.thr > 0.7);
  assert.ok(m.sample.brk > 0.5);
  assert.ok(m.sample.roll > 0.5);
  assert.equal(m.sample.held, 1);
  assert.equal(m.recenter, false);
  assert.equal(m.events.length, 0);

  // Rising edge on A → recenter; rising edge on B → pause
  sources[0].gamepad.buttons[4] = { value: 1 };
  sources[0].gamepad.buttons[5] = { value: 1 };
  const m2 = XrInput.mapFrame(sources, latch);
  assert.equal(m2.recenter, true);
  assert.equal(m2.events.length, 1);
  assert.equal(m2.events[0], "pause");
  // Held — no second edge
  const m3 = XrInput.mapFrame(sources, latch);
  assert.equal(m3.recenter, false);
  assert.equal(m3.events.length, 0);
});

test("XrInput.inject feeds Input.remoteSample / remoteEvent", () => {
  const { XrInput } = bootXr();
  const samples = [];
  const events = [];
  const input = {
    steerToTilt: (c) => c * 10,
    remoteSample: (s) => { samples.push(s); return true; },
    remoteEvent: (k) => { events.push(k); return true; },
  };
  XrInput.inject(input, {
    sample: { roll: 0.5, thr: 0.2, brk: 0.1, held: 0 },
    events: ["pause"],
  });
  assert.equal(samples.length, 1);
  // A STICK, not a lean: no steerToTilt, so no tilt filter, slew or lamp-1 recalibration.
  assert.equal(samples[0].steer, 0.5);
  assert.equal(samples[0].roll, undefined);
  assert.equal(samples[0].thr, 0.2);
  assert.deepEqual(events, ["pause"]);
});

test("XrSession.sessionInit lists webgpu only when preferred; featureGranted reads enabledFeatures", () => {
  // sessionInit is pure — reuse the XR VM (no navigator.xr required).
  // Feature detection must NOT trust typeof XRGPUBinding alone (three.js #33497).
  const ctx = bootXr();
  vm.runInContext(read("js/xr/xr-session.js").replace(/^const\b/gm, "var"), ctx, { filename: "xr-session.js" });
  const a = ctx.XrSession.sessionInit(false);
  assert.ok(!a.optionalFeatures.includes("webgpu"));
  const b = ctx.XrSession.sessionInit(true);
  assert.ok(b.optionalFeatures.includes("webgpu"));
  assert.equal(ctx.XrSession.featureGranted({ enabledFeatures: ["local-floor"] }, "webgpu"), false);
  assert.equal(ctx.XrSession.featureGranted({ enabledFeatures: ["local-floor", "webgpu"] }, "webgpu"), true);
  assert.equal(ctx.XrSession.featureGranted({ enabledFeatures: new Set(["webgpu"]) }, "webgpu"), true);
});

test("vendor ships XRButton / VRButton / WebGLXRFallback and pinned IWER under tests/vendor", () => {
  for (const f of [
    "vendor/three-0.186.0/addons/webxr/XRButton.js",
    "vendor/three-0.186.0/addons/webxr/VRButton.js",
    "vendor/three-0.186.0/addons/webxr/WebGLXRFallback.js",
    "tests/vendor/iwer-2.5.0.min.js",
  ]) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  }
  const m = JSON.parse(read("vendor/three-0.186.0/MANIFEST.json"));
  assert.ok(m.files["addons/webxr/XRButton.js"]);
  assert.ok(m.files["addons/webxr/VRButton.js"]);
  assert.ok(m.files["addons/webxr/WebGLXRFallback.js"]);
  const iwer = read("tests/vendor/iwer-2.5.0.min.js");
  assert.match(iwer, /XRDevice/);
  assert.match(iwer, /metaQuest3/);
  // Never referenced from the production shell.
  assert.doesNotMatch(read("index.html"), /tests\/vendor\/iwer/);
});

test("XrBoot façade: comfort off until presenting; applyEyes null outside XR", () => {
  const ctx = bootXr();
  vm.runInContext(read("js/xr/xr-session.js").replace(/^const\b/gm, "var"), ctx, { filename: "xr-session.js" });
  vm.runInContext(read("js/xr/xr-boot.js").replace(/^const\b/gm, "var"), ctx, { filename: "xr-boot.js" });
  assert.equal(ctx.XrBoot.comfort(), false);
  assert.equal(ctx.XrBoot.loopByXr(), false);
  assert.equal(ctx.XrBoot.camComfort(false), false);
  assert.equal(ctx.XrBoot.camComfort(true), true);
  assert.equal(ctx.XrBoot.applyEyes({}, [0, 1, 0], [0, 1, 1], [0, 1, 0]), null);
  assert.equal(ctx.XrBoot.present(null, null, null), false);
  assert.equal(ctx.XrBoot.canAttach(), false);
});

test("B4: XrBoot.afterTick dedupes window rAF so EXIT VR cannot double-loop", () => {
  const ctx = bootXr();
  const rafCalls = [];
  ctx.requestAnimationFrame = (fn) => { rafCalls.push(fn); return rafCalls.length; };
  vm.runInContext(read("js/xr/xr-session.js").replace(/^const\b/gm, "var"), ctx, { filename: "xr-session.js" });
  vm.runInContext(read("js/xr/xr-boot.js").replace(/^const\b/gm, "var"), ctx, { filename: "xr-boot.js" });
  let ticks = 0;
  const tick = () => { ticks++; };
  ctx.XrBoot.bind({
    gfx: { attachXrSession: async () => ({}), xrCapable: () => true },
    tickBody: () => {},
    windowTick: tick,
    getCamMode: () => 0,
    setCamMode: () => {},
  });
  // Two afterTick calls before the rAF fires → only one scheduled.
  assert.equal(ctx.XrBoot.afterTick(tick), true);
  assert.equal(ctx.XrBoot.afterTick(tick), false);
  assert.equal(rafCalls.length, 1);
  rafCalls[0](0);
  assert.equal(ticks, 1);
  // Simulate EXIT VR: onEnd chains once more (via chainWindowRaf).
  assert.equal(ctx.XrBoot.chainWindowRaf(tick), true);
  assert.equal(ctx.XrBoot.chainWindowRaf(tick), false);
  assert.equal(rafCalls.length, 2);
});

test("B5: VR cockpit cam override does not persist; restore returns to saved mode", () => {
  const ctx = bootXr();
  vm.runInContext(read("js/xr/xr-session.js").replace(/^const\b/gm, "var"), ctx, { filename: "xr-session.js" });
  vm.runInContext(read("js/xr/xr-boot.js").replace(/^const\b/gm, "var"), ctx, { filename: "xr-boot.js" });
  let cam = 1; // chase-ish
  const store = [];
  ctx.CamModes = { CAM_MODES: [{ id: "chase" }, { id: "far" }, { id: "drift" }, { id: "cockpit" }] };
  ctx.XrBoot.bind({
    gfx: { attachXrSession: async () => ({}), xrCapable: () => true },
    tickBody: () => {},
    windowTick: () => {},
    getCamMode: () => cam,
    setCamMode: (i, opts) => {
      cam = i;
      if (!(opts && opts.persist === false)) store.push(i);
    },
  });
  ctx.XrBoot.saveAndForceCockpit();
  assert.equal(cam, 3, "forced to cockpit");
  assert.equal(store.length, 0, "must not persist VR override");
  assert.equal(ctx.XrBoot.diag().savedCam, 1);
  ctx.XrBoot.restoreSavedCam();
  assert.equal(cam, 1, "restored pre-VR mode");
  assert.equal(store.length, 0, "restore is also ephemeral (store still holds player choice)");
  assert.equal(ctx.XrBoot.diag().savedCam, -1);
});

test("B3: ensureXrBackend refuses silently only when storage is blocked; else pins TLX+forceGL", () => {
  const ctx = bootXr();
  const store = Object.create(null);
  ctx.localStorage = {
    setItem(k, v) { store[k] = String(v); },
    getItem(k) { return store[k] == null ? null : store[k]; },
    removeItem(k) { delete store[k]; },
  };
  let reloaded = 0;
  ctx.location = { reload() { reloaded++; } };
  vm.runInContext(read("js/xr/xr-session.js").replace(/^const\b/gm, "var"), ctx, { filename: "xr-session.js" });
  vm.runInContext(read("js/xr/xr-boot.js").replace(/^const\b/gm, "var"), ctx, { filename: "xr-boot.js" });
  // No gfx bound → cannot attach → pin + reload.
  const r = ctx.XrBoot.ensureXrBackend();
  assert.equal(r.ok, false);
  assert.equal(r.reloading, true);
  assert.equal(store["apex26.gfxBackend"], "three");
  assert.equal(store["apex26.tlxForceGL"], "1");
  assert.equal(store["apex26.xrEnterPending"], "1");
  assert.equal(reloaded, 1);
  // With an attachable gfx, ensure is a no-op.
  ctx.XrBoot.bind({
    gfx: { attachXrSession: async () => ({}), xrCapable: () => true },
    tickBody: () => {},
    windowTick: () => {},
    getCamMode: () => 0,
    setCamMode: () => {},
  });
  assert.equal(ctx.XrBoot.canAttach(), true);
  assert.equal(ctx.XrBoot.ensureXrBackend().ok, true);
});

test("CamModes.setCamMode({persist:false}) skips store.write", () => {
  const writes = [];
  const G = {
    $: () => null,
    camMode: 0,
    camCutT: 0,
    store: { set(k, v) { writes.push([k, v]); } },
  };
  const ctx = vm.createContext({ console, Math, document: { body: { classList: { toggle() {} }, toggleAttribute() {} }, getElementById: () => null } });
  seedLog(ctx);
  ctx.window = ctx;
  ctx.CamTunerPanel = { refresh() {} };
  ctx.GameAudio = undefined;
  vm.runInContext(read("js/camera/mode-switch.js").replace(/^window\.CamModes/, "var CamModes").replace(/^const\b/gm, "var"), ctx, { filename: "mode-switch.js" });
  // mode-switch assigns window.CamModes — pull it off the sandbox.
  const CamModes = ctx.CamModes || ctx.window.CamModes;
  const api = CamModes.create(G);
  api.setCamMode(3, { persist: false });
  assert.equal(G.camMode, 3);
  assert.equal(writes.length, 0);
  api.setCamMode(1);
  assert.equal(G.camMode, 1);
  assert.deepEqual(writes, [["camMode", 1]]);
});

test("XrUi.mount creates hidden #xr-enter until capability probe says yes", () => {
  // Minimal DOM so ensureButton can append without a real browser.
  const kids = [];
  const body = {
    appendChild(n) { kids.push(n); return n; },
  };
  const btnStore = { attrs: Object.create(null), text: "", hidden: true, parentNode: null };
  const document = {
    body,
    createElement(tag) {
      assert.equal(tag, "button");
      const el = {
        id: "",
        type: "",
        hidden: true,
        textContent: "",
        parentNode: null,
        setAttribute(k, v) { btnStore.attrs[k] = v; },
        addEventListener() { /* */ },
      };
      Object.defineProperty(el, "textContent", {
        get() { return btnStore.text; },
        set(v) { btnStore.text = v; },
      });
      Object.defineProperty(el, "hidden", {
        get() { return btnStore.hidden; },
        set(v) { btnStore.hidden = !!v; },
      });
      btnStore.el = el;
      return el;
    },
  };
  const ctx = bootXr();
  ctx.document = document;
  // Stub XrSession so mount's probe path resolves unsupported (button stays hidden).
  ctx.XrSession = {
    isPresenting: () => false,
    isSupported: () => false,
    probe: async () => false,
    start: async () => null,
    end: async () => {},
    on: () => () => {},
  };
  vm.runInContext(read("js/xr/xr-ui.js").replace(/^const\b/gm, "var"), ctx, { filename: "xr-ui.js" });
  const btn = ctx.XrUi.mount(body);
  assert.equal(btn.id, "xr-enter");
  assert.equal(kids.length, 1);
  assert.equal(btnStore.hidden, true);
  ctx.XrUi.show(true);
  assert.equal(btnStore.hidden, false);
  assert.match(btnStore.text, /ENTER VR/i);
  ctx.XrUi.unmount();
  assert.equal(kids.length, 1); // removed from parent, not from our push list
});

// Browser-independent WebXR ownership and reference-space contract. This models
// offset-space inverse composition; headset rendering remains the browser gate.
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function xrHarness(options = {}) {
  const ctx = bootXr(), { M4, XrRig } = ctx;
  const mul = (a, b) => M4.mulTo(M4.ident(), a, b);
  const pose = (x = 0, y = 1.65, z = 0, yaw = 0, pitch = 0, roll = 0) => {
    const ry = M4.ident(), rx = M4.ident(), rz = M4.ident();
    ry[0] = ry[10] = Math.cos(yaw); ry[8] = Math.sin(yaw); ry[2] = -ry[8];
    rx[5] = rx[10] = Math.cos(pitch); rx[6] = Math.sin(pitch); rx[9] = -rx[6];
    rz[0] = rz[5] = Math.cos(roll); rz[1] = Math.sin(roll); rz[4] = -rz[1];
    const m = mul(mul(ry, rx), rz); m[12] = x; m[13] = y; m[14] = z;
    return m;
  };
  const makeSpace = (origin = M4.ident()) => ({
    origin,
    getOffsetReferenceSpace(t) { return makeSpace(mul(origin, t.matrix)); },
  });
  ctx.XRRigidTransform = class {
    constructor(p, q) {
      this.matrix = pose(p.x, p.y, p.z, 2 * Math.atan2(q.y, q.w));
    }
  };
  let physical = pose(), tracking = true, requestCount = 0, attachments = 0, detachments = 0;
  let windowTicks = 0, xrTicks = 0, cam = 0, nextWindow = 0;
  const sessions = [], windowQueue = new Map(), windowHistory = [], windowCancelled = [];
  ctx.requestAnimationFrame = (fn) => {
    const id = ++nextWindow; windowQueue.set(id, fn); windowHistory.push(fn); return id;
  };
  ctx.cancelAnimationFrame = (id) => { windowCancelled.push(id); windowQueue.delete(id); };
  const createSession = () => {
    const events = new Map(), frames = new Map(), history = [], cancelled = [];
    let next = 0, ended = false;
    const base = makeSpace();
    const s = {
      enabledFeatures: ['local-floor'], visibilityState: 'visible', inputSources: [],
      addEventListener(name, fn) { events.set(name, fn); },
      removeEventListener(name, fn) { if (events.get(name) === fn) events.delete(name); },
      requestReferenceSpace(type) {
        if (options.reference) return options.reference(type, base);
        return Promise.resolve(base);
      },
      requestAnimationFrame(fn) {
        if (ended || options.rafFails) throw new Error('XR request failed');
        const id = ++next; frames.set(id, fn); history.push(fn); return id;
      },
      cancelAnimationFrame(id) { frames.delete(id); cancelled.push(id); },
      async end() { ended = true; const fn = events.get('end'); if (fn) fn({ target: s }); },
      frames, history, cancelled, base,
    };
    sessions.push(s); return s;
  };
  ctx.navigator = { xr: {
    isSessionSupported: async () => true,
    requestSession() { requestCount++; return options.request ? options.request(createSession) : Promise.resolve(createSession()); },
  } };
  ctx.localStorage = { getItem: () => null };
  for (const name of ['session', 'boot'])
    vm.runInContext(read(`js/xr/xr-${name}.js`).replace(/^const\b/gm, 'var'), ctx);
  const tick = () => { windowTicks++; ctx.XrBoot.afterTick(tick); };
  ctx.CamModes = { CAM_MODES: [{ id: 'chase' }, { id: 'cockpit' }] };
  ctx.XrBoot.bind({
    gfx: {
      xrCapable: () => true,
      attachXrSession(s) { attachments++; return options.attach ? options.attach(s) : Promise.resolve(); },
      detachXrSession() { detachments++; },
    },
    tickBody: () => { xrTicks++; if (options.onFrame) options.onFrame(ctx); },
    windowTick: tick, getCamMode: () => cam, setCamMode: (v) => { cam = v; },
  });
  const frame = () => ({ getViewerPose(space) {
    if (!tracking) return null;
    const inv = XrRig.invertRigidTo(M4.ident(), space.origin);
    const head = mul(inv, physical);
    const views = [-0.032, 0.032].map((x) => {
      const eye = M4.ident(); eye[12] = x;
      return { transform: { matrix: mul(head, eye) }, projectionMatrix: M4.ident() };
    });
    return { transform: { matrix: head }, views };
  } });
  return {
    ctx, pose, sessions, windowQueue, windowHistory, windowCancelled, tick, frame,
    physical(m) { physical = m; }, tracking(v) { tracking = v; },
    stats: () => ({ requestCount, attachments, detachments, windowTicks, xrTicks, cam }),
    fire(s = sessions.at(-1)) {
      const [id, fn] = s.frames.entries().next().value; s.frames.delete(id); fn(16, frame());
    },
  };
}
const near = (a, b, label = '') => assert.ok(Math.abs(a - b) < 1e-5, `${label}: ${a} != ${b}`);
const midpoint = (eyes) => eyes[0].eye.map((v, i) => (v + eyes[1].eye[i]) / 2);

test('XR seated origin removes floor height and yaw, preserving stereo, pitch/roll and head movement', async () => {
  for (const useLocal of [false, true]) {
    const h = xrHarness({ reference: (type, base) => type === 'local-floor' && useLocal
      ? Promise.reject(new Error('floor unavailable')) : Promise.resolve(base) });
    const { XrSession: xr } = h.ctx;
    const height = useLocal ? 0 : 1.65;
    h.physical(h.pose(3, height, -2, .7, .2, .1));
    xr.setAnchor([10, .82, 20], [0, 0, 1], [0, 1, 0]);
    await xr.start(); h.fire();
    const eyes = xr.eyeFrames(null, h.frame());
    midpoint(eyes).forEach((v, i) => near(v, [10, .82, 20][i], 'seated midpoint'));
    near(Math.hypot(...eyes[0].eye.map((v, i) => v - eyes[1].eye[i])), .064, 'IPD');
    // Centering cancels yaw only: the remaining pose is physical pitch and roll.
    const seated = h.frame().getViewerPose(xr.getRefSpace()).transform.matrix;
    const expected = h.pose(0, 0, 0, 0, .2, .1);
    Array.from(seated).forEach((v, i) => near(v, expected[i], `pose[${i}]`));
    const before = Array.from(eyes[0].view);
    assert.equal(xr.recenter(h.frame()), true);
    assert.equal(xr.recenter(h.frame()), true);
    xr.eyeFrames(null, h.frame())[0].view.forEach((v, i) => near(v, before[i], 'repeat recenter'));
    h.physical(h.pose(3.1, height + .2, -2.3, .9, .2, .1));
    const moved = midpoint(xr.eyeFrames(null, h.frame()));
    near(moved[1], 1.02, 'physical vertical movement retained');
    near(Math.hypot(moved[0] - 10, moved[2] - 20), Math.hypot(.1, .3), 'physical lean retained');
    const turned = h.frame().getViewerPose(xr.getRefSpace()).transform.matrix;
    assert.ok(Math.abs(turned[8] - seated[8]) > .1, 'physical head turn remains visible');
    await xr.end();
  }
});

test('XR identity gaze remains car-forward across repeated recenter; unavailable pose waits for calibration', async () => {
  const h = xrHarness(), { XrSession: xr, XrRig, M4 } = h.ctx;
  xr.setAnchor([0, .82, 0], [0, 0, 1]);
  h.tracking(false); await xr.start(); h.fire();
  assert.equal(xr.eyeFrames(null, h.frame()), null);
  h.tracking(true); h.fire();
  for (let i = 0; i < 3; i++) {
    assert.equal(xr.recenter(h.frame()), true);
    const eye = xr.eyeFrames(null, h.frame())[0];
    const world = XrRig.invertRigidTo(M4.ident(), eye.view);
    near(-world[10], 1, 'world gaze +Z'); near(eye.eye[1], .82, 'seat height');
  }
  assert.equal(xr.getFrame(), null, 'do not expose expired XRFrame after callback');
  await xr.end();
});

test('XR transition cancels queued window tick and rejects stale callbacks across exit and re-entry', async () => {
  const h = xrHarness(), { XrSession: xr, XrBoot: boot } = h.ctx;
  boot.afterTick(h.tick); const staleWindow = h.windowHistory[0];
  await xr.start(); const first = h.sessions[0];
  assert.equal(h.windowCancelled.length, 1);
  staleWindow(0); assert.equal(h.stats().windowTicks, 0);
  assert.equal(boot.diag().windowPending, false);
  h.fire(); assert.equal(h.stats().xrTicks, 1);
  const staleXr = first.history.at(-1);
  await xr.end();
  assert.equal(first.frames.size, 0); assert.equal(first.cancelled.length, 1);
  assert.equal(h.windowQueue.size, 1); assert.equal(h.stats().cam, 0);
  staleWindow(1); staleXr(1, h.frame());
  assert.equal(h.stats().windowTicks, 0); assert.equal(h.stats().xrTicks, 1);
  assert.equal(boot.diag().windowPending, true, 'stale callback cannot clear newer request');
  await xr.start();
  staleXr(2, h.frame()); assert.equal(h.stats().xrTicks, 1);
  assert.equal(h.sessions[1].frames.size, 1, 'old session cannot chain onto new session');
  await xr.end();
  const [id, fn] = h.windowQueue.entries().next().value; h.windowQueue.delete(id); fn(3);
  assert.equal(h.stats().windowTicks, 1); assert.equal(h.windowQueue.size, 1);
});

test('XR end during frame processing neither reschedules XR nor duplicates the window clock', async () => {
  const h = xrHarness({ onFrame: (ctx) => { void ctx.XrSession.end(); } });
  await h.ctx.XrSession.start(); h.fire();
  assert.equal(h.sessions[0].frames.size, 0);
  assert.equal(h.ctx.XrSession.isPresenting(), false);
  assert.equal(h.windowQueue.size, 1);
  assert.equal(h.ctx.XrBoot.loopByXr(), false);
});

test('XR start is deduped and cancellation while requestSession is pending closes the late session', async () => {
  const pending = deferred(); let create;
  const h = xrHarness({ request: (factory) => { create = factory; return pending.promise; } });
  await h.ctx.XrSession.probe();
  const a = h.ctx.XrSession.start(), b = h.ctx.XrSession.start();
  assert.equal(a, b); assert.equal(h.stats().requestCount, 1);
  await h.ctx.XrSession.end(); pending.resolve(create());
  assert.equal(await a, null);
  assert.equal(h.stats().attachments, 0); assert.equal(h.ctx.XrSession.getSession(), null);
  assert.equal(h.sessions[0].frames.size, 0);
});

test('XR ended during pending reference or renderer attachment cannot resume presentation', async () => {
  for (const phase of ['reference', 'attach']) {
    const pending = deferred(), entered = deferred();
    const h = xrHarness(phase === 'reference'
      ? { reference: (_type, base) => { entered.resolve(base); return pending.promise; } }
      : { attach: () => { entered.resolve(); return pending.promise; } });
    const started = h.ctx.XrSession.start();
    const base = await entered.promise;
    await h.sessions[0].end(); // browser-initiated end, not the app end method
    pending.resolve(base);
    assert.equal(await started, null);
    assert.equal(h.ctx.XrBoot.loopByXr(), false);
    assert.equal(h.ctx.XrSession.getRefSpace(), null);
    assert.equal(h.sessions[0].frames.size, 0);
    assert.equal(h.stats().cam, 0);
    assert.equal(h.windowQueue.size, 1);
    if (phase === 'attach') assert.equal(h.stats().detachments, 2, 'late attachment also cleaned up');
  }
});

test('XR reference, attachment and frame-request failures release ownership and keep one window loop', async () => {
  for (const options of [
    { reference: () => Promise.reject(new Error('no reference')) },
    { attach: () => Promise.reject(new Error('no layer')) },
    { rafFails: true },
  ]) {
    const h = xrHarness(options);
    h.ctx.XrBoot.afterTick(h.tick);
    assert.equal(await h.ctx.XrSession.start(), null);
    assert.equal(h.ctx.XrSession.isPresenting(), false);
    assert.equal(h.ctx.XrSession.getSession(), null);
    assert.equal(h.ctx.XrSession.getRefSpace(), null);
    assert.equal(h.ctx.XrBoot.loopByXr(), false);
    assert.equal(h.windowQueue.size, 1);
    assert.equal(h.stats().detachments, 1);
    assert.equal(h.stats().cam, 0);
    assert.ok(h.ctx.XrSession.lastError());
  }
});


test('XR input accepts native indexed XRInputSourceArray without Array methods', async () => {
  const h = xrHarness();
  const right = { handedness: 'right', gamepad: { buttons: [{ value: .8 }], axes: [0, 0, .6, 0] } };
  const left = { handedness: 'left', gamepad: { buttons: [{ value: .3 }], axes: [0, 0, -.4, 0] } };
  const sources = { 0: right, length: 1, *[Symbol.iterator]() { for (let i = 0; i < this.length; i++) yield this[i]; } };
  let mapped = h.ctx.XrInput.mapFrame(sources, {});
  near(mapped.sample.thr, .8); assert.ok(mapped.sample.roll > 0);
  sources[1] = left; sources.length = 2;
  mapped = h.ctx.XrInput.mapFrame(sources, {});
  near(mapped.sample.brk, .3); assert.ok(mapped.sample.roll < 0, 'left stick preferred');
  let samples = 0;
  h.ctx.Input = { remoteSample() { samples++; }, remoteEvent() {} };
  await h.ctx.XrSession.start(); h.sessions[0].inputSources = sources; h.fire();
  assert.equal(samples, 1); assert.equal(h.stats().xrTicks, 1);
  assert.equal(h.sessions[0].frames.size, 1);
  await h.ctx.XrSession.end();
});

test('XR input injection failure releases controls and keeps rendering on one XR clock', async () => {
  const h = xrHarness(); let lost = 0;
  h.ctx.Input = { remoteSample() { throw new Error('input consumer failed'); }, remoteLost() { lost++; } };
  await h.ctx.XrSession.start();
  h.fire(); h.fire();
  assert.equal(lost, 2); assert.equal(h.stats().xrTicks, 2);
  assert.equal(h.sessions[0].frames.size, 1);
  assert.equal(h.ctx.XrSession.getFrame(), null);
  assert.equal(h.ctx.XrBoot.loopByXr(), true);
  await h.ctx.XrSession.end();
});


test('XR public recenter queues outside a frame, survives tracking loss, and applies on the next valid frame', async () => {
  const h = xrHarness(), xr = h.ctx.XrSession;
  assert.equal(xr.recenter(), false);
  await xr.start(); h.fire();
  h.physical(h.pose(.4, 1.85, -.3, .7));
  assert.equal(xr.getFrame(), null);
  const before = xr.getRefSpace();
  assert.equal(xr.recenter(), true);
  assert.equal(xr.getRefSpace(), before, 'request cannot consume an expired frame');
  h.tracking(false); h.fire();
  assert.equal(xr.getRefSpace(), before, 'pending until tracking resumes');
  h.tracking(true); h.fire();
  const centered = h.frame().getViewerPose(xr.getRefSpace()).transform.matrix;
  near(centered[12], 0); near(centered[13], 0); near(centered[14], 0);
  near(centered[8], 0); near(centered[10], 1);
  h.physical(h.pose(.4, 1.95, -.3, .7)); h.fire();
  near(h.frame().getViewerPose(xr.getRefSpace()).transform.matrix[13], .1, 'request consumed once');
  assert.equal(xr.recenter(), true);
  await xr.end();
  h.physical(h.pose(0, 1.65, 0)); await xr.start(); h.fire();
  h.physical(h.pose(0, 1.85, 0)); h.fire();
  near(h.frame().getViewerPose(xr.getRefSpace()).transform.matrix[13], .2, 'pending request cleared at end');
  await xr.end();
});


test('pinned IWER offset adapter restores standard rigid-transform viewer and stereo poses', () => {
  const ctx = bootXr();
  Object.assign(ctx, { EventTarget, Event, DOMException,
    DOMPointReadOnly: class { constructor(x = 0, y = 0, z = 0, w = 1) { Object.assign(this, { x, y, z, w }); } },
  });
  vm.runInContext(read('tests/vendor/iwer-2.5.0.min.js'), ctx);
  const iwer = ctx.IWER;
  const base = new iwer.XRReferenceSpace('local-floor');
  const center = new iwer.XRRigidTransform({ x: .4, y: 1.65, z: -.3 });
  const viewer = new iwer.XRSpace(base, center.matrix);
  const views = Object.fromEntries([['left', -.032], ['right', .032]].map(([eye, x]) =>
    [eye, new iwer.XRSpace(viewer, new iwer.XRRigidTransform({ x, y: 0, z: 0 }).matrix)]));
  const session = { [iwer.P_SESSION]: { device: { viewerSpace: viewer, viewSpaces: views },
    mode: 'immersive-vr', frameTrackedAnchors: new Set(), getProjectionMatrix: () => ctx.M4.ident() } };
  const frame = new iwer.XRFrame(session, 1, true, true, 16);
  // Pin the vendor defect explicitly so an upgrade removes/revisits the adapter.
  const broken = base.getOffsetReferenceSpace(center);
  assert.ok(Array.from(broken[iwer.P_SPACE].offsetMatrix).every(Number.isNaN));
  // The fixture uses actual IWER space/transform/frame classes. Only device
  // installation is stubbed here because this Node test has no browser/GL.
  iwer.XRDevice = class { version = '2.5.0'; installRuntime() {} };
  vm.runInContext(`(${installIwerFixture.toString()})(true)`, ctx);
  vm.runInContext(`(${installIwerFixture.toString()})(true)`, ctx); // idempotent install
  const shifted = base.getOffsetReferenceSpace(center);
  assert.ok(Array.from(shifted[iwer.P_SPACE].offsetMatrix).every(Number.isFinite));
  const pose = frame.getViewerPose(shifted);
  for (const i of [12, 13, 14]) near(pose.transform.matrix[i], 0, 'viewer centered');
  const eyes = pose.views;
  for (const i of [12, 13, 14]) near((eyes[0].transform.matrix[i] + eyes[1].transform.matrix[i]) / 2, 0, 'stereo midpoint centered');
  near(eyes[1].transform.matrix[12] - eyes[0].transform.matrix[12], .064, 'IPD preserved');
  const further = shifted.getOffsetReferenceSpace(new iwer.XRRigidTransform({ x: 0, y: .2, z: 0 }));
  near(frame.getViewerPose(further).transform.position.y, -.2, 'nested offsets retain standard sign');
});

test("mountUi on a flat session does not fetch LAZY_XR", () => {
  const ctx = vm.createContext({
    console, Math,
    navigator: {},
    document: { body: {}, readyState: "complete", addEventListener() {}, createElement() { return {}; } },
    localStorage: { getItem() { return null; } },
    window: {},
    ApexRoster: { LAZY_XR: ["js/xr/xr-session.js"], LAZY_XR_EDGES: [] },
    ScriptLoader: { create() { return { load() { ctx.fetched += 1; return Promise.resolve(true); } }; } },
  });
  seedLog(ctx);
  ctx.window = ctx;
  ctx.fetched = 0;
  vm.runInContext(read("js/xr/xr-boot.js").replace(/^const\b/gm, "var"), ctx, { filename: "xr-boot.js" });
  ctx.XrBoot.mountUi();
  assert.equal(ctx.fetched, 0);
  assert.equal(typeof ctx.window.__apexXr.ensure, "function");
  ctx.XrBoot.bind({ gfx: {}, tickBody() {}, windowTick() {}, getCamMode() { return 0; }, setCamMode() {} });
  assert.equal(ctx.XrBoot.isBound(), false);
});

// 14-XR: wantXrBundle was `!!navigator.xr`, which is true on every Chrome / Edge
// desktop with no headset, so each of them fetched the ~42 KB LAZY_XR bundle (and
// mounted an ENTER VR button that could only fail). It now asks isSessionSupported
// ("immersive-vr") first and only a definite "no" skips the fetch.
async function mountWith({ xr, ls = {} }) {
  const loads = [];
  const store = new Map(Object.entries(ls));
  const ctx = vm.createContext({
    console,
    Log: { warn() {}, info() {} },
    window: {},
    document: { body: {} },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    navigator: xr === undefined ? {} : { xr },
    ApexRoster: { LAZY_XR: ["js/xr/x.js"], LAZY_XR_EDGES: [] },
    ScriptLoader: { create: () => ({ load: async (files) => { loads.push(files.slice()); return true; }, }) },
    setTimeout: (fn) => setImmediate(fn),   // the probe's cap fires on the next turn
    clearTimeout() {},
  });
  vm.runInContext(read("js/xr/xr-boot.js").replace(/^const\b/gm, "var"), ctx, { filename: "xr-boot.js" });
  ctx.XrBoot.mountUi();
  for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));
  return loads;
}

test("XrBoot.mountUi: a desktop browser with navigator.xr but no headset never fetches the XR bundle", async () => {
  assert.deepEqual(await mountWith({ xr: { isSessionSupported: async (m) => { assert.equal(m, "immersive-vr"); return false; } } }), []);
});

test("XrBoot.mountUi: a headset (isSessionSupported true) fetches it", async () => {
  assert.equal((await mountWith({ xr: { isSessionSupported: async () => true } })).length, 1);
});

test("XrBoot.mountUi: a probe that throws, rejects or hangs keeps the old answer (fetch)", async () => {
  assert.equal((await mountWith({ xr: { isSessionSupported() { throw new Error("SecurityError"); } } })).length, 1);
  assert.equal((await mountWith({ xr: { isSessionSupported: () => Promise.reject(new Error("x")) } })).length, 1);
  assert.equal((await mountWith({ xr: { isSessionSupported: () => new Promise(() => {}) } })).length, 1, "past the cap");
  assert.equal((await mountWith({ xr: {} })).length, 1, "no isSessionSupported at all");
});

test("XrBoot.mountUi: no navigator.xr fetches nothing; an armed VR mode or a pending enter fetches without probing", async () => {
  assert.deepEqual(await mountWith({ xr: undefined }), []);
  let probed = 0;
  const xr = { isSessionSupported: async () => { probed++; return false; } };
  assert.equal((await mountWith({ xr, ls: { "apex26.xr": "1" } })).length, 1);
  assert.equal((await mountWith({ xr, ls: { "apex26.xrEnterPending": "1" } })).length, 1);
  assert.equal(probed, 0);
});
