---
name: merge-fast-verify-on-ci
description: "For CI/tooling fixes the user wants the PR opened and merged at once and verified by CI afterwards, not held for the local gate"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 6badff43-e599-56e5-9f28-9dce5331b039
  modified: 2026-09-29T23:32:07.981Z
---

On 2026-09-29 the user asked to "create and merge asap so we can resume all other flows" and then "just merge it asap then test" while the local `deploy.mjs --gate-only` was still running.

**Why:** a jammed Actions queue was blocking every other session's PR; the user values unblocking the fleet over a serial local verdict when the change is CI/tooling only and the pinned unit tests already passed.
**How to apply:** for workflow/tooling-only changes, run the fast unit pins locally, open the PR ready (not draft), merge when asked, then watch the deploy-branch fast tier and the train and fix forward on red. Still never widen this to js/ or physics changes without the gate. See [[small-steps-for-api-analysis]].
