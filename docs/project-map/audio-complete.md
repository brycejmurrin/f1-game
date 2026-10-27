# Audio complete source map

Read completed 2026-10-27 against local HEAD `64809115e276d7a2b03ccf5678773a001e817db3`. Scope: every byte/line of all 20 JavaScript files in `js/audio/`, 11,947 lines. Each range below was returned in a bounded terminal read with no output truncation, then inspected. Concatenated reads included whole short files. Hashes identify the source snapshot; they are not substitutes for reading. Source files were not edited. No browser, audio playback, network service authentication, or commit was performed.

Read instructions: repository `AGENTS.md` and `.claude/skills/code-nav/SKILL.md`. Additional bounded context reads: `tools/manifest.cjs:1060–1108`, `js/core/lazy-bundles.js:535–567,605–661`, `js/game.js:55–100,4685–4745`, and `types/game-ctx.d.ts:425–447`. Those supporting files were not fully read in this audio task.

## Full read ledger

| File in `js/audio/` | Lines | Inclusive ranges read | SHA-256 |
|---|---:|---|---|
| `announcer-recorded.js` | 83 | 1–83 | `93c9266ae6c7c27b9b067cfa5c26c2e748bd5da9bc07320711e83d20dce20ba8` |
| `announcer.js` | 891 | 1–500; 501–891 | `19c82de159d84765d1ed8e65d2dc412a0276d18b37c8bbd2efc8cf2df545543f` |
| `battle-earcon.js` | 124 | 1–124 | `58dd663ea20655ab4c347ea68a9d77283f8260080dbf2300b468033cdd01925a` |
| `car-sfx.js` | 65 | 1–65 | `a0a3c1d078c83710d8864bdf9999ec161087c8800036c6856ec3a5f8469e6b8b` |
| `crowd.js` | 455 | 1–455 | `e1ea96334820ec0f307c5b41f6c1a03080cf4c3892e7af89f10912e030ed9003` |
| `driving-cues.js` | 260 | 1–260 | `1d3dc58e4b70efdfe135fc8d530b3a0062a2ea5ec95c000509d00849982f7f41` |
| `engine.js` | 3342 | 1–500; 501–1050; 1051–1650; 1651–2250; 2251–2850; 2851–3342 | `4d3957e1c67cf8575b4cc452c2a06afe3336b5595633aa14ec1ae1a626a9aa71` |
| `ers-layer.js` | 246 | 1–246 | `d0cb1e7cef7c6bb11c30d190514eaaf906dd27684bb9534b370897545977476c` |
| `music-lib.js` | 390 | 1–390 | `9861b4fc1a4ee51fc687e7f0dc473982ce24344c7b38d059f42aaef07b985aa8` |
| `panel.js` | 1023 | 1–520; 521–1023 | `98827c14c630498887f5c1d64c0d7ffa931baafea8ab34341597b5e102e4704b` |
| `race-mix-audition.js` | 58 | 1–58 | `4954a4f848219074cb351dce4c5b8e74c1c35b9c438b7ea24a1c7582e9c67b48` |
| `radio-fx.js` | 605 | 1–330; 331–605 | `dbd267abfb3c9e9afee92757122a2b6abcb1b9b99fcaaa7ad06841ae97426c35` |
| `radio-voice.js` | 1004 | 1–500; 501–1004 | `f8a98e7ab66d88105f2db793bea781da8ecfb49bfdc86fb2618e6a248248968a` |
| `rivals.js` | 359 | 1–359 | `60f7b6f9f8ccd38412bcdd6dea053d364fce39c452fa4fdbdcd4768c5c57e7b8` |
| `signal.js` | 242 | 1–242 | `4abe27130018800ab1bf7f7f74d135877ebeb045bc0cfceea75e3768d2f7fe04` |
| `soundtrack.js` | 618 | 1–350; 351–618 | `b7d67f2e6270a3d76b223245393d7fe6adc167a2d29f39494b18ce8a17b42012` |
| `spotify.js` | 1483 | 1–500; 501–1000; 1001–1483 | `1c5771e5c62b6e0a3733892f82a8257c943298283184edbddbcb24dd259b5681` |
| `stub.js` | 143 | 1–143 | `e8ec8b7096ece9d6a174aefe1545c1bb74f59e8effc7047e9a9475d23ba70133` |
| `tone-model.js` | 138 | 1–138 | `0ee5d44030cbd4f5df01a196c999945624ea5cd39fbda9dbc997d1f90d5634cc` |
| `voice-pack.js` | 418 | 1–418 | `913c6004cf4e22d06dd1b888f0d23d7fc56a2195c7b36df9f9f098181d77bd49` |

