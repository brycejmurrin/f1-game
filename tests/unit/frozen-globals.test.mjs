// frozen-globals.test.mjs — every module surface that CAN be frozen IS.
//
// Every js/ file is a "use strict" IIFE assigning one global, and every module
// boundary is a convention (docs/notes/ARCHITECTURE-REVIEW.md §1). Freezing the
// returned object turns an accidental cross-module write into a TypeError at
// the offending line instead of silent state drift. Not every global qualifies:
// GLX takes a backend's descriptors at boot, the shader/circuit globals are
// multi-writer accumulators, a few modules mutate a named return object after
// creation, and the VM harnesses instrument Tracks and TrackGeom. tests/data/frozen-globals.json lists both sets; a new module
// with an object-literal return joins `frozen` (append `Object.freeze(X);`
// after the IIFE), one that must stay open is named in `mutable` with a reason
// in the commit.
//
// Run: node --test tests/unit/frozen-globals.test.mjs   (npm run test:tooling-fast)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/data/frozen-globals.json"), "utf8"));
const MANIFEST = await import(path.join(ROOT, "tools/manifest.cjs")).then((m) => m.default || m);

// Rosters are arrays or {group: [files]} objects; take every string either way.
const flat = (v) => Array.isArray(v) ? v.flatMap(flat) : (v && typeof v === "object") ? Object.values(v).flatMap(flat) : (typeof v === "string" ? [v] : []);
const allFiles = [...new Set(["FULL", "DEFERRED", "LAZY_AGENT", "LAZY_NET", "LAZY_DATA", "LAZY_RACE", "LAZY_SCENERY"].flatMap((k) => flat(MANIFEST[k])))]
  .filter((f) => f.startsWith("js/") && fs.existsSync(path.join(ROOT, f)));

const globalOf = (text) => {
  const m = text.match(/^const ([A-Z][A-Za-z0-9_]*) = \(function \(\) \{/m);
  return m ? m[1] : null;
};

test("every listed global's module ends with Object.freeze(<global>)", () => {
  const missing = [];
  const seen = new Set();
  for (const f of allFiles) {
    const text = fs.readFileSync(path.join(ROOT, f), "utf8");
    const g = globalOf(text);
    if (!g || !DATA.frozen.includes(g)) continue;
    seen.add(g);
    if (!new RegExp("\\}\\)\\(\\);\\s*Object\\.freeze\\(" + g + "\\);\\s*$").test(text)) missing.push(`${f} (${g})`);
  }
  assert.deepEqual(missing, [], "module lost its Object.freeze tail — a write to that surface is silent again");
  const unseen = DATA.frozen.filter((g) => !seen.has(g));
  assert.deepEqual(unseen, [], "frozen-globals.json names a global no manifest file defines");
});

test("the accumulator and descriptor-install targets are never frozen", () => {
  const frozen = [];
  for (const f of allFiles) {
    const text = fs.readFileSync(path.join(ROOT, f), "utf8");
    for (const g of DATA.mutable) if (new RegExp("Object\\.freeze\\(" + g + "\\)").test(text)) frozen.push(`${f}: ${g}`);
  }
  assert.deepEqual(frozen, [], "freezing one of these breaks boot (GLX takes backend descriptors; shaders/circuits accumulate)");
  assert.ok(DATA.mutable.includes("GLX") && DATA.mutable.includes("TrackDefs"));
});

test("a module with an object-literal return and no writers is either frozen or named mutable", () => {
  // The scanner's own rule, re-run here so a new qualifying module cannot land
  // unfrozen by omission. Writers are property assignments to the global from
  // any manifest file after creation.
  const sources = Object.fromEntries(allFiles.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));
  const unfrozen = [];
  for (const [f, text] of Object.entries(sources)) {
    const g = globalOf(text);
    if (!g || DATA.frozen.includes(g) || DATA.mutable.includes(g)) continue;
    if (!text.trimEnd().endsWith("})();")) continue;
    const body = text.slice(text.indexOf("(function () {"));
    const rets = [...body.matchAll(/\n  return ([^\n;]+)/g)];
    if (!rets.length || !rets[rets.length - 1][1].trim().startsWith("{")) continue;
    const writer = new RegExp("\\b" + g + "(\\.[\\w$]+|\\[[^\\]]+\\])\\s*=[^=]|Object\\.(assign|defineProperty|defineProperties)\\(\\s*" + g + "\\b");
    if (Object.values(sources).some((t) => writer.test(t))) continue;
    unfrozen.push(`${f} (${g})`);
  }
  assert.deepEqual(unfrozen, [], "qualifies for Object.freeze — append it and add the global to tests/data/frozen-globals.json");
});
