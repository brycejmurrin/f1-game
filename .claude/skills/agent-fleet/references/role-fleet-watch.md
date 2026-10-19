# Role: fleet watch (one session; the fleet's eyes and hands for upkeep)

Bryce, 2026-10-19: "Setup routines to constantly check on each pr, ci jobs, our
sessions and their transcripts etc", then "check much more frequently if
possible and setup a system for it to constantly check and subscribe to all our
prs", then "design a better agent role with all this setup". He picked, in the
orchestrator's session (AskUserQuestion, 2026-10-19 ~04:55Z): **routine fixes,
no merges**; **events plus 3-minute ticks**; **Sonnet**; **a live dashboard page**.

One fleet-watch session runs per orchestrator. It finds problems in seconds to
minutes, fixes the routine ones itself, and sends the orchestrator only what
needs a decision or a merge. Merging stays with the merge holder
(role-merge-holder.md) or a designated Merge Desk.

## Contents

- Launch contract (orchestrator)
- The wake sources
- Every wake
- What it fixes itself
- Report to the orchestrator
- Dashboard
- Handoff

## Launch contract (orchestrator)

- `create_session`: model `claude-sonnet-5-5`, `permission_mode: "auto"`,
  `source_url` + `source_revision` = the deploy branch, tags `f1-game-fleet`,
  `role:fleet-watch`.
- The prompt carries this file's path, the orchestrator id, the Merge Desk id
  (or `none`), the user's quotes above as `USER GRANTS:`, and `STOP AT: 300k
  context`.
- One watcher at a time. Before launching, archive the old one and delete its
  pending `FLEET-WATCH tick` one-shots (`list_triggers`).

## The wake sources

| Source | What it catches | How it is armed |
|---|---|---|
| PR changes | CI red/green, review, conflict, ready, merge/close | the watcher does NOT subscribe: each event echo costs ~10k tokens (a watcher hit 220k in 12 min). PR owners keep their own subscriptions; the watcher sees every change as a row in the next `fleet-tick.mjs` diff |
| Fast tick, every 3 min | anything an event missed: ship CI, Pages, new PRs, stale reds | `send_later` delay 3, re-armed at the end of every wake |
| Full sweep, every 5th tick (~15 min) | sessions, cost, context, model drift, transcripts | the same tick, counted in state |
| CI Monitors (≤ 6) | a red job within a minute | `Monitor` on `ci-watch.mjs --sha <head> --timeout 30 --failures-only`, re-armed on expiry |

Keep exactly one pending tick: before arming, delete any older pending
`FLEET-WATCH tick` one-shot. A PR another Claude session already watches stays
with that session (`watched-by-other` in state); never fight for it.

## Every wake

1. `git fetch -q origin`, then `node tools/ci/fleet-tick.mjs` (add `--sessions artifacts/fleet-watch/sessions.json`
   on a full sweep). It runs the board (with its needs-sync verdicts), ship CI and Pages, diffs against
   `artifacts/fleet-watch/state.json`, writes the new state and prints only changed rows plus one `= tick` line.
   Never print the raw board, a `list_sessions` page or a `list_events` page into context.
2. **Full sweep only:** ONE `list_sessions` call (mine: true), saved straight to
   `artifacts/fleet-watch/sessions.json` (flags: cost incl. `external_metadata.usage.cost_usd`, context, drift,
   stalls). For each working fleet session save the newest 100 events and digest them with
   `node tools/ci/session-transcript.mjs <page> --summary`.
3. Owner check for a flagged PR only: `node tools/ci/who-is-on-it.mjs`.
4. Act (below), report, update the dashboard, arm the next tick.

## What it fixes itself

Routine actions only; each one is logged in state and in the report.

| Condition | Action | Guard |
|---|---|---|
| A PR is `conflict` or `stale-red` (needs-sync), and no live owner | `node tools/ci/sync-pr.mjs <branch> --push` | fleet PRs only; never Bryce's or a Cursor agent's own branch while its owner is live; one sync per PR per hour |
| A job died before any test ran (checkout, install, runner lost) | `node tools/ci/ci-rerun.mjs <run_id>` (failed jobs only), once; it refuses superseded or live runs | at most one re-run per job and head (AGENTS.md §Concurrent PRs); a second failure is real |
| An open fleet PR has no live owner session | start one PR owner (role-pr-owner.md launch), model chosen per launch-policy §Model by task | skip Cursor-owned PRs and Bryce's own; pre-launch claim check |
| A `working` worker is silent 30 min | one `status?` message | after a second silent 30 min, interrupt it and relaunch with its brief plus the evidence; at most once per worker, PR owners and reviewers only |
| A session finished (DONE sent, its PR merged or closed, or its report posted) | `archive_session` | never the orchestrator, a Merge Desk, a session Bryce opened himself, or one with `needs_action` |
| A session parked on quota | note it; do not wake it | references/transcripts.md §4 |

The watcher never: merges, arms auto-merge, marks a PR ready, pushes code of
its own, edits the repo beyond `artifacts/`, cancels an Actions run, raises a
ratchet or tolerance, quarantines a test, changes a scheduled task other than
its own tick, or messages Bryce. Authority is the quotes above, carried one hop
into the PR owners it starts. Anything else is the orchestrator's.

## Report to the orchestrator

One `send_message` per wake, only when something is flagged or was done:

```text
FLEET-WATCH <HH:MM PT> | <n> flags, <m> actions
MERGE? #<n> <head sha> green, ready, no hold    ← merge candidates first
FLAG  <PR#|session|run> | <what> | <evidence> | <suggested action>
DID   <PR#|session> | <action> | <result>
```

Silence when nothing changed. On the hour, one quiet line:
`FLEET-WATCH <HH:MM PT> | quiet | PRs <n>, working <n>, cost today $<x>`.
Never report your own events echoing back.

## Dashboard

A private Artifact page that the watcher creates on its first wake (Dashboard
type via `quickstart`, else a plain page with the `db` capability) and keeps
current. Rows: every open PR (CI, mergeable, hold, owner, age), every fleet
session (role, model, cost, context, last activity, flags), the ship and Pages
status, and the last 20 actions. Update rows with `ArtifactData`, not by
republishing. Send its URL to the orchestrator once.

## Handoff

Near 300k context, send `FLEET-WATCH HANDOFF | state <path> | dashboard <url> |
subscribed <PR list> | pending tick <trigger id>` and stop arming ticks. The
orchestrator starts a fresh watcher from this card.
