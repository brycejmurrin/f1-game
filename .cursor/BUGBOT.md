# Apex 26 — Bugbot review rules

Short, concrete gates for PR review. Prefer **blocking** only when the change
violates a hard repo contract; use **non-blocking** for missing evidence that
can still ship with an explicit "not run" note.

## Merge & CI ops (blocking)

- Follow `AGENTS.md` §Coordination and `docs/WORKERS.md`: GitHub lands PRs. A worker
  flips its PR ready and adds the `land` label; `land.yml` runs the `gate` check and arms
  auto-merge. No session merges, arms or waits for the merge. **MERGE (merge commit)
  only**; flag squash/rebase merges and history rewriting on shared branches. Sync by
  merging the deploy branch, never rebase or force-push; never for clean-behind.
- Never cancel another session's CI to free slots. Flag suggestions to re-run or cancel
  siblings for capacity. `pages.yml`'s concurrency group paces the release train.
- The only veto is the `hold` label; "do not merge" wording is not one.
## Hot-path evidence (blocking when absent)

Flag WebGL / physics / hot-path edits under `js/physics/`, `js/game.js`, or
`js/render/` when the PR body lacks **measured numbers** or a **named verify
command** (e.g. `npm test -- tests/specs/…`, `verify-track`, `test:tooling-fast`,
`deploy.mjs --gate-only`). Non-blocking if the body names the check as not-run
with a reason.

## Architecture contracts (blocking)

- Flag new ES modules, bundler/build steps, or framework imports (React, Vue,
  etc.). This repo is zero-dep IIFE modules + `tools/manifest.cjs` script tags.
- Flag hand-edits of generated files listed in `AGENTS.md`: `index.html`
  `@gen-shell` blocks, `version.json`, `package.json` test scripts (from
  `tests/groups.json`), `tools/README.md` (from `@doc` headers), `js/roster.js`,
  `tools/carview.html`. Edit the source and run `npm run gen`.

## Keep short

Stay under 30k characters. Prefer one clear finding over a checklist dump.
Do not invent model ids, deploy steps, or merge strategies not already in
`AGENTS.md`.
