# Complete test group source map

Static snapshot of `tests/groups.json`, read in full including every commentary string and roster entry. The companion `tests-groups-evidence.json` holds the full SHA-256, contiguous byte-chunk hashes, parsed-part hashes, recursive field/type inventory, every group definition and derived command, all roster references with filesystem matches, and all cross-owner overlaps. No tests, generators, browser, network, staging or commits were run.

## Source and contracts

The root has four fields: `//` is explanatory prose; `toolingFast` interleaves `//` strings with test paths; `groups` maps npm script names to definitions; `isolatedFiles` is shared exclusive benchmark policy. Only strings beginning with `//` are stripped by `filesOnly`; comment order has no execution semantics. Each group has `kind` and optional `files`, `flags`, `cmd`. Command groups use `cmd` literally: their optional file lists serve coverage/ownership metadata. Browser groups delegate to `run-playwright.mjs`; `test` and `test:render` omit file filters and depend on Playwright configuration. Node groups default to a 900000 ms per-test timeout. The three isolated filenames change affected Node groups to the manifest-validated `run-node-group.mjs` wrapper, which runs isolated files one at a time before the remaining pool. `tooling-fast.mjs` also runs selected isolated files before its parallel pool and drops inherited `NODE_TEST_CONTEXT`.

`tools/gen/gen-test-groups.mjs` generates package scripts, preserving key order, rejecting an added manifest name with no package script, and deleting removed test scripts. Its `--check` compares derived output; package `gen` and `gen:check` include it. The file header's claim that tooling-fast's file list is generated is stale: since 2026-10-26 that runner imports and freezes `filesOnly(loadGroups().toolingFast)` directly. Its comments are no longer emitted into a generated runner block.

## Selection and gates

`pick-tests.mjs` expands browser group file patterns into spec ownership and returns every owning group, while `stripSpecOwner` removes owner-only recommendations for CI's per-spec selector. This avoids rerunning unedited group mates. `pick-unit-slices.mjs` derives file-to-slice ownership from group file lists; its `SLICE_SCRIPTS` table assigns topical Node groups and VM partitions to workflow arms. `node-plan.mjs` scopes expensive VM/page/slow scripts using changed paths and fails safe to the full plan on unrouteable or infrastructure changes. Its matched PR plans set `NODE_PLAN_SKIP_TF`, and `run-group.mjs` omits tooling-fast overlap while retaining flags and isolated phases; an empty filtered list exits successfully without accidental discovery.

`ci.yml` runs game-vm-a in two circuit shards, game-vm-b1/b2 in distinct arms, adapted page-a/page-b separately, and topical riders on vm-a1, vm-a2 and slow. The workflow and deploy code derive sweep file lists from generated package scripts; geometry routing controls full or targeted sweeps. `deploy.mjs` reads the manifest's guards roster and repairs package scripts from merged source. `guards-verdict.mjs` also reads test:guards files directly. A group definition alone does not imply an always-on gate.

`nightly-group.mjs` rotates sorted browser groups by UTC epoch day and explicitly excludes full discovery, gfx, XR, WebKit, baseline, gallery, render and smoke for documented homes. Its UNSCHEDULED ledger names local aliases and manual audits. Float/clip are stricter manual audits, graph parity requires a meaningful base, shimmer is an opt-in measurement, and tooling combines two independently gated halves. These claims were read statically; no scheduling or run outcome was verified.

## Complete group inventory

