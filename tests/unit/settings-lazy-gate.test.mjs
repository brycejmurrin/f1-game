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

function boot(file, extra = {}) {
  const lookups = [], docListeners = [], dcl = [], gated = [];
  const inert = () => new Proxy(function () {}, { get: (_t, k) => (k === Symbol.toPrimitive ? () => "" : k === "then" ? undefined : inert()), apply: () => inert() });
  const document = {
    readyState: "interactive", visibilityState: "visible",
    getElementById(id) { lookups.push(id); return null; },
    querySelector: () => null, querySelectorAll: () => [], createElement: () => inert(),
    addEventListener(t, fn) { if (t === "DOMContentLoaded") dcl.push(fn); else docListeners.push(t); },
    removeEventListener() {},
    documentElement: inert(), body: null, head: null,
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
  vm.runInContext(read(file), ctx, { filename: absSrc(file) });
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
  { file: "js/ui/save-health.js", half: "STORAGE HEALTH section", marker: { id: "pm-panel-files" } },
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

test("SettingsExport mounts at the gate, queued after SaveHealth as at eval (#4798)", () => {
  const src = read("js/ui/settings-export.js");
  assert.match(src, /readyState !== "complete"\) document\.addEventListener\("DOMContentLoaded", \(\) => \(typeof SettingsNav !== "undefined" && SettingsNav\.lazy \? SettingsNav\.lazy\(mount\) : mount\(\)\)/);
  const shell = read("index.html");
  assert.ok(shell.indexOf('src="js/ui/save-health.js') < shell.indexOf('src="js/game.js'),
    "SaveHealth's DCL listener registers (eval) before game.js runs SettingsExport.create, so its section stays first");
});
