// aero-zones-turns.test.mjs — AERO_ZONE_TURNS (js/physics/aero-zones.js) must
// reproduce EXACTLY the zone set the length-only selection already ships,
// for every circuit it names. That is the whole safety property: the table
// re-expresses an already-sourced selection (ZONE_COUNT) in turn-keyed form,
// it does not re-derive which straight is correct, so it must never disagree
// with the length-only fallback it is meant to be equivalent to. A mismatch
// here means a stale AERO_ZONE_TURNS entry, not a bug in def.turns.
//
// Second guard: bahrain and jeddah must NEVER get a turn-pair entry. Their
// start lines were not re-derived this pass (jeddah's still measures IN A
// CORNER — tools/track/startline-probe.cjs), so def.turns[0] is not trustworthy as
// Turn 1 there, and turn-pair authoring on top of that would silently name
// the wrong straight instead of failing loud.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require2 = createRequire(import.meta.url);
const { buildContext } = require2("../../tools/track/verify-track.cjs");

const X_ZONE_K = 0.0014;
const X_ZONE_STEP = 8;

function loadAeroZones(Tracks) {
  const ctx = Tracks._vmContext;
  const src = fs.readFileSync(path.join(ROOT, "js/physics/aero-zones.js"), "utf8")
    .replace(/^const\b/gm, "var");
  vm.runInContext(src, ctx, { filename: "js/physics/aero-zones.js" });
  return ctx.AeroZones;
}

// Independent re-implementation of the length-only "N longest straights"
// selection, mirroring js/physics/aero-zones.js's build() but WITHOUT consulting
// AERO_ZONE_TURNS — the reference this test checks the real module against.
function lengthOnlyZones(Tracks, def, want) {
  const track = Tracks.buildCenterline(def);
  const total = track.total, n = Math.max(8, Math.round(total / X_ZONE_STEP));
  const straight = new Array(n);
  for (let i = 0; i < n; i++) {
    straight[i] = Math.abs(Tracks.curvature(track, (i + 0.5) * total / n)) <= X_ZONE_K;
  }
  let i0 = 0;
  while (i0 < n && straight[i0]) i0++;
  const runs = [];
  let cur = null;
  for (let k = 0; k < n; k++) {
    const i = (i0 + k) % n;
    if (straight[i]) { if (!cur) cur = { start: i * total / n, len: 0 }; cur.len += total / n; }
    else if (cur) { cur.end = cur.start + cur.len; runs.push(cur); cur = null; }
  }
  if (cur) { cur.end = cur.start + cur.len; runs.push(cur); }
  return runs.slice().sort((a, b) => b.len - a.len).slice(0, want)
             .sort((a, b) => a.start - b.start);
}

const Tracks = buildContext();
const AeroZones = loadAeroZones(Tracks);

test("AERO_ZONE_TURNS never names bahrain or jeddah", () => {
  assert.equal(AeroZones.AERO_ZONE_TURNS.bahrain, undefined,
    "bahrain's start line was not re-derived this pass — turn numbers there are not trustworthy");
  assert.equal(AeroZones.AERO_ZONE_TURNS.jeddah, undefined,
    "jeddah's line still measures IN A CORNER — turn numbers there are not trustworthy");
});

test("every AERO_ZONE_TURNS entry reproduces the length-only selection exactly", () => {
  const mismatches = [];
  for (const id of Object.keys(AeroZones.AERO_ZONE_TURNS)) {
    const def = Tracks.LIST.find((d) => d.id === id);
    assert.ok(def, `AERO_ZONE_TURNS names unknown circuit "${id}"`);
    const want = AeroZones.ZONE_COUNT[id];
    assert.ok(want != null, `"${id}" has turn pairs but no ZONE_COUNT`);

    const track = Tracks.buildCenterline(def);
    const G = { track };
    const az = AeroZones.create(G);
    const turnKeyed = az.build();

    const reference = lengthOnlyZones(Tracks, def, want);

    if (turnKeyed.length !== reference.length) {
      mismatches.push(`${id}: turn-keyed gave ${turnKeyed.length} zones, length-only gives ${reference.length}`);
      continue;
    }
    for (let i = 0; i < reference.length; i++) {
      const a = turnKeyed[i], b = reference[i];
      if (Math.abs(a.start - b.start) > 1e-6 || Math.abs(a.end - b.end) > 1e-6) {
        mismatches.push(`${id} zone ${i}: turn-keyed [${a.start.toFixed(1)},${a.end.toFixed(1)}] ` +
          `!= length-only [${b.start.toFixed(1)},${b.end.toFixed(1)}]`);
      }
    }
  }
  assert.deepEqual(mismatches, [], "AERO_ZONE_TURNS disagrees with the sourced length-only selection:\n  " +
    mismatches.join("\n  "));
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
