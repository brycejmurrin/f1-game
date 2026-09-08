// settings-export.test.mjs — the SETTINGS FILE (js/ui/settings-export.js).
//
// The file exists to be handed to whoever tunes the defaults, so three things
// must hold: a fresh store exports NO changes; every changed key carries the
// default it replaced and the source that owns it; and nothing outside the
// allowlist ever leaks — the store is poisoned with garage, save and account
// keys and the file must not mention one of them. The allowlist's literal
// defaults are cross-checked against the source files that read them.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function boot(opts = {}) {
  const disk = new Map(Object.entries(opts.disk || {}));
  const store = {
    get(k, d) { const v = disk.get("apex26." + k); return v === undefined ? d : JSON.parse(v); },
    raw(k) { const v = disk.get(k.startsWith("apex26.") ? k : "apex26." + k); return v === undefined ? null : v; },
  };
  const sb = {
    Math, Object, Array, Number, JSON, Map, Set, Date, String, Blob: class {},
    setTimeout: () => 0,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    GameStore: { store },
    GameAudio: { tuneDefaults: () => ({ gain: 1, bass: 0.5, air: 0.2 }), layerDefaults: () => ({ wind: true, turbo: true }) },
    GfxQuality: { defaultId: (m) => (m ? "medium" : "high") },
    Input: { keysAreDefault: () => opts.keysDefault !== false, padsAreDefault: () => true },
    navigator: { userAgent: "test" },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(read("js/ui/settings-export.js"), ctx, { filename: "js/ui/settings-export.js" });
  const SettingsExport = vm.runInContext("SettingsExport", ctx);
  const G = { gfx: { isMobile: !!opts.mobile }, soundOn: false };
  return { SettingsExport, G, collect: (mode) => JSON.parse(JSON.stringify(SettingsExport.collect(mode, G))) };
}

// Values a player might have anywhere in the namespace — including the ones
// the file must never carry.
const POISON = {
  "apex26.parts.mercedes": JSON.stringify({ wing: 3 }),
  "apex26.livery.ferrari": JSON.stringify("custom"),
  "apex26.setup.redbull": JSON.stringify({ arb: 2 }),
  "apex26.customTeam": JSON.stringify({ name: "X" }),
  "apex26.career.driver.0": JSON.stringify({ money: 1 }),
  "apex26.season": JSON.stringify([1, 2]),
  "apex26.ttlb.monza": JSON.stringify([80]),
  "apex26.ghost.v1": "xxx",
  "apex26.daily.v1": JSON.stringify({ best: 1 }),
  "apex26.spotify.token": "SECRET",
  "apex26.turn": JSON.stringify({ user: "u", cred: "SECRET" }),
  "apex26.nostrRelays": JSON.stringify(["wss://x"]),
  "apex26.envProbeOff": "1",
  "apex26.gfxWgxFail": "boom",
  "apex26.crashStrikes": "3",
};

test("a fresh store exports no changes, and ALL lists every key at its default", () => {
  const { SettingsExport, collect } = boot();
  const changes = collect("changes");
  assert.equal(changes.format, "apex26-settings-v1");
  assert.equal(changes.mode, "changes");
  assert.deepEqual(changes.changed, []);
  assert.deepEqual(changes.settings, {});
  const all = collect("all");
  assert.equal(all.mode, "all");
  const n = Object.values(all.settings).reduce((a, g) => a + Object.keys(g).length, 0);
  assert.equal(n, SettingsExport.SPEC.length, "every allowlisted key appears once");
  assert.equal(all.settings.steering.pace, 11);
  assert.equal(all.settings.display.gfxPreset, "high", "the desktop default");
  assert.equal(all.settings.audio.sndTune.gain, 1, "an object default is spelled out");
  assert.deepEqual(all.changed, []);
});

