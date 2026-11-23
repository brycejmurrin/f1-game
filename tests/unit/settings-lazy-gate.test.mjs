// #4798 settings-lazy gate, row 1 part 2: each Settings-only half below used to
// run while the eager shell evaluated (deferred scripts run at readyState
// "interactive", BEFORE DOMContentLoaded) or inside the DOMContentLoaded task.
// Booted here in a VM exactly as the shell boots it (readyState "interactive",
// then DOMContentLoaded), each one must NOT run before the gate flushes and MUST
// run when it does (SettingsNav.flushLazy: the first Settings enter, the first
// pointerdown / keydown, or idle). The marker is the lookup (or listener) that
// only the Settings half makes; every eager half still runs where it did.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const read = (f) => fs.readFileSync(new URL("../../" + f, import.meta.url), "utf8");

function boot(file, extra = {}, dom = {}) {
  const lookups = [], docListeners = [], dcl = [], gated = [];
  const inert = () => new Proxy(function () {}, { get: (_t, k) => (k === Symbol.toPrimitive ? () => "" : k === "then" ? undefined : inert()), apply: () => inert() });
  const document = {
    readyState: "interactive", visibilityState: "visible",
    getElementById(id) { lookups.push(id); return null; },
    querySelector: () => null, querySelectorAll: () => [], createElement: () => inert(),
    addEventListener(t, fn) { if (t === "DOMContentLoaded") dcl.push(fn); else docListeners.push(t); },
    removeEventListener() {},
    documentElement: inert(), body: null, head: null, ...dom,
  };
  const values = {};
  const store = { get: (k, d) => (k in values ? values[k] : d), set: (k, v) => { values[k] = v; return true; },
    subscribe() {}, raw: () => null, rawSet: () => true, remove() {}, keys: () => [] };
  const rowCalls = [];
  const SettingRow = { build: (id) => { rowCalls.push(id); return { row: inert(), sel: null }; }, wire: (id) => { rowCalls.push(id); },
    labels: (v) => v, paint() {} };
  const ctx = vm.createContext({
    document, window: { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {} },
    navigator: { userAgent: "node" }, Log: { info() {}, warn() {}, error() {} },
    GameStore: { store }, SettingRow, setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame: () => 0,
    matchMedia: () => ({ matches: false, addEventListener() {} }), localStorage: { getItem: () => null, setItem() {} },
    SettingsNav: { lazy: (fn) => gated.push(fn), onEnter() {}, onLeave() {} },
    ...extra,
  });
  ctx.globalThis = ctx; ctx.self = ctx;
  for (const f of [file].flat()) {
    if (f === "js/ui/appearance-studio.js") {
      const body = "js/ui/appearance-studio-ui.js";
      vm.runInContext(read(body), ctx, { filename: absSrc(body) });
    }
    vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  }
  const at = { lookups: lookups.slice(), listeners: docListeners.slice(), rows: rowCalls.slice() };
  for (const fn of dcl) fn();
  const atDcl = { lookups: lookups.slice(), listeners: docListeners.slice(), rows: rowCalls.slice() };
  for (const fn of gated.splice(0)) fn();
  return { at, atDcl, flushed: { lookups, listeners: docListeners, rows: rowCalls }, dclCount: dcl.length };
}

const has = (snap, marker) => (marker.listener ? snap.listeners.includes(marker.listener)
  : marker.row ? snap.rows.includes(marker.row) : snap.lookups.includes(marker.id));

