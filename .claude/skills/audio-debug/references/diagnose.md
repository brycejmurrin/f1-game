# Audio layers, mute path, silence diagnosis

Load this when the engine is silent, pitch is flat, or a mute toggle did the
"wrong" bus.

## Contents
- Layers
- In-race mute (not `#soundbtn`)
- Pitch curve
- Diagnosing silence or flat pitch
- Gear-shift cue silent
- Music cuts out on pause / never resumes

## Layers

| Layer | What it does |
|---|---|
| Engine (sample core) | `assets/sfx/f1_engine.mp3` looped and pitched via `playbackRate` (`f1_rev.mp3` is on disk but nothing loads it) |
| Engine (synth fallback) | Three detuned oscillators (saw×2 + square) through a speed-tracking lowpass until samples decode |
| Pitch curve | sample core: `(RATE_IDLE·idle + RATE_SPAN·revRange·rev^curve)·(1 + 0.04·boost·boostPitch)·rateTrim·pitch·(1 + 0.05·revFlare)`, `RATE_IDLE` 0.17, `RATE_SPAN` 0.5115 (`engine.js`); no gear term, so one rev is one note in every gear (the synth fallback does use per-gear `gIdle`/`gSpan`). `rev` is `rpmFor(gear, speed)` normalised, so it pins at 1 in the top of each gear. `GameAudio.rate()` reads the result |
| Gravel | Sine at the crank rate (`f0/3`, 18–140 Hz) into `engGain.gain`; depth `(1-rev)²` × GRAVEL trim; `gravelDepth()` / `gravelHz()` |
| Rev limiter | 13 Hz square into `engGain.gain` above 98.5% revs, and into the core's detune for the pitch sag; DEPTH / RATE / PITCH SAG trims; `limiterDepth()` / `limiterHz()` / `limiterCents()`. In TOP gear the cut is a 0.5 s burst fading over 0.5 s to a steady note (`limiterHeld()` is the clock) — a car pinned at top speed has no gear to shift into. Below top gear it never fades |
| Turbo whine + wastegate | Sine ~1500 Hz tracking rev; a falling hiss once per lift after ≥0.5 s under load (`wastegateState()`) |
| MGU-K harvest / ERS deploy | Filtered noise when decelerating (HARVEST trim) / triangle whine while deploying + the deploy whoosh (BOOST level) and a rev lift under deploy (BOOST rev lift) |
| Brakes | Bandpass noise, gain = deceleration × speed; `brakeLevel()` |
| Gear shift | Saw crack + click, scaled by the SHIFT trim (`shiftState()`; silent-cue path below); the rev-cut duck is the engine's own. A DOWNSHIFT also sets `revFlare` (heel-and-toe blip: +5% playbackRate, decays over ~90 ms); an upshift has the duck but no blip |
| Overrun | Irregular crackle one-shots on a trailing throttle (`overrunState()`) |
| Wind / tyre screech / sub | Speed² bandpass noise / slip-driven bandpass noise / sine an octave under `f0` |
| Collision thud | White-noise burst scaled to impact `dv` |
| Rivals / space | Panned, Doppler-shifted voice pool / generated-IR convolver per venue (desktop only) |
| Team radio FX | `radioSting(channel, seconds)` — key click, a 300 Hz–3.4 kHz hiss bed held for the card's life, squelch tail. Fired from `showAnnounce` (race/count only), channel from `RadioVoice.SPEAKERS`; `coach` is deliberately silent. Level `setRadioFx` / `radioFxLevel()`, store `apex26.radioFx`. NOT a filter on the voice — speechSynthesis has no node in this graph and no browser exposes its output |
| Music | CC0 tracks (`assets/music/`) via `startMusic()` / `stopMusic()`. Desktop decodes each to PCM (2 cached); a phone STREAMS through one `<audio>` → `createMediaElementSource` → `musicGain` (`streamMusic()` in `soundtrack.js`; `localStorage apex26.musicStream` `"1"`/`"0"` overrides for an A/B). `sw.js` leaves `Range` music requests to the network (Safari needs 206) |

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
| Music ON/OFF | `#as-music-sel` (+ `#as-music-prev` / `-next`) | `setMusicEnabled` — soundtrack only |
| SFX ON/OFF | `#as-sound-sel` (+ `#as-sound-prev` / `-next`) | `setSfxEnabled` — engine + effects only |
| Volumes | `#as-mvol` / `#as-svol` | `setMusicVolume` / `setSfxVolume` |
| Radio FX | `#as-rfx` | `setRadioFx` — sfx bus, so it is independent of the TEAM RADIO voice switch |

Turning **music** off and expecting silence is the common mistake — the
engine idle still hums on the **sfx** bus. That is correct.

`setPaused(true)` calls `GameAudio.stopEngine()`; resume calls
`GameAudio.startEngine()` again when `soundOn` is true (independent of music).

## Pitch curve

