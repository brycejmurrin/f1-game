# PERF-FINDINGS — the 2026-08 "Left on the table" ledger (moved 2026-09-01)

This is §3 of `docs/PERF-FINDINGS.md` as it stood before the 2026-08-18 hunt,
moved here verbatim on 2026-09-01. Every item below was either TAKEN,
SUPERSEDED or explicitly declined by then; the live file keeps a compact §3
with the entries that source comments and tests still cite, and everything
from the 08-18 hunt onward. Read this for the reasoning behind a TAKEN note,
never for what is still open — the "Still open" list lives in the live §3.

Section references ("§0", "§1", "§2", "above") mean sections of the live
`PERF-FINDINGS.md`, not of this file.

---

## 3. Left on the table

Ranked by how much I would trust the estimate, most first.

The env-probe 300 m cull and world-then-sky order already shipped — see
**Stale entry corrected** above. Do not re-open that item from this list.

**Two full-field O(n²) AI scans** at `js/game.js` — traffic awareness and
lateral separation, ~370 lines apart. The second loop's window (`|Δp| ≤ 6.5`)
is strictly inside the first's (`−13…+34`), and both carry a comment defending
"the O(n) pass is the price of seeing lapped traffic", written independently.
Deliberately NOT merged: ~55k simple float ops/s is ~0.05 % of a core, and the
second loop nests a brace deeper, so merging risks changing racing behaviour for
no measurable return.
The two loops DO skip self differently — loop 1 by identity, loop 2 by
`ranked[(c.rank||1)-1]` — and this file first claimed that as a latent bug on
the theory that a stale `rank` makes a car repel itself sideways. **Traced, and
it is not reachable.** `rank` is assigned from `ranked` every physics step
immediately before the `updateCar` loop; nothing reorders or mutates `ranked`
inside it; and `updateCar` early-returns for `retired` (the only cars excluded
from `ranked`) and for `finished`. So every car that reaches the separation loop
satisfies `ranked[ci2] === c`. Left as written. Recorded because the claim was
made without tracing it, which is the same error this document is otherwise
about.

**`massBlocked` is O(buildings²)** (`js/track/tracks.js`) — `masses` is a flat
array with no spatial index, unlike `barSegs` which got one. It is the one place
cost is quadratic in prop count specifically. Measured trivial today: ~420k
inner iterations on vegas (~4–25 ms of a 4059 ms build), 419 on monza. Below the
bar that reverted `nodeGrid`. Worth doing when the skyline gets denser.

> **SUPERSEDED 2026-08-18.** `massBlocked` now uses a 24 m XZ grid
> (`MASS_CELL`, incremental `massGridInsert` on `massAdd`). SAT stays exact;
> only candidate gathering is culled.

**Emitter ring recomputation** (`js/track/geom.js`) — `addCyl` calls `lo(a0)` /
`lo(a1)` three times each per segment where two suffice; same in `addCone` and
`addFrustum`. The `addBox` half of this finding measured 1–4 %, so expect less.
Keep the angle as `(i+1)/seg*6.2832`, **not** `(i+1)%seg` — 6.2832 ≠ 2π, so
wrapping changes the last segment's coordinates.

> **SUPERSEDED 2026-08-18.** `addCyl` / `addCone` / `addFrustum` cache ring
> ends once per segment. Angle stays `(i+1)/seg*6.2832`.

**Typed accumulators for the props buffers** (`js/track/tracks.js`) — `pos`,
`nrm`, `col`, `mat`, `idx` are plain arrays grown by `push`, ~27 M push
arguments on vegas. Reported at 15–31 %. Three hard edges if attempted: a
variadic `push()` shim measured SLOWER than native (the win needs fixed arity);
`idx` must be `Uint32Array`; and `TrackModels.validateGeometry` gates on
`Array.isArray(geo.pos)`, so the props mesh ships EMPTY if that is missed.

