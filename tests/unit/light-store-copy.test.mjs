/* light-store-copy.test.mjs — COPY ALL must land the right values on the right
 * profiles, and land NOTHING anywhere else.
 *
 * `LightStore.copyToTracks` (js/lighting/profiles.js) is the only operation in the
 * game that writes lighting profiles the player is not looking at: it takes the
 * condition on screen and spreads it to every other circuit at the same
 * time-of-day and weather. That makes two ordinary mistakes expensive rather than
 * annoying — a key built wrong writes 39 profiles nobody asked for, and a botched
 * revert leaves them there — so the fan-out is pinned here rather than left to a
 * browser spec that would notice only the source track.
 *
 * WHY A VM SUITE AND NOT A SPEC. The store is a pure function of (TUNE_DEFS,
 * window.LightPresets, the saved profiles, the live conditions), and every one of
 * those is an argument here: a five-knob registry and a three-track LIST make the
 * expected profile something you can write down, where in a browser it would be
 * 82 knobs against 255 shipped presets. Same idiom as tests/unit/camera-ride.test.mjs.
 *
 * The assertions are about RESOLUTION, not about the stored bytes: what each
 * target resolves to after the copy is the observable, and sparseness is checked
 * separately because it is a storage claim ("a copy does not stamp 40 copies of
 * the defaults into localStorage"), not a look claim.
 *
 * Run: node --test tests/unit/light-store-copy.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// The five knobs this file reasons about. `def` values are deliberately not all
// zero — a copy that dropped the default layer would still look right if they were.
const DEFS = [
  { id: "keyMul", def: 1, min: 0, max: 2 },
  { id: "ambientMul", def: 1, min: 0, max: 2 },
  { id: "ssrWetMul", def: 0.5, min: 0, max: 2, rebuild: true },
  { id: "lampLevel", def: 0.2, min: 0, max: 1 },
  { id: "rainCount", def: 300, min: 0, max: 2000, reinitRain: true },
];
const TRACKS = [
  { id: "bahrain", night: true },
  { id: "monza", night: false },
  { id: "spa", night: false },
];

/* light-store.js declares `const LightStore`, which lands in the context's
   lexical scope rather than on the global object — read it back by name. */
function loadStore({ presets = {}, saved = null, track = "bahrain", tod = "dusk", weather = "wet" } = {}) {
  const stored = { lightTune: saved };
  const state = {
    tod, weather,
    applied: 0, rainInits: 0,          // liveEffects call counts, asserted below
    get profilesInStore() { return stored.lightTune; },
  };
  const G = {
    store: {
      get: (k, d) => (stored[k] === undefined || stored[k] === null ? d : stored[k]),
      set: (k, v) => { stored[k] = JSON.parse(JSON.stringify(v)); },
    },
    clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)),
    get track() { return { def: TRACKS.find((t) => t.id === track) }; },
    get raceTimeOfDay() { return state.tod; },
    get raceWeather() { return state.weather; },
    get state() { return "race"; },
    applyRaceSettings: () => { state.applied++; },
    isWetRoad: () => true,
    initRainDrops: () => { state.rainInits++; },
  };
  const ctx = vm.createContext({
    window: { LightPresets: presets },
    LightTune: { TUNE_DEFS: DEFS, LT: {} },
    Tracks: { LIST: TRACKS },
    Math, JSON, Object, Array, Number, isFinite, console,
  });
  seedLog(ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/lighting/profiles.js"), "utf8"), ctx,
    { filename: "js/lighting/profiles.js" });
  const store = vm.runInContext("LightStore", ctx).create(G);
  const LT = vm.runInContext("LightTune.LT", ctx);
  // Switch the live conditions the way applyRaceSettings does: set, then re-apply.
  state.go = (t, tod_, wx) => { track = t; state.tod = tod_; state.weather = wx; store.apply(); };
  store.apply();
  return { store, LT, state, stored };
}

/** The profile map as plain data. The store's objects are built inside the vm
 *  realm, so a bare deepEqual against a literal fails on the prototype alone. */
function snap(h) { return JSON.parse(JSON.stringify(h.store.profiles)); }

