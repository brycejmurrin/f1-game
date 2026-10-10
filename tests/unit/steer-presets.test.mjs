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
import vm from "node:vm";

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

// ---- the preset CHIP, driven through the real module ----------------------
// Bug hunt 2026-09-30: wireTune() called clearPreset() for every row it wires,
// and none of them is in PRESET_STORE — so nudging HAPTICS or the pad DEAD ZONE
// flipped the chip from PRO to CUSTOM although every key PRO sets still held
// PRO's value. WEIGHT (carWeight, hand-wired) did the same. Only a preset-owned
// row may clear the chip. SteerTuning.create runs in a VM against a stub DOM, a
// disk-backed store and an Input whose every setter is a no-op.
function bootTuning(input = {}) {
  const els = {};
  const noop = () => {};
  const mk = () => {
    const el = { value: "", textContent: "", hidden: false, oninput: null, onclick: null, listeners: [],
      classList: { toggle: noop, add: noop, remove: noop }, setAttribute: noop };
    el.addEventListener = (t, f) => { el.listeners.push([t, f]); };
    return el;
  };
  const $ = (id) => (els[id] ||= mk());
  const disk = {};
  const store = {
    get: (k, d) => (Object.prototype.hasOwnProperty.call(disk, k) ? disk[k] : d),
    set: (k, v) => { disk[k] = v; },
  };
  const sb = {
    Math, Object, Array, Number, String, JSON, isFinite,
    Log: { info: noop, warn: noop, debug: noop, error: noop },
    Input: new Proxy(input, { get: (target, key) => target[key] || noop }),
    SettingRow: { wire: noop, paint: noop }, Dom: { paintFold: noop }, GameAudio: { uiSelect: noop },
  };
  const listeners = {};
  sb.window = { matchMedia: () => ({ matches: false }), addEventListener: (t, f) => { (listeners[t] ||= []).push(f); } };
  const ctx = vm.createContext(sb);
  vm.runInContext(SRC, ctx, { filename: "js/input/steer-tuning.js" });
  const api = vm.runInContext("SteerTuning", ctx).create({ $, store, soundOn: false,
    clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)) });
  const move = (id, v) => $(id).oninput({ target: { value: String(v) } });
  return { $, disk, move, fire: (t) => { for (const f of listeners[t] || []) f(); }, apply: api.applySteerTuning };
}

