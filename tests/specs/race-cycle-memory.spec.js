// Racing circuit after circuit must not keep the finished ones in memory.
//
// The bug this pins (LIVE-MEMORY-H12-2026-10-20, #3241 / #3377): every finished race stayed
// reachable for the session. Collide's traffic buckets kept stale car references, and step scratch,
// the collide instance, pit-lane's zone cache, mirror-pass, crowd and the HUD kept one more; every
// car reaches its track through car._lk.track. On the phone profile (844×390, touch) the post-GC heap
// at the menu grew 45.5 → 57.7 → 69.8 MB over three monza + spa cycles; a 2–4 year old iPhone has
// ~300 MB to give a WebGL page (docs/notes/MEMORY-TOOLING-RESEARCH-2026-10-21.md).
//
// The picker twin (track-switch-memory.spec.js) never races, so it could not see any of this.
// This spec RACES: race(A) → drive → flag → results → MENU → GARAGE → BACK → race(B) → ..., and asks after a
// forced GC how many built tracks are still reachable (a WeakRef to every Tracks.build /
// buildPaced result, tools/lib/mem-census.mjs). Identity counts, not MB: no noise.
//   1. EXACT, at the MENU after a race: at most one built track (the menu may keep the last
//      circuit as its backdrop; never two).
//   2. EXACT, once the next circuit is built: exactly that one.
//   3. GROWTH (W24c #1 / W25c; H17 ACK): after WARM_CYCLES (≥5) of TLX cache fill, assert
//      menu heapMB for cycle (WARM+1) − cycle WARM ≤ HEAP_SLOPE_HARD_MB (always) and
//      ≤ HEAP_SLOPE_SOFT_MB when APEX_PERF_MEMORY_STRICT=1 (else soft annotation). The full
//      per-cycle series is written to artifacts/logs/race-cycle-memory.json so a flaky warm
//      climb is visible. Catches the ~12 MB/cycle phone leak without gating mid-warm-up.
//   4. audioMB (W24c #2): logged every reading; post-warm menu audioMB growth soft-gated
//      (STRICT fails) so decoded PCM retention is visible even though usedJSHeapSize hides it.
//   (TLX's three.js renderer.info counts are logged, not asserted: they warm for ~five cycles —
//   LIVE-MEMORY-H12 / H17 note — which is why the heap slope uses the post-warm pair only.)
//
// Measured: on the leaking tree (2eda36c6, before #3241) assertion 2 fails at the first switch (cycle 1, spa
// built: monza still reachable); on #3241 and on the tip it passes. #3377's one-generation holders are
// overwritten before these readings, so tests/unit/race-retain-vm.test.mjs (built, not yet stepped) pins them.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { censusInitScript, censusAfterGc, waitFrames } from "../../tools/lib/mem-census.mjs";
import {
  HEAP_SLOPE_HARD_MB, HEAP_SLOPE_SOFT_MB, AUDIO_SLOPE_SOFT_MB, WARM_CYCLES, STRICT, postWarmSlope, cycleCensusIssues,
} from "../helpers/race-cycle-memory.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });

const CIRCUITS = ["monza", "spa"];
/** Warm-up climb (~5) + one post-warm cycle for the slope pair (H17). */
const CYCLES = WARM_CYCLES + 1;
const DRIVE_STEPS = 600;   // 10 s of race: every car through the traffic buckets, the pit model and collisions

async function raceAndDrive(page, id) {
  await page.evaluate((tid) => { window.__apex.race(tid); }, id);
  await page.waitForFunction((tid) => { try { const i = window.__apex.info(); return i.track === tid && (i.state === "race" || i.state === "count"); } catch (_) { return false; } },
    id, { polling: 200, timeout: 240000 });
  await page.evaluate((n) => {
    const A = window.__apex;
    A.go(); A.headless(true); A.setInput({ throttle: true, steer: 0.02 });
    A.step(1 / 60, n);
    A.clearInput(); A.headless(false);
  }, DRIVE_STEPS);
}

