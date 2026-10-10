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
import { readDefaults } from "../../tools/gen/settings-defaults.mjs";
import { makeDom } from "../helpers/mini-dom.mjs";

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
  if (opts.store) Object.assign(store, opts.store);
  const sb = {
    Math, Object, Array, Number, JSON, Map, Set, Date, String, Blob: class {},
    setTimeout: () => 0, clearTimeout() {},
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
  if (opts.globals) Object.assign(sb, opts.globals);
  sb.window = sb;
  const ctx = vm.createContext(sb);
  // In the page js/data/teams.js loads long before this file; opt in where a
  // test is about what Teams.sanitizeCustom does to an imported team.
  if (opts.teams) vm.runInContext(read("js/data/teams.js"), ctx, { filename: "js/data/teams.js" });
  // Career collect/apply run migrateCareer. Teams is a HARD_EDGES dep of
  // SaveMigrate.remapPoints — load both only when a test exercises the career
  // file, so garage round-trips keep their pre-Teams verbatim customTeam shape.
  if (opts.career) {
    if (!opts.teams) vm.runInContext(read("js/data/teams.js"), ctx, { filename: "js/data/teams.js" });
    vm.runInContext(read("js/career/save-migrate.js"), ctx, { filename: "js/career/save-migrate.js" });
    vm.runInContext(`GameStore.migrateCareer = SaveMigrate.migrateCareer; GameStore.CAREER_V = SaveMigrate.CAREER_V;`, ctx);
    vm.runInContext(read("js/career/career-backup.js"), ctx, { filename: "js/career/career-backup.js" });
  }
  if (opts.appearance) for (const file of ["title-layout", "screen-looks", "appearance-studio"]) {
    vm.runInContext(read("js/ui/" + file + ".js"), ctx, { filename: "js/ui/" + file + ".js" });
  }
  vm.runInContext(read("js/ui/settings-export.js"), ctx, { filename: "js/ui/settings-export.js" });
  const SettingsExport = vm.runInContext("SettingsExport", ctx);
  const G = { gfx: { isMobile: !!opts.mobile }, soundOn: false };
  const plain = (v) => JSON.parse(JSON.stringify(v));
  return { SettingsExport, G, disk,
    collect: (mode) => plain(SettingsExport.collect(mode, G)),
    garage: () => plain(SettingsExport.collectGarage()),
    career: () => plain(SettingsExport.collectCareer()),
    loadSettings: (o) => plain(SettingsExport.applySettings(o, G)),
    loadGarage: (o) => plain(SettingsExport.applyGarage(o)),
    loadCareer: (o) => plain(SettingsExport.applyCareer(o)) };
}

function bootImportUI(opts = {}) {
  const dom = makeDom();
  let opens = 0;
  const create = dom.document.createElement;
  dom.document.createElement = (tag) => {
    const el = create(tag);
    if (tag === "input") el.click = () => { opens++; };
    return el;
  };
  dom.byId("pm-panel-files"); dom.byId("pm-display-adv-body");
  // Real getElementById must not invent the mount guard's missing heading.
  dom.document.getElementById = (id) => dom.document.querySelector("#" + id);
  const timers = new Map();
  let seq = 0, reloads = 0;
  const b = boot({ ...opts, globals: {
    ...(opts.globals || {}),
    document: dom.document, location: { reload: () => reloads++ },
    setTimeout: (fn, ms) => { timers.set(++seq, { fn, ms }); return seq; },
    clearTimeout: (id) => timers.delete(id),
    FileReader: class {
      readAsText(file) { file.pending.then((text) => { this.result = text; this.onload(); }, () => this.onerror()); }
    },
  } });
  b.SettingsExport.create(b.G);
  const button = dom.byId("pm-settings-load");
  return { ...b, dom, button,
    choose(promise) {
      const before = opens;
      button.click(); button.click();
      if (opens === before) return false;
      const picker = dom.document.querySelector("input");
      picker.files = [opts.fileReader ? { pending: promise } : { text: () => promise }]; picker.onchange();
    },
    reloads: () => reloads,
    flushReloads() { for (const [id, t] of timers) if (t.ms === 600) { timers.delete(id); t.fn(); } },
  };
}

test("backup controls mount once in their own settings page, outside renderer options", () => {
  const b = bootImportUI();
  for (const id of ["pm-settings-changed", "pm-settings-all", "pm-settings-load"]) {
    assert.equal(b.dom.byId(id).parentElement.id, "pm-panel-files");
  }
  b.SettingsExport.create(b.G);
  assert.equal(b.dom.document.querySelectorAll("#pm-settings-load").length, 1);
});

test("ensureMounted remounts after the files panel was emptied", () => {
  const b = bootImportUI();
  assert.ok(b.dom.byId("pm-settings-load"));
  const host = b.dom.byId("pm-panel-files");
  while (host.firstChild) host.removeChild(host.firstChild);
  assert.equal(host.children.length, 0);
  assert.equal(typeof b.SettingsExport.ensureMounted, "function");
  b.SettingsExport.ensureMounted();
  for (const id of ["pm-settings-changed", "pm-settings-all", "pm-settings-load"]) {
    assert.equal(b.dom.byId(id).parentElement.id, "pm-panel-files");
  }
});

for (const fail of [false, true]) test(`native backup waits for sharing and reports ${fail ? "failure" : "success"}`, async () => {
  let finish, calls = 0, saved;
  const held = new Promise((resolve, reject) => { finish = () => fail ? reject(new Error("disk full")) : resolve(); });
  const b = bootImportUI({ globals: {
    Blob,
    URL: { createObjectURL() { throw new Error("native backup must not use an anchor"); } },
    NativeDownload: { viable: () => true, saveBlob: (blob, name) => { calls++; saved = { blob, name }; return held; } },
  } });
  const button = b.dom.byId("pm-settings-all");
  const pending = button.onclick();
  assert.equal(calls, 1);
  assert.equal(button.disabled, true);
  assert.match(button.textContent, /SAVING/);
  assert.doesNotMatch(button.textContent, /SAVED/);
  await button.onclick();
  assert.equal(calls, 1, "another tap cannot start a duplicate export");
  assert.equal(saved.blob.type, "application/json");
  assert.equal(JSON.parse(await saved.blob.text()).format, "apex26-settings-v1");
  assert.match(saved.name, /\.json$/);
  finish();
  await pending;
  assert.equal(button.disabled, false);
  assert.match(button.textContent, fail ? /FAILED/ : /SAVED/);
  assert.equal(calls, 1);
});

test("browser backup retains its download anchor and re-enables the button", async () => {
  const urls = [];
  const b = bootImportUI({ globals: {
    Blob,
    URL: { createObjectURL: (blob) => { urls.push(blob); return "blob:test"; }, revokeObjectURL() {} },
    NativeDownload: { viable: () => false, saveBlob() { throw new Error("browser must not use native sharing"); } },
  } });
  await b.dom.byId("pm-settings-all").onclick();
  assert.equal(urls.length, 1);
  assert.equal(JSON.parse(await urls[0].text()).format, "apex26-settings-v1");
  assert.match(b.dom.byId("pm-settings-all").textContent, /SAVED/);
  assert.equal(b.dom.byId("pm-settings-all").disabled, false);
});

