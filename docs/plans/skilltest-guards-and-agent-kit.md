# Skilltest — guards-and-agent-kit (2026-10-01)

Hands-on audit of slim-bloat, `tools/check/` (excl. ai-*/defend-duel/player-dyn/physics-tune-sweep/check-physics/audio-test), `tools/lib/`, `tools/env/`, and the agent kit (hooks, agents, settings, `.cursor/rules`, `.agents/skills`, `skill-routing-eval.py`).

Ship tip at start of work: `cd4ec4c6f` (later advanced; fix PRs branched from then-current tip).

## Verdict counts

| Verdict | Count |
|---|---|
| works | 41 |
| works with caveats | 12 |
| broken (fixed in this pass) | 4 |
| not testable | 2 |

## Fix PRs

| PR | Concern | Status |
|---|---|---|
| [#675](https://github.com/brycejmurrin/f1-game/pull/675) | `occlusion-estimate.mjs` ROOT one level too shallow (`MODULE_NOT_FOUND`) | ready-for-review (full-tier CI after draft→ready) |
| [#676](https://github.com/brycejmurrin/f1-game/pull/676) | `twin-fidelity.mjs --help` ran the full mutant suite (~5 min) | draft until CI green |
| [#680](https://github.com/brycejmurrin/f1-game/pull/680) | env scripts + `live-run.py` ignored `--help` / bare argv | draft until CI green |
| [#685](https://github.com/brycejmurrin/f1-game/pull/685) | `quick-validate` required deferred `GLXShaders` under TLX default | draft until CI green |
| [#689](https://github.com/brycejmurrin/f1-game/pull/689) | this docs report | draft until docs guards green |

## Table

| Item | Verdict | Evidence / command | Issue found | Fix PR or proposal |
|---|---|---|---|---|
| **slim-bloat** (skill) | works | Followed `SKILL.md` entry: `bloat-scan --json`, `ratchets --json`, `extract-module js/game.js 186 207` → free refs printed; refs `do-not.md` / `carves.md` present | None blocking. Mid-range extract exits 1 with bare `SyntaxError` (skill documents this) | — |
| `bloat-scan.mjs` | works | `node tools/check/bloat-scan.mjs [--json]` exit 0; table + JSON | All ratcheted files at slack 0 (saturated — expected) | — |
| `ratchets.mjs` | works | `--check` / `--json` exit 0 | — | — |
| `extract-module.mjs` | works with caveats | Analyse pass OK; bad range → `SyntaxError: 'return' outside of function` exit 1 | Error reads like a broken file (skill already warns) | **P2:** wrap parse and print `extract-module: range does not parse as a program (check start/end bracket whole statements)` |
| `check-gctx.mjs` | works | `--no-tsc --json` → `ok: true`, 280 members | — | — |
| `dup-keys.mjs` | works | exit 0, "no duplicate object keys" | — | — |
| `merge-hygiene.mjs` | works | `--check` exit 0 | — | — |
| `tree-counts.mjs` | works | JSON counts exit 0 | — | — |
| `vstd-lint.mjs` | works | exit 0 (report, not gate — as documented) | — | — |
| `wait-polling-lint.mjs` | works with caveats | exit 0; reports **49** sites without `{ polling }` | Report-only ratchet; AGENTS.md wording reads like a hard gate. Agents may think red when it is not | **P2:** print `report-only (ratchet); gate is tree-counts / wait-polling unit` on the summary line |
| `shell-ids.mjs` | works | `--json` → `ok: true`, missing 0 | — | — |
| `html-sink-lint.mjs` | works | lists audited sinks, exit 0 | — | — |
| `reject-lint.mjs` | works | "0" escaping rejections | — | — |
| `evaluate-scope-lint.mjs` | works | "no page.evaluate callback closes over…" | — | — |
| `class-usage.mjs` | works | defined/applied + known list | — | — |
| `cross-file-paths.mjs` | works | exit 0 | — | — |
| `scan-globals.mjs` | works with caveats | default + `--check` + `--json` OK | `--help` ignored — runs full scan + writes `artifacts/dep-graph.json` | **P2:** early `--help` (same shape as twin-fidelity) |
| `offline-precache-check.cjs` | works | exit 0 in ~45 s; "OFFLINE OK" | Needs Playwright Chromium (present here) | — |
| `twin-fidelity.mjs` | broken → fixed | `--help` ran every mutant (~292 s); `--list`/`--dry` OK | `--help` fall-through | **#676** |
| `vm-portable.mjs` | works | exit 0, portable count | — | — |
| `trim-comments.mjs` | works | `--help` / `--dry-run js/core/log.js` | — | — |
| `occlusion-estimate.mjs` | broken → fixed | Was `Cannot find module '…/tools/tools/lib/game-vm.cjs'`; after fix `OCC_W=64 monza 1` OK | ROOT `..` vs `../..` | **#675** |
| `episode-diff.mjs` | works | `--json --track monza --seed 1` → digestsMatch | — | — |
| `font-digits.py` | works with caveats | `--check` OK after `pip install fonttools brotli` | No `--help`; dies on missing fontTools before usage; not in CI (by design) | **P3:** `--help` before import; clearer "optional author tool" banner |
| `quick-validate.mjs` | broken → fixed | Failed clean tree: `missing globals: GLXShaders`; after fix `QUICK-VALIDATE OK` | Required DEFERRED GLX island under TLX default | **#685** |
| `skill-routing-eval.py` | not testable | `--help` works; needs `claude` CLI + model API | Query corpus structurally OK (27 skills × 8 queries, 5/3 split); no `claude` in this container | **P2:** add `--dry-structure` mode that validates query JSON without calling Claude |
| **tools/lib/** (16 modules) | works | Import/require each; `chromium-path.mjs` prints revision; unit tests exist for frame-*/flicker/output-paths | `cli-args.mjs` has no dedicated unit file (covered via wearArg in tools-runnable) | **P3:** optional `cli-args.test.mjs` for unknown-flag ERROR path |
| `lib/harness.mjs` | works | Exports load; used by quick-validate | — | — |
| `lib/game-vm.cjs` / `game-vm-pool.cjs` / `track-build-vm.cjs` | works | require keys present | — | — |
| `mirror-skills.sh` | broken → fixed | `--help` used to run mirror ("mirrored 27… (--help)"); `--check` was always OK | `--help` not handled | **#680** |
| `install-browsers.sh` | broken → fixed | `--help` ran install body | same | **#680** |
| `cloud-agent-install.sh` | broken → fixed | `--help` ran full install | same | **#680** |
| `.claude/hooks/live-run.py` | broken → fixed | bare invoke → `IndexError`; `--help` missing | no usage | **#680** |
| `bash-guard.sh` | works | blocks `pkill -f` (exit 2 + BLOCKED); safe cmd exit 0 | — | — |
| `protect-files.sh` | works | blocks edit of `js/roster.js` (generated) | — | — |
| `post-edit.sh` / `stop-guard.sh` / `memory-sync.sh` / `session-start.sh` | works with caveats | `bash -n` clean; wired in `settings.json`; memory-sync no-ops off-cloud | session-start not re-run (would re-npm); memory-sync needs `CLAUDE_CODE_REMOTE` or `APEX_MEMORY_SYNC=1` | — |
| `.claude/settings.json` | works | hooks SessionStart/PreToolUse/PostToolUse/Stop; all referenced hook files exist | — | — |
| `.claude/agents/*` (6) | works | Frontmatter present; README lists all six; matches Cursor Task types | README says "Six agents" — accurate | — |
| `.cursor/rules` | works | `apex-shared.mdc` alwaysApply; render-wgx/tlx bodies match `.claude/rules/` (frontmatter differs: Cursor globs vs Claude paths) | — | — |
| `.agents/skills` symlink layout | works | `mirror-skills.sh --check` → 27 skills; no broken links; README.md correctly absent from mirror | — | — |
| skill-routing query corpus | works | 27/27 skills have 8-query files; structure OK | Live routing not run (no `claude`) | see skill-routing-eval row |
| `docs/plans` report (this file) | works | — | — | this PR |

## Ranked proposals (bigger than a slice)

1. **P1 — skill-routing dry gate in CI:** `--dry-structure` (or a tiny node twin) that asserts every skill has queries and the 5/3 split, without calling Claude. Catches stale/missing routing corpus on every PR.
2. **P2 — `--help` hygiene sweep for remaining check tools:** `scan-globals`, `font-digits`, and any CLI that writes artifacts on bare invoke. Pattern already proven by #676/#680.
3. **P2 — wait-polling-lint output clarity:** label report-only vs gate so agents do not treat the 49-count line as a red.
4. **P2 — extract-module friendlier SyntaxError:** distinguish "bad range" from "broken file".
5. **P3 — cli-args dedicated unit test** for unknown-flag rejection (the original silent-default defect).
6. **P3 — font-digits optional dep story:** document in tools/README that fontTools is author-machine only; `--help` without import.

## Out of scope (other agents)

`tools/check/ai-*`, `defend-duel`, `player-dyn`, `physics-tune-sweep`, `check-physics`, `audio-test`.

## Method notes

- Followed each SKILL.md / `@doc` header; small inputs; skipped secrets/GPU/network where required and recorded why.
- Did not raise ratchets, loosen assertions, or change gameplay constants.
- Fix PRs kept under ~150 lines, one concern each, with a natural unit lockstep where possible.
