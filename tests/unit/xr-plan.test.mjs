/* XRPlan — table-driven path selection (task 20). Pure; no DOM/navigator. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import vm from "node:vm";
import { fileURLToPath } from "url";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function bootPlan() {
  const ctx = vm.createContext({ console, Math });
  seedLog(ctx);
  vm.runInContext(read("js/xr/xr-plan.js").replace(/^const\b/gm, "var"), ctx, { filename: "xr-plan.js" });
  return ctx.XRPlan;
}

const CAPS_FULL = { xr: true, vr: true, gpu: true, xrgpu: true, layers: true, mobileQuest: false };
const CAPS_NO_GPU = { xr: true, vr: true, gpu: false, xrgpu: false };
const CAPS_NO_XRGPU = { xr: true, vr: true, gpu: true, xrgpu: false };
const CAPS_NO_VR = { xr: true, vr: false, gpu: true, xrgpu: true };
const CAPS_NO_XR = { xr: false, vr: false, gpu: false, xrgpu: false };
const CAPS_QUEST = { xr: true, vr: true, gpu: true, xrgpu: true, mobileQuest: true };

const ROWS = [
  {
    name: "no xr capability, vr off",
    input: { caps: CAPS_NO_XR, prefs: { xr: "0", xrBackend: "webgl2" } },
    want: { xrMode: "off", path: null, backendPref: null },
  },
  {
    name: "xr present but immersive-vr unsupported",
    input: { caps: CAPS_NO_VR, prefs: { xr: "1", xrBackend: "webgl2" } },
    want: { xrMode: "off", path: null, backendPref: null },
  },
  {
    name: "armed default → webgl2 / GLX",
    input: { caps: CAPS_FULL, prefs: { xr: "1", xrBackend: "webgl2" } },
    want: { xrMode: "armed", path: "webgl2", backendPref: "webgl2", forceGL: false },
  },
  {
    name: "armed unset xrBackend → webgl2",
    input: { caps: CAPS_FULL, prefs: { xr: "1" } },
    want: { xrMode: "armed", path: "webgl2", backendPref: "webgl2" },
  },
  {
    name: "armed + webgpu with all caps → three / experimental",
    input: { caps: CAPS_FULL, prefs: { xr: "1", xrBackend: "webgpu" } },
    want: { xrMode: "armed", path: "webgpu", backendPref: "three", forceGL: false },
  },
  {
    name: "armed + webgpu missing gpu → fallback webgl2",
    input: { caps: CAPS_NO_GPU, prefs: { xr: "1", xrBackend: "webgpu" } },
    want: { xrMode: "armed", path: "webgl2", backendPref: "webgl2" },
    fallbackFrom: "webgpu",
  },
  {
    name: "armed + webgpu missing XRGPUBinding → fallback webgl2",
    input: { caps: CAPS_NO_XRGPU, prefs: { xr: "1", xrBackend: "webgpu" } },
    want: { xrMode: "armed", path: "webgl2", backendPref: "webgl2" },
    fallbackFrom: "webgpu",
  },
  {
    name: "fallback latch forces webgl2 even when webgpu caps ok",
    input: {
      caps: CAPS_FULL,
      prefs: { xr: "1", xrBackend: "webgpu" },
      boot: { xrFallback: "webgl2" },
    },
    want: { xrMode: "armed", path: "webgl2", backendPref: "webgl2" },
    fallbackFrom: "webgpu",
  },
  {
    name: "xr off ignores webgpu preference",
    input: { caps: CAPS_FULL, prefs: { xr: "0", xrBackend: "webgpu" } },
    want: { xrMode: "off", path: null, backendPref: null },
  },
  {
    name: "garbage xr pref → off",
    input: { caps: CAPS_FULL, prefs: { xr: "maybe", xrBackend: "webgl2" } },
    want: { xrMode: "off", path: null, backendPref: null },
  },
  {
    name: "garbage xrBackend → webgl2 when armed",
    input: { caps: CAPS_FULL, prefs: { xr: "1", xrBackend: "metal" } },
    want: { xrMode: "armed", path: "webgl2", backendPref: "webgl2" },
  },
  {
    name: "xr=true boolean accepted as armed",
    input: { caps: CAPS_FULL, prefs: { xr: true, xrBackend: "webgl2" } },
    want: { xrMode: "armed", path: "webgl2", backendPref: "webgl2" },
  },
  {
    name: "Quest UA still arms webgpu experimental with a reason",
    input: { caps: CAPS_QUEST, prefs: { xr: "1", xrBackend: "webgpu" } },
    want: { xrMode: "armed", path: "webgpu", backendPref: "three" },
    reasonIncludes: "Quest",
  },
  {
    name: "empty input → off",
    input: {},
    want: { xrMode: "off", path: null, backendPref: null },
  },
  {
    name: "armed with gfxBackend three still returns webgl2 override (never writes)",
    input: {
      caps: CAPS_FULL,
      prefs: { xr: "1", xrBackend: "webgl2", gfxBackend: "three" },
    },
    want: { xrMode: "armed", path: "webgl2", backendPref: "webgl2" },
  },
  {
    name: "storage-blocked shape: missing caps.vr with xr on → off",
    input: { caps: { xr: true }, prefs: { xr: "1", xrBackend: "webgl2" } },
    want: { xrMode: "off", path: null, backendPref: null },
  },
];

test("XRPlan.resolve table (≥15 rows)", () => {
  const XRPlan = bootPlan();
  assert.ok(ROWS.length >= 15, `need ≥15 rows, have ${ROWS.length}`);
  for (const row of ROWS) {
    const got = XRPlan.resolve(row.input);
    assert.equal(got.xrMode, row.want.xrMode, row.name + " xrMode");
    assert.equal(got.path, row.want.path, row.name + " path");
    assert.equal(got.backendPref, row.want.backendPref, row.name + " backendPref");
    if (row.want.forceGL != null) {
      assert.equal(got.forceGL, row.want.forceGL, row.name + " forceGL");
    }
    assert.ok(Array.isArray(got.reasons), row.name + " reasons array");
    assert.ok(Array.isArray(got.fallbacks), row.name + " fallbacks array");
    if (row.fallbackFrom) {
      assert.ok(got.fallbacks.some((f) => f.from === row.fallbackFrom),
        row.name + " expected fallback from " + row.fallbackFrom);
    }
    if (row.reasonIncludes) {
      assert.ok(got.reasons.some((r) => r.includes(row.reasonIncludes)),
        row.name + " reason should mention " + row.reasonIncludes);
    }
  }
});

test("XRPlan never invents a gfxBackend write — resolve is pure", () => {
  const XRPlan = bootPlan();
  const prefs = { xr: "1", xrBackend: "webgpu", gfxBackend: "webgpu" };
  const before = JSON.stringify(prefs);
  XRPlan.resolve({ caps: CAPS_NO_GPU, prefs });
  assert.equal(JSON.stringify(prefs), before, "prefs bag must not be mutated");
});

test("js/xr/xr-plan.js is referenced (zeroRefModules)", () => {
  assert.ok(fs.existsSync(path.join(ROOT, "js/xr/xr-plan.js")));
  assert.match(read("js/xr/xr-plan.js"), /XRPlan/);
});

test("GLX getContext requests xrCompatible only when navigator.xr exists", () => {
  const src = read("js/render/glx/glx.js");
  assert.match(src, /xrCompatible:\s*true/);
  assert.match(src, /navigator\.xr \? \{ xrCompatible: true \}/);
});
