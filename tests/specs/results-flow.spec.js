// @ts-check
// results-flow: post-flag path after classification — today's instant `#results`
// sheet, and (once #1584 slices 1–4 land) the ceremony chain cooldown →
// parc fermé → podium → results. Phone landscape 844×390, touch first.
// Plan: docs/plans/2026-10-27-cooldown-podium.md · issue #4071 (slice 5).
// Ceremony cases call test.skip until `typeof __apex.ceremony === "function"`.
import { test, expect } from "@playwright/test";
import { BOOT_MS } from "../helpers/fixtures.js";
import { uiTestOptions } from "../../tools/lib/ui-device-profile.mjs";

const LANDSCAPE = { width: 844, height: 390 };
const WAIT = { polling: 100, timeout: BOOT_MS };

/** CSS px floor for a primary touch target (`--tap` is ≥44; touch media uses 52). */
const TAP_FLOOR = 44;

async function boot(page) {
  await page.goto("/?inspector=0");
  await page.waitForFunction(() => !!window.__apex?.race, null, WAIT);
  await page.evaluate(() => window.__apex.headless(true));
}

async function startGp(page) {
  await boot(page);
  await page.evaluate(() => window.__apex.race("bahrain", "day", "dry"));
  await page.waitForFunction(
    () => window.__apex && window.__apex.info().state === "race" && window.__apex.info().track != null,
    null, WAIT
  );
  await page.evaluate(() => {
    window.__apex.go();
    window.__apex.park(0);
  });
}

async function startTt(page) {
  await boot(page);
  await page.evaluate(() => window.__apex.tt("bahrain", "day"));
  await page.waitForFunction(
    () => window.__apex && window.__apex.info().state === "race" && window.__apex.info().timeTrial === true,
    null, WAIT
  );
  await page.evaluate(() => {
    window.__apex.go();
    window.__apex.park(0);
  });
}

/** True once slice-1 `__apex.ceremony` exists on the page. */
async function ceremonyReady(page) {
  return page.evaluate(() => typeof window.__apex?.ceremony === "function");
}

async function footTapBoxes(page) {
  return page.evaluate(() => {
    const foot = document.querySelector("#results .sheet-foot") || document.getElementById("results");
    if (!foot) return [];
    return [...foot.querySelectorAll("button")]
      .filter((b) => b.checkVisibility())
      .map((b) => {
        const r = b.getBoundingClientRect();
        return { id: b.id, w: r.width, h: r.height, bottom: r.bottom, top: r.top };
      });
  });
}

