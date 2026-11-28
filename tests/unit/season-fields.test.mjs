/* season-fields.test.mjs — SaveMigrate.SEASON_FIELDS / SEASON_CONFIG (#7337):
 * the season object's one field table, from which CareerBackup derives its
 * recovery allowlist, its cleaner and its config option sets.
 *
 *   (a) every field name a js/ write site assigns (or deletes) on a season
 *       object is a SEASON_FIELDS row, so a new field cannot be dropped silently
 *   (b) a fully populated standalone season keeps every backup:true field
 *       through cleanSeason (apply), recoveryEnvelope -> validate, and
 *       SeasonCal.resume
 *   (c) every SEASON_CONFIG option set is exactly what SeasonCal.normalize
 *       accepts, and SeasonCal's LAP_OPTS / DROP_OPTS read from it
 *
 * Run: node --test tests/unit/season-fields.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { i18nStub } from "../helpers/i18n-stub.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const src = (p) => read(p).replace(/^const\b/gm, "var");

function loadHarness() {
  const disk = new Map();
  const team = { id: "haas", name: "Haas", tier: 4, stats: {},
    drivers: [{ name: "A", code: "AAA", num: 1 }, { name: "B", code: "BBB", num: 2 }] };
  const ctx = vm.createContext({ I18n: i18nStub(),
    Math, JSON, Object, Array, String, Number, Date, Set, Map, Promise, Blob,
    isNaN, isFinite, parseInt, console, setTimeout, clearTimeout, queueMicrotask,
    localStorage: {
      getItem: (k) => disk.has(k) ? disk.get(k) : null,
      setItem: (k, v) => disk.set(k, String(v)),
      removeItem: (k) => disk.delete(k),
    },
    window: { addEventListener() {}, __APEX_BUILD: "test-build" },
    document: { createElement: () => ({ click() {}, remove() {}, setAttribute() {}, style: {} }),
      body: { appendChild() {}, insertAdjacentHTML() {} }, addEventListener() {} },
    Log: { warn() {}, info() {}, debug() {}, error() {}, enabled: () => false },
    Teams: { POINTS: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], LIST: [team], isReal: () => true },
    Tracks: {
      LIST: Array.from({ length: 24 }, (_, i) => ({ id: "t" + i })),
      SEASON: Array.from({ length: 24 }, (_, i) => ({ id: "t" + i })),
      seasonIndex: () => 0,
    },
    Parts: { CATALOG: [], getFactorySetup: () => ({}), getCost: () => 0, setLegality() {} },
    NativeDownload: { viable: () => false, saveBlob: async () => ({ ok: true }) },
    Hash32: { fnv1a: (s) => String(s).length },
  });
  for (const f of ["js/core/hash32.js", "js/core/mat4.js", "js/data/driver-ratings.js", "js/career/save-migrate.js",
    "js/core/store.js", "js/career/career-backup.js", "js/career/team-identity.js", "js/career/career.js",
    "js/career/season-cal.js"]) vm.runInContext(src(f), ctx, { filename: absSrc(f) });
  // src() turns each top-level const into a var, so the globals are ctx members.
  return { SaveMigrate: ctx.SaveMigrate, CareerBackup: ctx.CareerBackup, SeasonCal: ctx.SeasonCal,
    store: ctx.GameStore.store };
}

// (a) — the write sites named in #7337. A season object is `season`/`s` in
// season-cal.js and career.js, `s` in quali-model.js.
const WRITE_SITES = ["js/career/season-cal.js", "js/career/career.js", "js/race/quali-model.js"];
const WRITE_RE = /(?:\bdelete\s+(?:season|s)\.([A-Za-z_$][\w$]*)|\b(?:season|s)\.([A-Za-z_$][\w$]*)\s*=(?!=))/g;
function writtenFields(text) {
  const out = new Set();
  for (const m of text.matchAll(WRITE_RE)) out.add(m[1] || m[2]);
  return out;
}

test("(a) every season field a js/ write site assigns is a SEASON_FIELDS row", () => {
  const { SaveMigrate } = loadHarness();
  const known = new Set(Object.keys(SaveMigrate.SEASON_FIELDS));
  const missing = [];
  let seen = 0;
  for (const f of WRITE_SITES) for (const name of writtenFields(read(f))) {
    seen++;
    if (!known.has(name)) missing.push(f + ": " + name);
  }
  assert.ok(seen >= 17, "the scan still finds the write sites (" + seen + ")");
  assert.deepEqual(missing, [], "add each to SaveMigrate.SEASON_FIELDS (js/career/save-migrate.js)");
  // The scan bites: a dummy write is caught.
  assert.equal(writtenFields("season.zz = 1;").has("zz") && !known.has("zz"), true);
  assert.equal(writtenFields("if (season.round === 1) {}").size, 0, "a comparison is not a write");
});

test("(a) the table's rows are well-formed and the backup list is derived from them", () => {
  const { SaveMigrate } = loadHarness();
  for (const [k, row] of Object.entries(SaveMigrate.SEASON_FIELDS)) {
    assert.ok(["both", "standalone", "career"].includes(row.scope), k);
    assert.equal(typeof row.backup, "boolean", k);
    assert.ok(row.clean === null || typeof row.clean === "function", k);
  }
  assert.equal(SaveMigrate.SEASON_FIELDS.sprintOrder.backup, false);
  const derived = Object.keys(SaveMigrate.SEASON_FIELDS)
    .filter((k) => SaveMigrate.SEASON_FIELDS[k].backup && SaveMigrate.SEASON_FIELDS[k].scope !== "career");
  assert.deepEqual(Array.from(SaveMigrate.SEASON_BACKUP_KEYS), derived);
  // The cleaner's id pattern matches CareerBackup's own.
  const backup = read("js/career/career-backup.js").match(/const ID_RE = (\/.*\/);/);
  assert.equal(String(SaveMigrate.SEASON_ID_RE), backup[1]);
  // #7337 Done-when: no hand-written season field list or config range is left.
  const text = read("js/career/career-backup.js");
  assert.doesNotMatch(text, /\[[^\]]*"qualiSeat"[^\]]*\]/);
  assert.doesNotMatch(text, /num\(c\.laps, 1, 200\)/);
  assert.doesNotMatch(text, /\[3, 5, 10, 25, 57\]|\[0, 2, 3\]/);
});

// One value per backup:true field, each one its cleaner keeps.
function fullSeason() {
  return {
    round: 1,
    pts: { "haas:0": 25, "haas:1": 18 },
    teamPts: { haas: 43 },
    driverCodes: { "haas:0": "YOU", "haas:1": "BBB" },
    finishes: { "haas:0": [0, 1], "haas:1": [0, 0, 1] },
    roundPts: { "haas:0": [25], "haas:1": [18] },
    config: { trackIds: ["t0", "t1", "t2"], quali: true, sprint: "rounds", sprintIds: ["t1"],
      laps: 5, points: "modern", flPoint: true, drop: 2 },
    you: "haas:0",
    stage: "race",
    lastFl: "haas:1",
    seed: 12345,
    qualiOrder: [{ id: "haas:1", t: 81.5 }, { id: "haas:0", t: 82.1, human: true }],
    qualiTrack: "t1",
    qualiMode: "season",
    qualiSeat: "haas:0|haas:1",
  };
}

test("(b) the populated season names every backup:true field", () => {
  const { SaveMigrate } = loadHarness();
  assert.deepEqual(Object.keys(fullSeason()).sort(), Array.from(SaveMigrate.SEASON_BACKUP_KEYS).sort(),
    "a new backup field needs a value here");
});

test("(b) cleanSeason keeps every backup:true field (backup apply)", () => {
  const h = loadHarness();
  const season = fullSeason();
  const r = h.CareerBackup.apply({ format: h.CareerBackup.FORMAT, slots: [], season });
  assert.equal(r.ok, true, JSON.stringify(r));
  const stored = JSON.parse(JSON.stringify(h.store.get("season")));   // VM-realm / null-prototype maps
  for (const k of h.SaveMigrate.SEASON_BACKUP_KEYS) assert.deepEqual(stored[k], season[k], k);
  // The table's row order is the backup output order (byte-stable files).
  assert.deepEqual(Object.keys(stored), Array.from(h.SaveMigrate.SEASON_BACKUP_KEYS));
});

test("(b) recoveryEnvelope -> validate keeps every backup:true field", () => {
  const h = loadHarness();
  const season = fullSeason();
  const r = h.CareerBackup.recoveryEnvelope({ format: "apex26-recovery-v1", season }, { flavour: "driver", i: 0 });
  assert.equal(r.ok, true, JSON.stringify(r));
  const kept = JSON.parse(JSON.stringify(r.envelope.season));
  for (const k of h.SaveMigrate.SEASON_BACKUP_KEYS) assert.deepEqual(kept[k], season[k], k);
  // A field outside the table is still refused.
  const extra = h.CareerBackup.recoveryEnvelope({ format: "apex26-recovery-v1", season: { ...season, zz: 1 } },
    { flavour: "driver", i: 0 });
  assert.equal(extra.ok, false);
  assert.equal(extra.reason, "unsupported-season");
});

test("(b) SeasonCal.resume keeps every backup:true field", () => {
  const h = loadHarness();
  const season = fullSeason();
  const out = JSON.parse(JSON.stringify(h.SeasonCal.resume(JSON.parse(JSON.stringify(season)))));
  for (const k of h.SaveMigrate.SEASON_BACKUP_KEYS) assert.deepEqual(out[k], season[k], k);
});

test("(c) SEASON_CONFIG's option sets are exactly what SeasonCal.normalize accepts", () => {
  const h = loadHarness();
  const C = h.SaveMigrate.SEASON_CONFIG;
  assert.deepEqual(Object.keys(C), Object.keys(h.SeasonCal.fresh()), "one row per config key");
  assert.equal(h.SeasonCal.LAP_OPTS, C.laps.opts);
  assert.equal(h.SeasonCal.DROP_OPTS, C.drop.opts);
  const base = { trackIds: ["t0", "t1"], sprintIds: [] };
  const junk = [undefined, null, 1, 7, 200, -1, "x", "rounds", "classic", true, false, 0, 2, 3, 25, 57, {}];
  for (const [key, spec] of Object.entries(C)) {
    if (spec.ids) continue;
    const accepted = junk.concat(spec.opts).filter((v) => {
      const out = h.SeasonCal.normalize({ ...base, [key]: v })[key];
      return out === v;
    });
    assert.deepEqual([...new Set(accepted)].sort(), [...spec.opts].sort(), key);
    // An unknown value normalises to the set's first option on both sides.
    assert.equal(h.SeasonCal.normalize({ ...base, [key]: "zz" })[key], spec.opts[0], key);
  }
});
