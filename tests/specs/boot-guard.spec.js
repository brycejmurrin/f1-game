// @ts-check
// THE BOOT GUARD: a module that fails to load must not leave a dead game.
//
// WHY THIS EXISTS — a live incident, not a hypothetical. Build 1238 shipped
// js/career/season-cal.js, a brand-new URL that had existed in no prior deploy.
// GitHub Pages served the updated index.html from an edge that did not yet have
// the file, the browser cached that 404 against the VERSIONED url, and the game
// then died on every load with a bare "Can't find variable: SeasonCal" — the
// file that defines the global simply was not there, and js/game.js was fine.
// A plain reload re-read the cached 404, so it did not heal on its own.
//
// Every new js/ module has that same first-deploy window, so the shell now
// detects a failed script load (capture-phase `error`, which is the only way to
// see a resource failure) and repairs it once. These two cases are the whole
// contract, and they pull in opposite directions: repair aggressively enough to
// fix the transient, but bounded hard enough that a genuinely absent file
// cannot put the page in a reload loop.
import { test, expect } from "@playwright/test";
import { openSession, performAction, matchesOracle } from "../../tools/ui/explorer/browser.mjs";
import { replayFaultScenario } from "../../tools/ui/explorer/fault-schedule.mjs";

test("saved lazy fault schedules continue and reject Monaco hydration after leaving the picker", async ({ browser, baseURL }, testInfo) => {
  test.setTimeout(60000);
  for (const outcome of ["continue", "reject"]) {
    const session = await openSession(browser, baseURL, { backend: "glx", touch: true });
    const scenario = { version: 1, id: `monaco-${outcome}`, goal: "Leave a held circuit preview and retain Home", actions: [
      { type: "faultHold", id: "monaco", path: "/js/circuits/monaco.js", timeoutMs: 30000 },
      { type: "click", selector: "#mb-race" },
      { type: "click", selector: '#sel-tracks button.track-row[aria-label="MONACO"]' },
      { type: "faultWait", id: "monaco" },
      { type: "click", selector: "#sel-back" },
      { type: "faultRelease", id: "monaco", outcome },
    ], oracle: { type: "game", state: "menu" } };
    try {
      const evidence = await replayFaultScenario(session, scenario, { performAction, matchesOracle });
      // Terminal network transfer is not proof that the application consumed it.
      if (outcome === "continue") {
        await session.page.waitForFunction(() => Tracks.circuitPayloadResident(Tracks.LIST.find(d => d.id === "monaco")),
          null, { polling: 100, timeout: 15000 });
      } else {
        await expect.poll(() => session.logs.errors.map(e => e.message).join("\n"), { timeout: 15000 })
          .toContain("circuit payload failed to load: monaco");
      }
      await expect(session.page.locator("#overlay")).toBeVisible();
      await expect(session.page.locator("#select")).toBeHidden();
      await expect(session.page.locator("#race-settings")).toBeHidden();
      expect(await matchesOracle(session, { type: "game", state: "menu" })).toBe(true);
      await testInfo.attach(`lazy-${outcome}`, { body: JSON.stringify(evidence, null, 2), contentType: "application/json" });
    } catch (error) {
      if (error.faultEvidence) await testInfo.attach(`lazy-${outcome}-failed`, { body: JSON.stringify(error.faultEvidence, null, 2), contentType: "application/json" });
      throw error;
    } finally { await session.context.close(); }
  }
});

test("a saved lazy fault schedule cannot pass when its request never occurs", async ({ browser, baseURL }, testInfo) => {
  const session = await openSession(browser, baseURL, { backend: "glx", touch: true });
  const scenario = { version: 1, id: "unused-script", goal: "An installed rule is not evidence of interception", actions: [
    { type: "faultHold", id: "unused", path: "/js/core/log.js", timeoutMs: 1000 },
    { type: "faultWait", id: "unused" },
    { type: "faultRelease", id: "unused", outcome: "continue" },
  ] };
  let evidence;
  try {
    await expect(replayFaultScenario(session, scenario, { performAction, matchesOracle }).catch(error => {
      evidence = error.faultEvidence; throw error;
    })).rejects.toThrow(/not observed/);
    expect(evidence.events.some(e => e.state === "observed")).toBe(false);
    await testInfo.attach("unused-script", { body: JSON.stringify(evidence, null, 2), contentType: "application/json" });
  } finally { await session.context.close(); }
});

const MODULE = "**/js/career/season-cal.js*";

/** Count main-frame navigations — the reload budget is the thing under test. */
function trackNavs(page) {
  const state = { n: 0 };
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) state.n++; });
  return state;
}

