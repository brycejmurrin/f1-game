// @ts-check
// Garage entry must paint a non-black bay with ZERO panel input.
// Bryce: canvas stayed black until a garage panel tap — first present only
// started (or became visible) on that input. Covers reduce-motion on and off
// (Home vt race + TLX noEnv HDR path). UNVERIFIED IN A BROWSER when written.
import { sharedTest as test, expect } from "../helpers/fixtures.js";
import { toMenu } from "../helpers/shared-page.js";
import fs from "fs";
import path from "path";

const OUT = path.resolve("artifacts/garage-first-frame-spec");
fs.mkdirSync(OUT, { recursive: true });

async function clickId(page, id) {
  await page.evaluate((i) => {
    const el = document.getElementById(i);
    if (!el) throw new Error("garage-first-frame: missing #" + i);
    el.click();
  }, id);
}

/** Sample #game-soft (GLX headless) without arming a new soft blit. */
async function sampleSoft(page) {
  return page.evaluate(() => {
    const soft = document.getElementById("game-soft");
    const game = document.getElementById("game");
    const a = window.__apex;
    const st = (typeof GLX !== "undefined" && GLX.softPresentState) ? GLX.softPresentState() : null;
    let avg = 0, max = 0, nz = 0, n = 0;
    if (soft && soft.width > 8 && soft.getContext) {
      const d = soft.getContext("2d").getImageData(0, 0, soft.width, soft.height).data;
      for (let i = 0; i < d.length; i += 32) {
        const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        avg += L; n++; if (L > max) max = L; if (L > 8) nz++;
      }
      if (n) avg /= n;
    }
    return {
      avg, max, nz, n,
      softOp: soft ? soft.style.opacity : null,
      softW: soft ? soft.width : 0,
      visGame: game ? game.style.visibility : null,
      visSoft: soft ? soft.style.visibility : null,
      softSt: st,
      cam: a.garageCam ? a.garageCam() : null,
      first: a.garagePrebuild ? a.garagePrebuild().firstFrame : null,
    };
  });
}

async function openGarageNoPanelInput(page) {
  await toMenu(page);
  await clickId(page, "mb-garage");
  await page.waitForFunction(() => {
    const cs = document.getElementById("carsetup");
    return !!(cs && !cs.hidden);
  }, null, { polling: 100, timeout: 30_000 });
  // Wait for the entry present our openGarage kick (or the loop) recorded —
  // do NOT click any #cs-* control and do NOT call snapCam here (that would
  // mask a missing entry blit).
  await page.waitForFunction(() => {
    const a = window.__apex;
    const ff = a.garagePrebuild && a.garagePrebuild().firstFrame;
    const cam = a.garageCam && a.garageCam();
    const st = (typeof GLX !== "undefined" && GLX.softPresentState) ? GLX.softPresentState() : null;
    const vis = document.getElementById("game")?.style.visibility;
    return !!(cam && cam.on && vis !== "hidden" && ((ff && ff.from === "menu") || (st && st.gen > 0 && st.maxPx >= 8)));
  }, null, { polling: 100, timeout: 45_000 });
}

async function assertNonBlack(page, label) {
  // Give the on-demand soft blit from enterGarage's invalidateSoftPresent one
  // more present cycle without a panel click.
  await page.waitForFunction(() => {
    const st = (typeof GLX !== "undefined" && GLX.softPresentState) ? GLX.softPresentState() : null;
    if (!st || !st.on) return true; // headed / no soft — visibility+firstFrame already gated
    return st.gen > 0 && st.maxPx >= 8;
  }, null, { polling: 100, timeout: 30_000 });
  const s = await sampleSoft(page);
  expect(s.cam?.on, `${label}: garage preview on`).toBe(true);
  expect(s.visGame, `${label}: #game must not stay hidden`).not.toBe("hidden");
  if (s.softSt?.on) {
    expect(s.softSt.maxPx, `${label}: soft blit must carry ink`).toBeGreaterThanOrEqual(8);
    expect(s.max, `${label}: soft canvas max luma`).toBeGreaterThan(8);
    expect(s.nz, `${label}: soft canvas non-black samples`).toBeGreaterThan(100);
  }
  return s;
}

async function saveShot(page, name) {
  const b64 = await page.evaluate(() => {
    const c = document.getElementById("game-soft") || document.getElementById("game");
    if (!c || !c.toDataURL) return null;
    return c.toDataURL("image/png").slice(22);
  });
  if (b64) fs.writeFileSync(path.join(OUT, name + ".png"), Buffer.from(b64, "base64"));
}

test.describe("garage first frame on entry (no panel input)", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("reduce-motion on: bay is non-black after Home → GARAGE", async ({ page }) => {
    // Suite default pins reducedMotion:"reduce"; re-assert for clarity.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openGarageNoPanelInput(page);
    const s = await assertNonBlack(page, "reduce");
    await saveShot(page, "entry-reduce");
    expect(s.first?.from, "firstFrame measured from menu tap").toBe("menu");
  });

  test("reduce-motion off: bay is non-black after Home → GARAGE (vt path)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    // Shared page is already live — write the in-game motion pick (TitleFx)
    // so vt() uses startViewTransition instead of the reduce bypass.
    await page.evaluate(() => {
      if (typeof GameStore !== "undefined" && GameStore.store) GameStore.store.set("motion", "on");
      document.documentElement.removeAttribute("data-motion");
    });
    await openGarageNoPanelInput(page);
    const s = await assertNonBlack(page, "motion");
    await saveShot(page, "entry-motion");
    expect(s.first?.from, "firstFrame measured from menu tap").toBe("menu");
  });
});

