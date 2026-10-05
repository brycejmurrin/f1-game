# Merge with the deploy branch and ship (folded from the deploy-merge skill)

Deploy branch: `claude/f1-game-project-26h3ng` (`pages.yml` →
https://brycejmurrin.github.io/f1-game/). Other sessions push there mid-hour.
Never force-push. Never rebase published history. Never push without review.

**The protocol is one command:**

```sh
node tools/ci/deploy.mjs --plan   # fetch, show their commits / ours / conflicts / touched circuits — runs nothing
node tools/ci/deploy.mjs          # fetch → merge → gate → push HEAD:<deploy> — REFUSED (branch protection, GH006): use --pr
node tools/ci/deploy.mjs --gate-only  # the same gate, pushes nothing (the pre-push check)
node tools/ci/deploy.mjs --pr     # same checks, then push the session branch and open/update a PR into the deploy branch
```

Current behaviour (detail in `bump.md` and `pages.yml`):

1. **No union re-bump.** `pages.yml` stamps the shell generation while staging;
   committed tags stay `?v=dev`. `deploy.mjs` resolves generated-file conflicts
   it can re-derive. Pinned by `tests/unit/deploy-stamp.test.mjs`.
2. **Sweeps only when the union can move geometry.** `deploy.mjs` runs
   `test:sweeps` when the merged union touches geometry (`--plan` prints which);
   `verify-track` runs for touched circuits either way.
3. **No tinyfish live check.** `pages.yml`'s `verify-live` job polls the Pages
   CDN; from a session use the host fetch tool or `curl` — never the in-repo
   wrapper.
4. **`--pr` is the path that lands work** — the deploy branch is protected (a PR
   with the twelve fast-tier checks green; admin tokens bypass). Auto-merge is
   attempted; if it does not arm, merge the PR yourself once CI is green.

`deploy.mjs` refuses a dirty tree, loadavg ≥ 3, a live Playwright run, and any
conflict outside the generated files it can re-derive (`index.html`, `version.json`, ratchets, …). Everything below is the manual
equivalent, kept for when the tool itself is what broke.

## Protocol (commands and sharp edges)

```sh
git fetch origin claude/f1-game-project-26h3ng
git log --oneline HEAD..origin/claude/f1-game-project-26h3ng   # their new work
git merge-base --is-ancestor origin/claude/f1-game-project-26h3ng HEAD \
  && echo "already contains deploy — push will fast-forward"
```

### Union verification

- `npm run test:tooling-fast` — always.
- `npm run test:sweeps` — when EITHER side touched what the fleet build reads
  (`tools/ci/geometry-paths.mjs`, derived from `TRACK_VM`). Per-circuit clip/float/coplanar baselines are exact in BOTH
  directions; geometry green on each lineage alone can be red on their union.
- A grown count needs `node tools/track/coplanar-audit.cjs <id>` and a dated note in
  the test file before the baseline moves.
- A shrunk count means the baseline must come DOWN (the anti-staleness
  assertion fails a cap above the measured count).

### Push and live check

```sh
git push origin HEAD:claude/f1-game-project-26h3ng   # REFUSED (GH006): land through `deploy.mjs --pr`
```

Live `version.json`: subagent **deploy-research**, or
`https://brycejmurrin.github.io/f1-game/version.json` via MCP fetch / WebFetch —
or `curl`, which reaches github.io from this container. For "is MY commit
live?" curl is the only option that works, because the answer is a `<meta
name="apex-sha">` in the shell and the fetch tool drops every meta tag:
`curl -sS <site>/index.html | grep -oE '<meta name="apex-sha"[^>]*>'`. Pages runs take up to ~25 min. A NEWER push to the
deploy branch CANCELS the pending run (concurrency group) —
`gh run list --workflow pages.yml` when a build seems missing. A user reporting
a just-fixed bug is usually on the previous build: check live version FIRST.

### Sharp edges

- A PR into the deploy branch does NOT deploy until merged; a push there
  gets ci.yml's fast tier and, if green, pokes `pages.yml`.
- After the deploy lands, clients may need one reload for the service worker to
  drop the old shell (`pwa-cache-service-worker`).
- If `git push` is rejected (non-fast-forward), a session landed while you
  verified — fetch and start again; do NOT `--force`.
