---
name: check-changes
description: Use when the user asks did I break anything, run the right tests, validate changes, ready to push, pre-commit/pre-push checks, test selection for touched files, verify track edits, or confirm cache bump before shipping Apex 26 changes.
---

# Validate changes before committing/pushing

The suite is ~40 minutes of software rendering, so running everything for every
change is not a plan. Which groups a change needs is mechanical — **ask, do not
guess or hand-maintain a second copy of the map**:

```sh
git status --short && git diff --stat     # look at the diff first
node tools/pick-tests.mjs                 # -> the groups this change needs
node tools/pick-tests.mjs --staged        # -> groups for staged files only
node tools/pick-tests.mjs --bg            # -> a ready-to-paste background command
```

The routing rules live in `RULES` at the top of `tools/pick-tests.mjs`. If a
change is not routed anywhere, that is a missing rule — add it there rather than
working around it here; `tests/test-groups.test.mjs` fails if a source directory
routes to nothing.

## Run them in the background (do not sit and wait)

A foreground run blocks for minutes and prints nothing actionable. Always:

```sh
pgrep -cf pw-browsers; cat /proc/loadavg   # expect 0 browsers, load < ~3
node tools/test-bg.mjs <group> [group...]  # starts, returns immediately
# Arm a monitor / read the log later — do not poll in a loop
node tools/test-bg.mjs --status
node tools/test-bg.mjs --stop              # kill the process GROUP if needed
```

**One heavy group is full capacity on 4 cores.** `test-bg` refuses oversubscribe
batches; timeouts with no assertion failures usually mean contention — re-run
that group alone. Do not edit `js/`/`css/` while a run serves this tree (use a
worktree). Failures carry `apex-state`, `apex-logs`, `page-console` in the log.

## Escalation order

| Step | Command | Why |
|---|---|---|
| 1 | `npm run test:tiny` | page loads, `__apex` responds. If red, nothing else is worth running |
| 2 | `npm run test:tooling-fast` | ~4 s: load order, docs integrity, test groups, api contracts, validators — **enough for most edits** |
| 3 | `node tools/verify-track.cjs <id>` | any track edit — 2 s, no browser, catches a build THROW that strands the game on the menu |
| 4 | the groups `pick-tests` named | in the background, per above |
| 5 | `npm run test:sweeps` | before pushing, if geometry moved (full-fleet, slow) |

Reserve **`npm run test:tooling` + `npm run test:smoke`** for load-order /
`index.html` / core-module changes (see Universal guards below) — not every diff.

## Universal guards (always, before push)

1. **Build guard for any track touched** — must print `OK <id>: ...`
   (`FAIL <id>: <msg>` means the game would strand on the menu — non-negotiable):
   ```sh
   node tools/verify-track.cjs <id>     # one circuit
   node tools/verify-track.cjs --all    # all 40 (js/track/* engine edits)
   ```
2. **Cache version bumped — BOTH files?** If you changed any `js/*.js` or
   `css/*.css`, the `?v=N` in `index.html` must be incremented AND
   `version.json`'s `build` must equal the same N (it force-reloads stale
   installed PWAs — see the `bump-cache` skill):
   ```sh
   grep -o '?v=[0-9]\+' index.html | sort -u && cat version.json
   # exactly ONE ?v= line, and version.json build == that N
   ```
   Forgetting this ships a change users never see (stale CDN/browser cache).
3. **Smoke + load order** if you touched load order, `index.html`, or a core
   module (`index.html` script tags must match `tools/manifest.cjs`):
   ```sh
   npm run test:tooling && npm run test:smoke
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
