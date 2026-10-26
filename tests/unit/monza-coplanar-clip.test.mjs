// Monza park/Sopraelevata dressing must stay UNDER the saturating coplanar and
// clip-severe baselines (#3374). Tip sat at coplanar 5/5 and clip severe 7/7 —
// park hedges self-fought, and Curva Grande / Parabolica foliage punched
// hedges and the steel grandstand. Source clears + hedge split drop both
// below cap; this locks the measured audit, not a source-string oracle.
//
// Pure Node — audit-circuit builds the track in a VM (~6 s).

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLIP_CAP = JSON.parse(
  readFileSync(path.join(ROOT, "tools", "track", "clip-baseline.json"), "utf8"),
).monza;
const COPLANAR_CAP = JSON.parse(
  readFileSync(path.join(ROOT, "tools", "track", "coplanar-baseline.json"), "utf8"),
).monza;

function auditMonza() {
  const out = execFileSync(
    process.execPath,
    [
      path.join(ROOT, "tools", "track", "audit-circuit.cjs"),
      "monza",
      "--json",
      "--checks",
      "clip,coplanar",
    ],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );
  return JSON.parse(out);
}

test("monza coplanar spots and clip severe stay strictly below saturating caps (#3374)", () => {
  assert.equal(CLIP_CAP, 7, "clip-baseline monza row");
  assert.equal(COPLANAR_CAP, 5, "coplanar-baseline monza row");
  const r = auditMonza();
  assert.equal(r.ok, true, JSON.stringify(r.checks));
  const severe = r.checks.clip.severe;
  const spots = r.checks.coplanar.spots;
  assert.ok(
    severe < CLIP_CAP,
    `clip severe ${severe} must drop below saturating cap ${CLIP_CAP}`,
  );
  assert.ok(
    spots < COPLANAR_CAP,
    `coplanar spots ${spots} must drop below saturating cap ${COPLANAR_CAP}`,
  );
});
