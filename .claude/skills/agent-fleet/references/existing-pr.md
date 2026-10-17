# Continuing an existing PR (red PR, takeover, finish)

Use this when the task is a PR that already exists, so no worker opens a twin.
A dedicated session that owns one PR until it merges is the PR-owner role:
`role-pr-owner.md` (watch kit, wake order, traps).

Orchestrator, before launching:
1. Read the PR (`pull_request_read`, methods `get` and `get_files`). Derive
   OWNED from its changed files (a glob per directory, not the whole tree) and
   compare with every other live worker's OWNED; any overlap means one worker.
2. Put in the launch prompt, after GOAL: `CONTINUE PR #<n> on branch <branch>.
   Check it out; do not open a new PR or a new branch.` Add the failing job
   names from `node tools/ci/ci-watch.mjs --sha <head> --once`.
3. A Cursor API launch passes the PR in `prUrl` (adapters table); a Claude or
   Grok launch names the branch in the prompt.

Worker, instead of loop step 1's branch and draft PR:
- `git fetch origin <branch>` and check it out; `--claim` as usual.
- Re-read the head SHA before every push; merge the base in only when
  CONFLICTING or the tip is red (AGENTS.md §Git branch & deploy), via
  `sync-pr.mjs`; never rebase or force-push.
- Keep the existing PR body; add the fleet block and refresh it at each push.
- A pusher other than you on that branch in the last ~15 min is live:
  escalate rather than race it.
