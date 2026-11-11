# Apex 26 — architecture map (new contributors)

A short tour of how the game is put together. The module **contract** (what each
file may assume) lives in [ARCHITECTURE.md](ARCHITECTURE.md). Working rules live
in [`AGENTS.md`](../AGENTS.md). This page is the mental model.

## What you are looking at

Unofficial 3D F1 fan game (three.js on WebGPU or WebGL2; WebGL2 fallback). **No bundler, no framework.** Static files on
GitHub Pages. Every runtime JS file is a `"use strict"` IIFE that assigns **one
global**. The file you edit is the file the browser runs.

```
index.html          static DOM + <script> tags (?v=dev; Pages rewrites hashes)
css/                menus, HUD, overlays
js/game.js          entry: state machine, physics step, AI, race loop
js/*                domains (render, track, circuits, car, input, …)
tools/manifest.cjs  single source of truth for load order / lazy rosters
vendor/             three.js, Rapier, Trystero, jsQR (feature-gated)
assets/pack/        baked PBR material arrays (ships ON; failures degrade)
```

## Boot path

1. Browser loads `index.html`. Script tags follow `tools/manifest.cjs` (asserted
   by `tests/unit/load-order.test.mjs`). `js/core/log.js` is first.
2. `js/game.js` runs, builds the **`G` façade** (live getters over its closure
   state), and calls `Module.create(G)` on extracted subsystems. Modules must
   not reach into `game.js` internals — only through `G`.
   Boot injection and payload retries live in `ScriptLoader` and `LazyBundles`
   (`js/core/`); `RendererBoot` owns renderer selection and fallback. `TitleFlow`
   and `PlatformSession` own menu entry and platform/phone lifecycle wiring.
3. Renderer pick (`js/render/gfx.js`): default **TLX** (three.js), explicit
   WebGL2 **GLX**, opt-in **WGX** (WebGPU). All three are **DEFERRED** — injected
   at boot for the resolved choice, never tagged.
4. First race builds a circuit: `js/circuits/<id>.js` data +
   `js/circuits/scenery/<id>.js` (lazy) through the track engine in `js/track/`.
5. Frame loop: input → physics/AI/race-control → `gfx` draw/present → HUD DOM.

Dev / test surface: `window.__apex` (`js/agent/apex.js`, lazy). Prefer JSON
hooks (`info`, `physState`, `world`) over screenshots. See [DEBUG-HOOKS.md](DEBUG-HOOKS.md).

## Layer map

| Layer | Where | Role |
|---|---|---|
| **Shell / DOM** | `index.html`, `css/` | All static UI; game only shows/hides and paints text |
| **Entry / loop** | `js/game.js` | `state ∈ {menu,count,race,results}`; `flow` × `session` mode axes |
| **Input** | `js/input/` | Keyboard / pad / tilt / touch → driving + menu nav |
| **Physics** | `js/physics/`, parts of `game.js` | World-space player rigid body; track `(s,x)` is a readback |
| **AI / race** | `js/physics/ai-*.js`, `js/race/` | Field, flags, pits, weather, quali, daily |
| **Career / season** | `js/career/`, season UI | Saves under `apex26.career.*` / season standings |
| **Track engine** | `js/track/` | Splines, meshes, scenery API, props |
| **Circuit data** | `js/circuits/` | One def + one scenery file per circuit |
| **Car / garage** | `js/car/`, `js/garage/` | Mesh, liveries, parts, ghosts, setup bay |
| **Render** | `js/render/{glx,three,webgpu,shared}/` | One draw seam; three backends |
| **Audio** | `js/audio/` | Engine, SFX, radio, music |
| **Net** | `js/net/` | VS Friend WebRTC + Nostr room codes |
| **Data hub** | `js/data/` | External F1 API tabs (optional) |
| **Persist** | `js/core/store.js` | `apex26.*` localStorage + durable IDB mirror |

Large domain modules keep their public façade while delegating to focused
helpers. `Car3D` uses `CarGeometry` and `CarWheels`; `LiveryTex` uses
`LiveryGraphics`. `Input` composes bindings, pad menu navigation, haptics and
held-button handling. `GameAudio` keeps context/engine lifecycle and delegates
tone definitions, signal primitives, soundtrack playback and radio effects.
The lazy Data Hub separates API transport from endpoint mapping, and telemetry
model/render/player/view code from its tab controller.

Styles remain in `css/`, split by screen responsibility. Components, menu and
overlay families occupy contiguous positions in the manifest; moving a family
must preserve both its cascade order and its synchronous/deferred loading mode.

## Data flow (one race frame)

```
Input.poll()
    → player forces / assists (assists OFF ⇒ no racing-line force)
    → AI field + RaceControl flags
    → Collide / debris / incidents (side worlds)
    → gfx.begin → draw scene (including Particles / SkidMarks) → present (post)
    → GameHud DOM
```

Coordinates: **+Y up**, metres, radians, arc `s`, lateral `x` (+right).
`+k` = LEFT turn. Frac-keyed scenery tables must respect `def._sceneryShift`.

## Modes (not one enum)

- **`flow`**: `gp | season | career` — what the run is for
- **`session`**: `race | tt | quali` — what this visit to the track is

Career is a championship that also applies economy / R&D rules. See
[CAREER.md](CAREER.md). Physics invariants: [PHYSICS.md](PHYSICS.md) and
`AGENTS.md` §Physics (`PACE` is a scale; the arc must not reach the driver).

## Build / test / deploy

There is **no compile step**. Generated artifacts (`index.html` script blocks,
`js/roster.js`, `tools/README.md`, …) come from `npm run gen` / `tools/gen/*` —
never hand-edit those (see `AGENTS.md` rule 11).

| Command | When |
|---|---|
| `npx serve -l 3456 .` | Local play |
| `node tools/ci/verify-change.mjs --fast --json` | Diff-aware edit-loop gate; reports selected tooling files and critical-path budget |
| `node tools/ci/tooling-fast.mjs --changed --jobs=3` | Diff-aware structural edit-loop runner |
| `npm run test:tooling-fast` | The whole structural rung; runs on the PR as `Structural guards` |
| `node tools/ci/verify-change.mjs` | Fast gate + planned browser groups |
| `node tools/track/verify-track.cjs <id>` | One circuit build check |
| `node tools/ci/pick-tests.mjs` | Which browser GROUPS this diff needs |
| `node tools/ci/deploy.mjs --gate-only` | Optional: the deploy's node half, to reproduce a gate-only red (no push) |

