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
import { absSrc } from "../helpers/abs-src.mjs";

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

test("hidden instruments skip visual derivation and resume with current values and redline state", () => {
  const begin = HUD.indexOf("function paintInstruments(player) {");
  const end = HUD.indexOf("\n}", begin) + 2;
  assert.ok(begin >= 0 && end > begin);
  const writes = [], formatted = [];
  const on = { speed: false, gear: false };
  let cockpit = false;
  const ctx = vm.createContext({
    Math, IDLE_RPM: 1000, MAX_RPM: 10000, _redline: false, _rpmPct: -1,
    clamp: (n, lo, hi) => Math.max(lo, Math.min(n, hi)),
    HudElements: { isOn: id => on[id] },
    document: { body: { classList: { contains: () => cockpit } } },
    G: { dashKph: n => { formatted.push(n); return n; } },
    _ro: { spdPlate: n => ({ n: Math.round(n), unit: "MPH" }) },
    els: { gear: "gear", rpmFill: "rpm", tach: "tach", speed: "speed" },
    speedUnitEl: () => "unit",
    hText: (el, v) => writes.push([el, v]), hStyle: (el, k, v) => writes.push([el, k, v]), hToggle: (el, k, v) => writes.push([el, k, v]),
  });
  vm.runInContext(HUD.slice(begin, end), ctx, { filename: absSrc("js/ui/hud.js") });
  const p = { rpm: 9500, gear: 5, speed: 150 };
  ctx.paintInstruments(p);
  assert.equal(ctx._redline, true, "hysteresis enters while gearbox is hidden");
  p.rpm = 9000; p.gear = 6; p.speed = 187;
  ctx.paintInstruments(p);
  assert.equal(ctx._redline, true, "held in the hysteresis band");
  assert.deepEqual(writes, []); assert.deepEqual(formatted, []);
  on.speed = true; ctx.paintInstruments(p);
  assert.deepEqual(writes, [["speed", "187"], ["unit", "MPH"]]);
  writes.length = 0; on.speed = false; on.gear = true;
  ctx.paintInstruments(p);
  assert.deepEqual(writes[0], ["gear", "6"]);
  assert.deepEqual(writes.at(-1), ["tach", "redline", true]);
  writes.length = 0; on.gear = false; p.rpm = 8800; ctx.paintInstruments(p);
  assert.equal(ctx._redline, false, "hysteresis exits while hidden");
  on.gear = true; ctx.paintInstruments(p);
  assert.deepEqual(writes.at(-1), ["tach", "redline", false]);
  writes.length = 0; cockpit = true; ctx.paintInstruments(p);
  assert.deepEqual(writes, [], "cockpit retains its separate gearbox suppression");
  delete ctx.HudElements; cockpit = false; ctx.paintInstruments(p);
  assert.ok(writes.some(([el]) => el === "speed"), "missing policy defaults visible");
});