## Boot, contracts, and ownership

`tools/manifest.cjs:1067` owns LAZY_AUDIO's 19-file roster; `stub.js` is the twentieth file and is on the title wall. The real modules replace top-level `var` bindings. The roster first installs signal/soundtrack/radio-FX/tone/ERS services, then the engine, library/Spotify/rival/crowd/car SFX, pack/earcon/radio/recorded announcer/announcer/panel/cues. Explicit dependency edges, rather than a hand-maintained document order, are authoritative.

`LazyBundles.ensureAudio` loads strictly, tracks per-script success, retries failed work, yields before heavy evaluation and before ready hooks, and reports false if any file or ready hook fails. `restoreOnEngine` replays master/volume/focus settings, interruption hook, saved camera mix, and permitted context initialization formerly sent to the stub. `game.js:81` recreates radio, announcer, rivals, car SFX, panel, panel restore and driving cues with independent once latches. The loader binds CrowdAudio to G afterward. These steps matter: an old captured stub object does not acquire the replacement's methods.

The façade contract declares `G.radio` at `types/game-ctx.d.ts:437` and `G.announcer` at 443, with sound/music booleans at 588/591. The radio declaration is a small public subset (enable/volume/availability/unlock/stop/yield); real audio modules also call pack, tuning, preview, timing, halt and debug methods. Treat the current runtime return objects as necessary additional contracts; this review did not expand or type-check declarations.

Engine factories receive functions returning the current context/master/bus/clock rather than captured node references. This is the principal rebuild boundary. Playback generations in engine and soundtrack represent explicit owners; lifecycle restarts retain ownership. RaceMixAudition and panel previews use generation-conditional stops so an expired sample cannot stop a subsequently started race or manual track.

## Graph and lifecycle

`GameAudio` owns AudioContext, master gain (0.8 or mute), compressor/limiter, and two parallel SFX gains into master: `sfxBus` and selective `focusBus`. Soundtrack's music gain connects directly to master. Recorded speech uses cached FX chains directly into master, independent of the SFX switch. Browser speech synthesis is outside this graph and therefore needs explicit sound/pause/hidden-tab cancellation.

The engine core, engine reverb return, rival engine voices, sub oscillator, turbo/harvest/legacy ERS layers and rival pass-by destination use focusBus. Skid, scrub/lock, offroad, kerb, spray, wind, brakes, contact voices, rain, one-shots and crowd use sfxBus. The separate ErsLayer attaches to sfxBus. In STANDARD focus mode both buses follow the combined radio/spotter duck; nonzero focus dB makes scheduled actual voice spans/holds attenuate focusBus while sfxBus follows normal SFX volume. Music has its own combined radio/spotter hold and rev duck.

Context creation handles unsupported/throwing constructors, suspended resume promises, interruption state changes and output-device changes. Device rebuilds debounce for 280 ms, defer while hidden or without activation, and cap at three per 30 seconds while remembering pending work. Rebuild closes the old context, clears context-related service state, releases radio holds, reattaches leaf graphs and restores wanted music/engine/rain. Hidden-tab teardown records generation owners, stops sources, suspends the context and restores only still-owned playback on show. Explicit stop cancels a pending hide resume.

