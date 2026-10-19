/* aero-zone-tables.test.mjs — every AUTHORED activation-zone table is actually read.
 *
 * js/physics/aero-zones.js resolves AERO_ZONE_TURNS all-or-nothing: one pair
 * that bounds no straight on the built centreline discards the WHOLE
 * hand-authored table for that circuit and falls through to ZONE_COUNT's "the
 * N longest straights". That fallback is sensible, which is exactly what makes
 * the failure dangerous — the zones still look plausible and the table nobody
 * re-checked is simply never read.
 *
 * Monza shipped [[9, 10], [11, 1]] for as long as the table has existed. [9, 10]
 * bounds no straight, so NEITHER pair was ever used. It happened to cost almost
 * nothing — the fallback picked the same two straights to within 8 m, measured
 * on a live boot — but nothing was checking that, and a circuit whose geometry
 * is re-surveyed under its table will not be so lucky. Elevations and centre
 * lines in this repo do move; that is what the corresponding spec defect in
 * docs/notes/DEFECT-LEDGER.md is about.
 *
 * NODE-SIDE ON PURPOSE. verify-track.cjs builds a real centreline without a
 * browser, so all 21 tables are checked on the fast gate rather than behind a
 * VM game boot per circuit — and on the centreline alone, not a full mesh build.
 *
 * Run: node --test tests/unit/aero-zone-tables.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const { buildContext } = require("../../tools/track/verify-track.cjs");

const Tracks = buildContext();
// Log.warn is CAPTURED, not stubbed: the module's own "turn table unusable"
// warning is the runtime signal that a table was discarded, and a no-op stub
// meant no test ever saw it fire (#2952 P1-01).
const warns = [];
const ctx = vm.createContext({
  Math, JSON, Object, Array, Number, String, console, Tracks,
  Log: { info() {}, warn(tag, msg) { warns.push(String(msg)); }, error() {} },
});
vm.runInContext(fs.readFileSync(new URL("../../js/physics/aero-zones.js", import.meta.url), "utf8"),
  ctx, { filename: "js/physics/aero-zones.js" });
const AeroZones = vm.runInContext("AeroZones", ctx);

/** The circuit's centreline only — zonesFor() reads curvature, total and
 *  def.turns, none of which needs the meshes Tracks.build() adds. That build
 *  was the whole cost of this file on the fast gate (#2952 P1-22); the case
 *  below pins the two to the same answer so the shortcut cannot drift. */
const centreline = (def) => Tracks.buildCenterline(def, { line: false });

test("the centreline gives zonesFor() the same zones a full build does", () => {
  const def = Tracks.LIST.find((t) => t.id === "monza");
  assert.deepEqual(AeroZones.zonesFor(centreline(def)), AeroZones.zonesFor(Tracks.build(def)));
});

test("every circuit's authored turn table resolves — an unread table is a silent fallback", () => {
  // Ask the MODULE, not a copy of its scan: zonesFor() with the real
  // X_ZONE_STEP sampling, watched through the warning it raises when it
  // throws a table away. A rebuilt scan at another step answered a different
  // question (25 m here against the module's 8 m).
  const unresolved = [];
  for (const id of Object.keys(AeroZones.AERO_ZONE_TURNS)) {
    const def = Tracks.LIST.find((t) => t.id === id);
    if (!def) { unresolved.push(`${id}: AERO_ZONE_TURNS names a circuit that does not exist`); continue; }
    if (!(def.turns || []).length) { unresolved.push(`${id}: has a turn table but the def declares no turns`); continue; }
    warns.length = 0;
    const zones = AeroZones.zonesFor(centreline(def));
    const discarded = warns.filter((w) => /turn table unusable/.test(w));
    if (discarded.length) unresolved.push(...discarded);
    else if (zones.length !== AeroZones.AERO_ZONE_TURNS[id].length) {
      unresolved.push(`${id}: ${zones.length} zones from a ${AeroZones.AERO_ZONE_TURNS[id].length}-pair table`);
    }
  }
  assert.deepEqual(unresolved, [],
    "a circuit's authored turn table is being thrown away whole — " +
    "fix the pair against the built centreline, or drop the entry and let ZONE_COUNT own it");
});

