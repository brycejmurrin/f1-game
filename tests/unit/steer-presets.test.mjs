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
import { absSrc } from "../helpers/abs-src.mjs";
import { gameSource } from "../helpers/game-source.mjs";

import { seedStore } from "../helpers/seed-store.mjs";
import { makeStorageFaults } from "../helpers/storage-faults.mjs";

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

test("materialized shipped brake cue keeps STANDARD after an ALL restore", () => {
  // SAVE ALL writes the effective fallback for an unset key. brakeCue is 1 on
  // boot, so that explicit value must not turn the otherwise untouched bundle
  // into CUSTOM on the reload that follows an import.
  const { disk, apply } = bootTuning();
  disk.preset = "standard";
  disk.brakeCue = 1;
  apply();
  assert.equal(disk.preset, "standard");
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
function bootTuning(input = {}, disk = {}, g = {}, initStore) {
  const els = {};
  const noop = () => {};
  const mk = () => {
    const attrs = {};
    const el = { value: "", textContent: "", hidden: false, oninput: null, onclick: null, listeners: [],
      classList: { toggle: noop, add: noop, remove: noop },
      setAttribute: (key, value) => { attrs[key] = value; }, getAttribute: (key) => attrs[key] };
    el.addEventListener = (t, f) => { el.listeners.push([t, f]); };
    return el;
  };
  const $ = (id) => (els[id] ||= mk());
  const wires = {};
  const store = {
    get: (k, d) => (Object.prototype.hasOwnProperty.call(disk, k) ? disk[k] : d),
    set: (k, v) => { disk[k] = v; },
  };
  const sb = {
    Math, Object, Array, Number, String, JSON, isFinite,
    Log: { info: noop, warn: noop, debug: noop, error: noop },
    Input: new Proxy(input, { get: (target, key) => target[key] || noop }),
    SettingRow: { wire: (id, o) => { wires[typeof id === "string" ? id : id && id.id] = o; }, paint: noop }, Dom: { paintFold: noop }, GameAudio: { uiSelect: noop },
  };
  const listeners = {};
  sb.window = { matchMedia: () => ({ matches: false }), addEventListener: (t, f) => { (listeners[t] ||= []).push(f); } };
  const ctx = vm.createContext(sb);
  vm.runInContext(SRC, ctx, { filename: absSrc("js/input/steer-tuning.js") });
  // Keep G (pace/aria tests) and initStore (cue restart/quota tests from #6084).
  const G = { $, store: initStore ? initStore(ctx) : store, soundOn: false,
    clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)), ...g };
  const api = vm.runInContext("SteerTuning", ctx).create(G);
  const move = (id, v) => $(id).oninput({ target: { value: String(v) } });
  return { $, disk, G, move, wires, fire: (t) => { for (const f of listeners[t] || []) f(); }, apply: api.applySteerTuning };
}

test("steering sliders and labels show their fresh-store values in the HTML shell", () => {
  const { $ } = bootTuning();
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  for (const id of ["pm-rate", "pm-expo", "pm-smooth", "pm-lock", "pm-speedsteer", "pm-help", "pm-adaptbtn", "pm-pace"]) {
    const value = html.match(new RegExp('<input id="' + id + '"[^>]*?value="([^"]+)"'))[1];
    const label = html.match(new RegExp('<b id="' + id + '-v">([^<]+)</b>'))[1];
    assert.equal(value, String($(id).value), id);
    assert.equal(label, String($(id + "-v").textContent), id + " label");
  }
});

