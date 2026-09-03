import assert from "node:assert/strict";
import test from "node:test";
import { evaluateLiveProbe, probeFailures } from "../../tools/check/quick-validate.mjs";

const passing = {
  globals: { GLX: true },
  race: true,
  obs: true,
  light: true,
  cams: true,
};

test("quick validator accepts a fully passing probe", () => {
  assert.deepEqual(probeFailures(passing, []), []);
});

test("quick validator rejects failing race and camera hooks", () => {
  assert.deepEqual(
    probeFailures({ ...passing, race: false, cams: false }, []),
    ["race() failed", "camera() failed"],
  );
});

test("live probe marks false camera results as failed and objects as successful", () => {
  const makeApex = (cameraResult) => ({
    race: () => true,
    jump() {},
    step() {},
    probe: () => ({ speed: 50, s: 100 }),
    lightState: () => ({ exposure: 1 }),
    camera: () => cameraResult,
  });
  const allGlobalsPresent = () => true;

  assert.equal(evaluateLiveProbe(makeApex(false), allGlobalsPresent).cams, false);
  assert.equal(evaluateLiveProbe(makeApex({ mode: "cockpit" }), allGlobalsPresent).cams, true);
});
