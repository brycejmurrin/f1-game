# Unit tests 02c: audio continuation complete

Static source review on 2026-10-27. Completes group 02 positions 64–66: recovery's previously unread 161–827 and the full sample-upgrade and tune files. No tests, browser sessions, source edits, or commits were performed. The assertion inventory below records source contracts, not passing results.

## Hash and read ledger

| File under tests/unit | SHA-256 | Lines | Fully read bounded ranges |
|---|---|---:|---|
| audio-recovery.test.mjs | `b5b2cb4d2bde4e70aff28a456adfad49e4484361c23b8cfd7eebd9bc13ffffe8` | 827 | 1–430 (prefix/context included), 431–699, 700–827 |
| audio-sample-upgrade.test.mjs | `f57e9e410f668dc3bb30b44bb0b9d2f0733feebcf47ad1d705017f8c61849b75` | 290 | 1–290 |
| audio-tune.test.mjs | `ef2179fb49c5b3630771094dae2c9bb864be21d608a3042de5d2f89f71e54570` | 2548 | 1–420, 421–780, 781–1140, 1141–1500, 1501–1860, 1861–2220, 2221–2548 |

The first combined recovery-tail/sample output reported aggregation truncation; recovery 431–699 and 700–827 were subsequently re-read independently. The sample source itself was returned in full. Nothing remains unread in these three test files.

## Fixture and production map

All three load the real tone-model, signal, soundtrack, radio-fx and engine IIFEs into a Node VM, replacing top-level const with var and loading mat4 first. These are arithmetic/lifecycle simulations with generic AudioNodes, not audible output or device/browser proof. absSrc supplies VM source names, not runtime behavior.

- **Recovery:** boot records started nodes, fetch/decode URLs, per-context buffers, resume count, document visibility, global gesture listeners and mediaDevices devicechange. Options inject clocks, decode failures, timers, activation, media routing and Audio constructors. flush drains twenty setImmediate turns. fakeAudio emits metadata asynchronously on src assignment and exposes offsets; UPLOAD is user:7/blob:apex/7. The late pendingSoundtrack fixture isolates the real soundtrack factory with manually delivered responses, optional AbortController and a transport deliberately ignoring abort. auditionOn loads the real RaceMixAudition with a manually fired six-second deadline and disabled recorded-radio preference.
- **Sample upgrade:** held fetch resolvers make lights-out precede decoding; release drains eight turns. Counts measure node construction. sampleBuf makes four seconds of mono sine PCM at 8 kHz; the loop-window case instead makes six seconds with unstable first two seconds and stable later waveform. heldFetch records URLs; fakeAudio records plays/releases; store overrides only apex26.musicStream. APEX_AUDIO_SRC permits the engine source to be replaced for old-code comparisons, while dependencies remain current.
- **Tune:** recording AudioParams distinguish target/ramp/snap/cancel and count scheduling. A 44.1 kHz context avoids a false fixed sub-bass floor caused by 8 kHz stand-ins. live tracks disconnects, separately from source stop ownership. pendingTimers exposes delayed teardown; flushTimers catches teardown exceptions. SampleEngine releases decoding, synthEngine intentionally does not; neutralEngine explicitly applies TUNE_IDENTITY rather than conflating shipped defaults with identity. ctxTime drives time-based crackle, limiter and wastegate behavior. observeBuffers identifies short mono looping noise. realWatch throws if the audio guard builds a RealRace.status snapshot. duckRig captures the actual music gain. endAll and newTones expose radio teardown and melody. CarSfx cases use a separate real-module VM and minimal G. runAudioProbe substitutes only the CLI's dynamic harness import and Playwright boundary, recording browser/server cleanup, page errors and deterministic metric returns; it does not launch browsers.

Production navigation used the repository code-nav skill and local apex-lsp shell. Named GameAudio lookups reported both engine and stub contributions; these tests explicitly load engine.js, so the engine definition is the relevant one. Bounded outlines/definitions are navigation evidence, not whole-production-file read claims.

| Production surface | Responsibility established by tests and navigation |
|---|---|
| js/audio/engine.js:807 init | Creates context or resumes existing one; attaches touchend/pointerdown/keydown, visibility and output-device listeners. Recovery exercises hidden-tab deferral, stale statechange, 280 ms debounce, three rebuilds/30 seconds, retained capped requests, optional mediaDevices and constructor refusal. |
| js/audio/engine.js:1511 startEngine; :1534 stopEngine; :1658 setEngine | Graph versus playback ownership, delayed one-time sample crossfade, prepared per-context noise, source stop/disconnect lifecycle, gain/pitch scheduling, braking against model BRAKE 22 and pull via axStd. Bounded setEngine read shows sample upgrade, input normalization, brake/pull gates, transient clocks and rev curve/rate calculation. |
| js/audio/engine.js:2171 setGridIdle; :2196 syncReplayRpms; :2203 resetReplayScrub; :2204 feedReplayScrub | Countdown feed and replay helper pack. Full bounded feed definition confirms no-player return, one-shot exit, replay rpm resync, lazy engine start, normalized wet/energy/speed and collected rivals. |
| js/audio/engine.js:2234 startRain; :2267 stopRain; :2303 setSkid; :2351 setCarSfx; :2373 pitGun | Wanted-rain state versus audible graph; smoothed skid/noise, state-derived scrub/lock/rumble, pit-limit gain cuts and four staggered guns. |
| js/audio/engine.js:2386 setCameraMix; :2397 shift; :2477 setVenue; :2529 setVoice; :2573 setTune; :2588 setProfile; :2645 setRivals | Camera mix, engine identity, tune and profiles, spatial rival voice pools. Full setTune definition delegates finite-range patching/name recognition to GameAudioToneModel, applies live nodes and returns a copy. |
| js/audio/engine.js:2773 setLayer; :2785 deployBoost; :2812 collision; :2975 setUiEnabled; :3005 brakeCue; :3019 driveBrakeTone; :3029 cornerCall; :3064 setSfxVolume; :3069 setSfxEnabled | Layer hard gates, one-shot level trims, impact-dependent collision voices, pooled click dedupe, WATCH assist suppression and independent master/music/SFX/menu controls. |
| js/audio/engine.js:3111–3339 exported observables | Context/playback generations, graph gains/rates, loop metadata, live voices/chains, spatial state, cue counters and scheduling counters make otherwise inaudible regressions assertable. These are diagnostic contracts, not player sound-quality measurements. |
| js/audio/soundtrack.js:5 create | Factory owns builtin/user eligibility, backend lifecycle, offsets, cancellation/token ownership, streaming/decode and radio/engine duck composition. Bounded initial definition confirms desktop cache 2/mobile 1, localStorage stream override, one media element per context, always-stream uploads, 600-second fallback decode cap and 128 kbps estimate. |
| js/audio/radio-fx.js:7 create; :600 playWatchMedia | Radio hiss/courtesy/squelch, recorded-voice chains/presets/overlap, spotter duck ownership, streamed WATCH fallback. Exported playWatchMedia is a forwarding wrapper to factory-installed implementation. |
| js/audio/signal.js:45 findStableLoop | WeakMap memoizes stable loop metadata; buffer-window tests pin copied PCM, loop length and rival offsets. |
| js/audio/car-sfx.js:18 create | Full definition read: grip/speed/pit predicate drive levels; update uses pooled SFX, resets edge on new car or backwards raceT, fires loosen on box entry and tighten only box→out. |
| js/audio/race-mix-audition.js:16 start | Full definition read: refuses existing live engine, captures engine/music generations, validates timers, monitors mute settings every 200 ms, stops at 6000 ms. Recovery pins owner survival across graph replacement and revocation on later manual playback. |
| js/audio/panel.js; index.html; js/ui/platform-session.js; js/game.js; js/camera/mode-switch.js; js/camera/replay-buf.js | Static-text seams pin dynamic shell ids/ranges, offered profiles/layers, activation events, pause/rain/live-weather wiring, countdown/replay delegation, camera comfort and boot camera mix. Regex/source-shape checks can fail under harmless refactors and do not execute those game/UI flows. |
| tools/check/audio-test.cjs; tools/lib/harness.mjs | Help subprocess and substituted CLI flow pin help parsing, monotonic metric success, page-error failure, early stop and resource cleanup. VM browser fixtures cannot establish real WebAudio support. |

## Behavioral contracts

Recovery protects two distinct kinds of intent: internal suspension/rebuild preserves owner and offset; explicit stop/mute/replacement revokes retries/resume. It also ensures bounded playlist failure over the selected source rather than the library, no builtin fallback for empty MY TRACKS, no stale PCM allocation from uncooperative responses, per-source duck holds, device recovery availability and absence of duplicate WATCH fallback voices.

Sample-upgrade protects a single transition from synth to samples, bounded PCM lifetime on phones, stream overrides and source reuse, correct resumption/advance/failure/stop for streamed tracks, a master compressor, collision voice selection and audio-thread limiter construction. The loop-copy fixture checks both waveform endpoints, one shared copy and phase offsets; a buffer-length-only assertion would miss a wrong window origin.

Tune sweeps every profile, slider endpoints and combined extremes for positive finite monotonic rate and gear independence. It pins shipped defaults separately from neutral arithmetic, input sanitization, profile replacement/custom recognition, layer gate/fade-tail scheduling, limiter depth/rate/sag and top-gear timeout, independent tune dimensions, gain smoothing, no steady scheduling, mobile graph budgets, rival spatial/pitch identity, radio duck/chain ownership, pit edge rewind semantics, helper delegation, all-source stop and kerb/wet-wake gating. Detailed test titles and every assertion site follow; looped cases multiply these static sites at runtime.

## Complete assertion inventory

Each entry groups exact assertion call sites under its owning test or helper. Expressions are preserved in compact whitespace form; expected arguments and diagnostic messages remain visible. Thus precondition assertions and source-regex assertions are included as well as outcome assertions. Parameterized STOP tests have one source declaration executed for both AbortController modes.

### tests/unit/audio-recovery.test.mjs

42 test declarations; 185 static assertion sites.

**Line 68: "switching external music backends stops the outgoing player before starting the replacement"**

- 76: <code>assert.deepEqual(calls, ["spotify:start"], "reselecting a source does not interrupt it")</code>
- 78: <code>assert.deepEqual(calls, ["spotify:start", "spotify:stop", "other:start"])</code>
- 80: <code>assert.equal(calls.at(-1), "other:stop")</code>
- 81: <code>assert.equal(A.currentTrackId(), "builtin:menu", "the local soundtrack resumes")</code>
- 83: <code>assert.equal(calls.filter((c) =&gt; c.endsWith(":stop")).length, 2, "no outgoing player is orphaned")</code>

**Line 86: "a rejected outgoing backend stop does not prevent switching music sources"**

- 91: <code>assert.equal(A.currentTrackId(), "builtin:menu")</code>

**Line 94: "empty MY TRACKS stays silent across resume, music toggles, and backend removal"**

- 99: <code>assert.equal(A.currentTrackId(), "user:last")</code>
- 108: <code>assert.equal(A.musicSource(), "user")</code>
- 109: <code>assert.equal(A.currentTrackId(), null)</code>
- 110: <code>assert.equal(fetched.length, before, "no builtin track is fetched as a fallback")</code>
- 114: <code>assert.equal(A.currentTrackId(), "user:new", "a new eligible upload restores playback")</code>

**Line 117: "a context rebuild replaces cached noise and keeps the delayed sample fallback"**

- 124: <code>assert.equal(A.debug().usingSamples, true)</code>
- 131: <code>assert.equal(contexts.length, 2)</code>
- 132: <code>assert.equal(old.state, "closed")</code>
- 133: <code>assert.equal(A.uiEnabled(), false, "context replacement preserves upstream menu-sound preference")</code>
- 136: <code>assert.equal(noise.length, 8, "harvest, skid, scrub, surface, kerb, spray, wind, brake")</code>
- 137: <code>assert.equal(new Set(noise.map((n) =&gt; n.buffer)).size, 8)</code>
- 138: <code>assert.ok(fresh.buffers.every((b) =&gt; !oldBuffers.has(b)), "all prepared PCM belongs to the new context")</code>
- 139: <code>assert.equal(A.debug().engineOn, true)</code>
- 140: <code>assert.equal(A.debug().usingSamples, false, "the new context starts on the synth while decoding is pending")</code>
- 144: <code>assert.equal(A.debug().usingSamples, true)</code>
- 146: <code>assert.equal(fresh.buffers.length, buffers + 1, "new-context upgrade also reuses its prepared noise")</code>
- 147: <code>assert.equal(fresh.buffers[fresh.buffers.length - 1].duration, 2, "and the one new buffer is that loop window")</code>
- 148: <code>assert.ok(started.filter((n) =&gt; n.kind === "src" &amp;&amp; n.loop &amp;&amp; fresh.buffers.includes(n.buffer)).every((n) =&gt; !oldBuffers.has(n.buffer)))</code>

**Line 151: "hiding resumes a track from its position; an explicit stop starts it fresh"**

- 156: <code>assert.equal(musicSources().at(-1).startArgs[1], 0)</code>
- 159: <code>assert.equal(ctx.state, "suspended")</code>
- 161: <code>assert.equal(musicSources().at(-1).startArgs[1], 1.25, "hide carries the soundtrack resume position across teardown")</code>
- 162: <code>assert.equal(fetched.filter((url) =&gt; /music/.test(url)).length, 1, "show reuses the decoded buffer")</code>
- 164: <code>assert.equal(musicSources().at(-1).startArgs[1], 0, "a deliberate stop discards the resume position")</code>

**Line 167: "gesture recovery clears the soundtrack cache and restores the running track"**

- 178: <code>assert.equal(A.ctxGen(), generation + 1, "a later gesture rebuilds the stalled context")</code>
- 179: <code>assert.equal(A.currentTrackId(), "builtin:song3", "the soundtrack remembers its playlist position")</code>
- 180: <code>assert.equal(fetched.filter((url) =&gt; /song3/.test(url)).length, 2, "the replacement context decodes its own buffer")</code>

**Line 184: "an explicit dry stop while hidden cancels rain resume; ordinary hide preserves it"**