// The boot guard's repair is a reload, so a poll can land mid-navigation and
// page.evaluate rejects with "Execution context was destroyed". That is the
// repair working, not a failure: read it as "no overlay yet" and poll again.
const overlayText = (page) => page.evaluate(() => {
  const d = document.getElementById("__err_overlay");
  return d && d.style.display !== "none" ? d.textContent.replace(/\s+/g, " ") : null;
}).catch((e) => {
  if (/Execution context was destroyed|navigation/i.test(String(e && e.message))) return null;
  throw e;
});

test("production CSP allows prepaint preferences before deferred modules load", async ({ browser, baseURL }) => {
  // The ordinary suite bypasses CSP for injected test helpers. This context
  // uses the production policy and storageState, with no injected scripts.
  // https://playwright.dev/docs/api/class-browser#browser-new-context-option-bypass-csp
  const origin = new URL(baseURL).origin;
  const context = await browser.newContext({
    bypassCSP: false,
    viewport: { width: 1280, height: 720 },
    reducedMotion: "no-preference",
    storageState: { cookies: [], origins: [{ origin, localStorage: [
      { name: "apex26.gfxBackend", value: "webgl2" },
      ...Object.entries({ motion: "reduce", titleIntro: "off", menuWash: "off", titleArt: "off", homeScene: "static", pauseLayout: "compact" })
        .map(([key, value]) => ({ name: `apex26.${key}`, value: JSON.stringify(value) })),
    ] }] },
  });
  let releaseScripts;
  const deferred = new Promise((resolve) => { releaseScripts = resolve; });
  try {
    const page = await context.newPage();
    const cspErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && /Content Security Policy|Content-Security-Policy/i.test(msg.text())) cspErrors.push(msg.text());
    });
    await page.route("**/js/**", async (route) => { await deferred; await route.continue(); });
    await page.goto(`${origin}/`, { waitUntil: "commit" });
    // The DOM parser can finish while deferred modules are held. This proves
    // the inline first-paint script worked, rather than its later JS owners.
    await page.locator("#overlay").waitFor({ state: "attached" });
    const beforeModules = await page.evaluate(() => ({
      attrs: { ...document.documentElement.dataset },
      density: document.body.dataset.density,
      shape: document.body.dataset.shape,
      uiLoaded: typeof UiLayers !== "undefined",
    }));
    expect(beforeModules.uiLoaded).toBe(false);
    expect(beforeModules.attrs).toMatchObject({ motion: "reduce", titleIntro: "off", menuWash: "off", titleArt: "off", homeScene: "static", pauseLayout: "compact" });
    expect(beforeModules.density).toBe("normal");
    expect(beforeModules.shape).toBe("wide");
    releaseScripts();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForFunction(() => typeof window.__apex?.info === "function",
      undefined, { timeout: 45_000, polling: 100 });
    await page.locator("#mb-settings").click();
    await expect(page.locator("#pmsettings")).toBeVisible();
    expect(await overlayText(page)).toBeNull();
    expect(cspErrors).toEqual([]);
  } finally {
    releaseScripts();
    await context.close();
  }
});

test.describe("Boot guard — a module that failed to load", () => {
  test("a ONE-OFF 404 is repaired: one reload, then the game boots", async ({ page }) => {
    const navs = trackNavs(page);
    let served404 = 0;
    await page.route(MODULE, (route) => {
      if (served404 === 0) { served404++; return route.fulfill({ status: 404, body: "x" }); }
      return route.continue();
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // `const SeasonCal = …` is a LEXICAL global, so it is NOT a window property —
    // testing window.SeasonCal reads undefined even on a healthy load. Same realm
    // trap as tests/unit/season-cal.test.mjs.
    await page.waitForFunction(() => typeof SeasonCal !== "undefined",
      undefined, { timeout: 45_000, polling: 100 });

    expect(served404, "the module 404'd exactly once").toBe(1);
    expect(navs.n, "repaired with a single reload, not a storm").toBe(2);
    expect(await overlayText(page), "a repaired boot shows the player nothing").toBeNull();
  });

  test("a PERMANENT 404 names the file instead of looping", async ({ page }) => {
    const navs = trackNavs(page);
    await page.route(MODULE, (route) => route.fulfill({ status: 404, body: "x" }));
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // Keep the text the poll matched: a second read could land mid-navigation
    // (overlayText -> null) and fail toContain on a healthy page.
    let text = null;
    await expect
      .poll(async () => (text = await overlayText(page)), { timeout: 45_000 })
      .toContain("Module failed to load");

    // The CAUSE, not the symptom. Downstream ReferenceErrors fire in a cascade
    // and each would overwrite the overlay; the root-cause message is pinned so
    // the player is told which file never arrived rather than which global was
    // missing because of it.
    expect(text).toContain("season-cal.js");
    expect(text, "the pinned cause outranks the ReferenceError it causes")
      .not.toContain("is not defined");
    expect(navs.n, "exactly one repair attempt — never a reload loop").toBe(2);
  });
});
