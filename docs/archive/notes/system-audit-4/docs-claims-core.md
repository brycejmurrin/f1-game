# CLAIMS-VS-CODE, core docs (sysaudit4, tree 7da0df7bc, 2026-10-26)
Slice: ARCHITECTURE, TESTING, PHYSICS, DEBUG-HOOKS, VERIFICATION, AGENT-SURFACE, EVIDENCE-STORAGE, AGENT-HOOKS, TESTING-COVERAGE, docs/README, README.
Ran (read-only, scripts in scratch/sysaudit4/docs-claims/): backtick-path/dir existence (paths2.mjs), relative links+anchors (links.mjs), `node tools/..`/`npm run` + flag-in-source (cmds.mjs), identifier-in-source (syms.mjs), `NAME = n` vs source (consts.mjs), `__apex.x` vs hook set, heading signatures vs js/agent (sigs.mjs), `--check` of 3 generators, then by-hand against manifest/ci.yml/select-specs/groups.json/MCP source.

## Accuracy per document (checked / wrong; "auto" = scripted, "hand" = read and compared)
| doc | auto checked / wrong | hand checked / wrong | note |
|---|---|---|---|
| ARCHITECTURE.md | 1756 / 0 real (5 paths flagged: all "there is no js/game/" or historical) | 16 / 4 | rows A1-A4 |
| TESTING.md | 489 / 0 real (8 paths = retired files, runtime outputs, 2 gitignored scratch) | 30 / 9 | rows T1-T8 |
| PHYSICS.md | 571 / 0 real | 8 / 2 | rows P1-P2 |
| DEBUG-HOOKS.md | 1930 / 1 (`__apex.log`) | 9 / 4 | rows D1-D5; hooks table generated, `--check` clean (212 hooks) |
| AGENT-SURFACE.md | 230 / 0 real | 24 / 3 | rows S1-S3; 40 `apex_*` rows == the 40 live tools |
| VERIFICATION.md | 20 / 0 | 6 / 0 | clean |
| EVIDENCE-STORAGE.md | 11 / 0 | 5 / 0 | sha bbc4c0a is parentless, 8 files, 34,949 B: exact |
| AGENT-HOOKS.md, TESTING-COVERAGE.md | generators `--check` up to date; 1211 paths / 0 | - | generated, fine |
| docs/README.md | 66 / 0 (54 links, all anchors resolve) | 2 / 0 | clean |
| README.md | 45 / 0 | 14 / 4 | rows R1-R2 |
Hand-check totals: 114 claims checked, 26 wrong (rows below are per finding; some rows hold two claims).

## Clean (checked, fine)
- 52 circuits (24 season + 28 classic), 11 teams/tiers/TIER_V/POINTS (ARCH sketch), 12 part categories, BUDGET 780, 8 gears, 6 MCP servers, `enabledMcpjsonServers`, playwright pin 0.0.79, browserstack pin 2.2.4.
- Every `tests/groups.json` group has a TESTING §2 row (56/56 + `test`); no row names a retired group; cron lines (`17 4 * * *`, `47 5 * * *`) and `MAX_OVER_BUDGET_SHARDS = 8`, nightly 60 min / 12 overflow in ci.yml:2190 all match.
- AGENT-SURFACE bounds (`u` <=64, `frames` 1..120, `wait` 50 s, shot_survey presets, ports 3712/3713, agents/ fixtures list, jobs-cap) match apex-tools-mcp.mjs.
- PHYSICS: 426 backticked symbols all exist; 15/15 real `NAME = n` match; DEBUG-HOOKS heading signatures 184/184 agree with source arity; no doc names a nonexistent `apex_*` tool except the labelled "never built" four (DEBUG-HOOKS:4707).
- All `npm run test:*` names in live prose exist, except negated/historical mentions (test:pick, test:visual, test:parts...).

