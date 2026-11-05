---
name: ship
description: "Use when the user types /ship: push the branch, open the draft PR, mark it ready or land it. Not for: a red PR → steward; picking tests → check-changes."
disable-model-invocation: true
---

# /ship — the user's verb for "push this and land it"

Load skill `steward` and run §Open (branch and draft PR) or §Land (ready state and `/apex merge` request). The
user's "ship" is the grant to push and open or update the PR, never to merge or arm.
