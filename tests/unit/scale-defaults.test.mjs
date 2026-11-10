/* scale-defaults.test.mjs — the touch defaults, and the two floors they serve.
 *
 * css/tokens.css owns FIRST paint (the `@media (pointer: coarse)` block) and
 * js/ui/scale.js owns every write after it. They are two copies of the same
 * three numbers, and nothing held them together: on 2026-09-08 both were moved
 * to one person's phone settings (--hud-scale 1.24, buttons 1.4536x that = 1.80)
 * and the driving controls landed on top of the readouts on every phone —
 * #btn-brake over 119x53px of #minimap, #btn-boost over 59x84px of #hud-sectors,
 * at 852x393 and 667x375 alike. hud-layout.spec.js went red on 12 cases and
 * stayed red, because test:ui is not in the fast tier.
 *
 * This file is the cheap guard that would have caught it, and it pins the
 * ARGUMENT, not just the numbers:
 *
 *   1. CSS and JS agree. A drift between them is a phone that changes size on
 *      the first JS write.
 *   2. TARGET SIZE and READOUT SIZE are separate floors. XAG 107 asks ~15mm for
 *      a phone touch target (the Game Accessibility Guidelines say 0.96cm
 *      minimum, 2.4cm ideal; Android says 48dp); XAG 101 asks a px-at-DPI
 *      legibility floor for text, and its mobile figures are a DPI CORRECTION
 *      holding physical size constant, not a "touch gets a bigger UI" rule.
 *      One `(pointer: coarse)` branch raising both is what broke the layout, so
 *      the button ratio is asserted to carry the physical floor while
 *      --hud-scale is asserted NOT to carry a blanket bump.
 *   3. The default is a FLOOR and the range is generous — XAG 101 calls its
 *      sizes "the minimum default size ... upon game launch" and asks for
 *      scaling "larger or smaller at the player's discretion". So the old 1.80
 *      must stay REACHABLE on the slider; this is not a cap.
 *
 * The mm figures use the CSS reference pixel, 1/96in = 0.2646mm. They are
 * approximate by construction (a device pixel is not a reference pixel on every
 * phone) and are asserted with margin, as a floor rather than a target.
 *
 * Run: node --test tests/unit/scale-defaults.test.mjs   (npm run test:tooling-fast)
 */
import { readCssSource } from "../helpers/css-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const tokens = read("css/tokens.css");
const scaleJs = read("js/ui/scale.js");

const MM_PER_PX = 25.4 / 96;

/** The `@media (pointer: coarse)` :root declarations, as {prop: value}. */
function coarseDefaults() {
  // Comments and newlines sit between the at-rule and the :root block, so match
  // lazily across them rather than assuming they are adjacent.
  const m = tokens.match(/@media \(pointer: coarse\)\s*\{[\s\S]*?:root\s*\{([^}]*)\}/);
  assert.ok(m, "css/tokens.css must declare the (pointer: coarse) :root block");
  const out = {};
  for (const d of m[1].split(";")) {
    const i = d.indexOf(":");
    if (i > 0) out[d.slice(0, i).trim()] = d.slice(i + 1).trim();
  }
  return out;
}

test("css/tokens.css and js/ui/scale.js agree on the touch defaults", () => {
  const css = coarseDefaults();
  assert.equal(css["--hud-btn-scale"], "var(--hud-btn-mult)", "touch buttons use their own default");
  const ratio = [null, css["--hud-btn-mult"]];
  const jsRatio = scaleJs.match(/const BTN_DEFAULT = ([\d.]+);/);
  assert.ok(jsRatio, "independent button default exists");
  assert.equal(Number(ratio[1]), Number(jsRatio[1]));

  const jsDefaults = scaleJs.match(/scaleDefault = \(k\) => \(coarseUi\(\) \? \(k === "hudScale" \? (\d+) : (\d+)\) : 100\)/);
  assert.ok(jsDefaults, "js/ui/scale.js must declare the coarse scaleDefault pair");
  assert.equal(Number(jsDefaults[1]) / 100, Number(css["--hud-scale"]),
    "--hud-scale and scale.js's hudScale default must agree");
  assert.equal(Number(jsDefaults[2]) / 100, Number(css["--ui-scale"]),
    "--ui-scale and scale.js's ui default must agree");
});

