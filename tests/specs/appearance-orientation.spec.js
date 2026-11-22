// #4529 part 1, the device-safe check the issue asks for before landing: Bryce's phone (tools/lib/bryce-phone.mjs,
// standalone 852x393 + insets) seeded with his 2026-11-10 export. The reverted #4897 (#5143: "UI squished, zoom
// remapped") swapped sizes on a stale boot shape and was SEPARATE by default.
//   1. SHARED (shipped): a rotation, and a launch that reads the portrait pair before landscape, change no stored
//      key and no painted size (--ui-scale, --hud-btn-scale).
//   2. SEPARATE (opt-in): a settled portrait boot loads the lazy LayoutPresets and swaps in portrait's copy once.
// Chromium emulation: not WebKit, not his device (bryce-phone `limits`).
import { rotateIPhone15 } from "../helpers/iphone15.mjs";
import { test, expect } from "@playwright/test";
import { openBrycePhone, brycePhone } from "../../tools/lib/bryce-phone.mjs";

const BOOT = 60000;

/** In-page: every stored SETTING (the apex26.* keys SettingsExport.SPEC declares), the painted size tokens and
 *  the ICB shape. Caches outside the SPEC (e.g. the asset pack's `apex26.packIndex`, written async after boot,
 *  #5629) are not settings, so a rotation may race them. */
function stateInPage() {
  const spec = new Set(SettingsExport.SPEC.map((r) => "apex26." + r.k));
  const keys = {};
  for (const k of Object.keys(localStorage).sort()) if (spec.has(k)) keys[k] = localStorage.getItem(k);
  const cs = getComputedStyle(document.documentElement);
  return { keys, ui: cs.getPropertyValue("--ui-scale").trim(), btn: cs.getPropertyValue("--hud-btn-scale").trim(), shape: document.body.dataset.shape || null };
}

/** Past AppearanceStudio's SHAPE_SETTLE_MS (2000) since the last shape answer, with margin. */
const settled = (page) => page.waitForFunction(() => performance.now() - window.__shapeAt > 2600, null, { polling: 100, timeout: 15000 });

async function boot(browser, baseURL, { extra = null, first = "standalone" } = {}) {
  const { context, page, cdp } = await openBrycePhone(browser, { window: first, dpr: 1 });
  await context.addInitScript((e) => {
    window.__TEST_MODE = true;
    try { localStorage.setItem("apex26.gfxBackend", "webgl2"); if (e) for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); } catch (_) { /* read-back fails loudly */ }
    // When body[data-shape] (SheetShape's ICB answer) last changed: settled() waits out AppearanceStudio's 2 s window.
    window.__shapeAt = performance.now();
    document.addEventListener("DOMContentLoaded", () => new MutationObserver(() => { window.__shapeAt = performance.now(); })
      .observe(document.body, { attributes: true, attributeFilter: ["data-shape"] }));
  }, extra);
  await page.goto(String(baseURL), { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => window.__apex && document.documentElement.hasAttribute("data-booted"), null, { polling: 100, timeout: BOOT });
  await page.evaluate(() => window.__apex.headless(true));
  return { context, page, cdp };
}

