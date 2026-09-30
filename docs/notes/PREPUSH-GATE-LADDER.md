# The pre-push gate is a ladder, and the rungs are not the same size

Evidence behind AGENTS.md rule 3. Written 2026-09-18, after the third deploy to
go red on the same shape.

## The shape

Three commands are all called "the gate" in conversation, and each is a strict
subset of the next:

`node tools/gen/gen-ladder-figures.mjs --table` prints the table (command,
unit files it runs, how many it leaves out, when it runs), measured from
`tests/groups.json`, `tests/unit/` and ci.yml's "Pure-node unit suites" step.
The sizes are not committed: every PR that added a test file changed the same
digits, so any two such PRs conflicted on this block and on four other docs.

The files the whole gate leaves out are the per-circuit geometry sweeps (`tests/unit/docs-integrity.test.mjs` checks the ladder's shape: guards < tooling-fast < gate <= disk). `ci.yml` gives
those their own jobs rather than putting them in the "Pure-node unit suites"
step the gate derives from, and deploy.mjs's header is explicit that sweeps are
CI's — running them in the deploy duplicated ten minutes. They are enumerated in
`tests/unit/prepush-gate-coverage.test.mjs`'s `SWEEPS_ONLY` map.

`tooling-fast` being a subset is deliberate: it is tuned for an edit loop, and
the files it leaves out cost about 7.5 minutes serial on this box
(`game-vm-a` 137 s, `game-vm-b` 99 s, `node-slow` 85 s, `sweeps-parts` 54 s,
`garage-unit` 47 s are 95 % of it). The problem was never the split. The problem
was that nothing said the split existed, so "tooling-fast is green" got read as
"the gate is green".

## The three incidents

**2026-09-02, runs 1888/1889.** Two deploys went red on pins tooling-fast never
runs. The cure was `gateNodeSuites()` in deploy.mjs — derive the Pages gate's
node half from `ci.yml` at runtime, so the deploy runs exactly what the gate
runs and the two lists cannot drift.

**2026-09-10.** Six files sat in `test:garage-unit` / `test:steering-unit`,
which at the time ran in NO job at all. Fixed by hand-adding them to the
tooling-fast list; the comment recording it is still at the top of
`TOOLING_FAST_FILES`.

**2026-09-18.** `tests/unit/quali-persist.test.mjs` pins `setPaused`'s teardown
as an exact source line:

```js
assert.match(GAME, /if \(!p\) \{ closeLightTuner\(false\); closeCamTuner\(false\); exitPhotoMode\(\); \}/);
```

A fourth live-preview panel (the flyby shot editor) had to join that line, which
broke the pin. `test:tooling-fast` passed 204/206. The break surfaced only when
`deploy.mjs` reached its `test:state-unit` leg — by which point the session had
already pushed once and had to fix forward.

All three are one shape: **a source edit trips a pin in a file the pre-push
command does not execute.** Note that the pin itself is good — that line is
exactly where a new panel gets forgotten, which is why the fix was to teach the
assertion about the fourth closer rather than to loosen it.

## What now exists

- `deploy.mjs --gate-only` runs the gate and pushes nothing. It reuses the same
  code path `main()` uses, so it cannot drift from what a deploy verifies. It
  deliberately does **not** refuse a dirty tree — gating your working tree is
  the whole point — while keeping the loadavg and live-Playwright refusals,
  which are about whether a verdict means anything.
- `tests/unit/prepush-gate-coverage.test.mjs` asserts every unit file is either
  run by that gate or named in `SWEEPS_ONLY` with the CI job that does run it,
  and that the exemption list has no stale entries. It caught itself on its
  first run, which is the correct first result.

`test-coverage-audit` already asked "is this file in some topical group?". That
is a different question, and a file can pass it while nothing runs the file
before a push. This asks the second question.

## The figures left the tree (2026-09-30)

First the figures in this table were generated and committed; then two PRs that
each added a unit file regenerated them identically, merged cleanly and left the
union a file short (14 of 15 deploy-branch reds on 2026-09-29); then every two
such PRs conflicted on the same digits instead. No committed number survives
that traffic, so none is committed: `node tools/gen/gen-ladder-figures.mjs`
(`--table`, `--json`) measures the ladder, session-start prints its line, and
`docs-integrity` checks the shape (guards < tooling-fast < gate <= disk) and
that no doc quotes a size again.

## The open edge

`SWEEPS_ONLY` is not a free pass. Those CI jobs are **conditional** — on the
deploy-branch pushes sampled on 2026-09-18, "Per-circuit geometry sweeps" was
`skipped`. A pin in one of those files can therefore sit red for a while. If
one starts breaking on source edits the way quali-persist did, move it into a
gate group rather than widening the list.
