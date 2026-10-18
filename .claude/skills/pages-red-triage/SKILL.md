---
name: pages-red-triage
description: "Use when pages.yml is red after merges to the deploy branch: read the nested ci job, bisect since last green Pages, separate stale generated indexes from real breakage, freeze merges until regen or fix lands."
---

# Pages deploy red — triage

Pages is a **third train** (PR CI green ≠ Pages green). Read `pages.yml` on the
deploy-branch run, not only the wrapper job name.

## Steps

1. Identify train: ship-push `ci.yml` vs `pages.yml` (`before_sha` matters).
2. Open the **nested** `ci / …` job inside Pages; grep `Expected`, `x FAIL`, `gen:check`.
3. **Stale generated files:** if failure is `agent-indexes`, `impact-map`, or
   `gen-arch-table` — prescribe **gen-regen** on a fix PR; **merge freeze** until green.
4. **Real breakage:** name the spec/assertion/lane; check whether the same job was
   already red on the previous deploy tip (`ci-red-triage` `already-red-on-base`).
5. **Bisect merges** since last green Pages (`deploy-research` / `pages-live-sha.sh`):
   which merge introduced the red?
6. Response: one fix PR + no further merges until Pages and ship CI are green again
   (Level 3 pacing: one merge per green Pages run).

Never cancel a running Pages train. Never merge on top of a red Pages tip.
