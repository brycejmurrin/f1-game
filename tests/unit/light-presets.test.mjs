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
  // same short delta (review-wgx-lighting item 4). dawn|dry had the same
  // ambientMul 0 pin; the fleet fill now lives on LightPresets["*|dawn|dry"]
  // (ambientMul 0.5, twilight keyMul 0.29) and per-track dawn|dry no longer
  // pins those two knobs.
  const P = presets();
  const bad = [];
  for (const [key, o] of Object.entries(P)) {
    const parts = key.split("|");
    const tod = parts[0] === "*" ? parts[1] : parts[1];
    const wx = parts[0] === "*" ? parts[2] : parts[2];
    if (!wx || tod === "night") continue;
    const a = o.ambientMul ?? 1, k = o.keyMul ?? 1;
    if (a < 0.15 || k < 0.1) bad.push(`${key} ambientMul ${a} keyMul ${k}`);
  }
  assert.deepEqual(bad, [], "a non-night preset crushes ambient or switches the sun off");
});

test("shared *|dawn|dry stamp supplies the fleet dawn fill", () => {
  const P = presets();
  const shared = P["*|dawn|dry"];
  assert.ok(shared, "expected LightPresets['*|dawn|dry']");
  assert.equal(shared.ambientMul, 0.5);
  assert.equal(shared.keyMul, 0.29);
  assert.equal(shared.bloomMul, 0.115);
  const pinned = Object.keys(P).filter((k) => {
    if (!/\|dawn\|dry$/.test(k) || k.startsWith("*")) return false;
    const o = P[k];
    return Object.prototype.hasOwnProperty.call(o, "ambientMul")
      || Object.prototype.hasOwnProperty.call(o, "keyMul");
  });
  assert.deepEqual(pinned, [], "per-track dawn|dry must defer ambientMul/keyMul to *|dawn|dry");
  const bloomRedundant = [];
  for (const key of Object.keys(P)) {
    if (!/\|dawn\|dry$/.test(key) || key.startsWith("*")) continue;
    const o = P[key];
    if (Object.prototype.hasOwnProperty.call(o, "bloomMul") && o.bloomMul === shared.bloomMul) {
      bloomRedundant.push(`${key}.bloomMul=${o.bloomMul}`);
    }
  }
  assert.deepEqual(bloomRedundant, [],
    "per-track dawn|dry must not re-pin bloomMul at the same value as *|dawn|dry");
});

test("shared *|night|dry stamp supplies the fleet night authenticity knobs", () => {
  const P = presets();
  const shared = P["*|night|dry"];
  assert.ok(shared, "expected LightPresets['*|night|dry']");
  assert.equal(shared.nightAmbLift, 1.45);
  assert.equal(shared.ambientMul, 1.05);
  assert.equal(shared.keyMul, 1.2);
  assert.equal(shared.lampLevel, 0.26);
  assert.equal(shared.floodEmitMul, 0.3);
  assert.equal(shared.bloomMul, 1.1);
  assert.equal(shared.glowAmp, 1.85);
  assert.equal(shared.exposureMul, 0.92);
  assert.equal(shared.poolEnergy, 0.7);
  assert.equal(shared.cityGlowMul, 0.55);
  // Fleet core authenticity knobs must not re-pin the pre-stamp crush/wash values.
  const CORE = ["nightAmbLift", "ambientMul", "bloomMul", "glowAmp", "exposureMul"];
  const pinned = [];
  for (const key of Object.keys(P)) {
    if (!/\|night\|dry$/.test(key) || key.startsWith("*")) continue;
    const o = P[key];
    for (const id of CORE) {
      if (!Object.prototype.hasOwnProperty.call(o, id)) continue;
      pinned.push(`${key}.${id}=${o[id]}`);
    }
  }
  assert.deepEqual(pinned, [], "per-track night|dry must defer core authenticity knobs to *|night|dry");
});

