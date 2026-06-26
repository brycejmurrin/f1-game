---
name: audio-debug
description: Inspect and tune the WebAudio synth engine in js/audio.js — engine pitch curve, sfx triggers, music layers, and mute/volume state — using the __apex audio hooks and the browser console. Use for "the engine sounds flat at high speed", "sfx isn't triggering", "tune the gear-shift audio", "the music cuts out", "audio debug". Triggers - "audio", "sound", "engine pitch", "sfx", "music layer", "mute".
---

# Debug and tune the audio engine

The game uses a WebAudio synth (`js/audio.js` — the `GameAudio` IIFE). The
engine voice has two layers: a **sample-based core** (CC0 MP3s in
`assets/sfx/f1_engine.mp3` + `f1_rev.mp3`, pitched via `playbackRate`) and a
**synth fallback** (detuned sawtooth oscillators + lowpass) that takes over if
the samples haven't decoded yet. Gear-shift pops, collision thuds, and ambient
music tracks are separate layers. All audio paths pass through a single `master`
gain node.

## Architecture overview

`GameAudio` exposes one object on `window.GameAudio`.  Key internals:

| Layer | What it does |
|---|---|
| Engine (sample core) | `f1_engine.mp3` (idle loop) + `f1_rev.mp3` (high-rev loop) crossfaded by load; pitch set via `playbackRate` per gear/RPM |
| Engine (synth fallback) | Three detuned oscillators (saw×2 + square) through a speed-tracking lowpass; fires until samples are decoded |
| Turbo whine | Sine oscillator at ~1500 Hz, level tracks throttle |
| MGU-K harvest whirr | Filtered noise that fades in when decelerating |
| Rev-limiter / gear-shift pop | Short blip at gear-change boundary; `shift()` call |
| Collision thud | White-noise burst scaled to impact `dv` |
| Tyre screech / skid | Filtered noise proportional to lateral slip |
| Music | Streamed CC0 tracks (`assets/music/`) via `startMusic()` / `stopMusic()` |
| Master enable | `GameAudio.setEnabled(bool)` — sets master gain 0 or 0.8; wired to `#soundbtn` |

## Quick inspection (browser console)

```js
// Is the engine enabled?
GameAudio.enabled()   // true | false

// Mute / unmute without touching the UI
GameAudio.setEnabled(false)   // mute (master gain → 0)
GameAudio.setEnabled(true)    // unmute (master gain → 0.8)

// Sample-load status + whether the sample or synth core is active:
GameAudio.debug()
// { samplesReady: bool, usingSamples: bool, engineOn: bool,
//   loop: { s: loopStart, e: loopEnd } | null }

// Current playback-rate (pitch multiplier) of the idle engine sample:
GameAudio.rate()   // e.g. 1.42 at mid-speed — 0 if synth core or engine off

// Spectral centroid of live engine output in Hz (pitch proxy):
GameAudio.centroidHz()  // e.g. 340 at idle, higher at speed

// The AudioContext itself is a private var — not directly exposed.
// Use GameAudio.debug().samplesReady to check if assets loaded,
// and __apex.timing().raceT to confirm the sim is running.
```

## Tuning the engine pitch curve

The pitch mapping lives in `js/audio.js` — search for the `setEngine(speed,
gear, ...)` function.  The **sample core** sets `playbackRate` proportional to
RPM (derived from `speed` and the per-gear ratio array near that function).  The
**synth fallback** sets oscillator frequencies directly.  To shift the tonal
range, adjust the gear-ratio constants or the RPM→rate mapping in `setEngine`.

After editing `js/audio.js`, **bump the cache version** (`bump-cache` skill) and
reload — WebAudio doesn't hot-reload.  Use `GameAudio.rate()` before and after
to confirm the playback-rate changed at the same speed.

## Diagnosing silence or flat pitch

1. Check `GameAudio.enabled()` — if `false`, call `GameAudio.setEnabled(true)`.
2. Check `GameAudio.debug().samplesReady` — if `false`, the MP3s haven't decoded
   yet (network or CORS issue); the synth fallback should be active.  Check
   `usingSamples` to confirm which core is running.
3. If the AudioContext is suspended (autoplay policy), clicking `#soundbtn` or
   any user gesture resumes it.  In the browser console:
   ```js
   // Reach the AudioContext indirectly — it's private, but the game's
   // init() is triggered by user interaction. For a quick test:
   document.dispatchEvent(new MouseEvent("click"));
   ```
4. Open Chrome DevTools → three-dot → **Web Audio** to see the live node graph
   and verify oscillators / buffer sources are connected to the destination.
5. Confirm the game loop is running: `__apex.timing().raceT` should be
   increasing.  A frozen sim means `setEngine()` never gets called and pitch
   stays at the last value.

## Testing

`tests/audio-smoke.spec.js` covers three checks: `GameAudio` is defined, the
OfflineAudioContext synthesis pipeline produces non-silent output, and
`AudioContext.resume()` transitions to `"running"`. Run it with:

```sh
npx playwright test tests/audio-smoke.spec.js
```

For live inspection, start the dev server and use DevTools Web Audio:

```sh
python3 -m http.server 3456
# Open http://localhost:3456, start a race, open DevTools → Web Audio
```
