// circuit-def-fields — every field authored in js/circuits/<id>.js must either
// survive the copy into Tracks.LIST, or be named here as deliberately
// engine-only.
//
// WHY THIS EXISTS. `Tracks.LIST` is built by an explicit field-by-field copy of
// each authored def (js/track/core/def.js `fromRaw`). That is a good
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
import { absSrc } from "../helpers/abs-src.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { buildContext } = require(path.join(ROOT, "tools/track/verify-track.cjs"));

test("Zolder preserves the measured Sterrenwacht drop and transverse falls across the start-line change", () => {
  const tracks = buildContext();
  const def = tracks.LIST.find(circuit => circuit.id === "zolder");
  const road = tracks.buildCenterline(def, { line: false });
  // These are world stations from the DHMV II survey. They keep their
  // identity when the old lap zero or a numbered turn changes.
  const station = (x, z) => tracks.project(road, x, z).s;
  const yAt = (s) => {
    const sampled = { p: [0, 0, 0], r: [0, 0, 0], t: [0, 0, 0] };
    tracks.sample(road, s, sampled);
    return sampled.p[1];
  };
  const reference = station(-190.18, 134.80);
  const sterrenwacht = station(240.01, -623.58);
  const terlamen = station(-189.62, 653.73);
  const drop = yAt(reference) - yAt(sterrenwacht);
  assert.ok(Math.abs(drop - 4.64) < 0.35, `Sterrenwacht drop: ${drop} m`);
  for (const [s, measured] of [[sterrenwacht, -0.36], [terlamen, -0.55]]) {
    const rise = tracks.banking(road, s, 4, {}).dy - tracks.banking(road, s, -4, {}).dy;
    assert.ok(Math.abs(rise - measured) < 0.08, `Crossfall at ${s} m: ${rise} m`);
  }
});

test("Zolder starts at the surveyed stripe with a straight grid and pit rejoin", () => {
  const tracks = buildContext(), { TrackMesh, TrackPit } = tracks._vmContext;
  const def = tracks.LIST.find(circuit => circuit.id === "zolder");
  const road = tracks.buildCenterline(def, { line: false });
  // Flemish orthophoto at 50.989037 N, 5.255728 E, projected into the OSM frame.
  const stripe = [128.36, -151.64];
  assert.ok(Math.hypot(road.px[0] - stripe[0], road.pz[0] - stripe[1]) < 2);
  assert.ok(road.tx[0] > 0.8 && road.tz[0] < -0.5, "runs southwest towards Eerste Linkse");
  const grid = Array.from({ length: 24 }, (_, i) => TrackMesh.gridSlot(road, i));
  assert.equal(road.total - grid[0].s, 14);
  assert.equal(road.total - grid.at(-1).s, 198);
  assert.ok(grid.every(slot => Math.abs(tracks.curvature(road, slot.s)) < 0.002));
  const pit = TrackPit.build(road, def, tracks.curvature);
  assert.equal(pit.side, 1);
  assert.equal(pit.row.boxes.length, 12);
  const firstTurn = def.turns[0] * road.total;
  assert.ok(pit.sA < pit.sIn && pit.sOut < pit.sB && pit.sB < firstTurn);
  assert.ok(Math.abs(tracks.curvature(road, pit.sB)) < 0.002, "pit exit joins the straight before T1");
  assert.ok(def.sectors[0] > 0 && def.sectors[0] < def.sectors[1] && def.sectors[1] < 1);
  assert.ok(def.sectors.every(f => Math.abs(tracks.curvature(road, f * road.total)) < 0.002));
});

// Fields the ENGINE consumes off the AUTHORED def and deliberately does not
// carry onto the built one. Each needs a reason, because "add it to the
// allow-list" is the easy way to reintroduce exactly the bug above — the
// question to answer is "is this read off `d`, or off `def`?".
const ENGINE_ONLY = {
  baseHW: "half-width input to realPoints()/applyHwZones, not read after build",
  pal: "raw palette input; built into def.palette by dayPal/nightPal",
  crossover: "read by tests/helpers/circuit-crossovers.js off the authored def; the engine never reads it",
};

test("Okayama carries Attwood’s measured right-edge fall through the exit", () => {
  const tracks = buildContext();
  const def = tracks.LIST.find(circuit => circuit.id === "okayama");
  const road = tracks.buildCenterline(def, { line: false });
  // GSI laser DEM transects, 4 m each side of the centreline.
  for (const [fraction, measured] of [[0.867, -0.4], [0.895, -0.5], [0.92, -0.4]]) {
    const distance = fraction * road.total;
    const fall = tracks.banking(road, distance, 4, {}).dy - tracks.banking(road, distance, -4, {}).dy;
    assert.ok(Math.abs(fall - measured) < 0.1, `Attwood at ${fraction}: ${fall} m`);
  }
});

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

  assert.ok(Object.prototype.hasOwnProperty.call(at("monza"), "undulate"),
    "the explicit procedural ripple setting reaches the built def");
});