> **TAKEN 2026-08-18.** `TrackModels.scratch()` / `makeAccum` grow
> Float64 (pos/nrm/col/mat — same values as the old Array fuse) and
> Uint32 (`idx`) with named-arity `push` (not rest/arguments).
> `sealGeometry` copies to exact-length typed arrays before
> `validateGeometry`, which now accepts `BYTES_PER_ELEMENT` views as
> well as `Array.isArray`. Stages from `emptyBuffer()` stay plain arrays.

**Non-passive capture-phase `wheel` listener on `window`**
(`js/game/menunav.js`) — flagged by the audit as "the single highest-leverage
item adjacent to scope", on the standard reasoning that a non-passive wheel
listener at window/capture stops the browser starting a scroll on the
compositor thread. **Audited, and it does not apply here.** Two independent
reasons:

- `css/tokens.css` sets `html, body { overflow: hidden }`, so the DOCUMENT
  never scrolls. The only scrollable things are `.pane` regions inside menus.
  Mid-race there is no scroll for the listener to delay, because there is no
  scroll.
- Inside a menu the handler is load-bearing, not overhead: it calls
  `e.preventDefault()` (menunav.js) to redirect a wheel that landed on no
  scroll region — a sheet head, a stats block, a circuit map — onto the nearest
  pane. It cannot be made passive without deleting the feature.

The only residue is that `onWheel` calls `activeLayer()` → `UiLayers.top()`,
which is the 24-selector `querySelectorAll` plus a `getComputedStyle` per
match. That is the same query `anyOpen()` was moved off, but wheel events are
user-driven and occasional rather than per-frame, so it is not worth the same
treatment. Left alone.

**Frame-invariant uniforms** — ~95 tuner uniforms re-uploaded per frame across
`begin()`, `drawSky()` and the composite. The file already has the pattern to
fix it (`_frameToken`). Honest arithmetic: ~0.05 ms on a 16.7 ms budget, so
hygiene rather than a win.

> **TAKEN 2026-08-18 (GLX).** `uf1` / `_litUf` / `_skyUf` / `_compUf` skip
> equal tuner-knob re-uploads. `envFaceBegin()` + the main `begin()` share
> the same LIGHTING TUNER scalars in one game frame; WebGL uniforms persist
> on the program. View / eye / env / lights / time / grainTime still upload
> every call. WGX writes a whole UBO per `begin()` — no per-field skip.
> Do not invent a millisecond claim from this.

### Added 2026-08-14, second round

Ranked as above. **Provenance note:** the counts below came out of a read-only
audit pass and were NOT re-derived by hand afterwards, unlike everything in §2.
Treat them as this document treats operation-count estimates — see §1.

**Road and terrain never get a frustum cull, in any pass.** They are the only
large world meshes built with `G.createMesh` where their twin (props, glass)
gets `G.createChunkedMesh(…, 72)` — `js/track/tracks.js` builds both, a few
lines apart. `js/render/glx/chunked.js` only declines to chunk under 2000
triangles; road is 51-61 k tris and terrain 25-58 k, so the capability is there
and simply is not asked for. Counted by binning the ribbons into the same 72 m
cells `createChunkedMesh` uses and counting triangles within radius R of the
driver at 12 stations a lap (a frustum with far plane R is a subset of the
sphere of radius R, so these are **lower** bounds):

| pass | vegas | spa | monza |
|---|---|---|---|
| ribbon tris submitted, camera pass | 78,676 | 116,940 | 108,722 |
| provably outside the 900 m far plane | **53 %** | **43 %** | **45 %** |
| provably outside the ±80 m shadow ortho | **89 %** | **88 %** | **89 %** |

> **SUPERSEDED 2026-08-17 (render-audit follow-ups).** Camera-pass road AND
> terrain now lazy-build `*Chunked` under the baked 300 m env-probe cull +
> `PerfGov.tier() < 3` (`js/game.js` drawWorldMeshes). Shadow ribbons already
> chunked independently. The table above remains a valid *pre-chunk* reach
> measurement; do not re-derive “unreachable” from it.

