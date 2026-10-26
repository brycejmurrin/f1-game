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

// The pre-#3374 saturating caps. Later trains ratchet the baselines lower
// (#3859 lowered both to the measured 3/3), so the rows must stay under these
// and the measured audit must stay under both the old cap and the live row.
const SATURATED_CLIP = 7;
const SATURATED_COPLANAR = 5;

test("monza coplanar spots and clip severe stay strictly below saturating caps (#3374)", () => {
  assert.ok(CLIP_CAP < SATURATED_CLIP, `clip-baseline monza row ${CLIP_CAP} must stay below ${SATURATED_CLIP}`);
  assert.ok(
    COPLANAR_CAP < SATURATED_COPLANAR,
    `coplanar-baseline monza row ${COPLANAR_CAP} must stay below ${SATURATED_COPLANAR}`,
  );
  const r = auditMonza();
  assert.equal(r.ok, true, JSON.stringify(r.checks));
  const severe = r.checks.clip.severe;
  const spots = r.checks.coplanar.spots;
  assert.ok(
    severe <= CLIP_CAP && severe < SATURATED_CLIP,
    `clip severe ${severe} must stay within cap ${CLIP_CAP} and below ${SATURATED_CLIP}`,
  );
  assert.ok(
    spots <= COPLANAR_CAP && spots < SATURATED_COPLANAR,
    `coplanar spots ${spots} must stay within cap ${COPLANAR_CAP} and below ${SATURATED_COPLANAR}`,
  );
});
