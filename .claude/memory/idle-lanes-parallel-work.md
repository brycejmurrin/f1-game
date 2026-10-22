---
name: idle-lanes-parallel-work
description: "Bryce 2026-10-22 — idle hunters/workers should run parallel work (worktrees, MCPs, subagents, web research) instead of waiting"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 214f97d1-1eec-5727-ad99-2d922168f06b
  modified: 2026-10-22T06:29:27.928Z
---

Bryce (2026-10-22 ~06:30Z, OrchA 22): "When hunters or workers are idle you can have them use worktrees, mcps, subagents and web research to do parallel work."

**Why:** lanes sit idle while CI runs or a game PR waits for the game slot; Bryce wants that time spent on the next finding.

**How to apply:** put a PARALLEL-WHEN-IDLE line in every hunter/worker launch prompt and tell live lanes once: while waiting on CI/slot, start the next angle in a linked worktree (`EnterWorktree`, never js/ css/ edits in the checkout during a live browser run), use apex-tools/apex-lsp/js-debugger MCPs, ≤ 2 read-only subagents (never a browser run in one), and web research with cited URLs. Keep resource limits from AGENTS.md rule 4 (one browser group per box, loadavg < 3). Related: [[lanes-keep-working]], [[orchestrator-tick-3min]].
