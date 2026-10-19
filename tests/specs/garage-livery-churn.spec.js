// @ts-check
// GARAGE LIVERY EDITS DO NOT ACCUMULATE (M1, docs/notes/MEM-M1-2026-10-18.md). Bryce: "after enough changes
// and the garage re rendering it greatly slows down and lags" on TLX. Every paint edit re-paints the car's decal
// atlas and the bay's dress/live screens, and mints the wings' flap mesh in the new colour. Before M1 each edit
// destroyed and re-created those GPU textures (Safari's WebGPU keeps a destroyed texture's memory while a bind
// group that used it waits for GC: WebKit #76225), and every colour's flap set stayed cached (up to 64) with a
// hidden coalesced TLX run per set: edit N paid for N - 1 paint jobs nobody could see.
// Contract, measured on the shipped TLX backend: after a warm-up, N more WING colour edits (the flap key; each a
// colour never seen before, as a dragged picker gives) create NO new GPU textures, and once the edits pause the
// next edit leaves the flap meshes, coalesced runs, textures and settled TLX live geometries where the warm-up
// left them.
// THE LEAKING CACHE, COUNTED DIRECTLY: CarMesh.flapState() — the base held one more set per wing colour.
// SETTLED GEO LIVE (#2897): renderer.info.memory.geometries follows what the last frames drew and is not a
// leak meter. Late Bahrain/model-pack builds also stepped the count mid-run (8→11/12) on unrelated PRs.
// The menu/flyby lazy build (scheduleFlybyTrack) often STARTS after a Tracks.building()-only settle: ensureScenery
// and ensureTrackBuild run with prep.building still false, so warm can sample garage-only geoLive (~35) and then
// Bahrain lands mid-edits (~50). Force-await menuPrep world+done+!warming on #select before the garage. Before each
// geo sample: menuPrep idle, Tracks.building clear, modelsReady, and 1.5 s of post-GC geoLive stability (bay rebuild
// WeakRefs only drop after HeapProfiler GC) — then assert end.geoLive ≤ warm.geoLive. Flap/GPU texture asserts stay strict.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import fs from "node:fs";

const WARM = 3, EDITS = 6;
// #region agent log
const dbg = (hypothesisId, location, message, data) => {
  try {
    fs.appendFileSync("/opt/cursor/logs/debug.log", JSON.stringify({
      hypothesisId, location, message, data, timestamp: Date.now(),
    }) + "\n");
  } catch (_) { /* debug sink optional */ }
};
// #endregion
// The page's own clock, polled on a timer (wait-polling-lint): past the garage's flap idle window.
const pause = async (page, ms) => {
  const t0 = await page.evaluate(() => performance.now());
  await page.waitForFunction(([t, d]) => performance.now() - t > d, [t0, ms], { polling: 100, timeout: ms + 60000 });
};
const frames = (page, n) => page.evaluate((k) => new Promise((done) => {
  let i = 0; const f = () => (++i >= k ? done(null) : requestAnimationFrame(f)); requestAnimationFrame(f);
}), n);

/** Snapshot menu prep + TLX geo for the debug log (no secrets). */
const snapPrep = async (page) => page.evaluate(() => {
  const p = (window.__apex && typeof window.__apex.menuPrep === "function") ? window.__apex.menuPrep() : null;
  const tlx = (typeof GLX !== "undefined" && GLX.__tlx) ? GLX.__tlx : null;
  const ms = tlx && tlx.memState ? tlx.memState() : null;
  let tracksBuilding = null;
  try { tracksBuilding = !!(typeof Tracks !== "undefined" && Tracks.building && Tracks.building()); } catch (_) { tracksBuilding = null; }
  let trackId = null;
  try { trackId = window.__apex && window.__apex.info && window.__apex.info().track; } catch (_) { /* */ }
  return {
    menu: p ? { trackId: p.trackId, world: !!p.world, building: !!p.building, done: !!p.done, warming: !!p.warming } : null,
    tracksBuilding, trackId, geoLive: ms ? (ms.geoLive | 0) : null, geoKinds: ms ? ms.geoKinds : null,
  };
});

/**
 * Force the select-screen flyby prep to finish WHILE #select is still up.
 * scheduleFlybyTrack's ensureScenery / ensureTrackBuild window is invisible to Tracks.building();
 * leaving as soon as menuPrep.world is true also races menuFinish's program warm — the garage then
 * edits under gfx.warming() and the flap/atlas baseline is empty (warm flaps=0, end mints them).
 * Wait for world + done + !warming so Bahrain geos and shader warm both land before the garage.
 */
const awaitMenuTrackBuilt = async (page) => {
  // #region agent log
  dbg("A", "garage-livery-churn.spec.js:awaitMenuTrackBuilt:enter", "await menu prep done on select", await snapPrep(page));
  // #endregion
  await page.waitForFunction(() => {
    const A = window.__apex;
    if (!A || typeof A.menuPrep !== "function") return false;
    const p = A.menuPrep();
    if (!p || p.building || p.warming || !p.world || !p.done) return false;
    try {
      if (typeof Tracks !== "undefined" && Tracks.building && Tracks.building()) return false;
    } catch (_) { /* */ }
    return true;
  }, null, { polling: 100, timeout: 180000 });
  // #region agent log
  dbg("A", "garage-livery-churn.spec.js:awaitMenuTrackBuilt:exit", "menu prep done", await snapPrep(page));
  // #endregion
};

/**
 * Wait out menu prep / paced builds / model-pack / bay rebuild spikes, then return a post-GC sample.
 * Bay rebuilds leave ~15 mesh WeakRefs that only drop after HeapProfiler GC (warm geoRegLen=236 with
 * geoLive=221). Settling without GC can lock the high plateau and fail end≤warm; settle WITH the same
 * double-GC read() uses so warm and end share the post-GC floor.
 */
