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
  "mb-data", "mb-designer", "mb-garage", "mb-settings", "mb-help",
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
      if (sz.land.width === 844 && sz.land.height === 390) {
        // Live scene, then the still one (data-home-live removed): same compact fit, no word split.
        for (const scene of ["live", "static"]) {
          if (scene === "static") {
            await page.evaluate(() => AppearanceStudio.setScene("static", "still"));
            await page.waitForFunction(() => !document.documentElement.dataset.homeLive, null, { polling: 100, timeout: 10_000 });
            await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
          }
          const fit = await page.evaluate(() => {
            const mb = document.getElementById("menu-buttons");
            const play = ["mb-race", "mb-tt", "mb-vs", "mb-season", "mb-practice", "mb-garage"].map(id => {
              const el = document.getElementById(id), r = el.getBoundingClientRect();
              const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
              return { id, hit: !!hit && (hit === el || el.contains(hit)) };
            });
            const lab = mb.querySelector(".menu-destination-label");
            const broken = [];
            for (const t of mb.querySelectorAll(".menu-destination .bigbtn")) {
              const tr = t.getBoundingClientRect();
              if (!tr.width) continue;
              const walker = document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
              for (let n; (n = walker.nextNode());) {
                const ps = getComputedStyle(n.parentElement);
                if (ps.display === "none" || ps.textOverflow === "ellipsis") continue;
                for (const m of n.data.matchAll(/\S+/g)) {
                  const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
                  const lines = new Set([...rg.getClientRects()].map((r) => Math.round(r.top))).size;
                  const wr = rg.getBoundingClientRect();
                  if (lines > 1 || wr.right > tr.right + 1 || wr.left < tr.left - 1) broken.push(t.id + ":" + m[0]);
                }
              }
            }
            return {
              sh: mb.scrollHeight, ch: mb.clientHeight, broken,
              play,
              labelDisplay: lab ? getComputedStyle(lab).display : "none",
            };
          });
          expect(fit.sh, `${scene}: phone-landscape Home menu must fit without scrolling`).toBeLessThanOrEqual(fit.ch + 1);
          // Static tiles are skewed: their axis-aligned corner boxes may
          // intersect while their painted click targets remain separate.
          expect(fit.play.filter(cell => !cell.hit).map(cell => cell.id), `${scene}: every Play/Garage centre remains hittable`).toEqual([]);
          expect(fit.labelDisplay, `${scene}: compact Home group labels stay hidden`).toBe("none");
          expect(fit.broken, `${scene}: no tile label splits or overflows a word`).toEqual([]);
        }
      }
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

    // Portrait keyboard. The band is applied by the viewport handler on its own
    // schedule, so wait on it rather than on a 50 ms sleep (a loaded SwiftShader
    // box read 0 at 50 ms and failed the precondition, 2026-10-02).
    const kbNow = () => page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--kb").trim());
    const waitKbOver = (px) => page.waitForFunction((min) =>
      (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--kb")) || 0) > min,
      px, { polling: 100, timeout: 5000 });
    await page.evaluate(() => {
      window.__fakeIW = 430; window.__fakeIH = 932;
      window.__fakeVvH = 560; window.__fakeVvOff = 0;
      window.visualViewport.dispatchEvent(new Event("resize"));
    });
    await waitKbOver(100);
    let kb = await kbNow();
    expect(parseFloat(kb) || 0, "precondition: keyboard band").toBeGreaterThan(100);

    // Mid-rotation mismatch + window events (still on portrait layout sizes).
    await page.evaluate(() => {
      window.__fakeVvH = 430;
      window.visualViewport.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new Event("orientationchange"));
      window.dispatchEvent(new Event("resize"));
    });
    await waitKbOver(100);
    kb = await kbNow();
    expect(parseFloat(kb) || 0, "precondition: mismatched band latched").toBeGreaterThan(100);

    // Silent size settle — no further event. Settle timers must clear --kb.
    // The last settle timer fires at 1500 ms (sheet-shape.js SETTLE_MS); a fixed
    // 1700 ms sleep left 200 ms for its layout read, which a loaded llvmpipe
    // runner missed on retry-pass twice in one afternoon (ui shard 3,
    // 2026-10-02). Wait on the CONDITION instead: no event is dispatched, so a
    // clear within the window still proves the timers did it — the bound is
    // just no longer the box's speed.
    await page.evaluate(() => {
      window.__fakeIW = 932; window.__fakeIH = 430;
      window.__fakeVvH = 430;
    });
    await page.waitForFunction(() =>
      (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--kb")) || 0) <= 1,
      null, { polling: 100, timeout: 8000 });

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

// HOME FIT — portrait and desktop share the phone-landscape door grid: every door is one tile of a
// consistent height, nothing clips or splits a word, and the utility row is never below the fold.
const HOME_FIT = [
  { name: "iphone14 portrait", size: { width: 390, height: 844 }, touch: true, fits: true },
  { name: "pro-max portrait", size: { width: 430, height: 932 }, touch: true, fits: true },
  { name: "desktop 1280x720", size: { width: 1280, height: 720 }, touch: false, fits: true },
  { name: "desktop 1440x900", size: { width: 1440, height: 900 }, touch: false, fits: true },
  { name: "desktop 1920x1080", size: { width: 1920, height: 1080 }, touch: false, fits: true },
  { name: "desktop 1024x600", size: { width: 1024, height: 600 }, touch: false, fits: true },
  { name: "iphone14 portrait 200%", size: { width: 390, height: 844 }, touch: true, fits: false, scale: 200 },
  { name: "desktop 1440x900 200%", size: { width: 1440, height: 900 }, touch: false, fits: false, scale: 200 },
];

/** @param {import("@playwright/test").Page} page */
function homeFit(page) {
  return page.evaluate(() => {
    const mb = document.getElementById("menu-buttons");
    const mr = mb.getBoundingClientRect();
    const tiles = [...mb.querySelectorAll("button")].filter((b) => {
      const r = b.getBoundingClientRect();
      return !b.hidden && r.width > 1 && r.height > 1 && b.checkVisibility();
    });
    const broken = [], small = [], wide = [];
    for (const t of tiles) {
      const tr = t.getBoundingClientRect();
      if (Math.min(tr.width, tr.height) < 44) small.push(`${t.id}:${Math.round(tr.width)}x${Math.round(tr.height)}`);
      if (tr.left < -1 || tr.right > window.innerWidth + 1) wide.push(t.id);
      const walker = document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
      for (let n; (n = walker.nextNode());) {
        const ps = getComputedStyle(n.parentElement);
        if (ps.display === "none" || ps.textOverflow === "ellipsis") continue;
        for (const m of n.data.matchAll(/\S+/g)) {
          const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
          const lines = new Set([...rg.getClientRects()].map((r) => Math.round(r.top))).size;
          const wr = rg.getBoundingClientRect();
          if (lines > 1 || wr.right > tr.right + 1 || wr.left < tr.left - 1) broken.push(t.id + ":" + m[0]);
        }
      }
    }
    // The 2-column play grid: RACE..GARAGE tiles share one height inside a row (and, at default size, across rows).
    const grid = ["mb-race", "mb-tt", "mb-vs", "mb-season", "mb-practice", "mb-garage"]
      .map((id) => Math.round(document.getElementById(id)?.getBoundingClientRect().height ?? 0));
    const rowSpread = [0, 2, 4].map((i) => Math.abs(grid[i] - grid[i + 1]));
    const settings = document.getElementById("mb-settings").getBoundingClientRect();
    const clipped = tiles.filter((t) => { const r = t.getBoundingClientRect(); return r.bottom > mr.bottom + 1 && !mb.classList.contains("sf-scroll"); }).map((t) => t.id);
    return {
      sh: mb.scrollHeight, ch: mb.clientHeight, scrolls: mb.classList.contains("sf-scroll") || mb.scrollHeight > mb.clientHeight + 1,
      broken, small, wide, clipped,
      rowSpread, gridRatio: Math.max(...grid) / Math.max(1, Math.min(...grid)),
      settingsInView: settings.top >= -1 && settings.bottom <= window.innerHeight + 1,
      docOverflow: document.documentElement.scrollHeight > window.innerHeight + 1 || document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });
}

for (const c of HOME_FIT) {
  test.describe(`home fit ${c.name}`, () => {
    test.use({ viewport: c.size, hasTouch: c.touch, isMobile: c.touch });

    test("every door is a consistent tile, nothing clips or splits a word", async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto("/");
      await waitTitle(page);
      if (c.scale) await page.evaluate((p) => window.__apex.uiScale(p), c.scale);
      // Settled = the scroller's geometry and the density class held for 20 frames in a row.
      await page.evaluate(() => new Promise((done) => {
        let last = "", stable = 0;
        const tick = () => {
          const key = document.getElementById("menu-buttons").scrollHeight + "/" + document.body.dataset.density;
          if (key === last) { if (++stable >= 20) return done(); } else { stable = 0; last = key; }
          requestAnimationFrame(tick);
        };
        tick();
      }));
      const f = await homeFit(page);
      expect(f.broken, "no tile label splits or overflows a word").toEqual([]);
      expect(f.small, "tap targets reach the 44px floor").toEqual([]);
      expect(f.wide, "no tile leaves the viewport horizontally").toEqual([]);
      expect(f.docOverflow, "the page itself never scrolls").toBe(false);
      expect(f.rowSpread.every((d) => d <= 1), `paired play tiles share a row height ${f.rowSpread}`).toBe(true);
      expect(f.gridRatio, "RACE..GARAGE rows stay within 1.5x of each other (a wrapped label is the only difference)").toBeLessThanOrEqual(1.5);
      expect(f.settingsInView, "the utility row is never below the fold").toBe(true);
      if (c.fits) expect(f.sh, "Home fits without scrolling").toBeLessThanOrEqual(f.ch + 1);
      else expect(f.clipped, "when it scrolls, it scrolls (no tile cut by the box)").toEqual([]);
    });
  });
}
