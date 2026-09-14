/* steer-presets.test.mjs — the two tables in js/input/steer-tuning.js that
 * MUST agree, and did not for a week.
 *
 * PRESETS (RELAX / STANDARD / PRO) are named bundles that drive every handling
 * slider at once. STEER_LEVELS (easy / assist / normal / sim) are the FEEL row
 * those sliders are read BACK through — `matchSteerLevel()` compares the live
 * values against them. So each bundle has to land exactly ON its level, or
 * clicking the bundle lights up CUSTOM instead of its own name.
 *
 * That invariant was stated in two comments and checked by nothing, so when the
 * 2026-09-08 re-centring moved STANDARD and PRO onto a new profile and left
 * RELAX on the old one, nothing said so. What it cost:
 *
 *   - clicking RELAX read CUSTOM in the FEEL row;
 *   - and because WHEELBASE is derived from the RATE slider, RELAX ended up
 *     with a SNAPPIER rack (3.8) than STANDARD (4.2) — inverting the one thing
 *     the bundle exists to do. Two browser specs caught the symptoms
 *     (sliders.spec.js, presets.spec.js) and both read as somebody else's
 *     problem for a week because the group they live in was red anyway.
 *
 * A no-browser guard, so the next re-centring is caught in three seconds by
 * test:tooling-fast rather than in forty minutes of SwiftShader.
 *
 * Run: node --test tests/unit/steer-presets.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = readFileSync(join(ROOT, "js/input/steer-tuning.js"), "utf8");

/** Pull an object-of-objects table out of the source by name. */
function table(name) {
  const at = SRC.indexOf(`const ${name} = {`);
  assert.notEqual(at, -1, `${name} is gone from js/input/steer-tuning.js`);
  const open = SRC.indexOf("{", at);
  let depth = 0, end = open;
  for (let i = open; i < SRC.length; i++) {
    if (SRC[i] === "{") depth++;
    else if (SRC[i] === "}") { depth--; if (!depth) { end = i; break; } }
  }
  // Strip comments, then quote the bare keys so it parses as JSON5-ish JS.
  const body = SRC.slice(open, end + 1).replace(/\/\/[^\n]*/g, "");
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${body});`)();
}
const PRESETS = table("PRESETS");
const STEER_LEVELS = table("STEER_LEVELS");
const STEER_DEFAULTS = table("STEER_DEFAULTS");
// The fields the FEEL row is matched on — the four STEER_LEVELS carry.
const KEYS = ["steerRate", "steerExpo", "steerLock", "steerSpeed"];
// Which bundle is which level, where the source names a pairing. Kept as a
// SEPARATE assertion from the one below, because the two say different things:
// this one pins the intended mapping, that one refuses ANY bundle that matches
// nothing. The second is the one with teeth — it is derived from PRESETS rather
// than from a list here, so a bundle added later cannot escape it by not being
// in this table. (It nearly did: ROOKIE arrived in the same pass that fixed
// RELAX and shipped one field off `easy`.)
const PAIRS = [["relax", "easy"], ["standard", "normal"], ["pro", "sim"]];

test("every preset bundle lands exactly ON its feel level", () => {
  for (const [preset, level] of PAIRS) {
    for (const k of KEYS) {
      assert.equal(PRESETS[preset][k], STEER_LEVELS[level][k],
        `PRESETS.${preset}.${k} (${PRESETS[preset][k]}) must equal STEER_LEVELS.${level}.${k} `
        + `(${STEER_LEVELS[level][k]}) — otherwise clicking ${preset.toUpperCase()} reads CUSTOM`);
    }
  }
});

test("NO preset — named here or not — can match no level at all", () => {
  // The defect this file exists for, stated over every bundle that exists
  // rather than over three the author remembered to list. matchSteerLevel()
  // walks STEER_LEVELS and returns null when the live sliders match none, and
  // null is what paints CUSTOM: a player picks a named mode and is told they
  // have a custom setup.
  for (const name of Object.keys(PRESETS)) {
    const hit = Object.keys(STEER_LEVELS).filter((lv) =>
      KEYS.every((k) => PRESETS[name][k] === STEER_LEVELS[lv][k]));
    assert.ok(hit.length >= 1,
      `PRESETS.${name} matches NO steer level, so picking ${name.toUpperCase()} reads CUSTOM. `
      + `It is ${KEYS.map((k) => `${k} ${PRESETS[name][k]}`).join(", ")}; the nearest levels are `
      + Object.keys(STEER_LEVELS).map((lv) =>
          `${lv} [${KEYS.filter((k) => PRESETS[name][k] !== STEER_LEVELS[lv][k]).join(", ") || "exact"}]`).join(" "));
  }
});

test("STANDARD is the shipped car: it equals the store fallbacks exactly", () => {
  // activePreset() compares the two, so a fresh install reads CUSTOM the moment
  // they disagree — the same failure one level up.
  for (const k of KEYS) {
    assert.equal(PRESETS.standard[k], STEER_DEFAULTS[k],
      `PRESETS.standard.${k} must equal STEER_DEFAULTS.${k} or a fresh install reads CUSTOM`);
  }
});

test("the ladder is monotonic on what it differentiates: LOCK and the speed taper", () => {
  // easy -> assist -> normal is one calm rack that opens up; SIM is the single
  // step that also quickens the rack. If a retune breaks the ordering, the FEEL
  // row stops meaning anything even when every bundle still matches a level.
  const order = ["easy", "assist", "normal"];
  for (let i = 1; i < order.length; i++) {
    for (const k of ["steerLock", "steerSpeed"]) {
      assert.ok(STEER_LEVELS[order[i]][k] >= STEER_LEVELS[order[i - 1]][k],
        `${k} must not fall from ${order[i - 1]} to ${order[i]} — the ladder is the feature`);
    }
    assert.equal(STEER_LEVELS[order[i]].steerRate, STEER_LEVELS[order[0]].steerRate,
      "easy/assist/normal share ONE calm rack — only SIM quickens it");
  }
  assert.ok(STEER_LEVELS.sim.steerRate > STEER_LEVELS.normal.steerRate,
    "SIM is the one step that quickens the rack; without that it is just NORMAL");
});

test("RELAX is the most forgiving bundle, which is the whole point of it", () => {
  // The second symptom of the same drift: wheelbase comes off the RATE slider
  // (wheelbaseFromSlider — a LOWER rate is a LONGER, lazier rack), so a RELAX
  // with a quicker rate than STANDARD is snappier than the default car.
  assert.ok(PRESETS.relax.steerRate <= PRESETS.standard.steerRate,
    "RELAX must not have a quicker rack than STANDARD — that inverts the bundle");
  assert.ok(PRESETS.relax.drivingHelp >= PRESETS.standard.drivingHelp, "RELAX helps more");
  assert.ok(PRESETS.relax.raceLine >= PRESETS.standard.raceLine, "…and is the only one with line pull");
  assert.ok(PRESETS.pro.steerRate >= PRESETS.standard.steerRate, "PRO sharpens response");
});
