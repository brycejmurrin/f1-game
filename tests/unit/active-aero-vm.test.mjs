/* active-aero-vm.test.mjs — tests/specs/active-aero.spec.js replayed in the
 * Node VM (tools/lib/game-vm.cjs): the 2026 X/Z-mode moveable wing — state
 * surface, arming in a zone, flap travel, braking shut, the top-speed/grip
 * trade, the AI using it — with the SAME assertions and thresholds.
 *
 * Ported: all 13 tests. "aero() returns null with no player on track" runs
 * FIRST against the virgin boot (the VM boots without racing so the pre-race
 * state is observable); every other test races monza like the spec's load().
 * Not portable: none — every assertion reads an `__apex` JSON hook.
 *
 * The browser spec stays the truth until CI has run this twin.
 * Run: node --test tests/unit/active-aero-vm.test.mjs   (~6 s, one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const gt = (a, b, m) => assert.ok(a > b, m || `${a} > ${b}`);
const lt = (a, b, m) => assert.ok(a < b, m || `${a} < ${b}`);
const gte = (a, b, m) => assert.ok(a >= b, m || `${a} >= ${b}`);

let g = null, PHYS0 = null;
before(async () => { g = await createGame({ storage: { trackId: "monza" } }); PHYS0 = { ...g.apex.tuning() }; });
after(() => { if (g) g.close(); });

// The browser spec gets a FRESH page per test; one boot here, so put back the
// physics knobs a previous test may have left behind.
const fresh = () => { g.apex.setPhysics(PHYS0); g.apex.headless(false); };

// The spec's load(): race(id), headless(true), go(), jump mid-track at 60.
async function load(trackId = "monza") {
  fresh();
  await g.race(trackId);
  g.apex.headless(true);
  g.apex.go();
  g.apex.jump(0.1, 60, 0);
}

// Verbatim from the spec: where on the loaded track to test from, asked of the
// game's own zone list ("straight" = longest non-wrapping zone's midFrac,
// "corner" = the middle of the longest stretch covered by NO zone).
function fracWhere(p) {
  const zones = g.apex.aeroZones();
  if (!zones.length) throw new Error("track has no activation zones");
  if (p === "straight") {
    const sorted = zones.slice().sort((a, b) => b.len - a.len);
    const z = sorted.find((q) => q.endFrac > q.startFrac) || sorted[0];
    return z.midFrac;
  }
  const N = 2000, covered = new Array(N).fill(false);
  for (const z of zones) {
    const a = Math.floor(z.startFrac * N), b = Math.floor(z.endFrac * N);
    if (b >= a) { for (let i = a; i <= b && i < N; i++) covered[i] = true; }
    else { for (let i = a; i < N; i++) covered[i] = true;
           for (let i = 0; i <= b; i++) covered[i] = true; }
  }
  let bestStart = 0, bestLen = 0, curStart = -1, cur = 0;
  for (let i = 0; i < N * 2; i++) {
    if (!covered[i % N]) {
      if (cur === 0) curStart = i;
      cur++;
      if (cur > bestLen && cur <= N) { bestLen = cur; bestStart = curStart; }
    } else cur = 0;
  }
  if (!bestLen) throw new Error("every metre of this circuit is an aero zone");
  return ((bestStart + bestLen / 2) % N) / N;
}

// ── before any race ─────────────────────────────────────────────────────────

test("aero() returns null with no player on track", () => {
  assert.equal(g.apex.aero(), null);
});

// ── state surface ───────────────────────────────────────────────────────────

test("aero() reports mode, flap travel, request and arming", async () => {
  await load();
  const a = g.apex.aero();
  assert.equal(typeof a.aeroX, "number");
  assert.equal(typeof a.xOn, "boolean");
  assert.equal(typeof a.xArmed, "boolean");
  assert.ok(["X", "Z"].includes(a.mode));
});

test("the car starts in Z-mode with the flaps shut", async () => {
  await load();
  const a = g.apex.aero();
  assert.equal(a.aeroX, 0);
  assert.equal(a.xOn, false);
  assert.equal(a.mode, "Z");
});

test("obs(), physState() and carAt() all expose the flap travel", async () => {
  await load();
  for (const src of [g.apex.obs(), g.apex.physState(), g.apex.carAt(0)]) {
    assert.equal(typeof src.aeroX, "number");
    assert.equal(typeof src.xOn, "boolean");
    assert.equal(typeof src.xArmed, "boolean");
  }
});

// ── arming ──────────────────────────────────────────────────────────────────

test("arms on a straight and the flap opens", async () => {
  await load();
  const f = fracWhere("straight");
  const A = g.apex;
  A.jump(f, 60, 0);
  A.step(1 / 60, 2);
  const armed = A.aero().xArmed;
  A.aero(true);
  A.act({ throttle: true }, 1 / 60, 60);   // ~1 s
  const after = A.aero();
  assert.equal(armed, true);
  gt(after.aeroX, 0.9);
  assert.equal(after.mode, "X");
});

test("does NOT arm in the tightest corner, and asking for X-mode there does nothing", async () => {
  await load();
  const f = fracWhere("corner");
  const A = g.apex;
  A.jump(f, 30, 0);
  A.step(1 / 60, 2);
  A.aero(true);
  A.act({ throttle: true }, 1 / 60, 30);
  const r = A.aero();
  assert.equal(r.xArmed, false);
  assert.equal(r.aeroX, 0);
  assert.equal(r.mode, "Z");
});

test("un-arming drops the request, so the flap does not spring back open", async () => {
  await load();
  const straight = fracWhere("straight");
  const corner = fracWhere("corner");
  const A = g.apex;
  A.jump(straight, 60, 0);
  A.step(1 / 60, 2);
  A.aero(true);
  A.act({ throttle: true }, 1 / 60, 60);
  const open = A.aero();
  // teleport into the corner: the arming window is gone
  A.jump(corner, 30, 0);
  A.act({ throttle: true }, 1 / 60, 30);
  const closed = A.aero();
  gt(open.aeroX, 0.9);
  assert.equal(closed.aeroX, 0);
  assert.equal(closed.xOn, false);
});

// ── flap travel ─────────────────────────────────────────────────────────────

test("the flap takes time to open — it is not a step change", async () => {
  await load();
  const f = fracWhere("straight");
  const A = g.apex;
  A.jump(f, 60, 0);
  A.step(1 / 60, 2);
  A.aero(true);
  const seq = [];
  for (let i = 0; i < 6; i++) {
    A.act({ throttle: true }, 1 / 60, 3);
    seq.push(A.aero().aeroX);
  }
  gt(seq[0], 0);
  lt(seq[0], 1);
  for (let i = 1; i < seq.length; i++) gte(seq[i], seq[i - 1]);
  gt(seq[seq.length - 1], seq[0]);
});

test("braking slams it shut, and faster than it opened", async () => {
  await load();
  const f = fracWhere("straight");
  const A = g.apex;
  A.jump(f, 60, 0);
  A.step(1 / 60, 2);
  A.aero(true);
  A.act({ throttle: true }, 1 / 60, 6);
  const openedIn6 = A.aero().aeroX;
  A.act({ throttle: true }, 1 / 60, 60);
  const full = A.aero().aeroX;
  A.act({ brake: true }, 1 / 60, 6);
  const afterBrake6 = A.aero().aeroX;
  gt(full, 0.9);
  // 6 ticks of braking removes more travel than 6 ticks of opening added
  gt(full - afterBrake6, openedIn6);
  lt(afterBrake6, 0.7);
});

// ── the trade ───────────────────────────────────────────────────────────────

test("X-mode reaches a higher top speed down the same straight", async () => {
  await load();
  const f = fracWhere("straight");
  const A = g.apex;
  const run = (x) => {
    A.reset(f, 55, 0);
    A.step(1 / 60, 2);
    A.aero(x);
    A.act({ throttle: true }, 1 / 60, 240);   // 4 s flat out
    return A.obs().speed;
  };
  const z = run(false);
  const xm = run(true);
  gt(xm, z);
});

test("X-mode costs aero grip: the same input turns the car less", async () => {
  await load();
  const f = fracWhere("straight");
  const A = g.apex;
  const run = (x) => {
    A.reset(f, 65, 0);
    A.step(1 / 60, 2);
    A.aero(x);
    A.act({ throttle: true }, 1 / 60, 60);   // let the flap settle
    const flap = A.aero().aeroX;             // flap AFTER settle, BEFORE steer
    const before = A.obs();
    A.act({ steer: 1, throttle: true }, 1 / 60, 25);
    const after = A.obs();
    let dh = after.head - before.head;
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    return { dHead: Math.abs(dh), dx: Math.abs(after.x - before.x), flap };
  };
  const r = { z: run(false), x: run(true) };
  assert.equal(r.z.flap, 0);
  gt(r.x.flap, 0.9);
  lt(r.x.dHead, r.z.dHead);
  lt(r.x.dx, r.z.dx);
});

// ── the field ───────────────────────────────────────────────────────────────

test("AI cars run X-mode too", async () => {
  await load();
  const f = fracWhere("straight");
  const A = g.apex;
  const n = A.cars().length;
  for (let i = 1; i < n; i++) A.aiPlace(i, f + i * 0.004, 60, 0);
  A.step(1 / 60, 90);
  assert.equal(A.cars().some((c) => !c.p && c.ax > 0.5), true);
});

test("the agent world view reports the aero block and the affordance", async () => {
  await load();
  const w = g.apex.world({ detail: "full" });
  assert.ok(w.ego.aero);
  assert.ok(["X", "Z"].includes(w.ego.aero.mode));
  assert.equal(typeof w.ego.aero.armed, "boolean");
  const ids = [...(w.affordances || []), ...(w.unavailable || [])].map((x) => x.id);
  assert.ok(ids.includes("active_aero_x_mode"), `ids: ${ids.join(",")}`);
});
