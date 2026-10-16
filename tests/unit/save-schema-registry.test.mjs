/* save-schema-registry.test.mjs — every apex26.* WRITE in js/ must resolve in
 * SaveSchemaRegistry (owner, schema version, validator). Settings rows come
 * from SettingsExport.SPEC via ingestSettingsSpec; the rest are EXACT/PREFIX in
 * js/core/save-schema-registry.js. Complements store-registry.test.mjs
 * (inventory ratchet) with an allowlist the store can enforce.
 *
 * Run: node --test tests/unit/save-schema-registry.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import * as espree from "espree";
import { seedSaveMigrate } from "../helpers/seed-save-migrate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const WRITE_OPS = new Set(["set", "write", "rawSet", "setItem"]);
const PREFIX_WRITES = [
  { prefix: "parts.", re: /["']parts\.["']\s*\+/ },
  { prefix: "livery.", re: /["']livery\.["']\s*\+/ },
  { prefix: "livery.custom.", re: /["']livery\.custom\.["']\s*\+/ },
  { prefix: "setup.", re: /["']setup\.["']\s*\+/ },
  { prefix: "ttlb.", re: /["']ttlb\.["']\s*\+/ },
  { prefix: "pitPlan.", re: /["']pitPlan\.["']\s*\+/ },
  { prefix: "setup.", re: /\bKEY\s*\+\s*teamId/ },
];

/** Files that only write keys already named in SPEC / PREFIX helpers. */
const PASSTHROUGH_FILES = new Set([
  "js/career/custom-team.js",   // identitySet/Get relays: keys are customTeam / livery.* below
  "js/car/custom-liveries.js",   // setIdentityValue relay for livery.* keys
  "js/career/restore-points.js",   // writes the captured slot key back, never a new one
  "js/ui/settings-export.js",
  "js/ui/scale.js",
  "js/ui/screen-looks.js",
  "js/ui/pause-opts.js",
  "js/ui/appearance-studio.js",
  "js/ui/key-binds.js",
  "js/ui/share-code.js",
  "js/input/steer-tuning.js",
  "js/perf/metrics-overlay.js",
  "js/audio/spotify.js",
  "js/camera/cockpit-opts.js",
  "js/career/career.js",
  "js/race/pit-lane.js",
]);

function walk(node, fn) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const n of node) walk(n, fn); return; }
  if (typeof node.type === "string") fn(node);
  for (const k of Object.keys(node)) {
    if (k === "type" || k === "loc" || k === "range" || k === "parent") continue;
    walk(node[k], fn);
  }
}

function loadRegistry() {
  const ctx = {
    console, Math, JSON, Object, Array, Number, String, Map, Set, isFinite,
    Teams: { LIST: [{ id: "haas", drivers: [{ code: "A" }, { code: "B" }] }] },
    Log: { warn() {}, info() {} },
  };
  vm.createContext(ctx);
  seedSaveMigrate(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/core/save-schema-registry.js"), "utf8"), ctx, { filename: "js/core/save-schema-registry.js" });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/ui/settings-export.js"), "utf8"), ctx, { filename: "js/ui/settings-export.js" });
  return vm.runInContext("SaveSchemaRegistry", ctx);
}

function jsFiles(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (!/^js\/circuits$|vendor|three\/lib/.test(p)) jsFiles(p, out);
    } else if (e.name.endsWith(".js") && !e.name.endsWith("presets.js")) out.push(p);
  }
  return out;
}

