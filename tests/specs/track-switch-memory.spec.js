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
// The floor is NOT lowered when the opening flyby `wide` shot is levelled at
// the horizon (39 ROs on llvmpipe at u=0): picker warm frames sit on
// turn-first (FlybySeq.warmProgress) so the leak path still draws.
// waitUntilDrawn waits for the "menu warm drawn <id>" Log record (not the
// render-object count — that can read the previous scene; run 37330132243).
const MIN_RENDER_OBJECTS = 40;
const SETTLE_MS = 6000;
const CIRCUITS = ["monza", "monaco"];


// TEMPORARY DIAGNOSTIC: aggregate a CDP heap snapshot by node type+name (self size), list large
// ArrayBuffer backing stores and (given the visit-1 id set) the shortest retaining path of each new one.
async function snapAgg(cdp, v1Ids) {
  let buf = [];
  const on = (e) => buf.push(e.chunk);
  cdp.on("HeapProfiler.addHeapSnapshotChunk", on);
  await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false });
  cdp.off("HeapProfiler.addHeapSnapshotChunk", on);
  const snap = JSON.parse(buf.join("")); buf = null;
  const f = snap.snapshot.meta.node_fields, nf = f.length, types = snap.snapshot.meta.node_types[0];
  const ti = f.indexOf("type"), ni = f.indexOf("name"), si = f.indexOf("self_size"), ii = f.indexOf("id"), ci = f.indexOf("edge_count");
  const ef = snap.snapshot.meta.edge_fields, ne = ef.length, etypes = snap.snapshot.meta.edge_types[0];
  const eti = ef.indexOf("type"), eni = ef.indexOf("name_or_index"), eto = ef.indexOf("to_node");
  const agg = new Map(), ids = new Set(), big = [];
  const N = snap.nodes.length / nf;
  for (let n = 0; n < N; n++) {
    const i = n * nf, t = types[snap.nodes[i + ti]];
    let nm = snap.strings[snap.nodes[i + ni]];
    if (nm === "system / JSArrayBufferData" && snap.nodes[i + si] >= 500000) { ids.add(snap.nodes[i + ii]); if (v1Ids && !v1Ids.has(snap.nodes[i + ii])) big.push(n); }
    if (t === "string" || t === "concatenated string" || t === "sliced string") nm = "STR:" + nm.slice(0, 60).replace(/\s+/g, " ");
    else if (t === "number" || t === "hidden" || t === "synthetic") nm = t + ":" + nm.slice(0, 40);
    const k = t + "|" + nm, a = agg.get(k) || [0, 0]; a[0] += snap.nodes[i + si]; a[1]++; agg.set(k, a);
  }
  let paths = [];
  if (v1Ids && big.length) {
    const parent = new Int32Array(N).fill(-1), pedge = new Int32Array(N).fill(-1), seen = new Uint8Array(N);
    const first = new Int32Array(N + 1); for (let n = 0, e = 0; n < N; n++) { first[n] = e; e += snap.nodes[n * nf + ci]; } first[N] = snap.edges.length / ne;
    const q = [0]; seen[0] = 1;
    for (let h = 0; h < q.length; h++) {
      const n = q[h];
      for (let e = first[n]; e < first[n + 1]; e++) {
        const et = etypes[snap.edges[e * ne + eti]]; if (et === "weak") continue;
        const to = snap.edges[e * ne + eto] / nf; if (seen[to]) continue;
        seen[to] = 1; parent[to] = n; pedge[to] = e; q.push(to);
      }
    }
    big.sort((x, y) => snap.nodes[y * nf + si] - snap.nodes[x * nf + si]);
    for (const n of big.slice(0, 8)) {
      const hops = []; let cur = n;
      for (let d = 0; d < 9 && cur > 0 && parent[cur] >= 0; d++) {
        const e = pedge[cur], et = etypes[snap.edges[e * ne + eti]], nmi = snap.edges[e * ne + eni];
        const en = et === "element" || et === "hidden" ? "[" + nmi + "]" : snap.strings[nmi];
        const pn = parent[cur]; hops.push(`${snap.strings[snap.nodes[pn * nf + ni]].slice(0, 30)}.${en}`); cur = pn;
      }
      paths.push(`${(snap.nodes[n * nf + si] / 1048576).toFixed(2)}MB <- ` + hops.join(" <- "));
    }
  }
  return { agg, ids, paths };
}
function snapDiff(a, b) {
  const rows = [];
  for (const [k, v] of b) { const o = a.get(k) || [0, 0]; if (v[0] - o[0] > 150000) rows.push([v[0] - o[0], v[1] - o[1], k]); }
  rows.sort((x, y) => y[0] - x[0]);
  return rows.slice(0, 25).map((r) => `${(r[0] / 1048576).toFixed(2)}MB +${r[1]} ${r[2].slice(0, 90)}`).join(" ;; ");
}

