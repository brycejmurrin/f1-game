// @ts-check
// Player camera modes: cycling via the __apex.camera hook + the CAM button,
// persistence, finite distinct rig poses, and representative rendered views.
// Hook/control checks use headless builds; the representative pixel check explicitly renders.
// Modes: chase, far, drift, cockpit, hood, overhead, heli, reverse, side,
//        cinematic, low, tcam, rear, visor, trackside, rival, pitwall, drone, helmet.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { frameContent, frameDelta, screenshotPixels } from "../helpers/visual-oracle.js";
import { screenshotPresentedCanvas } from "../helpers/presented-canvas.js";


test.describe("Apex 26 — player camera modes", () => {
  test("camera() reports all modes and switches by id, index and label", async ({ page, loadTrack }) => {
    await loadTrack("monza", "day", "dry", { headless: true });
    const r = await page.evaluate(() => {
      const init = window.__apex.camera();
      const byId = window.__apex.camera("cockpit");
      const byIdx = window.__apex.camera(0);
      const bad = window.__apex.camera("banana");
      return { init, byId, byIdx, bad };
    });
    expect(r.init.modes).toEqual(["chase", "far", "drift", "cockpit", "hood", "overhead", "heli", "reverse", "side", "cinematic", "low", "tcam", "rear", "visor", "trackside", "rival", "pitwall", "drone", "tv", "helmet"]);
    expect(r.byId.mode).toBe("cockpit");
    expect(r.byIdx.mode).toBe("chase");
    expect(r.bad).toBe(false);            // unknown mode is rejected, not crashed
  });

  test("the CAM button cycles through every mode and wraps", async ({ page, loadTrack }) => {
    await loadTrack("monza", "day", "dry", { headless: true });
    const seq = await page.evaluate(() => {
      window.__apex.camera(0);            // start at chase
      const out = [];
      const btn = document.getElementById("btn-cam");
      const count = window.__apex.camera().modes.length;
      for (let i = 0; i < count + 1; i++) {   // all modes + wrap back to the first
        out.push(window.__apex.camera().mode);
        btn.click();
      }
      return out;
    });
    expect(seq).toEqual(["chase", "far", "drift", "cockpit", "hood", "overhead", "heli", "reverse", "side", "cinematic", "low", "tcam", "rear", "visor", "trackside", "rival", "pitwall", "drone", "tv", "helmet", "chase"]);
  });

  test("camera choice persists across a reload", async ({ page, loadTrack }) => {
    await loadTrack("monza", "day", "dry", { headless: true });
    await page.evaluate(() => window.__apex.camera("hood"));
    // Reload and start a new race with the saved camera choice.
    await loadTrack("monza", "day", "dry", { headless: true });
    const mode = await page.evaluate(() => window.__apex.camera().mode);
    expect(mode).toBe("hood");
  });

  test("camera rigs have finite distinct poses and representative views render distinct frames", async ({ page, loadTrack }) => {
    test.slow();   // render-project test on CPU GL: needs more than the default budget
    const errors = [];
    page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
    await page.setViewportSize({ width: 640, height: 360 });
    await loadTrack("monza", "day", "dry", { headless: true });
    await page.evaluate(() => { window.__apex.jump(0.0, 50, 0); window.__apex.snapCam(); });
    const MODES = ["chase", "far", "drift", "cockpit", "hood", "overhead", "heli",
                   "reverse", "side", "cinematic", "low", "tcam", "rear", "visor", "trackside",
                   "rival", "pitwall", "drone", "helmet"];
    // `tv` is a director meta-mode (dbgCam cuts); excluded from distinct-vantage
    // sampling — it has no fixed framing of its own.
    // MEASURED: locator.screenshot() costs ~21.9 s per call on this SwiftShader
    // box (camera switch 4 ms, 30 physics steps 32 ms). Capturing all modes was
    // ~284 s of screenshots alone, which is what pushed this past its 120 s budget
    // and made it the slowest test in the suite by 3x. It is the compositor frame
    // that is expensive, not the encode — JPEG q60 was tried and came out WORSE.
    //
    // Check every rig's state; sample actual rendered content for three
    // representative views below at a smaller viewport to bound capture cost.
    //
    // snapCam() is REQUIRED here: the rig only moves during render(), and step()
    // does not render — without it every mode reports the PREVIOUS vantage and all
    // modes read identical.
    const vantages = {};
    for (const mode of MODES) {
      await page.evaluate((m) => { window.__apex.camera(m); window.__apex.snapCam(); }, mode);
      vantages[mode] = await page.evaluate(() => {
        const c = window.__apex.camState();
        const pose = [...c.eye, ...(c.tgt || c.target), c.fov];
        if (!pose.every(Number.isFinite)) throw new Error("camera has non-finite pose");
        return pose.map((v) => +v.toFixed(2)).join(",");
      });
    }
    // Representative chase, onboard and remote views must actually draw.
    const shots = {};
    await page.evaluate(() => { window.__apex.freeze(true); window.__apex.headless(true); });
    for (const mode of ["chase", "cockpit", "overhead"]) {
      await page.evaluate(async (m) => {
        const a = window.__apex;
        a.camera(m);
        const ready = GLX.softPresent?.() ? GLX.awaitSoftPresent(60_000) : null;
        try {
          a.snapCam(true); // arm and paint exactly this camera
          a.headless(true); // snapCam(true) enables the live loop; quiet it now
          if (ready) await ready;
          else await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        } finally { a.headless(true); }
      }, mode);
      const chrome = await page.addStyleTag({ content: "body > :not(canvas):not(script):not(style) { visibility:hidden !important } dialog::backdrop { background:transparent !important }" });
      try {
        shots[mode] = await screenshotPixels(page, (await screenshotPresentedCanvas(page, { skipAwait: true })).buf);
        expect(frameContent(shots[mode]).nonblank, `${mode} presented meaningful pixels`).toBe(true);
      } finally { await chrome.evaluate(el => el.remove()); }
    }
    await page.evaluate(() => { window.__apex.headless(true); window.__apex.freeze(false); });
    expect(errors).toEqual([]);
    // No two modes collapse to the same vantage...
    const vv = Object.values(vantages);
    expect(new Set(vv).size).toBe(vv.length);
    for (const [a, b] of [["chase", "cockpit"], ["chase", "overhead"], ["cockpit", "overhead"]]) {
      expect(frameDelta(shots[a], shots[b]), `${a} and ${b} must present different views`).toBeGreaterThan(1);
    }
  });

  // The chase rig has two branches: car-anchored when the player has a world
  // pose (px/pz), road-frame when it doesn't — and they place the eye over a
  // metre apart laterally. update() returns early during the countdown, so if
  // gridUp() doesn't seed the pose, the grid is framed by the road-frame branch
  // and the camera slides sideways the instant lights-out runs the first tick.
  test("the player has a world pose on the grid, so the chase rig doesn't switch at lights-out", async ({ page, loadTrack }) => {
    await page.goto("/");
    // BOOT_MS, not a hand-rolled 8 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => window.__apex.headless(true));
    await page.evaluate(() => window.__apex.race("monza", "day", "dry"));
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
    const r = await page.evaluate(() => {
      window.__apex.freeze(true);        // hold the countdown: state must stay "count"
      // physState() returns null while player.px is unset, and no car physics has
      // run yet (update() early-returns in "count") — so a non-null read here can
      // only come from gridUp having seeded the pose.
      return { state: window.__apex.info().state, hasWorldPose: window.__apex.physState() != null };
    });
    expect(r.state).toBe("count");
    expect(r.hasWorldPose).toBe(true);
  });

  test("the C key cycles the camera during a race", async ({ page, loadTrack }) => {
    await loadTrack("monza", "day", "dry", { headless: true });
    const r = await page.evaluate(async () => {
      window.__apex.camera(0);
      const before = window.__apex.camera().mode;
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyC" }));
      window.__apex.step(1 / 60, 1);       // update() consumes the edge-triggered key
      const after = window.__apex.camera().mode;
      return { before, after };
    });
    expect(r.before).toBe("chase");
    expect(r.after).toBe("far");
  });
});