test("the open settings haptics row follows phone capability changes and pad disconnects", () => {
  let supported = false;
  const { $, fire } = bootTuning({ hapticsSupported: () => supported });
  assert.equal($("pm-haptics-item").hidden, true);
  supported = true; fire("apexhapticschange");
  assert.equal($("pm-haptics-item").hidden, false);
  supported = false; fire("apexhapticschange");
  assert.equal($("pm-haptics-item").hidden, true);
  supported = true; fire("gamepadconnected");
  assert.equal($("pm-haptics-item").hidden, false);
  supported = false; fire("gamepaddisconnected");
  assert.equal($("pm-haptics-item").hidden, true);
});
const PRESET_STORE = table("PRESET_STORE");
const presetOwned = (key) => Object.prototype.hasOwnProperty.call(PRESET_STORE, key);
// Every wireTune row, read from the source so a row added later is covered too.
const WIRED = [...SRC.matchAll(/wireTune\("([^"]+)", "([^"]+)", [^,]+, ([^,]+),/g)]
  .map((m) => ({ id: m[1], key: m[2], lo: m[3].trim() }));

test("a row no preset writes (HAPTICS, pad DEAD ZONE, WEIGHT, …) keeps the preset chip", () => {
  assert.ok(WIRED.length >= 10, "found the wireTune rows (" + WIRED.length + ")");
  const { $, disk, move } = bootTuning();
  for (const r of WIRED.concat([{ id: "pm-weight", key: "carWeight", lo: "1" }])) {
    $("pm-preset-pro").onclick();
    assert.equal(disk.preset, "pro");
    move(r.id, r.lo === "0" ? 12 : 3);
    const owned = presetOwned(r.key);
    assert.equal(disk.preset, owned ? "custom" : "pro",
      `${r.id} (${r.key}) is ${owned ? "" : "not "}preset-owned, so moving it must ${owned ? "" : "not "}clear PRO`);
  }
  $("pm-preset-pro").onclick();
  move("pm-haptics", 3);
  assert.equal(disk.haptics, 3, "the slider still stores its value");
  move("pm-paddz", 12);
  assert.equal(disk.padDeadzone, 12);
  assert.equal(disk.preset, "pro", "HAPTICS then DEAD ZONE: still PRO");
});

test("a preset-owned row still clears the chip", () => {
  const { $, disk, move } = bootTuning();
  for (const [id, key] of [["pm-rate", "steerRate"], ["pm-adaptbtn", "adaptiveButtons"], ["pm-help", "drivingHelp"]]) {
    assert.ok(presetOwned(key), key + " is preset-owned");
    $("pm-preset-pro").onclick();
    assert.equal(disk.preset, "pro");
    move(id, 5);
    assert.equal(disk.preset, "custom", `${id} is PRESET_STORE's — PRO no longer holds`);
  }
});

test("lineBand treats PUSH / non-named notches as CUSTOM, never CORNERS", () => {
  // CI 37088930611: every PUSH notch (-5..-1) used to fold into CORNERS, so a
  // later LINE STEERING sync could write PULL 3 over a deliberate PUSH.
  assert.match(SRC, /\["custom", "CUSTOM", true\]/);
  assert.match(SRC, /return "custom"/);
  assert.match(SRC, /n === "custom" \|\| LINE_LEVELS\[n\] == null/);
  assert.doesNotMatch(SRC, /rl === 0 \? "off" : rl >= 5 \? "full" : "corner"/);
});

test("AIDS fold and DRIVING HELP row share OFF/MEDIUM/HIGH labels", () => {
  // Live survey: ROOKIE chip + AIDS · OFF while the row said LOW for the same
  // notch. The fold used `dh <= 1 ? OFF : HELP_LABEL[hb]` and HELP_LABEL.low
  // was still "LOW".
  assert.match(SRC, /const HELP_LABEL = \{ low: "OFF", med: "MEDIUM", high: "HIGH" \}/);
  assert.match(SRC, /\[hb === "low" \? "off" : "val", HELP_LABEL\[hb\]\]/);
  assert.doesNotMatch(SRC, /dh <= 1 \? \["off", "OFF"\]/);
  assert.doesNotMatch(SRC, /low: "LOW"/);
});

test("STEER ASSIST fold token is STEER OFF, not LINE OFF", () => {
  // Race Settings owns the visual DRIVING LINE; the AIDS row is STEER ASSIST.
  assert.match(SRC, /const LINE_FOLD = \{ off: "STEER OFF"/);
  assert.doesNotMatch(SRC, /off: "LINE OFF"/);
});

test("refreshPresetButtons reconciles a stale preset chip against live values", () => {
  // preset:"rookie" survived a steerSchema assist reset, so the chip stayed
  // lit while drivingHelp/raceLine were OFF. matchPreset() is the value check;
  // refreshPresetButtons writes "custom" when nothing matches.
  assert.match(SRC, /function matchPreset\(\)/);
  assert.match(SRC, /if \(matched\) \{\s*if \(claimed !== matched\) store\.set\("preset", matched\);/);
  assert.match(SRC, /else if \(claimed !== "custom"\) \{\s*store\.set\("preset", "custom"\);/);
  const { disk, apply } = bootTuning();
  disk.preset = "rookie";
  disk.drivingHelp = 1;
  disk.raceLine = 0;
  disk.steerRate = 2; disk.steerExpo = 6; disk.steerLock = 7; disk.steerSpeed = 7;
  disk.tiltDeg = 8; disk.steerSmooth = 3; disk.adaptiveButtons = 5;
  disk.brakeCue = 4; disk.audioCues = 1; disk.gripSteer = 1;
  apply();
  assert.equal(disk.preset, "standard",
    "values match STANDARD — chip follows the values, not the stale ROOKIE name");
  disk.preset = "rookie";
  disk.drivingHelp = 1;
  disk.raceLine = 0;
  disk.steerRate = 7; // PRO rack, but assists still OFF → no named bundle
  apply();
  assert.equal(disk.preset, "custom", "mixed values clear a stale ROOKIE claim");
});

test("the injected AUDIO DRIVING CUES row drops the preset chip by delegation (bug-hunt H11)", () => {
  // driving-cues.js owns the row's own handler (injected after boot under LAZY_AUDIO);
  // steer-tuning only sees its bubbled input event on #advanced-inner.
  const { $, disk } = bootTuning();
  $("pm-preset-pro").onclick();
  assert.equal(disk.preset, "pro");
  disk.audioCues = 5;   // what the row's own oninput has just stored
  for (const [t, f] of $("advanced-inner").listeners) if (t === "input") f({ target: { id: "pm-audiocues" } });
  assert.equal(disk.preset, "custom", "audioCues is preset-owned: moving it must clear PRO");
  $("pm-preset-pro").onclick();
  for (const [t, f] of $("advanced-inner").listeners) if (t === "input") f({ target: { id: "pm-haptics" } });
  assert.equal(disk.preset, "pro", "another row's bubbled input leaves the chip alone");
});
