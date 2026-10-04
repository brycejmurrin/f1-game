/* light-presets.test.mjs — the shipped lighting values must name real knobs.
 *
 * js/lighting/presets.js is 255 profiles carrying 1,921 individual knob
 * settings, keyed "trackId|timeOfDay|weather", and it IS the look everyone sees
 * on the deployed build. Each key inside a profile is a `TUNE_DEFS` id.
 *
 * NOTHING CONNECTS THE TWO FILES. The presets are a baked export from the
 * in-game LIGHTING TUNER's COPY VALUES button — a data blob pasted in — and the
 * resolution in js/lighting/profiles.js reads `typeof L[d.id] === "number"`,
 * iterating TUNE_DEFS and looking each id up in the profile. A knob renamed in
 * lighting.js therefore does not throw and does not warn: the lookup simply
 * misses, the value falls back to the default, and every shipped profile that
 * set it silently stops applying. On a per-track basis, at night, in the rain —
 * conditions nobody checks after an unrelated rename.
 *
 * This is the same shape as the stale golden baseline found in the 2026-08 pass
 * (A18 in docs/ARCHITECTURE-REVIEW.md): a committed ARTIFACT that encodes the
 * state of another file, where the two can diverge without anything being
 * syntactically wrong. Those are exactly the ones worth a guard, because the
 * failure mode is silence rather than an error.
 *
 * Green when written — all 1,921 settings resolve. The point is that it stays
 * that way through the next rename.
 *
 * Run: node --test tests/unit/light-presets.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

/** Every `id:` in TUNE_DEFS. Read from source rather than evaluated: lighting-knobs.js
 *  reaches for browser globals at load, and the id list is a flat literal. */
function tuneIds() {
  return new Set([...read("js/lighting/knobs.js").matchAll(/id:\s*"(\w+)"/g)].map((m) => m[1]));
}

/** The presets file assigns `window.LightPresets`; run it against a stub window. */
function presets() {
  const ctx = vm.createContext({ window: {}, Math, JSON, Object, Array });
  vm.runInContext(read("js/lighting/presets.js"), ctx, { filename: "js/lighting/presets.js" });
  const P = vm.runInContext("window.LightPresets", ctx);
  assert.ok(P && typeof P === "object", "light-presets.js did not assign window.LightPresets");
  return P;
}

test("every shipped preset knob is a real TUNE_DEFS id", () => {
  const ids = tuneIds();
  assert.ok(ids.size > 100, `only found ${ids.size} TUNE_DEFS ids — the scan broke, not the file`);

  const P = presets();
  const orphans = new Map();          // unknown id -> profiles that set it
  let settings = 0;
  for (const key of Object.keys(P)) {
    for (const id of Object.keys(P[key])) {
      settings++;
      if (ids.has(id)) continue;
      if (!orphans.has(id)) orphans.set(id, []);
      orphans.get(id).push(key);
    }
  }
  assert.ok(settings > 500, `only ${settings} knob settings found — the scan broke`);

  const bad = [...orphans.entries()]
    .map(([id, keys]) => `${id} (set by ${keys.length} profile(s), e.g. "${keys[0]}")`)
    .sort();
  assert.deepEqual(bad, [],
    "a shipped lighting preset names a knob that no longer exists in TUNE_DEFS. It will not throw — " +
    "the resolution in js/lighting/profiles.js just misses the lookup and falls back to the default, " +
    "so the shipped look for those conditions quietly stops applying. Rename it here too, or drop it.");
});

test("the global baseline profile, if present, is a plain knob map", () => {
  // "*" is the optional global baseline and resolves BELOW every per-condition
  // profile. A nested object here (a track key pasted one level too deep, which
  // is the natural COPY VALUES slip) would be read as a knob whose value is not
  // a number, and js/lighting/profiles.js's `typeof === "number"` test would skip
  // it — silently, and for every condition at once.
  const P = presets();
  if (!P["*"]) return;
  const wrong = Object.entries(P["*"]).filter(([, v]) => typeof v !== "number").map(([k]) => k);
  assert.deepEqual(wrong, [],
    'the "*" baseline holds a non-numeric value — a profile pasted one level too deep is skipped in silence');
});

test("shipped presets never pin wetness (look=drive)", () => {
  // LT.wetness ≥ 0 overrides trackWetness for frame.wetness. Baking it into
  // dry dawn/night profiles made dry races look wet while grip stayed dry.
  // Diagnostic pins stay on the live tuner / localStorage only.
  const P = presets();
  const bad = [];
  for (const key of Object.keys(P)) {
    if (P[key] && Object.prototype.hasOwnProperty.call(P[key], "wetness")) bad.push(key);
  }
  assert.deepEqual(bad, [],
    "a shipped LightPresets key sets wetness — strip it (AUTO) and use ssrDryNight/ssrDryDay for dry sheen");
});

/** Full tod×weather grid: 4 times of day × 5 weathers. Fallthrough-only tracks
 *  have zero `track|…` keys and resolve to `"*"` alone — B batches fill them. */
