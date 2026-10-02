/* AiBand unit tests — pure pace-mode helpers, no browser.
   Run: node --test tests/unit/ai-band.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// `const AiBand` lands in the context's global LEXICAL scope, not on the
// global object — read it back by evaluating its name (same as ai-drive).
function load() {
  const ctx = vm.createContext({ Math, console, Object, Array, Number, isFinite });
  seedLog(ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/physics/ai-band.js"), "utf8"), ctx,
    { filename: "js/physics/ai-band.js" });
  return vm.runInContext("AiBand", ctx);
}

const AiBand = load();

test("normalize keeps known modes and defaults unknowns to scripted", () => {
  assert.equal(AiBand.normalize("scripted"), "scripted");
  assert.equal(AiBand.normalize("catchup"), "catchup");
  assert.equal(AiBand.normalize("rubber"), "scripted");
  assert.equal(AiBand.normalize(null), "scripted");
  assert.equal(AiBand.normalize(""), "scripted");
});

test("scripted mode never bands even when the human is hundreds of metres ahead", () => {
  const f = AiBand.factor({
    mode: "scripted",
    leadProg: 1000,
    carProg: 200,
    trackTotal: 5793,
    raceT: 60,
    launchT0: 0,
    bandAuth: 0.18,
  });
  assert.equal(f, 0);
});

test("catchup bands when the human is ahead inside half a lap", () => {
  const f = AiBand.factor({
    mode: "catchup",
    leadProg: 800,
    carProg: 200,
    trackTotal: 5793,
    raceT: 60,
    launchT0: 0,
    bandAuth: 0.08,
  });
  assert.ok(f > 0, "expected a positive catch-up factor");
  assert.ok(f <= 0.08, "must not exceed DIFF.band");
  assert.ok(Math.abs(f - (600 / 700) * 0.08) < 1e-9);
});

test("catchup stays quiet off the start line", () => {
  assert.equal(AiBand.factor({
    mode: "catchup", raceT: 4, launchT0: 0,
    leadProg: 800, carProg: 200, trackTotal: 5793, bandAuth: 0.08,
  }), 0);
});

test("catchup stays quiet once lapped", () => {
  assert.equal(AiBand.factor({
    mode: "catchup", raceT: 60, launchT0: 0,
    leadProg: 6000, carProg: 100, trackTotal: 5793, bandAuth: 0.08,
  }), 0);
});

test("catchup never slows an AI ahead of the human (forward band is off)", () => {
  assert.equal(AiBand.factor({
    mode: "catchup", raceT: 60, launchT0: 0,
    leadProg: 200, carProg: 800, trackTotal: 5793, bandAuth: 0.08,
  }), 0);
});

test("catchup saturates at bandAuth past GAP_REF_M", () => {
  assert.equal(AiBand.factor({
    mode: "catchup", raceT: 60, launchT0: 0,
    leadProg: 2000, carProg: 200, trackTotal: 5793, bandAuth: 0.18,
  }), 0.18);
});

test("applyVmax is a no-op at factor 0", () => {
  const r = AiBand.applyVmax(72, 0, 0.9, 1);
  assert.equal(r.vmax, 72);
  assert.equal(r.bandNow, 0);
});

test("applyVmax caps a banded easy car at BAND_CEIL", () => {
  const paceScale = 0.851 * 0.97;
  const r = AiBand.applyVmax(70, 0.18, paceScale, 1);
  assert.ok(r.vmax <= 70 * (1 / paceScale) + 1e-9);
  assert.equal(r.bandNow, 0.18);
});

test("AI PACE row is injected — no static shell id in index.html", () => {
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  assert.equal(/id="rs-aipace"/.test(html), false,
    "AI PACE controls are injected — they must not add shellNodes");
  const src = readFileSync(join(ROOT, "js/race/race-settings.js"), "utf8");
  assert.match(src, /ensureAiPaceRow/);
  assert.match(src, /rs-aipace/);
});
