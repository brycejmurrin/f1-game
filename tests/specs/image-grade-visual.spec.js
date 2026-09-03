// @ts-check
import { test, expect } from "@playwright/test";
import { BOOT_MS, TRACK_MS } from "../helpers/fixtures.js";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const CAPTURE_DIR = process.env.IMAGE_GRADE_CAPTURE_DIR;
if (CAPTURE_DIR) mkdirSync(CAPTURE_DIR, { recursive: true });

// A capture of the heaviest night scene can legitimately take ~150 s here (see
// the note on page.screenshot below), and these tests take two of them plus a
// boot. The 120 s default cannot hold that; the job's timeout-minutes is the
// real backstop.
test.describe.configure({ timeout: 480_000 });

const GRADE_NEUTRAL = {
  blacks: 0, shadows: 0, midtones: 0, highlights: 0, whites: 0,
  toe: 0, shoulder: 0,
  liftR: 0, liftG: 0, liftB: 0,
  gammaR: 1, gammaG: 1, gammaB: 1,
  gainR: 1, gainG: 1, gainB: 1,
};

const GRADE_MIN = {
  blacks: -1, shadows: -1, midtones: -1, highlights: -1, whites: -1,
  toe: -1, shoulder: -1,
  liftR: -0.15, liftG: -0.15, liftB: -0.15,
  gammaR: 0.5, gammaG: 0.5, gammaB: 0.5,
  gainR: 0.5, gainG: 0.5, gainB: 0.5,
};

const GRADE_MAX = {
  blacks: 1, shadows: 1, midtones: 1, highlights: 1, whites: 1,
  toe: 1, shoulder: 1,
  liftR: 0.15, liftG: 0.15, liftB: 0.15,
  gammaR: 2, gammaG: 2, gammaB: 2,
  gainR: 1.5, gainG: 1.5, gainB: 1.5,
};

async function waitForTune(page, values) {
  await page.waitForFunction((expected) => {
    const tune = window.__apex?.lightTune?.();
    if (!tune) return false;
    // Wait for what the STORE will actually resolve to, not the raw ask.
    // js/lighting/profiles.js clamps every write to the knob's declared
    // [min, max], so a test driving past a bound waits forever on a value that
    // can never appear — the helper just sits here for the whole 15 s and the
    // rest of the serial block skips. That is exactly what happened when BLACKS
    // was re-cut from ±1.5 to ±0.6 (it goes non-monotonic above +0.635) while
    // this file still asked for ±1. Clamping the expectation the same way the
    // store does keeps a test aimed at "the extreme" whatever the registry says
    // that is today, instead of at a number somebody typed once.
    // BARE `LightTune`: lighting.js declares it as a top-level `const` in a
    // CLASSIC script, which is script-scoped and NOT a property of window.
    const defs = (typeof LightTune !== "undefined" && LightTune.TUNE_DEFS) || [];
    return Object.entries(expected).every(([id, value]) => {
      const d = defs.find((x) => x.id === id);
      const want = d ? Math.min(d.max, Math.max(d.min, value)) : value;
      return Math.abs(tune[id] - want) < 0.0001;
    });
  }, values, { timeout: 15_000, polling: 100 });
  await page.waitForTimeout(250);
}

async function setTune(page, values) {
  await page.evaluate((next) => window.__apex.lightTune(next), values);
  await waitForTune(page, values);
}

