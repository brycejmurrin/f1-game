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

  // lengthKm's one decimal puts five circuits a lap off the real race, so they
  // carry an authored `gpLaps` (def.js fromRaw). Exact, not ±1.
  for (const [id, laps] of [["monaco", 78], ["singapore", 62], ["zandvoort", 72], ["catalunya", 66], ["portimao", 66]])
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
    vm.runInContext(src, sb, { filename: f === "@circuits" ? M.CIRCUIT_META : f });
  }
  const stubs = vm.runInContext("Tracks", sb).LIST;
  const full = buildContext().LIST;
  const at = (id) => stubs.find((t) => t.id === id);
  for (const [id, laps] of [["monaco", 78], ["singapore", 62], ["zandvoort", 72], ["catalunya", 66], ["portimao", 66]]) {
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
  // The SHIPPED roster. A `custom` entry is one the track designer registered
  // from the player's own storage (js/editor/custom-tracks.js); it is appended
  // after the 52 and never counts here.
  assert.equal(Tracks.LIST.filter((t) => !t.custom).length, 52);
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

// ── elevation provenance for the OSM-imported circuits ─────────────────────
// Every circuit recovered from OpenStreetMap (tools/track/osm-circuits.json) has
// no authored `elevations`; its relief comes from the SRTM bake in
// js/track/circuit-elevations.js — or it is flat ON PURPOSE. Korea is the flat
// one: Yeongam is reclaimed tidal flat and the bake measured 0.00 m over the
// lap, so its def takes the engine's `undulate: false` hatch (the only circuit
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
  const elev = vm.runInNewContext(fs.readFileSync(path.join(ROOT, "js/track/circuit-elevations.js"), "utf8") + ";CircuitElevations", {});
  const neither = ids.filter((id) => !(Array.isArray(elev[id]) && elev[id].length > 0) && at(id) && at(id).undulate !== false);
  assert.deepEqual(neither, [], "an OSM circuit with no SRTM profile must declare undulate: false (or bake one)");
  assert.equal(at("korea").undulate, false, "korea is the flat one, by measurement");
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
  // Les Combes is a complex (T4-T6): the summit sits at its entry or exit.
  const lesCombes = [4, 5, 6].map(spa.T).reduce((a, b) => (Math.abs(b - top.f) < Math.abs(a - top.f) ? b : a));
  near(top, lesCombes, "Spa high point = Les Combes");
  near(bottom, spa.T(17), "Spa low point = Stavelot");
  const eauRouge = spa.ext(spa.T(1), spa.T(3), -1);
  near(eauRouge, spa.T(2), "Spa valley = Eau Rouge");
  assert.ok(top.y - eauRouge.y > 60, `Kemmel must climb well above Eau Rouge (${(top.y - eauRouge.y).toFixed(1)} m)`);
  assert.ok(spa.grade < 0.18, `Raidillon is ~17 %; nothing on the lap may exceed 18 % (got ${(spa.grade * 100).toFixed(1)} %)`);

  const mc = profile("monaco");
  const crest = mc.ext(0, 1, +1), low = mc.ext(0, 1, -1);
  near(crest, mc.T(6), "Monaco high point = Casino");
  near(low, mc.T(12), "Monaco low point = the harbour chicane");
  assert.ok(crest.y > 35 && crest.y < 50, `Casino ~+40 m over the line (got ${crest.y.toFixed(1)})`);
  assert.ok(mc.grade < 0.18, `Monaco grade ${(mc.grade * 100).toFixed(1)} %`);
});
