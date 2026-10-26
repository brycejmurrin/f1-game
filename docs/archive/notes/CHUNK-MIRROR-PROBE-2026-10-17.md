# Chunked-mesh CPU memory on the picker path: probe and findings (2693 handoff, 2026-10-17)

Status: investigation only, no code changed. Context: PR 2637 (its note, not merged yet, is TRACK-SWITCH-METAL on that PR's branch) shows a
one-time ~13 MB step of JS ArrayBuffer data on monza's first revisit; issue 2693 asks what it is and whether it is waste.

## Known (measured)
- Heap after GC, monza visits 1-5: 138.6, 155.4, 157.1, 157.0, 158.0 MB (local SwiftShader); Metal 133.1, 148.6, 149.9, 150.5, 151.2.
- `geoCensus()` after GC, monza visit 1 to 2: geometry kind `chunk` 15.56 to 28.31 MB (+4.32 position, +4.32 colour, +2.88 normal, +1.44 mat); `mesh` kind unchanged.
- Heap-snapshot diff: the new buffers are `BufferAttribute.array`s of the live world (retained from `window.scene` and `renderer.lighting` WeakMaps).
- The build is IDENTICAL at visit 1 and 2: the same `createChunkedMesh` calls with the same vertex counts (monza props 340215 verts / 89 chunks, ribbon 37544 / 54 chunks, glass 2784 / 0; monaco props 377120 / 153, ribbon 13184 / 14), via `GLX` and the inner `GLX.__tlx` object.
- Mirror release never runs in the picker (`GLX.__tlx.memState().mirror` all zero, gate "----"); baked-model preload does not remove the step.

## Retracted
The PR 2637 body and issue 2693 say the extra memory is a "lazily built chunked copy at draw time (game.js drawWorldMeshes / shadow-pass.js)". The createChunkedMesh probe does NOT support that: no extra call exists between visit 1 and 2. Treat the mechanism as unknown; correct issue 2693 when the next probe lands.

## Next probe (was running when this was written; result not read)
Walk `renderer._objects._renderObjects` after a forced GC and diff monza visit 1 vs 2 by `kind|attribute|typed-array constructor`, bytes and length (a changed dtype such as Uint8 vs Float32, or a changed length, names the mechanism). Source, a temporary spec: save it under tests/specs with any zz- name, run it with npm test and --retries=0, and never commit it:

```js
// TEMPORARY local probe for #2693 (never committed): live render-object attribute arrays by kind/attr/ctor, after forced GC.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { censusInitScript, censusAfterGc, pickTrack, settle, waitUntilDrawn } from "../../tools/lib/mem-census.mjs";
test.use({ viewport: { width: 960, height: 540 } });
test("chunk probe", async ({ page }) => {
  test.setTimeout(300000);
  await page.addInitScript(() => { try { localStorage.setItem("apex26.gfxBackend", "three"); localStorage.setItem("apex26.gfxBootStepMs", "45000"); } catch (_) {} });
  await page.addInitScript(censusInitScript);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.enable");
  await page.goto("/?three-devtools=1");
  await page.waitForFunction(() => window.__apex != null && typeof Tracks !== "undefined", null, { polling: 100, timeout: BOOT_MS });
  const walk = () => {
    const ros = window.renderer && window.renderer._objects && window.renderer._objects._renderObjects;
    const seen = new Set(), agg = {};
    if (ros) for (const ro of ros.values ? ros.values() : ros) {
      const g = ro.geometry; if (!g) continue;
      const kind = g.__tlxKind || "?";
      const add = (name, a) => { if (!a || !a.array || !a.array.buffer || seen.has(a.array.buffer)) return; seen.add(a.array.buffer);
        const k = kind + "|" + name + "|" + a.array.constructor.name; const e = agg[k] || (agg[k] = { n: 0, mb: 0, len: 0 }); e.n++; e.mb += a.array.byteLength / 1048576; e.len = Math.max(e.len, a.array.length); };
      for (const n in g.attributes) add(n, g.attributes[n]); add("index", g.index);
    }
    return Object.entries(agg).map(([k, e]) => ({ k, n: e.n, mb: +e.mb.toFixed(2), len: e.len })).sort((a, b) => b.mb - a.mb);
  };
  const res = {};
  for (const [visit, id] of [[1, "monza"], [1, "monaco"], [2, "monza"]]) {
    await pickTrack(page, id); await waitUntilDrawn(page, id); await settle(page, 6000);
    const c = await censusAfterGc(page, cdp);
    const rows = await page.evaluate(walk);
    res[`v${visit} ${id}`] = { heap: c.heapMB, rows };
  }
  const a = Object.fromEntries(res["v1 monza"].rows.map((r) => [r.k, r])), b = Object.fromEntries(res["v2 monza"].rows.map((r) => [r.k, r]));
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const diff = [...keys].map((k) => ({ k, v1: a[k] ? `${a[k].n}x ${a[k].mb}MB len${a[k].len}` : "-", v2: b[k] ? `${b[k].n}x ${b[k].mb}MB len${b[k].len}` : "-", d: +(((b[k] ? b[k].mb : 0) - (a[k] ? a[k].mb : 0)).toFixed(2)) })).filter((r) => Math.abs(r.d) >= 0.2).sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
  expect(0, "WALK heaps v1 " + res["v1 monza"].heap + " v2 " + res["v2 monza"].heap + " DIFF " + JSON.stringify(diff)).toBe(1);
});
```
