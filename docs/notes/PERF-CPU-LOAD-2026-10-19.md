# CPU, simulation and load performance outside the renderer (2026-10-19)

Fleet B lane H2. Scope: main-thread CPU per frame outside `js/render/**` and
`js/lighting/**` (simulation, physics, AI, track queries, HUD/DOM, audio), GC
and allocation churn, and boot/load time. Shipped renderer assumed: TLX on
three.js WebGPU (`tlxForceGL=0`); the renderer lane is H1.

Prior art (do not re-report): PERF-ALLOC-HUNT-2026-10-17, PERF-HUNT-RACELOOP-2026-10-17,
PERF-HUNT-CPU-2026-10-17, PERF-HUNT-BOOT-2026-10-17, PERF-GAMEPLAY-HITCHES-2026-10-14,
PERF-P1/P2-2026-10-18, PERF-HUNT-2/4 (car-fields.js shape work).

## Baseline (montreal, 22-car AI field, this container)

| measure | tool | value |
|---|---|---|
| sim step, renderer absent | game-vm, `__apex.step` ×3000 after 600 warm (`scratch/perf/sim-prof.cjs`) | 2.36 ms/step (5 reps 1.95–2.68) |
| rendered frame, renderer stubbed (sim + HUD + camera + audio, headless) | game-vm `pumpFrame` ×1200 (`scratch/perf/frame-prof.cjs`) | 7.0–7.7 ms/frame, 179–181 KB allocated/frame |
| browser JS share of `__apex.step(1/60,600)` | `tools/shot/profile-gameloop.mjs montreal physics` | GC 12.2 % of JS samples, `updateCar` 11.3 %, `update` 4.4 %, `updateCarLateral` 3.6 % |
| allocation by function (VM heap sampling incl. collected objects) | frame-prof | `updateCarLateral` 31, `updateCarBrakePlan` 16.6, `updateCar` 13.1, `updateCarAdvance` 5.7, `updateCarLongitudinal` 4.9, `Tracks.curvature` 4.3 KB/frame |

SwiftShader caveat: the browser profile is 89 % GPU sync (`getError`); only the JS
rows are evidence. The Node VM over-weights global lookups (`hasTM`, `vTop`) and its
DOM stubs allocate (`getComputedStyle`, `rect`, Proxy rows): those rows are harness
artifacts, not player cost. A full spans run (`profile.mjs --mode spans`) at 320×180
costs ~15 min per repeat here and was stopped; boot was not re-measured (PERF-HUNT-BOOT
rejected SwiftShader boot timings as noise-bound; the cold-SW waterfall remains open).

## Ranked findings

1. **Boxed doubles in the per-car step (open, largest).** ~70 KB/frame of the 180 is
   HeapNumber churn inside `updateCar*` (game.js 4690–6110). Field probe: two
   `%DebugPrint`s of an AI car one step apart (`--allow-natives-syntax`) show 14 numeric
   fields that get a NEW box every write (`_snapProg _snapX _snapSpeed kCur _vmaxNow
   kTurn steerSm steerCommand _prevS _preColS _preColX _preColSpd _otS aiBias`): they are
   Tagged because `CarFields.predeclare` seeds them `undefined` (behaviour-bearing, e.g.
   the `steerSm === undefined` seed). That is only ~4 KB/frame (14 × 22 × 12 B); the rest
   is double arguments/returns across non-inlined calls in functions too large for
   TurboFan's inlining budget. Not fixed here: a NaN sentinel changes `??`/`== null`
   readers, and splitting the step functions is a physics-lane refactor that must keep
   physics-characterization bit-identical. Tracked in the follow-up issue.
2. **`Math.hypot` in physics (open, not fixable bit-identically).** 4.9 KB/frame and slow
   (`frenetH` 2.2, `sweepContacts` 1.5). `Math.sqrt(a*a+b*b)` rounds differently, so it
   would move the physics hash; left as is.
3. **`for…of` iterators in `update()` (game.js:4341) and race-radio/race-facts
   (`next` 1.7 + 1.2 KB/frame in the VM).** Prior hunt listed it; TurboFan often
   elides array iterators in small functions but not in `update()`. Candidate for a
   claimed game.js pass (indexed loops, line-neutral).
4. **Per-frame UI/camera/input allocation (fixed here, small).** `Director.tick` built a
   `wantOn({...})` literal every race frame (0.116 → 0.033 KB/frame);
   `Input.lookStick()`/`consumeLookMouse()` returned fresh objects every rendered frame
   (now pooled; CamFeel copies the fields at once); `rivals.collect()` ran
   `G.cars.indexOf(c)` (O(n) inside the O(n) loop) and re-read `G.netPlay.active()` per car.
5. **Speed vignette writes (fixed perf; bug reported).** `CamFeel.paintVignette` wrote
   `style.opacity` every race frame, including `"0"` every frame once the setting had
   been on. The node lives under `#overlay`, which `UiLayers` observes with
   `attributeFilter: style`, so each write could drop the nav memo (`navDirty`) and
   re-run `navOpenNow()` (getComputedStyle + getBoundingClientRect). Now written only on
   change, in 1 % steps. Separate bug (not fixed, UI owner): `#overlay` is `hidden` in a
   race, so SPEED VIGNETTE never paints at all.
6. **HUD lane/fit layout reads** (`announceLane` laneRect, `fitHud` layoutRect) are the
   top `getBoundingClientRect` callers in the browser profile; owned by the HUD-fit lane
   (#2797/#3064) and already memoised — no change here.

Measured result of the fixes (frame-prof, montreal, 1200 frames, base = session HEAD):
179–181 → 179 KB/frame total; director tick −0.08 KB/frame. These are small: the
frame's garbage is dominated by finding 1.

## Sources

- V8 field representations and shapes: https://v8.dev/blog/react-cliff (cited by car-fields.js)
- Script evaluation and long tasks: https://web.dev/articles/script-evaluation-and-long-tasks
- Forced synchronous layout / layout thrashing: https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing
- Game-loop allocation and pooling: https://www.gamedev.net/articles/programming/general-and-gameplay-programming/writing-fast-javascript-for-games-interactive-applications-r3516/
- Hidden classes and inline caches (secondary): https://dev.to/omriluz1/hidden-classes-and-inline-caches-in-v8-43dd