Engine start arms teardown before constructing nodes, so a partial construction can be cleaned. Stop ramps and schedules source stops, collects filters/gains/panners for a 450 ms disconnect, and a new start flushes older fading batches. Sample upgrade preserves the synth fade as a crossfade. These are source-level lifecycle protections; no device interruption or leak census was executed here.

## File responsibilities and behavior

| File | Responsibility and critical boundaries |
|---|---|
| `stub.js` | Safe title-wall globals, no-op playback, preserved interruption callback, lazy sound-button handoff. A surface subset, not an identical implementation of every real getter. |
| `engine.js` | Context/buses/lifecycle, sampled or synthesized engine, continuous physical sounds, positional field contact, rival engines, camera/venue/tone mix, replay/countdown feeds, public mixer and telemetry. |
| `signal.js` | Autocorrelation period estimate, memoized stable loop selection, eight reusable blip voices, shared three-second one-shot noise and keyed continuous-loop noise caches, envelope/noise primitives. |
| `tone-model.js` | Six manufacturer timbres (including default), positive clamped pitch controls, 22 tune fields, 12 layer defaults, five named profiles, custom-profile matching. No graph or car mutations. |
| `ers-layer.js` | Fixed deploy, regen, sustain and boost cue oscillators attached per context; charge/deploy/braking gates and thresholded parameter updates. Engine mutes legacy ERS when this service is present. |
| `car-sfx.js` | Read-only player-state reduction to scrub/lock/surface/pit limiter and pit-gun transition edges; rewind and car changes reseed edges. Reused output object. |
| `rivals.js` | Four nearest 150 m track-frame rows, stable car-to-engine-slot assignment capped to live mobile/desktop engine count, LOS closing speed, world positions, four fixed pass-by noise voices, field tyre contact calls and wet-spray wake. Returned rows/array are reused. |
| `crowd.js` | Shared host/context, fixed bed plus mobile-tiered cheer pool, pit-straight and cached stand proximity, position/finish swells, wrappers around GameAudio methods and race/pause/results gates. |
| `soundtrack.js` | Six built-ins plus caller-owned upload URLs, source filters, advance/failure/stream-unlock handling, per-context bounded decoded buffers and serialized decode tail, streaming, backend handoff, ownership generations and duck composition. |
| `music-lib.js` | IndexedDB Blob persistence, serial imports, 25 MB file cap, type/name checks, transaction-complete writes, own `user:<id>` IDs/object URLs and health/retry rows. Explicit URL revocation on remove/clear; rehydrates real playlist after lazy stub. |
| `spotify.js` | Optional PKCE login, raw local token/config storage and session verifier/state, refresh coalescing, remote Connect default or SDK browser mode, backend bridge, controls, diagnostics and settings/player UI. Stale-session guards, network/body timeouts, 10 s hidden-aware polling, 429 hold and coalesced per-device volume. |
| `radio-fx.js` | Channel courtesy figures/hiss/squelch, modern/clean/vintage presets, cached bounded speech chains and crossfaded decoded parts, independent spotter hold, focus spans, WATCH MediaElement/fetch-decode/plain-audio fallback. |
| `voice-pack.js` | Six voice catalogue/cross-channel pack IDs; whole-line then greedy clip composition; codec probes; manifest/binary integrity checks; bounded fetch/decode/cache state; staged pack loading and announcer gate; one live line per channel, generation/budget checks and decode watchdog. |
| `radio-voice.js` | Card speech policy, normalization, budget/lead estimates, radio/control/coach/commentary mapping, recorded versus system source, voice choices/tuning, explicit previews, synth ownership/latency statistics, squelch pool, mute/pause/card lifecycle. |
| `announcer.js` | Priority-ranked circuit/session/story script, fitting, real-race/grid/result narration, system voice preference ladder, recorded delegation, per-line synth chain and ending alignment, preview/read-length APIs. |
| `announcer-recorded.js` | Generation-owned intro load/queue/deadline, recorded coverage fallback phrasing, budget/closing-line reservation, paused editor auditions and per-line continuation. Unknown spoken copy is omitted, not silently reassigned to another speaker. |
| `battle-earcon.js` | Four finite ahead/behind × closing/opening motifs. Pure checkpoint-fact selection; explicit WAV/decode preparation; context generation ownership, quiet-channel checks and bounded handle teardown. No automatic race-frame PCM generation. |
| `driving-cues.js` | Opt-in curvature-reading brake urgency and left/right calls; predictive cue priority; condition capacity option; corner-exit, time and distance rearming. OFF/paused/nonrace/WATCH path returns before curvature reads. Never writes car physics. |
| `panel.js` | Master and independent music/SFX/voice controls, settings persistence, source/transport/now-playing rows, engine profiles/layers, recorded/system voice rows, focus and earcon settings, preview ownership and lifecycle cleanup. |
| `race-mix-audition.js` | Explicit six-second engine/music/radio sample; refuses a live race engine, observes mute settings, and stops only owned generations. Service does not install itself as a game-loop producer. |

