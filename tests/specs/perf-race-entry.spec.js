// @ts-check
// SwiftShader race-entry stage regression — menu START RACE vs START PRACTICE (issue #1881).
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { pinFactorySeat } from "../helpers/factory-seat.js";
import {
  SCENARIO,
  RACE_ENTRY_SOFT_MS,
  STRICT,
  writeArtifact,
  formatStageTable,
  markdownDiffTable,
} from "../helpers/perf-race-entry.mjs";

const ARTIFACT_DIR = "artifacts/perf-race-entry";

async function boot(page) {
  await pinFactorySeat(page);
  await page.addInitScript((preset) => {
    try { localStorage.setItem("apex26.gfxPreset", JSON.stringify(preset)); } catch (_) { /* */ }
  }, SCENARIO.gfxPreset);
  await page.goto("/?fullIntro=1");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
}

async function menuStart(page, mode) {
  if (mode === "practice") {
    await page.locator("#mb-practice").click();
  } else {
    await page.locator("#mb-race").click();
  }
  await page.locator("#sel-go").click();
  const goLabel = mode === "practice" ? "START PRACTICE" : "START RACE";
  await expect(page.locator("#rs-go")).toHaveText(goLabel, { timeout: BOOT_MS });
  const t0 = await page.evaluate(() => performance.now());
  await page.locator("#rs-go").click();
  await page.waitForFunction(
    () => {
      const i = window.__apex && window.__apex.info ? window.__apex.info() : null;
      return i && (i.state === "race" || i.state === "count");
    },
    null,
    { polling: 200, timeout: 540_000 },
  );
  const t1 = await page.evaluate(() => performance.now());
  const snap = await page.evaluate(() => window.__apex.raceEntryProfile());
  const stages = await page.evaluate(() => window.__apex.raceEntryStages());
  return { wallMs: Math.round(t1 - t0), snap, stages };
}

test.describe("perf race-entry — SwiftShader stage table", () => {
  test.use({ viewport: SCENARIO.viewport });

  test("race vs practice menu entry stages (full intro)", async ({ page }) => {
    test.setTimeout(1_200_000);

    await boot(page);

    const race = await menuStart(page, "race");
    await boot(page);
    const practice = await menuStart(page, "practice");
    const diff = await page.evaluate(
      ([a, b]) => window.__apex.raceEntryStageDiff(a, b),
      [race.snap, practice.snap],
    );

    const payload = {
      at: new Date().toISOString(),
      scenario: SCENARIO,
      race,
      practice,
      diff,
      diffMarkdown: markdownDiffTable(diff),
    };
    const artifactFile = writeArtifact(ARTIFACT_DIR, payload);

    await test.info().attach("perf-race-entry.json", {
      path: artifactFile,
      contentType: "application/json",
    });

    test.info().annotations.push({
      type: "perf-race-entry-race",
      description: `wall=${race.wallMs}ms ${formatStageTable(race.stages)}`,
    });
    test.info().annotations.push({
      type: "perf-race-entry-practice",
      description: `wall=${practice.wallMs}ms ${formatStageTable(practice.stages)}`,
    });
    test.info().annotations.push({
      type: "perf-race-entry-diff",
      description: markdownDiffTable(diff),
    });

    expect(race.stages && race.stages.entry).toBeTruthy();
    expect(practice.stages && practice.stages.entry).toBeTruthy();
    expect(race.stages.entry).toBe("race");
    expect(practice.stages.entry).toBe("practice");
    expect(race.snap && race.snap.marks && race.snap.marks.length).toBeGreaterThan(8);
    const markNames = race.snap.marks.map((m) => m.n);
    expect(
      markNames.some((n) => n === "entry:race" || n === "entry:practice"),
    ).toBe(true);
    expect(
      markNames.some((n) => n === "awaitIntroWarm:start" || n === "introBuild:start" || n === "introPrepare:start"),
    ).toBe(true);
    expect(markNames.some((n) => n === "flyby:start" || n === "flyby:end")).toBe(true);

    if (STRICT) {
      expect(race.wallMs, "race menu entry wall time").toBeLessThan(RACE_ENTRY_SOFT_MS);
    } else if (race.wallMs >= RACE_ENTRY_SOFT_MS) {
      test.info().annotations.push({
        type: "perf-race-entry-soft",
        description: `race wall ${race.wallMs}ms >= soft cap ${RACE_ENTRY_SOFT_MS}ms (set APEX_PERF_RACE_ENTRY_STRICT=1 to fail)`,
      });
    }
  });
});