## Misses (ranked by how likely they misdirect an agent)
| id | file:line | claim | truth | severity |
|---|---|---|---|---|
| A1 | ARCHITECTURE.md:1107-1110 | circuit defs "Loaded before tracks.js, in the order their `<script>` tags appear in index.html ... Tag order == Tracks.LIST order" | index.html has 0 `circuits/` tags (grep -c = 0); only `circuit-meta.js` (index.html:3709) loads, defs hydrate via LAZY_CIRCUIT (tools/manifest.cjs:112-114). Same false claim at :1138-1141 ("LIST order == the `<script>` load order in index.html") | misleads: an agent adds a tag or reorders for picker order |
| A2 | ARCHITECTURE.md:1148 | `trackDef = { ... points:[[x,y,z,halfWidth?,bank?]] }` | real defs author `path:{len,pts:[[x,z]]}` (monza.js:78); `points` is derived in def.js. Contradicts the doc's own :1099 ("`path`") | misleads a new-circuit author |
| A3 | ARCHITECTURE.md:1107 | scenery closures "~27 KB each" | 52 files, mean 41.1 KB | stale number |
| A4 | ARCHITECTURE.md:757 | race-control.test.mjs "sixteen tests" | 55 `test(` today | stale number |
| T1 | TESTING.md:117,122 | overflow "up to six more TARGET_SHARD_SEC jobs"; `MAX_SPILL_SHARDS` = "two" | select-specs.mjs:272 `MAX_OVERFLOW_SHARDS = 11`, :287 `MAX_SPILL_SHARDS = 4` (comments there explain why) | misleads when sizing a selection |
| T2 | TESTING.md:129 | "11-night rota" | `nightly-group.mjs --list` prints 16 groups (ROTATION, :40) | stale number |
| T3 | TESTING.md:1229 | check names `Does this diff touch track survey inputs?` (`sweeps-parts`), `Characterization driving model` | ci.yml has neither; job is `Driving model (characterization traces)` (ci.yml:1639); no "survey inputs" job | misleads a `gh`/ci-watch name match |
| T4 | TESTING.md:439-441 (+README.md:216-218) | physics-core ~37 (README ~45), collisions ~32, aero ~37 tests | static `test(` count: 54, 48, 57; the two docs disagree with each other | stale numbers |
| T5 | TESTING.md:677,1092 | "~155 script tags"; 294 `goto("/")` in 98 specs | 310 FULL entries (manifest); 332 in 113 files; `beforeAll` now in 1 spec. Dated measurements, but written as present tense | stale (dated) |
| T6 | TESTING.md:359 | "30 browser groups into 12" | 24 browser groups now; "115-spec union" vs 170 specs | historical, cosmetic |
| T7 | TESTING.md:902 | config "sets reuseExistingServer for local runs" | conditional (playwright.config.js:309: APEX_MANAGED_SERVER / APEX_REUSE_SERVER / no CI and no APEX_PORT); test-bg sets APEX_PORT so it never reuses | nuance, misleads little |
| T8 | TESTING.md:1012 and PHYSICS.md:903 | cite `scratch/tuner/cost-probe.mjs`, `scratch/collision-bench.mjs` | gitignored, absent on a fresh clone | cosmetic |
| P1 | PHYSICS.md:12-16 | tuning vars (`WHEELBASE`, `PACE`, `ROAD_FOLLOW`...) are "`let`s in game.js"; "anything a slider can change stays a `let` in game.js" | defaults live in js/physics/drive-tune.js (`DriveTune.create`), game.js exposes `driveTune.X` getters (game.js:3143) | misleads a grep for the definition |
| P2 | PHYSICS.md:24 | `vTop()`/`vStd()` "next to `PACE` in game.js" | js/race/pace-math.js:42-47 (also `aStd`) | wrong path |
| D1 | DEBUG-HOOKS.md:4706 | MCP toolbelt "29 tools" | 40 | stale number |
| D2 | DEBUG-HOOKS.md:5186 | "when there are 250 test files" | 1,218 test files (170 specs + 1,039 unit...) | stale number |
| D3 | DEBUG-HOOKS.md:4440 | agent-view.spec.js "117 tests" in `hooks` | 177 `test(` | stale (typo-like) |
| D4 | DEBUG-HOOKS.md:2957 | `__apex.log()` | no such hook; it is `logLevel()` (:1393) / `logs()` | misleads a console call |
| D5 | DEBUG-HOOKS.md ~:1004,5255 | `diag()` downloads `apex-diag.json` (repeated twice, 4250 lines apart) | same sentence duplicated | duplicate |
| S1 | AGENT-SURFACE.md:317 vs :4,:311 | "40 -> 42 by 2026-10-22 ... the table below is the count's source" | the table has 40 rows and the live server lists 40; line 4 says "Forty". Line 317's 42 is wrong or two tools were dropped unrecorded | internal contradiction |
| S2 | AGENT-SURFACE.md:159 | chrome-devtools-mcp@1.7.0 "by hand" | wrapper pins 1.11.0 (chrome-devtools-mcp.sh:19) | stale version |
| S3 | AGENT-SURFACE.md:34 | CLAUDE.md "Must stay a one-line import" | 7 lines (a stub; guarded by docs-integrity:622 as "stub") | cosmetic |
| R1 | README.md:77 | designer theme "(27 ...)" | `TrackThemes.ORDER` has 30; docs/TRACK-DESIGNER.md:86,195 already say 30 | stale number, player-facing |
| R2 | README.md:216-218 | see T4 | | |

