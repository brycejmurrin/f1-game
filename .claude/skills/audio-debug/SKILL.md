---
name: audio-debug
description: "Use when the engine sounds flat at high speed, sfx isn't triggering, gear-shift audio is wrong, music cuts out, mute/volume is stuck, or WebAudio, engine pitch or music layers misbehave. Not game-feel polish that must not change physics (tune-physics), offline precache of mp3s (pwa-cache-service-worker), or the music menu layout (ui-menu-a11y)."
---

# Debug and tune the audio engine

WebAudio synth in `js/audio/engine.js` (`GameAudio`). Sample core (CC0 MP3s in
`assets/sfx/`) plus synth fallback. Three **independent** toggles under one
master:

| Bus | API | Carries |
|---|---|---|
| **Master** | `GameAudio.setEnabled(b)` / `soundOn` | Both — `#soundbtn` on the **title screen only** |
| **SFX** | `GameAudio.setSfxEnabled(b)` / `sfxOn` | Engine, skids, rain, UI ticks, gear pops |
| **Music** | `GameAudio.setMusicEnabled(b)` / `musicEnabled` | Soundtrack |

Muting music does **not** silence the engine — it sits on the sfx bus.

## Quick inspection

```js
GameAudio.enabled()
GameAudio.setEnabled(true)          // master gain → 0.8
GameAudio.setSfxEnabled(false)      // engine/SFX off; music can stay
GameAudio.setMusicEnabled(false)    // soundtrack off; engine keeps humming
GameAudio.debug()                   // contextState, samplesReady, usingSamples, engineOn, loop
GameAudio.rate()                    // idle-sample playbackRate (0 if synth/off)
GameAudio.centroidHz()              // spectral centroid of live engine
```

```sh
node tools/ci/test-solo.mjs tests/specs/audio-smoke.spec.js  # focused browser check; parent only
# Add music-library.spec.js for library behavior; ui is a broader group.
node tools/check/audio-test.cjs     # LAUNCHES CHROMIUM, objective pitch probe; starts its own static server (a <baseURL> arg reuses one)
```

`tests/specs/audio-smoke.spec.js` covers init, re-enable during a race, and a
user-gesture unlock (`setEngine(0.75, 0.4, false, 0.6, 4)` then
`centroidHz() > 50`). Shell/cache after an edit: **check-changes**.

## Which `js/audio/` file

| File | Owns |
|---|---|
| `engine.js` | `GameAudio`: buses, engine voice, limiter, gear-shift cue `shift(up)` (~2261; called from `js/game.js` ~5066-5067 manual, ~5479 auto, local car only) |
| `car-sfx.js` | `CarSfx`: player contact levels (scrub/lock/surface/pitLim) for `setCarSfx` + pit-stop wheel guns — NOT gear audio |
| `soundtrack.js` / `music-lib.js` / `spotify.js` | playlist, decode caches, ducking / player's own files (IndexedDB) / optional Spotify backend |
| `panel.js` / `race-mix-audition.js` | MUSIC & SOUND mixer page (switches, sliders, source row) / its bounded sample button |
| `ers-layer.js` / `rivals.js` / `crowd.js` | MGU-K and boost layer / field around you / crowd bed |
| `driving-cues.js` / `battle-earcon.js` | assist-gated brake tone + corner calls / gap motifs |
| `radio-*.js`, `voice-pack.js`, `announcer*.js` | team radio speech and FX, recorded clips, pre-race announcer |
| `signal.js` / `tone-model.js` / `stub.js` | sample analysis and SFX primitives / manufacturer timbre presets / pre-load stubs (LAZY_AUDIO) |

## Load on demand

- Layer table, in-race `#audioset`, pitch curve, silence diagnosis, music cutting out on pause/hide →
  [references/diagnose.md](references/diagnose.md) (incl. gear-shift cue silent).
