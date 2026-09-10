# Apex 26 — defect ledger

> Carved out of `ARCHITECTURE-REVIEW.md` §7-8 on 2026-09-03 (tree
> restructure Phase 5). The standing assessment — the founding bet, the physics
> authority, the `G` façade, the renderer seam, the lessons — stays there; this
> file is the register of what is still open and what is queued behind it.
> Everything already fixed is in [`../archive/2026-08-architecture-review-journal.md`](../archive/2026-08-architecture-review-journal.md).

## 7. Open defects

Verified against the current tree. Everything fixed has moved to the archived
journal; this is what remains.

**2026-09-10 — whole-tree audit, six slices, FIXED in one pass.** Seven
read-only agents audited the tree (game/physics, renderers, track engine and
all 80 circuit files, UI/data/PWA, multiplayer and the worker, tooling/CI, and
outside research on the vendored packages); six implementation agents then
fixed their slice under file ownership, and the integrator registered the new
modules, ran the guards and the no-browser suite, and named the unverified
groups. Everything below is code-read confirmed and unit-tested where a Node
harness exists; the browser groups and every real-GPU claim are listed as
unverified in the commit.

*Game loop / physics (`js/game.js`, `js/physics/*`, `js/race/*`).* Red-flag
restart kept `c.lap` while re-gridding 14 m before the line, so a car on its
last lap finished on the restart; it also zeroed every heading including the
player's (`seedPlayerPose()` now derives it from the grid tangent, shared with
`gridUp`). `player.px[0]` on a scalar made the lamp-shadow key always 0 and
froze the player's floodlight shadow. A caution only lowered `vmax`, so the
field was still rolling at a red-flag restart (real brake fraction under
level ≥ 2). AI `towing` never cleared and the human never paid dirty air in a
corner: the positions-only `wake` grip penalty is now separate from the
driver-gated tow benefit. The standing quali lap started at the P1 slot with
~1.7 s of untimed run-up. Closing-speed literals in the AI bands are pace-
scaled. Lapped cars are flagged at their next crossing once the leader has
finished (`RaceControl.flagOut/finishOrder`; the results sheet says `+N LAP`).
`gridUp` with a null player spliced the last car out. The collision resolver
is `js/physics/collide.js` (`Collide.create(G, collideFx)`); game.js is 305
lines lighter. `tests/unit/red-flag-vm.test.mjs` pins the restart.

*Renderers (`js/render/**`, `js/lighting/*`, `js/perf/*`).* One light budget
(`LightBudget`) replaces four restated constants, so TLX-lite's 16-slot cap
no longer drops the tail-lights the cull appended last; GLX now copies
`frame.roadChunkLamps` so per-chunk road lamps work on the default renderer;
WGX env-probe faces were vertically mirrored (fixed blind — needs the real-GPU
census); WGX alpha-write masking, env-face/shadow encoder ordering, retired
textures, the TLX mirror-release gate and car-pass cull VP, instanced VAO
cache invalidation, the pipeline-key bias packing, `hdrMode` on lite rungs,
and `quality-preset`'s unguarded store read. `PostCommon` holds the lens-dirt
canvas, keep-nearest, HDR-grade test, sun-screen gate and knob defaults for
all three post chains; `Frustum.bucketInstances` replaces three instance
bucketers.

*Track engine and circuits.* `verify-track.cjs` printed OK while stubbing
every console method; it now reports suppressed/invalid/unsafe counts and the
unique warnings (`--quiet` restores silence). `dressingExcluded` windows
skipped the `_sceneryShift`/side transform (Monaco's data converted, Singapore
now transformed). Qatar's verges were two-thirds footprint-rejected, Baku's
kit fired the swapped-dimensions warning 13× per boot, Imola's ground read was
half a lap away, four circuits emitted-then-culled up to 295 backdrops per
build. `api.K` and `api.lapBounds()` replace 37 local `K` helpers and 30
centroid loops; `bakedModels` left the contract (112 members). Madrid, Estoril
and Indianapolis carried wrong `lengthKm` (Madrid raced 56 laps instead of 57).

*UI / PWA / data / storage.* The service worker returned a browser error page
for any navigation that lost a 3 s race while online; a primitive ghost blob
made every later ghost save throw; Spotify's token refresh had no timeout;
save-migrate never coerced `deal`, `budgetLvl`, result rows or per-round
scores; `lastRace()` was empty until the season opener; asset fetches never
checked `r.ok`; non-passive touch listeners; `user-scalable=no`; HUD flag and
canvases without ARIA. `Dom.el/paintFold/fmtLap` replace five copies.
`navigator.storage.persist()` is requested, and `GameStore` mirrors career and
season keys into IndexedDB with a boot restore (`persistState().mirror`).

*Multiplayer.* A peer's quali time was never coerced (a string reached
`toFixed`); peer parts skipped the budget check; the handshake reported the
server's build, not the running shell's; a sub-step X left the camera live;
the worker allocated a Durable Object before its 405; a malformed ICE entry
bricked WebRTC for 55 min; `makeAnswer` had no re-entry guard; the room-code
envelope is v2 (random salt, slot AAD), plaintext relay envelopes are refused,
HELLO/READY are rate-limited, `predict()` shares `poseRemote`'s clamp, PONGs
match a sent id, code generation has no modulo bias, `BarcodeDetector` is
preferred over jsQR when present. The legacy Trystero room branch (340 lines)
is gone and the vendor is 0.25.4 (relay backoff, pruned relays). `NetBytes` is
the one byte-codec home.

*Tooling / tests / CI.* Eight unit suites (five garage, three steering) ran in
no gate; two of them were red at HEAD (Alpine cover designs at 0–3 %
visibility, Aston's flank crest, and the `noPlate` class on Ferrari/Red Bull
flanks) and are fixed in the paint code, thresholds untouched. Playwright is
one exact version with the browser path derived from `browsers.json`; sharp
carries the libheif fix; a `waitForTimeout` ratchet exists; test-bg's registry
write is atomic and its sweep regex knows the current layouts; ci.yml's inert
`smoke` input, over-wide sweep trigger and stale caps are fixed; nine dead
tools, `test-shards.sh`, four redundant groups and eight scripts are gone.
Every freezable module surface now ends with `Object.freeze`
(`tests/unit/frozen-globals.test.mjs`). The first push froze eight TEST
SEAMS with it — `NetTransport` (net-authority injects `prefetchIce`),
`AiDrive`, `Car3D`, `F1API`, `GLTF`, `GameAudio`, `Input`, `LampChunks` — and
each monkeypatch became a silent sloppy-mode no-op: CI's net-unit lost eight
LOBBY subtests and `physics-hotpath` measured 180 unwrapped steps. Those eight
are back in `mutable` with the seam named; the registry's `_doc` carries the
alias-aware scan to run before freezing anything else. The same push also
made the corrected `dressingExclusions` transform land Singapore's side-1
0.78–0.90 window for the first time, which removed the generic buildings the
Helix Bridge had been standing on (5 floating clusters); the bridge now has
four piers to the rendered ground.

*Already red on the deploy tip's nightly, not this branch's:* `ci.yml`'s
renderer-macos job (real Metal) failed on 2026-09-09 (run 34327512922, tip
0c0c4d9) with `tlx-probes` M6 (skid batch never records — 60 s timeout),
`lighting-ab` "night light budget" (`floodEmit` 0.0858 against the 0.78 the
spec pins for a desert night) and `lighting-ab` "night fog GLOWS" (fog band
63.6 against a > 84 floor); the 09-06 and 09-07 nightlies were green, so a
deploy-branch change between them owns all three. The two lighting-ab
failures reproduce on llvmpipe here (60.3 vs > 71.9; 0.0858), so they are
not GPU-specific. Nobody reads the nightly: the deploy's own gate is
change-aware and never runs this job.

The same job on the audit commit (run 34459030214, with diagnostics) added
three more reds — `tlx-probes` M8 (post chain reports off), M9 (env probe
never begins) and `image-grade-visual` "blacks" (captures of 448×252 then
512×288, so the render scale climbed mid-test) — and the pre-audit base
(852764c, run 34460549586) fails the same set: M8, M6, M9, an image-grade
NaN (there "shadows", the sibling test; the resize lands on whichever test
is running) and the two lighting-ab tests. So none of the six is the
audit's: the deploy-branch commits merged at 9cdde03 own them. M9 is
f9c25e5 (TLX opts out of the env probe unless `apex26.tlxEnvProbe` is
"1"; the spec now opts in, 8d805fe). M8 and the capture resize are the
governor shedding on the Metal runner (bloom is zeroed at autoTier ≥ 4,
auto-res steps the scale) plus `cfdafc6` "initialize renderer extras on
demand" — candidates, not proven: the runner's own frame time is the
input, and the base run's "FLAKY: 1 passed only on retry" says the same
box is noisy. Left to the deploy branch's owners.

With the governor attached to the failure messages (run 34462442429):
the image-grade NaN is auto-res — `scale 0.8, tier 0, autoTier 0, fps
31.8, floorMs 18.5, open window 558 frames / 134 slow / max 4366 ms` — the
Metal runner's boot stalls (shader compiles up to 4.4 s a frame) make the
governor step the render scale down inside the test, so the two captures
differ in size; no tier is shed. M8 fails on the bloom block with the tier
at 0, so it is not the autoTier ≥ 4 zeroing; the next Metal run carries
the diagnostics on that assertion too. M9 passes since 8d805fe. The
census (run 94, `apex26.tlxEnvProbe=1`, force=env) shows the TLX env
probe running on hardware — begins 12, ends 12, ready, envFail 0,
gpuErrors 0 — and the WGX leg rendering 233 frames with gpuErrors 0; the
census does not expose WGX envState, so the WGX env-face ordering is
exercised clean on Metal, not seen. "Fixed blind" stands for the pixels.

*Left open, with the approach recorded in the session plan:* the car-draw and
shadow-pass extractions (eval-order coupling), the `tests/` guards/vm split
(45 files cited by path from circuits and docs), the lobby/netplay roster fold
(two different ownership predicates), three.js r186 and Rapier 0.20 (real-GPU
census and debris re-tuning), the WGX env-probe confirmation, the physics
re-baseline, and Singapore's night prop budget spec.