// Catalog hygiene: sceneryTheme is only for NON-DEFAULT themes. build-props
// resolves `def.sceneryTheme || (street ? "street" : theme === "desert" ?
// "desert" : "permanent")`, so authoring the fallback value is dead metadata
// with no runtime effect. Parked rows below ship today. Dropping one edits
// js/circuits/<id>.js; do not widen this allow-list.
const REDUNDANT_SCENERY_THEME = {
  bahrain: "desert matches theme→desert fallback",
  silverstone: "permanent matches non-street/non-desert fallback",
  singapore: "street matches street:true fallback (overrides still needed)",
};

test("sceneryTheme is authored only when it differs from the engine fallback", () => {
  const Tracks = buildContext();
  const redundant = [];
  const parkedGone = [];
  for (const d of Tracks._vmContext.TrackDefs) {
    if (d.sceneryTheme == null) {
      if (Object.prototype.hasOwnProperty.call(REDUNDANT_SCENERY_THEME, d.id))
        parkedGone.push(d.id);
      continue;
    }
    const fallback = d.street ? "street" : d.theme === "desert" ? "desert" : "permanent";
    if (d.sceneryTheme !== fallback) continue;
    if (REDUNDANT_SCENERY_THEME[d.id]) continue;
    redundant.push(`${d.id}: sceneryTheme "${d.sceneryTheme}"`);
  }
  assert.deepEqual(redundant, [],
    "omit sceneryTheme when it matches the street/desert/permanent fallback (or park it in REDUNDANT_SCENERY_THEME with a reason)");
  assert.deepEqual(parkedGone, [],
    "a parked redundant sceneryTheme was removed — drop it from REDUNDANT_SCENERY_THEME");
});

// Catalog hygiene: one TrackDefs id per authored file; no silent double-push.
test("each circuit file pushes exactly one TrackDefs row and ids are unique", () => {
  const Tracks = buildContext();
  const raw = Tracks._vmContext.TrackDefs;
  const byId = new Map();
  for (const d of raw) {
    assert.ok(d && typeof d.id === "string" && d.id, "every TrackDefs row needs an id");
    if (byId.has(d.id)) byId.get(d.id).push(d);
    else byId.set(d.id, [d]);
  }
  const dups = [...byId].filter(([, rows]) => rows.length > 1).map(([id, rows]) => `${id}×${rows.length}`);
  assert.deepEqual(dups, [], "duplicate TrackDefs ids");
  const shipped = require(path.join(ROOT, "tools/manifest.cjs")).CIRCUITS;
  assert.equal(byId.size, shipped.length, "TrackDefs id count must match CIRCUITS");
  for (const id of shipped) assert.ok(byId.has(id), `missing TrackDefs id ${id}`);
});

// Catalog hygiene: modelGroup ids must be unique inside a scenery file.
// Comments that quote modelGroup("…") are ignored (they are not calls).
test("no scenery file registers the same modelGroup id twice", () => {
  const dir = path.join(ROOT, "js", "circuits", "scenery");
  const bad = [];
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".js"))) {
    let src = fs.readFileSync(path.join(dir, f), "utf8");
    src = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const ids = [...src.matchAll(/modelGroup\(\s*["']([^"']+)["']/g)].map((m) => m[1]);
    const seen = new Set();
    for (const id of ids) {
      if (seen.has(id)) bad.push(`${f}: modelGroup "${id}"`);
      else seen.add(id);
    }
  }
  assert.deepEqual(bad, [], "rename one of the duplicate modelGroup calls");
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

  // lengthKm's rounding puts six circuits a lap off the real race, and three
  // classics store their projected trace length (#5316 CIRC1-06), so they
  // carry an authored `gpLaps` (def.js fromRaw). Exact, not ±1.
  for (const [id, laps] of [["monaco", 78], ["singapore", 62], ["zandvoort", 72], ["catalunya", 66], ["portimao", 66], ["madrid", 57],
    ["buenos_aires", 72], ["donington", 76], ["dijon", 80]])
    assert.equal(at(id).gpLaps, laps, `${id} race distance`);

  // The defect this replaced: one number for every circuit. Monaco and Spa must
  // not agree, or FULL is again a flat literal wearing a circuit's name.
  assert.notEqual(at("monaco").gpLaps, at("spa").gpLaps,
    "distinct-length circuits must get distinct race distances");
  // And every circuit's FULL must beat the 3-lap sprint default, or the picker's
  // top rung is below its own floor.
  for (const t of Tracks.LIST)
    assert.ok(t.gpLaps > 3, `${t.id} gpLaps ${t.gpLaps} must exceed the 3-lap floor`);
});

