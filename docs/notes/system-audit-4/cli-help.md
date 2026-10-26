# CLI --help and flag audit (sysaudit4, mechanical slice)

Slice: every CLI under `tools/` (tools/archive skipped), 383 files with a shebang or an argv read.
Inputs: the repo at `cursor/sysaudit3-7dd2e`, pass 3 `docs/notes/SYSTEM-AUDIT-3-2026-10-26.md` and `system-audit-3/tools.md`.
Ran: `scratch/sysaudit4/cli/scan.mjs` (static flag extraction, then `--help` and `--definitely-not-a-flag` under `timeout 10 nice -n 15`, process-group kill, run only when loadavg < 8). Then `analyze.mjs`.
Raw: `scratch/sysaudit4/cli/scan.csv` (one row per CLI), `flags.csv` (one row per flag), `summary.txt`, `scan.json`.

## Clean (checked, fine)
- `tools/lib/cli-args.mjs` `makeFlags` rejects unknown `--flags` with exit 1 and a near-miss hint. Its 9+ users refuse typos (e.g. `pick-tests`, `who-is-on-it`: exit 1 with message).
- Tree stayed clean: `git status --untracked-files=no` empty after the run. No run process of mine survived (only harness MCP servers at 0 %).
- `ci/test-bg.mjs --help`, `ci/fleet-bus.mjs --help`, `ci/agent-msg.mjs --help`: print usage and exit without sending (fleet-bus returns usage on unknown flag before any send; agent-msg throws on `--help` with no value).
- `ci/deploy.mjs --help` is handled before any side effect (line 963); its run took 0.17 s and wrote nothing.
- `ci/ready-gate.mjs`, `ci/merge-gate.mjs`, `ci/tooling-fast.mjs`, `ci/session-status.mjs`: `--help` prints a usage line in 0-7 s.

## Counts
| measure | n |
|---|---|
| CLIs scanned | 383 |
| parser idiom: argv-manual 264, generic-reader 36 (flags not enumerable), argparse 11, bash 7, parseArgs 4, makeFlags tables 13 (within argv-manual), none 48 | |
| `--help` ok (usage text, exit 0) | 169 |
| `--help` ok silently (exit 0, no usage word) | 91 |
| `--help` prints usage but exits 1-2 | 36 |
| `--help` does work (timeout, >5 s or writes files) or exits non-zero with no usage | 53 |
| `--help` not run (safety skip: browser-capable without help branch, or name list) | 34 |
| unknown flag refused (exit non-zero, message) | 78 (+62 non-zero with no message) |
| unknown flag accepted, exit 0, no work | 49 (+2 with warning) |
| unknown flag ignored, then did work (28 timed out at 10 s) | 34 |
| unknown flag not run (name list, browser-capable, or `--help` already worked) | 158 |
| flags parsed (distinct per CLI) | 1373, of which 267 are undocumented in header, usage text or `--help` |
| flags documented but not parsed by that file (partly heuristic, see caveats) | 1051 |

