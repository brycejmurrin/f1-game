#!/usr/bin/env node
// Bake copied LIGHTING TUNER settings into js/lighting/presets.js (no cache
// bump) — the "apply" step of the in-game tuner's COPY VALUES export.
//
// Usage:
//   node .claude/skills/lighting-tuner/scripts/bake.mjs <file>    # read the blob from a file
//   node .claude/skills/lighting-tuner/scripts/bake.mjs - < blob  # read from stdin
//
// Accepts either the full `window.LightPresets = {…};` the panel exports, or a
// bare `{…}` object. The export is strict JSON; hand-edited JS object literals
// (unquoted keys) are tolerated via a fallback. Validates shape (keys are
// "track|tod|weather" or "*", values are {knobId:number}) before writing, then
// replaces the assignment in js/lighting/presets.js. It does NOT touch the
// shell: committed tags stay ?v=dev and the deploy stamps hashes (see the tail
// of this file). Does NOT commit — the skill drives review + push.
import vm from "node:vm";
import { validatePresets, presetChanges } from "../../../../tools/lighting/preset-validation.mjs";
import { readFileSync, writeFileSync } from "node:fs";

const ROOT = new URL("../../../../", import.meta.url).pathname;   // repo root

const argv = process.argv.slice(2);
const unknown = argv.find((a) => a.startsWith("--") && !["--check", "--dry-run", "--json", "--help"].includes(a));
if (unknown) { console.error(`Unknown option: ${unknown}`); process.exit(1); }
if (argv.includes("--help")) { console.log("Usage: bake.mjs [file | -] [--check | --dry-run] [--json] (full LightPresets snapshot)"); process.exit(0); }
const inputs = argv.filter((a) => !a.startsWith("--"));
if (inputs.length > 1) { console.error("Expected at most one input file"); process.exit(1); }
const check = argv.includes("--check") || argv.includes("--dry-run");
function readInput() {
  const arg = inputs[0];
  if (arg && arg !== "-") return readFileSync(arg, "utf8");
  return readFileSync(0, "utf8");   // stdin
}

let raw = readInput().trim();
if (!raw) { console.error("No input. Pass a file path or pipe the copied settings on stdin."); process.exit(1); }
// A DELTA IS NOT A SNAPSHOT, AND THIS TOOL IS A FULL REPLACE. The LIGHTING
// TUNER's COPY VALUES button exports only the player's own overrides now, as
// `window.LightEdits = {…}` — a handful of conditions where the shipped file
// has 800. Baking that would write those few and DELETE every other profile in
// the file, silently, which is the exact failure the skill's CRITICAL note
// warns about. The distinct name exists so the tool can refuse instead of
// relying on whoever is pasting to notice.
if (/^\s*(window\.)?LightEdits\s*=/.test(raw)) {
  console.error("This is a window.LightEdits DELTA (the tuner's COPY VALUES export), not a full\n" +
    "window.LightPresets snapshot. bake.mjs REPLACES the whole literal, so baking a delta\n" +
    "would delete every profile it does not mention. Merge it instead:\n\n" +
    "  node .claude/skills/lighting-tuner/scripts/merge-proposals.mjs <this file>\n");
  process.exit(1);
}
// Isolate the object literal from a full `window.LightPresets = {…};` assignment.
raw = raw.replace(/^\s*(window\.)?LightPresets\s*=\s*/, "").replace(/;\s*$/, "").trim();

let obj;
try {
  obj = JSON.parse(raw);
} catch (e) {
  try { obj = vm.runInNewContext("(" + raw + ")", {}, { timeout: 1000 }); }   // fallback: a JS object literal
  catch (e2) { console.error("Could not parse the preset object:", e.message); process.exit(1); }
}
if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
  console.error("Preset must be a JSON object keyed by \"track|tod|weather\"."); process.exit(1);
}
const errors = validatePresets(obj);
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }

// Replace the assignment in js/lighting/presets.js, preserving the file header.
const lpPath = ROOT + "js/lighting/presets.js";
let src = readFileSync(lpPath, "utf8");
// Anchor to line-start so the real assignment is matched, NOT the
// `//   window.LightPresets = {…}` example inside the header comment (which is
// indented behind `//`). Multiline flag: `^window…` and the closing `^};`.
const re = /^window\.LightPresets\s*=\s*\{[\s\S]*?^\};/m;
const oldMatch = src.match(re);
if (!oldMatch) { console.error("Could not find the window.LightPresets assignment in js/lighting/presets.js"); process.exit(1); }

// This REPLACES the whole file, not a merge — the in-game COPY VALUES export is
// always the full file+local merge, so a legitimate paste should not usually
// carry far fewer profiles than what already shipped. Best-effort shrink
// detector: warn, but never block, since a real reset/pruning export is valid.
let changes;
try {
  const oldLiteral = oldMatch[0].replace(/^window\.LightPresets\s*=\s*/, "").replace(/;\s*$/, "");
  const oldObj = JSON.parse(oldLiteral);
  changes = presetChanges(oldObj, obj);
  const oldKeys = Object.keys(oldObj).length;
  const newKeys = Object.keys(obj).length;
  if (oldKeys > 0 && newKeys < oldKeys / 2) {
    console.error(`WARNING: this blob has ${newKeys} profile(s) vs ${oldKeys} already in js/lighting/presets.js.`);
    console.error("bake.mjs does a FULL replace, not a merge — if this was meant to be a");
    console.error("one-key update, STOP: COPY VALUES exports a LightEdits delta; use merge-proposals.mjs.");
    console.error("For a full replace, provide the complete LightPresets snapshot:");
    console.error('  read js/lighting/presets.js, Object.assign the one key into the parsed');
    console.error("  object, JSON.stringify it back into the window.LightPresets = ...; literal.");
    console.error("Writing anyway (this tool never blocks) — review `git diff` before committing.");
  }
} catch { /* best-effort only; a parse failure here is not a reason to block the bake */ }

src = src.replace(re, "window.LightPresets = " + JSON.stringify(obj, null, 2) + ";");
if (!check) writeFileSync(lpPath, src);
if (argv.includes("--json")) {
  console.log(JSON.stringify({ ok: true, mode: check ? "check" : "write", profiles: Object.keys(obj).length, changes }));
  process.exit(0);
}
if (check) { console.log(JSON.stringify({ ok: true, mode: "check", changes }, null, 2)); process.exit(0); }

// Committed shell tags stay ?v=dev; deploy stamps hashes. Do not rewrite
// index.html / version.json here.
console.log("Shell tags stay ?v=dev (no numeric bump).");
console.log("Next: review `git diff`, then commit + push (the lighting-tuner skill drives this).");
