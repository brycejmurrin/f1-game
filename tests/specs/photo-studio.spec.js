// @ts-check
import { writeFile } from "node:fs/promises";
import { test, expect, BOOT_MS, clickLive } from "../helpers/fixtures.js";

const LANDSCAPE = { width: 852, height: 393 };
const PORTRAIT = { width: 393, height: 852 };
test.use({ viewport: LANDSCAPE, hasTouch: true });

async function boot(page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("apex26.resMode", '"low"'));
  await page.goto("/");
  await page.waitForFunction(() => window.__apex && window.__apex.race,
    null, { polling: 100, timeout: BOOT_MS });
}
async function present(page) {
  await page.evaluate(() => __apex.awaitPresent(20000));
}
async function controls(page, ids) {
  const boxes = await page.evaluate((ids) => ids.map((id) => {
    const el = document.getElementById(id), r = CssZoom.viewportRect(el);
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { id, x, y, inside: r.x >= -0.5 && r.y >= -0.5 &&
      r.x + r.width <= innerWidth + 0.5 && r.y + r.height <= innerHeight + 0.5,
      hit: hit === el || el.contains(hit) };
  }), ids);
  for (const b of boxes) {
    expect(b.inside, `${b.id} inside viewport`).toBe(true);
    expect(b.hit, `${b.id} receives input`).toBe(true);
  }
  return boxes;
}
async function nativeClick(page, id) {
  const [b] = await controls(page, [id]);
  await page.mouse.click(b.x, b.y);
}
async function evidence(page, info, name) {
  const cdp = await page.context().newCDPSession(page);
  try {
    const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const path = info.outputPath(`${name}.png`);
    await writeFile(path, Buffer.from(shot.data, "base64"));
    await info.attach(name, { path, contentType: "image/png" });
  } finally { await cdp.detach(); }
}

test("Home photo retains its shot across rotation at 200%, captures, and returns its camera", async ({ page, pageErrors }, info) => {
  await boot(page);
  await page.evaluate(() => {
    AppearanceStudio.setScene("garage", "still");
    AppearanceStudio.setHomeCamera("hero");
  });
  await page.waitForSelector('#overlay[data-home-ready="1"]', { timeout: BOOT_MS });
  const before = await page.evaluate(() => __apex.garageCam());
  await page.locator("#mb-photo").focus();
  expect(await page.evaluate(() => document.activeElement.id)).toBe("mb-photo");
  await clickLive(page, "mb-photo");
  await page.locator("#ps-shots button").filter({ hasText: "TOP" }).evaluate((b) => b.click());
  await page.evaluate(() => __apex.uiScale(200));
  await present(page);
  const top = await page.evaluate(() => __apex.garageCam());
  expect(top.el).not.toBe(before.el);
  for (const [name, viewport] of [["home-landscape-200", LANDSCAPE], ["home-portrait-200", PORTRAIT]]) {
    await page.setViewportSize(viewport);
    await present(page);
    const current = await page.evaluate(() => __apex.garageCam());
    for (const key of ["az", "el", "dist", "pan"]) expect(current[key]).toEqual(top[key]);
    await controls(page, ["ps-capture", "ps-close"]);
    await evidence(page, info, name);
  }
  await nativeClick(page, "ps-capture");
  await page.waitForFunction(() => PhotoStudio.state().captured && !PhotoStudio.state().busy &&
    document.getElementById("ps-preview").naturalWidth > 0, null, { polling: 100, timeout: BOOT_MS });
  await evidence(page, info, "home-captured");
  await nativeClick(page, "ps-close");
  await expect(page.locator("#photo-studio")).toBeHidden();
  await page.waitForSelector('#overlay[data-home-ready="1"]', { timeout: BOOT_MS });
  const restored = await page.evaluate(() => __apex.garageCam());
  for (const key of ["az", "el", "dist", "pan"]) expect(restored[key]).toEqual(before[key]);
  await expect(page.locator("#mb-photo")).toBeFocused();
  expect(pageErrors).toEqual([]);
});

