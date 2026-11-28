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
//   3. SAMPLED BUDGET: across five visits the MEDIAN of the three heap-growth
//      intervals after visit 2 must stay within GROWTH_MB. The first interval
//      is warm-up; one measured late warm-up step may land at visit 3 on Metal.
//      Median catches repeated drift even when one interval shrinks, which
//      the old minimum interval policy missed. All recorded five-visit warm-up
//      series still pass the unchanged 10 MiB bound; known sustained leaks fail.
//      Passing this finite sequence does not prove absence of leaks.
//      Measured: docs/notes/TRACK-SWITCH-METAL-2026-10-17.md.
//
// TLX on purpose: the shared fixtures pin GLX (cheaper under SwiftShader), but
// the leak lived in TLX and TLX is what players run.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { censusInitScript, censusAfterGc, pickTrack, settle, sustainedGrowthMB, waitFrames, waitUntilDrawn } from "../../tools/lib/mem-census.mjs";
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { createGzip } from "node:zlib";

// PROBE ONLY (#7464, never lands): a gzipped CDP heap snapshot per picker visit, to name who holds the
// extra copy of the world's vertex data in the HIGH state on Metal (run 46109757702).
async function heapSnapshotGz(cdp, path) {
  const gz = createGzip({ level: 6 }), out = createWriteStream(path);
  gz.pipe(out);
  const done = new Promise((resolve, reject) => { out.on("finish", resolve); out.on("error", reject); gz.on("error", reject); });
  const onChunk = (e) => { gz.write(e.chunk); };
  cdp.on("HeapProfiler.addHeapSnapshotChunk", onChunk);
  try { await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false, captureNumericValue: false }); }
  finally { cdp.off("HeapProfiler.addHeapSnapshotChunk", onChunk); gz.end(); }
  await done;
}
// PROBE ONLY: CPU arrays three's scene still holds, counted once per ArrayBuffer, split by owner kind.
function attributeCensus() {
  const seenBuf = new Set(), seenAttr = new Set(), out = { attrs: 0, nulled: 0, buffers: 0, bytes: 0, byKind: {}, big: [] };
  const note = (a, kind, name) => {
    if (!a || seenAttr.has(a)) return;
    seenAttr.add(a); out.attrs++;
    const arr = a.array || (a.data && a.data.array);
    if (!arr) { out.nulled++; return; }
    const buf = arr.buffer;
    if (!buf || seenBuf.has(buf)) return;
    seenBuf.add(buf); out.buffers++; out.bytes += buf.byteLength;
    const k = out.byKind[kind] || (out.byKind[kind] = { buffers: 0, bytes: 0 });
    k.buffers++; k.bytes += buf.byteLength;
    if (buf.byteLength >= 1048576) out.big.push([kind, name, buf.byteLength]);
  };
  const geo = (g, where) => {
    if (!g || !g.attributes) return;
    const kind = where + ":" + (g.__tlxKind || "?") + (g.__tlxKept ? "+kept" : "") + (g.__tlxFreed ? "+freed" : "");
    for (const k in g.attributes) note(g.attributes[k], kind, k);
    if (g.index) note(g.index, kind, "index");
  };
  try { if (window.scene) window.scene.traverse((o) => geo(o.geometry, "scene")); } catch (e) { out.error = String(e); }
  try {
    const r = window.renderer && window.renderer._objects && window.renderer._objects._renderObjects;
    if (r) for (const ro of r) geo(ro.geometry, "ro");
  } catch (e) { out.roError = String(e); }
  out.big.sort((a, b) => b[2] - a[2]); out.big.length = Math.min(out.big.length, 40);
  return out;
}

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
// The floor is NOT lowered when the opening flyby `wide` shot is levelled at
// the horizon (39 ROs on llvmpipe at u=0): picker warm frames sit on
// turn-first (FlybySeq.warmProgress) so the leak path still draws.
// waitUntilDrawn waits for the "menu warm drawn <id>" Log record (not the
// render-object count — that can read the previous scene; run 37330132243).
const MIN_RENDER_OBJECTS = 40;
const VISITS = 5;
const SETTLE_MS = 6000;
const CIRCUITS = ["monza", "monaco"];