const volumeFile = (v) => JSON.stringify({ format: "apex26-settings-v1", settings: { audio: { volMusic: v } } });
for (const fileReader of [false, true]) test(`a slow older settings import cannot overwrite the newer file (${fileReader ? "FileReader" : "File.text"})`, async () => {
  const b = bootImportUI({ fileReader });
  let finishOld;
  b.choose(new Promise((resolve) => { finishOld = resolve; }));
  b.choose(Promise.resolve(volumeFile(0.8)));
  await Promise.resolve();
  assert.equal(b.disk.get("apex26.volMusic"), "0.8");
  finishOld(volumeFile(0.2));
  await Promise.resolve();
  assert.equal(b.disk.get("apex26.volMusic"), "0.8", "late reads do not change current settings");
  b.flushReloads();
  assert.equal(b.reloads(), 1);
});

for (const fileReader of [false, true]) test(`an old file error cannot replace the latest import result (${fileReader ? "FileReader" : "File.text"})`, async () => {
  const b = bootImportUI({ fileReader });
  let failOld;
  b.choose(new Promise((_resolve, reject) => { failOld = reject; }));
  b.choose(Promise.resolve(volumeFile(0.8)));
  await Promise.resolve();
  assert.match(b.button.textContent, /APPLIED/);
  failOld(new Error("read failed"));
  await Promise.resolve();
  assert.match(b.button.textContent, /APPLIED/);
  assert.equal(b.disk.get("apex26.volMusic"), "0.8");
});

test("a completed import locks new file choices until it reloads", async () => {
  const b = bootImportUI();
  b.choose(Promise.resolve(volumeFile(0.2)));
  await Promise.resolve();
  assert.equal(b.button.disabled, true);
  assert.equal(b.choose(Promise.resolve("not JSON")), false, "no replacement chooser can cancel an already applied import");
  assert.equal(b.disk.get("apex26.volMusic"), "0.2");
  b.flushReloads();
  assert.equal(b.reloads(), 1);
});

test("the import UI stays open and reports a refused storage reset", async () => {
  const b = bootImportUI({ store: { rawDel: () => false } });
  b.choose(Promise.resolve(JSON.stringify({ format: "apex26-settings-v1", settings: { display: { gfxBackend: null } } })));
  await Promise.resolve();
  assert.match(b.button.textContent, /NOT SAVED/);
  b.flushReloads();
  assert.equal(b.reloads(), 0);
});

// Values a player might have anywhere in the namespace — including the ones
// the file must never carry.
const POISON = {
  "apex26.parts.mercedes": JSON.stringify({ wing: 3 }),
  "apex26.livery.ferrari": JSON.stringify("custom"),
  "apex26.setup.redbull": JSON.stringify({ arb: 2 }),
  // A REAL custom team, not `{ name: "X" }`. The round-trip tests below export
  // this store and load it back, so a drivers-less stub here would be asserting
  // that the shape which crashes boot survives a round trip.
  "apex26.customTeam": JSON.stringify({ id: "custom", name: "X", drivers: [{ name: "You", code: "YOU", num: 99 }] }),
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
  assert.equal(all.settings.display.gfxPreset, null, "unset per-device default: the loading device keeps its own");
  assert.equal(all.settings.audio.sndTune.gain, 1, "an object default is spelled out");
  assert.deepEqual(all.changed, []);
});

