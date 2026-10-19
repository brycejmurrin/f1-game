---
name: worker-model-by-task
description: "Bryce 2026-10-19 — the orchestrator picks Opus or Sonnet per worker by the task (standard); replaces sessions-run-sonnet"
metadata:
  type: feedback
---

Bryce, 2026-10-19: "decide which workers should be opus or subnet based on the issue. Make this standard."
This replaces the 2026-10-16 all-Sonnet rule.

**Why:** Sonnet is cheaper for scoped work; Opus earns its cost where judgement fails cheaply on Sonnet (look and design calls, unexplained reds).

**How to apply:** every `create_session`, and every fresh-session scheduled task, names its model, and the launch prompt says why in one line (`MODEL: <id> — <reason>`). The table is `.claude/skills/agent-fleet/references/launch-policy.md` §Model by task:
- `claude-opus-5-5` for a design or look call, a rework of a rejected approach, a red with no known cause, or a change in physics, renderer or `js/game.js`.
- `claude-sonnet-5-5` for everything else: port a known fix, sync, one screen's CSS, tests, docs, babysitting a PR. A Sonnet worker that finds the task is really Opus-shaped escalates instead of grinding.
- Never Fable for workers. Orchestrator sessions Bryce opens himself keep the model he chose.

See [[orchestrator-may-spawn-sessions]].
