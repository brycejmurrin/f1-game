/* title-home-scene-prepaint.test.mjs — live Home grid must not wait for experience.js.
 *
 * Run: node --test tests/unit/title-home-scene-prepaint.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const MANIFEST = require("../../tools/manifest.cjs");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const menus = fs.readFileSync(path.join(ROOT, "css/menus.css"), "utf8");

const TITLE_CRITICAL = [
  "css/tokens.css", "css/components.css", "css/title.css", "css/menus.css",
  "css/responsive.css",
];

test("pre-paint script stamps html[data-home-scene] from apex26.homeScene", () => {
  assert.match(html, /apex26\.homeScene/);
  assert.match(html, /document\.documentElement\.setAttribute\("data-home-scene"/);
  assert.match(html, /setAttribute\("data-home-live", "1"\)/);
  assert.match(html, /hsMode === "auto"[\s\S]*hsMode = envs\[0\]/);
});

test("live Home grid geometry lives in blocking css/menus.css", () => {
  const blocking = TITLE_CRITICAL
    .map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
  assert.match(
    blocking,
    /html\[data-home-live\] #overlay #menu-buttons[\s\S]*grid-column:\s*2/,
    "wide live Home puts #menu-buttons in column 2 before experience.css loads",
  );
  assert.match(
    blocking,
    /html\[data-home-live\] #overlay[\s\S]*transform:\s*none/,
    "live Home clears skewed .bigbtn transforms in the blocking set",
  );
  assert.match(
    blocking,
    /html\[data-home-live\][\s\S]*#title-car \{ display: none;/,
    "tall live Home hides #title-car in blocking CSS before data-home-ready",
  );
  assert.equal(MANIFEST.CSS_DEFERRED.includes("css/experience.css"), true);
  assert.doesNotMatch(
    menus,
    /grid-column:\s*2[\s\S]*@layer overlays/,
    "menus.css home-scene block is not deferred into overlays layer",
  );
});

test("portrait live Home #menu-buttons is tall before data-home-ready", async () => {
  const chrome = process.env.APEX_CHROME || "/usr/local/bin/google-chrome";
  if (!fs.existsSync(chrome)) return;
  const server = spawn("npx", ["--yes", "serve", "-l", "3456", "."], {
    cwd: ROOT, stdio: "ignore",
  });
  await new Promise((r) => setTimeout(r, 1500));
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: chrome,
      args: ["--use-angle=swiftshader-webgl", "--disable-dev-shm-usage"],
    });
    const page = await (await browser.newContext({
      viewport: { width: 393, height: 659 },
    })).newPage();
    await page.goto("http://127.0.0.1:3456/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#menu-buttons");
    const metrics = await page.evaluate(() => new Promise((resolve) => {
      const read = () => {
        const el = document.getElementById("menu-buttons");
        const overlay = document.getElementById("overlay");
        const car = document.getElementById("title-car");
        return {
          clientHeight: el?.clientHeight ?? 0,
          scrollHeight: el?.scrollHeight ?? 0,
          homeLive: document.documentElement.getAttribute("data-home-live"),
          homeReady: overlay?.getAttribute("data-home-ready"),
          titleCarDisplay: car ? getComputedStyle(car).display : "",
        };
      };
      setTimeout(() => resolve(read()), 3000);
    }));
    assert.equal(metrics.homeLive, "1");
    assert.equal(metrics.titleCarDisplay, "none");
    assert.ok(metrics.clientHeight >= 280,
      `#menu-buttons clientHeight ${metrics.clientHeight} want >= 280 (scroll ${metrics.scrollHeight})`);
  } finally {
    if (browser) await browser.close();
    server.kill("SIGTERM");
  }
});

test("experience.js keeps html and #overlay home-scene stamps aligned", () => {
  const experience = fs.readFileSync(path.join(ROOT, "js/ui/experience.js"), "utf8");
  assert.match(
    experience,
    /document\.documentElement\.dataset\.homeScene = s\.mode;[\s\S]*dataset\.homeLive = "1";[\s\S]*overlay\.dataset\.homeScene = s\.mode;/,
  );
});