// THE TITLE'S STUB MUST SAY THE SAME. Until ensureCircuit() hydrates it, a
// circuit in Tracks.LIST is built from its GENERATED meta stub
// (tools/gen/gen-circuit-meta.mjs → js/track/circuit-meta.js), and RACE
// SETTINGS reads FULL (gpLaps) off that stub. Without `gpLaps` in META_KEYS,
// fromRaw re-derived the five overrides above a lap off — Monaco 79,
// Zandvoort 71 — until the payload landed (R3-SEAMS-1). Boot TRACK_VM the way
// the title does, over the generator's own output (gen:check pins the file to it).
test("the title's meta stubs carry the menu fields their hydrated defs do (gpLaps included)", async () => {
  const { generate, META_KEYS } = await import(path.join(ROOT, "tools/gen/gen-circuit-meta.mjs"));
  const M = require(path.join(ROOT, "tools/manifest.cjs"));
  const sb = { console, Math, Date, JSON, performance: { now: () => 0 } };
  sb.window = sb; sb.self = sb; sb.GLX = { isMobile: false };
  vm.createContext(sb);
  for (const f of M.TRACK_VM) {
    const src = f === "@circuits" ? generate() : fs.readFileSync(path.join(ROOT, f), "utf8");
    vm.runInContext(src, sb, { filename: absSrc(f === "@circuits" ? M.CIRCUIT_META : f) });
  }
  const stubs = vm.runInContext("Tracks", sb).LIST;
  const full = buildContext().LIST;
  const at = (id) => stubs.find((t) => t.id === id);
  for (const [id, laps] of [["monaco", 78], ["singapore", 62], ["zandvoort", 72], ["catalunya", 66], ["portimao", 66], ["madrid", 57],
    ["buenos_aires", 72], ["donington", 76], ["dijon", 80]]) {
    assert.ok(at(id) && at(id)._metaOnly, `${id} boots as a meta stub`);
    assert.equal(at(id).gpLaps, laps, `${id}: the title's FULL race distance`);
  }
  // Every meta key, and gpLaps, reads the same before and after hydration.
  const drift = [];
  for (const d of full) {
    const s = at(d.id);
    if (!s) { drift.push(d.id + ": no meta stub"); continue; }
    for (const k of new Set([...META_KEYS, "gpLaps"]))
      if (JSON.stringify(s[k]) !== JSON.stringify(d[k])) drift.push(`${d.id}.${k}: stub ${JSON.stringify(s[k])} vs hydrated ${JSON.stringify(d[k])}`);
  }
  assert.deepEqual(drift, [], "a menu reading the title's stub sees a different circuit than the race");
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
  // #3298: KIT_DEF's per-theme rows were identical copies of each emitter's
  // own default and never selected (every circuit ships `kit`); api.kitOf now
  // falls straight from def.kit to the emitter default.
  assert.equal(ctx.TrackSceneryData.KIT_DEF, undefined, "TrackSceneryData.KIT_DEF must not exist any more");
  // The SHIPPED roster. A `custom` entry is one the track designer registered
  // from the player's own storage (js/editor/custom-tracks.js); it is appended
  // after the shipped roster and never counts here. The roster is the manifest's
  // CIRCUITS list, not a typed number.
  const shipped = require(path.join(ROOT, "tools/manifest.cjs")).CIRCUITS;
  assert.deepEqual(Array.from(Tracks.LIST.filter((t) => !t.custom), (t) => t.id).sort(), [...shipped].sort());
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
      { filename: absSrc("js/track/tracks.js") });
    const broken = rebuilt.LIST.find((t) => t.id === "monaco");
    assert.throws(() => broken.points, /circuit "monaco" has no `path`/);
  } finally {
    ctx.TrackDefs = saved;
  }
});

