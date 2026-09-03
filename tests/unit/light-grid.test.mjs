/* light-grid.test.mjs — every shipped lighting value must be REACHABLE on its
 * own slider.
 *
 * The LIGHTING TUNER renders each knob as `<input type="range" min step>`, so
 * the thumb can only ever land on min + k*step. A shipped preset value that is
 * not on that grid cannot be represented: the readout prints the true value
 * while the thumb snaps to the nearest notch, and the two disagree on screen.
 *
 * The damage is not cosmetic. js/game/light-store.js `set()` stores a player
 * override whenever the incoming value differs from `fallback(id)` — and
 * `fallback` includes the SHIPPED preset for the current condition. With
 * keyMul shipped at 0.85 against a 0.02 grid, the slider can only emit 0.84 or
 * 0.86, so:
 *   - the first nudge writes an override and the profile flips to "(1 tuned)",
 *     even if the player was only trying to put it back where it was; and
 *   - 0.85 is then unreachable through the UI forever — only RESET restores it.
 * MEASURED before this guard: 481 of the 1,921 shipped values (25%), across 30
 * knobs, plus two TUNE_DEFS defaults (godrayLowBoost 0.55, shadowStr 1.15)
 * which were off their OWN slider's grid.
 *
 * The fix was to refine the step on the affected knobs to 0.01 rather than
 * round the presets: 0.01 divides the old 0.02/0.05 steps, so every previously
 * reachable value stays reachable and NO shipped value changed — the baked
 * look, which was tuned by eye, is untouched. Rounding the presets instead
 * would have edited 481 hand-tuned values to fit the widget.
 *
 * Run: node --test tests/unit/light-grid.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

/** TUNE_DEFS entries are object literals, usually one per line — but at least
 *  one (carEnvCube) wraps, so split on the `{ id:` boundary rather than by
 *  line. A knob whose `def` is a runtime expression rather than a literal
 *  (carEnvCube again, which is tier-gated on GLX.isMobile) yields def
 *  undefined; its range is still checked, its default is skipped. */
function defs() {
  const src = read("js/game/lighting-knobs.js");
  const starts = [...src.matchAll(/\{\s*id:\s*"(\w+)"/g)];
  const out = [];
  for (let i = 0; i < starts.length; i++) {
    const chunk = src.slice(starts[i].index,
      i + 1 < starts.length ? starts[i + 1].index : starts[i].index + 4000);
    const num = (k) => {
      const m = chunk.match(new RegExp(`\\b${k}:\\s*(-?[\\d.]+)`));
      return m ? Number(m[1]) : undefined;
    };
    const help = (chunk.match(/help:\s*"((?:[^"\\]|\\.)*)"/) || [])[1];
    const u = (chunk.match(/\bu:\s*"(\w+)"/) || [])[1];
    const d = { id: starts[i][1], u, min: num("min"), max: num("max"), step: num("step"), def: num("def"), help };
    if (d.min === undefined || d.step === undefined) continue;
    out.push(d);
  }
  return out;
}

/** The presets file assigns `window.LightPresets`; run it against a stub window. */
function presets() {
  const ctx = vm.createContext({ window: {}, Math, JSON, Object, Array });
  vm.runInContext(read("js/game/light-presets.js"), ctx, { filename: "js/game/light-presets.js" });
  return vm.runInContext("window.LightPresets", ctx);
}

/** Grid test done in INTEGER space. A float test is wrong here: (0.06-0)/0.02
 *  is 2.9999999999999996, so `% 1` flags 223 perfectly on-grid values as off.
 *  Scale by the decimals actually present and use integer remainder. */
const decimals = (x) => {
  const s = String(x), i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
};
function onGrid(v, min, step) {
  const p = Math.max(decimals(v), decimals(min), decimals(step)) + 2;
  const k = Math.round(10 ** p);
  const s = Math.round(step * k);
  return s !== 0 && Math.round((v - min) * k) % s === 0;
}

test("the integer grid test does not trip on binary-float representation", () => {
  // Guards the guard: these are all exactly on-grid, and a naive
  // ((v-min)/step) % 1 check calls every one of them off-grid.
  assert.ok(onGrid(0.06, 0, 0.02), "0.06 is 3 steps of 0.02");
  assert.ok(onGrid(1.15, 0, 0.01), "1.15 is 115 steps of 0.01");
  assert.ok(onGrid(2.5, 0.2, 0.05), "2.5 is 46 steps of 0.05 from 0.2");
  assert.ok(!onGrid(0.85, 0, 0.02), "0.85 is half a step off a 0.02 grid");
  assert.ok(!onGrid(0.58, 0, 0.05), "0.58 is not on a 0.05 grid");
});

