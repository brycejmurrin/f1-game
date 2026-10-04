# Skilltest — content-pipeline

Hands-on audit of skills `asset-pack`, `garage-parts-livery`, `lighting-tuner`,
`new-track`, `scenery-dress`, `survey-track` and tools under `tools/car/`,
`tools/track/`, `tools/lighting/`, `tools/gfx/`, `tools/gen/`.

Ship tip at start of audit: `6434ac25b` (`claude/f1-game-project-26h3ng`).
Method: follow each `SKILL.md` / tool header as a new agent would; run small
real invocations; skip secrets / real GPU / network and say so.

Verdict key: **works** · **works with caveats** · **broken** · **not testable**.

## Skills

| Item | Verdict | Evidence / command | Issue found | Fix PR or proposal |
|---|---|---|---|---|
| **asset-pack** | works with caveats | `node tools/gen/assets.mjs verify` → `verify: OK` (3754 KB / 8 MB). `gen-shell.mjs --check` green. Skill workflow matches. | `bake-synthetic --dry-run` was silently accepted and **rewrote** `assets/pack/` (no dry-run support). | **#686** refuse unknown flags + `--help` |
| **garage-parts-livery** | works with caveats | `parts-ladder.mjs` OK (2 never-optimal tyre rows). `spine-station.mjs --team=redbull` OK. `parts-sweep.mjs --cats=engine` OK. `livery-contrast.mjs --team=mclaren` OK. `flank-occlusion.mjs --team=mclaren` OK. | Several studio CLIs ignored `--help` and ran full work / Chromium (`parts-sweep`, `helmet-sheet`, `career-economy`, `carshot`, `trace-car`). Skill points at `audit-parts` needing `:3456` — fine, but `--help` still launches PW. | **#688** `--help` early-exit. Proposal: migrate remaining car CLIs to `tools/lib/cli-args.mjs` (`parseFlags`) so typos cannot silently default. |
| **lighting-tuner** | works with caveats | `slider-effect.mjs --group LAMPS` OK (26 knobs). `--risk inert --json` OK. `--live glareStr --dry-run` OK. `gen-slider-doc.mjs --check` up to date. | `scripts/bake.mjs --help` opened a file named `--help` (ENOENT). Same class on `merge-proposals` bare invoke. | **#688** bake/merge `--help`. Proposal: wire a one-knob `--live` Playwright smoke into CI only when gfx group selected (already agent-gated in skill — keep). |
| **new-track** | works with caveats | `verify-track.cjs monza` / `spa` OK. `import-circuit-path.mjs --self-check` (local geojson) runs. `rotate-markings.cjs --check` OK (15 would-change, exit 0). | `--self-check` **FAIL miami** `err=3.79 m` over the 2 m bar (pts/len match; path drifted from projection). Network fetch path not exercised (used `--source tests/data/…`). | Proposal (ranked #2): regenerate miami `path` from local geojson + `verify-track miami` + foundation spec — separate circuit PR, not a tool bug. |
| **scenery-dress** | works | Skill commands: `verify-track`, `float-audit monza/spa` → clean, `ground-audit monza --why` / `--gate` OK, `clip-audit` / `coplanar-audit --gate` OK. `BASE=HEAD~5 graph-parity.cjs monza` OK. | Bare `graph-parity.cjs monza` exits **2** with a clear message when tree == HEAD (intentional; skill should mention `BASE=`). | Proposal: one line in scenery-dress SKILL.md under the verify block: `BASE=<ref> node tools/track/graph-parity.cjs <id>`. Docs-only micro-edit. |
| **survey-track** | works with caveats | Skill documents `survey-track.mjs` + `ground-profile.mjs` (Chromium). `verify-track` / `float-audit` no-browser first pass OK. | `ground-profile.mjs --help` treated `--help` as `trackId` and booted Chromium (20 s timeout in help sweep). Full `survey-track.mjs` not run (Chromium + screenshots; load budget). | **#688** ground-profile `--help`. Proposal: add `--dry-run` that only prints planned fracs/lats without boot. |

## Tools — `tools/gen/`

| Item | Verdict | Evidence / command | Issue found | Fix PR or proposal |
|---|---|---|---|---|
| `assets.mjs` | works with caveats → fixed | `verify` OK; unknown `--dry-run` now refused | Silent pack rewrite on unknown flags | **#686** |
| `bake-elevation.mjs` | works | `--help` prints usage | — | — |
| `bake-flyby.mjs` | works | `--help` prints usage | — | — |
| `gen-arch-table.mjs` | works | `--check` OK | — | — |
| `gen-hooks-table.mjs` | works | `--check` OK | — | — |
| `gen-ladder-figures.mjs` | works | `--table` prints ladder sizes | — | — |
| `gen-lib.mjs` | works | library (imported by gens) | — | — |
| `gen-shell.mjs` | works | `--check` → every block up to date | — | — |
| `gen-slider-doc.mjs` | works | `--check` → LIGHTING-TUNER-SLIDERS up to date | — | — |
| `gen-test-groups.mjs` | works | covered by tooling (not re-run write) | — | — |
| `gen-tools-readme.mjs` | works with caveats | `--check` OK but warns `@doc` for `gen/voice-corpus.mjs` is 144 chars (max 120) | Truncation warning is advisory only; easy to miss | Proposal: fail `--check` on over-long `@doc`, or trim voice-corpus header |
| `import-models.mjs` | works | `--help` OK | Needs glTF inputs / network for real import | — |
| `move-tree.mjs` | works | `--help` / usage OK | — | — |
| `settings-defaults.mjs` | works | `--check` → 9 shipped defaults OK | — | — |
| `synth-models.mjs` | works | library; loads clean | — | — |
| `targets.mjs` | works | prints generated doc paths | — | — |
| `title-art.mjs` | works | `--check` → index.html up to date | — | — |
| `track-stills.mjs` | not testable | Playwright gallery; needs browser + long runtime | — | skip (browser budget) |
| `vendor-three.mjs` | works | `--check` → three-0.186.0 hashes OK | — | — |
| `voice-*` | not testable | Needs TTS credentials / network | Out of group for content; skill audio-debug | skip |

## Tools — `tools/track/`

| Item | Verdict | Evidence / command | Issue found | Fix PR or proposal |
|---|---|---|---|---|
| `verify-track.cjs` | works | monza / spa OK | — | — |
| `float-audit.cjs` | works | monza / spa clean | — | — |
| `ground-audit.cjs` | works | monza `--why` / `--gate` OK | Slow (~minutes on busy box) | — |
| `clip-audit.cjs` | works | monza `--gate` OK | — | — |
| `coplanar-audit.cjs` | works | monza `--gate` OK | — | — |
| `graph-parity.cjs` | works with caveats | exit 2 when nothing to compare; `BASE=HEAD~5 monza` OK | Confusing if skill omits `BASE=` | Skill one-liner (above) |
| `import-circuit-path.mjs` | broken (data) | `--self-check` → miami 3.79 m | Committed miami path ≠ projection | Proposal #2 regenerate miami |
| `line-audit.mjs` | works | `monza` OK | — | — |
| `props-tris.cjs` | works | monza OK (identical compaction) | — | — |
| `rotate-markings.cjs` | works | `--check` exit 0 | 15 circuits “would change” — intentional drift report | — |
| `startline-probe.cjs` | works with caveats | bare invoke sweeps **all** circuits (not just monza) | Usage implies per-track; arg ignored? | Proposal: honour `<id>` positional or document fleet-only |
| `startline-snap.cjs` | works | `--help` OK | Needs coordinates to do real work | — |
| `stitch-osm-ring.mjs` | works | `--help` OK | Network for live OSM | — |
| `survey-track.mjs` | not testable | Chromium + multi-shot (~1 min+) | — | skip this session |
| `track-verts.cjs` | works with caveats | monza OK; `--help` timed out (20 s) in help sweep | No `--help` | Proposal: add `--help` |
| `aero-zone-turns.cjs` | works | monza OK | — | — |
| `measure-props-over-road.mjs` | works | `--help` OK | Full run needs browser for `--shots` | — |
| `barrier-jumps.cjs` | works | `--help` / helpers OK | — | — |
| `refresh-f1-circuit-reference.mjs` | not testable | Explicit network maintenance tool | — | skip |
| `track-accuracy-validator.mjs` | works | library for specs | — | — |

## Tools — `tools/car/`

| Item | Verdict | Evidence / command | Issue found | Fix PR or proposal |
|---|---|---|---|---|
| `parts-ladder.mjs` | works with caveats | full run OK; `--help` ignored (runs ladder) | No `--help` | Proposal: `--help` via cli-args |
| `parts-sweep.mjs` | works | engine subset OK; `--help` fixed | Was hanging help sweep | **#688** |
| `spine-station.mjs` | works | redbull / mclaren + `--png` OK | — | — |
| `livery-contrast.mjs` | works | mclaren / ferrari OK | `--help` unclear / ignored | Proposal: cli-args |
| `crest-sweep.mjs` | works | run OK | — | — |
| `flank-occlusion.mjs` | works | mclaren OK; `--help` OK (cli-args) | — | — |
| `logo-authored-sweep.mjs` | works | run OK | — | — |
| `helmet-sheet.mjs` | works | `--help` fixed | Was full raster on `--help` | **#688** |
| `helmet-trace.mjs` | works with caveats | help sweep only | Author-time | — |
| `career-economy.mjs` | works with caveats | `--help` fixed; full sim needs Chromium | Top-level await launched browser before flags | **#688** |
| `carshot.mjs` | works with caveats | `--help` fixed; full shot needs Chromium | — | **#688** |
| `trace-car.mjs` | works with caveats | `--help` fixed | — | **#688** |
| `audit-parts.mjs` | broken (env) | `--help` launches PW → missing `~/.cache/ms-playwright/…` while `/opt/pw-browsers` exists | Harness path / no help | Proposal: early `--help`; use `tools/lib/chromium-path.mjs` |
| `audit-aero.mjs` | works | `--help` OK (alias) | — | — |
| `render-car.mjs` | works with caveats | `--help` OK; needs `:3456` for real render | — | — |
| `cockpit-pale-sweep.mjs` | not testable | Help sweep hung earlier; needs mesh/browser path | — | Proposal: `--help` + document offline vs browser |
| `emblems.mjs` | works | `--check` / `--png=` offline (replaced `trace-logo.mjs`, retired 2026-10-03: it re-traced real team logos) | — | — |

## Tools — `tools/lighting/`

| Item | Verdict | Evidence / command | Issue found | Fix PR or proposal |
|---|---|---|---|---|
| `slider-effect.mjs` | works | classify + dry-run OK | `--live` needs browser (skipped) | — |
| `slider-effect-live.mjs` | works | imported by parent | — | — |
| `slider-effect-view.py` | not testable | Needs prior A/B PNGs | — | skip |
| `ab-lighting.mjs` | works | `--help` OK | Full lattice agent-gated (skill) | — |
| `lighting-tuner-sweep.mjs` | works with caveats | `--help` prints cond list | Full sweep agent-gated | — |
| `campaign/*` | works | `config.mjs` / `io.mjs` load; capture needs browser | — | — |
| `look-survey-sheet.py` | not testable | Needs shot tree + mcp-probe skill | — | skip |

## Tools — `tools/gfx/`

| Item | Verdict | Evidence / command | Issue found | Fix PR or proposal |
|---|---|---|---|---|
| `tlx-pack-check.cjs` | broken → fixed | Was `could not lift packAttr`; after fix `monza` PASS | Signature drift vs `fmt24` | **#687** |
| `gltf-selftest.mjs` | works | PASS | — | — |
| `chunk-share-census.mjs` | works | run OK | — | — |
| `chunk-reach.cjs` | works | monza OK | — | — |
| `road-lut-census.mjs` | works | run OK | — | — |
| `gfx-probe.mjs` | works | `--help` OK | Full probe = browser / soft GPU | — |
| `wgx-shot.mjs` | works | `--help` OK | Real Dawn / WGX not this box | — |
| `wgx-validate.mjs` | not testable | Needs real Dawn | No real GPU | skip |
| `wgx-capture.mjs` / `wgx-lavapipe-probe.mjs` | not testable | Aliases → gfx-probe GPU paths | — | skip |
| `gpu-census.mjs` | works with caveats | Ran full census on bare invoke (no `--help`); `ANY HARDWARE ADAPTER: false` | `--help` missing; SwiftShader only | Proposal: `--help` / `--once` |
| `gpu-game-check.mjs` | not testable | Real GPU runner tool | — | skip |
| `ssr-probe.mjs` | works with caveats | `--help` fixed; full probe needs browser | — | **#688** |
| `glx-call-census.mjs` | not testable | Help sweep timeout (browser) | No `--help` | Proposal: `--help` |
| `frame-hitch.mjs` | not testable | Help sweep timeout | No `--help` | Proposal: `--help` |

## Fix PRs (this group)

| PR | Concern | Status |
|---|---|---|
| [#687](https://github.com/brycejmurrin/f1-game/pull/687) | `tlx-pack-check` packAttr/`fmt24` lift + canary pin | draft until CI green |
| [#686](https://github.com/brycejmurrin/f1-game/pull/686) | `assets.mjs` refuse unknown flags / `--help` | draft until CI green |
| [#688](https://github.com/brycejmurrin/f1-game/pull/688) | `--help` before Chromium/bake/sweep (car + lighting scripts + ground-profile + ssr) | draft until CI green |
| This doc | `docs/plans/skilltest-content-pipeline.md` | docs-only |

## Ranked proposals (bigger than a slice)

1. **Adopt `parseFlags` across `tools/car/` and long-running gfx probes** — one pattern for `--help`, unknown flags, and space-vs-`=` forms (spine-station history). Highest leverage against silent wrong measurements.
2. **Regenerate miami `path`** so `import-circuit-path --self-check` is green — circuit data PR with `verify-track miami` + foundation spec.
3. **Fail `gen-tools-readme --check` on over-long `@doc`** (voice-corpus 144 > 120) instead of warning-and-pass.
4. **scenery-dress / survey-track skill micro-docs**: `BASE=` for graph-parity; ground-profile `--dry-run`.
5. **`startline-probe` honour `<id>`** or document fleet-only behaviour (bare `monza` still scanned every circuit).
6. **`audit-parts` / PW tools**: resolve Chromium via `chromium-path.mjs` (`/opt/pw-browsers`) so Cloud boxes do not look for `~/.cache/ms-playwright`.

## Verdict counts (skills + tools exercised)

| Verdict | Count (approx.) |
|---|---|
| works | ~45 |
| works with caveats | ~25 |
| broken (pre-fix) | 3 (`tlx-pack-check`, assets dry-run footgun, miami self-check) |
| not testable | ~15 (GPU / network / long browser lattices) |

## Top issues

1. **`tlx-pack-check.cjs` completely broken** after `fmt24` — packing regression gate silent-red for any agent following tools/README. Fixed in #687.
2. **`assets.mjs` unknown flags rewrite the pack** — `--dry-run` footgun nearly committed binary churn. Fixed in #686.
3. **Widespread `--help` → Chromium / full job** across content CLIs — wasted minutes and false “hangs” in help sweeps. Partially fixed in #688; remainder in proposal #1.
4. **miami path self-check red** — content/data drift, not a CLI crash.
5. **Playwright browser path mismatch** on `audit-parts` in this environment (`~/.cache` vs `/opt/pw-browsers`).
