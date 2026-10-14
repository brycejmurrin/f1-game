# Circuit survey gallery

Static HTML index of per-circuit survey screenshots for agents and reviewers.

**Live site (GitHub Pages, deploy branch):**

- [Gallery home](https://brycejmurrin.github.io/f1-game/gallery/) — phone-friendly entry
- [Track survey grid](https://brycejmurrin.github.io/f1-game/gallery/tracks/) — filters, lightbox, circuit picker

The `gallery/` tree is staged by `tools/desktop/stage-files.mjs` and ships with the
normal Pages train on `claude/f1-game-project-26h3ng` (no separate Pages source).
Rebuild locally and commit `gallery/tracks/` before merge so the live URLs update.

## Filename convention (canonical)

Place PNG (or JPEG/WebP) files here:

```text
artifacts/shots/tracks/<circuitId>/<circuitId>-<nn>-<sector>-<weather>.png
```

| Part | Meaning | Examples |
|------|---------|----------|
| `<circuitId>` | `js/circuits/` id | `monza`, `spa`, `redbull` |
| `<nn>` | Sort key (two+ digits) | `01`, `12` |
| `<sector>` | Sector code or view | `t1`, `main-straight`, `overview`, `map` |
| `<weather>` | Lighting / weather slug | `day-dry`, `night-wet`, `dusk-rain` |

Example: `monza-03-t2-day-dry.png`.

The gallery builder (`tools/track/build-gallery.cjs`) parses this pattern first.
Other filenames (UI survey captures, `*_grid.png` contact sheets, research
stills) are ingested with documented fallbacks — see the script’s `parseShotMeta`.

## Survey write-ups

Prose for each circuit lives in:

```text
docs/tracks/surveys/<circuitId>.md
```

If that file is missing, the gallery links to `docs/tracks/<circuitId>.md` when
it exists. Links open on GitHub (docs are not copied into the Pages artifact).

## Adding shots (survey agents)

1. Capture in-game or via the survey tooling for your circuit.
2. Name files with the convention above; one folder per circuit under
   `artifacts/shots/tracks/<circuitId>/`.
3. Add or update `docs/tracks/surveys/<circuitId>.md` with findings.
4. Rebuild the gallery (below) and commit **both** the new shots (see git note)
   and the regenerated `gallery/tracks/` output.

`artifacts/` is gitignored except `artifacts/shots/tracks/**`, so survey PNGs
can be committed without pulling in other local artifact noise:

```sh
git add -f artifacts/shots/tracks/<circuitId>/
```

## Rebuild

```sh
npm run gallery:tracks
# or
node tools/track/build-gallery.cjs
```

Output:

- `gallery/tracks/index.html` — filterable grid + lightbox
- `gallery/tracks/manifest.json` — machine-readable index
- `gallery/tracks/media/<circuitId>/` — WebP thumb (≈420px) and web (≈1600px)

Requires `sharp` (devDependency). With `--skip-images`, the script copies
originals instead of resizing (useful only for dry runs).

Preview locally:

```sh
npx serve -l 3456 .
# open http://localhost:3456/gallery/tracks/
```

## Originals vs Git LFS (recommendation)

- **Gallery output** (`gallery/tracks/media/`) is compressed WebP and intended
  to stay in git — it is what Pages serves.
- **Survey originals** under `artifacts/shots/tracks/` are full-resolution PNGs
  (30–40 per circuit × 52 circuits). At scale (~1–2k images, multi‑MB each),
  committing every original will bloat clone size the way the 2026 lap-audit
  PNG burst did (`tests/unit/committed-images.test.mjs`).

**Recommended approach (no LFS in this repo unless explicitly adopted later):**

1. Commit **gallery output** after every rebuild (small WebPs).
2. Commit **originals only on the branch that owns a survey** while the PR is
   open, or attach large batches as a **GitHub Actions artifact** / PR comment
   if the PR would exceed ~50–100 MB.
3. If originals must live in git long-term, adopt **Git LFS** for
   `artifacts/shots/tracks/**` in a dedicated change (not enabled here) and
   document the `git lfs` pull requirement in this file.

Do not commit raw PNGs under `tests/` or outside the allowed paths — the
committed-images guard will fail the commit.
