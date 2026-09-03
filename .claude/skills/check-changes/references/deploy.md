# Merge with the deploy branch and ship (folded from the deploy-merge skill)

Deploy branch: `claude/f1-game-project-26h3ng` (`pages.yml` →
https://brycejmurrin.github.io/f1-game/). Other sessions push there mid-hour.
Never force-push. Never rebase published history. Never push without review.

**The protocol is one command (2026-09-01):**

```sh
node tools/ci/deploy.mjs --plan   # fetch, show their commits / ours / conflicts / touched circuits — runs nothing
node tools/ci/deploy.mjs          # fetch → merge → test:tooling-fast → verify-track (touched circuits) → push HEAD:<deploy> (retry ×3)
node tools/ci/deploy.mjs --pr     # same checks, then push the session branch and open/update a PR into the deploy branch (auto-merge)
```

What changed underneath it, and why the old steps are gone:

1. **No union re-bump.** `pages.yml` stamps the shell generation while staging
   (`2000 + git rev-list --count HEAD`, `bump-cache --apply --at N --root _site`),
   so the committed `version.json` / `<meta name="apex-build">` are a consistent
   placeholder and the repo's tags read `?v=dev` (nothing to bump). Two sessions cannot
   land the same build; `index.html`/`version.json` were the only files that
   ever conflicted and `deploy.mjs` resolves them to either side + a hash-only
   `--apply`. Pinned by `tests/unit/deploy-stamp.test.mjs`.
2. **No local sweeps.** `ci.yml` runs `test:sweeps` (and the split-out
   `sweeps-parts`) on the same diff, conditionally; a local run duplicated
   10 minutes. `deploy.mjs` still runs `verify-track` for touched circuits (2 s each).
3. **No tinyfish live check.** `pages.yml`'s `verify-live` job polls the Pages
   CDN for the stamped build and fails the run if it never appears; read the
   run in the Actions tab. From a session, the host's fetch tool can read
   `version.json` — never curl from the container, never the in-repo wrapper.
4. **`--pr` is the path that never pushes to the deploy branch** (the agent
   permission classifier blocks that push). GitHub creates the merge commit,
   so the PR is a real record — a local fast-forward auto-closes the PR
   instead (#67).

`deploy.mjs` refuses a dirty tree, loadavg ≥ 3, a live Playwright run, and any
conflict outside the two shell files. Everything below is the manual
equivalent, kept for when the tool itself is what broke.

## Protocol (commands and sharp edges)

```sh
git fetch origin claude/f1-game-project-26h3ng
git log --oneline HEAD..origin/claude/f1-game-project-26h3ng   # their new work
git merge-base --is-ancestor origin/claude/f1-game-project-26h3ng HEAD \
  && echo "already contains deploy — push will fast-forward"
```

Measured 2026-08-17: an interim silverstone coplanar re-baseline 15→16 was
obsoleted within the hour by the deploy session's real geometry fix putting it
back to 15.

### Union verification

- `npm run test:tooling-fast` — always.
- `npm run test:sweeps` — when EITHER side touched `js/track/`, `js/circuits/`,
  or `tools/`. Per-circuit clip/float/coplanar baselines are exact in BOTH
  directions; geometry green on each lineage alone can be red on their union
  (measured 2026-08-14: one engine fix moved clip counts on 8 circuits).
- A grown count needs `node tools/track/coplanar-audit.cjs <id>` and a dated note in
  the test file before the baseline moves.
- A shrunk count means the baseline must come DOWN (the anti-staleness
  assertion fails a cap above the measured count).

### Push and live check

```sh
git push origin HEAD:claude/f1-game-project-26h3ng
```

Live `version.json`: subagent **deploy-research**, or
`https://brycejmurrin.github.io/f1-game/version.json` via MCP fetch / WebFetch —
not curl from this container. Pages runs take ~5–10 min. A NEWER push to the
deploy branch CANCELS the pending run (concurrency group) —
`gh run list --workflow pages.yml` when a build seems missing. A user reporting
a just-fixed bug is usually on the previous build: check live version FIRST.

### Sharp edges

- A PR into the deploy branch does NOT deploy until merged; a direct
  fast-forward push deploys immediately.
- After the deploy lands, clients may need one reload for the service worker to
  drop the old shell (`pwa-cache-service-worker`).
- If `git push` is rejected (non-fast-forward), a session landed while you
  verified — fetch and start again; do NOT `--force`.
