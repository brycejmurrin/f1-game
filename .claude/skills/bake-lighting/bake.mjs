#!/usr/bin/env node
// Bake copied LIGHTING TUNER settings into js/light-presets.js and bump the
// cache version — the "apply" step of the in-game tuner's COPY VALUES export.
//
// Usage:
//   node .claude/skills/bake-lighting/bake.mjs <file>    # read the blob from a file
//   node .claude/skills/bake-lighting/bake.mjs - < blob  # read from stdin
//
// Accepts either the full `window.LightPresets = {…};` the panel exports, or a
// bare `{…}` object. The export is strict JSON; hand-edited JS object literals
// (unquoted keys) are tolerated via a fallback. Validates shape (keys are
// "track|tod|weather" or "*", values are {knobId:number}) before writing, then
// replaces the assignment in js/light-presets.js and increments ?v= across
// index.html + version.json. Does NOT commit — the skill drives review + push.
import { readFileSync, writeFileSync } from "node:fs";

const ROOT = new URL("../../../", import.meta.url).pathname;   // repo root

function readInput() {
  const arg = process.argv[2];
  if (arg && arg !== "-") return readFileSync(arg, "utf8");
  return readFileSync(0, "utf8");   // stdin
}

let raw = readInput().trim();
if (!raw) { console.error("No input. Pass a file path or pipe the copied settings on stdin."); process.exit(1); }
// Isolate the object literal from a full `window.LightPresets = {…};` assignment.
raw = raw.replace(/^\s*(window\.)?LightPresets\s*=\s*/, "").replace(/;\s*$/, "").trim();

let obj;
try {
  obj = JSON.parse(raw);
} catch (e) {
  try { obj = (0, eval)("(" + raw + ")"); }   // fallback: a JS object literal
  catch (e2) { console.error("Could not parse the preset object:", e.message); process.exit(1); }
}
if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
  console.error("Preset must be a JSON object keyed by \"track|tod|weather\"."); process.exit(1);
}
// Shape check: every value is a flat map of knob id -> finite number.
let nKnobs = 0;
for (const [k, v] of Object.entries(obj)) {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    console.error(`Profile "${k}" must be an object of {knobId: number}.`); process.exit(1);
  }
  for (const [id, val] of Object.entries(v)) {
    if (typeof val !== "number" || !isFinite(val)) {
      console.error(`Value for ${k}.${id} is not a finite number.`); process.exit(1);
    }
    nKnobs++;
  }
}

// Replace the assignment in js/light-presets.js, preserving the file header.
const lpPath = ROOT + "js/light-presets.js";
let src = readFileSync(lpPath, "utf8");
// Anchor to line-start so the real assignment is matched, NOT the
// `//   window.LightPresets = {…}` example inside the header comment (which is
// indented behind `//`). Multiline flag: `^window…` and the closing `^};`.
const re = /^window\.LightPresets\s*=\s*\{[\s\S]*?^\};/m;
if (!re.test(src)) { console.error("Could not find the window.LightPresets assignment in js/light-presets.js"); process.exit(1); }
src = src.replace(re, "window.LightPresets = " + JSON.stringify(obj, null, 2) + ";");
writeFileSync(lpPath, src);

// Bump ?v= across index.html + version.json (the no-build cache-bust convention).
const idxPath = ROOT + "index.html";
let idx = readFileSync(idxPath, "utf8");
const versions = [...idx.matchAll(/\?v=(\d+)/g)].map((m) => +m[1]);
if (!versions.length) { console.error("No ?v= found in index.html"); process.exit(1); }
const next = Math.max(...versions) + 1;
idx = idx.replace(/\?v=\d+/g, "?v=" + next);
writeFileSync(idxPath, idx);
writeFileSync(ROOT + "version.json", `{ "build": ${next} }\n`);

console.log(`Baked ${Object.keys(obj).length} profile(s) / ${nKnobs} value(s) into js/light-presets.js`);
console.log(`Cache bumped to ?v=${next} (index.html + version.json).`);
console.log("Next: review `git diff`, then commit + push (the bake-lighting skill drives this).");