// ── elevation provenance for the OSM-imported circuits ─────────────────────
// Every circuit recovered from OpenStreetMap (tools/track/osm-circuits.json) has
// no authored `elevations`; its relief comes from the SRTM bake in
// js/track/circuit-elevations.js — or it is flat ON PURPOSE. Korea is the flat
// one: the SRTM bake predates circuit construction. Until road heights are
// available, its def uses the engine's `undulate: false` hatch (the only circuit
// that does). Before 2026-09-22 it had neither, and buildCenterline laid a
// 0.14 m procedural ripple under a scenery header that says "dead flat".
// A new OSM import must land in one column or the other, never in neither.
test("every OSM-imported circuit is either surveyed or explicitly flat", () => {
  const vm = require("node:vm");
  const Tracks = buildContext();
  const at = (id) => Tracks.LIST.find((t) => t.id === id);
  const osm = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/track/osm-circuits.json"), "utf8"));
  const ids = Object.keys(osm.circuits || osm);
  assert.ok(ids.length >= 12, `osm-circuits.json lists ${ids.length} circuits`);
  const elev = vm.runInNewContext(fs.readFileSync(path.join(ROOT, "js/track/circuit-elevations.js"), "utf8") + ";CircuitElevations", {}, { filename: absSrc("js/track/circuit-elevations.js") });
  const neither = ids.filter((id) => !(Array.isArray(elev[id]) && elev[id].length > 0) && at(id) && at(id).undulate !== false);
  assert.deepEqual(neither, [], "an OSM circuit with no SRTM profile must declare undulate: false (or bake one)");
  assert.equal(at("korea").undulate, false, "korea intentionally uses the flat fallback");
  assert.ok(!elev.korea, "korea carries no profile — the bake declined it (0.00 m of relief)");
  // Flat means flat: the built centreline must carry no ripple at all.
  const built = Tracks.build(at("korea"));
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < built.py.length; i++) { if (built.py[i] < lo) lo = built.py[i]; if (built.py[i] > hi) hi = built.py[i]; }
  assert.ok(hi - lo < 1e-6, `korea's centreline relief must be 0, got ${(hi - lo).toFixed(4)} m`);
});

// A zero-length segment in a shipped trace (nurburgring pts[130] == pts[131]
// until 2026-10-04) is harmless on a straight and a NaN tangent anywhere else.
// The designer rejects spacing under 8 m; shipped data had no check at all.
// The fix for a duplicate is to NUDGE it, never delete it: startFrac,
// sceneryStartFrac and hwZones count vertices.
test("no circuit trace has two control points closer than 1 m", () => {
  const Tracks = buildContext();
  const close = [];
  for (const d of Tracks._vmContext.TrackDefs) {
    const P = d.path && d.path.pts;
    if (!P) continue;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      const gap = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (gap < 1) close.push(`${d.id} pts[${i}]→[${(i + 1) % P.length}] ${gap.toFixed(2)} m`);
    }
  }
  assert.deepEqual(close, [], "nudge the duplicate along the trace; never delete a vertex");
});

test("Kyalami follows the surveyed terrain on both sides of the Leeukop crest", () => {
  const tracks = buildContext();
  const def = tracks.LIST.find(circuit => circuit.id === "kyalami");
  const road = tracks.buildCenterline(def, { line: false });
  const height = fraction => road.py[Math.round(fraction * road.n)];
  const crest = height(def.turns[9]);
  // Copernicus and SRTM estimates bound these stations on the approach
  // and the descent into Mineshaft. Their horizontal cells span about 30 m.
  assert.ok(Math.abs(crest - height(28 / 48) - 14.5) < 2);
  assert.ok(Math.abs(crest - height(35 / 48) - 30.5) < 3);
});

// Sector splits drive split times, the HUD sector colours and marshal panels;
// 28 circuits had none and fell back to thirds. Each def now names its own.
test("every circuit names two ascending sector splits", () => {
  const Tracks = buildContext();
  const bad = [];
  for (const def of Tracks.LIST) {
    const s = def.sectors;
    if (!Array.isArray(s) || s.length !== 2) { bad.push(`${def.id}: ${JSON.stringify(s)}`); continue; }
    if (!(s[0] > 0.15 && s[1] < 0.85 && s[1] - s[0] > 0.15)) bad.push(`${def.id}: ${JSON.stringify(s)} not ~thirds`);
  }
  assert.deepEqual(bad, []);
});

// A timing line inside a corner flips S1/S2 colours mid-turn. Nine circuits
// shipped the default [0.3, 0.62] (or a near copy) with a line in a tight
// corner; each is now snapped onto a |k| < 0.0035 stretch. Gate: no line within
// 20 m of a corner tighter than R = 67 m.
test("no sector timing line sits inside a corner", () => {
  const Tracks = buildContext();
  const bad = [];
  for (const def of Tracks.LIST) {
    const tr = Tracks.buildCenterline(def, { line: false });
    const L = tr.total, wrap = (v) => ((v % L) + L) % L;
    def.sectors.forEach((f, i) => {
      let pk = 0;
      for (let d = -20; d <= 20; d += 4) pk = Math.max(pk, Math.abs(Tracks.curvature(tr, wrap(f * L + d))));
      if (pk > 0.015) bad.push(`${def.id} S${i + 1}@${f}: R ${(1 / pk).toFixed(0)} m`);
    });
  }
  assert.deepEqual(bad, [], "snap the split to the nearest stretch with |k| < 0.0035");
});

