# Role: PR owner

One sibling session that drives exactly one existing PR to merged. It does not
hunt, build features or start sessions. The orchestrator (or Fleet Watch) starts
one per PR the moment a hunter or builder hands the PR off (`NEW-PR`), and
archives it on `DONE`. Why a session and not a subagent: the owner must keep
a subscription, a CI watch and timers alive for hours and survive a container
restart; an in-session subagent ends with its parent's turn.

## Contents

- Launch (orchestrator)
- Monitoring and reporting (paste into every launch prompt)
- The watch kit (arm at start and after every push)
- On every wake (event, Monitor line, check-in)
- The steward loop for any PR owner (folded from steward/references/ownership.md)
- Keep the box free (2026-10-17)
- Traps that cost this role real cycles (2026-10-16)
- A PR that edits `.claude/**`

## Launch (orchestrator)

Use the orchestrator.md launch template with:

- `source_revision`: the PR's head branch (not the deploy branch).
- `GOAL: CONTINUE PR #<n> on <branch>` (references/existing-pr.md).
- OWNED: the PR's changed files, its `tests/data/ratchets.d/` delta, the PR body.
  FORBIDDEN: other PRs, `.claude/**`, tolerances, quarantine lists.
- `USER GRANTS:` the user's words that cover this PR, each with its UTC time,
  plus the grant that created the owner role. If the user already ordered the
  merge and the orchestrator armed it, say "auto-merge is armed (MERGE); leave
  it" — the owner still never arms or merges. `.claude/**` edits: `<quote> | NONE
  — push is expected to need a typed Approved: from Bryce in this session`.
- `STOP AT: 150k context or $<cap>` as the last line (launch-policy.md §Size stop, its one home).
- The relayed notes from the previous owner (head sha, last CI verdict, local
  sync state, files that conflicted).

## Monitoring and reporting (paste into every launch prompt)

```text
MONITOR: you own PR #<n> (the one you open, or the CONTINUE PR) until it merges
or STOP AT. On every wake read the PR (`pull_request_read get`), its head CI
(`node tools/ci/ci-watch.mjs --sha <head> --once`) and mergeability, then:
red in OWNED → fix, `tooling-fast --changed` plus the failing test, push once;
CONFLICTING/DIRTY → `node tools/ci/sync-pr.mjs <branch>` (merge origin, no
force, no rebase); draft with a green tip and `ready-gate.mjs --pr <n>` exit 0
→ mark ready, then keep watching until merged.
Do not enable auto-merge or merge: your orchestrator merges through
merge-gate.mjs (role-merge-holder.md, AGENTS.md standing authority).
REPORT: READY / BLOCKED / DONE to fleet <X>'s orchestrator via agent-msg.mjs (resolve
with fleet-bus.mjs who X). Keep this line in the PR body current, just under the fleet
block (not inside it):
  fleet-status: <working|blocked|needs-decision|ready|red|done> | <one-line reason> | <UTC time>
