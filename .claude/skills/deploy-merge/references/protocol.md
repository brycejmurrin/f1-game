# Deploy-merge protocol (commands and sharp edges)

```sh
git fetch origin claude/f1-game-project-26h3ng
git log --oneline HEAD..origin/claude/f1-game-project-26h3ng   # their new work
git merge-base --is-ancestor origin/claude/f1-game-project-26h3ng HEAD \
  && echo "already contains deploy — push will fast-forward"
```

Measured 2026-08-17: an interim silverstone coplanar re-baseline 15→16 was
obsoleted within the hour by the deploy session's real geometry fix putting it
back to 15.

## Union verification

- `npm run test:tooling-fast` — always.
- `npm run test:sweeps` — when EITHER side touched `js/track/`, `js/circuits/`,
  or `tools/`. Per-circuit clip/float/coplanar baselines are exact in BOTH
  directions; geometry green on each lineage alone can be red on their union
  (measured 2026-08-14: one engine fix moved clip counts on 8 circuits).
- A grown count needs `node tools/coplanar-audit.cjs <id>` and a dated note in
  the test file before the baseline moves.
- A shrunk count means the baseline must come DOWN (the anti-staleness
  assertion fails a cap above the measured count).

## Push and live check

```sh
git push origin HEAD:claude/f1-game-project-26h3ng
```

Live `version.json`: subagent **deploy-research**, or
`https://brycejmurrin.github.io/f1-game/version.json` via MCP fetch / WebFetch —
not curl from this container. Pages runs take ~5–10 min. A NEWER push to the
deploy branch CANCELS the pending run (concurrency group) —
`gh run list --workflow pages.yml` when a build seems missing. A user reporting
a just-fixed bug is usually on the previous build: check live version FIRST.

## Sharp edges

- A PR into the deploy branch does NOT deploy until merged; a direct
  fast-forward push deploys immediately.
- After the deploy lands, clients may need one reload for the service worker to
  drop the old shell (`pwa-cache-service-worker`).
- If `git push` is rejected (non-fast-forward), a session landed while you
  verified — fetch and start again; do NOT `--force`.
