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
  const full = (k) => (k.startsWith("apex26.") ? k : "apex26." + k);
  const store = {
    get(k, d) { const v = disk.get("apex26." + k); return v === undefined ? d : JSON.parse(v); },
    set(k, v) { disk.set("apex26." + k, JSON.stringify(v)); },
    raw(k) { const v = disk.get(full(k)); return v === undefined ? null : v; },
    rawSet(k, v) { disk.set(full(k), String(v)); return true; },
    rawDel(k) { disk.delete(full(k)); return true; },
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
    // The garage half is the one place anything enumerates the namespace, so
    // the harness gives it a REAL-shaped localStorage over the same disk.
    localStorage: {
      get length() { return disk.size; },
      key(i) { return Array.from(disk.keys())[i]; },
      getItem(k) { const v = disk.get(k); return v === undefined ? null : v; },
    },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(read("js/ui/settings-export.js"), ctx, { filename: "js/ui/settings-export.js" });
  const SettingsExport = vm.runInContext("SettingsExport", ctx);
  const G = { gfx: { isMobile: !!opts.mobile }, soundOn: false };
  const plain = (v) => JSON.parse(JSON.stringify(v));
  return { SettingsExport, G, disk,
    collect: (mode) => plain(SettingsExport.collect(mode, G)),
    garage: () => plain(SettingsExport.collectGarage()),
    loadSettings: (o) => plain(SettingsExport.applySettings(o, G)),
    loadGarage: (o) => plain(SettingsExport.applyGarage(o)) };
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
    "apex26.cockpitHalo": "0", "apex26.metricsSize": "l",
    "apex26.lightTune": JSON.stringify({ "monza|day|dry": { sunI: 1.2 } }),
    "apex26.camTune": JSON.stringify({ chase: { dist: 2 } }),
  } });
  const f = collect("changes");
  assert.deepEqual(f.changed.sort(), ["audio.volMusic", "camera.camTune", "camera.cockpitHalo", "driving.difficulty", "lighting.lightTune", "metrics.metricsSize", "steering.pace"]);
  assert.equal(f.settings.audio.volMusic, 0.8);
  assert.equal(f.defaults.audio.volMusic, 0.9, "music ships at 0.9 since 2026-09-08");
  assert.equal(f.settings.steering.pace, 14);
  assert.equal(f.defaults.steering.pace, 11);
  // The halo SHIPS on since 2026-09-08, so "0" is what counts as a change now.
  assert.equal(f.settings.camera.cockpitHalo, "0", "a raw-lane value stays the string the panel wrote");
  assert.equal(f.defaults.camera.cockpitHalo, "1");
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

// ── THE GARAGE FILE, and reading either file back in ────────────────────────

const GARAGE = {
  "apex26.parts.mercedes": JSON.stringify({ wing: 3 }),
  "apex26.livery.ferrari": JSON.stringify("custom"),
  "apex26.livery.custom.ferrari": JSON.stringify([1, 2, 3]),
  "apex26.setup.redbull": JSON.stringify({ arb: 2 }),
  "apex26.customTeam": JSON.stringify({ name: "X" }),
  "apex26.team": "4",
  "apex26.driver": "1",
};

