#!/usr/bin/env node
// Merge lighting deltas into js/game/light-presets.js.
//
//   node .claude/skills/bake-lighting/merge-proposals.mjs                       # the proposals dir
//   node .claude/skills/bake-lighting/merge-proposals.mjs artifacts/lighting/proposals
//   node .claude/skills/bake-lighting/merge-proposals.mjs artifacts/tmp/edits.js  # a pasted COPY VALUES export
//
// Takes either shape: an agent proposal ({track, combos:{"dusk|dry":{…}}}) or
// the LIGHTING TUNER's COPY VALUES export (`window.LightEdits = {…}`, keyed by
// the full "track|tod|wx" plus the "*" / "*|tod" layers). Both are DELTAS.
//
// SAFE merge: only the keys present in the input are written, and within a key
// only the ids present are set. The shipped "*" baseline and every other
// track's profiles stay put. This is the opposite of bake.mjs (full replace),
// which is the ONLY tool that may take a window.LightPresets snapshot. Does NOT
// bump cache — parent does that after the last js edit.
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import vm from "node:vm";

const ROOT = resolve(new URL("../../../", import.meta.url).pathname);
const LP = join(ROOT, "js/game/light-presets.js");
const LIGHTING = join(ROOT, "js/game/lighting.js");
// A directory of proposal JSON, or ONE file — which is what a pasted export is.
const TARGET = resolve(process.argv[2] || join(ROOT, "artifacts/lighting/proposals"));

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

// TWO INPUT SHAPES, ONE MERGE. Agent proposals are per-track JSON
// ({track, combos:{"dusk|dry":{…}}}); the LIGHTING TUNER's COPY VALUES button
// now exports a player's own overrides as `window.LightEdits = {…}`, keyed by
// the full "track|tod|wx" the store uses. Both normalise to the same list of
// [key, knobMap] pairs and go through the same validation below.
//
// The tuner export is READ WITH vm, not JSON.parse: it is a JS assignment
// carrying // comments that tell a human which block is which condition, and
// running it is how loadPresets() already reads light-presets.js.
function readEdits(text, file) {
  const ctx = vm.createContext({ window: {} });
  try {
    vm.runInContext(text, ctx, { filename: file });
  } catch (e) {
    console.error(`${file}: could not evaluate as a LightEdits export — ${e.message}`);
    process.exit(1);
  }
  const w = vm.runInContext("window", ctx);
  if (w.LightPresets && !w.LightEdits) {
    // The name is the interlock, so say what it means rather than merging a
    // snapshot as if it were a delta.
    console.error(`${file}: this is a window.LightPresets SNAPSHOT, not a delta. ` +
      "A full snapshot goes through bake.mjs (full replace), not this tool.");
    process.exit(1);
  }
  return w.LightEdits || null;
}

// One [key, vals] pair per condition, tagged with the file it came from so an
// error message can name it.
function loadPairs(target) {
  if (!existsSync(target)) {
    console.error(`No such proposal path: ${target}`);
    process.exit(1);
  }
  const isDir = statSync(target).isDirectory();
  const files = isDir
    ? readdirSync(target).filter((f) => f.endsWith(".json")).sort().map((f) => join(target, f))
    : [target];
  if (!files.length) {
    console.error(`No *.json proposals in ${target}`);
    process.exit(1);
  }
  const pairs = [];
  for (const full of files) {
    const file = full.slice(ROOT.length + 1);
    const text = readFileSync(full, "utf8");
    const edits = /window\.Light(Edits|Presets)\s*=/.test(text) ? readEdits(text, file) : null;
    if (edits) {
      for (const [key, vals] of Object.entries(edits)) pairs.push({ file, key, vals, delta: true });
      continue;
    }
    let raw;
    try { raw = JSON.parse(text); } catch (e) {
      console.error(`${file}: not JSON and not a LightEdits export — ${e.message}`);
      process.exit(1);
    }
    if (!raw.track || typeof raw.track !== "string") {
      errors.push(`${file}: missing string "track"`); continue;
    }
    if (!raw.combos || typeof raw.combos !== "object" || Array.isArray(raw.combos)) {
      errors.push(`${file}: missing object "combos"`); continue;
    }
    for (const [combo, vals] of Object.entries(raw.combos)) {
      pairs.push({ file, key: `${raw.track}|${combo}`, vals, delta: false });
    }
  }
  return pairs;
}

