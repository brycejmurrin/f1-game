// tools/track/circuit-info.cjs (#4287) — circuit facts from the real build, not a grep.
//
// A cold agent read Monza's built length from a comment in js/circuits/monza.js
// ("built total 5777.158737 m"); the build now measures 5777.58 m, which is the
// drift that comment invites. builtM must come from Tracks.buildCenterline, and
// cornerCount from TrackLine's corner detector, never from def.turns.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CLI = path.join(ROOT, "tools/track/circuit-info.cjs");
const { circuitInfo } = require(CLI);

test("monza: lengthKm 5.8, built lap ≈ 5777 m, 11 curated turns, detector count separate", () => {
  const r = circuitInfo("monza");
  assert.equal(r.ok, true);
  assert.equal(r.lengthKm, 5.8);
  assert.ok(Math.abs(r.builtM - 5777.16) < 1, `builtM ${r.builtM} ≈ 5777.16`);
  assert.equal(r.turns.length, 11);
  assert.equal(r.turnCount, 11);
  assert.equal(r.sectors.length, 2);
  assert.ok(Number.isInteger(r.cornerCount) && r.cornerCount > 0, `cornerCount ${r.cornerCount}`);
  assert.equal(r.cornerApex.length, r.cornerCount);
  for (const f of r.cornerApex) assert.ok(f >= 0 && f < 1, `apex fraction ${f}`);
});

test("CLI: --json prints one parseable row; an unknown id exits 2 naming the valid ids", () => {
  const row = JSON.parse(execFileSync(process.execPath, [CLI, "monza", "--json"], { encoding: "utf8" }));
  assert.equal(row.track, "monza");
  assert.equal(row.turnCount, 11);
  const bad = spawnSync(process.execPath, [CLI, "nope", "--json"], { encoding: "utf8" });
  assert.equal(bad.status, 2);
  assert.match(JSON.parse(bad.stdout).error, /unknown circuit "nope".*monza/);
});