test("a changed key carries its value, the default it replaced and the source that owns it", () => {
  const { collect } = boot({ disk: {
    "apex26.volMusic": "0.8", "apex26.pace": "14", "apex26.difficulty": JSON.stringify("hard"),
    "apex26.cockpitHalo": "1", "apex26.metricsSize": "l",
    "apex26.lightTune": JSON.stringify({ "monza|day|dry": { sunI: 1.2 } }),
    "apex26.camTune": JSON.stringify({ chase: { dist: 2 } }),
  } });
  const f = collect("changes");
  assert.deepEqual(f.changed.sort(), ["audio.volMusic", "camera.camTune", "camera.cockpitHalo", "driving.difficulty", "lighting.lightTune", "metrics.metricsSize", "steering.pace"]);
  assert.equal(f.settings.audio.volMusic, 0.8);
  assert.equal(f.defaults.audio.volMusic, 0.5);
  assert.equal(f.settings.steering.pace, 14);
  assert.equal(f.defaults.steering.pace, 11);
  assert.equal(f.settings.camera.cockpitHalo, "1", "a raw-lane value stays the string the panel wrote");
  assert.equal(f.defaults.camera.cockpitHalo, "0");
  assert.deepEqual(f.settings.lighting.lightTune, { "monza|day|dry": { sunI: 1.2 } });
  assert.deepEqual(f.settings.camera.camTune, { chase: { dist: 2 } });
  for (const name of f.changed) assert.match(f.where[name], /^js\//, name + " names its source");
  assert.equal(f.settings.driving.reliability, undefined, "an untouched key is absent from CHANGES");
});

test("a tuner that saves its whole table reports only the fields the player moved", () => {
  const { collect } = boot({ disk: {
    "apex26.sndTune": JSON.stringify({ gain: 1, bass: 0.9, air: 0.2 }),
    "apex26.sndLayers": JSON.stringify({ wind: true, turbo: true }),
  } });
  const f = collect("changes");
  assert.deepEqual(f.changed, ["audio.sndTune"], "a full table equal to the defaults is not a change");
  assert.deepEqual(f.settings.audio.sndTune, { bass: 0.9 });
  assert.deepEqual(f.defaults.audio.sndTune, { gain: 1, bass: 0.5, air: 0.2 });
});

test("the binding tables count as changed by Input's word, not by value", () => {
  const disk = { "apex26.keys": JSON.stringify({ throttle: ["ArrowUp", "KeyW"] }) };
  assert.deepEqual(boot({ disk }).collect("changes").changed, [], "a saved default map is not a change");
  const f = boot({ disk, keysDefault: false }).collect("changes");
  assert.deepEqual(f.changed, ["controls.keys"]);
  assert.deepEqual(f.settings.controls.keys, { throttle: ["ArrowUp", "KeyW"] });
});

test("nothing outside the allowlist leaks, whatever the store holds", () => {
  const { collect } = boot({ disk: POISON });
  for (const mode of ["changes", "all"]) {
    const text = JSON.stringify(collect(mode));
    assert.ok(!/SECRET|parts|livery|setup\.|customTeam|career|ttlb|ghost|daily|spotify|turn|nostr|envProbeOff|gfxWgxFail|crashStrikes|wss:/.test(text.replace(/"excluded":"[^"]*"/, "")), mode + " mentions an excluded key");
  }
});

test("the steering schema version is context, never a change", () => {
  const f = boot({ disk: { "apex26.steerSchema": "4" } }).collect("changes");
  assert.deepEqual(f.changed, []);
  assert.equal(boot({ disk: { "apex26.steerSchema": "4" } }).collect("all").settings.steering.steerSchema, 4);
});

test("the device decides the graphics default", () => {
  assert.equal(boot({ mobile: true }).collect("all").settings.display.gfxPreset, "medium");
  const f = boot({ mobile: true, disk: { "apex26.gfxPreset": JSON.stringify("medium") } }).collect("changes");
  assert.deepEqual(f.changed, [], "a phone on MEDIUM is at its default");
});

// The allowlist's literal defaults against the source that reads them: every
// `store.get("<key>", <default>)` in the owning file must agree with SPEC, and
// every source path must exist. A default moved in the source without the
// table following would make the file report a change that is none.
test("SPEC's defaults agree with the store.get reads in their source files", () => {
  const { SettingsExport } = boot();
  let checked = 0;
  for (const row of SettingsExport.SPEC) {
    const file = row.src.split(" ")[0];
    assert.ok(fs.existsSync(path.join(ROOT, file)), row.k + ": " + file + " exists");
    if (row.lane !== "json" || typeof row.def === "function") continue;
    const src = read(file);
    // Every read of the key in its file; a migration read (`, null)`) or a
    // named constant is not the boot default, so the literal reads must
    // include SPEC's value rather than each equal it.
    const re = new RegExp('store\\.get\\("' + row.k + '",\\s*([^)]+?)\\)', "g");
    const lits = [];
    for (let m; (m = re.exec(src));) { try { lits.push(JSON.parse(m[1].trim())); } catch (_) { /* a named constant or a nested read — skipped */ } }
    const evidence = lits.filter((l) => l !== null);   // `, null)` is a has-it-been-set probe, not a default
    if (!evidence.length) continue;
    assert.ok(evidence.some((l) => JSON.stringify(l) === JSON.stringify(row.def)), row.k + " default in " + file + ": reads " + JSON.stringify(evidence) + ", SPEC says " + JSON.stringify(row.def));
    checked++;
  }
  assert.ok(checked >= 20, "cross-checked " + checked + " literal defaults");
});
