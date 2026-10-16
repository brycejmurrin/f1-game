# Mixed / dynamic weather — survey (2026-10-05)

Status: **survey + one starter**. Do not start spatial wetness, spray rewrite, or
HUD chrome from this note. Ship branch at writing: `claude/f1-game-project-26h3ng`.
Live claim: `js/race/weather-arc.js` (MIXED duration cap only). `js/game.js`
particle emit and `js/fx/particles.js` were owned by another session — leave them.

## What already ships

Weather is a **session enum** plus a **continuous wetness scalar**. MIXED is an
optional **one-shot arc**, not a forecast of showers.

| Piece | Where | Behaviour |
|---|---|---|
| Menu chips | `js/race/race-settings.js`, `index.html` `#rs-weather` / `#rs-mixed` | DRY / WET / RAIN / CLOUDY / FOG. CONDITIONS STABLE vs MIXED (hidden in TT). Help: MIXED “lets it change as the race goes on.” Endurance preset starts overcast + MIXED. |
| Live switch | `js/race/weather-arc.js` `setWeatherLive` | Sets `G.raceWeather`, reseeds rain overlay, rain audio, `applyRaceSettings` (cut or blend). **The only mid-session path.** |
| MIXED plan | `planFor` / `startChangeable` | Seed + race counter → target ≠ start, 2–7 min walk. TT/quali never arm. Host `wxArc` in lobby overrides derivation. Race end restores the chip’s start weather. |
| Wetness contract | `TyreModel.wetness` → `G.trackWetness()` / `roadWetness()` | `dry/overcast/fog→0`, `wet→0.5`, `rain→1`; **lerps** `arc.from→to` by `t/dur`. Gates: wet road ≥ 0.25, rain ≥ 0.72. |
| Look = drive | `WeatherArc.syncWetness`, `tests/unit/track-wetness-vm.test.mjs` | `frame.wetness` ramps to `trackWetness`. Shipped LightPresets must not pin `wetness` (`light-presets.test.mjs`). Tuner `LT.wetness ≥ 0` is diagnostic only. |
| Lighting blend | `js/lighting/atmosphere.js` | Arc stage flips cross-fade sun/cloud/ambient/fog (`weather-blend.test.mjs`). Profiles still key off the **discrete** enum. |
| Rain FX | `js/fx/particles.js`, `game.js` rain gate | Overlay follows wetness (drizzle vs storm); drying no longer leaves a frozen streak box (`weather-arc-rain.test.mjs`, 2026-10-04). |
| Spray / puddles | `game.js` spray emit; GLX/TLX/WGX lit wet block | Spray if wet + speed; strength still **enum** `raceWeather === "rain" ? 1 : 0.6`. Shaders: wet darken, noise puddles, rain ripples, SSR × `frame.wetness`. Visual puddles are **not** physics standing water. |
| Tyres | `js/physics/tyre-model.js`, `PhysicsConsts.WET_GRIP` | Slick / inter / wet table. `treadFor(weather, wetness)` prefers the scalar. Temps lerp with the arc (not the stage flip). |
| AI / pits / engineer | `pit-lane.js`, `engineer.js`, `AiDrive` via `gripMult` | Wrong-tread box, rain-in-N-laps from remaining arc seconds / last lap. Grids on `treadFor` at lights. No extra “wet racecraft” beyond gripMult. |
| HUD | `js/ui/hud*.js` | **No live weather / wetness readout.** Stage flips `announce("WEATHER: RAIN")` for 2 s. Pre-race announcer can say rain/cloud/fog is coming (`announcer.js` forecast). |
| Real Race | `js/race/real-race.js` `tickWeather` | OpenF1 rain flags walk an arc (`RAIN_ARC_S`) as the scripted lap’s rainfall changes. |
| `__apex` | `docs/DEBUG-HOOKS.md` | `weather()`, `weatherArc(from,to,secs)`, `trackWetness` on the arc payload. |

