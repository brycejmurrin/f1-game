// #3373 — GP-Strecke S/F day orbit must read forested Eifel hills + Burg Nürburg,
// not bare sand-pyramid mesas. addMountain paints fr>0.34 as ROCK even with
// snowline:2, so every mountain() rock[] in the scenery file must stay spruce-
// green (G > R and G > B). Burg sits on a compass NNE cone (Fuji/donington frame).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = readFileSync(join(ROOT, "js/circuits/scenery/nurburgring.js"), "utf8");

test("nurburgring mountain rock[] stays spruce-green (no beige sand mesas)", () => {
  const rocks = [...SRC.matchAll(/rock:\s*\[([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)\]/g)];
  assert.equal(rocks.length >= 4, true, `expected ≥4 rock[] on mountain opts, got ${rocks.length}`);
  for (const m of rocks) {
    const r = +m[1], g = +m[2], b = +m[3];
    assert.equal(g > r && g > b, true,
      `rock [${r}, ${g}, ${b}] must be spruce-green (G dominant); beige/grey reads as sand pyramids`);
    assert.equal(g >= 0.24 && g <= 0.40, true, `rock G=${g} outside Eifel spruce band`);
  }
});

test("nurburgring Burg Nürburg is compass-placed NNE on a forested cone", () => {
  assert.equal(/nurburgring-burg-nurburg/.test(SRC), true, "required Burg landmark id");
  assert.equal(/BURG_BEARING\s*=\s*10\s*\*\s*Math\.PI\s*\/\s*180/.test(SRC), true,
    "Burg bearing ~10° true (NNE of GP-Strecke)");
  assert.equal(/-\s*Math\.sin\(BURG_BEARING\)[\s\S]*Math\.cos\(BURG_BEARING\)/.test(SRC), true,
    "engine frame: +X west, +Z north → (-sin θ, cos θ)");
  const burgBlock = SRC.slice(SRC.indexOf("BURG_BEARING"), SRC.indexOf("nurburgring-burg-nurburg"));
  const rock = /rock:\s*\[([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)\]/.exec(burgBlock);
  assert.equal(!!rock, true, "Burg cone mountain() has rock[]");
  assert.equal(+rock[2] > +rock[1] && +rock[2] > +rock[3], true, "Burg cone rock is spruce-green");
});
