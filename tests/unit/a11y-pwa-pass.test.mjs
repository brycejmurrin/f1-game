// THE 2026-09-27 A11Y / PWA PASS, as behaviour: each assertion EXECUTES the
// shipped source in a VM rather than grepping for it.
//   - Input.pickPad: the pad that drives is the one most recently USED (a
//     button down, an axis moved); among never-used pads a STANDARD mapping
//     first, then Gamepad.timestamp — never whichever holds slot 0.
//     https://developer.mozilla.org/en-US/docs/Web/API/Gamepad/mapping
//   - Input.lockLandscape / unlockLandscape: touch-only, swallow a rejection,
//     and unlock only what they locked.
//     https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock
//   - CamModes.refreshCamBtn: the CAM button's accessible name starts with its
//     visible word (WCAG 2.5.3 Label in Name).
//     https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html
//   - manifest.json asks for fullscreen display before standalone.
// The service-worker half (navigation preload, the memoised cache order) lives
// in service-worker.test.mjs beside the harness it needs.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function bootInput({ coarse = false, orientation, pads = null, listeners = null } = {}) {
  const el = () => ({
    addEventListener() {}, removeEventListener() {}, style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, removeAttribute() {}, children: [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 300 }),
    setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => false,
  });
  const sb = {
    Math, Object, Array, Number, isFinite, JSON, Map, Set, Date, String, RegExp, Promise,
    performance: { now: () => 0 },
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    addEventListener: listeners ? (t, f) => { (listeners[t] ||= []).push(f); } : () => {},
    removeEventListener() {}, setTimeout: () => 0, clearTimeout() {},
    navigator: pads ? { getGamepads: () => pads } : {}, screen: orientation ? { orientation } : {},
    matchMedia: (q) => ({ matches: coarse && /coarse/.test(q), addEventListener() {} }),
    document: {
      addEventListener() {}, removeEventListener() {},
      getElementById: el, querySelector: el, querySelectorAll: () => [], hidden: false,
      activeElement: null, dispatchEvent: () => true,
      body: { classList: { add() {}, remove() {}, toggle() {} } },
    },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(read("js/core/mat4.js"), ctx, { filename: "js/core/mat4.js" });
  for (const f of ["js/input/bindings.js", "js/input/pad-menu.js", "js/input/haptics.js", "js/input/hold-buttons.js", "js/input/input.js"])
    vm.runInContext(read(f), ctx, { filename: f });
  return vm.runInContext("Input", ctx);
}

const pad = (id, mapping, timestamp, connected = true) => ({ id, mapping, timestamp, connected, axes: [], buttons: [] });

// THE RULE CHANGED (2026-10-04). It used to be "standard mapping first", and
// this file pinned it with a wheel (mapping "", used at t 900) losing to an
// Xbox pad (t 10). That pin was the bug: a wheel enumerates with mapping "",
// so any standard pad left on its dongle took the car and the wheel wizard
// away from the wheel actually being turned. USE ranks first now; the old
// order only breaks a tie between pads nobody has used yet.
const never = () => 0;
const usedAt = (table) => (p) => table[p.id] || 0;

test("pickPad: the pad being USED drives, even over an idle standard pad in an earlier slot", () => {
  const Input = bootInput();
  const wheel = pad("wheel", "", 900);
  const xbox = pad("xbox", "standard", 10);
  assert.equal(Input.pickPad([xbox, wheel], usedAt({ wheel: 900 })).id, "wheel", "the wheel being turned drives");
  assert.equal(Input.pickPad([wheel, xbox], usedAt({ wheel: 900, xbox: 950 })).id, "xbox", "picking the pad up hands it back");
  assert.equal(Input.pickPad([wheel, xbox], never).id, "xbox", "nobody has used either yet: standard mapping first");
  assert.equal(Input.pickPad([null, wheel], never).id, "wheel", "with no standard pad the non-standard one still drives");
});

test("pickPad: among idle pads the newest timestamp wins, slot order breaks ties", () => {
  const Input = bootInput();
  assert.equal(Input.pickPad([pad("a", "standard", 100), pad("b", "standard", 250)], never).id, "b");
  assert.equal(Input.pickPad([pad("a", "standard", 300), pad("b", "standard", 250)], never).id, "a");
  assert.equal(Input.pickPad([pad("a", "standard", 5), pad("b", "standard", 5)], never).id, "a", "an idle pair is stable");
  assert.equal(Input.pickPad([pad("a", "standard", 999, false), pad("b", "standard", 1)], usedAt({ a: 999 })).id, "b", "a disconnected pad never drives");
  assert.equal(Input.pickPad([pad("a", "standard", undefined), pad("b", "standard", 1)], never).id, "b", "no timestamp counts as 0");
  assert.equal(Input.pickPad([]), null);
  assert.equal(Input.pickPad(null), null);
});

// The live path: poll() stamps use itself. An Xbox pad idles in slot 0 while
// the wheel in slot 1 is turned: the wheel steers; pot jitter is not use; and
// when the Xbox pad takes over again, a button already held on it is not read
// as a fresh press against the wheel's buttons (edges are per device).
function bootLive(pads) {
  const listeners = {};
  const Input = bootInput({ pads, listeners });
  Input.init({ addEventListener() {}, removeEventListener() {}, style: {}, dataset: {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 300 }) });
  for (const f of listeners.gamepadconnected || []) f({ gamepad: pads[0] });
  return Input;
}
const btns = (n = 17) => Array.from({ length: n }, () => ({ pressed: false, value: 0 }));

