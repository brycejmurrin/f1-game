// @ts-check
// TITLE MENU ROTATION — the layout has to be right AFTER the phone turns, not
// only when it starts that way.
//
// #427 re-asks body[data-shape]/data-density] after iOS's late size settle;
// #472 hid the #overlay scroll thumb that fought its own scroll range. A gap
// remained: the same silent settle left --kb latched at a mismatched mid-
// rotation value, title scrollers kept a stale scrollTop across the tall↔wide
// flip, and #menu-buttons still painted a thumb that clipped door labels on a
// narrow landscape column. This spec drives the rotation sequences that would
// have caught those — phone sizes, tablet, and a settings open/close round-trip.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

const PHONES = [
  { name: "iphone14", port: { width: 390, height: 844 }, land: { width: 844, height: 390 } },
  { name: "iphone-se", port: { width: 320, height: 568 }, land: { width: 568, height: 320 } },
];
const TABLET = { name: "ipad-mini", port: { width: 744, height: 1133 }, land: { width: 1133, height: 744 } };

const DOORS = [
  "mb-career", "mb-daily", "mb-race", "mb-tt", "mb-vs", "mb-season",
  "mb-data", "mb-garage", "mb-settings", "mb-help",
];

/** @param {import("@playwright/test").Page} page */
async function waitTitle(page) {
  await page.waitForFunction(() => window.__apex && window.SheetShape,
    null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => {
    window.__apex.headless(true);
    document.documentElement.dataset.titleIntro = "off";
    document.getElementById("overlay")?.removeAttribute("data-intro");
  });
}

/** @param {import("@playwright/test").Page} page
 *  @param {{ width: number, height: number }} size */
async function rotate(page, size) {
  await page.setViewportSize(size);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("orientationchange"));
    window.dispatchEvent(new Event("resize"));
  });
  // SheetShape SETTLE_MS tops out at 1500; wait past that so late re-asks land.
  await page.waitForTimeout(1700);
}

/** @param {import("@playwright/test").Page} page */
async function titleState(page) {
  return page.evaluate((doors) => {
    const body = document.body;
    const ov = document.getElementById("overlay");
    const mb = document.getElementById("menu-buttons");
    const kb = getComputedStyle(document.documentElement).getPropertyValue("--kb").trim();
    const reach = {};
    for (const id of doors) {
      const el = document.getElementById(id);
      if (!el || el.hidden) { reach[id] = { hidden: true, ok: true }; continue; }
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const top = document.elementFromPoint(cx, cy);
      const hit = !!(top && (top === el || el.contains(top) || top.closest?.("#" + id)));
      const inView = r.bottom > 0 && r.top < window.innerHeight &&
        r.right > 0 && r.left < window.innerWidth && r.width > 0 && r.height > 0;
      reach[id] = { hidden: false, inView, hit, ok: inView && hit };
    }
    return {
      vw: window.innerWidth, vh: window.innerHeight,
      shape: body.dataset.shape, density: body.dataset.density,
      kb,
      ovScroll: ov ? ov.scrollTop : null,
      mbScroll: mb ? mb.scrollTop : null,
      ovSfScroll: ov ? ov.classList.contains("sf-scroll") : false,
      mbSfScroll: mb ? mb.classList.contains("sf-scroll") : false,
      thumbDisplay: mb ? getComputedStyle(mb, "::before").display : null,
      inert: ov ? !!ov.inert : false,
      reach,
    };
  }, DOORS);
}

function expectOriented(state, land) {
  if (land) {
    expect(state.shape, `landscape ${state.vw}x${state.vh} shape`).toBe("wide");
    if (state.vh <= 500) {
      expect(state.density, `short landscape density`).toBe("compact");
    }
  } else {
    expect(state.shape, `portrait ${state.vw}x${state.vh} shape`).toBe("tall");
  }
}

function expectDoorsReachable(state, label) {
  const bad = Object.entries(state.reach)
    .filter(([, v]) => !v.ok)
    .map(([id, v]) => `${id}:in=${v.inView}/hit=${v.hit}`);
  expect(bad, `${label}: unreachable doors`).toEqual([]);
}

function expectNoStuckKb(state, label) {
  const n = parseFloat(state.kb) || 0;
  expect(n, `${label}: --kb must not latch a rotation band`).toBeLessThanOrEqual(1);
}