## Duplicated rules (one-home violations)
- TESTING.md:55-66 "ONE GROUP AT A TIME" restates AGENTS.md rules 4-5 (loadavg 3, one Playwright process), then TESTING:895-912 "Never run two Playwright processes" again; tests-specs.md has a third copy.
- AGENT-SURFACE.md says "Chrome MCP vs Playwright, never together" four times (:167, :191-192, :228) plus AGENTS.md and the MCP server instructions.
- VERIFICATION.md "Before a code push" and AGENTS.md rule 3 both carry the 3-command ladder; VERIFICATION says it owns "command meanings", AGENTS carries them too.
- README.md "Testing & development" re-lists test commands and counts that TESTING.md owns (and are stale, T4).
- DEBUG-HOOKS.md carries a ~600-line design-history (P1-P9, "partly unbuilt") inside the reference; its numbers (220 hooks, 29 tools, 250 files) are the ones that drifted.

## Unguarded and already drifted (git log shows the number changed, or two docs disagree)
- Counts in prose with no test: themes (27 vs 30), apex tool count (29 / "Forty" / 42 / 40), nightly rota (11 vs 16), select-specs shard caps, per-group test counts, script-tag count, spec counts. docs-integrity.test.mjs:366-565 guards only suite counts, circuit count, part categories, classics, season list.
- CI check-name lists (TESTING:1225-1240) are not compared to ci.yml `name:` lines: 2 of 14 are wrong. A 20-line test (grep backticked names in "Check names" vs `^\s+name:` in ci.yml) would close T3.
- Dated measurements phrased in the present tense (T5, T6) are the common pattern; `git log -S` is of little use here because history is squash/merge heavy (the sentences show as one merge commit each).

## Not done
- ARCHITECTURE.md prose of ~2,200 lines was checked for paths/symbols/links (all) but only ~16 numeric/structural claims by hand; the TLX/WGX parity tables (:1700-2200) were not compared to renderer code.
- TESTING.md measured timings (seconds, GB RSS, load) are dated field notes and cannot be re-measured without browser runs.
- PHYSICS.md numeric tables (aero part table :197, grip multipliers :379) not recomputed (needs a browser/VM run).
- Per-test counts in T4 are static `test(` greps (lower bound for parametrised specs), so the true gap is larger, not smaller.
