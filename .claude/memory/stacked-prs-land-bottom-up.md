---
name: stacked-prs-land-bottom-up
description: "Landing a stack of PRs here: retarget each dependent PR by hand after its base merges, sync on ratchets.json, ready one at a time (CI Watch arms auto-merge, never the agent)"
metadata:
  node_type: memory
  type: project
  source: user, tools/ci/sync-pr.mjs
  originSessionId: d24c35f2-4501-5b72-89d0-f1ff7f97543b
  modified: 2026-10-15T08:05:00.000Z
---

As of 2026-10-02 the repo had `delete_branch_on_merge: false`, so GitHub never retargeted a stacked PR when its base PR merged: after each merge, `update_pull_request base: claude/f1-game-project-26h3ng` on the next PR, then mark it ready (the agent never arms — see [[pr-auto-merge]]). UPDATE 2026-10-15 (repo API read 07:58 UTC): `delete_branch_on_merge` is now **true**, squash merging is off, merge commits on, rebase merging still on (record: `docs/notes/CI-CLOG-SURVEY-2026-10-15.md` §8) — GitHub now retargets a stacked PR to the deploy branch itself when its base branch is deleted on merge; verify the new base with `pull_request_read get` before marking it ready rather than retargeting by hand. Expect `mergeable_state: dirty` on `tests/data/ratchets.json` whenever the deploy branch moved (other sessions merge constantly); `node tools/ci/sync-pr.mjs <branch> --push` cures it, but it refuses at loadavg ≥ 3 and stops on a generated `docs/ARCHITECTURE.md` conflict (cure by hand: base's copy, `ratchets.mjs --update`, `npm run gen`, merge-hygiene, gen-test-groups). Marking a PR ready runs the full tier (smoke groups), which is the whole-group browser verification; the required checks are the fast-tier eight. The tip churns faster than that ~12-minute run (2026-10-02: #742 went `dirty` twice while green, to ~30 and then 4 commits, always on the generated `docs/ARCHITECTURE.md` module table), so a sync merge that only carries other PRs' already-gated work is pushed after `test:guards` + the branch's own unit set and re-cured at once when it goes dirty again; the full gate belongs on the branch's own code, not on every re-sync.

**Why:** 2026-10-01 the five-PR custom track designer stack (#639→#648) landed this way in ~1 h after the user said "Auto merge"; the one surprise was the manual retarget.

**How to apply:** one PR ready at a time, bottom-up; retarget → read mergeable_state → sync if dirty → ready → watch (no arm) → on merged, next. See [[pr-auto-merge]].
