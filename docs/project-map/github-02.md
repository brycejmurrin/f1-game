# GitHub workflows — batch 02

This map covers all 160,000 assigned text bytes. github-02-evidence.json records whole-file hashes separately from assigned-span and read-chunk hashes, exact half-open boundaries, supplemental contract reads, and the structured workflow graph. Current AGENTS.md was read. Inspection was static: no tests, browser, network, workflow dispatch, source edits, staging or commits.

## Scope and boundaries

ci.yml is partial at the beginning: byte 109490 starts inside the smoke job’s dispatched SwiftShader discussion/step; the assigned portion then reaches EOF at byte 213506. Earlier guards, lints, node-suite and sweep implementations belong to batch 01. A supplemental header read covers triggers, reusable inputs, default permissions and concurrency; it does not expand the claim to those earlier job bodies.

gpu-census.yml is partial at the end: bytes 0–35724 cover the header, planner, adapter census, request experiments, three.js WebGPU and WebGL2 controls, and the beginning of GLX. The end falls inside a command. Remaining GLX arguments, the WGX leg, final verdict and general artifact upload belong to batch 03. desktop.yml, flake-tally.yml and garage-before.yml were read completely.

Comments contain useful change history but are not evidence that an old run passed or that a current condition matches its prose. Historical experiment references and their filesystem status are retained only in the JSON inventory.

## CI planning, execution and verdicts

ci.yml accepts PR opened/synchronize/reopened/ready_for_review/labeled/edited events targeting the deploy branch, a 04:17 UTC nightly, a manual browser-group dispatch, and reusable calls from Pages. The reusable interface is before_sha, concurrency_key and fast_tier_run. Manual inputs are group (tiny default), renderer_macos and gl (llvmpipe default). A nonempty caller key identifies a Pages train because reusable workflows see the caller’s event rather than a workflow_call event.

The common PR predicate opts drafts in with run-ci or a body line beginning CI: run. Only an edit that adds that marker to an unlabelled draft starts work; unrelated label/body edits use isolated concurrency keys and evaluated alternate verdict names. A draft fast-tier success is named separately from required CI, preventing it from satisfying the full-tier requirement while a ready run is pending. Workflow concurrency replaces older PR work on the head branch; manual/nightly/caller runs have independent keys. Default permission is contents: read. select and driving-model add actions: read; train-twins explicitly retains contents: read.

select is the shared planner. Its outputs feed the browser matrix, node slices, geometry jobs, smoke shipping decision, macOS renderer, XR, train VM twins, and coverage verdict. Geometry uses a valid comparison base, derives fleet paths from geometry-paths.mjs and sweep suites from package.json, then emits full geometry, targeted suites and optional circuit scope. Unknown bases or unreadable rules request the fleet. Node planning uses PR test-commit ancestry, a known-green previous push, or all slices; schedules/manual dispatch take the all-slices path before the caller-specific branch.

The browser selector restores failed-spec memory from the branch and deploy branch. ci-select-specs-step.sh resolves the base, optionally overlays fresh timings, invokes select-specs.mjs, writes sel.json, fails closed on unmatched changes, and exports shards/any/dropped/reason. The nightly broadens budget/overflow and prioritizes stale specs. A train computes the VM twins of dropped browser twins; train-twins runs those hand twins or adapted specs under APEX_VM_PAGE=1, with circuit scope passed through.

The shipping filter derives its names from stage-files.mjs. A ready PR first checks its own diff, then the active successful Pages deployment; this prevents an unpublished base change from being skipped. Missing API/diff/base information runs smoke. An empty/unreadable staging allowlist is fatal. Renderer selection derives the gfx spec list and filters renderer, lighting, launch-config and helper paths. XR filters its runtime and renderer boundaries, IWER inputs and workflow. The advisory base-verdict step cannot change the planner’s verdict.

