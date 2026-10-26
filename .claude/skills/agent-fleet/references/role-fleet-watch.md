# Role: fleet watch (one session; the fleet's eyes and hands for upkeep)

Bryce, 2026-10-19: "Setup routines to constantly check on each pr, ci jobs, our
sessions and their transcripts etc", then "check much more frequently if
possible and setup a system for it to constantly check and subscribe to all our
prs", then "design a better agent role with all this setup". He picked, in the
orchestrator's session (AskUserQuestion, 2026-10-19 ~04:55Z): **routine fixes,
no merges**; **events plus 3-minute ticks** (superseded 2026-10-26, below); **Sonnet**; **a live dashboard page**.
(Cadence since #3773, 2026-10-26: the bus Monitor replaces the 3-minute tick — §Wake sources below; `orchestrator.md` §First acts.)

One fleet-watch session runs per orchestrator. It finds problems in seconds to
minutes, fixes the routine ones itself, and sends the orchestrator only what
needs a decision or a merge. Merging stays with the PR's own orchestrator
(role-merge-holder.md: `merge-gate.mjs`); archiving follows the archive rule
(`fleet-archive.mjs`, AGENTS.md §Concurrent PRs).

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
- The prompt carries this file's path, `ORCHESTRATOR: fleet <X>`, `USER GRANTS:` quoting every standing grant verbatim with its date and the
  session it was typed in (the quotes above included), and `STOP AT: 150k context` (launch-policy.md §Size stop).
  A changed grant is a relaunch with the amended brief, never a message: relayed grants are refused (authority.md).
- One watcher at a time. Before launching, archive the old one and delete its
  pending `FLEET-WATCH` scheduled tasks (`list_triggers`).

## The wake sources

The board watch is an Actions job, not a session (plan `docs/plans/2026-10-19-fleet-redesign.md` §4B item 6):
the `tick` job in `.github/workflows/fleet.yml` runs `fleet-tick.mjs` hourly (:23; audit4 D1) and on every
claim/bus dispatch, on the Actions token (no proxy 403). It restores the previous state from the Actions cache,
writes the changed PR/ship/Pages rows and the whole board to the run summary, and uploads the `fleet-board`
artifact (`state.json` + `tick.log`, 2-day retention). A tick error is a `::warning::`, never a red run.

The session-side watcher no longer polls PRs, ship CI or Pages. It only:

| Source | What it catches | How it is armed |
|---|---|---|
| Hourly fresh-session sweep | sessions: cost (incl. `external_metadata.usage.cost_usd`), context, model drift, stalls | `create_trigger` `create_new_session_on_fire`, model `claude-sonnet-5-5`, cron `0 * * * *` (hourly is the minimum) |
| The latest `fleet.yml` run | board changes the job already found | read its summary or `fleet-board` artifact (`gh run download -n fleet-board`), never re-run the board |

The watcher does NOT `subscribe_pr_activity` per PR: PR owners keep their own subscriptions, and a watcher
subscribed to every PR reads every echo into one growing context. A PR another Claude session already
watches stays with that session; never fight for it.

## Every wake

1. ONE `list_sessions` call (mine: true), saved straight to `artifacts/fleet-watch/sessions.json`, then
   `node tools/ci/fleet-flags.mjs artifacts/fleet-watch/sessions.json` for the flags. Never print the raw
   page, a board or a `list_events` page into context. For a flagged working session only, save its newest
   100 events and digest them with `node tools/ci/session-transcript.mjs <page> --summary`.
2. Read the newest `fleet.yml` run's summary for board flags (sync verdicts, reds, holds).
3. Owner check for a flagged PR only: `node tools/ci/who-is-on-it.mjs`.
4. Act (below), post the flags, update the dashboard.

## What it fixes itself

Routine actions only; each one is logged in state and in the report.

| Condition | Action | Guard |
|---|---|---|
| A PR is `conflict` or `stale-red` (needs-sync), and no live owner | `node tools/ci/sync-pr.mjs <branch> --push` | fleet PRs only; never Bryce's or a Cursor agent's own branch while its owner is live; one sync per PR per hour |
| A job died before any test ran (checkout, install, runner lost) | `node tools/ci/ci-rerun.mjs <run_id>` (failed jobs only), once; it refuses superseded or live runs | at most one re-run per job and head (AGENTS.md §Concurrent PRs, no approval needed); a second failure is real |
| An open fleet PR has no live owner session | start one PR owner (role-pr-owner.md launch), model chosen per launch-policy §Model by task | skip Cursor-owned PRs and Bryce's own; pre-launch claim check |
| A `working` worker is silent 30 min | one `status?` message | after a second silent 30 min, interrupt it and relaunch with its brief plus the evidence; at most once per worker, PR owners and reviewers only |
| A session finished (DONE sent, its PR merged or closed, or its report posted) | `archive_session` | by `fleet-archive.mjs` only (`.claude/rules/fleet-core.md`); never one with `needs_action` |
| A session parked on quota | note it; do not wake it | references/transcripts.md §4 |

The watcher never: merges, arms auto-merge, marks a PR ready, pushes code of
its own, edits the repo beyond `artifacts/`, cancels an Actions run, raises a
ratchet or tolerance, quarantines a test, changes a scheduled task other than
its own sweep, or messages Bryce. Authority is the quotes above, carried one hop
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

Watcher state and the dashboard data live in the dashboard artifact's `db` (`ArtifactData`) or in a
committed generator, never only in container-local files: a reclaimed container loses `artifacts/`.
The board state lives in the `fleet.yml` `tick` job's Actions cache and `fleet-board` artifact; a local
`fleet-tick.mjs` run (`--dry` for a one-off look) rebuilds its own `artifacts/fleet-watch/state.json`.

A private Artifact page that the watcher creates on its first wake (Dashboard
type via `quickstart`, else a plain page with the `db` capability) and keeps
current. Rows: every open PR (CI, mergeable, hold, owner, age), every fleet
session (role, model, cost, context, last activity, flags), the ship and Pages
status, and the last 20 actions. Update rows with `ArtifactData`, not by
republishing. Send its URL to the orchestrator once.

## Handoff

At the size stop (launch-policy.md §Size stop) send
`FLEET-WATCH HANDOFF | dashboard <url> | pending triggers <ids>` and stop arming ticks. State is in the
dashboard `db`, so the handoff carries only the URL and the pending trigger ids. The orchestrator starts a
fresh watcher from this card.

Output budget: no tool result over 10k characters enters context (comms.md §Output budget); the hourly
fresh-session sweep is the safety net while the watcher turns over.
