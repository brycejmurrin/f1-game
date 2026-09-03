/* drift-vm.test.mjs — tests/specs/drift.spec.js replayed in the Node VM
 * (tools/lib/game-vm.cjs): the dynamic bicycle model's qualitative contract —
 * stable at the limit, SLIDE loosens the rear, self-aligning, grip-limited
 * yaw, no NaN under abuse, SPEED STEER — with the SAME assertions and PACE pin.
 *
 * Ported: all 6 tests. The pageerror guard on "never NaNs or flies off" reads
 * the VM's console/rejection record (a throw inside step() fails the test).
 * Not portable: none — every assertion reads an `__apex` JSON hook.
 *
 * The browser spec stays the truth until CI has run this twin.
 * Run: node --test tests/unit/drift-vm.test.mjs   (~4 s, one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const gt = (a, b, m) => assert.ok(a > b, m || `${a} > ${b}`);
const lt = (a, b, m) => assert.ok(a < b, m || `${a} < ${b}`);

let g = null, PHYS0 = null;
before(async () => { g = await createGame({ track: "monza" }); PHYS0 = { ...g.apex.tuning() }; });
after(() => { if (g) g.close(); });

// The browser spec gets a FRESH page per test; one boot here, so put back the
// physics knobs and the headless flag a previous test may have left behind.
const fresh = () => { g.apex.setPhysics(PHYS0); g.apex.headless(false); };

const mark = () => ({ c: g.record.console.length, r: g.record.rejections.length });
const errorsSince = (m) => [
  ...g.record.console.slice(m.c).filter((c) => c[0] === "error").map((c) => c[1]),
  ...g.record.rejections.slice(m.r),
];

// The spec's loadTrack() fixture: race(monza) + go(), then PACE pinned.
async function loadTrack() {
  fresh();
  await g.race("monza", "day", "dry");
  g.apex.setPhysics({ pace: 1 });
}

// Hold a fixed steer from the main straight at a given SLIDE (drift); report
// turn-in, peak slip angle and the steady heading yaw rate (deg/s).
function corner(drift, steer = 1, speed = 40, frames = 48) {
  const a = g.apex;
  a.setPhysics({ drift });
  a.jump(0.0, speed, 0);
  a.setInput({ steer, throttle: false });
  const a0 = a.probe().angle;
  let peakSlip = 0, prev = a.physState().head, yawSum = 0, yawN = 0;
  for (let i = 0; i < frames; i++) {
    a.step(1 / 60, 1);
    const ps = a.physState();
    peakSlip = Math.max(peakSlip, Math.abs(ps.slipDeg));
    let dh = ps.head - prev; prev = ps.head;
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    if (i >= frames - 12) { yawSum += Math.abs(dh) * 60 * 180 / Math.PI; yawN++; }
  }
  const a1 = a.probe().angle;
  const x = a.probe().x;
  a.clearInput();
  return { turn: Math.abs(a1 - a0), peakSlip, steadyYaw: yawSum / yawN, x, finite: Number.isFinite(x) };
}

test("default car is stable at the limit: full lock washes wide, never spins", async () => {
  await loadTrack();
  const r = corner(0.15, 1, 50, 90);   // shipped-ish SLIDE, full lock, 1.5 s
  assert.equal(r.finite, true);
  lt(r.peakSlip, 45);                  // understeer wash, not a spin
  lt(Math.abs(r.x), 60);               // stayed in the track neighbourhood
});

test("SLIDE loosens the rear: more slip and more rotation than planted", async () => {
  await loadTrack();
  const planted = corner(0.0, 1, 40, 48);
  const loose = corner(0.7, 1, 40, 48);
  assert.equal(loose.finite && planted.finite, true);
  gt(loose.peakSlip, planted.peakSlip + 2);   // a real, bigger slide
  gt(loose.turn, planted.turn);               // looser rear rotates more
});

test("slide self-aligns: release the steering and the slip decays", async () => {
  await loadTrack();
  const a = g.apex;
  a.setPhysics({ drift: 0.7 });
  a.jump(0.0, 40, 0);
  a.setInput({ steer: 1, throttle: false });
  for (let i = 0; i < 24; i++) a.step(1 / 60, 1);   // throw it into a slide
  a.setInput({ steer: 0, throttle: false });
  for (let i = 0; i < 72; i++) a.step(1 / 60, 1);   // release, let it settle (1.2 s)
  const s = a.physState();
  a.clearInput();
  a.setPhysics({ drift: 0.15 });
  lt(Math.abs(s.vLat), 1.5);    // slip bled away — the car straightens itself
});

test("cornering is grip-limited: yaw rate doesn't run away with speed", async () => {
  await loadTrack();
  // 36 frames: the window ends before any wall contact for both speeds.
  const slow = corner(0.0, 1, 25, 36);
  const fast = corner(0.0, 1, 65, 36);
  assert.equal(fast.finite && slow.finite, true);
  lt(fast.steadyYaw, slow.steadyYaw * 1.3);
});

test("high drift + aggressive steering never NaNs or flies off", async () => {
  const m = mark();
  await loadTrack();
  const a = g.apex;
  a.setPhysics({ drift: 0.7 });
  a.jump(0.0, 70, 0);
  let maxAbsX = 0, finite = true;
  for (let i = 0; i < 400; i++) {
    a.setInput({ steer: Math.sin(i / 7), throttle: true });
    a.step(1 / 60, 1);
    const p = a.probe();
    if (!Number.isFinite(p.x) || !Number.isFinite(p.s)) finite = false;
    maxAbsX = Math.max(maxAbsX, Math.abs(p.x));
  }
  a.clearInput();
  a.setPhysics({ drift: 0.15 });   // restore default
  assert.deepEqual(errorsSince(m), []);
  assert.equal(finite, true);
  lt(maxAbsX, 60);   // stayed in the track's neighbourhood
});

test("SPEED STEER: higher keeps more turn-in at high speed", async () => {
  await loadTrack();
  const turnAtRef = (ref) => {
    const a = g.apex;
    a.setPhysics({ drift: 0, speedRef: ref });
    a.jump(0.0, 58, 0);
    a.setInput({ steer: 0.5, throttle: false });
    const a0 = a.probe().angle;
    for (let i = 0; i < 16; i++) a.step(1 / 60, 1);
    const a1 = a.probe().angle;
    a.clearInput();
    return Math.abs(a1 - a0);
  };
  const calm = turnAtRef(50);
  const sharp = turnAtRef(120);
  gt(sharp, calm * 1.1);
});
