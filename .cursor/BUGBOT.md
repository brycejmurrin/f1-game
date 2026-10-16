# Apex 26 — Bugbot review rules

Short, concrete gates for PR review. Prefer **blocking** only when the change
violates a hard repo contract; use **non-blocking** for missing evidence that
can still ship with an explicit "not run" note.

## Merge & CI ops (blocking)

- Only Merge Desk arms auto-merge, **MERGE (merge commit) only**, on ready
  tip-green PRs (squash retired 2026-10-13, AGENTS.md §Concurrent PRs).
  Agents, sessions and tools never arm or merge. Flag advice that recommends a
  squash or rebase merge, or an agent arming auto-merge itself. Do not
  suggest rewriting history on shared topic or deploy branches (sync by
  merging origin/ship; never rebase or force-push).
- Never dual-dispatch Pages, and never cancel another session's CI to free
  slots. Flag suggestions to re-run or cancel siblings for capacity.
- The only veto is a PR-body line starting `MERGE-HOLD:`. "do not merge"
  wording and the launch line `Do not enable auto-merge or merge.` are not
  vetoes — do not block Merge Desk's MERGE auto-merge for them. Flag any
  SQUASH/REBASE auto-merge arm.

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