| Job | Dependency and executed contract | Evidence/output |
|---|---|---|
| driving-model | select.driving; excluded from Pages and reused fast tier; optional exact-head draft reuse; physics characterization | Always JUnit telemetry; failure/cancel report, 7 days |
| renderer-macos | select.renderer plus train/nightly/forced dispatch/ready PR; full Chromium; anyHardware must be exactly true; one-worker test:gfx | Census and run artifacts always, 7 days |
| xr | select.xr and no caller key; one-worker test:xr | Failure/cancel artifacts, 7 days |
| selected | select.any and never a draft; dynamic shards; PR legs use fleet selected lanes with queue: max; train/nightly/manual legs have independent groups | Started marker, always JUnit, failure/cancel report, 7 days |
| staged-boot | Full-tier path; stage, prove minification, stamp exact SHA, serve only _site, run smoke | Failure/cancel artifacts, 7 days |
| baseline-trial | Nightly/manual only; explicitly excluded from Pages | Rendered goldens and report always, 14 days |

Selected shards take timeout, workers, spec list, optional Playwright shard, circuit list and retry count from the plan. They use llvmpipe except an explicit SwiftShader opt-out or a menu-baseline shard. They stop after three failures, use a 180-second per-test timeout, and make unquarantined flakes fail. The started marker is uploaded before the browser command; diagnostics and timing uploads are best effort, while the marker upload itself is a normal blocking step.

selected-verdict needs select, selected and guards, and runs after skipped legs when the run was not cancelled. It downloads every selected JUnit artifact and marker, stages JUnit for diagnosis, fails uncovered touched JS directories outside the train, and invokes selected-gate-verdict.mjs. The implementation requires successful planning; failed/cancelled selected matrices remain red even when siblings have clean JUnit or failed before producing a marker. Draft deferral passes with a warning for dropped work; a genuine empty plan passes; dropped routed specs fail ordinary runs and warn on the train. Contrary to an older YAML comment, guards failure is annotated here and enforced independently by CI rather than duplicated as this verdict’s failure. The merged failed-spec list is saved once per run, avoiding shard cache races.

ci-verdict needs all listed major jobs, including selected-verdict, staged-boot, train-twins and baseline-trial. It runs under !cancelled(), evaluates a distinct name for ignored/draft events, and judges NEEDS JSON. ci-verdict.mjs fails missing/empty payloads, unknown results, failures, cancellations and an all-skipped run; ordinary legitimate skips pass. Ready PRs additionally require guards-a/b/c/d, guards, select, smoke and staged-boot to have actually succeeded. Its summary distinguishes executed and skipped jobs. No advisory job exemption currently exists in the helper’s ADVISORY set.

One current prose/implementation mismatch matters: baseline-trial is named and described as non-blocking, and its final echo claims the workflow stays green, but neither its test step nor its job has continue-on-error. Its failed test therefore remains red and ci-verdict consumes it. The rendered-golden upload alone is best effort. This is an observed static contract, not a proposed fix.

Timing artifacts are inputs for the timing collector; selected JUnit/marker artifacts feed selected-verdict, and the merged cache feeds the next selector. The assigned CI portion writes no PR comments and contains no comment cleanup. Artifact retention handles diagnostics expiry.

## Desktop packaging

desktop.yml triggers on packaging-path PRs, desktop-v* tags and manual dispatch. PR pack-smoke skips drafts and uses Ubuntu only; manual pack-smoke uses Linux/Windows/macOS. The independent release-build matrix runs on tags/manual dispatch, and auto-update-plan writes a documentation summary on those events. There are no needs edges between these jobs. Concurrency is per workflow and PR head ref/ref with replacement enabled; permission is contents: read.

Both packaging lanes use Node 22.14.0, full checkout history and desktop npm ci, with package-manager caching disabled. pack:test produces an unpacked app with the inspect fuse enabled, reads/asserts the fuse, then runs Playwright Electron with soft GL; Linux adds xvfb. Its reports retain seven days. Release scripts produce the Linux, Windows and macOS installers/metadata as fourteen-day artifacts; no GitHub release publication is present. Optional signing verification checks CSC_LINK presence. The declared signed_verify input is not consumed by those conditions, so setting it false does not disable the secret-driven verification. Gatekeeper assessment and missing notarization tickets are explicitly tolerated. The auto-update job prints a plan; it does not exercise updates.

