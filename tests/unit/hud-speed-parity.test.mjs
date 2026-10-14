/* hud-speed-parity — the race HUD speed (#hud-speed-n, js/ui/hud.js) and the
 * cockpit wheel LCD (js/car/car-draw.js drawCockpitRig, plus the RETRO wheel in
 * js/car/car-mesh.js) must show ONE number. Both read G.dashKph(<car>.speed) —
 * km/h on the PACE-standardised dash scale — and both round through
 * HudReadouts.spdDigits (AppearanceOpts.speed + the 0..999 clamp). A Handling
 * survey reported 315 (HUD) vs 343 (wheel); a mutant that skewed the wheel by
 * +28 failed the live spec at 285 vs 257, proving the gate. Not the same
 * number as __apex obs().speedKph: that is TRUE ground km/h.
 *
 * Run: node --test tests/unit/hud-speed-parity.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { gameSource, symbolSource } from "../helpers/game-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");
const HUD = read("js/ui/hud.js");
const DRAW = read("js/car/car-draw.js");
const MESH = read("js/car/car-mesh.js");
const RO = read("js/ui/hud-readouts.js");

test("game.js: dashKph is vStd(v) * 3.6, the one dash-scale accessor", () => {
  assert.match(symbolSource("function dashKph(v)"), /function dashKph\(v\) \{ return vStd\(v\) \* 3\.6; \}/);
  assert.match(gameSource(), /dashKph: \(v\) => dashKph\(v\)/);
});

test("HUD and every wheel readout feed G.dashKph(<car>.speed) then HudReadouts.spdDigits", () => {
  assert.match(HUD, /const kph = Math\.max\(0, G\.dashKph\(player\.speed\)\);/);
  assert.match(HUD, /_ro\.spdPlate\(kph\)/);
  assert.match(RO, /function spdDigits\(kph/);
  assert.match(RO, /spdDigits, spdPlate/);
  // LCD wheels, RETRO wheel, CLASSIC gauges: all three call sites in drawCockpitRig.
  const calls = DRAW.match(/G\.dashKph\(c\.speed \|\| 0\)/g) || [];
  assert.equal(calls.length, 3, "drawCockpitRig: LCD + drawRetroTelemetry + drawClassicTelemetry");
  assert.match(DRAW, /drawRetroTelemetry\(_rigB,c,G\.dashKph\(c\.speed \|\| 0\)/);
  assert.match(DRAW, /drawClassicTelemetry\(base,c,G\.dashKph\(c\.speed \|\| 0\)/);
  assert.match(DRAW, /HudReadouts\.spdDigits\(dash\)/);
  assert.match(MESH, /HudReadouts\.spdDigits\(kph\)/);
});

test("no readout converts raw ground speed (m/s * 3.6) on its own", () => {
  const raw = /\.speed\s*\*\s*3\.6|3\.6\s*\*\s*[\w.]*speed/;
  for (const [name, code] of [["js/ui/hud.js", HUD], ["js/car/car-draw.js", DRAW], ["js/car/car-mesh.js", MESH], ["js/ui/hud-readouts.js", RO]]) {
    assert.doesNotMatch(code, raw, name + " must go through G.dashKph");
  }
});

// The one formatting path, as written in HudReadouts.spdDigits.
function loadReadouts(units) {
  const KPH_PER_MPH = 1.609344;
  const AO = { units: () => units, speed: (kph) => Math.round(units === "mph" ? (Number(kph) || 0) / KPH_PER_MPH : (Number(kph) || 0)) };
  const ctx = vm.createContext({ Math, Number, Float32Array, AppearanceOpts: AO });
  vm.runInContext(RO.replace(/^const\b/gm, "var") + "; this.R = HudReadouts;", ctx);
  return { R: ctx.R, AO };
}

test("wheel LCD and HUD plate print the same number for one dash km/h (km/h and mph)", () => {
  assert.match(DRAW, /HudReadouts\.spdDigits\(dash\)/);
  assert.match(MESH, /HudReadouts\.spdDigits\(kph\)/);
  for (const units of ["kmh", "mph"]) {
    const { R } = loadReadouts(units);
    for (let dash = -30; dash <= 420; dash += 0.173) {
      const wheel = R.spdDigits(dash);
      const hud = R.spdPlate(Math.max(0, dash)).n;
      assert.equal(hud, wheel, `${units} @ ${dash.toFixed(3)} dash km/h`);
    }
    assert.equal(R.spdPlate(300).unit, units === "mph" ? "MPH" : "KPH");
    assert.equal(R.spdDigits(-5), 0, "LCD clamp 0");
  }
  // Clamp is on the DISPLAY integer (after mph convert), so pin it in km/h.
  assert.equal(loadReadouts("kmh").R.spdDigits(1500), 999, "LCD clamp 999");
});