test("loading circuits one after another keeps one world in memory and does not grow", async ({ page }) => {
  // Six picker builds on software GL: 92-123 s measured, past the 120 s
  // default. The build wait itself is bounded by pickTrack's timeout.
  test.setTimeout(360000);
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
  for (let visit = 1; visit <= 5; visit++) {
    for (const id of CIRCUITS) {
      await pickTrack(page, id);
      await waitUntilDrawn(page, id);
      await waitFrames(page, 15);
      await settle(page, SETTLE_MS);
      const c = await censusAfterGc(page, cdp);
      // Diagnosis (docs/notes/TRACK-SWITCH-METAL-2026-10-17.md): is growth a leak or timing?
      // Re-read after more GC rounds and settle; a leak persists, a late-GC artefact shrinks.
      const reads = [c.heapMB];
      for (let k = 0; k < 3; k++) { await settle(page, 1500); reads.push((await censusAfterGc(page, cdp)).heapMB); }
      c.heapMin = Math.min(...reads);
      c.reads = reads;
      (heap.diag = heap.diag || []).push(`v${visit} ${id}: first ${reads[0]} reads ${reads.join("/")} geom ${c.three && c.three.geometries} tex ${c.three && c.three.textures} ro ${c.three && c.three.renderObjects}`);
      if (id === "monza" && (visit === 1 || visit === 3)) { const g = await snapAgg(cdp, visit === 1 ? null : heap.ids1); if (visit === 1) { heap.snap1 = g.agg; heap.ids1 = g.ids; } else { heap.snapDiff = snapDiff(heap.snap1, g.agg) + " PATHS " + g.paths.join(" ;; "); } }
      const caches = await page.evaluate(() => { const r = window.renderer, o = {}; if (!r) return o; for (const k of Object.keys(r)) { const m = r[k]; if (!m || typeof m !== "object" || k === "info") continue; for (const k2 of Object.keys(m)) { const v = m[k2]; if (v && (v instanceof Map || v instanceof Set) && v.size > 20) o[k + "." + k2] = v.size; else if (v && (v instanceof WeakMap)) o[k + "." + k2] = "wm"; } } return o; });
      heap.diag[heap.diag.length - 1] += " CACHES " + JSON.stringify(caches);
      c.path = await page.evaluate(() => { try { const e = window.__apex.diag({ download: false }).env; return JSON.stringify({ backend: e.backend, state: e.backendState }).slice(0, 400); } catch (_) { return null; } });
      console.log(`[mem] visit ${visit} ${id} heap reads ${reads.join(" ")} geom ${c.three && c.three.geometries} tex ${c.three && c.three.textures} ro ${c.three && c.three.renderObjects} path ${c.path}`);
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
  // TEMPORARY DIAGNOSTIC (remove before ready): surface every reading in the failure text.
  heap.path = readings.length ? readings[0].path : null;
  expect(0, "SNAPDIFF " + heap.snapDiff + " DIAG " + heap.diag.join(" | ") + " PATH " + (await page.evaluate(() => { try { const e = window.__apex.diag({ download: false }).env; return JSON.stringify({ b: e.backend, s: e.backendState }).slice(0, 500); } catch (x) { return String(x); } }))).toBe(1);
  for (const id of CIRCUITS) {
    const grew = heap[id][5] - heap[id][2];
    expect(grew, `${id}: heap ${heap[id].slice(1).join(" → ")} MB across three visits`).toBeLessThanOrEqual(GROWTH_MB);
  }
});
