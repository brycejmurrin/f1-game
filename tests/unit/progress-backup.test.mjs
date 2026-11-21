// progress-backup.test.mjs — #5992: the `progress` section of the SAVES & DATA settings file
// (js/ui/progress-backup.js). Season setup, circuit mastery, ghosts, onboarding marks and the
// player's own circuits were in no export. Each round-trips device A → JSON → device B, and an
// import onto a device that already has progress MERGES instead of overwriting it.
// Run: node --test tests/unit/progress-backup.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedSaveMigrate } from "../helpers/seed-save-migrate.mjs";
import { absSrc } from "../helpers/abs-src.mjs";
import { bootEditor, design, ellipse } from "../helpers/editor-vm.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

/** One device: the real GameStore over its own localStorage, plus ProgressBackup. */
function device(disk = {}, globals = {}) {
  const map = new Map(Object.entries(disk).map(([k, v]) => ["apex26." + k, JSON.stringify(v)]));
  const sb = {
    Math, Object, Array, Number, JSON, Map, Set, Date, String, setTimeout: () => 0, clearTimeout() {},
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    localStorage: {
      get length() { return map.size; },
      key(i) { return Array.from(map.keys())[i]; },
      getItem(k) { const v = map.get(k); return v === undefined ? null : v; },
      setItem(k, v) { map.set(k, String(v)); },
      removeItem(k) { map.delete(k); },
    },
  };
  sb.window = sb;
  Object.assign(sb, globals);
  const ctx = vm.createContext(sb);
  seedSaveMigrate(ctx);
  vm.runInContext(read("js/core/store.js"), ctx, { filename: absSrc("js/core/store.js") });
  vm.runInContext(read("js/ui/progress-backup.js").replace(/^const\b/m, "var"), ctx, { filename: absSrc("js/ui/progress-backup.js") });
  const GameStore = vm.runInContext("GameStore", ctx);
  const disk1 = (k) => { const v = map.get("apex26." + k); return v === undefined ? undefined : JSON.parse(v); };
  const P = ctx.ProgressBackup, plain = (v) => JSON.parse(JSON.stringify(v));   // results cross the VM realm
  return { P: { collect: () => plain(P.collect()), apply: (bag) => plain(P.apply(bag)), ghostOk: P.ghostOk }, GameStore, disk: disk1 };
}
const viaFile = (bag) => JSON.parse(JSON.stringify(bag));

function trace(time, n = 10) {
  const t = [], s = [], x = [];
  for (let i = 0; i < n; i++) { t.push(+(time * i / (n - 1)).toFixed(3)); s.push(i * 50); x.push(0.5); }
  return { time, t, s, x, _used: 1 };
}
const SEASON = { v: 1, rounds: ["bahrain", "jeddah", "monza"], laps: 5, sprint: false, quali: true };
const MASTERY = { version: 1, entries: [{ key: "monza:lap:all", best: 81.2, completed: 3 }, { key: "spa:brake:all", best: 42, completed: 1 }] };

test("every progress kind round-trips onto an empty device", () => {
  const a = device({ seasonCfg: SEASON, circuitMastery: MASTERY, "ghost.v1": { monza: trace(82), "v2:spa:x": trace(104) },
    onboarded: 13, onboardRaces: 2, pitTaught: 1 });
  const file = viaFile(a.P.collect());
  assert.deepEqual(Object.keys(file).sort(), ["circuitMastery", "ghosts", "onboardRaces", "onboarded", "pitTaught", "seasonCfg"]);
  const b = device();
  const r = b.P.apply(file);
  assert.deepEqual(r, { applied: 6, skipped: 0, rejected: 0, failed: 0 });
  assert.deepEqual(b.disk("seasonCfg"), SEASON, "season setup");
  assert.deepEqual(b.disk("circuitMastery"), MASTERY, "circuit mastery");
  assert.deepEqual(Object.keys(b.disk("ghost.v1")).sort(), ["monza", "v2:spa:x"], "ghosts");
  assert.equal(b.disk("ghost.v1").monza.time, 82);
  assert.equal(b.disk("onboarded"), 13); assert.equal(b.disk("onboardRaces"), 2); assert.equal(b.disk("pitTaught"), 1);
  assert.deepEqual(viaFile(b.P.collect()), file, "and B exports what A did");
});

test("an empty device exports no progress section keys, and an old file without one imports nothing", () => {
  const a = device();
  assert.deepEqual(a.P.collect(), {});
  assert.deepEqual(a.P.apply(undefined), { applied: 0, skipped: 0, rejected: 0, failed: 0 });
  assert.deepEqual(a.P.apply({}), { applied: 0, skipped: 0, rejected: 0, failed: 0 });
});

