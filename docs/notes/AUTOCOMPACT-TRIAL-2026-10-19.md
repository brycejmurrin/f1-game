# Auto-compact trial: not adopted (2026-10-19)

**Verdict:** we are not adopting auto-compact for fleet sessions, and the trial is closed. Bryce picked "Don't
adopt; close trial (Recommended)". The policy stays as it was: soft and hard context caps, plus a handoff at the soft
cap (skill `handoff`, `agent-fleet` launch policy). The orchestrator (ORCH6) relayed the decision and data on
2026-10-19. The trial branch `cursor/autocompact-trial-a7c3` (`fc6043fc`) stays unmerged, and Bryce may delete it.

## Data

| Session | Mode | Cost | Wall | Outcome |
|---|---|---:|---:|---|
| car-2 | auto-compact (trial 1) | $1.53 | 17.5 min | 3 compactions; afterwards it re-read a partial report it had already written |
| physics-2c | auto-compact (trial 2) | $3.23 | 49 min | ended at 98k of a 150k window; its `DONE` line never reached the orchestrator |
| tracks-2 | control | $1.01 | 21 min | completed |
| ui-2 | control | $0.70 | 30 min | completed |
| race-1 | control | $1.29 | 30 min | completed; overran the soft cap to 163k |

Cache writes in the trial sessions were about twice the controls'. Each compaction rewrites the prompt cache, so the
next requests pay cache-write rather than cache-read rates. See
[CLAUDE-HOST-EFFICIENCY-2026-10-19](CLAUDE-HOST-EFFICIENCY-2026-10-19.md) finding 2: cache reads dominate.

## Limits

- Not a clean A/B. Every session ran a different task, and n = 2 trial sessions.
- Costs are as reported by the orchestrator, not re-measured here.
- `tools/ci/claude-usage.mjs` can digest these sessions' transcripts if they are recovered. Any rerun needs matched
  tasks.
- A missed `DONE` is a hand-off failure, whatever the token cost. That failure decided the verdict as much as the
  cost did.
