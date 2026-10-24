# Lit-WGSL census: how often does a deploy re-key the phone shader cache? (2026-10-24)

A·W44, Fleet A, issue #3672 (lever 1 of PR #3671 §4). Safari keeps its WebGPU pipeline cache across reload, kill and
data-clear, keyed on the shader CODE, so any merge that changes the WGSL three.js generates for the lit family
re-charges ~14 s (race warm) + ~7.5 s (menu warm) on an iPhone 14, ~9 s on an 18 Pro Max, to every phone once.

## Method

`tools/perf/lit-wgsl-census.mjs capture` serves a tree, boots Chromium on Mesa lavapipe (the stack
`gfx-probe --lavapipe` uses), pins TLX to its WebGPU path (`apex26.gfxBackend=three`, `tlxForceGL=0`), races Monza
day/dry and records every `GPUDevice.createShaderModule` call until no new module arrives for 8 s. Each module is
hashed raw (sha256 of the text three wrote, what Safari keys on) and normalised (TSL build-order names `nodeUniformN`,
`NodeBuffer_N`, `nodeVarN` renumbered by first appearance). The **lit family** is the large fragment modules that read
a comparison-sampled shadow map: four on this tree (the lit and double-sided programs, ~100 KB each, plus their
variants).
`diff` compares two captures; `advisory` captures a base and a head tree and prints the verdict.

Reproduce the table: `git worktree add --detach artifacts/lit-wgsl/wt <sha>` per first-parent merge of the deploy
branch that touched `js css assets index.html sw.js`, then `capture --root artifacts/lit-wgsl/wt --out …`.

Determinism first: two captures of the same tree gave identical raw hashes for all 11 modules, so a delta is a real
re-key, not capture noise. A capture is ~1.5 min on this box.

## Census: the last 30 game merges (23 Oct 2026, 01:49–17:13 PT)

Every capture holds the same 40 unique modules, 4 of them in the lit family (settle 25 s, repeated modules deduped),
the same counts the CI advisory run saw, so the rows are comparable. "other modules only" = a hash moved outside the
lit family (post, sky, fx, shadow, mipmap).

| merge | PR | lit family | verdict | touched js/render/{three,shared} |
|---|---|---|---|---|
| `e23c6377` | #3640 ers-bar-prewarm-c41a | `3929cfde` | baseline | three/tlx.js |
| `5fa6eb6a` | #3624 aero-zone-counts-3557 | `3929cfde` | identical | — |
| `651f81b3` | #3630 dead-kit-devflags-a26w | `3929cfde` | identical | — |
| `e8228c48` | #3618 night-rain-prewarm-5b1e | `3929cfde` | other modules only | three/tlx-shadow.js, three/tlx.js, three/tsl-fx.js |
| `b2cca9a2` | #3631 mirror-prep-diag-9d2c | `3929cfde` | identical | shared/mirror-pass.js |
| `79a9102a` | #3629 netplay-ice-restart-w22 | `3929cfde` | identical | — |
| `9be4a4e4` | #3626 race-build-superseded-3571 | `3929cfde` | identical | — |
| `67b92fe7` | #3619 audio-rebuild-cap-defer-3561 | `3929cfde` | identical | — |
| `938447fc` | #3610 cockpit-sw-bloom-44e5 | `3929cfde` | identical | shared/post-common.js |
| `598d4381` | #3622 scenery-retry-a3570 | `3929cfde` | identical | — |
| `d6524771` | #3651 night-bake-wgsl-7e3c | `2f1248b9` | **RE-KEYED** | three/tsl-lit.js |
| `269f66a4` | #3627 flaky-uiscale-daily-w24 | `2f1248b9` | identical | — |
| `9cc19b84` | #3595 w19d-script-loader-a3f1 | `2f1248b9` | identical | — |
| `75bd4059` | #3596 w19e-glx-lampshadow-a4f2 | `2f1248b9` | identical | — |
| `f68160cf` | #3613 w20a-career-readslot-3de6 | `2f1248b9` | identical | — |
| `9003114e` | #3650 data-bundle-retry-fb74 | `2f1248b9` | identical | — |
| `a00af85c` | #3633 w21b-webgpu-menu-warm-a7f2 | `2f1248b9` | identical | three/tlx-chunked.js, three/tlx.js |
| `d5ea3956` | #3649 sw-race-entry-a3f2 | `2f1248b9` | identical | — |
| `6b01eae6` | #3653 cold-warm-scope-4b2d | `2f1248b9` | identical | three/tlx.js |
| `5e7e7922` | #3642 w21c-appearance-steppers-d4aa | `2f1248b9` | identical | — |
| `278cb68e` | #3661 lighting-lookpostshed-glow-f487 | `2f1248b9` | identical | shared/post-common.js |
| `ffb5c921` | #3659 visor-webgl2-blend-3657 | `2f1248b9` | identical | — |
| `4d88cca6` | #3658 photo-capture-res-5f15 | `2f1248b9` | identical | — |
| `794d8965` | #3660 sw-card-path-7f689 | `2f1248b9` | identical | — |
| `0a8b4d2c` | #3579 merlin/sound-glyph-svg | `2f1248b9` | identical | — |
| `5e325f91` | #3662 finish-on-demand-9c1e | `821d37dc` | **RE-KEYED** | three/tlx.js, three/tsl-lit.js |
| `907fbe3c` | #3628 w20d-import-cap-b346 | `821d37dc` | identical | — |
| `95f836e9` | #3632 w22c-garage-prebuild-mobile-df12 | `821d37dc` | identical | — |
| `b3779370` | #3644 w22e-install-chip-stack-6a45 | `821d37dc` | identical | — |
| `13d33447` | #3635 w22f-pause-75-taps-3170 | `821d37dc` | identical | — |

