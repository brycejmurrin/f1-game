/* save-sections-6602.test.mjs — #6602 phase 3: every SaveSchemaRegistry row has a
 * `section`, and the key families derived from it (SaveHealth's category, the store
 * mirror's career/authored class, the one-writer career lock) deep-equal the regexes
 * those three callers carried before phase 3, on EVERY registry key: EXACT rows, the
 * ingested SettingsExport.SPEC rows, examples of every PREFIX row and the keys Bryce's
 * live settings files hold. Behaviour is unchanged; the mirror set is pinned.
 *
 * Run: node --test tests/unit/save-sections-6602.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { seedSaveMigrate } from "../helpers/seed-save-migrate.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const src = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const run = (ctx, f, tail = "") => vm.runInContext(src(f) + tail, ctx, { filename: absSrc(f) });

// The pre-#6602 rules, copied verbatim at ccac4113 from SaveHealth's category() and store.js's
// careerKey, MIRROR_KEY and AUTHORED_KEY. They are the oracle; nothing in js/ may read them from here.
const OLD = {
  health(key) {
    if (["apex26.api.", "apex26.realrace."].some((p) => key.startsWith(p))) return "Downloaded response caches";
    if (/^apex26\.career/.test(key)) return "Career saves";
    if (/^apex26\.season/.test(key)) return "Season saves";
    if (/^apex26\.(customTeam|customLogo|parts\.|setup\.|setupPresets\.|livery\.)/.test(key)) return "Garage work";
    if (/^apex26\.(ghost|inputGhost|ttlb\.)/.test(key)) return "Laps and ghosts";
    if (/^apex26\.(customTracks|customTrackDraft(?:Prev)?|trackDesigner|tracks\.)/.test(key)) return "Authored circuits";
    return "Other settings and data";
  },
  career: /^apex26\.(career|season)/,
  authored: /^apex26\.(?:customTeam|customLogo|(?:parts|setup|setupPresets)\.[A-Za-z0-9_-]{1,64}|livery\.(?:custom\.)?[A-Za-z0-9_-]{1,64})$/,
  lock: /^apex26\.career/,
};
function oracle(short) {
  const k = "apex26." + short;
  return { health: OLD.health(k), mirror: OLD.career.test(k) ? "career" : OLD.authored.test(k) ? "authored" : null, writerLock: OLD.lock.test(k) };
}

// At least one example per PREFIX row (a new PREFIX row fails until it gets one), plus
// shapes the authored mirror refuses (a space, an over-64 id) to pin the bounded-id gate.
const LONG = "x".repeat(65);
const PREFIX_EXAMPLES = [
  "parts.mercedes", "parts.a b", "parts." + LONG, "livery.ferrari", "livery.custom.ferrari", "livery.custom." + LONG, "livery.a.b.c",
  "setup.haas", "setup.bad key", "careerSetup.driver.0.haas", "careerSetup.myteam.2.custom_1", "setupPresets.haas", "setupPresets." + LONG,
  "ttlb.cota", "career.driver.0", "career.myteam.2", "api.jolpica.2026", "realrace.monza", "ghost.v1", "ghost.monza",
  "pitPlan.monza", "spotify.token", "cockpitWheelFinish", "cockpitBodyFinish", "cockpitHaloFinish",
];

// Keys no registry row knows (another build's, or retired): each caller keeps the legacy answer.
const UNKNOWN = ["trackDesigner", "tracks.cota", "careerArchive", "career.driver.9", "seasonOld", "careerSetup.driver.0.bad id",
  "ghost2", "inputGhostOld", "customTrackDraftX", "zzUnknown", "api", "realraceX"];

function registryCtx() {
  const ctx = vm.createContext({ console, Math, JSON, Object, Array, Number, String, Map, Set, isFinite, RegExp,
    Teams: { LIST: [] }, Log: { warn() {}, info() {} } });
  seedSaveMigrate(ctx);
  run(ctx, "js/core/save-schema-registry.js");
  run(ctx, "js/ui/settings-export.js");
  return ctx;
}

function fixtureKeys(R) {
  const keys = new Set();
  for (const f of fs.readdirSync(path.join(ROOT, "tests/data")).filter((n) => /^settings-live-export-.*\.json$/.test(n))) {
    const file = JSON.parse(src("tests/data/" + f));
    for (const row of R.settingsSpec) {
      const group = file.settings && file.settings[row.group];
      if (group && Object.prototype.hasOwnProperty.call(group, row.name)) keys.add(row.k);
    }
    for (const id of Object.keys(file.ttlb || {})) keys.add("ttlb." + id);
    const progress = file.progress || {};
    const MAP = { seasonCfg: "seasonCfg", circuitMastery: "circuitMastery", ghosts: "ghost.v1", onboarded: "onboarded",
      onboardRaces: "onboardRaces", pitTaught: "pitTaught", circuits: "customTracks" };
    for (const name of Object.keys(progress)) { assert.ok(MAP[name], `fixture ${f}: progress.${name} mapped to a key`); keys.add(MAP[name]); }
  }
  return keys;
}

function allKeys(R) {
  const specKeys = R.settingsSpec.map((r) => r.k);
  const sources = R.prefixSources();
  for (const s of sources) {
    const re = new RegExp(s);
    assert.ok(PREFIX_EXAMPLES.some((k) => re.test(k)), `PREFIX /${s}/ has an example key`);
  }
  return [...new Set([...R.exactKeys(), ...specKeys, ...PREFIX_EXAMPLES, ...fixtureKeys(R)])];
}

test("every registry row has a known section, and every SECTIONS entry has a version", () => {
  const ctx = registryCtx(), R = vm.runInContext("SaveSchemaRegistry", ctx);
  assert.deepEqual(Object.keys(R.SECTIONS).sort(), ["cache", "career", "device", "garage", "progress", "settings"]);
  assert.ok(Object.isFrozen(R.SECTIONS) && Object.isFrozen(R), "registry and SECTIONS stay frozen");
  assert.equal(R.SECTIONS.career.v, vm.runInContext("SaveMigrate.CAREER_V", ctx), "career section v = SaveMigrate.CAREER_V");
  for (const k of allKeys(R)) {
    const e = R.resolve(k);
    if (!e) continue;   // an off-shape prefix example no row resolves (checked below)
    assert.ok(Object.prototype.hasOwnProperty.call(R.SECTIONS, e.section), `${k}: section ${e.section}`);
  }
  for (const row of R.settingsSpec) assert.equal(R.family(row.k).section, "settings", `SPEC ${row.k} is in settings`);
  assert.equal(R.family("bridgeToken").section, "device", "a device-only credential is in device");
});

test("registry families deep-equal the pre-#6602 regexes on every registry and fixture key", () => {
  const R = vm.runInContext("SaveSchemaRegistry", registryCtx());
  const keys = allKeys(R);
  assert.ok(keys.length > 400, `${keys.length} keys checked`);
  for (const k of keys) {
    const f = R.family(k);
    if (!f) { assert.ok(!R.resolve(k), k); continue; }
    assert.deepEqual({ health: f.health, mirror: f.mirror, writerLock: f.writerLock }, oracle(k), k);
    assert.deepEqual(R.family("apex26." + k), f, `${k}: full and short keys agree`);
  }
});

test("SaveHealth categories equal the pre-#6602 regexes on every registry key and unknown keys", async () => {
  const ctx = registryCtx();
  run(ctx, "js/ui/save-health.js", ";globalThis.Health=SaveHealth");
  const R = vm.runInContext("SaveSchemaRegistry", ctx);
  for (const k of [...allKeys(R), ...UNKNOWN]) {
    const full = "apex26." + k, disk = { length: 1, key: () => full, getItem: () => "1" };
    const r = await ctx.Health.inspect({ localStorage: disk, storage: {}, restorePoints: {} });
    assert.equal(r.categories.length, 1, k);
    assert.equal(r.categories[0].name, oracle(k).health, k);
  }
});

function storeCtx(withRegistry) {
  const ctx = withRegistry ? registryCtx() : vm.createContext({ console, Math, JSON, Object, Array, Number, String, Map, Set, isFinite,
    Teams: { LIST: [] }, Log: { warn() {}, info() {} } });
  if (!withRegistry) seedSaveMigrate(ctx);
  Object.assign(ctx, { setTimeout, clearTimeout, Promise, window: { addEventListener() {} },
    localStorage: { length: 0, key: () => null, getItem: () => null, setItem() {}, removeItem() {} } });
  run(ctx, "js/core/store.js", ";globalThis.store=GameStore.store");
  return ctx;
}

test("the store mirror set and career writer lock equal the pre-#6602 regexes", () => {
  const R = vm.runInContext("SaveSchemaRegistry", registryCtx());
  for (const k of UNKNOWN) assert.equal(R.family(k), null, `${k} is unknown to the registry`);
  const keys = [...allKeys(R), ...UNKNOWN];
  for (const withRegistry of [true, false]) {
    const { store } = storeCtx(withRegistry);
    for (const k of keys) {
      const o = oracle(k), tag = `${k} (${withRegistry ? "registry" : "bare VM"})`;
      assert.equal(store.mirrorPolicy.includes(k), o.mirror !== null, `mirror ${tag}`);
      assert.equal(store.mirrorPolicy.authored(k), o.mirror === "authored", `authored ${tag}`);
      assert.equal(store.mirrorPolicy.writerLocked(k), o.writerLock, `lock ${tag}`);
    }
  }
});

test("callers follow family(): a key the registry places is grouped, mirrored and locked by it", async () => {
  const fam = { section: "progress", health: "Probe group", mirror: "authored", writerLock: true };
  const ctx = vm.createContext({ console, Math, JSON, Object, Array, Number, String, Map, Set, isFinite,
    Teams: { LIST: [] }, Log: { warn() {}, info() {} },
    SaveSchemaRegistry: { family: (k) => (String(k).replace(/^apex26\./, "") === "probeKey" ? fam : null), noteWrite() {} } });
  seedSaveMigrate(ctx);
  Object.assign(ctx, { setTimeout, clearTimeout, Promise, window: { addEventListener() {} },
    localStorage: { length: 0, key: () => null, getItem: () => null, setItem() {}, removeItem() {} } });
  run(ctx, "js/core/store.js", ";globalThis.store=GameStore.store");
  run(ctx, "js/ui/save-health.js", ";globalThis.Health=SaveHealth");
  assert.equal(ctx.store.mirrorPolicy.includes("probeKey"), true);
  assert.equal(ctx.store.mirrorPolicy.authored("probeKey"), true);
  assert.equal(ctx.store.mirrorPolicy.writerLocked("probeKey"), true);
  const disk = { length: 1, key: () => "apex26.probeKey", getItem: () => "1" };
  const r = await ctx.Health.inspect({ localStorage: disk, storage: {}, restorePoints: {} });
  assert.equal(r.categories[0].name, "Probe group");
  // A key no row knows keeps the legacy prefix rule in the store (another build's career key).
  assert.equal(ctx.store.mirrorPolicy.includes("career.driver.9"), true);
  assert.equal(ctx.store.mirrorPolicy.writerLocked("career.driver.9"), true);
});
