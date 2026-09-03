// circuit-def-fields — every field authored in js/circuits/<id>.js must either
// survive the copy into Tracks.LIST, or be named here as deliberately
// engine-only.
//
// WHY THIS EXISTS. `Tracks.LIST` is built by an explicit field-by-field copy of
// each authored def (js/track/tracks.js, `const def = {…}`). That is a good
// design — it keeps the built def a known shape rather than whatever a circuit
// file happened to set — but it has one failure mode, and the failure is
// SILENT: author a new field, read it off the built def, and it is `undefined`
// forever. Every consumer has a sensible fallback, so nothing throws, nothing
// logs, and the circuit simply renders as though the field had never been
// written.
//
// It has bitten twice. Once for `pal` (fixed, and documented in
// js/lighting/atmosphere.js). Then for FIVE more at once — sunAzimBias,
// sceneryTheme, sceneryThemeOverrides, ownPitStraight, undulate — which sat
// inert long enough that:
//   - six circuits' hand-tuned sun geography did nothing,
//   - Qatar silently fell back to `desert` and Albert Park to `permanent`,
//   - Singapore's theme overrides were never applied,
//   - and Monza's `ownPitStraight` opt-out did not opt out, so the generic
//     7-box pit fallback kept landing on the Tribuna Centrale — the exact bug
//     the field had been added to fix.
//
// Prose cannot hold this line: the whole trap is that the authored side and the
// copying side are 2,000 lines apart and neither one is wrong on its own. So
// this asserts it instead. A new authored field fails here until it is either
// copied through or explicitly declared engine-only below.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { buildContext } = require(path.join(ROOT, "tools/track/verify-track.cjs"));

// Fields the ENGINE consumes off the AUTHORED def and deliberately does not
// carry onto the built one. Each needs a reason, because "add it to the
// allow-list" is the easy way to reintroduce exactly the bug above — the
// question to answer is "is this read off `d`, or off `def`?".
const ENGINE_ONLY = {
  baseHW: "half-width input to realPoints()/applyHwZones, not read after build",
  pal: "raw palette input; built into def.palette by dayPal/nightPal",
};

test("every field a circuit authors survives the copy into Tracks.LIST", () => {
  const Tracks = buildContext();
  const ctx = Tracks._vmContext;
  const raw = ctx.TrackDefs;
  assert.ok(Array.isArray(raw) && raw.length, "circuits must register on TrackDefs");

  const missing = new Map();   // field -> [circuit ids]
  for (const d of raw) {
    const built = Tracks.LIST.find((t) => t.id === d.id);
    assert.ok(built, `${d.id} authored but absent from Tracks.LIST`);
    for (const key of Object.keys(d)) {
      if (Object.prototype.hasOwnProperty.call(ENGINE_ONLY, key)) continue;
      // `hasOwnProperty`, not truthiness: a field copied through as `false`,
      // `0` or `null` is copied. Only ABSENCE is the bug.
      if (Object.prototype.hasOwnProperty.call(built, key)) continue;
      if (!missing.has(key)) missing.set(key, []);
      missing.get(key).push(d.id);
    }
  }

  if (missing.size) {
    const lines = [...missing].map(([k, ids]) =>
      `  ${k}  — authored in ${ids.length} circuit(s): ${ids.slice(0, 6).join(", ")}` +
      (ids.length > 6 ? ", …" : ""));
    assert.fail(
      "circuit def field(s) dropped by the Tracks.LIST copy:\n" + lines.join("\n") +
      "\n\nEither copy it through in js/track/tracks.js (`const def = {…}`), or — if" +
      "\nthe engine only reads it off the AUTHORED def — add it to ENGINE_ONLY in" +
      "\nthis file with the reason. Do not add it to ENGINE_ONLY to make this pass:" +
      "\nif anything reads it off the BUILT def it will be undefined at runtime," +
      "\nsilently, and the circuit will render as though you never wrote it.");
  }
});

// The five that were actually dropped, pinned by value. The test above is the
// general guard; this one states the specific thing that was broken, so a
// regression reads as "Qatar lost its theme again" rather than as an abstract
// coverage failure.
test("the five once-dropped fields carry their authored values", () => {
  const Tracks = buildContext();
  const at = (id) => Tracks.LIST.find((t) => t.id === id);

  // Hand-tuned sun geography — inert in all six circuits while uncopied.
  for (const id of ["bahrain", "monza", "qatar", "silverstone", "spa", "suzuka"]) {
    assert.equal(typeof at(id).sunAzimBias, "number",
      `${id} authors sunAzimBias; it must reach the built def`);
  }

  // Qatar fell back to `desert`, Albert Park to `permanent`.
  assert.equal(at("qatar").sceneryTheme, "night-event");
  assert.equal(at("albert_park").sceneryTheme, "park");
  assert.equal(at("singapore").sceneryTheme, "street");

  // Singapore's overrides were always undefined at the consumer.
  assert.ok(at("singapore").sceneryThemeOverrides,
    "singapore authors sceneryThemeOverrides; it must reach the built def");

  // The generic 7-box pit fallback landed on Monza's Tribuna Centrale without
  // this, which is the thing the field exists to prevent.
  assert.equal(at("monza").ownPitStraight, true);
  assert.equal(at("spa").ownPitStraight, false, "unset must copy as false, not undefined");

  // No circuit currently opts out of undulation, but the hatch must be
  // reachable: buildCenterline reads `def.undulate !== false` off the BUILT def.
  assert.ok(Object.prototype.hasOwnProperty.call(at("monza"), "undulate"),
    "undulate must exist on the built def for the opt-out to be takeable");
});

