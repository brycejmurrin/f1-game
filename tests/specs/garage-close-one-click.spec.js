// @ts-check
// CLOSE GARAGE must dismiss on one real mouse click even when #loading is up
// in the busy phase (z-index above #carsetup). Regression for live acb6a7a.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { toMenu } from "../helpers/shared-page.js";

async function mouseClickCenter(page, selector) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error("missing box for " + selector);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.click(x, y);
}

test.describe("garage close — one click with loading plate", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("busy #loading does not block cs-done after Tyres tab", async ({ page }) => {
    test.setTimeout(BOOT_MS + 120_000);
    await toMenu(page);
    await page.locator("#mb-garage").click();
    await expect(page.locator("#carsetup")).toBeVisible();
    await page.waitForFunction(
      () => !document.getElementById("carsetup")?.hasAttribute("aria-busy"),
      null,
      { timeout: BOOT_MS, polling: 100 },
    );
    await page.locator('#cs-tabs [data-cs-cat="tyres"]').click();
    await page.waitForFunction(
      () => !document.getElementById("carsetup")?.hasAttribute("aria-busy"),
      null,
      { timeout: BOOT_MS, polling: 100 },
    );

    await page.evaluate(() => {
      const loading = document.getElementById("loading");
      if (!loading) throw new Error("no #loading");
      loading.hidden = false;
      loading.dataset.phase = "busy";
    });
    const top = await page.evaluate(() => {
      const done = document.getElementById("cs-done");
      const r = done.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return el && el.id;
    });
    expect(top, "busy plate must not be the hit target on CLOSE GARAGE").toBe("cs-done");

    await mouseClickCenter(page, "#cs-done");
    await expect(page.locator("#carsetup")).toBeHidden({ timeout: 5000 });
    await expect(page.locator("#overlay")).toBeVisible();
  });
});

// Motion on, webdriver false, three on WebGL2: a root view transition owns hit
// testing until the new frame is captured (elementFromPoint returns HTML even
// with pointer-events:none on the snapshot). On software GL that wait is the
// present, ~14 s at 1280×800. This describe opts out of the suite's reduced
// motion and holds any crossfade for 30 s, so a regression that starts one
// here fails the hit check instead of finishing the fade first. Software GL
// must enter directly; Escape is not the path under test.
test.describe("garage close — one click during the open crossfade", () => {
  test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: "no-preference" });
  test.setTimeout(BOOT_MS + 90_000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "webdriver", { configurable: true, get: () => false });
      localStorage.setItem("apex26.gfxBackend", "three");
      localStorage.setItem("apex26.tlxForceGL", "1");
      localStorage.setItem("apex26.garageArrival", JSON.stringify({ enabled: false }));
    });
    await toMenu(page);
    expect(await page.evaluate(() => ({
      webdriver: navigator.webdriver,
      reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
      b: GLX.backend,
      api: GLX.backendState().api,
    }))).toEqual({ webdriver: false, reduced: false, b: "three", api: "webgl2" });
    await page.addStyleTag({ content:
      "::view-transition-group(*),::view-transition-old(*),::view-transition-new(*),::view-transition-image-pair(*){" +
      "animation-duration:30s !important;animation-delay:0s !important}" });
  });

  test("one click on CLOSE GARAGE hits #cs-done and leaves", async ({ page }) => {
    const door = await page.locator("#mb-garage").boundingBox();
    if (!door) throw new Error("no #mb-garage box");
    await page.mouse.click(door.x + door.width / 2, door.y + door.height / 2);
    await page.waitForFunction(() => {
      const cs = document.getElementById("carsetup");
      const done = document.getElementById("cs-done");
      if (!cs || cs.hidden || !done) return false;
      const r = done.getBoundingClientRect();
      return r.width > 40 && r.height > 20;
    }, null, { polling: 50, timeout: BOOT_MS });

    const aim = await page.evaluate(() => {
      const done = document.getElementById("cs-done");
      const r = done.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const el = document.elementFromPoint(x, y);
      return { id: el && (el.id || el.nodeName), x, y, text: done.textContent, active: !!document.activeViewTransition };
    });
    expect(aim.text).toBe("CLOSE GARAGE");
    expect(aim.id, "the open crossfade must not take the hit from #cs-done: " + JSON.stringify(aim)).toBe("cs-done");
    await page.mouse.click(aim.x, aim.y);
    await expect(page.locator("#carsetup")).toBeHidden({ timeout: 5000 });
    await expect(page.locator("#overlay")).toBeVisible();
  });
});
