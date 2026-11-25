/* glx-tlx-knob-defaults.test.mjs — GLX and TLX lit passes fall back to ONE
 * default per lighting-tuner knob (#6499, master plan #6495, #6479 item 1).
 *
 * When frame.tune lacks a knob, GLX (js/render/glx/glx.js) and TLX
 * (js/render/three/tsl-lit.js, its `k(id, lit)` helper) each upload a
 * fallback. Those fallbacks must be the TUNE_DEFS `def` (js/lighting/knobs.js)
 * — the registry PostCommon.knob reads — so a default changes in one place.
 * GLX reads either `T && T.x != null ? T.x : <lit>` or `PostCommon.knob(T,
 * "x")` (= def); the frozen table below is the effective default per id and
 * holds identically before and after the carve that moved GLX onto knob().
 *
 * Exempt (render drift decision D4 on #6495, not settled here):
 *   fogHeight  — falls back to frame.fogHeight, not def 0.018 (both backends;
 *                not numeric, so the scans skip it);
 *   carEnvCube — literal 0 (probe off), the safe side of the tier-gated def.
 *
 * Run: node --test tests/unit/glx-tlx-knob-defaults.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

function tuneDefs() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(read("js/lighting/knobs.js") + "\n;this.LightKnobs = LightKnobs;", ctx,
    { filename: absSrc("js/lighting/knobs.js") });
  const d = Object.create(null);
  for (const r of ctx.LightKnobs.TUNE_DEFS) d[r.id] = r.def;
  return d;
}

const DEFS = tuneDefs();
const GLX = stripComments(read("js/render/glx/glx.js"));
const TSL = stripComments(read("js/render/three/tsl-lit.js"));
const LIT_RE = /T && T\.(\w+) != null \? T\.\1 : (-?[\d.]+)/g;

/** id -> effective GLX fallback, from both read forms. */
function glxTable() {
  const out = Object.create(null);
  const put = (id, v) => {
    if (id in out) assert.equal(out[id], v, `glx.js reads ${id} with two different fallbacks`);
    out[id] = v;
  };
  for (const m of GLX.matchAll(LIT_RE)) put(m[1], Number(m[2]));
  for (const m of GLX.matchAll(/PostCommon\.knob\(T, "(\w+)"\)/g)) put(m[1], DEFS[m[1]]);
  return out;
}

function tlxTable() {
  const out = Object.create(null);
  for (const m of TSL.matchAll(/\bk\("(\w+)", (-?[\d.]+)\)/g)) out[m[1]] = Number(m[2]);
  return out;
}

// Effective GLX lit-pass defaults on tip 700f50c8 (before the carve). Frozen.
const GLX_EXPECTED = {
  ambientMul: 1, keyMul: 1, shadowTintAmt: 0, windDir: 35, windSpeed: 1,
  matTexMix: 1, fogDensityMul: 1, shadowBias: 0.001, moonShadow: 0.25,
  shadowStr: 1.15, shadowRange: 80, mistDensity: 1, cloudShadowDim: 0.8,
  carSunGlint: 12, windowSunFlash: 1, ambContactDark: 1, specKnee: 4,
  carEnvCube: 0,
};
const EXEMPT = new Set(["carEnvCube"]);

test("GLX lit-pass knob fallbacks match the frozen table", () => {
  assert.deepEqual({ ...glxTable() }, GLX_EXPECTED);
});

test("every non-exempt GLX fallback is the TUNE_DEFS def", () => {
  for (const [id, v] of Object.entries(glxTable())) {
    if (EXEMPT.has(id)) continue;
    assert.ok(id in DEFS, `${id} is not a TUNE_DEFS id`);
    assert.equal(v, DEFS[id], `glx.js falls back to ${v} for ${id}, TUNE_DEFS def is ${DEFS[id]}`);
  }
});

test("GLX and TLX fall back to the same value for every shared knob", () => {
  const g = glxTable(), t = tlxTable();
  const shared = Object.keys(t).filter((id) => id in g);
  assert.ok(shared.length >= 15, `only ${shared.length} shared ids — the scan broke`);
  for (const id of shared) assert.equal(g[id], t[id], `${id}: GLX ${g[id]} vs TLX ${t[id]}`);
  for (const id of Object.keys(t)) {
    assert.equal(t[id], DEFS[id], `tsl-lit.js falls back to ${t[id]} for ${id}, def is ${DEFS[id]}`);
  }
});

test("glx.js reads knobs through PostCommon.knob, literals only for the exempt ids", () => {
  const lit = [...GLX.matchAll(LIT_RE)].map((m) => m[1]);
  assert.deepEqual(lit, ["carEnvCube"], "a GLX knob fallback restates a literal: use PostCommon.knob(T, id)");
});
