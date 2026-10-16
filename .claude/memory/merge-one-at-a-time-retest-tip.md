---
name: merge-one-at-a-time-retest-tip
description: "Desk merging: after each merge re-test the combined tip before the next; a green PR on an old base can turn the tip red (source-pin-hygiene 2026-10-16, twice)"
metadata:
  node_type: memory
  type: feedback
  originSessionId: c42d5be7-aa09-5957-9a83-7a8412e8fad0
  modified: 2026-10-16T09:40:11.262Z
---

When merging several green PRs back to back, merge ONE, then re-run the cheap tip guards (`node --test tests/unit/source-pin-hygiene.test.mjs` in a scratch worktree of origin/<deploy>) before the next. Never merge two PRs seconds apart on the strength of their own CI.

**Why:** 2026-10-16 the deploy tip went red twice on `source-pin-hygiene` (raw `game.js` read count 309 > ceiling 308): #2368 added a raw read, then after fix #2422 I merged #1545 and #2321 at once and #1545's comment text `game.js's` (the pin regex /game\.js['"]/ counts the apostrophe) re-broke it. Each PR was green on an older base. It blocked about ten PRs' Tooling-fast shard and cost ~30 min.

**How to apply:** after every merge: `git fetch`, scratch worktree at the new tip, run the pin test (about 8 s); only then merge the next. Also: the Desk may merge/flip only with a CI verdict (the classifier flags "CI Bypass" / "Merge Without Review" for relayed grants: get Bryce's direct word, see [[pr-auto-merge]]).