test.describe("results-flow — phone landscape", () => {
  test.use(uiTestOptions({ touch: true, viewport: LANDSCAPE }));

  test.afterEach(async ({ pageErrors, consoleLines }) => {
    expect(pageErrors).toEqual([]);
    expect(consoleLines.filter((line) => line.startsWith("error:"))).toEqual([]);
  });

  // ── Always-on: default finishRace keeps today's instant results ──────────

  test("default finishRace opens #results with #res-next enabled (GP)", async ({ page }) => {
    await startGp(page);
    const out = await page.evaluate(() => window.__apex.finishRace());
    expect(out).toEqual({ state: "results" });
    await expect(page.locator("#results")).toBeVisible({ timeout: 5000 });
    const next = page.locator("#res-next");
    await expect(next).toBeVisible();
    await expect(next).toBeEnabled();
  });

  test("TT finishRace opens TIME TRIAL results; ceremony ineligible when present", async ({ page }) => {
    await startTt(page);
    const out = await page.evaluate(() => window.__apex.finishRace());
    expect(out).toEqual({ state: "results" });
    await expect(page.locator("#results")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("#results-title")).toContainText("TIME TRIAL");
    if (await ceremonyReady(page)) {
      const st = await page.evaluate(() => window.__apex.ceremony());
      expect(st && st.eligible).toBe(false);
    }
  });

  test("phone 844×390: results foot buttons meet --tap and stay in the viewport", async ({ page }) => {
    await startGp(page);
    await page.evaluate(() => window.__apex.finishRace());
    await expect(page.locator("#results")).toBeVisible({ timeout: 5000 });
    const boxes = await footTapBoxes(page);
    expect(boxes.length).toBeGreaterThan(0);
    for (const b of boxes) {
      expect(b.h, `${b.id} height`).toBeGreaterThanOrEqual(TAP_FLOOR);
      expect(b.bottom, `${b.id} clipped below`).toBeLessThanOrEqual(LANDSCAPE.height + 0.5);
      expect(b.top, `${b.id} clipped above`).toBeGreaterThanOrEqual(-0.5);
    }
  });

  // ── Ceremony (skip until slices 1–4 wire __apex.ceremony) ────────────────

  test("eligible GP: finishRace({ceremony:true}) walks cooldown→parcFerme→podium→results", async ({ page }) => {
    await startGp(page);
    test.skip(!(await ceremonyReady(page)), "ceremony hooks land in #1584 slices 1–4");
    const started = await page.evaluate(() => window.__apex.finishRace({ ceremony: true }));
    expect(started && started.state).toBeTruthy();
    await page.waitForFunction(
      () => window.__apex.ceremony()?.phase === "cooldown",
      null, { polling: 50, timeout: 5000 }
    );
    expect(await page.evaluate(() => window.__apex.ceremony()?.phase)).toBe("cooldown");
    await page.evaluate(() => window.__apex.ceremony("parcFerme"));
    expect(await page.evaluate(() => window.__apex.ceremony()?.phase)).toBe("parcFerme");
    await page.evaluate(() => window.__apex.ceremony("podium"));
    const afterPodium = await page.evaluate(() => window.__apex.ceremony());
    // Fewer than three classified finishers may skip podium → results.
    expect(["podium", "results"]).toContain(afterPodium.phase);
    if (afterPodium.phase === "podium") {
      await page.evaluate(() => window.__apex.ceremony("results"));
    }
    expect(await page.evaluate(() => window.__apex.ceremony()?.phase)).toBe("results");
    await expect(page.locator("#results")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("#res-next")).toBeEnabled();
  });

  test("SKIP from cooldown reaches results without soft-lock", async ({ page }) => {
    await startGp(page);
    test.skip(!(await ceremonyReady(page)), "ceremony hooks land in #1584 slices 1–4");
    await page.evaluate(() => window.__apex.finishRace({ ceremony: true }));
    await page.waitForFunction(
      () => window.__apex.ceremony()?.phase === "cooldown",
      null, { polling: 50, timeout: 5000 }
    );
    // Prefer the ceremony SKIP control; fall back to seeking results.
    const skipped = await page.evaluate(() => {
      const host = document.querySelector("[data-ceremony-phase]") || document.getElementById("ceremony");
      const btn = host && [...host.querySelectorAll("button")].find((b) =>
        /skip/i.test(b.textContent || "") || /skip/i.test(b.id || ""));
      if (btn) { btn.click(); return "click"; }
      window.__apex.ceremony("results");
      return "seek";
    });
    expect(["click", "seek"]).toContain(skipped);
    await page.waitForFunction(
      () => window.__apex.ceremony()?.phase === "results" || window.__apex.info().state === "results",
      null, { polling: 50, timeout: 5000 }
    );
    await expect(page.locator("#results")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("#res-next")).toBeEnabled();
  });

  test("ceremony() phase string matches host data-ceremony-phase", async ({ page }) => {
    await startGp(page);
    test.skip(!(await ceremonyReady(page)), "ceremony hooks land in #1584 slices 1–4");
    await page.evaluate(() => window.__apex.finishRace({ ceremony: true }));
    await page.waitForFunction(
      () => !!window.__apex.ceremony()?.phase,
      null, { polling: 50, timeout: 5000 }
    );
    for (const phase of ["cooldown", "parcFerme", "results"]) {
      await page.evaluate((p) => window.__apex.ceremony(p), phase);
      const pair = await page.evaluate(() => {
        const st = window.__apex.ceremony();
        const host = document.querySelector("[data-ceremony-phase]");
        return { phase: st && st.phase, attr: host && host.getAttribute("data-ceremony-phase") };
      });
      expect(pair.attr, `data-ceremony-phase for ${phase}`).toBe(pair.phase);
    }
  });

  test("phone 844×390: ceremony SKIP meets --tap and does not clip the foot", async ({ page }) => {
    await startGp(page);
    test.skip(!(await ceremonyReady(page)), "ceremony hooks land in #1584 slices 1–4");
    await page.evaluate(() => window.__apex.finishRace({ ceremony: true }));
    await page.waitForFunction(
      () => window.__apex.ceremony()?.phase === "cooldown",
      null, { polling: 50, timeout: 5000 }
    );
    const skipBox = await page.evaluate(() => {
      const host = document.querySelector("[data-ceremony-phase]") || document.getElementById("ceremony");
      const btn = host && [...host.querySelectorAll("button")].find((b) =>
        /skip/i.test(b.textContent || "") || /skip/i.test(b.id || ""));
      if (!btn || !btn.checkVisibility()) return null;
      const r = btn.getBoundingClientRect();
      return { w: r.width, h: r.height, bottom: r.bottom, top: r.top, right: r.right, left: r.left };
    });
    expect(skipBox, "visible SKIP control").toBeTruthy();
    expect(skipBox.h).toBeGreaterThanOrEqual(TAP_FLOOR);
    expect(skipBox.bottom).toBeLessThanOrEqual(LANDSCAPE.height + 0.5);
    expect(skipBox.top).toBeGreaterThanOrEqual(-0.5);
    expect(skipBox.right).toBeLessThanOrEqual(LANDSCAPE.width + 0.5);
    expect(skipBox.left).toBeGreaterThanOrEqual(-0.5);
  });
});
