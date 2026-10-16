# Highlight reel and clip export — score the race, cut a 30-60 s reel, save it as a video

Date: 2026-10-04 Status: PLAN (docs-only; nothing here is built) Scope: solo races only. A new event journal, a long-horizon clip store, a pure scorer
and clip planner, an in-game reel player, then an optional video export (WebCodecs first, MediaRecorder fallback) with share-or-download. No backend,
no build step, no change to physics or netplay authority.

A path written `js/<new>/name.js` is a PROPOSED file (same convention as `docs/plans/2026-09-30-broadcast-feel.md`); every other path exists today.
Ship branch `claude/f1-game-project-26h3ng`; one PR per slice, drafts until the gate (AGENTS.md section The loop); at most two PRs on auto-merge per
session.

## Related (do not duplicate)

| Doc / module | What it owns | How this plan relates |
|---|---|---|
| `docs/plans/2026-09-30-broadcast-feel.md` | Shipped TV director, 20 s replay ring, results orbit + highlights (slices A-C) | This plan EXTENDS slice C: its `highlightsReel` is tag-only and ring-bound; we replace the input, not the player-facing buttons |
| `docs/notes/CAMERA-BROADCAST-KIT-2026-10-01.md` | Wall avoid, trackside cams, photo kit, comfort | We reuse `GameCams.vantage` shots and cam-avoid; no camera-kit changes |
| `.claude/skills/replay-camera/SKILL.md` | Seek/follow/exit/reentry discontinuity probes | Reel clip boundaries are seeks: run its offline contract in slice 1 |
| `docs/plans/2026-10-03-perf-memory.md` | Phone resident-memory budget | Export buffers must fit its low-tier ceiling (Risks) |

## Goal

1. After a solo race the player can press REEL and watch an automatic 30-60 s highlight reel of THEIR race: a title card, 5-8 scored clips each with
   pre-roll and a TV-style camera cut, and an end card with the result.
2. From the same screen they can SAVE or SHARE it as a video file (mp4 where the browser can, webm otherwise), with a visible "UNOFFICIAL FAN GAME"
   watermark, no F1 marks, and only audio we are licensed to ship.
3. The scoring and planning logic is pure and unit-tested; encoding is feature-detected and degrades to "reel plays in-game, export hidden".

## Non-goals

- Re-simulating the race from inputs to re-render a clip (see Design: the recorded-pose route is chosen on purpose).
- The Data Hub REAL RACE HIGHLIGHTS reel (`js/race/real-replay.js`, `js/data/real-race-tab.js`); it is built from OpenF1 scripts and already has its
  own director. Reusing the planner there is a later option.
- Netplay (VS FRIEND) reels, career-save writes, or any new persisted store.
- Capturing Spotify audio, speech synthesis, or user-uploaded (MusicLib) music.
- Server upload, accounts, GIF export, or recording live gameplay in real time.

## Current state (evidence)

### The 20 s ring is too short and stores poses, not state
- `js/camera/replay-buf.js` L1-18: solo-only, `WINDOW_S = 20`, `HZ = 30`, `FLOATS = 9` (s, x, yaw, speed, px, py, pz, steer, yawVis), `MAX_BYTES = 720
  KiB`. A race is minutes long, so the ring cannot hold a reel's clips.
- `applyPose` (L188-201 region) writes pose fields back onto `G.cars` and sets the `rPrev*` interpolation endpoints, so a paused frame renders exactly
  the recorded pose. This is a replay of recorded poses, NOT a re-simulation. Tyre smoke, skid marks, debris and car damage are not in it.
- Tags are only `retirement` and `chequered` (`pushTag`, status-edge sampling in `sample`). `tickScrub` advances `scrubT` by wall dt; `apply(t)` is
  random-access, so any `t` can be rendered on demand (this is what makes non-real-time export possible).
- `js/game.js` L3468 builds it (`ReplayBuf.create(G, () => !realRace.isWatch())`); L2693 arms it per race. Tests: `tests/unit/replay-buf.test.mjs`.

### The results highlights are a stub
- `js/camera/results-cam.js`: `highlightsReel(tags, t0, t1, maxS)` (L48-ish) takes the last tags newest-first, 4 s each (`HIGHLIGHT_CLIP_S`), 45 s
  cap, and `startHighlights` plays them through `buf.apply`. With no tags it falls back to the last 4 s of the ring. `enabled(G)` is FALSE on mobile
  and at `PerfGov.tier() >= 2`, so phones never see it today. Tick: `js/game.js` L8195.