test("every TUNE_DEFS default sits on its own slider's step grid", () => {
  const D = defs();
  assert.ok(D.length > 150, `only parsed ${D.length} knobs — the scan broke, not the file`);
  const bad = D
    .filter((d) => d.def !== undefined && !onGrid(d.def, d.min, d.step))
    .map((d) => `${d.id}: def ${d.def} is off the ${d.step} grid from ${d.min}`);
  assert.deepEqual(bad, [],
    "a knob's own shipped default cannot be selected on its slider — the thumb snaps to a " +
    "neighbouring notch while the readout prints the true value. Refine the knob's step so " +
    "the default lands on grid (a step that DIVIDES the old one keeps every existing value " +
    "reachable); do not round the default to fit the widget.");
});

test("every slider maximum sits on its own min+step grid", () => {
  // The thumb can only emit min+k*step. A max off that grid is a labelled
  // extreme the player can never reach — the same class as an off-grid default.
  const bad = defs()
    .filter((d) => d.max !== undefined && !onGrid(d.max, d.min, d.step))
    .map((d) => `${d.id}: max ${d.max} is off the ${d.step} grid from ${d.min}`);
  assert.deepEqual(bad, [],
    "a slider's own maximum cannot be selected — the last notch is short of the labelled extreme.");
});