test("Watkins Glen final turn reproduces the bank across its central eight metres", () => {
  const tracks = buildContext();
  const def = tracks.LIST.find(circuit => circuit.id === "watkins_glen");
  const track = tracks.buildCenterline(def, { line: false });
  const distance = def.turns[10] * track.total;
  const rise = tracks.banking(track, distance, 4, {}).dy - tracks.banking(track, distance, -4, {}).dy;
  // USGS 1 m surface: right 484.863 m, left 485.612 m. A modern proxy for the historic bank.
  assert.ok(Math.abs(rise + 0.749) < 0.12, `T11 crossfall over eight metres: ${rise} m`);
});

test("Indianapolis carries Turn 13 banking through the exit", () => {
  const tracks = buildContext();
  const road = tracks.buildCenterline(tracks.LIST.find(d => d.id === "indianapolis"), { line: false });
  // USGS 1 m transect at 90.5% lap: left and right samples 10 m apart.
  const station = road.total * 0.905;
  const left = tracks.banking(road, station, -5, {}).dy;
  const right = tracks.banking(road, station, 5, {}).dy;
  assert.ok(Math.abs((left - right) - 1.48) < 0.12);
});

// bankZones with a `frac` that lands on a straight > 60 m from every curated apex
// are silently re-seated onto the nearest unclaimed apex (mesh.js bankingProfile),
// so the authored fraction and its comment no longer say where the camber is
// (watkins_glen's "Esses" was 951 m from the corner it banked). Author `turn: N`
// instead. This replays the re-seat test and demands none fires.
test("no bankZone relies on the straight-line re-seat", () => {
  const Tracks = buildContext();
  const bad = [];
  for (const def of Tracks.LIST) {
    const zones = def.bankZones;
    if (!zones || !zones.length) continue;
    const turns = def.turns || [];
    const tr = Tracks.buildCenterline(def, { line: false });
    const n = tr.n, L = tr.total, ds = L / n, SM = Math.max(1, Math.round(12 / ds));
    const raw = new Float64Array(n), ksm = new Float64Array(n);
    for (let k = 0; k < n; k++) raw[k] = Tracks.curvature(tr, k * ds);
    for (let k = 0; k < n; k++) { let s = 0; for (let j = -SM; j <= SM; j++) s += raw[(k + j + n) % n]; ksm[k] = s / (2 * SM + 1); }
    const wrap = (v) => ((v % 1) + 1) % 1;
    const dress = def._sceneryShift || 0, mirror = def.reverse && def.sceneryLapMirror ? -1 : 1;
    zones.forEach((z, i) => {
      if (Number.isFinite(z.turn)) {
        if (!Number.isInteger(z.turn) || z.turn < 1 || z.turn > turns.length) bad.push(`${def.id} bank ${i}: turn ${z.turn} is not a curated turn`);
        return;
      }
      const f = wrap((z.frac || 0) * mirror + dress);
      if (Math.abs(ksm[Math.round(f * n) % n]) >= 0.004) return;   // on a corner
      let near = Infinity;
      for (const tf of turns) { let d = Math.abs(wrap(tf) - f); if (d > 0.5) d = 1 - d; near = Math.min(near, d * L); }
      if (near > 60) bad.push(`${def.id} bank ${i}: frac ${z.frac} is on a straight, ${near.toFixed(0)} m from any apex`);
    });
  }
  assert.deepEqual(bad, [], "anchor the zone with `turn: N` (1-based into def.turns)");
});

// Uniform Catmull-Rom over the OSM trace overshoots a hairpin whose neighbours
// are hundreds of metres away: korea's centreline zigzagged to a 2.2 m node
// radius (road half-width 8 m) and the running surface folded at four nodes.
// Short chord control points either side of the hairpin tame it. Node radius =
// chord / heading change between adjacent 4 m nodes.
test("hairpin circuits keep a node radius of at least 4 m and no folded road surface", () => {
  const Tracks = buildContext();
  const bad = [];
  for (const id of ["korea", "buddh", "bahrain", "singapore", "magny_cours"]) {
    const def = Tracks.LIST.find((t) => t.id === id);
    const tr = Tracks.buildCenterline(def, { line: false });
    const n = tr.n;
    let minR = Infinity;
    const folds = [];
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n;
      let da = Math.atan2(tr.tx[k1], tr.tz[k1]) - Math.atan2(tr.tx[k], tr.tz[k]);
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      const dP = Math.hypot(tr.px[k1] - tr.px[k], tr.pz[k1] - tr.pz[k]);
      if (Math.abs(da) > 1e-9) minR = Math.min(minR, dP / Math.abs(da));
      if (tr.hw[k] * Math.hypot(tr.rx[k1] - tr.rx[k], tr.rz[k1] - tr.rz[k]) > 0.97 * dP) folds.push(k);
    }
    if (minR < 4) bad.push(`${id}: min node radius ${minR.toFixed(2)} m`);
    if (folds.length) bad.push(`${id}: running surface folds at node(s) ${folds.join(",")}`);
  }
  assert.deepEqual(bad, [], "add short-spaced path.pts either side of the hairpin (js/circuits/<id>.js)");
});

