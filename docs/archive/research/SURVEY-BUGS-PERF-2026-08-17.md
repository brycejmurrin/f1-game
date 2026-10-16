# Parallel survey — bugs & performance (2026-08-17)

**Status (2026-08-18, cache 1421):** Leftover-hunt sessions on deploy took
TLX shadow `count`, content-hash cache busting, typed accumulators, and
the build-time §3 items. Live leftover list:
[PERF-HUNT-2026-08-18.md](../../notes/PERF-HUNT-2026-08-18.md) (union banner) and
[PERF-FINDINGS.md](../../notes/PERF-FINDINGS.md) §3. Pine unit-Y reuse stays
**reverted**. Do not treat this 08-17 board as current.

**Status (2026-08-17 deferred pass):** Remaining survey items landed on
`cursor/survey-deferred-tests-8ee4` — collision arc-bucket broadphase, marble
cap/rest/far trim, WGX draw-UBO flush (already on tip) + god-ray top-6 partial
select (GLX+WGX), TLX matCache eviction skips `dispose()` on r184 (#33952).
Test runners default to sequential with per-file/group logging
(`tools/ci/tooling-fast.mjs`, `test-bg` concurrent cap 1).

Pine/tree instance reuse was attempted (unit-Y + `[1,hQ,1]`) and **reverted**:
even Y-only scale + 0.5 m height bins grew Monza severe clips 20→55 and
Silverstone float 0→1. Re-parameterise belongs with a dedicated baseline regen
(SCENE-GRAPH-PLAN §S4), not a silent look change.

Earlier same-day board (items 1–7 + High/Medium follow-ups) shipped via
`cursor/survey-bugs-perf-8ee4` onto deploy.

Read-only fleet audit of the working tree at deploy tip `46554737`
(local/live `version.json` **1325** after fetch; tinyfish deploy-check was
**OK** at **1324** during the run, then tip advanced one build). No code was
changed. Instruments: parallel explore agents across physics / GLX / WGX /
TLX / track / net+audio+data / UI / career, `physics-contract-auditor`,
Context7 (`/gpuweb/gpuweb`, `/mrdoob/three.js`, `/websites/webglfundamentals`),
web search (WebGPU uniforms), and tinyfish `deploy-check` +
`fetch_content` on https://brycejmurrin.github.io/f1-game/.

**Not run:** Playwright browser groups, real-GPU `__apex.gpuTimer()`, live
2P WebRTC. GPU fill claims remain **unverified** on this box
(`docs/PERF-FINDINGS.md` §0).

Already-closed items in `PERF-FINDINGS.md` / `ARCHITECTURE-REVIEW.md` §7 are
not re-listed unless new evidence appeared.

---

## Priority board (act first)

| # | Severity | Area | Finding | Confidence |
|---|---|---|---|---|
| 1 | Critical | WGX | Shared `queue.writeBuffer` into one blur UBO / particle VBO+UBO across draws before `submit` — last write wins | High (code + [WebGPU Fundamentals](https://webgpufundamentals.org/webgpu/lessons/webgpu-uniforms.html)) |
| 2 | Critical | Career | Finished season → `trackIdx = -1` → `loadTrack` crash on flyby | High |
| 3 | Critical | Track | Singapore `lapMirror`: `overheadSpan` SHIFT-ONLY vs `anchor` mirror+shift → portal supports ~543 m from decks | High (measured) |
| 4 | Critical | Race control | VSC/SC pace cap is AI-only; comment says “whole field” | High |
| 5 | High | Net | Contact resolves against delayed `sample()` pose; `predict()` unused | High |
| 6 | High | GLX | Env-probe restores main `viewProj` before instanced prop cull → wrong frustum | High |
| 7 | High | TLX | `fwidth` inside non-uniform TSL `If` on WebGPU TLX (same class as WGX road bug) | High |
| 8 | High | Season | Finished standalone season wiped on next SEASON entry (`resume` blanks `round === rounds()`) | High |
| 9 | High | Data | Live AUTO refresh defeated by 10 min API TTL | High |
| 10 | High | Track/perf | Pine graph reuse 1.00×; most flora still un-instanced | High (Spa measured) |

---

## 1. WGX / WebGPU

### 1.1 Shared blur UBO + particle buffer overwritten before submit (Critical)

`_blurSep` writes H then V (and multiple `times`) into the **same** `blurUBO`
while encoding passes that only run at `submit`. Particles call
`drawParticles` twice (smoke then sparks) and overwrite one `particleVBO` /
`particleUBO`. Classic WebGPU mistake: `writeBuffer` is queue timeline;
`draw` is encoder timeline — the GPU sees the **last** write.

Evidence: `js/render/webgpu/wgx.js` `_blurSep` (~2628–2644),
`drawParticles` (~3614–3623). External confirmation: WebGPU Fundamentals
“you can NOT” loop `writeBuffer` + `draw` on one buffer before submit.

**Fix direction:** Dual/ring UBOs (or dynamic offsets) for blur axes; dual
particle VBO/UBO (CPU already has `_vertA`/`_vertB`); or submit between
passes. Validate with `node tools/gfx/wgx-validate.mjs` + a soft-present capture
that SSAO/god-ray blur axes differ and both particle layers survive.

### 1.2 Env cube mips only on first probe cycle (High)

WGX generates mips once when `_envProbeLive` flips; GLX remips every full
6-face cycle. Later cycles leave stale higher mips for rough paint samples.

### 1.3 ~~Soft-present staging destroy vs in-flight `mapAsync`~~ (Fixed 2026-08-17, cache 1342+)

Was: persistent staging buffer + `_softBusy` gate in `begin()` starved frames;
resize could destroy buffer mid-readback. Now: ephemeral per-frame staging in
`_softDisplayEncode` / `_softDisplayFinish`; `awaitSoftPresent()` resolves only
after a successful visible blit. Guard: `tests/unit/webgpu-lifecycle.test.mjs`.

### 1.4 Perf: per-draw `writeBuffer` to draw ring; god-ray full-list sort

Thousands of queue uploads/frame on dense tracks; night circuits sort the
full light list every present. Batch the draw-ring upload; keep top-6 lamps
with a partial select.

### 1.5 Runtime `onuncapturederror` never escalates to GLX

`_gpuErrors` increments and logs (cap 8) but does not fall back — UI can
still say WEBGPU while drawing nothing.

**Checked OK:** `sampleCount` 1|4, derivative hoist in `wgsl-chunks`,
`writeBuffer` geometry path, `rg11b10ufloat-renderable` feature request,
particle `_retiredBufs` on grow.

---

## 2. GLX / WebGL2

### 2.1 Env probe culls `propBatches` with the main camera frustum (High)

`envFaceBegin` calls `begin(probeVP)` then restores `frame.viewProj` before
`drawWorldMeshes`. Instanced batches build frustum planes from the restored
(main) VP while drawing a cube face → missing / wrong props in reflections.

### 2.2 Camera/env terrain still unchunked (High)

Shadow uses `terrainChunked`; lit + env still `gfx.draw(track.meshes.terrain)`.
Documented reach waste in `PERF-FINDINGS.md`.

### 2.3 Instanced props cast shadows with no light-frustum cull (High)

`castShadowInstanced` on full batches every night / lamp pass; chunked
casters already cull.

### 2.4 Desktop double MSAA (High / memory)

`antialias: !IS_MOBILE` on the default context while post already does
offscreen 2× MSAA + blit — browser MSAA backbuffer is unused fill/memory.
WebGL Fundamentals / project comments already call this waste.

### 2.5 Particles/glow exact-size `bufferData` every frame; `cullInstances` always re-uploads

Prefer allocate-once + `bufferSubData`; skip upload when visibility mask
unchanged (instancing path already uses SubData).

### 2.6 Docs drift

`PERF-FINDINGS.md` §4 still implies instancing is tests-only; live
`propBatches` path is what surfaces 2.1 / 2.3.

---

## 3. TLX / three.js

Context7 (`/mrdoob/three.js`): dispose geometries/materials/textures when
done; shared textures need care on material eviction.

| # | Finding | Severity |
|---|---|---|
| 1 | `fwidth` inside attribute-gated TSL `If` in `tsl-lit.js` — WGSL illegal; desktop TLX auto-picks WebGPU | Critical/High |
| 2 | Material `dispose()` on r184 leaks shared texture bindings (three #33952; fixed r186) | High |
| 3 | Decal cache FIFO dispose mid-frame (same class as fixed car-body matCache bug) | High |
| 4 | PCSS silently off on WebGL2 TLX (all phones + Safari) | High (documented gap) |
| 5 | MSAA always 1; heavier RT formats on mobile than GLX | Medium |
| 6 | Rematerialize / reassign mesh every `present()`; shadow instance matrix double-copy | Medium perf |
| 7 | three WebGPU `mappedAtCreation` large-upload failure mode (CI pins `tlxForceGL`) | Medium |

Surface parity test is green — gaps are degraded behaviour, not missing names.

---

## 4. Physics / race control

**Arc contract:** `physics-contract-auditor` found **no ILLEGAL**
`Tracks.curvature()` sites with assists off. Player path is assist-gated or
AI-only / broadcast / surface.

| # | Finding | Severity |
|---|---|---|
| 1 | VSC/SC `vmax` cap gated `!c.human` — player keeps race pace; “off by default” comment wrong (`caution` store default true) | Critical |
| 2 | `shiftLong` skips human `prog` during multi-pass collisions → stale `penLong` | Likely bug |
| 3 | AI lateral authority ignores `OFF_GRIP` / `surfMu` off-track | Likely bug |
| 4 | Hard hits: soft `jImp` then Rapier takeover double-resolve | Likely bug |
| 5 | AI still uses retired speed→grip taper; player uses aero grip | Smell |
| 6 | DebrisWorld steady-state still ~⅙ physics CPU (measured baseline) | Perf |
| 7 | `resolveCollisions` full-field × 5 passes (cheap Δprog reject helps) | Perf |
| 8 | Rescue absolute 14/16 m/s vs pace-scaled `coast()` | Smell |
| 9 | `coast()` stops scrubbing when already below floor | Smell |

---

## 5. Track / scenery

| # | Finding | Severity |
|---|---|---|
| 1 | Singapore portal decks vs hand supports under `lapMirror` (~543 m gap) | Critical |
| 2 | Pine `ctx.instance` keys include continuous `h` → reuse 1.00× (Spa 1779/1779) | High perf |
| 3 | Broadleaf/palm/conifer still fuse into soup (no instance) | High perf |
| 4 | CPU `terrainGeo`/`roadGeo` retained after GPU upload; chunking latches `_keepPositions` | High memory |
| 5 | `preferInstance` dry-run ≈ 2× guard work | Medium build CPU |
| 6 | `modelGroup` bounds escape reported not rejected (COTA amphitheater class — already in ARCHITECTURE-REVIEW) | Medium |
| 7 | Residual floaters baselined: madrid 2, mexico 1, montreal 1 | Medium |
| 8 | Local `K(s)` + mixed remappers standing footgun on mirrored circuits | Medium |

`verify-track.cjs monza` OK during audit. Curvature sign consistent (+k = left).

---

## 6. Multiplayer / audio / data

| # | Finding | Severity |
|---|---|---|
| 1 | Net contact uses posed `sample()` state; `predict()` exists unused (~5–8 m error at race speed) | High |
| 2 | F1API `localStorage` cache never evicts; windowed OpenF1 URLs unbounded | High |
| 3 | Live AUTO 30 s refresh vs 10 min `TTL_LATEST` | High |
| 4 | TURN credentials fetched once for tab lifetime (Metered expires) | High |
| 5 | Snapshots stamped with `offset = 0` until first good PONG | Medium–High |
| 6 | SFX mute still schedules engine `setTargetAtTime` every frame | Medium |
| 7 | RTC `inbox` unbounded until `pump()` | Medium |
| 8 | Worker rendezvous posts plaintext SDP (Nostr path seals) | Medium privacy |

---

## 7. UI / menus / HUD

Hot race path already has write caches / `anyOpen` id cache. Remaining:

| # | Finding | Severity |
|---|---|---|
| 1 | Non-dialog screens (`#select`, `#career`, `#lighting`, …) have no Tab focus containment | High a11y |
| 2 | `ScrollFade.paintAll` measures every pane including hidden on resize | High |
| 3 | `fitHud()` layout reads ~2 Hz during race | High–Medium |
| 4 | ScrollFade RO observes children forever; circuit picker full rebuild on click | Medium |
| 5 | Class-count / shell-node ratchets saturated (537 / 1153) | Medium process |

---

## 8. Career / season / reliability

| # | Finding | Severity |
|---|---|---|
| 1 | `Career.trackIndex()` → `-1` after last round → `loadTrack` crash | Critical |
| 2 | Standalone season `resume` blanks finished championship | High |
| 3 | Sprint order memory-only; reload mid-weekend drops GP grid | High |
| 4 | `Career.save()` before `settleRound()` → half-written saves | High |
| 5 | `settleRound` not idempotent (double money if re-entered) | Medium |
| 6 | MY TEAM money can go permanently negative | Medium |
| 7 | Persist failure still updates `_cache` (looks saved until reload) | Medium |

Reliability DNF scoring itself looked consistent with retirement rules.

---

## 9. External / deploy / docs cross-checks

- **tinyfish deploy-check:** live `https://brycejmurrin.github.io/f1-game/version.json`
  matched local during probe (**1324** then tip **1325**). Shell + CSS +
  `js/game.js?v=` fetchable. Console runtime **not** verified (static fetch).
- **Context7 WebGPU:** confirms multi-`writeBuffer` on one UBO before submit
  is incorrect; use per-object buffers, dynamic offsets, or ring buffers.
- **Context7 three.js:** explicit `dispose()` of geometry/material/texture;
  shared textures must not be disposed with every material eviction.
- **Web search:** same writeBuffer lesson ([webgpufundamentals uniforms](https://webgpufundamentals.org/webgpu/lessons/webgpu-uniforms.html));
  generic “F1 26” web results are the commercial title, not this fan game.
- **Physics arc:** still holds (assists-off). Re-run `node tools/check/vstd-lint.mjs`
  in a write-capable session for a verbatim dump (static ALLOWED check was clean).

---

## 10. Suggested fix order (no calendar estimates)

1. **WGX writeBuffer rings** for blur + particles — correctness for the
   opt-in backend; unit-testable with Dawn validate + soft capture.
2. **Career `trackIdx` clamp** + season `resume` finished state — player-facing
   stuck/crash with small surface area.
3. **VSC/SC player pace** — one-line gate fix + comment cleanup.
4. **Singapore remapper consistency** (or delete redundant hand supports).
5. **Net contact ← `predict()`** — already documented intent in `netplay.js`.
6. **GLX env-probe frustum restore order** + terrain chunking for lit/env.
7. **TLX `fwidth` hoist** before any WebGPU-TLX marketing.
8. Perf backlog: pine re-parameterize → instance, shadow batch cull,
   `antialias:false` with post, Live API TTL, TURN refresh, ScrollFade gates.

Do **not** chase SwiftShader frame-time “wins” or idle `profile-gameloop …
render` as evidence (`PERF-FINDINGS.md` §0).

---

## Method note

Eight explore agents + one physics-contract auditor + one deploy-research
worker ran in parallel. Parent session verified the WGX blur/particle sites,
VSC gate, netplay `predict` export, Singapore `sceneryLapMirror`, GLX
`envFaceBegin` restore order, and career `#res-next` → `trackIndex()` against
the tree. Prefer this doc over agent transcripts when they disagree with a
cited line.
