// @ts-check
// THE OWNER'S REAL PHONE PROFILE — the garage overlay bar.
//
// Bryce, 2026-11-09, on the iPhone Home Screen app (852x393, insets 59/59/21): at his UI SIZE 61 the garage's
// CAMERA / PHOTO / ACTIVE AERO bar stretched to 446 px over the car (CAMERA 234, PHOTO 206, ACTIVE AERO 446).
// css/carsetup.css caps it at 288 px on a landscape phone.
//
// Seeded with his CURRENT export (2026-11-10, UI SIZE 70). A phone's stored UI SIZE is floored at 70 on boot
// (UI_PHONE_MIN, js/ui/scale.js), so the 61 of the 2026-11-09 export can no longer reach a phone page. Measured
// 2026-11-11 on this window: without the cap the bar paints 395 px (CAMERA 210, PHOTO 179, ACTIVE AERO 395);
// with it 288 (156 / 126 / 288), all 44 tall.
//
// This file also held the touch-dock sizes for a 100 % default BUTTON SIZE. That change was dropped from the PR
// (#5297, 2026-11-10): his 2026-11-10 export stores BUTTON SIZE 143 %, and the default sizes are #5358's to choose.
//
// Seeds the export the way a boot reads it (tools/lib/bryce-phone.mjs ownerStore) with CDP safe-area
// insets. Not emulated: iOS itself (display-mode: standalone); nothing measured here reads it.
import { BRYCE_WINDOWS, OWNER_EXPORT, ownerStore } from "../../tools/lib/bryce-phone.mjs";
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

const GEO = BRYCE_WINDOWS.standalone;

/** His live export (tools/lib/bryce-phone.mjs `live`, the 2026-11-10 file) as the store keys a boot writes. */
function liveStore() {
  return ownerStore({ file: OWNER_EXPORT }).store;
}

async function boot(page, geo, store, path = "/") {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: geo.insets });
  await page.addInitScript(({ json, raw }) => {
    try {
      for (const [k, v] of Object.entries(json)) localStorage.setItem("apex26." + k, JSON.stringify(v));
      for (const [k, v] of Object.entries(raw)) localStorage.setItem("apex26." + k, v);
    } catch (_) { /* storage off */ }
  }, store);
  await page.goto(path);
  await page.waitForFunction(() => window.__apex && window.__apex.race && document.documentElement.hasAttribute("data-booted"), null, { polling: 100, timeout: BOOT_MS });
}

test.describe(`owner's live profile ${GEO.width}x${GEO.height}-standalone, the garage`, () => {
  test.use({ viewport: { width: GEO.width, height: GEO.height }, hasTouch: true, isMobile: true });

  test("the garage overlay bar is no wider than the ACTIVE AERO chip needs", async ({ page }) => {
    test.setTimeout(240_000);
    await boot(page, GEO, liveStore());
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ui-scale").trim()), "his UI SIZE 70 reached the page").toBe("0.7");
    await page.evaluate(() => document.getElementById("mb-garage").click());
    await expect(page.locator("#carsetup")).toBeVisible({ timeout: BOOT_MS });
    await page.waitForFunction(() => { const b = document.getElementById("cs-aero"); return b && b.getBoundingClientRect().width > 0; }, null, { polling: 100, timeout: BOOT_MS });
    const g = await page.evaluate(() => Object.fromEntries(["cs-stack", "cs-cam", "cs-photo", "cs-aero"].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [id, { w: r.width, h: r.height, l: r.left }]; })));
    expect(g["cs-stack"].w, `the bar is ${g["cs-stack"].w.toFixed(0)} px wide (395 without the cap)`).toBeLessThanOrEqual(289);
    for (const id of ["cs-cam", "cs-photo", "cs-aero"]) expect(Math.abs(g[id].h - 44), `${id} is the fixed 44 px chrome (#5202)`).toBeLessThanOrEqual(0.5);
    expect(g["cs-stack"].l, "the bar clears the left inset").toBeGreaterThanOrEqual(GEO.insets.left - 1);
  });
});

