/* AiBand unit tests — Melder rubber-band pure helpers, no browser.
   Run: node --test tests/unit/ai-band.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function load() {
  const ctx = vm.createContext({ Math, console, Object, Array, Number, isFinite });
  seedLog(ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/core/mat4.js"), "utf8"), ctx, { filename: "js/core/mat4.js" });
  vm.runInContext(readFileSync(join(ROOT, "js/physics/ai-band.js"), "utf8"), ctx,
    { filename: "js/physics/ai-band.js" });
  return vm.runInContext("AiBand", ctx);
}

const B = load();

const base = {
  trackTotal: 5800, raceT: 20, launchT0: 0, band: 0.08,
  tierV: 1, skill: 0.97, aiScale: 0.911, bandCeil: 1.03,
};

test("start guard and lapping kill the band", () => {
  assert.equal(B.apply({ ...base, gap: 200, raceT: 5 }).band, 0);
  assert.equal(B.apply({ ...base, gap: 3000 }).band, 0, "half-lap / lapped");
});

test("dead zone holds near the player", () => {
  const near = B.apply({ ...base, gap: 20 });
  assert.equal(near.band, 0);
  assert.equal(near.skillMul, 1);
  assert.equal(B.deadM(), 40);
});

test("reverse help (AI behind) raises skillMul; vmaxMul stays 1", () => {
  const r = B.apply({ ...base, gap: 200 });
  assert.ok(r.band > 0);
  assert.ok(r.skillMul > 1);
  assert.equal(r.vmaxMul, 1, "vmax scaling retired");
});

test("forward band (AI ahead) lowers skillMul with negative band", () => {
  const r = B.apply({ ...base, gap: -200 });
  assert.ok(r.band < 0);
  assert.ok(r.skillMul < 1);
  assert.equal(r.vmaxMul, 1);
});

test("BAND_CEIL caps reverse help so easy cannot beat the ladder top", () => {
  const easy = B.apply({
    ...base, band: 0.18, aiScale: 0.851, skill: 1, tierV: 1, bandCeil: 1.03, gap: 700,
  });
  assert.ok(easy.skillMul * 0.851 <= 1.03 + 1e-9);
});
