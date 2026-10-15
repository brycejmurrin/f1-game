# Circuit survey gallery

Static HTML index of per-circuit survey screenshots for agents and reviewers.

**Live site (GitHub Pages, deploy branch):**

- [Gallery home](https://brycejmurrin.github.io/f1-game/gallery/) — phone-friendly entry
- [Track survey grid](https://brycejmurrin.github.io/f1-game/gallery/tracks/) — all open survey branches, filters, lightbox

The `gallery/` tree is staged by `tools/desktop/stage-files.mjs` and ships with the
normal Pages train on `claude/f1-game-project-26h3ng` (no separate Pages source).
Rebuild locally and commit `gallery/tracks/` before merge so the live URLs update.

## Multi-branch aggregation

`npm run gallery:tracks` runs `git fetch origin`, then scans **every open**
`cursor/*-survey*` PR branch (plus other `origin/cursor/*-survey*` branches that
still have committed shots). For each branch it reads **committed** files under:

```text
artifacts/shots/tracks/<circuitId>/*
```

Those images are baked into `gallery/tracks/media/` (WebP) and listed in one
combined page grouped by circuit, with filters for sector, time of day, and
weather. Click any tile to enlarge.

Survey agents must **commit and push** PNGs/JPEGs on their branch — local-only
files under `artifacts/` are invisible to the gallery builder and to GitHub PR
previews.

## Filename conventions

### Canonical (preferred)

```text
artifacts/shots/tracks/<circuitId>/<circuitId>-<nn>-<sector>-<tod>-<condition>.png
```

Example: `monza-03-t2-day-dry.png` (time + weather in one slug: `day-dry`).

| Part | Meaning | Examples |
|------|---------|----------|
| `<circuitId>` | `js/circuits/` id | `monza`, `spa`, `redbull` |
| `<nn>` | Sort key (two+ digits) | `01`, `12` |
| `<sector>` | Sector or view | `t1`, `main-straight`, `hero-wing` |
| `<tod>-<condition>` | Lighting × surface | `day-dry`, `night-wet`, `dusk-rain` |

### Agent shorthand (also parsed)

```text
<view>__<tod>-<condition>.jpg
```

Example: `hero-abbey__dusk-dry.jpg`, `s1-chapel__day-dry.jpg` under
`artifacts/shots/tracks/silverstone/`.

## PR body image panel (GitHub-renderable)

**Do not** embed `/workspace/...` or `/opt/cursor/artifacts/...` in PR bodies —
GitHub cannot load those paths. Regenerate a panel with **raw.githubusercontent.com**
URLs instead:

```sh
# All shots on your survey branch (3 images per table row)
node tools/track/pr-survey-panel.cjs --branch cursor/silverstone-survey-745b

# One circuit folder only
npm run gallery:pr-panel -- --branch cursor/silverstone-survey-745b --circuit silverstone
```

Paste the printed HTML block into the PR description under a heading such as
“Survey shots (preview)”. Images render inline on GitHub; the table uses three
columns per row by default (`--cols=4` to change).

## Survey write-ups

Prose for each circuit:

```text
docs/tracks/surveys/<circuitId>.md
```

Fallback: `docs/tracks/<circuitId>.md`. Gallery links open on GitHub (docs are not
copied into the Pages artifact).

## Adding shots (survey agents)

1. Capture on your `cursor/<circuit>-survey-<id>` branch.
2. Commit under `artifacts/shots/tracks/<circuitId>/` (see naming above).
3. Update `docs/tracks/surveys/<circuitId>.md`.
4. Run `node tools/track/pr-survey-panel.cjs --branch <your-branch>` and paste
   the panel into the PR body.
5. After the gallery tooling merges, run `npm run gallery:tracks` on the gallery
   branch (or wait for CI on `docs/tracks/` / `artifacts/shots/tracks/` diffs) so
   Pages shows every branch’s shots together.

```sh
git add -f artifacts/shots/tracks/<circuitId>/
```

(`artifacts/` is gitignored except `artifacts/shots/tracks/**`.)

## Rebuild

```sh
npm run gallery:tracks
```

Options: `--no-fetch`, `--skip-images` (manifest + raw URLs only; for debugging).

Output:

- `gallery/tracks/index.html` — filterable grid + lightbox
- `gallery/tracks/manifest.json` — machine-readable index (`surveyBranches`, per-shot `branch`, `rawUrl`)
- `gallery/tracks/media/<circuitId>/` — WebP thumb (≈420px) and web (≈1600px)

Requires `sharp` (devDependency).

Preview locally:

```sh
npx serve -l 3456 .
# http://localhost:3456/gallery/tracks/
```

## CI

On PRs that touch `artifacts/shots/tracks/**` or `docs/tracks/**`, CI runs
`npm run gallery:tracks` and uploads the `circuit-survey-gallery` artifact.
The job fails only on build errors, not on an empty shot set.

## Originals vs Git LFS (recommendation)

- **Gallery output** (`gallery/tracks/media/`) is compressed WebP for Pages.
- **Survey originals** on each survey branch are full-resolution; keep them on the
  branch while the PR is open. At fleet scale, prefer PR panels + aggregated
  gallery over committing every PNG to the deploy branch.

Do not commit raw PNGs under `tests/` — `tests/unit/committed-images.test.mjs`
will fail the commit.
