/* shader-validate.test.mjs — tools/check/shader-validate.mjs (glslangValidator over the GLX GLSL, naga over the WGX WGSL).
 *
 * Three things, so a green run cannot mean "nothing was checked":
 *   1. EXTRACTION always runs (no binary needed) and must find the known programs;
 *   2. the tree validates, and a PLANTED defect (fixtures, and one injected into the real SKY_FS) fails;
 *   3. an absent binary SKIPS loudly, or FAILS under APEX_REQUIRE_LINT_BINS=1 (the CI `lints` job).
 *
 * naga is ADVISORY (it is not Chrome's compiler): the tree check records its rows but does not assert them
 * green; only "naga rejects the planted bad WGSL and accepts the good one" is asserted.
 *
 * Run: node --test tests/unit/shader-validate.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { extractGlsl, extractWgsl, validateGlsl, validateTree, validateWgsl, WGSL_FRAGMENTS } from "../../tools/check/shader-validate.mjs";
import { ROOT, requireBins, resolveBin } from "../../tools/lib/lint-bins.mjs";

const FIX = path.join(ROOT, "tests/fixtures/shader-validate");
const fx = (n) => fs.readFileSync(path.join(FIX, n), "utf8");
const need = (tool) => {
  const bin = resolveBin(tool);
  if (bin) return { skip: false, bin };
  const msg = `${tool} not installed - NOT CHECKED (bash tools/env/install-lint-bins.sh ${tool === "glslangValidator" ? "glslang" : tool})`;
  if (requireBins([])) assert.fail(msg);
  console.error(`SKIP shader-validate.test: ${msg}`);
  return { skip: msg, bin: null };
};
const glslang = need("glslangValidator");
const naga = need("naga");

test("lint binaries: a local green is only shader evidence when both are installed", (t) => {
  for (const [name, r] of [["glslangValidator", glslang], ["naga", naga]]) {
    t.diagnostic(r.skip ? `SKIPPED ${name}: GLX/WGX shader compiles NOT CHECKED here, local green is no shader evidence` : `${name}: ${r.bin}`);
  }
  // The skip flag and the resolver must agree, so a silent skip cannot hide an installed bin.
  assert.equal(glslang.skip === false, !!resolveBin("glslangValidator"));
  assert.equal(naga.skip === false, !!resolveBin("naga"));
});

test("extraction finds the GLX programs, both stages, the PERSP variants and the inline occlusion pair", () => {
  const ids = new Map(extractGlsl().map((s) => [s.id, s]));
  for (const id of ["SKY_VS", "SKY_FS", "LIT_VS", "LIT_FS", "COMPOSITE_FS", "SSAO_FS", "POST_VS", "FXAA_FS"]) assert.ok(ids.has(id), `${id} extracted`);
  assert.ok(ids.has("COMPOSITE_FS+GLX_PERSP_SCALAR") && ids.has("SSAO_FS+GLX_PERSP_SCALAR"), "GLX_PERSP_SCALAR variants");
  assert.ok(ids.has("chunked.js:OCC_VS") && ids.has("chunked.js:OCC_FS"), "inline static programs");
  assert.ok(extractGlsl().length >= 33);
  for (const s of ids.values()) assert.ok(s.source.startsWith("#version 300 es"), `${s.id} is ES 3.00`);
  assert.equal(ids.get("SKY_VS").stage, "vert");
  assert.equal(ids.get("SKY_FS").stage, "frag");
  assert.doesNotMatch(ids.get("SKY_FS").source, /\$\{/, "template interpolations were evaluated");
});

test("extraction finds the WGX modules and names the one fragment it skips", () => {
  const ids = new Set(extractWgsl().map((s) => s.id));
  for (const id of ["WGSLChunks.SKY", "WGSLChunks.LIT", "WGSLPost.COMPOSITE", "WGSLFx.PARTICLE"]) assert.ok(ids.has(id), `${id} extracted`);
  assert.ok(extractWgsl().length >= 20);
  assert.deepEqual(Object.keys(WGSL_FRAGMENTS), ["WGSLPost.POST_VS"]);
  assert.ok(!ids.has("WGSLPost.POST_VS"));
});

test("glslang accepts every GLX shader in the tree", { skip: glslang.skip }, () => {
  const rows = validateTree().rows.filter((r) => r.kind === "glsl");
  assert.ok(rows.length >= 33);
  assert.deepEqual(rows.filter((r) => r.status !== "ok").map((r) => `${r.id}: ${r.output}`), []);
});

test("glslang FAILS the planted bad shader and passes the good one", { skip: glslang.skip }, () => {
  const good = validateGlsl(glslang.bin, { id: "fixture-good", stage: "frag", source: fx("good.frag") });
  assert.equal(good.ok, true, good.output);
  const bad = validateGlsl(glslang.bin, { id: "fixture-bad", stage: "frag", source: fx("bad.frag") });
  assert.equal(bad.ok, false);
  assert.match(bad.output, /cannot convert from .*2-component vector.*3-component vector/);
});

test("glslang FAILS a defect injected into the real SKY_FS", { skip: glslang.skip }, () => {
  const sky = extractGlsl().find((s) => s.id === "SKY_FS");
  assert.ok(sky.source.includes("outColor = vec4(c, 1.0);"));
  const broken = { ...sky, id: "SKY_FS-planted", source: sky.source.replace("outColor = vec4(c, 1.0);", "outColor = vec4(c, plantedUndefined);") };
  const r = validateGlsl(glslang.bin, broken);
  assert.equal(r.ok, false);
  assert.match(r.output, /plantedUndefined/);
});

test("naga FAILS the planted bad WGSL and passes the good one (advisory on the tree)", { skip: naga.skip }, () => {
  const good = validateWgsl(naga.bin, { id: "fixture-good", source: fx("good.wgsl") });
  assert.equal(good.ok, true, good.output);
  const bad = validateWgsl(naga.bin, { id: "fixture-bad", source: fx("bad.wgsl") });
  assert.equal(bad.ok, false);
  assert.match(bad.output, /undefinedName|vec3|vec2/);
  const rows = validateTree().rows.filter((r) => r.kind === "wgsl");
  assert.ok(rows.length >= 20, "naga rows are produced");
  // Advisory by design: a row that is not "ok" is a recorded dialect gap, not a failure.
  for (const r of rows.filter((x) => x.status !== "ok")) assert.equal(r.status, "warn", `${r.id}: ${r.output}`);
});
