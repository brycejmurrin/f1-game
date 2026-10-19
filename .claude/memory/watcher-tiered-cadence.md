---
name: watcher-tiered-cadence
description: "Fleet watcher cadence Bryce wants — CI reds every 1 min, everything else every 3 min, no per-PR subscriptions"
metadata:
  node_type: memory
  type: feedback
  originSessionId: cf268317-1fb7-53ff-ab28-6cd166e5d4df
  modified: 2026-10-19T05:56:54.451Z
---

Bryce (2026-10-19): "check different things at different frequencies like ci jobs for failures more frequently like 1 min while rest at 3". Also wants a watcher always running because not every PR owner (Claude, Cursor, Codex, local agents) is live.

**Why:** a watcher subscribed to all ~18 PRs burned 220k context in 12 min (~10k tokens per event echo); owners can go quiet without anyone noticing.

**How to apply:** fleet-watch runs a background 60 s red-only loop + Monitor, a 3-min send_later tick for the rest, a full session sweep every 5th tick, and no subscribe_pr_activity. Stale non-Claude PRs (>30 min quiet, no MERGE-HOLD/NEEDS-BRYCE) get a Claude owner started by the watcher (Bryce granted 2026-10-19). Related: [[orchestrator-may-spawn-sessions]].
