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
//   (TLX's three.js renderer.info counts are logged to artifacts/logs/race-cycle-memory.json, not asserted:
//   they warm up over ~five cycles, LIVE-MEMORY-H12 note.)
//
// Measured: on the leaking tree (2eda36c6, before #3241) assertion 2 fails at the first switch (cycle 1, spa
// built: monza still reachable); on #3241 and on the tip it passes. #3377's one-generation holders are
// overwritten before these readings, so tests/unit/race-retain-vm.test.mjs (built, not yet stepped) pins them.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { censusInitScript, censusAfterGc, waitFrames } from "../../tools/lib/mem-census.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });

const CIRCUITS = ["monza", "spa"];
const CYCLES = 3;
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

async function flagToMenu(page) {
  await page.evaluate(() => window.__apex.finishRace());
  await page.waitForFunction(() => window.__apex.info().state === "results", null, { polling: 200, timeout: 60000 });
  // The player's own way out: RESULTS → MENU (quitToMenu).
  await page.evaluate(() => document.getElementById("res-menu").click());
  await page.waitForFunction(() => window.__apex.info().state === "menu", null, { polling: 200, timeout: 60000 });
  await waitFrames(page, 10);
}

test("racing circuit after circuit keeps at most one world in memory", async ({ page }) => {
  // Six race builds on software GL plus forced GCs.
  test.setTimeout(600000);
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
  const log = (row) => { readings.push(row); mkdirSync("artifacts/logs", { recursive: true }); writeFileSync("artifacts/logs/race-cycle-memory.json", JSON.stringify(readings, null, 1)); };
  for (let cycle = 1; cycle <= CYCLES; cycle++) {
    for (const id of CIRCUITS) {
      await raceAndDrive(page, id);
      const built = await censusAfterGc(page, cdp);
      log({ cycle, id, at: "race", aliveTracks: built.aliveTracks, heapMB: built.heapMB, three: built.three && { geometries: built.three.geometries, textures: built.three.textures } });
      expect(built.instrumentation.tracksReady, "the census must see Tracks.build").toBe(true);
      expect(built.aliveTracks, `cycle ${cycle}, ${id} built: built tracks still reachable after GC`).toEqual([id]);

      await flagToMenu(page);
      const menu = await censusAfterGc(page, cdp);
      log({ cycle, id, at: "menu", aliveTracks: menu.aliveTracks, heapMB: menu.heapMB, three: menu.three && { geometries: menu.three.geometries, textures: menu.three.textures } });
      expect(menu.aliveTracks.length, `cycle ${cycle}, menu after ${id}: ${menu.aliveTracks.join(", ")} still reachable after GC`).toBeLessThanOrEqual(1);
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
  // A strict bound would be a flaky gate; the identity counts above are the deterministic one.
});
