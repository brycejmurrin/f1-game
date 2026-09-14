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
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
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
  const overlays = read("css/overlays.css");
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
