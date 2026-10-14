---
name: merge-fast-verify-on-ci
description: "CI/tooling-only fixes may be expedited (fast unit pins, ready at tip-green) when the user asks, but the agent still never merges — CI Watch or the user does"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 6badff43-e599-56e5-9f28-9dce5331b039
  modified: 2026-10-14T04:01:50.718Z
---

On 2026-09-29 the user asked to "create and merge asap so we can resume all other flows" while the local `deploy.mjs --gate-only` was still running. On 2026-10-06 the user set the stricter rule in [[pr-auto-merge]]: agents never merge or arm auto-merge. On 2026-10-14 the user approved resolving the conflict in favour of that rule.

**Why:** a jammed Actions queue can block every other session's PR, so speed on tooling-only fixes matters — but merging belongs to CI Watch / the user.
**How to apply:** when the user asks to expedite a workflow/tooling-only change, run the fast unit pins locally, push, and mark the PR ready as soon as the tip is green and `ready-gate.mjs` exits 0 (do not wait on the full local gate); tell the user it is ready for CI Watch or for them to merge. Never merge it yourself, and never widen this to js/ or physics changes without the gate. See [[small-steps-for-api-analysis]].
