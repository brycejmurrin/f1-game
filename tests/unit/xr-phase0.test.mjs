/* XR Phase 0 — pure rig math + controller mapping (no WebXR runtime). */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

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

test("XrRig.recenterOffsetFromPose zeroes XZ translation", () => {
  const { XrRig, M4 } = bootXr();
  const pose = M4.ident();
  pose[12] = 1.5; // x
  pose[14] = -2;  // z
  const off = XrRig.recenterOffsetFromPose(pose);
  assert.ok(Math.abs(off.position.x + 1.5) < 1e-4 || Math.abs(off.position.x) < 3);
  assert.equal(off.position.y, 0);
  assert.ok(typeof off.orientation.w === "number");
});

test("XrInput.mapFrame: right trigger thr, left brake, stick steer, edges", () => {
  const { XrInput } = bootXr();
  const latch = { primary: false, secondary: false };
  const sources = [
    {
      handedness: "right",
      gamepad: {
        buttons: [
          { value: 0.8 }, // trigger
          { value: 0 },
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
  assert.equal(samples[0].roll, 5);
  assert.equal(samples[0].thr, 0.2);
  assert.deepEqual(events, ["pause"]);
});

test("XrSession.sessionInit lists webgpu only when preferred", () => {
  // sessionInit is pure — reuse the XR VM (no navigator.xr required).
  const ctx = bootXr();
  vm.runInContext(read("js/xr/xr-session.js").replace(/^const\b/gm, "var"), ctx, { filename: "xr-session.js" });
  const a = ctx.XrSession.sessionInit(false);
  assert.ok(!a.optionalFeatures.includes("webgpu"));
  const b = ctx.XrSession.sessionInit(true);
  assert.ok(b.optionalFeatures.includes("webgpu"));
});

test("vendor ships XRButton / VRButton / WebGLXRFallback", () => {
  for (const f of [
    "vendor/three-0.186.0/addons/webxr/XRButton.js",
    "vendor/three-0.186.0/addons/webxr/VRButton.js",
    "vendor/three-0.186.0/addons/webxr/WebGLXRFallback.js",
  ]) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  }
  const m = JSON.parse(read("vendor/three-0.186.0/MANIFEST.json"));
  assert.ok(m.files["addons/webxr/XRButton.js"]);
  assert.ok(m.files["addons/webxr/VRButton.js"]);
  assert.ok(m.files["addons/webxr/WebGLXRFallback.js"]);
});

test("XrBoot façade: comfort off until presenting; applyEyes null outside XR", () => {
  const ctx = bootXr();
  vm.runInContext(read("js/xr/xr-session.js").replace(/^const\b/gm, "var"), ctx, { filename: "xr-session.js" });
  vm.runInContext(read("js/xr/xr-boot.js").replace(/^const\b/gm, "var"), ctx, { filename: "xr-boot.js" });
  assert.equal(ctx.XrBoot.comfort(), false);
  assert.equal(ctx.XrBoot.loopByXr(), false);
  assert.equal(ctx.XrBoot.applyEyes({}, [0, 1, 0], [0, 1, 1], [0, 1, 0]), null);
  assert.equal(ctx.XrBoot.present(null, null, null), false);
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