test("slider maxima stop where the consumer saturates, not past it", () => {
  // Each assertion is a measured saturate in the shipping consumer. A max
  // above the saturate is dead travel; a help string that cites a different
  // ceiling is the same bug in prose.
  const byId = new Map(defs().map((d) => [d.id, d]));
  const get = (id) => {
    const d = byId.get(id);
    assert.ok(d, `${id} missing from TUNE_DEFS`);
    return d;
  };
  // post.js: carSoft = clamp((1.4 - uCarGloss) * 0.5, 0, 1) — sharpest at 1.4.
  assert.ok(get("carGloss").max <= 1.4 + 1e-9,
    `carGloss max ${get("carGloss").max} is past the SSR-streak saturate at 1.4`);
  // post.js: dz > uSsrThick && dz < max(5, stepLen*1.5) — at 5 the window is empty.
  assert.ok(get("ssrThick").max < 5,
    `ssrThick max ${get("ssrThick").max} reaches the far-window reject`);
  assert.doesNotMatch(get("ssrThick").help || "", /[Cc]eiling raised to 5/,
    "ssrThick help must not call the far-window reject the slider ceiling");
  // post.js: 1.0 - smoothstep(min(uVigSoft, 0.69), 0.70710678, vr) — 0.69 is the
  // last live notch. This assertion previously read 0.94 against the OLD form,
  // smoothstep(0.95, min(uVigSoft, 0.94), vr), whose edges were ill-ordered
  // (edge0 > edge1) and whose ramp the frame could never finish walking. When the
  // shader was rewritten the clamp moved to 0.69 and this number did not, so the
  // guard actively held 29.8% of the slider in a region that is now bit-identical.
  assert.equal(get("vignetteSoft").max, 0.69,
    "VIGNETTE REACH must end at the shader clamp min(uVigSoft, 0.69)");
  // lit.js fogCol: warm blue hits 0 at +4; cool red hits 0 at -1/0.12 ≈ 8.33.
  assert.ok(get("fogTint").max <= 4 + 1e-9, "fogTint warm side past blue=0");
  assert.ok(get("fogTint").min >= -1 / 0.12 - 0.05, "fogTint cool side past red=0");
  // lit.js: mix(1 - 0.12*k, 1, ao) hits black at k = 1/0.12.
  assert.ok(get("ambContactDark").max <= 1 / 0.12 + 0.05, "ambContactDark past black creases");
  // game.js: Math.min(0.9, lampFogBase + …)
  assert.equal(get("lampFogBase").max, 0.9);
  // post.js: clamp(uHgAniso, 0, 0.95)
  assert.equal(get("godrayAniso").max, 0.95);
  // game.js: clamp(0.85 * roadRough, 0.04, 1)
  assert.ok(get("roadRough").max <= 1 / 0.85 + 0.01, "roadRough past roughness=1");
  // lit.js wet absorb: absorbRoad = 1 - 0.58*uWetDark hits 0 at 1/0.58 = 1.7241,
  // and porous is now a FRACTION of it (absorbRoad * 0.66), so both saturate at
  // the same point. The old form here cited 0.42 — the pre-fix porous coefficient,
  // which no longer exists — and so permitted a max of 2.43, i.e. 28% dead travel.
  assert.ok(get("wetDark").max <= 1 / 0.58 + 0.01, "wetDark past full absorb");
  // lit.js: 0.30 * spill > 1 inverts the wet pool.
  assert.ok(get("lampWallSpill").max <= 1 / 0.30 + 0.01, "lampWallSpill past wet invert");
  // lit.js: mix(1, vec3(0.90,0.96,1.12), amt) — amt>1 extrapolates past the
  // designed cool-blue. Shader comment says 0..1.
  assert.ok(get("shadowTintAmt").max <= 1 + 1e-9,
    `shadowTintAmt max ${get("shadowTintAmt").max} is past the mix=1 designed tint`);
  // atmosphere.js cityGlow: r*(1+0.20w) / b*(1-0.30w). First channel hits 0
  // at w=+1/0.30 (blue) and w=-1/0.20 (red). Past that Math.max(0,…) floors
  // the dead channel while the other keeps moving — same class as fogTint.
  assert.ok(get("cityGlowWarm").max <= 1 / 0.30 + 0.05, "cityGlowWarm past blue=0");
  assert.ok(get("cityGlowWarm").min >= -1 / 0.20 - 0.05, "cityGlowWarm past red=0");
  // game.js cityGlowTint: weakest-channel factor 1 - 0.18*(tint/0.28) hits 0
  // at 0.28/0.18 ≈ 1.556. Max 1.5 is the last live notch.
  assert.ok(get("cityGlowTint").max <= 0.28 / 0.18 + 0.05, "cityGlowTint past weak-channel 0");
  // post.js: ao = 1 - clamp(occ)*uStrength, written raw to the AO buffer.
  // game.js uploads 0.95*aoStr with no clamp. Past slider 1/0.95 the buffer
  // goes negative and `c *= aoV` inverts creases (bright pits).
  assert.ok(get("aoStr").max <= 1 / 0.95 + 1e-9,
    `aoStr max ${get("aoStr").max} is past the invert (uStrength=1 at 1/0.95)`);
  // lit.js: mix(..., clamp(uGroundMist * band * fbm * dRamp, 0, 0.45)).
  // glx.js: uGroundMist = groundMist * mistDensity. atmosphere.js thinnest
  // authored non-zero gm is wet 0.12 → last live 0.45/0.12 = 3.75.
  assert.ok(get("mistDensity").max <= 0.45 / 0.12 + 1e-9,
    `mistDensity max ${get("mistDensity").max} is past the 0.45 mix cap at wet gm 0.12`);
  // sky.js: clamp(daytime*(1-overcast)*bandLM*uDaySkyBlue, 0, 1). Peak
  // (bandLM=1) saturates at 1; 3 is last live for the core band (bandLM>=1/3).
  assert.ok(get("daySkyBlue").max <= 3 + 1e-9,
    `daySkyBlue max ${get("daySkyBlue").max} is past 3× the peak-band clamp`);
  // game.js: Math.min(1, floodEmitMul * factor); dusk factor tops at 0.70.
  assert.ok(get("floodEmitMul").max <= 1 / 0.70 + 0.01,
    `floodEmitMul max ${get("floodEmitMul").max} is past the min(1) emit cap at dusk 0.70`);
  // sky.js: clamp(pow(sd,5)*0.22*horizon*mieDamp*uMieScatter, 0, 1). Peak
  // (on-sun, horizon, clear) saturates at 1/0.22.
  assert.ok(get("mieScatter").max <= 1 / 0.22 + 0.01,
    `mieScatter max ${get("mieScatter").max} is past the mix=1 sun-glow clamp`);
  // frame-lights.js setFrameLights: reach 4 already saturates typical sightlines
  // (Singapore 0.55 measured 415 m, no further lamps). 12 was leftover ×3.
  assert.ok(get("lampReach").max <= 4 + 1e-9,
    `lampReach max ${get("lampReach").max} is past the measured saturate at 4`);
});

