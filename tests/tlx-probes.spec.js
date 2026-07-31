// @ts-check
// TLX backend probes — the three.js/TSL renderer behind apex26.gfxBackend="three".
// Mirrors webgl-probes.spec.js's role for GLX: boot integrity, backend identity
// (the descriptor-copy install onto the GLX object), and a console/GL-error
// scrape. CI runs three's WebGL2 fallback on SwiftShader (no WebGPU headless),
// pinned via apex26.tlxForceGL so local repros match CI exactly.
// Grows per milestone: M2 pixel-nonblank, M3+ __tlx shader-dump/?viz= hooks.
import { test, expect } from "./fixtures.js";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("apex26.gfxBackend", "three");
      localStorage.setItem("apex26.tlxForceGL", "1");
    } catch (_) {}
  });
});

test.describe("TLX — boot", () => {
  test("boots with the TLX backend installed on the GLX object", async ({ page }) => {
    const errors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && !/favicon/i.test(msg.text())) errors.push(msg.text());
    });
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { timeout: 30_000 });

    // The descriptor-copy install is the compatibility contract: the SAME GLX
    // object every test monkey-patches must now carry the TLX surface.
    // NOTE: GLX is a top-level `const` in a classic script — page-scope
    // lexical, NOT window.GLX (same access pattern as webgl-probes.spec.js).
    const state = await page.evaluate(() => ({
      backend: GLX.backend,
      hdr: typeof GLX.hdrMode === "function" ? GLX.hdrMode() : null,
      scale: GLX.getRenderScale ? GLX.getRenderScale() : null,
      aspect: GLX.aspect,
    }));
    expect(state.backend).toBe("three");
    expect(typeof state.hdr).toBe("boolean");
    expect(state.scale).toBeGreaterThan(0);
    expect(state.aspect).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test("falls back to GLX when the backend key is absent", async ({ page }) => {
    await page.addInitScript(() => {
      try { localStorage.removeItem("apex26.gfxBackend"); } catch (_) {}
    });
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { timeout: 30_000 });
    const backend = await page.evaluate(() => GLX.backend);
    expect(backend).toBeUndefined();   // plain GLX carries no backend id
  });

  test("track renders a non-blank frame on TLX (M2 world geometry)", async ({ page }) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(m.text()); });
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { timeout: 30_000 });
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 60_000 });
    await page.evaluate(() => window.__apex.park(0));
    await page.waitForTimeout(400);
    // Same heuristic as smoke.spec.js: a rendered scene PNG is tens of KB,
    // a blank/solid canvas < ~2 KB.
    const buf = await page.locator("canvas#game").screenshot();
    expect(buf.length).toBeGreaterThan(5000);
    expect(errors).toEqual([]);
  });

  test("M4 shadow subsystem arms on a day race (car map per-frame, lamp idle)", async ({ page }) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(m.text()); });
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { timeout: 30_000 });
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 60_000 });
    await page.evaluate(() => window.__apex.park(0.1));
    await page.waitForTimeout(600);
    const st = await page.evaluate(() => ({
      car: GLX.carShadowState(),
      lamp: GLX.lampShadowState(),
      pcss: GLX.pcss(),
      hdr: GLX.hdrMode(),
    }));
    // Desktop headless = full tier: all three maps exist; the per-frame car
    // pass has armed at least once by now. Monza day never opens the lamp
    // pass (night-gated in game.js), so its arms stay 0 / idx -1.
    expect(st.car.enabled).toBe(true);
    expect(st.car.arms).toBeGreaterThan(0);
    expect(st.lamp.enabled).toBe(true);
    expect(st.lamp.arms).toBe(0);
    expect(st.lamp.idx).toBe(-1);
    expect(st.pcss).toBe(false);   // TODO M4-PCSS: blocker map not ported
    expect(st.hdr).toBe(false);    // truthful until M8's HDR post chain
    expect(errors).toEqual([]);
  });

  test("M5 sky arms on a race frame and honours the night gate", async ({ page }) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(m.text()); });
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { timeout: 30_000 });
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 60_000 });
    await page.evaluate(() => window.__apex.park(0.1));
    await page.waitForTimeout(400);
    const day = await page.evaluate(() => GLX.__tlx.skyState());
    // Day race: the background node is armed each frame, stars flag off.
    expect(day.on).toBe(true);
    expect(day.stars).toBe(0);
    expect(day.sunDir[1]).toBeGreaterThan(0);   // sun above the horizon
    // Night: uStars flips to 1 (SKY_FS's nightSky gate keys off it — the sun
    // disc must never paint among the stars even though sunDir stays high).
    await page.evaluate(() => window.__apex.setTimeOfDay("night"));
    // The day->night flip rebuilds scenery before the next sky frame lands —
    // wait on the uniform, not a fixed sleep (SwiftShader rebuilds are slow).
    await page.waitForFunction(() => GLX.__tlx.skyState().stars === 1, { timeout: 60_000 });
    const night = await page.evaluate(() => GLX.__tlx.skyState());
    expect(night.on).toBe(true);
    expect(night.stars).toBe(1);
    expect(errors).toEqual([]);
  });

  test("M6 FX paths record on a night race (glow halos, blob shadows, decals)", async ({ page }) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(m.text()); });
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { timeout: 30_000 });
    await page.evaluate(() => window.__apex.race("singapore"));
    await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 60_000 });
    await page.evaluate(() => window.__apex.park(0.1));
    // Singapore is a night race: floodlights populate frame.lights and the
    // glare-halo pass runs. Wait for a presented frame that carried FX.
    await page.waitForFunction(() => GLX.__tlx.fxState().glow > 0, { timeout: 60_000 });
    const st = await page.evaluate(() => GLX.__tlx.fxState());
    expect(st.on).toBe(true);
    expect(st.glow).toBeGreaterThan(0);        // near-field lamp halos in view
    expect(st.shadows).toBeGreaterThan(0);     // blob shadows under the field
    expect(st.decals).toBeGreaterThan(0);      // car number/sponsor decals
    expect(errors).toEqual([]);
  });

  test("M6 skid batch records after a hard driven stint", async ({ page }) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(m.text()); });
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { timeout: 30_000 });
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 60_000 });
    // Drive hard with full lock so the tyres slip and lay marks (the skid
    // recorder keys off slip, not just steering).
    await page.evaluate(() => {
      window.__apex.jump(0.1, 70);
      window.__apex.act({ steer: 1, throttle: true }, 1 / 60, 120);
    });
    await page.evaluate(() => window.__apex.freeze(true));
    // Marks are recorded in the physics step; the batch record lands on the
    // next presented frame.
    await page.waitForFunction(() => GLX.__tlx.fxState().skidVerts > 0, { timeout: 30_000 });
    const st = await page.evaluate(() => GLX.__tlx.fxState());
    expect(st.skidVerts).toBeGreaterThan(0);
    expect(st.skidVerts % 6).toBe(0);          // 6 verts per mark
    expect(errors).toEqual([]);
  });

  test("M7 chunked path culls and frees the source arrays on a street circuit", async ({ page }) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(m.text()); });
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { timeout: 30_000 });
    await page.evaluate(() => window.__apex.race("singapore"));
    await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 60_000 });
    await page.evaluate(() => window.__apex.park(0.1));
    // Wait for a presented frame that carried chunked records (props + glass).
    await page.waitForFunction(() => GLX.__tlx.chunkState().total > 0, { timeout: 60_000 });
    const st = await page.evaluate(() => {
      const geo = window.__apex.trackGeometry();
      return {
        chunk: GLX.__tlx.chunkState(),
        // Staged memory release: the game keeps track.propsGeo, but its raw
        // multi-million-element source arrays must be freed by the build
        // (data._keepPositions unset on the normal path).
        propsFreed: !!geo && !!geo.props
          && geo.props.pos === null && geo.props.idx === null && geo.props.nrm === null,
      };
    });
    expect(st.chunk.on).toBe(true);
    expect(st.chunk.total).toBeGreaterThan(20);              // the city actually binned
    expect(st.chunk.visible).toBeGreaterThan(0);             // something survived the cull
    expect(st.chunk.visible).toBeLessThan(st.chunk.total);   // culling engages at a parked cam
    expect(st.propsFreed).toBe(true);
    expect(errors).toEqual([]);
  });

  test("menu is reachable and canvas is sized (no-track begin/present path)", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { timeout: 30_000 });
    await expect(page.locator("#mb-race")).toBeVisible();
    const dims = await page.evaluate(() => {
      const c = document.getElementById("game");
      return { w: c.width, h: c.height };
    });
    expect(dims.w).toBeGreaterThan(0);
    expect(dims.h).toBeGreaterThan(0);
  });
});
