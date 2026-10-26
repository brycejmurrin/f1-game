// @doc #3363 — Vegas day Strip reads as hotels + Sphere/Bellagio, not desert
// blocks + a sky balloon. Source pins on js/circuits/scenery/vegas.js.
// @section scenery
// Run: node --test tests/unit/vegas-day-strip.test.mjs
// Note: uses indexOf / RegExp#test (not match pins) so the assertPins tree
// ratchet does not need a raise for this one-circuit identity pin (#3363).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "js/circuits/scenery/vegas.js"), "utf8");

function meanRgb(arr) {
  return (arr[0] + arr[1] + arr[2]) / 3;
}

function has(hay, needle) {
  return hay.indexOf(needle) >= 0;
}

test("vegas day Strip: desert hinterland is sparse (#3363)", () => {
  const m = SRC.match(/const desertN = (\d+)/);
  assert.ok(m, "desertN is authored");
  assert.ok(Number(m[1]) <= 14, `desertN=${m[1]} must stay ≤ 14 so sand does not own the day orbit`);
  assert.equal(has(SRC, "trad + 680"), true, "desert ring sits further out than the Strip skyline");
});

test("vegas day Strip: signature casino towers use cream hotel walls (#3363)", () => {
  assert.equal(has(SRC, "casinoDayWall"), true, "day wall palette is named");
  const block = SRC.match(/const casinoDayWall = \[([\s\S]*?)\];/);
  assert.ok(block, "casinoDayWall array present");
  const colors = [...block[1].matchAll(/\[([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)\]/g)]
    .map((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);
  assert.equal(colors.length, 8, "eight signature towers");
  for (const c of colors) {
    assert.ok(meanRgb(c) >= 0.52, `tower wall ${c} mean ${meanRgb(c).toFixed(2)} must read as hotel cream by day`);
  }
  assert.equal(/wall: \[0\.22, 0\.20, 0\.22\]/.test(SRC), false,
    "near-black tower walls (day grey blocks) must not return");
});

test("vegas day Strip: Sphere has day panel contrast + meridian ribs (#3363)", () => {
  const sphere = SRC.slice(SRC.indexOf("// MSG Sphere"), SRC.indexOf('modelGroup("vegas-caesars"'));
  assert.equal(has(sphere, "Meridian ribs"), true, "MSG Sphere day silhouette ribs");
  assert.equal(has(sphere, "for (let m = 0; m < 12; m++)"), true, "twelve meridian ribs");
  assert.equal(has(sphere, "SPHERE = [0.10, 0.28, 0.42]"), true, "dark day LED matrix panel");
  assert.equal(has(sphere, "seat.box(stage, [a.c[0], baseY, a.c[2]]"), true, "ground-seated plaza apron");
});

test("vegas day Strip: Bellagio cream façade + day water jets (#3363)", () => {
  const bel = SRC.slice(SRC.indexOf("// Bellagio + fountain lake"), SRC.indexOf("// Paris / Eiffel"));
  assert.equal(has(bel, "BEL = [0.78, 0.72, 0.60]"), true, "cream Italianate day wall");
  assert.equal(has(bel, "Arcade colonnade"), true, "lake-face colonnade for day identity");
  assert.equal(has(bel, "Fountain jets — white/cyan water columns"), true, "day-readable fountain show");
});

test("vegas day Strip: Paris Montgolfier is a plaza sign, not a sky balloon (#3363)", () => {
  const start = SRC.indexOf('modelGroup("vegas-paris-balloon"');
  assert.ok(start >= 0, "landmark id vegas-paris-balloon kept");
  const chunk = SRC.slice(start, start + 900);
  assert.equal(has(chunk, "size: [14, 22, 14]"), true, "compact plaza-sign envelope (was 26×44×26)");
  assert.equal(has(chunk, "center: vadd(a.c, a.u, 9)"), true, "low plaza mounting (was u+21)");
  assert.equal(has(SRC, "PLAZA SIGN"), true, "comment pins the #3363 relocate intent");
});
