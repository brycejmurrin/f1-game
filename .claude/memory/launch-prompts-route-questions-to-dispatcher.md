---
name: launch-prompts-route-questions-to-dispatcher
description: "Every session the dispatcher launches must be told to message the dispatcher, never AskUserQuestion; only the dispatcher pings Bryce"
metadata:
  node_type: memory
  type: feedback
  originSessionId: c2a1a695-b597-5520-8934-02bc51ba19e8
  modified: 2026-10-28T08:16:38.177Z
---

Bryce, 2026-10-28: when launching sessions, make clear they message the dispatcher and ONLY the dispatcher uses AskUserQuestion to get his attention.

**Why:** child sessions asking Bryce directly fragment his phone attention and stall unattended workers.

**How to apply:** put in every create_session prompt: "Do not use AskUserQuestion. Send questions, blockers and decisions to the dispatcher with send_message (session id of the dispatcher), then end your turn." The dispatcher batches them into one AskUserQuestion. Also: trigger minimum interval is 1 hour, so stagger several hourly triggers (:10, :25, :40, :55) for a ~15 min cadence. See [[workers-never-wait-for-user]], [[ask-via-askuserquestion]].
