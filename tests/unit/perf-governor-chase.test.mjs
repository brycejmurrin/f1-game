/* perf-governor-chase.test.mjs — the desktop refresh chase (docs/GOVERNOR-RATIONALE.md §gov-43, #6417).
 *
 * Bryce's 16-inch MacBook (120 Hz ProMotion) raced Monza at 45 fps with RESOLUTION at full scale and a solid
 * 120 fps at 0.67: the race was fill-bound, and the governor's budget is "60 fps or this device's own floor", so a
 * 120 Hz panel showing every third vsync never read as a miss. On a desktop at RESOLUTION AUTO the resolution stage
 * now also chases the display's own refresh, down to one buffer pixel per CSS pixel, and gives the chase up for the
 * race when that floor cannot reach it. Phones, pinned RESOLUTIONs and the 60 FPS race target are untouched.
 *
 * The real governor.js and render-rate.js, driven the way js/game.js tickBody() drives them: menu frames feed
 * RenderRate (racing false) first, then the race feeds PerfGov.tick(ms, drew) and RenderRate.observe/gate.
 * Run: node --test tests/unit/perf-governor-chase.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seedLogGlobal } from "../helpers/seed-log.mjs";
import { seedStoreGlobal } from "../helpers/seed-store.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
seedLogGlobal();
seedStoreGlobal();
const SRC = fs.readFileSync(path.join(ROOT, "js/perf/governor.js"), "utf8");
const RR_SRC = fs.readFileSync(path.join(ROOT, "js/perf/render-rate.js"), "utf8");
const SCALE_EPS = 0.02;   // GLX/TLX setRenderScale's dead zone, as perf-governor.test.mjs pins it

// A frame costing `cost(s)` ms presents at the next multiple of the display's vsync.
const vsync = (hz, cost) => (s) => Math.max(1, Math.ceil(cost(s) / (1000 / hz) - 1e-9)) * (1000 / hz);

function run({ hz = 120, cost, frames = 7200, mobile = false, dpr = 2, css = 1000, target = "display", menuFrames = 600, auto = true, noChase = false }) {
  const mem = { "apex26.desktopFpsTarget": target };
  globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
  globalThis.window = { __APEX_BUILD: 1, innerWidth: css };
  const PerfGov = eval(SRC + ";PerfGov");
  const RR = eval(RR_SRC + ";RenderRate");
  // noChase: RenderRate without displayMs, the governor as it was before §gov-43 (chase target 0 on every path).
  const RenderRate = noChase ? { ...RR, displayMs: undefined } : RR;
  RenderRate.init({ isMobile: mobile });
  let scale = 1, moves = 0, minScale = 1;
  PerfGov.init({ isMobile: mobile, getRenderScale: () => scale, getPresentSize: () => ({ width: Math.round(css * dpr), height: 600 }),
    setRenderScale: (s) => { s = Math.max(0.5, Math.min(1, s)); if (Math.abs(s - scale) < SCALE_EPS) return false; scale = s; moves++; return true; } });
  if (!auto) PerfGov.setAutoRes(false);
  const menu = 1000 / hz;   // the title draws at the display's refresh
  for (let i = 0; i < menuFrames; i++) { RenderRate.observe(menu); RenderRate.gate(menu / 1000, menu, false, false); }
  PerfGov.sentinelArm(true);
  const chaseAtStart = PerfGov.chaseMs ? PerfGov.chaseMs() : 0;
  const tail = [];
  const raf = vsync(hz, cost);
  for (let i = 0; i < frames; i++) {
    const ms = raf(scale);
    PerfGov.tick(ms, RenderRate.drew());
    RenderRate.observe(ms);
    RenderRate.gate(ms / 1000, ms, false, true);
    if (i >= frames - 1200) tail.push(ms);
    minScale = Math.min(minScale, scale);
  }
  const fast = tail.filter((ms) => ms < 1000 / hz + 0.01).length / tail.length;
  return { PerfGov, RenderRate, scale, moves, minScale, tier: PerfGov.tier(), futile: PerfGov.chaseFutile ? PerfGov.chaseFutile() : false, chaseAtStart, fast,
    displayMs: RR.displayMs() };
}

// Fill-bound like the Mac at 100% zoom: 23 ms at full scale (every third vsync at 120 Hz), under 8.3 ms near 0.55.
const macFill = (s) => 1 + 22 * s * s;

test("RenderRate.displayMs(): the menus' cadence, not the race's, and init() forgets it", () => {
  const { RenderRate, displayMs } = run({ cost: macFill, frames: 600 });
  assert.ok(Math.abs(displayMs - 1000 / 120) < 0.05, `menus at 120 Hz read ~8.33 ms, got ${displayMs}`);
  RenderRate.init({ isMobile: false });
  assert.equal(RenderRate.displayMs(), 16.7, "a fresh init knows nothing faster than 60 Hz");
});

test("a fill-bound desktop on a 120 Hz panel reaches the refresh at RESOLUTION AUTO (Mac Monza shape)", () => {
  const r = run({ cost: macFill });
  assert.ok(Math.abs(r.chaseAtStart - 1000 / 120) < 0.05, `the race chases the 120 Hz vsync (${r.chaseAtStart})`);
  assert.equal(r.futile, false, "the refresh is reachable here");
  assert.ok(r.fast > 0.9, `the last 20 s present at 120 Hz (${(r.fast * 100).toFixed(0)} % of frames)`);
  assert.ok(r.scale >= 0.5 && r.scale < 0.7, `the chase settles under the scale that misses (${r.scale})`);
  assert.equal(r.tier, 0, "the chase never sheds a feature");
  // Before §gov-43 this one shape got there too, by luck of the quantum probe (§gov-27): its cut to 0.5 drew frames
  // under 8.3 ms and the derived floor followed them down. The probe only fires on a miss of the 60 fps budget.
  assert.ok(run({ cost: macFill, noChase: true }).fast > 0.9);
});

test("full resolution inside the 60 fps band: AUTO used to stay at 60 for good, the chase reaches 120", () => {
  for (const [ms, cost] of [[12, (s) => 1 + 11 * s * s], [17, (s) => 1 + 16 * s * s]]) {
    const before = run({ cost, noChase: true }), now = run({ cost });
    assert.ok(before.fast < 0.1, `${ms} ms at scale 1: the old governor holds 60 fps (${before.fast}, scale ${before.scale})`);
    assert.ok(now.fast > 0.9, `${ms} ms at scale 1: the chase presents at 120 Hz (${now.fast}, scale ${now.scale})`);
    assert.equal(now.tier, 0);
  }
});

// Frame for frame what the governor did before §gov-43: same scale, moves and tier.
const same = (opts) => {
  const now = run(opts), before = run({ ...opts, noChase: true });
  assert.deepEqual([now.scale, now.moves, now.minScale, now.tier], [before.scale, before.moves, before.minScale, before.tier], JSON.stringify(opts.label));
  return now;
};

test("the 60 FPS race target, a 60 Hz panel, a phone and a pinned RESOLUTION govern exactly as before", () => {
  for (const opts of [{ label: "target 60", cost: macFill, target: "60" }, { label: "60 Hz panel", cost: macFill, hz: 60 },
    { label: "phone", cost: macFill, mobile: true }, { label: "pinned", cost: macFill, auto: false }]) {
    assert.equal(same(opts).chaseAtStart, 0, `${opts.label}: nothing to chase`);
  }
});

test("a CPU-bound desktop (scale buys nothing) gives the chase up and keeps full resolution", () => {
  const r = run({ cost: (s) => 10 + 1.5 * s * s, hz: 144 });
  assert.ok(r.chaseAtStart > 0, "a 144 Hz panel is a chase target");
  assert.equal(r.futile, true, "a cut that crossed no vsync quantum ends the chase for the race");
  assert.equal(r.scale, 1, "and the picture comes back to full scale");
  assert.equal(r.tier, 0);
});

test("when even the chase floor misses the display, the race climbs back to the sharpest 60 fps scale", () => {
  for (const cost of [(s) => 3 + 30 * s * s, (s) => 1 + 14 * s * s]) {   // 10.5 / 4.5 ms floors: 60 fps at best on 120 Hz... or not
    const r = run({ cost }), before = run({ cost, noChase: true });
    if (r.futile) assert.ok(r.scale >= before.scale - 0.11, `back near the pre-chase scale (${r.scale} vs ${before.scale})`);
    else assert.ok(r.fast > 0.9, `reachable: holds 120 (${r.fast})`);
    assert.equal(r.tier, 0);
  }
  const out = run({ cost: (s) => 3 + 30 * s * s });
  assert.equal(out.futile, true, "the floor was measured and the refresh is out of reach");
  assert.ok(out.scale >= 0.6, `the race does not sit at the chase floor for nothing (${out.scale})`);
});

test("the chase never draws fewer buffer pixels than CSS pixels: a 1x display is never cut for it", () => {
  const fill12 = (s) => 11 * s * s + 1;   // 12 ms at full scale: 60 fps on a 120 Hz panel, 120 at 0.8
  const r = run({ cost: fill12, dpr: 1 });
  assert.equal(r.moves, 0, `no cut below one pixel per CSS pixel (${JSON.stringify({ scale: r.scale, moves: r.moves })})`);
  assert.equal(r.scale, 1);
  const hi = run({ cost: fill12, dpr: 1.25 });
  assert.ok(hi.minScale >= 0.8 - 1e-9, `a 1.25x panel stops at 0.8 (${hi.minScale})`);
  assert.ok(hi.fast > 0.9, `and reaches 120 there (${hi.fast})`);
});

test("a pinned RESOLUTION never moves the scale (HIGH / MAX / LOW / MED mean the scale they say)", () => {
  assert.equal(run({ cost: macFill, auto: false, frames: 1200 }).moves, 0);
});
