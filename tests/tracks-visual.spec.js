// @ts-check
// Consolidated per-track visual regression: one forward-facing chase-cam
// screenshot per circuit at each LAP_FRACTIONS position, pixel-diffed against a
// golden baseline. Replaces the per-circuit track-<name>.spec.js stubs AND the
// 7 visual-regression-circuits-N.spec.js files (two redundant pixel suites).
//
// NO BASELINES ARE COMMITTED FOR THIS SUITE, so it is SKIPPED by default.
//
// Every assertion here is a toHaveScreenshot() against a golden that does not
// exist, so a plain run failed 40 circuits with "snapshot doesn't exist" — and
// `npm run test:visual` was listed as a regression gate anyway. A gate that
// cannot pass is worse than no gate: it trains everyone to ignore the group.
// The skip is conditional on the baselines actually being there, so generating
// them is all it takes to switch the suite back on — no edit to this file.
//
// Generate them (Linux/SwiftShader, still an outstanding operation):
//   npx playwright test tracks-visual --project=render --update-snapshots
// Run one circuit:  npx playwright test tracks-visual -g monza
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "@playwright/test";
import { TRACKS, describeTrack } from "./track-helpers.js";

const SNAPS = path.join(path.dirname(fileURLToPath(import.meta.url)),
                        "tracks-visual.spec.js-snapshots");
const HAVE_BASELINES = fs.existsSync(SNAPS) && fs.readdirSync(SNAPS).some((f) => f.endsWith(".png"));

test.skip(!HAVE_BASELINES,
  "no golden baselines committed for tracks-visual — generate them with --update-snapshots to enable this suite");

for (const id of TRACKS) describeTrack(id);
