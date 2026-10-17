// @ts-check
// WATCH transport on a phone in landscape: the opened EVENT CHAPTERS drawer must
// not swallow the race. JUMP TO EVENT used to wrap onto a row of its own, so the
// bar reached 70% of an 844x390 screen; the select and the button share one row.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

for (const vp of [{ width: 932, height: 430 }, { width: 844, height: 390 }]) {
  test.describe(`WATCH chapters ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp, hasTouch: true, isMobile: true });

    test("open chapters drawer keeps select and jump button on one row and under 62% of the height", async ({ page }) => {
      await page.goto("/");
      await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: BOOT_MS });
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
        // @ts-ignore
        document.querySelector('[data-wt="chapters"]').open = true;
      });
      const m = await page.evaluate(() => {
        const r = (s) => document.querySelector(s).getBoundingClientRect();
        const bar = r(".watch-transport"), pick = r('[data-wt="chapter"]'), jump = r('[data-wt="chapter-jump"]');
        return { bar: bar.height / innerHeight, sameRow: Math.abs(pick.bottom - jump.bottom) < 4, jumpH: jump.height, jumpR: jump.right, bw: innerWidth };
      });
      expect(m.sameRow).toBe(true);
      expect(m.bar).toBeLessThan(0.62);
      expect(m.jumpH).toBeGreaterThanOrEqual(44);
      expect(m.jumpR).toBeLessThanOrEqual(m.bw);
    });
  });
}
