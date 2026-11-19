// @ts-check
// SETTINGS STEPPERS AND TITLE SOUND ON BRYCE'S PHONE — the PAINTED boxes (issue #5622).
//
// At UI SIZE 70 on his Home Screen window (852x393, touch, compact density) every SettingRow chevron outside
// APPEARANCE painted --chip-h x --ui-scale = 48 x 0.7 = 33.6 px square (GRAPHICS, A11Y, CONTROLS, DRIVING, HUD &
// CAMERA; from the title and from the pause menu), and the title SOUND OFF plate painted 88x29 in the wide shape
// (css/menu-destinations.css `min-height: 0`). tests/specs/bryce-phone-paint.spec.js counts the title's violations
// but measures only the Settings index, so the panes are pinned here: every visible chevron paints EXACTLY the house
// floor (--tap-paint-at 52 px on a coarse pointer), and SOUND paints exactly 52 px tall.
// Imported from @playwright/test, not the shared fixtures: this spec owns its context (window, insets, storage).
import { test, expect } from "@playwright/test";
import { openBrycePhone } from "../../tools/lib/bryce-phone.mjs";
import { resetToTitleState } from "../../tools/ui/ui-reset.mjs";

const PANES = ["graphics", "a11y", "controls", "driving", "display"];
const FLOOR = 52;
const round = (n) => Math.round(n * 10) / 10;

/** In-page: the painted squares of every visible chevron in one pane, as "WxH" → count. */
function paneSteppers(pane) {
  const panel = document.getElementById("pm-panel-" + pane);
  if (!panel || panel.hidden) return { hidden: true, sizes: {} };
  const sizes = {};
  for (const b of panel.querySelectorAll(".set-row > div > button")) {
    const r = b.getBoundingClientRect();
    if (!r.width) continue;
    const k = `${Math.round(r.width * 10) / 10}x${Math.round(r.height * 10) / 10}`;
    sizes[k] = (sizes[k] || 0) + 1;
  }
  return { hidden: false, sizes };
}

async function boot(browser, baseURL) {
  const { context, page } = await openBrycePhone(browser, { window: "standalone", dpr: 1, uiScale: 70 });
  await context.addInitScript(() => { window.__TEST_MODE = true; try { localStorage.setItem("apex26.gfxBackend", "webgl2"); } catch (_) { /* storage refused */ } });
  await page.goto(String(baseURL), { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: 60000 });
  await page.evaluate(() => window.__apex.headless(true));
  page.setDefaultTimeout(15000);
  expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches), "his phone is a coarse pointer").toBe(true);
  return { context, page };
}

async function expectPanes(page, from) {
  for (const pane of PANES) {
    await page.evaluate((p) => SettingsNav.showDirect(p, true), pane);
    await page.waitForSelector(`#pm-panel-${pane}:not([hidden])`);
    const got = await page.evaluate(paneSteppers, pane);
    const sizes = Object.keys(got.sizes);
    expect(sizes.length, `${from} ${pane}: the pane shows chevrons (${JSON.stringify(got)})`).toBeGreaterThan(0);
    expect(sizes, `${from} ${pane}: every chevron paints ${FLOOR}x${FLOOR} (${JSON.stringify(got.sizes)})`).toEqual([`${FLOOR}x${FLOOR}`]);
  }
}

/** Wait until the title SOUND plate paints the house floor in the wide shape. */
async function waitTitleSoundFloor(page) {
  await page.waitForFunction((floor) => {
    const el = document.getElementById("soundbtn");
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return document.body.dataset.shape === "wide" && Math.round(r.height * 10) / 10 === floor;
  }, FLOOR, { polling: 50, timeout: 15000 });
}

// One boot serves both cases: title chevrons, then pause chevrons after a race.
// Measured before (two boots): settings-stepper alone was a large share of the
// 117 s headless batch; sharing the context drops the second cold boot.
test.describe.configure({ mode: "serial" });
test.describe("standalone@70 steppers (shared phone boot)", () => {
  /** @type {import("@playwright/test").BrowserContext | undefined} */
  let context;
  /** @type {import("@playwright/test").Page | undefined} */
  let page;

  test.beforeAll(async ({ browser, baseURL }) => {
    ({ context, page } = await boot(browser, baseURL));
  });
  test.afterAll(async () => { await context?.close().catch(() => {}); });

  test("title SOUND and every Settings chevron from the title paint the 52 px floor", async () => {
    test.setTimeout(180000);
    await resetToTitleState(page, { tag: "stepper-paint title", log: null });
    await waitTitleSoundFloor(page);
    const sound = await page.evaluate(() => { const r = document.getElementById("soundbtn").getBoundingClientRect(); return { shape: document.body.dataset.shape, h: r.height }; });
    expect(sound.shape, "his landscape phone is the wide title shape").toBe("wide");
    expect(round(sound.h), "title SOUND paints the floor tall").toBe(FLOOR);
    await page.click("#mb-settings");
    await page.waitForSelector("#pmsettings:not([hidden])");
    await expectPanes(page, "title");
  });

  test("every Settings chevron from the pause menu paints the 52 px floor", async () => {
    test.setTimeout(240000);
    await resetToTitleState(page, { tag: "stepper-paint pause", log: null });
    await page.evaluate(async () => { await window.__apex.race("monza", null, null, { grid: "tier" }); });
    await page.waitForFunction(() => window.__apex.info().track === "monza", null, { polling: 100, timeout: 90000 });
    await page.evaluate(() => { window.__apex.go(); window.__apex.freeze(true); });
    await page.waitForSelector("#hud:not([hidden])");
    await page.evaluate(() => document.getElementById("pausebtn").click());
    await page.waitForSelector("#pausemenu:not([hidden])");
    await page.evaluate(() => document.getElementById("pm-settings").click());
    await page.waitForSelector("#pmsettings:not([hidden])");
    await expectPanes(page, "pause");
  });
});
