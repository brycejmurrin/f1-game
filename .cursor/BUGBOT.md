# Apex 26 — Bugbot review rules

Short, concrete gates for PR review. Prefer **blocking** only when the change
violates a hard repo contract; use **non-blocking** for missing evidence that
can still ship with an explicit "not run" note.

## Merge & CI ops (blocking)

Read the reviewed checkout's [AGENTS.md](../AGENTS.md),
[fleet-core](../.claude/rules/fleet-core.md), and
[merge authority](../.claude/skills/agent-fleet/references/role-merge-holder.md)
before reviewing merge authorization, readiness, queue or CI operations.
Evaluate advice against those owners and the actual user grant. This review
adapter adds no permission and keeps no independent role, cap or queue rule.
Cite the canonical rule and concrete conflicting action in a finding.

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
