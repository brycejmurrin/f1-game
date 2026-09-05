# Audio layers, mute path, silence diagnosis

Load this when the engine is silent, pitch is flat, or a mute toggle did the
"wrong" bus.

## Layers

| Layer | What it does |
|---|---|
| Engine (sample core) | `assets/sfx/f1_engine.mp3` looped and pitched via `playbackRate` (`f1_rev.mp3` is on disk but nothing loads it) |
| Engine (synth fallback) | Three detuned oscillators (saw×2 + square) through a speed-tracking lowpass until samples decode |
| Pitch curve | `(0.25·idle + 0.45·revRange·rev^curve)·pitch` — four independent tune knobs; `GameAudio.rate()` reads the result |
| Gravel | Sine at the crank rate (`f0/3`, 18–140 Hz) into `engGain.gain`; depth `(1-rev)²` × GRAVEL trim; `gravelDepth()` / `gravelHz()` |
| Rev limiter | 13 Hz square into `engGain.gain` above 98.5% revs; `limiterDepth()` / `limiterHz()` |
| Turbo whine + wastegate | Sine ~1500 Hz tracking rev; a falling hiss once per lift after ≥0.5 s under load (`wastegateState()`) |
| MGU-K harvest / ERS deploy | Filtered noise when decelerating / triangle whine while deploying |
| Brakes | Bandpass noise, gain = deceleration × speed; `brakeLevel()` |
| Gear shift | Saw crack + click, scaled by the SHIFT trim (`shiftState()`); the rev-cut duck is the engine's own |
| Overrun | Irregular crackle one-shots on a trailing throttle (`overrunState()`) |
| Wind / tyre screech / sub | Speed² bandpass noise / slip-driven bandpass noise / sine an octave under `f0` |
| Collision thud | White-noise burst scaled to impact `dv` |
| Rivals / space | Panned, Doppler-shifted voice pool / generated-IR convolver per venue (desktop only) |
| Music | Streamed CC0 tracks (`assets/music/`) via `startMusic()` / `stopMusic()` |

Every tune knob is a constant multiplier, never a function of rev: pitch stays
monotonic in rev by construction. `__apex.audio()` / `audioTune()` are the
hooks; `tests/unit/audio-tune.test.mjs` sweeps every profile and slider end.

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
oscillator frequencies. After an edit, reload — WebAudio does not hot-reload
(no cache bump: tags read `?v=dev`). Confirm with `GameAudio.rate()` at the
same speed. A player-side complaint about the SHAPE of the curve (idle too
high, top not high enough) is a tune question first: `__apex.audioTune({ idle,
revRange, curve, pitch })` covers a 50:1 spread before any code changes.

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