/** In-page (#6924): the THUMB TRAINER's boxes against the viewport's safe area, the panel and the live race dock. */
function trainerFitInPage() {
  const cs = getComputedStyle(document.documentElement), n = (k) => parseFloat(cs.getPropertyValue(k)) || 0;
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  const safe = { l: n("--sal"), t: n("--sat"), r: vw - n("--sar"), b: vh - n("--sab") };
  const box = (el) => { const r = el.getBoundingClientRect(); return { id: el.id, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const ids = ["tt-back", "tt-prev", "tt-turn", "tt-next", "tt-speed", "tt-go", "tt-view", "tt-cue", "tt-sketch", "tt-time", "tt-score",
    "tt-p-yours", "tt-p-rec", "tt-p-catch", "tt-p-edge", "tt-chart", "tt-note"];
  const boxes = ids.map((id) => document.getElementById(id)).filter((el) => el && el.checkVisibility()).map(box);
  const dock = Array.from(document.querySelectorAll("#hud-dock .touchbtn")).filter((el) => el.checkVisibility()).map(box).filter((r) => r.w > 0);
  const panel = document.getElementById("tt-panel");
  return { safe, vw, vh, boxes, dock, panel: box(panel), panelOverflow: panel.scrollHeight - panel.clientHeight,
    fit: document.getElementById("thumb-trainer").dataset.fit, vignette: getComputedStyle(document.getElementById("hud"), "::before").display };
}
const overlap = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1;
const PORTRAIT = BRYCE_WINDOWS.portrait;
for (const [win, geo] of [["standalone", GEO], ["portrait", PORTRAIT]]) for (const profile of ["live", "shipped"]) {
  test.describe(`thumb trainer fits ${geo.width}x${geo.height}-${win}, ${profile} profile (#6924)`, () => {
    test.use({ viewport: { width: geo.width, height: geo.height }, hasTouch: true, isMobile: true });

    test("every trainer box sits in the safe area, inside its panel, clear of the race buttons, taps >= 44 px", async ({ page }) => {
      test.setTimeout(240_000);
      await boot(page, geo, profile === "live" ? liveStore() : { json: {}, raw: {} }, "/?go=thumbs");
      await expect(page.locator("#thumb-trainer")).toBeVisible({ timeout: BOOT_MS });
      await page.waitForFunction(() => document.getElementById("thumb-trainer").dataset.fit, null, { polling: 100, timeout: BOOT_MS });
      for (const phase of ["idle", "after a run", "pedal explorer"]) {
        if (phase === "pedal explorer") await page.locator("#tt-view").click();
        if (phase === "after a run") await page.evaluate(() => {   // the longest text a finished run writes: two tips and the score
          document.getElementById("tt-cue").textContent = "Arrow late by 230 ms. Start it while you're still braking. Brake and arrow together for 0.21 s, target 0.62 s. Keep a little brake on as the arrow winds on.";
          document.getElementById("tt-score").textContent = "Match 64% · arrow 71% · brake 58% · gas 63% · best 82%";
        });
        await page.waitForTimeout(250);
        const g = await page.evaluate(trainerFitInPage);
        const tag = `${win} ${profile} ${phase} (fit ${g.fit}):`;
        expect(g.vignette, `${tag} the race vignette is off over the drill`).toBe("none");
        expect(g.panelOverflow, `${tag} the panel does not overflow`).toBeLessThanOrEqual(1);
        expect([g.safe.l, g.safe.t, g.vw - g.safe.r, g.vh - g.safe.b], `${tag} the emulated insets reached the page`).toEqual([geo.insets.left, geo.insets.top, geo.insets.right, geo.insets.bottom]);
        for (const d of g.dock) expect(overlap(g.panel, d), `${tag} the panel clears race button #${d.id}`).toBe(false);
        if (phase === "after a run") for (const id of ["tt-cue", "tt-score"]) expect(g.boxes.find((b) => b.id === id)?.h, `${tag} #${id} shows its text`).toBeGreaterThan(10);
        for (const b of g.boxes) {
          const where = `${tag} #${b.id} ${b.l.toFixed(0)},${b.t.toFixed(0)}-${b.r.toFixed(0)},${b.b.toFixed(0)}`;
          expect(b.l >= g.safe.l - 1 && b.t >= g.safe.t - 1 && b.r <= g.safe.r + 1 && b.b <= g.safe.b + 1, `${where} inside the safe area ${JSON.stringify(g.safe)}`).toBe(true);
          if (b.id !== "tt-sketch") expect(b.l >= g.panel.l - 1 && b.t >= g.panel.t - 1 && b.r <= g.panel.r + 1 && b.b <= g.panel.b + 1, `${where} inside the panel`).toBe(true);
          if (/^tt-(back|prev|turn|next|speed|go|view|p-.*)$/.test(b.id)) expect(Math.min(b.w, b.h), `${where} is a 44 px tap`).toBeGreaterThanOrEqual(44);
          for (const d of g.dock) expect(overlap(b, d), `${where} clears race button #${d.id}`).toBe(false);
          for (const o of g.boxes) if (o !== b && b.w > 0 && b.h > 0 && o.w > 0 && o.h > 0) expect(overlap(b, o), `${where} clears #${o.id}`).toBe(false);
        }
        if (phase !== "pedal explorer") expect(g.boxes.find((b) => b.id === "tt-time").h, `${tag} the timeline keeps its three lanes`).toBeGreaterThanOrEqual(80);
      }
      await page.locator("#tt-back").click();   // close: the race vignette comes back with the HUD
      await expect(page.locator("#thumb-trainer")).toBeHidden();
      expect(await page.evaluate(() => getComputedStyle(document.getElementById("hud"), "::before").display), "the vignette is back after BACK").not.toBe("none");
    });
  });
}
