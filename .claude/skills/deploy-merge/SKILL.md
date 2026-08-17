---
name: deploy-merge
description: Use when merging the deploy branch (claude/f1-game-project-26h3ng) into a working branch, pushing work to the deploy branch, fast-forwarding a deploy, or resolving cross-lineage cache versions or geometry baseline conflicts. For live vs local version.json liveness use deploy-research or mcp-probe deploy-check — this skill is the git/merge/push protocol.
---

# Merge with the deploy branch and ship

The deploy branch is `claude/f1-game-project-26h3ng` — `pages.yml` fires only
there and ships to https://brycejmurrin.github.io/f1-game/. OTHER SESSIONS
develop directly on it, sometimes pushing mid-hour, so treat it as a moving
trunk: every step below exists because skipping it broke a real deploy.

## The protocol

1. **Fetch and look before merging.**

```sh
git fetch origin claude/f1-game-project-26h3ng
git log --oneline HEAD..origin/claude/f1-game-project-26h3ng   # their new work
git merge-base --is-ancestor origin/claude/f1-game-project-26h3ng HEAD \
  && echo "already contains deploy — push will fast-forward"
```

If their new commits touch the same subsystem you changed, read them BEFORE
merging — a session on the deploy branch may have already fixed (or properly
re-fixed) the thing you re-baselined. Measured 2026-08-17: an interim
silverstone coplanar re-baseline 15→16 was obsoleted within the hour by the
deploy session's real geometry fix putting it back to 15.

2. **Merge, never force-push, never rebase published history.**
   Both-side changes are REAL conflicts: resolve by re-measuring on the merged
   tree, not by picking a side.

3. **Cache version = max(both lineages) + 1**, and only when shipped assets
   (`js/`, `css/`, `index.html` tags) changed. Tools-only or docs-only deltas
   need NO bump. The bump (`?v=N` everywhere in index.html + the same N in
   `version.json`) is the LAST edit before the final commit — see `bump-cache`.

4. **Re-verify on the UNION, in the background** (see AGENTS.md's
   no-foreground-blocking rule):
   - `npm run test:tooling-fast` — always.
   - `npm run test:sweeps` — when EITHER side touched `js/track/`,
     `js/circuits/`, or `tools/`. The per-circuit baselines (clip/float/
     coplanar) are exact in BOTH directions; geometry green on each lineage
     alone can be red on their union (measured 2026-08-14: one engine fix
     moved clip counts on 8 circuits). A grown count needs the audit tool
     (`node tools/coplanar-audit.cjs <id>`) and a dated note in the test file
     before the baseline moves; a shrunk count means the baseline must come
     DOWN (the anti-staleness assertion fails a cap above the measured count).

5. **Push.** A push of your HEAD to the deploy branch when deploy is your
   ancestor is a plain fast-forward:

```sh
git push origin HEAD:claude/f1-game-project-26h3ng
```

   Never push to deploy without the user's instruction/review.

6. **Verify the LIVE deploy** — the container proxy blocks `github.io`, so
   curl lies; use an MCP fetch (`mcp-probe` skill, or the WebFetch tool) on
   `https://brycejmurrin.github.io/f1-game/version.json` and compare to the
   pushed `version.json`. Pages runs take ~5–10 min and a NEWER push to the
   deploy branch CANCELS the pending run (concurrency group) — check
   `gh run list --workflow pages.yml` when a build seems missing. A user
   reporting a just-fixed bug is usually playing the previous build: check the
   live version FIRST, before re-opening the diagnosis.

## Sharp edges

- **PR-based flow**: a PR into the deploy branch does NOT deploy until merged;
  a direct fast-forward push deploys immediately. Know which one was asked for.
- **PWA staleness**: after the deploy lands, clients may need one reload for
  the service worker to drop the old shell (`pwa-cache-service-worker`).
- **Concurrent sessions**: if `git push` is rejected (non-fast-forward), a
  session landed while you verified — fetch and start again at step 1; do NOT
  `--force`.