test("shared *|dawn|wet stamp supplies the fleet wet-dawn look", () => {
  const P = presets();
  const shared = P["*|dawn|wet"];
  assert.ok(shared, "expected LightPresets['*|dawn|wet']");
  assert.equal(shared.exposureMul, 0.96);
  assert.equal(shared.ambientMul, 1.08);
  assert.equal(shared.keyMul, 0.62);
  assert.equal(shared.lampLevel, 0.13);
  assert.equal(shared.floodEmitMul, 0.22);
  assert.equal(shared.bloomMul, 0.34);
  assert.equal(shared.glowAmp, 2.35);
  assert.equal(shared.wetDark, 1.22);
  const ALLOW = new Set(["fogTint", "mistHeight"]);
  const CORE = ["exposureMul", "ambientMul", "keyMul", "lampLevel", "floodEmitMul", "bloomMul", "glowAmp", "wetDark"];
  const pinned = [];
  for (const key of Object.keys(P)) {
    if (!/\|dawn\|wet$/.test(key) || key.startsWith("*")) continue;
    const o = P[key];
    for (const id of Object.keys(o)) {
      if (ALLOW.has(id)) continue;
      if (CORE.includes(id) || id in shared) pinned.push(`${key}.${id}=${o[id]}`);
    }
  }
  assert.deepEqual(pinned, [], "per-track dawn|wet must defer to *|dawn|wet (fogTint/mistHeight exceptions only)");
});

test("shared *|day|dry stamp supplies the fleet clear-daylight authenticity knobs", () => {
  const P = presets();
  const shared = P["*|day|dry"];
  assert.ok(shared, "expected LightPresets['*|day|dry']");
  assert.equal(shared.keyMul, 1.22);
  assert.equal(shared.sunElev, 6);
  assert.equal(shared.shadowTintAmt, 0.18);
  assert.equal(shared.cloudCover, -0.1);
  assert.equal(shared.tint, -0.04);
  assert.equal(shared.saturation, 1.02);
  assert.equal(shared.ambTemp, 0.04);
  assert.equal(shared.fogTint, -0.04);
  assert.equal(shared.exposureMul, 1.04);
  assert.equal(shared.lampLevel, 0);
  assert.equal(shared.floodEmitMul, 0.08);
  const redundant = [];
  for (const key of Object.keys(P)) {
    if (!/\|day\|dry$/.test(key) || key.startsWith("*")) continue;
    const o = P[key];
    for (const [id, v] of Object.entries(o)) {
      if (Object.prototype.hasOwnProperty.call(shared, id) && shared[id] === v) {
        redundant.push(`${key}.${id}=${v}`);
      }
    }
  }
  assert.deepEqual(redundant, [],
    "per-track day|dry must not re-pin a knob at the same value as *|day|dry");
});

test("shared *|day|wet stamp supplies the fleet wet-daylight authenticity knobs", () => {
  const P = presets();
  const shared = P["*|day|wet"];
  assert.ok(shared, "expected LightPresets['*|day|wet']");
  assert.equal(shared.ambientMul, 1.02);
  assert.equal(shared.keyMul, 0.9);
  assert.equal(shared.cloudCover, 0.2);
  assert.equal(shared.exposureMul, 0.94);
  assert.equal(shared.fogDensityMul, 1.12);
  assert.equal(shared.saturation, 0.92);
  assert.equal(shared.shadowStr, 0.88);
  assert.equal(shared.ssrWetMul, 1.28);
  assert.equal(shared.wetDark, 1.15);
  assert.equal(shared.tint, -0.15);
  assert.equal(shared.lampLevel, 0);
  const ALLOW = new Set(["fogDensityMul", "mistDensity", "daySkyBlue", "ambTemp", "weatherSunMute"]);
  const CORE = [
    "ambientMul", "keyMul", "cloudCover", "exposureMul", "fogDensityMul", "saturation",
    "shadowStr", "shadowTintAmt", "ssrWetMul", "wetDark", "tint", "lampLevel", "floodEmitMul",
  ];
  const pinned = [];
  for (const key of Object.keys(P)) {
    if (!/\|day\|wet$/.test(key) || key.startsWith("*") || key === "spa|day|wet") continue;
    const o = P[key];
    for (const id of Object.keys(o)) {
      if (ALLOW.has(id)) continue;
      if (CORE.includes(id) || id in shared) pinned.push(`${key}.${id}=${o[id]}`);
    }
  }
  assert.deepEqual(pinned, [], "per-track day|wet must defer to *|day|wet (fog/mist/sky exceptions only)");
  const spa = P["spa|day|wet"];
  assert.ok(spa && Object.keys(spa).every((id) => id === "shadowTintAmt"), "spa|day|wet keeps shadowTintAmt only");
});

