# hunt-core — js/game.js, js/core/**, js/track/** (engine), js/agent/apex.js, sw.js + shell guard, manifest order
Inputs: BRIEF.md, docs/notes/system-audit-3/game-code.md (G1-G9), tip 7dd2e82f3+note; diff 4c92a918c..HEAD -- js/game.js (+415/-208).
Ran: `node tools/check/check-gctx.mjs --no-tsc` (297 members, parity exact, 0 DECLARED-BUT-UNREAD); `node tools/check/extract-module.mjs js/game.js 6738 6760`; read lazy-bundles.js, session-entry.js, the #3591 diff, index.html:151-270 in full.

## Clean (checked, fine)
- G members with no reader: check-gctx deadMembers() prints none (297/297 read). Pass3 parity confirmed.
- apex.js create-scope captures (apex.js:111-116 destructure, :132-133): every captured value is stable; `gfx` is assigned once (game.js:114) before bindAgent, G.gfx is a getter (game.js:3341). No stale hook found there.
- Lazily-replaced instances (pits/engineer/records/raceRadio/eventJournal/startLights/marshalPanels/flyingStart/jumpStartPenalty/audio set): no module destructures or caches them at create time; all 12 `= G.<inst>` reads in js/ are function-local.
- ensureCircuit (lazy-bundles.js:91-126): memoised per id on the in-flight promise, deleted on settle, rejects when hydrate fails, hydrates the LIST entry in place so `def === def0` in ensureScenery holds; no race found.
- ensureRaceSession hook vs entry validity: SessionEntry.valid() runs once, after prepare and before commit (session-entry.js:28); ensureRaceSession runs inside commit (game.js:2487), so the hook's prepareDaily cannot cancel a startRace. DailyChallenge.open (the only direct startRace caller) is dev-hook only; every player DAILY path goes select -> sheet -> raceIntroFromSheet, which #3591 (0974781fd) covers.
- New TDZ hazard check: quitToMenuAfterCtxLost / installRaceEntrySoften (registered at ~game.js:4333) touch lets declared at game.js:6738-6739; there is no top-level await between (only awaits at :112 and :9517), and the callbacks fire only after eval. Safe.
- Race-entry soften: applied at game.js:2540, cleared at :2713 (success), :4311 (ctx-lost) and :4346 (quitToMenu); a superseding start re-softens without overwriting the saved scale (cur > 0.72 guard, :6755). No leak found.
- Stub coverage: PitLane stub persists setPinnedStops to the store (session-stub.js:80), so a STRATEGY pin made before LAZY_RACE_SESSION lands survives.
- Shell guard (index.html:159-269): keeps query and hash, sessionStorage one-shot per build, SW registration URL carries the shell build; no strand path found in the read.

| id | finding | evidence | cost to Bryce | one-line fix | conf | status |
|---|---|---|---|---|---|---|
| C1 | G9 carve targets, named: the 7-day growth is concentrated in four regions, two of which have tiny free-reference sets | diff 4c92a918c..HEAD: +23 game.js:6738-6760 (race-entry soften; extract-module free refs = gfx, PerfGov, GfxEscalation, RaceEntryProfile only); +31 game.js:4305-4335 (ctx-lost menu recover: quitToMenuAfterCtxLost); +15 quitToMenu finish-settle (:4339-4353); +11 loadTrackStepped (:2001-2011) | ~54 lines (C1a+C1b) leave game.js with no G-surface growth beyond G.gfx/G.quitToMenu getters; lowers game.js ratchet | Move :6738-6760 + :4305-4335 into js/perf/gfx-escalation.js (or a new a new `ctx-lost-recover` module under js/perf create(G)) via `extract-module.mjs js/game.js 4305 4335 --mutable _carWarm,_softEl` and `... 6738 6760`; the envprobe read at :7702 becomes `GfxEscalation.envProbeSoftened()` | med | ADDS to pass3 G9 |
| C2 | #3591 fix over-waits: `sessionLate` gates on any active Daily, but the hook only mutates entry settings for class "standard" | game.js:4015 (`daily.isActive()`) vs game.js:97 (`class === "standard"`) | an OPEN daily picked on the stub waits the ~320 KB bundle under the sheet for nothing; no correctness cost | add `&& daily.current().class === "standard"` | high (code-traced) | NEW, low |

## Not done
- sw.js (1,123 lines) read only via grep of lifecycle points; no cache-version mismatch traced end to end.
- js/track/** _sceneryShift: listed all 72 references; spot-read tracks.js:103/126, build-client.js:323, build-props.js:2181 — consistent; did not audit each circuit's frac tables.
- Event-journal / replay determinism: not reached.
- tools/manifest.cjs load order: relied on pass3's scan-globals ok + manifest parity; not re-derived.
- apex.js hooks beyond create-scope captures (2,492 lines) not read in full.
