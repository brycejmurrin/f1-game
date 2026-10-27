# Adaptive A+D fleet coordination (2026-10-22)

Fleet A (Claude, OrchA 23) and Fleet D (Cursor/Grok, DAD) agreed this plan over
the agent webhook on 2026-10-22, 08:40–08:50Z. It replaces fixed merge caps
with rules that respond to the state of Pages, the open PRs and the seats.

Bryce's ask, typed in OrchA 23 (session_01LCwqz3kpiVuXkjy8YyJprp), when he was
offered fixed caps:

> Be more adaptable to the state of pages, the open prs, seats, try to figure
> out a coordination system as one of you may not be running or out of tokens
> so if a branch hasn't been worked on in a bit it's fair to take

DAD reports that Bryce approved the plan as proposed in DAD's chat at
08:47Z (1:47 AM PT). Both fleets apply it once this note merges. Until then the
AGENTS.md §Concurrent PRs rules stand unchanged.

## What tonight showed

- Bryce merged game PRs himself (#3488, #3497, #3503, #3522) while both
  orchestrators were pacing on GAME-SLOT. A rule that ignores his merges is
  wrong about the slot.
- Runners were saturated: Pages runs sat `queued` from 08:17Z for over 30 min,
  and three successive runs ended `cancelled`. Each was replaced by a newer
  push, not failed. "One game merge per green Pages" then ships nothing for an
  hour.
- Two non-game merges (#3502, #3521) each replaced the pending train.
- An unknown Cursor agent (bc-4f8efad5, attached via #3517's PR footer, on
  neither fleet's account) pushed a clean-behind sync that superseded a
  full-tier run. A PR comment mentioning `@cursor` woke it again.
- Orchestrators rotate and run out of tokens. A fleet whose orchestrator is gone
  leaves green PRs stranded.

## The rules

### 1. Liveness

Each orchestrator posts a heartbeat on the bus, on change only and at most
every 15 min:

```
node tools/ci/fleet-bus.mjs send HANDOFF --to '*' "HB <letter> <HH:MMZ> seats:<n> queue:<pr,pr,...>"
```

A fleet is **ABSENT** when its orchestrator has gone 30 min with no bus line, no
webhook reply and no merge. The live orchestrator then gates and merges the
absent fleet's PRs that are ready, green and pass `merge-gate.mjs`, using merge
commits and checking for two parents. It **never** lifts a `MERGE-HOLD:` line
and never merges a held PR. D holds every D PR by default, so in practice an
absent D's PRs wait.

### 2. Adopting a stale PR

A PR is **STALE** when all of these hold:

- its head has not moved for 60 min;
- its owner (the session in the fleet block, the claim, or the Cursor agent)
  has posted nothing in 60 min;
- it is red, conflicting, or stalled with a known next step.

Any live orchestrator may then adopt it:

1. Check `node tools/ci/fleet-owner.mjs --pr <n>` and `node tools/ci/who-is-on-it.mjs`.
2. Post `ADOPT #<n> <reason>` on the bus and the webhook.
3. Wait one tick (5 min) for an objection.
4. Drive it: sync with `sync-pr.mjs`, fix, push. Merge commits only, and
   never a rebase or force-push on someone else's branch.

A `MERGE-HOLD:` line still binds the adopter.

### 3. Pacing by Pages state

The orchestrator judges `pages.yml` at each tick:

| state | condition | game PRs | docs/tools PRs |
|---|---|---|---|
| HEALTHY | latest run green or running; nothing queued for 15 min or more | one per green Pages run, to isolate breakage | merge right after a train starts |
| JAMMED | a run queued for 15 min or more, or runners saturated | freeze, and drain runners for the train (rule 7) | freeze (rule 7) |
| RED | the latest Pages run failed | frozen until `pages-red-triage` names the cause | fixes for the red may go |

Never cancel a running train, and never dual-dispatch Pages.

### 4. GAME-SLOT

`GAME-SLOT` on the bus carries a 30-min TTL and lapses if no `DONE` follows.
The next live orchestrator takes it in bus order. A merge Bryce makes himself
counts as taking the slot: whoever is next re-reads Pages before merging.

### 5. Seats

Before launching lanes, read the other fleet's `seats:` from its last
heartbeat and keep the total within the quota gate. At `rate_limit_info`
`allowed_warning` or worse, launch nothing and ask Bryce.

### 6. Unknown pushers

A push by an agent neither fleet owns is an INCIDENT on the webhook plus a bus
line. It is never a takeover or a revert. Do not `@cursor`-mention on GitHub
to stop it, since that wakes the agent. Only the owning Cursor account can stop
it.

### 7. Train discipline: stop cancelling Pages

Measured 2026-10-22: no Pages run went green between 08:18Z and at least 09:10Z.
Four runs went `queued` and were then `cancelled`, and six game merges were left
unshipped. `pages.yml` uses `concurrency: pages-train-<ref>` with
`cancel-in-progress: false`, so a RUNNING train is safe, but each new merge
replaces the PENDING one. With runners saturated (64 Linux jobs in flight
against 40 slots, 24 queued), a pending train never reached a runner before
the next merge replaced it.

Bryce asked for a discussion and agreed this at 09:11Z (2:11 AM PT), relayed by
DAD. It binds A, D, Merlin and anyone merging:

1. **Batch window.** Merges happen only right after a train goes green, or
   when no train is queued or running. In the window, merge every gated green
   PR back to back, at most 4 game PRs, then freeze. Each game PR still takes
   `GAME-SLOT`, and each PR is re-run through `merge-gate.mjs` right before
   its own merge.
2. **Freeze.** While a `pages.yml` run is queued or in progress, nobody
   merges to the deploy branch. That includes docs merges, which also replace
   the pending train.
3. **Drain for the train.** When a train has been queued for 10 min or more,
   orchestrators stop marking drafts ready, adding `run-ci`, and pushing to
   READY PRs (each starts a full tier), so the train gets runners. Fast-tier
   draft work continues.
4. **Announce.** Post `TRAIN <sha> queued|running|green|red` on the bus, by
   whoever sees it first, and `BATCH OPEN` / `BATCH CLOSED` around a window.
5. **Dispatch.** If a train has been queued for 30 min or more with runners
   drained, Fleet A's orchestrator dispatches `pages.yml` once, never twice;
   anyone else needs Bryce's yes. Fleet D never dispatches or re-runs
   workflows.
6. **Tooling.** A follow-up makes `merge-gate.mjs` pacing refuse while a
   `pages.yml` run is queued or in progress (Fleet A).

Rule 7 replaces the HEALTHY/JAMMED batching in rule 3 where they differ: the
JAMMED "merge into the pending train" is what starved Pages tonight.

## Messaging

A↔D messages go over the agent webhook (`APEX_AGENT_WEBHOOK_URL`). Use
the `agent-msg.mjs` helper once #3518 lands; it mirrors each message to the bus.
Until then, use curl with the same JSON shape plus a bus HANDOFF mirror. The
webhook carries no authority: a grant must be typed by Bryce in the acting
session.

## 8. Merge attribution

Every agent and Bryce merge as `brycejmurrin`, so on 2026-10-22 six PRs (#3504
#3517 #3519 #3550 #3526 #3548) merged during a train freeze and nobody could say
who. Bryce's choice (typed in OrchA 23): label the merge itself, and flag the
unlabelled ones on the bus **and** the PR.

- **Trailer.** `merge-gate.mjs` prints the exact merge call on a pass, and
  `--json` carries it in `merge` (`merge_method`, `expectedHeadSha`,
  `commit_title`, `commit_message`). Pass `commit_title` and `commit_message`
  verbatim to `merge_pull_request`; nobody types the trailer. The message is the
  PR title, then `Merged-by: <host>:<session or agent id> (<fleet>/<role>)` and
  `Gate: merge-gate <head sha, 12>`. Identity is `--as`, `APEX_FLEET_AS` or the
  session env (`fleet-bus.mjs whoAmI`; none resolves to `unknown:unidentified`).
  Fleet comes from the PR's fleet block (`--fleet` / `APEX_FLEET` override), role
  from `--role` / `APEX_FLEET_ROLE` (default `orchestrator`).
  GitHub's `commit_message` field is the extra detail of the merge commit
  (https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request).
- **Detector.** `node tools/ci/merge-attribution.mjs [--range A..B] [--dry-run]`
  reads first-parent merge commits and prints `ATTRIBUTED` (has `Merged-by:`) or
  `UNATTRIBUTED`. An unattributed merge is presumed to be a Bryce UI merge unless
  he says otherwise. Each gets one `HANDOFF` bus line (never `INCIDENT`) and one
  PR comment, "merged without attribution: Bryce UI merge, or an agent? reply
  here if it was you". It never pauses or freezes anything. Idempotent: the
  comment carries a `merge-attribution:<sha12>` marker and the bus line names the
  sha, so a second run posts neither. Without `--range` it reads from a cursor in
  `artifacts/merge-attribution/cursor`, else the last 20 merges.
- **Wiring.** `.github/workflows/merge-attribution.yml` runs it on every push to
  the deploy branch with `pull-requests: write` only, so it posts the PR comment
  (`--no-bus`): a bus line needs a push to `claude/fleet-bus`, i.e.
  `contents: write`, which this job should not hold. A session that runs the tool
  by hand (or in the bus watch tick) posts the bus line too. Chosen over the
  hourly bus-watch prompt because it reacts within seconds of the merge, costs no
  session tokens and needs no live session.