// gpLaps — a REAL grand prix distance per circuit, derived from lengthKm by the
// actual regulation rather than the flat 57 the lap picker offered on all forty.
// Derived, so there is no authored table to fall out of step with lengthKm; the
// pin is that the derivation lands on the real races within the 1-dp rounding.
test("gpLaps is the circuit's real race distance, not a flat number", () => {
  const Tracks = buildContext();
  const at = (id) => Tracks.LIST.find((t) => t.id === id);

  // Fewest laps over 305 km (260 km at Monaco). lengthKm is stored to 1 dp, so
  // allow ±1 lap against the real figure.
  const near = (id, real) => {
    const g = at(id).gpLaps;
    assert.equal(typeof g, "number", `${id} must carry a derived gpLaps`);
    assert.ok(Math.abs(g - real) <= 1, `${id} gpLaps ${g} should be about ${real}`);
  };
  near("monaco", 78);        // the short-race exception — 260 km, not 305
  near("spa", 44);           // the longest lap, the fewest laps
  near("monza", 53);
  near("silverstone", 52);

  // The defect this replaced: one number for every circuit. Monaco and Spa must
  // not agree, or FULL is again a flat literal wearing a circuit's name.
  assert.notEqual(at("monaco").gpLaps, at("spa").gpLaps,
    "distinct-length circuits must get distinct race distances");
  // And every circuit's FULL must beat the 3-lap sprint default, or the picker's
  // top rung is below its own floor.
  for (const t of Tracks.LIST)
    assert.ok(t.gpLaps > 3, `${t.id} gpLaps ${t.gpLaps} must exceed the 3-lap floor`);
});

// The per-circuit data that used to live in js/track/ (geo-paths.js,
// markings.js, the id-keyed scenery-data tables) is now authored in the def,
// and the engine reads it OFF THE BUILT DEF — which is the trap above again,
// so pin the fold positively: every circuit carries its real centreline, its
// curated turns and its dressing rows, and the old id-keyed tables are gone.
test("the folded per-circuit data reaches the built def", () => {
  const Tracks = buildContext();
  const ctx = Tracks._vmContext;
  assert.equal(typeof ctx.CircuitPaths, "undefined", "CircuitPaths must not exist any more");
  assert.equal(typeof ctx.CircuitMarkings, "undefined", "CircuitMarkings must not exist any more");
  for (const k of ["BARRIER", "FURN", "KIT", "STYLES", "STAND_SETS"])
    assert.equal(ctx.TrackSceneryData[k], undefined, `TrackSceneryData.${k} must not exist any more`);
  assert.equal(Tracks.LIST.length, 40);
  for (const t of Tracks.LIST) {
    assert.ok(t.path && Array.isArray(t.path.pts) && t.path.pts.length > 50, `${t.id} must carry path.pts`);
    assert.ok(Number.isFinite(t.path.len) && t.path.len > 3000, `${t.id} must carry path.len`);
    assert.ok(Array.isArray(t.turns) && t.turns.length >= 8, `${t.id} must carry curated turns`);
    assert.ok(t.furniture && t.furniture.tree, `${t.id} must carry furniture`);
    assert.ok(t.kit && t.kit.rail, `${t.id} must carry kit`);
    assert.ok(Array.isArray(t.standSet) && t.standSet.length === 3, `${t.id} must carry a 3-family standSet`);
    assert.ok(!("segs" in t), `${t.id}: segs is gone — the def's path IS the centreline`);
  }
  // A def without a path is a build error that names the circuit, never a
  // silently different layout: re-evaluate tracks.js over a TrackDefs whose
  // monaco lost its path and touch the lazy `points` getter.
  const monaco = Tracks.LIST.find((t) => t.id === "monaco");
  assert.ok(monaco.barrier && monaco.cityStyle, "monaco authors barrier + cityStyle");
  const saved = ctx.TrackDefs;
  ctx.TrackDefs = saved.map((d) => (d.id === "monaco" ? Object.assign({}, d, { path: null }) : d));
  try {
    // Function-scoped so the file's top-level declarations do not collide
    // with the context's own; the re-built Tracks is handed out explicitly.
    const src = fs.readFileSync(path.join(ROOT, "js/track/tracks.js"), "utf8");
    const rebuilt = vm.runInContext("(function () {\n" + src + "\n; return Tracks; })()", ctx,
      { filename: "js/track/tracks.js" });
    const broken = rebuilt.LIST.find((t) => t.id === "monaco");
    assert.throws(() => broken.points, /circuit "monaco" has no `path`/);
  } finally {
    ctx.TrackDefs = saved;
  }
});