The 2026-09-30 wetness workstream (`docs/plans/2026-09-30-wetness-lighting.md`)
**A1–A3 and B-grid bakes are on ship** (continuous wetness, no preset pins, 52
circuits with tod×weather keys). That plan file’s header still says PLAN — treat
the tests as truth. Spatial wetness remains explicitly deferred there and in
`docs/plans/2026-09-15-racing-depth.md`.

## Gaps vs a good mixed/dynamic session

Ranked by player-visible value / risk. “Safe” means no spatial field, no
shader rewrite, no `game.js` growth.

1. **Short MIXED races never finish the walk** — derived duration is 120–420 s
   regardless of `lapsTarget`. Default 3-lap MIXED can still be in drizzle when
   the flag falls. **Starter in this PR:** `capPlanDur` (72 % of `laps × length/48`,
   floor 90 s). Host/lobby duration unchanged.
2. **No persistent in-race weather UI** — only a 2 s banner. Player cannot see
   wetness %, MIXED target, or time-to-change. Files: `js/ui/hud-readouts.js` /
   HUD DOM in `index.html`. Do not collide with live HUD-layout claims.
3. **MIXED targets include fog/overcast** — lighting-only walks with **zero grip
   change** (`wetness` stays 0). Fine as weather theatre; bad if the player
   expected a tyre decision. Bias `planFor` toward `LADDER` (keep fog/overcast as
   STABLE chips + host override). Test: `tests/unit/race-settings-vm.test.mjs`.
4. **Spray strength still reads the enum** (`game.js` ~7690) — A2 leftover vs
   `isRaining()` / `trackWetness()`. One-line, but `game.js` emit is often claimed
   with particles; wait.
5. **Atmosphere snaps per stage** — 25 s blend per flip, not a wetness-keyed sky.
   Acceptable; optional later: lerp atmosphere by `trackWetness` for dry↔rain.
6. **No local wet patches / drying line / aquaplaning** — global scalar only.
   Shader puddles are cosmetic. Needs a shared arc-length (or sector) field for
   physics + strategy + three backends. Prerequisite named in the 09-30 plan.
   **Do not start** without that contract and a dedicated workstream.
7. **AI wet pace** is only `gripMult`. No extra caution, no spray-blindness, no
   “don’t dive on a wet first lap.” `ai-drive.js` after the HUD/plan items.
8. **Audio** — rain loop is on/off at 0.72; no intensity ramp; thunder only when
   raining. `js/audio/engine.js` `startRain`. Couple gain to wetness after spray.
9. **Quali / TT** — MIXED hidden/ignored on purpose. Weekend story (Q3 rain, race
   dry) would be a season/career format change, not a weather-arc tweak.

## Ranked PRs (file-level)

| # | PR | Files | Verify |
|---|---|---|---|
| 0 | **This draft** — survey + MIXED duration cap | `js/race/weather-arc.js`, `tests/unit/weather-arc-rain.test.mjs`, this note | `node --test tests/unit/weather-arc-rain.test.mjs`; `npm run test:tooling-fast` |
| 1 | MIXED target bias to dry/wet/rain | `weather-arc.js` `TARGETS` vs `LADDER`; `race-settings-vm.test.mjs`; help copy in `index.html` | unit + docs-integrity |
| 2 | In-race weather chip (current + MIXED `to` + mm:ss) | HUD readout + static DOM; engineer already has `rainInLaps` | one HUD spec, not a full matrix |
| 3 | Spray + rain-audio gain follow `trackWetness` | `game.js` emit (when unclaimed), `js/audio/engine.js` | `weather-arc-rain` + audio unit |
| 4 | Optional sky lerp by wetness | `atmosphere.js` | `weather-blend.test.mjs` |
| 5 | Spatial wetness (later) | new module under `js/race/` (shared surface field), tyre/AI/shaders | dedicated plan; not this branch |

## Starter change (this branch)

`WeatherArc.planFor` still draws 2–7 minutes, then `capPlanDur` so a short race
reaches the target with ~one lap of the new weather. Net play keeps the host’s
`dur`. No physics table change, no shaders, no HUD.