test.describe("PORTRAIT & LANDSCAPE on Bryce's phone (#4529)", () => {
  test.setTimeout(180000);

  test("SHARED: a rotation and a stale portrait launch change no stored key and no painted size", async ({ browser, baseURL }) => {
    let before;
    const { context, page, cdp } = await boot(browser, baseURL);
    try {
      await settled(page);
      before = await page.evaluate(stateInPage);
      expect(before.shape).toBe("wide");
      expect(before.keys["apex26.appearanceShapes"], "SHARED is the absent key").toBeUndefined();
      await rotateIPhone15(page, cdp, "portrait");
      await page.waitForFunction(() => document.body.dataset.shape === "tall", null, { polling: 100, timeout: 10000 });
      await settled(page);
      const tall = await page.evaluate(stateInPage);
      expect(tall.keys).toEqual(before.keys);
      expect([tall.ui, tall.btn]).toEqual([before.ui, before.btn]);
      await rotateIPhone15(page, cdp, "standalone");
      await settled(page);
      expect(await page.evaluate(stateInPage)).toEqual(before);
    } finally { await context.close(); }

    // A Home-Screen launch that reports the portrait pair first, then lays out landscape.
    const stale = await boot(browser, baseURL, { first: "portrait" });
    try {
      await rotateIPhone15(stale.page, stale.cdp, "standalone");
      await stale.page.waitForFunction(() => document.body.dataset.shape === "wide", null, { polling: 100, timeout: 10000 });
      await settled(stale.page);
      const after = await stale.page.evaluate(stateInPage);
      expect(after.shape).toBe("wide");
      expect([after.ui, after.btn]).toEqual([before.ui, before.btn]);
      expect(after.keys["apex26.appearanceShapes"]).toBeUndefined();
      expect(after.keys["apex26.uiScale"]).toBe(before.keys["apex26.uiScale"]);
    } finally { await stale.context.close(); }
  });

  test("SEPARATE: a settled portrait boot swaps in portrait's copy once, through the lazy bundle", async ({ browser, baseURL }) => {
    const shapes = { v: 2, mode: "separate", live: "wide", park: { uiScale: 85 } };
    const { context, page } = await boot(browser, baseURL, { first: "portrait", extra: { "apex26.appearanceShapes": JSON.stringify(shapes) } });
    try {
      await page.waitForFunction(() => JSON.parse(localStorage.getItem("apex26.appearanceShapes") || "{}").live === "tall", null, { polling: 200, timeout: 15000 });
      const s = await page.evaluate(stateInPage);
      expect(s.shape).toBe("tall");
      expect(JSON.parse(s.keys["apex26.uiScale"])).toBe(85);
      const stored = JSON.parse(s.keys["apex26.appearanceShapes"]);
      // Landscape's live UI SIZE is the seeded profile's (bryce-phone `live`), now parked.
      expect(stored.park.uiScale, "landscape's profile UI SIZE is parked").toBe(brycePhone().uiScale);
      expect(await page.evaluate(() => typeof LayoutPresets)).toBe("object");
    } finally { await context.close(); }
  });
});