test("Yas Marina crests at the opening Turn 3 sweep", () => {
  const tracks = buildContext();
  const def = tracks.LIST.find(entry => entry.id === "abudhabi");
  const track = tracks.buildCenterline(def, { line: false });
  const high = Math.max(...track.py);
  const crest = track.py.indexOf(high) / track.n;
  const relief = high - Math.min(...track.py);
  // OpenF1 2024 qualifying, session 9658: Norris and Piastri both crest
  // near 14% of the racing lap with approximately 11 m of relief.
  assert.ok(crest > 0.13 && crest < 0.15, `Yas Marina crest at ${crest}`);
  assert.ok(relief > 10 && relief < 12, `Yas Marina relief ${relief} m`);
});

test("Silverstone follows the Stowe to Vale descent and measured lap relief", () => {
  const tracks = buildContext();
  const def = tracks.LIST.find(entry => entry.id === "silverstone");
  const track = tracks.buildCenterline(def);
  const atTurn = number => track.py[Math.round(def.turns[number - 1] * track.n)];
  const relief = Math.max(...track.py) - Math.min(...track.py);
  assert.ok(Math.abs(relief - 11.3) < 0.5, `Silverstone relief ${relief} m`);
  const drop = atTurn(15) - atTurn(16);
  assert.ok(drop > 4 && drop < 6.5, `Stowe to Vale drop ${drop} m`);
});

test("Sochi rises from the physical T14 low to the T15 and T17 crests", () => {
  const tracks = buildContext();
  const road = tracks.buildCenterline(tracks.LIST.find(d => d.id === "sochi"), { line: false });
  const at = f => road.py[Math.round(f * road.n)];
  // FIA corner map matched to the centreline. Two 2021 qualifying traces
  // gain 1.6 m by T15; the published profile gains 1.9 m by T17.
  assert.ok(Math.abs((at(0.8405) - at(0.795)) - 1.6) < 0.25);
  assert.ok(Math.abs((at(0.922) - at(0.795)) - 1.9) < 0.1);
});

test("Buenos Aires follows the municipal contour crossings at its two valleys", () => {
  const tracks = buildContext();
  const def = tracks.LIST.find(circuit => circuit.id === "buenos_aires");
  const road = tracks.buildCenterline(def, { line: false });
  const y = f => road.py[Math.round(f * road.n)];
  // City metre contours: 10 m to 8 m approaching Turn 1, then 10 m to 7 m entering Turn 6.
  assert.ok(Math.abs(y(0.0179) - y(0.0673) - 2) < 0.5);
  assert.ok(Math.abs(y(0.2593) - y(0.3165) - 3) < 0.75);
});