test("Paused race photo keeps controls reachable at 200% and isolates panel scrolling", async ({ page, pageErrors }, info) => {
  await boot(page);
  await page.evaluate(async () => {
    __apex.headless(true);
    await __apex.race("bahrain", "day", "dry");
    __apex.go(); __apex.park(0.1);
  });
  await clickLive(page, "pausebtn");
  await clickLive(page, "pm-photo");
  await page.evaluate(() => { __apex.uiScale(200); __apex.headless(false); });
  for (const [name, viewport] of [["race-landscape-200", LANDSCAPE], ["race-portrait-200", PORTRAIT]]) {
    await page.setViewportSize(viewport);
    await present(page);
    await controls(page, ["ps-capture", "ps-close", "pc-move", "pc-look", "pc-up", "pc-down"]);
    await expect(page.locator("#pausemenu")).toBeHidden();
    await expect(page.locator("#rotate-device")).toBeHidden();
    await evidence(page, info, name);
  }
  const speed = await page.evaluate(() => __apex.freeCam().speed);
  const body = await page.locator("#ps-body").evaluate((el) => {
    el.scrollTop = 0;
    const r = CssZoom.viewportRect(el);
    return { x: r.x + r.width / 2, y: r.y + Math.min(r.height / 2, 80),
      overflow: getComputedStyle(el).overflowY, scrollable: el.scrollHeight > el.clientHeight };
  });
  expect(body.overflow).toMatch(/auto|scroll/);
  expect(body.scrollable).toBe(true);
  await page.mouse.move(body.x, body.y);
  await page.mouse.wheel(0, 240);
  await expect.poll(() => page.locator("#ps-body").evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => __apex.freeCam().speed)).toBe(speed);
  await nativeClick(page, "ps-close");
  await expect(page.locator("#photo-studio")).toBeHidden();
  // The existing portrait race gate resumes ownership after leaving Photo.
  // It retains pause and yields the card again upon rotation to landscape.
  await expect(page.locator("#rotate-device")).toBeVisible();
  await page.setViewportSize(LANDSCAPE);
  await expect(page.locator("#pausemenu")).toBeVisible();
  await expect(page.locator("#rotate-device")).toBeHidden();
  expect(await page.evaluate(() => __apex.freeCam().open)).toBe(false);
  expect(pageErrors).toEqual([]);
});

test("Accent lists receive real keyboard events through menu navigation", async ({ page, pageErrors }) => {
  await boot(page);
  await page.evaluate(() => __apex.headless(true));
  await clickLive(page, "mb-settings");
  await clickLive(page, "pm-open-appearance");
  await page.locator('[data-as="advanced"] > summary').click();
  await page.locator("#pm-general-sum").click();
  const menu = page.locator("#pm-menuaccent-swatches"), hud = page.locator("#pm-hudaccent-swatches");
  const choices = await menu.locator('[role="option"]').evaluateAll((bs) => bs.map((b) => b.dataset.accent));
  const hudBefore = await hud.locator('[aria-selected="true"]').getAttribute("data-accent");
  await menu.locator('[tabindex="0"]').focus();
  for (const [key, index] of [["End", choices.length - 1], ["Home", 0], ["ArrowRight", 1], ["ArrowDown", 2], ["ArrowLeft", 1], ["ArrowUp", 0]]) {
    await page.keyboard.press(key);
    await expect(menu.locator('[aria-selected="true"]')).toHaveAttribute("data-accent", choices[index]);
    await expect(menu.locator('[tabindex="0"]')).toHaveCount(1);
    await expect(menu.locator('[aria-selected="true"]')).toBeFocused();
  }
  expect(await hud.locator('[aria-selected="true"]').getAttribute("data-accent")).toBe(hudBefore);
  await page.keyboard.press("Tab");
  expect(await menu.evaluate((el) => el.contains(document.activeElement))).toBe(false);
  await menu.locator('[tabindex="0"]').focus();
  await menu.locator('[tabindex="0"]').dispatchEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true });
  expect(await menu.evaluate((el) => el.contains(document.activeElement))).toBe(false);
  await expect(menu.locator('[aria-selected="true"]')).toHaveAttribute("data-accent", choices[0]);
  await hud.locator('[tabindex="0"]').focus();
  await page.keyboard.press("End");
  await expect(hud.locator('[aria-selected="true"]')).toHaveAttribute("data-accent", "custom");
  await expect(hud.locator('[tabindex="0"]')).toHaveCount(1);
  await page.locator("#pm-hudaccent-hextext").fill("#123456");
  await page.locator("#pm-hudaccent-hextext").press("Tab");
  expect(await hud.evaluate((el) => el.contains(document.activeElement))).toBe(false);
  expect(pageErrors).toEqual([]);
});