**2026-09-09 — a mark painted in the colour it stands on, on 59 of 69
liveries. FIXED** — and the fourth case of two sessions on one defect.
`markPalette()` resolved a mark against the plate it would sit on, but two call
sites draw the mark WITHOUT its backing and deleted the plate afterwards, so the
colour was chosen to read on a shield that was then thrown away. Measured:
Ferrari's `bigmark` horse came out `rgb(242,245,250)` on a `#f2f5fa` cover —
**1.00:1, the cover's own colour**. The fix is `opts.noPlate`, resolving
plate-less at the call site instead of deleting the field after the fact;
`bare` is NOT this flag and cannot stand in for it, because `crestKeepsPlate`
keeps the shield through `bare: true` on exactly the marks that have one.

*The misreading is the reusable part.* This side measured the same defect from
the other end — an offline sweep scoring painted area per design — and got
`bigmark` at 20,960 px on McLaren and **0 px** on Ferrari and Red Bull, then
logged it as "nothing-drawn vs drawn-invisibly, undetermined" and moved on. The
metric scored contrast against the field, so a mark painted in the field's own
colour is indistinguishable from one never drawn: the zero meant INVISIBLE, not
ABSENT, and that sweep could not tell the two apart at all. The measurement was
sound; the interpretation attached to a zero was not — a metric that collapses
two states cannot arbitrate between them, and the honest next step was a second
instrument, not a note. `livery-contrast.mjs --team=ferrari` reports 0
large-area failures below 2:1 on the merged tree.

**2026-09-08 — three.js lost half the trackside scenery, and nothing could see
it. FIXED**, but the shape is worth keeping. A player reported missing scenery
on three.js; GLX was fine. Reproduced on real Apple hardware via `gpu-census`
on macos-latest (`anyHardware: true`, `softAdapter: false`, `gpuErrors: 0`):
GLX drew the barrier wall and debris fence, both three legs drew bare grass.
Root cause in `ARCHITECTURE.md` §Parity snapshot — the node-program cache key
dropped an instanced object's identity, and three compiles the instance-matrix
source buffer into the node graph, so 28 prop batches shared one program bound
to the first batch's transforms.

*Why every instrument read clean*, which is the reusable part: `gpuErrors 0`;
the cull agreed with GLX instance for instance (1060 / 35,672 verts at one
camera); `imesh.count`, `visible`, `parent`, `material` and the resident
`instanceMatrix` were all correct. The DATA was never wrong — the program it
was bound to was. Ruled out along the way, each with a same-camera A/B: the
ranged `instanceMatrix` upload (0 px change), the 1024-instance
uniform-buffer threshold (a synthetic cap-3000 InstancedMesh renders fine),
the geometry shared with tlx-shadow's caster pool, and the geometry itself (a
plain `Mesh` of it draws). What isolated it was adding `|obj<id>` to the key
before the track built: 24.8% of pixels move and the furniture returns.

*Why it cost so much*: `graph.js` skips the FUSE for a batched node, so there
is no soup copy behind a dropped batch — **48.2% of all prop geometry across
the roster is instanced-only** (79.6% Vegas, 77.9% Nürburgring, 74.2%
Hockenheim, 72.2% Spa). DebrisWorld's per-body fallback cannot see a skip
either: it feature-detects on the NAME, which is present and no-ops.

**2026-09-08 — every glass pane shipped twice. FIXED.** `scenery/city.js`
routes unlit window panes to `glassBuf`, and `tracks.js` only sets
`_preferInstance` on the default props buffer — so `replay()` wrote those panes
into the GLASS MESH and the same placements came back from `graph.batches()` as
an instanced unit-box batch that `tracks.js` uploaded on top, with the props
material, at the same depth. 56,048 instances / 1,345,152 verts roster-wide
(Vegas 22,127, Baku 12,613, Jeddah 11,617, Singapore 7,895); on ten circuits
the duplicate is the glass mesh vertex for vertex. `batches()` plain stays a
CAPABILITY report (six unit tests and `graph-parity.cjs` depend on that); the
fix is `batches({instancedOnly:true})` at the one caller that uploads. Visually
invisible — co-planar — so it was pure cost: a same-camera A/B on jeddah moves
0.03% of pixels.

**2026-09-08 — a re-grid inherited the last race's per-car scratch. FIXED,
TWICE, by two sessions in parallel — and the duplication is the lesson.**
`agent-determinism.spec.js` went red on the deploy branch (Pages 2095,
`14a1789e`). Three `run(42)` episodes in ONE page, and run 0 disagreed with runs
1 and 2, which agreed with each other. That first-run-only shape is the tell:
the first episode CREATES per-car scratch that no re-grid restores, so every
later episode starts warm.

