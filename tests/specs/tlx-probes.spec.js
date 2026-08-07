// @ts-check
// TLX backend probes — the three.js/TSL renderer behind apex26.gfxBackend="three".
// Mirrors webgl-probes.spec.js's role for GLX: boot integrity, backend identity
// (the descriptor-copy install onto the GLX object), and a console/GL-error
// scrape. CI runs three's WebGL2 fallback on SwiftShader (no WebGPU headless),
// pinned via apex26.tlxForceGL so local repros match CI exactly.
// Grows per milestone: M2 pixel-nonblank, M3+ __tlx shader-dump/?viz= hooks.
import { test, expect } from "../helpers/fixtures.js";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("apex26.gfxBackend", "three");
      localStorage.setItem("apex26.tlxForceGL", "1");
    } catch (_) {}
  });
});

/* STOP THE RENDER LOOP BEFORE SCREENSHOTTING THE CANVAS.
   `park()` freezes PHYSICS, not rendering — the game keeps redrawing every rAF
   tick, so a `.screenshot()` issued while that is running has to queue behind an
   endless SwiftShader redraw instead of reading a quiet compositor.
   tests/specs/smoke.spec.js:35-56 measured the cost of exactly this mistake: 88-96 s
   solo, 154-214 s under a two-worker suite, and 29-32 s once the loop is
   stopped first. `headless(true)` (js/game/apex.js) halts render() while the
   compositor keeps the LAST drawn frame, which is what tests/helpers/track-helpers.js
   already relies on for its stable captures.
   This file had three canvas screenshots and none of them did it. The
   corroboration is in its own numbers: M2, the only test here whose cost is
   dominated by a screenshot, measured 92.6 s solo — inside smoke's recorded
   88-96 s band — against 125.8 s in a mixed batch, while the non-screenshot
   tests around it barely moved between the two runs.
   Present a real frame BEFORE stopping the loop (smoke found 100 ms is not
   reliably enough on a heavy circuit; every caller below has already waited
   longer than that or waited on a readiness flag). */
async function stopRendering(page) {
  await page.evaluate(() => window.__apex.headless(true));
  await page.waitForTimeout(50);
}