test("the touch default puts every driving control over the physical floor", () => {
  // Derived from the tokens the dock really paints with (css/touch-controls.css: --tap for BOOST / OT / AERO,
  // --hold for the pedals and steer arrows; BUTTONS mode puts the taps on --hold too), times the default
  // BUTTON SIZE. Painted in Chromium at the default, 2026-11-09, BUTTONS mode:
  //   852x393  every dock button 72 px (19.1 mm)      852x368  64 px (16.9 mm)
  // It read --btn x measured fit factors until then, a model the dock stopped using.
  const css = coarseDefaults();
  const ratio = Number(css["--hud-btn-mult"]);
  const touch = readCssSource("css/touch-controls.css");
  const tiers = [...touch.matchAll(/--tap:\s*max\((\d+)px, calc\(24px \/ max\(1, var\(--hud-btn-scale\)\)\)\);\s*--hold:\s*max\((\d+)px,/g)]
    .map((m) => ({ tap: Number(m[1]), hold: Number(m[2]) }));
  assert.equal(tiers.length, 2, "the wide tier and the small-landscape tier each declare --tap and --hold");
  const mm = (px) => px * ratio * MM_PER_PX;
  for (const { tap, hold } of tiers) {
    assert.ok(mm(tap) >= 15,
      `a ${tap}px tap lands at ~${mm(tap).toFixed(1)}mm at the default; XAG 107 asks ~15mm ` +
      `minimum for a phone touch target. Raise --tap or the --hud-btn-mult ratio, do NOT ` +
      `raise --hud-scale: that carries the readouts up too and is what put the ` +
      `pedal column on the minimap`);
    assert.ok(mm(hold) >= 15, `a ${hold}px hold lands at ~${mm(hold).toFixed(1)}mm, under the 15mm floor`);
    // The other direction. 3 holds + 2 gaps is BUTTONS mode's taps column: past ~21mm a hold it is taller than
    // the room an 852x393 phone has under CAM / PAUSE (the 2026-11-09 report: 85 px circles, "way too large";
    // 2026-09-08 put the pedal column on #minimap the same way).
    assert.ok(mm(hold) <= 21,
      `a ${hold}px hold lands at ~${mm(hold).toFixed(1)}mm at the default. Verify with ` +
      `tests/specs/hud-layout.spec.js before moving this bound`);
  }
});

test("--hud-scale carries no blanket touch bump, and the old size stays reachable", () => {
  const css = coarseDefaults();
  assert.equal(Number(css["--hud-scale"]), 1,
    "--hud-scale is the READOUT axis and its coarse default is 1 on purpose: XAG " +
    "101's mobile sizes are a DPI correction holding physical size constant, not " +
    "a touch bump, and no published guidance prescribes a coarse-pointer UI-scale " +
    "multiplier at all. Size the BUTTONS via the --hud-btn-scale ratio instead");
  // The default is a floor, not a cap. 1.80 (the old default) must still be a
  // value the player can pick, or lowering the default has quietly removed it.
  const min = Number(scaleJs.match(/const SCALE_MIN = (\d+);/)[1]);
  const max = Number(scaleJs.match(/const SCALE_MAX = (\d+);/)[1]);
  assert.ok(max >= 180, `SCALE_MAX is ${max}; the pre-2026-09-14 default of 180 must stay reachable`);
  assert.ok(min <= 100, `SCALE_MIN is ${min}; players must be able to go below the default too`);
});

// ── PANEL OPACITY (DISPLAY › HUD), BUTTON OPACITY's twin ──────────────────────
// UiScale.create(G) run for real in node:vm over stub elements: the slider
// writes --hud-panel-a on <html> only once moved, clamps to 20-100, and its
// revert clears it — the same contract as BUTTON OPACITY beside it.
function bootScale(stored = {}) {
  const rootStyle = new Map();
  const els = new Map();
  const el = (id) => {
    if (!els.has(id)) {
      const cls = new Set();
      els.set(id, {
        id, value: "", textContent: "", hidden: true, oninput: null, onclick: null,
        classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)), contains: (c) => cls.has(c) },
        closest() { return this._row || null; },
      });
    }
    return els.get(id);
  };
  for (const id of ["pm-panelopacity", "pm-btnopacity"]) el(id)._row = el(id + "-row");
  const store = {
    get: (k, d) => (k in stored ? stored[k] : d),
    set: (k, v) => { if (v === null) delete stored[k]; else stored[k] = v; },
    raw: () => null, rawSet: () => {},
  };
  const ctx = vm.createContext({
    Math, Number, String, JSON, isFinite, Object, Array,
    Log: { info() {} },
    SettingRow: { wire() {}, paint() {}, labels: (v) => v.map((x) => [x, x]) },
    PerfGov: { setAutoRes() {} },
    requestAnimationFrame: () => 0,
    window: { matchMedia: () => ({ matches: false }) },
    document: { documentElement: { style: {
      setProperty: (k, v) => rootStyle.set(k, String(v)), removeProperty: (k) => rootStyle.delete(k),
    } } },
  });
  vm.runInContext(scaleJs.replace(/^const UiScale\b/m, "var UiScale"), ctx, { filename: absSrc("js/ui/scale.js") });
  const api = vm.runInContext("UiScale", ctx).create({ $: el, els: {}, store, gfx: {}, updateTrackPreview() {} });
  return { api, el, rootStyle, stored };
}

