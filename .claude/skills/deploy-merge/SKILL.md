---
name: deploy-merge
description: Use when merging the deploy branch (claude/f1-game-project-26h3ng) into a working branch, pushing work to the deploy branch, fast-forwarding a deploy, or resolving cross-lineage cache versions or geometry baseline conflicts. For live vs local version.json liveness use deploy-research or mcp-probe deploy-check — this skill is the git/merge/push protocol.
---

# Merge with the deploy branch and ship

Deploy branch: `claude/f1-game-project-26h3ng` (`pages.yml` →
https://brycejmurrin.github.io/f1-game/). Other sessions push there mid-hour.
Never force-push. Never rebase published history. Never push without review.

1. **Fetch and look** before merging. If they touched the same subsystem, read
   those commits first (an interim baseline bump can be obsoleted within the hour).
2. **Merge.** Both-side changes are real conflicts — re-measure on the union.
3. **Cache** only if `js/` / `css/` / `index.html` tags changed: content hashes +
   shell generation = max(both lineages)+1, last edit before commit (`bump-cache`).
   Tools/docs-only deltas need no bump.
4. **Re-verify the UNION in the background:** `test:tooling-fast` always;
   `test:sweeps` if either side touched `js/track/`, `js/circuits/`, or `tools/`.
5. **Push** `git push origin HEAD:claude/f1-game-project-26h3ng` — a fast-forward
   when deploy is your ancestor. Rejected push → fetch and restart; do not `--force`.
6. **Live Pages** → **deploy-research** (proxy blocks github.io; curl lies).
   A newer push cancels the pending Pages run.

Commands, baseline grow/shrink rules, Pages concurrency, PWA reload →
[references/protocol.md](references/protocol.md).
