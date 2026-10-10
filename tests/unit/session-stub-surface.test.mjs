/* THE RACE-SESSION AND AUDIO STUBS ARE CONTRACTS — the net stub's guard
 * (net-stub-surface.test.mjs), applied to js/race/session-stub.js and
 * js/audio/stub.js.
 *
 * LAZY_RACE_SESSION and LAZY_AUDIO (tools/manifest.cjs) are not on the title's
 * script wall: until ensureRaceSession() / ensureAudio() land them, game.js
 * holds the stub instances (PitLane.create(G), RadioVoice.inert(), …) and
 * every always-loaded module that calls G.pits.<m>() calls the STUB. A member
 * the stub forgets is a TypeError — per frame, when it is hud.js — and no other
 * test sees it: every VM and browser test loads the real bundle before racing.
 *
 * So the required surface is derived from the CALL SITES, not a roster: every
 * always-loaded js/ file (the lazy bundles hold the real objects and are
 * skipped) is scanned for the stub globals' members (PitLane.X, GameAudio.X)
 * and for members of the stub INSTANCES — through G.<getter>, game.js's own
 * bindings, and a local alias (`const pit = G.pits`) within its block. Each
 * one must exist on the evaluated stub. Found missing (R3-SEAMS-3): commitFrac
 * and toEntry (hud.js, the tyre chip every frame and the minimap pit cue),
 * choices / ownedTyres / pickFor / selectNext (driving-coach.js pit picker).
 *
 * Not covered (declared): writes made to a stub instance before its bundle
 * lands (pits.setPinnedStops, raceRadio.setChat) still vanish when the ready
 * hook recreates the instance — a write-recording stub is a follow-up.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const M = require(join(ROOT, "tools/manifest.cjs"));
const STUBS = ["js/race/session-stub.js", "js/audio/stub.js"];
// LAZY_AGENT too, as in the net guard: the __apex surface probes the stubs
// itself (apex.js noAudio()) and its specs always load the real bundles.
const LAZY = new Set([...M.LAZY_RACE_SESSION, ...M.LAZY_AUDIO, ...M.LAZY_AGENT]);

// The stub files, evaluated as the title evaluates them.
const box = { window: {} };
box.window = box;
vm.createContext(box);
for (const f of STUBS) vm.runInContext(readFileSync(join(ROOT, f), "utf8"), box, { filename: f });
const stubGlobal = (n) => vm.runInContext(n, box);

const GLOBALS = [
  "Reliability", "Damage", "Duel", "RadioLines", "RaceFacts", "Spotter", "PitLane", "RaceEngineer",
  "RaceRadio", "SessionRecords", "StartLights", "MarshalPanels", "FlyingStart",
  "GameAudio", "GameAudioSignal", "GameAudioSoundtrack", "GameAudioRadioFx", "GameAudioToneModel",
  "CarSfx", "RivalAudio", "VoicePack", "RecordedAnnouncer", "DrivingCues", "RadioVoice", "Announcer", "AudioPanel",
];

// Each stub instance game.js holds until the bundle lands: its G getter, its
// game.js binding, and how game.js makes it.
const G0 = { els: {}, store: { get: (_k, d) => d, set() {} } };
const INSTANCES = [
  { getter: "pits", binding: "pits", make: () => stubGlobal("PitLane").create(G0) },
  { getter: "records", binding: "records", make: () => stubGlobal("SessionRecords").create(G0) },
  { getter: "raceRadio", binding: "raceRadio", make: () => stubGlobal("RaceRadio").create(G0) },
  { getter: "flyingStart", binding: "flyingStart", make: () => stubGlobal("FlyingStart").create(G0, {}) },
  { getter: "radio", binding: "radioVoice", make: () => stubGlobal("RadioVoice").inert() },
  { getter: "announcer", binding: "announcer", make: () => stubGlobal("Announcer").inert() },
  { getter: null, binding: "engineer", make: () => stubGlobal("RaceEngineer").create(G0) },
  { getter: null, binding: "startLights", make: () => stubGlobal("StartLights").create(G0) },
  { getter: null, binding: "marshalPanels", make: () => stubGlobal("MarshalPanels").create(G0) },
  { getter: null, binding: "carSfx", make: () => stubGlobal("CarSfx").create(G0) },
  { getter: null, binding: "rivalAudio", make: () => stubGlobal("RivalAudio").create(G0) },
];

function jsFiles(dir, out = []) {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) jsFiles(rel, out);
    else if (e.name.endsWith(".js")) out.push(rel);
  }
  return out;
}
// Always-loaded code: not a lazy bundle (it holds the real objects), not the stubs.
const SOURCES = jsFiles("js").filter((f) => !LAZY.has(f) && !STUBS.includes(f)).map((rel) => ({
  rel,
  // Strip comments so prose naming a method is not read as a call site.
  src: readFileSync(join(ROOT, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1"),
}));

const ID = "[A-Za-z_$][\\w$]*";
// `recv.member` reads (a spread `...G.pits` counts; `x.G.pits` does not), minus
// assignments (`AudioPanel._ensure = …` sets, it does not call) and minus
// members the file PROBES first (`typeof X.m`, `X.m &&`, `&& X.m)`, `X.m ?`):
// a feature test is the caller's own guard, so absence there is the design.
function members(src, recv, from = 0, to = src.length) {
  const out = [], probed = new Set();
  const re = new RegExp(`(?<![\\w$])(?<![^.]\\.)(typeof\\s+)?${recv}\\.(${ID})(?![\\w$])(?!\\s*=[^=])(\\s*(?:\\)|&&|\\|\\||\\?(?!\\.)))?`, "g");
  re.lastIndex = from;
  for (let m; (m = re.exec(src)) && m.index < to;) {
    if (m[1] || m[3]) probed.add(m[2]);
    else out.push(m[2]);
  }
  return out.filter((m) => !probed.has(m));
}
// The end of the block that encloses `at` (brace depth drops below its own).
function blockEnd(src, at) {
  let d = 0;
  for (let i = at; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") d++;
    else if (ch === "}" && --d < 0) return i;
  }
  return src.length;
}

/** member -> first file that reads it, for one stub instance. */
function instanceCalls(inst) {
  const hits = new Map();
  const add = (m, rel) => { if (!hits.has(m)) hits.set(m, rel); };
  for (const { rel, src } of SOURCES) {
    if (inst.getter) {
      for (const m of members(src, `G\\.${inst.getter}`)) add(m, rel);
      // `const pit = G.pits;` / `const pits = G.pits, inPit = …` — the alias, within its block.
      for (const a of src.matchAll(new RegExp(`(${ID})\\s*=\\s*G\\.${inst.getter}\\s*[,;)]`, "g"))) {
        for (const m of members(src, a[1], a.index, blockEnd(src, a.index))) add(m, rel);
      }
    }
    if (rel === "js/game.js") for (const m of members(src, inst.binding)) add(m, rel);
  }
  return hits;
}

