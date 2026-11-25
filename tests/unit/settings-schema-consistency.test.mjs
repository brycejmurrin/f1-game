/* settings-schema-consistency — #6545 P1: a characterization pin of where the
 * settings lists disagree TODAY.
 *
 * SettingsExport.SPEC (js/ui/settings-export.js) is the allowlist that export,
 * import and reset loop over. Four more lists mirror it by hand, and nothing
 * reconciles them:
 *   - SettingsDefaults DEF (js/data/settings-defaults.js), the storage-miss defaults;
 *   - SettingsSearch.CATALOG (js/ui/settings-search.js), search rows keyed by DOM id;
 *   - the RESET_* key sets (js/ui/settings-export-body.js);
 *   - SaveSchemaRegistry EXACT rows (js/core/save-schema-registry.js) that name a SPEC key;
 * plus call-site literal defaults (`store.get("k", literal)`) for SPEC keys that
 * SettingsDefaults and GarageDefaults do not answer.
 *
 * The test computes every disagreement and compares the whole report to
 * tests/data/settings-schema-drift.json. It changes no behaviour: a later #6545
 * phase that fixes a drift (or a change that adds one) edits that file in the
 * same PR, so each drift is a reviewed line in a diff, never a silent one.
 *
 * Run: node --test tests/unit/settings-schema-consistency.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import cp from "node:child_process";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const DRIFT = JSON.parse(read("tests/data/settings-schema-drift.json"));

function loadLists() {
  const ctx = vm.createContext({ console });
  for (const rel of ["js/core/save-schema-registry.js", "js/data/settings-defaults.js", "js/data/garage-defaults.js",
    "js/ui/settings-export.js", "js/ui/settings-search.js"]) {
    vm.runInContext(read(rel), ctx, { filename: absSrc(rel) });
  }
  const get = (expr) => vm.runInContext(expr, ctx, { filename: absSrc("tests/unit/settings-schema-consistency.test.mjs") });
  return { spec: get("SettingsExport.SPEC"), defaults: get("SettingsDefaults"), garage: get("GarageDefaults"), catalog: get("SettingsSearch.CATALOG") };
}

/** RESET_* sets are module-private in settings-export-body.js: read them from source. */
function resetSets() {
  const out = {};
  for (const m of read("js/ui/settings-export-body.js").matchAll(/const (RESET_[A-Z_]+) = new Set\(([^;]+)\);/g)) {
    const split = m[2].match(/^"([^"]*)"\.split\(" "\)$/);
    out[m[1]] = split ? split[1].split(" ") : JSON.parse(m[2]);
  }
  return out;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sortBy = (rows, key) => rows.sort((a, b) => key(a).localeCompare(key(b)));

function report() {
  const { spec, defaults, garage, catalog } = loadLists();
  const byKey = new Map(spec.map((r) => [r.k, r]));

  const defaultsNotInSpec = defaults.keys().filter((k) => !byKey.has(k)).sort();
  const defaultsDefMismatch = defaults.keys().filter((k) => byKey.has(k) && !same(byKey.get(k).def, defaults.get(k)))
    .map((k) => ({ key: k, settingsDefaults: defaults.get(k), spec: byKey.get(k).def }));
  // The raw lane stores bare strings: a raw SPEC key's shipped default must be a string.
  const defaultsRawNotString = defaults.keys().filter((k) => byKey.get(k)?.lane === "raw" && typeof defaults.get(k) !== "string").sort();

  const htmlIds = new Set([...read("index.html").matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const jsFiles = cp.execFileSync("git", ["ls-files", "js"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter((f) => f.endsWith(".js"));
  const jsText = jsFiles.map((f) => [f, read(f)]);
  const builtIn = (id) => jsText.filter(([, t]) => [`"${id}"`, `'${id}'`, `#${id}`].some((s) => t.includes(s))).map(([f]) => f);
  const catalogTargetsBuiltByJs = [], catalogTargetsMissing = [];
  for (const row of catalog) {
    if (htmlIds.has(row.target)) continue;
    const files = builtIn(row.target);
    (files.length ? catalogTargetsBuiltByJs : catalogTargetsMissing).push({ id: row.id, target: row.target });
  }

  const resetKeysNotInSpec = {};
  for (const [name, keys] of Object.entries(resetSets())) resetKeysNotInSpec[name] = keys.filter((k) => !byKey.has(k));

  // A SPEC key is ingested ahead of EXACT, so an EXACT row naming one is shadowed.
  const registryExactShadowedBySpec = [];
  for (const m of read("js/core/save-schema-registry.js").matchAll(/^\s*"([\w.]+)": entry\("[^"]*", "(json|raw)"/gm)) {
    if (byKey.has(m[1])) registryExactShadowedBySpec.push({ key: m[1], exactLane: m[2], specLane: byKey.get(m[1]).lane });
  }
  sortBy(registryExactShadowedBySpec, (r) => r.key);

  // GameStore answers SettingsDefaults, then GarageDefaults, then the call-site
  // literal: only a key neither table holds reaches the literal. null literals
  // mean "absent, handled downstream" and are not recorded.
  const callSiteDefaultMismatch = [];
  const CALL = /\b(?:store|GameStore|S|st)\.(?:get|raw|rawGet)\(\s*"(\w+)"\s*,\s*("[^"]*"|-?\d+(?:\.\d+)?|true|false)\s*\)/g;
  for (const [file, text] of jsText) {
    for (const m of text.matchAll(CALL)) {
      const row = byKey.get(m[1]);
      if (!row || defaults.has(m[1]) || garage.has(m[1])) continue;
      const literal = JSON.parse(m[2]);
      if (same(literal, row.def) || (row.lane === "raw" && String(literal) === String(row.def))) continue;
      callSiteDefaultMismatch.push({ file, key: m[1], literal, spec: row.def === undefined ? "(undefined)" : row.def });
    }
  }
  sortBy(callSiteDefaultMismatch, (r) => r.file + " " + r.key + " " + JSON.stringify(r.literal));

  return { defaultsNotInSpec, defaultsDefMismatch, defaultsRawNotString, catalogTargetsMissing, catalogTargetsBuiltByJs,
    resetKeysNotInSpec, registryExactShadowedBySpec, callSiteDefaultMismatch };
}

test("settings lists agree with SPEC except for the recorded drift (tests/data/settings-schema-drift.json)", () => {
  const { "//": _note, ...recorded } = DRIFT;
  // JSON round-trip: vm-realm arrays carry another realm's prototype, which deepStrictEqual compares.
  assert.deepEqual(JSON.parse(JSON.stringify(report())), recorded,
    "a settings list drifted from SettingsExport.SPEC, or a recorded drift was fixed: update tests/data/settings-schema-drift.json in this PR (#6545)");
});
