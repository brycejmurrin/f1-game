// @ts-check
// GARAGE LIVERY EDITS DO NOT ACCUMULATE (M1, docs/notes/MEM-M1-2026-10-18.md). Bryce: "after enough changes
// and the garage re rendering it greatly slows down and lags" on TLX. Every paint edit re-paints the car's decal
// atlas and the bay's dress/live screens, and mints the wings' flap mesh in the new colour. Before M1 each edit
// destroyed and re-created those GPU textures (Safari's WebGPU keeps a destroyed texture's memory while a bind
// group that used it waits for GC: WebKit #76225), and every colour's flap set stayed cached (up to 64) with a
// hidden coalesced TLX run per set: edit N paid for N - 1 paint jobs nobody could see.
// Contract, measured on the shipped TLX backend: after a warm-up, N more WING colour edits (the flap key; each a
// colour never seen before, as a dragged picker gives) create NO new GPU textures, and once the edits pause the
// next edit leaves the flap meshes, coalesced runs and textures where the warm-up left them.
// THE LEAKING CACHE, COUNTED DIRECTLY: renderer.info.memory.geometries and three's RenderObject count follow what
// the last frames drew (deploy tip 75864637: 11 → 34 → 12 → 34 …), and even TLX's live-geometry census after a
// forced GC swings ~22 between edits as the bay's rebuild lands (35/57 on the tip, 38/61 on the base, both flat).
// None of them is the leak. The flap caches are: CarMesh.flapState() — the base held one more set per wing colour.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

const WARM = 3, EDITS = 6;
// The page's own clock, polled on a timer (wait-polling-lint): past the garage's flap idle window.
const pause = async (page, ms) => {
  const t0 = await page.evaluate(() => performance.now());
  await page.waitForFunction(([t, d]) => performance.now() - t > d, [t0, ms], { polling: 100, timeout: ms + 60000 });
};
const frames = (page, n) => page.evaluate((k) => new Promise((done) => {
  let i = 0; const f = () => (++i >= k ? done(null) : requestAnimationFrame(f)); requestAnimationFrame(f);
}), n);

test("N paint edits in the garage leave GPU textures, flap meshes, flap runs and textures flat (TLX)", async ({ page }) => {
  test.setTimeout(480000);   // ~10 s an edit on SwiftShader, plus boot
  await page.setViewportSize({ width: 844, height: 390 });
  await page.addInitScript(() => {
    try { localStorage.setItem("apex26.gfxBackend", "three"); localStorage.setItem("apex26.gfxBootStepMs", "45000"); } catch (_) {}
  });
  await page.goto("/?three-devtools=1");   // TLX exposes window.renderer only behind this flag
  await page.waitForFunction(() => window.__apex != null && typeof Teams !== "undefined", null, { polling: 100, timeout: BOOT_MS });
  expect(await page.evaluate(() => (typeof GLX !== "undefined" ? GLX.backend : null)), "this spec measures the shipped TLX backend").toBe("three");
  // Same entry as livery-sidewall.spec.js: McLaren, no saved customs, START, CAR, LIVERY, create.
  await page.evaluate(() => { const S = GameStore.store; S.set("team", 2); S.set("driver", 0); S.set("livery.custom." + Teams.LIST[2].id, []); });
  await page.locator("#mb-race").click();
  await page.locator("#select").waitFor({ state: "visible" });
  await page.locator("#sel-car").click();
  await page.locator("#carsetup").waitFor({ state: "visible" });
  await page.locator('#cs-tabs [data-cs-cat="livery"]').click();
  await page.locator(".cs-liv-create").click();
  await expect(page.locator('input[data-liv-field="c2"]')).toHaveCount(1);
  // GPU textures three actually allocates (not render targets): the backend's own create/destroy.
  await page.evaluate(() => {
    const b = window.renderer.backend, C = window.__churn = { made: 0, destroyed: 0 };
    const c = b.createTexture.bind(b), d = b.destroyTexture.bind(b);
    b.createTexture = function (t, o) { if (!t.isRenderTargetTexture && !t.isDepthTexture) C.made++; return c(t, o); };
    b.destroyTexture = function (t, ...a) { if (!t.isRenderTargetTexture && !t.isDepthTexture) C.destroyed++; return d(t, ...a); };
  });
  const cdp = await page.context().newCDPSession(page);
  const read = async () => {
    for (let i = 0; i < 2; i++) await cdp.send("HeapProfiler.collectGarbage");   // the second pass collects what the first released
    return page.evaluate(() => {
      const r = window.renderer, co = GLX.__tlx.coState(), f = CarMesh.flapState ? CarMesh.flapState() : null;
      return { gpuTex: window.__churn.made, runs: co.runs, flaps: f, tex: r.info.memory.textures };
    });
  };
  let n = 0;
  const edit = async () => {
    n++;
    await page.evaluate((i) => {
      const inp = /** @type {HTMLInputElement} */ (document.querySelector('input[data-liv-field="c2"]'));
      inp.value = "#" + (0x204060 + i * 0x0b0503).toString(16).slice(-6);   // a colour never seen before
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      inp.dispatchEvent(new Event("change", { bubbles: true }));   // change flushes the 75 ms preview debounce
    }, n);
    await frames(page, 4);   // the car, its atlas and the bay repaint, and the hi-res swap's idle slot runs
  };
  for (let i = 0; i < WARM; i++) await edit();
  await pause(page, 2500);   // past the garage's flap idle window (setup-camera.js FLAP_IDLE_MS)
  await edit();
  const warm = await read();
  const rows = [warm];
  for (let i = 0; i < EDITS; i++) { await edit(); rows.push(await read()); }
  await pause(page, 2500);
  await edit();
  const end = await read();
  rows.push(end);
  test.info().annotations.push({ type: "churn", description: JSON.stringify(rows) });
  expect(end.gpuTex - warm.gpuTex, `GPU textures created by ${EDITS + 1} edits after the warm-up (each edit used to make new ones): ${JSON.stringify(rows)}`).toBe(0);
  expect(end.runs, `coalesced flap runs: ${rows.map((r) => r.runs).join(" → ")}`).toBeLessThanOrEqual(warm.runs);
  expect(warm.flaps && warm.flaps.sets, "the turntable's wings come from the flap-set cache (CarMesh.flapState)").toBeGreaterThan(0);
  expect(end.flaps.sets, `flap sets held: ${rows.map((r) => r.flaps.sets).join(" → ")}`).toBeLessThanOrEqual(warm.flaps.sets);
  expect(end.flaps.elements, `flap elements held: ${rows.map((r) => r.flaps.elements).join(" → ")}`).toBeLessThanOrEqual(warm.flaps.elements);
  expect(end.tex, `textures: ${rows.map((r) => r.tex).join(" → ")}`).toBeLessThanOrEqual(warm.tex);
});
