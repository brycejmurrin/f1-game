// ci-workflow — the workflow slices the ci-*.test.mjs guards read (split out of ci-coverage.test.mjs, T2-16).
//
// Every slice is bounded at the next job head and MUST exist: a renamed job used to leave `undefined` and the guard
// died with a TypeError on `.includes`/`.match` instead of naming the job that moved.
import fs from "node:fs";
import { SELECTED_GATE } from "../../tools/ci/select-specs.mjs";

export const SELECTED_TIMEOUT_MS = SELECTED_GATE.perTestTimeoutSec * 1000;

const read = (rel) => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

/** A slice that must exist: throws a diagnosis naming `what`, never returns undefined. */
export function must(what, slice) {
  if (typeof slice !== "string" || !slice.trim()) throw new Error(`ci workflow slice "${what}" not found — was the job or step renamed?`);
  return slice;
}

export const ciWorkflow = read(".github/workflows/ci.yml");
export const pagesWorkflow = read(".github/workflows/pages.yml");
export const gpuWorkflow = read(".github/workflows/gpu-census.yml");
export const selectStep = read("tools/ci/ci-select-specs-step.sh");

// Both job slices are bounded at the next job head. An unbounded `split("\n  selected:")[1]` reads every job appended
// after it as part of it, so a later job's `continue-on-error: true` (the golden-menu trial) fails the gate assertion
// against a gate nobody touched — the parser defect first fixed on 2026-09-10.
export const selectJob = must("select job", ciWorkflow.split("\n  select:")[1]?.split("\n  selected:")[0]);
export const selectedJob = must("selected job", (ciWorkflow.split("\n  selected:")[1] || "").split(/^  [a-z][\w-]*:$/m)[0]);
// The ship filter is a STEP of the `select` plan job since 2026-10-15 (a job of its own from 2026-09-22).
export const shipFilter = must("ship filter step",
  (ciWorkflow.split("      - name: Does this diff change anything that ships?\n")[1] || "").split("\n      - name: ")[0]);
export const rendererJob = must("renderer-macos job", ciWorkflow.split("\n  renderer-macos:")[1]?.split("\n  xr:")[0]);
// A step of the `select` plan job since 2026-10-15 (a job of its own before).
export const rendererFilter = must("renderer filter step",
  ciWorkflow.split("      - name: Does this diff touch the renderer?\n")[1]?.split("\n      - name: ")[0]);
export const PR_ACTIVE =
  "(github.event_name != 'pull_request' || !github.event.pull_request.draft || contains(github.event.pull_request.labels.*.name, 'run-ci'))";