test("the discard warning is observable here (mutation: one pair that bounds nothing)", () => {
  const def = Tracks.LIST.find((t) => t.id === "monza");
  const saved = AeroZones.AERO_ZONE_TURNS.monza;
  assert.ok(Array.isArray(saved) && saved.length, "monza carries a turn table");
  const tr = centreline(def);
  warns.length = 0;
  // AERO_ZONE_TURNS is a plain object inside the frozen module record, so a
  // test may swap one row and must put it back.
  AeroZones.AERO_ZONE_TURNS.monza = [[1, 1]];
  try { AeroZones.zonesFor(tr); } finally { AeroZones.AERO_ZONE_TURNS.monza = saved; }
  assert.ok(warns.some((w) => /monza turn table unusable/.test(w)), `no discard warning: ${JSON.stringify(warns)}`);
});

test("Imola corner renumbering retains its authored Alta approach aero window", () => {
  const def = Tracks.LIST.find((t) => t.id === "imola");
  const tr = centreline(def);
  const zones = AeroZones.zonesFor(tr);
  assert.equal(zones.length, 1);
  const zone = zones[0];
  assert.ok(zone.start > def.turns[12] * tr.total && zone.end < def.turns[13] * tr.total);
  assert.ok(zone.start < .65 * tr.total && zone.end > .65 * tr.total,
    "the existing window stays on the approach to Alta");
  assert.ok(zone.start > .03 * tr.total,
    "this metadata repair does not move the gameplay window to FIA's main-straight DRS zone");
});

test("a resolved table is the one zonesFor() actually returns", () => {
  // The check above rebuilds the runs itself, so it could drift from the module
  // and start proving something about its own copy. This pins the two together
  // on a circuit whose table resolves: the zone count must be the table's
  // length, not ZONE_COUNT's number, which is what "the table was used" means.
  const def = Tracks.LIST.find((t) => t.id === "monza");
  const tr = centreline(def);
  const pairs = AeroZones.AERO_ZONE_TURNS.monza;
  assert.equal(AeroZones.zonesFor(tr).length, pairs.length,
    "monza's table resolves, so zonesFor must return exactly its pairs");
});

test("Monaco has no activation zones, and no curvature scan can know that", () => {
  // The number that proves the tables are load-bearing: ZONE_COUNT.monaco is 0,
  // and js/ui/track-maps.js used to draw 6 there from its own curvature scan.
  assert.equal(AeroZones.ZONE_COUNT.monaco, 0);
  const def = Tracks.LIST.find((t) => t.id === "monaco");
  assert.equal(AeroZones.zonesFor(centreline(def)).length, 0);
});

test("the MAP asks AeroZones where the zones are — it does not scan curvature itself", () => {
  /* js/ui/track-maps.js used to carry `detectDRS`, a second curvature scan with
     its own threshold (0.003 vs X_ZONE_K), its own minimum run (4% of the lap
     vs X_ZONE_MIN) and no knowledge of either override table aero-zones.js
     keeps — ZONE_COUNT (how many zones a circuit has) and AERO_ZONE_TURNS
     (which straights they sit on). The minimap, the circuit picker and the
     track-detail modal all drew that instead of the real selection.

     Measured across all 52 circuits on a live boot before the fix: 47 of 52
     disagreed, Monaco worst at 6 drawn against 0 the race opens — a number no
     curvature scan can reach, because it lives in ZONE_COUNT. A map that
     promises a zone the car will never open is worse than a map with none.

     This asserts the WIRING, because the numbers are the other module's to
     own: the map must delegate, and must not keep a scan of its own to drift. */
  const src = fs.readFileSync(new URL("../../js/ui/track-maps.js", import.meta.url), "utf8");
  assert.ok(!/function detectDRS\b/.test(src),
    "track-maps grew a second DRS derivation again — delegate to AeroZones.zonesFor");
  assert.match(src, /AeroZones\.zonesFor\(/,
    "the map must ask AeroZones for the zones the race actually opens");
  // No silent fallback to a local scan: "no zones" is honest, "different zones"
  // is the defect. The only thresholds left in this file are the corner
  // detector's, which is a different question.
  assert.ok(!/KV_THRESH|MIN_FRAC/.test(src),
    "the old DRS thresholds are still present — they are a second source of truth");
});

// UI-11 (hunt2): the circuit picker and CIRCUIT DETAIL called the 2026
// active-aero (straight-mode) zones "DRS ZONES" / "N DRS"; the HUD, the phone
// and HOW TO PLAY all say AERO. No player-visible string here names DRS.
test("the circuit picker names the zones the way the HUD does (AERO, never DRS)", () => {
  const src = fs.readFileSync(new URL("../../js/ui/select-screen.js", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const visible = (src.match(/"[^"\n]*"/g) || []).filter((s) => /\bDRS\b/.test(s));
  assert.deepEqual(visible, [], "a string literal still says DRS");
  assert.match(src, /\["AERO ZONES", /);
});