for (const sz of [...PHONES, TABLET]) {
  test.describe(`title rotation ${sz.name}`, () => {
    test.use({ viewport: sz.port, hasTouch: true, isMobile: true });

    test("portrait ↔ landscape keeps doors reachable and --kb clear", async ({ page }) => {
      test.setTimeout(180_000);
      await page.goto("/");
      await waitTitle(page);

      let s = await titleState(page);
      expectOriented(s, false);
      expectNoStuckKb(s, "port-fresh");
      expectDoorsReachable(s, "port-fresh");

      await rotate(page, sz.land);
      s = await titleState(page);
      expectOriented(s, true);
      expectNoStuckKb(s, "land-1");
      expectDoorsReachable(s, "land-1");
      expect(s.inert, "title must not stay inert after a bare rotation").toBe(false);
      // Title scrollers hide the thumb whenever ScrollFade would paint one;
      // with no overflow there is no ::before rule in play.
      if (s.mbSfScroll) {
        expect(s.thumbDisplay, "title #menu-buttons thumb must stay hidden").toBe("none");
      }
      // Stain scroll positions, then flip back — settle must zero them.
      await page.evaluate(() => {
        const ov = document.getElementById("overlay");
        const mb = document.getElementById("menu-buttons");
        if (ov) ov.scrollTop = Math.max(0, ov.scrollHeight);
        if (mb) mb.scrollTop = Math.max(0, mb.scrollHeight);
      });
      await rotate(page, sz.port);
      s = await titleState(page);
      expectOriented(s, false);
      expectNoStuckKb(s, "port-2");
      expectDoorsReachable(s, "port-2");
      // After the shape flip the primary door must be hittable without hunting
      // for a leftover scroll offset.
      expect(s.reach["mb-career"].ok, "CAREER reachable after scroll-stain rotation").toBe(true);

      await rotate(page, sz.land);
      s = await titleState(page);
      expectOriented(s, true);
      expectNoStuckKb(s, "land-2");
      expectDoorsReachable(s, "land-2");
    });

    test("settings open/close across a rotation leaves the title usable", async ({ page }) => {
      test.setTimeout(180_000);
      await page.goto("/");
      await waitTitle(page);

      await rotate(page, sz.land);
      await page.locator("#mb-settings").click();
      await expect(page.locator("#pmsettings")).toBeVisible({ timeout: 15_000 });

      // Rotate while settings is open, then close.
      await rotate(page, sz.port);
      await page.locator("#pm-settings-close").click();
      await expect(page.locator("#pmsettings")).toBeHidden();

      let s = await titleState(page);
      expect(s.inert, "title must not stay inert after settings close").toBe(false);
      expectOriented(s, false);
      expectNoStuckKb(s, "port-after-settings");
      expectDoorsReachable(s, "port-after-settings");

      await rotate(page, sz.land);
      s = await titleState(page);
      expectOriented(s, true);
      expectNoStuckKb(s, "land-after-settings");
      expectDoorsReachable(s, "land-after-settings");
    });
  });
}

test.describe("title rotation late-iOS size settle", () => {
  test.use({ viewport: { width: 430, height: 932 }, hasTouch: true, isMobile: true });

  test("a mismatched mid-rotation --kb clears when sizes land after the events", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/");
    await waitTitle(page);

    // Controllable visualViewport + silent layout settle (the #427/#472 hole).
    await page.evaluate(() => {
      const vv = window.visualViewport;
      const proto = VisualViewport.prototype;
      const gh = Object.getOwnPropertyDescriptor(proto, "height").get;
      const go = Object.getOwnPropertyDescriptor(proto, "offsetTop").get;
      Object.defineProperty(vv, "height", {
        configurable: true,
        get() { return window.__fakeVvH != null ? window.__fakeVvH : gh.call(this); },
      });
      Object.defineProperty(vv, "offsetTop", {
        configurable: true,
        get() { return window.__fakeVvOff != null ? window.__fakeVvOff : go.call(this); },
      });
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        get() { return window.__fakeIW != null ? window.__fakeIW : 430; },
      });
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        get() { return window.__fakeIH != null ? window.__fakeIH : 932; },
      });
    });

    // Portrait keyboard.
    await page.evaluate(() => {
      window.__fakeIW = 430; window.__fakeIH = 932;
      window.__fakeVvH = 560; window.__fakeVvOff = 0;
      window.visualViewport.dispatchEvent(new Event("resize"));
    });
    await page.waitForTimeout(50);
    let kb = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--kb").trim());
    expect(parseFloat(kb) || 0, "precondition: keyboard band").toBeGreaterThan(100);

    // Mid-rotation mismatch + window events (still on portrait layout sizes).
    await page.evaluate(() => {
      window.__fakeVvH = 430;
      window.visualViewport.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new Event("orientationchange"));
      window.dispatchEvent(new Event("resize"));
    });
    await page.waitForTimeout(50);
    kb = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--kb").trim());
    expect(parseFloat(kb) || 0, "precondition: mismatched band latched").toBeGreaterThan(100);

    // Silent size settle — no further event. Settle timers must clear --kb.
    await page.evaluate(() => {
      window.__fakeIW = 932; window.__fakeIH = 430;
      window.__fakeVvH = 430;
    });
    await page.waitForTimeout(1700);

    const after = await page.evaluate(() => ({
      kb: getComputedStyle(document.documentElement).getPropertyValue("--kb").trim(),
      shape: document.body.dataset.shape,
      density: document.body.dataset.density,
    }));
    expect(parseFloat(after.kb) || 0, "--kb must clear on silent settle").toBeLessThanOrEqual(1);
    expect(after.shape, "shape follows silent settle").toBe("wide");
    expect(after.density, "density follows silent settle").toBe("compact");
  });
});
