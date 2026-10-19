---
name: archive-only-after-bryce-done
description: "Don't archive a session on its own DONE line — Bryce may be talking to it directly"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 0be09eb6-e479-5f89-bbda-c9c821636828
  modified: 2026-10-19T08:56:55.345Z
---

2026-10-19: ORCH7 archived CURSOR-API probe 2 after its DONE report; Bryce: "Wait cursor2 was running on something for me unarchive it and resume".

**Why:** Bryce talks to fleet sessions directly; a DONE line to the orchestrator doesn't mean his own asks to that session are finished, and its transcript showed it still running a command.

**How to apply:** archive only sessions the handoff lists for archive after a merge, or after asking Bryce. Sessions he launched or talks to (probes, AGENT-EFF, SHOTS) stay up until he says so. Related: [[orchestrator-may-spawn-sessions]].
