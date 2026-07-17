// @ts-check
// Consolidated per-track visual regression: one forward-facing chase-cam
// screenshot per circuit at each LAP_FRACTIONS position, pixel-diffed against a
// golden baseline. Replaces the 24 identical track-<name>.spec.js stubs AND the
// 7 visual-regression-circuits-N.spec.js files (two redundant pixel suites).
//
// Regenerate baselines (CI/Linux — snapshots are -chromium-linux):
//   npx playwright test tracks-visual --update-snapshots
// Run one circuit:  npx playwright test tracks-visual -g monza
import { TRACKS, describeTrack } from "./track-helpers.js";

for (const id of TRACKS) describeTrack(id);