## Result

- **2 of 29 merge steps re-keyed the lit family** (#3651, #3662); **1 more changed only non-lit modules** (#3618);
  the other 26 left all 40 modules byte-identical, including merges that edited `tlx.js`, `tlx-chunked.js` and
  `post-common.js`.
- Both lit re-keys were deliberate `js/render/three/tsl-lit.js` edits that changed what the graph computes:
  - #3651 (night-bake placeholder filter): 7 modules changed, 3 of them lit (119,042 and 113,488 bytes). This is the
    fix that made day and night boot one family (NIGHT-ENTRY-WEBGPU-2026-10-23.md §2); the textureLoad →
    textureSampleLevel change is real.
  - #3662 (finish tints on demand): 5 modules changed, 3 of them lit, which shrank from ~119 KB to ~102 KB: 17 KB of
    finish-tint graph removed.
- #3618 (night/rain prewarm) touched `tlx-shadow.js`, `tlx.js` and `tsl-fx.js` and moved 2 modules (one 2.3 KB vertex,
  one 8 KB fragment, not lit): a smaller re-charge, on those programs only.
- `namesOnly` was 0 in all three: no change was a pure renumbering of TSL build-order names.
- Within this 16 h window the lit family was re-keyed twice (merges 8 h apart); a phone that raced on both builds would
  have paid the ~20 s compile twice (iPhone 14 figures, #3672). Not measured on a device here.

## Which kinds of change cause it

Measured on this window: only edits that change the TSL graph (`tsl-lit.js`, and `tsl-fx.js`/`tlx-shadow.js` for the
non-lit programs). Edits that do NOT move the WGSL: renderer plumbing (`tlx.js`, `tlx-chunked.js` on their own),
post-process constants (`post-common.js`), HUD, audio, UI, data, physics, tracks. Per the NIGHT-ENTRY evidence, a
texture-filter flip or a tap that changes a binding shifts every later TSL name, so a "small" graph edit re-keys more
than it looks like; that is real, not incidental.

## Stabiliser (#3672 step 3): not warranted by the data

The census found no incidental churn: no nondeterministic ordering (same-tree captures are identical), no embedded
build ids, no unused-uniform drift, and no names-only re-key. So there is nothing to normalise without changing
rendering, and no shader-text change is made in this PR. If a future window shows `namesOnly > 0`, the advisory prints
it ("NAMES ONLY") and that is the cue to look for a build-order dependency. The lever that remains is process, not
code: batch lit-graph edits into fewer deploys, and read the advisory on any PR touching `tsl-lit.js`.

## What this does and does not cover

- One configuration: Monza, day, dry, first race after boot, 844×390, lavapipe. Night and rain re-use the same lit
  family since #3651; other tracks add scene-specific programs but not new lit hashes in the earlier probe.
- NOT covered: the menu warm (garage scene, ~7.5 s on iPhone 14) and the programs created later in a session
  (post chain variants, lamp-map casters). A garage-scene capture is the obvious next extension.
- The gap between lavapipe and Metal is irrelevant to the hash (it is the WGSL text, before any compiler), but
  Safari's actual cache key also includes pipeline-descriptor state; descriptors are not hashed here.
- Confirmation on a device (non-shader deploy keeps `programWarm` ≤ 0.3 s) is A·D1's, on Bryce's Go.

## The CI advisory

`.github/workflows/lit-wgsl-advisory.yml` (own workflow, NOT required, `continue-on-error`) runs on PRs into the deploy
branch that touch `js/**`, `vendor/**`, `assets/**` or the tool itself (drafts only with `run-ci`). It captures the base
tip and the PR merge result, and writes `lit-WGSL CHANGED` or `unchanged` to the job summary, plus a `::notice::` on a
re-key. Docs used: workflow syntax `paths` filter, job summaries and notice annotations —
https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax,
https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands.
Cost: ~6–8 min of one ubuntu runner per qualifying push; it never gates a merge.
