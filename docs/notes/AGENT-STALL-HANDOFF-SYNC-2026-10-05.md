# Agent stall abort, handoff gate, merge-not-rebase — 2026-10-05

Source: Insights lane check fixes 3 and 5 (agent-efficiency / orchestration
audit). AGENTS.md holds a one-paragraph pointer only; this note is the full
rule text. Enforce in launch prompts, specialty handoffs, and orchestrator
reviews — not as new hooks in this PR.

## 1. Stall abort

Abort or cancel a cloud agent when either:

1. **Zero tool calls** after **5–10 minutes** of wall time (no tool use at all),
   or
2. **Fewer than 15 tool calls** and **no OWNED-path push** past **10 minutes**.

On abort: alert the **owning lane** (the specialty / launch owner that started
the agent) **and** the **orchestrator** (Insights / CI Watch / whoever is
coordinating the swarm). Do not leave a silent hung session on the board.

Notes:

- "OWNED path push" means a push that touches paths inside that agent's
  declared `OWNED:` globs (not a no-op sync or status-only commit).
- Counting starts at agent start (or at resume of a stalled turn). A live
  browser / `tooling-fast` / CI wait that is producing tool calls is not a
  stall; a turn that only plans in prose with no tools is.
- Prefer cancel via the Cursor agent control surface; do not `pkill` harness
  processes. Record the abort reason in the lane's next handoff.

## 2. Handoff gate

No "done", "finished", "ready for review", or equivalent close-out without
**all** of:

| Field | Required content |
|---|---|
| **paths** | Files / globs touched this session (or "none") |
| **PR / bc links** | Pull request URL and/or Cursor agent `bc` / agents URL |
| **owned path globs** | The `OWNED:` (and `FORBIDDEN:` if set) scope for the work |
| **ranked next ≤3** | Up to three ranked next steps for the next agent or human |
| **blockers** | Concrete blockers, or explicit **`idle / no PR`** when nothing is open |

A reply that says only "done" or "LGTM" without those fields is incomplete —
re-ask or fill them before standing down. Idle sessions with nothing to ship
must still say **`idle / no PR`** under blockers (and may leave PR/bc empty
with that same explicit idle line).

## 3. Merge-not-rebase

Sync a topic branch onto ship by **merging** `origin/claude/f1-game-project-26h3ng`
(prefer `node tools/ci/sync-pr.mjs <branch>`, else `git merge`), **never**
`git rebase`, **never** force-push (`--force` / `--force-with-lease`).

Ratchets, generated shell/docs, and concurrent PRs make rebase rewrite
history expensive and conflict-prone. `sync-pr.mjs` already cures generated-file
conflicts; hand rebase does not. Clean-behind is not a sync reason — sync only
when GitHub reports CONFLICTING/DIRTY or a required tip check is red
(AGENTS.md §Git branch & deploy).

## Disjoint from

- PR #1032 (steward card / `cursor/<topic>-<hash>` naming / MERGE PACING) —
  different note; AGENTS.md pointer placed outside that PR's hunks.
- PR #1027 (Cursor team plugin under `cursor-plugins/**`) — this PR does not
  touch plugins.
