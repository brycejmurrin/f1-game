// The garage AERO button toggles the flaps and must NOT move the camera
// (Bryce 2026-10-20: it used to snap to the rear wing). Runs the production
// setSetupAero in a VM with the camera entry points spied.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("../../js/garage/setup-camera.js", import.meta.url), "utf8");
const start = src.indexOf("function setSetupAero(on, opts) {");
const end = src.indexOf("function setupZoom(", start);
assert.ok(start >= 0 && end > start, "found the production setSetupAero");

function harness(state) {
  const calls = [];
  const btn = { classList: { toggle() {} }, setAttribute() {}, querySelector: () => null };
  const c = vm.createContext({ setupPreviewXOn: false, ...state, $: () => btn,
    setSetupView: (n) => calls.push(["view", n]), setSetupSpin: (v) => calls.push(["spin", v]) });
  vm.runInContext(src.slice(start, end), c);
  return { c, calls };
}

for (const [label, state] of [
  ["untouched turntable", { setupPreviewSpin: true, setupPreviewDist: 8.35 }],
  ["whole-car preset (> 5 m)", { setupPreviewSpin: false, setupPreviewDist: 8.4 }],
  ["close-in view", { setupPreviewSpin: false, setupPreviewDist: 3 }],
]) {
  test(`AERO on/off leaves the camera alone: ${label}`, () => {
    const { c, calls } = harness(state);
    c.setSetupAero(true);
    assert.equal(c.setupPreviewXOn, true, "flaps still toggle on");
    c.setSetupAero(false);
    assert.equal(c.setupPreviewXOn, false, "and off");
    assert.deepEqual(calls, [], "no setSetupView / setSetupSpin call");
  });
}
