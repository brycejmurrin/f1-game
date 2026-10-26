---
name: train-ratchet-standing-ok
description: Bryce 2026-10-26 standing OK — tree-metric ratchet +1..+3 caused by combining train members may be raised without a per-case ask
metadata:
  node_type: memory
  type: feedback
  originSessionId: cdbd31bf-b427-58f1-9451-6394b7052e7e
  modified: 2026-10-26T21:00:48.938Z
---

Bryce (2026-10-26 ~13:55 PT, AskUserQuestion in ORCH A session_011vDv23PCX8yBuQ1iCN92DC) gave a standing OK: when a train or wave branch trips a shrink-only TREE ratchet (e.g. `assertPins`) by +1..+3 purely from combining members, raise it with `APEX_RATCHET_RAISE_OK=1 node tools/check/ratchets.mjs --update --fragment --reason="…"` and state the reason in the commit; no per-case question.

**Why:** the per-case ask cost a full CI round on mega train W2 (#3870) for a +1 he approved anyway.

**How to apply:** only for train/wave combination effects of +1..+3 on a tree metric; a bigger raise, a raise from one member's own growth, or a FILE metric past the 20-line auto-raise still goes to Bryce. File metrics within 20 lines use `--auto-raise` as always. Related: [[orchestrator-dispatches-pages]].
