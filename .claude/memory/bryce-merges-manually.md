---
name: bryce-merges-manually
description: Bryce sometimes merges fleet PRs himself outside the merge lease/bus; orchestrator keeps pacing around it
metadata:
  node_type: memory
  type: feedback
  originSessionId: f427e0b1-5d53-5f22-bd22-9f2a4efb945c
  modified: 2026-10-19T16:40:26.530Z
---

Bryce merges PRs himself while an orchestrator holds the merge lease (2026-10-19: #2954 #2972 #2924 #3063 #2983, no bus DONE lines). Asked, he said "Yes, me — keep going".

**Why:** he drives merges from his phone when he sees a green PR; the lease binds agents, not him.
**How to apply:** a merge that shows up with no bus line is probably Bryce's. Don't hunt for a rogue session. Re-read the tip before each merge, count his game merges toward Pages pacing, and keep going. Related: [[orchestrator-dispatches-pages]].
