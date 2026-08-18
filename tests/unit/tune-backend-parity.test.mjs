// Every LIGHTING TUNER slider must be seen on GLX / WGX / TLX, and a missing
// `frame.tune` field must fall back to TUNE_DEFS.def — not a silent 0.
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
import { rows, gaps, fbGaps, GLX_ONLY } from "../../tools/tune-backend-audit.mjs";

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