async function boot(page, {
  track = "bahrain", tod = "day", weather = "dry", frac = 0.1,
  neutralGrade = true,
} = {}) {
  await page.setViewportSize({ width: 640, height: 360 });
  await page.goto("/");
  // 15_000 was below the measured worst boot on this class of box (24.6 s idle,
  // scratch/perf/boot-budget.mjs) — see the BOOT_MS note in tests/helpers/fixtures.js.
  await page.waitForFunction(() => window.__apex?.race, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(({ track, tod, weather }) =>
    window.__apex.race(track, tod, weather), { track, tod, weather });
  await page.waitForFunction((id) => {
    const info = window.__apex.info();
    return info.track === id;
  }, track, { polling: 100, timeout: Math.max(30_000, TRACK_MS) });
  await page.evaluate(({ frac }) => {
    window.__apex.park(frac);
    window.__apex.hud(false);
    window.__apex.eyeAt(frac, 0.2, 1.35);
    document.body.classList.add("hud-hidden");
    document.getElementById("hud-restore")?.style.setProperty("display", "none", "important");
  }, { frac });
  await page.waitForFunction(({ tod, weather }) => {
    const info = window.__apex.info();
    return info.state === "race" &&
      window.__apex.weather() === weather &&
      window.__apex.setTimeOfDay() === tod &&
      window.__apex.camState().debug === true;
  }, { tod, weather }, { polling: 100, timeout: 45_000 });
  if (neutralGrade) await setTune(page, GRADE_NEUTRAL);
}

async function pixels(page) {
  // 60_000 -> 150_000. The capture waits on a frame, and a software-GL runner
  // renders singapore-night at under 1 FPS — that test timed out here at
  // 144.5 s with a perfectly healthy page behind it (the attached apex-state
  // shows the car parked on track). Same budget as lighting-ab's capture, for
  // the same reason.
  const buf = await page.screenshot({ type: "jpeg", quality: 90, timeout: 150_000 });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = "data:image/jpeg;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const cx = c.getContext("2d");
    cx.drawImage(img, 0, 0);
    return Array.from(cx.getImageData(0, 0, c.width, c.height).data);
  }, buf.toString("base64"));
}

function luminance(data, i) {
  return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
}

function tonalChanges(before, after) {
  let darkDelta = 0, darkCount = 0, brightDelta = 0, brightCount = 0;
  let darkSigned = 0, brightSigned = 0;
  for (let i = 0; i < before.length; i += 4) {
    const y = luminance(before, i);
    const signed = luminance(after, i) - y;
    const delta = Math.abs(signed);
    if (y >= 8 && y <= 55) {
      darkDelta += delta;
      darkSigned += signed;
      darkCount++;
    } else if (y >= 160 && y <= 247) {
      brightDelta += delta;
      brightSigned += signed;
      brightCount++;
    }
  }
  return {
    dark: darkDelta / darkCount,
    bright: brightDelta / brightCount,
    darkSigned: darkSigned / darkCount,
    brightSigned: brightSigned / brightCount,
    darkCount,
    brightCount,
  };
}

function rangeChanges(before, after, low, high) {
  let absolute = 0, signed = 0, count = 0;
  for (let i = 0; i < before.length; i += 4) {
    const y = luminance(before, i);
    if (y < low || y > high) continue;
    const change = luminance(after, i) - y;
    absolute += Math.abs(change);
    signed += change;
    count++;
  }
  return { absolute: absolute / count, signed: signed / count, count };
}

function channelChanges(before, after) {
  const sums = [0, 0, 0];
  let count = 0;
  for (let i = 0; i < before.length; i += 4) {
    const y = luminance(before, i);
    if (y < 8 || y > 247) continue;
    sums[0] += Math.abs(after[i] - before[i]);
    sums[1] += Math.abs(after[i + 1] - before[i + 1]);
    sums[2] += Math.abs(after[i + 2] - before[i + 2]);
    count++;
  }
  return sums.map((sum) => sum / count);
}

function histogramStats(data) {
  const values = [];
  let black = 0, white = 0;
  for (let i = 0; i < data.length; i += 4) {
    values.push(luminance(data, i));
    if (data[i] <= 1 && data[i + 1] <= 1 && data[i + 2] <= 1) black++;
    if (data[i] >= 254 && data[i + 1] >= 254 && data[i + 2] >= 254) white++;
  }
  values.sort((a, b) => a - b);
  const percentile = (p) => values[Math.floor((values.length - 1) * p)];
  return {
    p05: percentile(0.05),
    p95: percentile(0.95),
    blackClipFraction: black / values.length,
    whiteClipFraction: white / values.length,
  };
}

