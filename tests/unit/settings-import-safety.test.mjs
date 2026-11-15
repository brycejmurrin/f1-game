// settings-import-safety.test.mjs — LOAD SETTINGS must not hurt the device it lands on (batch #5096).
//
//   #5004  a file from an older steering schema runs the STEER_MIGRATIONS ladder before its values are written
//   #5005  a desktop file on the phone leaves every perDevice row (renderer, quality, resolution) alone
//          and storage refusing one write puts every key back (all or nothing)
//   #5032  the METRICS switch is never imported (it loads the agent surface at every boot)
//   #5023  the GARAGE / CREW / LIGHTING looks round-trip through the settings file
//
// Real js/ui/settings-export.js + js/input/steer-tuning.js in a node VM over a Map "disk". No browser.
// Run: node --test tests/unit/settings-import-safety.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const FORMAT = "apex26-settings-v1";

function boot({ disk: seed = {}, mobile = false, refuseAt = 0 } = {}) {
  const disk = new Map(Object.entries(seed));
  const full = (k) => (k.startsWith("apex26.") ? k : "apex26." + k);
  let writes = 0;
  const refused = () => refuseAt > 0 && ++writes === refuseAt;
  const store = {
    get(k, d) { const v = disk.get("apex26." + k); return v === undefined ? d : JSON.parse(v); },
    set(k, v) {
      if (refused()) return false;
      if (v === undefined) disk.delete("apex26." + k); else disk.set("apex26." + k, JSON.stringify(v));
      return true;
    },
    raw(k) { const v = disk.get(full(k)); return v === undefined ? null : v; },
    rawSet(k, v) { if (refused()) return false; disk.set(full(k), String(v)); return true; },
    rawDel(k) { disk.delete(full(k)); return true; },
  };
  const sb = {
    Math, Object, Array, Number, JSON, Map, Set, Date, String,
    setTimeout: () => 0, clearTimeout() {},
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    GameStore: { store },
    GfxQuality: { defaultId: (m) => (m ? "medium" : "high") },
    Input: { keysAreDefault: () => true, padsAreDefault: () => true },
    navigator: { userAgent: "test" },
    localStorage: { getItem: (k) => (disk.has(k) ? disk.get(k) : null) },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  for (const f of ["js/input/controller-profiles.js", "js/input/steer-tuning.js"]) vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  vm.runInContext(read("js/ui/settings-export.js"), ctx, { filename: absSrc("js/ui/settings-export.js") });
  const SE = vm.runInContext("SettingsExport", ctx), ST = vm.runInContext("SteerTuning", ctx);
  const G = { gfx: { isMobile: mobile } };
  const plain = (v) => JSON.parse(JSON.stringify(v));
  return { disk, ST, SE, loadFile: (file) => plain(SE.applySettings(file, G)), load: (settings, extra = {}) => plain(SE.applySettings({ format: FORMAT, settings, ...extra }, G)),
    collect: (mode) => plain(SE.collect(mode, G)) };
}

test("#5004: a schema-2 file's PACE 3 is migrated onto today's grid (0.750 of ground speed, notch 9), not read as 0.527", () => {
  const b = boot();
  b.load({ steering: { steerSchema: 2, pace: 3 } });
  assert.equal(b.disk.get("apex26.pace"), "9");
  assert.equal(b.disk.has("apex26.steerSchema"), false, "the file's version is context, never written");
});

test("#5004: every rung above the file's version runs, only over keys the file carries", () => {
  const b = boot({ disk: { "apex26.drivingHelp": "4" } });
  b.load({ steering: { steerSchema: 3, adaptiveButtons: 1, gripSteer: "x" } });
  assert.equal(b.disk.get("apex26.adaptiveButtons"), "6", "v4: old ON becomes mid strength");
  assert.equal(b.disk.get("apex26.gripSteer"), "1", "v5: a non-number grip steer is OFF");
  assert.equal(b.disk.get("apex26.drivingHelp"), "4", "a key the file does not carry is the device's own");
  assert.deepEqual(JSON.parse(JSON.stringify(b.ST.migrateValues(1, { drivingHelp: 6, raceLine: 2 }))), { drivingHelp: 1, raceLine: 0 });
});

test("#5004: a file at or past STEER_SCHEMA (or without a version) is written as it is", () => {
  for (const steerSchema of [5, 99, undefined]) {
    const b = boot();
    b.load({ steering: { steerSchema, pace: 3, adaptiveButtons: 1 } });
    assert.equal(b.disk.get("apex26.pace"), "3", "schema " + steerSchema);
    assert.equal(b.disk.get("apex26.adaptiveButtons"), "1", "schema " + steerSchema);
  }
  assert.equal(boot().ST.STEER_SCHEMA, 5);
});

const DESKTOP_DISPLAY = { gfxPreset: "high", gfxBackend: "wgx", tlxForceGL: "1", xrBackend: "webgpu" };

test("#5005: a desktop file on the phone keeps the phone's renderer, quality and resolution, and says how many it skipped", () => {
  const phone = { "apex26.gfxPreset": JSON.stringify("medium"), "apex26.gfxBackend": "glx" };
  const b = boot({ mobile: true, disk: phone });
  const r = b.load({ display: DESKTOP_DISPLAY, audio: { sfx: false } }, { device: { desktop: true, userAgent: "x" } });
  assert.equal(b.disk.get("apex26.gfxPreset"), JSON.stringify("medium"));
  assert.equal(b.disk.get("apex26.gfxBackend"), "glx");
  assert.equal(b.disk.has("apex26.tlxForceGL"), false);
  assert.equal(b.disk.has("apex26.xrBackend"), false);
  assert.equal(b.disk.get("apex26.sfx"), "false", "a preference still crosses devices");
  assert.equal(r.applied, 1);
  assert.equal(r.skipped, 4);
});

test("#5005: the same file on another desktop applies its display rows", () => {
  const b = boot({ mobile: false });
  const r = b.load({ display: DESKTOP_DISPLAY }, { device: { desktop: true } });
  assert.equal(b.disk.get("apex26.gfxBackend"), "wgx");
  assert.equal(b.disk.get("apex26.tlxForceGL"), "1");
  assert.equal(r.applied, 4);
});

test("#5032: METRICS is never imported, and the receipt counts it skipped", () => {
  const b = boot();
  const r = b.load({ metrics: { metrics: "1", metricsPage: "log" } });
  assert.equal(b.disk.has("apex26.metrics"), false);
  assert.equal(b.disk.get("apex26.metricsPage"), "log", "the panel's layout prefs still travel");
  assert.equal(r.skipped, 1);
});

// The garage bundle is lazy, so the rows pin the id lists; these read them from the modules' own literals.
function keysOf(file, open) {
  const src = read(file), at = src.indexOf(open);
  return [...src.slice(at, src.indexOf("\n};", at)).matchAll(/^ {2}([a-z]\w*):/gm)].map((m) => m[1]);
}
const crewLooks = () => JSON.parse(read("js/garage/scene-crew.js").match(/const LOOKS = (\[[^\]]*\]);/)[1]);