test("GRAPHICS: LOW must not zero look-defining post (bloom/SSAO/god-rays)", () => {
  // GRAPHICS: LOW sets userTier 4, and present() used to hard-zero po.bloom
  // (and the rest of the last post stack) on PerfGov.tier() >= 4. That made
  // BLOOM AMOUNT and every sibling look slider a no-op on LOW even on a
  // healthy desktop. Look post reads autoTier() (crash + measured only);
  // cost rungs (env/SSR/shadows) still read tier() so LOW stays cheaper.
  const game = read("js/game.js");
  const gfx = read("js/game/gfx-quality.js");
  assert.match(gfx, /id:\s*"low"[\s\S]*?tier:\s*4/,
    "LOW must stay a cost-floor of 4 (env/SSR/shadows still shed)");
  for (const id of ["bloom", "ssao", "godray", "contact", "lampVol"]) {
    assert.match(game, new RegExp(`po\\.${id} = PerfGov\\.autoTier\\(\\) >= 4`),
      `po.${id} must shed on autoTier (governor/crash), not the GRAPHICS user floor`);
    assert.doesNotMatch(game, new RegExp(`po\\.${id} = PerfGov\\.tier\\(\\) >= 4`),
      `po.${id} must not hard-zero on GRAPHICS: LOW`);
  }
  assert.match(game, /po\.reflect = PerfGov\.tier\(\) >= 2 \? 0 : _ssr/,
    "SSR stays on the user cost floor (MEDIUM/LOW)");
  assert.match(game, /po\.carReflect = PerfGov\.tier\(\) >= 2 \? 0 : undefined/,
    "car-paint SSR stays on the user cost floor");
  const byId = new Map(defs().map((d) => [d.id, d]));
  for (const id of ["bloomMul", "bloomSpread", "threshOff", "bloomKnee",
                    "grMul", "aoStr", "contactStr"]) {
    const d = byId.get(id);
    assert.ok(d, `${id} missing from TUNE_DEFS`);
    assert.match(d.help || "", /GRAPHICS: LOW/,
      `${id} help must say the slider stays live on GRAPHICS: LOW`);
  }
  for (const id of ["ssrWetMul", "ssrDryNight", "ssrDryDay", "ssrThick",
                    "carReflect", "lampShadow"]) {
    const d = byId.get(id);
    assert.ok(d, `${id} missing from TUNE_DEFS`);
    assert.match(d.help || "", /GRAPHICS/,
      `${id} help must name the GRAPHICS cost shed so a dead LOW/MEDIUM slider is not a mystery`);
  }
  const carSh = byId.get("carShadow");
  assert.ok(carSh, "carShadow missing from TUNE_DEFS");
  assert.match(carSh.help || "", /GRAPHICS: LOW/,
    "carShadow help must name GRAPHICS: LOW (tier-3 cost shed)");
});

test("WGX god-ray knobs read TUNE_DEFS ids, not stale aliases", () => {
  // GLX uploads GT.godrayAniso / GT.godrayFloor; TLX maps gk("godrayAniso").
  // WGX used to pack T.hgAniso / T.hgFloor — ids that do not exist on LT — so
  // GOD-RAY FOCUS and GOD-RAY HAZE were stuck at the 0.60 / 0.020 fallbacks
  // on WebGPU no matter where the sliders sat.
  const wgx = read("js/render/webgpu/wgx.js");
  assert.match(wgx, /T\.godrayAniso/, "WGX must read T.godrayAniso");
  assert.match(wgx, /T\.godrayFloor/, "WGX must read T.godrayFloor");
  assert.doesNotMatch(wgx, /T\.hgAniso/, "stale T.hgAniso alias is dead — the slider id is godrayAniso");
  assert.doesNotMatch(wgx, /T\.hgFloor/, "stale T.hgFloor alias is dead — the slider id is godrayFloor");
});

test("WGX T.* reads are TUNE_DEFS ids (no silent fallbacks)", () => {
  const ids = new Set(defs().map((d) => d.id));
  const wgx = read("js/render/webgpu/wgx.js");
  const keys = [...wgx.matchAll(/\bT\.(\w+)/g)].map((m) => m[1]);
  const unknown = [...new Set(keys)].filter((k) => !ids.has(k));
  assert.deepEqual(unknown, [],
    "WGX reads a T.foo that is not a TUNE_DEFS id — the slider is a no-op on WebGPU " +
    "(the upload falls back to a hardcoded default).");
});

