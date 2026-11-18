# Per vendor, `LAND_TOKEN` and the ruleset

## Claude cloud session (`lane:claude`, the default)

The whole of SKILL.md. `subscribe_pr_activity` on the PR while CI runs on your head; no timers while it works
(AGENTS.md rule 13). A fired session's only input is its one-line address (`ISSUE n` / `CONTINUE PR n` /
`DEPLOY-RED`); it reads the rest from GitHub.

## Cursor cloud agent (`lane:cursor`, self-contained issues only)

`hosts.cursor.enabled` is false today, so Bryce or the Grok launcher starts it. **Drafter** — after opening the draft
PR, subscribe once with `subscribe_github_ci` (its branch) and `subscribe_github_pr` (the PR). A CI notification is not
a new task. A red on its own head: fix it, at most 2 fix pushes. When CI is green or the cap is spent: refresh the
Plan and Hand-off block, unsubscribe, stop. **Steward** (drives one existing PR to merge): subscribe at start, fix reds
on its head, run `node tools/ci/ready-gate.mjs --pr <n>` when the Plan is done, and stay subscribed until the PR merges
or closes (a passing ready-gate is not the end). Never sleep-poll, use timers or shell loops, and never comment on its
own PR (it echoes back as a wake). The Cursor token does not add labels, claim, post issue comments, or open issues:
put `lane:cursor` and `land` in the block's `next:` line; Bryce or a later Claude lane applies them. Symbols go through
apex-lsp (`lsp_outline`, `lsp_definition`, `lsp_callers`, then `lsp_diagnostics` once after the edit); grep is for
comments, docs, and CSS. Do not spawn task_v2 scouts. Gate order: edit, `npm run gen`, `tooling-fast --changed` once,
commit, push. One more gate only when GitHub says CONFLICTING. Cursor's entry is `.cursor/rules/apex-shared.mdc`.

## Codex thread (`lane:codex`, Bryce's own tool, pull-only)

Write the Hand-off block at the first push and add `lane:codex`; the same `land` label lands you. A draft silent for
6 h is re-owned without asking. AGENTS.md stays under 32 KiB because it is all a Codex thread loads; where it names a
Claude-only tool (`Monitor`, `run_in_background`, `subscribe_pr_activity`), Codex uses its own equivalent or skips
the step.

## `LAND_TOKEN` and the ruleset

`land.yml` arms auto-merge with the repository secret `LAND_TOKEN` (a fine-grained PAT on this repository with
Contents, Pull requests and Workflows, each read and write; Workflows is needed to merge a PR that touches
`.github/workflows/`). Without it the workflow falls back to `GITHUB_TOKEN`, which still lands the PR, but "events
triggered by the GITHUB_TOKEN will not create a new workflow run": the merge starts no Pages train, and the change
ships on the 6-hourly cron or a manual dispatch. The job summary says so when it fell back.

The deploy branch ruleset "Deploy-reset" (set in the GitHub UI by Bryce; since 2026-10-27 the only rule, classic
branch protection is deleted) requires ONE check, `gate` (source: GitHub Actions). `CI` is not a GitHub-required
check: `merge-gate.mjs`'s ci row enforces it, reading the newest check named exactly `CI`. The ruleset allows merge
commits only, forbids direct pushes and binds administrators; `pages.yml`'s workflow-level concurrency group (one
running train, one pending, the newest pending replaces the older) is the pacing rule.
