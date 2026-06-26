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
// Is audio context running?
GameAudio._ctx && GameAudio._ctx.state   // "running" | "suspended" | "closed"

// Resume a suspended context (autoplay policy)
GameAudio._ctx && GameAudio._ctx.resume()

// Check master gain
GameAudio._masterGain && GameAudio._masterGain.gain.value

// Force a volume set
GameAudio.setVolume(0.8)

// Mute / unmute without touching the UI
GameAudio.setVolume(0)
GameAudio.setVolume(1)
```

## Tuning the engine pitch curve

The pitch mapping lives in `js/audio.js`.  Search for `enginePitch` or the
`update(speed, gear, ...)` call.  The curve is typically:

```
freq = BASE_FREQ * (speed / SPEED_REF) * GEAR_RATIOS[gear]
```

Change `BASE_FREQ`, `SPEED_REF`, or `GEAR_RATIOS[]` to shift the tonal range.
After editing `js/audio.js`, **bump the cache version** (`bump-cache` skill) and
reload — WebAudio doesn't hot-reload.

## Diagnosing silence or flat pitch

1. Check `GameAudio._ctx.state` — if `"suspended"`, the user hasn't interacted
   yet. Click the `#soundbtn` or call `GameAudio._ctx.resume()`.
2. Check master gain > 0 and `#soundbtn` isn't in the "OFF" state.
3. Open the browser's Web Audio Inspector (Chrome DevTools → three-dot → "Web
   Audio") to see the live node graph and verify oscillators are connected.
4. Confirm the game loop is running: `__apex.timing().raceT` should be
   increasing. A frozen sim means `GameAudio.update()` never gets called.

## Testing

No dedicated audio spec exists — the audio engine is integration-tested via the
smoke suite (`npm run test:smoke` confirms the page loads without JS errors, which
includes the audio module init).  For a targeted check, load a race in the
browser and use the DevTools Web Audio panel.

```sh
npx serve -l 3456 .
# Open http://localhost:3456, start a race, open DevTools → Web Audio
```