test("the garage file carries what the player BUILT, and nothing else in the namespace", () => {
  const { garage } = boot({ disk: Object.assign({}, GARAGE, POISON) });
  const f = garage();
  assert.equal(f.format, "apex26-garage-v1");
  assert.deepEqual(Object.keys(f.garage).sort(),
    ["customTeam", "driver", "livery.custom.ferrari", "livery.ferrari", "parts.mercedes", "setup.redbull", "team"]);
  assert.equal(f.count, 7);
  assert.deepEqual(f.garage["parts.mercedes"], { wing: 3 });
  assert.deepEqual(f.garage["livery.custom.ferrari"], [1, 2, 3]);
  // POISON put career, season, ghosts, tokens and TURN credentials in the same
  // namespace; the prefix allowlist is what keeps them out.
  const text = JSON.stringify(f).replace(/"excluded":"[^"]*"/, "");
  assert.ok(!/SECRET|career|season|ttlb|ghost|daily|spotify|nostr|wss:|crashStrikes/.test(text), "a garage file leaks nothing else");
  // And the settings file still does not carry the garage.
  const { collect } = boot({ disk: GARAGE });
  assert.ok(!/parts|livery|setup\.|customTeam/.test(JSON.stringify(collect("all")).replace(/"excluded":"[^"]*"/, "")));
});

test("an empty or blocked store still produces a valid garage file", () => {
  const f = boot().garage();
  assert.equal(f.format, "apex26-garage-v1");
  assert.deepEqual(f.garage, {});
  assert.equal(f.count, 0);
});

test("loading a settings file writes the allowlist and refuses everything else", () => {
  const b = boot();
  const r = b.loadSettings({
    format: "apex26-settings-v1",
    settings: {
      audio: { volMusic: 0.8 },
      steering: { pace: 14, steerSchema: 9 },
      camera: { cockpitHalo: "1" },
      display: { gfxBackend: null },
      // Neither of these is in SPEC, and neither may be written.
      driving: { unlimitedBudget: true, somethingElse: 1 },
      garage: { "parts.mercedes": { wing: 9 } },
    },
  });
  assert.equal(r.ok, true);
  assert.equal(b.disk.get("apex26.volMusic"), "0.8");
  assert.equal(b.disk.get("apex26.pace"), "14");
  assert.equal(b.disk.get("apex26.cockpitHalo"), "1", "a raw-lane key is written as its bare string");
  assert.equal(b.disk.has("apex26.gfxBackend"), false, "null on the raw lane means UNSET, not the string 'null'");
  assert.equal(b.disk.get("apex26.unlimitedBudget"), "true", "unlimitedBudget IS in SPEC, so a file may carry it");
  assert.equal(b.disk.has("apex26.somethingElse"), false, "a key the allowlist never named is not written");
  assert.equal(b.disk.has("apex26.parts.mercedes"), false, "the settings loader never writes the garage");
  assert.equal(b.disk.has("apex26.steerSchema"), false, "a migration version is context, never written back");
});

test("a settings file of the wrong shape is refused whole, and a bad value skipped", () => {
  assert.equal(boot().loadSettings({ format: "apex26-garage-v1", settings: {} }).ok, false);
  assert.equal(boot().loadSettings(null).ok, false);
  const b = boot();
  const r = b.loadSettings({ format: "apex26-settings-v1", settings: { steering: { pace: "fast" }, audio: { volMusic: 0.3 } } });
  assert.equal(r.ok, true);
  assert.equal(r.skipped, 1, "a string where a number belongs is skipped, not written");
  assert.equal(b.disk.has("apex26.pace"), false);
  assert.equal(b.disk.get("apex26.volMusic"), "0.3", "and the rest of the file still applies");
});

test("loading a garage file writes garage-shaped keys only", () => {
  const b = boot();
  const r = b.loadGarage({
    format: "apex26-garage-v1",
    garage: {
      "parts.mercedes": { wing: 3 },
      "livery.custom.ferrari": [1],
      customTeam: { name: "X" },
      "career.driver.0": { money: 99 },
      "spotify.token": "SECRET",
      "../escape": 1,
    },
  });
  assert.equal(r.ok, true);
  assert.equal(r.applied, 3);
  assert.equal(r.skipped, 3);
  assert.equal(b.disk.has("apex26.career.driver.0"), false, "a career save cannot ride in on a garage file");
  assert.equal(b.disk.has("apex26.spotify.token"), false);
  assert.equal(b.disk.has("apex26.../escape"), false);
  assert.equal(boot().loadGarage({ format: "apex26-settings-v1", garage: {} }).ok, false, "the two files are not interchangeable");
});

test("a file round-trips: save it, load it into a fresh store, get the same values", () => {
  const disk = { "apex26.volMusic": "0.8", "apex26.pace": "14", "apex26.cockpitHalo": "1" };
  const saved = boot({ disk }).collect("all");
  const b2 = boot();
  const r = b2.loadSettings(saved);
  assert.equal(r.ok, true);
  assert.equal(b2.disk.get("apex26.volMusic"), "0.8");
  assert.equal(b2.disk.get("apex26.pace"), "14");
  assert.equal(b2.disk.get("apex26.cockpitHalo"), "1");
  const g1 = boot({ disk: GARAGE }).garage();
  const b3 = boot();
  assert.equal(b3.loadGarage(g1).applied, 7);
  assert.deepEqual(b3.garage().garage, g1.garage, "the garage file is its own fixed point");
});
