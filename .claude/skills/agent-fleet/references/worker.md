# Worker

You own one task and its OWNED globs, from plan to merged. The orchestrator is
your only escalation path besides the user; ask it instead of guessing.

## The loop

1. **Claim and plan.** `node tools/ci/who-is-on-it.mjs`, then
   `--claim "<task>"`. Branch `cursor/<topic>-<hash>` from the deploy branch.
   `node tools/ci/pick-tests.mjs` for the groups the change needs. Write the
   plan (3–6 lines) into the first commit message or the draft PR body.
2. **Implement** with the domain skill the change matches (`.claude/skills/README.md`).
   Make every source edit first, then verify once (AGENTS.md rule 2).
3. **Verify** with `check-changes`: `tooling-fast --jobs=3` in the background,
   then one browser spec or group (`test-bg.mjs`, or `remote-group.mjs` on the
   pushed branch for a whole group).
4. **Screenshot** UI and visual claims with `playwright-probe` /
   `survey-ui-matrix` / `tools/shot/hud-survey.mjs`, at phone landscape 844x390
   with touch first. Numbers first (overlap px², findings), 2–4 images per PR.
   Until a publishing tool exists: commit the PNGs (each < 400 KB) to a
   separate `shots/<pr>` branch cut from the deploy branch, never the PR
   branch, and list each file with what it proves in the PR body.
5. **Draft PR**: GitHub MCP `create_pull_request` with `draft: true`, body from
   `.github/pull_request_template.md` plus the fleet block (SKILL.md). Not
   `deploy.mjs --pr`: it opens a ready PR.
6. **Subscribe** with your host's tool (Claude Code `subscribe_pr_activity`;
   Cursor `subscribe_github_ci` + `subscribe_github_pr`), and keep one
   `send_later` check-in if your host has it.
7. **Fix until merged**: a red is work now (`ci-red-triage` → fix at the root
   with a failing test first → `steward`). Re-read the head SHA before every
   push; merge the base in, never rebase or force-push. Mark ready only after
   `ready-gate.mjs` exits 0. The merge is CI Watch's.
8. **Hand back**: `--release` the claim, set `state: done`, and tell the
   orchestrator the PR, the head SHA and anything not run.

## Escalate

Set `state: blocked` and `needs-orchestrator: yes`, comment
`@orchestrator BLOCKED: <question, options, what you tried>` on the PR, and,
on Claude Code, `send_message` the ORCHESTRATOR session from the launch
prompt. Escalate when:

- the change needs a path outside OWNED, or another live session owns it;
- the task is ambiguous, or the user's words and a sibling's message disagree;
- a red is not yours (red on the base too) and no fix exists to port;
- you hit a cap (captures, ~400 messages, ~90 min with no OWNED push).

Keep working on anything the blocker does not touch while you wait.

## Traps that cost real sessions (2026-10-10)

- The commit hook judges the index BEFORE a `git add` in the same Bash
  command: run `git add` in its own call, then `git commit`.
- `physics-baseline-provenance` fails in a shallow clone even when the blessing
  commit is fetched: `git fetch --unshallow` before blaming the change.
- `apex-tools` can fail to connect when it starts before `npm install` ends;
  `bash tools/mcp/apex-tools-mcp.sh call <tool> '<json>'` is the same surface.
- `hud-survey.mjs --out` must stay under that checkout's own `artifacts/`;
  its device list is fixed (add a viewport locally, never commit it unasked).
- A sibling that pushed to your PR branch while you worked is live: stand down
  and escalate instead of pushing over it.
