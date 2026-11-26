# Per vendor, `LAND_TOKEN` and the ruleset

## Claude cloud session (`lane:claude`, the default)

The whole of SKILL.md. `subscribe_pr_activity` on the PR while CI runs on your head; no timers while it works
(AGENTS.md rule 13). A fired session's only input is its one-line address (`ISSUE n` / `CONTINUE PR n` /
`DEPLOY-RED`); it reads the rest from GitHub.

## Cursor cloud agent (`lane:cursor`, self-contained issues only)

`hosts.cursor.enabled` is false today, so Bryce or the Grok launcher starts it.

**Model (every launch, DAD included):** pass it explicitly: routine = `composer-2.5`, hard = Grok 7 (confirm its exact Cursor slug at launch, never invent one); never `default` or Auto (`.cursor/rules/apex-shared.mdc`).

**PR tools (direct, built-in):** `CreatePullRequest`, `ManagePullRequest` (draft flip, close) and
`EditPullRequestLabels` — they work (used on #6114, #6127, #6130). Call them directly; never search
`get_mcp_tools` for them. **Issues:** Cursor has no issue-write tool (cannot comment on, create or label
issues). Put issue claims in the Hand-off `next:` line; DAD or a Claude lane posts them. Never use `gh api`,
a token read, or a browser to write issues.

**Drafter** — after opening the draft PR, subscribe once with `subscribe_github_ci` (its branch) and
`subscribe_github_pr` (the PR). A CI notification is not a new task. A red on its own head: fix it, at most
2 fix pushes. When draft CI is green: run `node tools/ci/closing-refs.mjs --pr <n>` and
`node tools/ci/ship-pr.mjs --pr <n>` (exit 0), then ManagePullRequest `draft:false`, then
EditPullRequestLabels add `land`. On an already-ready PR use `node tools/ci/ready-gate.mjs --pr <n>` instead.
Many PRs carry `land` at once; the train batches up to 12; never push to `train/**` or `train-next/**`. Cap
spent: refresh Plan and Hand-off, unsubscribe, stop. Never sleep-poll, use timers or shell loops, and never
comment on its own PR (it echoes back as a wake). Fence owner line:
`owner: cursor:<agent id> until <ISO UTC, at most 4 h ahead>`.

Symbols go through apex-lsp (`lsp_outline`, `lsp_definition`, `lsp_callers`, then `lsp_diagnostics` once after
the edit); grep is for comments, docs, and CSS. Do not spawn task_v2 scouts (including CI-triage). Gate order:
edit, `npm run gen`, `tooling-fast --changed` once, commit, push. One more gate only when GitHub says
CONFLICTING. Cursor's entry is `.cursor/rules/apex-shared.mdc`.

Cursor loads `.claude/skills/` and `.claude/agents/` natively. It enforces a card's read-only status only through its
own `readonly:` key, which our cards do not carry, so tell a reviewer subagent in its prompt not to edit. In a cloud
agent the hooks `sessionStart` and the MCP ones do not fire; the shell, `preToolUse` and `subagentStart` hooks do.

## Codex thread (`lane:codex`, Bryce's own tool, pull-only)

Write the Hand-off block at the first push and add `lane:codex`; the same `land` label lands you. A draft silent for
6 h is re-owned without asking. AGENTS.md stays under 32 KiB because it is all a Codex thread loads; where it names a
Claude-only tool (`Monitor`, `run_in_background`, `subscribe_pr_activity`), Codex uses its own equivalent or skips
the step: for CI, see [`host-watch.md`](host-watch.md) §Codex and Cursor.
- **Subagents.** The built-in `explorer` and `worker` agents (no `.codex/agents/` cards exist yet), spawned in prose.
  To use one of ours, tell it to read `.claude/agents/<name>.md` and follow it. Our hooks see no subagent id, so
  the no-browser and no-guard-edit rules for subagents (AGENTS.md rule 10) hold only if the prompt states them.
- **GitHub.** Codex writes through the `chatgpt-codex-connector` app (measured on #6334). The gate does not count
  that app as an agent, so a `config-ok` or `ratchet-raise` a Codex lane adds does nothing: put the request in
  `next:`. `lane:codex` and `land` work as for any lane.
- **Hooks.** `.codex/hooks.json` loads only in a trusted project, after `/hooks` review; a changed hook is skipped
  until it is re-trusted. Repo hooks in Codex cloud tasks are not documented, so treat them as absent: the
  `.githooks/` pre-commit and pre-push hooks and CI still bind.
- **Orchestrating from Codex:** skill `dispatcher` [`references/other-hosts.md`](../../dispatcher/references/other-hosts.md).
  Facts and sources: `docs/notes/MULTI-AGENT-CODEX-CURSOR-2026-11-25.md`.

## `LAND_TOKEN` and the ruleset

`land.yml` arms auto-merge with the repository secret `LAND_TOKEN` (a fine-grained PAT on this repository with
Contents, Pull requests and Workflows, each read and write; Workflows is needed to merge a PR that touches
`.github/workflows/`). Without it the workflow falls back to `GITHUB_TOKEN`, which still lands the PR, but "events
triggered by the GITHUB_TOKEN will not create a new workflow run": the merge starts no Pages train, and the change
ships on the daily cron or a manual dispatch. The job summary says so when it fell back.

The deploy branch ruleset "Deploy-reset" (set in the GitHub UI by Bryce; since 2026-10-27 the only rule, classic
branch protection is deleted) requires ONE check, `gate` (source: GitHub Actions). `CI` is not a GitHub-required
check: `merge-gate.mjs`'s ci row enforces it, reading the newest check named exactly `CI`. The ruleset allows merge
commits only, forbids direct pushes and binds administrators; `pages.yml`'s workflow-level concurrency group (one
running train, one pending, the newest pending replaces the older) is the pacing rule.