test("#5023: the GARAGE / CREW / LIGHTING look rows offer exactly the ids the garage modules accept", () => {
  const b = boot();
  for (const [k, ids] of [["garageLook", keysOf("js/garage/scene-prims.js", "const LOOKS = {")],
    ["crewLook", crewLooks()], ["garageMood", keysOf("js/garage/scene.js", "const MOODS = {")]]) {
    for (const id of ids) {
      const r = b.load({ appearance: { [k]: id } });
      assert.equal(r.applied, 1, k + " " + id);
      assert.equal(b.disk.get("apex26." + k), id);
    }
    assert.equal(b.load({ appearance: { [k]: "nope" } }).skipped, 1, k + " refuses an unknown id");
  }
});

test("#5023: a chosen garage look is in SAVE SETTINGS (changes) and comes back on LOAD", () => {
  const src = boot({ disk: { "apex26.garageLook": "carbon", "apex26.crewLook": "pitstop", "apex26.garageMood": "night" } });
  const file = src.collect("changes");
  assert.deepEqual(file.settings.appearance, { garageLook: "carbon", crewLook: "pitstop", garageMood: "night" });
  const dst = boot();
  dst.load(file.settings);
  assert.equal(dst.disk.get("apex26.garageLook"), "carbon");
  assert.equal(dst.disk.get("apex26.crewLook"), "pitstop");
  assert.equal(dst.disk.get("apex26.garageMood"), "night");
});

test("#5005: storage refusing one write puts back every key the import touched (nothing half-applied)", () => {
  const seed = { "apex26.sfx": "true", "apex26.volSfx": "0.2", "apex26.portraitOk": "0" };
  const b = boot({ disk: seed, refuseAt: 2 });
  const r = b.load({ audio: { sfx: false, volSfx: 0.9, music: false }, display: { portraitOk: "1" } });
  assert.deepEqual(Object.fromEntries(b.disk), seed);
  assert.deepEqual(r, { ok: true, applied: 0, skipped: 0, failed: 1, rejectedTtlb: 0, reason: null });
});

// Bryce's own SAVE ALL SETTINGS from the Home Screen app (2026-11-10): the file that has to come back whole.
test("Bryce's real phone export loads on a phone with nothing skipped, failed or rewritten", () => {
  const file = JSON.parse(read("tests/data/settings-live-export-2026-11-10.json"));
  assert.equal(file.device.desktop, false);
  // A phone that already holds other choices: the import must replace them, not merge around them.
  const b = boot({ mobile: true, disk: { "apex26.uiScale": "130", "apex26.hudBtnScale": "80", "apex26.resMode": '"low"', "apex26.steerSchema": "5", "apex26.resSchema": "2" } });
  const r = b.loadFile(file);
  assert.equal(r.ok, true);
  assert.deepEqual({ skipped: r.skipped, failed: r.failed }, { skipped: 0, failed: 0 });
  const back = b.collect("all").settings, lost = [];
  let rows = 0;
  for (const row of b.SE.SPEC) {
    const g = file.settings[row.group];
    if (!g || !Object.prototype.hasOwnProperty.call(g, row.k)) continue;
    rows++;
    try { assert.deepEqual(back[row.group][row.k], g[row.k]); } catch (_) { lost.push(`${row.group}.${row.k}`); }
  }
  assert.deepEqual(lost, []);
  // Every value in the file is one the importer knows: none is dropped for lack of a SPEC row.
  assert.equal(rows, Object.values(file.settings).reduce((n, grp) => n + Object.keys(grp).length, 0));
  assert.equal(back.display.uiScale, 70);
  assert.equal(back.display.hudBtnScale, 143.25);
});