for (const touch of [false, true]) {
  const landscape = touch ? { width: 852, height: 393 } : { width: 1728, height: 1117 };
  test.describe("Arrange a live screen with " + (touch ? "touch" : "mouse and keyboard"), () => {
    test.use({ viewport: landscape, hasTouch: touch, deviceScaleFactor: 1, reducedMotion: "reduce" });
    test("Pause from Appearance edits the real card and returns to the picker", async ({ page }) => {
      const activate = locator => touch ? locator.tap() : locator.click();
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("data-booted", /.*/, { timeout: BOOT });
      await activate(page.locator("#mb-settings"));
      await activate(page.locator("#pm-open-appearance"));
      await activate(page.getByRole("group", { name: "Preview screen" }).getByRole("button", { name: "PAUSE", exact: true }));
      const go = page.getByRole("button", { name: "Arrange Pause", exact: true });
      const editor = page.locator('#screen-arranger[data-editing-screen="pausemenu"]');
      const card = page.locator("#pausemenu");
      for (const save of [false, true]) {
        await activate(go);
        await expect(editor).toBeVisible();
        await expect(card.locator("#pm-quit")).toBeVisible();
        await expect(card).toHaveJSProperty("inert", true);
        await editor.getByLabel("Region").selectOption("tools");
        await activate(editor.getByRole("button", { name: "Controls", exact: true }));
        await activate(editor.getByRole("button", { name: "Right", exact: true }));
        if (save) await activate(editor.getByRole("button", { name: "Apply", exact: true }));
        else await page.keyboard.press("Escape");
        await expect(editor).toHaveCount(0);
        await expect(card).toBeHidden();
        await expect(card).toHaveJSProperty("inert", false);
        await expect(go).toBeFocused();
        const offset = await page.evaluate(() => window.ScreenPlacement.read("pausemenu").tools?.x);
        expect(offset).toBe(save ? 1 : undefined);
      }
    });

    test("save title and Career independently through rotation, theme change, reload and reset", async ({ page, browser }, testInfo) => {
      test.setTimeout(180000);
      const activate = locator => touch ? locator.tap() : locator.click();
      const button = name => page.locator("#screen-arranger").getByRole("button", { name, exact: true });
      const career = page.locator("#cr-left");
      const arrange = async id => {
        await activate(page.locator("#mb-settings"));
        await activate(page.locator("#pm-open-appearance"));
        await page.getByLabel("Screen to arrange").selectOption(id);
        await activate(page.locator(".arrange-route"));
      };
      const layout = () => career.evaluate(el => {
        const rect = el.getBoundingClientRect(), css = getComputedStyle(el);
        return { x: rect.x, width: rect.width, scale: css.scale, font: css.fontSize };
      });
      const saved = () => page.evaluate(() => ({
        career: JSON.parse(localStorage.getItem("apex26.screenPlacement"))?.screens?.career,
        title: JSON.parse(localStorage.getItem("apex26.titleLayout")),
      }));
      const capture = async name => {
        const build = await page.locator('meta[name="apex-build"]').getAttribute("content");
        const viewport = page.viewportSize();
        const label = [name, browser.browserType().name(), browser.version(), viewport.width + "x" + viewport.height,
          touch ? "touch" : "mouse-keyboard", build].join("-");
        const path = testInfo.outputPath("arrangement-evidence", label + ".png");
        await page.screenshot({ path });
        await testInfo.attach(label, { path, contentType: "image/png" });
      };
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("data-booted", /.*/, { timeout: BOOT });
      await expect(page.locator(".screen-arrange-entry")).toHaveCount(0);
      await arrange("home");
      await activate(page.locator("#tl-adjust"));
      await activate(page.locator("#tl-size-up"));
      await activate(page.locator("#tl-done"));
      const title = (await saved()).title;
      expect(title.wide.btns.size).toBeGreaterThan(100);

      await arrange("career");
      const region = page.locator("#screen-arranger").getByLabel("Region");
      expect(await page.locator("#screen-arranger").evaluate(el => {
        // menu-a11y-audit's checks, on the live dialog: a <body> child, named by its title, Escape names a real Cancel.
        const door = document.getElementById(el.getAttribute("data-esc-close") || "");
        const title = document.getElementById(el.getAttribute("aria-labelledby") || "");
        return { tag: el.tagName, bodyChild: el.parentElement === document.body, titled: !!title && el.contains(title) && !!title.textContent.trim(),
          door: !!door && el.contains(door) && door.tagName === "BUTTON" && door.textContent.trim() === "Cancel" };
      }), "the layout editor is a named <body> dialog whose Escape door is its Cancel button").toEqual({ tag: "DIALOG", bodyChild: true, titled: true, door: true });
      await region.selectOption("navigation");
      const initial = await layout();
      const panel = page.locator("#screen-arranger .arrange-tools");
      const compact = await panel.boundingBox();
      expect(compact.width * compact.height).toBeLessThan(landscape.width * landscape.height * .1);
      await capture("career-before");
      await activate(button("Controls"));
      // An expanded panel still leaves a hit-testable part of the navigation
      // column. Starting there returns to the compact bar for the drag.
      const column = await career.boundingBox(), drawer = await panel.boundingBox();
      const point = [0.15, 0.5, 0.85].map(fraction => ({
        x: column.x + column.width * fraction, y: column.y + 24,
      })).find(({ x, y }) => x < drawer.x || x > drawer.x + drawer.width || y < drawer.y || y > drawer.y + drawer.height);
      expect(point).toBeTruthy();
      if (touch) await page.touchscreen.tap(point.x, point.y);
      else {
        await page.mouse.move(point.x, point.y);
        await page.mouse.down();
        await page.mouse.move(point.x + 20, point.y, { steps: 3 });
        await page.mouse.up();
        expect((await layout()).x).toBeGreaterThan(initial.x);
      }
      await expect(button("Controls")).toHaveAttribute("aria-expanded", "false");
      await activate(button("Controls"));
      if (touch) await activate(button("Right"));
      else { await button("Right").focus(); await page.keyboard.press("Enter"); }
      await activate(button("Width +"));
      const changed = await layout();
      expect(changed.x).toBeGreaterThan(initial.x);
      expect(changed.width).toBeGreaterThan(initial.width);
      expect([changed.font, changed.scale]).toEqual([initial.font, initial.scale]);
      await capture("career-preview");

      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.locator("#screen-arranger-title")).toContainText("portrait");
      await expect(page.locator("#screen-arranger output")).toContainText("Width auto");
      await capture("career-portrait");
      await page.setViewportSize(landscape);
      await expect(page.locator("#screen-arranger-title")).toContainText("landscape");
      await activate(button("Apply"));
      const applied = await saved();
      expect(applied.career.landscape.navigation.x).toBeGreaterThan(0);
      expect(applied.career.portrait).toBeUndefined();
      expect(Math.abs((await layout()).width - changed.width)).toBeLessThan(2);

      await activate(page.locator("#cr-back"));
      await activate(page.locator("#mb-settings"));
      await activate(page.locator("#pm-open-appearance"));
      await page.locator("#pm-uitheme-sel").selectOption("endurance");
      await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "endurance");
      expect(await saved()).toEqual(applied);

      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("data-booted", /.*/, { timeout: BOOT });
      await arrange("career");
      await region.selectOption("navigation");
      expect(Math.abs((await layout()).width - changed.width)).toBeLessThan(2);
      expect(await saved()).toEqual(applied);
      await activate(button("Controls"));
      await activate(button("Reset screen"));
      await activate(button("Apply"));
      await expect(page.locator("#career :focus")).toBeVisible();
      expect((await saved()).career).toBeUndefined();
      expect((await saved()).title).toEqual(title);
      await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "endurance");
      await capture("career-reset");
    });
  });
}

