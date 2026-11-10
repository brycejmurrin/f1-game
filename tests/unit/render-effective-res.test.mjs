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

test("every backend caps the device pixel ratio at 1.5 on mobileTier and 2 elsewhere", () => {
  assert.match(read("js/render/three/tlx.js"), /let DPR_CAP = _lite \? _lite\.dprCap : \(mobileTier \? 1\.5 : 2\);/);
  assert.match(read("js/render/glx/glx.js"), /Math\.min\(window\.devicePixelRatio \|\| 1, MOBILE_TIER \? 1\.5 : 2\)/);
  assert.match(read("js/render/webgpu/wgx.js"), /Math\.min\(window\.devicePixelRatio \|\| 1, WGX_MINIMAL \? 1 : \(WGX_LITE \? 1\.5 : 2\)\)/);
  assert.match(read("docs/GFX-CONTRACT.md"), /capped 1\.5 mobile \/ 2/);   // the seam's contract doc
});

test("RESOLUTION ships at AUTO everywhere; a phone's AUTO is capped at MED's 0.75 (#5227; #5166: was a MED pin)", () => {
  const src = read("js/ui/scale.js");
  assert.match(src, /const defaultResMode = \(\) => "auto";/);
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
