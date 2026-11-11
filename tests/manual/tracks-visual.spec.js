// @ts-check
// RETIRED 2026-10-27 (specs hygiene).
//
// Was a per-circuit toHaveScreenshot suite. No golden baselines were ever
// committed (HAVE_BASELINES stayed false), so every run was a whole-file skip
// and green meant "skipped", not "pixels verified". `test:visual` was retired
// (docs/notes/PERF-FINDINGS.md); pick-tests must not recommend a visual group
// (tests/unit/pick-tests.test.mjs pins this path under tests/manual/).
//
// Coverage that still asserts:
//   - tests/manual/blank-scan.spec.js — blank PNG byte-size per circuit
//   - tests/specs/terrain-over-road.spec.js / props-over-road.spec.js — geometry
//
// The path stays so the pick-tests existence pin keeps its meaning. Do not
// resurrect without committing baselines and restoring describeTrack.
import { test } from "@playwright/test";

test.skip(true,
  "retired: baselines never generated; use blank-scan + terrain/props-over-road");