Three things make this worth writing down rather than doing:

1. **The shadow half is bit-identical; the camera half is not.** The AABB-vs-
   light-frustum test is exactly the one `castShadowChunked` already applies to
   props, and a triangle outside the ortho writes no depth. But chunking
   reorders submission *within* the mesh, so coplanar LEQUAL ties inside the
   road could flip — the class of change `floorLast` would have been (draw the
   base floor last among opaque world meshes) already flags. That needs a
   rendered lap, not a frame.
2. **The fix already exists in the tree and is unreachable.** `js/game.js`
   lazily builds `track.meshes.roadChunked` and draws it via `drawChunked` —
   but only under `LT.roadChunkLamps && LT.perChunkLights`, a *lamp* feature
   that is default-off and now tier-shed. Same shape as the `uInstanced` entry
   in §2: a fix that existed and had not been copied across.
   (**Also superseded:** envCull now opens the camera path without lamp knobs.)
3. **It sharpens a §3 entry above.** `frameCullDist` is read in exactly one
   place, inside the chunked path. `draw()` never reads it — so the 300 m
   env-probe cull **cannot remove a single ribbon triangle from the probe.**
   It only ever touched props and glass.

**Two `Δprog` wraps with no pre-reject, where `pairContact` has one.**
`pairContact` opens with an exact cheap reject before its two float modulos,
with a comment saying the modulos "were being spent almost entirely to prove
'not touching'". The identical wrap idiom, on the same `prog` values, appears
twice more inside `updateCar` — the traffic-awareness scan and the lateral
separation scan — with no such guard, so every one of ~20x19 iterations per
step pays two `Float64Mod` calls to discard. Line-attributed: **129 of 2575
samples = 5.01 %** of physics CPU, the largest identified JS line-group after
the collision solver, and a floor (it excludes the inlined executions).
Bit-identical with a 0.1 m margin on the reject, which sidesteps the one
unprovable part — the wrap expression can differ from the raw delta by ~1 ulp.
**This is NOT the "merge the two loops" idea §3 already declined**; it is the
missing guard on each, independently, and it is ~10x the size that entry
estimated.

> **SUPERSEDED 2026-08-18.** Both scans now pre-reject before wrap (windows
> 34.1 m and 6.5 m), same form as `pairContact`. Do not re-implement.

**AI brake-look + traits allocate every physics step.** vegas
`profile-gameloop … physics` (2026-08-18) still has `update` 24.6 %,
`updateCar` 13.3 %, `brakeTarget` 1.4 %. The math is the look-ahead; the
GC is not: every AI car built a fresh `samples[]` of `{d,k,bank}` rows
(~10), plus `AiDrive.traits()` and `brakeDecision()` object literals.
~20 cars × ~12 objects × 60 Hz ≈ 14 k short-lived objects/s, same class
`pairContact` already left (`_ct` / `_sep`).

