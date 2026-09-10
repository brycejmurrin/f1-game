// Lighting A/B invariants — the fast, always-on companion to the offline
// variant harness (tools/lighting/ab-lighting.mjs). Two layers:
//
// 1. CATALOG INTEGRITY: every knob in tools/lighting/ab-lighting.mjs must match its
//    source file EXACTLY ONCE. Retuning or renaming a lighting constant
//    without updating the catalog fails here, immediately — so the A/B
//    harness can never silently rot.
//
// 2. LIVE A/B: the invariants the engine can flip at runtime without a
//    variant server — weather live-apply (regression for the bug where
//    weather() changed nothing but wetness), glowing fog, the night light
//    budget, the PCSS rig, and the TOD exposure table.
import { test, expect } from "@playwright/test";
import { pageScreenshot } from "../helpers/soft-capture.js";
// BUDGETS, FROM A MEASUREMENT. Every wait below was under the worst case this
// class of box actually posts: measured idle (loadavg 0.00, three cold boots,
// scratch/perf/boot-budget.mjs) the page needs up to 24.6 s to publish __apex
// and 16.9 s to build a track, and this file was asking for 15 s and 25 s. See
// the BOOT_MS note in tests/helpers/fixtures.js — these are the same numbers.
import { BOOT_MS, TRACK_MS } from "../helpers/fixtures.js";
import { readFileSync } from "node:fs";
import { KNOBS, FREEZE_FLICKER, FREEZE_FLICKER_FILE } from "../../tools/lighting/ab-lighting.mjs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// JOINED, NOT CONCATENATED. dc06779 stripped ROOT's trailing slash (a real fix
// for a Windows path bug elsewhere), but every consumer here appends a
// RELATIVE path — "js/lighting/lighting.js" — so `ROOT + k.file` became
// `/home/user/f1-gamejs/game/lighting.js` and this guard died with ENOENT on
// the deploy branch. path.join is correct whichever way ROOT is normalised
// next, which string concatenation never was.
const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");
const at = (rel) => join(ROOT, rel);

// Solo on an idle box the heaviest test here takes 179.8 s — over the 120 s
// default before any contention. Measured, not guessed.
// ONE per-test budget for this file. Three tests carried their own
// test.setTimeout(180_000), which OVERRIDES a describe-level number — so the
// smaller one silently won and "night fog GLOWS" failed at 232.2 s inside the
// group while passing solo at 179.8 s. Measured: 179.8 s solo on an idle box,
// and these captures cost up to 150 s each under contention.
test.describe.configure({ timeout: 420_000 });

// `headless: true` for a test that reads lightState()/lightTune() and never
// a pixel: __apex.headless(true) skips render() (js/game.js), and rendering
// was the whole cost on the Linux Smoke runner of a gfx dispatch — the fog
// floor test below spent 726 s drawing Vegas-night frames nobody sampled and
// died on its budget twice over (runs 3495/3497, shard 4). applyRaceSettings
// writes frame.exposure/sunColor with or without a render; frame.lights is
// built on the render path, so the lamp-budget test keeps rendering.
async function boot(page, track, tod, wx, frac, { headless = false } = {}) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  if (headless) await page.evaluate(() => window.__apex.headless(true));
  await page.evaluate((t) => window.__apex.race(t), track);
  await page.waitForFunction(() => window.__apex.info && window.__apex.info().track != null, null, { polling: 100, timeout: TRACK_MS });
  if (tod) await page.evaluate((t) => window.__apex.setTimeOfDay(t), tod);
  if (wx) await page.evaluate((w) => window.__apex.weather(w), wx);
  if (frac != null) {
    await page.evaluate((f) => window.__apex.park(f), frac);
    await page.waitForTimeout(2200);
    await page.evaluate((f) => window.__apex.eyeAt(f, 0.2, 1.35), frac);
    await page.waitForTimeout(1100);
  }
}

// Mean luminance of a fractional region of the game canvas, decoded in-page.
// PAGE screenshot, not locator("canvas#game").screenshot(): the element variant
// adds a stability wait that never settles when a heavy scene saturates the
// main thread (software-GL runners render Singapore-night at <1 FPS, so the
// compositor is starved and the capture times the whole test out). The canvas
// fills the viewport, so the page capture is the same image — callers hide the
// HUD first so DOM overlays can't pollute the sampled region.
async function regionMean(page, fx, fy, fw, fh) {
  // 60_000 -> 150_000: the comment above already says a software-GL runner
  // renders these scenes at under 1 FPS, and the capture waits on a frame. It
  // timed out at 60 s inside the group ("night fog GLOWS", 144.9 s) while
  // PASSING solo at 179.8 s — the budget, not the renderer.
  const buf = await pageScreenshot(page, { type: "jpeg", quality: 70, timeout: 150_000, softTimeout: 60_000 });
  return page.evaluate(async ({ b64, fx, fy, fw, fh }) => {
    const img = new Image(); img.src = "data:image/jpeg;base64," + b64; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const cx = c.getContext("2d"); cx.drawImage(img, 0, 0);
    const d = cx.getImageData(Math.round(img.width * fx), Math.round(img.height * fy),
      Math.round(img.width * fw), Math.round(img.height * fh)).data;
    let s = 0; for (let i = 0; i < d.length; i += 4) s += (d[i] + d[i + 1] + d[i + 2]) / 3;
    return s / (d.length / 4);
  }, { b64: buf.toString("base64"), fx, fy, fw, fh });
}

