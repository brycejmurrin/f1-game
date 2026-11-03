/* scenery-cull-phone.test.mjs — the frame.cullDist policy (#4575, #4530 A1).
 *
 * Phones cull chunked scenery at 800 m x RENDER DISTANCE on every PerfGov tier;
 * desktop keeps the frustum sphere (tier < 3) or the far plane (tier 3+); the
 * free/debug camera and the cinematic keep 700 m on phones, the full vista on
 * desktop. game.js must route frame.cullDist through Frustum.sceneryCullDist.
 *
 * Run: node --test tests/unit/scenery-cull-phone.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Frustum = new Function(readFileSync(join(ROOT, "js/render/shared/frustum.js"), "utf8") + "; return Frustum;")();
const cull = (o) => Frustum.sceneryCullDist({ farPlane: 900, farCull: 1260, tier: 0, mobile: false, free: false, ...o });

test("phones cap at 800 m on every governor tier", () => {
  assert.equal(Frustum.PHONE_CULL_M, 800);
  for (let tier = 0; tier <= 5; tier++) assert.equal(cull({ mobile: true, tier }), 800, `tier ${tier}`);
});

test("desktop is unchanged: frustum sphere below tier 3, far plane at 3+", () => {
  for (const tier of [0, 1, 2]) assert.equal(cull({ tier }), 1260);
  for (const tier of [3, 4]) assert.equal(cull({ tier }), 900);
});

test("RENDER DISTANCE scales the phone cap but never past the desktop radius", () => {
  assert.equal(cull({ mobile: true, renderDistMul: 0.5, farPlane: 450, farCull: 630 }), 400);
  assert.equal(cull({ mobile: true, renderDistMul: 2, farPlane: 1800, farCull: 2520 }), 1600);
  assert.equal(cull({ mobile: true, renderDistMul: 2, farPlane: 1800, farCull: 2520, tier: 3 }), 1600);
  assert.equal(cull({ mobile: true, renderDistMul: 0.3, farPlane: 270, farCull: 378, tier: 3 }), 240);
});

test("free cam and cinematic: phones 700 m, desktop uncapped", () => {
  assert.equal(cull({ free: true, mobile: true, tier: 0 }), 700);
  assert.equal(cull({ free: true, mobile: false, tier: 4 }), 0);
});

test("game.js routes frame.cullDist through Frustum.sceneryCullDist", () => {
  const src = readFileSync(join(ROOT, "js/game.js"), "utf8");
  const sets = src.match(/frame\.cullDist\s*=[^=].*$/gm) || [];
  assert.equal(sets.length, 1, sets.join("\n"));
  assert.match(sets[0], /Frustum\.sceneryCullDist\(\{[^}]*mobile:\s*!!gfx\.isMobile/);
});