| Group | Kind | File entries | Flags | Contract |
|---|---|---:|---|---|
| `test` | browser | 0 | — | Playwright filters |
| `test:aero` | browser | 4 | — | Playwright filters |
| `test:agent-contract` | node | 2 | — | Node explicit roster |
| `test:agent-output` | node | 5 | — | Node explicit roster |
| `test:audio-unit` | node | 39 | — | Node explicit roster |
| `test:audit` | command | 0 | — | literal command |
| `test:baseline` | browser | 1 | — | Playwright filters |
| `test:car` | browser | 14 | — | Playwright filters |
| `test:circuits` | browser | 12 | — | Playwright filters |
| `test:clip` | command | 0 | — | literal command |
| `test:collisions` | browser | 1 | — | Playwright filters |
| `test:desktop-unit` | node | 9 | — | Node explicit roster |
| `test:docs-guards` | node | 36 | — | isolated phases |
| `test:float` | command | 0 | — | literal command |
| `test:gallery` | browser | 1 | — | Playwright filters |
| `test:game-vm` | node | 86 | — | isolated phases |
| `test:game-vm-a` | node | 1 | — | Node explicit roster |
| `test:game-vm-b` | node | 85 | — | isolated phases |
| `test:game-vm-b1` | node | 39 | — | isolated phases |
| `test:game-vm-b2` | node | 46 | — | Node explicit roster |
| `test:garage-unit` | node | 30 | — | isolated phases |
| `test:gfx` | browser | 10 | — | Playwright filters |
| `test:graph-parity` | command | 0 | — | literal command |
| `test:guards` | command | 45 | — | literal command |
| `test:hooks` | browser | 18 | — | Playwright filters |
| `test:input` | browser | 14 | — | Playwright filters |
| `test:lifecycle-unit` | node | 4 | — | Node explicit roster |
| `test:mcp` | node | 26 | --test-concurrency=1 | Node explicit roster |
| `test:mobile-unit` | node | 5 | — | Node explicit roster |
| `test:modes` | browser | 10 | — | Playwright filters |
| `test:net` | browser | 8 | — | Playwright filters |
| `test:net-unit` | node | 22 | — | Node explicit roster |
| `test:node-slow` | node | 10 | --test-concurrency=1 | Node explicit roster |
| `test:perf-budget` | browser | 3 | — | Playwright filters |
| `test:perf-frametime` | browser | 2 | — | Playwright filters |
| `test:perf-idle-churn` | browser | 1 | — | Playwright filters |
| `test:perf-race-entry` | browser | 1 | — | Playwright filters |
| `test:phone-recorder` | browser | 2 | — | Playwright filters |
| `test:physics-core` | browser | 7 | — | Playwright filters |
| `test:render` | browser | 0 | --project=render --workers=4 | Playwright filters |
| `test:service-worker` | node | 4 | — | Node explicit roster |
| `test:shimmer` | command | 0 | — | literal command |
| `test:smoke` | browser | 1 | — | Playwright filters |
| `test:state-unit` | node | 61 | — | Node explicit roster |
| `test:steering-unit` | node | 40 | — | Node explicit roster |
| `test:sweeps` | node | 29 | --test-concurrency=1 | Node explicit roster |
| `test:sweeps-parts` | node | 1 | — | Node explicit roster |
| `test:tiny` | browser | 3 | — | Playwright filters |
| `test:tooling` | command | 0 | — | literal command |
| `test:tooling-fast` | command | 0 | — | literal command |
| `test:ui` | browser | 24 | — | Playwright filters |
| `test:vm-page` | node | 1 | — | Node explicit roster |
| `test:vm-page-a` | command | 4 | — | literal command |
| `test:vm-page-b` | command | 8 | — | literal command |
| `test:webkit` | browser | 1 | --project=webkit | Playwright filters |
| `test:xr` | browser | 2 | --project=xr-emulated | Playwright filters |

## Validation and limits

The snapshot contains 127,191 bytes, 56 groups ({'browser': 24, 'node': 22, 'command': 10}), 702 tooling-fast files and 549 tooling-fast comments. There are 1483 roster references; 0 have no filesystem match. Package command drift: 0. Duplicate JSON keys: 0; duplicate tooling-fast entries: 0; duplicate isolated entries: 0. Full lists live in JSON.

Every parsed object, array, key and scalar was recursively inventoried; every roster path was checked, including glob matches. Within-list duplicates, duplicate JSON keys, allowed group fields, package command agreement, and cross-owner membership are recorded separately. Cross-group overlap is expected for aliases, VM partitions and shared boot specs; it is not counted as a duplicate entry within a group. Existence checks cover explicit roster fields; informal paths embedded in prose are commentary references rather than executable roster members.

This maps routing and execution contracts, not the assertions inside each test. Browser discovery, runtime success, performance claims and CI status remain unverified. This is text/configuration navigation outside game runtime code, so LSP lookup was unnecessary.

## Comment cleanup candidates

- Correct the root generation prose: package scripts are generated, tooling-fast imports the source directly; comment strings are dropped rather than emitted verbatim.
- Remove or reattach the orphan fragment “that touches the LUT rather than on every edit.” The adjacent deploy entries do not supply its missing subject.
- Review adjacency after alphabetical insertion: the front-wing slow-entry narrative precedes decal-budget and car-FX notes; the activation-zone narrative precedes assert-audit; the PhoneRecorder note precedes GPU-test notes; the weather explanation precedes WATCH scrub. These strings no longer reliably document the immediately following filename.
- Preserve reasons for exclusive benchmarks and unconditional coverage, but move dated timings, old failure stories, round/lane labels and issue-specific prose into historical evidence where practical. Recorded seconds and fleet counts are dated commentary, not live budgets.
- Replace “one edit here now” with the current operational contract: generator still requires a package script key for a newly named group, and AGENTS also requires a TESTING row. This source is authoritative for membership, not every onboarding step.

All candidate source text remains unchanged. Full raw commentary is retained only in the JSON companion to keep historical and possibly missing path mentions out of new Markdown references.

## Inspected consumers

`tools/gen/gen-test-groups.mjs`, `tools/ci/tooling-fast.mjs`, `tools/ci/run-node-group.mjs`, `tools/ci/run-group.mjs`, `tools/ci/pick-tests.mjs`, `tools/ci/pick-unit-slices.mjs`, `tools/ci/node-plan.mjs`, `tools/ci/nightly-group.mjs`, `tools/ci/deploy.mjs`, `.github/workflows/ci.yml`, `tests/unit/test-groups-generated.test.mjs`, `tests/unit/test-groups.test.mjs`, and `package.json`. Inspection was targeted to substantiate manifest edges, not a claim of full raw-file coverage for those consumers.
