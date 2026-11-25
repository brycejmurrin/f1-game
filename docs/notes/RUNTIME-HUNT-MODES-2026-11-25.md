# Runtime hunt (modes) — 2026-11-25
Kind: measurement · Re-measure-by: 2027-02-25

Runtime hunter C. The flows hunter B (`docs/notes/RUNTIME-HUNT-PLAY-2026-11-24.md`) did not cover: Career and
My Team, the standalone Season, Practice, the Daily challenge, qualifying sessions and the Data Hub. Run on the
working tree at `282eef07`. Only findings are reported here; no code was changed. Bryce picks the fixes.

## Harness

- One headless Chromium at a time (AGENTS.md rules 4, 5). It is a persistent Node driver (`scratch/runtime-hunt-modes/`,
  not committed) built on `launchChromium` + `WEBGPU_CHROMIUM_ARGS` from `tools/lib/harness.mjs`, with an
  eval endpoint on 127.0.0.1. Viewport 852×393. Served from `python3 -m http.server` at `/?fullIntro=1`.
- Flows go through the real buttons (`#mb-*`, `#cr-*`, `#rs-go`, `#q-sim` / `#q-drive` / `#q-go`, `#res-next`,
  `#ss-*`, `#dh-tab-*`). Hooks are used only to read state (`info`, `careerState`, `field`, `world`,
  `lapHistory`, `GameStore`) and to skip racing time (`finishRace`, `careerSim`, `rollout`). The
  Daily and driven quali laps used a closed-loop `rollout` policy (lateral + heading P-control, a speed target
  from `nextCorner.apexSpeedKph`).
- Console errors and warnings, `pageerror` events and HTTP ≥ 400 responses were collected after every step.
- This box runs TLX on SwiftShader, so `PerfGov.softwareRaster()` is **true**. That matters for F1 below.
- Helper pitfall: `offsetParent` is null for `position: fixed` screens, so test visibility with
  `checkVisibility()` and `getClientRects()`.

## Flows covered

| Flow | Result |
|---|---|
| Career DRIVER: `#mb-career` → empty slot → Williams lead seat → START CAREER → hub | clean: save `apex26.career.driver.0` v2, `flow: career` |
| Career round 1: GO RACING → START QUALIFYING → SIMULATE → TO THE GRID → race → `finishRace` | clean: grid = quali order, +181 cr, round → 1, save written |
| Career results → `#res-next` → hub → GO RACING | **F1** |
| Career reload → CAREER MODES → slot 1: money, round, R&D part (`lean_burn`, −105 cr) | clean: everything persisted |
| Career hub → GARAGE → research a part → RETURN TO CAREER | clean when the hub was opened from the title |
| Career finale (`careerSim`) → VIEW CHAMPION → END OF SEASON → offers → MOVE to Alpine → SIGN CONTRACT | clean: 2027 / alpine / 2-year deal saved; signing sets `flow: career` again |
| MY TEAM: empty slot → hire Diego Salazar → START MY TEAM; `careerSim(5)` | clean: wages 62/round; sponsor 2+0+4+2+2 = 10 pts → +600, next sponsor rolls in |
| Season: CUSTOMISE → preset 5, SPRINT ON, 3 LAPS → APPLY → SPRINT QUALIFYING → sprint → TO THE GRAND PRIX → QUALIFYING → GP | clean: sprint table 8-7-6…, GP 25-18-15…, totals add up (ANT 5+25 = 30), stage advanced |
| Season NEXT ROUND → Monaco SPRINT QUALIFYING → BACK → race settings BACK → circuit BACK | **F2** |
| Practice: GOAL = BRAKING → PRACTICE SETUP → START PRACTICE | clean: TT-session practice, flying start, no errors |
| Daily: `#mb-daily` (ABU DHABI · RAIN) → SESSION SETUP (weather locked: › is a no-op) → START TIME TRIAL → driven lap | clean: 3:13.588 saved in `apex26.daily.v1`, title shows STREAK 1 and the history row, both survive a reload |
| One-off GP, grid = QUALIFYING, DRY → DRIVE MY LAP → driven lap with track-limit cuts → TO THE GRID | clean: lap deleted → P22, grid P22 of 22 |
| Data Hub: SCHEDULE, STANDINGS, RESULTS, LIVE, TELEMETRY, WATCH & DRIVE | clean: live Jolpica/OpenF1 data on every tab (next GP Qatar; 2026 standings; Las Vegas result) |
| Career slot picker with no save: programmatic click on the hidden `#cr-go` | **F3** |

