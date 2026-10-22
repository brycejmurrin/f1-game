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
