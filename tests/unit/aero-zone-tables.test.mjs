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
 * NODE-SIDE ON PURPOSE. verify-track.cjs already builds a real centreline in
 * ~2 s without a browser, so all 21 tables are checked on the fast gate rather
 * than behind a VM game boot per circuit.
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
const ctx = vm.createContext({
  Math, JSON, Object, Array, Number, String, console, Tracks,
  Log: { info() {}, warn() {}, error() {} },
});
vm.runInContext(fs.readFileSync(new URL("../../js/physics/aero-zones.js", import.meta.url), "utf8"),
  ctx, { filename: "js/physics/aero-zones.js" });
const AeroZones = vm.runInContext("AeroZones", ctx);

/** The straight runs zonesFor() derives, rebuilt here so runForTurnPair can be
 *  asked the same question the module asks it. Kept in step by the assertion
 *  below that zonesFor() itself still agrees. */
function runsOf(tr) {
  const total = tr.total, n = Math.max(8, Math.round(total / 25));
  const straight = new Array(n);
  for (let i = 0; i < n; i++) {
    straight[i] = Math.abs(Tracks.curvature(tr, (i + 0.5) * total / n)) <= AeroZones.X_ZONE_K;
  }
  let i0 = 0;
  while (i0 < n && straight[i0]) i0++;
  const runs = [];
  let cur = null;
  for (let k = 0; k < n; k++) {
    const i = (i0 + k) % n;
    if (straight[i]) {
      if (!cur) cur = { start: i * total / n, len: 0 };
      cur.len += total / n;
    } else if (cur) { cur.end = cur.start + cur.len; runs.push(cur); cur = null; }
  }
  if (cur) { cur.end = cur.start + cur.len; runs.push(cur); }
  return runs;
}

test("every circuit's authored turn table resolves — an unread table is a silent fallback", () => {
  const unresolved = [];
  for (const id of Object.keys(AeroZones.AERO_ZONE_TURNS)) {
    const def = Tracks.LIST.find((t) => t.id === id);
    if (!def) { unresolved.push(`${id}: AERO_ZONE_TURNS names a circuit that does not exist`); continue; }
    const tr = Tracks.build(def);
    const turns = def.turns || [];
    const pairs = AeroZones.AERO_ZONE_TURNS[id];
    if (!turns.length) { unresolved.push(`${id}: has a turn table but the def declares no turns`); continue; }
    const runs = runsOf(tr);
    const ok = pairs.filter((p) => AeroZones.runForTurnPair(runs, turns, tr.total, p));
    if (ok.length !== pairs.length) {
      const bad = pairs.filter((p) => !AeroZones.runForTurnPair(runs, turns, tr.total, p));
      unresolved.push(`${id}: ${ok.length}/${pairs.length} pairs bound a straight — ` +
        `${JSON.stringify(bad)} bound none, so the WHOLE table is discarded`);
    }
  }
  assert.deepEqual(unresolved, [],
    "a circuit's authored turn table is being thrown away whole and nobody is told — " +
    "fix the pair against the built centreline, or drop the entry and let ZONE_COUNT own it");
});

test("a resolved table is the one zonesFor() actually returns", () => {
  // The check above rebuilds the runs itself, so it could drift from the module
  // and start proving something about its own copy. This pins the two together
  // on a circuit whose table resolves: the zone count must be the table's
  // length, not ZONE_COUNT's number, which is what "the table was used" means.
  const def = Tracks.LIST.find((t) => t.id === "monza");
  const tr = Tracks.build(def);
  const pairs = AeroZones.AERO_ZONE_TURNS.monza;
  assert.equal(AeroZones.zonesFor(tr).length, pairs.length,
    "monza's table resolves, so zonesFor must return exactly its pairs");
});

test("Monaco has no activation zones, and no curvature scan can know that", () => {
  // The number that proves the tables are load-bearing: ZONE_COUNT.monaco is 0,
  // and js/ui/track-maps.js used to draw 6 there from its own curvature scan.
  assert.equal(AeroZones.ZONE_COUNT.monaco, 0);
  const def = Tracks.LIST.find((t) => t.id === "monaco");
  assert.equal(AeroZones.zonesFor(Tracks.build(def)).length, 0);
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