test.describe("rendered image grade", () => {
  test.describe.configure({ mode: "serial" });
  // NO test.setTimeout HERE. It used to say 180_000, and a per-test setTimeout
  // OVERRIDES the file's describe.configure cap rather than being bounded by it
  // — so this block was capped at 180 s while the file declared 480 s, and the
  // first test timed out at exactly 180.0 s having needed 198.9 s. Because the
  // block is `serial`, that one timeout SKIPPED the four tests after it, which
  // is how a budget miss reads as five lost tests. MEASURED in that run: boot
  // alone reached 51165 ms under two-worker contention (`pack loaded
  // layers=14`), before a single pixel was read. Same defect and same cure as
  // the three overrides removed from lighting-ab.spec.js.

  test("blacks visibly change the deepest image detail", async ({ page }) => {
    await boot(page);
    await pixels(page);
    const baseline = await pixels(page);
    // Drive to the REGISTRY's own extremes rather than a literal ±1. What this
    // test cares about is that the knob's ENDS move the deepest detail, not that
    // any particular number does — and a literal goes stale the moment the bound
    // is retuned, which is the trap tests/specs/lighting-tuner-grade.spec.js
    // already documents from the widening direction.
    const b = await page.evaluate(() => {
      const d = LightTune.TUNE_DEFS.find((x) => x.id === "blacks");
      return { min: d.min, max: d.max };
    });
    expect(b.max, "BLACKS has no positive travel — this test would be vacuous").toBeGreaterThan(0);
    expect(b.min, "BLACKS has no negative travel — this test would be vacuous").toBeLessThan(0);
    await setTune(page, { blacks: b.max });
    const raised = rangeChanges(baseline, await pixels(page), 2, 30);
    await setTune(page, { blacks: b.min });
    const crushed = rangeChanges(baseline, await pixels(page), 2, 30);
    expect(raised.count).toBeGreaterThan(1000);
    expect(raised.signed).toBeGreaterThan(1);
    expect(crushed.signed).toBeLessThan(-1);
  });

  test("shadows predominantly change dark pixels", async ({ page }) => {
    await boot(page);
    await pixels(page); // discard first composited frame while render caches settle
    const baseline = await pixels(page);
    await setTune(page, { shadows: 0.5 });
    const changed = await pixels(page);
    const delta = tonalChanges(baseline, changed);
    expect(delta.darkCount).toBeGreaterThan(1000);
    expect(delta.brightCount).toBeGreaterThan(1000);
    expect(delta.darkSigned).toBeGreaterThan(0.5);
    expect(delta.dark).toBeGreaterThanOrEqual(delta.bright * 2);
  });

  test("highlights predominantly change bright pixels", async ({ page }) => {
    await boot(page);
    await pixels(page);
    const baseline = await pixels(page);
    await setTune(page, { highlights: 0.5 });
    const changed = await pixels(page);
    const delta = tonalChanges(baseline, changed);
    expect(delta.bright).toBeGreaterThanOrEqual(delta.dark * 2);
  });

  test("red gain predominantly changes the red channel", async ({ page }) => {
    await boot(page);
    await pixels(page);
    const baseline = await pixels(page);
    await setTune(page, { gainR: 1.2 });
    const changed = await pixels(page);
    const [red, green, blue] = channelChanges(baseline, changed);
    expect(red).toBeGreaterThan(green * 1.5);
    expect(red).toBeGreaterThan(blue * 1.5);
  });

  test("grade extremes keep the race canvas renderable", async ({ page }) => {
    await boot(page);
    for (const values of [GRADE_MIN, GRADE_MAX]) {
      await setTune(page, values);
      const image = await pixels(page);
      const state = await page.evaluate(() => window.__apex.info().state);
      expect(state).toBe("race");
      expect(image.length).toBe(640 * 360 * 4);
      expect(new Set(image).size).toBeGreaterThan(16);
    }
  });
});

const REPRESENTATIVE_CONDITIONS = [
  { track: "bahrain", tod: "day", weather: "dry", frac: 0.1 },
  { track: "monaco", tod: "dawn", weather: "dry", frac: 0.1 },
  { track: "silverstone", tod: "day", weather: "overcast", frac: 0.1 },
  { track: "singapore", tod: "night", weather: "dry", frac: 0.35 },
  { track: "spa", tod: "day", weather: "rain", frac: 0.1 },
];

for (const condition of REPRESENTATIVE_CONDITIONS) {
  test(`${condition.track} ${condition.tod} ${condition.weather} retains broad tonal range`, async ({ page }) => {
    // Also no override — see the note on the serial block above. These measured
    // 131.7-164.5 s in the same group run, i.e. inside 180 s only by margin.
    await boot(page, { ...condition, neutralGrade: false });
    if (CAPTURE_DIR) {
      await page.screenshot({
        path: join(CAPTURE_DIR, `${condition.track}-${condition.tod}-${condition.weather}.png`),
        timeout: 60_000,
      });
    }
    const stats = histogramStats(await pixels(page));
    expect(stats.blackClipFraction).toBeLessThan(0.08);
    expect(stats.whiteClipFraction).toBeLessThan(0.03);
    expect(stats.p95 - stats.p05).toBeGreaterThan(45);
  });
}
