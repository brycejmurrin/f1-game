// @ts-check
// WATCH transport on a phone in landscape (UI scaling contract gap 19, PR #5156):
// the bar is ONE row — play, prev, next, DRIVER, the seek, a ⋯ MORE chip — and the
// chip's popover holds SPEED, CAMERA, AUTO, FOLLOW LOCK, PHOTO and the EVENT
// CHAPTERS row. The closed bar stays under 35 % of the window (it was 44 % of
// 852×393 and 61 % of the 852×283 Safari window as three rows); the open popover
// sits above the bar inside the safe area; JUMP TO EVENT shares its row with the
// picker (it used to wrap onto a row of its own, 70 % of an 844×390 screen).
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

// A: the Home Screen app, C: the Safari tab (toolbar showing), plus the two cells the
// spec always had. Insets are injected after boot: headless reports env() as 0.
const CELLS = [
  { name: "932x430", width: 932, height: 430, sal: 0, sar: 0, sab: 0 },
  { name: "844x390", width: 844, height: 390, sal: 0, sar: 0, sab: 0 },
  { name: "A-852x393-insets", width: 852, height: 393, sal: 59, sar: 59, sab: 21 },
  { name: "C-852x283-insets", width: 852, height: 283, sal: 59, sar: 59, sab: 0 },
];

for (const vp of CELLS) {
  test.describe(`WATCH bar ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true });

    test("one closed row under 35 %, popover above the bar, picker and JUMP on one row inside the safe area", async ({ page }) => {
      await page.goto("/");
      await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: BOOT_MS });
      await page.addStyleTag({ content: `:root{--sal:${vp.sal}px!important;--sar:${vp.sar}px!important;--sat:0px!important;--sab:${vp.sab}px!important}` });
      await page.evaluate(() => {
        const events = Array.from({ length: 6 }, (_, i) => ({ t: 60 + i * 200, lap: i + 1, kind: "pass", text: "VER passes NOR" }));
        const drivers = ["VER", "NOR", "LEC"].map((code) => ({ code, name: code + " Driver" }));
        const rep = {
          describe: () => ({ name: "TEST GP", startT: 0, drivers, events, speeds: [1, 2] }),
          status: () => ({ paused: false, T: 100, duration: 1500, speed: 1, follow: "VER", finished: false, broadcast: { auto: true, locked: false, manual: false, manualRemaining: 0 } }),
          seek() {}, setPaused() {}, eventStep() {}, setSpeed() {}, follow: () => true, setLocked() {}, setAuto() {},
        };
        // @ts-ignore
        WatchTransport.create({ camMode: 0, setCamMode() {}, snapGameCam() {} }, rep).start();
      });
      const closed = await page.evaluate(() => {
        const r = (s) => document.querySelector(s).getBoundingClientRect();
        const bar = r(".watch-transport"), rows = new Set([...document.querySelectorAll('.watch-transport [data-wt="controls"] > :not([hidden])')].map((e) => Math.round(e.getBoundingClientRect().top)));
        const sal = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sal")) || 0;
        const sar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sar")) || 0;
        return { pct: bar.height / innerHeight, rows: rows.size, left: bar.left, right: bar.right, sal, sar, bw: innerWidth,
          more: getComputedStyle(document.querySelector('[data-wt="more"]')).display };
      });
      expect(closed.rows, "every control on one row").toBe(1);
      expect(closed.pct, "closed bar ≤ 35 % of the window").toBeLessThanOrEqual(0.35);
      expect(closed.left).toBeGreaterThanOrEqual(closed.sal);
      expect(closed.right).toBeLessThanOrEqual(closed.bw - closed.sar);
      expect(closed.more).not.toBe("none");
      // --wt-h is written at start and again by a ResizeObserver, whose first callback lands a frame later: poll, never read once.
      await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).getPropertyValue("--wt-h").trim()), { timeout: 5000 }).toMatch(/^\d+(\.\d+)?px$/);
      await page.evaluate(() => { /** @type {HTMLDetailsElement} */ (document.querySelector('[data-wt="more"]')).open = true; });
      const open = await page.evaluate(() => {
        const r = (s) => document.querySelector(s).getBoundingClientRect();
        const bar = r(".watch-transport"), box = r('[data-wt="more-box"]'), pick = r('[data-wt="chapter"]'), jump = r('[data-wt="chapter-jump"]');
        const sal = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sal")) || 0;
        const sar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sar")) || 0;
        return { barTop: bar.top, barH: bar.height, boxBottom: box.bottom, boxTop: box.top, boxLeft: box.left, boxRight: box.right, sal, sar, bw: innerWidth,
          sameRow: Math.abs(pick.bottom - jump.bottom) < 4, jumpH: jump.height, jumpR: jump.right, pickW: pick.width };
      });
      expect(open.boxBottom, "the popover sits above the bar").toBeLessThanOrEqual(open.barTop + 0.5);
      expect(open.boxTop, "the popover stays on screen").toBeGreaterThanOrEqual(0);
      expect(open.boxLeft).toBeGreaterThanOrEqual(open.sal);
      expect(open.boxRight).toBeLessThanOrEqual(open.bw - open.sar + 0.5);
      expect(open.sameRow).toBe(true);
      expect(open.jumpH).toBeGreaterThanOrEqual(44);
      expect(open.jumpR).toBeLessThanOrEqual(open.bw);
      expect(open.pickW).toBeGreaterThan(120);
    });
  });
}