test("overall speed defaults to notch 11 (84% of reference) and reads each notch's physical pace", () => {
  const fresh = bootTuning();
  assert.deepEqual([fresh.$("pm-pace").value, fresh.$("pm-pace-v").textContent, fresh.G.PACE], [11, "84%", Math.pow(1.06, -3)]);
  const shell = readFileSync(join(ROOT, "index.html"), "utf8");
  assert.match(shell, /<input id="pm-pace"[^>]* min="1" max="19"[^>]* aria-valuetext="84%"/);
  assert.equal(fresh.$("pm-pace").getAttribute("aria-valuetext"), "84%");
  assert.equal(fresh.disk.pace, undefined, "a new default doesn't write a stored choice");
  for (let notch = 1; notch <= 19; notch++) {
    fresh.move("pm-pace", notch);
    assert.equal(fresh.disk.pace, notch);
    assert.equal(fresh.G.PACE, Math.pow(1.06, notch - 14));
    assert.equal(fresh.$("pm-pace-v").textContent, Math.round(Math.pow(1.06, notch - 14) * 100) + "%");
    assert.equal(fresh.$("pm-pace").getAttribute("aria-valuetext"), fresh.$("pm-pace-v").textContent);
  }
  const saved = bootTuning({}, { steerSchema: 5, pace: 11 });
  assert.deepEqual([saved.disk.pace, saved.$("pm-pace-v").textContent, saved.G.PACE], [11, "84%", Math.pow(1.06, -3)]);
  assert.equal(saved.$("pm-pace").getAttribute("aria-valuetext"), "84%");
});

test("adaptive buttons use strength 6 on fresh settings and Standard, preserving a saved strength", () => {
  let applied;
  const input = { setAdaptiveButtons: (mix) => { applied = mix; } };
  const fresh = bootTuning(input);
  assert.equal(fresh.$("pm-adaptbtn").value, 6);
  assert.equal(applied, 5 / 9);
  const saved = bootTuning(input, { steerSchema: 5, adaptiveButtons: 5 });
  assert.equal(saved.$("pm-adaptbtn").value, 5);
  assert.equal(applied, 4 / 9);
  saved.$("pm-preset-standard").onclick();
  assert.equal(saved.disk.adaptiveButtons, 6);
  assert.equal(applied, 5 / 9);
});

const lineSource = readFileSync(join(ROOT, "js/ui/driving-line-opts.js"), "utf8");

function bootCueControls(storage) {
  let line, store;
  const ui = bootTuning({}, {}, {}, (ctx) => {
    ctx.localStorage = storage;
    ctx.DrivingLine = { setPalette() {}, setOpacity() {} };
    seedStore(ctx);
    line = vm.runInContext(lineSource + "\nDrivingLineOpts", ctx, { filename: absSrc("js/ui/driving-line-opts.js") });
    store = ctx.GameStore.store;
    return store;
  });
  return { ui, line, store };
}

test("moving Predictive Cue preserves a legacy Line-Speed Cue after a restart", () => {
  const { storage } = makeStorageFaults({ initial: { "apex26.brakeCue": JSON.stringify("on") } });
  const first = bootCueControls(storage);
  assert.equal(first.line.brakeCue(), true);
  first.ui.move("pm-brakecue", 7);
  assert.equal(storage.getItem("apex26.brakeCue"), "7");
  const restarted = bootCueControls(storage);
  restarted.ui.apply();
  assert.equal(Number(restarted.ui.$("pm-brakecue").value), 7);
  assert.equal(restarted.line.brakeCue(), true, "the independent line-speed assist survives the slider change");
});

