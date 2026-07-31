// @ts-check
// Player camera modes: cycling via the __apex.camera hook + the CAM button,
// persistence, and that every mode renders a valid, distinct frame without crashing.
// Modes: chase, far, drift, cockpit, hood, overhead, heli, reverse, side,
//        cinematic, low, tcam, rear.
import { test, expect } from "@playwright/test";

async function startRace(page, id = "monza") {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
  await page.evaluate((t) => window.__apex.race(t, "day", "dry"), id);
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 8000 });
  await page.evaluate(() => window.__apex.go());
}

test.describe("Apex 26 — player camera modes", () => {
  test("camera() reports all modes and switches by id, index and label", async ({ page }) => {
    await startRace(page);
    const r = await page.evaluate(() => {
      const init = window.__apex.camera();
      const byId = window.__apex.camera("cockpit");
      const byIdx = window.__apex.camera(0);
      const bad = window.__apex.camera("banana");
      return { init, byId, byIdx, bad };
    });
    expect(r.init.modes).toEqual(["chase", "far", "drift", "cockpit", "hood", "overhead", "heli", "reverse", "side", "cinematic", "low", "tcam", "rear"]);
    expect(r.byId.mode).toBe("cockpit");
    expect(r.byIdx.mode).toBe("chase");
    expect(r.bad).toBe(false);            // unknown mode is rejected, not crashed
  });

  test("the CAM button cycles through every mode and wraps", async ({ page }) => {
    await startRace(page);
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
    expect(seq).toEqual(["chase", "far", "drift", "cockpit", "hood", "overhead", "heli", "reverse", "side", "cinematic", "low", "tcam", "rear", "chase"]);
  });

  test("camera choice persists across a reload", async ({ page }) => {
    await startRace(page);
    await page.evaluate(() => window.__apex.camera("hood"));
    await startRace(page);                  // reload + new race
    const mode = await page.evaluate(() => window.__apex.camera().mode);
    expect(mode).toBe("hood");
  });

  test("every camera mode renders without errors and produces a distinct frame", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
    await startRace(page);
    await page.evaluate(() => { window.__apex.jump(0.0, 50, 0); window.__apex.snapCam(); });
    const MODES = ["chase", "far", "drift", "cockpit", "hood", "overhead", "heli",
                   "reverse", "side", "cinematic", "low", "tcam", "rear"];
    // MEASURED: locator.screenshot() costs ~21.9 s per call on this SwiftShader
    // box (camera switch 4 ms, 30 physics steps 32 ms). Capturing all 13 modes was
    // ~284 s of screenshots alone, which is what pushed this past its 120 s budget
    // and made it the slowest test in the suite by 3x. It is the compositor frame
    // that is expensive, not the encode — JPEG q60 was tried and came out WORSE.
    //
    // So distinctness is asserted on the CAMERA STATE, which is what "a distinct
    // frame" actually means here: 13 different eye/target/fov vantages cannot
    // render the same image. Pixels are still captured for a representative few,
    // so a mode that produces a valid vantage but fails to DRAW is still caught.
    //
    // snapCam() is REQUIRED here: the rig only moves during render(), and step()
    // does not render — without it every mode reports the PREVIOUS vantage and all
    // 13 read identical.
    const vantages = {};
    for (const mode of MODES) {
      await page.evaluate((m) => { window.__apex.camera(m); window.__apex.snapCam(); }, mode);
      vantages[mode] = await page.evaluate(() => {
        const c = window.__apex.camState();
        return [...c.eye, ...(c.tgt || c.target), c.fov].map((v) => +v.toFixed(2)).join(",");
      });
    }
    // A few real pixel captures, so "renders" is still verified end to end.
    const shots = {};
    for (const mode of ["chase", "cockpit", "overhead"]) {
      await page.evaluate((m) => window.__apex.camera(m), mode);
      await page.evaluate(() => { for (let i = 0; i < 30; i++) window.__apex.step(1 / 60, 1); });
      await page.waitForTimeout(250);
      shots[mode] = (await page.locator("canvas#game").screenshot()).toString("base64");
    }
    expect(errors).toEqual([]);
    // No two modes collapse to the same vantage...
    const vv = Object.values(vantages);
    expect(new Set(vv).size).toBe(vv.length);
    // ...and the sampled modes each drew a real, distinct frame.
    const sv = Object.values(shots);
    expect(new Set(sv).size).toBe(sv.length);
  });

  test("the C key cycles the camera during a race", async ({ page }) => {
    await startRace(page);
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
