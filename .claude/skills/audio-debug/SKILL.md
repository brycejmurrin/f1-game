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
GameAudio.setEnabled(true)          // master gain → 0.8
GameAudio.setSfxEnabled(false)      // engine/SFX off; music can stay
GameAudio.setMusicEnabled(false)    // soundtrack off; engine keeps humming
GameAudio.debug()                   // contextState, samplesReady, usingSamples, engineOn, loop
GameAudio.rate()                    // idle-sample playbackRate (0 if synth/off)
GameAudio.centroidHz()              // spectral centroid of live engine
```

```sh
node tools/ci/test-bg.mjs --spec tests/specs/audio-smoke.spec.js  # focused browser check, backgrounded (AGENTS.md rule 4; rule 10 for subagents)
node tools/ci/test-bg.mjs --spec tests/specs/engine-audio-offline.spec.js  # after an engine.js context/rebuild or lifecycle edit
# Add music-library.spec.js for library behavior; ui is a broader group.
node tools/check/audio-test.cjs     # LAUNCHES CHROMIUM, objective pitch probe; starts its own static server (a <baseURL> arg reuses one)
```

`tests/specs/audio-smoke.spec.js` covers init, re-enable during a race, and a
user-gesture unlock (`setEngine(0.75, 0.4, false, 0.6, 4)` then
`centroidHz() > 50`). Shell/cache after an edit: **check-changes**.

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
| `radio-*.js`, `voice-pack.js`, `announcer*.js` | team radio speech and FX, recorded clips, pre-race announcer |
| `signal.js` / `tone-model.js` / `stub.js` | sample analysis and SFX primitives / manufacturer timbre presets / pre-load stubs (LAZY_AUDIO) |

## Load on demand

- **Silent on iPhone / first tap**: the unlock is `audioGestureUnlock` + `AUDIO_GESTURES` in
  `js/core/lazy-bundles.js`, not engine.js's listeners → [references/diagnose.md](references/diagnose.md) §Diagnosing step 3.
- Layer table, in-race `#audioset`, pitch curve, silence diagnosis, music cutting out on pause/hide →
  [references/diagnose.md](references/diagnose.md) (incl. gear-shift cue silent).
