# Anchor and citation drift: sysaudit4 mechanical slice (read-only)
Sources: 1821 files (tracked .md/.mdc under .claude/ docs/ .cursor/ .codex/, AGENTS.md, CLAUDE.md, tools/README.md, plus comment blocks of tools/**/*.mjs). Scan: `scratch/sysaudit4/anchors/scan.py`, output `drift.csv` beside it.
Needle = backticked token nearest the citation on its line; window = cited line +/-3. Symbol (d) = found anywhere in target.
Git-tracked only: .claude/worktrees (2,828 untracked md) excluded. Absolute /, ~ and URL paths are not matched by the regex (unchecked). Scanned 162018 text lines. Fixes are suggestions only. Symbol needles are identifier/short-phrase backticks; prose words can slip in.
Verdicts: exists, line-ok, line-drifted, heading-missing, path-missing; added `needle-missing` (named token/symbol absent from the cited file).

## Totals: 6512 citations, 2873 drifted (44.1%)
| verdict | count | share |
|---|---|---|
| exists | 3263 | 50.1% |
| line-ok | 376 | 5.8% |
| line-drifted | 1337 | 20.5% |
| needle-missing | 1071 | 16.4% |
| heading-missing | 84 | 1.3% |
| path-missing | 381 | 5.9% |

## Citation styles that drift most
| style | total | drifted | rate | dominant drift |
|---|---|---|---|---|
| (a) path:LINE | 5422 | 2587 | 47.7% | line-drifted (1242) |
| (b) ~NNN near path | 308 | 170 | 55.2% | line-drifted (95) |
| (c) path §Heading | 577 | 86 | 14.9% | heading-missing (84) |
| (d) `sym` in path | 205 | 30 | 14.6% | needle-missing (26) |

## Worst 20 files (drifted / total)
| file | drifted | total |
|---|---|---|
| docs/archive/research/TOTAL-AUDIT-2026-08.md | 259 | 408 |
| docs/plans/2026-10-09-bug-hunt-plan.md | 156 | 175 |
| docs/archive/research/W4-AUDIT-2026-08.md | 106 | 130 |
| docs/notes/PERF-HUNT-2-2026-10-13.md | 98 | 142 |
| docs/archive/research/CODE-SURVEY-2026-09.md | 85 | 100 |
| docs/notes/PERF-HUNT-3-2026-10-13.md | 82 | 112 |
| docs/archive/research/AUDIT-SYNTHESIS-2026-08.md | 63 | 116 |
| docs/notes/PERF-HUNT-4-2026-10-14.md | 50 | 74 |
| docs/archive/notes/test-review-2026-10-19/reports/net.md | 50 | 95 |
| docs/archive/notes/test-review-2026-10-19/reports/ui-2.part-1ofn.md | 46 | 92 |
| docs/archive/notes/test-review-2026-10-19/reports/physics-2.part-3aof3.md | 45 | 62 |
| docs/notes/FLEET-ROLES-2026-10-19.md | 42 | 106 |
| docs/notes/SPIKE-BACKENDS-CHECKLIST.md | 41 | 100 |
| docs/plans/2026-10-03-perf-memory.md | 38 | 48 |
| docs/research/RENDERER-PERF-AUDIT-2026-09-02.md | 37 | 68 |
| docs/archive/notes/test-review-2026-10-19/reports/render-2.md | 35 | 63 |
| docs/archive/notes/test-review-2026-10-19/reports/tooling-4.md | 35 | 95 |
| docs/notes/HUD-CODE-AUDIT-2026-10-10.md | 34 | 47 |
| docs/research/PIT-LIGHTING-PLAN-2026-09.md | 34 | 58 |
| docs/archive/webgpu/WEBGPU-MIGRATION.md | 33 | 36 |