const CASES = [
  { file: "js/ui/pause-opts.js", half: "PAUSE MENU rows", marker: { id: "pm-pausemenu-body" }, eager: { id: "pausemenu" } },
  { file: "js/ui/title-fx.js", half: "TITLE SCREEN rows", marker: { id: "pm-titleintro" }, eager: { id: "overlay" } },
  { file: "js/ui/title-layout.js", half: "TITLE LAYOUT fold", marker: { id: "pm-panel-appearance" } },
  { file: "js/ui/hud-elements.js", half: "HUD ELEMENTS rows", marker: { id: "pm-hud-details" } },
  { file: "js/ui/hud-layout.js", half: "HUD LAYOUT fold", marker: { id: "pm-hud-details" } },
  { file: "js/ui/captions.js", half: "CAPTIONS rows", marker: { id: "pm-cvd" } },
  { file: "js/ui/appearance-opts.js", half: "COLOUR VISION / APP ICON / TEXT SIZE rows", marker: { id: "pm-contrast" } },
  { file: "js/ui/appearance-studio.js", half: "APPEARANCE studio", marker: { id: "pm-panel-appearance" } },
  { file: "js/ui/setting-deps.js", half: "SettingDeps listeners + observer", marker: { listener: "change" } },
  { file: "js/camera/cockpit-opts.js", half: "COCKPIT fold", marker: { id: "pm-panel-display" } },
  { file: "js/ui/post-fx-opts.js", half: "POST FX rows", marker: { row: "any" } },
  { file: "js/ui/driving-line-opts.js", half: "DRIVING LINE rows", marker: { row: "pm-linebrakecue" },
    extra: { DrivingLine: { PALETTES: [], OPACITIES: [], setPalette() {}, setOpacity() {}, palette: () => "f1", opacity: () => "normal" } } },
];

for (const c of CASES) {
  test(`${c.file}: ${c.half} wait for the settings-lazy gate, then run (#4798)`, () => {
    const { at, atDcl, flushed, dclCount } = boot(c.file, c.extra);
    const m = c.marker.row === "any" ? null : c.marker;
    assert.ok(dclCount >= 1, "an interactive document waits for DOMContentLoaded");
    if (m) {
      assert.equal(has(at, m), false, "not at eval");
      assert.equal(has(atDcl, m), false, "not in the DOMContentLoaded task");
      assert.equal(has(flushed, m), true, "runs when the gate flushes");
    } else {
      assert.equal(atDcl.rows.length, 0, "no SettingRow work before the gate");
      assert.ok(flushed.rows.length > 0, "the rows are wired when the gate flushes");
    }
    if (c.eager) assert.equal(has(atDcl, c.eager), true, "the eager half still runs in the DOMContentLoaded task");
  });
}

