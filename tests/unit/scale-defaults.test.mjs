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
  // --hud-btn-scale is a RATIO of --hud-scale, deliberately, so an unset BUTTON
  // SIZE keeps following the HUD SIZE slider. The multiplier is published
  // SEPARATELY as --hud-btn-mult because calc() inside a custom property is not
  // reduced at computed-value time: js/ui/hud.js has to resolve the unset dock
  // scale from its factors rather than parse "calc(0.9 * 1.25)" out of a token.
  assert.match(css["--hud-btn-scale"], /var\(--hud-scale\)\s*\*\s*var\(--hud-btn-mult\)/,
    `--hud-btn-scale must stay --hud-scale times --hud-btn-mult, got: ${css["--hud-btn-scale"]}`);
  const ratio = [null, css["--hud-btn-mult"]];
  assert.ok(ratio[1] && Number.isFinite(Number(ratio[1])),
    `--hud-btn-mult must be a plain number (js/ui/hud.js coerces it), got: ${ratio[1]}`);
  const jsRatio = scaleJs.match(/const BTN_OVER_HUD = ([\d.]+);/);
  assert.ok(jsRatio, "js/ui/scale.js must declare BTN_OVER_HUD");
  assert.equal(Number(ratio[1]), Number(jsRatio[1]),
    "css/tokens.css's --hud-btn-scale ratio and scale.js's BTN_OVER_HUD are the " +
    "same number twice. A drift means the buttons resize on the first JS write.");

  const jsDefaults = scaleJs.match(/scaleDefault = \(k\) => \(coarseUi\(\) \? \(k === "hudScale" \? (\d+) : (\d+)\) : 100\)/);
  assert.ok(jsDefaults, "js/ui/scale.js must declare the coarse scaleDefault pair");
  assert.equal(Number(jsDefaults[1]) / 100, Number(css["--hud-scale"]),
    "--hud-scale and scale.js's hudScale default must agree");
  assert.equal(Number(jsDefaults[2]) / 100, Number(css["--ui-scale"]),
    "--ui-scale and scale.js's ui default must agree");
});

test("the touch default puts every driving control over the physical floor", () => {
  // The rendered sizes, measured in Chromium at the default (2026-09-14):
  //   852x393  brake 90.0px (23.9mm)   boost 67.5px (17.9mm)
  //   667x375  brake 80.0px (21.2mm)   boost 60.0px (15.9mm)
  // The smallest of those is the one that has to clear the floor, and it is the
  // secondary column on the small phone. Derived here from the tokens rather
  // than hard-coded, so a change to --btn or the ratio is caught.
  const css = coarseDefaults();
  const ratio = Number(css["--hud-btn-mult"]);
  const hud = Number(css["--hud-scale"]);
  const overlays = readCssSource("css/overlays.css");
  const btn = Number(overlays.match(/--btn:\s*(\d+)px/)[1]);
  // The dock's own fit factor, measured: the painted pedal is ~0.947 of --btn
  // before the button scale, and the secondary column is ~0.71 of it.
  const paintedMm = (frac) => btn * frac * hud * ratio * MM_PER_PX;
  const pedal = paintedMm(0.947), secondary = paintedMm(0.71);
  assert.ok(secondary >= 15,
    `the secondary buttons land at ~${secondary.toFixed(1)}mm; XAG 107 asks ~15mm ` +
    `minimum for a phone touch target. Raise the --hud-btn-scale ratio, do NOT ` +
    `raise --hud-scale — that carries the readouts up too and is what put the ` +
    `pedal column on the minimap`);
  assert.ok(pedal >= 15, `the pedals land at ~${pedal.toFixed(1)}mm, under the 15mm floor`);
  // And the other direction: 2.3x the floor is what covered the minimap.
  assert.ok(pedal <= 28,
    `the pedals land at ~${pedal.toFixed(1)}mm. Past ~28mm the stacked column ` +
    `exceeds half the short edge of a 393px phone and reaches #minimap — that is ` +
    `the 2026-09-08 regression. Verify with tests/specs/hud-layout.spec.js before ` +
    `moving this bound`);
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
  vm.runInContext(scaleJs.replace(/^const UiScale\b/m, "var UiScale"), ctx, { filename: "js/ui/scale.js" });
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

test("PANEL OPACITY: the HUD plates read the effective token, and HIGH CONTRAST pins it at 1", () => {
  const hud = read("css/hud.css");
  assert.match(tokens, /--hud-panel-a-eff:\s*max\(0\.45, var\(--hud-panel-a, 1\)\);/,
    "unset is exactly 1 (shipped alphas unchanged) and no text plate thins under 0.45 of its alpha");
  const hc = tokens.match(/:root\[data-ui-contrast="high"\] \{([^}]*)\}/);
  assert.ok(hc && /--hud-panel-a-eff:\s*1;/.test(hc[1]), "HIGH CONTRAST must pin --hud-panel-a-eff at 1");
  // Every listed plate multiplies its shipped alpha by the effective token.
  for (const [sel, a] of [[".hud-box {", "0.78"], ["#hud-gearbox {", "0.6"], ["#hud-tach {", "0.72"],
    ["#minimap {", "0.55"], ["#hud-sectors {", "0.72"], ["#hud-limits {", "0.72"], ["#announce {", "0.82"]]) {
    const at = hud.indexOf("\n" + sel);
    assert.ok(at >= 0, sel);
    const block = hud.slice(at, hud.indexOf("\n}", at + 1));
    assert.ok(block.includes(`rgb(8 8 14 / calc(${a} * var(--hud-panel-a-eff)))`), sel + " plate");
  }
  assert.match(hud, /background: rgb\(8 8 14 \/ calc\(0\.55 \* var\(--hud-panel-a-eff\)\)\); padding: 1px 7px;/, ".hud-gaps plate");
  // Lights, flags and the OT/AERO fills are signals, not plates.
  const lights = hud.indexOf("\n#lights {");
  assert.ok(lights >= 0, "#lights block");
  assert.doesNotMatch(hud.slice(lights, hud.indexOf("\n}", lights + 1)), /hud-panel-a/);
  assert.doesNotMatch(hud, /#hud-(ot|aero)[^{]*\{[^}]*hud-panel-a/);
  assert.match(read("js/ui/settings-export.js"), /k: "hudPanelOpacity", lane: "json", group: "display", def: null/);
});

test("UiScale.defaultResMode() answers from the primary pointer, without create(G)", () => {
  const run = (matches, throws) => {
    const ctx = vm.createContext({ window: { matchMedia: (q) => { if (throws) throw new Error("no mq"); assert.equal(q, "(pointer: coarse)"); return { matches }; } } });
    return vm.runInContext(scaleJs + "\n;UiScale.defaultResMode()", ctx);
  };
  assert.equal(run(true), "low");
  assert.equal(run(false), "auto");
  assert.equal(run(false, true), "auto", "a throwing matchMedia is a pointer device");
  assert.match(scaleJs, /store\.get\("resMode", defaultResMode\(\)\)/, "the live row reads the same helper SPEC consumes");
});
