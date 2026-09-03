// @ts-check
// CAMERA TUNER contract: per-camera-mode framing offsets (js/camera/offsets.js),
// the __apex.camTune() hook, and the pause-menu panel (js/camera/tuner-panel.js).
// The invariant that matters: a knob moved on one camera changes ONLY that
// camera, and an untuned mode frames exactly as it did before the feature.
import { test, expect } from "@playwright/test";
import { BOOT_MS } from "../helpers/fixtures.js";

async function loadMonza(page) {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 15 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(async () => {
    __apex.race("monza");
    await new Promise((r) => setTimeout(r, 3000));
    __apex.go();
    await new Promise((r) => setTimeout(r, 200));
    __apex.jump(0.2, 55);
    __apex.freeze(true);
    __apex.hud(false);
    // Every test starts from the shipped framing regardless of what a previous
    // test in the same worker persisted.
    for (const m of __apex.camera().modes) __apex.camTune(m, null);
  });
}

// previewCam() runs the same camVantage() solver the live camera does, so it is
// the cheapest honest read of "how would this mode frame the car".
const frame = (page, mode) => page.evaluate((m) => __apex.previewCam(m, 0.2, 55), mode);

test("camTune() reports the knob registry and defaults to zero everywhere", async ({ page }) => {
  await loadMonza(page);
  const all = await page.evaluate(() => __apex.camTune());
  expect(all.defs.map((d) => d.id)).toEqual(["height", "dist", "side", "pitch", "yaw", "fov", "cornerLead"]);
  expect(all.tuned).toEqual({});
  const chase = await page.evaluate(() => __apex.camTune("chase"));
  for (const v of Object.values(chase)) expect(v).toBe(0);
  expect(await page.evaluate(() => __apex.camTune("nope"))).toBe(false);
});

// CORNER LEAD lives in the free-world chase branch, which needs the car's world
// pose — previewCam() takes the road-frame branch, so this drives the LIVE camera
// (jump → snapCam → camState) on a real corner instead.
const liveCam = (page, mode, frac, cornerLead) => page.evaluate(({ mode, frac, cornerLead }) => {
  __apex.camTune("chase", null);
  if (cornerLead) __apex.camTune("chase", { cornerLead });
  __apex.camera(mode); __apex.jump(frac, 60); __apex.freeze(true); __apex.snapCam();
  const c = __apex.camState();
  return { eye: c.eye.slice(), tgt: c.tgt.slice() };
}, { mode, frac, cornerLead });

test("CORNER LEAD only applies to chase/far, and leads the chase into corners", async ({ page }) => {
  await loadMonza(page);
  // registry marks it chase/far-only
  const def = (await page.evaluate(() => __apex.camTune())).defs.find((d) => d.id === "cornerLead");
  expect(def).toBeTruthy();
  expect(def.min).toBe(0); expect(def.max).toBe(1);

  // at a mid-lap corner, cornerLead swings the aim INTO the bend, scaling with
  // the knob; and returns to the exact default at 0.
  const FC = 0.24;
  const base = await liveCam(page, "chase", FC, 0);
  const half = await liveCam(page, "chase", FC, 0.5);
  const full = await liveCam(page, "chase", FC, 1);
  const tgtMove = (v) => Math.hypot(v.tgt[0] - base.tgt[0], v.tgt[1] - base.tgt[1], v.tgt[2] - base.tgt[2]);
  const mFull = tgtMove(full), mHalf = tgtMove(half);
  expect(mFull).toBeGreaterThan(0.5);          // the aim genuinely leads into the corner
  expect(mHalf).toBeGreaterThan(0.1);
  expect(mHalf).toBeLessThan(mFull);           // scales with the knob
  const reset = await liveCam(page, "chase", FC, 0);
  expect(reset.tgt[0]).toBeCloseTo(base.tgt[0], 3);   // 0 == the shipped framing, exactly

  // cockpit ignores it entirely (free-world onboard branch never reads it)
  const cpBase = await liveCam(page, "cockpit", FC, 0);
  await page.evaluate(() => __apex.camTune("chase", { cornerLead: 1 }));
  const cpWithLead = await page.evaluate(() => {
    __apex.camera("cockpit"); __apex.jump(0.24, 60); __apex.freeze(true); __apex.snapCam();
    const c = __apex.camState(); return { tgt: c.tgt.slice() };
  });
  expect(cpWithLead.tgt[0]).toBeCloseTo(cpBase.tgt[0], 3);
});

test("HEIGHT / DISTANCE / FOV move the solved vantage by the tuned amount", async ({ page }) => {
  await loadMonza(page);
  const base = await frame(page, "chase");
  await page.evaluate(() => __apex.camTune("chase", { height: 2, dist: 3, fov: -5 }));
  const tuned = await frame(page, "chase");

  // eye rises by exactly the HEIGHT knob…
  expect(tuned.eye[1] - base.eye[1]).toBeCloseTo(2, 1);
  // …and pulls back by DISTANCE along the view axis (target untouched).
  const dist = (v) => Math.hypot(v.eye[0] - v.target[0], v.eye[2] - v.target[2]);
  expect(dist(tuned) - dist(base)).toBeCloseTo(3, 1);
  expect(tuned.target[0]).toBeCloseTo(base.target[0], 1);
  expect(tuned.target[2]).toBeCloseTo(base.target[2], 1);
  expect(tuned.fov).toBeCloseTo(base.fov - 5, 1);
});