test("a changed key carries its value, the default it replaced and the source that owns it", () => {
  const { collect } = boot({ disk: {
    "apex26.volMusic": "0.8", "apex26.pace": "14", "apex26.difficulty": JSON.stringify("normal"),
    "apex26.cockpitHalo": "0", "apex26.metricsSize": "l",
    "apex26.lightTune": JSON.stringify({ "monza|day|dry": { sunI: 1.2 } }),
    "apex26.camTune": JSON.stringify({ chase: { dist: 2 } }),
    "apex26.camTuneGlobal": JSON.stringify({ fov: 4 }),
    "apex26.camComfort": JSON.stringify({ bob: 0.3 }),
  } });
  const f = collect("changes");
  assert.deepEqual(f.changed.sort(), ["audio.volMusic", "camera.camComfort", "camera.camTune", "camera.camTuneGlobal", "camera.cockpitHalo", "driving.difficulty", "lighting.lightTune", "metrics.metricsSize", "steering.pace"]);
  assert.equal(f.settings.audio.volMusic, 0.8);
  assert.equal(f.defaults.audio.volMusic, 0.6, "SPEC mirrors the authoritative SettingsDefaults value");
  assert.equal(f.settings.steering.pace, 14);
  assert.equal(f.defaults.steering.pace, 11);
  // The halo SHIPS faired; "0" is what counts as a change now.
  assert.equal(f.settings.camera.cockpitHalo, "0", "a raw-lane value stays the string the panel wrote");
  assert.equal(f.defaults.camera.cockpitHalo, "fairing");
  assert.deepEqual(f.settings.lighting.lightTune, { "monza|day|dry": { sunI: 1.2 } });
  assert.deepEqual(f.settings.camera.camTune, { chase: { dist: 2 } });
  assert.deepEqual(f.settings.camera.camTuneGlobal, { fov: 4 });
  assert.deepEqual(f.settings.camera.camComfort, { bob: 0.3 });
  for (const name of f.changed) assert.match(f.where[name], /^js\//, name + " names its source");
  assert.equal(f.settings.driving.reliability, undefined, "an untouched key is absent from CHANGES");
});

test("a tuner that saves its whole table reports only the fields the player moved", () => {
  const { collect } = boot({ disk: {
    "apex26.sndTune": JSON.stringify({ gain: 1, bass: 0.9, air: 0.2 }),
    "apex26.sndLayers": JSON.stringify({ wind: true, turbo: true }),
    "apex26.voiceTune": JSON.stringify({ radio: { name: "Samantha", pitch: 1.1 } }),
  } });
  const f = collect("changes");
  assert.deepEqual(f.changed, ["audio.voiceTune", "audio.sndTune"], "audio tuners differ independently");
  assert.deepEqual(f.settings.audio.sndTune, { bass: 0.9 });
  assert.deepEqual(f.defaults.audio.sndTune, { gain: 1, bass: 0.5, air: 0.2 });
  assert.deepEqual(f.settings.audio.voiceTune, { radio: { name: "Samantha", pitch: 1.1 } });
  assert.deepEqual(f.defaults.audio.voiceTune, {}, "an absent channel uses the shipped voice/prosody defaults");
});

test("recorded voice choices and radio sound survive settings backup and restore", () => {
  const voiceTune = { radio: { pack: "michael" }, announcer: { pack: "bella" } };
  const file = boot({ disk: { "apex26.radioPreset": JSON.stringify("vintage"),
    "apex26.voiceTune": JSON.stringify(voiceTune) } }).collect("changes");
  const dst = boot();
  assert.equal(dst.loadSettings(file).skipped, 0);
  assert.equal(JSON.parse(dst.disk.get("apex26.radioPreset")), "vintage");
  assert.deepEqual(JSON.parse(dst.disk.get("apex26.voiceTune")), voiceTune);
  const bad = dst.loadSettings({ format: "apex26-settings-v1", settings: { audio: { radioPreset: "unknown" } } });
  assert.equal(bad.skipped, 1);
  assert.equal(JSON.parse(dst.disk.get("apex26.radioPreset")), "vintage");
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
  assert.equal(boot({ mobile: true }).collect("all").settings.display.gfxPreset, null, "unset: not this phone's default pinned");
  const f = boot({ mobile: true, disk: { "apex26.gfxPreset": JSON.stringify("medium") } }).collect("changes");
  assert.deepEqual(f.changed, [], "a phone on MEDIUM is at its default");
  assert.equal(boot({ mobile: true, disk: { "apex26.gfxPreset": JSON.stringify("medium") } }).collect("all").settings.display.gfxPreset, "medium", "a stored choice still exports");
});

test("SAVE ALL from a desktop does not pin desktop defaults on a phone", () => {
  const file = boot({ mobile: false }).collect("all");
  for (const k of ["resMode", "gfxPreset", "carWeight"]) {
    const g = Object.values(file.settings).find((grp) => Object.prototype.hasOwnProperty.call(grp, k));
    assert.equal(g[k], null, k + " exports unset");
  }
  const phone = boot({ mobile: true });
  phone.SettingsExport.applySettings(file, phone.G);
  assert.equal(phone.collect("all").settings.display.resMode, null, "the phone keeps its own resolution default");
});

test("unset gfxBackend exports as null on touch and desktop alike", () => {
  assert.equal(boot({ mobile: true }).collect("all").settings.display.gfxBackend, null);
  assert.equal(boot({ mobile: false }).collect("all").settings.display.gfxBackend, null);
  const f = boot({ mobile: true }).collect("changes");
  assert.deepEqual(f.changed, [], "unset backend is not a change from shipped default");
});

// The allowlist's literal defaults against the source that reads them: every
// `store.get("<key>", <default>)` in the owning file must agree with SPEC, and
// every source path must exist. A default moved in the source without the
// table following would make the file report a change that is none.
test("SPEC's defaults agree with the store.get reads in their source files", () => {
  const { SettingsExport } = boot();
  const authoritative = readDefaults().obj;
  let checked = 0;
  for (const row of SettingsExport.SPEC) {
    const file = row.src.split(" ")[0];
    assert.ok(fs.existsSync(path.join(ROOT, file)), row.k + ": " + file + " exists");
    if (row.lane !== "json" || typeof row.def === "function") continue;
    if (Object.prototype.hasOwnProperty.call(authoritative, row.k)) {
      assert.deepEqual(row.def, authoritative[row.k], row.k + ": SPEC must mirror SettingsDefaults");
      continue;
    }
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
  // REAL livery shapes, not placeholders: applyGarage now filters this array to
  // entries the garage can actually paint, so a fixture of bare numbers would
  // round-trip to [] and prove nothing about the round trip.
  "apex26.livery.custom.ferrari": JSON.stringify([
    { id: "custom_1", name: "Mine", c1: [0.8, 0, 0], c2: [1, 1, 1], stripe: [0, 0, 0] },
  ]),
  "apex26.setup.redbull": JSON.stringify({ arb: 2 }),
  // …and the same lesson for the custom team: `{ name: "X" }` has no `drivers`,
  // which applyGarage now refuses, so it would round-trip to nothing.
  "apex26.customTeam": JSON.stringify({ id: "custom", name: "X", drivers: [{ name: "You", code: "YOU", num: 99 }] }),
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
  assert.deepEqual(f.garage["livery.custom.ferrari"],
    [{ id: "custom_1", name: "Mine", c1: [0.8, 0, 0], c2: [1, 1, 1], stripe: [0, 0, 0] }],
    "the export carries the paint job verbatim — the SAVE side filters nothing");
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

test("settings backups preserve the announcer switch and radio effects in both modes", () => {
  for (const mode of ["all", "changes"]) {
    const source = boot({ disk: { "apex26.announcer": "false", "apex26.radioFx": "0.35" } });
    const saved = source.collect(mode);
    assert.equal(saved.settings.audio.announcer, false);
    assert.equal(saved.settings.audio.radioFx, 0.35);
    const target = boot();
    target.loadSettings(saved);
    assert.equal(target.disk.get("apex26.announcer"), "false");
    assert.equal(target.disk.get("apex26.radioFx"), "0.35");
  }
  const defaults = boot().collect("all").settings.audio;
  assert.equal(defaults.announcer, true);
  assert.equal(defaults.radioFx, 1);
});

test("restoring default motion restores OS preference following", () => {
  const saved = boot().collect("all");
  assert.equal(saved.settings.appearance.motion, null);
  const target = boot({ disk: { "apex26.motion": '"reduce"' } });
  target.loadSettings(saved);
  assert.equal(target.disk.get("apex26.motion"), "null");
  const bad = target.loadSettings({ format: "apex26-settings-v1", settings: {
    appearance: { motion: "unknown" }, driving: { steerMode: null },
  } });
  assert.equal(bad.skipped, 2, "only a nullable setting accepts null");
});

test("a refused raw reset is a storage failure, not an applied setting", () => {
  const target = boot({ disk: { "apex26.gfxBackend": "glx" }, store: { rawDel: () => false } });
  const result = target.loadSettings({ format: "apex26-settings-v1", settings: {
    display: { gfxBackend: null }, audio: { volMusic: 0.4 },
  } });
  assert.equal(result.failed, 1, "the UI must stay open instead of reloading");
  assert.equal(result.applied, 1, "only the successful volume write counts");
  assert.equal(result.skipped, 0);
  assert.equal(target.disk.get("apex26.gfxBackend"), "glx");
  assert.equal(target.disk.get("apex26.volMusic"), "0.4");
});

test("throwing storage is reported as failed for settings and garage imports", () => {
  const fail = () => { throw new Error("storage unavailable"); };
  const target = boot({ store: { set: fail, rawSet: fail, rawDel: fail } });
  const settings = target.loadSettings({ format: "apex26-settings-v1", settings: {
    audio: { volMusic: 0.4 }, camera: { cockpitHalo: "0" }, display: { gfxBackend: null },
  } });
  assert.deepEqual(settings, { ok: true, applied: 0, skipped: 0, failed: 3, reason: null });
  const garage = target.loadGarage({ format: "apex26-garage-v1", garage: { "parts.mercedes": { wing: 3 } } });
  assert.deepEqual(garage, { ok: true, applied: 0, skipped: 0, failed: 1, reason: null });
});

test("a difficulty the ladder does not name is skipped, not stored", () => {
  // typeOk() passes any string where the default is a string, so an imported
  // file carrying `"difficulty": "medium"` reached the store and game.js's
  // DIFF[difficulty] read undefined on the next race (every AI tick threw).
  // The row's `oneOf` is the allowlist; game.js also falls back to normal.
  const b = boot();
  const r = b.loadSettings({ format: "apex26-settings-v1", settings: { driving: { difficulty: "medium" }, audio: { volMusic: 0.3 } } });
  assert.equal(r.ok, true);
  assert.equal(r.skipped, 1, "an unknown difficulty is skipped, not written");
  assert.equal(b.disk.has("apex26.difficulty"), false);
  assert.equal(b.disk.get("apex26.volMusic"), "0.3", "and the rest of the file still applies");
  const r2 = b.loadSettings({ format: "apex26-settings-v1", settings: { driving: { difficulty: "easy" } } });
  assert.equal(r2.skipped, 0);
  assert.equal(b.disk.get("apex26.difficulty"), JSON.stringify("easy"), "a named level still round-trips");
});

test("the difficulty allowlist is exactly PhysicsConsts.DIFF's ladder", () => {
  const row = boot().SettingsExport.SPEC.find((r) => r.k === "difficulty");
  const src = fs.readFileSync(path.join(ROOT, "js/physics/consts.js"), "utf8");
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(src, ctx, { filename: "js/physics/consts.js" });
  assert.deepEqual(Array.from(row.oneOf), Object.keys(ctx.window.PhysicsConsts.DIFF), "SPEC's oneOf must name every DIFF level and nothing else");   // Array.from: vm arrays are another realm's Array
});

test("loading a garage file writes garage-shaped keys only", () => {
  const b = boot();
  const r = b.loadGarage({
    format: "apex26-garage-v1",
    garage: {
      "parts.mercedes": { wing: 3 },
      "livery.custom.ferrari": [1],
      customTeam: { id: "custom", name: "X", drivers: [{ code: "YOU" }] },
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
  const disk = {
    "apex26.volMusic": "0.8",
    "apex26.radioVoice": "true",
    "apex26.volRadio": "0.4",
    "apex26.voiceTune": JSON.stringify({ control: { name: "Daniel", rate: 1.2, pitch: 0.9 } }),
    "apex26.pace": "14",
    "apex26.cockpitHalo": "1",
  };
  const saved = boot({ disk }).collect("all");
  assert.equal(saved.settings.audio.radioVoice, true);
  assert.equal(saved.settings.audio.volRadio, 0.4);
  const b2 = boot();
  const r = b2.loadSettings(saved);
  assert.equal(r.ok, true);
  assert.equal(b2.disk.get("apex26.volMusic"), "0.8");
  assert.equal(b2.disk.get("apex26.radioVoice"), "true");
  assert.equal(b2.disk.get("apex26.volRadio"), "0.4");
  assert.deepEqual(JSON.parse(b2.disk.get("apex26.voiceTune")),
    { control: { name: "Daniel", rate: 1.2, pitch: 0.9 } });
  assert.equal(b2.disk.get("apex26.pace"), "14");
  assert.equal(b2.disk.get("apex26.cockpitHalo"), "1");
  const g1 = boot({ disk: GARAGE }).garage();
  const b3 = boot();
  assert.equal(b3.loadGarage(g1).applied, 7);
  assert.deepEqual(b3.garage().garage, g1.garage, "the garage file is its own fixed point");
});

/* A garage FILE is player input, and until now only its KEYS were checked. */

test("a malformed custom livery cannot reach the garage screen", () => {
  // buildLiveryOptions paints every row's swatch with cssCol(liv.c1), and
  // cssCol reads c[0] on whatever it is handed — so ONE entry without c1 threw
  // there and the LIVERY tab rendered nothing. A hand-edited, truncated or
  // half-merged file is the realistic way in, and this loader is the only door.
  const b = boot();
  const good = { id: "custom_1", name: "Keep", c1: [1, 0, 0], c2: [0, 0, 1], stripe: [1, 1, 1], finShape: "none" };
  const r = b.loadGarage({
    format: "apex26-garage-v1",
    garage: {
      "livery.custom.mclaren": [
        good,
        "oops",                                   // a bare string
        null,
        { id: "no_colours" },                     // the exact crash: no c1/c2
        { id: "bad_c1", c1: "red", c2: [0, 0, 1] },
        { c1: [1, 1, 1], c2: [0, 0, 0] },         // no id to key a cache on
        { id: "short", c1: [1, 0], c2: [0, 0, 1] },
        { id: "nan", c1: [1, 0, NaN], c2: [0, 0, 1] },
      ],
    },
  });
  assert.equal(r.ok, true);
  const kept = JSON.parse(b.disk.get("apex26.livery.custom.mclaren"));
  assert.equal(kept.length, 1, "only the sound paint job survives");
  assert.equal(kept[0].id, "custom_1");
  assert.deepEqual(kept[0].c1, [1, 0, 0], "and it survives intact, not sanitised into something else");
  assert.deepEqual(kept[0].stripe, [1, 1, 1], "optional colours are kept");
  assert.equal(kept[0].finShape, "none", "so are pills");
  // The property the crash needed: every stored entry answers cssCol.
  for (const l of kept) for (const c of [l.c1, l.c2]) {
    assert.ok(Array.isArray(c) && c.length >= 3 && c.every((n) => typeof n === "number" && isFinite(n)));
  }
});

// M26: the import was shape-checked but not BOUNDED, and enum-typed fields index plain objects.
const garageLiveries = (b, list) => {
  const r = b.loadGarage({ format: "apex26-garage-v1", garage: { "livery.custom.mclaren": list } });
  assert.equal(r.ok, true);
  return JSON.parse(b.disk.get("apex26.livery.custom.mclaren") || "[]");
};
const sound = (id, extra = {}) => Object.assign({ id, c1: [1, 0, 0], c2: [0, 0, 1] }, extra);

test("M26: an enum pill that names an Object.prototype member is dropped, not stored", () => {
  // Car3D finOf / FINISH_SURFACE and LiveryTex NUM_FONTS index plain tables: "constructor" resolved to an
  // inherited function and threw in every build of that team.
  const kept = garageLiveries(boot(), [sound("custom_1", { finShape: "constructor", numFont: "__proto__", finish: "toString", stripe: [1, 1, 1] })]);
  assert.equal(kept.length, 1, "the livery itself survives");
  for (const k of ["finShape", "numFont", "finish"]) assert.equal(Object.hasOwn(kept[0], k), false, k + " is dropped");
  assert.deepEqual(kept[0].stripe, [1, 1, 1], "its colours are untouched");
});

test("M26: the 32-livery cap is gone — the garage has none, the file-size gate is the bound", () => {
  const list = Array.from({ length: 500 }, (_, i) => sound("custom_" + i));
  const kept = garageLiveries(boot(), list);
  assert.equal(kept.length, 500, "33+ liveries survive");
  assert.equal(kept[499].id, "custom_499");
});

test("a garage file reports the livery rows it could not keep, never drops them quietly", () => {
  const b = boot();
  const list = [sound("a"), { id: "bad", c1: [1, 0], c2: [0, 0, 1] }, sound("b"), null, sound("c")];
  const r = b.loadGarage({ format: "apex26-garage-v1", garage: { "livery.custom.mclaren": list } });
  assert.equal(r.droppedLiveries, 2);
  assert.equal(JSON.parse(b.disk.get("apex26.livery.custom.mclaren")).length, 3);
  assert.equal(b.loadGarage({ format: "apex26-garage-v1", garage: { "livery.custom.mclaren": [sound("a")] } }).droppedLiveries, undefined, "a clean file adds no field");
});

test("M26: a livery id longer than 64 characters is dropped", () => {
  const kept = garageLiveries(boot(), [sound("a".repeat(64)), sound("a".repeat(65))]);
  assert.deepEqual(kept.map((l) => l.id.length), [64]);
});

test("M26: livery colours are clamped to 0..1", () => {
  const kept = garageLiveries(boot(), [sound("custom_1", { c1: [2.0, -5, 0.5], stripe: [1e9, 0, 1] })]);
  assert.deepEqual(kept[0].c1, [1, 0, 0.5]);
  assert.deepEqual(kept[0].stripe, [1, 0, 1]);
});

test("a garage value of the wrong shape is skipped, not written", () => {
  const b = boot();
  const r = b.loadGarage({
    format: "apex26-garage-v1",
    garage: {
      "livery.custom.ferrari": "not-an-array",
      "livery.mclaren": { id: "obj" },   // the fitted id is a string
      "parts.alpine": [1, 2, 3],         // a build is an object, not a list
      "setup.haas": null,
    },
  });
  assert.equal(r.ok, true);
  assert.equal(r.applied, 0, "none of those four are writable shapes");
  assert.equal(r.skipped, 4);
  for (const k of ["livery.custom.ferrari", "livery.mclaren", "parts.alpine", "setup.haas"]) {
    assert.equal(b.disk.has("apex26." + k), false, k + " must not be written");
  }
});

test("a sound garage file still loads whole", () => {
  // The filter must not start rejecting liveries the game would happily paint.
  // NOTE the customTeam here. This fixture used to read `{ name: "X" }` and
  // assert it applied — a team with no `drivers`, which is precisely the shape
  // that took boot down (see the four-singles test below). The suite's own idea
  // of "sound" contained the defect, which is most of why it survived.
  const b = boot();
  const liv = { id: "custom_9", name: "Mine", c1: [0.1, 0.2, 0.3], c2: [1, 1, 0],
                noseStripe: [0, 0, 0], spineHeight: "dorsal", wingCarbon: "carbon" };
  const team = { id: "custom", name: "X", drivers: [{ name: "You", code: "YOU", num: 99 }] };
  const r = b.loadGarage({
    format: "apex26-garage-v1",
    garage: { "livery.custom.mclaren": [liv], "livery.mclaren": "custom_9",
              "parts.mclaren": { wing: 3 }, customTeam: team },
  });
  assert.equal(r.skipped, 0, "nothing sound is skipped");
  assert.equal(r.applied, 4);
  assert.deepEqual(JSON.parse(b.disk.get("apex26.livery.custom.mclaren")), [liv], "kept verbatim");
  assert.deepEqual(JSON.parse(b.disk.get("apex26.customTeam")), team, "a real team is kept verbatim");
});

// THE FOUR SINGLES WERE THE ONE FAMILY THAT KEPT WHATEVER SHAPE IT ARRIVED IN.
// The liveries above have been shape-checked since the file was written, under
// a header saying a file is player input and the garage does not defend itself.
// `team`, `driver`, `customTeam` and `customLogo` fell through to a bare
// `return v` — and all four are read by code that defends itself no better:
// `team` indexes Teams.LIST, and `customTeam` is pushed into it whole, where
// SaveMigrate's seasonRoster() does `team.drivers.forEach(...)` at BOOT. So a
// garage file — the feature's own "LOAD GARAGE FILE" button — could hand the
// next start a TypeError before the menu painted. Same family as the
// `DIFF[difficulty]` crash of the same day, one door further out.
test("the four garage singles are shape-checked like the liveries", () => {
  const b = boot();
  const r = b.loadGarage({
    format: "apex26-garage-v1",
    garage: {
      team: "abc",                 // indexes Teams.LIST — "abc" passes < 0 || >= len
      driver: { oops: true },
      customTeam: {},              // pushed into Teams.LIST; .drivers.forEach() at boot
      customLogo: 7,
    },
  });
  assert.equal(r.ok, true, "the file is still a file — bad VALUES are skipped, not the lot");
  assert.equal(r.applied, 0);
  assert.equal(r.skipped, 4);
  for (const k of ["team", "driver", "customTeam", "customLogo"]) {
    assert.equal(b.disk.has("apex26." + k), false, k + " must not be written");
  }
  // …and the sound spellings of the same four still write.
  const b2 = boot();
  const good = { id: "custom", name: "Mine", drivers: [{ name: "You", code: "YOU", num: 7 }] };
  const r2 = b2.loadGarage({
    format: "apex26-garage-v1",
    garage: { team: 4, driver: 1, customTeam: good, customLogo: "data:image/png;base64,AA" },
  });
  assert.equal(r2.applied, 4, "a real garage file is untouched by the guard");
  assert.equal(r2.skipped, 0);
  assert.equal(JSON.parse(b2.disk.get("apex26.team")), 4);
});

// A SHAPE-SOUND TEAM CAN STILL CARRY A PAYLOAD. The shape check above keeps
// boot alive; it said nothing about what the fields HOLD. The customize dialog
// caps every field as it is typed (custom-team.js clean()), so the only way to
// a 5 000-character driver name, markup in a team name or a car number of 1e9
// was this door. aria-state.js paintOnOff once wrote such a name back through
// innerHTML (stored XSS, 2026-09-24) — escaped now; this is the second wall.
test("an imported custom team is rebuilt to the dialog's own limits", () => {
  const b = boot({ teams: true });
  const evil = {
    id: "not-custom", custom: false, tier: 99, engine: "E".repeat(500),
    name: "<img src=x onerror=alert(1)>" + "A".repeat(5000),
    short: "\u202eabcdefg", color: [5, -1, "x"], stats: { speed: 1e9 },
    livery: { finShape: "<script>" + "x".repeat(100), nested: { a: 1 }, stripe: [2, 0, 0] },
    extra: "<svg onload=alert(1)>",
    drivers: [
      { name: "\u0000Evil\u0007 <b>Name</b>" + "Z".repeat(100), code: "<script>", num: 1e9, onclick: "x" },
      { name: 42, code: null, num: -5.4 },
      { name: "Third", code: "TRD", num: 3 },
      null,
    ],
  };
  const r = b.loadGarage({ format: "apex26-garage-v1", garage: { customTeam: evil } });
  assert.equal(r.applied, 1, "a shape-sound team is written, repaired");
  const t = JSON.parse(b.disk.get("apex26.customTeam"));
  assert.equal(t.id, "custom", "the id syncCustomTeam() splices on is forced");
  assert.equal(t.custom, true);
  assert.deepEqual(Object.keys(t).sort(),
    ["color", "color2", "custom", "drivers", "engine", "id", "livery", "name", "short", "stats", "tier"],
    "unknown keys are dropped — only what the dialog writes survives");
  assert.ok(t.name.length <= 22 && t.name.startsWith("<img"), `name capped at 22: ${t.name}`);
  assert.equal(t.short, "ABCD", "short: bidi override stripped, capped at 4, upper-cased");
  assert.ok(t.engine.length <= 16);
  assert.equal(t.tier, 2);
  assert.deepEqual(t.color, [0.13, 0.79, 0.85], "a non-numeric colour falls back");
  assert.equal(t.stats.speed, 100, "stats clamp to 0..100");
  assert.ok(t.livery.finShape.length <= 32);
  assert.equal("nested" in t.livery, false, "nothing nested survives in a livery");
  assert.deepEqual(t.livery.stripe, [1, 0, 0], "rgb clamps to 0..1");
  assert.equal(t.drivers.length, 2, "the roster is bounded (a team has two seats)");
  const [d0, d1] = t.drivers;
  assert.deepEqual(Object.keys(d0).sort(), ["code", "name", "num"]);
  assert.ok(!/[\u0000-\u001f]/.test(d0.name), "control characters are stripped");
  assert.ok(d0.name.length <= 22 && d0.name.startsWith("Evil"), d0.name);
  assert.equal(d0.code, "<SC", "code capped at 3");
  assert.equal(d0.num, 99, "num clamps to 0..99");
  assert.equal(d1.name, "Your Name", "a non-string name falls back");
  assert.equal(d1.code, "YOU");
  assert.equal(d1.num, 0, "a negative num clamps to 0 as an integer");
  assert.ok(Number.isInteger(d1.num));
});

test("customLogo accepts only data:image/(png|jpeg|webp);base64 with a length cap", () => {
  const b = boot();
  const bad = b.loadGarage({
    format: "apex26-garage-v1",
    garage: {
      customLogo: "javascript:alert(1)",
      // also reject oversized payloads
    },
  });
  assert.equal(bad.applied, 0);
  assert.equal(bad.skipped, 1);
  const huge = "data:image/png;base64," + "A".repeat(400001);
  const over = b.loadGarage({ format: "apex26-garage-v1", garage: { customLogo: huge } });
  assert.equal(over.applied, 0, "over-cap data URL is skipped");
  const ok = b.loadGarage({
    format: "apex26-garage-v1",
    garage: { customLogo: "data:image/webp;base64,AAAA" },
  });
  assert.equal(ok.applied, 1);
  assert.equal(JSON.parse(b.disk.get("apex26.customLogo")), "data:image/webp;base64,AAAA");
});

test("steerMode / hudProfile / drivingLine rows carry oneOf allowlists", () => {
  const { SettingsExport } = boot();
  const byK = Object.fromEntries(SettingsExport.SPEC.map((r) => [r.k, r]));
  assert.deepEqual(Array.from(byK.steerMode.oneOf), ["tilt", "buttons", "touch"]);
  assert.deepEqual(Array.from(byK.hudProfile.oneOf), ["minimal", "standard", "broadcast"]);
  assert.deepEqual(Array.from(byK.drivingLine.oneOf), ["off", "corner", "full"]);
});

// BACKUP & RESTORE dropped TEXT SIZE, HIGH CONTRAST and SPEED UNITS (and the
// flyby shots / loading card) because nobody added their SPEC rows. Every
// store key APPEARANCE owns must be allowlisted, and a changed one must
// survive the round trip.
test("dockLayout is in SPEC and round-trips a per-scheme bag", () => {
  const bag = {
    tilt: { L: { x: 0, y: 0 }, R: { x: 0, y: 0 } },
    buttons: { L: { x: 0.2, y: 0.1 }, R: { x: -0.1, y: 0 } },
    touch: { L: { x: 0, y: 0 }, R: { x: 0, y: 0 } },
  };
  const { SettingsExport, collect } = boot({ disk: {
    "apex26.dockLayout": JSON.stringify(bag),
  } });
  const row = SettingsExport.SPEC.find((r) => r.k === "dockLayout");
  assert.ok(row, "dockLayout needs a SPEC row");
  assert.equal(row.group, "driving");
  const f = collect("changes");
  assert.deepEqual(f.settings.driving.dockLayout.buttons.L, bag.buttons.L);
  const b = boot();
  const res = b.loadSettings(f);
  assert.equal(res.ok, true);
  assert.equal(res.skipped, 0);
  assert.deepEqual(JSON.parse(b.disk.get("apex26.dockLayout")).buttons.L, bag.buttons.L);
});

test("every APPEARANCE store key is in SPEC and round-trips", () => {
  const src = read("js/ui/appearance-opts.js");
  const keys = [...src.matchAll(/const K_[A-Z_]+ = "([A-Za-z]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length >= 8, "found appearance-opts.js's K_* keys: " + keys.join(", "));
  // Store non-default values so CHANGES includes them (shipped: large / high).
  const { SettingsExport, collect } = boot({ disk: {
    "apex26.textSize": JSON.stringify("larger"), "apex26.uiContrast": JSON.stringify("off"),
    "apex26.speedUnits": JSON.stringify("mph"), "apex26.ldCard": JSON.stringify({ scale: 1.2, x: 4, y: -3 }),
    "apex26.flybyShots": JSON.stringify([{ id: "a" }]),
  } });
  const inSpec = new Set(SettingsExport.SPEC.map((r) => r.k));
  for (const k of keys) assert.ok(inSpec.has(k), k + " (js/ui/appearance-opts.js) needs a SPEC row");
  const f = collect("changes");
  assert.equal(f.settings.appearance.textSize, "larger");
  assert.equal(f.settings.appearance.uiContrast, "off");
  assert.equal(f.settings.appearance.speedUnits, "mph");
  assert.deepEqual(f.settings.camera.ldCard, { scale: 1.2, x: 4, y: -3 });
  assert.equal(f.settings.camera.flybyShots.length, 1);
  const b = boot();
  const res = b.loadSettings(f);
  assert.equal(res.ok, true);
  assert.equal(res.skipped, 0, "every row passes its oneOf / type check");
});

test("Home settings and bounded visual profiles survive settings backup without carrying unrelated state", () => {
  const profiles = [{ id: "profile-1", name: "Night", values: { homeScene: "night", homeCamera: "rear", uiScale: 109.25,
    titleLayout: { v: 2, wide: { btns: { x: 18 } } }, lookCareer: { density: "roomy" }, steering: "pro", account: "secret" } }];
  // backgroundMotion "still" differs from shipped ambient so CHANGES carries it.
  const a = boot({ appearance: true, disk: { "apex26.homeScene": '"pitlane"', "apex26.backgroundMotion": '"still"',
    "apex26.homeCamera": '"front"', "apex26.appearanceProfiles": JSON.stringify(profiles) } });
  for (const mode of ["all", "changes"]) {
    const file = a.collect(mode), b = boot({ appearance: true });
    assert.equal(b.loadSettings(file).skipped, 0);
    assert.equal(JSON.parse(b.disk.get("apex26.homeScene")), "pitlane");
    assert.equal(JSON.parse(b.disk.get("apex26.backgroundMotion")), "still");
    assert.equal(JSON.parse(b.disk.get("apex26.homeCamera")), "front");
    const values = JSON.parse(b.disk.get("apex26.appearanceProfiles"))[0].values;
    assert.equal(values.uiScale, 109.25); assert.equal(values.homeCamera, "rear");
    assert.equal(values.titleLayout.wide.btns.x, 18); assert.equal(values.lookCareer.density, "roomy");
    assert.equal(values.steering, undefined); assert.equal(values.account, undefined);
  }
  const file = a.collect("all");
  assert.equal(JSON.stringify(file).includes("secret"), false, "profile export must not leak unknown values");
});

test("appearance import rejects malformed bags and enums and clamps profile contents", () => {
  const b = boot({ appearance: true });
  const settings = appearance => ({ format: b.SettingsExport.FORMAT, settings: { appearance } });
  assert.equal(b.loadSettings(settings({ homeScene: "unknown", homeCamera: {}, backgroundMotion: "fast", appearanceProfiles: {} })).skipped, 4);
  const rows = [{ id: "safe", name: "A".repeat(100), values: { uiScale: 999, hudBtnOpacity: 0, homeScene: "unknown", lookCareer: { density: "bad" }, career: { money: 100 } } },
    { id: "safe", name: "Duplicate" }, { id: "<script>", name: "Bad" }, ...Array.from({ length: 20 }, (_, i) => ({ id: "p-" + i, name: "Profile " + i }))];
  assert.equal(b.loadSettings(settings({ appearanceProfiles: rows })).applied, 1);
  const saved = JSON.parse(b.disk.get("apex26.appearanceProfiles"));
  assert.ok(saved.length <= 12); assert.equal(new Set(saved.map(p => p.id)).size, saved.length);
  assert.equal(saved[0].name.length, 40); assert.equal(saved[0].values.uiScale, 200);
  assert.equal(saved[0].values.hudBtnOpacity, 20); assert.equal(saved[0].values.homeScene, "photo");
  assert.equal(saved[0].values.lookCareer.density, "auto"); assert.equal(saved[0].values.career, undefined);
});

// ── THE CAREER FILE ──────────────────────────────────────────────────────────

const CAREER_SAVE = {
  v: 1, flavour: "driver", year: 2027, money: 4200, rep: 61, seat: 0, seed: 42,
  driver: { name: "Ada", code: "ADA", num: 7 },
  team: "mercedes",
  season: { round: 3, pts: { "mercedes:0": 25 }, teamPts: { mercedes: 25 }, driverCodes: {} },
  owned: ["wing_std"], fitted: { wing: "wing_std" },
  results: [{ round: 0, p: 1 }], history: [],
  dev: {}, tdev: {}, seats: {}, offers: [],
  budgetLvl: 1, facility: 0,
};

test("the career file carries the six slots and the live pointer, and nothing else", () => {
  const disk = Object.assign({}, POISON, GARAGE, {
    "apex26.career.driver.0": JSON.stringify(CAREER_SAVE),
    "apex26.career.myteam.1": JSON.stringify(Object.assign({}, CAREER_SAVE, { flavour: "myteam", team: "custom" })),
    "apex26.careerSlot": JSON.stringify("driver:0"),
  });
  const { career, collect, garage } = boot({ career: true, disk });
  const f = career();
  assert.equal(f.format, "apex26-career-v1");
  assert.equal(f.careers.careerSlot, "driver:0");
  assert.equal(f.careers["career.driver.0"].driver.code, "ADA");
  assert.equal(f.careers["career.myteam.1"].flavour, "myteam");
  assert.equal(f.careers["career.driver.0"].money, 4200);
  assert.ok(!("career.driver.1" in f.careers), "empty slots are omitted");
  assert.equal(f.count, 3);
  const text = JSON.stringify(f).replace(/"excluded":"[^"]*"/, "");
  assert.ok(!/SECRET|parts\.mercedes|spotify|ghost|ttlb|wss:/.test(text), "career export leaks nothing else");
  // SETTINGS and GARAGE still refuse career keys.
  assert.ok(!/"career\.driver/.test(JSON.stringify(collect("all")).replace(/"excluded":"[^"]*"/, "")));
  assert.ok(!/"career\.driver/.test(JSON.stringify(garage()).replace(/"excluded":"[^"]*"/, "")));
});

test("an empty store still produces a valid career file", () => {
  const f = boot({ career: true }).career();
  assert.equal(f.format, "apex26-career-v1");
  assert.deepEqual(f.careers, {});
  assert.equal(f.count, 0);
});

test("loading a career file migrates slots and refuses non-career keys", () => {
  const b = boot({ career: true });
  const r = b.loadCareer({
    format: "apex26-career-v1",
    careers: {
      "career.driver.0": { flavour: "driver", money: "not-a-number", driver: { name: "Ada", code: "ADA", num: 7 }, team: "mercedes" },
      "career.driver.9": CAREER_SAVE,           // out of range — not a career key
      "parts.mercedes": { wing: 9 },            // garage — must not write
      careerSlot: "myteam:2",
      "apex26.volMusic": 0.9,
    },
  });
  assert.equal(r.ok, true);
  assert.ok(r.applied >= 2, "slot + pointer applied");
  assert.ok(r.skipped >= 2, "out-of-range and garage keys skipped");
  const saved = JSON.parse(b.disk.get("apex26.career.driver.0"));
  assert.equal(typeof saved.money, "number", "migrateCareer coerced money");
  assert.equal(saved.v >= 1, true, "migrateCareer stamped CAREER_V");
  assert.equal(b.disk.get("apex26.careerSlot"), JSON.stringify("myteam:2"));
  assert.equal(b.disk.has("apex26.parts.mercedes"), false, "career loader never writes the garage");
  assert.equal(b.disk.has("apex26.volMusic"), false, "career loader never writes settings");
  assert.equal(b.disk.has("apex26.career.driver.9"), false);
});

test("a career file of the wrong shape is refused whole", () => {
  assert.equal(boot({ career: true }).loadCareer({ format: "apex26-garage-v1", careers: {} }).ok, false);
  assert.equal(boot({ career: true }).loadCareer(null).ok, false);
  for (const careers of [null, [], "bad", 3]) {
    assert.equal(boot({ career: true }).loadCareer({ format: "apex26-career-v1", careers }).ok, false);
  }
  assert.equal(boot({ career: true }).loadCareer({ format: "apex26-settings-v1", careers: {} }).ok, false);
});

test("career round-trip: export then import restores the slot through migrateCareer", () => {
  const src = boot({ career: true, disk: {
    "apex26.career.driver.0": JSON.stringify(CAREER_SAVE),
    "apex26.careerSlot": JSON.stringify("driver:0"),
  } });
  const file = src.career();
  const dst = boot({ career: true });
  const r = dst.loadCareer(file);
  assert.equal(r.ok, true);
  assert.equal(r.failed, 0);
  const got = JSON.parse(dst.disk.get("apex26.career.driver.0"));
  assert.equal(got.driver.code, "ADA");
  assert.equal(got.money, 4200);
  assert.equal(got.team, "mercedes");
  assert.equal(JSON.parse(dst.disk.get("apex26.careerSlot")), "driver:0");
});

test("careerRow injects file controls without a static shell id in index.html", () => {
  const src = read("js/ui/settings-export.js");
  assert.match(src, /function careerRow\(/);
  assert.match(src, /cr-career-save/);
  assert.match(src, /cr-career-load/);
  assert.equal(/id="cr-career-file"/.test(read("index.html")), false,
    "career file controls are injected — they must not add shellNodes");
  assert.match(read("js/career/career-ui.js"), /SettingsExport\.careerRow/);
});

function protectionUI(storage) {
  const dom = makeDom();
  const b = boot({ globals: { document: dom.document, navigator: { storage } } });
  b.SettingsExport.create(b.G);
  const row = b.SettingsExport.careerRow();
  return { button: row.children[2], status: row.children[3] };
}

test("save protection only requests persistence on a click and reports the actual grant", async () => {
  let requests = 0;
  const { button, status } = protectionUI({ persisted: async () => false,
    persist: async () => { requests++; return requests > 1; } });
  await new Promise(setImmediate);
  assert.equal(requests, 0);
  assert.match(status.textContent, /not enabled/);
  button.click(); await new Promise(setImmediate);
  assert.equal(requests, 1);
  assert.equal(button.disabled, false, "a denied request must not claim protection");
  assert.match(status.textContent, /not enabled/);
  button.click(); await new Promise(setImmediate);
  assert.equal(button.disabled, true);
  assert.match(status.textContent, /protection is enabled/);
  assert.match(status.textContent, /Clearing site data still removes saves/);
});

test("unsupported and rejected persistence APIs retain an actionable backup reminder", async () => {
  const unavailable = protectionUI(undefined);
  assert.equal(unavailable.button.disabled, true);
  assert.match(unavailable.status.textContent, /Save a career file/);
  const broken = protectionUI({ persisted() { throw Error("blocked"); }, persist() { throw Error("blocked"); } });
  await Promise.resolve();
  assert.equal(broken.button.disabled, false);
  broken.button.click(); await Promise.resolve();
  assert.match(broken.status.textContent, /could not be confirmed/);
  assert.match(broken.status.textContent, /separate backup/);
});

test("BUILD IN BACKGROUND: a pause > SETTINGS row on the key the build worker reads, ON by default", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /<div id="pm-buildworker" class="set-row"[\s\S]*?<select id="pm-buildworker-sel"/, "a static SettingRow in the renderer levers");
  const client = fs.readFileSync(path.join(root, "js/track/build-client.js"), "utf8");
  assert.match(client, /SettingRow\.wire\("pm-buildworker", \{ values: SettingRow\.labels\(\["off", "on"\]\)/);
  assert.match(client, /else document\.addEventListener\("DOMContentLoaded", initUI/, "wired after js/ui/setting-row.js has loaded");
  const reg = fs.readFileSync(path.join(root, "js/ui/settings-export.js"), "utf8");
  assert.match(reg, /\{ k: "buildWorker", lane: "raw", group: "display", def: "1",/, "exported and imported with the other settings, default ON");
});

// ── round 2: SEC2-2 (file caps), M6 (resMode default) ────────────────────────
test("M6: the SPEC resMode default is UiScale.defaultResMode() when scale.js ships it", () => {
  const stored = { "apex26.resMode": JSON.stringify("low") };
  // A desktop UA whose primary pointer is coarse: the REAL default is LOW, isMobile says otherwise.
  const withHook = boot({ mobile: false, disk: stored, globals: { UiScale: { defaultResMode: () => "low" } } });
  assert.equal(withHook.collect("changes").changed.length, 0, "choosing the real default is not a change");
  const without = boot({ mobile: false, disk: stored });
  assert.equal(without.collect("changes").changed.length, 1, "no hook: today's isMobile expression");
  const phoneHook = boot({ mobile: true, disk: { "apex26.resMode": JSON.stringify("auto") }, globals: { UiScale: { defaultResMode: () => "auto" } } });
  assert.equal(phoneHook.collect("changes").changed.length, 0, "an Android phone with a fine pointer defaults to AUTO");
});

function pickerFile(b, button, file) {
  button.click(); button.click();
  const picker = b.dom.document.querySelector("input");
  picker.files = [file]; picker.onchange();
}

test("SEC2-2: LOAD SETTINGS / CAREER FILE refuse an oversized file before reading it", async () => {
  const b = bootImportUI({ career: true, globals: { CareerBackup: { MAX_BYTES: 5 * 1024 * 1024, revisionOf: () => 0 } } });
  const row = b.SettingsExport.careerRow();
  const careerBtn = row.children[1];
  assert.equal(careerBtn.id, "cr-career-load");
  let read = 0;
  const big = (size) => ({ size, text: () => { read++; return Promise.resolve("{}"); } });
  pickerFile(b, b.button, big(2 * 1024 * 1024));
  assert.equal(read, 0, "settings: 2 MB is never read");
  assert.match(b.button.textContent, /NOT A JSON FILE/);
  pickerFile(b, careerBtn, big(5 * 1024 * 1024 + 1));
  assert.equal(read, 0, "career: past CareerBackup.MAX_BYTES is never read");
  assert.match(careerBtn.textContent, /NOT A JSON FILE/);
  pickerFile(b, b.button, big(1000));
  await new Promise(setImmediate);
  assert.equal(read, 1, "a normal-sized file still reads");
});

test("SEC2-2: a career file with more than 16 bag keys is refused", () => {
  const b = boot({ career: true });
  const careers = {};
  for (let i = 0; i < 17; i++) careers["junk" + i] = i;
  const r = b.loadCareer({ format: "apex26-career-v1", careers });
  assert.equal(r.ok, false);
  assert.match(r.reason, /too many/);
  const ok = {};
  for (let i = 0; i < 16; i++) ok["junk" + i] = i;
  assert.equal(b.loadCareer({ format: "apex26-career-v1", careers: ok }).ok, true, "16 keys is within the cap (all skipped as non-career)");
});