- Test: `tests/unit/results-cam.test.mjs`.

### Where race events really come from
- The one field-wide edge-event source is `js/race/race-facts.js`, whose `observe` returns `{ f, ev }` with types: `start`, `pass` (held 1 s, pit
  swaps excluded), `retire`, `mistake` (AI error edge only), `pitIn`, `lap`, `fastest`, `caution` (level 2 VSC, 3 SC, 4 red), `hit` (player only),
  `finish`, `leaderLap` (L157-311). Its only reader is `js/race/race-radio.js`: the instance is private (`RaceFacts.create()` at L67,
  `facts.observe(G, dt)` at L517), and `tvEvent` (L389) shows which of them are already treated as TV-worthy.
- Not in RaceFacts: penalties for AI cars (`c.penalty` accrues in `js/game.js` around L5149; the player's is announced at L739-744), big player or AI
  impacts (`pc.hitSev`, L4463), multi-car pile-ups (`js/physics/incident-sim.js`, `owns(c)`), and a lock-up edge for any car (`c.wheelLock`, L5729
  region).
- `js/race/race-insights.js` `event(kind, text)` is a player-only coaching log. It is not a race journal; do not use it.
- `js/race/broadcast.js` exports `shotFor`, `battles`, `SHOTS`, `SHOT_MIN_S`; `js/camera/director.js` `decideCut` is the live-TV cut brain. Both are
  pure.

### Rendering and presentation
- Real GPUs draw to `#game`. Only software GL (headless/SwiftShader, Mesa) adds the 2D overlay `#game-soft` (`js/render/three/tlx.js` L528-546,
  `js/render/glx/glx.js` L488, `_softPresent = headlessUa` L639). Pixel capture goes through `gfx.capturePixels()` and `gfx.awaitSoftPresent(ms)`;
  `js/ui/photo-studio.js` `frame()` (L177-) is the existing "render one frame deterministically, then read it" pattern, driven by `render(0)`
  (`js/game.js` L6518, wired as `renderFrame` at L8362).
- No code in `js/` uses `captureStream`, `MediaRecorder`, `VideoEncoder` or `VideoFrame` today (grep). A pure `navigator.share({files})` + save
  fallback exists in `js/editor/designer.js` `shareCard` (L1507-1525) and `saveFile` (L1433).

### Audio
- `js/audio/engine.js` L322-326: `master` GainNode, then a `DynamicsCompressor` limiter, then `ctx.destination`; `sfxBus` feeds `master` (L327-329).
  `js/audio/soundtrack.js` L41 connects `musicGain` to `master`; ducking is `duckForEngine` (L358) via `setTargetAtTime`. A
  `MediaStreamAudioDestinationNode` connected after the limiter would capture engine + sfx + decoded music.
- NOT in the graph: `speechSynthesis` (`js/audio/announcer.js` L535, noted at `js/audio/radio-fx.js` L9) and the Spotify Web Playback SDK
  (`js/audio/spotify.js` header; DRM media in the SDK's own player). Neither can be tapped, which is the correct outcome for Spotify.
- LICENSING FACT THAT CONTRADICTS A BRIEFING CLAIM: `assets/music/CREDITS.txt` says all six tracks are "provided by the project owner", not CC0
  (`js/audio/soundtrack.js` L8 comment says "CC0"). Whether they may be redistributed inside a shared video is an owner decision (Open questions).
  User files from `js/audio/music-lib.js` are the player's own and must not be mixed into an exported file either.

### Vendoring precedent
`vendor/three-0.186.0/` (LICENSE.txt, MANIFEST.json, PATCHES.md), `vendor/jsqr-1.4.0/` (LICENSE + one classic script), `vendor/trystero-0.25.4/` (ES
modules via the import map in `index.html` L3390); precache lists in `sw.js` L233-247.

## Web research (verified 2026-10-04; cited)

| Question | Finding | Source |
|---|---|---|
| VideoEncoder support | MDN browser-compat-data: Chrome/Edge 94, Firefox DESKTOP 130, Firefox Android false, Safari 16.4 and iOS 16.4. caniuse labels Safari 16.4-18.7 "partial" and 26+ "full". The earlier "Firefox 130" claim is right for desktop and wrong for Android. | https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/VideoEncoder.json ; https://caniuse.com/webcodecs |
| MediaRecorder | Chrome 47, Firefox 25, Safari 14.1, iOS 14. Container is browser-chosen; webm is "widely available", mp4 "variable, always test isTypeSupported". | https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/MediaRecorder.json ; https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static |
| canvas.captureStream | Chrome 51, Firefox 43, Safari 11 (iOS same). Real-time only: frames are sampled as the canvas paints. | https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/HTMLCanvasElement.json |
| Web Share with files | Chrome 89 desktop (75/76 Android), Safari 14 (iOS same); Firefox has no file sharing in canShare. | https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Navigator.json |
| Muxers | mp4-muxer and webm-muxer (MIT) are both DEPRECATED, "superseded by Mediabunny". Mediabunny is MPL-2.0, zero dependency, tree-shakable (claims "as small as 5 kB gzipped"), has `CanvasSource` and `BufferTarget`/`StreamTarget`, muxes MP4 and WebM. | https://github.com/Vanilagy/mp4-muxer ; https://github.com/Vanilagy/webm-muxer ; https://github.com/Vanilagy/mediabunny |

Not verified (no source fetched): Mediabunny's single-file non-module build and real gzipped size, Safari 26 H.264/AAC profiles, iOS canvas and memory
ceilings, `VideoEncoder` throughput on target phones. These gate slice 2.

## Design

### Recording: clip vault, not a bigger ring
Keep `ReplayBuf` as is (pause scrub). Add `js/<new>/camera/clip-vault.js`: on each journal event worth keeping, COPY a slice out of the ring into a small
frozen record and let the ring keep rolling. Pre-roll is free (it is already in the ring); post-roll needs `POST_S` more seconds, so a clip is
finalised `POST_S` after its event. A slice is `(PRE_S + POST_S) * 30 Hz * frameBytes(22)`, about 814 B per frame, so 9 s is ~220 KB; with a hard cap
of 14 candidate slices the vault is ~3 MB, far under a phone budget, and cleared on `onRaceStart`. Same pose format as the ring, so `apply(t)`
equivalents are one `lerpCar` away. The vault stores no render state beyond poses, so it inherits the ring's limits (no tyre smoke replay); the reel
hides them with fast cuts. Eviction is by score (lowest first), never FIFO, so an early crash survives a quiet middle. Solo only: gated by the same
`allowed()` rule as the ring.

### Event journal (the missing source)
`js/<new>/race/event-journal.js`: a read-only per-race log `{ t, kind, car, pos, gain, sev, laps, meta }`. Inputs: (a) RaceFacts events, tapped by adding
one optional `onEvents(ev, f)` hook to the opts that `RaceRadio.create(G, opts)` already takes (`js/race/race-radio.js` L64) so there is ONE RaceFacts
instance, not a second timing loop; (b) its own edge detectors, each a few lines, for what RaceFacts lacks: AI penalty rise (`c.penalty`), lock-up
(`c.wheelLock` rising edge), contact (`c.hitSev` rise), pile-up (`incidentSim` ownership count >= 2). It never writes a car field and never draws sim
RNG. Capacity 256 events.

### Event scoring (pure, `js/<new>/race/reel-score.js`)
score = base[kind] * posW(pos) * ctx * (1 + 0.5 * player) + bonus, rounded to 0.1. Defaults (tunable constants in one frozen table):

| kind | base | notes |
|---|---|---|
| finish (winner) | 12 | always selected; ends the reel |
| lead change (`pass`, pos 1) | 10 | |
| pile-up / big hit (sev >= 0.6) | 9 | |
| pass | 4 + 1.5 * min(gain, 4) | gain = places swapped in 10 s, capped |
| safety car / red flag | 7 | VSC 4; one per deployment |
| fastest lap | 5 | x1.5 in the last 25 % of the race |
| retirement | 6 | x1.3 if a top-6 car |
| penalty | 3 | x1.5 if it changed a podium place |
| mistake / lock-up | 2.5 | only top 6 or player battle |

posW = 1.0 for P1-3, 0.8 for P4-6, 0.55 for P7-10, 0.35 below. ctx = 1.25 in the last two laps, 0.7 under caution for a plain pass (passes under SC
are pit swaps, `race-radio.js` L394 already skips them). Clustering: events within 6 s race time merge into one candidate with score = max + 0.25 *
sum(others). Suppression: a pass reversed within 8 s (`repass`) is dropped.

### Clip planner (pure, `js/<new>/camera/reel-planner.js`)
Input: scored candidates, vault index, target length (default 45 s, clamp 30-60), seed. Output: an ordered clip list `{ t0, t1, kind, subject, shot,
cutAt[] }` plus title and end cards.
1. Budget: title 3 s + end card 3 s + clips of 5-8 s (pass 6, crash 8, flag 5).
2. Greedy by score with diversity: at most 2 clips per kind, at least 20 s race time between clips, one clip per subject unless score gap > 3.
3. Mandatory first-class slots: the winner's finish; the player's best moment if any scored >= 3 (the reel is theirs).
4. Order chronologically, finish last, so the reel tells the race in order.
5. Camera per clip: `Broadcast.shotFor(kind, onAir, n)` for the opening shot, with one mid-clip cut when the clip exceeds `SHOT_MIN_S`; the subject is
   the chaser of the pass or the car that crashed. Eye/target come from `G.camVantage` (broadcast-only curvature, same as `director.js applyShot`), so
   the PHYSICS.md rule "the arc must not reach the driver" holds.
6. Cuts between clips: a 0.15 s dip-to-black (CSS overlay in play, pre-multiplied in the encoder path) so pose discontinuities are never a visible
   snap.

### Reel player (`js/<new>/ui/reel-player.js`)
Generalises `ResultsCam.startHighlights`: it consumes the planner clip list and drives vault frames through the same `applyPose` seam; title and end
cards are DOM (`index.html` owns static DOM), the REEL button sits beside `res-highlights`. Solo, not WATCH, state "results". Unlike the orbit path
(`enabled()` stays as is) it is allowed on phones: no extra pass.

### Encoder abstraction (`js/<new>/export/clip-encoder.js`)
One interface, three backends picked by feature detection, never by UA string: `probe()` returns `{ best, reasons }`; `start(opts)`, `addFrame(canvas,
tUs)`, `addAudio(buffer)`, `finish() -> Blob`, `cancel()`.

RECOMMENDED path: WebCodecs `VideoEncoder` + Mediabunny muxer, offline (non-real-time).
- Because the vault gives random-access poses and the game already has a deterministic one-frame render recipe (photo-studio `frame()`), export steps
  the reel frame by frame at a fixed 30 fps: apply pose for `t_i`, set the camera from the plan, `render(0)`, await `awaitSoftPresent` where
  soft-present is on, `new VideoFrame(canvas, { timestamp })`, `encode`. Frame cost no longer has to fit 33 ms, so a slow phone still produces a
  correct 30 fps file, only slower. `encodeQueueSize` backpressure keeps memory flat.
- Audio cannot be stepped, so the offline path renders audio SEPARATELY: an `OfflineAudioContext` mix of a small reel soundtrack (see Audio below),
  not a capture of the live game. Engine roar is synthesised per clip from the recorded `speed` lane through the existing engine DSP only if slice 3
  proves it cheap; otherwise the file is music/silence plus a whoosh at cuts.
- Muxer: Mediabunny (MPL-2.0 is file-level copyleft: vendoring it unmodified with its LICENSE is fine; mp4-muxer/webm-muxer are MIT but deprecated, so
  no). Vendored like `vendor/jsqr-1.4.0/`: a pinned directory with LICENSE, a tree-shaken single classic-script build (MP4 + WebM, no demux) built
  once with a script in `tools/` and committed, listed in `sw.js` precache lazily (only fetched when the player taps SAVE). If no classic build is
  clean, fall back to the import-map module pattern trystero uses.
- Support: Chrome/Edge 94+, Safari 16.4+/iOS (partial before 26: gate on `VideoEncoder.isConfigSupported`), Firefox desktop 130+. Firefox Android and
  anything where `isConfigSupported` is false use the fallback.

FALLBACK path: `canvas.captureStream(30)` + `MediaRecorder`, real-time.
- Plays the reel at 1.0x on screen while recording `#game` (or `#game-soft` when `gfx.softPresent()`), mixing a `MediaStreamAudioDestinationNode`
  tapped after the limiter at `js/audio/engine.js` L326. Output container is whatever `isTypeSupported` accepts, order: mp4 (iOS/Safari), then webm
  vp9, vp8. Frame drops are visible in the file; the UI says "recording takes the length of the reel" and blocks input.
- Watermark and cards must be drawn INTO the captured surface, so the fallback records a 2D compositor canvas (game canvas + overlay) rather than
  `#game`.
- It cannot honour the licensing rule for the live music bus (see Audio), so it taps only `sfxBus`, never `musicGain`, unless the owner clears music.

### Resolution, bitrate, memory (phones are the hard constraint)
Export render target is NOT the screen: a fixed `1280x720` (16:9 letterboxed) default, `854x480` on `gfx.isMobile`/`PerfGov.tier() >= 1`, 30 fps,
video bitrate 4 Mbit/s (2.5 on low), keyframe every 2 s; a 45 s reel is about 20 MB (11 MB low). The muxer writes to a `BufferTarget` (RAM) unless the
file would exceed 32 MB, then `StreamTarget` to a `FileSystemWritableFileStream` where available, else the export drops to the low preset. Rendering
at a different size than the live canvas means a render-target resize and restore around the export; this touches `js/render/gfx.js` and must be
proven on all three backends (TLX default, GLX fallback, WGX opt-in) before slice 2 merges. Exports are blocked while `apex26.crashStrikes`
(`js/perf/governor.js`) shows a recent OOM kill.

### Audio and licensing
- Default exported soundtrack: engine/sfx only (from `sfxBus`) plus the synthesised cut whooshes. Music is OFF in the file unless the owner confirms
  the six `assets/music/` tracks may be redistributed (CREDITS.txt says "provided by the project owner", not CC0).
- Hard rule, enforced in code and tested: the tap node is created from the engine graph only; when `GameAudio.musicBackend()` is not the built-in one
  (Spotify) or the source is MusicLib, the music leg is omitted and the export sheet says why. A unit test asserts the Spotify and MusicLib paths
  yield no music node.

### Watermark, marks, sharing
- Burned-in bottom-left "UNOFFICIAL FAN GAME - APEX 26" on every frame and on the title/end cards (drawn on the compositor canvas, never removable by
  a CSS toggle). Cards use the game's own typography; no F1 logo, no FIA marks, no real team crests beyond what the garage already ships, and driver
  names exactly as the game shows them.
- Share: `navigator.canShare({ files })` then `navigator.share({ files, title })` (file sharing: Chrome 89, Safari 14, not Firefox), else a download
  through the same `saveFile` blob path as `js/editor/designer.js` L1433. AbortError is the player's choice: no fallback, no message (that file's
  existing rule). Filename `apex26-<track>-<yyyymmdd>.mp4|webm`.

## Slices (each one PR)

### Slice 1 - journal, scorer, planner, in-game reel (M)
- New: `js/<new>/race/event-journal.js`, `js/<new>/race/reel-score.js`, `js/<new>/camera/clip-vault.js`, `js/<new>/camera/reel-planner.js`, `js/<new>/ui/reel-player.js`.
- Edited (thin): `js/race/race-radio.js` (the `onEvents` opt, a few lines), `tools/manifest.cjs` (five entries + HARD_EDGES for eval-time
  destructuring), `index.html` via `node tools/gen/gen-shell.mjs` (never by hand), `js/camera/results-cam.js` (a REEL button next to
  `res-highlights`), `js/game.js` ONLY by appending the new `create` calls onto existing lines (L3468-3469 style) and a tick call on an existing line:
  net line count zero.
- ratchet: `tests/data/ratchets.json` has `js/game.js` at 8982 lines. This slice must leave it at or below that; a new module is the answer to any
  growth, never a raise. Verify with `node tools/check/ratchets.mjs` (read-only form).
- Tests: a reel-score unit test (table scoring, clustering, repass suppression, last-two-laps context), a reel-planner unit test
  (budget 30-60 s for 3..40 candidates, diversity cap, finish last, determinism by seed, empty and one-event races), a clip-vault unit test
  (slice copy, score-ordered eviction, byte cap, solo-only gate), plus an event-journal VM test in the style of `tests/unit/results-cam.test.mjs`.
  Register in `tests/groups.json`, add the `docs/TESTING.md` section 5 rows, `npm run gen`.
- Verification (AGENTS.md ladder): `node tools/ci/pick-tests.mjs`, make all edits, `node tools/ci/tooling-fast.mjs --jobs=3`, the new unit files plus
  `tests/unit/replay-buf.test.mjs` and `tests/unit/results-cam.test.mjs`, then ONE browser spec at most: a results-screen spec that runs a short race,
  presses REEL and asserts via `__apex` hooks (clip count, phase, no NaN poses). Replay-camera offline contract for the clip seams (`node
  tools/check/skill-smoke.mjs --skill replay-camera --check`). `node tools/ci/deploy.mjs --gate-only` before the push; name unrun browser groups in
  the PR.

### Slice 2 - export, offline WebCodecs + fallback (L)
- New: `js/<new>/export/clip-encoder.js`, `js/<new>/export/clip-audio.js`; vendored muxer directory under `vendor/` with LICENSE and a short PATCHES-style note,
  plus `tools/` build script and a licence line in the same style; `sw.js` lazy precache entry; `tools/manifest.cjs`.
- Edited: `js/render/gfx.js` and the backends only if the export-size target needs a resize hook (rules in `.claude/rules/render-wgx.md` and
  `.claude/rules/render-tlx.md` apply; software probes are not evidence about a player's GPU, so dispatch `gpu-census.yml` on `macos-latest` and read
  the Verdict).
- Tests: unit tests of the encoder interface against a fake `VideoEncoder` and fake muxer (frame count, timestamps monotone, backpressure, cancel
  frees buffers, `probe()` ordering, Spotify/MusicLib yield no music node); a feature-detect spec that asserts the EXPORT button hides when
  `VideoEncoder` and `MediaRecorder` are both absent. SwiftShader in this container proves nothing about encoder speed or hardware H.264.
- Verification: unit files + `tooling-fast`; ONE browser spec (feature-detect and UI state only, with `isConfigSupported` stubbed); real encoding is
  the manual device checklist below, recorded in the PR body as Verified / Not run.
- Exit: a saved file plays in QuickTime/VLC and the Photos app on the matrix below.

### Slice 3 - share polish (S)
- New: `js/<new>/export/clip-share.js` (share-or-download, progress, cancel, filename), watermark and card styling, export sheet copy (what is in the file,
  why no music), a re-roll seed button.
- Tests: share fallback unit tests (canShare false, AbortError, NotAllowedError then download), filename sanitiser. Verification: unit files +
  `tooling-fast`; share items on the device checklist.

### Manual device checklist (encoding cannot run in CI)
Pixel/Galaxy (Chrome), iPhone (Safari 17 and 26), desktop Chrome, Firefox 130+ desktop, Firefox Android (expect the fallback or a hidden button). Per
device: export completes, duration within 1 s of plan, audio present or deliberately absent, watermark visible, file opens in the OS player, share
sheet offers it, no tab kill (`apex26.crashStrikes`).

## Risks

1. iOS memory/tab kills (HIGH): a second render target, encoder surfaces and a RAM-buffered file on top of a 160 MB heap
   (`docs/plans/2026-10-03-perf-memory.md` measured it). Mitigation: 480p on low tier, StreamTarget when available, a size cap, export refused after a
   crash strike, no export while a race is live.
2. Encode support is uneven (HIGH): Safari 16.4-18.x is "partial", Firefox Android has no VideoEncoder, hardware H.264 profiles differ. Mitigation:
   `isConfigSupported` probing per config, fallback ladder, export hidden not broken, and the Open question on a vendored software encoder (not
   planned).
3. Music licensing and platform audio (HIGH for trust): CREDITS.txt does not say CC0; Spotify and speech cannot and must not be captured. Mitigation:
   music off by default in files, the tap built from the engine graph only, a tested guard.

4. Replay and resize risks (MEDIUM): poses only (no smoke, skid or damage replay) and a render-target resize across TLX/GLX/WGX that could leave the
   live canvas mis-sized. Mitigation: fast cuts, restore in `finally`, backend-parity test, `gpu-census.yml` for WebGPU.

## Open questions for the owner

1. May the six `assets/music/` tracks (CREDITS.txt: "provided by the project owner") be mixed into shared videos? If not, ship without music or add a
   CC0 stinger set; the briefing's "CC0 playlist" does not match CREDITS.txt.
2. Is mp4 mandatory for sharing (most social apps) even if it means shipping the MediaRecorder fallback only on iOS where WebCodecs is partial?
3. Should phones run the REEL at all? `ResultsCam.enabled()` is off on mobile and at `PerfGov.tier() >= 2`; this plan assumes reel playback is allowed
   and only export is gated.
4. Accept one vendored dependency under MPL-2.0 (Mediabunny), or prefer the zero-dependency MediaRecorder-only route and give up offline encoding?

## Effort

Slice 1 M (about 5 new modules, ~600 lines of code, ~400 of tests), slice 2 L (encoder, audio, vendoring, backend resize proof, device passes), slice
3 S. Whole feature: L. Slice 1 is useful and shippable on its own.