## CLIs without a working `--help` (did work, error, or no usage)
- Did work at 10 s or >5 s: `tools/check/ratchets.mjs` (10.05 s; pass3 #31 said 20 s, the wall cap here is 10 s), `check/tree-counts.mjs`, `check/wait-polling-lint.mjs`, `check/html-sink-lint.mjs`, `ci/fleet-tick.mjs`, `ci/verify-live.mjs`, `ci/fleet-flags.mjs`, `shot/shot.mjs`, `net/rtc-e2e-3p.mjs`, and 20 more (full list: `summary.txt`).
- Usage printed but exit 1 or 2 (not an error for scripts, but a non-zero help): `ci/test-bg.mjs` (exit 2), `ci/node-plan.mjs` (2), `lighting/ab-lighting.mjs` (2), `ci/agent-msg.mjs`, `ci/fleet-bus.mjs`, `ci/fleet-brief.mjs`, `ci/launch-lane.mjs`, `lib/webgpu-chrome-args.cjs`, `perf/vm-leak-census.mjs`, `car/flank-occlusion.mjs`.

## CLIs that accept unknown flags (exit 0 or ignored, then ran)
- Silently ignore the flag, exit 0, under 1 s: `ci/bump-cache`, `ci/junit-failed`, `ci/pages-live-sha.sh`, `ci/session-status` (rulebook), `gen/gen-ladder-figures` (rulebook), `check/class-usage`, `car/spine-station`, `track/coplanar-audit.cjs`, `mcp/lsp-eval` (3.6 s).
- Ignore the flag and run the full job (the 10 s kill fired): `check/ai-band|ai-human|ai-line|ai-pace|ai-tactics|ai-field|ai-stuck|ai-strategy-census|twin-fidelity` (each wrote ~440 files to `artifacts/`), `ui/fit-audit`, `ui/layout-audit`, `ui/menu-fit` (rulebook), `car/career-economy`, `car/livery-contrast`, `gfx/wgx-capture` (6 artifacts), `gfx/wgx-lavapipe-probe`, `net/rtc-e2e` (2), and about 20 more (full list: `scan.csv`, column `unknown`).
- Side effect: the unknown-flag runs left 4,388 new files under `artifacts/` (ignored, regenerable). Nothing tracked changed.
- Deploy-family tools were NOT exercised with an unknown flag (name list). Static evidence: `ci/deploy.mjs` parses with `argv.includes` (`flag()`), not `makeFlags`, so it cannot refuse a typo. This confirms pass3 T7.

## Worst undocumented-flag offenders (parsed, not in header, usage or --help)
| CLI | undocumented | sample |
|---|---|---|
| `tools/mcp/apex-tools-mcp.mjs` | 42 | `--apply --at --bg --cam --check --claim --device --env` |
| `tools/shot/garage-angles.mjs` | 26 | `--against --base --baseline --budget --cam --cell --centre` |
| `tools/mcp/cdmcp-cli.py` | 13 | `--camera --combos --force --frac --hud-crop-frac --no-file` |
| `tools/ui/menu-capture.mjs` | 6 | `--force --jobs --out --screens --viewport --viewports` |
| `tools/ci/branch-audit.mjs` | 5 | `--base --json --min-age-days --quiet-hours --runs` |
| `tools/ci/spec-timings.mjs` | 5 | `--bucket --env --factor --into --keep` |

## Rulebook-named CLIs (path or basename in AGENTS.md, CLAUDE.md, rules, skills, agents)
- 159 CLIs named. 35 do not give a working `--help` (incl. `ci/test-bg` exit 2, `ci/fleet-bus`, `ci/agent-msg`, `ci/fleet-brief`, `ci/launch-lane`, `check/ratchets`, `ci/fleet-flags`, `ci/fleet-tick`, `ci/verify-live`, `shot/shot`).
- 23 accept an unknown flag (exit 0 or ignored then ran): `ci/session-status`, `ci/bump-cache`, `ci/pages-live-sha.sh`, `ci/junit-failed`, `gen/gen-ladder-figures`, `ui/layout-audit`, `ui/fit-audit`, `ui/menu-fit`, `net/rtc-e2e`. `ci/ci-watch` exits 5 on unknown flag (refused). Rulebook entries that refuse: `pick-tests`, `who-is-on-it`.
- Not exercised with an unknown flag (name list or browser-capable): `deploy`, `ready-gate`, `merge-gate`, `sync-pr`, `fleet-archive`, `tooling-fast`, `ratchets`. Their `--help` also differs: `ratchets` did work.

## Caveats and not done
- Static flag extraction is regex-based. 36 files parse through a generic `--key` reader, so their flags are not enumerable; they are not counted as undocumented. 48 files show no flag parse at all.
- "Documented but not parsed" uses the header and any usage window. Those windows pick up flags from neighbouring comments, so 1,051 is an upper bound, not a count of defects.
- Browser-capable detection is a broad regex. 108 unknown-flag runs were skipped for that reason, so the accept counts are a floor for those tools.
- No web research was done: this slice is mechanical. No citations are needed for the counts; the parser idioms follow the repo's own `tools/lib/cli-args.mjs`.
- Pass 3 cross-check: #31 says `fleet-bus`, `agent-msg` have no working `--help`. Here both print usage and exit 1 without sending, so that is REFUTED as "no usage". `ratchets` (#31, 20 s) measured 10.05 s (capped by timeout). T7 (deploy accepts unknown flags) CONFIRMED statically; T8 (test-bg usage omits flags) CONFIRMED by the 11-flag parse vs `--help`.
- Not done: no dynamic run of the 34 safety-skipped CLIs; no unknown-flag run for browser-capable tools; the 3,000 artifacts files were not removed.
