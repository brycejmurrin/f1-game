# Live debugger hunt — garage lag on TLX (B·H30, B·H32, 2026-10-21)

Ask (Bryce, ~19:08Z via OrchB 26): "I still feel real lag when in the garage with three js web gpu and
selecting liveries editing them changing teams etc". Asked in session (AskUserQuestion, ~19:20Z): every
action lags (livery select, livery edit, team change, part switch); the shape is **choppy while dragging**;
a screen recording is to follow. Branch `cursor/live-debug-garage-1-b7h3`, base `e696b626`.

Box: cloud container, SwiftShader, no `/dev/dri`, no WebGPU adapter. TLX ran GL-forced. Frame times here
measure the software rasteriser (~2 s per garage frame at CPU x4) and are NOT phone evidence. The
main-thread numbers below (input dispatch ms, long tasks, CPU profile) are CPU-side and apply to any backend.

## Probe

`scratch/h30/drag-probe.mjs` (untracked): 844x390, `hasTouch`, CPU x4 (`Emulation.setCPUThrottlingRate`),
GARAGE → LIVERY → create, then BODY colour (`c1`) edits through the editor's own `<input type=color>`:
`drag16` = 150 `input` events 16 ms apart, then one `change` (a dragged picker); `drag120` = 20 events
120 ms apart; `taps` = 5 input+change pairs. Per scenario: input dispatch ms, rAF intervals, long tasks,
`Car3D.build` / `LiveryTex.buildAtlas` / `GarageScene.draw` counts and ms, and a CPU profile. `--mutlog`
records every MutationRecord over 20 drag steps.

## Findings

