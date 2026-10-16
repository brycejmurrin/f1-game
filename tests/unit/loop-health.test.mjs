/* loop-health.test.mjs — behavioural pins for js/perf/loop-health.js.
 *
 * The frame-loop fault policy used to be checked only by source regexes in
 * source-integrity / gfx-backend-canary. Those prove the call sites still
 * exist; they do not prove RUN_CAP, TOTAL_CAP, quiet expiry, or clean-frame
 * recovery. This file loads the real IIFE the way other unit tests do (VM +
 * seedLog) and drives fault()/clean()/state() with a controllable clock.
 *
 * Run: node --test tests/unit/loop-health.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/perf/loop-health.js"), "utf8");

/** Fresh LoopHealth in a VM. `clock.t` is what performance.now() returns. */
function load(clock = { t: 0 }) {
  const errors = [];
  const ctx = {
    performance: { now: () => clock.t },
    Date: { now: () => clock.t },
    Math,
    console,
  };
  vm.createContext(ctx);
  seedLog(ctx);
  // Capture Log.error so a CAP line is observable without polluting the host.
  const realError = ctx.Log.error.bind(ctx.Log);
  ctx.Log.error = (ns, msg, e) => {
    errors.push({ ns, msg, e });
    return realError(ns, msg, e);
  };
  vm.runInContext(SRC.replace(/^const\b/gm, "var"), ctx, { filename: "js/perf/loop-health.js" });
  return { LoopHealth: ctx.LoopHealth, clock, errors };
}

test("state() exposes the shipped caps and a null heartbeat before any clean frame", () => {
  const { LoopHealth } = load();
  const s = LoopHealth.state();
  assert.equal(s.cap, 8, "RUN_CAP");
  assert.equal(s.totalCap, 240, "TOTAL_CAP");
  assert.equal(s.frames, 0);
  assert.equal(s.faults, 0);
  assert.equal(s.run, 0);
  assert.equal(s.stopped, false);
  assert.equal(s.staleMs, null, "no clean frame yet — nothing to be stale against");
});

test("RUN_CAP: seven consecutive faults survive; the eighth stops the loop", () => {
  const { LoopHealth, errors } = load();
  for (let i = 1; i <= 7; i++) {
    assert.equal(LoopHealth.fault(new Error(`f${i}`)), true, `fault ${i} must survive`);
    assert.equal(LoopHealth.state().run, i);
    assert.equal(LoopHealth.state().stopped, false);
  }
  assert.equal(LoopHealth.fault(new Error("f8")), false, "8th consecutive fault hits RUN_CAP");
  const s = LoopHealth.state();
  assert.equal(s.run, 8);
  assert.equal(s.faults, 8);
  assert.equal(s.stopped, true);
  assert.match(errors.at(-1).msg, /CAP REACHED/);
});

test("a clean frame pays the run back so a later fault streak starts fresh", () => {
  const { LoopHealth } = load();
  for (let i = 0; i < 5; i++) assert.equal(LoopHealth.fault(new Error("transient")), true);
  assert.equal(LoopHealth.state().run, 5);
  LoopHealth.clean();
  assert.equal(LoopHealth.state().run, 0, "clean() zeroes the consecutive-fault run");
  assert.equal(LoopHealth.state().frames, 1);
  assert.equal(LoopHealth.state().faults, 5, "total still counts until quiet expiry");
  // A full new run of 7 must still survive after recovery.
  for (let i = 1; i <= 7; i++) {
    assert.equal(LoopHealth.fault(new Error(`again${i}`)), true, `post-clean fault ${i}`);
  }
  assert.equal(LoopHealth.state().stopped, false);
  assert.equal(LoopHealth.fault(new Error("again8")), false);
  assert.equal(LoopHealth.state().stopped, true);
});

test("TOTAL_CAP: alternating clean/fault still stops at 240 total faults", () => {
  // A run counter that any clean frame resets can never stop a fault that
  // alternates clean/throw — TOTAL_CAP is that absolute ceiling.
  const { LoopHealth } = load();
  for (let i = 1; i <= 239; i++) {
    assert.equal(LoopHealth.fault(new Error(`t${i}`)), true, `total fault ${i} must survive`);
    LoopHealth.clean(); // pay the run back every time so RUN_CAP never fires
  }
  assert.equal(LoopHealth.state().faults, 239);
  assert.equal(LoopHealth.state().run, 0);
  assert.equal(LoopHealth.state().stopped, false);
  assert.equal(LoopHealth.fault(new Error("t240")), false, "240th total fault hits TOTAL_CAP");
  assert.equal(LoopHealth.state().faults, 240);
  assert.equal(LoopHealth.state().stopped, true);
});

test("stale-fault expiry: a quiet stretch longer than QUIET_RESET_MS forgets the tally", () => {
  const { LoopHealth, clock } = load({ t: 1000 });
  for (let i = 0; i < 10; i++) {
    assert.equal(LoopHealth.fault(new Error("heal")), true);
    LoopHealth.clean(); // immediate clean — lastCleanAt ≈ lastFaultAt, total stays
  }
  assert.equal(LoopHealth.state().faults, 10, "immediate cleans do not expire the tally");

  clock.t = 1000 + 4000 + 1; // > QUIET_RESET_MS after the last fault
  LoopHealth.clean();
  assert.equal(LoopHealth.state().faults, 0, "quiet stretch resets total so a long PWA session cannot accumulate to TOTAL_CAP");
  assert.equal(LoopHealth.state().stopped, false);

  // After expiry, a fresh TOTAL_CAP budget is available again.
  for (let i = 1; i <= 5; i++) {
    assert.equal(LoopHealth.fault(new Error(`post${i}`)), true);
    LoopHealth.clean();
  }
  assert.equal(LoopHealth.state().faults, 5);
});

test("a stopped loop does not expire its tally on a later quiet clean", () => {
  const { LoopHealth, clock } = load({ t: 0 });
  for (let i = 0; i < 8; i++) LoopHealth.fault(new Error("fatal"));
  assert.equal(LoopHealth.state().stopped, true);
  const faultsAtStop = LoopHealth.state().faults;
  clock.t = 10_000;
  LoopHealth.clean();
  assert.equal(LoopHealth.state().faults, faultsAtStop, "stopped stays stopped; quiet reset is gated on !stopped");
  assert.equal(LoopHealth.state().stopped, true);
});
