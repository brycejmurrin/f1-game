#!/usr/bin/env node
// Merge per-track lighting proposals into js/game/light-presets.js.
//
//   node .claude/skills/bake-lighting/merge-proposals.mjs
//   node .claude/skills/bake-lighting/merge-proposals.mjs artifacts/lighting/proposals
//
// SAFE merge: only the keys present in the proposal files are written. The
// shipped "*" baseline and every other track's profiles stay put. This is the
// opposite of bake.mjs (full replace). Does NOT bump cache — parent does that
// after the last js edit.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import vm from "node:vm";

const ROOT = resolve(new URL("../../../", import.meta.url).pathname);
const LP = join(ROOT, "js/game/light-presets.js");
const LIGHTING = join(ROOT, "js/game/lighting.js");
const DIR = resolve(process.argv[2] || join(ROOT, "artifacts/lighting/proposals"));

const TODS = new Set(["dawn", "day", "dusk", "night"]);
const WXS = new Set(["dry", "wet", "rain", "fog", "overcast"]);

const decimals = (x) => {
  const s = String(x), i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
};
function onGrid(v, min, step) {
  const p = Math.max(decimals(v), decimals(min), decimals(step)) + 2;
  const k = Math.round(10 ** p);
  const scaled = Math.round((v - min) * k);
  const stepK = Math.round(step * k);
  return stepK !== 0 && scaled % stepK === 0;
}

function defs() {
  const src = readFileSync(LIGHTING, "utf8");
  const starts = [...src.matchAll(/\{\s*id:\s*"(\w+)"/g)];
  const out = new Map();
  for (let i = 0; i < starts.length; i++) {
    const chunk = src.slice(starts[i].index,
      i + 1 < starts.length ? starts[i + 1].index : starts[i].index + 4000);
    const num = (k) => {
      const m = chunk.match(new RegExp(`\\b${k}:\\s*(-?[\\d.]+)`));
      return m ? Number(m[1]) : undefined;
    };
    const d = { id: starts[i][1], min: num("min"), max: num("max"), step: num("step"), def: num("def") };
    if (d.min === undefined || d.step === undefined) continue;
    out.set(d.id, d);
  }
  return out;
}

function loadPresets() {
  const ctx = vm.createContext({ window: {}, Math, JSON, Object, Array });
  vm.runInContext(readFileSync(LP, "utf8"), ctx, { filename: "light-presets.js" });
  return vm.runInContext("window.LightPresets", ctx);
}

function loadProposals(dir) {
  if (!existsSync(dir)) {
    console.error(`No proposal dir: ${dir}`);
    process.exit(1);
  }
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  if (!files.length) {
    console.error(`No *.json proposals in ${dir}`);
    process.exit(1);
  }
  return files.map((f) => {
    const raw = JSON.parse(readFileSync(join(dir, f), "utf8"));
    return { file: f, raw };
  });
}

const TUNE = defs();
const STAR = new Set(["carGloss", "blacks", "shadows", "midtones", "highlights",
  "whites", "toe", "shoulder", "liftR", "liftG", "liftB", "gammaR", "gammaG",
  "gammaB", "gainR", "gainG", "gainB"]);
const shipped = loadPresets();
const proposals = loadProposals(DIR);
const errors = [];
const merged = { ...shipped };
let wrote = 0, knobs = 0;

for (const { file, raw } of proposals) {
  const track = raw.track;
  const combos = raw.combos;
  if (!track || typeof track !== "string") {
    errors.push(`${file}: missing string "track"`); continue;
  }
  if (!combos || typeof combos !== "object" || Array.isArray(combos)) {
    errors.push(`${file}: missing object "combos"`); continue;
  }
  for (const [combo, vals] of Object.entries(combos)) {
    const parts = combo.split("|");
    if (parts.length !== 2 || !TODS.has(parts[0]) || !WXS.has(parts[1])) {
      errors.push(`${file}: bad combo "${combo}"`); continue;
    }
    if (!vals || typeof vals !== "object" || Array.isArray(vals)) {
      errors.push(`${file}: ${combo} is not a knob map`); continue;
    }
    const clean = {};
    for (const [id, v] of Object.entries(vals)) {
      const d = TUNE.get(id);
      if (!d) { errors.push(`${file}: ${combo}.${id} is not a TUNE_DEFS id`); continue; }
      if (typeof v !== "number" || !isFinite(v)) {
        errors.push(`${file}: ${combo}.${id} is not a finite number`); continue;
      }
      if (v < d.min || v > d.max) {
        errors.push(`${file}: ${combo}.${id}=${v} outside [${d.min}, ${d.max}]`); continue;
      }
      if (!onGrid(v, d.min, d.step)) {
        errors.push(`${file}: ${combo}.${id}=${v} off slider grid (min ${d.min} step ${d.step})`); continue;
      }
      if (d.def !== undefined && v === d.def) continue;
      if (STAR.has(id) && shipped["*"] && shipped["*"][id] === v) continue;
      clean[id] = v;
    }
    const key = `${track}|${combo}`;
    if (!Object.keys(clean).length) {
      delete merged[key];
      continue;
    }
    merged[key] = clean;
    wrote++;
    knobs += Object.keys(clean).length;
  }
}

if (errors.length) {
  console.error(`merge-proposals: ${errors.length} error(s)`);
  for (const e of errors.slice(0, 40)) console.error("  " + e);
  if (errors.length > 40) console.error(`  … +${errors.length - 40} more`);
  process.exit(1);
}

const ordered = {};
for (const k of Object.keys(merged).sort((a, b) => {
  if (a === "*") return -1;
  if (b === "*") return 1;
  return a.localeCompare(b);
})) ordered[k] = merged[k];

const src = readFileSync(LP, "utf8");
const re = /^window\.LightPresets\s*=\s*\{[\s\S]*?^\};/m;
if (!src.match(re)) {
  console.error("Could not find the window.LightPresets assignment");
  process.exit(1);
}
writeFileSync(LP, src.replace(re, "window.LightPresets = " + JSON.stringify(ordered, null, 2) + ";"));
console.log(`Merged ${proposals.length} proposal file(s): ${wrote} profile(s), ${knobs} knob(s).`);
console.log(`Shipped profiles now: ${Object.keys(ordered).length} (incl "*").`);
console.log("Did not bump cache — run bump-cache --apply after the last js edit.");
