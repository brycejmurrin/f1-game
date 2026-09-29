// @ts-check
// HUD REAR-VIEW MIRROR, live on the two WebGL2 backends this box can run
// (GLX, and TLX on three's WebGL2 path). A unit test cannot say the mirror
// renders — each backend owns its own target and composite — so this boots a
// race and asks the backend itself: mirrorState() counts the passes it
// rendered and the composites it drew into the #hud-mirror rect. Then the
// MIRROR key turns it off and the composite stops being asked for.
// WGX (WebGPU) is not bootable here; its gate is gpu-census.yml.
//
// COST: one Red Bull Ring build per backend (the lightest season circuit), a
// handful of frames at the 0.5 render-scale floor with the car frozen.
import { test, expect, BOOT_MS, TRACK_MS, awaitTrackBuild } from "../helpers/fixtures.js";
import { awaitPresentedFrame } from "../helpers/presented-canvas.js";

const FRAME_MS = TRACK_MS;

// Mean colour of a 16x4 grid over the inner 80% of the mirror rect, read off
// the presented soft canvas; null where this backend presents straight to
// #game (no 2-D copy to read).
async function mirrorPatch(page, rect) {
  return page.evaluate((r) => {
    const soft = document.getElementById("game-soft");
    if (!soft || !(soft.width > 0) || !r) return null;
    const ctx = soft.getContext("2d");
    if (!ctx) return null;
    const x0 = Math.round((r[0] + r[2] * 0.1) * soft.width), y0 = Math.round((r[1] + r[3] * 0.1) * soft.height);
    const w = Math.max(16, Math.round(r[2] * 0.8 * soft.width)), h = Math.max(4, Math.round(r[3] * 0.8 * soft.height));
    const d = ctx.getImageData(x0, y0, w, h).data;
    const cells = [];
    for (let cy = 0; cy < 4; cy++) for (let cx = 0; cx < 16; cx++) {
      let s = 0, n = 0;
      for (let y = Math.floor(cy * h / 4); y < Math.floor((cy + 1) * h / 4); y++)
        for (let x = Math.floor(cx * w / 16); x < Math.floor((cx + 1) * w / 16); x++) {
          const i = (y * w + x) * 4; s += d[i] + d[i + 1] + d[i + 2]; n += 3;
        }
      cells.push(n ? s / n : 0);
    }
    return cells;
  }, rect);
}

async function mirrorRace(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.race("redbull", "day", "dry", { laps: 3 }));
  await awaitTrackBuild(page);
  await page.evaluate(() => {
    const a = window.__apex;
    if (typeof a.renderScale === "function") a.renderScale(0.5);
    a.go();
    a.freeze(true);   // a still scene: the on/off frames differ only by the mirror
    a.camera("cockpit");
  });
}

async function mirrorCase(page) {
  // AUTO keeps a software renderer's second world pass off; ON is ON.
  const auto = await page.evaluate(() => window.__apex.mirror());
  expect(auto, "__apex.mirror() exists once the race is up").not.toBeNull();
  expect(auto.mode).toBe("auto");
  await page.evaluate(() => window.__apex.mirror("on"));
  await page.waitForFunction(() => {
    const m = window.__apex.mirror();
    return m.shown && m.backend && m.backend.renders >= 1 && m.backend.composites >= 1;
  }, null, { polling: 100, timeout: FRAME_MS });
  const on = await page.evaluate(() => ({
    m: window.__apex.mirror(),
    cls: document.body.classList.contains("hud-mirror-on"),
    frameHidden: document.getElementById("hud-mirror").hidden,
    stored: localStorage.getItem("apex26.hudMirror"),
  }));
  const diag = JSON.stringify(on);
  expect(on.cls, diag).toBe(true);
  expect(on.frameHidden, diag).toBe(false);
  expect(on.stored, diag).toBe('"on"');
  expect(on.m.backend.dead, diag).toBe(false);
  expect(on.m.backend.w, diag).toBeGreaterThanOrEqual(16);
  expect(on.m.backend.h, diag).toBeGreaterThanOrEqual(8);
  // Top-centre, under the timing band, a wide letterbox.
  const [x, y, w, h] = on.m.rect;
  expect(Math.abs(x + w / 2 - 0.5), diag).toBeLessThan(0.02);
  expect(y, diag).toBeGreaterThan(0);
  expect(y + h, diag).toBeLessThan(0.45);
  expect(w / h, diag).toBeGreaterThan(2);
  // The backend composites where the frame is.
  expect(on.m.backend.rect, diag).toEqual(on.m.rect);

  await awaitPresentedFrame(page, 12000);
  const withMirror = await mirrorPatch(page, on.m.rect);

  // The MIRROR key: what shows goes off, and the backend stops compositing.
  await page.keyboard.press("KeyM");
  await page.waitForFunction(() => {
    const m = window.__apex.mirror();
    return m.mode === "off" && !m.shown && m.backend && m.backend.rect === null;
  }, null, { polling: 100, timeout: FRAME_MS });
  const off = await page.evaluate(() => ({
    m: window.__apex.mirror(),
    cls: document.body.classList.contains("hud-mirror-on"),
    frameHidden: document.getElementById("hud-mirror").hidden,
  }));
  expect(off.cls, JSON.stringify(off)).toBe(false);
  expect(off.frameHidden, JSON.stringify(off)).toBe(true);
  const c0 = off.m.backend.composites;
  await awaitPresentedFrame(page, 12000);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const off2 = await page.evaluate(() => window.__apex.mirror());
  expect(off2.backend.composites, JSON.stringify(off2)).toBe(c0);

  // Pixel evidence where the presented frame is readable: the rect held the
  // rear view, and now holds the forward view's pixels behind it.
  const without = await mirrorPatch(page, on.m.rect);
  test.info().annotations.push({ type: "mirror-pixels", description: withMirror ? "read #game-soft" : "no 2-D copy on this path" });
  if (withMirror && without) {
    let diff = 0;
    for (let i = 0; i < withMirror.length; i++) diff += Math.abs(withMirror[i] - without[i]);
    expect(diff / withMirror.length, JSON.stringify({ withMirror, without })).toBeGreaterThan(2);
  }
}

test.describe("HUD rear-view mirror", () => {
  test.describe.configure({ timeout: 300000 });

  test("GLX renders the mirror pass, composites it into #hud-mirror, and the key turns it off", async ({ page }) => {
    await mirrorRace(page);
    expect(await page.evaluate(() => sessionStorage.getItem("apex26.gfxBound"))).toBe("webgl2");
    await mirrorCase(page);
  });

  test.describe("TLX", () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        try {
          localStorage.setItem("apex26.gfxBackend", "three");
          localStorage.setItem("apex26.tlxForceGL", "1");
        } catch (_) {}
      });
    });
    test("TLX renders the mirror pass, composites it into #hud-mirror, and the key turns it off", async ({ page }) => {
      await mirrorRace(page);
      await mirrorCase(page);
    });
  });
});