// Spa and Monaco carry hand-authored cosine bumps. They were authored against
// an older centreline and sat on the wrong corners: Spa crested +84 m BEFORE
// Eau Rouge and ran Kemmel downhill; Monaco crested before Massenet with
// Casino at datum. Pin each profile's extremes to the curated turn they belong
// to (racing-lap fractions, def.turns, 1-based in the messages).
test("Spa and Monaco elevation extremes sit on their named corners", () => {
  const Tracks = buildContext();
  const profile = (id) => {
    const def = Tracks.LIST.find((t) => t.id === id);
    const tr = Tracks.buildCenterline(def, { line: false });
    const n = tr.n, ds = tr.total / n, w = Math.max(1, Math.round(20 / ds));
    const at = (k) => tr.py[((k % n) + n) % n];
    const ext = (f0, f1, sign) => {   // extreme of sign*py over [f0, f1)
      let best = -Infinity, bf = 0;
      for (let k = Math.round(f0 * n); k < Math.round(f1 * n); k++) {
        if (sign * at(k) > best) { best = sign * at(k); bf = (((k % n) + n) % n) / n; }
      }
      return { y: sign * best, f: bf };
    };
    let grade = 0;
    for (let k = 0; k < n; k++) grade = Math.max(grade, Math.abs(at(k + w) - at(k)) / (w * ds));
    return { def, ext, grade, T: (i) => def.turns[i - 1] };
  };
  const near = (got, turn, label) => {
    const d = Math.min(Math.abs(got.f - turn), 1 - Math.abs(got.f - turn));
    assert.ok(d <= 0.02, `${label}: extreme at ${got.f.toFixed(4)} (${got.y.toFixed(1)} m), corner at ${turn} — ${d.toFixed(4)} lap away`);
  };

  const spa = profile("spa");
  const top = spa.ext(0, 1, +1), bottom = spa.ext(0, 1, -1);
  // 2025 GP identities: Les Combes T5-T7. These retain the same physical
  // stations as the former curated T4-T6; no profile/tolerance change.
  const lesCombes = [5, 6, 7].map(spa.T).reduce((a, b) => (Math.abs(b - top.f) < Math.abs(a - top.f) ? b : a));
  near(top, lesCombes, "Spa high point = Les Combes");
  near(bottom, spa.T(15), "Spa low point = Stavelot exit / Paul Frere");
  const eauRouge = spa.ext(spa.T(1), spa.T(4), -1);
  near(eauRouge, spa.T(3), "Spa valley = Eau Rouge/Raidillon compression");
  assert.ok(top.y - eauRouge.y > 60, `Kemmel must climb well above Eau Rouge (${(top.y - eauRouge.y).toFixed(1)} m)`);
  assert.ok(spa.grade < 0.18, `Raidillon is ~17 %; nothing on the lap may exceed 18 % (got ${(spa.grade * 100).toFixed(1)} %)`);

  const mc = profile("monaco");
  const crest = mc.ext(0, 1, +1), low = mc.ext(0, 1, -1);
  near(crest, mc.T(4), "Monaco high point = Casino");
  // OpenF1 2024 qualifying, laps 25 (Leclerc) and 23 (Piastri):
  // the low section continues past the chicane alongside the pool.
  assert.ok(low.f > mc.T(14) && low.f < mc.T(17), `Monaco harbour low at ${low.f}`);
  const tunnel = mc.ext(0.51, 0.56, -1);
  assert.ok(tunnel.y - low.y > 5, "Monaco tunnel deck sits above the harbour low");
  assert.ok(crest.y > 35 && crest.y < 50, `Casino ~+40 m over the line (got ${crest.y.toFixed(1)})`);
  assert.ok(mc.grade < 0.18, `Monaco grade ${(mc.grade * 100).toFixed(1)} %`);
});

test("Estoril climbs from its seventh corner to the Parabólica on the Tanque route", () => {
  const tracks = buildContext();
  const def = tracks.LIST.find((d) => d.id === "estoril");
  const t = tracks.buildCenterline(def, { line: false });
  const height = (turn) => t.py[Math.round(def.turns[turn - 1] * t.n) % t.n];
  // Interpolating the 30 m terrain at the two apex stations yields 18.66 m.
  const climb = height(11) - height(7);
  assert.ok(Math.abs(climb - 18.66) < 3, `T7 to Parabólica climbs ${climb.toFixed(2)} m`);
});

// tyreSeverity trailers that say "below Japan/Monza/…" must actually sit below
// the named anchor (interlagos and hockenheim shipped inverted comparisons).
test("tyreSeverity comparison comments agree with the named anchors", () => {
  const dir = path.join(ROOT, "js", "circuits");
  const sev = new Map();
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".js"))) {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    const m = src.match(/tyreSeverity:\s*([0-9.]+)\s*,?\s*\/\/\s*(.*)/);
    if (!m) continue;
    sev.set(f.replace(/\.js$/, ""), { v: Number(m[1]), note: m[2], file: f });
  }
  const japan = sev.get("suzuka")?.v;
  const monza = sev.get("monza")?.v;
  assert.ok(Number.isFinite(japan) && Number.isFinite(monza), "Japan/Monza anchors present");
  const bad = [];
  for (const [id, row] of sev) {
    const n = row.note;
    if (/\bbelow\b.*\b(Japan|Suzuka)\b/i.test(n) && !(row.v < japan)) {
      bad.push(`${id}: ${row.v} claimed below Japan ${japan}`);
    }
    if (/\babove\b.*\b(Japan|Suzuka)\b/i.test(n) && !(row.v > japan)) {
      bad.push(`${id}: ${row.v} claimed above Japan ${japan}`);
    }
    if (/\bbelow\b.*\bMonza\b/i.test(n) && !(row.v < monza)) {
      bad.push(`${id}: ${row.v} claimed below Monza ${monza}`);
    }
    if (/\babove\b.*\bMonza\b/i.test(n) && !(row.v > monza)) {
      bad.push(`${id}: ${row.v} claimed above Monza ${monza}`);
    }
  }
  assert.deepEqual(bad, []);
});

