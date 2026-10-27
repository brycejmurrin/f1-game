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

The pre-push floor is stated once, in `AGENTS.md` rule 3. The full tiers run on
the PR: `run-ci` on a draft gives the fast tier (its `Structural guards` A–D
run the full `tooling-fast`, and that check is what `ready-gate` reads), the
full tier runs once the PR is ready, and `land.yml`'s `gate` check judges the
merge result. A worker ends its turn at `land` ([WORKERS.md](WORKERS.md) §5).

What the two optional rungs above the floor mean (background tasks, never a
foreground step):

```sh
npm run test:tooling-fast           # the whole structural rung; a green run writes the stamp ready-gate also accepts
node tools/ci/deploy.mjs --gate-only   # the deploy's node half; reproduces a gate-only red; never pushes
```

## Docs and skill changes

For prose-only changes under `docs/`, `.claude/skills/`, `.claude/agents/`,
or other Markdown paths, use:

```sh
node --test tests/unit/docs-integrity.test.mjs tests/unit/agent-config.test.mjs
```

Run `npm run gen:check` when a generated reader or a tool `@doc` header changed.

## CI and Pages

PR CI validates the PR head; the deploy branch requires one check, `gate`,
whose ci row requires `CI` green on the head. A draft starts no CI without the `run-ci` label (`= ci none`). A deploy-branch push starts the Pages release train;
there is no separate ship-push CI run. Pages runs the reusable CI release gate
against its selected `before_sha` and publishes the staged artifact.
A green PR is not proof that Pages is live; verify live `version.json`
and the apex SHA with `deploy-research` after Pages succeeds.

For failure triage, use the tool `node tools/ci/ci-watch.mjs --sha <head>` and agent
`ci-red-triage`; do not infer a verdict
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
- [WORKERS.md](WORKERS.md) — the worker floor, `land`, and where a session ends.
- [TESTING.md](TESTING.md) — test groups and the per-file catalog.
- [ARCHITECTURE-MAP.md](ARCHITECTURE-MAP.md) — where verification tools fit.
- [AGENT-SURFACE.md](AGENT-SURFACE.md) — CLI and MCP ownership.
- [PREPUSH-GATE-LADDER.md](notes/PREPUSH-GATE-LADDER.md) — measured gate evidence.
