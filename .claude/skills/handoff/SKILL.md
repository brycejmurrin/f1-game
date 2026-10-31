---
name: handoff
description: "Use when the user asks for a handoff or a prompt to continue in a new session, the session is long or near its context limit, or a worker hits its cap. Not for: editing skills or AGENTS.md → agent-config; driving a PR → steward."
user-invocable: true
---

# /handoff — a paste-ready cold-start prompt

A new session starts with no memory and an unfetched branch, so the hand-off
carries everything it needs. Never write a `HANDOFF` file to the repo root: a
cold clone cannot see it.

Every session hands off at its brief's `STOP AT` (300k by default; `.claude/hooks/context-cap.py` enforces the last `STOP AT: <N>k`, hard cap = soft + delta), attended, dispatcher or worker alike (PR #4230 efficiency review
finding 1: every wake re-reads the whole context). Before idling, write the follow-up prompts into the PR's Hand-off
block. Model names and messaging routes are host-specific; use only exposed host capabilities.

Two audiences, two endings (steps 1–2 are shared):

- **Attended** (the user asked, or `context-cap.py` names your live context near its stop): steps 1–3, then
  output the prompt in chat in ONE code block. Add no `needs-owner` unless the user leaves the PR to the fleet.
- **Unattended worker at its cap or stuck** (skill `worker`, contract item 6): steps 1–2, then add
  `needs-owner` using the route allowed for the vendor (docs/WORKERS.md §Per vendor), notify the parent
  through an exposed messaging tool, and end. `@parent` is the Claude dispatcher route, not a native Codex
  child ID. A native child returns its result to its actual parent; it does not adopt the PR. No chat prompt: the
  takeover reads only the Hand-off block and the Plan. The dispatcher's next cycle launches the takeover once no
  RUNNING or WORKING worker names the PR (skill `dispatcher`, rule 2).

1. **Push first.** A run in flight: stop it (`node tools/ci/test-bg.mjs --stop`) or name it and its log in the
   hand-off. A dirty tree or unverified work: commit it as WIP anyway, in two calls (`git add <paths>`, then
   `git commit`; AGENTS.md rule 12), and list what is unverified as **Not run**. If the commit hook's guards
   refuse, fix that guard row, or leave those paths unstaged and list them as "uncommitted, lost with this
   container". Then `git push -u origin <branch>` and confirm on the remote:
   `git ls-remote origin refs/heads/<branch>` shows `git rev-parse HEAD`.
2. **Facts**: `node tools/ci/session-status.mjs --summary --pr` for branch/PR/CI state (its Markdown feeds
   `verified:` / `not-run:`; it is not the Hand-off block). Read the PR body for its Plan and Next step with
   GitHub MCP `pull_request_read` (or `gh api repos/brycejmurrin/f1-game/pulls/<n> -q .body`). No PR yet → open a DRAFT PR (`/ship`
   step 1): the body is the durable log. Refresh its Plan and the ` ```handoff ` fence (docs/WORKERS.md §The
   Hand-off block: branch, head, owner, lane, verified, not-run, next) with `update_pull_request`.
3. **The prompt**, in this order:
   - repo `brycejmurrin/f1-game`, branch, pushed head sha, PR number and URL
   - first: ADOPT the PR (skill `worker`, contract item 8): comment `adopts PR #<n> — <host>:<session id>`,
     remove `needs-owner` if set (`gh api -X DELETE …/labels/needs-owner`; a dispatcher-launched worker skips this, the
     dispatcher already did), set `owner:` in the Hand-off block
   - Goal in one sentence; Plan: the done / now / next items from the PR body
   - what is not run, unverified or red, with the exact command to reproduce
   - accessible evidence links; ignored `artifacts/` or `scratch/` paths are
     local to the old workspace unless separately transferred or published. Read back the updated PR body;
     a successful update records the hand-off, but does not prove a successor was launched or acknowledged it
   - first commands: inspect `git status` and read `AGENTS.md`; fetch `origin <branch>`, resolve
     `FETCH_HEAD` and compare it with the recorded pushed head. Create an isolated worktree from that SHA
     when another session owns the checkout; never switch its branch. Run
     `node tools/ci/session-status.mjs --summary --pr` from the resolved checkout
   - skills to load (`.claude/skills/README.md`), and the user's grants quoted
     with their time; no merge grant is implied
   - the rest of AGENTS.md `# Compact instructions` that applies: the `hold`,
     `needs-decision` and `claimed` labels you set, a run in flight and its log
     path (`artifacts/logs/<group>.log`), armed Monitor / trigger ids (so the
     successor can stop or delete them), OWNED / FORBIDDEN paths
4. Under ~25 lines. Link the PR for detail instead of pasting it. The PR body's
   Hand-off block is the one hand-off a lane leaves behind.

## Handing over an orchestrator or dispatcher

- **One writer.** The old orchestrator stops writing at handover (no labels, Board edits, launches) and clears its
  `/goal`; the successor's first `dispatch.mjs --apply` passes `--take-lock --self <its id>` (skill
  `dispatcher`, the lock). Name the armed scheduled-task ids so the successor deletes or keeps them.
- **Default to the deep launch template** (the full Hand-off block, `STOP AT`, exact numbers, the known
  container-only red), never a one-line "continue".
- **Unique hunt id.** Give every hunt or survey session an id nothing else carries (hunts #5 and #6 both ran as
  "hunt 6"); keep a notes index (a `docs/notes/` entry) linking its reports.
- **A hunt or survey ends by filing.** Its ranked findings become `ready` issues (one per finding) or ONE tracking
  issue before the session ends; findings left in branch notes are lost (the UI hunts left 12 and 17 bugs there).