No console errors in any flow except F3. The only warnings were the per-circuit `[scenery] suppressed …` counts.
No NaN reached `careerState`, the season save or `world()`.

## Ranked findings

`finding-verifier` on `282eef07`: F1, F2 and F3 are all CONFIRMED (0 refuted, 0 stale). For F1 it confirmed the clobber statically; the browser consequences above are this hunt's runs.

### F1 — After a career round, NEXT ROUND opens a hub that has dropped out of career mode (software raster)
- **Repro (3 of 3 runs):** start a career, race round 1 (quali → grid → `finishRace`), press `#res-next`.
  `info().flow` is `career` on that frame and `gp` within 150 ms: the samples read `career, gp, gp, …`. The
  hub still says ROUND 2 OF 23. Then:
  - GO RACING → race settings reads **START RACE**, not START QUALIFYING. The race is a one-off GP: the
    player is the team's real driver ("Carlos Sainz"), the results button reads RACE AGAIN, the money stays 1381,
    and `careerState().round` stays 1. The round is not scored.
  - GARAGE (the button still reads RETURN TO CAREER) is the free-play garage. The cap reads "FREE BUILD — no
    budget limit", parts show free-play prices (Lean Burn 35 cr, not RESEARCH · 105 cr), and fitting one charges
    nothing.
  - Leaving to the title and opening CAREER MODES → the slot again restores `flow: career`. Signing a contract
    on the offers sheet does too.
- **Mechanism:** the career branch of `els.resNext.onclick` (`js/game.js:9277-9291`) calls `quitToMenu()` and
  then `openCareer()` straight after it. `openCareer` sets `G.flow = "career"` (`js/ui/title-flow.js:189`).
  On a software raster, `quitToMenu` defers its tail
  (`js/game.js:4440` → `MenuTeardown.deferQuitTail`, `js/perf/menu-teardown.js:100`: `deferUi` is rAF +
  `setTimeout`, gated on `software()` = `PerfGov.softwareRaster()`, `js/perf/governor.js:734`). The deferred
  `MenuQuitTail.afterOverlay` then runs `d.setFlow("gp")` (`js/perf/menu-quit-tail.js:18`), which also calls
  `Career.engage(false)`. That overwrites the flow `openCareer` set. On a hardware GPU the tail runs
  synchronously inside `quitToMenu`, so `openCareer` wins.
- **Who hits it:** any device where three.js or GLX lands on a software adapter (`softwareGL` / `softAdapter`): a
  GPU-blocklisted or hardware-acceleration-off desktop browser, SwiftShader, and CI's llvmpipe. **It does not
  reproduce on Bryce's iPhone WebGPU path** (hardware adapter) or any hardware GPU. CI runs the career specs on
  software raster, but none presses GO RACING or GARAGE after `#res-next`. `career.spec.js:523` and
  `career-season.spec.js:307` only check the hub's text and the END OF SEASON label. So the bug is invisible to
  the suite.
- **Fix sketch:** give the quit tail a continuation and open the hub from it: `quitToMenu(forgetGp, { then:
  () => { trackIdx = Career.trackIndex(); openCareer(); } })`, run after `afterOverlay` on both the sync and the
  deferred route. Narrower alternative: in the career branch, wrap `openCareer()` in
  `MenuTeardown.deferUi` when `MenuTeardown.teardownActive()` is true, so it runs after the tail. Do not make
  the tail skip `setFlow`; the tail must still reset the flow for every other quit.
- **Test:** a VM unit test with `PerfGov.softwareRaster` stubbed true: click `#res-next` in a career, drain
  rAF and timers, and assert `flow === "career"` and `Career.inCareer()`. In `career.spec.js`, after
  `#res-next`, add `#cr-go` → `#rs-go` text START QUALIFYING. That runs on CI's software raster, so it catches
  this bug.
- **Same pattern elsewhere:** `js/garage/setup-trials.js:151,157` (RETURN TO / CANCEL SETUP COMPARISON) runs
  `G.quitToMenu(); G.openGarageFrom("menu")`. The free-play garage it opens already expects `flow: gp`, so no
  visible effect was traced. A continuation-based fix covers it too. The other `quitToMenu` callers
  (`js/game.js:9012`, `9100`, `9300`) do nothing after it.