test("KeyBinds re-renders its tables at the gate, not in the DCL task (#4798)", () => {
  const src = read("js/ui/key-binds.js");
  assert.match(src, /addEventListener\("DOMContentLoaded", \(\) => \(typeof SettingsNav !== "undefined" && SettingsNav\.lazy \? SettingsNav\.lazy\(rerender\) : rerender\(\)\)/);
});

test("Files mounts health with its export body; neither loads at title paint", () => {
  const shell = read("index.html"), sw = read("sw.js"), spec = read("js/roster.js");
  const roster = vm.runInNewContext(spec + ";self.ApexRoster", { self: {} }, { filename: absSrc("js/roster.js") });
  for (const file of ["js/ui/save-health.js", "js/ui/settings-export-body.js"]) {
    assert.equal(shell.includes('src="' + file), false);
    assert.ok(roster.LAZY_SAVES_DATA.includes(file));
    assert.ok(sw.includes(file), "offline coverage for " + file);
  }
  assert.ok(roster.LAZY_SAVES_DATA_EDGES.some(([first, second]) =>
    first === "js/ui/save-health.js" && second === "js/ui/settings-export-body.js"));
});

// Row 1 part 3: the three DCL initialisers left after #5477 (screen-looks search
// descriptors, the METRICS rows, the RENDERER fold). Each Settings-only half
// waits for the gate; METRICS keeps its hotkeys in the DCL task.
const PART3 = [
  { file: "js/perf/metrics-overlay.js", half: "METRICS rows + fold", marker: { id: "pm-hud-details" } },
  { file: "js/perf/renderer-picker.js", half: "RENDERER picker + RENDERER fold", marker: { id: "pm-renderer" } },
];
for (const c of PART3) {
  test(`${c.file}: ${c.half} wait for the settings-lazy gate, then run (#4798)`, () => {
    const { at, atDcl, flushed, dclCount } = boot(c.file);
    assert.ok(dclCount >= 1, "an interactive document waits for DOMContentLoaded");
    assert.equal(has(at, c.marker), false, "not at eval");
    assert.equal(has(atDcl, c.marker), false, "not in the DOMContentLoaded task");
    assert.equal(has(flushed, c.marker), true, "runs when the gate flushes");
  });
}

test("CAMERA FEEL and VR mount lazily in the existing display order (#4798)", () => {
  const make = (id = "") => ({
    id, children: [],
    setAttribute() {},
    appendChild(child) { this.insertBefore(child, null); },
    insertBefore(child, before) {
      child.parentNode = this;
      this.children.splice(before ? this.children.indexOf(before) : this.children.length, 0, child);
    },
  });
  const panel = make("pm-panel-display"), visual = make("pm-panel-visual"), graphics = make("pm-panel-graphics");
  panel.appendChild(make("pm-hud-details"));
  visual.appendChild(make("pm-visual-tuners"));
  graphics.appendChild(make("pm-display-adv"));
  const find = (root, id) => root.id === id ? root : root.children.map(child => find(child, id)).find(Boolean);
  const queue = [], order = () => panel.children.map(el => el.id);
  const { dclCount } = boot(["js/camera/feel.js", "js/xr/xr-opts.js"], {
    M4: {},
    SettingRow: { build: id => ({ row: make(id) }), labels: values => values, wire() {} },
    SettingsNav: { lazy: fn => queue.push(fn), onEnter() {} },
  }, {
    getElementById: id => find(panel, id) || find(visual, id) || find(graphics, id) || null,
    createElement: () => make(),
  });
  assert.equal(dclCount, 0, "interactive scripts queue immediately even when DCL already fired");
  assert.deepEqual(order(), ["pm-hud-details"]);
  assert.equal(queue.length, 2);
  // Cockpit may already exist when these modules are loaded late.
  panel.appendChild(make("pm-cockpit"));
  for (const fn of queue) fn();
  assert.deepEqual(order(), ["pm-hud-details", "pm-camfeel", "pm-xr-block", "pm-cockpit"]);
});

test("metrics settings build only through the gate, with no independent boot timers (#4798)", () => {
  const scheduled = [];
  const { atDcl, flushed } = boot("js/perf/metrics-overlay.js", {
    setTimeout(_fn, ms) { scheduled.push(ms); },
  });
  const fold = { id: "pm-metrics" };
  assert.deepEqual(scheduled, []);
  assert.equal(has(atDcl, fold), false);
  assert.equal(has(flushed, fold), true, "the fold builds with the rows when the gate opens");

  const fallback = boot("js/perf/metrics-overlay.js", { SettingsNav: undefined });
  assert.equal(has(fallback.atDcl, fold), true, "the direct fallback also builds the fold");
});

test("js/perf/metrics-overlay.js: the ` / F9 hotkey binds in the DCL task, before the gate (#4798)", () => {
  const winListeners = [];
  const window = { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener: (t) => winListeners.push(t) };
  let atDcl = null;
  const { dclCount } = boot("js/perf/metrics-overlay.js", {
    window,
    SettingsNav: { lazy: () => { atDcl = winListeners.slice(); }, onEnter() {}, onLeave() {} },
  });
  assert.ok(dclCount >= 1);
  assert.ok(atDcl && atDcl.includes("keydown"), "keydown is bound before the rows are queued");
});

test("js/ui/screen-looks.js: the search descriptors register at the gate, not in the DCL task (#4798)", () => {
  const registered = [], queue = [];
  let atGate = null;
  boot("js/ui/screen-looks.js", {
    SettingsSearch: { register: (id) => registered.push(id) },
    SettingsNav: { lazy: (fn) => { atGate = registered.slice(); queue.push(fn); }, onEnter() {}, onLeave() {} },
  });
  assert.ok(atGate, "the DCL task queues work on the gate");
  assert.deepEqual(atGate, [], "nothing registered before the gate");
  for (const fn of queue.splice(0)) fn();
  assert.deepEqual(registered, ["screen-looks"], "registers once, when the gate flushes");
});
