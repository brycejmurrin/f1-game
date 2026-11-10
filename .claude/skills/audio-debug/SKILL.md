---
name: audio-debug
description: "Use when the game is silent (iPhone, before the first tap), engine pitch is wrong, sound effects or music break, or mute or volume is stuck. Not for: handling → tune-physics; offline mp3 caching → pwa-cache-service-worker; the music menu → ui-menu-a11y."
---

# Debug and tune the audio engine

WebAudio synth in `js/audio/engine.js` (`GameAudio`). Sample core (CC0 MP3s in
`assets/sfx/`) plus synth fallback. Three **independent** toggles under one
master:

| Bus | API | Carries |
|---|---|---|
| **Master** | `GameAudio.setEnabled(b)` / game.js `G.soundOn` | Both — `#soundbtn` on the **title screen only** |
| **SFX** | `GameAudio.setSfxEnabled(b)` / store key `"sfx"` (a `panel.js` local mirrors it) | Engine, skids, rain, UI ticks, gear pops |
| **Music** | `GameAudio.setMusicEnabled(b)` / `musicEnabled` | Soundtrack |

Muting music does **not** silence the engine — it sits on the sfx bus.

## Quick inspection

These run in a live page: main session via skill `mcp-probe` (or `apex_eval`); in a subagent report them as not run (AGENTS.md rule 10).

```js
GameAudio._stub                     // true = LAZY_AUDIO not landed: every call is a stub (diagnose.md step 3)
GameAudio.context()?.state          // "running" | "suspended" — the live AudioContext (null before init)
GameAudio.enabled()
GameAudio.setEnabled(true)          // master gain up
GameAudio.setSfxEnabled(false)      // engine/SFX off; music can stay
GameAudio.setMusicEnabled(false)    // soundtrack off; engine keeps humming
GameAudio.debug()                   // contextState, samplesReady, usingSamples, engineOn, loop
GameAudio.rate()                    // idle-sample playbackRate (0 if synth/off)
GameAudio.centroidHz()              // spectral centroid of live engine
```

```sh
node tools/ci/pick-tests.mjs js/audio/engine.js   # the groups an audio edit needs (the PR runs them)
node --test tests/unit/audio-tune.test.mjs        # one Node file locally; CI runs the whole `npm run test:audio-unit`
node tools/ci/remote-group.mjs ui                 # on the PUSHED branch: the browser group holding the audio specs (`test:ui`)
```

No local browser runs (AGENTS.md rule 5): the audio specs (`tests/specs/audio-smoke.spec.js`,
`engine-audio-offline.spec.js`, `music-library.spec.js`) run on CI, and the Chromium pitch probe
`tools/check/audio-test.cjs` is not a pre-push step (`tests/unit/audio-tune.test.mjs` pins its
invariants in Node). Shell/cache after an edit: **check-changes**.

**Context rebuild** (`engine.js` `rebuildCtx`): a failed resume or a device
change rebuilds the AudioContext; device-driven rebuilds are debounced and
capped (`DEVICE_REBUILD_MAX` per `DEVICE_REBUILD_WINDOW_MS`). Services read
the context through functions, so a rebuild never leaves one on the old
context; a sound that dies after a device switch is this path.

## Which `js/audio/` file

| File | Owns |
|---|---|
| `engine.js` | `GameAudio`: buses, engine voice, limiter, gear-shift cue `GameAudio.shift(up)` (callers: `js/game.js` manual up/down shifts and the auto-gear change in the car update, local car only — find them with apex-lsp `lsp_references`) |
| `car-sfx.js` | `CarSfx`: player contact levels (scrub/lock/surface/pitLim) for `setCarSfx` + pit-stop wheel guns — NOT gear audio |
| `soundtrack.js` / `music-lib.js` / `spotify.js` | playlist, decode caches, ducking / player's own files (IndexedDB) / optional Spotify backend |
| `panel.js` / `race-mix-audition.js` | MUSIC & SOUND mixer page (switches, sliders, source row) / its bounded sample button |
| `ers-layer.js` / `rivals.js` / `crowd.js` | MGU-K and boost layer / field around you / crowd bed |
| `driving-cues.js` / `battle-earcon.js` | assist-gated brake tone + corner calls / gap motifs |
| `radio-*.js`, `voice-pack.js`, `announcer*.js`, `mix-duck.js` | team radio speech and FX, recorded clips, pre-race announcer, the radio duck |
| `signal.js` / `tone-model.js` / `stub.js` | sample analysis and SFX primitives / manufacturer timbre presets / pre-load stubs (LAZY_AUDIO) |

## Load on demand

- **Silent on iPhone / first tap**: the unlock is `audioGestureUnlock` + `AUDIO_GESTURES` in
  `js/core/lazy-bundles.js`, not engine.js's listeners → [references/diagnose.md](references/diagnose.md) §Diagnosing step 3.
- Layer table, in-race `#audioset`, pitch curve, silence diagnosis, music cutting out on pause/hide →
  [references/diagnose.md](references/diagnose.md) (incl. gear-shift cue silent).
