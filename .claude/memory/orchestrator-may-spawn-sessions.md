---
name: orchestrator-may-spawn-sessions
description: "Bryce lets the orchestrator create sibling sessions freely during fleet work, and wants to be told each time"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 5029a67b-4578-5eae-9363-553a43ad2acb
  modified: 2026-10-15T07:35:20.317Z
---

During multi-session campaigns (e.g. the 52-circuit track survey, 2026-10-15), Bryce said "Yes I want new sessions when needed" and later "Create sessions as you want".

**Why:** he wants the fleet to keep moving without asking per launch; he still occasionally denies a single launch at the tool prompt (respect that and do not retry it until he re-authorises).

On 2026-10-15 he also said worker sessions should open their own DRAFT PRs, subscribe (`subscribe_pr_activity`) and monitor/drive CI themselves. Sessions reject relayed authority, so quote his exact words and timestamp in the brief. Put this in the launch brief from the start next time.

**How to apply:** launch fix/engine/survey sessions without asking, then tell him which ones and why in one line each. Survey images go to `track-survey-assets` ([[pr-auto-merge]] rules still apply to merges).
