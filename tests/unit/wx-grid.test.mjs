// Weather×time grid maths (tools/shot/lib/wx-grid.mjs): layout, Rec.709 luminance,
// saturation, lighting ratios, turnFrac. Pure, no browser.
import assert from "node:assert/strict";
import test from "node:test";
import {
  TODS, WEATHERS, CELL_COUNT, DEFAULT_EYE_H, DEFAULT_FOV, DEFAULT_SEED,
  cellLayout, sheetSize, luma709, saturation01, luminanceStats,
  lightingRatios, turnFrac, sortCombosMinRebuild, cellMeanL,
} from "../../tools/shot/lib/wx-grid.mjs";

test("layout is 4 TOD × 6 weathers = 24, storm after rain", () => {
  assert.equal(TODS.length, 4);
  assert.equal(WEATHERS.length, 6);
  assert.equal(CELL_COUNT, 24);
  assert.deepEqual([...WEATHERS], ["dry", "wet", "rain", "storm", "overcast", "fog"]);
  const cells = cellLayout();
  assert.equal(cells.length, 24);
  assert.equal(cells[0].key, "dawn-dry");
  assert.equal(cells[3].key, "dawn-storm");
  assert.equal(cells[23].key, "night-fog");
  assert.equal(cells.filter((c) => c.weather === "storm").length, 4);
  assert.equal(DEFAULT_EYE_H, 4.25);
  assert.equal(DEFAULT_FOV, 60);
  assert.equal(DEFAULT_SEED, 42);
});

test("sheetSize matches 6×4 labelled tiles", () => {
  const s = sheetSize(6, 4, 360, 202, 18);
  assert.equal(s.width, 6 * 360);
  assert.equal(s.height, 4 * (202 + 18));
  assert.equal(s.cellH, 220);
  assert.throws(() => sheetSize(0, 4, 10, 10), /positive/);
});

test("luma709 and saturation01 are bounded", () => {
  assert.equal(luma709(0, 0, 0), 0);
  assert.ok(Math.abs(luma709(255, 255, 255) - 255) < 1e-9);
  // green-weighted: pure green > pure red
  assert.ok(luma709(0, 255, 0) > luma709(255, 0, 0));
  assert.equal(saturation01(0, 0, 0), 0);
  assert.equal(saturation01(128, 128, 128), 0);
  assert.equal(saturation01(255, 0, 0), 1);
  assert.ok(saturation01(200, 100, 50) > 0.5);
});

test("luminanceStats mean L / RGB / saturation over a flat buffer", () => {
  const w = 4, h = 2, ch = 3;
  const data = Buffer.alloc(w * h * ch);
  for (let i = 0; i < w * h; i++) {
    data[i * 3] = 100;
    data[i * 3 + 1] = 150;
    data[i * 3 + 2] = 50;
  }
  const s = luminanceStats(data, w, h, ch);
  assert.equal(s.pixels, 8);
  assert.deepEqual(s.meanRGB, [100, 150, 50]);
  const expectL = luma709(100, 150, 50);
  assert.ok(Math.abs(s.meanL - expectL) < 1e-9);
  assert.ok(Math.abs(s.saturation - saturation01(100, 150, 50)) < 1e-9);
  assert.throws(() => luminanceStats(data, w, h, 2), /3 or 4/);
});

test("lightingRatios: storm≈rain day and milky fog night", () => {
  const cells = {
    "day-storm": { meanL: 98 },
    "day-rain": { meanL: 100 },
    "night-fog": { meanL: 64 },
    "night-dry": { meanL: 20 },
    "night-overcast": { meanL: 40 },
  };
  const r = lightingRatios(cells);
  assert.ok(Math.abs(r.stormVsRainDay - 0.98) < 1e-9);
  assert.equal(r.fogNightVsDryNight, 3.2);
  assert.equal(r.overcastNightVsDryNight, 2);
  assert.throws(() => cellMeanL(cells, "day", "fog"), /missing meanL/);
});

test("turnFrac is 1-based into def.turns", () => {
  const turns = [0.0666, 0.1516, 0.2135];
  assert.equal(turnFrac(turns, 1), 0.0666);
  assert.equal(turnFrac(turns, 3), 0.2135);
  assert.throws(() => turnFrac(turns, 0), /1\.\.3/);
  assert.throws(() => turnFrac(turns, 4), /1\.\.3/);
  assert.throws(() => turnFrac([], 1), /no def\.turns/);
});

test("sortCombosMinRebuild groups day vs dark", () => {
  const cells = cellLayout();
  const darkFirst = sortCombosMinRebuild(cells, true);
  assert.equal(darkFirst[0].tod !== "day", true);
  assert.equal(darkFirst[darkFirst.length - 1].tod, "day");
  const dayFirst = sortCombosMinRebuild(cells, false);
  assert.equal(dayFirst[0].tod, "day");
  // storm column present in both groups
  assert.ok(darkFirst.some((c) => c.weather === "storm" && c.tod === "night"));
  assert.ok(dayFirst.some((c) => c.key === "day-storm"));
});