test("shared *|dusk|dry stamp supplies the fleet dry-twilight authenticity knobs", () => {
  const P = presets();
  const shared = P["*|dusk|dry"];
  assert.ok(shared, "expected LightPresets['*|dusk|dry']");
  assert.equal(shared.ambientMul, 1.08);
  assert.equal(shared.keyMul, 0.92);
  assert.equal(shared.lampLevel, 0.26);
  assert.equal(shared.floodEmitMul, 0.48);
  assert.equal(shared.bloomMul, 0.88);
  assert.equal(shared.glowAmp, 2.12);
  assert.equal(shared.exposureMul, 0.96);
  const CORE = ["ambientMul", "keyMul", "lampLevel", "floodEmitMul", "bloomMul", "glowAmp", "exposureMul"];
  const pinned = [];
  for (const key of Object.keys(P)) {
    if (!/\|dusk\|dry$/.test(key) || key.startsWith("*") || key === "spa|dusk|dry") continue;
    const o = P[key];
    for (const id of CORE) {
      if (!Object.prototype.hasOwnProperty.call(o, id)) continue;
      pinned.push(`${key}.${id}=${o[id]}`);
    }
  }
  assert.deepEqual(pinned, [], "per-track dusk|dry must defer core authenticity knobs to *|dusk|dry");
});

test("shared *|dusk|wet stamp supplies the fleet wet-twilight authenticity knobs", () => {
  const P = presets();
  const shared = P["*|dusk|wet"];
  assert.ok(shared, "expected LightPresets['*|dusk|wet']");
  assert.equal(shared.ambientMul, 0.84);
  assert.equal(shared.keyMul, 0.68);
  assert.equal(shared.lampLevel, 0.33);
  assert.equal(shared.floodEmitMul, 0.42);
  assert.equal(shared.bloomMul, 0.88);
  assert.equal(shared.glowAmp, 2.2);
  assert.equal(shared.exposureMul, 0.93);
  const CORE = ["ambientMul", "keyMul", "lampLevel", "floodEmitMul", "bloomMul", "glowAmp", "exposureMul"];
  const pinned = [];
  for (const key of Object.keys(P)) {
    if (!/\|dusk\|wet$/.test(key) || key.startsWith("*") || key === "spa|dusk|wet") continue;
    const o = P[key];
    for (const id of CORE) {
      if (!Object.prototype.hasOwnProperty.call(o, id)) continue;
      pinned.push(`${key}.${id}=${o[id]}`);
    }
  }
  assert.deepEqual(pinned, [], "per-track dusk|wet must defer core authenticity knobs to *|dusk|wet");
});

test("shared *|night|wet stamp supplies the fleet wet-night authenticity knobs", () => {
  const P = presets();
  const shared = P["*|night|wet"];
  assert.ok(shared, "expected LightPresets['*|night|wet']");
  assert.equal(shared.nightAmbLift, 1.08);
  assert.equal(shared.ambientMul, 0.88);
  assert.equal(shared.keyMul, 0.48);
  assert.equal(shared.lampLevel, 0.28);
  assert.equal(shared.floodEmitMul, 0.44);
  assert.equal(shared.bloomMul, 0.38);
  assert.equal(shared.glowAmp, 2.05);
  assert.equal(shared.exposureMul, 0.9);
  assert.equal(shared.poolEnergy, 0.64);
  assert.equal(shared.cityGlowMul, 0.88);
  const CORE = ["nightAmbLift", "ambientMul", "keyMul", "lampLevel", "floodEmitMul", "bloomMul", "glowAmp", "exposureMul"];
  const pinned = [];
  for (const key of Object.keys(P)) {
    if (!/\|night\|wet$/.test(key) || key.startsWith("*") || key === "spa|night|wet") continue;
    const o = P[key];
    for (const id of CORE) {
      if (!Object.prototype.hasOwnProperty.call(o, id)) continue;
      pinned.push(`${key}.${id}=${o[id]}`);
    }
  }
  assert.deepEqual(pinned, [], "per-track night|wet must defer core authenticity knobs to *|night|wet");
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