/** What knob `id` resolves to for the given conditions, per the store itself. */
function resolved(h, trackId, tod, wx, id) {
  h.state.go(trackId, tod, wx);
  return h.LT[id];
}

test("edits mode copies this profile's overrides to every other track at the same time+weather", () => {
  const h = loadStore();
  h.store.set("ssrWetMul", 1.4);
  h.store.set("lampLevel", 0.8);
  const r = h.store.copyToTracks("edits");

  assert.equal(r.ok, true);
  assert.equal(r.mode, "edits");
  assert.equal(r.tracks, 2, "two other circuits in the fixture LIST");
  assert.equal(r.knobs, 2, "only the two knobs that were tuned");
  for (const t of ["monza", "spa"]) {
    assert.equal(resolved(h, t, "dusk", "wet", "ssrWetMul"), 1.4, t + " took the copied value");
    assert.equal(resolved(h, t, "dusk", "wet", "lampLevel"), 0.8);
  }
});

test("a copy touches no other condition, and not the track it came from", () => {
  const h = loadStore();
  h.store.set("ssrWetMul", 1.4);
  h.store.copyToTracks("edits");

  assert.equal(resolved(h, "bahrain", "dusk", "wet", "ssrWetMul"), 1.4, "the source is unchanged");
  // The same track at a different time, at different weather, and a target at a
  // different time — none of them is in the copy's key set.
  assert.equal(resolved(h, "monza", "night", "wet", "ssrWetMul"), 0.5);
  assert.equal(resolved(h, "monza", "dusk", "dry", "ssrWetMul"), 0.5);
  assert.equal(resolved(h, "bahrain", "dusk", "dry", "ssrWetMul"), 0.5);
});

test("edits mode merges — a target's own tuning survives for knobs the copy does not name", () => {
  const h = loadStore();
  h.state.go("monza", "dusk", "wet");
  h.store.set("keyMul", 0.4);              // monza's own edit, on the target condition
  h.state.go("bahrain", "dusk", "wet");
  h.store.set("ssrWetMul", 1.4);
  h.store.copyToTracks("edits");

  assert.equal(resolved(h, "monza", "dusk", "wet", "keyMul"), 0.4, "untouched knob kept");
  assert.equal(resolved(h, "monza", "dusk", "wet", "ssrWetMul"), 1.4, "copied knob applied");
});

test("full look overrides a target's shipped per-track preset; edits mode leaves it alone", () => {
  const presets = { "monza|dusk|wet": { keyMul: 0.3, lampLevel: 0.9 } };
  for (const mode of ["edits", "look"]) {
    const h = loadStore({ presets });
    h.store.set("ssrWetMul", 1.4);
    h.store.copyToTracks(mode);
    assert.equal(resolved(h, "monza", "dusk", "wet", "ssrWetMul"), 1.4);
    // keyMul is shipped for monza and untouched on bahrain, which is exactly the
    // knob the two modes disagree about.
    assert.equal(resolved(h, "monza", "dusk", "wet", "keyMul"), mode === "look" ? 1 : 0.3,
      mode + " mode got keyMul wrong");
    assert.equal(resolved(h, "monza", "dusk", "wet", "lampLevel"), mode === "look" ? 0.2 : 0.9);
  }
});

test("full look makes every track resolve identically at that time and weather", () => {
  const presets = {
    "*": { ambientMul: 1.1 },
    "bahrain|dusk|wet": { lampLevel: 0.6 },
    "monza|dusk|wet": { keyMul: 0.3 },
    "spa|dusk|wet": { rainCount: 900, ssrWetMul: 1.9 },
  };
  const h = loadStore({ presets });
  h.store.set("keyMul", 0.75);
  const r = h.store.copyToTracks("look");
  assert.equal(r.knobs, DEFS.length, "look mode sends the whole registry");

  const want = {};
  for (const d of DEFS) want[d.id] = resolved(h, "bahrain", "dusk", "wet", d.id);
  for (const t of ["monza", "spa"]) {
    const got = {};
    for (const d of DEFS) got[d.id] = resolved(h, t, "dusk", "wet", d.id);
    assert.deepEqual(got, want, t + " does not match the source look");
  }
});

