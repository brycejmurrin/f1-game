# Verification and gate ladder

This is the current command reference for validating a change. `AGENTS.md` owns
the rules; this page keeps command meanings in one place so skills and plans do
not grow competing copies.

## Local edit loop

Run the selector first when the diff is known:

```sh
node tools/ci/pick-tests.mjs
node tools/ci/verify-change.mjs --plan --json
node tools/ci/verify-change.mjs --fast --json
```

`verify-change --fast` selects tooling files owned by the diff and reports the
estimated worker and critical-path budget. The direct equivalent is:

```sh
node tools/ci/tooling-fast.mjs --changed --jobs=3
```

A green fast result is evidence for the changed slice, not evidence that the
deploy gate will pass.

## Before a code push

After all edits, run the full structural floor and the groups named by
`pick-tests`:

```sh
npm run test:tooling-fast
node tools/ci/pick-tests.mjs
node tools/ci/deploy.mjs --gate-only
```

`deploy.mjs --gate-only` is the authoritative local pre-push check. It runs the
same node and sweep coverage used by the deploy protocol and never pushes.

## Docs and skill changes

For prose-only changes under `docs/`, `.claude/skills/`, `.claude/agents/`,
or other Markdown paths, use:

```sh
node --test tests/unit/docs-integrity.test.mjs tests/unit/agent-config.test.mjs
```

Run `npm run gen:check` when a generated reader or a tool `@doc` header changed.

## CI and Pages

PR CI validates the PR head. A deploy-branch push starts the Pages release train;
there is no separate ship-push CI run. Pages runs the reusable CI release gate
against its selected `before_sha` and publishes the staged artifact.
A green PR is not proof that Pages is live; verify live `version.json`
and the apex SHA with `deploy-research` after Pages succeeds.

For failure triage, use `ci-watch` and `ci-red-triage`; do not infer a verdict
from a running job with zero failures or from a cancelled superseded run.

## Routine status reporting

`node tools/ci/session-status.mjs --summary` returns a bounded snapshot: branch,
push/dirty/live-run state, inventory counts, and up to three failed or unresolved
log examples. Omitted details remain available in the full default Markdown or
with `--json`; `--json` takes precedence over `--summary` and returns full data.
Add `--pr <n>` when live PR/CI evidence is needed. The local log counts describe
historical files, not verification of the current commit; unknown states stay
unknown and the ready gate is not evaluated by this command.

## Related readers

- [AGENTS.md](../AGENTS.md) — binding rules and the full ladder.
- [TESTING.md](TESTING.md) — test groups and the per-file catalog.
- [ARCHITECTURE-MAP.md](ARCHITECTURE-MAP.md) — where verification tools fit.
- [AGENT-SURFACE.md](AGENT-SURFACE.md) — CLI and MCP ownership.
- [PREPUSH-GATE-LADDER.md](notes/PREPUSH-GATE-LADDER.md) — measured gate evidence.