The fix that matters is in `apex.js` `reset()`, from the session that owned the
lateral controller that broke it (`1ad520c5`, `9375f1ce`, `c5a9dd87`): the
clearing block now also deletes the fields **one car reads off ANOTHER** —
`_vmaxNow` (the blocker's pace `AiDrive.otWant` turns a pass on), `accSm`, and
`towing` — plus the controller's own `aiHead`/`aiBias`/`aiFam`. Those are
written every frame but READ on the first frame before their owner has been
updated, so a cold session sees `undefined` and falls back where a replayed one
sees the last episode's value. `lane` is the odd one out and re-seeds from
`lanePref` rather than being deleted, because it is already adapted before the
first episode rather than absent.

This side reached the same place independently and kept only the half that one
does not cover: `gridUp()` and `redFlagRestart()` clear `accSm` and restore
`lane` too, because a REAL PLAYER never calls `__apex.reset()`. Starting a
second race from the results screen, and a red-flag standing restart, both
re-grid through those paths, and a car sitting on a grid box is pulling nothing.
Neither clear draws `simRnd`, so the grid's draw-count contract holds.

*The duplication is worth recording.* Two sessions spent a working day each on
one defect, and both arrived by the same route — dump every primitive on all 22
cars at the start of three episodes, diff, and the leak names itself. Neither
reasoned it out; three code-read hypotheses were tried and measured wrong on
this side alone (the Red Bull livery commit, a lazily-built cache, the seeded
stream's draw count). **The measurement is cheap and the reasoning is not: on a
determinism break, dump and diff FIRST** — `node tools/check/episode-diff.mjs` is that procedure, and it names the field in about five seconds. A VM twin of the browser guard landed
with the other side's fix (`determinism-replay-vm.test.mjs`, in `test:game-vm`),
so this is now caught without a browser group; a second twin written here was
dropped on the merge rather than shipped beside it, which is the same
drifted-twin trap `2987dee4` added a guard for.

*Consolidated 2026-09-09.* Both fixes shipped and layered, leaving `reset()`
with THREE mechanisms for one defect: seven fields zeroed, an inline 19-field
delete list, and `EPISODE_TRANSIENTS` (25 fields) deleted last. The first two
were dead. Set-difference proves it — the inline list is a strict subset of
`EPISODE_TRANSIENTS`, all seven zeroed fields are in it too, and nothing between
them reads a car field, so the final loop already did their work and six fields
more (`contactT`, `kerbHapT`, `kerbSndT`, `offroad`, `towing`, `wheelLock`).
Worse than redundant: `c.accSm = 0` reads as "0 after reset" when the effective
value is `undefined`, which is the exact zero-versus-absent distinction this
entry turns on. Now one list, −16 lines, with `episode-diff.mjs` reporting the
same clean digest before and after.

**2026-08-18 cleanup sweep** tagged removals, false-positive dead exports, and
the next intended `game.js` extractions in
[`../archive/research/CLEANUP-SWEEP-2026-08-18.md`](../archive/research/CLEANUP-SWEEP-2026-08-18.md).

**2026-08-17 parallel survey** (provenance; several items absorbed): see
[`../archive/research/SURVEY-BUGS-PERF-2026-08-17.md`](../archive/research/SURVEY-BUGS-PERF-2026-08-17.md).
Career `trackIdx = -1`, VSC/SC player pace, net `predict()`, and Singapore
`lapMirror` portal remaps have landed in code. Remaining survey leftovers live
on the 08-18 perf-hunt board, not this register.

- **`Invalid CommandEncoder` on the owner's PHONE — almost certainly the
  documented BENIGN TRANSIENT, not a defect (2026-09-08).** The same screenshot
  that raised it answers it, and the answer was in `tlx.js` all along.
  `err 1` with `heal —` means ONE error in ONE present, and the heal's own
  threshold is `HEAL_MIN_FRAMES = 2` distinct presents *because*: "a healthy tab
  can raise exactly one transient (resize race, texture freed on a track
  switch, the capture path). Healing on `> 0` reloaded the second case." The
  heal is designed not to fire here, and it did not. The HUD also reads
  `LAP 1/3 TIME 0:03.60` — three and a half seconds in, which is when a
  warm-up transient (first pipeline creation, a texture upload) lands.

  **What would make it real, and neither is shown:** `err` climbing while
  driving, or `heal yes`. A single boot-time error on an otherwise healthy
  51 fps frame is the case this machinery exists to ignore. NO ACTION TAKEN on
  the renderer, and none appears warranted.

  The A/B below stays because it is opt-in and costs nothing, and because the
  reading above is a strong inference rather than a proof — if `err` is ever
  seen climbing, the suspect is already switchable in a reload.
  Reported from a real device, three/webgpu at Spa: `fps 51.4 / frame 19.5 ms`,
  `gfx: three/webgpu err 1 strikes 0 scale 0.75`, `gpu: Invalid
  CommandEncoder`, `tlx: blit —` (native present, no readback), `dc 559`. The
  world renders — trees, grandstands, the car — so the encoder recovered.

  **This is the only player-facing evidence in this file.** Every census leg
  has reported `gpuErrors 0`; this is the first error from the path a player
  actually takes, and it arrived by screenshot rather than by any instrument
  the project owns. It also, incidentally, settles the entry below it: 51.4 fps
  on the device against 4.9 in the census is the soft-blit gap, measured.

  **The code already describes this failure and assumes hardware is immune.**
  `tlx.js drawInstanced`: "Dawn bind[s] a 16-vertex vec3 as instance-rate …
  One failed draw invalidates the whole encoder … Skip the instanced scenery on
  that path; **real GPUs keep the batches**." `skipBatches()` gates on
  `_softAdapter && isWebGPU()`. But Dawn is Dawn on a phone too, and the
  assumption is now in doubt.

  **NOT fixed, and on the reading above probably nothing to fix.** Widening the gate to all WebGPU would shed
  48 % of all prop geometry (79.6 % Vegas, 77.9 % Nurburgring) from every real
  GPU to chase one recovered error. Instead `apex26.tlxSkipBatches=1` reverts
  the single suspect on the single device that has it, in a reload — the same
  idiom as `tlxForceHw` for the software side. `backendState()` now also
  reports `skipBatches` (the live verdict, not the inputs) and `gpuErrFrames`
  (DISTINCT presents an error landed in), which is what separates one bad frame
  at boot from every frame — `err 1` alone cannot.

  **Next, on the device:** set `apex26.tlxSkipBatches="1"`, reload, drive the
  same corner. Error gone → the instanced batches are the cause and the fix is
  a narrow one (the attribute layout, not the gate). Error stays → batches are
  exonerated and the next suspect is free. Either way `gpuErrFrames` says
  whether it is a boot one-off or per-frame, which decides whether it matters
  at all.

- **The deploy branch's three.js/WebGPU leg rendered a near-black frame on real
  Apple hardware — NOT REPRODUCING on the current head; handed over
  (2026-09-08).** Run 61 on `9b94175` reads `meanLuma` **44.6**, back in the
  43.9-48.4 family, so whatever `b53b022`/`9b94175` carried fixed it or it is
  intermittent. Two runs on `d4cd570` read 2.6 and that measurement stands;
  what does not stand is calling it live. Anyone reading this for a repro
  should start from `d4cd570`, not from the tip.

  **What run 61 did give is the diagnosis, out of that session's own new
  instrumentation** (`b48603b`, which added `begins`/`ends`/`mask` to
  `envState()`): the WebGPU leg reports `begins=3 ends=3 mask=7 ready=false`
  against the WebGL2 leg's `begins=674 ends=674 mask=3 ready=true`.
  `begins === ends` on both, so no face is lost between `envFaceBegin` and
  `envFaceEnd` — the producer is simply never CALLED again after three faces,
  which is neither of the two causes that commit's comment set out to
  separate ("faces lost in between" or "something clearing the mask"). The
  probe stops being driven. That is where to look.

  **Traced further (2026-09-08, same day).** The producer is not the problem
  and neither is `tlx.js`. `begins === ends` on both legs, so every
  `envFaceBegin` was matched by an `envFaceEnd` and each call completed; the
  WebGPU leg was simply ASKED three times in a ~35 s run that offers roughly
  forty opportunities. So the gate that stopped calling it is in `game.js`:

      player && !_envProbeOff && PerfGov.tier() < 1 && !paused && !dbgCam &&
      (frozen || (_frameNo & 3) === 0) && gfx.envFaceBegin &&
      LT.carEnvCube > 0.001 && !hideMeshes.cars

  `_envProbeOff` is only ever set from localStorage, so it is not that. The
  live term is **`PerfGov.tier() < 1`** — rung 1 of the governor's feature
  ladder IS "env probe off" — and `js/perf/governor.js`'s own header records
  the asymmetry that makes this bite one backend and not the other:

  > 1284, 25 s per backend: WebGL2 sat at scale 0.80 / tier 0 / 23 fps, while
  > WebGPU and three.js — where the scale lever did bite — reached tier 2

  Three faces is twelve frames at the every-fourth-frame throttle, ~2.4 s at
  the measured 4.9 fps: the probe runs briefly, the governor sheds it, and
  recovery is deliberately slow — "features come back only at full res under
  the same sustained headroom, one per ~4 s". A leg that sheds early may never
  get the six consecutive opportunities the cube needs inside a 35 s check.
  **The tier hypothesis is FALSIFIED — I tested my own inference and it is
  wrong (2026-09-08, an hour after writing it).** `gpu-game-check --backend
  three` in this container resolves to the SAME leg (`path: webgpu`, `engine:
  three.js r185 webgpu`) and reports `begins=896 ends=896 ready=true mask=3`
  with `tier=0 autoTier=0 scale=1` — on a box whose own governor recorded a
  6.7-SECOND worst frame. Slowness does not starve the probe, the governor
  never left rung 0 to shed it, and the cube latched. It also kills the
  broader reading I was one step from adopting: this backend is not inherently
  unable to drive the probe, because here it drives it 896 times. Whatever
  closes the gate is specific to the macOS runner, not to three-on-WebGPU.

  `tier=0` on both census legs was the reading that made the shed-and-recover
  story attractive; the local run shows tier 0 is simply where this leg sits.

  **ROOT CAUSE, from the census ARTIFACT rather than the summary (2026-09-08).**
  The verdict step prints `fps` and `floorMs` but not the frame COUNT, which is
  the number that settles this. Downloading run 61's artifact:

  | leg | `open.frames` | worst frame | elapsed | `begins` | `ready` |
  |---|---|---|---|---|---|
  | three → WebGL2 | **600** | 16.7 s | 49.7 s | 674 | true |
  | three → WebGPU | **5** | **11.4 s** | 39.1 s | 3 | false |

  **The WebGPU leg rendered FIVE frames in thirty-nine seconds**, one of them
  taking 11.4 s. There is no env-probe defect: six cube faces cannot be baked
  by a renderer that produces five frames. `begins=3` is the correct and
  expected behaviour of a healthy producer on a leg that barely runs, and every
  reading downstream of it — `ready=false`, the missing image-based ambient,
  the darker `meanLuma` — is a symptom of the frame count and nothing else.

  It also retro-explains the 2.6 / 44.6 / 66.7 luma spread that opened this
  entry: that is how many frames landed before the capture, not three different
  rendering faults.

  **The 600-vs-5 comparison is INVALID, and `docs/notes/PERF-FINDINGS.md`
  already says so in capitals: THE HARNESS RUNS THE TWO LEGS ON DIFFERENT
  PRESENT PATHS.** `tlx.js:235` — `_softBlit = !forceWebGL && _capPref !== "0"
  && (_softAdapter || _headless || _capPref === "1")`, with `_headless` =
  `/HeadlessChrome/i.test(ua)`. The census's WebGPU leg sets
  `apex26.tlxForceGL = "0"`, so under Playwright it SOFT-BLITS: a GPU readback
  plus `putImageData` every frame. The WebGL2 leg sets `"1"`, short-circuiting
  `_softBlit` to false. So 600 vs 5 is a readback path against a direct one,
  not one backend against another, and an 11.4-second frame is what a readback
  of a large target on a busy shared runner costs.

  **NOTHING IN THIS ENTRY IS EVIDENCE ABOUT A PLAYER.** On a Mac in a headed
  browser `_headless` is false and `_softAdapter` is false, so `_softBlit` is
  false and the native swapchain is used. Only a HEADED hardware run says
  anything about that path — the same caveat the WGX leg's `softPresent=true /
  headlessUa=true` line has carried all along, which I read past twice today.

  So the open question is narrower and far less alarming: **is the soft-blit
  readback so expensive on these runners that the census's WebGPU legs measure
  the HARNESS rather than the game?** If so the fix belongs to the census, not
  to `tlx.js`. A compile storm remains a candidate for part of it (`tlx.js`
  carries that note, and 593 programs at ~60 s on Monza is recorded there), but
  soft-blit is the larger and better-evidenced term and must be excluded first.
  NO PLAYER-FACING DEFECT HAS BEEN DEMONSTRATED anywhere in this entry.

  Superseded above: everything about the `game.js` gate. The gate is fine; it
  was asked three times because there were five frames to ask on. I spent two
  rounds on the callee and one on the caller before reading the frame count,
  which was in the artifact the whole time.

  For whoever picks this up: the cheap next measurement is to record WHICH
  term of the gate was false on the frames the probe did not run, not to add
  more counters inside `tlx.js`. The instrument there is already sufficient
  and has done its job — it is `game.js` that is silent.

  The original measurement follows.

- **(the d4cd570 measurement)** `gpu-census` on
  `claude/f1-game-project-26h3ng` at `d4cd570`, `macos-latest`, montreal:
  `meanLuma` **2.6** on the TLX/WebGPU leg while the other three legs of the
  SAME run are normal (webgl2 67, glx 73.8, wgx 79.3). Reproduced twice —
  runs 59 and 60. My own branch at `37627cc`, same image and track, reads 46.7
  on that leg, and the historical family is 43.9 / 46.7 / 48.4.

  **The documented confound does not explain it.** `docs/notes/PERF-FINDINGS.md`
  records a known non-defect where TLX/WebGPU renders darker because
  `envReady=false` leaves it with no image-based ambient, and the census
  workflow's own comments warn that a `meanLuma` comparison is only a
  comparison when both legs ran the same content (`tier` decides whether the
  env probe is live). Run 59 fit that shape (`envReady=false`, `tier=1`,
  `envFace=0`) and I retracted the finding on it. **Run 60 does not**:
  `envReady=true`, `envBlank=false`, `tier=0`, `envFace=2` — the same state as
  the 43.9–48.4 family — and still 2.6. So the retraction was wrong and the
  finding stands.

  **Where it is NOT.** `js/render/` is byte-identical between `f342eca` (my
  branch, 46.7) and the deploy tip (2.6), so no renderer change causes this.
  The delta is `js/perf/renderer-picker.js` (a new touch-device default for
  the stored backend), `js/car/car-mesh.js`, `js/car/car3d.js`,
  `js/car/liverytex.js`, `js/game.js`, `js/input/steer-tuning.js` and
  `js/ui/settings-export.js` — work from `claude/rendering-bugs-optimizations-3pstxj`
  and two other sessions. NOT investigated further and NOT touched: it is
  another session's in-flight work, and editing someone else's branch on a
  hunch is how two sessions end up fighting over one file.

  **The gate cannot see it, deliberately.** The census verdict fails on
  `gpuErrors`, `softAdapter` and `envFail`, never on appearance; the workflow
  argues a brightness floor "goes flaky and then gets widened to pass, which
  AGENTS.md forbids outright". That reasoning is sound and this entry is not a
  request to overturn it — but it does mean a black frame ships green, and the
  only thing standing between that and a player is somebody reading the
  summary. Worth a decision from the owner, not a unilateral threshold.

- **`aero-zones` "X-mode buys X_VMAX_GAIN of vmax" — NOT A DEFECT. The entry
  that stood here was mine and it was wrong (retracted 2026-09-08).** It
  recorded the spec as RED on three trees at ratios 1.1023 / 1.1023 / 1.0880
  against an expected 1.0957, measured through a scratch harness
  (`scratch/xmode.mjs`, since deleted). The spec is GREEN: 1/1 alone, and
  14/14 with the whole file in order, on the tip. Reproducing it in
  `tools/lib/game-vm.cjs` with the spec's OWN preconditions gives 1.09574
  against 1.09570 — inside the 3-decimal tolerance, no patch needed.

  The lesson is the entry, not the physics. `7212e79` (another session, the
  same morning) had already fixed the real cause: the human car tows since
  2026-09-03, so a rival inside the 34 m window in one sample and not the
  other moved `vmaxNow` by the slipstream rather than the flap. The spec now
  sends the field 800 m back and asserts `towing === 0` in both samples. My
  harness did not do either, so it measured the tow and I wrote the number
  down as a defect in the code. **A harness that does not reproduce a spec's
  preconditions is not evidence about that spec** — and inflation (1.1023 >
  1.0957) was the tell, since a car gaining MORE than the flap earns is a
  car getting something extra, not a broken multiplier.
- **TLX: every road decal (driving line, blob shadow, tyre mark, skid) was
  buried under the road — FIXED (2026-09-08).** `tsl-fx.js` `fxMaterial`
  copied GLX's `polygonOffset(-4,-8)`, but three honours the road's own
  `depthBias [-8,-16]` (game.js `_wmRoad*`) on both of its backends while
  GLX draws the road unbiased, so the decals failed the depth test on real
  hardware (gpu-census 48: chevrons on GLX and WGX, none on TLX, `gpuErrors
  0`) and on lavapipe. Now `-12/-24` — the road's bias plus GLX's margin;
  `tests/unit/gfx-backend-canary.test.mjs` pins the fx offset beyond the
  road's. Lesson: a submitted draw with zero GPU errors is not a drawn
  pixel; `backendState.line` reports the pooled mesh, the census reads the
  frame.
- **Montreal: a bridge support floats 2.72 m off the ground — FIXED in
  engine + circuit.** `foundation()` now falls back to `Tracks.terrainY` when
  the build-time 30 m triangle grid misses a `flatTerrain` shelf, and the
  casino footbridge opts out of `overheadSpan`'s auto-legs (`supports: false`)
  so the custom piers are the only feet. Browser spec not re-run in this
  session (load).
- **`hud-layout` `notched-landscape` — FIXED.** `#hud-sectors` top is
  `calc((8px + var(--tap) + 4px + var(--sat)) / var(--hud-z))` in
  `css/hud.css` (the old hard-coded 56 was desktop-`--tap` only and overlapped
  `#pausebtn` by 4 px on touch). The short-landscape override that pulled it
  UP to 52 is gone. Diagnosis that still applies: never pin HUD chrome to a
  pixel constant when a sibling is sized from `--tap`; convert the unscaled
  sum into the zoomed element's units (`--hud-z`) or the pair drifts at
  non-default HUD SIZE. Portrait `.hud-top`/`#pausebtn` overlap stays
  excluded — it sits behind `#rotate-device`.
- **`menu-keyboard` › "left/right move along a chip row without leaving it" is
  red** (`tests/specs/menu-keyboard.spec.js`, the desktop keyboard/trackpad
  block). Confirmed PRE-EXISTING at `d7a1158` by a quiet-box A/B, both sides via
  `tools/ci/test-solo.mjs` and both started at load 1.24: `HEAD` fails in 20.6 s,
  base fails in 18.4 s. No timeout on either side, so it is an assertion, not
  contention. This is the SECOND red test in this file — the `#track-detail`
  dialog regression above owns "Tab cannot escape the track-detail dialog" — so
  the file is worth one pass rather than two separate fixes. It is the only
  failure in `test:ui`, which otherwise runs 100/100.
- **`props-over-road` on COTA and Indianapolis — geometry fix landed;
  browser re-measure not run in this session.** COTA's amphitheater now emits
  from its declared origin (the 8 m declared-vs-built offset). Indianapolis
  shortens the oval stand and colour-band chords that covered the infield at
  racing 0.33. Re-measure with `tools/track/measure-props-over-road.mjs` before
  treating the spec as green.

  **Both offenders are located and are the same class: a big bespoke
  `structure`, not foliage, barriers or lighting.** Measured with
  `TRACK=<id> PORT=<p> node tools/track/measure-props-over-road.mjs`, then matched to
  a prop by footprint via `a.scene({radius})` (`props[].at` / `sizeM`):
  - **COTA** max **4.79** at frac 0.877, world (709.1, 41.6). The intruding
    triangles stack vertically at one XZ point (`triY` 1.36 / 2.76 / 4.16), so
    it is a standing structure, not a canopy. Footprint match: `prop:274`,
    55.1 × 4.1 × 27.9 at (730.5, 0.8, 44.3) — the **Austin360 Amphitheater**
    `modelGroup("cota-amphitheater", …)` at `js/circuits/cota.js:83`, built from
    raw `addBox` calls (stage deck, PA towers, LED wall).
  - **Indianapolis** max **4.91** across fracs 0.323–0.336, world (183.8–185,
    453), `triY` 4.14–5.87. Footprint match: `prop:911`, 43.3 × 2.3 × 50.4 at
    (184.4, 0.8, 429.5). The XZ match is solid; its declared height does not
    span the offending `triY`, so the exact triangles likely belong to a taller
    sibling inside the same group — confirm before editing geometry.

  **A hypothesis that looked strong and is WRONG, recorded so it is not
  retried:** `a43691c` ("Combine track lamps and floodlights into one fixture
  system") postdates the spec baseline and stripped `"lamps"` from BOTH
  circuits' `dressingExclusions`, which reads like the cause. It is not — those
  exclusions are foliage/lighting-scoped and neither offender is foliage or a
  lamp. The remaining suspect is `7a17351` ("decouple scenery/road from the
  line"), which changed how authored scenery maps onto the racing line and
  would move the road under a structure authored beside it; `dressingExcluded()`
  shifts its windows by `TrackSpace.sceneryOriginDelta` (`js/track/tracks.js`
  ~:1450). Not confirmed — bisect it rather than believe this paragraph.

  **ROOT CAUSE, COTA — confirmed and measured.** An earlier note here said the
  footprint preflight "does not apply" to `modelGroup`/RAW emissions. That was
  WRONG: `js/track/scenery/models.js` does preflight every group. It just checks the
  wrong thing — it tests the bounds the author DECLARED and never looks at what
  was actually emitted, so a group can pass the guard and then put its geometry
  somewhere else. `cota-amphitheater` declares
  `center = vadd(vadd(a.c, a.r, 8), a.u, 13)` and emits its stage deck at the
  anchor, so the tested box sits 8 m further from the circuit than the geometry.
  `modelGroup` now measures this (`diagnostics.escaped`, read via
  `__apex.modelDiagnostics()`): the amphitheater escaped its declared box by
  **9.0 m along the RIGHT axis** — laterally, toward the track — which is the
  4.79 m of geometry over the racing line. The amphitheater now emits from
  that declared origin, and `modelGroup` re-runs the road preflight on the
  **emitted** oriented box (lateral footprint only — vertical apron slack is
  still a diagnostic, not a delete).

  **Indianapolis is NOT this bug.** Same instrument: 15 of its 21 groups escape
  their declared bounds, but every one is vertical (≤0.44 m aprons/greens) and
  **zero escape laterally**, so the declared-bounds gap cannot be what puts
  geometry over its road. Its offender still needs a cause. (COTA: 4 of 12
  escape; only the amphitheater does so sideways.) The vertical population is
  large enough on both circuits that any future promotion to a hard rejection
  must be lateral-only, or it will fail 40 circuits on harmless apron slack.
  Confirmed PRE-EXISTING at
  `d7a1158`, not introduced by the instancing-key hoist: `BASE=HEAD~1 node
  tools/track/graph-parity.cjs cota indianapolis` returns exact parity
  (max |Δpos| 0.0e+0 m), and a geometry test over identical geometry returns an
  identical verdict. Unseen because `test:scenery` is not in the CI smoke job —
  the same gap that let `agent-drive-bench` sit red, and the standing argument
  for why "a guard nobody runs is prose with extra steps" (§9).
- **`groundPatch`/`groundedSegments`/`waterField` take no side flip on a reverse
  circuit — RAISED AND NOT ACTIONED, deliberately.** An audit pass flagged that
  `js/track/tracks.js` wraps `tyreWall`/`wall`/`hedge` with
  `SIDE(side) = def.reverse ? -side : side` but wraps `groundPatch`/`waterField`
  with the origin-shift `SK()` only, so a runoff patch authored with the same
  literal `side` as its paired tyre wall lands on the opposite side of the
  corner (cited: `redbull.js:95` vs `:102-103`, `monza.js:230` vs `:228`,
  `cota.js:457` vs `:441`, `spa.js:230` vs `:226`).
  **The mechanism is real; the conclusion does not follow.** `tracks.js:277-280`
  states the default is ORIGIN SHIFT ONLY — "no side flip, no reverse/mirror
  remap … deliberate and conservative … giving them the full treatment here
  would silently move already-shipped geometry." Authors place these by eye
  against what the engine actually does, so a literal that disagrees with a
  wrapped sibling's is expected rather than evidence of misplacement.
  **This is the SECOND time an audit has read a documented asymmetry as a
  defect** (the first was `hwZones` index-vs-arc space, withdrawn the same day
  after the circuit files turned out to annotate both spaces). The lesson for
  the next pass: in `js/track/`, a convention that looks inconsistent between
  two emitters is usually written down within twenty lines of the code — read
  the surrounding comment before costing a fix.
  Settling any individual patch needs a rendered check per circuit
  (`__apex.render({what:"map"})` against `modelDiagnostics()` positions), not a
  code change; `tools/track/graph-parity.cjs` would show what any engine-level
  fix moved.

- **Per-circuit vertex budgets are ad hoc; the repo-wide gate is missing.**
  Qatar itself is resolved — cut 340,858 → 299,386 (a redundant street-lamp
  dressing pass and an over-tripled flood run) with the budget re-set to
  310,000, justified in the spec's own comment — but Vegas builds 1,825,925
  prop vertices (~80 MB of GPU buffer at the real interleave, against the
  ~100 MB where iOS jetsams the page) with **no cap at all**.
  `verify-track.cjs` now fails `vegas` above 1 850 000 prop verts (measured
  ~1.83 M + slack). Other circuits stay uncapped.
- **The banked-reference measurement error is fixed locally, not durably.**
  Monza's 0.294 and Spa's 0.525 "terrain over road" readings were one root
  cause — probes measured against the unbanked centreline where `bankZones`
  lift the tarmac — and both foundation specs now add the `Tracks.banking()`
  term themselves. The durable fix is still open: `__apex.groundY` should
  return the banked road surface and an `overRoad` field so no spec rebuilds a
  centreline (~13 other foundation specs pass only because their probe fracs
  miss a bankZone; Zandvoort's latent error is 2.41 m). Follow-up: Monza's
  Parabolica 4° camber cap lost half its written justification to this bug and
  should be reconsidered on its remaining merits.
- **A19 residue.** `css/overlays.css` still carries mutually inconsistent
  measured cluster widths in comments (the "467px" family) of which at least
  two are historical measurements of the pre-grid flex strip. Landscape
  hud-layout coverage is closed (`HUD_LANDSCAPE_ONLY` checks `.hud-top`,
  `.hud-gaps`, `#minimap`, `#hud-sectors`); portrait overlap stays excluded
  behind `#rotate-device`.
  **2026-09-03 — that "closed" was wrong, and it cost a shipped defect.**
  Naming those four selectors only ever bought HUD-vs-BUTTON pairs: the
  collision loop compared `hb × vis` and never `hb × hb`, and `unsafe` filtered
  `vis` alone, so two HUD clusters overlapping each other — or overrunning the
  notch — could not fail the spec. `.hud-gaps` painting over `.hud-top` on a
  notched landscape phone is exactly that case, reported from a real device.
  `fitHud`'s cap had never carried a `--sal`/`--sar` term either, so the
  measurement it was checked against was short by the whole inset. Both are
  fixed; the spec now runs `hb × hb` and includes the HUD boxes in `unsafe`.
- **A13 zoom/rect sites — closed.** `js/ui/css-zoom.js` (`CssZoom`) is the
  shared helper: `viewportRect` / `localBox` / `toLocalDelta` (+ a one-shot
  `rectsAreVisual` probe). Call sites: garage lens shift (`game.js`
  `renderSetupPreview`), `menunav` `nearestPane` + wheel→`scrollTop`,
  `sheetshape` thresholds via `localBox` (clientWidth, engine-safe). **Data hub
  now scales:** `.dh-card { zoom: var(--ui-scale) }` with `--svhz`-based heights;
  telemetry scrubber uses `CssZoom.viewportRect`.
- **No CSP.** `index.html` ships no Content-Security-Policy of any kind.

### 2026-09-01 general survey — fixed, recorded, and the player-facing list

Fixed in the same session (each a two-line local change; browser groups
named in the commit): a one-tap reload from the in-race SETTINGS sheet
(RENDERER / THREE PATH / SCREENSHOTS / RESET RENDERER now arm a two-tap
confirm while `body[data-race]` is set, and GRAPHICS defers its boot-tier
reload to after the race); the time-trial ghost store's whole-blob
parse+stringify moved off the physics step (`requestIdleCallback`);
`teamMeshes`/`teamBodies` LRU invalidation without their order arrays (a
later eviction freed a LIVE mesh); `sectorValid` not cleared on a backward
line crossing (a fraction-of-a-second S3 could become a session best);
`gamepaddisconnected` killing input for a still-connected second pad; the
gyro listener never detached when leaving TILT; the shell reload dropping
`location.search`; `weatherArc` surviving `endRace`/`quitToMenu`; the
one-shot gesture listener registered `once:false`; `fitHud` re-measuring
10×/s unbounded while the layout was empty, with four selector queries per
tick.

Recorded, not fixed (PLAUSIBLE or a design call):
- **~~Menu state renders the full scene every frame~~** — mostly CLOSED by
  `menuBlank` (title/garage/career hide the canvas). Remaining: race-settings
  flyby still draws every frame with PerfGov race-gated. **Results freeze
  (2026-09-09):** `render()` returns on `state === "results"` (last race present
  kept); `endRace` calls `Particles.rainShow(false)`; env probe is race|count
  only.
- **~~GLX `cullInstances(batch, planes, {upload:false})`~~** — FIXED 2026-09-09:
  GLX now packs to `shadowIbo` like WGX's `shadowInstBuf`; camera ibo/cell-set
  cache survive a shadow recentre.
- **`sw.js` activate deletes every other cache generation** while the old
  shell is still running: its lazy fetches (scenery, data, net, deferred
  backends) miss the cache; offline after the swap a circuit builds bare.
  Needs a two-generation repro before changing the sweep.
- **Storage quota is shared** by ghost (uncapped, ~40 KB/track), six career
  slots and the API cache; only the API cache evicts, and only its own keys.
- **Ten direct `localStorage.setItem` sites** bypass `store.write`
  (bodyattitude, cockpit-opts, gfx-quality, metrics, perf, apex) — no
  `noteBroken`, no cross-tab invalidation.
- AI brake-look loop redoes three wrap chains per sample (`Tracks.nodeAt`
  would resolve the index once); netplay allocates one `{id,car}` per remote
  per publish; career migration branches on `.durable` instead of `.ok`.
  (`endRace` rain overlay cleared 2026-09-09.)

Player-facing improvements the code is one step from: coloured sector
splits (`sectorBests`/`sectorLast` are already on the façade); `LEADER` /
`P{n}/{n}` instead of a blank gap chip; a visible `RECOVERING 3…2…1`
before the auto-rescue teleport, cancellable by real progress; the flagged
sector stroked yellow on the minimap (it already strokes per-sector
colours); a centre-out ghost delta bar in place of the six-character text.

### 2026-09-02 UI round — the five agent passes, and the HUD list to screenshot

Five worktree agents (mobile touch, setup/garage/career, pause/settings/
results, menus/a11y, HUD feel) each fixed their CONFIRMED items with a
node test on `mini-dom` / `css-rules` and were merged in sequence; the
sheet-density classifier now judges a sheet by the ROOM it has, not its
content height (`sheetshape.js roomOwn` — RACE SETTINGS at 1280×800 had
kept the phone layout for good), and a lap count off the next circuit's
ladder snaps to that circuit's FULL below full as well as above. The HUD
pass landed eight items: a 3ch right-aligned speed slot (the figure and
KM/H shifted half a digit at every 100 km/h crossing), a latched redline
(92 % on / 89 % off — one threshold restarted the pulse every tick at the
limiter), `COOLDOWN n` for the overtake lockout (it read `OVERTAKE` at half
opacity), sector rows with the announce banner's ▼/▲ against `sectorBests`
(the "coloured sector splits" item above — landed), a plate and light ink
under the ENERGY label (it vanished below half charge), `#ff3b30` for brand
red used AS TEXT (S2 label, ghost delta — `#e10600` is ~4.2:1 at 12–14 px),
the minimap zone stroke in the AERO chip's blue (it was cyan), and a `-`
placeholder in the TIME box (`0:00.0` is a width `fmtTime` never prints).

PLAUSIBLE, code-read only — the screenshot list for the next live pass
(1280×800 unless stated; the HUD needs a running race, so the Chrome probe
after the browser groups, never during):
- A. LANDED (1185951b): the displayed gap is an EMA per slot (~0.3 s at 10 Hz), reset on a neighbour change — one braking tick no longer doubles the tenths (hud-feel unit case).
- B. CONFIRMED and LANDED: measured headless (aiPlace-staged rival, 2026-09-02) the block was 2 px with the ahead line empty and 17.6 px filled; `.hud-gaps > div:first-child { min-height: 1.3em }` pins the behind line (hud-feel pins the rule). A true P1 could not be staged headlessly — `jump()`/`setLap()` leave `player.prog`, so the field always ranks ahead.
- C. CHECKED, no change: the idle chip reads `AERO 463m` (distance to the next zone) at 844×390 and 1280×800 (artifacts/shots/20-hud-*, headless Bahrain race 2026-09-02).
- D. S3 label lime vs the PB-value lime — one hue, two meanings. `#hud-sectors` after a PB S3.
- E. CHECKED, no change: POS/LAP/TIME/BEST labels on the plate over Bahrain day sand read at 844×390 and 1280×800 (same shots).
- F. `#hud-flag` (top 100 px) vs the dropped `.hud-gaps` (top 62 px) on a short phone at HUD SIZE ≥ 150 %. 844×390, yellow flag, `:root[data-gap-drop]`.
- G. CHECKED, no change: `ENERGY` at 100 % over the lime fill reads at both viewports (same shots) — the halo carries it.
- H. Three unsynchronised blinkers (OT armed 0.8 s, redline 0.4 s, VSC 1 s) together. Bottom cluster under VSC with OT armed.
- No pit-lane indicator exists in the HUD (nothing to disambiguate; noted).

### Found by the 2026-09-01 deep pass (code-read, measured where stated; not browser-verified)

Fixed in the same pass and therefore NOT listed: the contact-shove lap
double-count (`shiftLong` moved `_prevS` with the car), the qualifying model
timing the AI field on slick grip, the claim-fail reload that was never
"once", `gfx.msaa()` reporting 4 on the direct-to-screen fallback, RAISE THE
CAP sold at rungs the derived `budgetCap()` already binds, the Vegas-only
prop-vert tripwire (now a fleet cap in `verify-track.cjs`), NIP-01 `OK=false`
visibility, and the CI sweeps filter that skipped
four suites' own sources. What remains:

- **Bank-zone re-seat has no distance cap** (`js/track/core/mesh.js` ~:228-246). A
  frac zone that lands on a straight is moved to the nearest unclaimed apex
  however far that is. Measured pre-reseat distances: watkins_glen 0.24 →
  951 m, estoril 0.075 → 693 m, mugello 0.88 → 690 m, jacarepagua 0.47 →
  609 m, hockenheim 0.335 → 533 m, indianapolis 0.88 → 434 m, paul_ricard
  0.07/0.64 → 395/345 m. At those distances the re-seat is the "real corner
  that is simply the wrong one" failure. Left as-is deliberately: capping the
  re-seat would bank a straight instead, and the honest fix is per-circuit —
  re-author those eight fracs against a reference and then cap at ~250 m.
- **~~The scenery-file `KOLD` shift disagrees with the engine's
  `_sceneryShift`~~ — RESOLVED (2026-09-01, Node-build measurement, no render
  needed).** The premise was wrong on both circuits. *Singapore*: `anchor()`
  is not raw — `transformSceneryApi` wraps every k-keyed helper as
  `f(sceneryNode(k), -side)` on this reverse + lap-mirror circuit, so the
  shift cancels and the node that meets a kit structure at authored frac `s`
  is the mirror inverse `(n - K(s)) % n` with the opposite side. The old KOLD
  put the pit beacon 1.4 km from the tower (accidentally "supported" by a
  city block); the "corrected" arc shift put it 33 m in the air. Fixed: the
  cone anchors at `(n - K(0.999)) % n`, side +1, lateral 53, +33.9 m — 0.06 m
  from the tower's roof centre, float and clip audits unchanged. *Monaco*:
  the -24-node index shift is an empirical calibration of the raw
  `px/rx/tx` readers; the engine's -51-node arc shift would move all seven
  sites 108 m earlier and drop the tunnel onto Portier. Every site is closer
  to its measured corner under the current shift, so only the comment
  claiming "the same formula the engine uses" was wrong — corrected in place.
- **~~A rival driving the CUSTOM team is never posed in VS FRIEND~~ — FIXED
  (2026-09-01, second pass).** `resolveSeatClash()` now treats a custom (MY
  TEAM) car as a seat that cannot be kept whatever the player's rank (a
  peer's grid holds no slot or wireId for it), moves the player to a free
  real-team seat and says why. Pinned by `net-lobby-lifecycle.test.mjs`;
  the `test:net` browser group was NOT run for it.
- **`CircuitElevations` is a dead branch** (`js/track/tracks.js` `hasRealElevation`
  / `elevationAt` / the `real` arm of `realPoints`): the global is defined only
  by `tools/gen/bake-elevation.mjs`, is in no manifest entry, so every circuit's
  elevation today is the synthetic `def.elevations` cosine bumps. Either wire
  the bake into `TRACK_VM` + the shell or delete the ~20 lines.
- **Jeddah `startFrac` is in a corner** (`startline-probe`: mean |k| 0.0173
  over 120 m, first apex 1064 m later). Acknowledged in-file as known-wrong
  with no usable source; 39/40 pass.
- **Second-pass (2026-09-01) fixes from the plausible list**, each with a
  unit test where a node harness existed: `rescuePlayer` re-seeds the
  `rPrev*` render anchors; `quitToMenu` resets race control; `waitFor` rides
  out up to five consecutive transient relay errors (429/5xx/timeout/offline)
  instead of aborting the two-minute wait; a future-stamped `apex26.api.*`
  entry (clock stepped back) is neither served nor kept; `sdp.js` gained
  `C_RELAY6` and unwraps `::ffff:` mapped IPv4; an abandoned career draft
  restores the slot it was opened from; `settleRound` tolerates an unknown
  team id; driver standings break points ties by countback (`season.finishes`
  histogram, `SeasonCal.rank`) rather than insertion order.
- **Checked, not defects**: `IncidentSim._lapCross` skipping `reportLap` —
  a takeover lap is invalid and `updateCar` would not report it either;
  `prefetchIce` nulling the cache before a refresh — `iceServers()` already
  excludes credentials past `ICE_CRED_TTL_MS`, so the window is the 55→60 min
  validity tail only.
- **Plausible, still unverified**: the boot canary is armed before the
  ~550 KB deferred-backend fetch (a navigation during the download reads as a
  dead backend); a transient `checkFramebufferStatus` failure in `createTargets`
  disables post for the whole session with no retry (WGX has one).

### Found by the 2026-08 whole-codebase survey (unverified beyond a code read)

Each was found by reading the file, not by a failing test. The 2026-08-13
cleanup session worked most of this list off — the fixed entries are gone from
here and their narratives are in the archived journal — so what is left is what
survived a fix wave, plus what that session's own gates surfaced. Listed
most-load-bearing first.

- **Curvature-sign convention — SETTLED (`+k = LEFT`).** `js/track/core/spline.js`
  `curvatureRaw`, `findCorners` / `buildKerbs` in `js/track/core/mesh.js`,
  `js/game.js`, and the agent `CONVENTIONS` string all agree. Historical
  "+ = right" wording was comment drift; the physics-facing signs were already
  the measured convention. **Still do not flip any sign without a rendered
  lap** — the 2026-08-13 barrier fix stayed deliberately vertical-only for
  that reason.
- **The wall clamp is bypassed while `IncidentSim` owns the car — FIXED.**
  Product: `wallAt` stays the outer bound during R2 (the side-world has no
  barrier colliders). `postStep` now clamps `tf.x` and writes `px`/`pz` from
  the clamped `(s,x)`. `updateCar` still skips its own clamp while `owns()`
  is set — that is correct; the write-back is the remaining authority.
  Unit-tested in `tests/unit/incident-gate.test.mjs`.
- **Red Bull Ring's barrier coverage — FIXED (2026-08-13), and the mechanism
  was general.** tightFrac 0.225 was not missing dressing: sceneryRange()
  collapsed every authored full-lap span to zero width (wrap01(1) === 0)
  before the full-lap guard could see it, so lap-round barriers tightened
  ONE node per side on shifted circuits. Fixed in js/track/core/space.js by
  short-circuiting width >= 1 to {0, 1} — a whole lap is frame-invariant.
  Verified: fleet A/B shows redbull only (0.225 -> 1.000), characterization
  + redbull-foundation + tiny + guards all green.

- **`__apex.scene()` behind-camera bearing — SETTLED.** `behindCamera` means
  `|bearingDeg| > 90` (behind the look direction), not `project() === null`
  (behind the near plane). The spec asserts `> 90`. Monza's first behind
  corner at ~108° now flags correctly.
- **Title-screen CLS — FIXED, and the method is the point.** The title screen
  used to paint in the wrong shape and relay out: `body[data-density]` picks
  `#overlay`'s one- vs two-column grid, and `js/ui/sheet-shape.js` wrote it on
  `DOMContentLoaded`, behind all ~146 synchronous scripts. Measured on a quiet
  box at 852×393 over a gzip server: **CLS 0.5241** at `d7a1158`, now **0.0602
  and 0.0824** on two cold loads ("good" is under 0.1), via a tiny inline script
  at the top of `<body>` that reads both thresholds back out of CSS.
  Two wrong answers were measured and discarded on the way, both recorded in
  the code comments so they are not retried: (1) preloading the webfonts —
  `CLSCulprits` names `titillium-web-latin-600-normal.woff2`, but with the fonts
  landing at ~126 ms the shift was unchanged; (2) moving `sheetshape.js` to
  script #4 — that only makes it a RACE, and the same build on the same box
  scored 0.0824 and 0.5929 on consecutive loads depending on whether the script
  beat the first paint. Only something with no network dependency wins reliably.
  Three measurement traps cost most of the time here and are worth knowing: the
  service worker serves the previous build's precache, so a fresh ORIGIN (new
  port) is required per cold load; a loaded box reports incoherent timelines
  (a shift stamped before its own FCP); and `setTimeout` polling cannot observe
  anything during the synchronous script wall — sample in `requestAnimationFrame`,
  which runs before each paint, and read the computed values rather than a
  timestamp.
- **Cross-backend shading divergences the parity test cannot see**: TLX and
  WGX LIT now classify chrome (`SURFACES.mirror = 27`) and key wet reflections
  off `wetSheen` (porous ground no longer mirrors lamps). WGX FrameU `params9`
  carries `uAmbContactDark` / `uLampWallSpill` / `uWindowSunFlash` /
  `uSkyRimGlow`; SkyU `p5.x` is `uCloudDef`. WGX sky now ports the overcast
  grey-shift, twilight horizon bank, and azimuthal gradient. Remaining honest
  WGX gap is TAA (still off).
- **The relational agent policy — FIXED (2026-08-13).** The under-drive was
  never the speed caps: pure feedback steering cannot track road curvature
  at speed (traced: 13.9 m road departure at 55 m/s with steer 0.04). The
  bench policy now feeds forward from the road's published curvature
  (`ahead.pts` v^2/R) with a matching speed bound — Monza 251 -> 1543 m,
  Interlagos 1119 m, spec 5/5 green, floors untouched.

- **Test-quality gaps** (from the whole-`tests/` read). The
  `ui-button-touch` "throttle button visible" never-fail (`if (count > 0)`
  around its only `expect`) is **FIXED** — the expect is now unconditional.
  `menu-survey` and `parts-catalog` still join the known `ui-audit` gallery as
  assertion-light. The banked-reference measurement error (fixed in the Monza
  and Spa foundation specs with a local `Tracks.banking()` term) is still
  latent in **Zandvoort's** foundation spec and ~12 others whose probes miss a
  bankZone — the durable `groundY`/`overRoad` fix above is what retires the
  whole class. `tests/unit/coplanar-faces.test.mjs` now pins the sweep length
  to the circuit roster (the old `>= 24` floor is gone). The lone `.test.cjs`
  suite is invisible to the doc-count regexes.
- **A lapped driver's LIVE row — FIXED (2026-08-13).** `intervals()` now passes
  "+1 LAP"/"+2 LAPS" through as a string (null was indistinguishable from
  missing data) and `live.js` renders a string `timeDiff` as a bar-less
  label. A lap down is not a time gap and is no longer drawn as one.

- **`js/circuits/indianapolis.js` infield planting — FIXED (2026-08-13).** The
  dead `h < 0.5` selectors (unreachable after the `h < 0.55` guard) moved to
  0.775, the live range's midpoint: clumps plant on both sides and the
  dark-leaf variant renders. verify-track OK, float-audit unchanged.
- **The 2026-08 whole-tree audit's deferred list is the standing backlog for
  this section.** 143 verified findings, of which the fix-now batches took 30;
  the rest are recorded by area with file/line evidence in the dated audit
  record indexed from `docs/README.md`, and are not re-itemised here. The
  round-2 items that were verified still-open and deliberately left out of the
  fix-now batches are worth naming because they are small and near-miss:
  `js/net/handshake.js` `payload.k` null-deref and its missing deflate-bomb cap,
  `js/net/sdp.js` ascii CR/LF handling, `js/data/telemetry.js`'s sprint badge,
  `js/render/glx/post.js` `hdrOk`, `js/render/three/tlx.js` `boxScale` (and a
  stale comment in `js/render/three/tlx-post.js`), and a lobby branch in
  `js/net/lobby.js`.
- **Smaller, catalogued but not itemised here**: the EXPORT data tab still
  hardcodes its year list; several dev tools have exit-0 error paths and
  hardcoded chromium/port assumptions. The full 11-part survey with line
  references is the backlog record for the cleanup.

---

**2026-09-10 — parts-mesh-cache eviction tests are budget-marginal on this box.**
`tests/specs/parts-mesh-cache.spec.js` "player body and cockpit caches keep at
most 3 visual keys" (240 s budget) and "wheel mesh cache keeps at most 8
tyre/brake pairs" (360 s) failed three times on the car-draw extraction
(32b04b9): twice with the second garage pick still "performing click action"
at the budget, once with the cockpit-mesh wait (20 s) expiring. The one run on
the pre-extraction commit 88f8515 passed at 222 s — 18 s under its budget.
Measured on both commits with the same script, idle box: opening the garage
10–34 s, an engine pick 33–38 s (tab click 17–19 s, option click 15–20 s —
Playwright's stability wait against a garage that renders at ~0.6 fps under
SwiftShader, one texture created and freed per frame on both commits), race
boot + park 23–27 s. Four iterations of that is ~300 s, so a 222 s pass is
the fast tail, not the norm. The spec's own mesh probe, installed on the
extraction, counts body=1 after park, cockpit=1 within 10 s of
`camera("cockpit")`, wheels=4, field=32 — the caches it audits are reached.
The moved code is byte-identical to the base modulo the façade rewrites
(`G.` / `deps.` / `PhysicsConsts.` / `M4.clamp` / `CamModes.CAM_MODES`; 616
lines, 0 diff). Verdict: not a regression; the test's budget assumes a
faster garage than this box has (its header already calls the 5→3 boot
change "UNVERIFIED IN A BROWSER"). Left as is — never widen a budget to make
a spec pass. Superseded the same hour by 2e09124 on the deploy branch, which
measured the same 23–29 s per click, gave `__apex.garageParts` a garage-closed
path (`recomputePlayerMods` on the façade) and re-wrote both tests to boot ONE
race and refit through the hook: body/cockpit eviction 156 s and green.

**2026-09-10 — an extracted module cannot carry game.js's eval-time destructures.**
Moving the shadow passes into `js/render/shared/shadow-pass.js` carried ~40
reads of `LT` with them. `LT` is not a global: game.js binds it at eval with
`const { TUNE_DEFS, LT, buildTrackLights } = LightTune;`, so in any other file
the name does not exist. Proven in the booted page — a strict function reading
`LT.shadowRange` at module scope answers `ReferenceError: LT is not defined`
(`typeof LT` does NOT, which is why a typeof probe is no test of this). Every
sun-map rebuild would have thrown.

**Corrected 2026-09-10, TWICE — the second correction is the one to read.**
The first version of this entry claimed nothing in the browser suite would have
caught the bug. I then re-broke the shadow pass, saw `menu-baseline.spec.js`
fail on three of its six golden PNGs, and "corrected" the entry to say the
goldens catch it. That was wrong, and wrong in the most ordinary way: I ran the
broken case without running the CONTROL. On the fixed tree the same three
goldens fail, with the same pixel counts to the pixel — 10319, 13520 and 49516
— so the injected bug changed nothing. Those three were already failing.

The structural reason is in the spec, and it is decisive: before it shoots,
`menu-baseline` calls `__apex.headless(true)` (stopping the render loop) and
sets `visibility:hidden` on `#game`. A dead shadow pass cannot appear in a shot
that stops the loop and hides the canvas. The goldens are a DOM identity gate —
colour, type, weight, spacing — and they are not, and cannot be made into, a
renderer gate while they do that.

So the original claim stands: nothing in the browser suite would have caught
this. `game-vm.test.mjs` passes with the bug in place, and a boot-only smoke
passes too, because `js/perf/loop-health.js` absorbs the per-frame throw (8
consecutive / 240 total, then it stops the loop) while `__apex.info().track`
keeps answering. The guard is the whole net for this class.

**The lesson is not about shadows.** Twice in one session an unverified claim
about test coverage went into a committed ledger entry, and the fix both times
was a two-minute control run. A claim that a test WOULD have caught something
is a claim about a test run that nobody has performed. Perform it, and run the
clean case in the same breath.

What caught it, before a single test, was
`tests/unit/global-registry.test.mjs`'s third rule — a call-time read must
resolve to some manifest global, a host name, or the `KNOWN_EXTERNAL_READS`
baseline. Fix: `const LT = LightTune.LT;` at `create()`. Verified live rather
than by inspection: instrumenting `GLX.shadowBegin` and recovering the sun
ortho half-width from the light VP, `LightTune.LT.shadowRange = 80` gives a
half-width of 80 and `= 30` gives 30, so the module reads the object the
tuner mutates. (`M4` is frozen, so patching `M4.orthoTo` to watch the box
silently no-ops — instrument the backend seam, not the math island.)

**The class, swept across the tree.** 158 real globals; game.js has 646
top-level names, of which 119 exist ONLY inside it as eval-time destructures —
`PhysicsConsts` 58 (`VMAX`, `ACCEL`, `BRAKE`…), `CarMesh` 15, `carDraw` 12,
`GameStore` 6, `LightTune` 3, `Teams` 2. Every one is a landmine for the next
extraction and every one fails LOUDLY: not a single game.js local shares a name
with a real global, so there is no silent-wrong-value variant of this bug, and
the guard sees all of them. Both shipped modules are clean under the same scan:
every name they read is a global, a `create()` parameter, or their own
declaration. The residual risk the guard cannot see is a create-time capture of
a REBINDABLE value — `const LT = LightTune.LT` is safe only because knobs.js
declares `const LT = {}` and mutates it in place (nothing in `js/` reassigns
it), whereas capturing `G.gfx` at create would freeze a null, since game.js
assigns `gfx` during boot. Rebindable state goes through the `G` getter; a
mutated-in-place object may be captured once.

**2026-09-10 — the renderer group on real Metal: 6 red -> 3, and what the 3 are.**
Three dispatched runs were needed to obtain a GPU verdict at all (the first two
were cancelled by hand). Run 3464 reported six failures with the adapter census
GREEN, so they are real-GPU results, not SwiftShader wearing Metal's name.
Four had causes readable from the run's own diagnostics and are fixed:

- `shadow.box` in `tools/lighting/ab-lighting.mjs` still named `js/game.js` for
  an expression the shadow-pass carve moved. MINE. Nothing local caught it: the
  assertion lives in a `gfx`-group browser spec, which the change-aware gate can
  never select. `tools/lighting/slider-effect.mjs` had the same miss with no
  test at all behind it.
- image-grade "blacks" read NaN because the governor's auto-res resized the
  framebuffer mid-test (scale 1 -> 0.7; captures 186,624 / 147,456 / 112,896 px;
  worst frame 8.5 s, 98 slow of 264). The suite diffs pixel ARRAYS, so `boot()`
  now pins the scale. Confirmed by run 3469: both captures 230,400 px.
- TLX M8 slept 600 ms then read `postState()`, whose block flags are written at
  the END of a pass and initialised false — so an early read says "every block
  off", which is what Metal reported WITH the governor at tier 0 and no
  shedding. That also kills the bloom-shed theory this ledger used to carry.
  Now a condition wait; green in 3469.
- lighting-ab pinned `floodEmit` at 0.78, but the code is
  `min(1, LT.floodEmitMul * 0.78)` and qatar|night|dry carries 0.11 —
  0.11 x 0.78 = 0.0858 exactly. Red on every runner since that palette moved.
  Now asserts the contract against the live multiplier.

**The three that remain are all "a real GPU is not SwiftShader", and none is
bent to pass.** Two were known; the third was hidden behind the first, because
the image-grade block is `mode: "serial"` and a failure skips the rest of it —
so fixing blacks REVEALED it rather than caused it:

| failure | on Metal | on this container |
|---|---|---|
| TLX M6 skid batch | premise holds (off-road, x=9.21, speed 29) but marks never record: `marks: 0, skidVerts: 0` | passes |
| lighting-ab night fog glow | foggy region comes back DARKER than dry (67.7 vs an 85.7 bar; 72.0 vs 104.8 on retry) and the dry reading itself moves run to run | passes |
| image-grade "shadows predominantly change dark pixels" | the knob moves BRIGHT pixels more: dark 35.7, bright 46.7, wanted dark >= 2x bright; darkSigned +34.8, brightSigned -44.1 | passes (verified 2026-09-10) |

Each needs an iteration loop on a Metal runner, which this container cannot
host. The rule that keeps them honest: never widen one of these tolerances to
get green — a software-GL pass is not evidence about a player's GPU, and a bent
bar would erase the only signal that says so.

**Re-read against the code (same day): two of the three were test defects,
and "a real GPU is not SwiftShader" was the wrong frame.** The image-grade diag
in 3469 carried the answer — `gov.tier 2, autoShed 2` on the first attempt,
`tier 4, autoShed 4` on the retry. A shadows-lift curve cannot darken
highlights by 44/255; `autoTier() >= 4` zeroing bloom/SSAO/godray
(`js/game.js` `po.*`) and `tier() >= 2` dropping SSR can. The test compared a
baseline at one tier with a "changed" frame at another. The fog test is the
same shape: `frame.lampFog` needs `frame.lights`, whose budget `tierShed()`
cuts at tier >= 1 (`js/lighting/frame-lights.js`), and the lamp halos are
bloom — the dry capture lands right after boot and the foggy one 3 s later on a
runner still shedding, which reads as fog darkening the sky and as "dry"
moving 10 points between attempts. Both pass here only because SwiftShader has
bottomed out at one tier before the first capture — a coincidence, not
evidence. And the scale pin from the previous entry made both WORSE:
`governor.js` falls straight through to the ladder once the scale lever is
gone ("the ladder is the only lever left"). No pin existed — `setUserTier` is a
floor. Added `PerfGov.setTierHold` / `__apex.govHold(true)` (no shed, no
restore), both specs hold the tier and assert it EQUAL at the two captures
before comparing pixels, so the next such failure names the governor.
M6 is not explained by this: `skids.draw` has no tier gate, the stamp lands on
the first laying frame (`js/fx/skidmarks.js`), and the premise numbers were
byte-identical to this container's — the timeout now dumps `state`, `offroad`,
`onKerb`, `skidIntensity`, `fxState()` and the governor so the next Metal run
says which link broke. Lesson for the table above: read the diag the failure
already printed before calling a failure hardware.

*M6, same day, from that diag run solo here:* `cam: "cockpit"` with every
gate term true (state race, offroad true, onKerb false, skidIntensity 0.5,
speed 29) and `marks: 0`. The stamp sat after the body draw, past the cockpit
rig's `continue` (`cockpitRigOnly`), and the shipped default camera is
`CAM_MODES[3]` = COCKPIT — so with the default camera the player never laid a
mark; rubber appeared only after a camera switch. A GAME defect, on every
backend and every GPU, that only the TLX spec happened to drive in the default
camera. Fixed by moving the stamp ahead of the branch (world state, not a
draw). The Metal "premise holds, marks never record" row above was this.


## 8. Backlog

Deferred with reasoning, none lost:

- **game.js extraction candidates**, ranked by boundary crossings (§4): garage
  live preview ~415 ln (blocked on a car-drawing seam), camera disclosure
  ~324, pre-race screens ~261, liveries ~161, sky state ~107. (Cam modes was
  taken: `js/camera/mode-switch.js`.) The 2026-08-13 structure panel re-affirmed
  this list as the live decomposition plan and made it **forced rather than
  optional**: both ratchets are saturated (`js/game.js` and `js/agent/apex.js`
  each sit one line under their ceiling), so the next net-positive edit to
  either file fails the suite. Candidates may be **added** only after
  re-measurement by function body (brace count) — the gap-to-next-function
  method inflated `endRace` from 64 lines to "383" by attributing the
  un-extractable `G` façade block to it, and figures derived that way are
  discredited. The `updateCar()` and `render()` megablocks stay fenced.
- **`wrapDelta` / shared `clamp`/`lerp` — RESOLVED.** All three now live on
  `M4` (`js/core/mat4.js`, the 2nd script tag, so every consumer including the
  deferred backends can bind them at eval; they hang off the existing global
  rather than becoming a third one). Consumers ALIAS
  (`const clamp = M4.clamp;`), so hot paths keep their old call shape. 16 clamp
  copies, 6 lerps and 5 of the 7 arc-wrap sites migrated;
  `tests/unit/shared-math.test.mjs` pins the semantics and RATCHETS against a
  new private copy. The divergent `js/track/scenery/structures.js` clamp
  (`Math.max(lo, Math.min(hi, v))`) was **not a bug** — the two forms differ
  only above an inverted range, on `-0`, and on a non-number argument, and all
  eight of its call sites pass finite numbers with `lo < hi`; migrated anyway,
  proven vertex-for-vertex by `tools/track/graph-parity.cjs --all`. Deliberately
  LEFT inline: `updateCar()`'s signed wrap (physics inner loop, and its
  characterization golden is a browser spec), and `headInterp`/`yawVisInterp`,
  which fold an unbounded heading and need a loop rather than one fold.
- **Elevation-profile drawing duplicated in `js/ui/select-screen.js` — RESOLVED.**
  One local `drawElevProfile(cv, t, showEl)`; the only real difference between
  the two blocks was which element carries the `hidden` state.
- **`simTilt`/`tiltSteering`** now share `tiltTarget()`/`tiltSlew()`;
  `tests/specs/tilt-pipeline.spec.js` pins every stage so the next re-inlining fails.
- **Mobile-tier detection ×4 — RESOLVED.** `js/render/glx/glx.js` is the one copy
  and exports `isMobile` / `mobileTier`; `liverytex.js`, `wgx.js` and
  `js/game.js` read it. glx.js is the 11th tag and the deferred backends load
  last, so the value is always there. This fixes the defect the entry names:
  `js/game.js` re-sniffed navigator without `forceMobileTier`, so a desktop
  with the flag set still loaded an alternate backend — the "phone" path under
  test was never the phone path.
- **`TUNE_DEFS` hand-mirrors** — the registry is restated in six places.
- **`GameStore` cross-tab — RESOLVED.** `store.onForeignWrite`, armed by the
  module itself on `window.storage`. Not a merge (two divergent career saves
  have no defined join): a foreign `apex26.*` write drops that ONE cached key
  so the next read goes to disk, and bumps `rev`; a foreign `clear()` empties
  the cache. An unrelated key stays cached — invalidating everything would put
  `getItem`/`JSON.parse` back in the render loop, which is why `_cache` exists.
  Counted in `__apex.persistState().foreign`; pinned by
  `tests/unit/store-cross-tab.test.mjs`.
- **Assertion-free specs** — RESOLVED. `tests/specs/ui-audit.spec.js` (34 tests, 0
  `expect`) and the former `ui-desktop.spec.js` (5/0) were screenshot galleries
  presenting as tests. The second is now absorbed into the first as two more
  viewport rows, and the survivor is declared a capture harness: its own
  `test:gallery` group, run on demand, out of `test:ui`'s pass count.
  `tools/ci/assert-audit.mjs` now grades every test in the tree
  asserting/implicit/vacuous and `tests/unit/assert-audit.test.mjs` fails on a
  vacuous body anywhere outside that one allow-listed file.
- **`tests/manual/tracks-visual.spec.js` baselines were never generated** — the spec
  is skip-gated on the snapshot dir existing; generating 40 circuit baselines
  on Linux/SwiftShader is its own operation.
- **Catalogued dead exports — VERIFIED, and mostly not dead.** The ~60-item
  catalogue was walked in four batches before anything was deleted, and the
  verification is the finding: three of the renderer identifiers it listed
  **never existed in this branch's history** (they live only on a non-ancestor
  commit — the catalogue was written against a different lineage), and its claim
  that `assets.js` consumes `gltf.js` is false today. Most entries resolved to
  ALREADY-REMOVED, LIVE, or contract-pinned: `Career.isOwned` is live through
  three skill docs' console use, `TrackSpline.centerline()` and the authored-
  `segs` path are dormant **by design** (eval-time destructure, 25 circuits
  carry `segs:`, the new-track skill documents it), and the SRTM elevation
  branch is a guarded feature slot with a shipping bake tool. What was genuinely
  dead has been trimmed: `GLTF.load` and `Reliability.levels` deleted outright,
  plus export-object entries in `reliability.js`, `store.js`, `lighting.js` and
  `light-store.js` whose functions stay because they are internally live.
  Remaining owner decisions, evidence gathered but not acted on:
  `js/track/scenery/themes.js`'s `variants` tables (zero readers anywhere) and
  `CarMesh.getBoostFlame`.
- **The CSS class-count ratchet is installed; the collapses are not finished.**
  The 2026-08-13 panel recorded its non-installation as execution debt; a
  ceiling now exists in the ratchet idiom (`tests/data/ratchets.json`), alongside a shell
  node-count ceiling guarding the premise the keep-the-monolith ruling rests
  on. The first three one-surface collapses took the count 543 → 537; the
  remaining clusters are ordered **behind** the zoom/data-density migration
  where they touch the same surfaces.

---

- **`tlx-probes` M6 skid batch is red, and it predates this session's work.**
  The spec drives a hard slide on Monza, `freeze(true)`s so presented frames
  stamp, then waits for `GLX.__tlx.fxState().skidVerts > 0` — which never
  arrives, so the test hits its 360 s budget. A/B on a QUIET box: red at the
  session tip AND byte-identical red at the pre-batch commit `1aaf91b3`
  (same `page.waitForFunction ... Test timeout` signature), so nothing in
  the W4 near-miss batch caused it. Note the coverage gap it exposes:
  `tlx-probes` is in no CI job and was never run earlier this session, so
  this had no prior verdict to regress from. Either TLX's fx path stopped
  stamping skids, or the spec's freeze-then-present premise no longer holds
  on the TLX backend — deciding which needs a TLX render trace, not a
  tolerance change. The other 14 TLX probes pass, including every shadow
  spec.

---

- **The garage double-blip was TWO bugs sharing one symptom, and only fixing
  both stopped it.** Reported 2026-09-10 as "two sounds when I click a button"
  in the part selector. The first, fixed in `5b2090177`, was a locked row:
  `Career.research()` succeeding played `uiSelect`, then the fit below played
  `uiSelect` again — one click, two blips of the SAME sound. Deleting the first
  would have been wrong (the unlock can succeed and the fit still refuse on
  budget, returning early, and that blip is that path's only feedback), so the
  contract became "at most once" via a `_blipped` latch. The user then reported
  it was still happening **on parts, not categories**, which is exactly the
  discriminator that finds the second: `framePreset()` frames the camera on the
  fitted part with `b.click()` on the view button — a SYNTHETIC click that
  replays that button's whole handler, `uiTick` included. So the fit sounded
  `uiSelect` and the camera sounded `uiTick`: two DIFFERENT sounds, which is
  why it survived a fix aimed at a doubled one. Deleting the handler's `uiTick`
  would silence a real press of that button, so the mute belongs at the
  synthetic call site (`G.soundOn = false` across the click, restored in a
  `finally`; `click()` dispatches synchronously, so the window is one
  statement). The livery editor's own `hero.click()` was the same shape and now
  routes through the same silenced helper. **The lesson is the discriminator,
  not the fix**: "still happening, on X not Y" is a bisect the reporter has
  already run for you, and the second cause was found by taking it literally
  rather than re-examining the first.