test("import merges with the device's own progress instead of overwriting it", () => {
  const b = device({ circuitMastery: { version: 1, entries: [{ key: "monza:lap:all", best: 80.5, completed: 1 }, { key: "imola:lap:all", best: 77, completed: 2 }] },
    "ghost.v1": { monza: trace(81), imola: trace(78) }, onboarded: 2, onboardRaces: 5, pitTaught: 0 });
  const file = viaFile({ circuitMastery: MASTERY, ghosts: { monza: trace(82), spa: trace(104) }, onboarded: 13, onboardRaces: 2, pitTaught: 1 });
  const r = b.P.apply(file);
  const m = new Map(b.disk("circuitMastery").entries.map((e) => [e.key, e]));
  assert.deepEqual(m.get("monza:lap:all"), { key: "monza:lap:all", best: 80.5, completed: 3 }, "the better best, the larger count");
  assert.ok(m.has("imola:lap:all") && m.has("spa:brake:all"), "local and imported keys both kept");
  const g = b.disk("ghost.v1");
  assert.equal(g.monza.time, 81, "the faster local ghost stays"); assert.equal(g.spa.time, 104, "a new circuit's ghost is added");
  assert.ok(g.imola, "an untouched local ghost stays");
  assert.equal(b.disk("onboarded"), 15, "a mark seen on either device stays seen");
  assert.equal(b.disk("onboardRaces"), 5); assert.equal(b.disk("pitTaught"), 1);
  assert.equal(r.rejected, 0); assert.equal(r.failed, 0);
  assert.deepEqual(b.P.apply(file), { applied: 0, skipped: 6, rejected: 0, failed: 0 }, "a second import changes nothing (1 mastery, 2 ghosts, 3 marks)");
});

test("hostile or broken values are refused, never written", () => {
  const b = device({ seasonCfg: SEASON });
  const r = b.P.apply({ seasonCfg: [1], circuitMastery: { version: 2, entries: [] }, ghosts: { monza: { time: -1, t: [], s: [], x: [] }, ["x".repeat(300)]: trace(80) },
    onboarded: -1, onboardRaces: 1.5, pitTaught: "yes" });
  assert.deepEqual(r, { applied: 0, skipped: 0, rejected: 7, failed: 0 });
  assert.deepEqual(b.disk("seasonCfg"), SEASON); assert.equal(b.disk("ghost.v1"), undefined); assert.equal(b.disk("onboarded"), undefined);
  assert.equal(b.P.ghostOk(trace(80)), true);
  const backwards = trace(80); backwards.t[3] = 0;
  assert.equal(b.P.ghostOk(backwards), false, "a trace whose clock runs backwards is no ghost");
});

test("imported ghosts never push the store past the 512 KiB ghost budget", () => {
  const b = device({ "ghost.v1": { local: trace(70, 4000) } });
  const big = {};
  for (let i = 0; i < 12; i++) big["c" + i] = trace(90, 4000);
  const r = b.P.apply(viaFile({ ghosts: big }));
  assert.ok(r.skipped > 0, "some imported ghosts did not fit");
  const g = b.disk("ghost.v1");
  assert.ok(g.local, "the device's own ghost is never evicted by an import");
  assert.ok(JSON.stringify(g).length * 2 <= 512 * 1024);
});

test("custom circuits travel in their apex26.tracks collection and merge through CustomTracks", () => {
  const src = bootEditor(), dst = bootEditor();
  assert.equal(src.C.upsert(design({ name: "BACKUP LOOP", pts: ellipse(36, 820, 500) })).ok, true);
  const a = device({}, { CustomTracks: src.C }), b = device({}, { CustomTracks: dst.C });
  const file = viaFile(a.P.collect());
  assert.equal(file.circuits.format, "apex26.tracks");
  assert.equal(file.circuits.items.length, 1);
  assert.deepEqual(b.P.apply(file), { applied: 1, skipped: 0, rejected: 0, failed: 0 });
  assert.deepEqual(Array.from(dst.C.list(), (it) => it.name), ["BACKUP LOOP"]);
  assert.deepEqual(b.P.apply(file), { applied: 0, skipped: 1, rejected: 0, failed: 0 }, "an existing design wins");
  assert.deepEqual(b.P.apply({ circuits: { format: "apex26.tracks", v: 9, items: [] } }), { applied: 0, skipped: 0, rejected: 1, failed: 0 });
});

test("circuit-only restore counts the registry's duplicate-write retry by durability", () => {
  const collection = { format: "apex26.tracks", v: 1, items: [] };
  let durable = false;
  const b = device({}, { CustomTracks: { importCollection: () => ({ ok: true, added: 0, retried: true, durable }) } });
  assert.deepEqual(b.P.apply({ circuits: collection }), { applied: 0, skipped: 0, rejected: 0, failed: 1 });
  durable = true;
  assert.deepEqual(b.P.apply({ circuits: collection }), { applied: 1, skipped: 0, rejected: 0, failed: 0 });
});