// "monza|night|wet", the bare "*" global layer, or "*|night". The last two come
// only from the tuner export — a {track, combos} proposal cannot express them —
// and both are real shapes in the shipped file.
function badKey(key) {
  if (key === "*") return null;
  const parts = key.split("|");
  if (parts.length === 2) {
    return parts[0] === "*" && TODS.has(parts[1]) ? null : `bad key "${key}"`;
  }
  if (parts.length !== 3) return `bad key "${key}"`;
  if (!parts[0]) return `bad key "${key}" (empty track)`;
  if (!TODS.has(parts[1])) return `bad time-of-day in "${key}"`;
  if (!WXS.has(parts[2])) return `bad weather in "${key}"`;
  return null;
}

const TUNE = defs();
const STAR = new Set(["carGloss", "blacks", "shadows", "midtones", "highlights",
  "whites", "toe", "shoulder", "liftR", "liftG", "liftB", "gammaR", "gammaG",
  "gammaB", "gainR", "gainG", "gainB"]);
const shipped = loadPresets();
const errors = [];
const pairs = loadPairs(TARGET);
const merged = { ...shipped };
let wrote = 0, knobs = 0;

// Which ids a per-track key would FALL BACK to if it dropped a knob. The "*"
// layers are what light-store.js resolves through before the per-condition map,
// so a knob equal to its slider default is only safely droppable when no "*"
// layer sets it — otherwise dropping it hands the condition the "*" value and
// silently reverts a deliberate edit back to default. Matters now that a real
// person's overrides come through here and not only agent proposals.
function starSets(key, id) {
  if (key === "*" || key.startsWith("*|")) return false;
  const tod = key.split("|")[1];
  return !!((shipped["*"] && shipped["*"][id] !== undefined) ||
    (shipped["*|" + tod] && shipped["*|" + tod][id] !== undefined));
}

for (const { file, key, vals, delta } of pairs) {
  const kerr = badKey(key);
  if (kerr) { errors.push(`${file}: ${kerr}`); continue; }
  if (!vals || typeof vals !== "object" || Array.isArray(vals)) {
    errors.push(`${file}: ${key} is not a knob map`); continue;
  }
  const clean = {};
  for (const [id, v] of Object.entries(vals)) {
    const d = TUNE.get(id);
    if (!d) { errors.push(`${file}: ${key}.${id} is not a TUNE_DEFS id`); continue; }
    if (typeof v !== "number" || !isFinite(v)) {
      errors.push(`${file}: ${key}.${id} is not a finite number`); continue;
    }
    if (v < d.min || v > d.max) {
      errors.push(`${file}: ${key}.${id}=${v} outside [${d.min}, ${d.max}]`); continue;
    }
    if (!onGrid(v, d.min, d.step)) {
      errors.push(`${file}: ${key}.${id}=${v} off slider grid (min ${d.min} step ${d.step})`); continue;
    }
    // Redundant with the fallback, so leaving it out keeps the file small —
    // but only where the fallback really is the default (see starSets).
    if (d.def !== undefined && v === d.def && !starSets(key, id)) continue;
    if (key !== "*" && STAR.has(id) && shipped["*"] && shipped["*"][id] === v) continue;
    clean[id] = v;
  }
  // WITHIN a key the two shapes mean different things, and conflating them
  // loses data either way.
  //   An agent PROPOSAL is a considered whole profile for that condition, so it
  //   REPLACES — that is how a proposal drops a knob it decided against, and
  //   emptying it is how a proposal resets the condition to the "*" fallback.
  //   A tuner DELTA is the handful of sliders a person moved. It MERGES: they
  //   tuned two knobs on a condition that already ships eight, which is adding
  //   two, not deleting six. It may never delete a condition either — an empty
  //   map cannot occur (the export filters them) and honouring one would let a
  //   paste wipe a shipped profile it never mentioned.
  if (!Object.keys(clean).length) {
    if (!delta) delete merged[key];
    continue;
  }
  merged[key] = delta ? Object.assign({}, merged[key], clean) : clean;
  wrote++;
  knobs += Object.keys(clean).length;
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
console.log(`Merged ${pairs.length} incoming profile(s): ${wrote} written, ${knobs} knob(s).`);
console.log(`Shipped profiles now: ${Object.keys(ordered).length} (incl "*").`);
console.log("Did not bump cache — run bump-cache --apply after the last js edit.");
