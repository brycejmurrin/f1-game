# Race complete source map

## Source and coverage
GPT-6.1 Sol complete_race fully read all 41 files / 14,098 lines at c4dc493d9. Attached LSP references covered all 40 implementation globals and definitions for eight G boundary members. Parent saves returned report after old read-only write blocked. No browser/tests/source changes.

| File | Full range | Coverage |
|---|---|---|
| js/race/announce-banner.js | 1–184 | Full |
| js/race/broadcast.js | 1–497 | Full |
| js/race/car-fields.js | 1–272 | Full |
| js/race/daily-challenge.js | 1–199 | Full |
| js/race/damage.js | 1–158 | Full |
| js/race/driving-coach.js | 1–804 | Full |
| js/race/duel.js | 1–158 | Full |
| js/race/engineer.js | 1–537 | Full |
| js/race/flying-start.js | 1–119 | Full |
| js/race/forecast.js | 1–191 | Full |
| js/race/jump-start-penalty.js | 1–71 | Full |
| js/race/lap-record.js | 1–23 | Full |
| js/race/light-tune-edit.js | 1–43 | Full |
| js/race/marshal-panels.js | 1–146 | Full |
| js/race/overtake-mode.js | 1–155 | Full |
| js/race/pace-math.js | 1–110 | Full |
| js/race/pit-lane.js | 1–2081 | Full |
| js/race/quali-model.js | 1–463 | Full |
| js/race/quali-net.js | 1–259 | Full |
| js/race/race-control.js | 1–744 | Full |
| js/race/race-facts.js | 1–400 | Full |
| js/race/race-insights.js | 1–636 | Full |
| js/race/race-radio.js | 1–777 | Full |
| js/race/race-settings.js | 1–742 | Full |
| js/race/radio-lines.js | 1–247 | Full |
| js/race/rain-cells.js | 1–159 | Full |
| js/race/real-race.js | 1–970 | Full |
| js/race/real-replay.js | 1–758 | Full |
| js/race/reliability.js | 1–105 | Full |
| js/race/session-entry.js | 1–60 | Full |
| js/race/session-records.js | 1–140 | Full |
| js/race/session-stub.js | 1–157 | Full |
| js/race/setup-trial-session.js | 1–97 | Full |
| js/race/sporting-regs.js | 1–306 | Full |
| js/race/spotter.js | 1–161 | Full |
| js/race/start-lights.js | 1–145 | Full |
| js/race/storm-flash.js | 1–77 | Full |
| js/race/storm.js | 1–101 | Full |
| js/race/tv-graphics.js | 1–103 | Full |
| js/race/weather-arc.js | 1–527 | Full |
| js/race/wind.js | 1–216 | Full |

## Ownership and contracts
Game owns live session construction and integration. SessionEntry owns deduplicated generation-token prepare/commit with explicit promise outcome. SessionStub supplies inert title bindings replaced by lazy real implementations. CarFields predeclares/warms stable object shapes. PaceMath normalizes ground-speed scale and aero/ERS/gears. LapRecord holds mutable sector/timing state. FlyingStart owns untimed TT/quali run-up; JumpStartPenalty applies standing-race false-start policy. Quali models grids by live driver identity; QualiNet owns peer readiness/live reports and timers. SessionRecords owns comparable context classes and Ghost/InputGhost/TT boards; SetupTrialSession owns fresh unscored solo setup launches.

RaceControl sorts crossing settlement by clock, owns finish/run classification, caution/SC/red policy and replay/network gates. SportingRegs owns compound/caution/blue-flag/grid/false-start policy, emitting events for caller penalties. PitLane owns geometry/envelopes, driving commitment, AI plan/replan/tyre/service/work and compliance. Engineer advice never arms a stop. Reliability hashes per-car retirement plans; Damage is WeakMap display-only impact state. Duel selects/bumps rival; DailyChallenge owns UTC deterministic plan and streak/class bests, restoring RNG position afterward.

RaceFacts emits pooled timing/event snapshots; RaceRadio applies priority/expiry/predicate/cooldown/once rules; RadioLines owns private phrase RNG and commits variant memory only on acceptance. AnnounceBanner owns bounded visible/queued delivery. Spotter owns recorded occupancy transitions with unheard-decode rollback. DrivingCoach owns feedback, practice, replay/rewind snapshot and drill integration. RaceInsights owns measured stint/energy summaries, journal/mastery and practice goals separate from career/records. RaceSettings owns setup/strategy/presets and mode-specific GO routing.

WeatherArc owns shared clock, lagged road wetness and seeded/host plans. RainCells supplies deterministic moving-shower integration and sectors. Forecast supplies shrinking seeded forecast uncertainty. Storm schedules shared flashes; StormFlash owns render/audio flash/thunder state. Wind supplies deterministic air/heading effects and weather easing. LightTuneEdit coordinates crash-latch opt-in and saved edits. MarshalPanels/StartLights own world flag/light presentation.

RealRace stages timing script, grid/plans/flags/weather/retirement/pace, jump-in handover or replay. RealReplay owns fitted trace puppets, transport discontinuities, radio/highlights and published finish. Broadcast owns TV director/tower/PiP; TvGraphics renders transient overlay feed.

## LSP boundary evidence
G.pits resolves types/game-ctx.d.ts:418; setupTrialContext:426; realRace:428; records:429; coach:430; raceRadio:448; weatherArc:543; cautionInfo:711. These intentionally expose selected methods, not full return surfaces. Lazy duplicates are reported explicitly; consumer lists include stubs/loaders and instance calls via G are not direct global references.

## Proven comment discrepancies
1. AnnounceBanner:130 promises granted slots never revoked, but 135–144 pops weaker accepted entries at capacity.
2. Duel:114/128 says Legends get no bump/only looks change; body applies LEGEND_BUMP and tierV times 1.08.
3. DrivingCoach:548 promises immediate repeat rewind goes farther back; body chooses oldest then clears buffer and rejects another until new samples. Full-buffer age is not guaranteed.
4. PitLane box alignment introduction says same player/AI standard; nonlocal cars return after lateral test, skipping local center/heading requirements.
5. Pit replan prose says one/two lap response; current thresholds two/three, with one only wet-player branch.
6. RaceSettings fold promises three values; vals slices to at most two.
7. RaceRadio promises pool exhaustion before repeat; RadioLines uses recent window min(3, variants-1), allowing earlier repeats in larger pools.
8. RealReplay FINISH_S comment ties results to winner last sample; duration is max usable trace end across field plus tail.

## Limits and next goal
All race source lines read; actual browser/race behavior not executed. Historical narratives are not stale merely because older. Audio received zero source reads in this lane and has a fresh separate reader. Parent owns docs checks/commits and outstanding backlog.