test("A/B knob catalog matches the source exactly (1 hit per knob)", () => {
  const srcCache = {};
  const problems = [];
  for (const k of KNOBS) {
    const src = srcCache[k.file] || (srcCache[k.file] = readFileSync(at(k.file), "utf8"));
    const n = src.split(k.find).length - 1;
    if (n !== 1) problems.push(`${k.id}: "${k.find.slice(0, 60)}..." found ${n}x in ${k.file}`);
    if (k.find === k.b) problems.push(`${k.id}: A and B are identical`);
  }
  // The flicker-freeze patch is applied with a silent .includes() guard in the
  // variant server — a stale string just stops freezing (noisy night A/Bs)
  // without any error, so it must be pinned here like the knobs.
  // Read the file the harness actually patches, not a hardcoded one: the flicker
  // moved to js/lighting/lighting.js with the LightTune extraction, and pinning
  // js/game.js here meant this guard reported the failure it could not fix.
  const ff = srcCache[FREEZE_FLICKER_FILE] || readFileSync(at(FREEZE_FLICKER_FILE), "utf8");
  const nFF = ff.split(FREEZE_FLICKER[0]).length - 1;
  if (nFF !== 1) problems.push(`FREEZE_FLICKER: "${FREEZE_FLICKER[0].slice(0, 60)}..." found ${nFF}x in ${FREEZE_FLICKER_FILE}`);
  expect(problems, problems.join("\n")).toEqual([]);
});

test("weather() applies lighting live (fog mutes sun + lifts exposure)", async ({ page }) => {
  await boot(page, "monza", "day", "dry", undefined, { headless: true });
  const before = await page.evaluate(() => window.__apex.lightState());
  await page.evaluate(() => window.__apex.weather("fog"));
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => window.__apex.lightState());
  // Regression: weather() used to change nothing but the wetness ramp.
  expect(Math.max(...after.sunColor)).toBeLessThan(Math.max(...before.sunColor) * 0.8);
  expect(after.exposure).toBeGreaterThanOrEqual(1.08);
});

test("night fog GLOWS around lamps (the lamp-fog knobs add luminance to one fogged frame)", async ({ page }) => {
  // WHAT THIS MEASURES, AND WHAT IT USED TO. The lamp-fog glow is the lit
  // shader's `lampFogC` term (js/render/glx/shaders/glsl-lit.js, gated on
  // uLampFog > 0 = LT.lampFogBase / lampFogHaze via frame.lampFog in
  // js/game.js). It lives on SURFACES; the sky shader has no lamp-fog term at
  // all. The previous version of this test sampled the dark SKY band and
  // asserted foggy > dry * 1.1 — which held only while the night-fog exposure
  // floor was the daytime 1.08, and went red on 2026-09-08 when that floor was
  // cut to 0.95 ("night must stay night", the sibling test below). It was
  // measuring exposure and cloud cover, and the +10 % bar it failed on Metal
  // (run 3469, 3477: dry 80 -> foggy 72.6, tier 0 both) and on this container
  // (65.4 -> 60.1) was the same −9 % on both. So: ONE fogged night frame, the
  // glow knobs A/B'd on it, everything else pinned — the clock (cloud drift),
  // the governor's tier and physics; regionMean's pageScreenshot waits for a
  // present newer than the knob write, so each capture is of the knob state
  // it follows. Passes here on SwiftShader (2026-09-10).
  await page.setViewportSize({ width: 640, height: 360 });
  await boot(page, "singapore", "night", "fog", 0.35);
  await page.evaluate(() => {
    window.__apex.hud(false);
    window.__apex.govHold(true);
    window.__apex.renderClock(100, true);
    window.__apex.freeze(true);
  });
  const base = await page.evaluate(() => window.__apex.lightTune());
  expect(base.lampFogBase, "the glow knob ships ON").toBeGreaterThan(0);
  const knobs = (on) => page.evaluate(({ on, b }) => window.__apex.lightTune(on
    ? { lampFogBase: b.lampFogBase, lampFogHaze: b.lampFogHaze }
    : { lampFogBase: 0, lampFogHaze: 0 }), { on, b: base });
  // The mid band: distant facades and the fog wall, where the fog factor —
  // and so the glow's share of the pixel — is largest. Alternated OFF/ON/OFF/ON
  // so a drift that survived the pins above would move both pairs the same way
  // instead of masquerading as the knob.
  const band = [0.0, 0.20, 1.0, 0.30];
  await knobs(false); const off1 = await regionMean(page, ...band);
  await knobs(true);  const on1  = await regionMean(page, ...band);
  await knobs(false); const off2 = await regionMean(page, ...band);
  await knobs(true);  const on2  = await regionMean(page, ...band);
  const tier = await page.evaluate(() => window.__apex.govHold().tier);
  const diag = JSON.stringify({ off1, on1, off2, on2, tier, knobs: { base: base.lampFogBase, haze: base.lampFogHaze }, gov: await page.evaluate(() => window.__apex.renderScale()) });
  // The glow must ADD luminance, both times. A 3 % floor on a band whose mean
  // sits around 70/255 is ~2 grey levels — real, and well under the knob's
  // effect where it renders at all; a scene where the knob does nothing
  // visible is the defect this test exists to catch.
  test.info().attach("fog-glow-ab", { body: diag, contentType: "application/json" });   // the margin, on a pass too
  expect(on1, diag).toBeGreaterThan(off1 * 1.03);
  expect(on2, diag).toBeGreaterThan(off2 * 1.03);
});