> **TAKEN 2026-08-18.** `AiDrive.traits` / `brakeDecision` write reused
> scratches (read-before-next-call, same as `_ct`). `beginLook` /
> `pushLook` / `endLook` recycle the look-ahead rows. Values are
> bit-identical; do not re-allocate those three.
>
> **TAKEN 2026-08-19.** The leftover call-site ctx literals are gone too.
> `updateCar` fills `_aiBoost` / `_aiOtFire` / `_aiBr` / `_aiLane` /
> `_aiWantX` / `_aiOtPull` / `_aiDefend` / `_aiBoxed` then passes the
> scratch. `simRnd()` stays behind the `otArmed` short-circuit. Guarded
> by `tests/unit/ai-drive.test.mjs` (no `AiDrive.*( {` in `updateCar`)
> and `tests/specs/physics-hotpath.spec.js` (ctx identity across steps).
> Do not re-introduce object literals at those eight call sites.
>
> **TAKEN 2026-08-18 (leftover sweep).** WGX road `createChunkedMesh` now
> expand-once + spatial bins. Props/glass share one IBO with `firstIndex`
> run-merge. TLX `uf1` skips unchanged tuner scalars. `resolveCollisions`
> rebuilds buckets only after `shiftLong`. AI scans skip `finished`
> rivals. SW install no longer precaches `apex.js` / `agentview*`
> (fetch-miss still caches them).
>
> **TAKEN 2026-08-19 (render leftover).** WGX `drawChunked` now frustum +
> radial-culls the road (surfaceId 16) — near is GL clip `w+z`, the old
> exemption threw away the env-probe 300 m cap. WGSL/TSL sky skip the
> night corona/disc (GLX already had the gate); TSL also gates the
> day-band `atan`+`vnoise`. TLX shadow `cullInstances(..., {upload:false})`
> packs CPU-side only (shadow has its own InstancedMesh). WGX skid
> expand 5→9 only when the VBO is dirty. Still open: lazy circuit tags,
> script-tag `defer`, WGX whole-UBO skip, TLX road `trk` so
> `chunkedTrackCoords` can flip on.
>
> **TAKEN 2026-08-19 (render leftover 2).** Countable dummy-producer /
> multiplied-by-zero leftovers on the draw path, all three backends:
> - Sun Cook-Torrance + clearcoat sun lobe gated on `NoL` / `NoLg`
>   (lamp `NoLl` twin). Backfaces skip two GGX evals for a result of 0.
> - Composite else-path no longer fetches the 1×1 white SSAO / black
>   bloom; `uHaveGodray` skips the god-ray fetch on GLX/TLX. WGX leftover 6
>   packs haveGR in CompositeU `lift.w` and skips the same fetch.
> - SSAO centre uses `viewPosD` / `ssaoViewPosFromD` — one depth sample,
>   not two. GLSL ES 3.00 has no overloads; the 1-arg `viewPos` wrapper
>   stays for contact-shadow sites.
> - MSAA depth resolve / blit only when SSAO, godray, SSR or flare will
>   read it (auto-tier 4 night sheds all four).
> - WGX no longer `_clearTarget`s unread SSAO-white / bloom-mip0.
> - AI cars after the behind-camera / near-eye tests skip an 8 m sphere
>   outside the same 6 planes as `propBatches`. Player never culled.
>   The side-frustum `continue` is **after** `_shadowCount++` so a rival
>   just off a chase FOV still casts into the ±42 m car map (a look-wrong
>   the first hoist introduced). GLX/TLX `makeFrustumPlanes` honour the
>   pooled `out`. `needDepth` / WGX `_ssrEarly` treat omitted
>   `carReflect` as the 0.05 tuner default — otherwise a dry night
>   skipped the MSAA depth resolve while car-paint SSR still marched.
>   Guarded by `tests/unit/perf-try.test.mjs`.
>   Do not invent a millisecond claim. Do not re-open the 08-18 union
>   banner items (WGX road cull, UBO skip, defer, pine unit-Y, merging
>   AI loops).
>
> **TAKEN 2026-08-19 (render leftover 3).** Fog `pow`/`exp` dummy-producer
> gate, all three backends. `uFogDensity==0` made `fd==0` / `f==0` so the
> mix was identity, but every lit fragment still paid `pow(sunAmt,4)`,
> `pow(sunAmt,16)`, tint, and `1-exp(-fd²)`. Outer gate is
> `density>0 || mist>0` (mist reuses `sunAmount` / `lampFogC`); inner
> gate wraps the height/`pow`/mix so a density-0 + mist-on tuner frame
> still tints. Race sessions keep density > 0 (clear day 0.0008) — this
> is the setup-preview / carview / tuner-zero path. Uniform-coherent
> (WebGPU Fundamentals + MDN: skip unused ALU; no warp divergence).
> Do not invent a millisecond claim. Still open: lazy circuit tags,
> script `defer`, WGX whole-UBO skip, TLX road `trk` / `chunkedTrackCoords`.
>
> **TAKEN 2026-08-19 (render leftover 4).** Window-sun-flash `pow(_,22)`
> dummy-producer, all three backends. The term is
> `* (1-wetSheen) * envBlend * uWindowSunFlash * uKeyMul`. Wet road
> forces `envBlend` high, then multiplies the flash by 0 — every wet
> tarmac fragment paid the 22-exponent for identity. Gate is
> `(1-wetSheen)*uWindowSunFlash*uKeyMul > 0.001` (tuner-zero and
> keyMul-0 too). Dry glass is unchanged. Do not invent a millisecond
> claim. Do not re-open the 08-18 union banner. Still open: lazy
> circuit tags, script `defer`, WGX whole-UBO skip, TLX road `trk`.
>
> **TAKEN 2026-08-19 (render leftover 5).** Sky golden-hour + low-sun
> band dummy-producer, all three backends. First factor is
> `(1-smoothstep(0, 0.72, sunE))` / `(1-smoothstep(0, 0.60, sunE))` —
> both identically 0 when `sunE >= 0.72` (default day ~0.95, night
> moon-key ~1). Gate is `if (sunE < 0.72)` / `If(sunE.lessThan(0.72))`
> wrapping `goldenAmt` + `lowBand`. `sunE` is a uniform (`uSunDir.y`).
> Dawn/dusk still enter. Uniform-coherent. Do not invent a millisecond
> claim. Still open: lazy circuit tags, script `defer`, WGX whole-UBO
> skip, TLX road `trk`.
>
> **TAKEN 2026-08-19 (render leftover 6).** WGX composite godray fetch
> dummy-producer. After SSR remul, `U.lift.w` (s[47]) is dead — wetness
> lives in the SSR pass `.a`. Pack `s[47] = haveGR ? 1 : 0` and gate
> `if (U.lift.w > 0.5) { c += textureSampleLevel(godrayTex…) }`. Keep
> `let ssrWet = U.lift.w` so Dawn still compiles a leftover use. Delete
> the dummy `_clearTarget(godrayView)` (stale contents unread, same as
> leftover-2 SSAO/bloom) and the now-dead `_clearTarget` helper. Do not grow CompositeU past 256 B. Do not
> zero `gain.w` carReflect when `!_ssrReady`. Do not invent a
> millisecond claim. Still open: lazy circuit tags, script `defer`,
> WGX whole-UBO skip, TLX road `trk`.
>
> **TAKEN 2026-08-19 (render leftover 7).** Sky twilight cloud wash
> `pow(sd, 2.5) * twilight`. `twilight` is a uniform
> (`smoothstep(0.02,0.22,sunE) * (1-dayGate) * (1-nightSky)`) —
> identically 0 on default day (~0.95) and night. Default `cloud` is
> 0.4 so the cloud block is live; the pow was `* 0`. Gate
> `if (twilight > 0.001)` on GLSL + TSL. WGSL cloud path has no
> twilight wash. Dawn/dusk still enter.
>
> **TAKEN 2026-08-19 (render leftover 8).** TSL godray sun-half +
> `hLamp` parity with GLSL/WGSL. Night `haveGR` is `lampVol` with
> `uStr=0` (moon-key `sunDir.y ~ 0.97`) — TSL still paid 16 shadow
> compares + 16× `gCloud` FBM then `* str`. `hLamp` exp sat outside
> `lampStr>0` (every daytime sun-shaft frame). Move both behind the
> existing uniform gates; `trans` stays outside. Also reorder TSL
> heat-haze: Gaussian first, scene-tag fetch second (GLX/WGSL already
> had this — ~92% of pixels are off-plume).
>
> **TAKEN 2026-08-19 (render leftover 9).** Godray Henyey-Greenstein
> `sqrt` dummy-producer, all three backends. The phase's only
> consumer is `* uStr`. Night lamp-vol frames skip it. Uniform-coherent.
>
> **TAKEN 2026-08-19 (render leftover 10).** WGX SSR pass omitted
> `carReflect` defaulted to 0 while leftover-2's `_ssrEarly` and
> composite `gain.w` already use the 0.05 tuner default. HIGH dry paid
> the MSAA depth resolve, skipped the march, then COMPOSITE fetched a
> target that never ran. The pass now defaults to 0.05 like GLX
> `_carReflPre`. Do not zero `gain.w`.

