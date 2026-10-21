# Live debugger hunt — garage lag on TLX (B·H30, 2026-10-21)

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

## Not measured

- A real iPhone or a real GPU. The fix is main-thread DOM work, so a gpu-census Verdict is not the evidence
  for it; G4 (Car3D.build, room rebuild, pipeline cost on WebGPU) needs one before any GPU claim.
- Bryce's screen recording (pending) to confirm which steps he feels.
