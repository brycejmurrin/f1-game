# Generated output directory consolidation

## Goal

Give every regenerable log, report, screenshot, gallery, profile, and render a
predictable home under either `artifacts/` or `scratch/`. Preserve shipped game
assets, tracked visual-regression baselines, concurrent Playwright isolation,
existing local output, and unrelated user changes.

## Directory contract

The producer determines the top-level directory:

```text
artifacts/
  test-results-<port>/       Playwright failures, traces, attachments, JUnit
  report-<port>/             Playwright HTML report
  logs/                      named batch and shard logs
  galleries-<port>/          screenshots and reports emitted by test suites
    <suite>/
  tmp/                       one-off batch probes and temporary files

scratch/
  captures/                  interactive camera, track, lighting, and motion work
    <tool-or-purpose>/
  renders/                   human-review car and parts render sheets
    cars/
    parts/
    aero/
  profiles/                  interactive CPU/GPU profiling captures
```

The following are not disposable generated output and do not move:

- `assets/` contains shipped game media.
- `tests/*-snapshots/` contains tracked visual-regression baselines.
- Generated source products such as `js/light-presets.js` remain in their
  runtime locations because they are committed application inputs.
- Browser exports initiated by the player remain downloads outside the
  repository.

## Test output behavior

Keep the existing port-suffixed Playwright result and report directories. A
small shared test helper will resolve gallery paths beneath
`artifacts/galleries-<APEX_PORT>/<suite>/`, using `3456` when no port is set,
create parent directories recursively, and return stable paths to callers.

All tests that currently write to `tests/ui-screenshots/`,
`tests/track-trace/`, `tests/f1-track-accuracy/`,
`tests/all-tracks-buildings/`, or the accidental
`tests/galleries/ui-screenshots/` path will use the helper. Suite-specific
subdirectories and filenames remain recognizable. Port namespacing prevents
parallel npm runs from overwriting one another.

Tracked `toHaveScreenshot()` baselines continue to use Playwright's snapshot
tree beside the relevant specification. This cleanup will verify and document
that contract but will not generate Linux/SwiftShader baselines from macOS.

## Tool output behavior

Interactive capture tools will default to a purpose-specific directory under
`scratch/captures/`. Render and audit sheets currently written beneath
`tools/render-out/` will default to `scratch/renders/`. Profiling recipes will
write to `scratch/profiles/`.

Existing positional output arguments and `--out` options remain supported, so
callers can intentionally choose a different path. One-off batch-oriented
tools continue to use `artifacts/tmp/`. Writers must create their destination
directory and fail with a clear error when it cannot be created; they must
never fall back to the repository root or `/tmp`.

## Local migration and compatibility

Before removing old ignore rules, move existing ignored generated files from
the legacy test gallery and `tools/render-out/` directories into their new
canonical locations. Do not overwrite a destination file: retain both by
adding a deterministic conflict suffix when necessary. Do not delete existing
`artifacts/` runs.

Source compatibility is provided through unchanged tool CLI overrides, not
through duplicate writes, symlinks, or permanent legacy aliases. New output
has exactly one canonical location.

The concurrent edits already present in `CLAUDE.md` are user work and must be
merged rather than overwritten.

## Documentation and ignore rules

Update `CLAUDE.md`, `docs/TESTING.md`, `tools/README.md`, project-local skills,
and stale test comments to describe the same directory contract and current
commands. Replace the undefined `$SCRATCH` recipe and root-level screenshot
examples with canonical project paths.

After writers and local files have moved, simplify `.gitignore` to ignore the
two generated roots and transient probe scripts. Remove obsolete test-gallery
and `tools/render-out/` exceptions. Narrow broad transient-script patterns when
they overlap legitimate tracked tools.

## Error handling

- Directory creation uses recursive semantics and surfaces filesystem errors.
- Suite and tool names are fixed internal identifiers rather than unchecked
  user path fragments.
- Explicit user-provided output paths remain authoritative; invalid paths fail
  without redirecting output elsewhere.
- Migration detects destination conflicts before moving files and preserves
  both versions.

## Verification

1. Search executable code and project-local skills for generated writes outside
   `artifacts/`, `scratch/`, tracked snapshot trees, and committed source
   products.
2. Confirm `.gitignore` ignores representative new paths while leaving tracked
   baselines and legitimate tools visible.
3. Run syntax checks and IDE diagnostics for edited JavaScript and shell files.
4. Run `npm run test:smoke`.
5. Run one representative screenshot-producing UI test and one gallery test;
   confirm output appears under the correct port-suffixed gallery tree.
6. Exercise one representative interactive capture or render command and
   confirm its default is beneath `scratch/`.
7. Confirm no generated files appear at the repository root or beneath
   `tests/` and `tools/`.
8. Run `npm run test:audit` to catch stale test inventory and command references.

Long UI and full visual-regression suites are not required for this path-only
cleanup unless focused verification exposes a behavioral regression.

## Success criteria

- Every regenerable repository-local file has one canonical home beneath
  `artifacts/` or `scratch/`.
- Concurrent Playwright runs remain isolated by port.
- Existing local captures, renders, logs, and reports are preserved.
- Shipped assets, committed generated sources, and tracked snapshot baselines
  remain tracked in their semantic locations.
- Documentation, skills, comments, tooling defaults, and ignore rules agree.
- No game runtime behavior changes.
