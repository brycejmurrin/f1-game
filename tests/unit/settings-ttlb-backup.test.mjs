// settings-ttlb-backup.test.mjs — optional `ttlb` section in apex26-settings-v1
// (js/ui/settings-export.js): export, merge import, validation — not Data Hub export ZIP.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedSaveMigrate } from "../helpers/seed-save-migrate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function boot(opts = {}) {
  const disk = new Map(Object.entries(opts.disk || {}));
  const store = {
    get(k, d) { const v = disk.get("apex26." + k); return v === undefined ? d : JSON.parse(v); },
    set(k, v) { disk.set("apex26." + k, JSON.stringify(v)); },
    raw(k) { const v = disk.get("apex26." + k); return v === undefined ? null : v; },
    rawSet(k, v) { disk.set("apex26." + k, String(v)); return true; },
    rawDel(k) { disk.delete("apex26." + k); return true; },
  };
  const sb = {
    Math, Object, Array, Number, JSON, Map, Set, Date, String,
    setTimeout: () => 0, clearTimeout() {},
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    GameStore: null,
    GameAudio: { tuneDefaults: () => ({}), layerDefaults: () => ({}) },
    GfxQuality: { defaultId: () => "high" },
    Input: { keysAreDefault: () => true, padsAreDefault: () => true },
    navigator: { userAgent: "test" },
    localStorage: {
      get length() { return disk.size; },
      key(i) { return Array.from(disk.keys())[i]; },
      getItem(k) { const v = disk.get(k); return v === undefined ? null : v; },
      setItem(k, v) { disk.set(k, v); },
      removeItem(k) { disk.delete(k); },
    },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  seedSaveMigrate(ctx);
  vm.runInContext(read("js/core/store.js"), ctx, { filename: "js/core/store.js" });
  sb.GameStore = vm.runInContext("GameStore", ctx);
  vm.runInContext(read("js/ui/settings-export.js"), ctx, { filename: "js/ui/settings-export.js" });
  const SettingsExport = vm.runInContext("SettingsExport", ctx);
  const G = { gfx: { isMobile: false }, soundOn: false };
  const plain = (v) => JSON.parse(JSON.stringify(v));
  return {
    SettingsExport, GameStore: sb.GameStore, G, disk,
    collect: (mode) => plain(SettingsExport.collect(mode, G)),
    loadSettings: (o) => plain(SettingsExport.applySettings(o, G)),
  };
}

const lap = (t, extra = {}) => ({
  t, teamId: "mclaren", code: "NOR", name: "Lando Norris", ts: 1000 + t, ...extra,
});

test("settings export round-trips ttlb boards (export, clear, import, laps match)", () => {
  const rows = [lap(90.1), lap(89.5, { code: "PIA" })];
  const src = boot({
    disk: { "apex26.ttlb.monza": JSON.stringify(rows) },
  });
  const collected = src.collect("all");
  assert.ok(collected.ttlb, "SAVE ALL carries ttlb when boards exist");
  assert.deepEqual(collected.ttlb.monza.map((e) => e.t).sort((a, z) => a - z), [89.5, 90.1]);
  const file = { format: "apex26-settings-v1", settings: {}, ttlb: collected.ttlb };
  src.disk.delete("apex26.ttlb.monza");

  const dst = boot();
  assert.equal(dst.loadSettings(file).applied, 2);
  const got = dst.GameStore.ttBoard("monza").map((e) => e.t).sort((a, z) => a - z);
  assert.equal(got.length, 2);
  assert.equal(got[0], 89.5);
  assert.equal(got[1], 90.1);
});

test("ttlb import merges and keeps the best laps per class", () => {
  const ctxA = '{"physics":1}';
  const ctxB = '{"physics":2}';
  const local = boot({
    disk: {
      "apex26.ttlb.monza": JSON.stringify([
        lap(90, { context: ctxA, ts: 1 }),
        lap(88, { context: ctxB, ts: 2 }),
      ]),
    },
  });
  const file = {
    format: "apex26-settings-v1",
    settings: {},
    ttlb: {
      monza: [
        lap(87, { context: ctxA, ts: 3 }),
        lap(91, { context: ctxB, ts: 4 }),
        lap(89, { context: ctxB, ts: 5 }),
      ],
    },
  };
  local.loadSettings(file);
  const board = local.GameStore.ttBoard("monza");
  const byCtx = (c) => board.filter((e) => (e.context || null) === c).map((e) => e.t).sort((a, z) => a - z);
  assert.deepEqual(byCtx(ctxA), [87, 90]);
  assert.deepEqual(byCtx(ctxB), [88, 89, 91]);
});

test("ttlb import rejects invalid laps through ttParseBoard", () => {
  const dst = boot();
  const r = dst.loadSettings({
    format: "apex26-settings-v1",
    settings: {},
    ttlb: {
      monza: [null, { t: 0 }, { t: -1 }, { t: "nope" }, lap(90.5)],
      spa: { v: 2, classes: ["a"], laps: [null, { t: "bad" }, { t: 88, c: 0 }] },
    },
  });
  assert.equal(r.applied, 2, "only positive finite times apply");
  assert.equal(dst.GameStore.ttBoard("monza").length, 1);
  assert.equal(dst.GameStore.ttBoard("monza")[0].t, 90.5);
  assert.equal(dst.GameStore.ttBoard("spa").length, 1);
  assert.equal(dst.GameStore.ttBoard("spa")[0].t, 88);
});

test("old settings backups without ttlb still import", () => {
  const b = boot({ disk: { "apex26.volMusic": "0.5" } });
  const r = b.loadSettings({ format: "apex26-settings-v1", settings: { audio: { volMusic: 0.7 } } });
  assert.equal(r.ok, true);
  assert.equal(JSON.parse(b.disk.get("apex26.volMusic")), 0.7);
  assert.equal(b.GameStore.ttBoard("monza").length, 0);
});
