// After a picker pick, the PREVIOUS circuit's world geometry must be released, not held by three's RenderObjects.
//
// #2693: on monza's first revisit the heap stepped ~13 MB because monaco's props vertex set (position, colour,
// normal, mat; the shared array behind its chunks) was still reachable from a RenderObject while monza was on
// screen. Exact assertion, no heap noise: every `chunk`-kind vertex array drawn for circuit A (a WeakRef taken
// while A is on screen) is collected once circuit B has drawn and the GC has run twice.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { censusInitScript, censusAfterGc, pickTrack, settle, waitUntilDrawn } from "../../tools/lib/mem-census.mjs";

test.use({ viewport: { width: 960, height: 540 } });

test("a picked circuit's chunk vertex data is gone from the render objects after the next pick", async ({ page }) => {
  test.setTimeout(300000);
  await page.addInitScript(() => { try { localStorage.setItem("apex26.gfxBackend", "three"); localStorage.setItem("apex26.gfxBootStepMs", "45000"); } catch (_) {} });
  await page.addInitScript(censusInitScript);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.enable");
  await page.goto("/?three-devtools=1");
  await page.waitForFunction(() => window.__apex != null && typeof Tracks !== "undefined", null, { polling: 100, timeout: BOOT_MS });

  // Weak handles on the vertex arrays of every chunk-kind geometry a render object holds right now.
  const watch = (tag) => {
    const list = window.renderer && window.renderer._objects && window.renderer._objects._renderObjects;
    window.__relWatch = window.__relWatch || {};
    const out = (window.__relWatch[tag] = []);
    const seen = new Set();
    if (list) for (const ro of list.values ? list.values() : list) {
      const g = ro.geometry;
      if (!g || g.__tlxKind !== "chunk") continue;
      for (const n in g.attributes) {
        const a = g.attributes[n];
        if (!a || !a.array || seen.has(a.array.buffer)) continue;
        seen.add(a.array.buffer);
        if (a.array.byteLength >= 262144) out.push(new WeakRef(a.array));
      }
    }
    return out.length;
  };
  const alive = (tag) => window.__relWatch[tag].filter((w) => w.deref() !== undefined).length;

  await pickTrack(page, "monaco"); await waitUntilDrawn(page, "monaco"); await settle(page, 6000);
  const watched = await page.evaluate(watch, "monaco");
  expect(watched, "monaco drew no chunk geometry: the test would be vacuous").toBeGreaterThan(0);
  await pickTrack(page, "monza"); await waitUntilDrawn(page, "monza"); await settle(page, 6000);
  await censusAfterGc(page, cdp);
  const left = await page.evaluate(alive, "monaco");
  expect(left, `${left} of ${watched} monaco chunk vertex arrays still reachable while monza is on screen`).toBe(0);
});
