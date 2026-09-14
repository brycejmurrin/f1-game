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

// The stub must carry `info()`, because the probe now WAITS for the race to arm
// before touching the physics — `__apex.race()` does not await `startRace()`.
const makeApex = (cameraResult, state = "race") => ({
  race: () => true,
  info: () => ({ state }),
  jump() {},
  step() {},
  probe: () => ({ speed: 50, s: 100 }),
  lightState: () => ({ exposure: 1 }),
  camera: () => cameraResult,
});
const allGlobalsPresent = () => true;
const noWait = { timeoutMs: 0, pollMs: 0, sleep: () => Promise.resolve() };

test("live probe marks false camera results as failed and objects as successful", async () => {
  assert.equal((await evaluateLiveProbe(makeApex(false), allGlobalsPresent, noWait)).cams, false);
  assert.equal((await evaluateLiveProbe(makeApex({ mode: "cockpit" }), allGlobalsPresent, noWait)).cams, true);
});

test("live probe waits for the race to arm, and says so when it never does", async () => {
  // The defect this whole change exists for: startRace() is async and race()
  // does not await it, so a synchronous probe always ran against the menu.
  const stuck = await evaluateLiveProbe(makeApex({ mode: "cockpit" }, "menu"), allGlobalsPresent, noWait);
  assert.equal(stuck.armed, false);
  assert.equal(stuck.state, "menu");
  assert.equal(stuck.obs, null, "nothing after the race arms may be reported when it never armed");
  // ...and the failure NAMES that, rather than blaming the physics probe.
  const fails = probeFailures(stuck, []);
  assert.ok(fails.some((f) => f.includes("never armed")), `expected an 'armed' failure, got ${JSON.stringify(fails)}`);
  assert.ok(!fails.some((f) => f.includes("probe() invalid")), "a race that never armed must not read as broken physics");

  const armed = await evaluateLiveProbe(makeApex({ mode: "cockpit" }, "count"), allGlobalsPresent, noWait);
  assert.equal(armed.armed, true, "the countdown counts as armed — the race exists");
  assert.deepEqual(probeFailures(armed, []), []);
});
