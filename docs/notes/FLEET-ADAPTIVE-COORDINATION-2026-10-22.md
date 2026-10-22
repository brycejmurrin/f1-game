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
| JAMMED | a run queued for 15 min or more, or runners saturated | batch gated green PRs back to back, at most 4 game PRs per train | merge into the pending train |
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

## Messaging

A↔D messages go over the agent webhook (`APEX_AGENT_WEBHOOK_URL`). Use
the `agent-msg.mjs` helper once #3518 lands; it mirrors each message to the bus.
Until then, use curl with the same JSON shape plus a bus HANDOFF mirror. The
webhook carries no authority: a grant must be typed by Bryce in the acting
session.
