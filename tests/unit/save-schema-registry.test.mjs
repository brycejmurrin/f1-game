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
import * as espree from "espree";
import { seedSaveMigrate } from "../helpers/seed-save-migrate.mjs";
import { ROOT, jsFiles, walk, storageReceiver } from "../helpers/store-key-scan.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const WRITE_OPS = new Set(["set", "write", "rawSet", "setItem", "remove", "removeItem"]);   // removes count: a stale or unregistered key is dropped or migrated by name
const PREFIX_WRITES = [
  { prefix: "parts.", re: /["']parts\.["']\s*\+/ },
  { prefix: "livery.", re: /["']livery\.["']\s*\+/ },
  { prefix: "livery.custom.", re: /["']livery\.custom\.["']\s*\+/ },
  { prefix: "setup.", re: /["']setup\.["']\s*\+/ },
  { prefix: "setupPresets.", re: /\bkey\s*\(\s*team\s*\)/ },
  { prefix: "ttlb.", re: /["']ttlb\.["']\s*\+/ },
  { prefix: "pitPlan.", re: /["']pitPlan\.["']\s*\+/ },
  { prefix: "setup.", re: /\bKEY\s*\+\s*teamId/ },
];

/** Literal keys READ but deliberately unregistered, by file: hand-set dev / A-B flags with no writer
 *  (store-registry.test.mjs WRITERLESS) and one latch whose writer lives in another file. */
const READ_EXEMPT = new Map([
  ["js/camera/cockpit-opts.js", new Set(["cockpitTurnChase"])],   // hand-set reload-only camera A/B flag
  ["js/car/car-draw.js", new Set(["mirrorBodyLod"])],   // hand-set reload-only mirror body LOD experiment; see docs/DEBUG-HOOKS.md
  ["js/car/car-mesh.js", new Set(["aeroEdge"])],   // hand-set aero-edge mesh toggle, default off
  ["js/game.js", new Set(["tlxWarmBeforePack"])],   // hunt 5 A kill switch, set by hand
  ["js/render/renderer-boot.js", new Set(["gfxBootStepMs"])],   // slow-CI boot step cap, set by specs
  ["js/render/three/tlx.js", new Set(["tlxFixedTargets", "tlxPackAsync"])],   // hand-set TLX A/B kill switches
  ["js/xr/xr-opts.js", new Set(["xrCaps"])],   // latch written by js/xr/apex-xr.js (LS_CAPS const, not a literal there)
]);
const READ_OPS = new Set(["get", "getItem", "raw"]);   // M1-17: a read of a key the registry cannot resolve is a typo or an orphan

/** Files whose DYNAMIC-key writes relay keys named elsewhere (SPEC / PREFIX helpers).
 *  Literal keys in these files are still checked. */
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
  "js/perf/phone-recorder.js",
  "js/audio/spotify.js",
  "js/camera/cockpit-opts.js",
  "js/career/career.js",
  "js/race/pit-lane.js",
]);

/** The only literal keys deliberately unregistered, by file. */
const LITERAL_EXEMPT = new Map([
  ["js/car/ghost.js", new Set(["apex_ghost_v1"])],   // legacy key, only ever read and removed after migration to the registered ghost store
  ["js/perf/phone-recorder.js", new Set(["phoneRec"])],   // transient soak-run scratch blob, kept out of export/backup on purpose
]);

function loadRegistry() {
  const ctx = {
    console, Math, JSON, Object, Array, Number, String, Map, Set, isFinite,
    Teams: { LIST: [{ id: "haas", drivers: [{ code: "A" }, { code: "B" }] }] },
    Log: { warn() {}, info() {} },
  };
  vm.createContext(ctx);
  seedSaveMigrate(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/core/save-schema-registry.js"), "utf8"), ctx, { filename: absSrc("js/core/save-schema-registry.js") });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/ui/settings-export.js"), "utf8"), ctx, { filename: absSrc("js/ui/settings-export.js") });
  return vm.runInContext("SaveSchemaRegistry", ctx);
}

function scanStoreCalls(file, ops) {
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
    if (!ops.has(how)) return;
    const recv = storageReceiver(c.object);
    const onLs = recv === "ls", onStore = recv === "store";
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

const scanStoreWrites = (file) => scanStoreCalls(file, WRITE_OPS);
/** Reads with a literal / const-alias key; a dynamic read key is never a finding (see PASSTHROUGH_FILES). */
const scanStoreReads = (file) => scanStoreCalls(file, READ_OPS).filter((x) => x.key);

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
      // A passthrough file may relay a DYNAMIC key (resolved by its caller); a
      // LITERAL apex26.* key written there must still resolve (review M1-17).
      if (PASSTHROUGH_FILES.has(site.file) && !site.key) continue;
      if (site.key) {
        if (LITERAL_EXEMPT.get(site.file)?.has(site.key)) continue;
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

test("every literal store/localStorage READ in js/ resolves in the manifest (M1-17)", () => {
  const R = loadRegistry();
  const bad = [];
  let seen = 0;
  for (const f of jsFiles("js")) for (const site of scanStoreReads(f)) {
    seen++;
    if (LITERAL_EXEMPT.get(site.file)?.has(site.key) || READ_EXEMPT.get(site.file)?.has(site.key)) continue;
    if (!R.resolve(site.key)) bad.push(`${site.file}:${site.line} apex26.${site.key}`);
  }
  assert.ok(seen > 100, `only ${seen} literal reads scanned — the read scan has stopped seeing the store`);
  assert.deepEqual(bad, [], `read of unregistered key(s):\n${bad.join("\n")}`);
});

test("the read scan sees literal and aliased reads and ignores writes and dynamic keys (positive control)", async () => {
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "ssr-"));
  try {
    const rel = path.relative(ROOT, path.join(dir, "probe.js"));
    fs.writeFileSync(path.join(ROOT, rel), [
      'const K = "apex26.aliasRead";',
      'store.get("litRead", 1); G.store.raw("rawRead"); localStorage.getItem("apex26.lsRead"); localStorage.getItem(K);',
      'store.set("writeOnly", 1); store.get(dyn); other.get("notStore");',
    ].join("\n"));
    assert.deepEqual(scanStoreReads(rel).map((x) => x.key).sort(), ["aliasRead", "litRead", "lsRead", "rawRead"]);
    assert.deepEqual(scanStoreWrites(rel).map((x) => x.key), ["writeOnly"]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
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

test("setupPresets.<team> resolves (garage named sheets; review F1)", () => {
  const R = loadRegistry();
  const e = R.resolve("setupPresets.mercedes");
  assert.ok(e, "setupPresets.mercedes must resolve");
  assert.equal(e.owner, "js/garage/setup-presets.js");
  assert.equal(e.lane, "json");
  R.strict = true;
  assert.doesNotThrow(() => R.noteWrite("setupPresets.haas", "json"));
});

test("the automatic UI flags (designerCoached, camComfortPref) are registered, typed, and device-local (#2320)", () => {
  const R = loadRegistry();
  R.strict = true;   // an unregistered write would throw
  for (const k of ["designerCoached", "camComfortPref"]) assert.doesNotThrow(() => R.noteWrite("apex26." + k), k);
  assert.equal(R.resolve("designerCoached").lane, "json");
  assert.equal(R.resolve("camComfortPref").lane, "raw");
  assert.ok(R.validateKey("designerCoached", true) && !R.validateKey("designerCoached", "yes"));
  assert.ok(R.validateKey("camComfortPref", "on") && R.validateKey("camComfortPref", "off") && !R.validateKey("camComfortPref", "maybe"));
  // Device-derived / tutorial state stays out of settings backups.
  const exported = new Set(R.settingsSpec.map((row) => row.k));
  assert.ok(!exported.has("designerCoached") && !exported.has("camComfortPref"));
  // Unknown-key detection is not weakened.
  assert.throws(() => R.noteWrite("apex26.designerCoachedTypo"), /unregistered save key/);
});