// A RESULT SCREEN MUST NOT PIN ITS RACE. Its share chips (js/ui/results-sheet.js, js/share/share-card-chips.js)
// once closed over the cars and G.track, so the finished circuit was still reachable when the next was built
// (Pages runs 4282/4284, 2026-10-28). Naming the files here maps them to this spec in the impact map.

// THE MENU MUST BE QUIET BEFORE ITS HEAP COUNTS. The census forces GC, but live work in flight survives it:
// the title warm's race prep (js/perf/title-warm.js starts it after 1.2 s of title quiet), the menu program warm
// and the garage prebuild. One post-warm pair read mid-prep swung ±35 MiB on unchanged heads (A·W56, 2026-10-26).
// Wait until none runs for QUIET_MS (> the title warm's start delay), then read.
const QUIET_MS = 3000;
async function menuQuiet(page) {
  const t0 = Date.now();
  const hooks = await page.evaluate(() => { window.__rcmQuiet = null; const A = window.__apex;
    return { menuPrep: typeof A.menuPrep === "function" && !!A.menuPrep(), garagePrebuild: typeof A.garagePrebuild === "function" }; });
  expect(hooks, "menuQuiet needs __apex.menuPrep() (a snapshot) and __apex.garagePrebuild()").toEqual({ menuPrep: true, garagePrebuild: true });
  await page.waitForFunction((quietMs) => {
    const A = window.__apex, p = A.menuPrep(), g = A.garagePrebuild();
    const busy = p.building || p.warming || p.warmFrames > 0 || !!(g && g.running);
    const now = performance.now(), q = window.__rcmQuiet || (window.__rcmQuiet = { since: now });
    if (busy) q.since = now;
    return !busy && now - q.since >= quietMs;
  }, QUIET_MS, { polling: 250, timeout: 120000 });
  return Date.now() - t0;
}

async function flagToMenu(page) {
  await page.evaluate(() => window.__apex.finishRace());
  await page.waitForFunction(() => window.__apex.info().state === "results", null, { polling: 200, timeout: 60000 });
  // The player's own way out: RESULTS → MENU (quitToMenu).
  await page.evaluate(() => document.getElementById("res-menu").click());
  await page.waitForFunction(() => window.__apex.info().state === "menu", null, { polling: 200, timeout: 60000 });
  await waitFrames(page, 10);
}

