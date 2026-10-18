// M-2 / M-12 (#1647): car shadow CPU mirror release + mobile caster pad.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const tlx = readFileSync(join(ROOT, "js/render/three/tlx.js"), "utf8");
const car3d = readFileSync(join(ROOT, "js/car/car3d.js"), "utf8");
const sh = readFileSync(join(ROOT, "js/render/three/tlx-shadow.js"), "utf8");

test("silhouette car builds tag CPU mirror release for TLX", () => {
  assert.match(car3d, /if \(sil\) out\._releaseCpuMirror = true/);
  assert.match(tlx, /data\._releaseCpuMirror \? "carSh" : "mesh"/);
  assert.match(tlx, /function sweepCarShadowMirrors/);
  assert.match(tlx, /sweepCarShadowMirrors\(_now\)/);
});

test("M-12: mobile skips UBO pad on the legacy padded shadow caster only", () => {
  assert.match(sh, /M-12: phones skip only the shadow caster UBO pad/);
  assert.match(sh, /\(!casterAttr && isMobile\) \? \(n \| 0\) : uboInstCap\(renderer, n\)/);
});