test.describe("TLX — boot", () => {
  /* THE WHOLE FILE HAS NO MARGIN, so the budget is raised for all of it.
     MEASURED on this box, solo, one process: the thirteen tests that pass run
     10.6 s … 92.6 s against a 120 s budget — the slowest is at 77 % and the
     median around 65 s. Nothing here is idle; a TLX boot loads three.js, builds
     a circuit and renders under SwiftShader, and that cost is the test.

     Two of the fifteen had NEVER passed — M6 skid (130.3 s, then 140.9 s) and
     M9 env (130.5 s, then 152.8 s), both `Test timeout of 120000ms exceeded`
     with no assertion ever reached. Raising the budget first and alone was what
     separated them, because they turned out to have DIFFERENT faults that
     presented identically:

       M9 env  — a real wait on a real condition, starved by Playwright's
                 default `polling: 'raf'` under SwiftShader. Passing
                 { polling: 100 } fixed it: 72 s.
       M6 skid — waiting on something that could never happen. `skids.stamp()`
                 lives in render(), and the stint was driven through act(),
                 which never presents a frame; the same stint also crashed the
                 car into the barrier long before the wait began. Rewritten to
                 stop inside the measured slide window (see its own comment):
                 49 s.

     Both now pass with room. The lesson worth keeping is the one that cost four
     wrong theories: a timeout tells you the budget ran out, never why — and on
     a rendering page a declared inner timeout does not even bound its own wait
     (docs/TESTING.md). Reach for an instrument, not a fifth mechanism;
     tests/manual/skid-probe.spec.js is the one that settled M6. */
  test.slow();

  test("boots with the TLX backend installed on the GLX object", async ({ page }) => {
    const errors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && !/favicon/i.test(msg.text())) errors.push(msg.text());
    });
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { polling: 100, timeout: 30_000 });

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
    await page.waitForFunction(() => window.__apex != null, { polling: 100, timeout: 30_000 });
    const backend = await page.evaluate(() => GLX.backend);
    expect(backend).toBeUndefined();   // plain GLX carries no backend id
  });

  test("track renders a non-blank frame on TLX (M2 world geometry)", async ({ page }) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(m.text()); });
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { polling: 100, timeout: 30_000 });
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => window.__apex.info().track != null, { polling: 100, timeout: 60_000 });
    await page.evaluate(() => window.__apex.park(0));
    await page.waitForTimeout(400);
    await stopRendering(page);
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
    await page.waitForFunction(() => window.__apex != null, { polling: 100, timeout: 30_000 });
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => window.__apex.info().track != null, { polling: 100, timeout: 60_000 });
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
    expect(st.hdr).toBe(true);     // M8: post chain renders into a float scene target
    expect(errors).toEqual([]);
  });

  test("M8 post chain resolves a day race (HDR target, bloom live)", async ({ page }) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(m.text()); });
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { polling: 100, timeout: 30_000 });
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => window.__apex.info().track != null, { polling: 100, timeout: 60_000 });
    await page.evaluate(() => window.__apex.park(0.1));
    await page.waitForTimeout(600);
    const st = await page.evaluate(() => GLX.__tlx.postState());
    expect(st.on).toBe(true);
    expect(st.hdr).toBe(true);
    expect(st.blocks.bloom).toBe(true);     // day defaults keep bloomAmt > 0
    expect(st.blocks.fxaa).toBe(true);      // the unconditional LDR resolve
    expect(st.targets[0]).toBeGreaterThan(0);
    expect(st.targets[1]).toBeGreaterThan(0);
    // The chain must still produce a real image on the canvas.
    await stopRendering(page);
    const buf = await page.locator("canvas#game").screenshot();
    expect(buf.length).toBeGreaterThan(5000);
    expect(errors).toEqual([]);
  });

  test("M8 godray path arms on a night race (lamp snapshot consumed)", async ({ page }) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(m.text()); });
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { polling: 100, timeout: 30_000 });
    await page.evaluate(() => window.__apex.race("singapore"));
    await page.waitForFunction(() => window.__apex.info().track != null, { polling: 100, timeout: 60_000 });
    await page.evaluate(() => window.__apex.park(0.1));
    // Singapore night: lampVol > 0 opens the volumetric pass, and the lamp
    // spot map arms per frame — present() snapshots the armed flag for the
    // godray lamp-index mapping before clearArmed() retires it.
    await page.waitForFunction(() => GLX.__tlx.postState().blocks.shafts === true, { polling: 100, timeout: 60_000 });
    const st = await page.evaluate(() => ({
      post: GLX.__tlx.postState(),
      lamp: GLX.lampShadowState(),
    }));
    expect(st.post.on).toBe(true);
    expect(st.post.blocks.shafts).toBe(true);   // lamp volumetrics marched
    expect(st.lamp.arms).toBeGreaterThan(0);    // spot map armed -> snapshot taken
    expect(errors).toEqual([]);
  });

  test("M5 sky arms on a race frame and honours the night gate", async ({ page }) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(m.text()); });
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { polling: 100, timeout: 30_000 });
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => window.__apex.info().track != null, { polling: 100, timeout: 60_000 });
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
    await page.waitForFunction(() => GLX.__tlx.skyState().stars === 1, { polling: 100, timeout: 60_000 });
    const night = await page.evaluate(() => GLX.__tlx.skyState());
    expect(night.on).toBe(true);
    expect(night.stars).toBe(1);
    expect(errors).toEqual([]);
  });

  test("M6 FX paths record on a night race (glow halos, blob shadows, decals)", async ({ page }) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(m.text()); });
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { polling: 100, timeout: 30_000 });
    await page.evaluate(() => window.__apex.race("singapore"));
    await page.waitForFunction(() => window.__apex.info().track != null, { polling: 100, timeout: 60_000 });
    await page.evaluate(() => window.__apex.park(0.1));
    // Singapore is a night race: floodlights populate frame.lights and the
    // glare-halo pass runs. Wait for a presented frame that carried FX.
    await page.waitForFunction(() => GLX.__tlx.fxState().glow > 0, { polling: 100, timeout: 60_000 });
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
    await page.waitForFunction(() => window.__apex != null, { polling: 100, timeout: 30_000 });
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => window.__apex.info().track != null, { polling: 100, timeout: 60_000 });
    // A SLIDING CAR, HELD SLIDING — not a crashed one.
    //
    // This test asserted something unreachable for its whole life, and the
    // reason is two mistakes stacked. Measured with tests/manual/skid-probe:
    //
    //   1. Marks are NOT "recorded in the physics step". `skids.stamp()` is
    //      called from js/game.js:6064, inside `render(dt)` — so a stint driven
    //      entirely through `act()`, which steps physics without ever
    //      presenting a frame, cannot lay a single mark however hard it slides.
    //   2. 120 steps of full lock is not a slide, it is a crash. Stepping the
    //      old stint one frame at a time: the stamp condition
    //      (|slip| > 8.59 deg and speed > 10) holds over steps 24..37 — slip
    //      peaking at 12.3 deg with the car still at 56 m/s — and then the car
    //      reaches the barrier at x 13.9, slip snaps to exactly 0, and it
    //      decelerates into rescue. By step 120 it sits at 2.5 m/s with zero
    //      slip: below BOTH gates, permanently.
    //
    // So the wait could never come true, and every investigation that treated
    // the timeout as a symptom of a slow wait was looking at the wrong end of
    // the pipeline. (`GLX.drawSkidBatch` returns early on vertCount 0, which is
    // why "no marks laid" and "never called" read identically from outside.)
    //
    // Stop inside the window instead, then freeze — freeze() pauses physics but
    // NOT rendering, so skidIntensity and speed are held at their sliding
    // values and every presented frame stamps. One frame lays the mark, the
    // next draws the batch.
    await page.evaluate(() => {
      window.__apex.jump(0.1, 70);
      window.__apex.act({ steer: 1, throttle: true }, 1 / 60, 30);
    });
    await page.evaluate(() => window.__apex.freeze(true));
    // Two presented frames, and a TLX frame on a built Monza under SwiftShader
    // is seconds, not milliseconds — so this bound is generous on purpose.
    await page.waitForFunction(() => GLX.__tlx.fxState().skidVerts > 0, { polling: 100, timeout: 60_000 });
    const st = await page.evaluate(() => GLX.__tlx.fxState());
    expect(st.skidVerts).toBeGreaterThan(0);
    expect(st.skidVerts % 6).toBe(0);          // 6 verts per mark
    expect(errors).toEqual([]);
  });

  test("M7 chunked path culls and frees the source arrays on a street circuit", async ({ page }) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(m.text()); });
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { polling: 100, timeout: 30_000 });
    await page.evaluate(() => window.__apex.race("singapore"));
    await page.waitForFunction(() => window.__apex.info().track != null, { polling: 100, timeout: 60_000 });
    await page.evaluate(() => window.__apex.park(0.1));
    // Wait for a presented frame that carried chunked records (props + glass).
    await page.waitForFunction(() => GLX.__tlx.chunkState().total > 0, { polling: 100, timeout: 60_000 });
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

  test("M9 env probe captures a full cube on a parked race (car reflections live)", async ({ page }) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(m.text()); });
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { polling: 100, timeout: 30_000 });
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => window.__apex.info().track != null, { polling: 100, timeout: 60_000 });
    // The probe only runs when CAR ENV REFLECTION (carEnvCube) > 0 — many
    // shipped profiles default it to 0, so opt the knob on for this test.
    await page.evaluate(() => window.__apex.lightTune({ carEnvCube: 0.6 }));
    await page.evaluate(() => window.__apex.park(0.1));
    // A full 6-face cube takes ~12 frames (one face every OTHER frame); wait on
    // the ready flag rather than a fixed sleep (SwiftShader is slow).
    await page.waitForFunction(() => {
      const e = GLX.__tlx.envState();
      return e && e.on && e.ready;
    }, { polling: 100, timeout: 60_000 });
    const st = await page.evaluate(() => ({
      env: GLX.__tlx.envState(),
      readyHook: GLX.envProbeReady(),
    }));
    expect(st.env.on).toBe(true);
    expect(st.env.size).toBe(64);
    expect(st.env.ready).toBe(true);
    expect(st.readyHook).toBe(true);
    // Still a real image on the canvas (the probe pass must not strand the frame).
    // Safe to stop the loop here: the probe's own `ready` flag was awaited
    // above, so the six cube faces are already captured.
    await stopRendering(page);
    const buf = await page.locator("canvas#game").screenshot();
    expect(buf.length).toBeGreaterThan(5000);
    expect(errors).toEqual([]);
  });

  test("M9 gpuTimer is contract-legal on the WebGL2 fallback (SwiftShader)", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { polling: 100, timeout: 30_000 });
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => window.__apex.info().track != null, { polling: 100, timeout: 60_000 });
    const st = await page.evaluate(() => {
      const before = GLX.gpuTimer();
      const on = GLX.gpuTimer(true);
      const ms = GLX.gpuMs();
      GLX.gpuTimer(false);
      return { before, on, ms };
    });
    // tlxForceGL pins three on WebGL2 (SwiftShader in CI): no timestamp-query
    // feature, so the timer reports unsupported and never turns on — the exact
    // {supported:false} shape GLX returns on SwiftShader. gpuMs stays -1.
    expect(typeof st.before.supported).toBe("boolean");
    expect(st.before.supported).toBe(false);
    expect(st.on.supported).toBe(false);
    expect(st.on.on).toBe(false);      // can't enable an unsupported timer
    expect(st.ms).toBe(-1);
  });

  test("M4 shadow-state hooks report through the TLX surface (car + lamp)", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { polling: 100, timeout: 30_000 });
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => window.__apex.info().track != null, { polling: 100, timeout: 60_000 });
    await page.evaluate(() => window.__apex.park(0.1));
    await page.waitForFunction(() => GLX.carShadowState().arms > 0, { polling: 100, timeout: 30_000 });
    const st = await page.evaluate(() => ({ car: GLX.carShadowState(), lamp: GLX.lampShadowState() }));
    expect(st.car.enabled).toBe(true);
    expect(st.car.arms).toBeGreaterThan(0);
    expect(typeof st.lamp.enabled).toBe("boolean");
    expect(st.lamp.idx).toBe(-1);      // Monza day never opens the lamp pass
  });

  test("M10 track builds its meshes through the injected TLX backend (façade wiring)", async ({ page }) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(m.text()); });
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { polling: 100, timeout: 30_000 });
    // Singapore is a street circuit: the build emits both plain meshes
    // (floor/road/terrain/water/gate/startline) AND chunked meshes (props +
    // glass), so it exercises createMesh AND createChunkedMesh on the backend.
    await page.evaluate(() => window.__apex.race("singapore"));
    await page.waitForFunction(() => window.__apex.info().track != null, { polling: 100, timeout: 60_000 });
    await page.evaluate(() => window.__apex.park(0.1));
    await page.waitForTimeout(400);
    const st = await page.evaluate(() => ({
      backend: GLX.backend,
      mesh: GLX.__tlx.meshState(),
      geo: window.__apex.trackGeometry(),
    }));
    // TLX is the active backend...
    expect(st.backend).toBe("three");
    // ...and tracks.js routed its mesh builds through it. game.js hands the
    // active backend to Tracks.build via opts.gfx; tracks.js resolves that
    // handle (not a hardcoded GLX — GLX's WebGL2 context is never init'd on the
    // TLX opt-in path) and creates every mesh on it. Non-zero counts prove the
    // whole façade wiring carried the build.
    expect(st.mesh.mesh).toBeGreaterThan(0);        // floor/road/terrain/... via createMesh
    expect(st.mesh.chunked).toBeGreaterThan(0);     // props + glass via createChunkedMesh
    // The build produced real geometry to hand back (proves it actually ran).
    expect(st.geo).not.toBeNull();
    expect(st.geo.road).toBeTruthy();
    expect(st.geo.terrain).toBeTruthy();
    expect(errors).toEqual([]);
  });

  test("menu is reachable and canvas is sized (no-track begin/present path)", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { polling: 100, timeout: 30_000 });
    await expect(page.locator("#mb-race")).toBeVisible();
    const dims = await page.evaluate(() => {
      const c = document.getElementById("game");
      return { w: c.width, h: c.height };
    });
    expect(dims.w).toBeGreaterThan(0);
    expect(dims.h).toBeGreaterThan(0);
  });
});
