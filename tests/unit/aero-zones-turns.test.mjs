// aero-zones-turns.test.mjs — how AERO_ZONE_TURNS pairs resolve on the built
// centreline. The table itself is checked against the sourced FIA 2026
// fixture (tests/data/aero-zones-fia-2026.json) in aero-zone-tables.test.mjs;
// it used to be compared here with a length-only selection derived from the
// same table, which proved nothing about the real zones.
//
// Second guard: bahrain and jeddah must NEVER get a turn-pair entry until a
// located start coordinate is recorded (bahrain) or turn-pair spans are
// re-keyed after a start-line move (jeddah — length-only ZONE_COUNT=3 for now).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require2 = createRequire(import.meta.url);
const { buildContext } = require2("../../tools/track/verify-track.cjs");

function loadAeroZones(Tracks) {
  const ctx = Tracks._vmContext;
  const src = fs.readFileSync(path.join(ROOT, "js/physics/aero-zones.js"), "utf8")
    .replace(/^const\b/gm, "var");
  vm.runInContext(src, ctx, { filename: absSrc("js/physics/aero-zones.js") });
  return ctx.AeroZones;
}

const Tracks = buildContext();
const AeroZones = loadAeroZones(Tracks);

test("AERO_ZONE_TURNS never names bahrain or jeddah", () => {
  assert.equal(AeroZones.AERO_ZONE_TURNS.bahrain, undefined,
    "bahrain's start line was not re-derived this pass — turn numbers there are not trustworthy");
  assert.equal(AeroZones.AERO_ZONE_TURNS.jeddah, undefined,
    "jeddah turn-pair spans are not re-keyed yet — ZONE_COUNT fallback only");
});

test("a pair spans every straight between its two apexes — a kink does not split an FIA zone", () => {
  // Kemmel (Spa T4 -> T5) is split by a flat kink into two straight runs; the
  // FIA zone A3 starts after T4 and runs to Les Combes, so the built zone must
  // cover both runs, not just the longer one (the old occurrence-index scheme).
  const def = Tracks.LIST.find((d) => d.id === "spa");
  const track = Tracks.buildCenterline(def);
  const zones = AeroZones.create({ track }).build();
  const L = track.total, t4 = def.turns[3] * L, t5 = def.turns[4] * L;
  const kemmel = zones.filter((z) => z.start > t4 && z.end < t5);
  assert.equal(kemmel.length, 1, "one Kemmel zone");
  assert.ok(kemmel[0].len > 900, `Kemmel zone ${kemmel[0].len.toFixed(0)} m — the kink split it`);
});

test("every ZONE_COUNT circuit still resolves to exactly its published count", () => {
  const bad = [];
  for (const id of Object.keys(AeroZones.ZONE_COUNT)) {
    const def = Tracks.LIST.find((d) => d.id === id);
    if (!def) continue;
    const track = Tracks.buildCenterline(def);
    const az = AeroZones.create({ track });
    const zones = az.build();
    if (zones.length !== AeroZones.ZONE_COUNT[id]) {
      bad.push(`${id}: built ${zones.length} zones, ZONE_COUNT says ${AeroZones.ZONE_COUNT[id]}`);
    }
  }
  assert.deepEqual(bad, [], "a circuit did not resolve to its published zone count:\n  " + bad.join("\n  "));
});
