# COMMENT CLEANUP register

Snapshot cutoff: 2026-10-27T12:20:55.706826+00:00; checkout HEAD `8b6db7ab10f41039897e656f622cb5f1c46615a1`. This register contains 29 current first-party comment/title discrepancies independently corroborated against the working-tree source. Reports continued to arrive during consolidation. Only candidate sections in the supporting maps listed below were reviewed; no claim is made about unlisted or later final reports. Per-file hashes and complete evidence references are in `comment-cleanup-evidence.json`.

This is a reviewable cleanup backlog, not an applied source change or a runtime failure report. No tests, browser, network actions, or commits were run. P1 concerns operational contracts or assertion meaning; P2 concerns factual local drift; P3 concerns wording/navigation. “Factual contradiction” and “wording improvement” are intentionally distinct. All entries have high confidence within static-source limits.

## Current source register

### CC-01 · P2 · factual contradiction

Source: `js/car/car3d.js:25–26`. Existing quote: “longest nose on the grid (williams,”.

Actual: Williams has noseTipZ -0.10, not +0.10; the livery example at 1147 also calls Williams long. Suggested action: Use the current TEAM_STYLE values, or remove team-name examples.

Evidence: `js/car/car3d.js:49–60`; `js/car/car3d.js:1145–1150`. Supporting map: `docs/project-map/car-large-complete.md`.

LSP: Car3D outline resolves TEAM_STYLE at :49 and build at :237.

### CC-02 · P1 · factual contradiction

Source: `js/car/car-body-geom.js:295–295`. Existing quote: “Never the main plane.”.

Actual: frontBakedCount retains at least one cascade element; the first is the main plane. Suggested action: Say: Baked element count; the main plane always stays baked.

Evidence: `js/car/car-body-geom.js:275–298`. Supporting map: `docs/project-map/car-large-complete.md`.

LSP: CarBodyGeom.frontBakedCount definition :296–299; module-file fallback, caller/export coverage unverified.

### CC-03 · P3 · wording improvement

Source: `js/car/car-draw.js:10–11`. Existing quote: “the four helpers”.

Actual: The same sentence lists six injected helpers. Suggested action: Replace four with six, or remove the count.

Evidence: `js/car/car-draw.js:10–11`; `js/game.js:3522`. Supporting map: `docs/project-map/car-large-complete.md`.

LSP: CarDraw.create resolves :33, export :2172, use game.js:3522.

### CC-04 · P2 · factual contradiction

Source: `js/car/liverytex.js:657–658`. Existing quote: “Always null when `bare`”.

Actual: crestKeepsPlate and the bare/keepPlate condition preserve selected authored plate/disc details. Suggested action: Qualify bare-mode omission with the authored crest exceptions.

Evidence: `js/car/liverytex.js:541–545`; `js/car/liverytex.js:712–728`. Supporting map: `docs/project-map/car-large-complete.md`.

LSP: LiveryTex resolves :2; two top-level declarations reported, so source body supplies exact evidence.

### CC-05 · P1 · factual contradiction

Source: `js/track/tracks.js:195–216`. Existing quote: “Widen the road across the pit window instead”.

Actual: This block is immediately followed by racing-line baking; the next pit explanation says widening is gone and the pit is a separate ribbon. Suggested action: Remove the obsolete widening instructions; retain the current separate-ribbon explanation.

Evidence: `js/track/tracks.js:194–242`. Supporting map: `docs/project-map/track-engine-complete.md`.

LSP: Tracks.pitWindow resolves :230–233 and delegates TrackPit.window.

### CC-06 · P2 · factual contradiction

Source: `js/track/core/pit.js:38–40`. Existing quote: “1024 x 512 canvas”.

Actual: SIGN is 1024×1024 and lower crest rows start at y512. Suggested action: Describe a 1024×1024 atlas, with upper fascia cells and lower crest/signal regions.

Evidence: `js/track/core/pit.js:41–54`. Supporting map: `docs/project-map/track-engine-complete.md`.

LSP: TrackPit definition :8.

### CC-07 · P2 · factual contradiction

Source: `js/track/core/hidden-faces.js:17–18`. Existing quote: “the same five points”.

Actual: Bottom tests check three vertices plus centroid and three edge midpoints: seven positions. Suggested action: Replace five with seven.

Evidence: `js/track/core/hidden-faces.js:453–487`. Supporting map: `docs/project-map/track-engine-complete.md`.

LSP: TrackHiddenFaces.strip resolves :540–543; export :614; implementation delegates stripSteps.

### CC-08 · P1 · factual contradiction

Source: `tools/ci/deploy.mjs:12–12`. Existing quote: “run nothing”.

Actual: plan immediately invokes git fetch and checks mergeability. Suggested action: Say: fetch and inspect mergeability/diff; do not run deployment or test steps.

Evidence: `tools/ci/deploy.mjs:204–218`. Supporting map: `docs/project-map/tools-ci-a-complete.md`.

### CC-09 · P1 · factual contradiction

Source: `tools/ci/deploy.mjs:232–234`. Existing quote: “Empty (and logged) if the step is ever renamed”.

Actual: Missing workflow, missing named step, and zero parsed scripts all throw. Suggested action: Say: throws if the workflow step or its script roster cannot be derived.

Evidence: `tools/ci/deploy.mjs:235–252`. Supporting map: `docs/project-map/tools-ci-a-complete.md`.

### CC-10 · P2 · factual contradiction

Source: `tools/ci/github-token.mjs:10–10`. Existing quote: “fall back to `gh auth token` once”.

Actual: Each tokenless resolver invocation calls its gh provider; there is no resolver-level cache. Suggested action: Remove once, or explicitly attribute caching to the caller.

Evidence: `tools/ci/github-token.mjs:19–45`. Supporting map: `docs/project-map/tools-ci-a-complete.md`.

### CC-11 · P3 · factual contradiction

Source: `tools/ci/ci-watch.mjs:86–87`. Existing quote: “the last 200 per URL”.

Actual: The imported cache bound is ETAG_CACHE_MAX=256. Suggested action: Refer to ETAG_CACHE_MAX without duplicating its numeric value.

Evidence: `tools/ci/github-api.mjs:35–36`; `tools/ci/ci-watch.mjs:74–88`. Supporting map: `docs/project-map/tools-ci-a-complete.md`.

### CC-12 · P1 · factual contradiction

Source: `tools/ci/live-run-check.mjs:4–7`. Existing quote: “will wire this on `git push`”.

Actual: The push hook already invokes the tool with a five-second outer timeout. Suggested action: Describe existing advisory push-hook wiring; remove the future-work claim.

Evidence: `.claude/hooks/bash-guard.sh:448–456`; `tools/ci/live-run-check.mjs:32–52`. Supporting map: `docs/project-map/tools-ci-b-complete.md`.

### CC-13 · P1 · factual contradiction

Source: `tools/ci/flake-tally.mjs:7–10`. Existing quote: “Read-only.”.

Actual: --issue reaches issue create/update/close helpers; it also writes local diagnostic/cache outputs. Suggested action: Qualify: GitHub reads by default; --issue mutates the tracked issue.

Evidence: `tools/ci/flake-tally.mjs:372–395`; `tools/ci/flake-tally.mjs:469–486`; `tools/ci/flake-tally.mjs:824–843`. Supporting map: `docs/project-map/tools-ci-a-complete.md`.

### CC-14 · P2 · factual contradiction

Source: `tools/check/extract-module.mjs:5–7`. Existing quote: “wrapping it in”.

Actual: The selected range is parsed raw; parse failure requests whole functions/statements and exits. Suggested action: Say: accepts a range that parses as complete program statements; no automatic wrapping.

Evidence: `tools/check/extract-module.mjs:49–55`. Supporting map: `docs/project-map/tools-check-complete.md`.

### CC-15 · P1 · factual contradiction

Source: `tools/check/trim-comments.mjs:22–22`. Existing quote: “unless path is explicitly that dir”.

Actual: narrativeOkForFile rejects every matching WebGPU path, including explicitly selected ones. Suggested action: Remove the explicit-selection exception and name the unconditional exclusions.

Evidence: `tools/check/trim-comments.mjs:136–140`. Supporting map: `docs/project-map/tools-check-complete.md`.

### CC-16 · P1 · factual contradiction

Source: `tools/check/twin-fidelity.mjs:23–23`. Existing quote: “patch/restore only”.

Actual: The dry branch validates needles and returns before mutate is called. Suggested action: Say: inspect mutation needles only; no patch or test execution.

Evidence: `tools/check/twin-fidelity.mjs:113–127`. Supporting map: `docs/project-map/tools-check-complete.md`.

### CC-17 · P2 · factual contradiction

Source: `tools/check/html-sink-lint.mjs:20–22`. Existing quote: “with no substitutions”.

Actual: isConstantHtml accepts templates whose substitutions are recursively constant, plus supported numeric/string literals. Suggested action: Describe recursively constant template substitutions rather than requiring none.

Evidence: `tools/check/html-sink-lint.mjs:55–63`. Supporting map: `docs/project-map/tools-check-complete.md`.

### CC-18 · P1 · factual contradiction

Source: `tools/check/shader-validate.mjs:32–33`. Existing quote: “2 tool error”.

Actual: The explicit CLI exit expression selects only 0 or 1. Suggested action: Align the exit-code description with explicit 0/1 outcomes; decide separately whether a new error category is desired.

Evidence: `tools/check/shader-validate.mjs:150–172`. Supporting map: `docs/project-map/tools-check-complete.md`.

### CC-19 · P2 · factual contradiction

Source: `tests/unit/shared-math.test.mjs:19–22`. Existing quote: “clamp/lerp/wrap again”.

Actual: PRIVATE_DEF and the ratchet test cover clamp/lerp, not a general private-wrap ban. Suggested action: Narrow this ratchet summary to clamp and lerp; describe wrapDelta semantic checks separately.

Evidence: `tests/unit/shared-math.test.mjs:128–153`. Supporting map: `docs/project-map/tests-unit-49-complete.md`.

### CC-20 · P2 · wording improvement

Source: `tests/unit/shared-math.test.mjs:205–205`. Existing quote: “associative-with-identity”.

Actual: Assertions prove left/right identity and order-sensitive composition, not three-operand associativity. Suggested action: Rename to: mulTo preserves identity and composes in documented order.

Evidence: `tests/unit/shared-math.test.mjs:206–218`. Supporting map: `docs/project-map/tests-unit-49-complete.md`.

### CC-21 · P2 · factual contradiction

Source: `tests/unit/shared-track-foundation-characterization.test.cjs:2–3`. Existing quote: “a later task will change”.

Actual: The current case explicitly asserts that recordBarrier(0,1) covers a full lap. Suggested action: Describe current full-lap compatibility behavior; remove the unfulfilled-future-task framing.

Evidence: `tests/unit/shared-track-foundation-characterization.test.cjs:273–316`. Supporting map: `docs/project-map/tests-unit-49-complete.md`.

### CC-22 · P3 · wording improvement

Source: `tests/unit/settings-reload-vm.test.mjs:15–15`. Existing quote: “The tests above”.

Actual: This is the only case in the file; its own assertions boot fresh VMs on copied storage. Suggested action: Refer explicitly to the sibling persistence suite, or state the cross-boot property directly.

Evidence: `tests/unit/settings-reload-vm.test.mjs:14–32`. Supporting map: `docs/project-map/tests-unit-48-complete.md`.

### CC-23 · P2 · factual contradiction

Source: `tests/unit/settings-open-perf.test.mjs:302–303`. Existing quote: “Silence unused”.

Actual: The top-level assert enforces a real lazy-audio roster-size invariant. Suggested action: State the intended roster invariant, or remove the assert if that contract is not intended in a separate code change.

Evidence: `tests/unit/settings-open-perf.test.mjs:302–303`. Supporting map: `docs/project-map/tests-unit-48-complete.md`.

### CC-24 · P1 · factual contradiction

Source: `tests/unit/settings-export.test.mjs:646–647`. Existing quote: “Neither of these is in SPEC”.

Actual: The same case asserts unlimitedBudget is accepted and persisted; only somethingElse is absent. Suggested action: Say: somethingElse is unknown and must not be written; unlimitedBudget is allowed.

Evidence: `tests/unit/settings-export.test.mjs:651–658`. Supporting map: `docs/project-map/tests-unit-48-complete.md`.

### CC-25 · P3 · wording improvement

Source: `tests/unit/setup-preview-hull.test.mjs:32–35`. Existing quote: “the one non-colour field”.

Actual: ENUM_GEOM immediately lists eight geometry field families. Suggested action: Use plural: non-colour geometry fields, sampled with two values each.

Evidence: `tests/unit/setup-preview-hull.test.mjs:36–37`. Supporting map: `docs/project-map/tests-unit-48-complete.md`.

### CC-26 · P3 · wording improvement

Source: `tests/unit/setup-screens-state.test.mjs:6–7`. Existing quote: “CareerUI.close()”.

Actual: The fixture constructs CareerScreen.create; historical prose uses the older module name. Suggested action: Use CareerScreen.close in navigation prose, retaining the dated regression context.

Evidence: `tests/unit/setup-screens-state.test.mjs:175`. Supporting map: `docs/project-map/tests-unit-48-complete.md`.

LSP: CareerScreen definition resolves to js/career/career-ui.js:2; fixture constructs that current global at :175.

### CC-27 · P1 · factual contradiction

Source: `.github/workflows/ci.yml:2937–2946`. Existing quote: “trial, non-blocking”.

Actual: The golden test step has no continue-on-error; baseline-trial is a ci-verdict dependency and ADVISORY is empty. Only artifact upload is best effort. Suggested action: Remove the non-blocking label and green-workflow promise at 2992–2993, or explicitly decide on advisory behavior in a separate workflow change.

Evidence: `.github/workflows/ci.yml:2960–2996`; `.github/workflows/ci.yml:3115`; `tools/ci/ci-verdict.mjs:31–82`. Supporting map: `docs/project-map/github-02.md`.

### CC-28 · P2 · factual contradiction

Source: `.github/workflows/webkit-leg.yml:30–30`. Existing quote: “the spec currently pins montreal”.

Actual: The workflow passes APEX_WEBKIT_TRACK and the spec uses that environment variable with a Montreal fallback. Suggested action: Say: circuit id passed to the WebKit boot race; defaults to montreal.

Evidence: `.github/workflows/webkit-leg.yml:76–81`; `tests/specs/webkit-boot.spec.js:24`. Supporting map: `docs/project-map/github-03.md`.

### CC-29 · P2 · wording improvement

Source: `.github/workflows/pages.yml:447–447`. Existing quote: “within 4 minutes”.

Actual: The failure issue hardcodes four minutes, but verification is delegated and the job cap is fifteen minutes. A failure need not mean a four-minute polling expiry. Suggested action: Say: live verification did not confirm the deployed build; link the run for the actual failure and elapsed time.

Evidence: `.github/workflows/pages.yml:390–449`. Supporting map: `docs/project-map/github-03.md`.

## Historical-document header/status work

Keep historical observations as attributed history. The audit reader `docs/notes/system-audit-4/skills/code-nav.md:1–17` begins with an unqualified KEEP verdict and records tools unavailable in that review. Add an explicit historical-audit/snapshot header if maintaining that reader; several proposed skill improvements are already present in `.claude/skills/code-nav/SKILL.md`. Its former attachment statement is not evidence about this session. This is a status-label suggestion, not a fresh runtime discrepancy.

Dated timings, old fleet/roster counts, fixed regression narratives and retired workflow descriptions should retain dates/status rather than be silently rewritten as current measurements. Generated coverage prose must be changed through its header/manifest producer, never by editing generated output. Historical and missing-path details, if needed by a later cleanup, belong in the evidence JSON rather than new navigation links.

## Rejected or limited candidates

The foundation header’s “five checks” claim is currently correct: five test declarations were inspected. The report’s proposed six-check correction is excluded. The previously disproved vendor enum claim is excluded. These negative checks matter because supporting maps contain candidates, not automatic findings.

Runtime symbol lookups used attached apex-lsp. Module-file fallback results are explicitly qualified above; no zero-use or fallback result establishes dead code. No rendered result, GPU behavior, external CI result, polling duration measurement, or successful suite is asserted.
