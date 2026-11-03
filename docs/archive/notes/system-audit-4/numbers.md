# Numeric claims audit (sysaudit4 slice) — 2026-10-26

Inputs: AGENTS.md, CLAUDE.md, .claude/rules, .claude/skills/**/*.md (37 skills), .claude/agents, docs/{TESTING,VERIFICATION,ARCHITECTURE,AGENT-SURFACE}.md, tests/groups.json, package.json, tools/ci/*.mjs headers (90 files). Extractor: `scratch/sysaudit4/numbers/extract.py`; rows: `numbers/claims.csv` (1,225 rows, 181 files); raw groups: `numbers/summary.txt`.
Ran: regex extraction (time/size/money/%/×/count+noun/median-p90), grouping, conflict check, strict-scope count checks with `ls | wc -l`, one WebFetch of the Anthropic prompt-caching doc. No browser, no tests, no tracked-file edits.
Caveat: grouping is heuristic. 448 of 1,225 rows fall into "other time"; the group-level conflict check only covers named groups.

## Clean (checked, fine)
- Circuit data files: 52 `js/circuits/*.js`; the four "52 circuits" claims (TESTING:557, ARCHITECTURE:24) are right.
- Foundation specs: 16 `tests/specs/*-foundation.spec.js`; TESTING:443 "16 per-circuit foundation specs" right.
- `.mcp.json` has 6 servers; no doc claims a server total (the "3 tools" hits are CLI subcommand false positives).
- Unit files: 1,038 `tests/unit/*.test.mjs`; no doc gives a file total, so nothing to refute.
- Test groups: 56 in `tests/groups.json` (24 `kind:"browser"`); no current doc states a total.
- Cadence "50–55 min" (AGENTS.md:81, fleet-core.md:19, orchestrator.md:44) agrees across all live rule files.
- Prompt-cache "1 h": see row N4 (refuted as a default).

## Conflicting values (same quantity, two files, different numbers)
- **Gated Pages publish, p90** — AGENTS.md:171 "p90 ~27" (23 trains, 2026-10-26) vs `.claude/skills/check-changes/references/deploy.md:80` "median 23 min, p90 73" (no date; the 73 is 2026-10-14 per TESTING.md:1138-1139).
- **Gated publish median** — AGENTS.md:171 "~20 min" vs deploy.md:80 "23 min" (same root cause). TESTING.md:1139-1143 carries all three sets with dates; deploy.md copies the stale one.
- **Local browser group wall** — AGENTS.md:31 "30–45 minutes of serialized SwiftShader (2026-09-16)" vs docs/TESTING.md:362 "10-40 minutes" (undated) vs TESTING.md:414 "~40 minutes for the whole group on one worker" (undated).
- **Remote browser group** — AGENTS.md:44 "10–15 min wall" (llvmpipe, remote) is a different quantity; keep scoped in any copy.
- **Check-in timer** — AGENTS.md:80 "(cadence pending Bryce; was 15 min / 1 h)" and role-pr-owner.md:67 "was 15 min" vs rule 13 "50–55 min"; the "pending Bryce" hold is still open in four files.
- **macOS Metal leg** — TESTING.md:1143 "median 9.2 min" vs AGENTS.md:171 "median 9 min" (rounding only).
- **Guard suite** — TESTING.md:466 "43 cross-file guards in ~12 s" (undated, count not verified in this slice).

## Wrong or stale counts (checkable)
| claim | truth (`ls`/json) | verdict |
|---|---|---|
| tools/ci/spec-staleness.mjs:32 "119 specs" | 170 `*.spec.js` | WRONG (stale header, undated) |
| TESTING.md:678 "98 spec files" (294 goto calls) | 170 | WRONG unless dated snapshot; undated |
| TESTING.md:1245 "~61 specs select-specs never picks" | 170 total | subset claim, undated; not verifiable here |
| TESTING.md:407 "16 spec files and ~149 tests" | 170 | WRONG for now; it is historical ("It was…") |
| tools/ci/nightly-group.mjs:6 "4 of 118 specs" | 170 | WRONG (stale header, undated) |
| ARCHITECTURE.md:956 "~8 spec files patch GLX" | n/a | unchecked subset |
| .claude/skills/slim-bloat/SKILL.md:29 "180 the thin-index skills" | 37 skills | WRONG (historical?) |
| TESTING.md:359 "30 browser groups into 12" | 24 browser / 56 total | historical; the partition is now 24 |

Refuted false positives: "Apex 26 developer skills" (skills/README.md:1) and "Apex 26 custom subagents" (agents/README.md:1) are product names, not counts. Skill count 37 and agent count 11 are right where stated as totals (no doc states them).

## Undated and unsourced figures
- Undated time/size/count rows by file: docs/TESTING.md 204, tests/groups.json 200, garage-parts-livery/references/placement.md 40, docs/ARCHITECTURE.md 36, agent-fleet/references/orchestrator.md 26, docs/AGENT-SURFACE.md 20, package.json 19 (of 1,131 undated rows overall).
-- No source link on 1,001 rows; of the no-source time/money rows, 178 are in groups.json (JSON notes carry no link) and 168 in docs/TESTING.md.
- Undated measurements that most need a date: TESTING.md:219-223 (boot 18.8–22.6 s, race flow 27.6 s), 466 (guards ~12 s), 1035 (`locator.click()` 82 s), AGENTS.md:31 (dated 2026-09-16, good).

## Web check (rows N4)
- N4 (refutes/adds, conf high): Anthropic's prompt-caching doc (platform.claude.com/docs/en/docs/build-with-claude/prompt-caching, fetched today) says the default cache lifetime is 5 minutes, refreshed on each use; a 1-hour TTL is opt-in via `cache_control.ttl: "1h"` at 2× write price. AGENTS.md:80, worker.md:112, orchestrator.md:45 and launch-policy.md:87 state "1 h prompt cache" as the wake budget with no mention of the opt-in. The repo does not show the harness sets `ttl: "1h"`, so the claim is unverified for this session (conf medium).

## Not done
- Full per-row verdict for ~180 "other" rows; the CSV keeps them with group `other …` and no verdict.
- No test-case counts (`N tests`) checked; no `test()` call grep.
- "43 guards" and "~12 s" not measured; no run timing (no browser or test runs allowed).
- No check of skill/agent description budgets or `docs/notes/` dated sources.