for (const inst of INSTANCES) {
  test(`the stub ${inst.binding} instance answers every call site outside its lazy bundle`, () => {
    const obj = inst.make();
    assert.ok(obj && typeof obj === "object", `${inst.binding}: the stub must make an object`);
    const called = instanceCalls(inst);
    const missing = [...called].filter(([m]) => !(m in obj))
      .map(([m, where]) => `${inst.getter ? "G." + inst.getter : inst.binding}.${m} read in ${where} but the stub instance has no such member`);
    assert.deepEqual(missing, [], "a member the stub lacks is a TypeError the moment a session reaches it before the bundle lands");
  });
}

test("the PitLane stub instance answers the call sites R3-SEAMS-3 found (hud.js, driving-coach.js)", () => {
  const called = instanceCalls(INSTANCES[0]);
  for (const m of ["commitFrac", "toEntry", "choices", "ownedTyres", "pickFor", "selectNext"]) {
    assert.ok(called.has(m), `the scan must find G.pits.${m} (the alias walk is what finds hud.js's)`);
  }
  const p = INSTANCES[0].make();
  // The callers do not guard the RESULT either: .toFixed on commitFrac, .map on ownedTyres/choices.
  assert.equal(typeof p.commitFrac({}), "number");
  assert.equal(typeof p.toEntry({}), "number");
  assert.ok(Array.isArray(p.ownedTyres()) && Array.isArray(p.choices()));
});

test("the stub globals answer every member read outside their lazy bundles", () => {
  const missing = [];
  let n = 0;
  for (const name of GLOBALS) {
    const g = stubGlobal(name);
    assert.ok(g && (typeof g === "object" || typeof g === "function"), `${name} stub`);
    for (const { rel, src } of SOURCES) {
      for (const m of members(src, name)) {
        n++;
        if (!(m in g)) missing.push(`${name}.${m} read in ${rel} but the stub has no such member`);
      }
    }
  }
  assert.ok(n >= 50, `expected to find stub-global reads; found ${n}`);
  assert.deepEqual([...new Set(missing)], [], "a stub global missing a member read by an always-loaded module");
});

test("RadioVoice.inert() carries sayPreRace like the real inert (loading-screen radioCheck asks for it by name)", () => {
  assert.equal(typeof stubGlobal("RadioVoice").inert().sayPreRace, "function");
  assert.equal(stubGlobal("RadioVoice").inert().sayPreRace("x", 1, 0), false);
});