**`uCarReflect` is not shed with `po.reflect`.** Tier 2 sets `po.reflect = 0`
and the source says "Tier 2 drops the wet-road SSR march" — but the SSR gate is
`(uReflect > 0.001 || carPx > 0.3)` and `uCarReflect` keeps its 0.05 default,
so every car-paint pixel still runs the full march (~36-40 dependent fetches).
Verbatim the `po.contact` / `lampVol` defect, on the third operand-pair nobody
grepped. **Not taken because it is not bit-identical** — it removes a visible
reflection — though it is the same trade tier 2 already makes for the road. The
strictly-equivalent half of this site WAS taken; see §2.

> **SUPERSEDED 2026-08-17.** `game.js` now sets `po.carReflect = tier >= 2 ? 0 :
> undefined` and `glx/post.js` prefers `opts.carReflect`. Do not re-open.

**The boot script wall, re-measured — and the headline is not what it looks
like.** Corrected counts: **148 tags, 5,638,215 B** on this commit (§0's
146 / 5,466,108 B predates two added files, and this commit's own comments);
`js/circuits` is 1,729,016 B / 40 files / **30.7 %**
of it, for data where a session uses exactly one file. But V8 compile of all 148
files measured **97.3 ms total** (25.8 ms for the circuits) and executing all 40
circuit IIFEs is **2.5 ms** — so parse+execute of the circuit wall is ~1 % of a
2299 ms render delay, not the bulk of it. "Render delay" is the browser's bucket
for everything between TTFB and the paint; here that is serial EXECUTION of the
wall plus eager top-level work.

> **CORRECTION to the sentence above, which first read "148 serialised
> render-blocking fetches".** That was wrong, and wrong in a way that would send
> the next person after the request COUNT instead of the execution. Classic
> parser-blocking scripts are still **downloaded in parallel** — the preload
> scanner keeps scanning and triggers the fetches ahead of the parser
> (web.dev, *Deep dive into the murky waters of script loading*), and GitHub
> Pages serves HTTP/2, so they multiplex on one connection. Only EXECUTION is
> serial and ordered. This also kills `defer` as a lever from a second
> direction, on top of the eight `readyState === "loading"` guards below:
> `defer` cannot fix a serialisation that is not happening.

**The `?v=N` bump throws away Chrome's code cache for all 148 scripts, every
deploy.** v8.dev's *Code caching for JavaScript developers*: "Code caches are
(currently) associated with the URL of a script… changing the URL of a script
(**including any query parameters!**) creates a new resource entry in our
resource cache, and with it a new cold cache entry." AGENTS.md mandates bumping
EVERY `?v=N` after ANY js/css change, so a one-line CSS edit costs every
returning player a full re-download and a cold compile of the whole wall.
Per-file content hashing would fix it and is a convention change, not a code
change — but it touches the index.html/manifest guard and the `version.json`
shell guard, so it is its own commit. (SUPERSEDED: SHIPPED — index.html now
carries per-file `?v=<12-hex-sha>` on every src tag; only edited files go cold
per deploy, exactly the fix this paragraph asks for.)

**And the same article reframes the 97.3 ms figure.** `sw.js` precaches inside
the `install` event, and V8 treats that path specially: "the code cache is
immediately created when the resource is put into the service worker cache. In
addition, we generate a **'full' code cache** — we no longer compile functions
lazily, but instead compile everything… at the cost of increased memory use."
Both preconditions hold here (classic scripts, UTF-8). So 97.3 ms is a LAZY
compile number, and the installed-PWA path eagerly compiles all 5.64 MB —
including the 346 KB of dev surface no player reaches and all 40 circuit files.
That is a MEMORY cost on exactly the device class the crash sentinel exists for,
and it is an argument for trimming the eager wall that has nothing to do with
parse time. Not measured here — attributed to v8.dev.

Two eager costs found that are
NOT bytes: `js/track/tracks.js` built Catmull-Rom control points for **all 40**
circuits at boot (**24.0 ms**, an order of magnitude more than parsing them),
and `js/game/apex.js` + `agentview*` is **346 KB of dev/test surface** that no
player reaches.

> **The first is TAKEN** (found stale 2026-08-31, three rounds after the fact).
> `js/track/tracks.js:2232-2237` is a self-replacing lazy getter: `points`
> materializes on first access through `materializeListPoints` (`:2240`), and
> `buildCenterline` calls `ensurePoints` (`:2298`) so the heavy path never sees
> the getter. `LIST.length === 40` and every metadata field are unchanged, and a
> materialized def is bit-identical to the old eager one. A session builds
> exactly one circuit, so 39 of the 40 are never paid for. The paragraph above
> is kept as the measurement that justified it; only the tense is wrong.
> The 346 KB dev surface is still open — see §3.

**`defer` is not the one-attribute change it looks like.** Every external tag
sits at the very end of `<body>` with no markup after it, and deferred classic
scripts keep document order — so it reads as free. It is not: **eight**
self-initialising modules guard on
`if (document.readyState === "loading") …DOMContentLoaded… else init();`
— enumerate them with `grep -rl 'readyState === "loading"' js/`, which gives
`js/game/ariastate.js`, `gfx-quality.js`, `menunav.js`, `music-lib.js`,
`scrollfade.js`, `sheetshape.js`, `spotify.js`, `topmodal.js`.
Parser-blocking,
`readyState` is `"loading"`, so all eight defer `init()` until after the whole
wall has run — which `sheetshape.js` states as a deliberate choice. Under
`defer`, `readyState` is `"interactive"` and all eight take the `else` branch and
initialise **mid-wall**, so a module at tag 50 can init before one it reads at
tag 100 exists. The prepared form of the change is
`readyState !== "complete"`, which is behaviour-preserving today and correct
under `defer` — do that first, separately, and prove it green before touching a
single tag. (SUPERSEDED: the prepared form SHIPPED — all eight named modules
now read `readyState !== "complete"`, and the quoted grep matches only
`cockpit-opts.js` and `metrics.js`. `defer` itself remains untaken.)

**And the boot A/B run to settle it was VOID — recorded because the way it
failed is reusable.** Interleaved base / defer / no-script arms, fresh
`browser.newContext({serviceWorkers: "block"})` per run, 5 rounds. The
**no-script control arm** — a page with zero external scripts — returned FCP of
140, 168, 7660 and 11440 ms across its runs. Variance on a page that does
nothing exceeded the entire effect being measured, so every number in the run is
machine contention (five audit agents were running; loadavg 4-11). **The control
arm is the anti-vacuity guard, and it is what caught this** — without a
do-nothing arm the base/defer medians would have looked like a clean, damning
result. Two further traps found the same way: an earlier pass was silently
served by a registered service worker (`apex26-1225` precache) on every arm
including the control, and arm ORDER was itself a confound — the first arm in
each round ran clean while later arms measured the previous arm's teardown.
Re-run it on a quiet box (`loadavg < 2`, nothing else in flight), rotating arm
order per round, and report the MINIMUM as well as the median — the fastest a
run has actually gone is the least contaminated estimate, which is the same
argument `PerfGov._floorMs` already makes about frame intervals.
