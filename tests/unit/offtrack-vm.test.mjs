/* offtrack-vm.test.mjs — tests/specs/offtrack.spec.js replayed in the Node VM
 * (tools/game-vm.cjs): prog↔s coupling, reversing, wrong-way, grass, the
 * auto-rescues and the stopped-on-track contract — with the SAME assertions,
 * thresholds and PACE pin (setPhysics({ pace: 1 })).
 *
 * Ported: all 8 tests (the last races bahrain on the same boot).
 * Not portable: none — every assertion reads an `__apex` JSON hook.
 *
 * The browser spec stays the truth until CI has run this twin.
 * Run: node --test tests/unit/offtrack-vm.test.mjs   (~6 s, one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/game-vm.cjs");

const gt = (a, b, m) => assert.ok(a > b, m || `${a} > ${b}`);
const lt = (a, b, m) => assert.ok(a < b, m || `${a} < ${b}`);

let g = null, PHYS0 = null;
before(async () => { g = await createGame({ track: "monza" }); PHYS0 = { ...g.apex.tuning() }; });
after(() => { if (g) g.close(); });

// The browser spec gets a FRESH page per test; one boot here, so put back the
// physics knobs and the headless flag a previous test may have left behind.
const fresh = () => { g.apex.setPhysics(PHYS0); g.apex.headless(false); };

const pinPace = () => g.apex.setPhysics({ pace: 1 });

// The spec's loadTrack() fixture: race(monza) + go(), then the PACE pin.
async function loadTrack() {
  fresh();
  await g.race("monza", "day", "dry");
  pinPace();
}

test("prog tracks s: forward driving advances prog ≈ s-progress", async () => {
  await loadTrack();
  const a = g.apex;
  a.setPhysics({ drift: 0 });
  a.jump(0.0, 60, 0);
  const p0 = a.physState();
  for (let i = 0; i < 120; i++) { a.setInput({ steer: 0, throttle: true }); a.step(1 / 60, 1); }
  const p1 = a.physState();
  a.clearInput();
  const dProg = p1.prog - p0.prog, dS = p1.s - p0.s;
  gt(dProg, 50);                       // clearly progressed
  lt(Math.abs(dProg - dS), 2);         // prog == s advance
});

test("facing backwards and throttling DECREASES progress (no forward cheat)", async () => {
  await loadTrack();
  const a = g.apex;
  a.setPhysics({ drift: 0 });
  a.jump(0.3, 30, 0);
  a.aim(180);                     // face backwards
  const p0 = a.physState();
  for (let i = 0; i < 30; i++) { a.setInput({ steer: 0, throttle: true }); a.step(1 / 60, 1); }
  const p1 = a.physState();
  a.clearInput();
  lt(p1.prog - p0.prog, 0);       // went backwards → prog dropped
});

test("wrong-way is flagged when driving against the track", async () => {
  await loadTrack();
  const a = g.apex;
  a.setPhysics({ drift: 0 });
  a.jump(0.3, 30, 0);
  a.aim(180);
  let flagged = false;
  for (let i = 0; i < 60; i++) {
    a.setInput({ steer: 0, throttle: true });
    a.step(1 / 60, 1);
    if (a.physState().wrongWay) { flagged = true; break; }
  }
  a.clearInput();
  assert.equal(flagged, true);
});

test("brake at a standstill crawls the car backwards (reverse), then throttle recovers", async () => {
  await loadTrack();
  const a = g.apex;
  a.setPhysics({ drift: 0 });
  a.jump(0.0, 0, 0);
  for (let i = 0; i < 60; i++) { a.setInput({ steer: 0, brake: true }); a.step(1 / 60, 1); }
  const rev = a.physState().speed;
  for (let i = 0; i < 120; i++) { a.setInput({ steer: 0, throttle: true }); a.step(1 / 60, 1); }
  const fwd = a.physState().speed;
  a.clearInput();
  lt(rev, -2);     // genuinely reversing
  gt(rev, -9);     // but capped to a crawl
  gt(fwd, 5);      // throttle pulls it back to forward motion
});

test("driving onto grass and back recovers (slowed off, speeds up on return)", async () => {
  await loadTrack();
  // A CONTROLLED PAIR, not a chain — see the browser spec for the two defects
  // the chained version hid.
  const LAUNCH = 80;
  const leg = (lat) => {
    const a = g.apex;
    a.setPhysics({ drift: 0 });
    a.jump(0.0, LAUNCH, lat);
    for (let i = 0; i < 90; i++) { a.setInput({ steer: 0, throttle: true }); a.step(1 / 60, 1); }
    const speed = a.physState().speed;
    a.clearInput();
    return speed;
  };
  const offSpeed = leg(14);   // way off in the grass
  const onSpeed = leg(0);     // same launch, on the tarmac
  lt(offSpeed, 0.75 * LAUNCH);
  gt(onSpeed, offSpeed + 5);
});

test("auto-rescue: a wrong-way car is recovered to the racing line facing forward", async () => {
  await loadTrack();
  const a = g.apex;
  a.setPhysics({ drift: 0 });
  a.jump(0.3, 30, 0);
  a.aim(180);
  let rescued = false, afterX = 99, afterWrong = true;
  for (let i = 0; i < 320; i++) {           // > 3 s of wrong-way
    a.setInput({ steer: 0, throttle: true });
    a.step(1 / 60, 1);
    const p = a.physState();
    if (p.rescueT === 0 && !p.wrongWay && Math.abs(p.x) < 1 && i > 60) { rescued = true; afterX = p.x; afterWrong = p.wrongWay; break; }
  }
  a.clearInput();
  assert.equal(rescued, true);
  lt(Math.abs(afterX), 1);   // back on the line
  assert.equal(afterWrong, false);
});

test("auto-rescue: a car beached deep off-track is recovered", async () => {
  await loadTrack();
  const a = g.apex;
  a.setPhysics({ drift: 0 });
  let onTrack = false;
  a.jump(0.0, 0, 16);            // beached in the grass, stopped
  for (let i = 0; i < 320; i++) {
    a.setInput({ steer: 0, throttle: false });
    a.step(1 / 60, 1);
    if (Math.abs(a.physState().x) < 1) { onTrack = true; break; }
  }
  a.clearInput();
  assert.equal(onTrack, true);
});

test("stopped on-track: throttle held is never stuck at 0; gas released is left parked", async () => {
  fresh();
  await g.race("bahrain", "day", "dry");
  const a = g.apex;
  a.jump(0.12, 0, 0);
  let movedWithThrottle = 0;
  for (let i = 0; i < 300; i++) { a.setInput({ steer: 0, throttle: true }); a.step(1 / 60, 1); movedWithThrottle = Math.max(movedWithThrottle, a.physState().speed); }
  a.jump(0.12, 0, 0);
  let movedNoThrottle = 0;
  for (let i = 0; i < 300; i++) { a.setInput({ steer: 0, throttle: false }); a.step(1 / 60, 1); movedNoThrottle = Math.max(movedNoThrottle, a.physState().speed); }
  a.clearInput();
  gt(movedWithThrottle, 10);   // throttle held → never stuck at 0
  lt(movedNoThrottle, 2);      // gas released → left parked, not rescued
});