## Top 30 drifted rows (live zones first, then by severity)
| # | file:line | citation | verdict | suggested fix |
|---|---|---|---|---|
| 1 | .claude/skills/slim-bloat/references/do-not.md:16 | other-file.js:412 | path-missing | no file at this path or basename: retarget or drop |
| 2 | docs/TESTING.md:588 | `expect` in ./fixtures.js | path-missing | path is tests/helpers/fixtures.js |
| 3 | docs/notes/BUG-HUNT-ROUND-2-REGISTER-2026-10-10.md:28 | file.js:123 | path-missing | no file at this path or basename: retarget or drop |
| 4 | docs/notes/CICD-REVIEW-2026-10-16.md:280 | stacked-prs-land-bottom-up.md:3 | path-missing | no file at this path or basename: retarget or drop |
| 5 | docs/notes/CICD-REVIEW-2026-10-16.md:280 | pr-auto-merge.md:16 | path-missing | no file at this path or basename: retarget or drop |
| 6 | docs/notes/CICD-REVIEW-2026-10-16.md:281 | merge-fast-verify-on-ci.md:18 | path-missing | no file at this path or basename: retarget or drop |
| 7 | docs/notes/FLEET-B-TRANSCRIPT-AUDIT-2026-10-26.md:46 | orchb-queue.md:91 | path-missing | no file at this path or basename: retarget or drop |
| 8 | docs/notes/FLEET-ROLES-2026-10-19.md:5 | .claude/agents/merge-desk.md:3 | path-missing | deleted in git 01442fcdb: no file at this path or basename: retarget or drop |
| 9 | docs/notes/FLEET-ROLES-2026-10-19.md:72 | merge-desk.md:86 | path-missing | no file at this path or basename: retarget or drop |
| 10 | docs/notes/FLEET-ROLES-2026-10-19.md:74 | merge-desk.md:84-90 | path-missing | no file at this path or basename: retarget or drop |
| 11 | docs/notes/FLEET-ROLES-2026-10-19.md:122 | .claude/skills/ci-watch/SKILL.md:3 | path-missing | 45 files share this basename; cite the full path |
| 12 | docs/notes/FLEET-ROLES-2026-10-19.md:136 | merge-desk.md §Archiving | path-missing | no file at this path or basename: retarget or drop |
| 13 | docs/notes/FLEET-ROLES-2026-10-19.md:164 | .claude/skills/ci-watch/SKILL.md:3 | path-missing | 45 files share this basename; cite the full path |
| 14 | docs/notes/FLEET-ROLES-2026-10-19.md:165 | .claude/agents/merge-desk.md:3 | path-missing | deleted in git 01442fcdb: no file at this path or basename: retarget or drop |
| 15 | docs/notes/FLEET-ROLES-2026-10-19.md:170 | .claude/memory/bryce-merges-manually.md:3 | path-missing | deleted in git 01442fcdb: no file at this path or basename: retarget or drop |
| 16 | docs/notes/FLEET-ROLES-2026-10-19.md:214 | merge-desk.md:81 | path-missing | no file at this path or basename: retarget or drop |
| 17 | docs/notes/PERF-HUNT-3-2026-10-13.md:72 | NodeMaterialObserver.js:932-936 | path-missing | no file at this path or basename: retarget or drop |
| 18 | docs/notes/PERF-HUNT-3-2026-10-13.md:101 | renderers/common/Bindings.js:356-500 | path-missing | no file at this path or basename: retarget or drop |
| 19 | docs/notes/PERF-HUNT-3-2026-10-13.md:164 | hunt3/three.webgpu.pretty.js:12852 | path-missing | no file at this path or basename: retarget or drop |
| 20 | docs/notes/PERF-HUNT-3-2026-10-13.md:166 | NodeSampledTexture.js:20-37 | path-missing | no file at this path or basename: retarget or drop |
| 21 | docs/notes/PERF-HUNT-3-2026-10-13.md:269 | NodeMaterialObserver.js:934 | path-missing | no file at this path or basename: retarget or drop |
| 22 | docs/notes/PERF-HUNT-4-2026-10-14.md:177 | Instance.js:178-197 | path-missing | no file at this path or basename: retarget or drop |
| 23 | docs/notes/SPIKE-BACKENDS-CHECKLIST.md:421 | .claude/workflows/redesign-judge-panel.js:39 | path-missing | path is docs/archive/research/workflows/redesign-judge-panel.js |
| 24 | docs/notes/system-audit-3/ci-train.md:60 | claims.txt:39 | path-missing | no file at this path or basename: retarget or drop |
| 25 | docs/research/ASSET-API-RESEARCH.md:26 | lit.js:196 | path-missing | no file at this path or basename: retarget or drop |
| 26 | docs/research/ASSET-API-RESEARCH.md:27 | lit.js:247 | path-missing | no file at this path or basename: retarget or drop |
| 27 | docs/research/ASSET-API-RESEARCH.md:29 | lit.js:779 | path-missing | no file at this path or basename: retarget or drop |
| 28 | docs/research/ASSET-API-RESEARCH.md:32 | lit.js:242-280 | path-missing | no file at this path or basename: retarget or drop |
| 29 | docs/research/ASSET-API-RESEARCH.md:35 | lit.js:266-267 | path-missing | no file at this path or basename: retarget or drop |
| 30 | docs/research/ASSET-API-RESEARCH.md:48 | carmesh.js:126-176 | path-missing | no file at this path or basename: retarget or drop |

Full list: `scratch/sysaudit4/anchors/drift.csv` (6512 rows; 2873 drifted).
