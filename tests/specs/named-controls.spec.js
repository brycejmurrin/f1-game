// @ts-check
// NAMED CRITICAL CONTROLS, AT THE OWNER'S PHONE, WITH TEETH (#5242).
//
// The controls a player cannot do without — PAUSE, CAM, GAS, BRAKE, the steer pads, RESUME and the pause doors,
// the title doors, Settings BACK — must exist, render, paint at a tap size and own the point at their own centre,
// in the TITLE, SETTINGS, RACE and PAUSE states. tests/helpers/control-judge.mjs is the judge.
//
// Every state then proves the judge can go red: it injects the override that broke (or would break) that state
// on the phone — the mutations of issue #5242 §T1, which 127 CSS-reading unit
// files survived — and asserts the judge names the control. A gate that cannot fail is not a gate.
//
// The cell: iPhone Home Screen app in landscape, 852x393, real env() insets 59/21/59 through CDP, touch, the
// settings export tests/data/settings-defaults-export.json (BUTTON 245 %, HUD 155 %, buttons steering). The
// renderer stays the fixture's pinned GLX: this is a layout cell. When PR #5282's tools/lib/bryce-phone.mjs
// lands, the setup below moves onto its `openBrycePhone` (one preset); the assertions do not change.
//
// Sizes: 44 px (WCAG 2.5.5 AAA / Apple HIG) for the race, pause and settings controls; 24 px (WCAG 2.5.8 AA)
// for the title doors, whose utility row (SETTINGS, HELP, SAVES, PHONE PAD) measured 40 px tall at this cell on
// 6c356f1 — named in #5242, not hidden by a number. PAUSE keeps its fixed 44-48 px (#5179).
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { exportStore } from "../helpers/title-fit.mjs";
import { judgeNamed } from "../helpers/control-judge.mjs";

const W = 852, H = 393;
const INSETS = { top: 0, left: 59, bottom: 21, right: 59 };

const TITLE = { "mb-race": { min: 24, safe: true }, "mb-career": { min: 24, safe: true }, "mb-garage": { min: 24, safe: true },
  "mb-practice": { min: 24, safe: true }, "mb-settings": { min: 24, safe: true } };
const SETTINGS = { "pm-settings-close": { min: 44 }, "pm-open-controls": { min: 44 } };
const RACE = { "pausebtn": { min: 44, max: 48, safe: true }, "btn-cam": { min: 44, safe: true },
  "btn-throttle": { min: 44, safe: true }, "btn-brake": { min: 44, safe: true },
  "btn-steer-left": { min: 44, safe: true }, "btn-steer-right": { min: 44, safe: true } };
const PAUSE = { "pm-resume": { min: 44 }, "pm-restart": { min: 44 }, "pm-settings": { min: 44 }, "pm-quit": { min: 44 } };

test.use({ viewport: { width: W, height: H }, hasTouch: true });

/** Inject `css`, judge `named`, remove it: the judge must name `want`. */
async function mutationIsCaught(page, css, named, want) {
  const tag = await page.addStyleTag({ content: css });
  const bad = await judgeNamed(page, named, INSETS);
  await tag.evaluate((n) => n.remove());
  expect(bad.some((b) => b.startsWith(want + ":")), `the judge goes red on \`${css}\` (it said ${JSON.stringify(bad)})`).toBe(true);
}

const tapCentre = async (page, id) => {
  const c = await page.evaluate((i) => { const r = document.getElementById(i).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id);
  await page.mouse.click(c.x, c.y);
};

test("named controls exist, paint and take a tap in TITLE, SETTINGS, RACE and PAUSE; each state's mutation goes red", async ({ page }) => {
  const store = exportStore();
  delete store.json.gfxBackend; delete store.raw.gfxBackend;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: INSETS });
  await page.addInitScript(({ json, raw }) => {
    try {
      for (const [k, v] of Object.entries(json)) localStorage.setItem("apex26." + k, JSON.stringify(v));
      for (const [k, v] of Object.entries(raw)) localStorage.setItem("apex26." + k, v);
    } catch (_) { /* storage off */ }
  }, store);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => document.fonts.ready);
  const env = await page.evaluate(() => ({ sal: getComputedStyle(document.documentElement).getPropertyValue("--sal").trim(),
    coarse: matchMedia("(pointer: coarse)").matches, btn: localStorage.getItem("apex26.hudBtnScale") }));
  expect(env, "the cell is the owner's: env() insets, a coarse pointer and his BUTTON SIZE reached the page").toEqual({ sal: "59px", coarse: true, btn: "245" });

  // TITLE
  await expect(page.locator("#mb-race")).toBeVisible({ timeout: BOOT_MS });
  expect(await judgeNamed(page, TITLE, INSETS), "TITLE doors").toEqual([]);
  // A transform, not `height`: the title sheet's layered `!important` sizing beats an unlayered override (measured
  // on 6c356f1), and the point is a door that PAINTS 8 px tall, however it got there.
  await mutationIsCaught(page, "#mb-race{transform:scaleY(.17)!important}", TITLE, "mb-race");

  // SETTINGS from the title, BACK by a tap
  await tapCentre(page, "mb-settings");
  await expect(page.locator("#pmsettings")).toBeVisible();
  expect(await judgeNamed(page, SETTINGS, INSETS), "SETTINGS (title)").toEqual([]);
  await mutationIsCaught(page, "#pm-settings-close{visibility:hidden!important}", SETTINGS, "pm-settings-close");
  await tapCentre(page, "pm-settings-close");
  await expect(page.locator("#pmsettings")).toBeHidden();

  // RACE
  await page.evaluate(() => window.__apex.headless(true));
  await page.evaluate(() => window.__apex.race("bahrain"));
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.go());
  await expect(page.locator("#loading")).toBeHidden({ timeout: BOOT_MS });
  expect(await page.evaluate(() => window.__apex.inputState().steerMode), "the export steers with buttons").toBe("buttons");
  expect(await judgeNamed(page, RACE, INSETS), "RACE controls").toEqual([]);
  await mutationIsCaught(page, "#btn-throttle{transform:translateY(400px)!important}", RACE, "btn-throttle");
  await mutationIsCaught(page, "#pausebtn{width:130px!important;height:130px!important;max-width:none!important;max-height:none!important}", RACE, "pausebtn");

  // PAUSE, opened the way a thumb does
  await tapCentre(page, "pausebtn");
  await expect(page.locator("#pausemenu")).toBeVisible();
  expect(await judgeNamed(page, PAUSE, INSETS), "PAUSE doors").toEqual([]);
  await mutationIsCaught(page, "#pausemenu #pm-resume{display:none!important}", PAUSE, "pm-resume");
  await mutationIsCaught(page, "#pausemenu .sheet{max-height:120px!important;overflow:hidden!important}", PAUSE, "pm-resume");

  // SETTINGS from PAUSE, BACK returns to PAUSE, RESUME returns to the race
  await tapCentre(page, "pm-settings");
  await expect(page.locator("#pmsettings")).toBeVisible();
  expect(await judgeNamed(page, SETTINGS, INSETS), "SETTINGS (pause)").toEqual([]);
  await tapCentre(page, "pm-settings-close");
  await expect(page.locator("#pmsettings")).toBeHidden();
  await expect(page.locator("#pausemenu")).toBeVisible();
  await tapCentre(page, "pm-resume");
  await expect(page.locator("#pausemenu")).toBeHidden();
  expect(await page.evaluate(() => window.__apex.info().state)).toBe("race");
  await cdp.detach();
});
