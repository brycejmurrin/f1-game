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
import { cssRules, decl } from "../helpers/css-rules.mjs";

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
  // Read as RULES across the blocking set (tests/helpers/css-rules.mjs): the old
  // greedy `[\s\S]*` regexes were satisfied by ANY later rule, so deleting the
  // #menu-secondary transform reset or the tall #title-car hide stayed green.
  const blocking = cssRules(TITLE_CRITICAL
    .map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n"));
  assert.equal(
    decl(blocking, 'html[data-home-live] :where(body[data-shape="wide"]) #overlay #menu-buttons', "grid-column"), "2",
    "wide live Home puts #menu-buttons in column 2 before experience.css loads",
  );
  for (const sel of [
    "html[data-home-live] #overlay :is(#menu-retention, #menu-primary, #menu-garage, #menu-explore, #menu-create) .bigbtn",
    "html[data-home-live] #overlay #menu-secondary .bigbtn",
  ]) {
    assert.equal(decl(blocking, sel, "transform"), "none",
      `live Home clears skewed .bigbtn transforms in the blocking set (${sel})`);
  }
  assert.equal(
    decl(blocking, 'html[data-home-live] :where(body[data-shape="tall"]) #title-car', "display"), "none",
    "tall live Home hides #title-car in blocking CSS before data-home-ready",
  );
  assert.equal(MANIFEST.CSS_DEFERRED.includes("css/experience.css"), true);
  assert.doesNotMatch(
    menus,
    /grid-column:\s*2[\s\S]*@layer overlays/,
    "menus.css home-scene block is not deferred into overlays layer",
  );
});

test("compact-wide live Home grid-places #menu-secondary under the door stack", () => {
  // Source pin: #menu-buttons spans the overlay with subgrid so #menu-secondary
  // can sit under #menu-brand while remaining the title scroll box (no DOM move).
  // Each property is read from the ONE rule that owns it (no `[\s\S]*` across rules).
  const rules = cssRules(menus);
  const CW = String.raw`:where\(body\[data-shape="wide"\]\[data-density="compact"\]\) #overlay`;
  const BUTTONS = new RegExp(String.raw`(^|^html\[data-home-scene\] )` + CW + " #menu-buttons$");
  const SECONDARY = new RegExp("^" + CW + " #menu-secondary$");
  const ROOMS = new RegExp("^" + CW + String.raw` #menu-secondary \.bigbtn$`);
  // The value the unconditional rules (no @media / @container refinement) leave in place.
  const own = (sel, prop) => {
    const r = rules.filter((x) => sel.test(x.selector) && x.decls.has(prop) && x.context.every((c) => c.startsWith("@layer ")));
    return r.length ? r.at(-1).decls.get(prop) : null;
  };
  assert.equal(own(BUTTONS, "grid-template-columns"), "subgrid", "subgrids door groups onto the overlay columns");
  assert.equal(own(BUTTONS, "overflow-y"), "auto", "keeps #menu-buttons as the title scroll box");
  assert.ok(!rules.some((r) => BUTTONS.test(r.selector) && r.decls.get("display") === "contents"),
    "display:contents drops the scroll box (ui-scale @200% / SE hit tests)");
  assert.equal(own(SECONDARY, "grid-column"), "2", "parks #menu-secondary in the door column (Oct 6 look)");
  assert.equal(own(SECONDARY, "grid-row"), "5", "…as its bottom row");
  assert.equal(own(SECONDARY, "min-height"), "var(--tap)", "with a --tap floor (#1537: height auto for 2-line labels)");
  assert.equal(own(ROOMS, "min-height"), "var(--tap-paint)", "under-brand rooms keep the --tap-paint floor");
  assert.equal(own(ROOMS, "white-space"), "normal",
    "#1537: under-brand rooms wrap (TRACK DESIGNER / HOW TO PLAY) instead of nowrap-clip");
  assert.equal(own(ROOMS, "justify-content"), "flex-start",
    "under-brand room icons stay on the leading edge (not clipped by center+overflow)");
  assert.equal(own(BUTTONS, "padding-inline"), "var(--gap)", "CAREER skew tip clears #menu-buttons overflow-x via inline pad");
  assert.equal(own(SECONDARY, "display"), "flex", "rooms stay a visible flex row");
  assert.ok(!rules.some((r) => SECONDARY.test(r.selector) && r.decls.get("display") === "none"), "no compact-wide rule hides the rooms");
});

// The ONE rendering case. It used to `return` (a silent PASS) unless Chrome sat at
// /usr/local/bin/google-chrome, which no CI runner or container has, and APEX_CHROME
// is set nowhere — so it had never run. Now it finds Chromium the way every tool
// does (tools/lib/chromium-path.mjs: PW_CHROMIUM / CHROME, Playwright's browsers,
// then PATH), runs on CI (CI is set by GitHub Actions) or on an explicit opt-in, and
// FAILS when it should run and no browser is found. Elsewhere it is a named SKIP:
// agents do not launch a browser locally (AGENTS.md rules 5 and 10).
//   APEX_PREPAINT_BROWSER=1 node --test tests/unit/title-home-scene-prepaint.test.mjs
const BROWSER_RUN = !!process.env.CI || process.env.APEX_PREPAINT_BROWSER === "1";
test("portrait live Home #menu-buttons is tall before data-home-ready", {
  skip: !BROWSER_RUN && "browser case: runs on CI, or locally with APEX_PREPAINT_BROWSER=1",
}, async () => {
  const { chromiumPath } = await import("../../tools/lib/chromium-path.mjs");
  const chrome = process.env.APEX_CHROME || chromiumPath();
  assert.ok(chrome && fs.existsSync(chrome),
    `no Chromium found (APEX_CHROME=${process.env.APEX_CHROME || "unset"}, resolved ${chrome || "nothing"}): ` +
    "this rendering case must run here, so a missing browser is a failure, not a pass");
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
