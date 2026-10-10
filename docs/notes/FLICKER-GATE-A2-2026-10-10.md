# Flicker gate, 2026-10-10: why `A==A2 at every site: false` while 9 of 9 pass

Read-only investigation, no browser run. Evidence: the result file of the 2026-10-10 run
(`artifacts/flicker-gate/flicker-gate.json`, gitignored, so quoted here), `tools/shot/flicker-gate.mjs`
and `tools/lib/flicker-metric.mjs`.

## Verdict in four lines

- One site of nine is not exact: `madrid-overpass-soffit`, the FIRST site of the run, A vs A2 differ at 15,693 px
  (3.03 % of 960x540) with a largest luma step of 25. The other eight are exactly equal (`diffPx 0`).
- The step (25) is under the flip threshold (`thr` 48), so `still.flipPx` is 0 and the fight measurement is
  unaffected. Nothing in the verdict is wrong; the tool's `stillExact` line is stricter than its own gate.
- Most likely cause: the first race of the session had not fully settled after the 10 + 2 presents (late asset or
  cadence-driven pass landing between A and A2), not an unfrozen clock. One measurement separates it (below).
- `stillExact:false` should NOT gate anything today. It is a calibration signal for the "tighten the ceilings"
  step in the tool header, and this run says that step's precondition is not yet met for this one site.

## 1. The numbers (webgl2 / GLX, swiftshader, 960x540, `via: game-soft`, run 2201 s)

Summary: 9 sites, 9 pass, 0 fail, 0 error, 0 skipped, `stillExact: false`, `thr 48`, `minFlips 2`, `minCluster 9`.
Pixels per frame: 518,400. Ceilings are fractions of the frame. `flips` are the pixels that moved more than 48 luma
against A in each of the four dolly frames (+1, -1, +2, -2 times `jitterM`).

| site | A vs A2 diffPx | max step | still flipPx | jitter flips | fight px (%) / clusters | ceiling | result |
|---|---|---|---|---|---|---|---|
| madrid-overpass-soffit | **15,693** (3.03 %) | **25** | 0 | 2, 5, 1, 1 | 0 / 0 | 2 % | pass |
| madrid-ifema-soffit | 0 | 0 | 0 | 0, 0, 1, 0 | 0 / 0 | 2 % | pass |
| monaco-tunnel-vault | 0 | 0 | 0 | 1, 0, 0, 0 | 0 / 0 | 1 % | pass |
| monaco-tunnel-top | 0 | 0 | 0 | 0, 0, 0, 0 | 0 / 0 | 0.5 % | pass |
| miami-turnpike-underside | 0 | 0 | 0 | 0, 0, 0, 0 | 0 / 0 | 1 % | pass |
| monza-startline-grid | 0 | 0 | 0 | 4, 0, 4, 0 | 0 / 0 | 0.3 % | pass |
| monza-startline-far | 0 | 0 | 0 | 1, 40, 16, 44 | 37 (0.0071 %) / 1 | 0.4 % | pass |
| zandvoort-pit-roofs | 0 | 0 | 0 | 183, 17, 147, 90 | 113 (0.0218 %) / 1 | 0.5 % | pass |
| monza-main-grandstand | 0 | 0 | 0 | 0, 0, 0, 0 | 0 / 0 | 0.5 % | pass |

Relative to the ceilings: the A2 difference is not a fight measure at all. It is 15,693 px against a fight ceiling
of 2 % x 518,400 = 10,368 px, but the two are different quantities (A2 diff counts any change; the ceiling counts
clusters that flip more than 48 luma in two of four dolly frames). The madrid overpass fight is 0 px, and its
jitter flips are 1-5 px, the same order as the sites that are exact. The two sites that do show a fight
(`monza-startline-far` 37 px, `zandvoort-pit-roofs` 113 px) are 0.0071 % and 0.0218 % of the frame, 56x and 23x
under their ceilings, and are exact in A vs A2, so their A2 is unrelated to the question here.

Wall time: madrid-overpass-soffit 222.7 s against 121.7 s for the second Madrid site (same circuit), so the first
site absorbs the cold boot and the first race load.

## 2. What the code does between A and A2

`measureSite` (flicker-gate.mjs 233-257):

1. `race(track,"day","dry")`, wait for `info().track`, then `hud(false)`, `renderScale(1)`, `govHold(true)`,
   `lightTune({lampFlicker:0,lampWarmup:0})`, `renderClock(100,true)`, then `park()`.
2. A = `view(pose)`, 10 presents, grab. Then 2 more presents, grab again = A2. No camera or state change between
   them. Jitter frames come after, one present each.

So A vs A2 differ only if the renderer's output changes with presents alone. Time sources already pinned: sky and
cloud time (`game.js` 7152: `if (!_skyHold) _skyT += dt`), lamp flicker and warmup (`frame-lights.js` 264, 592 read
`performance.now()`, neutralised by the two `lightTune` zeros and day lighting), the governor tier and render scale,
physics and field (`park()`), the debug camera (no damping). Wall-clock readers I found in `js/` that are NOT
pinned: `game.js` 6857-6875 camera vantage and buzz shake use `performance.now()` but only on the driven
cameras, not the debug `view()` camera; `shared/mirror-pass.js` 537 passes `performance.now()` to a vantage for
the picture-in-picture/mirror; `glx.js` 750 is context-loss bookkeeping and draws nothing. I did not find a
clock-driven draw affecting a hidden-HUD still.

