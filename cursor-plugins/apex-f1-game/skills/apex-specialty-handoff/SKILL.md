---
name: Apex PR hand-off
description: >-
  Use when an Apex (f1-game) Cursor agent ends its run, hands work to another
  agent, or writes its status: the PR's handoff block, labels and comments.
---
# Apex PR hand-off

The contract is `docs/WORKERS.md`; this skill restates none of it beyond the shape.

## The one hand-off
The PR body IS the report (`.github/pull_request_template.md`: Goal, Plan, Verified / Not run, Hand-off). Its last
section is the ```handoff block (`docs/WORKERS.md` §The Hand-off block):

```handoff
branch: <branch>
head: <sha>
owner: cursor:<agent id>
lane: cursor
verified: <what ran, verdict lines>
not-run: <groups the change needs that did not run, and why>
next: <the one next step>
```

Refresh it at every push. A takeover starts from this block and the Plan and reads nothing else.

## Messages
- Comments on the issue or PR are the only messages between agents. There is no bus, no priority/FYI channel and no
  orchestrator or watcher lane to report to.
- A question only Bryce can answer goes in the Hand-off `next:` line, with the options and your pick. Do not add
  `needs-decision` yourself and do not comment (WORKERS §Per vendor).
- A Cursor run stops when the draft is pushed and this block is current. You cannot set labels: put `run-ci`,
  `lane:cursor`, and `land` in `next:`. Do not subscribe. A red after your run is a later lane (WORKERS §Per vendor).
- Never merge or arm; sync = merge origin's deploy branch via `sync-pr.mjs`, never rebase or force-push.