## Flake and base-red telemetry

flake-tally.yml runs daily at 06:19 UTC and every two hours at minute 17, or manually with days/mode. It has contents: read, actions: read and issues: write, a single noncancelling flake-tally group, and one twenty-minute Ubuntu job. It checks out the deploy branch, installs Node 22 without npm dependencies, and calls flake-tally.mjs with the runner token and a temporary work directory.

Daily mode reads failed ci.yml/Pages runs and failed browser logs, proposes repeat offenders and rewrites a marked flaky issue. It never changes quarantine. Base-red mode reads three hours and opens, refreshes or closes a marked base-red issue. Support reads confirm issue body/title updates rather than comments: clean base-red windows close the matching open issue; daily upsert has no corresponding close path. Both choose the first matching marked non-PR issue among fifty open labelled results; they do not clean duplicate issues. These labels/issues are advisory, with no gate dependency in this workflow.

## Reusable garage evidence

garage-before.yml is a nongating daily 10:23 UTC/manual workflow with ref defaulting to the deploy branch. Permissions are contents/actions read. Workflow concurrency is noncancelling per requested ref; plan resolves capture/SHA/reason/matrix/views. A manual run always captures; scheduled planning compares watched inputs with the nearest pack. garage-before.mjs’s inspected contract fixes eleven factory teams into four shards and seven views, and shares the recipe with the fetch consumer.

Conditional macOS capture checks out the resolved SHA, installs full Chromium and invokes garage-angles.mjs, which owns its static server. Capture has max-parallel: 2 and no per-matrix concurrency group. Each shard uploads five-day evidence. pack requires successful capture, uses its own noncancelling per-SHA group, merges shard artifacts, writes MANIFEST.json, and uploads the thirty-day SHA-named pack. garage-angles-fetch.mjs consumes that final pack. There is no comment producer or cleanup beyond artifact expiration.

## GPU census — bounded prefix

gpu-census.yml accepts 05:47 UTC nightly runs, manual dispatch, and request-file pushes on cursor/claude branches. Permission defaults to contents: read; planning adds actions: read. Dispatches serialize per ref without cancelling the active run; push requests use unique run IDs; nightlies have a separate cancelling group. This default single-pending queue can replace an older pending dispatch.

plan checks that a topic push contains an own nonmerge first-parent request edit, excluding inherited merge requests; unknown ancestry runs safely. A nightly skips only after a known diff from the last green nightly contains no watched renderer paths. A manual dispatch always runs. The planner normalizes runner-image allowlists, single-line strings, clock, time-of-day, camera, entry, bounded memory cycles, and request-only experiment selectors. It passes all values as outputs/environment, not untrusted shell expressions.

The census matrix runs unless planning explicitly says false. It installs full Chromium plus Linux dependencies as needed, captures OS diagnostics best effort, writes the adapter census JSON, and immediately publishes adapter identities and anyHardware to the job summary. gpu-census.mjs’s inspected contract distinguishes true/false/null hardware outcomes and does not boot the game.

Within this prefix, request-only measurements have bounded steps and their own seven/fourteen-day artifacts. Ordinary three.js/WebGPU and WebGL2 controls invoke gpu-game-check.mjs with the same native-present preference, clock/time-of-day/camera/entry and optional localStorage flags. They produce JSON and PNG; the tool checkpoints JSON during phases. Optional relaunch runs cold/warm launches on a shared persistent profile and origin. Optional memory cycles run both three.js paths. Measurement steps are continue-on-error with their own caps; they are not independently the final workflow verdict. The assigned prefix only begins GLX and cannot establish the final gate, its complete artifact set or consumers beyond the visible summary/uploads.