test("PANEL OPACITY: unset writes nothing; the slider clamps to 20-100 and reverts", () => {
  const { el, rootStyle, stored } = bootScale();
  assert.equal(rootStyle.has("--hud-panel-a"), false, "nothing stored => no inline property");
  assert.equal(el("pm-panelopacity").value, "100");
  assert.equal(el("pm-panelopacity-v").textContent, "100%");
  assert.equal(el("pm-panelopacity-r").hidden, true);
  el("pm-panelopacity").oninput({ target: { value: "40" } });
  assert.equal(stored.hudPanelOpacity, 40);
  assert.equal(rootStyle.get("--hud-panel-a"), "0.4");
  assert.equal(el("pm-panelopacity-v").textContent, "40%");
  assert.equal(el("pm-panelopacity-r").hidden, false);
  assert.ok(el("pm-panelopacity-row").classList.contains("tune-over"));
  el("pm-panelopacity").oninput({ target: { value: "3" } });
  assert.equal(stored.hudPanelOpacity, 20, "20% is the floor");
  el("pm-panelopacity-r").onclick();
  assert.equal("hudPanelOpacity" in stored, false);
  assert.equal(rootStyle.has("--hud-panel-a"), false);
  assert.equal(rootStyle.has("--hud-btn-opacity"), false, "BUTTON OPACITY is a separate axis");
  // A stored out-of-range number is clamped on boot.
  assert.equal(bootScale({ hudPanelOpacity: 250 }).rootStyle.get("--hud-panel-a"), "1");
});

test("HUD SIZE / BUTTON SIZE / BUTTON + PANEL OPACITY survive a reload with the same CSS value (B·H11 settings audit)", () => {
  // These were seed-only: a stored value was read, but nothing proved the slider's write round-trips.
  const ROWS = [
    ["pm-hudscale", "hudScale", "130", "--hud-scale"],
    ["pm-btnscale", "hudBtnScale", "140", "--hud-btn-scale"],
    ["pm-btnopacity", "hudBtnOpacity", "55", "--hud-btn-opacity"],
    ["pm-panelopacity", "hudPanelOpacity", "60", "--hud-panel-a"],
  ];
  const defaults = bootScale().rootStyle;
  for (const [id, key, v, prop] of ROWS) {
    const a = bootScale();
    a.el(id).oninput({ target: { value: v } });
    assert.ok(key in a.stored, `${id} stores apex26.${key}`);
    const live = a.rootStyle.get(prop);
    assert.ok(live !== undefined, `${id} writes ${prop}`);
    const b = bootScale({ ...a.stored });
    assert.equal(b.rootStyle.get(prop), live, `${key} re-applies ${prop} after a reload`);
    assert.notEqual(defaults.get(prop), live, `${key}=${v} differs from a defaults boot`);
  }
});

