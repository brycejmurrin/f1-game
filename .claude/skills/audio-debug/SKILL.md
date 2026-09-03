---
name: audio-debug
description: Use when the engine sounds flat at high speed, sfx isn't triggering, gear-shift audio is wrong, music cuts out, mute/volume is stuck, or debugging WebAudio, engine pitch, sfx, sound, music layers, or audio in Apex 26.
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
GameAudio.debug()                   // samplesReady, usingSamples, engineOn, loop
GameAudio.rate()                    // idle-sample playbackRate (0 if synth/off)
GameAudio.centroidHz()              // spectral centroid of live engine
```

```sh
node tools/ci/test-bg.mjs ui        # audio-smoke + music-library
python3 -m http.server 3456         # then DevTools → Web Audio
```

`tests/specs/audio-smoke.spec.js` covers init, re-enable during a race, and a
user-gesture unlock (`setEngine(0.75, 0.4, false, 0.6, 4)` then
`centroidHz() > 50`). After editing `js/audio/engine.js`, `node tools/gen/gen-shell.mjs --check` (no cache bump: tags read `?v=dev` and the deploy stamps the hashes; after a `tools/manifest.cjs` change run `node tools/gen/gen-shell.mjs`).

## Load on demand

- Layer table, in-race `#audioset`, pitch curve, silence diagnosis →
  [references/diagnose.md](references/diagnose.md).
