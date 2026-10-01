# Voices lag the game on iPhone Safari (2026-10-01)

## Report

The player reported that the game lags whenever the voices are on: the radio,
the commentator and race control. The device was an iPhone running Safari, and
every voice lagged, not just one.

## What was measured here

`scratch/voice-lag-probe.mjs` (not committed) ran the same race twice: once with
the voices off, then with team radio, commentary set to ALWAYS, the chatty
engineer and the spotter all on. Each run was 45 s at Monza in headless Chromium
with real rAF and real timers, rendering skipped.

| | voices off | voices on |
|---|---|---|
| frame gap p50 / p99 | 16.7 / 16.8 ms | 16.7 / 16.8 ms |
| frames over 33 ms | 6 | 4 |
| time inside every speech / pack / radio-audio call | – | < 5 ms in 45 s |

- The game's own voice code costs nothing measurable.
- One 2.2–2.4 s stall appears in both runs, so the voices are not its cause.
- This container has no speech engine (0 voices), so the platform cost cannot
  be measured here at all.

## Why it is the speech engine

`speechSynthesis.speak()`, `cancel()` and `resume()` are synchronous IPC to the
platform's speech service on the main thread. On iOS, a spoken utterance also
takes the audio session from the page. The code had already been timing these
calls (`RadioVoice.debug().synth`), because Chromium has open bugs where they
stall the page (crbug 374263394, 40720649).

### Which lines reached speech synthesis

Before this change, only the engineer had recorded clips.
`scratch/pack-coverage.mjs` filled every phrasebook line with real values and
checked which ones the recorded pack could say:

- The engineer: 94% from clips. Lap times ("1:32.4") and a few phrases went to
  speech synthesis.
- The commentator: 8% from clips. Almost every line went to speech synthesis.
- Race control and the coach: no recorded voice at all, so every line went to
  speech synthesis.

Taken together, "all of them lag" on iPhone means every channel that spoke
through Safari's synthesiser, and on that platform that was every channel.

## The fix: every race channel recorded, no speech synthesis in a race

### One recorded voice per channel

`RadioVoice.PACK_VOICE` maps each channel to a Kokoro-82M voice (Apache-2.0):

| channel | pack | Kokoro voice |
|---|---|---|
| engineer | `george` | `bm_george` |
| commentator | `fable` | `bm_fable` |
| race control | `emma` | `bf_emma` |
| coach | `heart` | `af_heart` |

### What each pack holds

`tools/gen/voicepack.mjs --id <voice>` builds each pack from five sources:

- **Its phrasebook pools:** `eng.*` for the engineer, `tv.*` for the commentator.
- **The card literals of the files that emit its cards** (`VOICES[id].runs`),
  recorded as whole phrases.
- **What it was heard saying.** `tools/gen/voice-corpus.mjs` races the game VM
  over whole frames with a recording speechSynthesis and writes
  `tools/gen/voice-corpus.json`.
- **The slot values:** positions, numbers, gaps, surnames and key labels.
- **A safety net:** every word that any card literal in the radio's feed files
  can carry, recorded on its own.

Lap times are read the way a broadcast reads them. `VoicePack.norm` turns
"1:05.3" into "1 oh 5 point 3", so lap times splice from number clips.

### What RECORDED now does

With RADIO VOICE: RECORDED, a race never calls speech synthesis:

- A line no clip covers stays written on its card. The panel says why:
  `not-recorded` or `pack-loading`.
- SYSTEM still keeps every line on speech synthesis, for a player who picked a
  system voice.
- The packs download over the loading screen (`radioVoice.prepare()` in
  `startRaceBody`). They are never precached by the service worker.

### The per-line audio work, trimmed

The radio sound is now built once per context for each sound, and every line
shares it: a filter pair, a soft-clip and a compressor. Before this, all four
nodes were built and torn down for every line. Each line now adds only its
buffer sources and one gain.

The commentator plays through a broadcast band (90 Hz to 9 kHz, barely driven)
instead of the team-radio band.

## Not changed

The pre-race announcer (`js/audio/announcer.js`) still reads its scripted
paragraph with speech synthesis, over the loading flyby. That text is free-form
event copy that no pack can cover. It never plays during a race.