test("Race Settings previews and saves a single button's width, height and text independently", async ({ page, browser }, testInfo) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const editor = page.locator("#screen-arranger");
  const adjust = name => editor.getByRole("button", { name, exact: true }).click();
  // The primary button is skewed. Its transformed bounds widen when its height
  // grows, even at a fixed layout width. Inspect the laid-out button itself.
  const geometry = locator => locator.evaluate(el => ({
    width: el.offsetWidth, height: el.offsetHeight, font: parseFloat(getComputedStyle(el).fontSize),
  }));
  const start = page.locator("#rs-go");
  const capture = async stage => {
    const build = await page.locator('meta[name="apex-build"]').getAttribute("content");
    const name = [stage, browser.browserType().name(), browser.version(), "1280x800-landscape-mouse", build].join("-");
    await testInfo.attach(name, { body: await page.screenshot(), contentType: "image/png" });
  };
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem("apex26.screenPlacement"))?.screens?.["race-settings"]);
  async function openFromHome() {
    await expect(page.locator("html")).toHaveAttribute("data-booted", /.*/, { timeout: BOOT });
    await page.locator("#mb-settings").click();
    await page.locator("#pm-open-appearance").click();
    await page.getByLabel("Screen to arrange").selectOption("race-settings");
    await page.locator(".arrange-route").click();
    await page.locator("#sel-go").click();
    await editor.getByLabel("Region").selectOption("start");
    await adjust("Controls");
  }

  await page.goto("/");
  await openFromHome();
  const initial = await geometry(start);
  await capture("race-settings-shipped");
  const backFont = (await geometry(page.locator("#rs-cancel"))).font;
  await editor.getByLabel("Adjustment").selectOption({ label: "Coarse" });
  await adjust("Button width +");
  const wider = await geometry(start);
  expect(wider.width).toBeGreaterThan(initial.width);
  expect(wider.font).toBe(initial.font);
  await adjust("Button height +");
  const taller = await geometry(start);
  expect(taller.height).toBeGreaterThan(wider.height);
  expect(taller.width).toBeCloseTo(wider.width, 0);
  expect(taller.font).toBe(initial.font);
  await adjust("Text size +");
  const edited = await geometry(start);
  expect(edited.font).toBeGreaterThan(initial.font);
  await capture("race-settings-customized");
  expect((await geometry(page.locator("#rs-cancel"))).font).toBe(backFont);
  expect(await saved()).toBeUndefined();
  await adjust("Apply");
  const stored = await saved();
  expect(stored.landscape.start.textSize).toBeGreaterThan(1);
  expect(stored.landscape.start.buttonWidth).toBeGreaterThan(0);
  expect(stored.landscape.start.buttonHeight).toBeGreaterThanOrEqual(44);
  expect(stored.portrait).toBeUndefined();

  await page.reload();
  await openFromHome();
  expect(await geometry(start)).toEqual(edited);
  await adjust("Reset region");
  expect(await geometry(start)).toEqual(initial);
  await adjust("Cancel");
  expect(await geometry(start)).toEqual(edited);
  expect(await saved()).toEqual(stored);

  // Change a real fold while the race controls are live, then edit that state.
  await page.locator("#rs-fold-field-sum").click();
  await page.locator("#race-settings").getByRole("button", { name: "Arrange again" }).click();
  await editor.getByLabel("Region").selectOption("diff-next");
  const difficulty = await page.locator("#rs-diff-sel").inputValue();
  await adjust("Controls");
  await adjust("Button height +");
  await adjust("Apply");
  expect(await page.locator("#rs-diff-sel").inputValue()).toBe(difficulty);
  expect((await saved()).landscape["diff-next"].buttonHeight).toBeGreaterThanOrEqual(44);
  expect((await saved()).landscape["diff-prev"]).toBeUndefined();
});