Search `js/audio/engine.js` for `setEngine(rev01, boost01, offroad, speed01,
gear)`. The sample core sets `playbackRate`; the synth fallback sets
oscillator frequencies. After an edit, reload — WebAudio does not hot-reload
([shell/cache](../../check-changes/references/bump.md): `?v=dev`, no bump). Confirm with `GameAudio.rate()` at the
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
3. Suspended AudioContext (autoplay): a user gesture resumes it.
   Use a real UI click/tap or keyboard activation to unlock audio. Script-dispatched events do not establish trusted user activation; programmatic probes work only after unlock.
4. Chrome DevTools → **Web Audio** — confirm oscillators / buffer sources
   reach the destination.
5. `__apex.timing().raceT` should be increasing. A frozen sim means
   `setEngine()` never runs and pitch stays at the last value.
6. Flat only at top speed: that is `rev` pinned at 1 (`rpmFor` caps at
   `MAX_RPM·1.04`, `revFrac` is clamped), not a bug in the curve. Above 98.5%
   revs the limiter chops, and in top gear it fades to a steady note after
   `LIM_HOLD` 0.5 s + `LIM_FADE` 0.5 s (`limiterHeld()`, `limiterDepth()`). Read
   `GameAudio.rate()` at two speeds in top gear: equal = pinned by design. To
   widen the top, raise `__apex.audioTune({ revRange })` or bend `curve`.

The AudioContext itself is a private var — not exposed. Use
`GameAudio.debug().samplesReady` and `centroidHz()`.

## Gear-shift cue silent

Trigger path (all `GameAudio.shift(up)`; none in physics):
Search `GameAudio.shift` in `js/game.js`: manual-gear branches and the auto
`naturalGear(speed)` comparison against `c.gear`. Each needs
`soundOn && c.local` (+ `state === "race"` on the auto path), so a VS FRIEND
rival's shift is deliberately mute. In `engine.js` `shift()` returns at once
unless `sfxOk()` (ctx exists, master AND sfx bus on); there is no layer switch
for it. The remaining gate is the SHIFT trim (`#as-t-shift`, range 0–3, `0` =
silent gearbox; the rev-cut duck is separate and survives it).

Read it: `GameAudio.shiftState()` → `{ fired, peak }` (not in `__apex.audio()`;
call it via `apex_eval`/DevTools). `fired` not rising on an upshift = the
trigger never reached `shift()` (check `soundOn`, `c.local`, gear mode);
`fired` rising with `peak: 0` = SHIFT trim at 0; both fine = bus/mute, see
above. No browser needed for the unit check:
`node --test --test-name-pattern="SHIFT trim" tests/unit/audio-tune.test.mjs`
(fake AudioContext; asserts one crack per `shift(true)`, peak scales with the
trim, 0 is silent, duck survives). Green means `shift()` itself is sound, so
look at the callers.

"No blip" has two readings. An UPSHIFT only ducks the engine (`shiftDuck`) and
cracks; the heel-and-toe pitch flare (`revFlare`) is DOWNSHIFT-only (`shift(false)`),
so a missing blip on an upshift is by design. For a missing downshift blip check
`shiftState().fired` rises, then that the engine is running (`debug().engineOn`;
`shift()` sets the flare only when `engineOn`). The flare is +5% playbackRate
decaying over ~90 ms on the sample core only (the synth fallback ignores it; `GameAudio.carSfx().revFlare` reads it) and is not scaled by the SHIFT trim
(a trim of 0 silences the crack, not the flare).

## Music cuts out on pause / never resumes

Pausing does NOT stop music: `setPaused(true)` (`js/game.js`) stops only the
engine and skid; the soundtrack keeps playing under the pause card. Music stops
for exactly these reasons, so find which one applies:

1. Hidden tab / lock (`onVisibility` in `engine.js`): `stopMusic()` + `ctx.suspend()`,
   remembering `resumeMusic`; show → `resumeIfNeeded()` then `startMusic(lastTrackIdx)`.
   A hidden tab also calls `setPaused(true)` (game.js `document.hidden`), so this
   reads as "paused → music died". A missing `contextState: "running"` after show
   in `GameAudio.debug()` = the resume never ran (iOS interrupted; `onInterrupted`).
2. `setMusicEnabled(false)` / MUSIC OFF in `#audioset` (persisted; `startMusic` returns early).
3. Every track failed to decode (or, streaming, raised a media `error`) → `musicLoadFailed` stops the list (`audio-recovery.test.mjs`). A stream whose `play()` was refused (`NotAllowedError`, iOS with no gesture) logs a warn and retries on the next `startMusic`.
4. Resume with SOUND off: `setPaused(false)` restarts music only when `soundOn`.
5. Not a cut-out: the engine duck (`musicGain` × `1 − 0.25·rev`, released by `stopEngine`)
   and the radio duck (`setRadioDuck`, ×0.35 while a line is on air) only LOWER it.
   A music level stuck low after pause = `radioDuck` never released (`voice-pack` / `radio-voice` callers).

There is no "music is playing" getter: read `GameAudio.debug().contextState` plus
DevTools → Web Audio (browser). Node level: `node --test tests/unit/audio-recovery.test.mjs`
pins the failed-decode advance, no `resume()` in a hidden tab, and the game.js resume wiring
(`setPaused` starts music again). NOTHING in unit tests pins the engine-side
hide→show music restart or the duck levels; a fix there needs a new case in that file's stub-ctx `boot()`.