test("racing circuit after circuit keeps at most one world in memory", async ({ page }) => {
  // Twelve race builds (6 cycles × monza+spa) on software GL plus forced GCs — long enough
  // for TLX caches to flatten before the heap/audioMB slope gate (H17).
  test.setTimeout(1200000);
  await page.addInitScript(() => {
    try { localStorage.setItem("apex26.gfxBackend", "three"); } catch (_) {}
    try { localStorage.setItem("apex26.gfxBootStepMs", "45000"); } catch (_) {}   // as track-switch-memory: TLX init can exceed 8 s on a busy runner
  });
  await page.addInitScript(censusInitScript);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.enable");
  await page.goto("/?three-devtools=1");   // TLX exposes window.renderer only behind this flag
  await page.waitForFunction(() => window.__apex != null && typeof Tracks !== "undefined", null, { polling: 100, timeout: BOOT_MS });

  const readings = [];
  /** @type {Map<number, { heapMB: number|null, audioMB: number|null }>} */
  const menuByCycle = new Map();
  const log = (row) => { readings.push(row); mkdirSync("artifacts/logs", { recursive: true }); writeFileSync("artifacts/logs/race-cycle-memory.json", JSON.stringify(readings, null, 1)); };
  for (let cycle = 1; cycle <= CYCLES; cycle++) {
    for (const id of CIRCUITS) {
      await raceAndDrive(page, id);
      const built = await censusAfterGc(page, cdp);
      log({ cycle, id, at: "race", ...built });
      expect(cycleCensusIssues(built), "race census must observe the requested renderer and usable counters").toEqual([]);
      expect(built.instrumentation.tracksReady, "the census must see Tracks.build").toBe(true);
      expect(built.aliveTracks, `cycle ${cycle}, ${id} built: built tracks still reachable after GC`).toEqual([id]);

      await flagToMenu(page);
      const quietMs = id === CIRCUITS[CIRCUITS.length - 1] ? await menuQuiet(page) : null;
      const menu = await censusAfterGc(page, cdp);
      log({ cycle, id, at: "menu", quietMs, ...menu });
      expect(cycleCensusIssues(menu), "menu census must observe the requested renderer and usable counters").toEqual([]);
      expect(menu.aliveTracks.length, `cycle ${cycle}, menu after ${id}: ${menu.aliveTracks.join(", ")} still reachable after GC`).toBeLessThanOrEqual(1);
      // Final menu of the cycle (last circuit) feeds the post-warm slope series.
      if (id === CIRCUITS[CIRCUITS.length - 1]) {
        menuByCycle.set(cycle, { heapMB: menu.heapMB, audioMB: menu.audioMB });
      }
      // ...and a garage visit from the title between races, as a player does (GARAGE → BACK).
      if (id === CIRCUITS[0]) {
        await page.evaluate(() => document.getElementById("mb-garage").click());
        await page.waitForFunction(() => { const s = document.getElementById("carsetup"); return s && !s.hidden; }, null, { polling: 200, timeout: 120000 });
        await waitFrames(page, 10);
        await page.evaluate(() => document.getElementById("cs-back").click());
        await page.waitForFunction(() => { const s = document.getElementById("carsetup"); return s && s.hidden; }, null, { polling: 200, timeout: 60000 });
      }
    }
  }
  // TLX's renderer.info counts (geometries / textures) are LOGGED, not asserted: measured over seven cycles they
  // climb for ~five (menu after spa: geometries 26 → 117 → 168 → 232 → 278 → 281 → 253, textures 40 → 57) and
  // then flatten — capped caches filling, so a cycle-on-cycle bound fails at three cycles and passes at seven.
  // Heap / audioMB slope below uses the post-warm pair only (cycle WARM+1 − WARM).

  const slope = postWarmSlope(menuByCycle, CYCLES);
  expect(slope.ok, slope.reason || "post-warm menu readings").toBe(true);
  log({ at: "slope", ...slope, STRICT, WARM_CYCLES, HEAP_SLOPE_HARD_MB, HEAP_SLOPE_SOFT_MB, AUDIO_SLOPE_SOFT_MB });
  // Always publish the measured series (warm climb + post-warm pair) for CI artifacts / flake triage.
  test.info().annotations.push({
    type: "race-cycle-memory-series",
    description: JSON.stringify(slope.series),
  });
  if (slope.heapDelta != null) {
    expect(
      slope.heapDelta,
      `post-warm menu heap cycle${slope.later}−cycle${slope.earlier}=${slope.heapDelta} MiB after ${WARM_CYCLES} warm cycles (hard ≤${HEAP_SLOPE_HARD_MB}; H12 leak was ~12 MiB/cycle; series=${JSON.stringify(slope.series)})`,
    ).toBeLessThanOrEqual(HEAP_SLOPE_HARD_MB);
  }
  const softMsgs = [];
  if (slope.heapSoftFail) {
    softMsgs.push(`heap slope ${slope.heapDelta} MiB > soft ${HEAP_SLOPE_SOFT_MB} (MEMORY-TOOLING nightly; post-warm after ${WARM_CYCLES})`);
  }
  if (slope.audioSoftFail) {
    softMsgs.push(`audioMB slope ${slope.audioDelta} MiB > soft ${AUDIO_SLOPE_SOFT_MB}`);
  }
  if (softMsgs.length) {
    const msg = softMsgs.join("; ");
    if (STRICT) {
      expect(softMsgs, msg).toHaveLength(0);
    } else {
      test.info().annotations.push({ type: "perf-soft-warning", description: msg });
      console.log(`[race-cycle-memory soft] ${msg}`);
    }
  }
});
