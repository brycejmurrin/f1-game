import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// THE ARC MUST NOT REACH THE DRIVER (AGENTS.md §Physics). Nothing derived from
// track curvature may affect the player with assists off, and every consumer
// must sit in a legitimate channel: AI-only / assist-gated / broadcast-only /
// surface. The channel table lives in docs/PHYSICS.md §Curvature channels —
// for years AGENTS.md and PHYSICS.md each deferred it to the other and it
// existed NOWHERE, so nothing forced a new consumer to be classified. This
// guard closes that: every file that reads curvature (direct call or the
// destructured aliases) must appear in the table, so adding a consumer without
// classifying it is a red test, not a silent physics-contract erosion.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}

// A file "reads curvature" when it calls Tracks.curvature( directly, or when
// it destructures/aliases `curvature` out of Tracks/TrackSpline and calls the
// alias. The alias detection is deliberately simple (a `curvature` identifier
// appearing in a destructure plus a bare `curvature(` call) — both current
// aliases (js/track/core/mesh.js, js/track/tracks.js) match it, and a new exotic
// aliasing scheme showing up here should be a conversation anyway.
function readsCurvature(src) {
  if (/\bTracks\.curvature\s*\(/.test(src)) return true;
  const destructured = /(?:const|let|var)\s*\{[^}]*\bcurvature\b[^}]*\}\s*=/.test(src);
  return destructured && /(?<![.\w])curvature\s*\(/.test(src);
}

test("every curvature consumer file appears in the PHYSICS.md channel table", () => {
  const table = fs.readFileSync(path.join(ROOT, "docs/PHYSICS.md"), "utf8");
  const section = table.split("## Curvature channels")[1];
  assert.ok(section, "docs/PHYSICS.md must carry the §Curvature channels table");
  const consumers = walk(path.join(ROOT, "js"))
    .filter((p) => readsCurvature(fs.readFileSync(p, "utf8")))
    .map((p) => path.relative(ROOT, p).split(path.sep).join("/"));
  assert.ok(consumers.length >= 8,
    `only ${consumers.length} curvature consumers found — the extraction looks broken`);
  const missing = consumers.filter((f) => !section.includes("`" + f + "`"));
  assert.deepEqual(missing, [],
    "curvature consumers absent from docs/PHYSICS.md §Curvature channels — " +
    "classify each into AI-only / assist-gated / broadcast-only / surface " +
    "(and if none fits, the change violates the physics contract): " + missing.join(", "));
});

test("no table row names a file that no longer reads curvature (no ghosts)", () => {
  const table = fs.readFileSync(path.join(ROOT, "docs/PHYSICS.md"), "utf8");
  const section = table.split("## Curvature channels")[1] || "";
  const rows = [...section.matchAll(/^\| `([^`]+\.js)` \|/gm)].map((m) => m[1]);
  assert.ok(rows.length >= 8, `only ${rows.length} table rows parsed — the table shape changed?`);
  for (const f of new Set(rows)) {
    const p = path.join(ROOT, f);
    assert.ok(fs.existsSync(p), `table row names ${f}, which does not exist`);
    assert.ok(readsCurvature(fs.readFileSync(p, "utf8")),
      `table row names ${f}, which no longer reads curvature — drop the row`);
  }
});
