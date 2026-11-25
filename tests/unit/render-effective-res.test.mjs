/* render-effective-res.test.mjs — the effective 3D resolution rule and its one-call readout (#5166).
 * Bryce's iPhone (852×393 CSS, DPR 3) drew 639×295: present = CSS × min(DPR, cap) with the cap 1.5 on
 * mobileTier (2 otherwise), then × renderScale; RESOLUTION defaulted to LOW (0.5) on a touch device and
 * defaults to MED (0.75, 959×443 on that phone) since the #5166 decision.
 * The numbers were the same on the Nov 2 tree, the pre-rollback tip and the Nov 7 tip, so this file pins
 * the RULE (a change to any of these lines is a resolution-vs-frame-time trade: say so in the PR) and the
 * `__apex.renderScale().effective` readout that lets the phone bridge measure the device in one call.
 * Run: node --test tests/unit/render-effective-res.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const read = (p) => fs.readFileSync(absSrc(p), "utf8");

// The real tlx.js under a stubbed `location` (three cannot boot in the node VM): TLX.dprCapFor is the pure cap rule
// create() runs (#5222), and the two create() lines that declare the cap are lifted verbatim.
function tlxCtx(search = "") {
  const ctx = vm.createContext({ location: { search }, URLSearchParams, WeakSet, WeakMap, Math, Object, Number, String,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} } });
  ctx.window = ctx;
  vm.runInContext(read("js/render/three/tlx.js"), ctx, { filename: absSrc("js/render/three/tlx.js") });
  return ctx;
}
const tlxLine = (head) => { const src = read("js/render/three/tlx.js"), at = src.indexOf(head); return at < 0 ? "" : src.slice(at, src.indexOf("\n", at)); };

test("TLX's cap rule at boot is the tier's: 1.5 on mobileTier, 2 elsewhere, lite 1.25 (create()'s own lines)", () => {
  const capAt = (mobileTier, lite = null) => {
    const ctx = tlxCtx();
    Object.assign(ctx, { dprCapFor: ctx.TLX.dprCapFor, mobileTier, _lite: lite });
    return vm.runInContext(tlxLine("let _dprBoost = 0, _dprCeil = 0, _dprPreset = 0;") + "\n" + tlxLine("let DPR_CAP = ") + "\nDPR_CAP;", ctx, { filename: "vm-page:evaluate" });
  };
  assert.deepEqual([capAt(true), capAt(false), capAt(true, { dprCap: 1.25 })], [1.5, 2, 1.25]);
});

test("RESOLUTION MAX's boost raises TLX's cap to at most 3, never lowers it; the lab replaces; capDpr's ceiling wins (#5222)", () => {
  const f = tlxCtx().TLX.dprCapFor, lite = { dprCap: 1.25 };
  // [lite, mobileTier, boost, ceil] -> cap
  const rows = [
    [[null, true, 0, 0], 1.5], [[null, false, 0, 0], 2],      // no boost: today's caps
    [[null, true, 3, 0], 3], [[null, false, 3, 0], 3],        // MAX: the device's own DPR, up to 3
    [[null, true, 2, 0], 2], [[null, true, 9, 0], 3],         // a boost is clamped to 3
    [[null, false, 1.5, 0], 2], [[null, true, 1, 0], 1.5],    // a boost under the tier's cap changes nothing
    [[null, true, 3, 1], 1], [[null, true, 0, 1], 1],         // the crash sentinel's capDpr(1) wins over MAX
    [[null, true, 3, 2.5], 2.5], [[null, false, 0, 2], 2],    // a ceiling only lowers
    [[lite, true, 3, 0], 1.25], [[lite, true, 3, 1], 1],      // ?lab=tlxLite keeps its own cap; MAX does not lift it
  ];
  assert.deepEqual(rows.map(([a]) => f(...a)), rows.map(([, v]) => v));
  const lab = (search, boost) => tlxCtx(search).TLX.dprCapFor(null, true, boost, 0);
  assert.deepEqual([lab("?lab=dpr2", 0), lab("?lab=dpr2", 3), lab("?lab=dpr3", 0), lab("?lab=dpr3", 1)], [2, 2, 3, 3], "the URL lab is the measurement: it replaces MAX too");
});

test("GRAPHICS presets on a phone: HIGH lifts TLX's cap to 2, MEDIUM and LOW keep 1.5; MAX, the lab and capDpr still rule (#5222)", () => {
  // Bryce's decision of 2026-11-24 on #5222. PerfGov.setUserTier sends the preset floor (2 at user tier 0, else 0);
  // create() passes max(boost, preset) as the boost, so a raise-only rule (and #6362's first-build hold) covers both.
  const g = (lite, mt, boost, ceil, preset) => f(lite, mt, Math.max(boost, preset), ceil);
  const f = tlxCtx().TLX.dprCapFor, lite = { dprCap: 1.25 }, PRESET = { high: 2, medium: 0, low: 0 };
  // [preset id, RESOLUTION MAX boost, capDpr ceiling] -> a phone's (mobileTier) cap
  const rows = [
    [["high", 0, 0], 2], [["medium", 0, 0], 1.5], [["low", 0, 0], 1.5],   // the decision
    [["high", 3, 0], 3], [["medium", 3, 0], 3], [["low", 3, 0], 3],       // RESOLUTION MAX stays the opt-in 3 on every preset
    [["high", 0, 1], 1], [["high", 3, 1], 1], [["high", 0, 1.75], 1.75],  // the crash sentinel's ceiling still wins
  ];
  assert.deepEqual(rows.map(([[id, boost, ceil]]) => g(null, true, boost, ceil, PRESET[id])), rows.map(([, v]) => v));
  assert.deepEqual([g(null, false, 0, 0, 2), g(null, false, 0, 0, 0), g(lite, true, 0, 0, 2)], [2, 2, 1.25], "desktop already 2; ?lab=tlxLite keeps 1.25");
  const lab = (search, preset) => tlxCtx(search).TLX.dprCapFor(null, true, preset, 0);
  assert.deepEqual([lab("?lab=dpr2", 0), lab("?lab=dpr2", 2), lab("?lab=dpr3", 0), lab("?lab=dpr3", 2)], [2, 2, 3, 3], "?lab=dpr2/dpr3 still replace the cap");
  // Bryce's 852×368 CSS at DPR 3 on HIGH: 1704×736 (the phone-bridge reading's dpr2 leg)
  assert.deepEqual([852, 368].map((c) => Math.round(c * Math.min(3, g(null, true, 0, 0, 2)))), [1704, 736]);
});

test("every backend caps the device pixel ratio at 1.5 on mobileTier and 2 elsewhere", () => {
  // GLX: the same cap, raised only by RESOLUTION MAX's boost (setDprBoost; audit item 74).
  assert.match(read("js/render/glx/glx.js"), /Math\.min\(window\.devicePixelRatio \|\| 1, Math\.max\(MOBILE_TIER \? 1\.5 : 2, _dprBoost, _dprPreset\)\)/);
  assert.match(read("js/render/webgpu/wgx.js"), /Math\.min\(window\.devicePixelRatio \|\| 1, WGX_MINIMAL \? 1 : \(WGX_LITE \? 1\.5 : 2\)\)/);
  assert.match(read("docs/GFX-CONTRACT.md"), /capped 1\.5 mobile \/ 2/);   // the seam's contract doc
});

test("each backend's resize() sizes the present buffer from the CAPPED dpr (evaluated at DPR 3)", () => {
  // The pins above read the cap's declaration; this runs the resize line that
  // APPLIES it, so a resize that stops using the cap (DPR_CAP declared, raw
  // devicePixelRatio used) fails. The capped dpr must feed Math.round(… * dpr).
  const resizeDpr = (file) => {
    const m = read(file).match(/const dpr = (Math\.min\(window\.devicePixelRatio \|\| 1, [^;\n]+\));[\s\S]{0,800}?Math\.round\((?:cw|css\.width) \* dpr\)/);
    assert.ok(m, file + ": resize() derives the present width from `dpr`");
    return m[1];
  };
  const evalAt = (expr, flags) => vm.runInNewContext(expr, { window: { devicePixelRatio: 3 }, ...flags }, { filename: "vm-page:evaluate" });
  const capFor = tlxCtx().TLX.dprCapFor;
  const tlxDpr = resizeDpr("js/render/three/tlx.js");
  const tlxAt = (mobileTier, boost = 0, dpr = 3) => vm.runInNewContext(tlxDpr, { window: { devicePixelRatio: dpr }, DPR_CAP: capFor(null, mobileTier, boost, 0) }, { filename: "vm-page:evaluate" });
  assert.equal(tlxAt(true), 1.5, "TLX phone at DPR 3");
  assert.equal(tlxAt(false), 2, "TLX desktop at DPR 3");
  // RESOLUTION MAX (#5222): Bryce's 852×368 CSS at DPR 3 presents 2556×1104 instead of 1278×552; a DPR-2 phone gets its own 2.
  assert.deepEqual([tlxAt(true, 3), tlxAt(true, 3, 2), tlxAt(false, 3, 1)], [3, 2, 1], "MAX = the device's own DPR, never above it");
  assert.deepEqual([852, 368].map((c) => Math.round(c * tlxAt(true, 3))), [2556, 1104]);
  assert.deepEqual([852, 368].map((c) => Math.round(c * tlxAt(true))), [1278, 552]);
  const glx = resizeDpr("js/render/glx/glx.js");
  assert.equal(evalAt(glx, { MOBILE_TIER: true, _dprBoost: 0, _dprPreset: 0 }), 1.5, "GLX phone at DPR 3");
  assert.equal(evalAt(glx, { MOBILE_TIER: false, _dprBoost: 0, _dprPreset: 0 }), 2, "GLX desktop at DPR 3");
  // RESOLUTION MAX on GLX too (audit item 74: it was silently HIGH there): the device's own DPR, never above it.
  const glxAt = (mobile, boost, dpr, preset = 0) => vm.runInNewContext(glx, { window: { devicePixelRatio: dpr }, MOBILE_TIER: mobile, _dprBoost: boost, _dprPreset: preset }, { filename: "vm-page:evaluate" });
  assert.deepEqual([glxAt(true, 3, 3), glxAt(true, 3, 2), glxAt(false, 3, 1)], [3, 2, 1], "GLX MAX = the device's own DPR");
  // GRAPHICS presets on GLX (#5222): HIGH (preset 2) lifts the phone to 2, MEDIUM/LOW (0) keep 1.5, MAX still 3.
  assert.deepEqual([glxAt(true, 0, 3, 2), glxAt(true, 0, 3, 0), glxAt(true, 3, 3, 2), glxAt(true, 0, 1, 2)], [2, 1.5, 3, 1], "GLX HIGH / MED-LOW / MAX / a DPR-1 device");
  const wgx = resizeDpr("js/render/webgpu/wgx.js");
  assert.equal(evalAt(wgx, { WGX_MINIMAL: false, WGX_LITE: true }), 1.5, "WGX lite at DPR 3");
  assert.equal(evalAt(wgx, { WGX_MINIMAL: false, WGX_LITE: false }), 2, "WGX full at DPR 3");
});

test("A phone's AUTO resolution stays capped at MED's 0.75 and HIGH pins full scale", () => {
  const src = read("js/ui/scale.js");
  assert.match(src, /const PHONE_AUTO_CEIL = 0\.75;/);
  assert.match(src, /\{ id: "low",\s+label: "LOW",\s+v: 0\.5\s+\}/);
  assert.match(src, /\{ id: "med",\s+label: "MED",\s+v: 0\.75\s+\}/);
  assert.match(src, /\{ id: "high",\s+label: "HIGH",\s+v: 1\.0\s+\}/);
});

function loadApex(G, extra) {
  const context = vm.createContext(Object.assign({
    CamModes: { CAM_MODES: [{ id: "chase" }] }, LightTune: { TUNE_DEFS: [], LT: {} },
    AgentView: { create: () => ({}) }, Tracks: { building: () => false, sample: () => {} },
  }, extra));
  const load = (f) => vm.runInContext(fs.readFileSync(absSrc("js/agent/" + f), "utf8"), context, { filename: absSrc("js/agent/" + f) });
  for (const f of ["apex-lifecycle.js", "apex-net.js", "apex-cam.js", "apex-track.js", "apex-lobby.js", "apex.js"]) load(f);   // lifecycle first: effectiveRes lives there
  return vm.runInContext("ApexApi", context).create(G);
}
function perfGov() {
  const PerfGov = { frameStats: () => ({ p50: 16 }) };
  for (const k of ["fpsEMA", "floorMs"]) PerfGov[k] = () => 16.7;
  for (const k of ["autoRes", "tier", "autoTier", "autoShed", "openWindow", "userTier", "tierFloor", "strikes", "scaleFutile", "tierFutile", "tierHold"]) PerfGov[k] = () => 0;
  return PerfGov;
}

test("renderScale().effective reads Bryce's phone as 639×295 for 852×393 CSS at DPR 3", () => {
  const gfx = { getRenderScale: () => 0.5, getPresentSize: () => ({ width: 1278, height: 590 }), width: 639, height: 295 };
  const api = loadApex({ gfx, canvas: { clientWidth: 852, clientHeight: 393 }, player: null, cars: [], track: {} },
    { PerfGov: perfGov(), window: { devicePixelRatio: 3 } });
  const e = JSON.parse(JSON.stringify(api.renderScale({ lite: true }).effective));
  assert.deepEqual(e, { css: [852, 393], dpr: 3, dprCap: 1.5, present: [1278, 590], buffer: [639, 295], pxPerCss: 0.75, ofDevice: 0.25 });
  assert.equal(api.renderScale().effective.ofDevice, 0.25, "the full report carries the same block");
});

test("renderScale().effective on a desktop: cap 2 applied, scale 1, no NaN when a backend lacks getPresentSize", () => {
  const gfx = { getRenderScale: () => 1, width: 2400, height: 1200 };
  const api = loadApex({ gfx, canvas: { clientWidth: 1200, clientHeight: 600 }, player: null, cars: [], track: {} },
    { PerfGov: perfGov(), window: { devicePixelRatio: 2 } });
  const e = JSON.parse(JSON.stringify(api.renderScale({ lite: true }).effective));
  assert.deepEqual(e, { css: [1200, 600], dpr: 2, dprCap: null, present: [0, 0], buffer: [2400, 1200], pxPerCss: 2, ofDevice: 1 });
});

test("renderScale().effective never throws before the canvas is laid out", () => {
  const api = loadApex({ gfx: { getRenderScale: () => 1, getPresentSize: () => { throw new Error("no renderer"); }, width: 0, height: 0 },
    canvas: { clientWidth: 0, clientHeight: 0 }, player: null, cars: [], track: {} }, { PerfGov: perfGov(), window: {} });
  const e = JSON.parse(JSON.stringify(api.renderScale({ lite: true }).effective));
  assert.deepEqual(e, { css: [0, 0], dpr: 1, dprCap: null, present: [0, 0], buffer: [0, 0], pxPerCss: null, ofDevice: null });
});