test("a copy stores only what the target would not have resolved to anyway", () => {
  const presets = { "monza|dusk|wet": { keyMul: 0.3 } };
  const h = loadStore({ presets });
  h.store.set("ssrWetMul", 1.4);
  h.store.copyToTracks("look");
  const prof = h.store.profiles["monza|dusk|wet"];

  // Four of the five knobs sit at their default on the source, and monza resolves
  // to that default for three of them — those three are not worth a byte. keyMul
  // IS stored at its default value, because monza's shipped preset would win.
  assert.deepEqual(Object.keys(prof).sort(), ["keyMul", "ssrWetMul"]);
  assert.equal(prof.keyMul, 1, "the default, written explicitly to pull the shipped 0.3 down");
  // spa has no shipped preset, so a full-look copy of a default-valued knob is
  // pure noise there and the key should not exist at all.
  assert.deepEqual(Object.keys(h.store.profiles["spa|dusk|wet"]), ["ssrWetMul"]);
});

test("edits mode with nothing tuned copies nothing and says so", () => {
  const h = loadStore({ presets: { "bahrain|dusk|wet": { keyMul: 0.3 } } });
  const r = h.store.copyToTracks("edits");
  assert.deepEqual({ ok: r.ok, error: r.error, tracks: r.tracks }, { ok: false, error: "no-edits", tracks: 0 });
  assert.deepEqual(snap(h), {}, "a refused copy writes nothing");
  // The shipped value is NOT the player's edit: "copy my settings" with no
  // settings must not quietly spread light-presets.js around.
  assert.equal(resolved(h, "monza", "dusk", "wet", "keyMul"), 1);
});

test("undo restores every target exactly, including the ones that had no profile", () => {
  const h = loadStore();
  h.state.go("monza", "dusk", "wet");
  h.store.set("keyMul", 0.4);
  h.state.go("bahrain", "dusk", "wet");
  h.store.set("ssrWetMul", 1.4);
  const before = snap(h);

  const r = h.store.copyToTracks("look");
  assert.notDeepEqual(snap(h), before);
  assert.equal(h.store.restore(r.undo), true);
  assert.deepEqual(snap(h), before, "undo is exact");
  assert.ok(!("spa|dusk|wet" in h.store.profiles), "a key that did not exist does not come back as {}");
  assert.equal(resolved(h, "monza", "dusk", "wet", "keyMul"), 0.4);
});

test("the session 'default' time-of-day copies under the look it actually resolves to", () => {
  const h = loadStore({ tod: "default" });     // bahrain is a night circuit
  assert.equal(h.store.key(), "bahrain|night|wet");
  h.store.set("lampLevel", 0.7);
  const r = h.store.copyToTracks("edits");
  assert.equal(r.tod, "night");
  assert.deepEqual(Object.keys(r.undo).sort(), ["monza|night|wet", "spa|night|wet"]);
  // monza is a DAY circuit: its own "default" resolves to day, so the copy is
  // reachable there by picking NIGHT explicitly and not otherwise.
  assert.equal(resolved(h, "monza", "night", "wet", "lampLevel"), 0.7);
  assert.equal(resolved(h, "monza", "default", "wet", "lampLevel"), 0.2);
});

test("copying with no track loaded is refused rather than keyed on undefined", () => {
  const h = loadStore({ track: "nosuch" });
  assert.equal(h.store.key(), null);
  const r = h.store.copyToTracks("look");
  assert.deepEqual({ ok: r.ok, error: r.error }, { ok: false, error: "no-track" });
  assert.deepEqual(snap(h), {});
});

test("a copy does not disturb the live scene — no reapply, no rain reinit", () => {
  const h = loadStore();
  h.store.set("ssrWetMul", 1.4);
  h.store.set("rainCount", 800);
  const applied = h.state.applied, rains = h.state.rainInits;
  h.store.copyToTracks("look");
  // Only OTHER tracks were written, so LT cannot have moved: re-deriving the sky
  // or rebuilding the rain here would be pure cost on a 39-profile write.
  assert.equal(h.state.applied, applied);
  assert.equal(h.state.rainInits, rains);
});