function scanStoreWrites(file) {
  const rel = file;
  const src = fs.readFileSync(path.join(ROOT, file), "utf8");
  const lines = src.split("\n");
  let ast;
  try { ast = espree.parse(src, { ecmaVersion: 2022, loc: true }); }
  catch (e) { throw new Error(`${file}: ${e.message}`); }

  const alias = new Map();
  walk(ast, (n) => {
    if (n.type !== "VariableDeclarator" || !n.id || n.id.type !== "Identifier") return;
    if (n.init && n.init.type === "Literal" && typeof n.init.value === "string") alias.set(n.id.name, n.init.value);
  });

  const sites = [];
  walk(ast, (n) => {
    if (n.type !== "CallExpression") return;
    const c = n.callee;
    if (!c || c.type !== "MemberExpression" || c.computed) return;
    const how = c.property && c.property.name;
    if (!WRITE_OPS.has(how)) return;
    const obj = c.object;
    const onLs = obj && obj.type === "Identifier" && obj.name === "localStorage";
    const onStore = obj && (
      (obj.type === "Identifier" && obj.name === "store")
      || (obj.type === "MemberExpression" && !obj.computed && obj.property
        && (obj.property.name === "store"
          || (obj.object && obj.object.type === "Identifier" && obj.object.name === "GameStore" && obj.property.name === "store"))));
    if (!onLs && !onStore) return;
    const kNode = n.arguments && n.arguments[0];
    if (!kNode) return;
    let key = null;
    if (kNode.type === "Literal" && typeof kNode.value === "string") {
      key = kNode.value.replace(/^apex26\./, "");
    } else if (kNode.type === "Identifier" && alias.has(kNode.name)) {
      key = alias.get(kNode.name).replace(/^apex26\./, "");
    } else if (kNode.type === "TemplateLiteral" && kNode.expressions.length === 1
      && kNode.quasis.length === 2 && kNode.quasis[0].value.cooked === "apex26."
      && kNode.expressions[0].type === "Identifier" && alias.has(kNode.expressions[0].name)) {
      key = alias.get(kNode.expressions[0].name);
    }
    const line = kNode.loc ? kNode.loc.start.line : 0;
    if (key) sites.push({ file: rel, line, key, kind: onLs ? "ls" : "store" });
    else if (onStore) sites.push({ file: rel, line, key: null, kind: "dynamic", text: lines[line - 1] || "" });
    else if (onLs && kNode.type === "Literal") sites.push({ file: rel, line, key: String(kNode.value).replace(/^apex26\./, ""), kind: "ls" });
  });
  return sites;
}

function dynamicCovered(text) {
  for (const p of PREFIX_WRITES) if (p.re.test(text)) return p.prefix + "*";
  return null;
}

test("SettingsExport.SPEC rows are registered after ingest", () => {
  const R = loadRegistry();
  assert.ok(R.settingsSpec && R.settingsSpec.length > 100);
  for (const row of R.settingsSpec) {
    const e = R.resolve(row.k);
    assert.ok(e, `SPEC key ${row.k} missing from SaveSchemaRegistry`);
    assert.equal(e.lane, row.lane, `${row.k}: lane mismatch`);
  }
});

test("every store/localStorage write in js/ resolves in the manifest", () => {
  const R = loadRegistry();
  const bad = [];
  for (const f of jsFiles("js")) {
    for (const site of scanStoreWrites(f)) {
      if (PASSTHROUGH_FILES.has(site.file)) continue;
      if (site.key) {
        if (!R.resolve(site.key)) bad.push(`${site.file}:${site.line} apex26.${site.key}`);
        continue;
      }
      const hint = dynamicCovered(site.text);
      if (hint) continue;
      if (/slotKey\s*\(/.test(site.text)) continue;
      bad.push(`${site.file}:${site.line} dynamic write (add PREFIX or literal key): ${site.text.trim()}`);
    }
  }
  assert.deepEqual(bad, [], `unregistered write site(s):\n${bad.join("\n")}`);
});

test("career validator rejects non-objects and accepts a minimal save", () => {
  const R = loadRegistry();
  assert.equal(R.validateKey("career.driver.0", null, "json"), true);
  assert.equal(R.validateKey("career.driver.0", { flavour: "driver", team: "haas", money: 1 }, "json"), true);
  assert.equal(R.validateKey("career.driver.0", [], "json"), false);
});

test("SaveMigrate.validateCareerSave matches registry career slots", () => {
  const ctx = vm.createContext({ Math, JSON, Object, Array, Number, String, console,
    Teams: { LIST: [{ id: "haas", drivers: [{ code: "A" }, { code: "B" }] }] },
    Log: { warn() {}, info() {} } });
  seedSaveMigrate(ctx);
  const SM = vm.runInContext("SaveMigrate", ctx);
  assert.equal(SM.validateCareerSave({ flavour: "driver", team: "haas", money: 10 }), true);
  assert.equal(SM.validateCareerSave("nope"), false);
});
