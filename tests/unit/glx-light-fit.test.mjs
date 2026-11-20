// glx-light-fit — the WebGL2 fallback fits its lit-shader light loop to the GPU (#5990).
//
// LIT_FS's default uniform block at 48 lights is ~292 vec4 rows; many Android
// GPUs report MAX_FRAGMENT_UNIFORM_VECTORS between the GLES 3.0 floor (224) and
// 261, so the lit program failed to link and the fallback showed "graphics
// unavailable". GLX.init now sizes MAX_LIGHTS with LightBudget.fitSlots. This
// pins the selection against a faked limit, boots the real GLX (glx-mock) to
// see the count it links and publishes, and recounts the shader's rows from
// its source, so a new uniform cannot silently push the block past LIT_FS_ROWS.
// Pure: the real modules in a vm. A unit test of a renderer is not evidence that it
// links on a device (SwiftShader reports more rows); it pins the arithmetic.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";
import { bootGlx } from "../helpers/glx-mock.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function loadBudget() {
  const ctx = { Math, Object };
  vm.createContext(ctx);
  vm.runInContext(read("js/render/shared/light-budget.js") + "\n;globalThis.LightBudget = LightBudget;", ctx, { filename: absSrc("js/render/shared/light-budget.js") });
  return ctx.LightBudget;
}

function litFs() {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  vm.runInContext(read("js/render/glx/shaders/glsl-chunks.js") + "\n;window.GLXChunks = GLXChunks;", ctx, { filename: absSrc("js/render/glx/shaders/glsl-chunks.js") });
  ctx.GLXChunks = ctx.window.GLXChunks;
  vm.runInContext(read("js/render/glx/shaders/glsl-lit.js"), ctx, { filename: absSrc("js/render/glx/shaders/glsl-lit.js") });
  return ctx.window.GLXShaders.LIT_FS;
}

// Conservative default-block rows: one row per scalar/vector, 4 per mat4
// (GLSL ES packing can only do better). Samplers are not in the default block.
const ROW = { float: 1, int: 1, bool: 1, vec2: 1, vec3: 1, vec4: 1, ivec2: 1, ivec3: 1, ivec4: 1, mat2: 2, mat3: 3, mat4: 4 };
function rowsOf(src, maxLights) {
  const body = src.replace(/\/\/.*$/gm, "");
  const re = /^\s*uniform\s+(?:(?:highp|mediump|lowp)\s+)?(\w+)\s+(\w+)\s*(?:\[([^\]]+)\])?\s*;/gm;
  let m, rows = 0;
  while ((m = re.exec(body))) {
    if (/sampler/.test(m[1])) continue;
    assert.ok(m[1] in ROW, `unknown uniform type ${m[1]} (${m[2]}): teach rowsOf its row cost`);
    const n = m[3] ? Function("MAX_LIGHTS", "return (" + m[3] + ");")(maxLights) : 1;
    rows += ROW[m[1]] * n;
  }
  return rows;
}

const glx = read("js/render/glx/glx.js");
const LIT_FS_ROWS = Number(/const LIT_FS_ROWS = (\d+);/.exec(glx)[1]);

test("LIT_FS_ROWS covers the lit shader's recounted default block at 48 lights", () => {
  const LB = loadBudget();
  const rows = rowsOf(litFs(), LB.MAX);
  assert.ok(rows <= LIT_FS_ROWS, `LIT_FS needs ${rows} rows but glx.js budgets ${LIT_FS_ROWS}: raise LIT_FS_ROWS`);
  assert.equal(rowsOf(litFs(), 0) + 4 * LB.MAX, rows, "each light slot costs exactly 4 rows (uLight[MAX_LIGHTS * 4])");
});

test("fitSlots keeps 48 when the limit fits, and fits the block under low limits", () => {
  const LB = loadBudget();
  assert.equal(LB.fitSlots(1024, LIT_FS_ROWS, 4), 48);
  assert.equal(LB.fitSlots(LIT_FS_ROWS, LIT_FS_ROWS, 4), 48);
  assert.equal(LB.fitSlots(0, LIT_FS_ROWS, 4), 48, "an unreadable limit keeps the shipped count");
  const fixed = LIT_FS_ROWS - 4 * LB.MAX;
  for (const lim of [224, 230, 241, 256, 260, 261, LIT_FS_ROWS - 1]) {
    const n = LB.fitSlots(lim, LIT_FS_ROWS, 4);
    assert.ok(n < 48 && n >= LB.LITE, `limit ${lim}: ${n} slots`);
    assert.ok(fixed + 4 * n <= lim, `limit ${lim}: ${n} slots need ${fixed + 4 * n} rows`);
    assert.ok(fixed + 4 * (n + 1) > lim, `limit ${lim}: ${n} slots leaves a whole light unused`);
  }
  assert.equal(LB.fitSlots(100, LIT_FS_ROWS, 4), LB.LITE, "never below the LITE floor");
});

test("GLX.init links the lit program at the fitted count and publishes it", () => {
  // Boot the real GLX against the recording mock with a faked fragment-uniform
  // limit, then read what it compiled and what it published.
  const litCounts = (h) => h.calls.filter((c) => c[0] === "shaderSource" && /const int MAX_LIGHTS = \d+;/.test(c[1][1]))
    .map((c) => Number(/const int MAX_LIGHTS = (\d+);/.exec(c[1][1])[1]));
  const slots = (h) => [h.GLX.maxLights(), vm.runInContext("LightBudget.slots()", h.sandbox)];
  const LB = loadBudget();

  const floor = bootGlx({ params: { MAX_FRAGMENT_UNIFORM_VECTORS: 224 } });
  const n224 = LB.fitSlots(224, LIT_FS_ROWS, 4);
  assert.ok(n224 < 48, `224 rows must cut the loop (got ${n224})`);
  assert.deepEqual(litCounts(floor), [n224], "the lit FS compiles once, at the fitted count");
  assert.deepEqual(slots(floor), [n224, n224], "GLX.maxLights and LightBudget.slots publish the fitted count");

  const roomy = bootGlx({ params: { MAX_FRAGMENT_UNIFORM_VECTORS: 1024 } });
  assert.deepEqual(litCounts(roomy), [48]);
  assert.deepEqual(slots(roomy), [48, 48]);

  // A driver that packs worse than the count refuses the fitted program: one relink at LITE.
  const strict = bootGlx({ params: { MAX_FRAGMENT_UNIFORM_VECTORS: 224 }, rejectSource: new RegExp(`const int MAX_LIGHTS = ${n224};`) });
  assert.deepEqual(litCounts(strict), [n224, LB.LITE], "one retry, at LightBudget.LITE");
  assert.deepEqual(slots(strict), [LB.LITE, LB.LITE]);

  // litFsFor's rewrite (the same replace) must reach the loop bound and change nothing else.
  const src = litFs(), fit = src.replace(/const int MAX_LIGHTS = \d+;/, "const int MAX_LIGHTS = 31;");
  assert.notEqual(fit, src, "the shader no longer spells `const int MAX_LIGHTS = N;` — litFsFor rewrites nothing");
  assert.equal(fit.length, src.length, "the rewritten declaration was the shipped 48-slot one");
});
