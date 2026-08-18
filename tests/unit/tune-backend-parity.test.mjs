// Every LIGHTING TUNER slider must be seen on GLX / WGX / TLX, a missing
// `frame.tune` field must fall back to TUNE_DEFS.def — not a silent 0 —
// and each uniform must be a live identifier in that backend's shader tree.
//
// THE BUG THIS EXISTS FOR. docs/LIGHTING-TUNER-SLIDERS.md audited all 183
// knobs on the shipping GLX path and then excluded the deferred backends.
// WGX packed carReflect as 0 when tune was missing (TUNE_DEFS ships 0.05),
// so a harness / first frame / omitted field killed car-paint SSR on WebGPU
// while GLX and TLX still mirrored. Same class as the TLX matTexMix 0-vs-1
// default (js/render/three/tsl-lit.js).
//
// Run: node --test tests/unit/tune-backend-parity.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  rows, gaps, fbGaps, consumeGaps, shedMiss, scaleMiss,
  GLX_ONLY, CPU_FOLD, SHADER_ALIAS, RECORDED_NOOP, SETTINGS_LOOK, SHED_OPTS,
} from "../../tools/tune-backend-audit.mjs";

test("TUNE_DEFS still has the full lighting-tuner lattice", () => {
  assert.ok(rows.length >= 180, `registry shrank to ${rows.length}`);
  assert.equal(rows.filter((r) => r.kind === "uniform").length, 73,
    "uniform-knob count drifted — update the audit allowlists if a u: was added/removed");
});

test("every portable TUNE_DEFS knob is named on GLX, WGX, and TLX", () => {
  assert.equal(gaps.length, 0,
    "a lighting slider is missing from a deferred backend (or a new GLX-only knob is not in GLX_ONLY):\n" +
    gaps.map((r) => `  ${r.id} missing ${r.gap.join(",")}`).join("\n"));
});

test("recorded GLX-only knobs stay documented as such", () => {
  for (const id of GLX_ONLY) {
    const r = rows.find((x) => x.id === id);
    assert.ok(r, `${id} left TUNE_DEFS — drop it from GLX_ONLY`);
    assert.equal(r.glxOnly, true);
  }
});

test("missing-tune fallbacks match TUNE_DEFS.def on every backend", () => {
  assert.equal(fbGaps.length, 0,
    "a backend's `T.id != null ? T.id : N` (or k/gk default) is not the shipped def:\n" +
    fbGaps.map((r) => `  ${r.id} def=${r.def} ${r.fbMiss.join(" ")}`).join("\n"));
});

test("every portable uniform is a live identifier in the GLX / WGX / TLX shader tree", () => {
  assert.equal(consumeGaps.length, 0,
    "a uniform is packed in JS but the shader never reads it (add a SHADER_ALIAS rename or wire the knob):\n" +
    consumeGaps.map((r) => `  ${r.id} missing ${r.consumeMiss.join(",")}`).join("\n"));
});

test("SHADER_ALIAS / CPU_FOLD / RECORDED_NOOP ids still exist in TUNE_DEFS", () => {
  const ids = new Set(rows.map((r) => r.id));
  for (const id of [...Object.keys(SHADER_ALIAS), ...CPU_FOLD, ...RECORDED_NOOP.map((n) => n.id)]) {
    assert.ok(ids.has(id), `${id} left TUNE_DEFS — drop it from the consume allowlists`);
  }
});

test("GRAPHICS feature-shed fields are read on every present() path", () => {
  assert.deepEqual(shedMiss, [],
    "a GRAPHICS / PerfGov shed (po.reflect / carReflect / bloom / ssao / godray / contact / lampVol) is missing from a backend present():\n" +
    shedMiss.join("\n"));
  assert.equal(SHED_OPTS.length, 7);
});

test("RESOLUTION setRenderScale exists on GLX, WGX, and TLX", () => {
  assert.deepEqual(scaleMiss, []);
});

test("SETTINGS look steppers stay the five display controls", () => {
  assert.deepEqual(SETTINGS_LOOK.map((s) => s.id),
    ["gfxPreset", "resMode", "gfxBackend", "threePath", "screenshots"]);
});