Ship branch: `claude/f1-game-project-26h3ng` → Pages release train (`pages.yml`)
→ reusable CI release gate → publication at
https://brycejmurrin.github.io/f1-game/. Feature work: `cursor/<topic>-<hash>`
branches; sync with `node tools/ci/sync-pr.mjs`, not hand merges.
See [VERIFICATION.md](VERIFICATION.md#ci-and-pages) for PR, Pages, and live-site evidence.

The pre-push floor is `AGENTS.md` rule 3. Verification scales to the change —
one browser group is expensive on SwiftShader. Details: [TESTING.md](TESTING.md).

## Where to edit what

| Change | Edit |
|---|---|
| Circuit data / scenery dressing | `js/circuits/<id>.js` + `js/circuits/scenery/<id>.js` — see [SCENERY-AND-TRACK-BUILD.md](SCENERY-AND-TRACK-BUILD.md) |
| Shared spline / prop emitters | `js/track/` |
| Handling / pace / assists | `js/physics/`, tunables in `game.js` |
| Menu / pause / a11y | `js/ui/`, `css/`, DOM in `index.html` |
| Renderer bug | path-scoped rules in `.claude/rules/render-*.md` |
| New JS file | IIFE + `tools/manifest.cjs` + `npm run gen` |

### Where new code goes (ratchet headroom)

Many size ratchets in `tests/data/ratchets.json` run at or near `slack: 0`
(check `node tools/check/ratchets.mjs --json` for today's headroom), `js/game.js`
(lines / codeLines / gMembers / topLets) above all. **Do not grow
`game.js` to land a feature.** Put new logic in the domain directory that owns
it (`js/physics/`, `js/ui/`, `js/race/`, `js/camera/`, …) as a hyphenated IIFE
with `Module.create(G)` only when session state is required; prefer explicit
args over new `G` façade members. Extract cohesive blocks with
`tools/check/extract-module.mjs`, then
`node tools/check/ratchets.mjs --update` (**lower only**). Headroom carve queue:
[plans/2026-09-30-carve-headroom.md](plans/2026-09-30-carve-headroom.md).

## Related reading

- [ARCHITECTURE.md](ARCHITECTURE.md) — full module contracts + generated index
- [BUGS.md](BUGS.md) — open defects are GitHub issues labelled `bug`; the page points at the ledger
- [SCENERY-AND-TRACK-BUILD.md](SCENERY-AND-TRACK-BUILD.md) — track/scenery pipeline + accuracy levers
- [notes/ARCHITECTURE-REVIEW.md](notes/ARCHITECTURE-REVIEW.md) — founding bet & lessons
- [notes/DEFECT-LEDGER.md](notes/DEFECT-LEDGER.md) — historical open/fixed register
- [AGENT-SURFACE.md](AGENT-SURFACE.md) — skills, MCP, hooks map

---

## session flow (menu → race → results)

> Merged from `FLOW.md` on 2026-11-03 (docs/plans/2026-11-03-agent-surface-reset.md §4.9, D-001); links that named that page land here.

Read from `js/game.js` on the ship branch, not from memory. Function names, not line
numbers: the lines move every day, `grep` the name. Behaviour is described, not changed — if a
row below looks wrong, that is a finding for an issue, not an edit to this file.

For player-facing action sequences and the regression checklist, see
[usage paths](#usage-paths-and-journey-checklist) below. The symbols below were
re-checked against the tree on 2026-11-10.

### The state machine

`state` has exactly four values and ONE writer, `setState(next, why)` (it logs every
transition as `State a->b why=…`).

| `state` | entered by (`why`) | left by |
|---|---|---|
| `menu` | `quit` (`quitToMenu`), `quali-sheet` (`openQualiBody`), `sheet-start` (`startRaceFromSheet`) | `startRaceBody` → `count` |
| `count` | `race-start` (`startRaceBody`), `red-flag-restart` (`redFlagRestart`) | `lights-out` → `race`; `goRolling()` (`rolling-start`: a jump-in, WATCH from a lap, a designer test drive) → `race` |
| `race` | `lights-out`, `restart-green` (after a red flag), `rolling-start` | `endRace` → `results`; `quitToMenu` → `menu` |
| `results` | `endRace` (`flag`, `forced-order`, `quali-end`) | `quitToMenu` → `menu`; quick retry → `count`; championship/qualifying continuation → `menu` for a sheet/intro, then `count` |

```mermaid
stateDiagram-v2
  [*] --> menu
  menu --> count: startRaceBody (race-start)
  count --> race: lights-out / goRolling
  race --> count: red-flag-restart, pause RESTART
  race --> results: endRace
  results --> count: RACE AGAIN / TRY AGAIN (build cover)
  results --> menu: quitToMenu
  results --> menu: startRaceFromSheet (sheet-start; intro follows)
  race --> menu: quitToMenu (pause QUIT)
  count --> menu: quitToMenu
  menu --> menu: openQualiBody (quali sheet)
```

`quitToMenu` is the full teardown (HUD, lights, pause, rotate blocker, audio, session
entry, netplay, season reload, title overlay). `openQualiBody` also enters
`menu`: no race is up while the quali sheet is. `startRaceFromSheet` enters
`menu` for an intro while preserving qualifying, flow and the built circuit.
(The completed-season arm of
`startRaceBody` was a second one — it left the race chrome up — until it was changed to `quitToMenu`; see
the flow C PR "a start that finds the season finished".)

### Entering a session

Every start ends in `startRace()` → `SessionEntry.begin("race", key, prepare, commit, valid,
recover)` → `startRaceBody`. `key` is `entrySettings()` (track, flow, session, weather, laps,
team, grid, season round…).

- **superseded** (a newer start, or `quitToMenu` → `sessionEntry.cancel()`): the old request
  resolves `{kind:"canceled", reason:"superseded"}` and runs nothing.
- **settings changed** before commit (`valid()` false): `cancel()`, then `recover()` — for a
  race that is `quitToMenu()` — and `{kind:"canceled", reason:"settings changed"}`.
- **error**: `recover(e)` (`quitToMenu` + a "COULD NOT LOAD CIRCUIT" card), then the error rethrows.

`recover` is therefore a *quit*, never a hand-back of a previous race. A pause RESTART whose
`entrySettings()` changed in the async window ends on the title, not back in the old race.

| route | pre-race screen (garage → card → flyby) | calls |
|---|---|---|
| START RACE / START TIME TRIAL / START PRACTICE on RACE SETTINGS | yes (`raceIntroFromSheet`, sheet stays up as PREPARING…); START QUALIFYING first opens its sheet | `raceIntro(startRace)` |
| Data Hub JUMP IN / WATCH | card/flyby (`opts.intro`); outgoing garage is omitted for WATCH and mid-race JUMP IN | `raceIntro(startRace)` |
| designer TEST HERE | yes (a solo "my racing" start) | `raceIntro(go)`; `go` = `startRace`; the car is then placed on the point (`TrackDesigner.placeTest`) |
| qualifying TO THE GRID / DRIVE, championship next session/round | yes on a visible normal solo page; build cover only when hidden/headless/online or friend qualifying is armed | `startRaceFromSheet()` → `raceIntro(startRace)` or `startRaceCovered()` |
| one-off RACE AGAIN, TT TRY AGAIN | no — the build card covers the load | `startRaceCovered()` |
| pause RESTART | no | `startRace()` direct (disabled in an active friend race or armed friend qualifying) |
| red flag | no — re-grids in place | `redFlagRestart()` → `count` |

An intro that is abandoned (settings changed, or a stale request) ends in `titleIfBare()`:
it gives the sheet's buttons back and re-shows the title only when `state === "menu"` and no
screen is up.

While a designer test drive's return is armed (`CustomTracks.armReturn`), every
`startRace` that reaches its countdown calls `CustomTracks.afterStart()`, which puts the car
back on the test point and goes green: TRY AGAIN and RESTART return to the point, and
`quitToMenu` (via `consumeTrackHash`) reopens the designer.

### Leaving a session — what is shown at the flag, per mode

`endRace` runs once per session. Classification and championship/career award happen
there exactly once. Presentation after the award is either the **instant results
path** or a short **ceremony** (`RaceCeremony`, `js/race/ceremony.js`; plan
[`2026-10-27-cooldown-podium.md`](plans/2026-10-27-cooldown-podium.md)) before the
full sheet owns the session. A natural flag arms it (`RaceCeremony.want(true)` in
`js/game.js`); `RaceCeremony.afterClassify` then starts it when the session is
eligible, else unhides `#results`.

Pieces that can follow the award:

1. **Ceremony** (eligible solo GP / sprint / season / career only): `cooldown` →
   `parcFerme` → optional `podium` → `results` (`RaceCeremony.PHASES`; beats
   `CooldownLap`, `ParcFerme`, `RacePodium` + `PodiumBeat`). SKIP/CONTINUE advances; Esc = SKIP.
   `__apex.finishRace({ ceremony: true })` opts in; bare `finishRace()` keeps the
   instant path for existing harnesses.
2. **Chequered cut + orbit, with optional HIGHLIGHTS** (`ResultsCam.onFlag`) — the
   first frame of ceremony or of `results` when ceremony is skipped.
3. **TV director** on the player's own car (`Director`, `autoSpectate` once
   `player.finished` or `retired`) — the *player finished, field still running*
   wait (`USAGE-PATHS` R11). Ceremony is different: the player may still drive
   the cooldown lap after classification.
4. The **results surface** (`#results` / TT / quali sheet).

| mode | Ceremony | ResultsCam (cheq → orbit → highlights) | TV director on own car | surface |
|---|---|---|---|---|
| solo GP / sprint | on (`RaceCeremony.eligible`) | yes — if `enabled` (see below) | yes, after the player finishes (pre-ceremony wait) | results sheet after ceremony (or instant if ceremony off / skipped) |
| season / career round | as GP | as GP | as GP | results sheet (+ career settlement); settlement stays in `endRace`, sheet show deferred until `results` phase |
| practice / duel | **off** | yes — if `enabled` | yes, after the player finishes | results sheet |
| time trial | **off** (`ceremony().eligible === false`) | **no** — `endRace` returns before `onFlag` | yes (the player finishes) | TT results |
| qualifying | **off** | **no** — returns to the quali sheet first | yes | quali sheet (`q-done`) |
| friend race (netplay) | **off** | **no** — `allowed()` is false while `netPlay.active()` | **no** — `wantOn` is false when `net` | results sheet, the host's classification |
| WATCH (RealRace replay) | **off** | **no** — `eligible()` is `!realRace.isWatch()` | **no** — the replay owns the picture | results sheet (published classification) |
| any mode on **mobile** / `PerfGov.tier() >= 2` | timers + SKIP + frozen frame (no live ResultsCam orbit) | **no** — `enabled()` is false | as the row above | the last race frame **freezes** behind the sheet: `render()` returns early when `state === "results"` and the cam is not live |

Ceremony phase table (eligible sessions only; see the plan for timers and SKIP):

| phase | player | camera | UI |
|---|---|---|---|
| `cooldown` | drive (throttle/brake/steer); AI cools or parks | chase / cockpit | thin HUD + SKIP |
| `parcFerme` | none | ResultsCam park / orbit on pit subject | caption + SKIP |
| `podium` | none (only with a full podium, `RaceCeremony.podiumCount`) | ResultsCam on winner | `PodiumBeat` (`#ceremony-podium`, the `ResultsStory` podium) + CONTINUE |
| `results` | sheet buttons | today's cheq → orbit (or resume); HIGHLIGHTS opt-in | `buildResults` + `#results` |

Retired / DSQ player: skip the cooldown drive; no podium unless classified P≤3.
Browser gate: `tests/specs/results-flow.spec.js` (`test:results-flow`). Acceptance
must observe a real line crossing and automatic phase progression, then exercise
the actual SKIP / CONTINUE controls. A capability skip, debug phase seek, or
`finishRace({ ceremony: true })` alone does not verify the production finish path.
The separately named harness cases cover backward compatibility and settlement;
they are not evidence of natural progression. Slice integration and the complete
mode / cleanup matrix remain unverified until the integrated browser gate runs.

Two consequences worth knowing before changing any of it:

1. TT and qualifying skip the cut that GP gets, yet still switch to TV once the player is done —
   the table is inconsistent by construction, not by a single decision.
2. On mobile (and under load) the results screen is a still image by design (unpaid work
   avoided); ceremony on phone advances on timers + SKIP without paying for a live orbit.

### Where to look

| question | read |
|---|---|
| what runs on quit | `quitToMenu` (`js/game.js`) |
| the async gap before a start | `js/race/session-entry.js`, `startRace` |
| the pre-race screen | `raceIntro`, `afterGarageOut`, `studioOpen`/`studioDone` |
| the finish | `endRace`, `RaceCeremony` (`js/race/ceremony.js`), `js/camera/results-cam.js`, `js/camera/director.js` (`wantOn`) |
| results sheet and its buttons | `js/ui/results-sheet.js`, `els.resNext.onclick` (`js/game.js`) |
| ceremony browser gate | `tests/specs/results-flow.spec.js` |
| pause menu | `setPaused`, `#pm-restart` / `#pm-quit` handlers |

---

## usage paths and journey checklist

> Merged from `USAGE-PATHS.md` on 2026-11-03 (docs/plans/2026-11-03-agent-surface-reset.md §4.9, D-001); links that named that page land here.

This map follows the player from an entry point through a session and back out.
Use it to choose regression journeys, including the full **menu → Race → Garage
→ start → restart → finish with TV cameras → menu** loop.

The routes below were traced through the handlers and shell (doors and settings
pages re-checked 2026-11-10). They are **source-verified, not a claim that every
journey has been played in a browser**. The [UI map](UI-MAP.md) supplies the
detailed control inventory; [session flow](#session-flow-menu--race--results)
explains the engine state and asynchronous entry.

“All paths” means the distinct entry, forward, back, restart, completion and
recovery branches. Repeating a restart, switching settings, or doing another
season creates unlimited sequences. Cover each branch, then repeat loops to
catch state leaking between visits; do not enumerate every permutation of
circuits, cars and setting values.

### 1. The requested race journey

Use a solo GP, a short distance, and a desktop rendering tier that supports
the results camera. Keep qualifying off for this first journey.

| Step | Player action | Expected destination / checkpoint |
|---|---|---|
| 1 | Main menu (`#overlay`) → **RACE** (`#mb-race`) | Circuit picker (`#select`); free-play race mode. |
| 2 | Choose a circuit → **YOUR CAR** (`#sel-car`) | Garage (`#carsetup`), remembering the picker as its caller. |
| 3 | Choose team, parts, setup or livery → **RACE SETUP** (`#cs-done`) | Race settings (`#race-settings`). **BACK** (`#cs-back`) instead returns to the picker; it also keeps the car changes. |
| 4 | Set distance, conditions and grid → **START RACE** (`#rs-go`) | Settings shows PREPARING… while needed, then garage drive-out → session card / circuit flyby (`#loading`) → grid lights. This animated garage is separate from the editable Garage in step 2. |
| 5 | Lights out → drive | Race HUD and player control; menu/loading input gates released. |
| 6 | Pause (`#pausemenu`) → **RESTART RACE** (`#pm-restart`) | With Confirm Quit on, press again to confirm. New grid/countdown for the same session; no garage/flyby replay. |
| 7 | Select **TV**, then drive to the flag | Hold/right-click CAM to open its picker, or cycle with CAM / C. Choose **TV**, not the separate **TV SIDE** rig. Camera choice does not drive the car for you. |
| 8 | Finish → let the rest of the field finish | Automatic TV spectating follows the remaining runners in eligible solo sessions, with the player as fallback when no runners remain. During the wait, Enter or Pause → **SKIP TO RESULTS** can advance (R11). |
| 9 | Flag → ceremony (`RaceCeremony`) **or** instant results | Eligible solo GP / sprint / season / career: cooldown lap → parc fermé → optional podium → `#results` (R13). SKIP/CONTINUE advances; bare harness `finishRace()` still opens the sheet immediately. Ineligible modes (TT, quali, practice, duel, friend, WATCH) go straight to their surface. |
| 10 | Results (`#results`) | Classification appears once (settled in `endRace`). Eligible GP uses the chequered cut, then orbit; **HIGHLIGHTS** is a separate optional action from the sheet foot. |
| 11 | **MENU** (`#res-menu`) | Main menu, with the race, replay, pause and loading surfaces torn down. Start a second race to check that no stale state survives. |

```mermaid
flowchart TD
  M[Main menu] -->|RACE| S[Circuit picker]
  S -->|YOUR CAR| G[Garage]
  G -->|BACK / Escape| S
  G -->|RACE SETUP| C[Race settings]
  S -->|NEXT| C
  C -->|BACK| S
  C -->|START RACE| I[Preparation → garage drive-out → card / flyby]
  I --> L[Grid lights]
  L --> R[Driving]
  R -->|Pause| P[Pause menu]
  P -->|Resume| R
  P -->|Restart; confirm if enabled| L
  P -->|Quit; confirm if enabled| M
  R -->|Player finishes / retires| T[Automatic TV; field finishing]
  T -->|Field completes / Skip to results| F[Results; eligible finish camera]
  F -->|HIGHLIGHTS| H[Highlights]
  H --> F
  F -->|RACE AGAIN| L
  F -->|MENU| M
```

The graph abbreviates quick restarts' build cover and shows the solo GP path.
Qualifying, online races and WATCH have the branches below. Primary source:
[`js/game.js`](../js/game.js) (`openGarage`, `garageBack`, `startRaceFromSheet`,
`startRaceCovered`, `setPaused`, `endRace`, `quitToMenu`),
[`race-settings.js`](../js/race/race-settings.js),
[`mode-switch.js`](../js/camera/mode-switch.js).

### 2. Every main-menu door

Each row is a journey family. Conditional doors must be tested both present
and absent; Continue stages a menu/hub, not an in-progress physics snapshot.

| ID | Main-menu door | Forward route | Return route / condition |
|---|---|---|---|
| M01 | RACE (`#mb-race`) | Circuit picker → NEXT → race settings → start. Optional YOUR CAR detour above. | Picker BACK → menu; settings BACK → picker. |
| M02 | TIME TRIAL (`#mb-tt`) | TT picker → settings → start → TT results → TRY AGAIN. | Picker BACK or results MENU → menu. |
| M03 | DAILY TIME TRIAL (`#mb-daily`) | Today's challenge → TT picker/settings → run → daily/TT result and retry/share actions. | BACK/MENU; also enter Daily Standard and Daily Open from the TT filters. |
| M04 | PRACTICE (`#mb-practice`) | Solo practice goal → picker → practice settings → drive with coaching/checkpoints. | Pause → quit, or TT-style result → menu/retry. This door uses `session = tt`; test a later ordinary TT/Race visit for stale PRACTICE labels. |
| M05 | SEASON (`#mb-season`) | Championship picker → optional CUSTOMISE SEASON (`#season-setup`) → settings → weekend. | Customisation BACK → picker; picker BACK → menu. Finished saves offer final standings/new season. |
| M06 | CAREER MODES (`#mb-career`) | Slot picker (`#career`) → new Driver/My Team setup or existing career hub. | Title-opened slot picker MAIN MENU → menu; hub-opened slot picker BACK → hub. |
| M07 | CONTINUE (`#mb-continue`) | Depending on saved hint: career hub, Daily picker, or last free-play circuit/session picker. | Corresponding hub/picker exit. Hidden without a usable hint. |
| M08 | RACE A FRIEND (`#mb-vs`) | Lazy bundle → lobby (`#vsfriend`) → host/join → agree settings → optional qualifying → online race. | CLOSE/cancel → menu; failed bundle load leaves the title usable with a message. |
| M09 | WATCH (`#mb-watch`) | Data Hub opened on its WATCH & DRIVE tab (`openDataHub("race")`) → load event → WATCH/HIGHLIGHTS. | Hub CLOSE → menu; replay pause/quit or result exit → menu. |
| M10 | DATA HUB (`#mb-data`) | Data Hub (`#datahub`): the tabs in `TABS` (`js/data/hub.js`); the developer GPS TRACE EXPORT sits behind its ⋯ menu. | CLOSE (`#dh-close-btn`) → menu. See D paths. |
| M11 | TRACK DESIGNER (`#mb-designer`) | Designer (`#trackdesigner`) → edit/save/test/race/share. | CLOSE → menu; TEST HERE has a special return to the designer. |
| M12 | GARAGE (`#mb-garage`) | Garage → team/parts/setup/livery and camera tools. | CLOSE GARAGE / BACK / Escape → menu. |
| M13 | PHOTO STUDIO (`#mb-photo`) | Home subject → framing/capture/background controls (`#photo-studio`). | DONE / Escape restores Home. Door waits while a required Home track scene is loading. |
| M14 | SETTINGS (`#mb-settings`) | Settings (`#pmsettings`) index → a settings page or editor. | Page BACK → index; index BACK → menu. |
| M15 | HOW TO PLAY (`#mb-help`) | Help anchors and input instructions (`#howtoplay`). | CLOSE / Escape → menu; closing clears a stale help-section hash. |
| M16 | STANDINGS (`#mb-standings`) | Standalone championship standings (`#standings`). | CLOSE → menu; shown for an in-progress standalone season. |
| M17 | USE AS CONTROLLER (`#mb-phonepad`) | `controller.html` → room code / pairing → phone driving controls. | Disconnect/browser return; door is conditional on coarse-pointer input. |
| M18 | VISUAL STUDIO (`#mb-visual`) | Settings opened straight on its VISUAL STUDIO page (`TitleMenu` `wireShortcuts`). | As M14. |
| M19 | SAVES & DATA (`#mb-saves`) | Settings opened straight on its SAVES & DATA page (`wireShortcuts`). | As M14. |

Sources: [`index.html`](../index.html), [`title-flow.js`](../js/ui/title-flow.js),
[`title-menu.js`](../js/ui/title-menu.js), [`experience.js`](../js/ui/experience.js),
[`platform-session.js`](../js/ui/platform-session.js), [`js/game.js`](../js/game.js).

### 3. Selection, Garage and race preparation

| ID | Route / branch | Expected result |
|---|---|---|
| S01 | Picker → filter/search/favourite → circuit detail (`#track-detail`) → close | Same picker and selected circuit; favourite state persists. Include saved custom circuits and their EDIT chip (`#sel-edit-chip`, opens the designer). |
| S02 | Picker → YOUR CAR → Garage → BACK | Same picker; selected car changes retained. |
| S03 | Picker → YOUR CAR → Garage → RACE SETUP → settings BACK | Back reaches the picker, not Garage. |
| S04 | Garage → team picker (`#teampicker`) → select/close; My Team → customisation (`#customize`) → save/cancel | Return to Garage. Cancel the customisation draft separately from leaving Garage, whose selected parts are already kept. |
| S05 | Visit each Garage tab → select a part/setup/livery → leave → reopen | Team, Engine, Aero, Susp, Brakes, Tyres, ERS, Gearbox, Fuel, Exhaust, Floor, Cockpit, Wheels, Setup, Livery. Check budget/ownership restrictions in career and editable livery save/cancel/duplicate/delete. |
| S06 | Settings → presets/manual options → duel picker (`#duel-picker`) → choose/close | Return to settings; changed mode, distance and grid determine the correct start label. Practice/TT/Daily/championship expose different subsets. |
| S07 | START → preparation → garage drive-out → flyby → lights → race | One start commits. Compare cold/warm circuit loads and a normal intro with a tap-to-skip intro. Skip advances presentation; it does not cancel back to menu. |
| S08 | Start via qualifying DRIVE / TO THE GRID, or championship next session | On a visible normal solo page, `startRaceFromSheet()` also plays garage/flyby. Hidden/headless/online or armed friend qualifying uses build cover only. |
| S09 | Pause RESTART; one-off RACE AGAIN; TT TRY AGAIN | Quick start, without the full intro. Restart must reset the session, replay buffer and result presentation. |

Garage's caller is part of the navigation state:

| Caller | Forward exit | Back / Escape |
|---|---|---|
| Main menu / shared setup or livery | CLOSE GARAGE → menu | Menu |
| Circuit picker | RACE SETUP → race settings | Picker |
| Career hub | RETURN TO CAREER → hub | Hub |
| Friend lobby | RETURN TO LOBBY → waiting room, car selection synced | Same lobby |
| In-race WORK ON CAR | RETURN TO RACE → pit stop resumes | Same race; changes are retained and work time applies if the spec changed |

Sources: [`select-screen.js`](../js/ui/select-screen.js),
[`race-settings.js`](../js/race/race-settings.js),
[`setup-sheet.js`](../js/garage/setup-sheet.js), [`js/game.js`](../js/game.js).

### 4. Qualifying, season and career loops

| ID | Journey | Required branch / return check |
|---|---|---|
| C01 | Race settings with qualifying → qualifying sheet (`#quali`) → DRIVE → out-lap/flying lap → completed qualifying sheet → TO THE GRID → race | Completion returns to qualifying, not GP results. Grid uses the qualifying classification. |
| C02 | Same setup → SIMULATE → completed sheet → TO THE GRID | No driven qualifying session; still a classified grid. |
| C03 | Unrun qualifying → BACK → race settings → BACK | Restore `session = race`; return to the originating picker/career hub. |
| C04 | Completed solo qualifying → MENU / Escape → menu → resume the matching weekend | Standalone season/career classification remains available for continuation. Quitting a one-off GP discards its qualifying order; it has no matching weekend to resume. Quitting a completed sheet differs from cancelling an unrun one. |
| C05 | Season → customise calendar/format → BACK or APPLY | BACK discards draft. Unchanged APPLY preserves an unfinished season, including its qualifying grid. Changed rules confirm before discarding standings or qualifying. A completed season's START NEW SEASON confirms and restarts at round zero even with unchanged rules. |
| C06 | Season, qualifying off → GP → results → NEXT ROUND → next start | Correct next circuit and distance. Race settings is not an obligatory stop between every round. |
| C07 | Season, qualifying on and sprint enabled → sprint qualifying → sprint → TO THE GRAND PRIX → GP qualifying → GP → NEXT ROUND | Sprint keeps the circuit/round; the GP advances it. Each racing session gets its own qualifying branch. |
| C08 | Final season result → VIEW CHAMPION → MAIN MENU | First press shows champion panel on results; second exits and clears the standalone season. Existing finished save → final standings is a separate entry. |
| C09 | Career Modes → empty Driver slot → identity/team/seat → START CAREER → hub | Invalid setup stays on setup with errors; starting creates the selected slot and opens the hub. Repeat for My Team creation/hire. |
| C10 | Career hub → Garage / guide / history / offers / save slots → back | Return to correct caller. Relevant roots: `#career-guide`, `#career-history`, `#career-offers`. Existing slots open their own career. |
| C11 | Career hub → GO RACING → settings → qualifying/race → results → career continuation | Result continuation tears down the race and returns to the hub for settlement/upgrades; it does not jump straight into the next round. |
| C12 | Career season ends → hub → offers/rollover → accept/continue → next season | Driver contract and My Team branches differ; new season starts on its opening circuit. |
| C13 | Slot picker → export/import/delete, including confirm/cancel and invalid backup | Stay in slot management or return via its origin. Exercise destructive variants only on disposable saves; reload verifies save isolation. |

Sources: [`js/game.js`](../js/game.js) (`openQualiBody`, `q-*` handlers,
`resNext.onclick`), [`career-ui.js`](../js/career/career-ui.js),
[`season-ui.js`](../js/career/season-ui.js), [`results-sheet.js`](../js/ui/results-sheet.js).

### 5. During the session and at the finish

| ID | Journey | Required branch / return check |
|---|---|---|
| R01 | Driving → Pause → RESUME / Escape | Same solo session resumes; normal player interaction has a short resume countdown. Automation suppresses that countdown. |
| R02 | Pause → Settings / How to Play / championship Standings → back → resume | Child closes to pause; no settings key/wheel capture remains armed after resume. |
| R03 | Pause → STRATEGY / PRACTICE / REVIEW (`#pm-quick-doors`) → back | Each opens its session-scoped Settings page (`SettingsNav` routes `strategy`, `practice`, `review`). Check checkpoint save/retry/rewind enabled and disabled states, then return to driving. |
| R04 | Pause → RECOVER CAR | Resume and request recovery in the current session, not a new race. |
| R05 | Pause → RESTART or QUIT | Confirm on: first tap arms, second acts; confirm off: one tap. Restart is disabled during active friend racing or armed friend qualifying. |
| R06 | Race → pit lane → service box → WORK ON CAR → arrival → Garage → RETURN TO RACE | Same session stays frozen in Garage; changing the car adds work time, a no-change visit does not. Escape during arrival can skip it before the normal Garage Back route applies. |
| R07 | Driving → CAM picker/cycle → TV or another rig → driving | Manual camera selection stays within the session. Hide HUD → restore eye is another reversible in-race branch. |
| R08 | Solo race → Pause → instant REPLAY → scrub/play/camera → leave replay/resume | Live race snapshot is restored; replay must not settle results or mutate championship progress. Requires recorded frames. |
| R09 | Pause → PHOTO STUDIO → capture/edit → DONE | Restore the previous paused race and caller; WATCH PHOTO restores its own replay context. |
| R10 | Caution/VSC/safety car → green; red flag → restart countdown → race | Race-control transitions, not the user's RESTART command. Same session continues. |
| R11 | Player finishes or retires → TV waiting phase → natural results or SKIP TO RESULTS | Settlement happens once; skip only appears during the post-finish wait. Also quit during that wait to exercise settlement-before-teardown. Pre-ceremony field wait; not the cooldown drive. |
| R12 | GP results → HIGHLIGHTS → orbit/results → RACE AGAIN or MENU | Only when eligible and replay data exists; retry/quit clears results-camera and scrub ownership. |
| R13 | Eligible GP flag → ceremony (`cooldown` → `parcFerme` → optional `podium`) → `#results` | `RaceCeremony` (`js/race/ceremony.js`). Actual SKIP / CONTINUE controls advance each beat through to results without soft-lock; `ceremony().eligible === false` for TT/quali/practice/duel/friend/WATCH. Phone 844×390: SKIP ≥ `--tap`. Gate: `tests/specs/results-flow.spec.js`. |

R13 acceptance crosses the real finish line and observes automatic progression.
Debug phase seeks and capability-skipped cases are not acceptance evidence.
The gate must also exercise actual touch controls, settlement exactly once,
cleanup, excluded modes, and reduced-motion / performance behavior. The
integrated production path and complete matrix still require browser verification.

Three camera concepts need separate checks: **TV** while driving, automatic
**post-finish spectating**, and **ResultsCam** after classification. Ceremony adds
a **cooldown chase** (player still drives) before ResultsCam owns parc fermé /
podium. Real-race WATCH has a fourth, independent replay director.

| Session / device | Post-finish TV | Ceremony | Results surface and camera | Forward / exit |
|---|---|---|---|---|
| Solo GP / sprint | Automatic on finished/retired player (field wait) | cooldown → parc fermé → optional podium (`RaceCeremony`) | GP results after ceremony (or instant); eligible chequered → orbit, optional highlights | RACE AGAIN / MENU |
| Solo race-form practice / duel | As solo GP | **off** | GP results; eligible chequered → orbit, optional highlights | RACE AGAIN / MENU |
| Standalone season | As solo GP | as solo GP | Race results + championship standings (sheet after ceremony) | Next weekend session/round; champion branch at end |
| Career | As solo GP | as solo GP | Race results + career settlement (award in `endRace`; sheet later) | Career hub / menu |
| TT, Daily, title PRACTICE (TT) | Director can activate after finish | **off** | TT results; skips `ResultsCam.onFlag` | TRY AGAIN / MENU, plus available ghost/share actions |
| Qualifying | Director can activate after finish | **off** | Completed qualifying sheet; no GP results montage | TO THE GRID / MENU |
| Friend race | Disabled | **off** | Host's classification; no ResultsCam | RACE AGAIN (SOLO), or NEW FRIEND ROOM (teardown → new lobby) |
| Real-race WATCH | Replay owns the camera | **off** | Published classification; no ResultsCam | WATCH AGAIN / MENU |
| Mobile or `PerfGov.tier() >= 2` | Depends on session as above | timers + SKIP + frozen frame | ResultsCam disabled; results background stays still | Same session-specific buttons |

Sources: [`js/game.js`](../js/game.js), [`pause-opts.js`](../js/ui/pause-opts.js),
[`director.js`](../js/camera/director.js), [`results-cam.js`](../js/camera/results-cam.js),
[`replay-buf.js`](../js/camera/replay-buf.js), [`experience.js`](../js/ui/experience.js),
[session flow §Leaving a session](#leaving-a-session--what-is-shown-at-the-flag-per-mode), plan
[`2026-10-27-cooldown-podium.md`](plans/2026-10-27-cooldown-podium.md).

### 6. Data, online racing, authoring and tools

| ID | Journey | Return / exceptional branch |
|---|---|---|
| D01 | Data Hub → each browsing tab → event/session/year/driver selection → detail/telemetry playback → close | Remain in Hub until CLOSE; include empty data, loading and provider errors. Export → gather → download is conditional on data. |
| D02 | WATCH & DRIVE → event/seat → START from lap 1 | Race intro → simulated real-event scenario → results/menu. |
| D03 | WATCH & DRIVE → lap → JUMP IN | Card/flyby → rolling start and handover countdown → drive. No outgoing-garage shot for a mid-race entry. |
| D04 | WATCH / HIGHLIGHTS → load recorded positions → replay | No player drive-out. Pause/play, speed, timeline seek, previous/next event, driver follow, camera, AUTO/FOLLOW LOCK and PHOTO all return to replay. Finish → WATCH AGAIN or MENU; quit and re-enter to test camera reset. |
| N01 | Friend lobby → host → code/link/QR/manual offer → peer joins → settings/car → start | Host stages race settings; their settings CTA returns to lobby rather than independently starting a race. Garage returns to the same room. |
| N02 | Join → enter/scan invite → answer/connect → ready → race | Include rejected/expired code, incompatible build, connection failure and cancellation. Close/reopen while clipboard or connection preparation is pending: old results must not alter the replacement lobby, and fresh retries must still work. |
| N03 | Friend qualifying → drive or simulate → wait for peers → grid | Grid is gated on peers. BACK before completion aborts to lobby; completed MENU can require a second press while waiting. Timeout/disconnect must leave a way out. |
| N04 | Online race → pause → resume / peer disconnect / host result while paused | Online simulation continues behind pause. Result closes pause; classification is authoritative. Check NEW FRIEND ROOM and RACE AGAIN (SOLO) separately. |
| N05 | Settings Controls → phone pairing → controller page → connect → drive → disconnect | Connected display switches to VISOR; disconnect restores prior camera unless the player changed it. Start calibration then Reset/Back/reconnect: no late offset may be saved. Reconnect while rebinding: hidden capture must stop; explicit rebind and calibration retries must still work. Include wheel setup cancellation. |
| E01 | Track Designer → edit/check/fix → SAVE → MY CIRCUITS → RACE or TIME TRIAL | Opens ordinary picker for the saved circuit → settings → session → menu. Invalid red checks/full library can block saving/starting. |
| E02 | Designer → select point → TEST HERE → drive → restart/retry → quit | Solo rolling test starts at selected point; restart/retry repositions there. Quit reopens the same designer selection. This return overrides the ordinary menu destination. |
| E03 | Designer → share/export/import or library management → continue editing → close | Shared circuit link opens a draft; SAVE keeps it. Include invalid import, unsaved close and delete confirmation branches. |
| E04 | Home/Garage/paused race/WATCH → Photo Studio → subject/framing/capture → save/download/background → DONE | Restore the actual caller. Home can switch between garage and circuit subjects; photo background can then be selected for Home. |
| E05 | Settings → each index door (the routes in `SettingsNav`, `js/ui/settings-tabs.js`; list in the [UI map](UI-MAP.md#settings-pmsettings)) | Back follows settings navigation to index/caller. Include Spotify panel (`#spotifypanel`) close and settings import/export/reset. |
| E06 | VISUAL STUDIO → Lighting (`#lighting`) / Camera (`#camtune`) / Flyby (`#flyby`) → done | Race-only doors are disabled outside a session. Flyby → Free Camera (`#freecam`, `#photo-controls`) → set shot start/end → done returns to editor. |
| E07 | VISUAL STUDIO → GARAGE ENTER & LEAVE (`#garrival`) → PREVIEW PIT STOP / RACE START / AFTER RACE → finish/skip → DONE | Preview returns to tuner, DONE to Settings. Refused while Garage/drive-out owns the room. |
| E08 | Appearance → EDIT MAIN MENU (`#pm-tl-edit`, title layout editor `#tl-editor`) or screen PEEK → done | Layout editor is title-only; PEEK/Escape restores settings without committing a navigation jump. |

Sources: [`real-race-tab.js`](../js/data/real-race-tab.js),
[`real-race.js`](../js/race/real-race.js), [`watch-transport.js`](../js/ui/watch-transport.js),
[`js/net/`](../js/net), [`phone-pad.js`](../js/input/phone-pad.js),
[`designer.js`](../js/editor/designer.js), [`custom-tracks.js`](../js/editor/custom-tracks.js),
[`photo-studio.js`](../js/ui/photo-studio.js), [`settings-tabs.js`](../js/ui/settings-tabs.js),
[`arrival.js`](../js/garage/arrival.js), [`title-layout.js`](../js/ui/title-layout.js).

### 7. Boot, interruptions and recovery

| ID | Trigger | Expected route / checkpoint |
|---|---|---|
| X01 | Fresh browser vs saved preferences/season/career | Title and conditional Continue/Standings doors reflect stored state. First-run coaching uses current input bindings. Renderer failure exposes `#nogl` rather than a usable race. |
| X02 | Installed shortcut `?go=race`, `daily`, `nextgp`, `garage` | Corresponding menu door; nextgp selects Data Hub Schedule. Runs only when bare title is available; parameter is consumed to avoid repeated entry on reload. |
| X03 | `#ghost=` / `#share=` / `#track=` / friend invite | Ghost/Daily → TT picker; setup/livery → Garage; track → designer; invite → lobby. Links arriving under an active session/layer must follow that feature's defer/validation policy, not silently replace the current race. |
| X04 | Start requested twice, changed settings while preparing, quit during an asynchronous entry | Superseded request does not commit. Invalid race entry recovers through menu teardown. Preparation failure restores a usable sheet/title with a message; circuit-load failure returns to menu with failure presentation. |
| X05 | Intro preparation/drive-out → hide tab → return | Hidden time does not consume visible preparation/animation budgets. Loading (`#loading`) blocks pause/driving keys; it is not an ordinary dismissible dialog. |
| X06 | Solo race → blur/app switch/portrait blocker (`#rotate-device`) → return/rotate/resume | Preserve current session and input state; pit Garage remains the pause owner during work. Online pause does not freeze peers. |
| X07 | Reload / storage failure / another tab changes save | Last-session Continue stages a picker, not a live checkpoint. Save-recovery retry/export and cross-tab conflict messages must remain reachable; use disposable saves. |
| X08 | Close/reopen modes in sequence: Daily → Race → Career → Season → WATCH → Race | Track, session, selected team, qualifying grid, weather, paused state and camera ownership belong to the new mode. Check no previous HUD, loading card, tuner or replay overlay survives. |

Sources: [`session-entry.js`](../js/race/session-entry.js),
[`deep-link.js`](../js/ui/deep-link.js), [`title-flow.js`](../js/ui/title-flow.js),
[`platform-session.js`](../js/ui/platform-session.js), [`select-screen.js`](../js/ui/select-screen.js),
[`layers.js`](../js/ui/layers.js), [`js/game.js`](../js/game.js).

### 8. How to turn the map into regression coverage

Start with section 1. Then execute every ID above at least once, including each
explicit alternative in its row. Record `PASS`, `FAIL`, `BLOCKED` or `NOT RUN`,
with the exact commit, initial save/mode, input/device, actions, expected vs
actual destination, and evidence. A mapped route is not a passed test.

Prioritise the full GP loop, Garage forward/back, quit/restart confirmation,
qualifying drive/simulate/cancel, next round/sprint/final champion, career return,
TT/Daily retry, WATCH seek/exit/re-entry, pit work and designer TEST HERE return.
Run two consecutive iterations of restart, race again and quit/re-entry.

Apply these independent variations to representative journeys rather than
cross-multiplying every value:

- Mouse, keyboard (Tab/arrows/Enter/Escape), gamepad, and touch; rebinding and phone pairing.
- Desktop vs phone landscape/portrait; normal vs large UI; motion on/reduced.
- Fresh vs existing saves; no storage vs writable storage; a changed save in another tab.
- Qualifying on/off, sprint on/off, normal finish/DNF, tyre work/no work, dry/wet.
- ResultsCam-eligible desktop vs mobile/degraded tier; manual TV vs automatic TV vs WATCH AUTO.
- Cold/warm circuit load, intro skip, offline/provider/peer failure, repeated entry and interrupted loading.

Existing tests are starting points, not proof of every arrow in this map:

| Area | Existing test entry points |
|---|---|
| Entry/restart/recovery | `tests/unit/session-entry-vm.test.mjs`, `tests/unit/race-flow-fixes-vm.test.mjs`, `tests/unit/race-settings-vm.test.mjs` |
| Garage / intro | `tests/specs/garage-first-frame.spec.js`, `tests/specs/garage-out-before-card.spec.js`, `tests/unit/garage-arrival.test.mjs` |
| Qualifying / championship | `tests/specs/quali.spec.js`, `tests/specs/season.spec.js`, `tests/specs/season-format.spec.js`, `tests/unit/quali-handoff-vm.test.mjs` |
| Career | `tests/specs/career-hub.spec.js`, `tests/specs/career-season.spec.js`, `tests/unit/career-backup.test.mjs` |
| Camera / replay / photos | `tests/unit/results-cam.test.mjs`, `tests/unit/replay-buf.test.mjs`, `tests/unit/real-replay-vm.test.mjs`, `tests/specs/photo-studio.spec.js` |
| Multiplayer / phone | `tests/unit/net-lobby-lifecycle.test.mjs`, `tests/unit/net-lobby-friend-quali.test.mjs`, `tests/unit/phone-pad.test.mjs` |
| Designer / external entry | `tests/specs/track-designer.spec.js`, `tests/unit/deep-link.test.mjs`, `tests/unit/share-code.test.mjs`, `tests/unit/ghost-share.test.mjs` |

The `ui-journey-*.test.mjs` suites contain layout/source contracts; their names
do not mean they execute these complete player journeys. Browser execution of
this checklist remains separate work. Use [TESTING.md](TESTING.md) to select
bounded suites, and retain visual evidence for the TV/garage/flyby transitions.
