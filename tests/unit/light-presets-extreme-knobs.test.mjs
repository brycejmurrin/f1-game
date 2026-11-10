/* light-presets-extreme-knobs.test.mjs — flag per-track pins that park ≥3
 * knobs at their TUNE_DEFS range extremes (within 2 % of min or max).
 *
 * Extremes are a smell: a COPY-ALL paste or a "crank the slider" pass that
 * fights the shared *|tod|wx stamps. Intentional ones stay on ALLOWLIST with
 * a reason.
 *
 * Shared stamps ("*" / "*|…") reach EVERY circuit, so they get a stricter,
 * per-knob check: a knob at 90 % or more of its slider range, or within 2 % of
 * its minimum, must be named with its exact value in STAMP_ALLOWLIST. That list
 * is today's shipped look (Bryce's, kept as is) and is SHRINK-ONLY: a new
 * extreme fails, and so does an entry whose knob has left the extreme (delete
 * the entry rather than re-pointing it).
 *
 * Run: node --test tests/unit/light-presets-extreme-knobs.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

/** Fraction of [min, max] that counts as "at the extreme". */
const EXTREME_FRAC = 0.02;
/** A profile fails when this many knobs sit at an extreme. */
const EXTREME_COUNT = 3;

/**
 * Per-track keys allowed to keep ≥3 extreme knobs, with a reason.
 * Prefer deleting pins over growing this list (Lighting R4 #3).
 */
const ALLOWLIST = {
  // dawn|dry COPY-ALL extremes (godrayAniso/godrayBase/lampFlicker/roadRough/
  // ssrDryNight) moved onto *|dawn|dry in Lighting R4 #5a — drop the 52
  // per-track allowlist rows; shared stamps are out of scope.
  // Monaco night: R4 #3 dropped sunTemp/ssrWetMul/whites/toe; remaining
  // extremes are intentional city-chunk / car-paint pins.
  "monaco|night|wet": "after R4 #3 wet-pin trim: blacks/carEnvCube/carReflect/roadChunkLamps still intentional",
  "monaco|night|dry": "Monaco harbour chunk-road lamps (roadChunkLamps) + lampFlicker/surfDetail",
  "nurburgring|dusk|dry": "dusk dry COPY-ALL bleed/bounce/godray extremes — not wet-pin scope",
  "anderstorp|dusk|dry": "dusk dry COPY-ALL bleed/bounce/godray extremes — not wet-pin scope",
};

/** Shared-stamp knob at or beyond this fraction of its range counts as "max". */
const STAMP_MAX_FRAC = 0.9;
/**
 * Every shared-stamp extreme shipped on 2026-11-10, exact. Shrink-only.
 * lampLevel 0 on the day stamps is "lamps off by day", not a cranked slider.
 */
const STAMP_ALLOWLIST = {
  "*|dawn|dry": ["grMul=2.279@max", "bleedMul=2.425@max", "godrayAniso=0.943@max", "godrayBase=0@min",
    "lampFlicker=0.011@min", "roadRough=1.175@max", "ssrDryNight=0.014@min"],
  "*|day|rain": ["lampLevel=0@min"],
  "*|day|overcast": ["lampLevel=0@min"],
  "*|day|fog": ["lampLevel=0@min"],
  "*|dawn|wet": ["bloomKnee=0.904@max", "bounceK=0.28325@max", "carClearcoat=0.96@max", "carEnvCube=0.96@max",
    "carGloss=1.4@max", "carMetal=2.43@max", "carReflect=0.93@max", "carSunGlint=29.05@max", "flareMul=2.473@max",
    "glareStr=0.297@max", "godrayAniso=0.95@max", "lampCullFade=0.855@max", "lampVolBase=0.672@max",
    "lampVolHaze=1.365@max", "rainSpeed=0.04@min", "rainStreak=0.04@min", "sharpen=0.034@min", "ssrThick=0.93@max",
    "sunDiscSize=2.37@max", "sunShaftDecay=0.9@max", "sunShaftMul=2.29@max", "sunSquash=2.37@max",
    "surfDetail=2.5@max", "twilightRamp=5.95@max"],
  "*|day|wet": ["lampLevel=0@min"],
  "*|day|dry": ["lampLevel=0@min"],
};

function tuneDefs() {
  const ctx = vm.createContext({ GLX: { isMobile: false }, Math, Object });
  vm.runInContext(read("js/lighting/knobs.js"), ctx, { filename: absSrc("js/lighting/knobs.js") });
  return vm.runInContext("LightKnobs.TUNE_DEFS", ctx);
}

