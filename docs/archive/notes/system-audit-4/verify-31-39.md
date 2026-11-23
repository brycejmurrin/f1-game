# Verify pass3 items 31–39 + §Needs Bryce — adversarial re-check
Checkout 7da0df7bc (= deploy tip 7dd2e82f3 + pass-3 note), 2026-10-26 ~17:40Z, loadavg 5→17 during the run (dup-keys timing is an upper bound).
Ran: 8 CLIs `--help` (timeout 10, nice 15, stdin </dev/null), bash-guard.sh on 7 JSON payloads, dup-keys, 4 fleet parsers via import (scratch/sysaudit4/v31-39/p37.mjs), who-is-on-it --all, gh/curl via proxy (pulls, pages.yml runs, repo, branch, workflow perms). Raw: scratch/sysaudit4/v31-39/.

## Clean (checked, fine or already OK)
- data-hub anchors `hub.js ~374-386` (maxAge 374, st.node check 386) and `standings.js ~124-130` (fallback 126-128) are exact.
- `handbackCar(inc, i, false, pose)` is at incident-sim.js:382 (anchor ~381-382 exact); `CAREER.md ~839` lands in §Sponsors (835-848).
- tooling-fast bail is OPT-IN (`--bail`, tooling-fast.mjs:385-411); only the four CI guard shards pass it (ci.yml:414/477/606/669). Local floor never bails.
- test:guards (tests/groups.json, 43 files) DOES include test-groups.test.mjs, whose test "docs/TESTING.md's file-count floors never exceed the files on disk" (:153) is the TESTING.md count test.
- Bash-guard correctly refuses `pkill -f chrome` (rc=2).
- Repo `allow_squash_merge: false`; ruleset 22828280 forbids non-fast-forward and deletion on the deploy branch.

