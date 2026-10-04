// THE 2026-09-27 A11Y / PWA PASS, as behaviour: each assertion EXECUTES the
// shipped source in a VM rather than grepping for it.
//   - Input.pickPad: the pad that drives is a STANDARD-mapping pad first, then
//     the most recently used (Gamepad.timestamp) — not whichever holds slot 0.
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

function bootInput({ coarse = false, orientation } = {}) {
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
    addEventListener() {}, removeEventListener() {}, setTimeout: () => 0, clearTimeout() {},
    navigator: {}, screen: orientation ? { orientation } : {},
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

test("pickPad: a standard-mapping pad outranks a non-standard one in an earlier slot", () => {
  const Input = bootInput();
  const wheel = pad("wheel", "", 900);
  const xbox = pad("xbox", "standard", 10);
  assert.equal(Input.pickPad([wheel, xbox]).id, "xbox", "slot 0 no longer wins by position");
  assert.equal(Input.pickPad([null, wheel]).id, "wheel", "with no standard pad the non-standard one still drives");
});

test("pickPad: among equals the most recently used pad wins, slot order breaks ties", () => {
  const Input = bootInput();
  assert.equal(Input.pickPad([pad("a", "standard", 100), pad("b", "standard", 250)]).id, "b");
  assert.equal(Input.pickPad([pad("a", "standard", 300), pad("b", "standard", 250)]).id, "a");
  assert.equal(Input.pickPad([pad("a", "standard", 5), pad("b", "standard", 5)]).id, "a", "an idle pair is stable");
  assert.equal(Input.pickPad([pad("a", "standard", 999, false), pad("b", "standard", 1)]).id, "b", "a disconnected pad never drives");
  assert.equal(Input.pickPad([pad("a", "standard", undefined), pad("b", "standard", 1)]).id, "b", "no timestamp counts as 0");
  assert.equal(Input.pickPad([]), null);
  assert.equal(Input.pickPad(null), null);
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

// L8-f: identity, richer install UI, a shortcut, and an install door outside iOS.
// `id` resolves against start_url's ORIGIN, and an app installed before it had
// one is identified by its start_url (https://brycejmurrin.github.io/f1-game/),
// so "/f1-game/" keeps every existing install the same app.
// https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/id
test("manifest.json: id keeps the installed identity, screenshots and shortcuts point at shipped files", () => {
  const m = JSON.parse(read("manifest.json"));
  assert.equal(m.id, "/f1-game/");
  assert.ok(m.screenshots.length >= 1);
  for (const sh of m.screenshots) {
    assert.ok(fs.existsSync(path.join(ROOT, sh.src)), sh.src + " exists");
    assert.match(sh.sizes, /^\d+x\d+$/);
    assert.equal(sh.form_factor, "wide");
    assert.ok(sh.label, "a screenshot is labelled for assistive tech");
  }
  for (const sc of m.shortcuts) {
    assert.ok(sc.name && sc.url, "name + url");
    assert.ok(fs.existsSync(path.join(ROOT, sc.url.split(/[?#]/)[0])), sc.url + " is a page that ships");
    for (const ic of sc.icons || []) assert.ok(fs.existsSync(path.join(ROOT, ic.src)));
  }
});

test("INSTALL APP: beforeinstallprompt is stashed, prompt() only from the tap, once; appinstalled hides it", async () => {
  const ps = read("js/ui/platform-session.js");
  const body = ps.slice(ps.indexOf("(function installChip()"), ps.indexOf("})();", ps.indexOf("(function installChip()")) + 5);
  const win = new Map(), stored = new Map();
  const chip = { hidden: true, listeners: new Map(), addEventListener(t, fn) { this.listeners.set(t, fn); } };
  const sb = {
    window: { addEventListener: (t, fn) => win.set(t, fn) },
    $: (id) => (id === "install-chip" ? chip : null),
    store: { get: (k, d) => (stored.has(k) ? stored.get(k) : d), set: (k, v) => stored.set(k, v) },
    UiLayers: { inRace: () => false },
    Log: { info() {}, warn() {} },
    setTimeout: () => 0,
  };
  vm.createContext(sb);
  vm.runInContext(body, sb);
  let prevented = 0, prompted = 0;
  const ev = { preventDefault: () => prevented++, prompt: async () => { prompted++; }, userChoice: Promise.resolve({ outcome: "accepted" }) };
  win.get("beforeinstallprompt")(ev);
  assert.equal(prevented, 1, "no mini-infobar: our chip instead");
  assert.equal(chip.hidden, false);
  assert.equal(prompted, 0, "never prompted without a tap");
  await chip.listeners.get("click")();
  assert.equal(prompted, 1);
  assert.equal(chip.hidden, true);
  assert.equal(stored.get("installChipSeen"), true);
  await chip.listeners.get("click")();
  assert.equal(prompted, 1, "the event is single-use");
  win.get("beforeinstallprompt")(ev);
  assert.equal(chip.hidden, true, "a player who has seen it is not asked again");
  assert.match(read("index.html"), /<button id="install-chip" type="button" hidden>INSTALL APP<\/button>/);
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