| id | file:line | severity | verdict | evidence | status |
|---|---|---|---|---|---|
| G1 | `js/garage/livery-design-editor.js` `sync` / bindings / `explain`; `js/garage/setup-sheet.js` `applyPreview`, `syncDeps`, `markAdvice`, `colorRow` sync, `refreshPalettes` | high | CONFIRMED-LIVE | A drag step rewrote unchanged DOM state: the preview swatch's stripe child (removed and re-added), every pill's `aria-pressed`, every pattern row's `aria-disabled` / `title` / `disabled`, the eight slider readouts' `textContent`, COMPARE's text, the reason lines and `aria-describedby`. Each write queues a MutationRecord even when the value is unchanged, and AriaState (class/childList under `#carsetup`), ScrollFade (childList → `measure`, a layout read) and SettingDeps (`disabled`/`aria-disabled`) each re-walk on it. CPU profile of `drag16` on the base: `scroll-fade measure` 4.8 s, `aria-state` 3.4 s, `querySelectorAll` 5.6 s, editor `sync`+`explain` 1.8 s of sampled self time; `Car3D.build` 0.4 s. | FIXED (this PR): write on change; the editor lists its fixed controls once |
| G2 | `js/garage/livery-design-editor.js` pattern-row binding vs the SWAP/RESET binding | low | CONFIRMED (unit) | Both bindings set SWAP COLOURS' `disabled`; with an adjustable one-colour pattern the first wrote `false` and the second `true` on every sync (a real attribute flip per drag step). The later binding always won, so the shown state was right. | FIXED: the row pass skips SWAP and RESET |
| G3 | `js/ui/setting-deps.js:273` (`r.textContent = text`), `:297`–`:309` (`hidden`, `data-dep-off`), run from the capture-phase `input` listener at `:428` | high | CONFIRMED-LIVE | After G1, the remaining records per drag step all come from SettingDeps' document-wide `refresh()`: each dep span's text replaced with the same text (childList +1/−1, ~20 spans in `#pmsettings`), `data-dep-off` re-set on 8 tune rows, `hidden` re-set on ~20 reason lines, `aria-describedby` on ~30 controls. That wakes AriaState and ScrollFade for `#pmsettings` on every input event anywhere in the app, not only the garage. | NOT MINE: `js/ui/**` is lane B·H28; handed off by message |
| G4 | `js/garage/setup-camera.js` `previewKey` / `SP_HULL_GEOM_FIELDS` | medium | CODE-TRACED | A colour edit still does a full `Car3D.build` (~400–480 ms at CPU x4 on this box) and a bay geometry rebuild (`GarageScene` `roomKeys` keys `geom` on paint; MEM-M1 #4). The 75 ms debounce means a fast drag previews only when the finger pauses. | NOT CHANGED this round: the next lever if a drag still feels choppy after G1+G3 |

| G5 | `js/car/liverytex.js` BRUSHED finish / TLX livery material | medium | REFUTED | gpu-census 39668066437 (macos-latest, real GPU): `livery_finish_sweep` gloss vs brushed, TLX WebGPU p50 33.4 / 33.3 ms. No steady per-frame BRUSHED shader cost. | — |
| G6 | `js/car/car-draw.js` `getCarDecalTexture` on a stock livery pick | low | REFUTED (stock picks) | gpu-census 39669394928 `livery_select_trace`: per pick, 0 `createRenderPipeline`, 1 `createTexture` and one 1–5 ms `buildAtlas`. A stock pick compiles nothing. The custom BRUSHED pick was never exercised (census bug, fixed in rev 16). | — |
| G7 | `js/car/car-draw.js:515` `schedulePlayerHiRes` (desktop-only 2048 swap) vs `js/render/three/tlx.js:2881` `TEX_POOL_MS` age-out | — | REFUTED (hi-res is not the cause) | gpu-census 39668649598 (rev 12, 60 s idle in the bay): one 2.2 s (WebGPU) / 4.4 s (WebGL2) stall ~10 s after the bay opens, main thread idle. Rev 15 (39671401662, hi-res arms first): 2200 / 3733 ms stalls on the two hi-res arms, none on the hi-res-off arms (max 150 / 167 ms). Rev 16 (39673751149) flipped the order: the FIRST arm, hi-res OFF, stalled 1933 ms at +2.35 s; the hi-res arms, run 3rd and 4th, max 150 / 133 ms. The stall follows the cold first launch(es), not the swap. | Not fixed (desktop-only anyway; Bryce 20:52Z: "focus on phone improvements only"). The cold stall is G9 |
| G8 | TLX WebGL2 idle plateau | — | REFUTED (runner drift) | rev 12: WebGL2 falls from ~25 to 13–17 fps after ~15 s idle and stays there; WebGPU does not. Rev 15 and rev 16 together: whichever arms run LATER sit at 12–17 fps on any backend, hi-res on or off (rev 16's first arm, WebGPU hi-res off, held 25–32 fps; rev 15's last two, hi-res off, 12–15). memState pool / rObj / progs / tier stay flat across the drop. | — |
| G9 | TLX first draw of late-arriving garage meshes (`js/render/three/`, `js/garage/`) | medium | OPEN (narrowed) | The one-time 1.7–3.7 s GPU stall a few seconds into the first garage visit of a cold browser (G7's evidence), main thread idle. Census rev 17 (39679600359): TLX warm ran from 8.6 s for 10.5 s (`scene` 9.2 s) and the stall (2583 ms) landed ~2.8 s after it finished; the title prebuild was idle (`garage-open` blocker), and the env probe was off. Rev 15 and rev 17 both show +7 TLX pool wrappers / render objects at the stall with `progs` flat. Rev 18 (39680476857) named the scene meshes appearing then: seven small meshes on the car's materials (444/24/288/120/8/4/8 verts) at +1.0 s, four more at +5.7 s. That fits a pipeline first built at that draw, after the warm. Not yet tied to a module: the arrival-in crew (7 actors, `crew-service.js`) only plays from the pit (`js/game.js:8955`), not in the menu garage the census opens. | Parked: G9's reach to the phone is unknown and Bryce asked for phone work. Next: name the owner of those meshes (a per-mesh owner tag in the census), then pre-warm their pipelines inside TLX's warm |
| G10 | `js/garage/setup-camera.js` hull key; `js/game.js:1293` `partsVisualKey` appends `"|L:" + liveryId` | medium | CONFIRMED-LIVE (phone path) | The turntable's framing-hull cache keyed on the preview key, which carries the livery id, so every first visit to a livery re-ran `framingHull` over ~19k points even when no geometry field differed. Phone-path probe (`scratch/h32/pick-probe.mjs`: iPhone UA, touch, 844x390, CPU x4, `LiveryTex.IS_PHONE` true): `framingHull` 781 ms inclusive over 3 first-visit picks (~260 ms each). | FIXED (#3448): `SetupCamera.hullKeyOf` drops the id and keeps team, parts, seat and `SP_HULL_GEOM_FIELDS`; guard in `setup-preview-hull.test.mjs` |
| G11 | `js/garage/setup-sheet.js` `livSwatch` | low | CONFIRMED-LIVE (phone path) | A livery pick rebuilds the sheet (`row.onclick` → `buildSetup`), and every one of the 113 cards made a new canvas + `getContext` + a cached-swatch `drawImage`: `livSwatch` 368 ms inclusive over 5 picks (~74 ms each). The painting itself was already cached (B·H13). | FIXED (#3455): `LiveryTex.swatchCanvas` lets the new card adopt last build's painted canvas; click-handler ms per pick (CPU x4, n=2) 421/285 → 251/189 |
| G12 | `js/garage/setup-sheet.js:1041` `row.onclick` → full `buildSetup` + `focus()` | medium | CONFIRMED-LIVE (phone path) | ~283 ms per pick at CPU x4 on every pick, cached car or not: `buildSetup` 823 ms + `focus` 572 ms (the forced layout of the new sheet) over 5 picks. | NOT CHANGED: a targeted active-row update would need to reproduce everything `buildSetup` refreshes |
| G13 | `js/garage/scene.js:1066` `roomKeys` keys the room geometry on paint | low | CONFIRMED-LIVE (phone path) | Every pick to a livery with other colours rebuilds the shell, LEDs, floor and props: `rebuild` 614 ms over 5 picks (~123 ms each), 15 `createMesh`. By design today: the bay wears the team colours. | NOT CHANGED |
| G14 | custom BRUSHED pick (Bryce's trigger, recording 12:12 PT) | — | NOT REPRODUCED (Mac GPU) | Census rev 16 picked the saved custom on all four arms: 0 pipelines and 0 textures per pick, no sustained dip over ten 1 s buckets (only drift-level fps). Bryce's 6–9 fps for ~10 s is phone-GPU-specific or tied to that livery's content. | Needs his livery export or an on-device trace |

## ~10 s timers that could fire in the bay (Bryce, ~20:15Z: "lagging happens in phases like every 10 seconds")

| timer | file:line | period | fires in the bay? |
|---|---|---|---|
| deferred 2048 hi-res atlas swap | `js/car/car-draw.js:515` (`requestIdleCallback`, re-queued while `timeRemaining() < 10`) | once per livery key, when the busy loop first leaves a 10 ms idle slot; seconds late on a slow GPU | yes, desktop only (`LiveryTex.IS_PHONE` returns at `:520`); skipped while a paint draft is open (`G.livDraftOverride`) |
| TLX retired-texture pool age-out | `js/render/three/tlx.js:2881` `TEX_POOL_MS = 10000`, `ageTexPool` `:2912` | an entry 10 s after it was retired | yes: every livery/team swap retires the old decal texture; its dispose lands 10 s later, phone included |
| TLX mesh-wrapper prune | `js/render/three/tlx.js:3546` `PRUNE_EVERY_MS = 5000`, `PRUNE_IDLE_MS = 20000` | a scan every 5 s; drops wrappers unseen 20 s | yes, from `present()`; after a team or part change the old car's wrappers drop ~20 s later |
| garage prebuild poll | `js/garage/prebuild.js:53` `POLL_MS = 1000` | 1 s | no: gated on the title surface (`titleCurrent`, `:92`) |
| PerfGov tier / scale steps | `js/game.js:8390` | per frame | no: `PerfGov.tick` runs only in `race` / `count` |
| thermal drift windows | `js/perf/thermal-drift.js:18` `WINDOW_MS = 10000` | 10 s windows | no: opt-in `apex26.thermalDrift=1`, fed from `PerfGov.tick` (race only) |
| surface-inspection | `js/garage/surface-inspection.js:10` `DURATION_MS = 5000` | one 5 s sequence | only when the player opens inspection |
| garage radio | `js/ui/loading-screen.js:840` `GARAGE_RADIO_MS = 2600` | once | at the roll-out, not in the bay |

Nothing in `js/garage/**` runs on a repeating ≥ 5 s timer. The two repeating candidates are TLX's pool age-out and prune, both in `js/render/three/` (B·H26's lane).

## Which findings reach Bryce's iPhone

Bryce plays on an iPhone (TLX; WebGPU when Safari exposes it). On a phone `GLX.isMobile` makes `LiveryTex.IS_PHONE`
true, so `schedulePlayerHiRes` returns at `js/car/car-draw.js:520` and the 2048 swap never runs.

| row | reaches the phone? |
|---|---|
| G1, G2 (drag DOM writes) | yes: main-thread DOM work, any device |
| G3 (SettingDeps refresh) | yes (B·H28, #3442) |
| G4 (colour edit rebuilds the car and the room) | yes: CPU-side |
| G7 (2048 swap) | no: desktop only, and not the stall anyway |
| G8 (late-arm plateau) | no: a runner artifact |
| G9 (cold-start GPU stall) | unknown: the census GPU is a macOS VM, and iOS keeps its own shader cache. If the late meshes also appear on a phone, their first draw would compile there too |
| G10, G11, G12, G13 (per-pick CPU cost) | yes: measured on the phone path (`IS_PHONE` true) at CPU x4; G10 fixed in #3448, G11 in #3455 |
| G14 (custom BRUSHED pick dip) | his report is from the phone; not reproduced on the Mac GPU |
| TLX texture pool age-out (`TEX_POOL_MS`) | yes, it runs everywhere; no stall seen at its 10 s mark in either census |

## Before / after (G1+G2), same base `e696b626`, n = 2 each

`drag16` (150 colour `input` events 16 ms apart, CPU x4, 844x390 touch, TLX GL-forced):

| metric | base run 1 / run 2 | fix run 1 / run 2 |
|---|---|---|
| input dispatch p50, ms | 21.8 / 18.3 | 12.1 / 10.6 |
| input dispatch max, ms | 74.4 / 43.8 | 28.7 / 25.3 |
| long tasks during the drag | 79 / 66 | 33 / 28 |
| long-task time during the drag, ms | 4990 / 4071 | 1926 / 1706 |
| garage-side MutationRecords per drag step | ~40+ (see G1) | 2 (swatch `style`, the input's `aria-description`: both real changes) |

`taps` and `drag120` are dominated by the debounced `Car3D.build` + room rebuild (G4) and did not move.

Guard: `tests/unit/livery-design.test.mjs` "a colour drag step writes nothing the editor already shows"
(three colour-only drag steps: 100+ writes on the base, 0 after).

## Before / after (G10), same base `76e45cb3`, n = 2 each

`scratch/h32/pick-probe.mjs` (untracked): iPhone UA, `hasTouch`, 844x390, CPU x4, TLX GL-forced, `LiveryTex.IS_PHONE`
true. Five LIVERY picks: `rb_matte`, `rb_holo`, `rb_matte` (cached), `rb_white`, `rb_matte` (cached). Base served
from a worktree at the base commit.

| metric | base run 1 / run 2 | fix run 1 / run 2 |
|---|---|---|
| `framingHull` inclusive over the five picks (CPU profile), ms | 781 / 619 | 195 / 130 |
| first-visit picks: longest task minus that pick's `Car3D.build`, mean of 3, ms | 655 / 784 | 508 / 458 |

`Car3D.build` itself swings 283–764 ms run to run on this box, so a pick's raw longest task is too noisy to carry
the claim; the profile and the build-subtracted residual agree on ~200–250 ms per first visit. The remaining hull
is `rb_white`, whose stripe presence differs (a real geometry change).

## Not measured

- A real iPhone or a real GPU. The fix is main-thread DOM work, so a gpu-census Verdict is not the evidence
  for it; G4 (Car3D.build, room rebuild, pipeline cost on WebGPU) needs one before any GPU claim.
- Bryce's screen recording (pending) to confirm which steps he feels.
