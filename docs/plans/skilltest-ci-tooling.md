# Skilltest — ci-tooling

Hands-on audit of the **ci-tooling** group (2026-10-01). Ship tip at start:
`cd4ec4c6f` (`claude/f1-game-project-26h3ng`). Later ship tip while finishing:
`5fa849bb1`.

**Skills:** `check-changes`, `pwa-cache-service-worker`  
**Tools / automation:** `tools/ci/*`, `.github/workflows`, `.github/actions`,
`tools/desktop/*`, `tools/moves/*`, `tools/manifest.cjs`

Method: follow each SKILL.md / tool header exactly as a new agent would; run
real commands against the repo (small inputs). Skip secrets / GPU / workflow
**dispatch** (dry-run / `--plan` / YAML parse only). Do not merge; fix PRs stay
draft until CI is green on the exact head.

## Verdict counts

| Verdict | Count |
|---|---:|
| works | 38 |
| works with caveats | 14 |
| broken (fixed in this audit) | 4 |
| not testable | 6 |

## Skills

| Item | Verdict | Evidence / command | Issue found | Fix PR or proposal |
|---|---|---|---|---|
| **check-changes** SKILL.md | works | Followed primary path: `verify-change --plan`, `--plan` with paths, `pick-tests`, `bump-cache`, `gen-shell --check`, MCP `apex_*` dry calls, `session-status`, `who-is-on-it --claim` | Ladder/`--gate-only` correctly documented; MCP dryRun works | — |
| check-changes → `verify-change.mjs --plan` | works | Empty tree → `selection: none`; paths → batches `circuits`/`tiny` | — | — |
| check-changes → `verify-change.mjs --fast` | works | `docs/README.md` → tooling-fast + cache-check, verdict pass (~160 s) | — | — |
| check-changes → `pick-tests.mjs` | works | `--json tools/ci/bump-cache.mjs sw.js` → `service-worker` + `tooling-fast` | — | — |
| check-changes → `bump-cache.mjs` | works | Repo check consistent build 1695; `--apply` without `--root` refuses exit 2 | — | — |
| check-changes → `apex-tools-mcp.sh` | works | `apex_verify_change_fast` dryRun; `apex_pick_tests`; `apex_bump_cache_check` | — | — |
| check-changes → `references/bump.md` | works | Matches `gen-shell --check` + bump-cache behaviour | — | — |
| check-changes → `references/triage.md` | works (caveat) | `test-bg --status` / `--help` OK; did not start a browser group (load / time) | Step-0 commands fine; solo/browser path not exercised this pass | Proposal R1 |
| check-changes → `references/deploy.md` / `deploy.mjs --plan` | works | `--plan` prints merge/tools/sweeps steps; dirty tree fine | Did not run `--gate-only` (multi-minute; not needed for docs/tools slice) | — |
| check-changes → `sync-pr.mjs` | works | No-arg prints usage exit 0; did not sync (would leave HEAD on `sync-pr-*`) | Header warning about leftover branch is accurate | — |
| **pwa-cache-service-worker** SKILL.md | works with caveats | `npm run test:service-worker` (39 pass); `load-order` (24 pass); `gen-shell --check` | Skill correctly warns index.html may miss `service-worker` group — confirmed: `pick-tests --json index.html` → baseline/tiny/tooling-fast/ui, **no** service-worker | — |
| pwa → `offline-precache-check.cjs` | broken → fixed | `--help` was taken as warm circuit and launched Chromium (`warm=--help`) | Dash-flags / `--help` must not boot Playwright | **#674** |
| pwa → mid-run `version.json` bump | not testable | Would need a live Playwright run | Documented hazard; not reproduced | — |

## tools/ci/