test("Garage animation tuner edits its window on first visit at the measured phone size", async ({ browser, baseURL }, testInfo) => {
  const { context, page } = await openBrycePhone(browser, { window: "standalone", profile: false });
  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(baseURL || "/");
    await expect(page.locator("html")).toHaveAttribute("data-booted", /.*/, { timeout: BOOT });
    await page.locator("#mb-settings").tap();
    await page.locator("#pm-open-visual").tap();
    const advanced = page.locator("#pm-visual-tuners");
    if (!(await advanced.evaluate(el => el.open))) await advanced.locator("summary").tap();
    await page.locator("#pm-garrival").tap();
    const sheet = page.locator("#garrival-inner");
    const width = () => sheet.evaluate(el => el.getBoundingClientRect().width);
    const launch = page.locator('#garrival [data-arrange-screen="garrival"]').first();
    const editor = page.locator('#screen-arranger[data-editing-screen="garrival"]');
    const action = name => editor.getByRole("button", { name, exact: true }).tap();
    const shipped = await width();
    const build = await page.locator('meta[name="apex-build"]').getAttribute("content");
    const capture = async state => {
      const name = ["garage-arrival", state, browser.version(), "852x393-DPR3-touch", build].join("-");
      await testInfo.attach(name, { body: await page.screenshot(), contentType: "image/png" });
    };
    await capture("shipped");
    await launch.tap();
    await editor.getByLabel("Region", { exact: true }).selectOption("window");
    await action("Controls");
    await action("Width −");
    await action("Left");
    await action("Controls");
    const preview = await width();
    expect(preview).toBeLessThan(shipped);
    await capture("preview");
    await action("Apply");
    expect(await width()).toBe(preview);
    await launch.tap();
    await editor.getByLabel("Region", { exact: true }).selectOption("window");
    await action("Controls");
    await action("Reset region");
    await action("Apply");
    expect(await width()).toBe(shipped);
  } finally {
    await context.close();
  }
});