const settleGeo = async (page, cdp, label) => {
  // #region agent log
  dbg("B", "garage-livery-churn.spec.js:settleGeo:enter", "settle enter " + label, await snapPrep(page));
  // #endregion
  await page.evaluate(() => {
    window.__modelsReadyOk = false;
    const p = (typeof Assets !== "undefined" && Assets.modelsReady)
      ? Assets.modelsReady(4000)
      : Promise.resolve(0);
    p.then(() => { window.__modelsReadyOk = true; }, () => { window.__modelsReadyOk = true; });
  });
  const deadline = Date.now() + 90000;
  let last = -1, since = 0, sample = null;
  while (Date.now() < deadline) {
    const ready = await page.evaluate(() => {
      if (!window.__modelsReadyOk) return false;
      try {
        const p = (window.__apex && typeof window.__apex.menuPrep === "function") ? window.__apex.menuPrep() : null;
        if (p && (p.building || p.warming)) return false;
      } catch (_) { /* */ }
      try {
        if (typeof Tracks !== "undefined" && Tracks.building && Tracks.building()) return false;
      } catch (_) { /* */ }
      return !!(typeof GLX !== "undefined" && GLX.__tlx && typeof GLX.__tlx.memState === "function");
    });
    if (!ready) { last = -1; since = 0; await pause(page, 100); continue; }
    for (let i = 0; i < 2; i++) await cdp.send("HeapProfiler.collectGarbage");
    sample = await page.evaluate(() => {
      const r = window.renderer, co = GLX.__tlx.coState(), f = CarMesh.flapState ? CarMesh.flapState() : null;
      const ms = GLX.__tlx.memState();
      return {
        gpuTex: window.__churn.made, runs: co.runs, flaps: f, tex: r.info.memory.textures,
        geoLive: ms.geoLive, geoKinds: ms.geoKinds, geoRegLen: ms.geoRegLen,
      };
    });
    const live = sample.geoLive | 0;
    const now = Date.now();
    if (live !== last) { last = live; since = now; await pause(page, 100); continue; }
    if (now - since >= 1500) {
      // #region agent log
      dbg("B", "garage-livery-churn.spec.js:settleGeo:exit", "settle exit " + label, { sample, prep: await snapPrep(page) });
      // #endregion
      return sample;
    }
    await pause(page, 100);
  }
  throw new Error("settleGeo timed out (" + label + ")");
};

test("N paint edits in the garage leave GPU textures, flap meshes, flap runs, textures and settled geoLive flat (TLX)", async ({ page }) => {
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
  // Land the menu/flyby track (Bahrain) before the garage — otherwise ensureScenery can
  // finish after warm and step geoLive mid-edits (#2897 flake: warm=35, end=50).
  await awaitMenuTrackBuilt(page);
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
      const ms = GLX.__tlx.memState();
      return {
        gpuTex: window.__churn.made, runs: co.runs, flaps: f, tex: r.info.memory.textures,
        geoLive: ms.geoLive, geoKinds: ms.geoKinds, geoRegLen: ms.geoRegLen,
      };
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
  // Turntable flaps must exist before the leak baseline (menu warm can delay the first garage frame).
  await page.waitForFunction(() => {
    try {
      const f = typeof CarMesh !== "undefined" && CarMesh.flapState && CarMesh.flapState();
      return !!(f && f.sets > 0);
    } catch (_) { return false; }
  }, null, { polling: 100, timeout: 120000 });
  const warm = await settleGeo(page, cdp, "warm");   // post-GC stable baseline (#2897)
  // #region agent log
  dbg("C", "garage-livery-churn.spec.js:warm", "warm baseline", { warm, prep: await snapPrep(page) });
  // #endregion
  const rows = [warm];
  for (let i = 0; i < EDITS; i++) { await edit(); rows.push(await read()); }
  await pause(page, 2500);
  await edit();
  const end = await settleGeo(page, cdp, "end");
  rows.push(end);
  // #region agent log
  dbg("C", "garage-livery-churn.spec.js:end", "end sample", { end, prep: await snapPrep(page), series: rows.map((r) => r.geoLive) });
  // #endregion
  test.info().annotations.push({ type: "churn", description: JSON.stringify(rows) });
  expect(end.gpuTex - warm.gpuTex, `GPU textures created by ${EDITS + 1} edits after the warm-up (each edit used to make new ones): ${JSON.stringify(rows)}`).toBe(0);
  expect(end.runs, `coalesced flap runs: ${rows.map((r) => r.runs).join(" → ")}`).toBeLessThanOrEqual(warm.runs);
  expect(warm.flaps && warm.flaps.sets, "the turntable's wings come from the flap-set cache (CarMesh.flapState)").toBeGreaterThan(0);
  expect(end.flaps.sets, `flap sets held: ${rows.map((r) => r.flaps.sets).join(" → ")}`).toBeLessThanOrEqual(warm.flaps.sets);
  expect(end.flaps.elements, `flap elements held: ${rows.map((r) => r.flaps.elements).join(" → ")}`).toBeLessThanOrEqual(warm.flaps.elements);
  expect(end.tex, `textures: ${rows.map((r) => r.tex).join(" → ")}`).toBeLessThanOrEqual(warm.tex);
  expect(end.geoLive, `settled geoLive: ${rows.map((r) => r.geoLive).join(" → ")} kinds=${JSON.stringify(end.geoKinds)}`).toBeLessThanOrEqual(warm.geoLive);
});