| Item | Verdict | Evidence / command | Issue found | Fix PR or proposal |
|---|---|---|---|---|
| `assert-audit.mjs` | works | Ran; lists vacuous / empty `.catch` sites | Advisory report, exit 0 | — |
| `base-green.sh` | works with caveats | No args / no `GITHUB_REPOSITORY` → `unknown` exit 0 | Needs env; fail-safe | — |
| `base-verdict.sh` | works with caveats | No args → `1: head sha` (set -u) | Usage error is terse | Proposal R2 |
| `behind-ship.mjs` | works | `0 commit(s) behind` | — | — |
| `bump-cache.mjs` | works | See check-changes | — | — |
| `ci-coverage.mjs` | works | Prints deploy gate coverage summary | — | — |
| `ci-pr-base.sh` | works | `bash -n` OK; header docs | Used by CI; not invoked with fake event | — |
| `ci-resolve-before.sh` | works | `bash -n` OK | — | — |
| `ci-select-specs-step.sh` | works | `bash -n` OK; run by ci.yml's `select` job (the composite action that also wrapped it was unused and was deleted 2026-10-04) | — | — |
| `ci-verdict.mjs` | works with caveats | No `NEEDS` → `PASS (0 success…)` | Empty env looks green locally; CI always sets `NEEDS` | Proposal R3 |
| `ci-watch.mjs` | broken → fixed | Without env token: `= ci unknown — API: no GH_TOKEN`; with `gh auth token` fallback: works `--once` | Cloud agents have `gh` but often no `GH_TOKEN` | **#677** |
| `coverage-merge.mjs` | not testable | Needs coverage artifacts | — | — |
| `deploy.mjs` | works | `--plan` only (no push) | — | — |
| `fixture-consumer-audit.mjs` | works | Floor 121 OK | — | — |
| `geometry-paths.mjs` | works with caveats | `--ere` / `--targeted` / import OK; **bare invoke exits 0 silently** | No usage on bare CLI (header documents flags) | Proposal R4 |
| `github-token.mjs` | works (new) | Added by #677; unit-tested via `ci-watch.test.mjs` | — | **#677** |
| `junit-failed.mjs` | works | No junit → `no failures to carry` | — | — |
| `nightly-group.mjs` | works | `GROUP=collisions`; `--list` prints rota | — | — |
| `node-plan.mjs` | works | `--since HEAD~5` plans RUN lines | — | — |
| `pages-live-sha.sh` | works | With site URL → live sha; curl fail → empty exit 0 | — | — |
| `pages-publishable.sh` | works | Ancestor check → `true` | Network | — |
| `pages-reuse-verdict.sh` | works with caveats | Needs GH token + deep history; `bash -n` OK | Not fully exercised | Proposal R5 |
| `pick-tests.mjs` | works | See above | — | — |
| `pick-unit-slices.mjs` | works with caveats | `--all` OK; **`--help` → `nothing changed`** (treated as empty diff) | Confusing for new agents | Proposal R6 |
| `playwright-occupancy.mjs` | works with caveats | Library only; bare `node …` silent exit 0 | README lists as tool; no CLI | Proposal R7 |
| `remote-group.mjs` | broken → fixed | Bare invoke said `not a group name: undefined`; `--plan` with `GROUP=ui` OK | Usage missing | **#670** |
| `remote-group` dispatch | not testable | Would trigger `browser-group.yml` | Skipped per audit rules | — |
| `run-group.mjs` | works | No args → usage exit 2 | — | — |
| `run-playwright.mjs` | works with caveats | `--help` starts static server then forwards to Playwright help | Side effect on help | Proposal R8 |
| `select-budget.mjs` | works | Prints budget table | — | — |
| `select-recall.mjs` | works | Recall report 2/5 | — | — |
| `select-specs.mjs` | works | `--since HEAD~1 --json` returns selection | — | — |
| `session-status.mjs` | works | Markdown handoff block | — | — |
| `spec-staleness.mjs` | works with caveats | Full 30-day replay is slow (~minutes); no `--help` (timeout looked like hang) | Document / add `--help` that exits before replay | Proposal R9 |
| `spec-timings.mjs` | works | No junit → merge 0 samples | — | — |
| `sync-pr.mjs` | works | Usage on no args | — | — |
| `test-bg.mjs` | works | `--status`, `--help` usage | Did not start a group this pass | Proposal R1 |
| `test-coverage-audit.mjs` | works | All test files covered | — | — |
| `test-honesty.mjs` | works | 16 skip/fixme sites explained | — | — |
| `test-observed.mjs` | works | Lists never-observed titles | — | — |
| `test-solo.mjs` | works | Usage exit 2 | — | — |
| `tooling-fast.mjs` | broken → fixed | `--help` ignored → full suite started | Unknown flags silently dropped | **#672** |
| `twinned-specs.mjs` | works | `--json` ok:true | — | — |
| `verify-change.mjs` | works | See check-changes | — | — |
| `who-is-on-it.mjs` | works | Lists branches + claims; `--claim` accepted | — | — |

