---
name: check-changes
description: Use when the user asks did I break anything, run the right tests, validate changes, ready to push, pre-commit/pre-push checks, test selection for touched files, verify track edits, or confirm cache bump before shipping Apex 26 changes.
---

# Validate changes before committing/pushing

The suite is ~40 minutes of software rendering, so running everything for every
change is not a plan. **One command composes the rest** (`pick-tests` selection,
inline `verify-track`/`graph-parity`/`tooling-fast`/`bump-cache --check`, then
`test-bg` batches with one browser group per batch):

```sh
node tools/verify-change.mjs --plan       # what this change needs (JSON)
node tools/verify-change.mjs              # fast gate + start batch 1 (background)
node tools/verify-change.mjs --wait       # drive every batch to one verdict
node tools/verify-change.mjs --fast       # no browsers
```

The pieces underneath, if you need them separately:

```sh
git status --short && git diff --stat     # look at the diff first
node tools/pick-tests.mjs                 # -> the groups this change needs
node tools/pick-tests.mjs --staged        # -> groups for staged files only
node tools/pick-tests.mjs --bg            # -> a ready-to-paste background command
```

The routing rules live in `RULES` at the top of `tools/pick-tests.mjs`. If a
change is not routed anywhere, that is a missing rule — add it there rather than
working around it here; `tests/unit/test-groups.test.mjs` fails if a source directory
routes to nothing. **One exception exists today:** `js/track/graph.js` IS routed
to a `test:<group>`, but its real correctness gate — `tools/graph-parity.cjs`,
which diffs built geometry vertex-for-vertex against a baseline ref — is a
separate tool `pick-tests` does not know about. See the Universal guards below.

## Run them in the background (do not sit and wait)

A foreground run blocks for minutes and prints nothing actionable. Always:

```sh
pgrep -cf pw-browsers; cat /proc/loadavg   # expect 0 browsers, load < ~3
node tools/test-bg.mjs <group> [group...]  # starts, returns immediately
# Arm a monitor / read the log later — do not poll in a loop
node tools/test-bg.mjs --status
node tools/test-bg.mjs --stop              # kill the process GROUP if needed
```

**One heavy group is full capacity on 4 cores.** Heavy groups: `circuit`,
`scenery`, `physics`, `behaviour`, `baseline`, `render`. **Never pair two
heavy groups** — even when `pick-tests --bg` batches alphabetically by two,
that can still oversubscribe; override with serial runs.

When a change needs several groups (e.g. circuit + scenery + ui), run **ONE at
a time**: `circuit` → wait → `scenery` → wait → `ui`. `test-bg` refuses
oversubscribe batches; timeouts with no assertion failures usually mean
contention — re-run that group alone. Do not edit `js/`/`css/` while a run
serves this tree (use a worktree). Failures carry `apex-state`, `apex-logs`,
`page-console` in the log.

## Escalation order

| Step | Command | Why |
|---|---|---|
| 1 | `node tools/test-bg.mjs tiny` | page loads, `__apex` responds. Run in background (non-blocking) |
| 2 | `npm run test:tooling-fast` | ~25 s: load order, docs integrity, test groups, api contracts, validators — **enough for most edits** |
| 3 | `node tools/verify-track.cjs <id>` | any track edit — 2 s, no browser, catches a build THROW that strands the game on the menu |
| 4 | the groups `pick-tests` named | `node tools/test-bg.mjs <groups>` in the background, per above |
| 5 | `npm run test:sweeps` | before pushing, if geometry moved (full-fleet, slow) |

Reserve **`npm run test:tooling-fast` + `node tools/test-bg.mjs smoke`** for load-order /
`index.html` / core-module changes (see Universal guards below) — not every diff.

## Universal guards (always, before push)

1. **Build guard for any track touched** — must print `OK <id>: ...`
   (`FAIL <id>: <msg>` means the game would strand on the menu — non-negotiable):
   ```sh
   node tools/verify-track.cjs <id>     # one circuit
   node tools/verify-track.cjs --all    # all 40 (js/track/* engine edits)
   ```
2. **`js/track/graph.js` edited? Also run the scene-graph parity gate —
   `pick-tests.mjs` does NOT route to it.** This is the one source directory
   whose correctness check lives entirely outside the `test:<group>` map, so
   asking `pick-tests` for a graph.js change and stopping there misses it:
   ```sh
   node tools/graph-parity.cjs --all             # baseline = HEAD by default
   BASE=<pre-change-ref> node tools/graph-parity.cjs --all   # for a migration —
     # diff the working tree's graph-based build against the ref BEFORE the
     # migration, not HEAD (which may already be mid-migration)
   ```
   Builds each track twice (a baseline ref + the working tree) and diffs the
   emitted prop geometry vertex for vertex; any mismatch is exit 1.
3. **Cache version bumped — BOTH files?** If you changed any `js/*.js` or
   `css/*.css`, the `?v=N` in `index.html` must be incremented AND
   `version.json`'s `build` must equal the same N (it force-reloads stale
   installed PWAs — see the `bump-cache` skill):
   ```sh
   grep -o '?v=[0-9]\+' index.html | sort -u && cat version.json
   # exactly ONE ?v= line, and version.json build == that N
   ```
   Forgetting this ships a change users never see (stale CDN/browser cache).
4. **Smoke + load order** if you touched load order, `index.html`, or a core
   module (`index.html` script tags must match `tools/manifest.cjs`):
   ```sh
   npm run test:tooling-fast && node tools/test-bg.mjs smoke   # test:tooling would also run the slow full-fleet sweeps (step 5)
   # docs/skills/tools edits: `npm run test:tooling-fast` covers docs-integrity
   # (dead paths, stale counts, unindexed skills/tools/docs)
   ```

## Reading failures (house rule)

When a spec fails, first decide **stale expectation vs real regression**: read the
actual `__apex` hook values the test asserts on (`physState()`, `obs()`,
`wallStats()`, `groundY()`) and check whether the assertion still matches the
intended design. Magnitude-threshold specs and the legacy
`tests/manual/blank-scan.spec.js` / pixel soft-asserts in `tracks-visual` drift;
geometry/behaviour hooks are ground truth.
Don't "fix" code to satisfy a threshold that itself went stale — fix the threshold,
or confirm the behaviour is genuinely wrong first.

## Push

Only push to the active development branch; never to `main` without review. Bump,
verify, test, then commit + `git push -u origin <branch>`.