test("an interrupted cue migration preserves the legacy flag across a quota-limited restart", () => {
  // A numeric notch fits under the shorter legacy key, but the new flag does not.
  const faults = makeStorageFaults({ initial: { "apex26.brakeCue": JSON.stringify("on") }, quotaBytes: 17 });
  const first = bootCueControls(faults.storage);
  first.ui.move("pm-brakecue", 7);
  const restarted = bootCueControls(faults.storage);
  assert.equal(restarted.line.brakeCue(), true, "restarting before retry must not discard the saved flag");

  restarted.ui.move("pm-brakecue", 8);
  faults.set({ quotaBytes: Infinity });
  assert.equal(restarted.store.retryFailed().durable, true);
  const recovered = bootCueControls(faults.storage);
  recovered.ui.apply();
  assert.equal(recovered.line.brakeCue(), true);
  assert.equal(Number(recovered.ui.$("pm-brakecue").value), 8, "retry saves the latest slider choice");
});

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
// APPLY + PERSIST for the driving sliders that had neither (B·H11 settings audit, 2026-10-21).
// Moving a slider must store `apex26.<key>` and call its Input setter; a fresh boot on the same
// storage (a reload) must call that setter with the same arguments; and those must differ from
// a defaults boot, so the stored value is what the car gets.
test("each driving slider applies on input and re-applies from storage after a reload", () => {
  const ROWS = [
    ["pm-tiltcurve", "tiltCurve", 9, "setAnalogTrim", "tilt"],
    ["pm-touchcurve", "touchCurve", 9, "setAnalogTrim", "touch"],
    ["pm-padcurve", "padCurve", 2, "setAnalogTrim", "pad"],
    ["pm-touchrange", "touchRange", 8, "setTouchRange"],
    ["pm-touchdragspeed", "touchDragSpeed", 7, "setTouchSpeedMix"],
    ["pm-dragsmooth", "dragSmooth", 6, "setDragSmoothing"],
    ["pm-steerrate", "digitalRate", 9, "setKeyRampIn"],
    ["pm-steerreturn", "digitalRecenterRate", 2, "setKeyRampOut"],
    ["pm-analogspeed", "analogSpeedSteer", 7, "setAnalogSpeedMix"],
    ["pm-haptics", "haptics", 1, "setHaptics"],
    ["pm-paddz", "padDeadzone", 20, "setPadDeadzone"],
    ["pm-padsat", "padSaturation", 12, "setPadSaturation"],
  ];
  const recorder = (calls) => new Proxy({}, { get: (_, name) => (...args) => { calls.push([name, args]); } });
  const last = (calls, setter, first) => {
    const hit = calls.filter(([n, a]) => n === setter && (first == null || a[0] === first));
    return hit.length ? hit[hit.length - 1][1] : undefined;
  };
  const defaults = [];
  bootTuning(recorder(defaults)).apply();
  for (const [id, key, v, setter, first] of ROWS) {
    const disk = {}, live = [];
    const ui = bootTuning(recorder(live), disk);
    live.length = 0;
    ui.move(id, v);
    assert.equal(disk[key], v, `${id} stores apex26.${key}`);
    const applied = last(live, setter, first);
    assert.ok(applied, `${id} calls Input.${setter}`);
    const reload = [];
    bootTuning(recorder(reload), disk).apply();
    assert.deepEqual(last(reload, setter, first), applied, `${key} re-applies after a reload`);
    assert.notDeepEqual(last(defaults, setter, first), applied, `${key}=${v} differs from the default`);
  }
});

test("FEEL › SIM on a fresh install does not light a preset its unset keys do not match (B·H11 hunt)", () => {
  // matchPreset read an unset key as the CANDIDATE's own value, so a store holding only the four
  // FEEL keys "matched" PRO (adaptiveButtons/brakeCue/tiltDeg still at their STANDARD fallbacks).
  const disk = { drivingHelp: 1, raceLine: 0 };          // what the v2 migration stores on a fresh install
  const ui = bootTuning({}, disk);
  ui.wires["pm-feel"].write("sim");
  assert.equal(disk.steerRate, 7, "SIM sets the quick rack");
  assert.notEqual(disk.preset, "pro", "the car runs STANDARD assists with a quick rack, not PRO: " + disk.preset);
  // Control: the same four keys PLUS PRO's own assists is PRO.
  const pro = { drivingHelp: 1, raceLine: 0, adaptiveButtons: 4, brakeCue: 4, tiltDeg: 7 };
  const ui2 = bootTuning({}, pro);
  ui2.wires["pm-feel"].write("sim");
  assert.equal(pro.preset, "pro", "every PRO key in effect lights PRO");
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
  assert.match(SRC, /const HELP_LABEL = \{ low: "OFF", med: "MEDIUM", high: "HIGH", custom: "CUSTOM" \}/);
  assert.match(SRC, /\[hb === "low" \? "off" : "val", HELP_LABEL\[hb\]\]/);
  assert.doesNotMatch(SRC, /dh <= 1 \? \["off", "OFF"\]/);
  assert.doesNotMatch(SRC, /low: "LOW"/);
});