## .github/workflows & actions

| Item | Verdict | Evidence / command | Issue found | Fix PR or proposal |
|---|---|---|---|---|
| All 10 workflow YAMLs | works | `yaml.safe_load` OK each | Did not dispatch | — |
| `ci.yml` tool refs | works | Spot-check `tools/ci/*` paths exist | — | — |
| `pages.yml` + `stage.mjs` | works | Stages via `tools/desktop/stage.mjs`; stamps with bump-cache | — | — |
| `browser-group.yml` | works | Validated via `remote-group` unit tests / `--plan` | — | — |
| `desktop.yml` | works | YAML OK; touches `tools/desktop/**` | Pack smoke not run (Electron) | Proposal R10 |
| `docs-guards.yml` / `gpu-census.yml` / others | works | YAML parse only | Dispatch skipped | — |
| `.github/actions/mesa-xvfb` | works | action.yml valid | — | — |
| `.github/actions/playwright-chromium` | works | action.yml valid | — | — |
| `.github/actions/setup-apex` | works | `npm ci` composite | — | — |

## tools/desktop/, tools/moves/, manifest

| Item | Verdict | Evidence / command | Issue found | Fix PR or proposal |
|---|---|---|---|---|
| `tools/desktop/stage.mjs` | works | `--out artifacts/tmp/stage-audit` → ok; `--stamp` stamps build | — | — |
| `tools/desktop/stage-files.mjs` | works | Allow-list importable; used by pages.yml | — | — |
| `tools/moves/` | works | README: no live move plans currently | Empty by design | — |
| `tools/manifest.cjs` | works | `FULL` 248, `DEFERRED` object (glx/wgx/tlx), `TRACK_VM` 31, `HARD_EDGES` 151; `gen-shell --check` clean | — | — |

## Fix PRs (this audit)

| PR | Concern | Head (at open) |
|---|---|---|
| [#670](https://github.com/brycejmurrin/f1-game/pull/670) | `remote-group` usage on bare / `--help` | `a2999ad02` |
| [#672](https://github.com/brycejmurrin/f1-game/pull/672) | `tooling-fast` rejects unknown flags / `--help` | `d906dbd7c` |
| [#674](https://github.com/brycejmurrin/f1-game/pull/674) | `offline-precache-check` `--help` must not launch Chromium | `52e344854` |
| [#677](https://github.com/brycejmurrin/f1-game/pull/677) | `gh auth token` fallback for `ci-watch` / `remote-group` | `e7990ebe4` |

Keep draft until CI is green on the exact head; another agent merges.

## Ranked proposals (larger than a slice)

1. **R8 / R1 — Help paths that start work.** Audit every `tools/ci/*.mjs` for “unknown flag → run anyway” and “`--help` starts a server/browser”. `run-playwright --help` already opens a port; `tooling-fast` was the worst (fixed). Shared `cli-args` adoption across CI runners.
2. **R6 / R9 / R4 / R7 — Silent or misleading CLIs.** `pick-unit-slices --help` → “nothing changed”; `geometry-paths` bare silent; `playwright-occupancy` library-only silent; `spec-staleness` no `--help` before a multi-minute replay. One pattern: usage + exit 2 on bare/unknown.
3. **R3 — `ci-verdict` with empty `NEEDS`.** Local bare run prints PASS. Refuse / print usage when `NEEDS` unset outside Actions.
4. **Token fallback for shell CI helpers (follow-on to #677).** `base-green.sh` / `pages-reuse-verdict.sh` still need env `GH_TOKEN`; same Cloud-agent footgun.
5. **R10 — Desktop pack smoke.** Document a `--dry-run` / unit path so agents can exercise `desktop.yml` without full Electron installers.
6. **PWA skill: route `index.html` / `sw.js` optional seed edits.** Skill already warns; optionally teach `pick-tests` to add `service-worker` when `index.html` changes (precached shell discovery).

## Notes for other agents

- Stay out of `tools/ci/remote-group.mjs`, `tooling-fast.mjs`, `offline-precache-check.cjs`, `ci-watch.mjs`, `github-token.mjs` while #670/#672/#674/#677 are open.
- `tools/moves/` is intentionally empty of live plans.
- Do not dispatch GitHub workflows from this container for the audit; use `--plan` / unit tests.