test("night light budget: lamps on at night, off by day, exposure per table", async ({ page }) => {
  await boot(page, "qatar", "night", "dry", 0.4);
  // frame.lights is written by the RENDER pass, and setTimeOfDay's rebuild can
  // outlast boot's fixed sleeps on a loaded software-GL runner — wait on the
  // actual state (same pattern as the day-flip below) instead of racing the
  // first post-rebuild frame. A genuine lights-out regression still fails here,
  // as the timeout.
  await page.waitForFunction(() => window.__apex.lightState().numLights > 0, null, { polling: 100, timeout: 60000 });
  const night = await page.evaluate(() => window.__apex.lightState());
  expect(night.numLights).toBeGreaterThan(0);
  expect(night.numLights).toBeLessThanOrEqual(48);
  expect(night.exposure).toBeCloseTo(0.90, 1);   // desert night
  // THE 0.78 IS THE RAMP, NOT THE VALUE. js/game.js computes
  // `min(1, LT.floodEmitMul * 0.78)` for a full night session, so the palette's
  // own multiplier scales it per circuit — and this line asserted the bare ramp,
  // which has therefore been red on every runner since qatar|night|dry was
  // tuned to 0.11 (0.11 * 0.78 = 0.0858, the byte-exact value run 3464
  // reported on Metal). Assert the CONTRACT instead: the night session takes
  // the full ramp, scaled by whatever the palette says. A literal goes stale
  // the moment a palette moves, which is the same trap this file's own
  // knob-catalog test exists to catch.
  const floodMul = await page.evaluate(() => LightTune.LT.floodEmitMul);
  expect(floodMul, "the palette has no flood multiplier — this assertion would be vacuous").toBeGreaterThan(0);
  expect(night.floodEmit).toBeCloseTo(Math.min(1, floodMul * 0.78), 4);
  await page.evaluate(() => window.__apex.setTimeOfDay("day"));
  // The night->day flip rebuilds track props; wait on the actual state instead
  // of a fixed sleep (the rebuild time varies under test-worker contention).
  await page.waitForFunction(() => window.__apex.lightState().numLights === 0, null, { polling: 100, timeout: 30000 });
  const day = await page.evaluate(() => window.__apex.lightState());
  expect(day.numLights).toBe(0);
});

test("PCSS contact-hardening rig is alive", async ({ page }) => {
  await boot(page, "monza", "day", "dry");
  const pcss = await page.evaluate(() => (typeof GLX !== "undefined" && GLX.pcss) ? GLX.pcss() : null);
  expect(pcss).toBe(true);
});

test("dark sessions keep their exposure floors in fog (night must stay night)", async ({ page }) => {
  await boot(page, "vegas", "night", "fog", undefined, { headless: true });
  const ls = await page.evaluate(() => window.__apex.lightState());
  // Night fog floor is 0.95 — NOT the daytime 1.08 (that grey-washed the dark).
  expect(ls.exposure).toBeGreaterThanOrEqual(0.94);
  expect(ls.exposure).toBeLessThan(1.05);
});