// #5783 J1: the band called notches 2 and 3 "low" = OFF while helpFromSlider gave
// them ROAD_FOLLOW 0.078 / 0.156 — a steer read from the road's curvature under a
// row and a fold that both said OFF. The label is OFF exactly when the gain is 0.
test("DRIVING HELP reads OFF exactly when ROAD_FOLLOW is 0, at every notch", () => {
  const fn = (name) => {
    const at = SRC.indexOf(`function ${name}(`);
    assert.notEqual(at, -1, `${name} is gone from js/input/steer-tuning.js`);
    let depth = 0, end = -1;
    for (let i = SRC.indexOf("{", at); i < SRC.length; i++) {
      if (SRC[i] === "{") depth++;
      else if (SRC[i] === "}") { depth--; if (!depth) { end = i; break; } }
    }
    return SRC.slice(at, end + 1);
  };
  const HELP_LABEL = table("HELP_LABEL");
  const seen = {};
  for (let notch = 1; notch <= 10; notch++) {
    // eslint-disable-next-line no-new-func
    const run = Function("store", "clamp", "SLIDER_MIN", "SLIDER_MAX",
      `"use strict"; ${fn("helpFromSlider")} ${fn("helpBand")} return { band: helpBand(), gain: helpFromSlider(store.get("drivingHelp", 1)) };`);
    const { band, gain } = run({ get: () => notch }, (v, a, b) => Math.max(a, Math.min(b, v)), 1, 10);
    assert.ok(HELP_LABEL[band], `notch ${notch}: band "${band}" has no label`);
    assert.equal(HELP_LABEL[band] === "OFF", gain === 0, `notch ${notch}: label ${HELP_LABEL[band]} with ROAD_FOLLOW gain ${gain}`);
    seen[band] = (seen[band] || 0) + 1;
  }
  assert.equal(seen.low, 1, "anti-vacuity: exactly one notch (1, the shipped default and Bryce's export) is OFF");
  assert.equal(seen.custom, 2, "notches 2 and 3 are CUSTOM");
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
  disk.tiltDeg = 8; disk.steerSmooth = 3; disk.adaptiveButtons = 6;
  disk.brakeCue = 1; disk.audioCues = 1; disk.gripSteer = 1;
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

// #5575 finding 1: only the ROOKIE click wrote autoThrottle, so ROOKIE -> STANDARD
// left THROTTLE on AUTO and the GAS pedal hidden under a chip reading STANDARD.
// An assist that stays on after the player turned it off is the worst kind.
test("leaving ROOKIE for RELAX / STANDARD / PRO restores manual throttle (#5575)", () => {
  for (const name of ["relax", "standard", "pro"]) {
    const seen = [];
    const disk = {};
    const { $ } = bootTuning({}, disk, { onAssistBundle: () => seen.push(disk.autoThrottle) });
    $("pm-preset-rookie").onclick();
    assert.equal(disk.autoThrottle, true, "ROOKIE hands the throttle to the car");
    assert.deepEqual(seen, [true]);
    $("pm-preset-" + name).onclick();
    assert.equal(disk.autoThrottle, false, name.toUpperCase() + " must hand the throttle back");
    assert.equal(disk.preset, name);
    assert.deepEqual(seen, [true, false], "game.js is told to re-read it AFTER the store holds false");
    // A second tap has nothing to hand back, so it must not re-run the bundle hook.
    $("pm-preset-" + name).onclick();
    assert.deepEqual(seen, [true, false]);
  }
});

test("onAssistBundle re-reads the throttle, shows the pedals again and only announces ROOKIE on the way IN (#5575)", () => {
  const GAME = gameSource();
  const at = GAME.indexOf("  onAssistBundle() {");
  assert.notEqual(at, -1, "onAssistBundle moved");
  const body = GAME.slice(GAME.indexOf("{", at) + 1, GAME.indexOf("\n  },", at));
  const run = (stored) => {
    const calls = [];
    const rec = (n) => (...a) => { calls.push([n, ...a]); };
    // eslint-disable-next-line no-new-func
    const out = Function("store", "Input", "paintThrottleMode", "refreshGearsBtn", "showTouchControls", "announce", "state",
      `let autoThrottleOpt = true, throttleLatchOpt = false; ${body}; return autoThrottleOpt;`)(
      { get: (k, d) => (k === "autoThrottle" ? stored : d) }, { setThrottleLatch: rec("latch") },
      rec("paint"), rec("gears"), rec("touch"), rec("announce"), "race");
    return { out, names: calls.map((c) => c[0]) };
  };
  const leaving = run(false);
  assert.equal(leaving.out, false, "the live option follows the store");
  assert.deepEqual(leaving.names, ["latch", "paint", "gears", "touch"], "repaints the row and the dock, says nothing");
  const entering = run(true);
  assert.equal(entering.out, true);
  assert.equal(entering.names[entering.names.length - 1], "announce");
});