Engine details: sampled playback uses a cropped approximately two-second stable loop from one MP3, common RPM-only base rate with tune/voice/boost factors, snap on gear changes/large discontinuities and a fade from synth when samples arrive. Synth fallback uses per-gear frequency spans and different relative levels. Redline cut has capped depth, independently tunable rate/sag and top-gear hold/fade; pit and cylinder modulation share the engine gain. Physical extras include standardized positive acceleration, absolute braking, slip, pedal state, wetness, kerb, towing and battery. Scalar skid is already normalized by the caller; raw-axis skid uses the internal threshold. Rival engine panning can use external camera world basis; pass-by noise currently uses player-frame lat/arc.

Soundtrack streaming defaults on phones and is always attempted for user uploads. Decoded fallback caches one mobile/two desktop tracks and serializes decode; user fallback checks metadata or a 128 kbps size estimate against 600 seconds. That estimate is not a strict PCM-size proof for arbitrary files. Upload URLs belong to MusicLib; soundtrack never revokes them. Spotify audio is outside WebAudio and does not receive the local graph's compressor or radio duck. Remote mode requests ambient iOS audio-session mixing.

Speech policy: recorded mode leaves uncovered/unready race lines written and does not synthesize them. System mode budgets a local voice against the card, speeds to max before refusing, and reserves courtesy lead. Pre-race announcer source selection is independent; in-race commentary follows race source while obeying announcer enable. The spotter and engineer have separate playback channels/duck holds. Intro and results narrator own separate scheduling from the race card. A whole-line pack key outranks fragment assembly; pack bytes must match SHA-256/length metadata before use. Decoded clip LRU bounds are 80 clips plus 24 seconds mobile or 90 desktop, except the newest clip is retained even if individually oversized.

## LSP consumers and evidence limits

Attached apex-lsp queries used `outputLevel: full`, bounded limits and concise callers. `GameAudio` outline returned 155 exported rows, including re-export aliases and duplicate identifier forms; this is not a count of 155 distinct stable APIs. Callers obtained:

- `GameAudio.setEngine`: `js/game.js:4720` update, `js/garage/setup-camera.js:217` driveOutSound, and CrowdAudio's wrapper capture at `crowd.js:381`.
- `GameAudio.startEngine`: startRaceBody `game.js:2697`, closePitWork `9126`, setPaused `9280`, setup drive-out `setup-camera.js:199,203`, panel sound restore `panel.js:67`, and crowd wrapper capture `409`.
- `RadioVoice.create` and `Announcer.create`: initial game construction and `onAudioReady` reconstruction. `AudioPanel.create`, `RivalAudio.create` and `DrivingCues.create`: corresponding game ready/reconstruction sites; cues also initialize from `js/input/steer-tuning.js:10`.
- `VoicePack.create`: `radio-voice.js:304`. `GameAudio.radioVoice`: pack capability check and playback at `voice-pack.js:352,380`.
- `G.radio` definition resolved explicitly to the GameCtx row at `types/game-ctx.d.ts:437`.

