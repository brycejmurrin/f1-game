# Final fix report

## Scope

Worked only in `/Users/bmurrin/Documents/game-dev-plugin/f1-game/.worktrees/generated-output-layout`.

## Changed files

- `.claude/skills/playwright-probe/shot.mjs`
- `docs/DEBUG-HOOKS.md`
- `tools/aerial-survey.mjs`
- `tools/migrate-output-layout.mjs`
- `tools/motion-capture.mjs`
- `tools/output-paths.mjs`
- `tools/render-car.mjs`
- `tools/survey-track.mjs`

## Findings self-review

### Critical: `tools/motion-capture.mjs` default-path traversal + destructive deletion

Fixed.

- Added shared helpers in `tools/output-paths.mjs` to validate path tokens and to
  assert repo/default-path containment.
- The default motion-capture output now resolves through
  `resolveRepoDefault(ROOT, "scratch", "captures", "motion-capture", track)`,
  so `track` can no longer escape the repo default tree.
- `track` must now match a safe token format (`[A-Za-z0-9._-]`, no slashes or
  `..` traversal segments).
- Removed recursive deletion of the entire target directory.
- The tool now deletes only its own known outputs inside the chosen directory:
  `clip.webm`, `f_*.png`, and a tool-owned temp subdirectory
  `.motion-capture-video/`.
- Explicit `outdir` overrides are still honored exactly as user-supplied; only
  the default path is repo-anchored.

### Important: identifier validation + default-path containment in other tools

Fixed.

`tools/survey-track.mjs`
- Validates `track id` and `label` as safe tokens.
- Default output is anchored under
  `scratch/captures/survey-track/<id>/`.
- Per-shot filenames are resolved with a containment check so filename prefixes
  cannot escape the target directory.

`tools/aerial-survey.mjs`
- Validates `TRACK` and `label` as safe tokens.
- Default output is anchored under
  `scratch/captures/aerial-survey/<track>/`.
- Screenshot filenames are resolved with containment checks.

`.claude/skills/playwright-probe/shot.mjs`
- Validates `trackId` and `cam` as safe tokens.
- Default screenshot output is now anchored to the repository root under
  `scratch/captures/playwright-probe/`.
- Explicit `out.png` overrides are still honored unchanged.

`tools/render-car.mjs`
- Validates default-path `team` as a safe token.
- Default output remains under `scratch/renders/cars/<team>`, now enforced via
  repo-anchored containment helpers.
- Explicit `--out` semantics are preserved exactly as before (resolved relative
  to `tools/`).
- Generated child files within the chosen output directory are resolved through
  containment checks.

### Important: migration conflict handling must be strictly non-overwriting

Fixed in `tools/migrate-output-layout.mjs`.

- Removed the `renameSync()` fast path because a rename can replace an existing
  destination on a race.
- Migration now always copies first with:
  - `recursive: true`
  - `errorOnExist: true`
  - `force: false`
- Source removal happens only after a successful copy.
- If a destination appears between the availability check and the copy attempt,
  `EEXIST` is retried with the next deterministic `.legacy-N` suffix instead of
  overwriting anything.
- `--apply` was not run.

### Minor: clean-checkout debug screenshot recipe

Fixed in `docs/DEBUG-HOOKS.md`.

- The recipe now creates `artifacts/tmp/` recursively before writing
  `artifacts/tmp/t1.png`.

## Exact safety behavior

- Repo defaults are anchored with `resolveRepoDefault(...)`; escaping `scratch/`
  or `artifacts/` via default identifiers now throws.
- Child outputs that are derived from user-controlled tokens are resolved with
  `resolveContainedChild(...)`; escaping the selected directory now throws.
- Safe tokens must match `^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$`.
- Explicit output-path overrides remain authoritative:
  - `motion-capture.mjs <outdir>` still uses the caller's supplied path.
  - `shot.mjs <out.png>` still uses the caller's supplied path.
  - `render-car.mjs --out=...` still resolves exactly as before.
- `motion-capture.mjs` no longer recursively removes the chosen output
  directory. It only removes tool-owned outputs it is about to regenerate.
- Migration never overwrites an existing destination and never removes source
  data unless the copy succeeded first.

## Checks run

### Syntax

Passed:

```sh
node --check tools/output-paths.mjs
node --check tools/motion-capture.mjs
node --check tools/survey-track.mjs
node --check tools/aerial-survey.mjs
node --check .claude/skills/playwright-probe/shot.mjs
node --check tools/render-car.mjs
node --check tools/migrate-output-layout.mjs
```

### Safe source-level helper check

Passed:

```sh
node --input-type=module -e "import { assertSafePathToken, resolveContainedChild, resolveRepoDefault } from './tools/output-paths.mjs'; const root = process.cwd(); const defaultPath = resolveRepoDefault(root, 'scratch', 'captures', 'demo', 'monaco'); if (!defaultPath.startsWith(root + '/scratch/captures/demo/')) throw new Error('default path not anchored'); const child = resolveContainedChild(defaultPath, 'frame.png'); if (!child.endsWith('/frame.png')) throw new Error('child path failed'); let threw = false; try { assertSafePathToken('../oops', 'token'); } catch { threw = true; } if (!threw) throw new Error('unsafe token accepted'); console.log('helper checks passed');"
```

Output:

- `helper checks passed`

### Migration dry run

Passed:

```sh
node tools/migrate-output-layout.mjs
```

Output:

- `dry run only; rerun with --apply to move the listed directories`

### IDE diagnostics

Passed:

- `ReadLints` on all edited files reported no linter errors.

## Concerns

- Per instruction, I did not run npm, Playwright, browser, render, or migration
  apply flows, so verification is limited to syntax, static helper assertions,
  dry-run migration behavior, IDE diagnostics, and manual code review.
- The new token validation intentionally rejects path separators, `..`, spaces,
  and trailing punctuation in default-path identifiers and filename prefixes.
  That is the intended safety tradeoff for these default/generated paths.