## Per-sub-claim verdicts
| item | sub-claim | verdict | evidence | fix judgement |
|---|---|---|---|---|
| 31a | fleet-bus has no --help | CONFIRMED | rc=1 0.2 s "fleet-bus: unknown flag --help (text is positional; flags: --to --as …" — it does print the flag list in the error | cheap: treat --help as usage, exit 0 |
| 31b | fleet-brief no --help | CONFIRMED | rc=1 0.3 s "fleet-brief: unknown argument --help" | same |
| 31c | launch-lane no --help | CONFIRMED | rc=1 0.1 s "launch-lane: unknown flag --help" | same |
| 31d | agent-msg "--help needs a value" | CONFIRMED | rc=1 0.1 s verbatim | same |
| 31e | fleet-flags crashes on empty stdin | CONFIRMED | rc=1 `SyntaxError: Unexpected end of JSON input at main (fleet-flags.mjs:61:21)`; :61 `JSON.parse(readFileSync(file || 0))`, --help is not parsed at all | guard empty input + usage |
| 31f | ratchets.mjs --help runs > 20 s | CONFIRMED, WORSE | rc=124 at 10 s and again at 40 s with zero output (load 5–10); no `--help` branch in tools/check/ratchets.mjs | add a help branch before the scan; highest value of 31 |
| 31g | test-bg usage omits --timeout/--sweep | CONFIRMED | rc=2, usage 3 lines lack `--timeout`, `--sweep`, `--workers`; flags exist (test-bg.mjs:20,24,239) | add to usage string |
| 31h | deploy --help omits flags | CONFIRMED | rc=0; help text greps: --train 0, --status 0, --wait 0, --json 0; flags parsed at deploy.mjs:78,977,1041 | add four lines to header |
| 32a | "21 ~NNN anchors in skills a–l" | REFUTED (as stated) | 23 `~\d{3,}` hits in a–l, but only 5 in ALL skills are line anchors next to a path; the rest are quantities (~120 s, ~400 messages, ~1400 ms) | the count conflates durations with anchors |
| 32b | anchors drift | PARTLY | of the 5 real anchors, 4 exact; `js/game.js ~4523-4534` (race-incidents-control workflow.md:91) is now 4643-4653, drift +120; pass3's `career-hub.spec.js ~505` no longer exists (fixed) | fix the one; a skill-smoke ban on `path ~NNN` is cheap (5 sites) |
| 33 | read-only `node -e` naming ratchets.json refused | CONFIRMED | payload with `scratch/x/.gc-ratchets.json` → rc=2 "can RAISE a size ceiling by hand (shared safety ban 1)"; same with other.json → rc=0; shellparse.py:931 regex ends `|ratchets\.json` | drop the filename alternative, keep write verbs |
| 34a | dup-keys exits 1 on event-journal.test.mjs:41 | CONFIRMED | rc=1, "event-journal.test.mjs:41 (deleted with its module, I3 B1) duplicate key `player` … line 38 is dead" (38 `cars, player,` / 41 `store: null, player,`); 37 s at load 17 | delete `player` from :41 |
| 34b | nothing gates the tree scan | CONFIRMED | `dup-keys` absent from package.json and tooling-fast.mjs; only team-livery and tools-a12-guards import it; groups.json:1333 is a comment | gate it — but 37 s (loaded) is not edit-loop cheap; put it in a CI node suite, not test:guards |
| 35a | flaky-quarantine has no unit-test path | CONFIRMED | flaky-quarantine.test.mjs:22 requires `^tests/specs/.+\.spec\.js$`; flaky-policy.mjs keys on Playwright spec+title | needs a unit-test retry or a separate list |
| 35b | tooling-fast bails on first failure (135/225 unstarted) | PARTLY | true only for CI guard shards (`--bail`, ci.yml:414…669); the "225" is one shard's files, not the floor | keep bail; the fix is the flake, not the flag |
| 35c | output-surface.test.mjs not in test:guards | CONFIRMED | test:guards files (groups.json) contain no output-surface | add if < 2 s (unmeasured here) |
| 35d | TESTING.md count test not in test:guards | REFUTED | it is test-groups.test.mjs:153, which IS in test:guards; its CI reds must come from merges/--no-verify, not a missing gate | look at why the commit hook missed it instead |
| 36a | code-hunter lacks omitClaudeMd | CONFIRMED | frontmatter (code-hunter.md:1-10) has no key; 4 sibling agents have it; HARNESS-SETTINGS-2026-10-26.md:134 names code-hunter | add the key |
| 36b | "~12.4k tokens per spawn" | PARTLY | CLAUDE.md+AGENTS.md+fleet-core.md = 24,984 bytes ≈ 6–7k tokens; 12.4k would need MEMORY.md and more counted, which omitClaudeMd may not drop | quote the byte count, not 12.4k |
| 36c | worker card says guard refuses browserstack | CONFIRMED | worker.md:36-38 lists `mcp__browserstack`; settings.json matcher (line ~262) and mcp-browser-guard.sh:45 BROWSER regex have no browserstack | fix prose or matcher |
| 36d | worker card says browser-use unguarded | CONFIRMED (stale) | worker.md:38-39 "the guard does not match it"; matcher has `plugin_browser-use.*`, guard.sh:48 checks it | fix prose |
| 36e | three deny rules are prefix matches, no hook | CONFIRMED | settings.json:173-175 exactly `Bash(node tools/ci/bump-cache.mjs --apply*)`, `Bash(node tools/gen/assets.mjs bake*)`, `Bash(node tools/track/rotate-markings.cjs --write*)`; grep of .claude/hooks for bump-cache/assets.mjs/rotate-markings: 0 files | add argv-basename check in shellparse guard |
| 36f | bounded `git fetch` retry refused | CONFIRMED | rc=2 "BLOCKED: a shell poll loop (for … git fetch … sleep)" | exempt a literal `for i in 1 2 3`/`seq ≤5` with `break` |
| 36g | `xargs kill` passes | CONFIRMED | `ps … | awk … | xargs kill` rc=0; also `python3 -c os.kill` rc=0, `node -e process.kill` rc=0 | add kill-verb detection after xargs |
| 36h | (tools T8) test-bg --help refused in a subagent | NEEDS-MORE | hand-built payload without subagent markers → rc=0; real in-subagent call was via a shell variable so untested | — |
| 37a | four parsers, three semantics: `worker:` twice | CONFIRMED | ready-gate.fleetBlock → aaa; fleet-owner.parseFleetBlock → aaa (and drops `merger`); snapshot.parseFleetBlock → bbb (last wins); pr-body.fleetEntries → both; setFleet rewrites the first only | one parser in tools/lib |
| 37b | pr-body reads commented-out block | CONFIRMED | fleetEntries → `fleet Z / worker ccc` from inside `<!-- -->`; setFleet edits the commented block; the other three return ddd | strip comments first |
| 37c | 16 private git() helpers | CONFIRMED, UNDERCOUNT | 19 files in tools/ci define `function git(`/`const git =` (adds fleet-board-snapshot:209, pick-tests, prune-branches:473, publish-shots:163; live-run-check has none by this regex) | shared lib |
| 37d | verify-change keeps a copy of liveCiRuns | CONFIRMED | verify-change.mjs:242 own `async function liveCiRuns()`; live-run-check.mjs:6 says "Lifted from verify-change.mjs", :32 exports it | import it |
| 37e | 8 tools own REST clients | CONFIRMED (sample) | curl/fetch/gh-api hits: ci-rerun 2, fleet-archive 3, who-is-on-it 2, tooling-timings/flake-tally/process-dashboard/live-run-check/publish-evidence 1 each | low priority |
| 37f | ~17 dead CLIs | CONFIRMED (10 sampled) | lane-preamble, fleet-board-snapshot, session-ledger, release-provenance, claude-usage, measure-pr-ci-after-close: 0 callers; handback/post-merge/spec-staleness/test-honesty hits are prose words or manifest only | archive in one PR |
| 37g | tools/archive listed live in catalog | CONFIRMED | `tools/archive/` appears 7× in docs/agent-output/catalog.json | exclude in generator |
| 38a | NOTES-INDEX lists 64 of 204 | CONFIRMED (moved) | now 65 distinct `](notes/` targets of 205 files; 140 unindexed; of 54 notes with 10-20..10-26 in the filename, 46 unindexed | generate the table |
| 38b | 25 claims name merged PRs | PARTLY | who-is-on-it --all: 124 claim lines, 98 carry a `#NNNN`/`prNNNN`; 15 name a PR in the 468 merged PRs (#2973–#3811) — e.g. #3784 ×2, #3723, #3641, #3721, all STALE; many `#NNNN` are issues, not PRs | release on merge (merge-done) |
| 38c | deploy.md:80 "median 23, p90 73" stale | CONFIRMED | deploy.md:80 verbatim; AGENTS.md:171 says ~20/~27; measured now: last 30 successful pages.yml runs p50 19.6, p90 28.5 min | point at AGENTS.md, no number |
| 38d | TESTING.md:1139-1144 three figures | CONFIRMED | 20.5/23/73 (10-14), 11.9/20.4, 19.6/26.6 (both 10-26) in one paragraph | keep latest, date the rest |
| 38e | four group costs / in-file cost comments | NOT RE-CHECKED | — | — |
| 39a | 535 fragments unfolded | CONFIRMED | `ls docs/changelog.d | wc -l` = 535 | — |
| 39b | changelog-fold.yml hits the PR refusal on 11-02 | PARTLY | cron `37 6 * * 1` (:27), workflow created 2026-10-26T09:28Z, 0 runs so first fire is Mon 11-02 06:37Z; `permissions: pull-requests: write` (:32). The `gh pr create` (:83) ends `|| echo ::warning::` so a refusal is a yellow warning and a pushed bot branch, not a red; whether it is refused could not be read (perms endpoint 403) | add a failure signal (bus/issue) on the warning |
| NB1 | Actions may not create PRs | NEEDS-MORE | GET actions/permissions/workflow → HTTP 403 "Access to this GitHub Actions path is not permitted through this proxy" | Bryce must look in Settings → Actions |
| NB2 | admins not bound | CONFIRMED | GET branches/…/protection → 403 "Resource not accessible by integration"; GET branches/… shows `required_status_checks.enforcement_level: "non_admins"`, check `CI` | Bryce |
| NB3 | rebase merging enabled | CONFIRMED | GET repos/… `allow_rebase_merge: true`, `allow_merge_commit: true`, `allow_squash_merge: false` (token has admin perm) | Bryce (or this token, if he grants it) |
| NB4 | FLEET_A_OAUTH_TOKEN present, referenced by no file | CONFIRMED | env names: APEX_AGENT_WEBHOOK_AUTH/URL, APEX_A_RELAY_TOKEN/URL, CURSOR_API_KEY, FLEET_A_OAUTH_TOKEN; `git grep -l FLEET_A_OAUTH` → only the two pass-3 audit notes | Bryce removes it |
| NB5 | llvmpipe EGL/GLES libs missing | CONFIRMED | dpkg: no libegl1, libgles2, libegl-mesa0, mesa-vulkan-drivers; present: libgl1-mesa-dri, libglx-mesa0, mesa-libgallium 25.2.8; cloud-agent-install.sh:127 installs mesa-vulkan-drivers only on Cursor | add to setup script |
| NB6-8 | ratchet slack band, DAD brief, hooks grant | NOT VERIFIABLE | decisions, no artifact to measure | — |

## Not done
- 38e group-cost and in-file cost comments; 35c timing of output-surface (would need a run under 2 s on a quiet box).
- Per-role environments (NB4 second half) — needs list_environments; not run.
- 36h in a real subagent context.