- **Confidence:** high (reproduced three times and traced to the lines above; verifier CONFIRMED).

### F2 — STANDINGS stays hidden on the title after a Season round until reload
- **Repro:** start a fresh standalone Season and complete round 1. At boot there is no season progress, so
  `#mb-standings` is hidden. Press NEXT ROUND, then on the quali sheet `#q-back` → race settings `#rs-cancel` → circuit `#sel-back`.
  The title shows CONTINUE but no STANDINGS. A reload shows it.
- **Mechanism:** the door is repainted only at boot (`js/game.js:9577-9578`), in the quit tail
  (`js/perf/menu-quit-tail.js:24`) and in `career-ui.js:1822`. The BACK chain from the Season quali sheet
  reaches the title without `quitToMenu`, so no repaint runs. `info().flow` also stays `season` on the title.
  That is harmless because every door sets its own flow.
- **Fix sketch:** repaint `#mb-standings` from the title refresh (`TitleMenu`'s `refresh()`, which already
  repaints CONTINUE, CAREER and DAILY), or from `#sel-back`.
- **Test:** a DOM-level unit test. With a season save that has progress, call the title refresh and assert
  `#mb-standings` is not hidden.
- **Confidence:** medium-high (reproduced once; mechanism read).

### F3 — `#cr-go` throws when it is clicked while hidden on the slot picker (hook/agent-only)
- **Repro:** with no career save, `#mb-career`, then `document.getElementById("cr-go").click()`. The button is
  hidden on that screen (`career-ui.js:468`). Result: `TypeError: Cannot read properties of null (reading 'flavour')` at
  `buildSetupPanesNow` (`js/career/career-ui.js:841`), and `#__err_overlay` appears.
- **Mechanism:** the `#cr-go` onclick (`js/career/career-ui.js:1826`) takes the `!Career.active()` branch with
  `draft === null`, then calls `draftErrors(draft)` and `buildSetupPanes()`.
- **Player impact:** none known; a hidden button can't be tapped or focused. It matters for agents and specs
  that click by id.
- **Fix sketch:** `if (!draft) return;` at the top of that branch (or `if ($("cr-go").hidden) return;`).
- **Confidence:** high for the throw; low for any player route.

## Not findings (checked and ruled out)

- `finishRace()` mid-lap classifies the field at +0.000 s with a seconds-long "elapsed". That is the hook's
  synthetic finish, not a race-control bug.
- The LIVE tab showed "Some live data couldn't refresh." on its first open, once. It did not reproduce over
  five later opens, including a fresh profile and the same tab order. All four OpenF1 requests returned OK when
  called directly, and REFRESH cleared it. The cause is unknown (possibly a transient OpenF1 throttle). Not filed.
- The CONTINUE title door prefers the open career over a standalone season in progress. That is by design
  (`title-menu.js` "Priority: open career").
- The WATCH & DRIVE driver list labels each driver by **grid** slot ("P2 · RUS"), not by finish
  (`real-race-tab.js:138`). That is intended: it is the slot you start from.
- MY TEAM `sponsor.roundsLeft` is 4 at round 0 of a 5-round window. That counts the rounds after the current
  one (`career.js:1076`; the UI shows 0 as "this one").
- `sprint: true` with `sprintIds: []` means every round is a sprint (`season-cal.js:37`).
- Prior art (do not re-report): DEFECT-LEDGER career/season rows, UI-HUNT-FLOWS-2026-10-29 rows 3/4/6/7/10/11/12,
  and the fixed commits listed by the prior-art scout (9a977421, 3826a34b, d844668e, 83974371, 00f6f60a, bee24d26,
  254629f8). None of them covers F1–F3.

## Not run

- Phone-only checks (`runtime: needs-browser`): F1 on a real iPhone is expected **not** to reproduce (hardware
  adapter). A one-line confirmation on Bryce's phone would be: career round → NEXT ROUND → GO RACING reads START
  QUALIFYING.
- The VS FRIEND quali gate, the Season drop-worst / fastest-lap point options, the regulation-era rollover and
  the Data Hub EXPORT tab were not driven.