- 198: <code>assert.equal(rainStarts(), 1)</code>
- 203: <code>assert.equal(rainStarts(), dry ? 1 : 2, dry ? "explicit dry intent overrides the wet snapshot after teardown" : "ordinary tab return still resumes the wanted rain")</code>

**Line 210: "turning SOUND EFFECTS on mid-race starts the rain the race asked for"**

- 219: <code>assert.equal(started.filter((n) =&gt; n.kind === "src" &amp;&amp; n.loop).length - before, 1)</code>

**Line 222: "a track that cannot be decoded moves the playlist on instead of going silent"**

- 226: <code>assert.ok(fetched.some((u) =&gt; /song4/.test(u)), "the next track is fetched")</code>
- 227: <code>assert.ok(started.some((n) =&gt; n.kind === "src" &amp;&amp; !n.loop), "and it plays")</code>
- 228: <code>assert.notEqual(A.currentTrackId(), "builtin:song3")</code>

**Line 231: "a playlist where nothing decodes stops rather than spinning"**

- 237: <code>assert.equal(fetched.filter((u) =&gt; /music/.test(u)).length, n, "no further fetches once every track has failed")</code>

**Line 240: "a dead MY TRACKS list stops after one pass over ITS tracks, not the whole library"**

- 246: <code>assert.equal(A.addTracks([{ id: "user:a", name: "a", url: "blob:dead-a" }, { id: "user:b", name: "b", url: "blob:dead-b" }]), 2)</code>
- 247: <code>assert.equal(A.setMusicSource("user"), "user")</code>
- 250: <code>assert.equal(dead.length, 2, "each dead upload is tried once: " + dead.join(", "))</code>
- 251: <code>assert.equal(A.currentTrackId(), null, "and the music stops")</code>

**Line 254: "a race started in a HIDDEN tab never wakes the context the hide path suspended"**

- 260: <code>assert.equal(hid.resumes(), 0, "no resume() while document.hidden — onVisibility's show branch owns it")</code>
- 264: <code>assert.ok(vis.resumes() &gt; 0, "a visible page still resumes inside the gesture")</code>

**Line 267: "game.js wiring: keyboard unlocks audio, a hidden-tab start pauses, resume restores music + rain"**

