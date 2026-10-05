// Loading circuit after circuit must not keep the old ones in memory.
//
// The bug this pins (#773, docs/notes/TRACK-SWITCH-LEAKS-2026-10-02.md): on the
// default TLX backend every picker pick kept the previous circuit's chunk
// geometry resident — three's RenderObject leaves its cache only when its
// object dispatches "dispose", and TLX dropped pooled wrappers without it.
// Measured ~17 MB of JS heap per pick (monza→monaco→spa ×3: 100 → 151 → 203 MB
// on monza), the kind of growth that ends in an iOS jetsam kill.
//
// Three assertions, in order of strength:
//   1. EXACT: after a forced GC exactly one built track is reachable (a WeakRef
//      to every Tracks.build / buildPaced result, tools/lib/mem-census.mjs).
//      More than one is the "track pinned" class of leak, with no noise at all.
//   2. EXACT: no node-builder state sits in three's nodeBuilderCache at
//      usedTimes 0. Nodes.delete drops an entry the moment its count reaches 0,
//      so a zero entry is one three tried to delete under a different key and
//      kept forever — the 2026-10-04 leak (tlx.js getForRenderCacheKey keyed on
//      the CURRENT attachment state; +14 MB a round, 65 orphans after 3 rounds).
//      Measured: the unfixed tree has 2 orphans at the first monaco reading,
//      the fixed tree 0 at every reading.
//   3. BOUNDED: the heap at the third visit to a circuit is within GROWTH_MB of
//      the second visit. The first visit is warm-up (lazy chunked copies,
//      program caches) and is excluded. The #773 leak grew ~34 MB over the two
//      picks between those readings.
//
// TLX on purpose: the shared fixtures pin GLX (cheaper under SwiftShader), but
// the leak lived in TLX and TLX is what players run.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { censusInitScript, censusAfterGc, pickTrack, settle, waitFrames, waitUntilDrawn } from "../../tools/lib/mem-census.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

// Three CLI runs of the fixed tree (tools/gfx/mem-census.mjs, picker path, TLX,
// SwiftShader, 960×540) grew 0.4–1.0 MB per round once warm; the #773 tree
// grew ~17 MB a pick and the 2026-10-04 tree 14–26 MB a round. 10 MB sits far
// outside the noise and inside both leaks.
const GROWTH_MB = 10;
// The picker shows a still and draws the world only in warm frames, and how
// much of it draws depends on the sheet's layout: at the suite's 1280×720 the
// monza prop batches never drew, so the leak path (their shadow casters) was
// never exercised and the gate passed with the fix reverted. 960×540 is the
// viewport tools/gfx/mem-census.mjs measures at, where it reproduces.
test.use({ viewport: { width: 960, height: 540 } });
// Anti-vacuity: a reading taken before the world drew (or with the world
// hidden) cannot see a render-object leak. Every reading must have drawn at
// least this many render objects. Measured 54–312 on monza/monaco here: a
// revisit draws less than the first visit (monza 109–145, then 54 every run),
// so this floor only rules out an undrawn world; assertion 2 is the leak's.
// 2026-10-05: the deploy tip's gfx group (llvmpipe, 4 shards, run
// 37273020922) drew 39 on monza's second visit, twice (retry too), with the
// world built and lit (apex-state carried the full lightState) — 40 was the
// SwiftShader revisit's number with no margin under it, and a floor that
// trips on a drawn world is not the undrawn-world guard it claims to be. An
// undrawn world reads 0; 20 keeps the guard and the measured margin.
// Selected-specs job 111655042275 (run 37274796306) then failed visit 1 to
// monza at Received 10 with the same "world built and lit" dump — that was
// the census racing menuFinish (car assets, then hidden warm frames), not a
// drawn world of 10; a wait on the render-object count read 10 again (run
// 37330132243: the previous scene's objects satisfy it before the new world
// draws). waitUntilDrawn now waits for the "menu warm drawn <id>" record the
// render loop logs on the last hidden warm frame; the floor stays as the
// anti-vacuity check behind it — do not lower it.
const MIN_RENDER_OBJECTS = 20;
const SETTLE_MS = 6000;
const CIRCUITS = ["monza", "monaco"];

test("loading circuits one after another keeps one world in memory and does not grow", async ({ page }) => {
  // Six picker builds on software GL: 92-123 s measured, past the 120 s
  // default. The build wait itself is bounded by pickTrack's timeout.
  test.setTimeout(360000);
  await page.addInitScript(() => {
    try { localStorage.setItem("apex26.gfxBackend", "three"); } catch (_) {}
  });
  await page.addInitScript(censusInitScript);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.enable");
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null && typeof Tracks !== "undefined", null, { polling: 100, timeout: BOOT_MS });
  const backend = await page.evaluate(() => (typeof GLX !== "undefined" ? GLX.backend : null));
  expect(backend, "this spec measures the shipped TLX backend").toBe("three");

  const heap = {}, readings = [];
  for (let visit = 1; visit <= 3; visit++) {
    for (const id of CIRCUITS) {
      await pickTrack(page, id);
      await waitUntilDrawn(page, id);
      await waitFrames(page, 15);
      await settle(page, SETTLE_MS);
      const c = await censusAfterGc(page, cdp);
      expect(c.aliveTracks, `visit ${visit} to ${id}: built tracks still reachable after GC`).toEqual([id]);
      expect(c.three && c.three.renderObjects, `visit ${visit} to ${id}: the world must have drawn for this reading to mean anything`)
        .toBeGreaterThanOrEqual(MIN_RENDER_OBJECTS);
      (heap[id] = heap[id] || [])[visit] = c.heapMB;
      const nbc = await page.evaluate(() => { const n = window.renderer && window.renderer._nodes; let zero = 0; if (n) for (const st of n.nodeBuilderCache.values()) if (st.usedTimes <= 0) zero++; return n ? { size: n.nodeBuilderCache.size, zero } : null; });
      readings.push({ visit, id, heapMB: c.heapMB, renderObjects: c.three && c.three.renderObjects, nodeBuilderCache: nbc });
      mkdirSync("artifacts/logs", { recursive: true });
      writeFileSync("artifacts/logs/track-switch-memory.json", JSON.stringify(readings, null, 1));
      expect(nbc, "three r186 keeps renderer._nodes.nodeBuilderCache; a three upgrade that moves it must move this read").not.toBeNull();
      expect(nbc.zero, `visit ${visit} to ${id}: node-builder states orphaned at usedTimes 0 (of ${nbc.size})`).toBe(0);
    }
  }
  for (const id of CIRCUITS) {
    const grew = heap[id][3] - heap[id][2];
    expect(grew, `${id}: heap ${heap[id].slice(1).join(" → ")} MB across three visits`).toBeLessThanOrEqual(GROWTH_MB);
  }
});
