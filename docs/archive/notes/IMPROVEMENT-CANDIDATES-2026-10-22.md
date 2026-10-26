# Bounded improvement candidates

Investigated against `8564113bde522fac6591cdc6adea6d1fab5f86ab` on 2026-10-22.
Ten disjoint native-agent investigations used the production modules and existing
fixtures. Browser ownership stayed with the parent. This is a ranked engineering
shortlist, not a claim that every candidate should ship together.

## Evidence and ownership

**Measured** below means an executed, described workload. Injected clocks,
mocked devices and VM modules do not measure a physical phone. **Code-traced**
means a reachable causal path, still requiring the stated runtime check.
No operation count establishes FPS, GPU time, energy or retained-memory savings.

The initial live GitHub inventory found #3446 open/draft, #3474 open/ready and
#3465 open; its ready/draft state changed during investigation. Their historical
PR-body status text was not used as authoritative metadata. #3440 subsequently
merged as `7ec6f603`; this branch remains pinned to its original source.
Recent merges already cover #3407 repeated race/UI work, #3468 shader warm-up,
#3387 weather/materials and #3469 graphics-unavailable controls.

Active fleet claims cover garage/Photo Studio (#3330–3339), W17 service-worker
recovery (#3284/#3293), W18 classification/compound rules (#3286/#3287), cockpit
finishes (#3474), visor work (#3465), #3446 and scenery/car-aero lanes.
No open-PR changed-file inventory covered the selected input/trace modules.
Claims and the fleet bus must be rechecked before taking a deferred candidate.

## Ranked shortlist

1. **Controller recovery depends on display cadence.** `js/input/input.js`
   `pollGamepad()` retries only every 60 display polls after a missing snapshot.
   Actual-module VM: connect a synthetic controller, return one empty snapshot,
   restore it without a connection event, then poll at 15/30/60/120 Hz. Recovery
   took 4000/2000/1000/500 ms. Replace the frame counter with a monotonic deadline
   and bounded short recovery window, retaining slow polling for long absence.
   Paths: input module and existing key-binding tests. Benefit: bounded recovery
   independent of display rate; tradeoff: more reads during brief recovery.
   Preserve zero stale controls, menu/focus rules and held-button reseeding.
   Validate elapsed-time, absent/throwing snapshots, connection events and button
   edges, then exercise the real game with synthetic snapshots. Physical dropout
   frequency and input-to-photon latency remain unknown. **Selected; ready.**

2. **Practice traffic mastery can count one opponent three times.**
   `js/race/race-insights.js` re-adds an already-cleared car to `drill.passing`.
   Actual-module VM: alternate one slower opponent's gap +5/−5 metres three
   times; the drill awards “cleared 3 of 3” and clean mastery. Retain a set of
   cleared identities for each attempt; count three distinct opponents.
   Paths: race-insights module and existing race-insights tests. Benefit: honest
   training feedback; no simulation change. Small per-attempt set; no saved-data
   migration. Test repeat passes, three distinct cars, concurrent passes and
   retry/reset. Disjoint from W18's classification/compound changes.
   **Selected; ready after independent verification.**

3. **INPUTS trace loses its non-colour legend.** `js/ui/hud-inputs.js` independently
   clamps endpoint labels. Actual production-canvas VM paints T/B/S at the same
   `(119,42)` for released pedals and full-left steering. Put the three labels
   in separated, stable rows while preserving the plot and accessible values.
   Paths: hud-inputs module and existing canvas tests. Benefit: recognizable
   channels when traces meet; tradeoff: labels stop following live endpoints.
   Validate every input extreme, reduced-motion bars, narrow canvas and real
   844×390 touch captures. No overlap with #3446's HUD formatting paths.
   **Selected; ready after rendered comparison.**

4. **SPEED FOV zero still allows speed zoom.** Actual CamTune and camera solvers
   show cockpit/helmet +1.5°, far +7°, heli +8° and rival/drone +14° despite zero.
   `vantage.js` passes raw speed to the final lens layer; `extra-rigs.js` has
   separate unscaled lens curves. Scale lens terms only, preserving physical
   lookahead/eye/target and default setting 1. Paths: those two camera modules
   plus camera tests using live `dt`. Validate all affected modes and default
   numerical parity, then fixed-camera phone captures; aspect fitting can hide
   onboard differences. Adjacent to active cockpit/visor work; coordinate exact
   ownership. **Ready bounded follow-up; omitted from the input-feedback batch.**

5. **CPU profiler can report success without driving.** Actual legacy profiler
   body with injected harness: unsettled race, menu state, rejected `go/jump`,
   and 600 no-op steps still write a profile and exit zero. `profile.mjs --mode
   cpu` delegates that path. Additionally `wrap()` maps a child's null exit
   status (signal/spawn error) to zero. Paths: `tools/shot/profile-gameloop.mjs`,
   `tools/perf/profile.mjs`, existing profile tests. Await real built-race state,
   assert advancement, and propagate abnormal child termination. Benefit:
   trustworthy diagnostics; no game speed claim. Test rejected/deferred setup,
   no advancement and signal/error cases, then one real browser profile.
   **Ready tooling follow-up; avoid using that unguarded route as evidence.**

6. **WATCH audio stop can leave abandoned work.** `js/audio/radio-fx.js`
   `radioMediaClip()` fallback lacks an AbortController and pre-decode dead check;
   teardown pauses but retains media src. VM: stop during held fetch, resolve it,
   observe one decode after stop, no fetch signal and retained media source.
   Abort owned fetch, check liveness before decode and retire the media element.
   Paths: radio-fx and existing audio tests. Benefit: avoid obsolete download/decode;
   no measured MB/GC improvement. Decode already submitted may be uncancellable.
   Validate stop/fallback/late response and native browser media lifecycle.
   **Ready after W18 audio ownership carve-out; deferred.**

7. **Renderer preference changes can preload the old backend.**
   `RendererBoot.guessBackend()` trusts the old bound renderer without matching
   its originating preference. Actual-source VM: successful GLX → explicit THREE
   produces ten GLX hints (603,717 raw source bytes), while ten TLX files actually
   load, with no intersection. Remember preference identity alongside bound;
   preserve same-choice fallback behavior. Paths: renderer-boot, storage schema
   and existing boot tests. Raw source bytes are not transferred bytes or a timing
   result. Validate native renderer change/reload and network requests.
   **Code-traced/reproduced classification; coordinate B·H31 before implementation.**

8. **Mirror quality dwell is 90 renders rather than 1.5 seconds.**
   `js/render/shared/mirror-pass.js`: VM transitions after 4500/1500/750 ms at
   20/60/120 Hz. Use 1500 ms monotonic dwell, initial selection immediate, reset
   on candidate changes. Test rates/oscillation and live mirror target stability.
   More prompt downshifts at low cadence, longer stability at high cadence;
   no demonstrated FPS improvement. #3440 touched the same module and #3446 owns
   related mirror work. **Ready only after narrow ownership coordination.**

9. **Optional native WGX SGSR-AA can publish invalid resources.**
   `wgx.js` `_syncSpatialAa()` uses synchronous try/catch, whereas WebGPU may
   return truthy invalid handles and report errors asynchronously. Production-
   function mock selects invalid output with no scoped verdict or retirement.
   Stage scoped allocation, publish only after clean validation/OOM verdicts,
   reject stale completions, preserve FXAA fallback. Paths: WGX and lifecycle
   tests. Actual GPU failure unmeasured; optional setting defaults off. Requires
   parent native-WGX capture and macOS hardware census, including failure paths.
   **Substantiated design gap; larger renderer validation required first.**

10. **Main-view culling also culls possible mapped-shadow casters.**
    `game.js` behind-eye/side-frustum exits precede shadow enqueue; shadow-pass
    consumes that pool. Oblique lighting may put an offscreen car's shadow on
    visible road. Do not globally hide cars or alter simulation. Separate shadow
    eligibility only after a fixed-camera maps-enabled reproduction. Default
    phone maps are off. Extra caster submissions can cost GPU time. #3446 overlaps
    game.js. **Code-traced only; needs missing-shadow capture and measurement.**

## Coverage and rejected shortcuts

Areas 1–10 respectively produced mirror/shadow, SGSR/target, input cadence,
preloads, radio lifetime, GripSteer, trace/accessibility, FOV, traffic drill,
and profiler findings. The physics lane's proposed GripSteer scratch reuse
matched 12,000 deterministic cases / 48,000 primitive comparisons, but V8 may
already eliminate the temporary objects: profile allocation before changing it.
Inactive WGX targets and no-requestIdleCallback background scheduling likewise
need retention/latency measurements. A suspected warm-up scissor mismatch was
rejected after checking the pinned renderer implementation.

INPUTS also re-applies the OS motion preference despite explicit motion ON;
similar checks exist elsewhere. Correcting only one surface would leave a mixed
contract, so coordinate a separate effective-motion consistency change.

## Primary documentation checked

- [Gamepad specification](https://w3c.github.io/gamepad/),
  [getGamepads](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/getGamepads),
  [requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame),
  [monotonic performance clock](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now).
- [WCAG use of color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html),
  [animation from interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html).
- [Three.js disposal](https://threejs.org/manual/pages/how-to-dispose-of-objects.html),
  [WebGLRenderer compileAsync](https://threejs.org/docs/pages/WebGLRenderer),
  [Khronos asynchronous GPU timer queries](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/).
- [Chrome performance tooling](https://developer.chrome.com/docs/devtools/performance/reference),
  [Node child-process status/signal](https://nodejs.org/api/child_process.html),
  [WebGPU error scopes](https://gpuweb.github.io/gpuweb/#error-scopes),
  [AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController).

These support the API/design reasoning, not player-device performance claims.