## 3. Hypotheses, ranked

Ranking uses three facts: only the first site differs; the difference is large in area (3 %) but small in
amplitude (max 25, under `thr`); a second site on the same circuit one race load later is exact.

1. **First-session warm-up has not finished (best fit).** The first `race()` of a page is when the deferred
   backend, model pack (`Assets.modelsReady()`, capped at 4 s, per AGENTS.md) and PBR material arrays arrive; shadow
   cascades, probes and other cadence-driven passes also land over several frames, and SwiftShader frames are slow
   (seconds), so wall-clock-paced loads advance by a different amount between A and A2 than between later sites'
   frames. Supports: first site only; wall time 222 s vs 122 s for the next Madrid site; a broad, low-contrast
   difference (a surface gaining texture, shading or shadow detail) rather than a hard edge change; the tool's own
   comment says "ten presents lets every cadence-driven pass land", which is an assumption not a measurement
   (header: no frame had been rendered when it was written). The soffit fills ~40 % of the frame, so 3 % of it
   changing by up to 25 luma is consistent with a texture or shadow term updating.
2. **Pose-specific asynchronous content at this one site** (a streamed baked prop or texture near the overpass
   that the IFEMA pose does not see). Same mechanism as 1, scoped to the pose. Weaker, because a track's baked
   assets load once and the IFEMA site shares the circuit; cannot be excluded without per-site order swapping.
3. **An unpinned animated or time-driven element visible from this pose** (traffic or cloth on the motorway,
   mirror/PiP vantage). Weaker: I found no Madrid-specific animation in `js/circuits/madrid.js`, `renderClock`
   already pins flags and sky, and a time-driven element would be expected to move the maximum step well above
   25 where it is seen.
4. **Temporal accumulation (TAA, bloom history, auto-exposure).** Weak: GLX is the backend under test, I found no
   history or eye-adaptation buffer in `js/render/glx/` (matches in `tlx-post.js` / `wgx.js` belong to other
   backends); a converging accumulator would also converge, giving A2 closer to A than A to the first frames,
   not 3 % of the frame at up to 25.
5. **Sort-order jitter or rasteriser nondeterminism.** Weakest: it would give hard edge flips well above 25 at
   sparse pixels, not a broad low-amplitude area; and the other eight sites on the same backend are bit-exact,
   which is what a deterministic SwiftShader would give.

## 4. The single measurement that separates them

Needs a browser run (not done here). Run the gate on `madrid-overpass-soffit` with a temporary local variant (do
not commit) that grabs A, A2 and an A3 after two more presents each, prints `frameDelta` for A/A2, A2/A3, and
saves the A2 - A mask (`--png` already writes the mask for the fight, not the still diff), and run it twice:
once as the first site in a fresh page and once after a throwaway `race()` of another circuit. Reading:

- A != A2 first, A2 == A3, and the same site is exact when run second: hypothesis 1 (warm-up). Fix is a longer or
  condition-based settle (wait until two consecutive grabs are equal, capped) in the tool, not a game change.
- A != A2 and A2 != A3 with the diff area shrinking: slow convergence, still hypothesis 1, needs more presents.
- A != A2 persists when run second and alone, A2 == A3 with a fixed mask on a particular surface: hypothesis 2.
- A2 != A3 with a stable, nonzero diff that does not shrink: a live time source (hypothesis 3), and the mask's
  location says which object.

The JSON alone cannot separate them: `still` stores counts, not a mask.

## 5. Should `stillExact:false` gate anything?

No, on the evidence.

- `judge()` already fails a site when `still.flipPx > 0`, i.e. when A and A2 differ by more than `thr` anywhere.
  That is the condition under which the fight number cannot be trusted. Here `flipPx` is 0 and `maxDelta` is 25
  (about half of `thr`), so the site is judged on its fight number, which is 0 px with 1-5 px jitter flips.
- `summary.stillExact` is `every(diffPx === 0)`, a stricter, informational line (`flicker-gate.mjs` 309). Making
  it a gate would turn a sub-threshold warm-up difference into a red on the nightly/benchmark job and teach people
  to re-run it. Rule 9 (never widen a tolerance to pass) does not apply: the metric's tolerance is unchanged.
- What it should do instead: be read as the precondition for the header's tightening step ("after ~5 runs with A
  == A2 exactly at every site ... set each ceiling to ~3x the largest observed fight.frac and make the job
  blocking"). This run is one run, and breaks that precondition at one site, so do not tighten or make the job
  blocking until the madrid-overpass A2 is explained or the settle is made condition-based. Ceilings are not at
  risk meanwhile: the largest fight observed (113 px, 0.0218 %) is 23x under its ceiling.
- A real risk to note, not a current failure: if a settling change were above 48 luma it would show as
  `still-frames-differ` (a correct red). A settling change that landed between A and the later dolly frames could
  in principle inflate jitter flips only where it exceeds 48 in two of four frames, which the madrid numbers
  (2, 5, 1, 1) do not show.

Follow-ups for whoever owns the tool (not done here, tool edits are out of scope): print which sites are inexact
in the summary line instead of one boolean; print `still.diffPx` in the per-site console line only when nonzero
(already the case for fight sites); run a warm-up site first or settle until two grabs are equal.
