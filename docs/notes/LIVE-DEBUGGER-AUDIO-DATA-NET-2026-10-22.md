# Live debugger — audio / Data Hub / net hunt (A·H3, 2026-10-22)

Method: prior-art scout (DEFECT-LEDGER, BUGS.md, notes), code-hunter on js/data + js/net, own trace of js/audio/panel.js and captions.js. No browser run; verdicts are CODE-TRACED with a failing-before/passing-after unit test.

| id | file:line | sev | verdict | evidence |
|---|---|---|---|---|
| H3-1 (BUGS M31) | js/audio/panel.js setSound | low | CONFIRMED (VM test) | Race started with SOUND OFF skips game.js setVoice/setVenue; turning it on mid-race called startEngine with the default voice and venue. Fixed; `audio-panel-boot.test.mjs`. |
| H3-2 | js/net/nostr.js OFFER_CREATED_SLACK_S | med | CONFIRMED (code-traced, unit-proved) | Stale-offer floor used this device's clock with a 30 s slack; a host clock >30 s behind was never heard ("Nobody answered that code"). Slack now 300 s; replays older than that are still dropped. `net-trystero-api.test.mjs`. |
| H3-3 | js/data/schedule.js RACE_MS | low | CONFIRMED (unit-proved) | NEXT left a race 2 h after lights out; a red-flagged race runs longer and live.js allows 4 h. Now 4 h. `data-schedule-tz.test.mjs`. |
| M21 | js/net/transport.js EVENT_CRITICAL | — | STALE | `quali`, `settings`, `lap`, `hello`, `ready` are already critical. BUGS.md row can be closed. |
| M32 | js/audio/rivals.js:20 | low | NOT RE-VERIFIED | Four rival voice slots vs two on mobile engine; left open. |

Not covered: telemetry*.js, export.js, most of lobby.js reconnect paths, netplay.js, snapshot.js, share/*, real-replay.js, radio-voice voice switch.

## Round 2 (subagent hunts, code-traced)

| id | file:line | sev | verdict | note |
|---|---|---|---|---|
| H3-4 | js/race/real-replay.js onKey caption | low | CONFIRMED (VM test) | Speed/follow caption used the roster car's code, not the seated real driver's. Fixed via `followCode()`; `real-replay-captions.test.mjs`. |
| H3-5 | js/race/race-radio.js speak / radio-lines.js pick | low | CONFIRMED (unit) | A refused card still recorded its variant in the anti-repeat window on every retry. `pick(key, vars, true)` peeks; `commit()` after the card is accepted. `radio-lines.test.mjs`. |
| H3-6 | js/net/lobby.js:294-308 | med | CONFIRMED (VM test) | Removing one of several guests left the old room code open (no `rotateRoomAfterEvict`). Fixed; `net-lobby-lifecycle.test.mjs`. |
| H3-7 | js/net/lobby.js:515-533,1723 | low | CODE-TRACED | Last-guest removal on a link/QR room opens a public code room and later shows the guest's "six characters" error to the host. Fixed: only a code room rotates, and a quiet room's expiry uses host copy (`net-lobby-lifecycle.test.mjs`). |
| H3-8 | js/net/lobby.js:2052, quali-net.js | med | PLAUSIBLE | Host backing out of friend quali strands guests. REFUTED by finding-verifier: `QualiNet.resetOnBackWithAbort()` broadcasts the host's no-time QUALI before `abortQuali()`, and guests also have the 60 s gate. A re-START GO reaching a guest still on the sheet was not traced (needs a browser). |
| H3-9 | js/net/netplay.js:996 | low | DEAD-CODE | `NetPlay.rejoin()` has no production caller. |
| H3-10 | js/data/real-race-tab.js:957 | med | CODE-TRACED | WATCH STOP DUEL can set `seatCode` to an unseated driver; `RealRace.stage()` refuses. Not fixed. |
| H3-11 | js/share/share-card-layout.js:56 | med | PLAUSIBLE | Share-card QR is light-on-dark; inverted codes fail on many Android scanners. Not measured. |
