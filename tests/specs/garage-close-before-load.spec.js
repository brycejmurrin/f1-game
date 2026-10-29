// @ts-check
// CLOSE GARAGE must work on one click while aria-busy (before buildSetup finishes).
// Measures #cs-done bbox drift from first paint through busy clear.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { toMenu } from "../helpers/shared-page.js";
import fs from "fs";
import path from "path";

const OUT = path.resolve("artifacts/garage-close-before-load");
fs.mkdirSync(OUT, { recursive: true });

async function measureEarlyClose(page, label, touch) {
  const samples = await page.evaluate(async () => {
    const out = [];
    document.getElementById("mb-garage").click();
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      const cs = document.getElementById("carsetup");
      if (!cs || cs.hidden) continue;
      const done = document.getElementById("cs-done");
      if (!done) continue;
      const r = done.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      out.push({
        busy: cs.hasAttribute("aria-busy"),
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        exit: cs.getAttribute("data-cs-exit"),
        backDisplay: getComputedStyle(document.getElementById("cs-back")).display,
        hit: top?.id || null,
        statsH: document.getElementById("cs-stats-inner")?.getBoundingClientRect().height || 0,
      });
      if (out.length > 4 && !cs.hasAttribute("aria-busy")) break;
    }
    return out;
  });

  const aim = samples.find((s) => s.busy && s.w > 40 && s.h > 20);
  let clickRect = null;
  if (aim) {
    clickRect = { x: aim.x + aim.w / 2, y: aim.y + aim.h / 2, at: aim };
    if (touch) await page.touchscreen.tap(clickRect.x, clickRect.y);
    else await page.mouse.click(clickRect.x, clickRect.y);
  }

  const closed = await page.evaluate(() => document.getElementById("carsetup")?.hidden);
  const drift = {
    dx: Math.max(...samples.map((s) => s.x)) - Math.min(...samples.map((s) => s.x)),
    dy: Math.max(...samples.map((s) => s.y)) - Math.min(...samples.map((s) => s.y)),
  };
  const payload = { label, clickRect, closed, drift, samples };
  fs.writeFileSync(path.join(OUT, `${label}.json`), JSON.stringify(payload, null, 2));
  return payload;
}

test.describe("garage close before load completes — desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test.setTimeout(BOOT_MS + 90_000);
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("apex26.gfxBackend", "three");
      localStorage.setItem("apex26.tlxForceGL", "1");
      localStorage.setItem("apex26.garageArrival", JSON.stringify({ enabled: false }));
    });
    await toMenu(page);
    expect(await page.evaluate(() => ({ b: GLX.backend, api: GLX.backendState().api }))).toEqual({
      b: "three",
      api: "webgl2",
    });
  });

  test("one click at first busy frame closes (three GL)", async ({ page }) => {
    const r = await measureEarlyClose(page, "desktop", false);
    expect(r.clickRect, "must click while busy").toBeTruthy();
    expect(r.clickRect.at.busy, "click must land during aria-busy").toBe(true);
    expect(r.drift.dy, "footer jump after aim (pre-fix phone ~47px)").toBeLessThan(8);
    expect(r.closed, "one click must close garage").toBe(true);
  });
});

test.describe("garage close before load completes — phone", () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });
  test.setTimeout(BOOT_MS + 90_000);
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("apex26.gfxBackend", "three");
      localStorage.setItem("apex26.tlxForceGL", "1");
      localStorage.setItem("apex26.garageArrival", JSON.stringify({ enabled: false }));
    });
    await toMenu(page);
  });

  test("one tap at first busy frame closes (three GL)", async ({ page }) => {
    const r = await measureEarlyClose(page, "phone", true);
    expect(r.clickRect, "must tap while busy").toBeTruthy();
    expect(r.clickRect.at.busy, "tap must land during aria-busy").toBe(true);
    expect(r.drift.dy, "footer jump after aim (pre-fix phone ~47px)").toBeLessThan(8);
    expect(r.closed, "one tap must close garage").toBe(true);
  });
});
