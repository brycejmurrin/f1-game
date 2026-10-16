# Worker

You own one task and its OWNED globs, from plan to merged. The orchestrator is
your only escalation path besides the user; ask it instead of guessing.

## The loop

1. **Claim and plan.** `node tools/ci/who-is-on-it.mjs`, then
   `--claim "<task>" --session <id>` (`--session` is needed when no
   `APEX_SESSION_ID`/`CODEX_THREAD_ID`/Claude session variable is set; reuse
   the same id for `--release`). New work: branch `cursor/<topic>-<hash>` from
   the deploy branch. An existing PR: `references/existing-pr.md` instead.
   `node tools/ci/pick-tests.mjs` for the groups the change needs. At the
   FIRST commit push and open the DRAFT PR (GitHub MCP `create_pull_request`,
   `draft: true`; not `deploy.mjs --pr`, which opens it ready), body from
   `.github/pull_request_template.md` plus the fleet block (SKILL.md): Goal,
   and the plan as the **Plan** checklist (3–6 `- [ ]` items, one **now:**).
2. **Implement** with the domain skill the change matches (`.claude/skills/README.md`).
   Make every source edit first, then verify once (AGENTS.md rule 2).
3. **Verify** with `check-changes`: `node tools/ci/tooling-fast.mjs --changed --jobs=3`
   in the background while you edit (AGENTS.md rule 4; the default `--jobs` is
   1), and the full `tooling-fast --jobs=3` before a code push (rule 3). Then one browser spec or
   group (`test-bg.mjs`, or `remote-group.mjs` on the pushed branch for a whole
   group). Never use hand-written `sleep`, `while`/`for` poll loops, or any
   foreground wait over 120 s — use `test-bg.mjs --wait` with `--timeout`
   (minutes) as a background task only.
4. **Screenshot** UI and visual claims with `playwright-probe` /
   `survey-ui-matrix` / `tools/shot/hud-survey.mjs`, at phone landscape 844x390
   with touch first. Numbers first (overlap px², findings), 2–4 images per PR.
   Until a publishing tool exists: commit the PNGs (each < 400 KB) to a
   separate `shots/<pr>` branch cut from the deploy branch, never the PR
   branch, and list each file with what it proves in the PR body.
5. **Keep the PR body live** (AGENTS.md rule 12): tick each Plan item with its
   evidence the moment it lands (`update_pull_request`, no push needed), add
   discovered work, strike dropped items with why; refresh Status and the
   fleet block at every push. `ready-gate.mjs --pr <n>` refuses while a Plan
   item is still open.
6. **Subscribe** with your host's tool (Claude Code `subscribe_pr_activity`;
   Cursor `subscribe_github_ci` + `subscribe_github_pr`) AND keep one timer
   (`send_later` / `subscribe_timer`, ~1 h). On every wake run
   `node tools/ci/ci-watch.mjs --sha <head> --once` per turn — subscriptions miss
   events (Claude's can drop `check_run` completions; Cursor's delivers only
   while the commit is still the branch head). If CI is still queued, write a
   handoff note and end the turn (no `--timeout 600` poll loops). Grok has
   neither subscription: one `ci-watch.mjs --sha <head> --once`, then hand off.
7. **Fix until merged**: a red is work now (the `ci-red-triage` agent → fix at the root
   with a failing test first → `steward`). On a CI wake, `ci-watch --sha
   <current head> --once` — `= ci running (0 failed)` is **not** stale; only
   `= ci passed` on that head dismisses. Re-read the head SHA before every
   push (paced by the brief's `PUSH SLOT`: `launch-policy.md`, Paced push); merge the base in, never rebase or force-push. Mark ready only after
   `ready-gate.mjs` exits 0. Arming is Merge Desk's, a direct merge Grok
   Bot's, always a merge commit. Never write "do not merge" lines in the PR
   body; the only hold is a line starting `MERGE-HOLD:`.
8. **Hand back**: `--release` the claim, set `state: done`, and tell the
   orchestrator the PR, the head SHA and anything not run. A Cursor `Task`
   worker's final message IS its hand-back to the orchestrator: end with
   those three facts.

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

## Traps that cost real sessions

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
