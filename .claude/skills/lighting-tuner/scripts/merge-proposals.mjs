#!/usr/bin/env node
// Merge lighting deltas into js/lighting/presets.js.
//
//   node .claude/skills/lighting-tuner/scripts/merge-proposals.mjs                       # the proposals dir
//   node .claude/skills/lighting-tuner/scripts/merge-proposals.mjs artifacts/lighting/proposals
//   node .claude/skills/lighting-tuner/scripts/merge-proposals.mjs artifacts/tmp/edits.js  # a pasted COPY VALUES export
//
// Takes either shape: an agent proposal ({track, combos:{"dusk|dry":{…}}}) or
// the LIGHTING TUNER's COPY VALUES export (`window.LightEdits = {…}`, keyed by
// the full "track|tod|wx" plus the "*" / "*|tod" layers). Both are DELTAS.
//
// SAFE merge: only the keys present in the input are written, and within a key
// only the ids present are set. The shipped "*" baseline and every other
// track's profiles stay put. This is the opposite of bake.mjs (full replace),
// which is the ONLY tool that may take a window.LightPresets snapshot. Does NOT
// bump cache — none is needed (deploy stamps hashes; tags stay ?v=dev).
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { badProfileKey, knobDefs, knobError, presetChanges } from "../../../../tools/lighting/preset-validation.mjs";
import { join, resolve, relative } from "node:path";
import vm from "node:vm";

const ROOT = resolve(new URL("../../../../", import.meta.url).pathname);
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`Usage: node .claude/skills/lighting-tuner/scripts/merge-proposals.mjs [dir|file]

SAFE merge of LightEdits / proposal deltas into js/lighting/presets.js.
Default target: artifacts/lighting/proposals
`);
  process.exit(0);
}
const LP = join(ROOT, "js/lighting/presets.js");
const LIGHTING = join(ROOT, "js/lighting/knobs.js");
// A directory of proposal JSON, or ONE file — which is what a pasted export is.
const argv = process.argv.slice(2);
const unknown = argv.find((a) => a.startsWith("--") && !["--check", "--dry-run", "--json", "--help"].includes(a));
if (unknown) { console.error(`Unknown option: ${unknown}`); process.exit(1); }
if (argv.includes("--help")) { console.log("Usage: merge-proposals.mjs [file | directory] [--check | --dry-run] [--json]"); process.exit(0); }
const inputs = argv.filter((a) => !a.startsWith("--"));
if (inputs.length > 1) { console.error("Expected at most one proposal path"); process.exit(1); }
const check = argv.includes("--check") || argv.includes("--dry-run");
const TARGET = resolve(inputs[0] || join(ROOT, "artifacts/lighting/proposals"));

function loadPresets() {
  const ctx = vm.createContext({ window: {}, Math, JSON, Object, Array });
  vm.runInContext(readFileSync(LP, "utf8"), ctx, { filename: "presets.js" });
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
// running it is how loadPresets() already reads js/lighting/presets.js.
function readEdits(text, file) {
  const ctx = vm.createContext({ window: {} });
  try {
    vm.runInContext(text, ctx, { filename: file, timeout: 1000 });
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
    const file = relative(ROOT, full);
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
const TUNE = knobDefs();
const STAR = new Set(["carGloss", "blacks", "shadows", "midtones", "highlights",
  "whites", "toe", "shoulder", "liftR", "liftG", "liftB", "gammaR", "gammaG",
  "gammaB", "gainR", "gainG", "gainB"]);
const shipped = loadPresets();
const errors = [];
const pairs = loadPairs(TARGET);
const merged = { ...shipped };
let wrote = 0, knobs = 0;

// Which ids a per-track key would FALL BACK to if it dropped a knob. The "*"
// layers are what js/lighting/profiles.js resolves through before the per-condition map,
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
  const kerr = badProfileKey(key);
  if (kerr) { errors.push(`${file}: ${kerr}`); continue; }
  if (!vals || typeof vals !== "object" || Array.isArray(vals)) {
    errors.push(`${file}: ${key} is not a knob map`); continue;
  }
  const clean = {};
  for (const [id, v] of Object.entries(vals)) {
    const d = TUNE.get(id);
    const err = knobError(id, v, TUNE);
    if (err) { errors.push(`${file}: ${key}.${id}=${v} ${err}`); continue; }
    // Road wetness is physics (trackWetness), not a baked look. Shipping it
    // made dry dawn/night presets look wet while grip stayed dry
    // (docs/plans/2026-09-30-wetness-lighting.md). Live tuner may still pin it.
    if (id === "wetness") {
      errors.push(`${file}: ${key}.wetness must not be baked — leave AUTO; use ssrDryNight/ssrDryDay for dry sheen`);
      continue;
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
if (!check) writeFileSync(LP, src.replace(re, "window.LightPresets = " + JSON.stringify(ordered, null, 2) + ";"));
const changes = presetChanges(shipped, ordered);
if (argv.includes("--json") || check) {
  console.log(JSON.stringify({ ok: true, mode: check ? "check" : "write", incoming: pairs.length, profiles: Object.keys(ordered).length, changes }, null, 2));
  process.exit(0);
}
console.log(`Merged ${pairs.length} incoming profile(s): ${wrote} written, ${knobs} knob(s).`);
console.log(`Shipped profiles now: ${Object.keys(ordered).length} (incl "*").`);
console.log("No cache bump needed — hashes are stamped at deploy (tags read ?v=dev).");