- 270: <code>assert.match(g, /const GESTURE_EVTS = \["pointerdown", "pointerup", "touchend", "keydown", "click"\];/)</code>
- 271: <code>assert.match(g, /if \(gestured \|\| !isActivation\(e\)\) return;/)</code>
- 288: <code>assert.equal(isActivation(e), want, why)</code>
- 289: <code>assert.match(g, /for \(const t of GESTURE_EVTS\) document\.addEventListener\(t, onFirstGesture, true\);/)</code>
- 291: <code>assert.match(body, /if \(document\.hidden\) setPaused\(true, "hidden-tab"\);\n\}\s*$/, "the hidden check is the LAST thing, after the audio starts it stops")</code>
- 293: <code>assert.match(sp, /if \(p\) \{ GameAudio\.stopEngine\(\); GameAudio\.setSkid\(0\); GameAudio\.stopRain\(\); radioVoice\.halt\(\);/, "pause stops rain with the engine — rain rides the SFX bus and must not hiss over a frozen race")</code>
- 295: <code>assert.match(sp, /else if \(soundOn\) \{[^\n]*GameAudio\.startEngine\(\); GameAudio\.startMusic\(trackIdx\); if \(wxArc\.viewRainfall\(\) &gt; 0\.01\) GameAudio\.startRain\(\); \}/, "SOUND turned on under the pause card (js/audio/panel.js defers) gets music and rain back on RESUME")</code>
- 297: <code>assert.match(g, /go\.addEventListener\("animationend", qGoShakeEnd, \{ once: true \}\)/, "one named handler, not a closure per rejected press")</code>
- 298: <code>assert.match(g, /function tiltSay\(msg\) \{ els\.audiostate\.textContent = msg; if \(msg\) announce\(/, "tilt fallbacks reach the banner, not only the title line")</code>
- 300: <code>assert.match(g, /const comfort = camComfort\(\);/, "render() reads the comfort latch once per frame")</code>
- 301: <code>assert.match(g, /CamTune\.buzzAmp\(spV, player\.deploying, comfort, _buzzWet\)/, "REDUCE MOTION / XR comfort drops the onboard speed buzz via CamTune.buzzAmp")</code>
- 302: <code>assert.match(g, /_vantExtra\.reduceMotion = comfort;/, "…and the kerb shiver (js/camera/vantage.js)")</code>
- 303: <code>assert.match(g, /CamTune\.shakeOffset\(feel\.shake, comfort\)/, "collision shake also goes through CamTune (comfort bob)")</code>
- 304: <code>assert.match(g, /CamTune\.rollTarget\(roadCamRoll, camSlipSm/, "horizon lean goes through CamTune (comfort rollLean)")</code>

**Line 309: "ui blips: one per click, and MENU SOUNDS OFF silences them without touching SFX"**

- 317: <code>assert.equal(blipFires() - n, 1, "a second ui blip on the same click is dropped")</code>
- 320: <code>assert.equal(blipFires() - n, 1, "the next click still sounds")</code>
- 323: <code>assert.equal(blipFires() - n, 0, "MENU SOUNDS OFF")</code>
- 324: <code>assert.equal(A.uiEnabled(), false)</code>
- 326: <code>assert.ok(blipFires() - n &gt; 0, "race sfx are not menu sounds")</code>
- 327: <code>assert.ok(started.filter((n) =&gt; n.kind === "osc").length &lt;= 8, "pooled blip oscillators stay within the voice cap")</code>

**Line 352: "a refused stream retries on the next visible gesture even with an already-running context"**

- 362: <code>assert.equal(plays, 1)</code>
- 362: <code>assert.equal(h.contexts[0].state, "running")</code>
- 365: <code>assert.equal(plays, 1, "synthetic events do not consume the pending retry")</code>
- 367: <code>assert.equal(plays, 1, "late hidden gestures do not resume playback")</code>
- 369: <code>assert.equal(plays, 2)</code>
- 369: <code>assert.equal(el.src, UPLOAD.url, "retry keeps the selected media source")</code>
- 370: <code>assert.equal(el.currentTime, 17, "retry does not rewind the song")</code>
- 371: <code>assert.equal(h.A.currentTrackId(), UPLOAD.id)</code>
- 373: <code>assert.equal(plays, 2, "healthy playback is not restarted by later controls")</code>

**Line 376: "stopping or replacing a blocked stream cancels its gesture retry, including late rejection"**

- 389: <code>assert.equal(plays, 1, action + " revoked the old request")</code>

**Line 393: "late init and gestures keep an existing hidden context suspended and defer rebuilds"**

- 398: <code>assert.equal(h.contexts[0].state, "suspended")</code>
- 401: <code>assert.equal(h.resumes(), before, "hidden continuation never wakes the existing context")</code>
- 402: <code>assert.equal(h.contexts.length, 1, "hidden init is not a new unlock/rebuild attempt")</code>
- 404: <code>assert.ok(h.resumes() &gt; before, "show still owns context recovery")</code>

**Line 407: "an upload streams through the media element on desktop, never through decodeAudioData"**

- 412: <code>assert.equal(A.playTrackId(UPLOAD.id), true)</code>
- 414: <code>assert.equal(mediaEls.length, 1, "the upload plays through createMediaElementSource")</code>
- 415: <code>assert.equal(mediaEls[0].src, UPLOAD.url)</code>
- 416: <code>assert.ok(!fetched.includes(UPLOAD.url) &amp;&amp; !decoded.includes(UPLOAD.url), "and its bytes are never fetched for a full decode")</code>
- 417: <code>assert.equal(A.currentTrackId(), UPLOAD.id)</code>

**Line 420: "a streamed track keeps its position when a stalled AudioContext is rebuilt"**

- 427: <code>assert.equal(Audio.made.length, 1)</code>
- 435: <code>assert.equal(contexts.length, 2, "a later gesture replaces the stalled context")</code>
- 436: <code>assert.equal(Audio.made.length, 2, "the new context owns a new media element")</code>
- 437: <code>assert.equal(A.currentTrackId(), UPLOAD.id)</code>
- 438: <code>assert.equal(Audio.made[1].currentTime, 42, "recovery seeks to the stream's saved offset")</code>
- 441: <code>assert.equal(Audio.made[1].currentTime, 0, "an explicit stop still starts from the top")</code>

**Line 444: "the shipped tracks still decode on desktop next to a streamed upload"**

- 449: <code>assert.ok(decoded.some((u) =&gt; /song3/.test(u)), "the A/B default for builtins is unchanged on desktop")</code>

**Line 452: "without streaming, an upload longer than the cap is refused before it decodes"**

- 460: <code>assert.ok(fetched.includes(UPLOAD.url), "precondition: the decode path fetched it")</code>
- 461: <code>assert.ok(!decoded.includes(UPLOAD.url), "a 55-minute upload must not reach decodeAudioData")</code>
- 462: <code>assert.equal(A.currentTrackId(), null, "the only eligible track failed: the list stops instead of looping on it")</code>

**Line 465: "without streaming, a song-length upload still decodes and plays"**

- 470: <code>assert.ok(decoded.includes(UPLOAD.url), "four minutes is within the cap")</code>
- 471: <code>assert.equal(A.currentTrackId(), UPLOAD.id)</code>

**Line 474: "with no media element at all, the cap falls back to the file size"**

- 479: <code>assert.ok(!r.decoded.includes(UPLOAD.url), "a 20 MB upload is too long to decode by its size")</code>
- 483: <code>assert.ok(r.decoded.includes(UPLOAD.url), "a 2 MB upload decodes")</code>

**Line 492: "devicechange debounces to one context rebuild and restores the camera mix"**

- 498: <code>assert.equal(A.cameraMix().kind, "onboard")</code>
- 505: <code>assert.equal(contexts.length, 2, "one rebuild after a burst of devicechange events")</code>
- 506: <code>assert.equal(A.ctxGen(), gen0 + 1)</code>
- 507: <code>assert.equal(A.cameraMix().kind, "onboard", "camera mix re-applied on the new context")</code>
- 508: <code>assert.equal(A.tune().reverb, 0.42, "tune / cue trims re-applied on the new context")</code>

**Line 511: "devicechange without sticky user activation defers rebuild until the next gesture"**

- 524: <code>assert.equal(contexts.length, 1, "no rebuild without user activation")</code>
- 525: <code>assert.equal(A.ctxGen(), gen0)</code>
- 527: <code>assert.equal(contexts.length, 2, "gesture performs the deferred rebuild")</code>

**Line 530: "init does not throw when navigator.mediaDevices is absent"**

- 532: <code>assert.doesNotThrow(() =&gt; A.init())</code>

**Line 536: "the SOUND toggle restarts rain from the live weather, not the grid's raceWeather"**

- 540: <code>assert.match(block, /GameAudio\.startEngine\(\);/, "precondition: found the mid-race SOUND ON block")</code>
- 541: <code>assert.doesNotMatch(block, /raceWeather/, "the grid's weather does not describe a race the arc has turned")</code>
- 542: <code>assert.match(block, /if \(G\.viewRainfall\(\) &gt; 0\.01\) GameAudio\.startRain\(\);/)</code>
- 544: <code>assert.match(game, /\bviewRainfall: \(\) =&gt; wxArc \? wxArc\.viewRainfall\(\) : 0,/, "G.viewRainfall is exported to the panel")</code>

**Line 551: "a WATCH clip whose media element errors AND rejects play() falls back once: one fetch, one voice"**

- 566: <code>assert.ok(h, "precondition: the clip was accepted")</code>
- 568: <code>assert.equal(fetched.filter((u) =&gt; u === URL_).length, 1, "one fetch, not one per failure signal")</code>
- 569: <code>assert.equal(A.radioVoicesLive(), 1, "one voice on air, so stop() can reach it")</code>
- 572: <code>assert.equal(A.radioVoicesLive(), 0, "and stop() cuts that one voice")</code>

**Line 575: "music duck is held per source: a WATCH clip, the engineer and the replay fallback do not release each other"**

- 581: <code>assert.ok(music, "precondition: the music gain exists at its default level")</code>
- 586: <code>assert.ok(Math.abs(target - ducked) &lt; 1e-9, "a clip ducks the music")</code>
- 589: <code>assert.ok(Math.abs(target - ducked) &lt; 1e-9, "the first clip ending leaves the second's duck")</code>
- 592: <code>assert.ok(Math.abs(target - ducked) &lt; 1e-9, "the engineer's hold survives the second clip")</code>
- 594: <code>assert.ok(Math.abs(target - full) &lt; 1e-9, "the last holder lifts it")</code>

**Line 597: "a quick hide -> show does not rebuild a healthy context (late 'suspended' statechange)"**

- 604: <code>assert.equal(ctx.state, "suspended")</code>
- 608: <code>assert.equal(ctx.state, "running", "precondition: the context came back by itself")</code>
- 609: <code>assert.equal(contexts.length, 1, "no spurious rebuild (statechange " + (announce ? "announced" : "silent") + ")")</code>

**Line 613: "device-driven context rebuilds are capped (three per 30 s)"**

- 618: <code>assert.equal(contexts.length, 1 + 3, "three rebuilds in the window, then the cap holds")</code>

**Line 623: "a rate-capped device rebuild stays pending and a gesture after the window serves it"**

- 629: <code>assert.equal(contexts.length, 1 + 3, "precondition: the fourth swap hit the cap")</code>
- 631: <code>assert.equal(contexts.length, 1 + 3, "a gesture inside the window still respects the cap")</code>
- 634: <code>assert.equal(contexts.length, 1 + 4, "the capped swap is rebuilt for once the window has passed")</code>
- 636: <code>assert.equal(contexts.length, 1 + 4, "served once, then forgotten")</code>

**Line 639: "a rebuild forgets the old clock: revFlare and the limiter hold clock restart"**

- 645: <code>assert.equal(A.limiterHeld(), 0, "precondition: the top-gear cut began on the old clock")</code>
- 646: <code>assert.ok(A.carSfx().revFlare &gt; 0, "precondition: the downshift flare is live")</code>
- 648: <code>assert.equal(contexts.length, 2, "precondition: rebuilt")</code>
- 649: <code>assert.equal(A.limiterHeld(), null, "limSince is not a timestamp of the closed context")</code>
- 650: <code>assert.equal(A.carSfx().revFlare, 0)</code>

**Line 653: "a devicechange while hidden is remembered and served when the tab returns"**

- 658: <code>assert.equal(contexts.length, 1, "nothing rebuilds under a hidden tab")</code>
- 660: <code>assert.equal(contexts.length, 2, "the headset swap made while backgrounded is rebuilt for on return")</code>
- 666: <code>assert.equal(b.contexts.length, 1, "no activation: still deferred")</code>
- 668: <code>assert.equal(b.contexts.length, 2, "the next gesture performs it")</code>

**Line 671: "the sample upgrade lets the synth fade play out instead of cutting it"**

- 675: <code>assert.equal(A.debug().usingSamples, false, "precondition: synth first")</code>
- 680: <code>assert.equal(A.debug().usingSamples, true, "precondition: upgraded to the samples")</code>
- 681: <code>assert.equal(A.enginePlaybackGeneration(), owner, "synth-to-sample swap retains playback ownership")</code>
- 683: <code>assert.deepEqual(cut.map((n) =&gt; n.kind), [], "the fading synth chain is still connected right after the swap")</code>
- 685: <code>assert.ok([...before].some((n) =&gt; n.disc), "and its own timer buries the chain once the fade is done")</code>
- 686: <code>assert.equal(contexts.length, 1)</code>

**Line 704: "audition cleanup cancels hidden resume intent in either listener order"**

- 707: <code>assert.equal(mix.start(), true)</code>
- 712: <code>assert.equal(A.enginePlaybackGeneration(), engine, "internal suspend preserves engine owner")</code>
- 713: <code>assert.equal(A.musicPlaybackGeneration(), music, "internal suspend preserves music owner")</code>
- 717: <code>assert.equal(A.debug().engineOn, false, "returning cannot resurrect the cancelled sample")</code>
- 718: <code>assert.equal(A.currentTrackId(), null)</code>
- 719: <code>assert.equal(mix.audition.active(), false)</code>
- 719: <code>assert.equal(mix.timers.size, 0)</code>

**Line 723: "an uncancelled audition keeps its owner across hide/show and still stops"**

- 725: <code>assert.equal(mix.start(), true)</code>
- 729: <code>assert.equal(A.debug().engineOn, true)</code>
- 729: <code>assert.ok(A.currentTrackId())</code>
- 730: <code>assert.equal(A.enginePlaybackGeneration(), engine)</code>
- 730: <code>assert.equal(A.musicPlaybackGeneration(), music)</code>
- 731: <code>assert.equal(A.debug().engineOn, false)</code>
- 731: <code>assert.equal(A.currentTrackId(), null)</code>
- 732: <code>assert.equal(mix.timers.size, 0)</code>

**Line 735: "rebuilding an audition graph preserves its owner for Stop and deadline"**

- 738: <code>assert.equal(mix.start(), true)</code>
- 741: <code>assert.equal(h.contexts.length, 2)</code>
- 741: <code>assert.equal(A.debug().engineOn, true)</code>
- 742: <code>assert.equal(A.enginePlaybackGeneration(), engine)</code>
- 742: <code>assert.equal(A.musicPlaybackGeneration(), music)</code>
- 744: <code>assert.equal(A.debug().engineOn, false)</code>
- 744: <code>assert.equal(A.currentTrackId(), null)</code>
- 744: <code>assert.equal(mix.timers.size, 0)</code>

**Line 748: "later race and same-track manual playback survive audition cleanup after rebuild"**

- 750: <code>assert.equal(mix.start(), true)</code>
- 752: <code>assert.ok(track)</code>
- 755: <code>assert.equal(A.debug().engineOn, true, "explicit race start transfers ownership even on the existing graph")</code>
- 756: <code>assert.equal(A.currentTrackId(), track, "same-ID manual selection is a new owner")</code>
- 757: <code>assert.equal(mix.timers.size, 0)</code>

**Line 778: `STOP retries a stalled soundtrack and rejects its late response (AbortController ${abort})`**

- 781: <code>assert.equal(requests.length, 1)</code>
- 783: <code>assert.equal(requests[0].signal.aborted, true, "STOP aborts the actual fetch signal")</code>
- 785: <code>assert.equal(requests.length, 2, "START owns a new request instead of reusing the stalled one")</code>
- 787: <code>assert.deepEqual(decodes, [], "an uncooperative response cannot allocate stale PCM")</code>
- 789: <code>assert.deepEqual(decodes, ["replacement bytes"])</code>
- 790: <code>assert.equal(started.length, 1)</code>

**Line 794: "resetContext aborts a pending soundtrack and its late cleanup cannot erase a replacement"**

- 797: <code>assert.equal(requests[0].signal.aborted, true)</code>
- 800: <code>assert.deepEqual(decodes, [])</code>
- 802: <code>assert.equal(requests[1].signal.aborted, true, "the old settlement kept the new controller registered")</code>
- 805: <code>assert.deepEqual(decodes, ["current bytes"])</code>
- 806: <code>assert.equal(started.length, 1)</code>

**Line 810: "AudioContext constructor throw leaves GameAudio without a context (no overlay throw)"**

- 824: <code>assert.doesNotThrow(() =&gt; A.init())</code>
- 825: <code>assert.equal(A.context(), null)</code>
- 826: <code>assert.ok(warns.some((w) =&gt; /AudioContext unavailable/.test(w)), "warn names the refusal")</code>

### tests/unit/audio-sample-upgrade.test.mjs

9 test declarations; 49 static assertion sites.

**Line 82: "an engine started on the synth voice upgrades to the samples once they decode"**

- 86: <code>assert.equal(GameAudio.debug().usingSamples, false, "precondition: synth voice, samples not ready")</code>
- 88: <code>assert.equal(GameAudio.debug().usingSamples, false, "nothing to upgrade to yet")</code>
- 90: <code>assert.equal(GameAudio.debug().samplesReady, true, "precondition: the samples decoded mid-race")</code>
- 91: <code>assert.equal(GameAudio.debug().usingSamples, false, "the decision was made once, at startEngine")</code>
- 94: <code>assert.equal(GameAudio.debug().usingSamples, true, "the next setEngine must restart the engine on the samples")</code>
- 95: <code>assert.equal(GameAudio.debug().engineOn, true)</code>
- 96: <code>assert.ok(counts.src &gt; srcBefore, "two looping buffer sources were created for the sample voice")</code>
- 100: <code>assert.equal(counts.src, srcAfter, "one restart, not one per frame")</code>

**Line 103: "music PCM cache: a phone keeps only the playing track, desktop the two most recent"**

- 120: <code>assert.equal(await play(false), 2, "desktop: the two most recent stay decoded, so the repeat is a cache hit")</code>
- 121: <code>assert.equal(await play(true), 3, "phone: only the playing track is kept, so the repeat re-fetches (and re-decodes)")</code>

**Line 133: "song change on a phone drops the old decoded track BEFORE the next fetch (perf-memory M-4a)"**

- 150: <code>assert.equal(await run(true), 1, "phone: menu's PCM was already released when song2's fetch started")</code>
- 151: <code>assert.equal(await run(false), 0, "desktop keeps its two-track cache: menu is still a hit")</code>

**Line 166: "music stream switch: phones stream through one <audio> element, desktop decodes, apex26.musicStream overrides (M-4)"**

- 177: <code>assert.equal(phone.fetches, 0, "phone default: no fetch + decodeAudioData")</code>
- 178: <code>assert.equal(phone.els.length, 1, "one element reused across tracks (iOS keeps its gesture unlock)")</code>
- 179: <code>assert.equal(phone.media, 1, "one MediaElementSource per context")</code>
- 180: <code>assert.match(phone.els[0].src, /song2\.mp3$/)</code>
- 181: <code>assert.equal(phone.els[0].plays, 2)</code>
- 183: <code>assert.equal(desk.fetches, 2, "desktop default: the decode path, unchanged")</code>
- 184: <code>assert.equal(desk.els.length, 0)</code>
- 185: <code>assert.equal((await run(true, "0")).fetches, 2, "apex26.musicStream=0 puts a phone on the decode path")</code>
- 186: <code>assert.equal((await run(false, "1")).els.length, 1, "apex26.musicStream=1 streams on desktop")</code>

**Line 189: "streamed music keeps the soundtrack contract: resume offset, ended -> next, a failed load skips, stop releases"**

- 195: <code>assert.equal(GameAudio.currentTrackId(), "builtin:song2")</code>
- 199: <code>assert.equal(el.currentTime, 42, "the same url resumes where it was")</code>
- 201: <code>assert.equal(GameAudio.currentTrackId(), "builtin:song3", "track end hands over to the next song")</code>
- 203: <code>assert.equal(el.currentTime, 0, "a different song starts from the top")</code>
- 205: <code>assert.equal(GameAudio.currentTrackId(), "builtin:song4", "an unplayable track skips")</code>
- 207: <code>assert.equal(el.paused, true)</code>
- 208: <code>assert.ok(el.released &gt;= 1, "an explicit stop drops the src (decoder and buffered bytes)")</code>
- 209: <code>assert.equal(GameAudio.currentTrackId(), null, "and the soundtrack reports itself stopped")</code>

**Line 212: "master limiter: one compressor sits between master and the destination"**

- 215: <code>assert.equal(counts.comp, 1, "exactly one DynamicsCompressor is created at context build")</code>

**Line 218: "collision scales with impact and a shallow wall angle is a scrape, not a thump"**

- 223: <code>assert.equal(b.osc - a.osc, 1, "a graze is one tone + noise (no bang)")</code>
- 225: <code>assert.equal(c.osc - b.osc, 2, "a heavy hit adds the low bang")</code>
- 227: <code>assert.equal(d.osc - c.osc, 0, "a scrape is noise only")</code>
- 228: <code>assert.equal(d.src - c.src, 1, "one band-passed noise burst")</code>
- 229: <code>assert.equal(d.biquad - c.biquad, 1)</code>

**Line 232: "the rev-limiter gate is an audio-thread oscillator built with the engine"**

- 237: <code>assert.ok((counts.osc || 0) - before &gt;= 1, "startEngine builds the gate oscillator alongside the voice")</code>

**Line 244: "the engine sample keeps only its loop window: same samples, loop length and rival offsets (perf-memory M-5a)"**

- 269: <code>assert.ok(li.start &gt;= 1.5, `precondition: the stable window sits mid-buffer (start ${li.start})`)</code>
- 272: <code>assert.ok(engine.length &gt;= 2, "the idle voice and the rival voices play the window copy")</code>
- 274: <code>assert.equal(win.length, b - a, "only the loop window is kept")</code>
- 275: <code>assert.ok(win.length &lt; N / 2)</code>
- 276: <code>assert.deepEqual(Array.from(win.getChannelData(0).subarray(0, 64)), Array.from(full.subarray(a, a + 64)), "same samples, from the window start")</code>
- 277: <code>assert.equal(win.getChannelData(0)[win.length - 1], full[b - 1])</code>
- 279: <code>assert.equal(s.buffer, win, "one shared copy, no per-voice buffer")</code>
- 280: <code>assert.equal(s.loopStart, 0)</code>
- 281: <code>assert.ok(Math.abs((s.loopEnd - s.loopStart) - (li.end - li.start)) &lt; 1e-9, "loop length unchanged")</code>
- 284: <code>assert.equal(offs[0], 0, "the idle voice starts at the loop start, now 0")</code>
- 286: <code>assert.ok(Math.abs(o - (li.end - li.start) * (i / rivals.length)) &lt; 1e-9, `rival ${i} keeps its fraction of the loop: ${o}`)</code>
- 288: <code>assert.deepEqual([dbg.s, dbg.e], [0, +(li.end - li.start).toFixed(2)])</code>
- 289: <code>assert.deepEqual(Array.from(dbg.win), [+li.start.toFixed(2), +li.end.toFixed(2)], "debug still names where the window sat in the recording")</code>

### tests/unit/audio-tune.test.mjs

104 test declarations; 491 static assertion sites.

**Shared fixture/helper assertions**

- 146: <code>assert.equal(GameAudio.debug().usingSamples, true, "precondition: measuring the sample core, not the synth fallback")</code>
- 157: <code>assert.equal(GameAudio.debug().usingSamples, false, "precondition: measuring the synth fallback")</code>
- 1079: <code>assert.ok(music, "precondition: the music gain exists at its default level")</code>
- 2233: <code>assert.equal(source.split(dependency).length, 2, "replace exactly the harness dependency")</code>

**Line 172: "engine restarts reuse eight independent noise buffers through fresh source nodes"**

- 179: <code>assert.equal(A.debug().usingSamples, samples)</code>
- 181: <code>assert.equal(first.length, 8, "harvest, skid, scrub, surface, kerb, spray, wind and brake each have a loop")</code>
- 182: <code>assert.equal(new Set(first.map((n) =&gt; n.buffer)).size, 8, "equal durations must not share waveforms")</code>
- 183: <code>assert.deepEqual(first.map((n) =&gt; n.buffer.length), [0.7, 0.5, 0.5, 0.5, 0.45, 0.55, 0.5, 0.6].map((s) =&gt; Math.ceil(SR * s)))</code>
- 187: <code>assert.equal(buffers.length, before, "restart does not generate fresh PCM buffers")</code>
- 188: <code>assert.equal(second.length, 8)</code>
- 189: <code>assert.ok(second.every((n, i) =&gt; n.buffer === first[i].buffer), "each layer retains its own buffer")</code>
- 190: <code>assert.ok(second.every((n, i) =&gt; n !== first[i]), "single-use source nodes are recreated")</code>
- 191: <code>assert.ok(first.every((n) =&gt; n.stopAt != null), "the previous sources were stopped")</code>

**Line 195: "the radio noise pool is prepared before the first lights-out announcement"**

- 201: <code>assert.ok(pool, "the existing three-second one-shot pool is already prepared before green")</code>
- 203: <code>assert.equal(A.radioSting("radio", 1.9), true)</code>
- 205: <code>assert.equal(buffers.length, before, "lights-out radio and blips allocate no PCM buffers")</code>
- 206: <code>assert.ok([...live].some((n) =&gt; n.kind === "src" &amp;&amp; n.loop &amp;&amp; n.buffer === pool), "the radio bed uses the prepared pool")</code>

**Line 209: "delayed sample upgrade reuses noise and prepared loop metadata on the first race update"**

- 220: <code>assert.equal(A.debug().usingSamples, false, "held decoding preserves the synth fallback")</code>
- 223: <code>assert.equal(A.debug().samplesReady, true)</code>
- 224: <code>assert.equal(A.debug().usingSamples, false, "decode completion does not restart the audible graph")</code>
- 227: <code>assert.equal(A.debug().usingSamples, true, "the first race update still consumes the pending upgrade")</code>
- 228: <code>assert.equal(buffers.length, before.buffers, "upgrade does not generate noise again")</code>
- 229: <code>assert.equal(sampleReads, before.sampleReads, "upgrade does not scan the decoded sample again")</code>
- 230: <code>assert.ok(loops().every((n, i) =&gt; n.buffer === oldNoise[i]), "sample upgrade retains every layer buffer")</code>
- 231: <code>assert.ok(counts.src &gt; before.sources, "the sample graph has new source nodes")</code>
- 234: <code>assert.equal(counts.src, sources, "the upgrade occurs only once")</code>

**Line 256: "a fresh engine carries the shipped voice, and an identity trim reduces to the pre-tune formula"**

- 258: <code>assert.deepEqual(A.tune(), A.tuneDefaults(), "a fresh engine carries the shipped tune, whatever it is")</code>
- 259: <code>assert.equal(A.profile(), "team", "and follows the team's engine, as it always did")</code>
- 264: <code>assert.deepEqual(JSON.parse(JSON.stringify(A.tuneDefaults())), Object.assign({}, TUNE_IDENTITY, { pitch: 0.85, revRange: 1.3, detune: 0, sub: 0.25, limiter: 2.25, limRate: 0.8, limPitch: 0, whine: 0.62, boost: 1.12, }), "the shipped ENGINE voice")</code>
- 276: <code>assert.ok(Math.abs(A.rate() - want) &lt; 1e-4, `gear ${gear} rev ${rev} boost ${b}: ${A.rate()} != ${want.toFixed(4)}`)</code>

**Line 283: "pitch stays monotonic in rev under EVERY profile and at both ends of every slider"**

- 306: <code>assert.ok(isFinite(r) &amp;&amp; r &gt; 0, `${label} g${gear} rev ${rev}: rate ${r} is not a usable playbackRate`)</code>
- 307: <code>assert.ok(r &gt;= prev - 1e-9, `${label} g${gear}: pitch fell from ${prev} to ${r} as revs rose`)</code>
- 318: <code>assert.ok(Math.abs(A.rate() - g4) &lt; 1e-9, `${label}: rev ${rev} reads ${A.rate()} in gear ${gear} but ${g4} in 4th`)</code>

**Line 324: "a garbage stored value cannot reach playbackRate"**

- 328: <code>assert.deepEqual(A.tune(), before, "non-finite and non-numeric input is ignored, not stored")</code>
- 329: <code>assert.equal(A.tune().nope, undefined, "a field outside the table is not adopted")</code>
- 333: <code>assert.equal(A.tune().pitch, r.pitch[1], "above the range clamps to the maximum")</code>
- 334: <code>assert.equal(A.tune().revRange, r.revRange[0], "below the range clamps to the minimum")</code>
- 336: <code>assert.ok(isFinite(A.rate()) &amp;&amp; A.rate() &gt; 0, "and the resulting pitch is still usable")</code>

**Line 339: "picking a profile REPLACES the trim rather than merging into the last one"**

- 345: <code>assert.deepEqual(A.tune(), v10, "the same profile must give the same tune whatever preceded it")</code>
- 347: <code>assert.deepEqual(A.tune(), A.tuneDefaults(), "team restores identity")</code>
- 349: <code>assert.equal(A.profile(), "team", "an unknown name falls back to team rather than leaving a stale tune")</code>

**Line 352: "a hand-edited trim stops the engine calling itself by the profile's name"**

- 359: <code>assert.equal(A.profile(), "cockpit")</code>
- 361: <code>assert.equal(A.profile(), "custom", "the tune is no longer cockpit's, so the name must not claim it is")</code>
- 362: <code>assert.ok(!A.profiles().includes("custom"), "and custom is a state, not a preset the panel can offer")</code>
- 368: <code>assert.equal(A.profile(), "cockpit", "re-applying the profile's own values leaves it on the profile")</code>
- 373: <code>assert.equal(A.profile(), "team", "a tune that matches team's is team's")</code>

**Line 376: "a muted layer goes silent and then costs nothing per frame"**

- 382: <code>assert.ok(A.windLevel() &gt; 0, "precondition: the wind layer is audible on this frame")</code>
- 385: <code>assert.equal(A.windLevel(), 0, "switching the layer off silences it")</code>
- 388: <code>assert.equal(A.windLevel(), 0, "and it stays silent")</code>
- 391: <code>assert.ok(A.windLevel() &gt; 0, "switching it back on restores it")</code>

**Line 394: "moving muted layers retain fade-tail pitch, then stop scheduling and re-aim before gain on re-enable"**

- 404: <code>assert.equal(gains.length, samples ? 6 : 5, "the sample sub-layer is absent on the synth core")</code>
- 408: <code>assert.ok(source, "each layer retains its connected source/filter")</code>
- 413: <code>assert.ok(rows.filter((r, i) =&gt; r.pitch.sets &gt; beforeTail[i]).length &gt;= rows.length - 1, "moving inputs still retune the audible fade tails")</code>
- 417: <code>assert.deepEqual(rows.map((r) =&gt; r.pitch.sets), settled, "120 moving muted frames add no pitch/cutoff events")</code>
- 418: <code>assert.ok(rows.every((r) =&gt; r.gain.gain.value === 0), "zero gain targets remain unchanged")</code>
- 427: <code>assert.equal(r.gain._apexMuteUntil, undefined, "live update clears the old deadline")</code>
- 429: <code>assert.ok(pitch &lt; gain, "current pitch precedes the gain fade-in")</code>
- 435: <code>assert.ok(rows.some((r, i) =&gt; r.pitch.sets &gt; rapid[i]), "rapid re-mute gets a fresh tail window")</code>
- 438: <code>assert.equal(fresh.length, samples ? 6 : 5)</code>
- 439: <code>assert.ok(fresh.every((n) =&gt; !gains.includes(n)), "restart creates fresh graph-owned deadlines")</code>

**Line 443: "the rev-limiter chop is switchable and its depth is a knob"**

- 449: <code>assert.ok(on &gt; 0, "precondition: the ignition cut is active above 98.5%")</code>
- 452: <code>assert.ok(A.limiterDepth() &gt; on, "a higher depth chops harder")</code>
- 456: <code>assert.equal(A.limiterDepth(), 0, "switched off, the chop is gone entirely")</code>
- 459: <code>assert.ok(A.limiterDepth() &gt; 0, "and comes back")</code>

**Line 462: "in top gear the rev-limiter chop is a burst, not a wall"**

- 472: <code>assert.ok(full &gt; 0, "the cut still opens in top gear")</code>
- 473: <code>assert.equal(A.limiterHeld(), 0, "the hold clock starts when the top-gear cut begins")</code>
- 475: <code>assert.ok(A.limiterDepth() &gt;= full * 0.99, "first half second: full depth — you hear that you are at the limit")</code>
- 478: <code>assert.ok(mid &gt; 0 &amp;&amp; mid &lt; full * 0.8, `then it fades (${mid} of ${full})`)</code>
- 480: <code>assert.equal(A.limiterDepth(), 0, "a second in, the note holds steady at the limiter with no chop")</code>
- 481: <code>assert.equal(A.limiterCents(), 0, "and the pitch sag fades with it")</code>
- 483: <code>assert.equal(A.limiterHeld(), null, "dipping under the gate re-arms it")</code>
- 485: <code>assert.ok(A.limiterDepth() &gt; 0, "the next straight gets its burst again")</code>
- 489: <code>assert.ok(A.limiterDepth() &gt;= full * 0.99, "below top gear the chop holds full depth indefinitely")</code>
- 490: <code>assert.equal(A.limiterHeld(), null)</code>

**Line 493: "every id the ENGINE TONE panel looks up exists in the shell"**

- 512: <code>assert.match(panel, /\["custom", "CUSTOM", true\]/, "CUSTOM is listed but unpickable")</code>
- 513: <code>assert.equal(sliders.length, 22, "expected the twenty-two tuner sliders — the table shape changed, so does this check")</code>
- 514: <code>assert.equal(layers.length, 12, "expected the twelve layer switches")</code>
- 515: <code>assert.equal(profiles.length, 5, "expected the five sound profiles")</code>
- 521: <code>assert.deepEqual(missing, [], "js/audio/panel.js looks up an id that index.html does not declare")</code>

**Line 524: "every sound profile and layer the panel offers is one the engine knows"**

- 536: <code>assert.deepEqual(offered.filter((p) =&gt; !A.profiles().includes(p)), [], "the panel offers a profile SOUND_PROFILES does not define")</code>
- 538: <code>assert.deepEqual([...A.profiles()].filter((p) =&gt; !offered.includes(p)), [], "the engine defines a profile the panel gives no way to pick")</code>
- 542: <code>assert.deepEqual(layerKeys.filter((k) =&gt; !known.includes(k)), [], "the panel switches a layer the engine does not have")</code>
- 543: <code>assert.deepEqual(known.filter((k) =&gt; !layerKeys.includes(k)), [], "the engine has a layer the panel cannot switch")</code>
- 546: <code>assert.deepEqual(tuneKeys.filter((k) =&gt; !knownTune.includes(k)), [], "the panel drives a trim the engine does not have")</code>

**Line 553: "DETUNE lands on the sample core's own detune param"**

- 562: <code>assert.ok(Math.abs(A.detuneCents() - (neutral + 60)) &lt; 1e-6, `detune 3 should sit 60 cents above neutral, got ${A.detuneCents()} vs ${neutral}`)</code>
- 568: <code>assert.ok(Math.abs(A.detuneCents() - neutral) &lt; 1e-6, `detune 0 must not transpose the sample core, got ${A.detuneCents()} vs ${neutral}`)</code>
- 571: <code>assert.ok(Math.abs(A.detuneCents() - neutral) &lt; 1e-6, "anywhere in 0..1 is no offset on the sample core")</code>
- 574: <code>assert.ok(Math.abs(Math.pow(2, (A.detuneCents() - neutral) / 1200) - 1) &lt; 0.05, "detune must stay a fine trim, not a second pitch control")</code>

**Line 578: "SUB is audible on the shipped core, not just the oscillator fallback"**

- 588: <code>assert.ok(base &gt; 0, "the sub layer must be audible on the core that actually ships")</code>
- 591: <code>assert.ok(A.subLevel() &gt; base * 2, "the SUB trim must scale it")</code>
- 594: <code>assert.equal(A.subLevel(), 0, "and zero must be silent, not merely quiet")</code>
- 599: <code>assert.equal(A.subLevel(), 0, "switching the layer off silences it whatever the trim says")</code>
- 602: <code>assert.ok(A.subLevel() &gt; 0, "and back on restores it")</code>
- 613: <code>assert.ok(hiF &gt; lowF, `sub should rise with the engine: ${lowF} -&gt; ${hiF}`)</code>
- 615: <code>assert.ok(drift &lt; 0.02, `sub must stay an octave under the fundamental at both ends, not pin against a clamp ` + `(${lowF.toFixed(1)}Hz @ rate ${lowR} vs ${hiF.toFixed(1)}Hz @ rate ${hiR})`)</code>

**Line 620: "the circuit's acoustics come from the definition it already carries"**

- 627: <code>assert.equal(A.setVenue({ street: true, theme: "street_day" }), "street")</code>
- 629: <code>assert.equal(A.setVenue({ theme: "green" }), "green")</code>
- 631: <code>assert.equal(A.setVenue({ theme: "desert" }), "desert")</code>
- 632: <code>assert.equal(A.setVenue({ theme: "modern" }), "modern")</code>
- 633: <code>assert.equal(A.setVenue(null), "modern", "an unknown or missing definition must not throw")</code>
- 634: <code>assert.equal(A.setVenue({}), "modern")</code>
- 637: <code>assert.ok(street.decay &gt; green.decay, `a street circuit should ring longer than a park one (${street.decay}s vs ${green.decay}s)`)</code>
- 639: <code>assert.ok(street.level &gt; green.level, `and louder (${street.level} vs ${green.level})`)</code>

**Line 643: "SPACE and its switch both reach the live reverb return"**

- 648: <code>assert.ok(base &gt; 0, "a street circuit must actually be wet")</code>
- 650: <code>assert.ok(A.venue().level &gt; base * 2, "the SPACE trim must scale it")</code>
- 652: <code>assert.equal(A.venue().level, 0, "and zero must be dry, not merely quieter")</code>
- 655: <code>assert.equal(A.venue().level, 0, "the switch is the hard off whatever the trim says")</code>
- 657: <code>assert.ok(A.venue().level &gt; 0, "and back on restores it")</code>

**Line 660: "overrun crackles on a trailing throttle, and not while coasting or braking"**

- 686: <code>assert.ok(lifting &gt;= 6 &amp;&amp; lifting &lt;= 45, `two seconds of lifting should crackle a handful of times, got ${lifting} — ` + "too few is inaudible, too many is a machine gun rather than an exhaust")</code>
- 690: <code>assert.equal(coasting, 0, "a steady throttle must be silent — that is the state it was confused with")</code>
- 692: <code>assert.equal(pulling, 0, "accelerating must not crackle")</code>
- 696: <code>assert.equal(braking, 0, "hard braking has its own sound; stacking crackle on it is just noise")</code>
- 697: <code>assert.equal(burstsOver(40, { ax: -21.7 }), 0, "a feed with no pedal reads -21.7 m/s² as braking too")</code>
- 698: <code>assert.equal(burstsOver(40, { ax: -8, brake: 0.5 }), 0, "a part pedal is braking, not a lift")</code>
- 699: <code>assert.ok(burstsOver(40, { ax: -6, brake: 0 }) &gt; 0, "a lift's drag decel with the pedal up still crackles")</code>
- 702: <code>assert.equal(burstsOver(40, { ax: -4 }), 0, "switched off is silent")</code>
- 704: <code>assert.ok(burstsOver(40, { ax: -4 }) &gt; 0, "and back on crackles again")</code>

**Line 707: "every slider spans its trim's FULL range and can land exactly on 1.0"**

- 720: <code>assert.equal(rows.length, 22, "expected twenty-two tuner sliders")</code>
- 724: <code>assert.ok(m, `${id} is missing from the shell, or its attributes changed shape`)</code>
- 727: <code>assert.ok(Math.abs(lo - rLo) &lt; 1e-9, `${key}: the panel starts at ${lo}, the engine's range at ${rLo}`)</code>
- 728: <code>assert.ok(Math.abs(lo + max * step - rHi) &lt; 1e-9, `${key}: the slider tops out at ${lo + max * step}, the engine allows ${rHi} — the player cannot reach the end`)</code>
- 730: <code>assert.ok(Math.abs(lo + dflt * step - 1) &lt; 1e-9, `${key}: the default position is ${lo + dflt * step}, not 1.0 — the panel cannot return to the shipped sound`)</code>

**Line 735: "BRIGHTNESS keeps moving the corner across its whole range, and stops below Nyquist"**

- 743: <code>assert.ok(cut &gt; last, `BRIGHTNESS ${b} did not open the filter further (${last} -&gt; ${cut})`)</code>
- 744: <code>assert.ok(cut &lt; NY, `corner ${cut} Hz is at or past Nyquist, where the node pins it silently`)</code>

**Line 749: "the LIMITER is three knobs: depth that never inverts the gate, a rate, and a pitch sag"**

- 760: <code>assert.ok(depth &lt;= lvl * 0.5 + 1e-9, `DEPTH ${k}: depth ${depth} exceeds half of level ${lvl} — the gate inverts`)</code>
- 762: <code>assert.ok(Math.abs(A.limiterHz() - 13) &lt; 0.01, "DEPTH must not move the chop rate — that is RATE's knob now")</code>
- 769: <code>assert.ok(hz &gt; lastHz, `RATE ${k}: the chop rate stopped rising (${lastHz} -&gt; ${hz})`)</code>
- 773: <code>assert.ok(Math.abs(A.limiterHz() - 13) &lt; 0.01, "1.0 is still the stock 13 Hz cut")</code>
- 777: <code>assert.ok(sag &gt; 0, "the stock tune sags on each cut")</code>
- 780: <code>assert.ok(Math.abs(A.limiterCents() - sag * 3) &lt; 1e-6, "PITCH SAG is a multiplier on the cents")</code>
- 783: <code>assert.equal(A.limiterCents(), 0, "zero is a steady note under the cut")</code>
- 786: <code>assert.equal(A.limiterCents(), 0, "and below the limiter the note never sags")</code>
- 789: <code>assert.equal(A.limiterCents(), 0, "the switch is the hard off for the sag too")</code>

**Line 792: "BOOST is the ERS layers' level and the rev lift under deploy"**

- 801: <code>assert.ok(lift &gt; 1.03 &amp;&amp; lift &lt; 1.05, `the stock deploy lift is 4%, got ${lift}`)</code>
- 803: <code>assert.ok(whine &gt; 0, "the stock tune whines while deploying")</code>
- 806: <code>assert.ok(Math.abs((A.rate() / flat - 1) - 0.04 * 3) &lt; 1e-6, "REV LIFT is a multiplier on the 4%")</code>
- 809: <code>assert.ok(Math.abs(A.rate() - flat) &lt; 1e-9, "zero lift leaves the note where coasting has it")</code>
- 812: <code>assert.ok(A.ersLevel() &gt; whine * 2, "LEVEL scales the deploy whine")</code>
- 815: <code>assert.equal(A.ersLevel(), 0, "zero is a silent hybrid")</code>
- 820: <code>assert.ok(stock &gt; 0 &amp;&amp; A.boostState().fired === 1, "a deploy fires one whoosh at the stock level")</code>
- 823: <code>assert.ok(Math.abs(A.boostState().peak - stock * 2) &lt; 1e-9, "the trim scales the whoosh")</code>

**Line 826: "the layers that only had a switch now have a level"**

- 849: <code>assert.ok(base &gt; 0, `${k}: precondition — the layer is audible on this frame`)</code>
- 852: <code>assert.ok(read() &gt; base * 2, `${k}: the trim must scale it (${base} -&gt; ${read()})`)</code>
- 855: <code>assert.equal(read(), 0, `${k}: zero must be silent`)</code>

**Line 860: "rival voices are four distinct cars, not one car four times"**

- 866: <code>assert.equal(new Set(rates).size, 4, `four voices share a pitch: ${rates.join(", ")}`)</code>
- 868: <code>assert.ok(spread &gt; 1.001 &amp;&amp; spread &lt; 1.05, `spread ${spread} is not a few cents`)</code>

**Line 871: "a rival close alongside is heard, and one far up the road fades instead of popping"**

- 878: <code>assert.ok(near.gain &gt; 0.2, `a car three metres away is at ${near.gain}, which is a rumour`)</code>
- 879: <code>assert.ok(far.gain &gt; 0 &amp;&amp; far.gain &lt; near.gain, "a hundred metres up the road is quiet but present")</code>
- 880: <code>assert.equal(gone.gain, 0, "past the audible radius it is gone")</code>
- 881: <code>assert.ok(near.pan &gt; 0.6, "a car alongside on your right is on your right")</code>
- 882: <code>assert.ok(near.cut &gt; far.cut, "and the far one has lost its top end to the air")</code>

**Line 885: "Doppler is bounded however hard two cars close on each other"**

- 892: <code>assert.ok(rate(40) &gt; still, "a car closing rises in pitch")</code>
- 893: <code>assert.ok(rate(-40) &lt; still, "one dropping away falls")</code>
- 896: <code>assert.ok(Number.isFinite(r) &amp;&amp; r &gt; 0.05 &amp;&amp; r &lt; 2, `approach ${v} produced playbackRate ${r}`)</code>

**Line 900: "the field is audible on the oscillator fallback too, and not louder than you"**

- 907: <code>assert.ok(near.gain &gt; 0, "a car three metres away is silent on the fallback")</code>
- 908: <code>assert.equal(near.rate, 0, "the synth voice has no playbackRate to report")</code>
- 909: <code>assert.ok(near.hz &gt; 100, `the synth voice is not pitched: ${near.hz} Hz`)</code>
- 910: <code>assert.ok(one(3, 0.2).hz &lt; near.hz, "and it does not rise with their revs")</code>
- 917: <code>assert.ok(near.gain &lt; mine, `a rival at ${near.gain} is over your own engine at ${mine}`)</code>
- 920: <code>assert.equal(gone.gain, 0, "and it still goes away past the audible radius")</code>

**Line 923: "four fallback voices are four cars as well"**

- 927: <code>assert.equal(new Set(hz).size, 4, `four fallback voices share a pitch: ${hz.join(", ")}`)</code>

**Line 930: "net-owned rival rev steps (~10 Hz) keep maxRivalHzJump under 25 Hz"**

- 934: <code>assert.equal(A.debug().usingSamples, false)</code>
- 951: <code>assert.ok(maxJump &lt; 25, `net rival pitch must not zipper (max frame jump ${maxJump.toFixed(1)} Hz)`)</code>

**Line 954: "solo AI rival rev step reaches 90% within 200 ms"**

- 974: <code>assert.ok(reached &gt;= 0 &amp;&amp; reached &lt;= 200, `solo rival must hit 90% within 200 ms (got ${reached} ms)`)</code>

**Line 977: "rival voice slot reassignment snaps pitch to the new car"**

- 987: <code>assert.ok(A.rivalState()[0].hz &gt; lowHz + 300, "reassigned slot must snap, not glide")</code>

**Line 990: "a voice stays with its car when two rivals swap places"**

- 1003: <code>assert.ok(before[0].pan &lt; 0 &amp;&amp; after[0].pan &lt; 0, "voice 0 is still the car on your left")</code>
- 1004: <code>assert.ok(before[1].pan &gt; 0 &amp;&amp; after[1].pan &gt; 0, "voice 1 is still the car on your right")</code>
- 1005: <code>assert.equal(after[0].rate, before[0].rate, "and neither note moved: same car, same rev, same detune")</code>
- 1006: <code>assert.equal(after[1].rate, before[1].rate)</code>
- 1007: <code>assert.equal(after[2].gain, 0, "the unbound voices stay silent")</code>

**Line 1010: "the same rpm is the same note in every gear, and upshift drops shrink up the box"**

- 1024: <code>assert.ok(Math.abs(drops[i]) &lt; Math.abs(drops[i - 1]), `upshift drops must shrink: ${drops.map(Math.round).join(" ")}`)</code>
- 1028: <code>assert.ok(Math.abs(rate(1, 8) - 0.7097) &lt; 0.001, `top-gear limiter moved to ${rate(1, 8)}`)</code>
- 1030: <code>assert.ok(rate(0, g) &gt; 0.1275 &amp;&amp; rate(0, g) &lt; 0.2125, `idle in gear ${g} is ${rate(0, g)}`)</code>

**Line 1033: "the shipped detune 0 leaves the sample core at the voice's own cents"**

- 1035: <code>assert.equal(A.tune().detune, 0, "precondition: the shipped voice has detune off")</code>
- 1036: <code>assert.equal(A.detuneCents(), 0, "the default voice is 0 cents, not 30 flat")</code>

**Line 1039: "mute, the SFX bus and the music level glide instead of stepping"**

- 1052: <code>assert.equal(p.lastMethod, "target", `${what}: a setTargetAtTime, not a direct write`)</code>
- 1053: <code>assert.ok(p.cancels &gt; 0, `${what}: the in-flight glide is cancelled first`)</code>
- 1054: <code>assert.ok(Math.abs(p.value - v) &lt; 1e-9, `${what}: aimed at ${v}, got ${p.value}`)</code>
- 1062: <code>assert.ok(music, "precondition: the music gain exists at its default level")</code>

**Line 1082: "the music slider keeps a radio line's duck (engine stopped: title / pause sheet)"**

- 1085: <code>assert.ok(Math.abs(r.music.gain.value - 0.5 * 0.52 * 0.35) &lt; 1e-9, "precondition: the line ducks the music")</code>
- 1087: <code>assert.ok(Math.abs(r.music.gain.value - 0.4 * 0.52 * 0.35) &lt; 1e-9, `slider mid-line stays ducked, got ${r.music.gain.value}`)</code>
- 1089: <code>assert.ok(Math.abs(r.music.gain.value - 0.4 * 0.52) &lt; 1e-9, "the line's end lifts it to the new level")</code>

**Line 1091: "SFX OFF mid-line releases the engine's duck but keeps the radio's"**

- 1094: <code>assert.ok(r.music.gain.value &lt; 0.5 * 0.52 * 0.35, "precondition: engine + radio duck stacked")</code>
- 1096: <code>assert.ok(Math.abs(r.music.gain.value - 0.5 * 0.52 * 0.35) &lt; 1e-9, `SFX off mid-line stays under the voice, got ${r.music.gain.value}`)</code>
- 1098: <code>assert.ok(Math.abs(r.music.gain.value - 0.5 * 0.52) &lt; 1e-9, "and comes up when the line ends")</code>

**Line 1100: "a music gain created while a line is on air starts ducked"**

- 1107: <code>assert.ok(g, "precondition: startMusic built the music gain")</code>
- 1108: <code>assert.ok(Math.abs(g.gain.value - 0.5 * 0.52 * 0.35) &lt; 1e-9, `born at the ducked level, got ${g.gain.value}`)</code>

**Line 1119: "a spotter clip ducks the music while it is on air"**

- 1123: <code>assert.ok(Math.abs(r.music.gain.value - full) &lt; 1e-9, "precondition: music at the default level")</code>
- 1125: <code>assert.ok(h, "precondition: spotter clip scheduled")</code>
- 1126: <code>assert.ok(Math.abs(r.music.gain.value - ducked) &lt; 1e-9, `mid-spotter music stays ducked, got ${r.music.gain.value}`)</code>
- 1129: <code>assert.ok(Math.abs(r.music.gain.value - full) &lt; 1e-9, `spotter end releases the duck, got ${r.music.gain.value}`)</code>

**Line 1131: "an engineer duck survives a nested spotter clip ending"**

- 1137: <code>assert.ok(h)</code>
- 1138: <code>assert.ok(Math.abs(r.music.gain.value - ducked) &lt; 1e-9, "both holds keep the music down")</code>
- 1141: <code>assert.ok(Math.abs(r.music.gain.value - ducked) &lt; 1e-9, `spotter end must not lift an engineer duck, got ${r.music.gain.value}`)</code>
- 1143: <code>assert.ok(Math.abs(r.music.gain.value - full) &lt; 1e-9, "engineer end finally releases")</code>

**Line 1145: "a spotter duck survives an engineer setRadioDuck(false) while the clip is still live"**

- 1150: <code>assert.ok(h)</code>
- 1153: <code>assert.ok(Math.abs(r.music.gain.value - ducked) &lt; 1e-9, `engineer false must not cut the spotter duck short, got ${r.music.gain.value}`)</code>
- 1156: <code>assert.ok(Math.abs(r.music.gain.value - full) &lt; 1e-9, "spotter end releases once both holds are clear")</code>

**Line 1158: "an engineer radioVoice clip does not own the duck (radio-voice.js does)"**

- 1162: <code>assert.ok(h)</code>
- 1163: <code>assert.ok(Math.abs(r.music.gain.value - full) &lt; 1e-9, `radio fx must not double-duck from radioVoice, got ${r.music.gain.value}`)</code>

**Line 1168: "playWatchMedia ducks music and routes media elements through the radio band"**

- 1188: <code>assert.ok(musicGain, "precondition: music gain")</code>
- 1192: <code>assert.ok(h &amp;&amp; h.chained, "media element path chains into WebAudio")</code>
- 1193: <code>assert.ok(Math.abs(musicGain.gain.value - full * 0.35) &lt; 1e-9, "music ducks for the clip")</code>
- 1194: <code>assert.ok((b.counts.mediaSrc || 0) &gt;= 1, "createMediaElementSource ran")</code>
- 1195: <code>assert.ok((b.counts.biquad || 0) &gt;= 2, "radio band filters are in the graph")</code>
- 1197: <code>assert.ok(Math.abs(musicGain.gain.value - full) &lt; 1e-9, "stop releases the duck")</code>

**Line 1200: "the skid layer glides its gain and filter, and still lands an exact 0"**

- 1210: <code>assert.ok(gain, "precondition: the skid gain is found")</code>
- 1211: <code>assert.equal(gain.gain.lastMethod, "target", "the slide level is a glide, not a stepped .value")</code>
- 1213: <code>assert.ok(filt, "the screech filter centre is a glide too")</code>
- 1215: <code>assert.equal(A.skidLevel(), 0, "releasing the slide still aims at an exact 0")</code>
- 1216: <code>assert.equal(gain.gain.lastMethod, "target")</code>

**Line 1219: "pausing and resuming does not strand nodes that keep rendering"**

- 1230: <code>assert.equal(GameAudio.debug().usingSamples, true, "precondition: the shipped core")</code>
- 1240: <code>assert.deepEqual(new Set(marks).size, 1, `the live node count must not grow across pause/resume: ${marks.join(" -&gt; ")}`)</code>

**Line 1244: "the same holds on the oscillator fallback, which builds a bigger graph"**

- 1248: <code>assert.equal(GameAudio.debug().usingSamples, false, "precondition: the fallback")</code>
- 1257: <code>assert.deepEqual(new Set(marks).size, 1, `fallback live node count grew across pause/resume: ${marks.join(" -&gt; ")}`)</code>

**Line 1261: "resume does not keep the fading graph rendering under the new one"**

- 1273: <code>assert.equal(liveNodes(), one, "resume stacked the fading graph under the new one")</code>
- 1275: <code>assert.equal(liveNodes(), one, "the deferred disconnect must not drop the live graph")</code>

**Line 1278: "a phone gets a cheaper graph: no convolver, half the rival voices"**

- 1288: <code>assert.equal(A.debug().usingSamples, true, "precondition: the sample core")</code>
- 1289: <code>assert.equal(counts.convolver || 0, 0, "a phone built a ConvolverNode")</code>
- 1290: <code>assert.equal(A.rivalState().length, 2, "a phone built more than two rival voices")</code>
- 1291: <code>assert.equal(A.venue().level, 0, "venue() must report OFF rather than lie about a reverb that is not there")</code>
- 1295: <code>assert.equal(D.rivalState().length, 4, "desktop lost a rival voice")</code>
- 1296: <code>assert.ok(D.venue().level &gt;= 0, "desktop still has a venue send")</code>

**Line 1299: "GRAPHICS HIGH on a phone still gets the cheap audio graph"**

- 1305: <code>assert.equal(counts.convolver || 0, 0, "gfx-high phone built a ConvolverNode")</code>
- 1306: <code>assert.equal(A.rivalState().length, 2, "gfx-high phone built desktop rival voices")</code>

**Line 1309: "two rival voices still give a LEFT and a RIGHT"**

- 1319: <code>assert.ok(l.pan &lt; -0.3, `left-hand car panned ${l.pan}`)</code>
- 1320: <code>assert.ok(r.pan &gt; 0.3, `right-hand car panned ${r.pan}`)</code>
- 1321: <code>assert.ok(l.gain &gt; 0 &amp;&amp; r.gain &gt; 0, "both alongside cars must be audible")</code>

**Line 1324: "on two voices a car bound to slot 3 takes the free voice, not silence"**

- 1336: <code>assert.ok(v1.gain &gt; 0 &amp;&amp; v1.pan &gt; 0.3, `B keeps its bound voice 1 (gain ${v1.gain}, pan ${v1.pan})`)</code>
- 1337: <code>assert.ok(v0.gain &gt; 0, "C must be audible on the free voice 0, not muted")</code>
- 1338: <code>assert.ok(v0.pan &lt; -0.3, `C on voice 0 is still on your left (pan ${v0.pan})`)</code>

**Line 1341: "IDLE and REV RANGE reach a low idle AND a high redline at once"**

- 1356: <code>assert.ok(at(0) &lt;= stockIdle * 0.5 + 1e-9, `idle ${at(0)} is not an octave under stock ${stockIdle}`)</code>
- 1357: <code>assert.ok(at(1) &gt;= stockTop * 2, `redline ${at(1)} is not an octave over stock ${stockTop}`)</code>
- 1362: <code>assert.ok(Math.abs((at(1) - at(0)) - span) &lt; 1e-9, "IDLE changed the span, which is REV RANGE's job")</code>
- 1365: <code>assert.ok(Math.abs(at(0) - stockIdle) &lt; 1e-9, "REV RANGE moved the idle end, which is IDLE's job")</code>
- 1369: <code>assert.ok(Math.abs(at(0) / stockIdle - 1.5) &lt; 1e-9 &amp;&amp; Math.abs(at(1) / stockTop - 1.5) &lt; 1e-9, "PITCH must scale idle and redline alike")</code>
- 1377: <code>assert.ok(lo &gt; 0.05 &amp;&amp; hi &lt; 5, `corner rates ${lo}..${hi} left the range a BufferSource plays cleanly`)</code>
- 1378: <code>assert.ok(hi / lo &gt; 30, `the tuner's reach is ${(hi / lo).toFixed(1)}:1 — the redesign promised an order beyond stock`)</code>

**Line 1381: "CURVE bends the path between idle and redline without moving either end"**

- 1388: <code>assert.ok(Math.abs(at(0) - idle) &lt; 1e-9 &amp;&amp; Math.abs(at(1) - top) &lt; 1e-9, `CURVE ${c} moved an end`)</code>
- 1390: <code>assert.ok(mid &lt; midLinear, `CURVE ${c} &gt; 1 should hang low through the mid-range (${mid} vs ${midLinear})`)</code>
- 1391: <code>assert.ok(mid &gt; midLinear, `CURVE ${c} &lt; 1 should rise early (${mid} vs ${midLinear})`)</code>

**Line 1395: "GRAVEL is roughness at idle that is gone by redline, and never inverts the engine"**

- 1401: <code>assert.ok(idle &gt; 0, "the shipped tune must carry some roughness at idle")</code>
- 1402: <code>assert.ok(A.gravelHz() &gt;= 18 &amp;&amp; A.gravelHz() &lt;= 140, `crank rate ${A.gravelHz()} Hz is outside the roughness band`)</code>
- 1405: <code>assert.ok(A.gravelDepth() &lt; idle * 0.5, "half revs should carry well under half the roughness")</code>
- 1406: <code>assert.ok(A.gravelHz() &gt; lowHz, "the crank rate must rise with the engine")</code>
- 1408: <code>assert.ok(A.gravelDepth() &lt; 1e-6, `redline should be smooth, got ${A.gravelDepth()}`)</code>
- 1413: <code>assert.ok(A.gravelDepth() &gt; idle, "the GRAVEL trim must deepen it")</code>
- 1416: <code>assert.ok(A.gravelDepth() &lt;= A.engineLevel() + 1e-9, `depth ${A.gravelDepth()} exceeds the engine level ${A.engineLevel()} — the modulation inverts`)</code>
- 1420: <code>assert.equal(A.gravelDepth(), 0, "zero must be smooth, not merely smoother")</code>
- 1424: <code>assert.equal(A.gravelDepth(), 0, "switched off is silent whatever the trim says")</code>
- 1427: <code>assert.ok(A.gravelDepth() &gt; 0, "and back on restores it")</code>

**Line 1430: "BRAKES roar under deceleration at speed and are silent on the throttle"**

- 1435: <code>assert.equal(A.brakeLevel(), 0, "coasting is silent")</code>
- 1437: <code>assert.equal(A.brakeLevel(), 0, "and so is accelerating")</code>
- 1440: <code>assert.ok(fast &gt; 0, "a hard stop from speed must be audible")</code>
- 1442: <code>assert.ok(A.brakeLevel() &lt; fast, "the same stop from a crawl is quieter")</code>
- 1444: <code>assert.ok(A.brakeLevel() &gt; fast, "and a harder pedal is louder")</code>
- 1447: <code>assert.ok(A.brakeLevel() &gt; fast * 2, "the BRAKES trim must scale it")</code>
- 1450: <code>assert.equal(A.brakeLevel(), 0, "zero is silent")</code>
- 1454: <code>assert.equal(A.brakeLevel(), 0, "the switch is the hard off")</code>
- 1457: <code>assert.ok(A.brakeLevel() &gt; 0, "and back on restores it")</code>

**Line 1460: "brakeFrac spans the model's own brake: a full pedal (-21.7 m/s²) is a full brake layer, a lift is none (4-F1)"**

- 1467: <code>assert.ok(full &gt;= 0.95 * top &amp;&amp; top &gt; 0, `full pedal ${full} must be ~the whole layer (${top}); /60 left it at 36 %`)</code>
- 1468: <code>assert.ok(Math.abs(top - (0.020 + 0.050 * 0.8)) &lt; 1e-9, "brakeFrac 1 at the model's BRAKE: " + top)</code>
- 1469: <code>assert.equal(lvl({ ax: -6, brake: 0 }), 0, "a lift (drag decel, pedal up) is not the discs")</code>

**Line 1472: "the wastegate and the engine LOAD read the pull on the standard scale, whatever PACE (4-F2)"**

- 1482: <code>assert.equal(A.wastegateState().fired, 1, "a second of full pull at pace 0.6 dumps on the lift")</code>
- 1486: <code>assert.ok(Math.abs(slow - std) &lt; 1e-9, `the same pull is the same load at pace 0.6 (${slow}) and 1 (${std})`)</code>
- 1487: <code>assert.ok(lvl({ ax: 0, axStd: 0 }) &lt; std, "and pulling still reads fuller than coasting")</code>

**Line 1490: "the wastegate dumps once per lift, and only after a real pull"**

- 1500: <code>assert.equal(fired(), 0, "nothing on a cold start")</code>
- 1502: <code>assert.equal(fired(), 0, "no dump while still pulling")</code>
- 1504: <code>assert.equal(fired(), 1, "one dump on the lift")</code>
- 1506: <code>assert.equal(fired(), 1, "and only one — staying off the throttle must not repeat it")</code>
- 1509: <code>assert.equal(fired(), 1, "a quarter-second stab of throttle is not a pull")</code>
- 1512: <code>assert.equal(fired(), 1, "pulling at low revs builds no boost to dump")</code>
- 1516: <code>assert.equal(fired(), 1, "switched off with the turbo")</code>
- 1519: <code>assert.equal(fired(), 2, "and back with it")</code>

**Line 1522: "the SHIFT trim scales the gear-change crack"**

- 1527: <code>assert.ok(stock &gt; 0 &amp;&amp; A.shiftState().fired === 1, "a shift fires one crack at the stock level")</code>
- 1530: <code>assert.ok(Math.abs(A.shiftState().peak - stock * 2.5) &lt; 1e-9, "the trim is a multiplier on the crack")</code>
- 1533: <code>assert.equal(A.shiftState().peak, 0, "zero is a silent gearbox")</code>
- 1540: <code>assert.ok(ducked &lt;= A.engineLevel() + 1e-9, "the shift duck stays with the engine, not the trim")</code>

**Line 1557: "the braking cue is silent on the pace, tightens with urgency, and banks no backlog"**

- 1570: <code>assert.equal(fired(), before, "u=0 emits nothing at all")</code>
- 1571: <code>assert.equal(GameAudio.brakeCueState().urgency, 0)</code>
- 1580: <code>assert.ok(slow &gt; 0, `a light cue still beeps (${slow} in 4 s)`)</code>
- 1581: <code>assert.ok(fast &gt; slow * 2, `full urgency is far denser: ${fast} vs ${slow} in 4 s`)</code>
- 1584: <code>assert.ok(slow &gt;= 8 &amp;&amp; slow &lt;= 12, `~10 blips in 4 s at u=0.1, got ${slow}`)</code>
- 1585: <code>assert.ok(fast &gt;= 50 &amp;&amp; fast &lt;= 60, `~57 blips in 4 s at u=1, got ${fast}`)</code>
- 1593: <code>assert.equal(fired() - t0, 1, "exactly one blip on resume, not a banked burst")</code>

**Line 1596: "assist brake cues stay silent during a real-race WATCH"**

- 1604: <code>assert.equal(fired(), before, "brake cue does not fire while watching a replay")</code>
- 1607: <code>assert.equal(GameAudio.driveCueState().brakeFired, d0, "audio driving-cue tone stays off in WATCH")</code>
- 1610: <code>assert.equal(GameAudio.driveCueState().callFired, c0, "corner call stays off in WATCH")</code>

**Line 1627: "a transmission is band-limited to the voice-radio band at both ends"**

- 1629: <code>assert.equal(GameAudio.radioSting("radio", 1.5), true)</code>
- 1634: <code>assert.ok(f.includes("highpass@300"), "no 300 Hz highpass — the hiss keeps a bottom end no radio has: " + f.join(" "))</code>
- 1635: <code>assert.ok(f.includes("lowpass@3400"), "no 3.4 kHz lowpass on the engineer's channel: " + f.join(" "))</code>

**Line 1638: "the driving coach is not on a radio, and says so by making no sound"**

- 1642: <code>assert.equal(GameAudio.radioSting("coach", 1.5), false, "a squelch on the coach is a lie about where the line comes from")</code>
- 1644: <code>assert.equal(live.size, before, "...and it must not have built a graph either")</code>
- 1645: <code>assert.equal(GameAudio.radioSting("nonsense-kind", 1.5), false, "an unknown channel is silent by construction — the kind arrives as a string from js/game.js")</code>

**Line 1649: "the level clamps, and zero is properly off"**

- 1651: <code>assert.equal(GameAudio.setRadioFx(99), GameAudio.radioFxMax(), "a hand-edited store must not blow the level out")</code>
- 1652: <code>assert.equal(GameAudio.setRadioFx(-1), 0)</code>
- 1653: <code>assert.equal(GameAudio.setRadioFx(NaN), 1, "a NaN from localStorage falls back to the shipped level")</code>
- 1657: <code>assert.equal(GameAudio.radioSting("radio", 1.5), false, "off means off, not quiet")</code>
- 1658: <code>assert.equal(live.size, before)</code>

**Line 1661: "a preempted transmission leaves nothing rendering"**

- 1670: <code>assert.equal(live.size, before, "twelve preempts left " + (live.size - before) + " nodes wired into sfxBus — a Gain still connected keeps rendering for ever")</code>

**Line 1682: "the engineer's cue is a four-note figure, not a beep"**

- 1692: <code>assert.equal(GameAudio.radioSting("radio", 2), true)</code>
- 1694: <code>assert.equal(hz.length, 4, "a beep where a figure should be: " + hz.join(","))</code>
- 1697: <code>assert.ok(Math.abs(hz[i] - want[i]) &lt;= 22, `note ${i + 1} is ${hz[i]} Hz, measured ${want[i]} Hz (FFT bin was 21.5 Hz)`)</code>
- 1702: <code>assert.ok(semis[0] &lt; -4 &amp;&amp; semis[0] &gt; -7, "first move is down a fourth-ish: " + semis[0].toFixed(1))</code>
- 1703: <code>assert.ok(semis[1] &gt; 6 &amp;&amp; semis[1] &lt; 9, "then up a fifth-ish: " + semis[1].toFixed(1))</code>
- 1704: <code>assert.ok(semis[2] &lt; -2 &amp;&amp; semis[2] &gt; -5, "then down a minor third-ish: " + semis[2].toFixed(1))</code>
- 1707: <code>assert.ok(f &gt; 300 &amp;&amp; f &lt; 1500, `${f} Hz is outside the register this figure sits in`)</code>

**Line 1710: "the courtesy figure obeys the same gates as the rest of the frame"**

- 1715: <code>assert.equal(GameAudio.radioSting("coach", 1.5), false)</code>
- 1716: <code>assert.equal(newTones(before).length, 0, "the coach is not on a radio, so there is nothing to key")</code>
- 1720: <code>assert.equal(newTones(before).length, 0, "off means off — the figure is part of the frame, not beside it")</code>
- 1728: <code>assert.ok(ctl.length &gt;= 1 &amp;&amp; ctl.length &lt; 4, "race control is shorter than the engineer's: " + ctl.join(","))</code>
- 1729: <code>assert.ok(f &gt; 300 &amp;&amp; f &lt; 1500, `${f} Hz is outside the register`)</code>

**Line 1732: "the hiss bed outlasts the figure, however short the card"**

- 1738: <code>assert.ok(fn, "could not find radioSting in js/audio/radio-fx.js")</code>
- 1739: <code>assert.match(fn[0], /const hold = Math\.max\(0\.25, tuneS \+ [\d.]+,/, "hold must be floored by the figure's own length, not just the card's")</code>
- 1742: <code>assert.match(fn[0], /const tuneS = [\d.]+ \+ radioTune\(/)</code>

**Line 1747: "the camera mix: chase is neutral, TV sits your car back and opens the venue, onboard dries it"**

- 1750: <code>assert.equal(A.setCameraMix("chase"), "chase")</code>
- 1752: <code>assert.equal(A.setCameraMix("heli"), "tv")</code>
- 1754: <code>assert.ok(tv &lt; chase * 0.7, `TV camera must pull your engine back: ${tv} vs ${chase}`)</code>
- 1755: <code>assert.ok(tvRev &gt;= chaseRev, "TV camera opens the reverb, never closes it")</code>
- 1756: <code>assert.equal(A.setCameraMix("cockpit"), "onboard")</code>
- 1757: <code>assert.ok(drive() &gt; chase, "onboard is closer to the engine than the chase camera")</code>
- 1758: <code>assert.equal(A.setCameraMix("no-such-camera"), "chase", "an unknown id is the neutral mix")</code>
- 1759: <code>assert.equal(drive(), chase, "back on chase, every level is what it was")</code>

**Line 1762: "a downshift flares the note, then it settles; an upshift does not"**

- 1768: <code>assert.equal(A.carSfx().revFlare, 0, "an upshift is a cut, not a blip")</code>
- 1772: <code>assert.ok(flared &gt; base * 1.02 &amp;&amp; flared &lt; base * 1.06, `downshift blip overshoots by a few percent: ${flared} vs ${base}`)</code>

**Line 1775: "car SFX levels follow the car's own state, never the road's curvature"**

- 1786: <code>assert.deepEqual(L({ frontUtil: 0.9, wheelLock: 0 }, 0.5), { scrub: 0, lock: 0, surface: 0, pitLim: 0 }, "below the grip peak it is silent")</code>
- 1787: <code>assert.ok(L({ frontUtil: 1.1 }, 0.5).scrub &gt; 0.5, "fronts past the peak scrub")</code>
- 1788: <code>assert.equal(L({ frontUtil: 1.1, offroad: true }, 0.5).scrub, 0, "off the road the rumble carries it, not the scrub")</code>
- 1789: <code>assert.equal(L({ wheelLock: 1 }, 0.5).lock, 1, "a locked wheel squeals")</code>
- 1790: <code>assert.equal(L({ wheelLock: 1 }, 0.01).lock, 0, "...but not at a crawl")</code>
- 1791: <code>assert.ok(L({ offroad: true }, 0.9).surface &gt; L({ offroad: true }, 0.2).surface, "the rumble grows with speed")</code>
- 1792: <code>assert.equal(L({ pitState: "lane" }, 0.2).pitLim, 1, "rolling down the lane is on the limiter")</code>
- 1793: <code>assert.equal(L({ pitState: "box" }, 0).pitLim, 0, "stationary in the box is not")</code>
- 1801: <code>assert.deepEqual(guns, [false, true], "one loosen, one tighten, nothing per frame")</code>
- 1802: <code>assert.equal(sent.length, 5, "levels go out every frame")</code>
- 1805: <code>assert.equal(guns.length, 2, "a fresh car resets the edge")</code>

**Line 1808: "a rewind that jumps the race clock across a pit edge re-seeds wheel guns silently"**

- 1821: <code>assert.deepEqual(guns, [false], "forward into the box loosens once")</code>
- 1825: <code>assert.equal(guns.length, 1, "rewind across edges does not replay wheel guns")</code>
- 1828: <code>assert.deepEqual(guns, [false, false, true], "forward stop edges below the old clock still fire once each")</code>
- 1833: <code>assert.equal(guns.length, 3, "a new race's initial pit state stays silent")</code>
- 1835: <code>assert.deepEqual(guns, [false, false, true, true], "new race pit edges resume immediately")</code>

**Line 1838: "after a rewind the clock baseline follows the rewound raceT, so replayed stop edges fire again"**

- 1850: <code>assert.deepEqual(guns, [false])</code>
- 1854: <code>assert.deepEqual(guns, [false, false], "the replayed stop loosens the wheel guns again")</code>

**Line 1857: "setCarSfx and pitGun are safe with the engine off, and drive their layers with it on"**

- 1865: <code>assert.equal(got.scrub, 0.5)</code>
- 1865: <code>assert.equal(got.lock, 1)</code>
- 1865: <code>assert.equal(got.pitLim, 1)</code>
- 1867: <code>assert.equal(A.carSfx().scrub, 0, "NaN clamps to off")</code>
- 1868: <code>assert.equal(A.carSfx().surface, 1, "levels clamp to 1")</code>
- 1871: <code>assert.equal(A.carSfx().pitGuns, before + 1)</code>

**Line 1874: "pit wheel guns keep their immediate stagger at fresh and long-running audio clocks"**

- 1884: <code>assert.equal(sources.length, 4 * rattles, "all four wheel guns fire")</code>
- 1888: <code>assert.ok(jitter &gt;= -1e-9 &amp;&amp; jitter &lt;= 0.03 + 1e-9, `clock=${clock} tighten=${tighten} wheel=${wheel}: starts within its immediate jitter window`)</code>
- 1892: <code>assert.ok(Math.abs(src.startAt - first - k * 0.045) &lt; 1e-9, "rattle spacing stays 45 ms")</code>
- 1893: <code>assert.ok(Math.abs(src.stopAt - src.startAt - 0.13) &lt; 1e-9, "each burst retains its lifetime")</code>

**Line 1900: "recorded radio voice: clips play back to back through the radio band; a line's nodes are released, the band is built once per sound"**

- 1908: <code>assert.ok(h, "scheduled")</code>
- 1909: <code>assert.ok(Math.abs(h.end - 11.1) &lt; 1e-9, `ends after both clips and the pause: ${h.end}`)</code>
- 1910: <code>assert.equal(GameAudio.radioVoicesLive(), 1)</code>
- 1914: <code>assert.equal(GameAudio.radioVoicesLive(), 0, "the transmission is released")</code>
- 1918: <code>assert.equal(chain, 4, "only the shared band (highpass, lowpass, shaper, compressor) outlives the line")</code>
- 1920: <code>assert.ok(Math.abs(joined.end - 10.75) &lt; 1e-9, `back-to-back clips overlap by 50 ms: ${joined.end}`)</code>
- 1923: <code>assert.equal(liveNodes() - before, chain, "a second line on the same sound reuses the band: nothing new is left")</code>
- 1927: <code>assert.equal(liveNodes() - before, 2 * chain, "the commentator is a different sound (the broadcast band): its own chain, once")</code>
- 1928: <code>assert.equal(GameAudio.radioVoice([], 0, {}), null, "nothing to play is not a transmission")</code>
- 1929: <code>assert.equal(GameAudio.radioVoice([clip(0.2)], 0, { volume: 0 }), null, "volume 0 is off")</code>

**Line 1932: "clean and vintage radio presets change the recorded band and cue, but preserve the broadcast"**

- 1934: <code>assert.equal(A.radioPreset(), "modern")</code>
- 1935: <code>assert.equal(A.setRadioPreset("toString"), "modern")</code>
- 1940: <code>assert.ok(h)</code>
- 1942: <code>assert.deepEqual(filters.map((f) =&gt; f.frequency.value), [lo, hi])</code>
- 1943: <code>assert.equal(A.radioLeadS("radio") &gt; 0, cue)</code>
- 1944: <code>assert.equal(A.radioSting("radio", 2), cue)</code>
- 1949: <code>assert.deepEqual([...live].filter((n) =&gt; n.kind === "biquad").slice(-2).map((f) =&gt; f.frequency.value), [90, 9000])</code>

**Line 1953: "M8: radio voice chains prune on preset switch and never outgrow the live set"**

- 1975: <code>assert.equal(A.voiceChainsLive(), 5, `after ${p}: only the live preset's chains`)</code>
- 1976: <code>assert.equal(liveNodes() - base, 20, `after ${p}: 5 × 4 chain nodes`)</code>
- 1983: <code>assert.ok(A.voiceChainsLive() &lt;= 9, "VOICE_CHAIN_MAX is a hard ceiling")</code>
- 1984: <code>assert.equal(A.voiceChainsLive(), 5, "cycles settle on the current preset only")</code>
- 1988: <code>assert.equal(liveNodes(), held, "a repeat line on the live preset reuses the chain")</code>

**Line 1991: "the pit limiter only ever CUTS the engine: base down by the depth, never louder, never negative"**

- 1998: <code>assert.ok(depth &gt; 0, "the stutter is on")</code>
- 1999: <code>assert.ok(base + depth &lt;= free + 1e-9, `the peak of the swing (${base + depth}) never exceeds the free engine (${free})`)</code>
- 2000: <code>assert.ok(base - depth &gt;= 0, `the trough (${base - depth}) never inverts`)</code>
- 2002: <code>assert.ok(Math.abs(run() - free) &lt; 1e-9, "and it is gone the moment the limiter is")</code>

**Line 2005: "pit limiter follows the lane's own predicate (the exit road too); a red flag in the box fires no guns"**

- 2017: <code>assert.equal(S.levels(car, 0.2).pitLim, 1, "still limited on the exit road after the stop")</code>
- 2019: <code>assert.equal(S.levels(car, 0.2).pitLim, 0, "released at the exit line")</code>
- 2023: <code>assert.deepEqual(guns, [false], "loosened on arrival, but a red flag is not a crew tightening wheels")</code>

**Line 2026: "the saved camera's mix is applied at boot, not only on the first camera change"**

- 2029: <code>assert.match(tail, /GameAudio\.setCameraMix\(CAM_MODES\[G\.camMode\]\.id\)/)</code>

**Line 2037: "every CAM_MODES id has an explicit camera mix kind"**

- 2041: <code>assert.ok(ids.length &gt;= 20 &amp;&amp; ids.includes("tv"), "precondition: parsed the camera list, got " + ids.join(","))</code>
- 2045: <code>assert.deepEqual(ids.filter((id) =&gt; !listed.has(id)), [], "camera ids with no CAM_KIND entry fall back to the chase mix")</code>
- 2048: <code>assert.equal(A.setCameraMix("tv"), "tv", "the TV director camera gets the TV (spectator) mix")</code>

**Line 2058: "a steady setEngine and a quiet setSkid schedule nothing after the first frame"**

- 2070: <code>assert.equal(GameAudio.debug().usingSamples, core === "samples", "precondition: " + core)</code>
- 2084: <code>assert.equal(sets(), s0, core + ": 30 identical frames re-scheduled " + (sets() - s0) + " param events")</code>
- 2086: <code>assert.ok(sets() &gt; s0, core + ": a slide must still reach the skid gain")</code>
- 2087: <code>assert.ok(GameAudio.skidLevel() &gt; 0, core + ": the slide is audible")</code>
- 2089: <code>assert.equal(GameAudio.skidLevel(), 0, core + ": releasing the slide lands an exact 0")</code>

**Line 2093: "a sustained skid wobbles on the audio thread, not with a main-thread filter aim every frame"**

- 2107: <code>assert.ok(filt, "precondition: skid bandpass (Q 1.4) exists")</code>
- 2111: <code>assert.ok(added &lt;= 2, `steady slide at 0.8 re-aimed the filter centre ${added} times in 30 frames (want &lt;= 2 after settle)`)</code>

**Line 2115: "the reverb send is dry when SPACE is off or the reverb layer is disabled"**

- 2133: <code>assert.ok(revSendGain, "precondition: revSend gain is captured")</code>
- 2137: <code>assert.ok(revSendGain.value &gt; 0, "precondition: send open when SPACE is on")</code>
- 2139: <code>assert.equal(revSendGain.value, 0, "layer off must gate the convolver send, not only the return")</code>
- 2141: <code>assert.ok(revSendGain.value &gt; 0, "layer on restores the send")</code>
- 2143: <code>assert.equal(revSendGain.value, 0, "SPACE trim at zero must gate the send")</code>
- 2145: <code>assert.ok(revSendGain.value &gt; 0, "non-zero SPACE restores the send")</code>

**Line 2148: "on a TV camera the rev limiter's swing scales with the engine: the gain never inverts"**

- 2154: <code>assert.ok(swing != null, "limSwing is reported")</code>
- 2155: <code>assert.ok(base - swing &gt;= -1e-9, `${cam}: trough ${base - swing} (base ${base}, swing ${swing})`)</code>

**Line 2159: "the off-road rumble's filter is not rescheduled every frame for a steady surface"**

- 2163: <code>assert.ok(A.debug().surfSched - before &lt;= 1, `rescheduled ${A.debug().surfSched - before} times`)</code>

**Line 2166: "cutting a transmission short cuts its courtesy figure and squelch tail too, not just the hiss"**

- 2170: <code>assert.equal(GameAudio.radioSting("radio", 3), true)</code>
- 2175: <code>assert.deepEqual(late.map((n) =&gt; [n.kind, n.startAt]), [], "scheduled after the cut, still due to play")</code>

**Line 2178: "audio-test.cjs --help exits 0 and does not treat --help as a baseURL"**

- 2184: <code>assert.equal(r.status, 0, r.stderr)</code>
- 2185: <code>assert.match(r.stdout, /audio-test/)</code>
- 2186: <code>assert.match(r.stdout, /static server|baseURL/i)</code>

**Line 2246: "audio probe exits with failure on page errors in either browser after closing owned resources"**

- 2249: <code>assert.equal(result.status, 1, "page errors from browser " + browser + " must fail the CLI")</code>
- 2250: <code>assert.ok(result.messages.some((line) =&gt; line.includes("pageerrors") &amp;&amp; line.includes("fixture page failure")))</code>
- 2251: <code>assert.equal(result.launches, browser, "the failing phase stops the probe")</code>
- 2252: <code>assert.deepEqual(result.events, ["server-open", ...Array.from({ length: browser }, (_, i) =&gt; "browser-close-" + (i + 1)), "server-close"])</code>

**Line 2256: "a healthy audio probe completes both metric sweeps and exits successfully after cleanup"**

- 2258: <code>assert.equal(result.status, 0)</code>
- 2259: <code>assert.equal(result.launches, 2)</code>
- 2260: <code>assert.ok(result.messages.some((line) =&gt; line.startsWith("PASS: all voices monotonic")))</code>
- 2261: <code>assert.deepEqual(result.events, ["server-open", "browser-close-1", "browser-close-2", "server-close"])</code>

**Line 2266: "sample BufferSource is seeded below 1.0 and the first setEngine snaps"**

- 2272: <code>assert.ok(src, "sample idle source exists")</code>
- 2273: <code>assert.ok(src.playbackRate.value &lt; 0.5, "seeded below the Web Audio default of 1.0, got " + src.playbackRate.value)</code>
- 2274: <code>assert.ok(src.playbackRate.value &gt; 0.05, "seeded at a usable idle rate")</code>
- 2277: <code>assert.equal(src.playbackRate.lastMethod, "value", "first frame must snap, not setTargetAtTime from 1.0")</code>
- 2278: <code>assert.ok(src.playbackRate.cancels &gt;= 1, "snap cancels any prior ramp")</code>
- 2280: <code>assert.ok(r &lt; 0.95, "must not briefly report a near-1.0 spike, got " + r)</code>
- 2281: <code>assert.ok(r &gt; 0.3, "live rate after lights-out shape, got " + r)</code>

**Line 2284: "a 1→3 skip-shift snaps playbackRate on the shift frame"**

- 2290: <code>assert.ok(idleRate &gt; 0.10 &amp;&amp; idleRate &lt; 0.20, "precondition idle gear-1 rate, got " + idleRate)</code>
- 2295: <code>assert.ok(src.playbackRate.snaps &gt; snapsBefore, "skip-shift must use setValueAtTime")</code>
- 2296: <code>assert.equal(src.playbackRate.lastMethod, "value")</code>
- 2298: <code>assert.ok(r &gt; 0.40 &amp;&amp; r &lt; 0.70, "skip-shift target on the shift frame, got " + r)</code>
- 2299: <code>assert.ok(Math.abs(r - idleRate) &gt;= 0.08, "discontinuity large enough that smoothing would lag")</code>

**Line 2302: "a steady same-gear rev climb still aims playbackRate"**

- 2308: <code>assert.equal(src.playbackRate.snaps, snapsBefore, "smooth climb must not snap")</code>
- 2309: <code>assert.equal(src.playbackRate.lastMethod, "target")</code>

**Line 2312: "synth→sample upgrade seeds playbackRate from lastRate, not 1.0"**

- 2317: <code>assert.equal(A.debug().usingSamples, false)</code>
- 2319: <code>assert.equal(A.debug().usingSamples, false)</code>
- 2321: <code>assert.equal(A.debug().samplesReady, true)</code>
- 2323: <code>assert.equal(A.debug().usingSamples, true, "upgrade restarts onto the sample voice")</code>
- 2325: <code>assert.ok(src)</code>
- 2326: <code>assert.ok(src.playbackRate.value &lt; 0.95, "upgraded source must not start at the 1.0 default, got " + src.playbackRate.value)</code>
- 2327: <code>assert.ok(A.rate() &gt; 0.3 &amp;&amp; A.rate() &lt; 0.95, "live rate after upgrade, got " + A.rate())</code>
- 2328: <code>assert.ok(A.engineLevel() &gt; 0, "mid-race upgrade keeps the voice open instead of fading from silence")</code>

**Line 2337: "the countdown drives the player's engine at idle, not silence until lights-out"**

- 2341: <code>assert.ok(count.length &gt; 0, "precondition: found update()'s countdown branch")</code>
- 2342: <code>assert.match(count, /_gridIdleOpts\.soundOn\s*=\s*soundOn;[\s\S]*?GameAudio\.setGridIdle\(player,\s*_gridIdleOpts\);\s*return;/, "the countdown branch fills the pooled _gridIdleOpts bag then setGridIdle (no per-frame {})")</code>
- 2344: <code>assert.doesNotMatch(count, /GameAudio\.setEngine\(/, "the idle pack lives in GameAudio.setGridIdle, not inline in game.js")</code>
- 2348: <code>assert.equal(A.engineLevel(), 0, "precondition: startEngine alone leaves the engine silent")</code>
- 2351: <code>assert.equal(A.engineLevel(), 0, "no player: stay silent")</code>
- 2353: <code>assert.equal(A.engineLevel(), 0, "SOUND off: stay silent")</code>
- 2355: <code>assert.equal(A.engineLevel(), 0, "non-last physics step: stay silent")</code>
- 2357: <code>assert.ok(A.engineLevel() &gt; 0, "a stationary idle setGridIdle opens the note")</code>
- 2358: <code>assert.equal(A.windLevel(), 0, "and keeps the wind gated on the grid")</code>

**Line 2366: "feedReplayScrub: replay scrub drives engine + rivals from replayed speed, silences once on exit"**

- 2370: <code>assert.match(paused, /GameAudio\.feedReplayScrub\(soundOn &amp;&amp; player, replayBuf\.isScrubbing\(\), cars, naturalGear, rpmFor, rivalAudio, isWetRoad, vTop\); return;/, "the paused branch's return line hands the frame to GameAudio.feedReplayScrub (hoisted refs, no per-frame {})")</code>
- 2372: <code>assert.doesNotMatch(paused, /GameAudio\.setEngine\(/, "the scrub engine pack lives in GameAudio, not inline in game.js")</code>
- 2373: <code>assert.match(src, /paused = p; GameAudio\.resetReplayScrub\(\);/, "setPaused clears the scrub one-shot")</code>
- 2375: <code>assert.match(rb, /GameAudio\.syncReplayRpms\(cars\)/, "applyPose re-revs the field from the replayed speeds")</code>
- 2387: <code>assert.equal(A.debug().engineOn, false, "SOUND off / no player: untouched")</code>
- 2389: <code>assert.equal(A.debug().engineOn, false, "paused, not scrubbing: stays silent")</code>
- 2391: <code>assert.equal(A.debug().engineOn, true, "scrubbing starts the engine voice")</code>
- 2392: <code>assert.ok(A.engineLevel() &gt; 0, "and opens the note")</code>
- 2393: <code>assert.equal(player.rpm, rpmFor(2, 20), "player rpm = rpmFor(naturalGear(v), v)")</code>
- 2394: <code>assert.equal(cars[1].rpm, rpmFor(6, 60), "every car re-revs from its replayed speed")</code>
- 2395: <code>assert.ok(A.rivalState().some((v) =&gt; v.gain &gt; 0), "the field is fed to the rival voices")</code>
- 2398: <code>assert.equal(player.rpm, rpmFor(6, 50), "syncReplayRpms follows a seek without waiting for a frame")</code>
- 2400: <code>assert.equal(A.debug().engineOn, false, "leaving the scrub silences the engine once")</code>
- 2403: <code>assert.equal(A.debug().engineOn, true, "the exit is a one-shot: later paused frames leave the engine alone")</code>
- 2406: <code>assert.equal(A.debug().engineOn, true, "resetReplayScrub (setPaused) drops the pending exit")</code>

**Line 2409: "stopping the engine stops EVERY source it started, the skid LFO included"**

- 2436: <code>assert.equal(GameAudio.debug().usingSamples, samples, "precondition: the core under test")</code>
- 2438: <code>assert.equal(leaked.length, 0, `${samples ? "sample" : "synth"} core: ${leaked.length} started, never-stopped source(s)`)</code>

**Line 2442: "an identical rival idles and revs on the player's own pitch curve, not 6-9 semitones above it"**

- 2453: <code>assert.ok(Math.abs(semitones) &lt; 0.05, `rev ${rev}: the rival is ${semitones.toFixed(2)} semitones off your own note`)</code>

**Line 2459: "kerb rumble gain and rate rise with speed, and are 0 off the kerb"**

- 2466: <code>assert.ok(slow.kerb &gt; 0, "on kerb at low speed is audible")</code>
- 2467: <code>assert.ok(fast.kerb &gt; slow.kerb, "kerb gain rises with speed")</code>
- 2468: <code>assert.ok(fast.kerbRate &gt; slow.kerbRate, "kerb playbackRate rises with speed")</code>
- 2469: <code>assert.ok(fast.kerbHz &gt; slow.kerbHz, "kerb brightness rises with speed")</code>
- 2470: <code>assert.equal(slow.kerbLive, true)</code>
- 2473: <code>assert.equal(off.kerb, 0, "off the kerb the continuous layer is silent")</code>
- 2474: <code>assert.equal(off.kerbLive, false)</code>

**Line 2477: "wet spray is 0 dry, rises with speed when wet, and rivals-ahead only adds wake"**

- 2489: <code>assert.equal(A.kerbSpray().spray, 0, "dry road: no spray even with a rival ahead")</code>
- 2496: <code>assert.ok(slow &gt; 0, "wet at low speed still sprays a little")</code>
- 2497: <code>assert.ok(fast &gt; slow, "wet spray rises with speed squared")</code>
- 2502: <code>assert.ok(withWake.sprayAhead &gt; 0, "rival ahead within 40 m sets sprayAhead")</code>
- 2503: <code>assert.ok(withWake.spray &gt; alone, "rivals-ahead wake adds quieter spray only when wet")</code>
- 2506: <code>assert.equal(A.kerbSpray().spray, alone, "Rivals OFF removes only the rival wake")</code>
- 2507: <code>assert.ok(A.kerbSpray().sprayAhead &gt; 0, "mute does not discard wake geometry")</code>
- 2510: <code>assert.equal(A.kerbSpray().spray, alone, "zero Rivals level preserves only own spray")</code>
- 2513: <code>assert.equal(A.kerbSpray().spray, withWake.spray, "restoring Rivals restores the wake")</code>
- 2516: <code>assert.equal(A.kerbSpray().sprayAhead, 0, "a rival behind is not a spray wake")</code>
- 2517: <code>assert.equal(A.kerbSpray().spray, alone, "behind adds no wake")</code>

**Line 2520: "SFX off silences kerb rumble and wet spray (and unmutes the one-shot gate)"**

- 2524: <code>assert.ok(A.kerbSpray().kerb &gt; 0)</code>
- 2525: <code>assert.ok(A.kerbSpray().spray &gt; 0)</code>
- 2526: <code>assert.equal(A.kerbSpray().kerbLive, true)</code>
- 2529: <code>assert.equal(A.kerbSpray().kerbLive, false, "SFX off clears kerbLive so rumble() is not stuck muted")</code>
- 2535: <code>assert.equal(A.kerbSpray().kerb, 0, "SFX off: setEngine does not open the kerb layer")</code>
- 2536: <code>assert.equal(A.kerbSpray().spray, 0, "SFX off: setEngine does not open the spray layer")</code>

**Line 2540: "boost activation is quiet when ERS is muted or its trim is zero"**

- 2543: <code>assert.equal(A.boostState().peak, 0)</code>
- 2545: <code>assert.equal(A.boostState().peak, 0)</code>
- 2547: <code>assert.ok(A.boostState().peak &gt; 0 &amp;&amp; A.boostState().peak &lt;= 0.15, "stock whoosh is below the old 0.3 peak")</code>