test("PANEL OPACITY: the HUD plates read the effective token, and HIGH CONTRAST pins it at 1", () => {
  const hud = read("css/hud.css");
  assert.match(tokens, /--hud-panel-a-eff:\s*max\(0\.45, var\(--hud-panel-a, 1\)\);/,
    "unset is exactly 1 (shipped alphas unchanged) and no text plate thins under 0.45 of its alpha");
  const hc = tokens.match(/:root\[data-ui-contrast="high"\] \{([^}]*)\}/);
  assert.ok(hc && /--hud-panel-a-eff:\s*1;/.test(hc[1]), "HIGH CONTRAST must pin --hud-panel-a-eff at 1");
  // Every listed plate reads the one strip token, which multiplies the effective token.
  assert.ok(hud.includes("--hud-strip-bg: color-mix(in srgb, var(--look-hud-bg) calc(100% * var(--hud-panel-a-eff)), transparent);"),
    "--hud-strip-bg is the one panel token");
  for (const sel of [".hud-box {", ".hud-gaps {", "#hud-gearbox {", "#hud-tach {", "#minimap {", "#hud-sectors {",
    "#hud-limits {", "#announce {", "#bc-tower {"]) {
    const at = hud.indexOf("\n" + sel);
    assert.ok(at >= 0, sel);
    const block = hud.slice(at, hud.indexOf("\n}", at + 1));
    assert.ok(block.includes("background: var(--hud-strip-bg);") || block.includes("background: var(--hud-strip-bg)"), sel + " plate");
  }
  // Lights, flags and the OT/AERO fills are signals, not plates.
  const lights = hud.indexOf("\n#lights {");
  assert.ok(lights >= 0, "#lights block");
  assert.doesNotMatch(hud.slice(lights, hud.indexOf("\n}", lights + 1)), /hud-panel-a/);
  assert.doesNotMatch(hud, /#hud-(ot|aero)[^{]*\{[^}]*hud-panel-a/);
  assert.match(read("js/ui/settings-export.js"), /k: "hudPanelOpacity", lane: "json", group: "display", def: null/);
});

// #5166: the default moved LOW -> MED on touch. What the boot APPLIES, not just what the helper says:
// an unset phone pins 0.75, a stored choice wins over the new default, and a pointer device is unchanged
// (AUTO hands the scale to the governor). Pinning never turns the governor off: setAutoRes(false) gates
// only its resolution stage (js/perf/governor.js tick()), the feature-shed ladder still runs.
function bootRes({ coarse, stored = {} }) {
  const calls = { scale: [], autoRes: [], painted: [] };
  const ctx = vm.createContext({
    Math, Number, String, JSON, isFinite, Object, Array,
    Log: { info() {} },
    SettingRow: { wire() {}, paint: (el, v) => { if (el && el.id === "pm-res") calls.painted.push(v); }, labels: (v) => v.map((x) => [x, x]) },
    PerfGov: { setAutoRes: (on) => calls.autoRes.push(on) },
    requestAnimationFrame: () => 0,
    window: { matchMedia: (q) => ({ matches: q === "(pointer: coarse)" ? coarse : false }) },
    document: { documentElement: { style: { setProperty() {}, removeProperty() {} } } },
  });
  vm.runInContext(scaleJs.replace(/^const UiScale\b/m, "var UiScale"), ctx, { filename: absSrc("js/ui/scale.js") });
  const el = (id) => ({ id, value: "", textContent: "", hidden: true, classList: { toggle() {}, contains: () => false }, closest: () => null });
  // GameStore semantics: set(k, undefined) REMOVES the key (null would be stored as JSON null).
  const store = { get: (k, d) => (k in stored ? stored[k] : d), set: (k, v) => { if (v === undefined) delete stored[k]; else stored[k] = v; }, raw: () => null, rawSet() {} };
  vm.runInContext("UiScale", ctx).create({ $: el, els: {}, store, gfx: { setRenderScale: (v) => calls.scale.push(v) }, updateTrackPreview() {} });
  calls.stored = stored;
  return calls;
}

test("RESOLUTION: a phone with nothing stored boots at MED (0.75), pinned", () => {
  const c = bootRes({ coarse: true });
  assert.deepEqual(c.painted, ["med"]);
  assert.deepEqual(c.scale, [0.75]);
  assert.deepEqual(c.autoRes, [false]);
});

test("RESOLUTION: a stored choice wins over the touch default", () => {
  for (const [mode, v] of [["low", 0.5], ["high", 1.0], ["med", 0.75]]) {
    const c = bootRes({ coarse: true, stored: { resMode: mode, resSchema: 2 } });
    assert.deepEqual(c.painted, [mode], `stored ${mode} stays ${mode}`);
    assert.deepEqual(c.scale, [v]);
  }
  const auto = bootRes({ coarse: true, stored: { resMode: "auto" } });
  assert.deepEqual(auto.painted, ["auto"]);
  assert.deepEqual(auto.scale, [], "AUTO pins nothing");
  assert.deepEqual(auto.autoRes, [true], "AUTO hands the scale to the governor");
});