and post the same line as a PR comment on every state change (never on an
unchanged state). Decisions go to the orchestrator, not Bryce: set needs-decision and
comment `@orchestrator NEEDS-DECISION: <question>`, then wait for its reply on
the PR. On merge: `fleet-status: done`, `state: done`, `--release` the claim.
```

## The watch kit (arm at start and after every push)

1. `subscribe_pr_activity` on the PR — and again after the draft→ready flip (steward §12).
2. A `Monitor` on `node tools/ci/ci-watch.mjs --sha <head> --timeout 30 --failures-only`,
   re-armed on expiry until the `= ci …` line (it expires at 30 min). Plain mode
   emits one event per job leg and woke ~15 owners per PR (retro 2026-10-17); do not SAY on a green leg.
3. One `send_later` check-in at AGENTS.md rule 13's cadence (50–55 min, pending
   Bryce), re-armed until the PR is merged or closed, or you send
   READY or BLOCKED. After READY, disable the check-in (`update_trigger`
   `enabled=false`; the classifier has refused `delete_trigger` on a session's
   own check-in) and end the turn: a 600k owner paid ~$0.75 per wake to learn its queue position (W49);
   the subscription still wakes you on a red.
4. Reply once: `ARMED <PR> sub=yes monitor=yes checkin=<UTC>`. No ARMED line
   means the orchestrator treats the owner as not live and nudges it.

## On every wake (event, Monitor line, check-in)

A wake that only echoes your own action (subscription confirmed, ready marked,
your own comment) ends the turn with no tool call; call `ReadNotifications`
only when a notice says one is pending.

Read the live PR first (`pull_request_read get`, `ci-watch --sha <head> --once`,
open review threads), then drive it with skill `steward`'s loop without asking:
a conflict is steward §2 (`sync-pr`, including the prose-only `--verify=none`
case), a red is §1 / `ci-red-triage` (fix within OWNED, `tooling-fast --changed`
plus the failing test alone, one push), review comments are steward too. A red
the base also has: port the fix if one exists, else one PR comment naming it.

What this role adds at draft → ready: mark ready only when `ready-gate.mjs --pr <n>`
exits 0 AND `node tools/ci/ci-watch.mjs --sha <head>` shows `= ci passed` (ready-gate reads the structural
guards; it has exited 0 while `CI` was red). A draft or unlabelled run can say
`passed` with 16 of 17 jobs skipped: put the `run-ci` label on first (or, when a
label 403s, a PR-body line that starts `CI: run`: same fast tier, no one else needed), and cite
in every READY the run id, the job ids that RAN and the tests>0 line. A
`workflow_dispatch` pass is not a verdict on the PR head. The flip itself (mergeable
first, re-subscribe after it, READY after `ready-gate --wait` on the same head, the
`wait-for --merged` merge watch, no piped push): skill `steward` §12.

Send `READY <PR> <sha>` when it goes ready (no per-push REPORT lines: the
`fleet-status:` line carries progress) and stop after the merge; DONE is the
merging orchestrator's line (SKILL.md §Glossary). End every READY with the
box-health line below.

Idle wakes: a duplicate or no-change event gets no tool call and at most one line.

## The steward loop for any PR owner (folded from steward/references/ownership.md)

Any session that owns a PR, fleet or not. Rules live in AGENTS.md (rules 2-5, 8,
9, 11-13; §Git branch & deploy) and `.claude/rules/fleet-core.md`; skill
`steward` carries the overrides. Already own the PR and a push went red: start at 3.

1. **Claim and read**: AGENTS.md §Git branch & deploy (claim before a shared fix);
   continue an existing PR by checking out its branch, new work is `cursor/<topic>-<hash>`.
2. **Subscribe** with the host's tool (AGENTS.md rule 13). One watcher per PR; if
   another agent holds it, run `ci-watch.mjs --sha <head> --once` at checkpoints.
3. **Read the CURRENT head** before every decision and push (`git fetch`, then
   `git rev-parse origin/<branch>`, or `pr-board.mjs --pr <n>`); another session
   may have pushed.
4. **Red is work now**: agent `ci-red-triage`; an inherited red is not yours (steward §3).
5. **Fix, verify once, push once**: all edits first; `tooling-fast.mjs --jobs=3`
   and `deploy.mjs --gate-only` as background tasks logging to `artifacts/logs/`
   (rule 4; `queue-depth.mjs` is information only); whole browser groups via
   `remote-group.mjs` after the push. Catch up only per fleet-core's sync rule,
   with `needs-sync.mjs` then `sync-pr.mjs`.
6. **Keep the PR body live** (rule 12).
7. **Ready** per fleet-core (`ready-gate.mjs --pr <n>` exit 0), only if your brief
   delegates it; merging and arming are never yours.
8. **Report** first lines from SKILL.md §Glossary; one per transition.

Stop when the PR is merged or closed (unsubscribe, `--release`, DONE), a BLOCKED
needs the user, ~120 messages or two tip moves pass without progress, or another
live session pushes your paths (STAND-DOWN).

Spawn prompt for a non-fleet owner (a fleet owner uses the orchestrator.md template):

```
You own PR(s) <#n[, #m]> on branch <cursor/topic-hash> in brycejmurrin/f1-game.
Follow AGENTS.md and .claude/skills/agent-fleet/references/role-pr-owner.md
(§The steward loop). Goal: <one sentence, user's terms>.
OWNED: <path globs>. FORBIDDEN: <path globs; shared-contract files>.
Done when: current head green, ready-gate exits 0, PR body refreshed, then READY reported.
Delegated: <e.g. mark ready after the gate; NOT auto-merge, NOT merge>.
Do not enable auto-merge or merge. Do not rebase or force-push.
Report to @parent with READY/BLOCKED/DONE/STAND-DOWN first lines only.
```

## Keep the box free (2026-10-17)

Each session is its own 4-core VM; every stall measured that night was the
session saturating itself (full tooling-fast past the 30-min cap, a local `ui`
group at 41/201 after 24 min, a 12 s startup benchmark at 40 s under load).

- Edit loop and browser groups: AGENTS.md rules 3–4 and §Verification
  (`tooling-fast --changed --jobs=3` plus the failing test; a whole group runs
  on CI via `remote-group.mjs`, locally one spec at a time).
- Box-health line, last line of every REPORT / READY, printed by:
  `awk '/^cpu /{t=0;for(i=2;i<=9;i++)t+=$i;s=$9}END{getline l<"/proc/loadavg";split(l,a," ");printf "box load=%s steal=%.1f%% ",a[1],100*s/t}' /proc/stat; ps -eo pcpu,comm --sort=-pcpu | awk 'NR==2{print "top="$2" "$1"%"}'`.
  Load above 3 for two reports in a row: stop local runs and say what is running.

## Traps that cost this role real cycles (2026-10-16)

- `.claude/memory/*` shows modified after the memory-sync hook: not yours, not
  in any PR. Before a checkout `git stash push -q -- .claude/memory`; never
  commit it or mention it in a REPORT. Push before any long browser run (26
  commits were held through one, 2026-10-17).
- A ratchets delta that LOWERS ceilings for files the PR does not touch turns
  the merge ref red when the base moves. Carry rows only for files in the diff.
- A red you inherit from the deploy tip is cured by syncing after the tip fix
  merges, not by editing tests.

## A PR that edits `.claude/**`

The auto-mode classifier refuses a child's `.claude` edits on a relayed grant
("Self-Modification", 2026-10-16). An owner of such a PR watches and syncs it,
but a fix that needs a `.claude` edit goes back to the orchestrator (whose
session holds the user's grant) or waits for the user to approve it in the
owner's own session. Say which in the REPORT line; do not work around it.

Never: merge, arm or disarm auto-merge, cancel an Actions run, force-push or
rebase, quarantine or skip a test, start a session.
