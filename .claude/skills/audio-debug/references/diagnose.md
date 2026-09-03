# Audio layers, mute path, silence diagnosis

Load this when the engine is silent, pitch is flat, or a mute toggle did the
"wrong" bus.

## Layers

| Layer | What it does |
|---|---|
| Engine (sample core) | `assets/sfx/f1_engine.mp3` (idle) + `f1_rev.mp3` (high-rev), pitched via `playbackRate` |
| Engine (synth fallback) | Three detuned oscillators (saw×2 + square) through a speed-tracking lowpass until samples decode |
| Turbo whine | Sine ~1500 Hz, level tracks throttle |
| MGU-K harvest | Filtered noise when decelerating |
| Rev-limiter / gear-shift pop | Short blip; `shift()` |
| Collision thud | White-noise burst scaled to impact `dv` |
| Tyre screech | Filtered noise proportional to lateral slip |
| Music | Streamed CC0 tracks (`assets/music/`) via `startMusic()` / `stopMusic()` |

Signal path: engine/SFX → `sfxBus` → `master` → destination; music →
`musicGain` → `master`. Muting music does **not** silence the engine.

## In-race mute (not `#soundbtn`)

During a race `#soundbtn` is **hidden**. Open pause → MUSIC & SOUND
(`#pm-audio` opens `#audioset`):

| Control | DOM ids | Effect |
|---|---|---|
| Music ON/OFF | `#as-music-on` / `#as-music-off` | `setMusicEnabled` — soundtrack only |
| SFX ON/OFF | `#as-sound-on` / `#as-sound-off` | `setSfxEnabled` — engine + effects only |

Turning **music** off and expecting silence is the common mistake — the
engine idle still hums on the **sfx** bus. That is correct.

`setPaused(true)` calls `GameAudio.stopEngine()`; resume calls
`GameAudio.startEngine()` again when `soundOn` is true (independent of music).

## Pitch curve

Search `js/audio/engine.js` for `setEngine(rev01, boost01, offroad, speed01,
gear)`. The sample core sets `playbackRate`; the synth fallback sets
oscillator frequencies. After an edit, bump-cache and reload — WebAudio does
not hot-reload. Confirm with `GameAudio.rate()` at the same speed.

```js
GameAudio.setEngine(0.75, 0.4, false, 0.6, 4);
```

## Diagnosing silence or flat pitch

1. `GameAudio.enabled()` — if `false`, `setEnabled(true)`. If only the engine
   is missing while music plays, `setSfxEnabled(true)`.
2. `GameAudio.debug().samplesReady` — if `false`, MP3s have not decoded
   (network/CORS, or CC0 files absent); synth fallback should be active.
   `usingSamples` says which core is running.
3. Suspended AudioContext (autoplay): a user gesture resumes it. Click
   `#soundbtn` or `document.dispatchEvent(new MouseEvent("click"))`.
4. Chrome DevTools → **Web Audio** — confirm oscillators / buffer sources
   reach the destination.
5. `__apex.timing().raceT` should be increasing. A frozen sim means
   `setEngine()` never runs and pitch stays at the last value.

The AudioContext itself is a private var — not exposed. Use
`GameAudio.debug().samplesReady` and `centroidHz()`.