test("poll(): turning a wheel takes the car from an idle standard pad; jitter does not; edges stay per device", () => {
  const xbox = { id: "xbox", index: 0, mapping: "standard", connected: true, timestamp: 1, axes: [0, 0, 0, 0], buttons: btns() };
  const wheel = { id: "wheel", index: 1, mapping: "", connected: true, timestamp: 1, axes: [0, -1, -1, 0], buttons: btns(24) };
  xbox.buttons[2] = { pressed: true, value: 1 };        // X (BOOST) already held when the page first sees the pad
  const Input = bootLive([xbox, wheel]);
  Input.poll();
  Input.consumeBoostToggle();                            // the press that woke the pad is a real one
  wheel.axes[0] = 0.2; Input.poll();
  assert.equal(Input.steer(), 0, "20 % pot jitter on the wheel is not use: the idle standard pad still drives");
  wheel.axes[0] = 0.6; Input.poll();
  assert.ok(Input.steer() > 0.5, "the wheel being turned drives: " + Input.steer());
  xbox.axes[0] = -0.7; Input.poll();
  assert.ok(Input.steer() < -0.5, "picking the pad up hands it back: " + Input.steer());
  assert.equal(Input.consumeBoostToggle(), false, "X held on the pad all along is not a new press against the wheel's buttons");
});

test("lockLandscape locks only on a touch device, and unlock releases only its own lock", async () => {
  const calls = [];
  const orientation = {
    lock: (o) => { calls.push("lock:" + o); return Promise.resolve(); },
    unlock: () => { calls.push("unlock"); },
  };
  const desktop = bootInput({ coarse: false, orientation });
  assert.equal(await desktop.lockLandscape(), false, "a mouse-driven desktop has no orientation to lock");
  desktop.unlockLandscape();
  assert.deepEqual(calls, [], "nothing locked, nothing unlocked");

  const phone = bootInput({ coarse: true, orientation });
  assert.equal(await phone.lockLandscape(), true);
  phone.unlockLandscape();
  phone.unlockLandscape();
  assert.deepEqual(calls, ["lock:landscape", "unlock"], "one lock, one unlock — the second unlock is a no-op");
});

test("lockLandscape swallows a rejection (not fullscreen, iPhone, unsupported) and never unlocks", async () => {
  const calls = [];
  const orientation = {
    lock: () => Promise.reject(Object.assign(new Error("not fullscreen"), { name: "NotSupportedError" })),
    unlock: () => calls.push("unlock"),
  };
  const phone = bootInput({ coarse: true, orientation });
  assert.equal(await phone.lockLandscape(), false);
  phone.unlockLandscape();
  assert.deepEqual(calls, []);
  const noApi = bootInput({ coarse: true });
  assert.equal(await noApi.lockLandscape(), false, "no screen.orientation at all");
});

test("game.js locks landscape after race fullscreen succeeds and unlocks on exit and quit", () => {
  const g = read("js/ui/platform-session.js") + read("js/game.js");
  assert.match(g, /req\.call\(el\)\)\.then\(\(\) => \{ Input\.lockEscape\(\); if \(G.state === "race" \|\| G.state === "count"\) Input\.lockLandscape\(\); \}\)/);
  assert.match(g, /"fullscreenchange", \(\) => \{ if \(!document\.fullscreenElement\) \{ Input\.unlockEscape\(\); Input\.unlockLandscape\(\); \}/);
  const quit = g.slice(g.indexOf("function quitToMenu() {"), g.indexOf("function quitToMenu() {") + 600);
  assert.match(quit, /Input\.unlockLandscape\(\)/, "quitting the race releases the lock");
});

test("manifest.json asks for fullscreen, then standalone", () => {
  const m = JSON.parse(read("manifest.json"));
  assert.deepEqual(m.display_override, ["fullscreen", "standalone"]);
  assert.equal(m.display, "standalone", "display stays the fallback for browsers without display_override");
});

test("the CAM button's accessible name starts with the word it shows", () => {
  const attrs = {};
  const btn = {
    textContent: "", setAttribute: (k, v) => { attrs[k] = v; }, addEventListener() {},
  };
  const sb = {
    Log: { info() {} }, setTimeout, clearTimeout,
    document: { body: { classList: { toggle() {}, contains: () => false }, toggleAttribute() {} }, addEventListener() {} },
    CamTunerPanel: { refresh() {} },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(read("js/camera/mode-switch.js"), ctx, { filename: "js/camera/mode-switch.js" });
  const G = { $: (id) => (id === "btn-cam" ? btn : null), camMode: 0, store: { set() {} } };
  const cams = vm.runInContext("CamModes", ctx).create(G);
  assert.equal(btn.textContent, "CHASE");
  assert.equal(attrs["aria-label"], "CHASE camera");
  cams.setCamMode(3);
  assert.equal(btn.textContent, "COCKPIT");
  assert.ok(attrs["aria-label"].toLowerCase().startsWith(btn.textContent.toLowerCase()), "label in name, after every change");
});