test("loading circuits one after another keeps one world in memory and does not grow", async ({ page }) => {
  // Ten picker builds on software GL (six took 92-123 s, past the 120 s
  // default). The build wait itself is bounded by pickTrack's timeout.
  test.setTimeout(1500000);   // PROBE: ten heap snapshots on top of the ten builds
  await page.addInitScript(() => {
    try { localStorage.setItem("apex26.gfxBackend", "three"); } catch (_) {}
    // software GL on a busy runner: TLX init measured > 8 s (run 38660546141) — give it room so the pick is actually TLX
    try { localStorage.setItem("apex26.gfxBootStepMs", "45000"); } catch (_) {}
  });
  await page.addInitScript(censusInitScript);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.enable");
  await page.goto("/?three-devtools=1");   // TLX exposes window.renderer only behind this flag
  await page.waitForFunction(() => window.__apex != null && typeof Tracks !== "undefined", null, { polling: 100, timeout: BOOT_MS });
  const backend = await page.evaluate(() => (typeof GLX !== "undefined" ? GLX.backend : null));
  expect(backend, "this spec measures the shipped TLX backend").toBe("three");

  const heap = {}, readings = [];
  // The gfx runner launches several Playwright processes on one outputDir.
  // Keep the census outside it so later suites and retries preserve each attempt.
  const censusDir = "artifacts/test-results-track-switch-memory";
  mkdirSync(censusDir, { recursive: true });
  const censusPath = `${censusDir}/${test.info().project.name}-${test.info().repeatEachIndex}-retry${test.info().retry}.json`;

  for (let visit = 1; visit <= VISITS; visit++) {
    for (const id of CIRCUITS) {
      await pickTrack(page, id);
      try { await waitUntilDrawn(page, id); }
      catch (error) {
        await test.info().attach(`picker-presentation-${visit}-${id}`, {
          body: Buffer.from(JSON.stringify({ visit, id, error: String(error.message || error),
            presentation: error.presentation || null }, null, 2)), contentType: "application/json",
        });
        throw error;
      }
      await waitFrames(page, 15);
      await settle(page, SETTLE_MS);
      const c = await censusAfterGc(page, cdp);
      const nbc = await page.evaluate(() => { const n = window.renderer && window.renderer._nodes; let zero = 0; if (n) for (const st of n.nodeBuilderCache.values()) if (st.usedTimes <= 0) zero++; return n ? { size: n.nodeBuilderCache.size, zero } : null; });
      // PROBE ONLY (#7464): the reading above is taken BEFORE the snapshot; `afterSnapshot` says whether the
      // snapshot's own GC moved the state.
      const attrs = await page.evaluate(attributeCensus);
      const snapPath = censusPath.replace(/\.json$/, `-v${visit}-${id}.heapsnapshot.gz`);
      let snapshot = snapPath, afterSnapshot = null;
      try { await heapSnapshotGz(cdp, snapPath); afterSnapshot = (await censusAfterGc(page, cdp)).runtimeMemory; }
      catch (error) { snapshot = "failed: " + String(error.message || error); }
      readings.push({ visit, id, ...c, renderObjects: c.three?.renderObjects, nodeBuilderCache: nbc, attrs, snapshot, afterSnapshot });
      writeFileSync(censusPath, JSON.stringify(readings, null, 1));
      expect(c.aliveTracks, `visit ${visit} to ${id}: built tracks still reachable after GC`).toEqual([id]);
      expect(c.three && c.three.renderObjects, `visit ${visit} to ${id}: the world must have drawn for this reading to mean anything`)
        .toBeGreaterThanOrEqual(MIN_RENDER_OBJECTS);
      (heap[id] = heap[id] || [])[visit] = c.heapBytes / 1048576;
      expect(nbc, "three r186 keeps renderer._nodes.nodeBuilderCache; a three upgrade that moves it must move this read").not.toBeNull();
      expect(nbc.zero, `visit ${visit} to ${id}: node-builder states orphaned at usedTimes 0 (of ${nbc.size})`).toBe(0);
    }
  }
  for (const id of CIRCUITS) {
    const series = heap[id].slice(1);
    const { intervals, min, median, netAfterWarmupMB, policyReady } = sustainedGrowthMB(series);
    expect(policyReady, "growth policy needs the existing five-visit browser sequence").toBe(true);
    expect(median, `${id}: heap ${series.join(" → ")} MB across ${VISITS} visits; growth per visit after the second: ${intervals.join(", ")} (median ${median}, min ${min}, net after warm-up ${netAfterWarmupMB}; median must be within the bound)`)
      .toBeLessThanOrEqual(GROWTH_MB);
  }
});
