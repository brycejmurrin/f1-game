// #2204 fleet check (W21, 2026-11-10): every circuit whose scenery calls a
// curved-stand emitter (terrace / bleacher / scaffoldStand / tieredBowl) holds
// the outside-of-bend contract on the boxes it actually emits
// (tests/helpers/stand-gaps.cjs, outsideBound): <= 0.5 m, or wedge - 0.4 m
// where tier depth x step turn exceeds what curveTier lets a row overlap its
// neighbour. stand-curve-gap.test.mjs pins jerez / catalunya / silverstone at
// the plain 0.5 m in the fast tier; this one sweeps the roster (APEX_CIRCUITS
// narrows it, tools/lib/circuit-scope.cjs).
//
// Before the fix, measured on this harness: 1,000+ outside pairs over 0.5 m on
// 24 circuits, max 40.4 m (mexico terrace), 28.8 m (fuji), 12.3 m (jerez).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { buildContext } = require(path.join(ROOT, "tools/lib/track-build-vm.cjs"));
const { measureStandGaps, outsideBound } = require(path.join(ROOT, "tests/helpers/stand-gaps.cjs"));
const MANIFEST = require(path.join(ROOT, "tools/manifest.cjs"));
const { scope } = require(path.join(ROOT, "tools/lib/circuit-scope.cjs"));

// Joints the FOLD guard owns: one side is a station past a hairpin's centre of
// curvature (|k x spacing| >= 0.55: tangent-aimed, capped by design), so the
// joint cannot meet without stretching a row across the apex. Measured; shrink
// only. buddh k=759: its next station 761 reads |k x spacing| 3.4 (anchors
// bunched behind the T4 hairpin) — 6 scaffold rows, 2.6-4.6 m.
const FOLD_JOINTS = { buddh: [759] };

const USES = /\b(terrace|bleacher|scaffoldStand|tieredBowl)\(/;
const ROSTER = scope(MANIFEST.CIRCUITS).filter((id) => {
  const f = path.join(ROOT, "js/circuits/scenery", id + ".js");
  return fs.existsSync(f) && USES.test(fs.readFileSync(f, "utf8"));
});

test("every curved-stand circuit holds the outside-of-bend joint contract (#2204)", { timeout: 900000 }, () => {
  assert.ok(ROSTER.length > 0, "measured at least one circuit that uses a stand emitter");
  const env = buildContext();
  const bad = [];
  let measured = 0;
  for (const id of ROSTER) {
    const fold = new Set(FOLD_JOINTS[id] || []);
    for (const x of measureStandGaps(env, id)) {
      if (x.bench || x.bend !== "outside") continue;
      measured++;
      const g = Math.max(x.gOut, x.gIn);
      if (g > outsideBound(x) + 1e-6 && !fold.has(x.k))
        bad.push(`${id} ${x.helper} k=${x.k} ${x.role} gap=${g.toFixed(2)} bound=${outsideBound(x).toFixed(2)} turn=${x.turnDeg.toFixed(1)}`);
    }
  }
  assert.ok(measured > 0, "found outside-of-bend joints to measure");
  assert.deepEqual(bad.slice(0, 12), [], `${bad.length} outside joint(s) over the #2204 bound`);
});