const TOD = ["dawn", "day", "dusk", "night"];
const WX = ["dry", "wet", "rain", "fog", "overcast"];

test("every circuit ships a full tod×weather grid with no wetness pins", () => {
  // B1a fuji/okayama + B1b korea/jerez (2026-09-30), then the last eight (2026-10-04,
  // each copied from its nearest green-theme sibling) — each had zero track| keys
  // and resolved to "*" alone. Every js/circuits/<id>.js now ships its own grid.
  const P = presets();
  const circuits = fs.readdirSync(path.join(ROOT, "js/circuits")).filter((f) => f.endsWith(".js")).map((f) => f.slice(0, -3));
  assert.ok(circuits.length >= 52, `only ${circuits.length} circuit files found — the scan broke`);
  for (const track of circuits) {
    const keys = TOD.flatMap((tod) => WX.map((wx) => `${track}|${tod}|${wx}`));
    const missing = keys.filter((k) => !P[k] || typeof P[k] !== "object");
    assert.deepEqual(missing, [], `${track} must ship all 20 tod×weather keys (not "*" fallthrough)`);
    const wetPins = keys.filter((k) => Object.prototype.hasOwnProperty.call(P[k], "wetness"));
    assert.deepEqual(wetPins, [],
      `${track} must not pin LT.wetness (look=drive — road wetness follows physics)`);
  }
});

test("no lit condition ships the crushing stamp: ambientMul ≥ 0.15 and keyMul ≥ 0.1 outside night", () => {
  // AMBIENT FILL 0 makes every shadow pure black (knobs.js help), and a 0 key
  // turns the sun off. A COPY-ALL fan-out stamped ambientMul 0 / keyMul 0.115
  // onto 42 "<track>|dusk|wet" profiles and keyMul 0 + ambientMul 0 onto
  // nurburgring|dusk|dry; the owner judged the stamp "crushing" for Suzuka and
  // Silverstone (508b052e, 68df8a68) and it was replaced fleet-wide with the
  // same short delta (review-wgx-lighting item 4).
  // dawn|dry is the one exception, and it is a pending decision, not a pass:
  // all 44 dawn|dry profiles ship ambientMul 0 inside a deliberate-looking
  // twilight set (keyMul 0.29, mist, god-rays, lamps) that needs a rendered
  // A/B before it changes. Remove the exemption when that A/B lands.
  const P = presets();
  const bad = [];
  for (const [key, o] of Object.entries(P)) {
    const [, tod, wx] = key.split("|");
    if (!wx || tod === "night" || (tod === "dawn" && wx === "dry")) continue;
    const a = o.ambientMul ?? 1, k = o.keyMul ?? 1;
    if (a < 0.15 || k < 0.1) bad.push(`${key} ambientMul ${a} keyMul ${k}`);
  }
  assert.deepEqual(bad, [], "a non-night preset crushes ambient or switches the sun off");
});

test("no preset sets a condition-gated knob where its gate is shut (dead entries)", () => {
  // Two knobs are read only under one condition, so a value anywhere else is
  // dead weight that a reader takes for a live setting:
  //  - lightning: js/game.js's strike loop runs only while isRaining()
  //    (trackWetness() >= 0.72). Wetness is 0 for overcast/fog/dry and at most
  //    0.5 for "wet", and an arc flips a stage at wetness <= 0.67 (weather-arc.js
  //    arcSeq), so only "rain" profiles are ever read.
  //  - nightAmbLift: read only by _nightAmbientBand() (js/game.js), which
  //    atmosphere.js calls for night sessions alone.
  //  - sunElev / sunAzim: keyed by track x time of day (js/lighting/profiles.js
  //    keyFor) — every weather reads the "|dry" profile's value.
  // 12 overcast lightning and 44 dawn|wet nightAmbLift entries were deleted
  // 2026-10-04 (review-wgx-lighting item 16), and 70 per-weather sun offsets
  // with the track x tod sun (item 2).
  const src = read("js/game.js");
  assert.match(src, /if \(raining && _ltBase && LT\.lightning > 0\)/, "the lightning gate moved — re-check this test");
  assert.match(read("js/lighting/atmosphere.js"), /if \(isNightSession\) _nightAmbientBand\(\);/, "the night-band gate moved — re-check this test");
  assert.match(read("js/lighting/profiles.js"), /const TOD_KEYED = new Set\(\["sunElev", "sunAzim"\]\);/, "the sun keying moved — re-check this test");
  const P = presets(), dead = [];
  for (const [key, o] of Object.entries(P)) {
    const [, tod, wx] = key.split("|");
    if (!wx) continue;
    if ("lightning" in o && wx !== "rain") dead.push(`${key}.lightning`);
    if ("nightAmbLift" in o && tod !== "night") dead.push(`${key}.nightAmbLift`);
    for (const id of ["sunElev", "sunAzim"]) if (id in o && wx !== "dry") dead.push(`${key}.${id}`);
  }
  assert.deepEqual(dead, [], "a preset sets a knob its condition never reads");
});