// #5198 part 3: a phone's stored LOW from before #5166 was the old DEFAULT, not a choice (a settings
// file saved then carried it as a value). Bryce's export: resMode "low", not in `changed`. resSchema 2
// runs once: the implicit phone LOW follows the default again; a LOW picked after that is kept.
test("RESOLUTION migration: a phone's pre-#5166 stored LOW boots at MED and is unset, once", () => {
  const c = bootRes({ coarse: true, stored: { resMode: "low" } });
  assert.deepEqual(c.painted, ["med"]);
  assert.deepEqual(c.scale, [0.75]);
  assert.equal("resMode" in c.stored, false, "removed (not null), so a later default change applies too");
  assert.equal(c.stored.resSchema, 2);
  // The player then really picks LOW: the next boot keeps it (the migration does not re-run).
  c.stored.resMode = "low";
  const again = bootRes({ coarse: true, stored: c.stored });
  assert.deepEqual(again.painted, ["low"]);
  assert.deepEqual(again.scale, [0.5]);
});

test("RESOLUTION migration: only a phone's LOW moves; HIGH/MED/AUTO and a desktop's LOW stay", () => {
  for (const mode of ["med", "high", "auto"]) {
    const c = bootRes({ coarse: true, stored: { resMode: mode } });
    assert.deepEqual(c.painted, [mode], `phone ${mode} kept`);
    assert.equal(c.stored.resSchema, 2);
  }
  const desk = bootRes({ coarse: false, stored: { resMode: "low" } });
  assert.deepEqual(desk.painted, ["low"], "LOW was never a desktop default, so it was chosen");
  assert.deepEqual(desk.scale, [0.5]);
  const fresh = bootRes({ coarse: true });
  assert.equal(fresh.stored.resSchema, 2, "a fresh install is stamped, so a LOW it later picks survives");
  assert.equal("resMode" in fresh.stored, false, "the migration writes no resMode of its own");
});

test("RESOLUTION migration: Bryce's own export is the case it fixes", () => {
  const exp = JSON.parse(read("tests/data/settings-defaults-export.json"));
  assert.equal(exp.settings.display.resMode, "low", "stored (a perDevice unset key exports null)");
  assert.ok(!exp.changed.includes("display.resMode"), "equal to the default it shipped with, never chosen");
  const c = bootRes({ coarse: true, stored: { resMode: exp.settings.display.resMode } });
  assert.deepEqual(c.scale, [0.75]);
});

test("RESOLUTION: a pointer device with nothing stored is unchanged (AUTO, governor-driven)", () => {
  const c = bootRes({ coarse: false });
  assert.deepEqual(c.painted, ["auto"]);
  assert.deepEqual(c.scale, []);
  assert.deepEqual(c.autoRes, [true]);
});

test("UiScale.defaultResMode() answers from the primary pointer, without create(G)", () => {
  const run = (matches, throws) => {
    const ctx = vm.createContext({ window: { matchMedia: (q) => { if (throws) throw new Error("no mq"); assert.equal(q, "(pointer: coarse)"); return { matches }; } } });
    return vm.runInContext(scaleJs + "\n;UiScale.defaultResMode()", ctx);
  };
  assert.equal(run(true), "med", "a phone ships MED since #5166 (LOW drew 639×295 on Bryce's 852×393 iPhone)");
  assert.equal(run(false), "auto");
  assert.equal(run(false, true), "auto", "a throwing matchMedia is a pointer device");
  assert.match(scaleJs, /store\.get\("resMode", defaultResMode\(\)\)/, "the live row reads the same helper SPEC consumes");
});

 test("button default and override survive HUD size changes", () => {
  const { api, stored, el } = bootScale();
  assert.equal(el("pm-btnscale").value, "100");
  api.setScale("hudScale", "--hud-scale", 180);
  api.applyBtnScale();
  assert.equal(el("pm-btnscale").value, "100");
  el("pm-btnscale").oninput({ target: { value: "145" } });
  api.setScale("hudScale", "--hud-scale", 70);
  api.applyBtnScale();
  assert.equal(stored.hudBtnScale, 145);
  assert.equal(el("pm-btnscale").value, "145");
});
