# The nightly Metal job has been red since 2026-09-19 — diagnosis, not a fix

`renderer-macos` ("Renderer specs on a real GPU (macos-latest, Metal)") is the
ONLY lane that can execute `test:gfx`. It has failed the same two tests, with
the same numbers, every night from 09-19. This note is what was established
from the logs and the history; **nothing here was verified on Metal**, because
the container this was written in has no GPU.

## The two failures, unchanged for three nights

| spec | assertion | Expected | Received |
|---|---|---|---|
| `image-grade-visual.spec.js › rendered image grade › blacks visibly change the deepest image detail` | `expect(crushed.signed).toBeLessThan(-1)` | `< -1` | **-0.9018082937830104** |
| `webgl-probes.spec.js › WebGL renderer probes › dynamic player shadow uses the current-frame car transform` | caster count | `> 0` | **0** |

Identical to full float precision on 09-19 (35430951980), 09-20 (35499959697)
and 09-21 (35580525816), across three different SHAs. Both `! retry` attempts
on 09-19 failed with the same values. No `FLAKY` line in any log. **This is a
standing defect, not flake and not load.**

## What it is NOT

- **Not a perf-governor shed.** The image-grade failure embeds its diagnostic
  JSON, and it reads `"gov":{"tier":0,"autoTier":0,"autoShed":0,...}`. The
  `PerfGov.tier() < 3` gate at `js/render/shared/shadow-pass.js:323` was OPEN.
  (This refutes the first hypothesis anyone reaches for, including mine.)
- **Not a lost premise.** `image-grade-visual` guards its comparison hard —
  same governor tier, same post chain, same env probe, same camera, a newer
  present generation, and the spec still owning the free-cam. Every one of
  those passed. Only the MAGNITUDE assertion failed.
- **Not the TLX `castShadowChunked` façade bypass.** That path (`tlx.js:2602`)
  handles track chunks; the car shadow is cast through `G.gfx.castShadow` at
  `shadow-pass.js:343`, which is the façade the probe patches. Checked and
  discarded.
- **Not a missing GPU.** `gpu-census.yml` is green on every recent run.
- **Not today's cancellation.** Run 4646 (09-22) was cancelled ~11 min into a
  30-min budget with the sweeps job cancelled in the same wall-clock second;
  `ci.yml:291` keys the schedule concurrency group on `github.run_id`, which is
  unique per run, so it cannot be a supersede. It looks like an external cancel
  against the whole run and is a SEPARATE question from the standing pair.

## The suspect, and why

The last green nightly was 09-17 at `317e033d2`; the first red was 09-18 at
`3b0092840` (a different, unrelated failure plus a Playwright wedge) and then
the standing pair from 09-19 at `38b005021`. Nine renderer files changed in
that window. One of them changes TLX lighting on purpose:

    0e6080f95  Fix the TLX per-chunk lamp grid: two strides, not one

It replaced a linear copy of the lamp grid with a row-by-row blit through
`LampChunks.blitGrid`. Its own message is explicit that the old copy was wrong:
every row but the first read a zero pair, so `count` was 0, `use` was false,
and **the per-chunk lamp path fell back to the global lamp set over almost the
whole grid, silently**.

That is a correct fix, and it necessarily changes what the scene looks like:
more of the frame is now lit by its own chunk's lamps. `crushed.signed` is a
measure of how much darker the image gets when BLACKS is pushed to its minimum
— and if the dark regions are now lit slightly differently, the headroom for
crushing them shrinks. Measured: -0.90 against a threshold of -1, i.e. the
effect is still real, still in the right direction, and about 10 % short.

**The hypothesis is therefore: a legitimate lighting fix moved the image, and a
threshold measured before that fix is now slightly too tight.** It is NOT
established. Confirming it needs one run on Metal at `317e033d2` and one at
`0e6080f95`, comparing `crushed.signed`.

The shadow failure (caster count 0) shares the window and is not explained by
this. `js/render/shared/lamp-chunks.js` (+36) and `js/render/glx/chunked.js`
(+23) are the other candidates and were not run down.

## What was deliberately NOT done

**The tolerance was not widened.** AGENTS.md rule 9 says never widen a
tolerance to make a spec pass, and that rule is load-bearing here: this test is
the only assertion in the repo that the tone-map chain produces the intended
luminance response on real hardware. Moving `-1` to `-0.85` to get a green
would delete the signal rather than read it. If the hypothesis above is
confirmed, the right action is to RE-BASELINE against a measured Metal number
with the measurement recorded, which is a different act from loosening a bound
until it stops complaining.

## Why nothing else can run these specs

All six `test:gfx` specs declare a per-test budget above the selected gate's
180 s cutoff, so `fit()` drops them into `overBudgetSpecs` before the rank
path — they cannot be selected even by a diff that edits them:

    instanced-draw 420 s · webgl-probes 240 s · lighting-ab 420 s
    image-grade-visual 480 s · lighting-tuner-grade 300 s · tlx-probes 540 s

`tools/ci/nightly-group.mjs` also excludes `test:gfx` from the rotation by name
("macOS/Metal, and it already has its own renderer-macos job"). This is
deliberate and `tools/ci/ci-coverage.mjs` reports it plainly rather than hiding
it — but it does mean that while this job is red, ~250 commits/month of
`js/render/` change is landing with no real-hardware gate at all.
