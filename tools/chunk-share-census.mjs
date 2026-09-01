// Do adjacent chunks share a lamp list? — the measurement nobody has run.
//
// js/render/webgpu/wgx.js:3496 asserts "adjacent chunks almost never share an
// index list", and that sentence is the entire justification for both backends
// forfeiting their adjacent-run draw merge in per-chunk lamp mode — a merge
// measured elsewhere at 76-87% fewer scenery draws. Nothing in docs/ or
// artifacts/ has ever counted it. If it is right, the merge work is dead and
// should be recorded as such; if it is wrong, the default lit night path of the
// default backend is issuing several hundred avoidable draws a frame.
//
// Also counts the EMPTY-list chunks, which merge for free (no identity signal
// needed: an empty list binds uNumLights = 0 for every one of them).
//
// ANSWER, vegas night / LOW / knob 0.3 (2026-08-29): the claim holds for chunks
// that bind lamps — 3 shared non-empty adjacent pairs out of 909, and 0 out of
// 195. Empty chunks share constantly (79.5% of the track, longest run 577) but
// are the outfield the frustum never draws: pair this with
// artifacts/perchunk-cost.mjs, which counts 148 uniform4fv and 94 drawElements
// a frame with the knob on against 4 and 55.1 with it off, so 148/4 = 37 of the
// ~39 extra chunk draws bind a NON-empty list. Visible empty chunks: about two
// a frame. The merge is dead; re-run this before anyone proposes it a third time.
//
// Run: node tools/chunk-share-census.mjs [track]
import { startStaticServer, launchChromium, shutdown } from "./harness.mjs";
const srv = await startStaticServer(process.cwd());
const browser = await launchChromium();
const TRACK = process.argv[2] || "vegas";
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
  await page.goto(srv.url + "index.html", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.evaluate(() => localStorage.setItem("apex26.gfxPreset", JSON.stringify("low")));
  await page.goto(srv.url + "index.html", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => window.__apex, null, { polling: 100, timeout: 90000 });
  // Capture every table LampChunks bakes, keyed by the chunks array it was for.
  await page.evaluate(() => {
    window.__tabs = [];
    const real = LampChunks.resolve;
    LampChunks.resolve = function (lights, chunks, knob) {
      const t = real.call(this, lights, chunks, knob);
      if (!window.__tabs.some((e) => e.chunks === chunks && e.knob === knob))
        window.__tabs.push({ chunks, knob, table: t });
      return t;
    };
  });
  await page.evaluate(async (t) => { await __apex.race(t, "night", "clear"); __apex.go(); }, TRACK);
  await page.waitForFunction(() => { try { return !!__apex.info().track; } catch { return false; } },
    null, { polling: 100, timeout: 180000 });
  await new Promise((r) => setTimeout(r, 3000));
  await page.evaluate(() => { __apex.lightTune({ lampFlicker: 0, lampWarmup: 0, perChunkLights: 0.3 }); });
  await new Promise((r) => setTimeout(r, 2500));

  const out = await page.evaluate(() => {
    const rows = [];
    for (const { chunks, knob, table } of window.__tabs) {
      const L = table.lists, n = L.length;
      let empty = 0, eqAdj = 0, longest = 0, run = 1, inRunTotal = 0;
      const same = (a, b) => {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
        return true;
      };
      for (let i = 0; i < n; i++) {
        if (L[i].length === 0) empty++;
        if (i > 0) {
          if (same(L[i - 1], L[i])) { eqAdj++; run++; }
          else { if (run > longest) longest = run; if (run > 1) inRunTotal += run; run = 1; }
        }
      }
      if (run > longest) longest = run;
      if (run > 1) inRunTotal += run;
      // Empty-only adjacency: the subset that merges with no baked signal.
      let eqEmpty = 0;
      for (let i = 1; i < n; i++) if (L[i - 1].length === 0 && L[i].length === 0) eqEmpty++;
      rows.push({ chunks: n, knob, empty, emptyPct: +(100 * empty / n).toFixed(1),
                  adjacentEqualPairs: eqAdj, adjEqPct: +(100 * eqAdj / Math.max(1, n - 1)).toFixed(1),
                  ofWhichBothEmpty: eqEmpty, longestEqualRun: longest, chunksInsideRuns: inRunTotal });
    }
    return rows;
  });
  console.log(JSON.stringify({ track: TRACK, preset: "low", tables: out }, null, 1));
} finally { await browser.close(); await shutdown(); }
