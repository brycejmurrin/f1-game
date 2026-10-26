// Dijon Prenois hillside dressing must stay UNDER the saturating clip-severe
// and flatCoplanar baselines (#3348). Tip sat at clip severe 4/4 and ground
// flatCoplanar 5/5 — lap-wide hedgeRuns self-fought on curves, far valley
// hedges landed in other-lap clip corridors, and same-parity crop drapes
// shared top planes. Source clears drop both below cap; this locks the
// measured audit, not a source-string oracle.
//
// Pure Node — audit-circuit builds the track in a VM (~9 s).

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLIP_CAP = JSON.parse(
  readFileSync(path.join(ROOT, "tools", "track", "clip-baseline.json"), "utf8"),
).dijon;
const FLAT_CAP = JSON.parse(
  readFileSync(path.join(ROOT, "tests", "data", "scenery-audit-baseline.json"), "utf8"),
).flatCoplanar.dijon;

function auditDijon() {
  const out = execFileSync(
    process.execPath,
    [
      path.join(ROOT, "tools", "track", "audit-circuit.cjs"),
      "dijon",
      "--json",
      "--checks",
      "clip,ground",
    ],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );
  return JSON.parse(out);
}

test("dijon clip severe and flatCoplanar stay strictly below saturating caps (#3348)", () => {
  assert.equal(CLIP_CAP, 4, "clip-baseline dijon row");
  assert.equal(FLAT_CAP, 5, "scenery-audit-baseline dijon flatCoplanar row");
  const r = auditDijon();
  assert.equal(r.ok, true, JSON.stringify(r.checks));
  const severe = r.checks.clip.severe;
  const flat = r.checks.ground.counts.flatCoplanar;
  assert.ok(
    severe < CLIP_CAP,
    `clip severe ${severe} must drop below saturating cap ${CLIP_CAP}`,
  );
  assert.ok(
    flat < FLAT_CAP,
    `flatCoplanar ${flat} must drop below saturating cap ${FLAT_CAP}`,
  );
});