// Two native IndexedDB connections, without two expensive game renderers.
// Both pages run the production Studio DOM/import/save code on one origin.
test("Two tabs atomically retain six durable photos after concurrent saves", async ({ context, page }) => {
  await context.route("**/__photo-storage", (route) => route.fulfill({
    contentType: "text/html", body: '<div id="photo-studio" hidden></div>',
  }));
  const other = await context.newPage(), tabs = [page, other];
  try {
    for (const [i, tab] of tabs.entries()) {
      await tab.goto("/__photo-storage");
      await tab.addScriptTag({ url: "/js/ui/setting-row.js" });
      await tab.addScriptTag({ url: "/js/ui/photo-studio.js" });
      await tab.evaluate((i) => {
        window.studio = PhotoStudio.create({ $: (id) => document.getElementById(id) }, { garage: {} });
        window.studio.open({ source: "garage", metadata: { title: `Tab ${i}` } });
      }, i);
      await expect(tab.locator("#ps-library")).toContainText("Capture a frame");
      const png = await tab.evaluate(() => {
        const c = document.createElement("canvas"); c.width = c.height = 8;
        c.getContext("2d").fillRect(0, 0, 8, 8); return c.toDataURL().split(",")[1];
      });
      await tab.locator("#ps-import").setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
      await expect(tab.locator("#ps-message")).toContainText("Personal photo imported");
    }
    await page.evaluate(() => new Promise((resolve, reject) => {
      const open = indexedDB.open("apex26.photoLibrary", 1);
      open.onsuccess = () => {
        const db = open.result, tx = db.transaction("photos", "readwrite"), s = tx.objectStore("photos");
        for (let i = 1; i <= 5; i++) s.put({ id: `seed-${i}`, at: i, title: `Seed ${i}`, blob: new Blob(["seed"]), thumb: "" });
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
      }; open.onerror = () => reject(open.error);
    }));
    let arrived = 0, release;
    const barrier = new Promise((resolve) => { release = resolve; });
    await context.exposeBinding("photoReadsReady", async () => {
      if (++arrived === 2) release();
      await barrier;
    });
    // The old read/list-then-put implementation must see the same five rows.
    // Delay only notification AFTER a native readonly transaction completes;
    // native write transactions remain unmodified and active request callbacks
    // retain IndexedDB's genuine cross-tab serialization.
    for (const tab of tabs) await tab.evaluate(() => {
      const native = IDBDatabase.prototype.transaction;
      let armed = true;
      IDBDatabase.prototype.transaction = function (...args) {
        const tx = native.apply(this, args);
        if (armed && tx.mode === "readonly" && tx.objectStoreNames.contains("photos")) {
          armed = false;
          Object.defineProperty(tx, "oncomplete", { set(handler) {
            tx.addEventListener("complete", async (event) => {
              await window.photoReadsReady(); handler.call(tx, event);
            }, { once: true });
          } });
        }
        return tx;
      };
    });
    await Promise.all(tabs.map((tab) => tab.locator("#ps-save").click()));
    for (const tab of tabs) {
      await expect(tab.locator("#ps-message")).toHaveText("Saved to My Photos on this device.");
      await expect(tab.locator("#ps-save")).toBeEnabled();
    }
    const photos = await page.evaluate(() => new Promise((resolve, reject) => {
      const open = indexedDB.open("apex26.photoLibrary", 1);
      open.onsuccess = () => {
        const db = open.result, tx = db.transaction("photos"), req = tx.objectStore("photos").getAll();
        tx.oncomplete = () => { db.close(); resolve(req.result.map((p) => ({ title: p.title,
          type: p.blob.type, size: p.blob.size, thumb: p.thumb }))); };
        tx.onabort = () => reject(tx.error);
      }; open.onerror = () => reject(open.error);
    }));
    expect(photos.map((p) => p.title).sort()).toEqual(["Seed 2", "Seed 3", "Seed 4", "Seed 5", "Tab 0", "Tab 1"]);
    for (const photo of photos.filter((p) => p.title.startsWith("Tab "))) {
      expect(photo.type).toBe("image/jpeg"); expect(photo.size).toBeGreaterThan(0);
      expect(photo.thumb).toMatch(/^data:image\/jpeg;base64,/);
    }
  } finally { await other.close(); }
});
