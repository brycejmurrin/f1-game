// @ts-check
// TLX backend probes — the three.js/TSL renderer behind apex26.gfxBackend="three".
// Mirrors webgl-probes.spec.js's role for GLX: boot integrity, backend identity
// (the descriptor-copy install onto the GLX object), and a console/GL-error
// scrape. CI runs three's WebGL2 fallback on SwiftShader (no WebGPU headless),
// pinned via apex26.tlxForceGL so local repros match CI exactly.
// Grows per milestone: M2 pixel-nonblank, M3+ __tlx shader-dump/?viz= hooks.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("apex26.gfxBackend", "three");
      localStorage.setItem("apex26.tlxForceGL", "1");
    } catch (_) {}
  });
});

/* Call headless(true) before canvas screenshots — park() freezes physics, not
   rendering. smoke.spec.js measured 88–96 s vs 29–32 s once the loop stops.
   Present a frame first (wait on readiness), then headless(true). */
async function stopRendering(page) {
  await page.evaluate(() => window.__apex.headless(true));
  await page.waitForTimeout(50);
}

test.describe("TLX — boot", () => {
  /* Budget raised: TLX boot + SwiftShader render is slow. M6/M9 failures were
     test defects (rAF polling starvation; skid marks need render(), not act()).
     See docs/TESTING.md and docs/archive/manual-probes/skid-probe.spec.js. */
  test.slow();

  test("boots with the TLX backend installed on the GLX object", async ({ page }) => {
    const errors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && !/favicon/i.test(msg.text())) errors.push(msg.text());
    });
    await page.goto("/");
    // BOOT_MS, not a hand-rolled 30 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });

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
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    const backend = await page.evaluate(() => GLX.backend);
    expect(backend).toBeUndefined();   // plain GLX carries no backend id
  });

  test("the canvas is OPAQUE — the tag in alpha can never become opacity", async ({ page }) => {
    // The source guard (tests/unit/gfx-backend-canary.test.mjs) proves TLX ASKS
    // for an opaque canvas. It cannot prove it GOT one: getContext returns any
    // context the canvas already has and silently discards the attributes, so
    // one earlier probe touching canvas#game would undo the fix with nothing to
    // see. Only the live context can answer, and the answer is why the painted
    // bodywork of a car is not 35% see-through (js/render/three/tlx.js).
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    const attrs = await page.evaluate(() => {
      const cv = document.querySelector("canvas#game");
      const gl = cv && cv.getContext("webgl2");
      // CI pins tlxForceGL, so this is the WebGL backend. A WebGPU-backed canvas
      // hands back null here — which is itself the proof it is not WebGL2.
      return gl ? { got: true, alpha: gl.getContextAttributes().alpha } : { got: false };
    });
    expect(attrs.got).toBe(true);
    expect(attrs.alpha).toBe(false);
  });

  test("track renders a non-blank frame on TLX (M2 world geometry)", async ({ page }) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(m.text()); });
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: 60_000 });
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
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: 60_000 });
    await page.evaluate(() => window.__apex.park(0.1));
    // Same wait as the sibling "shadow-state hooks" test: a fixed 600 ms
    // evaluate races a SwiftShader frame that can still be inside present(),
    // so the test timeout fires before carShadowState() is even readable.
    await page.waitForFunction(() => typeof GLX !== "undefined" && GLX.carShadowState && GLX.carShadowState().arms > 0, null, { polling: 100, timeout: 90_000 });
    const st = await page.evaluate(() => ({
      car: GLX.carShadowState(),
      lamp: GLX.lampShadowState(),
      pcss: GLX.pcss(),
      hdr: GLX.hdrMode(),
      software: !!(GLX.backendState && (GLX.backendState().softAdapter || GLX.backendState().softwareGL)),
    }));
    // Desktop headless = full tier: all three maps exist; the per-frame car
    // pass has armed at least once by now. Monza day never opens the lamp
    // pass (night-gated in game.js), so its arms stay 0 / idx -1.
    expect(st.car.enabled).toBe(true);
    expect(st.car.arms).toBeGreaterThan(0);
    expect(st.lamp.enabled).toBe(true);
    expect(st.lamp.arms).toBe(0);
    expect(st.lamp.idx).toBe(-1);
    // PCSS is the blocker map (tlx-shadow.js): its setup succeeds on a real
    // GPU on EITHER backend (macos-latest Metal read true on WebGL2 in run
    // 2221 and on WebGPU in 2217/2218) and fails on SwiftShader, where this
    // box and the ubuntu runners land. Pin the software answer; on hardware
    // only require the surface to report.
    if (st.software) expect(st.pcss).toBe(false);
    else expect(typeof st.pcss).toBe("boolean");
    expect(st.hdr).toBe(true);     // M8: post chain renders into a float scene target
    expect(errors).toEqual([]);
    // Freeze the loop before Playwright tears the page down. Leaving TLX
    // presenting on SwiftShader starves the next spec's first frame
    // (M5 after this test was 250–313 s; the GPU process was still filling
    // the previous page). Test-only; no product change.
    await stopRendering(page);
  });

  test("M8 post chain resolves a day race (HDR target, bloom live)", async ({ page }) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(m.text()); });
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: 60_000 });
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
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => window.__apex.race("singapore"));
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: 60_000 });
    await page.evaluate(() => window.__apex.park(0.1));
    // Singapore night: lampVol > 0 opens the volumetric pass, and the lamp
    // spot map arms per frame — present() snapshots the armed flag for the
    // godray lamp-index mapping before clearArmed() retires it.
    await page.waitForFunction(() => typeof GLX !== "undefined" && GLX.__tlx && GLX.__tlx.postState().blocks.shafts === true, null, { polling: 100, timeout: 60_000 });
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
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: 60_000 });
    await page.evaluate(() => window.__apex.park(0.1));
    // Same pattern as M4: a fixed sleep + evaluate races a SwiftShader
    // present() and turns a 10 s test into a 250 s one (measured).
    await page.waitForFunction(() => typeof GLX !== "undefined" && GLX.__tlx && GLX.__tlx.skyState().on === true, null, { polling: 100, timeout: 90_000 });
    const day = await page.evaluate(() => GLX.__tlx.skyState());
    // Day race: the background node is armed each frame, stars flag off.
    expect(day.on).toBe(true);
    expect(day.stars).toBe(0);
    expect(day.sunDir[1]).toBeGreaterThan(0);   // sun above the horizon
    expect(errors).toEqual([]);
    // Night uStars=1 lives on the Singapore M6/M8 path. A second race() or
    // setTimeOfDay("night") here calls loadTrack() while TLX is still
    // presenting, and that evaluate does not return on SwiftShader
    // (530 s+ hang, GPU 387%, measured four times this session).
    await stopRendering(page);
  });

  test("M6 FX paths record on a night race (glow halos, blob shadows, decals)", async ({ page }) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(m.text()); });
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => window.__apex.race("singapore"));
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: 60_000 });
    await page.evaluate(() => window.__apex.park(0.1));
    // Singapore is a night race: floodlights populate frame.lights and the
    // glare-halo pass runs. Wait for a presented frame that carried FX.
    await page.waitForFunction(() => typeof GLX !== "undefined" && GLX.__tlx && GLX.__tlx.fxState().glow > 0, null, { polling: 100, timeout: 60_000 });
    const st = await page.evaluate(() => ({ fx: GLX.__tlx.fxState(), sky: GLX.__tlx.skyState() }));
    expect(st.fx.on).toBe(true);
    expect(st.fx.glow).toBeGreaterThan(0);        // near-field lamp halos in view
    expect(st.fx.shadows).toBeGreaterThan(0);     // blob shadows under the field
    expect(st.fx.decals).toBeGreaterThan(0);      // car number/sponsor decals
    // M5's night half used to live here as a same-page Monza rebuild; the
    // uStars gate is the same SKY_FS nightSky step, asserted on this already-
    // presented Singapore frame instead.
    expect(st.sky.on).toBe(true);
    expect(st.sky.stars).toBe(1);
    expect(errors).toEqual([]);
  });

  test("M6 skid batch records after a hard driven stint", async ({ page }) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(m.text()); });
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: 60_000 });
    // A SLIDING CAR, HELD SLIDING — not a crashed one.
    // skids.stamp() runs in render(), not act(). Stop inside the slide window,
    // then freeze() — freeze pauses physics but not rendering, so presented
    // frames stamp. See docs/archive/manual-probes/skid-probe.spec.js and docs/TESTING.md.
    //
    // park() FIRST, and the reason is the whole point of this comment. jump()
    // teleports the player and nothing else, so it lands in the middle of
    // whatever the AI field is doing at that wall-clock instant — and how far
    // the field has travelled by then is a function of how many frames the box
    // rendered while the waitForFunction above was polling. On a slow frame the
    // player arrives clean and slides; on a fast one it arrives inside the pack,
    // is hit, and ends the burst at 0.75 m/s (measured: s=588.2958561730244,
    // x=8.06, byte-identical across runs). skids.stamp()'s gate is
    // `(skid > 0.25 || offroad) && speed > 10` — a stopped car can never lay a
    // mark, so that outcome is not a slow assertion, it is an unsatisfiable one,
    // and the spec burns the full 360 s timeout. Measured flipping with
    // RENDERER-ONLY commits either way (00bca5b red, 08b96a3 green, both with
    // identical physics), which is what identifies the setup, not the backend,
    // as the variable. park() is the shipped hook that shoves the field 600 m
    // back (js/agent/apex.js) and pins state to "race" — the stint is then solo
    // and the outcome no longer depends on frame pacing.
    //
    // THE STINT LENGTH IS LOAD-BEARING TOO. 30 frames only ever laid marks
    // because the seam-wall bug (fixed in 32b6c55: scanBarrier's sign-lossy
    // node wrap read undefined spans just before the start line) left this
    // wall MISSING, so the burst flew straight into the grass. With the wall
    // restored, frame 30 has the car pinned against it at x=7.9 with monza
    // hw=8.0 — on-road by 10 cm, slip killed by the barrier scrub — and the
    // gate above is deterministically unsatisfiable (measured byte-identical:
    // vLat=0, x=7.900000095367432 across runs). Held longer, the burst walks
    // OVER the low barrier onto the grass: step-walked on current physics,
    // the stamp gate holds for steps 47..80 (x 8.2→9.2 offroad, speed 38→10).
    // 55 frames stops mid-window — x=9.21, speed 29 — margin on both sides.
    //
    // freeze() IN THE SAME evaluate as the stint. An off-road end state is
    // TRANSIENT: each spec round trip lets live rAF frames run, and one
    // SwiftShader frame is seconds of sim time — grass drag and the wrong-way/
    // beached recovery mangle the slide before a separate freeze() call lands
    // (measured: premise green, then the wait died on a recovered car). Atomic
    // stint+freeze pins the measured window state exactly; the premise reads
    // AFTER freeze, from state that can no longer move.
    await page.evaluate(() => {
      window.__apex.park(0.1);
      window.__apex.jump(0.1, 70);
      window.__apex.act({ steer: 1, throttle: true }, 1 / 60, 55);
      window.__apex.freeze(true);
    });
    // Assert the PREMISE before waiting 60 s on its consequence: a car that is
    // no longer driving (or that never left the road) reports that in a second,
    // instead of as a timeout whose message names the renderer.
    const drive = await page.evaluate(() => window.__apex.physState());
    expect(drive.speed).toBeGreaterThan(10);
    expect(Math.abs(drive.x)).toBeGreaterThan(8);
    // Two presented frames, and a TLX frame on a built Monza under SwiftShader
    // is seconds, not milliseconds — so this bound is generous on purpose.
    await page.waitForFunction(() => typeof GLX !== "undefined" && GLX.__tlx && GLX.__tlx.fxState().skidVerts > 0, null, { polling: 100, timeout: 60_000 });
    const st = await page.evaluate(() => GLX.__tlx.fxState());
    expect(st.skidVerts).toBeGreaterThan(0);
    expect(st.skidVerts % 6).toBe(0);          // 6 verts per mark
    expect(errors).toEqual([]);
  });

  test("M7 chunked path culls and frees the source arrays on a street circuit", async ({ page }) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(m.text()); });
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => window.__apex.race("singapore"));
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: 60_000 });
    await page.evaluate(() => window.__apex.park(0.1));
    // Wait for a presented frame that carried chunked records (props + glass).
    await page.waitForFunction(() => typeof GLX !== "undefined" && GLX.__tlx && GLX.__tlx.chunkState().total > 0, null, { polling: 100, timeout: 60_000 });
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
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: 60_000 });
    // The probe only runs when CAR ENV REFLECTION (carEnvCube) > 0 — many
    // shipped profiles default it to 0, so opt the knob on for this test.
    await page.evaluate(() => window.__apex.lightTune({ carEnvCube: 0.6 }));
    await page.evaluate(() => window.__apex.park(0.1));
    // A full 6-face cube takes ~12 frames (one face every OTHER frame); wait on
    // the ready flag rather than a fixed sleep (SwiftShader is slow).
    await page.waitForFunction(() => {
      const e = GLX.__tlx.envState();
      return e && e.on && e.ready;
    }, null, { polling: 100, timeout: 60_000 });
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
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: 60_000 });
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
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: 60_000 });
    await page.evaluate(() => window.__apex.park(0.1));
    await page.waitForFunction(() => typeof GLX !== "undefined" && GLX.carShadowState().arms > 0, null, { polling: 100, timeout: 30_000 });
    const st = await page.evaluate(() => ({ car: GLX.carShadowState(), lamp: GLX.lampShadowState() }));
    expect(st.car.enabled).toBe(true);
    expect(st.car.arms).toBeGreaterThan(0);
    expect(typeof st.lamp.enabled).toBe("boolean");
    expect(st.lamp.idx).toBe(-1);      // Monza day never opens the lamp pass
    await stopRendering(page);
  });

  test("M10 track builds its meshes through the injected TLX backend (façade wiring)", async ({ page }) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(m.text()); });
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    // Singapore is a street circuit: the build emits both plain meshes
    // (floor/road/terrain/water/gate/startline) AND chunked meshes (props +
    // glass), so it exercises createMesh AND createChunkedMesh on the backend.
    await page.evaluate(() => window.__apex.race("singapore"));
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: 60_000 });
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
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    await expect(page.locator("#mb-race")).toBeVisible();
    const dims = await page.evaluate(() => {
      const c = document.getElementById("game");
      return { w: c.width, h: c.height };
    });
    expect(dims.w).toBeGreaterThan(0);
    expect(dims.h).toBeGreaterThan(0);
  });
});