Repeated `var` globals caused the server to label several results as text-match candidates whose runtime winner depends on reinjection order. The attached result for `GameAudio.radioVoice` did not list BattleEarcon's injected `audio.radioVoice`, and `startEngine` did not list RaceMixAudition's injected `audio.startEngine`. These direct full-file reads establish those extra consumers. Counts are navigation evidence, not a proof of no other dynamic/injected use. No LSP diagnostics or runtime tests were used to infer that source behavior is correct.

## Verified comment discrepancies

These are source/comment mismatches, not claimed audible regressions. Sources remain untouched.

1. `tone-model.js:8,26` says redline gear 1 is below gear 4 by construction. The shipped sample path in `engine.js:1737–1760` uses the same base rate in every gear; gear affects snap recognition, not that rate. The synth fallback does retain per-gear spans. Replace the blanket invariant with per-core behavior.
2. `tone-model.js:97` and `engine.js:2587` call TEAM identity trims. `TUNE_DEF` at tone-model 65 has pitch 0.85, range 1.3, sub 0.25, limiter 2.25 and other nonidentity values. TEAM restores shipped defaults, not all multipliers to one.
3. `voice-pack.js:5–7` promises synth fallback for an uncovered pack line. `radio-voice.js:676–682` explicitly returns false in recorded race mode, recording `pack-loading`/`not-recorded`. Current fallback is the written card.
4. `radio-voice.js:33–35` says announcer appears nowhere in SPEAKERS and never passes say. SPEAKERS has `comm: "announcer"` at 22, and say treats commentary as announcer-controlled. Pre-race narration remains separate; race commentary is the exception the old comment omits.
5. `signal.js:1` says resetContext discards only noise cache. Its body at 224 also clears keyed loop noise and disconnects/clears the blip voice pool. Comment understates lifecycle responsibility.
6. `engine.js:374,1208,3168,3283` describe engine/reverb/rivals/sub routing through sfxBus. The actual core tail at 1124/1127, return at 1220, rival tail at 1248 and sub at 1204 connect to focusBus. The analysis tap distinction remains useful; the bus name is stale.
7. `engine.js:192–193` promises hard zero mutes exactly. `aimGain` at 197 applies the same absolute near-target early return to zero: previous target 0.00005 followed by zero returns without scheduling zero. This is a definite pure-control counterexample, not a measured perceptual issue; the residual is below the stated threshold. Similar helpers elsewhere use the same tolerance.
8. `engine.js:1471–1473` describes a six-loop harvest/skid/scrub/surface/wind/brake contract, while kerb and spray loops are also explicitly constructed and started at 1398–1419/1466–1467. Field contact still correctly uses pooled oscillators.
9. `engine.js:2490` calls buildIR exponentially decaying; samples at 2507 multiply by `(1 - i / len)^2.5`, a polynomial envelope. It still has lowpassed independent stereo noise and a finite decay-duration setting.

## Validation and remaining uncertainty

PASS: all 20 full source reads, no truncated output; manifest/lazy/game/type supporting boundaries inspected; LSP contract and principal callers inspected; snapshot hashes and complete line ranges recorded. No source file change is part of this report.

SKIP: browser/game execution, rendered audio listening, WebAudio hardware/CPU/memory measurements, codec/device/iOS behavior, Spotify authorization/API compatibility, and automated source tests. Historical measurements, policy claims and linked research in comments were read as provenance, not revalidated. Documentation integrity checks belong to the coordinating lane's final combined docs change; this subtask does not assert that those checks passed.
