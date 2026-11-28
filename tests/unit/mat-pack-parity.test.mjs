// mat-pack-parity.test.mjs — the baked-pack rules, copied by hand into three shader dialects, pinned to ONE table
// (#7519, architecture plan #7489 phase 1).
//
// GLSL (GLX), WGSL (WGX) and TSL (TLX) each re-type the pack id range, the two flat ids the hoisted sample skips,
// the layer count and the normal-map blend literals. They all agree today; nothing kept them that way. Each row
// below reads one copy as TEXT and compares the numbers it captures with TABLE, so a drifted literal in any
// dialect (or a table edit no dialect followed) fails here. One home for the table itself is phase 8 (D3).
//
// Run: node --test tests/unit/mat-pack-parity.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const TABLE = Object.freeze({
  packMin: 1, packMax: 16,      // MAT ids with a pack layer (MAT.FLAT 0 has none)
  flat: [3, 15],                // ids the hoisted sample skips
  layers: 17,                   // MAT.FLAT(0) … MAT.ASPHALT(16)
  asphalt: 16,                  // the id that takes the weak blend
  blendAsphalt: 0.10, blendOther: 0.55,
  fadeStart: 22, fadeSpan: 58,  // vd reach of the baked normal (the procedural bump's)
});

const GLSL = "js/render/glx/shaders/glsl-lit.js";
const WGSL = "js/render/webgpu/wgsl-chunks.js";
const TSL = "js/render/three/tsl-lit.js";
const N = String.raw`(\d+(?:\.\d+)?)`;   // one numeric literal

// [file, label, regex, (captures as numbers) => expected numbers]. Every regex must match at least once and
// EVERY match must equal the table: a copy that drifted from its siblings fails even if one still agrees.
const ROWS = [
  [GLSL, "matTexUV id range", String.raw`mid <= ${N} \|\| mid > ${N}\) \{ uv = vec2\(0\.0\); return false; \}`,
    () => [TABLE.packMin - 1, TABLE.packMax]],
  [GLSL, "baked normal fade", String.raw`float fade = clamp\(1\.0 - \(vd - ${N}\) / ${N}, 0\.0, 1\.0\);`,
    () => [TABLE.fadeStart, TABLE.fadeSpan]],
  [GLSL, "baked normal blend", String.raw`float amt = \(mid == ${N} \? ${N} : ${N}\) \* uMatTexMix`,
    () => [TABLE.asphalt, TABLE.blendAsphalt, TABLE.blendOther]],

  [WGSL, "matTexUV id range", String.raw`mid <= ${N} \|\| mid > ${N}\) \{ return false; \}`,
    () => [TABLE.packMin - 1, TABLE.packMax]],
  [WGSL, "baked normal fade", String.raw`let fade = clamp\(1\.0 - \(vd - ${N}\) / ${N}, 0\.0, 1\.0\);`,
    () => [TABLE.fadeStart, TABLE.fadeSpan]],
  [WGSL, "hoisted pack sample", String.raw`let hoisted = packOn && mid >= ${N} && mid <= ${N} && mid != ${N} && mid != ${N}`,
    () => [TABLE.packMin, TABLE.packMax, ...TABLE.flat], 2],
  [WGSL, "baked normal blend", String.raw`let amt = select\(${N}, ${N}, mid == ${N}\) \* F\.params8\.w`,
    () => [TABLE.blendOther, TABLE.blendAsphalt, TABLE.asphalt]],

  [TSL, "procedural relief range", String.raw`mid\.greaterThan\(${N}\)\.and\(mid\.lessThan\(${N}\)\)\s*\.and\(mid\.notEqual\(${N}\)\)\.and\(mid\.notEqual\(${N}\)\)`,
    () => [TABLE.packMin - 0.5, TABLE.packMax + 0.5, ...TABLE.flat]],
  [TSL, "matTexLayer clamp", String.raw`const matTexLayer = \(mid\) => clamp\(mid, float\(${N}\), float\(${N}\)\)`,
    () => [0, TABLE.layers - 1]],
  [TSL, "matTexInPack range", String.raw`const matTexInPack = \(mid\) => mid\.greaterThanEqual\(${N}\)\.and\(mid\.lessThanEqual\(${N}\)\)`,
    () => [TABLE.packMin, TABLE.packMax]],
  // Scoped to applyMaterialTexNormal: the HD variant (applyMaterialTexNormalHd) reaches 44/116 m on purpose.
  [TSL, "baked normal fade", String.raw`const fade = clamp\(vd\.sub\(${N}\)\.div\(${N}\)\.oneMinus\(\), 0\.0, 1\.0\)`,
    () => [TABLE.fadeStart, TABLE.fadeSpan], 1, ["const applyMaterialTexNormal = ", "const applyMaterialTexNormalHd = "]],
  [TSL, "baked normal blend", String.raw`const amt = select\(mid\.equal\(${N}\), float\(${N}\), float\(${N}\)\)`,
    () => [TABLE.asphalt, TABLE.blendAsphalt, TABLE.blendOther]],

  ["js/render/glx/glx.js", "GLX layer count", String.raw`const MAT_TEX_LAYERS = ${N};`, () => [TABLE.layers]],
  ["js/render/webgpu/wgx.js", "WGX layer count", String.raw`const MAT_TEX_LAYERS = ${N};`, () => [TABLE.layers]],
  ["js/render/shared/assets.js", "pack loader layer count", String.raw`const MAT_LAYERS = ${N};`, () => [TABLE.layers]],
];

test("the table is self-consistent", () => {
  assert.equal(TABLE.layers, TABLE.packMax + 1, "one layer per MAT id 0..packMax");
  for (const id of [...TABLE.flat, TABLE.asphalt]) assert.ok(id >= TABLE.packMin && id <= TABLE.packMax, `id ${id} is a pack id`);
});

// A scope [from, to] reads only the text between two markers, both required.
const slice = (text, file, scope) => {
  if (!scope) return text;
  const a = text.indexOf(scope[0]), b = text.indexOf(scope[1], a + 1);
  assert.ok(a >= 0 && b > a, `${file}: scope markers "${scope[0]}" … "${scope[1]}" not found in order`);
  return text.slice(a, b);
};

for (const [file, label, re, want, minMatches = 1, scope = null] of ROWS) {
  test(`${file} ${label} matches the pack table`, () => {
    const hits = [...slice(read(file), file, scope).matchAll(new RegExp(re, "g"))];
    assert.ok(hits.length >= minMatches,
      `${file}: ${label} — expected ${minMatches}+ copies of /${re}/, found ${hits.length}; the construct moved or a literal drifted`);
    for (const m of hits) {
      assert.deepEqual(m.slice(1).map(Number), want(), `${file}: ${label} drifted from the pack table: "${m[0]}"`);
    }
  });
}