test("TLX k()/gk() keys are TUNE_DEFS ids (no silent fallbacks)", () => {
  // Same defect class as WGX T.hgAniso: a typo'd gk("hgAniso") would compile,
  // upload the fallback, and leave the slider dead on three.js only.
  const ids = new Set(defs().map((d) => d.id));
  const src = ["js/render/three/tsl-lit.js", "js/render/three/tlx-post.js",
    "js/render/three/tsl-fx.js", "js/render/three/tsl-sky.js",
    "js/render/three/tlx.js"].map(read).join("\n");
  const keys = [...src.matchAll(/\b(?:k|gk)\(\s*["'](\w+)["']/g)].map((m) => m[1]);
  const unknown = [...new Set(keys)].filter((k) => !ids.has(k));
  assert.deepEqual(unknown, [],
    "TLX k()/gk() reads a key that is not a TUNE_DEFS id — the slider is a no-op on three.js.");
});

test("every TUNE_DEFS uniform lives on GLX, WGX, and TLX", () => {
  // A new `u:` knob that ships on GLX only is the project's most persistent
  // look-drift: the slider moves, two backends ignore it. Name-presence is
  // the cheap half (upload + consume formulas stay in gfx-backend-canary).
  const glx = ["js/render/glx.js", "js/render/glx/post.js", "js/render/glx/shadow.js",
    "js/render/shaders/lit.js", "js/render/shaders/post.js", "js/render/shaders/sky.js"]
    .map(read).join("\n");
  const wgx = ["js/render/webgpu/wgx.js", "js/render/webgpu/wgsl-chunks.js",
    "js/render/webgpu/wgsl-post.js"].map(read).join("\n");
  const tlx = ["js/render/three/tlx.js", "js/render/three/tlx-post.js",
    "js/render/three/tsl-lit.js", "js/render/three/tsl-post.js",
    "js/render/three/tsl-sky.js", "js/render/three/tsl-fx.js"].map(read).join("\n");
  const hit = (src, d) => {
    const names = [d.id, d.u].filter(Boolean);
    return names.some((n) => src.includes(n));
  };
  const missing = [];
  for (const d of defs().filter((x) => x.u)) {
    if (!hit(glx, d)) missing.push(`${d.id} (${d.u}) missing on GLX`);
    if (!hit(wgx, d)) missing.push(`${d.id} (${d.u}) missing on WGX`);
    if (!hit(tlx, d)) missing.push(`${d.id} (${d.u}) missing on TLX`);
  }
  assert.deepEqual(missing, [],
    "a TUNE_DEFS u: knob is unnamed on a backend — the slider is a no-op there:\n  " +
    missing.join("\n  "));
});

test("lamp-chunk sliders name their backend support honestly", () => {
  // Honest gaps, not forgotten ports: per-chunk lamps ship on GLX (uniform
  // upload) and WGX (storage-buffer bake); TLX cannot have them (shared
  // node-material uniforms — per-chunk sets would mint a program per chunk,
  // the pinProgram lesson). Help must keep naming the unsupported backend so
  // a dead three.js thumb is not filed as a backend-parity bug.
  const byId = new Map(defs().map((d) => [d.id, d]));
  for (const id of ["perChunkLights", "roadChunkLamps"]) {
    const d = byId.get(id);
    assert.ok(d, `${id} missing from TUNE_DEFS`);
    assert.match(d.help || "", /WebGL2 and WebGPU/,
      `${id} help must name the supported backends`);
    assert.match(d.help || "", /three\.js/,
      `${id} help must keep naming the unsupported backend so it is not a mystery`);
  }
});

test("amount-knob defaults are not crushed into the first quarter of the slider", () => {
  // HTML range thumbs are linear in [min, max]. After the leftover ×1.5 / "raise
  // the ceiling" pass, a 1.0 default on a 0..12 slider sat at 8% of travel —
  // a few pixels from the left edge, so everyday nudges were unusable. Off-by-
  // default knobs (def === min) and signed/auto knobs stay where they are.
  const crushed = defs()
    .filter((d) => d.def !== undefined && d.max !== undefined)
    .filter((d) => d.min >= 0 && d.def > d.min && (d.max - d.min) > d.step)
    // 0..1 (and other max≤1) amounts: the ceiling IS the designed unit. A
    // 0.05 default on CLEARCOAT has to sit left or you lose the 0..1 lacquer.
    .filter((d) => d.max > 1)
    // CAR REFLECTION default is a whisper (0.05) on a 0..1.5 mix that still
    // has to reach the 0.85 mixAmt cap — same class as a unit amount.
    .filter((d) => d.id !== "carReflect")
    // VIBRANCE is the same class, measured: post.js weights it by
    // (1 - clamp(sat*1.5,0,1)), which is an exact identity on achromatic pixels
    // and shrinks as a pixel gets colourful, so the knob has very little
    // authority per unit. The ENTIRE old 0..0.5 range moved the worst-affected
    // pixel by 16/255 and mid-greys by under 2/255. The headroom to 1.5 is real
    // travel that the consumer honours; the 0.20 default is deliberately gentle
    // and pulling the max back down to flatter the thumb would delete the only
    // part of the slider that does anything visible.
    .filter((d) => d.id !== "vibrance")
    .filter((d) => (d.def - d.min) / (d.max - d.min) < 0.25)
    .map((d) => {
      const pct = ((d.def - d.min) / (d.max - d.min) * 100).toFixed(1);
      return `${d.id}: def ${d.def} sits at ${pct}% of [${d.min}, ${d.max}]`;
    });
  assert.deepEqual(crushed, [],
    "an amount knob's shipped default is in the first quarter of its slider. " +
    "Pull the leftover-wide max down so the default (and shipped presets) sit " +
    "in a usable band — do not raise the default to chase the thumb.");
});

test("asymmetric white-balance sliders are not ±N when the mix is not", () => {
  // fogTint already ships asymmetric (−6…3.9) because warm cuts blue at
  // 0.25/unit and cool cuts red at 0.12/unit. The other WB knobs used the
  // same class of mix (different coeffs per side) but kept a symmetric
  // slider, so one side stopped short of the last live notch and the help
  // had to apologise. Range = last live notch on EACH side, like fogTint.
  const byId = new Map(defs().map((d) => [d.id, d]));
  const get = (id) => {
    const d = byId.get(id);
    assert.ok(d, `${id} missing from TUNE_DEFS`);
    return d;
  };
  const near = (got, want, id, side) => {
    assert.ok(Math.abs(got - want) < 0.05,
      `${id} ${side} is ${got}, expected last-live ≈ ${want}`);
  };
  // atmosphere.js: warm cuts blue at 0.30 (zero at −3.33); cool cuts red at
  // 0.12 (zero at +8.33). Same coeffs on lampTemp in game.js.
  assert.notEqual(Math.abs(get("sunTemp").min), get("sunTemp").max,
    "sunTemp mix is not symmetric — the slider must not be ±N");
  near(get("sunTemp").min, -1 / 0.30, "sunTemp", "warm min");
  near(get("sunTemp").max, 1 / 0.12, "sunTemp", "cool max");
  assert.notEqual(Math.abs(get("lampTemp").min), get("lampTemp").max,
    "lampTemp mix is not symmetric — the slider must not be ±N");
  near(get("lampTemp").min, -1 / 0.30, "lampTemp", "warm min");
  near(get("lampTemp").max, 1 / 0.12, "lampTemp", "cool max");
  // atmosphere.js ambTemp: warm cuts abb at 0.24 (zero at −4.17); cool cuts
  // ar at 0.10 (zero at +10).
  assert.notEqual(Math.abs(get("ambTemp").min), get("ambTemp").max,
    "ambTemp mix is not symmetric — the slider must not be ±N");
  near(get("ambTemp").min, -1 / 0.24, "ambTemp", "warm min");
  near(get("ambTemp").max, 1 / 0.10, "ambTemp", "cool max");
  // cityGlowWarm: already clipped in the saturate test; also must not be ±N.
  assert.notEqual(Math.abs(get("cityGlowWarm").min), get("cityGlowWarm").max,
    "cityGlowWarm mix is not symmetric — the slider must not be ±N");
  // post.js tint: 0.07/unit BOTH ways (symmetric). Help must cite the
  // coefficient — the shader comment still says "−1..1" which is a lie.
  assert.equal(Math.abs(get("tint").min), get("tint").max,
    "tint mix IS symmetric (0.07 both ways) — keep a symmetric slider");
  assert.match(get("tint").help || "", /0\.07/,
    "tint help must cite the 0.07/unit mix so ±6 is not a mystery");
  // lampLevel: 0.001 floor left a notch that could not fully kill the lamps.
  assert.equal(get("lampLevel").min, 0, "LAMP LEVEL must be able to go fully off");
  // Same class: amount knobs whose consumer is a straight multiply, with no
  // "floored so near-zero still leaves X" help, must reach true 0.
  assert.equal(get("glowAmp").min, 0, "EMISSIVE GLOW must be able to go fully off");
  assert.equal(get("poolEnergy").min, 0, "POOL ENERGY must be able to go fully off");
  assert.equal(get("twilightFloor").min, 0, "TWILIGHT FLOOR must be able to go fully off");
  // game.js PAINT_*_NIGHT clearcoat is 1.0; shader comment is 0..1. Past 1
  // the night body overshoots the designed lacquer (wet-day 0.8 can no
  // longer quite reach 1 — same trade as wetDark porous-vs-not).
  assert.ok(get("carClearcoat").max <= 1 + 1e-9,
    `carClearcoat max ${get("carClearcoat").max} is past the 0..1 lacquer`);
  // game.js PAINT_* metalness is 0.12; clamp(0.12*k, 0, 1) saturates at 1/0.12.
  assert.ok(get("carMetal").max <= 1 / 0.12 + 0.05, "carMetal past metalness=1 on shipped paint");
  // game.js terrain detail = 0.42 * slider; lit.js grain 1+(n-0.5)*uDetail
  // floors at uDetail=2. 2/0.42 ≈ 4.76 — the 4.75 max is that last live notch.
  assert.ok(get("surfDetail").max <= 2 / 0.42 + 0.05, "surfDetail past terrain grain-black");
});

test("every shipped preset value sits on its knob's step grid", () => {
  const byId = new Map(defs().map((d) => [d.id, d]));
  const P = presets();
  assert.ok(P && typeof P === "object", "light-presets.js did not assign window.LightPresets");

  const offenders = new Map();   // id -> {count, sample}
  let checked = 0;
  for (const key of Object.keys(P)) {
    for (const [id, v] of Object.entries(P[key])) {
      const d = byId.get(id);
      if (!d || typeof v !== "number") continue;
      checked++;
      if (onGrid(v, d.min, d.step)) continue;
      const rec = offenders.get(id) || { count: 0, sample: `${v} in "${key}"` };
      rec.count++;
      offenders.set(id, rec);
    }
  }
  assert.ok(checked > 1500, `only ${checked} values checked — the scan broke, not the file`);

  const bad = [...offenders.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([id, r]) => `${id} x${r.count} (e.g. ${r.sample}, step ${byId.get(id).step})`);
  assert.deepEqual(bad, [],
    "a shipped lighting preset holds a value its own slider cannot select. The thumb snaps to " +
    "the nearest notch, and because light-store.js set() stores anything differing from " +
    "fallback(id), the player's first nudge silently persists the SNAPPED value as an override " +
    "and flips the profile to \"(N tuned)\". Refine that knob's step to a divisor of the " +
    "current one rather than rounding the preset.");
});

/** Every other slider family in the shell — CAMERA TUNER, pause ADVANCED,
 *  SETTINGS display/audio, photo-mode FOV. The lighting survey above is 183
 *  knobs; these are the rest of the `<input type="range">` set. A range that
 *  drifts from its JS clamp is the same class of bug as a TUNE_DEFS max past
 *  its consumer saturate: the last notches are either unreachable or lie. */
function htmlRanges() {
  const src = read("index.html");
  const out = {};
  for (const m of src.matchAll(/id="([^"]+)"[^>]*type="range"[^>]*>/g)) {
    const tag = m[0];
    const num = (k) => {
      const n = tag.match(new RegExp(`\\b${k}="([^"]+)"`));
      return n ? Number(n[1]) : undefined;
    };
    out[m[1]] = { min: num("min"), max: num("max"), step: num("step") };
  }
  // Some tags put type="range" before id=.
  for (const m of src.matchAll(/type="range"[^>]*id="([^"]+)"[^>]*>/g)) {
    if (out[m[1]]) continue;
    const tag = m[0];
    const num = (k) => {
      const n = tag.match(new RegExp(`\\b${k}="([^"]+)"`));
      return n ? Number(n[1]) : undefined;
    };
    out[m[1]] = { min: num("min"), max: num("max"), step: num("step") };
  }
  return out;
}

function camDefs() {
  const src = read("js/game/cam-tune.js");
  const starts = [...src.matchAll(/\{\s*id:\s*"(\w+)"/g)];
  const out = [];
  for (let i = 0; i < starts.length; i++) {
    const chunk = src.slice(starts[i].index,
      i + 1 < starts.length ? starts[i + 1].index : starts[i].index + 2000);
    const num = (k) => {
      const m = chunk.match(new RegExp(`\\b${k}:\\s*(-?[\\d.]+)`));
      return m ? Number(m[1]) : undefined;
    };
    const help = (chunk.match(/help:\s*"((?:[^"\\]|\\.)*)"/) || [])[1];
    out.push({ id: starts[i][1], min: num("min"), max: num("max"), step: num("step"), def: num("def"), help });
  }
  const fovMin = Number((src.match(/FOV_MIN\s*=\s*(-?[\d.]+)/) || [])[1]);
  const fovMax = Number((src.match(/FOV_MAX\s*=\s*(-?[\d.]+)/) || [])[1]);
  return { defs: out, fovMin, fovMax };
}

test("CAMERA / SETTINGS / ADVANCED slider markup matches the JS clamps", () => {
  const R = htmlRanges();
  assert.ok(Object.keys(R).length >= 16, `only parsed ${Object.keys(R).length} range inputs`);

  const cam = camDefs();
  assert.equal(cam.fovMin, 20);
  assert.equal(cam.fovMax, 110);
  const fov = cam.defs.find((d) => d.id === "fov");
  assert.ok(fov, "CAM_TUNE_DEFS missing fov");
  // cameras.js mode FOVs span ~36° (hood) to ~81° (onboard+ERS). ±35 on top
  // of those hits the 20…110 solved clamp: hood 36−35=1→20, onboard 81+35=116→110.
  // Help must name the clamp so the last notches are not a mystery.
  assert.match(fov.help || "", /20/, "CAM FOV help must name the 20° solved floor");
  assert.match(fov.help || "", /110/, "CAM FOV help must name the 110° solved ceiling");

  const steer = read("js/game/steer-tuning.js");
  const num = (src, k) => Number((src.match(new RegExp(`${k}\\s*=\\s*(-?[\\d.]+)`)) || [])[1]);
  const SMIN = num(steer, "SLIDER_MIN"), SMAX = num(steer, "SLIDER_MAX");
  const LMIN = num(steer, "LINE_MIN"), LMAX = num(steer, "LINE_MAX");
  const PMIN = num(steer, "PACE_MIN"), PMAX = num(steer, "PACE_MAX");
  assert.equal(SMIN, 1); assert.equal(SMAX, 10);
  assert.equal(LMIN, -5); assert.equal(LMAX, 5);
  assert.equal(PMIN, 1); assert.equal(PMAX, 19);

  const uiScale = read("js/game/ui-scale.js");
  const SCALE_MIN = num(uiScale, "SCALE_MIN"), SCALE_MAX = num(uiScale, "SCALE_MAX");
  assert.equal(SCALE_MIN, 40); assert.equal(SCALE_MAX, 200);

  const expectRange = (id, min, max) => {
    const r = R[id];
    assert.ok(r, `${id} missing from index.html`);
    assert.equal(r.min, min, `${id} min ${r.min} ≠ JS ${min}`);
    assert.equal(r.max, max, `${id} max ${r.max} ≠ JS ${max}`);
  };
  for (const id of ["pm-rate", "pm-expo", "pm-smooth", "pm-tiltdeg", "pm-lock",
                    "pm-speedsteer", "pm-help", "pm-tiltsimple", "pm-adaptbtn",
                    "pm-brakecue"]) {
    expectRange(id, SMIN, SMAX);
  }
  expectRange("pm-line", LMIN, LMAX);
  expectRange("pm-pace", PMIN, PMAX);
  expectRange("pm-uiscale", SCALE_MIN, SCALE_MAX);
  expectRange("pm-hudscale", SCALE_MIN, SCALE_MAX);
  expectRange("as-mvol", 0, 10);
  expectRange("as-svol", 0, 10);
  expectRange("pc-fov", cam.fovMin, cam.fovMax);
  expectRange("sp-vol", 0, 100);
});

test("god-ray lamp arrays are sized to the ONE bound the beam march walks", () => {
  // The uploader picks the shadow-mapped lamp's slot out of ITS OWN nearest-N
  // ordering and hands that index to the march as uLampShadowIdx. If the two
  // Ns disagree, a lamp sorting past the march's bound gets an index the loop
  // can never equal and its beam shadow silently stops being carved — while the
  // extra slots are packed and uploaded every frame with no reader. So the
  // GLSL array size, the loop bound, the JS cap and the scratch lengths all
  // have to be the same number.
  const shd = read("js/render/shaders/post.js");
  const post = read("js/render/glx/post.js");

  const N = Number((shd.match(/#define GR_MAX_LIGHTS (\d+)/) || [])[1]);
  assert.ok(N > 0, "GR_MAX_LIGHTS not found in GODRAY_FS");

  // The beam march must be bounded by the define, never by a literal that can
  // drift away from it.
  assert.match(shd, /for \(int li = 0; li < GR_MAX_LIGHTS; li\+\+\)/,
    "the lamp beam loop must use GR_MAX_LIGHTS, not a literal");

  const capMatch = post.match(/grNL = Math\.min\((\d+), total\)/)
    || post.match(/grNL = _grKeepNearest\(total, (\d+)\)/);
  const cap = Number((capMatch || [])[1]);
  assert.equal(cap, N, `uploader caps at ${cap} but the march walks ${N}`);

  // Scratch buffers are handed straight to uniform{1,2,3}fv — WebGL2 rejects an
  // upload longer than the declared array rather than truncating it.
  for (const [name, comps] of [["_grPos", 3], ["_grCol", 3], ["_grRad", 1],
                               ["_grDir", 3], ["_grCone", 2], ["_grVolW", 1]]) {
    const len = Number((post.match(new RegExp(`${name} = new Float32Array\\((\\d+)\\)`)) || [])[1]);
    assert.equal(len, N * comps,
      `${name} is ${len} floats; GR_MAX_LIGHTS ${N} x ${comps} components needs ${N * comps}`);
  }
});