// Scenery hygiene: api destructure bindings that are never read are dead
// locals (the closure already closed over `api`). Drop them — do not leave
// "place, px, pz" sitting unused after a rewrite. singapore / brands_hatch /
// okayama are owned by the kit-paddock PR (#4074) this session; park them
// until that PR lands, then drop the skip.
const SCENERY_API_HYGIENE_SKIP = {
  "singapore.js": "owned by #4074 kit-paddock batch 3",
  "brands_hatch.js": "owned by #4074 kit-paddock batch 3",
  "okayama.js": "owned by #4074 kit-paddock batch 3",
};

function sceneryApiLocalNames(inner) {
  const parts = [];
  let cur = "", depth = 0;
  for (const ch of inner) {
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") depth--;
    if (ch === "," && depth === 0) { parts.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => {
    p = p.trim();
    if (!p) return null;
    if (p.includes(":")) return p.split(":")[1].trim().split("=")[0].trim();
    return p.split("=")[0].trim();
  }).filter(Boolean);
}

test("scenery api destructure bindings are all used in the same file", () => {
  const dir = path.join(ROOT, "js", "circuits", "scenery");
  const bad = [];
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".js"))) {
    if (SCENERY_API_HYGIENE_SKIP[f]) continue;
    let src = fs.readFileSync(path.join(dir, f), "utf8");
    const m = src.match(/const\s*\{([\s\S]*?)\}\s*=\s*api\s*;/);
    if (!m) {
      bad.push(`${f}: no api destructure`);
      continue;
    }
    src = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const name of sceneryApiLocalNames(m[1])) {
      const hits = src.match(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"));
      if (!hits || hits.length <= 1) bad.push(`${f}: unused api.${name}`);
    }
  }
  assert.deepEqual(bad, [],
    "remove unused names from the scenery `const { … } = api` destructure (or park the file in SCENERY_API_HYGIENE_SKIP with a reason)");
});

test("Sepang rises 22 m from the physical Turn 3 basin to Turn 11", () => {
  const Tracks = buildContext();
  const def = Tracks.LIST.find((circuit) => circuit.id === "sepang");
  const track = Tracks.buildCenterline(def, { line: false });
  // Centreline stations registered to the two extremes on Formula 1's chart.
  const heightAt = (fraction) => track.py[Math.round(fraction * track.n)];
  assert.ok(Math.abs(heightAt(0.58333) - heightAt(0.15625) - 22) < 0.5);
});

test("Paul Ricard reproduces the signed IGN crossfalls across 10 m of asphalt", () => {
  const tracks = buildContext();
  const def = tracks.LIST.find(circuit => circuit.id === "paul_ricard");
  const track = tracks.buildCenterline(def, { line: false });
  // Signed right-minus-left heights from the 10 m IGN RGE ALTI transects.
  for (const [corner, fraction, measuredRise] of [
    ["Verrerie", 0.0957, 0.05],
    ["Signes", 0.713, -0.35],
    ["Le Beausset", 0.745, -0.11],
  ]) {
    const distance = fraction * track.total;
    const rise = tracks.banking(track, distance, 5, {}).dy - tracks.banking(track, distance, -5, {}).dy;
    assert.equal(Math.sign(rise), Math.sign(measuredRise), corner);
    assert.ok(Math.abs(rise - measuredRise) < 0.12, `${corner}: built ${rise} m, surveyed ${measuredRise} m`);
  }
});

test("Istanbul descends from Turn 8 to Turn 9 and Turn 1 tilts outward", () => {
  const tracks = buildContext();
  const def = tracks.LIST.find((circuit) => circuit.id === "istanbul");
  const road = tracks.buildCenterline(def, { line: false });
  const height = (f) => road.py[Math.round(f * road.n)];
  const t9 = def.turns[8];
  // METU §1.3: 37.5 m down over 650 m, then 7.03% up over 280 m.
  const drop = height(t9 - 650 / 5377) - height(t9);
  const climb = height(t9 + 280 / 5377) - height(t9);
  assert.ok(Math.abs(drop - 37.5) < 1, `Turn 9 approach descends ${drop} m`);
  assert.ok(Math.abs(climb - 19.684) < 1, `Turn 9 exit climbs ${climb} m`);
  assert.ok(tracks.bankAngle(road, def.turns[0] * road.total, 0) < 0,
    "the right shoulder sits below the centre in the first left-hand corner");
});

test("Mugello descends from Poggio Secco to Arrabbiata 1", () => {
  const tracks = buildContext();
  const def = tracks.LIST.find((circuit) => circuit.id === "mugello");
  const road = tracks.buildCenterline(def, { line: false });
  const atTurn = (number) => road.py[Math.round(def.turns[number - 1] * road.n)];
  // The operator's technical map gives 285.50 m and 247.96 m at T3 and T8.
  assert.ok(Math.abs((atTurn(3) - atTurn(8)) - 37.54) < 2);
});
