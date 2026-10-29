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
import { absSrc } from "../helpers/abs-src.mjs";

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
  vm.runInContext(SRC.replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/perf/loop-health.js") });
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

// ── #3510 stall watchdog ────────────────────────────────────────────────────
/** LoopHealth with the browser surfaces the watchdog acts through. */
function loadStall(opts = {}) {
  const {
    webdriver = false, search = "", reloadsSpent = null, ua = "Mozilla/5.0",
    softwareGL = false, swRaceShed = true, handoffCover = false, introBudgetLeft = 0,
    loadingPhase = "", envProbeOff = false, perChunkOff = false,
  } = opts;
  const clock = { t: 0 }, calls = { tier: [], reload: 0 }, ls = new Map(), ss = new Map();
  if (reloadsSpent != null) ss.set("apex26.stallReloads", String(reloadsSpent));
  if (envProbeOff) ls.set("apex26.envProbeOff", "1");
  if (perChunkOff) ls.set("apex26.perChunkOff", "1");
  const store = (m) => ({ getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) });
  const listeners = {};
  const cover = { hidden: true };
  const carsetup = { hidden: true };
  const doc = {
    visibilityState: "visible",
    addEventListener: (n, f) => { listeners[n] = f; },
    getElementById: (id) => (id === "loading" ? cover : id === "carsetup" ? carsetup : null),
  };
  const ctx = {
    performance: { now: () => clock.t }, Date: { now: () => clock.t }, Math, console,
    navigator: { webdriver, userAgent: ua }, document: doc, location: { search, reload: () => { calls.reload++; } },
    localStorage: store(ls), sessionStorage: store(ss),
    PerfGov: { setUserTier: (n) => calls.tier.push(n), softwareRaster: () => softwareGL },
    PostCommon: { softwareRaceShed: (gl, nav, knob) => gl && !(knob === "0") && (knob === "1" || (nav && !nav.webdriver && !/apex-game-vm/.test(nav.userAgent || ""))) },
    G: { state: "menu" },
    RaceEntryProfile: {
      stallHandoffCover: () => opts.handoffCover === true,
      introBudgetLeft: () => introBudgetLeft,
    },
    loadingScreen: { phase: () => loadingPhase },
  };
  if (swRaceShed === false) ctx.PostCommon.softwareRaceShed = () => false;
  vm.createContext(ctx);
  seedLog(ctx);
  vm.runInContext(SRC.replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/perf/loop-health.js") });
  const frames = (n, ms) => { for (let i = 0; i < n; i++) { clock.t += ms; ctx.LoopHealth.clean(); } };
  const hide = (hidden) => { doc.visibilityState = hidden ? "hidden" : "visible"; listeners.visibilitychange && listeners.visibilitychange(); };
  return { LoopHealth: ctx.LoopHealth, frames, hide, calls, ls, ss, cover, carsetup, ctx };
}

test("stall: a glacial loop sheds at SHED_RUN, then reloads once to the menu notice", () => {
  const h = loadStall();
  h.frames(1, 16);
  h.frames(3, 2500);
  assert.deepEqual(h.calls.tier, [], "three slow frames: a build hitch, not a stall");
  h.frames(1, 2500);
  assert.deepEqual(h.calls.tier, [4], "fourth consecutive >1 s frame sheds to the lowest rung");
  assert.equal(h.ls.get("apex26.envProbeOff"), undefined, "the shed is session-only: nothing persists yet");
  assert.equal(h.LoopHealth.state().stall.act, "shed");
  h.frames(5, 2500);
  assert.equal(h.calls.reload, 0);
  h.frames(1, 2500);
  assert.equal(h.calls.reload, 1, "still glacial at RELOAD_RUN: reload");
  assert.equal(h.ss.get("apex26.stallReloads"), "1");
  assert.equal(h.ss.get("apex26.ctxLostNotice"), "1", "the menu explains the reset");
  assert.equal(h.ls.get("apex26.envProbeOff"), "1", "the reload latches the lighter renderer for the next boot");
  assert.equal(h.ls.get("apex26.perChunkOff"), "1");
  h.frames(20, 2500);
  assert.equal(h.calls.reload, 1, "one reload per run");
});

test("stall: with the reload budget spent it only records", () => {
  const h = loadStall({ reloadsSpent: 1 });
  h.frames(12, 3000);
  assert.equal(h.calls.reload, 0);
  assert.equal(h.LoopHealth.state().stall.act, "budget");
  assert.equal(h.LoopHealth.state().stall.slowFrames, 11, "the first frame has no gap to judge");
});

test("stall: healthy, hitchy, hidden and suspended loops never act", () => {
  const h = loadStall();
  h.frames(600, 16);
  for (let i = 0; i < 20; i++) { h.frames(3, 1500); h.frames(1, 16); }   // repeated 3-frame hitches
  h.hide(true); h.frames(10, 5000); h.hide(false);                        // hidden tab
  h.frames(1, 16); h.frames(3, 1200);
  h.frames(1, 120000); h.frames(1, 1200);                                  // laptop sleep breaks the run
  assert.deepEqual(h.calls.tier, []);
  assert.equal(h.calls.reload, 0);
  assert.equal(h.LoopHealth.state().stall.act, "");
});

test("stall: off under automation unless ?stallwatch=1 forces it", () => {
  const off = loadStall({ webdriver: true });
  off.frames(20, 3000);
  assert.deepEqual(off.calls.tier, []);
  assert.equal(off.LoopHealth.state().stall.watching, false);
  const on = loadStall({ webdriver: true, search: "?stallwatch=1" });
  on.frames(5, 3000);
  assert.deepEqual(on.calls.tier, [4]);
});

test("stall: under the loading cover the shed waits and the reload needs a 30-frame run", () => {
  const h = loadStall();
  h.cover.hidden = false;
  h.frames(1, 16);
  h.frames(12, 1500);   // a slow but working race entry
  assert.deepEqual(h.calls.tier, [], "no shed while the cover is up");
  assert.equal(h.calls.reload, 0);
  assert.equal(h.ls.get("apex26.envProbeOff"), undefined, "a slow load persists nothing");
  h.frames(18, 1500);   // the cover stuck over a glacial build
  assert.equal(h.calls.reload, 1, "30 glacial frames under the cover still recover");
});

test("stall: #carsetup (garage) uses the same relaxed cover as #loading", () => {
  const h = loadStall();
  h.carsetup.hidden = false;
  h.frames(1, 16);
  h.frames(12, 1500);
  assert.deepEqual(h.calls.tier, [], "no shed while the garage sheet is up");
  assert.equal(h.calls.reload, 0);
  h.frames(18, 1500);
  assert.equal(h.calls.reload, 1, "30 glacial frames during garage still recover once, not at 10");
});

test("stall: #race-settings (PREPARING…) uses the same relaxed cover as #loading", () => {
  const raceSettings = { hidden: true };
  const clock = { t: 0 };
  const calls = { tier: [], reload: 0 };
  const ls = new Map();
  const ss = new Map();
  const store = (m) => ({ getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) });
  const listeners = {};
  const cover = { hidden: true };
  const doc = {
    visibilityState: "visible",
    addEventListener: (n, f) => { listeners[n] = f; },
    getElementById: (id) => (id === "loading" ? cover : id === "carsetup" ? { hidden: true } : id === "race-settings" ? raceSettings : null),
  };
  const ctx = {
    performance: { now: () => clock.t }, Date: { now: () => clock.t }, Math, console,
    navigator: { webdriver: false, userAgent: "Mozilla/5.0" }, document: doc, location: { search: "", reload: () => { calls.reload++; } },
    localStorage: store(ls), sessionStorage: store(ss),
    PerfGov: { setUserTier: (n) => calls.tier.push(n) },
  };
  vm.createContext(ctx);
  seedLog(ctx);
  vm.runInContext(SRC.replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/perf/loop-health.js") });
  const frames = (n, ms) => { for (let i = 0; i < n; i++) { clock.t += ms; ctx.LoopHealth.clean(); } };
  raceSettings.hidden = false;
  frames(1, 16);
  frames(12, 1500);
  assert.deepEqual(calls.tier, [], "no shed while race settings shows PREPARING");
  assert.equal(calls.reload, 0, "reload needs 30 frames under cover, not 10");
  frames(18, 1500);
  assert.equal(calls.reload, 1, "30 glacial frames during race-settings prep still recover once");
});

test("stall: off in the node game VM (webdriver false, apex-game-vm UA)", () => {
  const h = loadStall({ ua: "Mozilla/5.0 Chrome/128.0 Safari/537.36 apex-game-vm" });
  h.frames(20, 3000);
  assert.deepEqual(h.calls.tier, []);
  assert.equal(h.LoopHealth.state().stall.watching, false);
});

test("stall: software raster skips reload with act budget-sw (race path)", () => {
  const h = loadStall({ softwareGL: true });
  h.frames(1, 16);
  h.frames(4, 2500);
  h.frames(6, 2500);
  assert.equal(h.calls.reload, 0);
  assert.equal(h.LoopHealth.state().stall.act, "budget-sw");
  assert.equal(h.ss.get("apex26.stallReloads"), undefined);
});

test("stall: menu path on software raster skips reload without swRaceShed knob", () => {
  const h = loadStall({ softwareGL: true, swRaceShed: false });
  assert.equal(h.ctx.G.state, "menu");
  h.frames(1, 16);
  h.frames(10, 2500);
  assert.equal(h.calls.reload, 0, "garage-close class: no cover, ten slow frames, no reload");
  assert.equal(h.LoopHealth.state().stall.act, "budget-sw");
  assert.equal(h.ss.get("apex26.ctxLostNotice"), undefined, "no ctx-lost notice latch without reload");
});

test("stall: hardware path still reloads once after the shed", () => {
  const h = loadStall({ softwareGL: false });
  h.frames(1, 16);
  h.frames(10, 2500);
  assert.equal(h.calls.reload, 1);
  assert.equal(h.LoopHealth.state().stall.act, "reload");
});

test("stall: count state uses the relaxed 30-frame reload budget", () => {
  const h = loadStall({ handoffCover: true });
  h.frames(1, 16);
  h.frames(29, 2500);
  assert.equal(h.calls.reload, 0, "twenty-nine glacial frames during countdown are not enough");
  h.frames(1, 2500);
  assert.equal(h.calls.reload, 1, "thirty glacial frames under handoff cover still recover once");
});

test("stall: lighter renderer already latched skips a second reload", () => {
  const h = loadStall({ envProbeOff: true, perChunkOff: true });
  h.frames(11, 2500);
  assert.equal(h.calls.reload, 0);
  assert.equal(h.LoopHealth.state().stall.act, "budget");
});