function presets() {
  const ctx = vm.createContext({ window: {}, Math, JSON, Object, Array });
  vm.runInContext(read("js/lighting/presets.js"), ctx, { filename: absSrc("js/lighting/presets.js") });
  const P = vm.runInContext("window.LightPresets", ctx);
  assert.ok(P && typeof P === "object", "presets.js did not assign window.LightPresets");
  return P;
}

function atExtreme(def, value) {
  if (!def || typeof value !== "number") return null;
  const span = def.max - def.min;
  if (!(span > 0)) return null;
  const tol = EXTREME_FRAC * span;
  if (Math.abs(value - def.min) <= tol) return "min";
  if (Math.abs(value - def.max) <= tol) return "max";
  return null;
}

function extremePins(P, byId) {
  const out = [];
  for (const [key, map] of Object.entries(P)) {
    if (key === "*" || key.startsWith("*|")) continue; // shared stamps — not per-track
    const hits = [];
    for (const [id, value] of Object.entries(map)) {
      const side = atExtreme(byId[id], value);
      if (side) hits.push(`${id}=${value}@${side}`);
    }
    if (hits.length >= EXTREME_COUNT) out.push({ key, hits });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

test("per-track pins with >=3 knobs at range extremes are allowlisted", () => {
  const byId = Object.fromEntries(tuneDefs().map((d) => [d.id, d]));
  const P = presets();
  const fails = extremePins(P, byId);
  const unlisted = [];
  const stale = [];
  for (const f of fails) {
    if (!ALLOWLIST[f.key]) unlisted.push(`${f.key}: ${f.hits.join(", ")}`);
  }
  for (const key of Object.keys(ALLOWLIST)) {
    if (!fails.some((f) => f.key === key)) stale.push(key);
  }
  assert.deepEqual(unlisted, [],
    "a per-track lighting pin parks ≥3 knobs at range extremes without an ALLOWLIST reason — " +
    "pull them toward the shared *|tod|wx stamp (prefer deleting), or add a reason");
  assert.deepEqual(stale, [],
    "ALLOWLIST names a profile that no longer has ≥3 extreme knobs — drop the stale entry");
});

function stampExtremes(P, byId) {
  const out = {};
  for (const [key, map] of Object.entries(P)) {
    if (!(key === "*" || key.startsWith("*|"))) continue;
    for (const [id, value] of Object.entries(map)) {
      const d = byId[id];
      assert.ok(d, `${key} pins ${id}, which is not a TUNE_DEFS knob`);
      const f = (value - d.min) / (d.max - d.min);
      const side = f >= STAMP_MAX_FRAC ? "max" : f <= EXTREME_FRAC ? "min" : null;
      if (side) (out[key] || (out[key] = [])).push(`${id}=${value}@${side}`);
    }
  }
  return out;
}

test("shared *|… stamps: every knob at >=90 % of range or at its minimum is on the shrink-only STAMP_ALLOWLIST", () => {
  const byId = Object.fromEntries(tuneDefs().map((d) => [d.id, d]));
  const found = stampExtremes(presets(), byId);
  const unlisted = [], stale = [];
  for (const [key, hits] of Object.entries(found))
    for (const h of hits) if (!(STAMP_ALLOWLIST[key] || []).includes(h)) unlisted.push(`${key} ${h}`);
  for (const [key, list] of Object.entries(STAMP_ALLOWLIST))
    for (const h of list) if (!(found[key] || []).includes(h)) stale.push(`${key} ${h}`);
  assert.deepEqual(unlisted, [],
    "a shared stamp (it reaches every circuit) parks a knob at a slider extreme — pull it in, " +
    "or, if it is the intended look, say why in the PR and list it");
  assert.deepEqual(stale, [],
    "STAMP_ALLOWLIST names an extreme that is no longer shipped — delete the entry (the list only shrinks)");
});

test("the stamp check catches a new extreme and a stale entry", () => {
  const byId = Object.fromEntries(tuneDefs().map((d) => [d.id, d]));
  const P = presets();
  const fake = { ...P, "*|dusk|dry": { ...P["*|dusk|dry"], bloomMul: byId.bloomMul.max } };
  assert.ok(stampExtremes(fake, byId)["*|dusk|dry"].includes(`bloomMul=${byId.bloomMul.max}@max`));
  const trimmed = { ...P, "*|day|dry": { ...P["*|day|dry"], lampLevel: 0.2 } };
  assert.equal(stampExtremes(trimmed, byId)["*|day|dry"], undefined);
});