test("PITCH and YAW rotate the aim without moving the eye", async ({ page }) => {
  await loadMonza(page);
  const base = await frame(page, "chase");
  await page.evaluate(() => __apex.camTune("chase", { pitch: 10, yaw: 15 }));
  const tuned = await frame(page, "chase");
  for (let i = 0; i < 3; i++) expect(tuned.eye[i]).toBeCloseTo(base.eye[i], 3);

  const dir = (v) => {
    const d = [v.target[0] - v.eye[0], v.target[1] - v.eye[1], v.target[2] - v.eye[2]];
    const L = Math.hypot(...d);
    return { el: Math.asin(d[1] / L) * 180 / Math.PI, az: Math.atan2(d[0], d[2]) * 180 / Math.PI };
  };
  const a = dir(base), b = dir(tuned);
  expect(b.el - a.el).toBeCloseTo(10, 0);
  // +YAW pans right: the azimuth swings by 15° (wrapped to ±180).
  let dAz = b.az - a.az;
  while (dAz > 180) dAz -= 360;
  while (dAz < -180) dAz += 360;
  expect(Math.abs(dAz)).toBeCloseTo(15, 0);
});

test("a tuned camera never touches the other twelve", async ({ page }) => {
  await loadMonza(page);
  const before = {};
  for (const m of ["hood", "cockpit", "heli", "tcam"]) before[m] = await frame(page, m);
  await page.evaluate(() => __apex.camTune("chase", { height: 3, dist: 5, yaw: 20 }));
  for (const m of ["hood", "cockpit", "heli", "tcam"]) {
    const now = await frame(page, m);
    for (let i = 0; i < 3; i++) {
      expect(now.eye[i]).toBeCloseTo(before[m].eye[i], 3);
      expect(now.target[i]).toBeCloseTo(before[m].target[i], 3);
    }
    expect(now.fov).toBeCloseTo(before[m].fov, 3);
  }
  // …and the two onboard cams tune independently of each other too.
  await page.evaluate(() => __apex.camTune("hood", { height: 0.5 }));
  expect((await frame(page, "hood")).eye[1]).toBeCloseTo(before.hood.eye[1] + 0.5, 2);
  expect((await frame(page, "cockpit")).eye[1]).toBeCloseTo(before.cockpit.eye[1], 3);
});

test("values clamp to the slider range, persist, and reset", async ({ page }) => {
  await loadMonza(page);
  const v = await page.evaluate(() => __apex.camTune("cockpit", { height: 99, fov: -999 }));
  expect(v.height).toBe(10);     // def.max (widened -6..10 in the 2026-08 range pass)
  expect(v.fov).toBe(-35);       // def.min (widened ±35 in the same pass)
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("apex26.camTune")));
  expect(stored.cockpit.height).toBe(10);
  const base = await frame(page, "cockpit");
  await page.evaluate(() => __apex.camTune("cockpit", null));
  expect(await page.evaluate(() => __apex.camTune("cockpit"))).toEqual({ height: 0, dist: 0, side: 0, pitch: 0, yaw: 0, fov: 0, cornerLead: 0 });
  expect((await frame(page, "cockpit")).eye[1]).toBeLessThan(base.eye[1] - 4);
});

test("the pause-menu panel edits the camera you are looking through", async ({ page }) => {
  await loadMonza(page);
  await page.evaluate(() => { __apex.camera("hood"); document.getElementById("pm-camtune").click(); });
  // The #camtune wrapper is a zero-width fixed shell (the docked .sheet inside
  // it is what has a box), so assert on the inner panel.
  await expect(page.locator("#camtune-inner")).toBeVisible();
  expect(await page.locator("#ct-modes .lt-tab").count()).toBe(13);
  // 7 sliders exist; CORNER LEAD only applies to chase/far, so on HOOD its row
  // is hidden and the six geometric knobs show.
  expect(await page.locator("#ct-rows input[type=range]").count()).toBe(7);
  await expect(page.locator("#ct-row-cornerLead")).toBeHidden();
  await expect(page.locator("#ct-row-height")).toBeVisible();
  await expect(page.locator("#ct-profile")).toContainText("HOOD");

  // Dragging HEIGHT writes to the LIVE mode (hood), not to chase.
  await page.evaluate(() => {
    const inp = document.getElementById("ct-in-height");
    inp.value = "1.25";
    inp.dispatchEvent(new Event("input"));
  });
  expect((await page.evaluate(() => __apex.camTune("hood"))).height).toBeCloseTo(1.25, 2);
  expect((await page.evaluate(() => __apex.camTune("chase"))).height).toBe(0);
  await expect(page.locator("#ct-profile")).toContainText("1 tuned");

  // Picking another chip switches the live camera AND what the sliders edit.
  await page.locator('#ct-modes .lt-tab[data-mode="drift"]').click();
  expect(await page.evaluate(() => __apex.camera().mode)).toBe("drift");
  await expect(page.locator("#ct-profile")).toContainText("DRIFT");
  expect(await page.evaluate(() => document.getElementById("ct-in-height").value)).toBe("0");
  // The tuned mode keeps its marker while another mode is selected.
  await expect(page.locator('#ct-modes .lt-tab[data-mode="hood"]')).toHaveClass(/tuned/);

  // RESET ALL clears every mode; DONE closes the panel.
  await page.locator("#ct-reset-all").click();
  expect(await page.evaluate(() => __apex.camTune().tuned)).toEqual({});
  await page.locator("#ct-close").click();
  await expect(page.locator("#camtune-inner")).toBeHidden();
});
