/* title-home-scene-prepaint.test.mjs — live Home grid must not wait for experience.js.
 *
 * Run: node --test tests/unit/title-home-scene-prepaint.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

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

test("compact-wide live Home grid-places #menu-secondary under the brand", () => {
  // Source pin: #menu-buttons { display: contents } lifts groups into #overlay
  // so #menu-secondary can grid-place under #menu-brand (no DOM move).
  assert.match(
    menus,
    /html\[data-home-live\] :where\(body\[data-shape="wide"\]\[data-density="compact"\]\) #overlay #menu-buttons \{\s*display:\s*contents/,
    "lifts door groups into the overlay grid",
  );
  assert.match(
    menus,
    /html\[data-home-live\] :where\(body\[data-shape="wide"\]\[data-density="compact"\]\) #overlay #menu-secondary \{[\s\S]*grid-column:\s*1;[\s\S]*grid-row:\s*2;[\s\S]*height:\s*var\(--tap\)/,
    "parks #menu-secondary under the brand as a --tap row",
  );
  assert.match(
    menus,
    /html\[data-home-live\] :where\(body\[data-shape="wide"\]\[data-density="compact"\]\) #overlay #menu-secondary \.bigbtn \{[\s\S]*min-height:\s*var\(--tap-paint\)/,
    "under-brand rooms keep the --tap-paint floor",
  );
  assert.match(
    menus,
    /html\[data-home-live\] :where\(body\[data-shape="wide"\]\[data-density="compact"\]\) #overlay #menu-secondary \.bigbtn \{[\s\S]*white-space:\s*nowrap/,
    "under-brand room labels stay on one line (no wrap clip)",
  );
  assert.doesNotMatch(
    menus,
    /html\[data-home-live\] :where\(body\[data-shape="wide"\]\[data-density="compact"\]\) #overlay #menu-secondary \.bigbtn \{[\s\S]*white-space:\s*normal/,
  );
  const secondaryBlock = menus.match(
    /html\[data-home-live\] :where\(body\[data-shape="wide"\]\[data-density="compact"\]\) #overlay #menu-secondary \{[^}]+\}/,
  );
  assert.ok(secondaryBlock, "compact-wide #menu-secondary rule block exists");
  assert.match(secondaryBlock[0], /display:\s*flex/, "rooms stay a visible flex row");
  assert.doesNotMatch(secondaryBlock[0], /display:\s*none/);
});

test("portrait live Home #menu-buttons is tall before data-home-ready", async () => {
  const chrome = process.env.APEX_CHROME || "/usr/local/bin/google-chrome";
  if (!fs.existsSync(chrome)) return;
  // Ephemeral port — fixed :3456 races other tooling-fast / serve jobs.
  const { startStaticServer, launchChromium, shutdown } = await import("../../tools/lib/harness.mjs");
  const srv = await startStaticServer(ROOT);
  let browser;
  try {
    browser = await launchChromium({
      executablePath: chrome,
      args: ["--use-angle=swiftshader-webgl", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage({ viewport: { width: 393, height: 659 } });
    await page.goto(srv.url, { waitUntil: "domcontentloaded", timeout: 60000 });
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
    await Promise.allSettled([browser?.close(), srv.close()]);
    await shutdown();
  }
});

test("experience.js keeps html and #overlay home-scene stamps aligned", () => {
  const experience = fs.readFileSync(path.join(ROOT, "js/ui/experience.js"), "utf8");
  assert.match(
    experience,
    /document\.documentElement\.dataset\.homeScene = s\.mode;[\s\S]*dataset\.homeLive = "1";[\s\S]*overlay\.dataset\.homeScene = s\.mode;/,
  );
});
