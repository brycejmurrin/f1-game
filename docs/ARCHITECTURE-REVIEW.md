# Apex 26 — architecture review

A review, not a reference. [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) is the
module contract and [`CLAUDE.md`](../CLAUDE.md) is the working reference; both
describe the system as it is meant to be. This describes **how it is actually
built, what that costs, and what has drifted** — plus the open defect register
and the deferred backlog, each with its reasoning. Claims here are checked
against the code; where a number would drift, the test that owns it is named
instead. The dated review journal that used to fill this file — session
narrative, fixed defects, the war stories behind each guard — is preserved
verbatim under the archive, indexed from `docs/README.md`.

---

## 1. The founding bet

**No build step.** ~150 files, each a `"use strict"` IIFE assigning one global,
loaded by `<script>` tags in `index.html`, served static from GitHub Pages. What
it buys: the file you edit is the file the browser runs — no stale build, no
bundler config, no source/artifact divergence. What it costs: every consistency
property a compiler would enforce must be enforced some other way, or not at
all. Three consequences, and every defect ever found here falls under one:

1. **Load order is a hand-maintained global invariant** — B reading A's global
   at eval time is a real dependency with no declaration (`HARD_EDGES` in
   `tools/manifest.cjs` records the known ones).
2. **Every module boundary is a convention.** Nothing prevents any file from
   reaching into any global; the `G` façade (§4) is a discipline, not a
   mechanism.
3. **Two-place consistency is manual** — a field authored here and read there,
   a doc describing code, a count quoted in prose.

### The governing law

> **What a test asserts stays true. What only prose says drifts.**

This holds in both directions with almost no exceptions, and the rot on the
prose side is usually silent because the fallback path is always a legitimate
value. The project's answer is a family of tests that assert *structure* rather
than behaviour:

| Guard | What it holds |
|---|---|
| `tests/unit/load-order.test.mjs` | `index.html` == `tools/manifest.cjs`, including `HARD_EDGES` and the three-way `DEFERRED`/`BACKEND_FILES`/sw.js precache agreement |
| `tests/unit/scenery-api-contract.test.mjs` | the 109-member `scenery(api)` surface every circuit file was written against |
| `tests/unit/test-groups.test.mjs` | the test taxonomy: every group real, every source dir routed, `docs/TESTING.md` in step, `RENDER_SPECS` bidirectional |
| `tests/unit/docs-integrity.test.mjs` | live docs reference only files that exist; counts match the repo; no live doc reaches into the archive |
| `tests/unit/deploy-staging.test.mjs` | every path shipped code can fetch is inside the Pages upload allow-list |
| `tools/graph-parity.cjs` | scene-graph migrations are vertex-for-vertex identical to a baseline ref |
| `tests/unit/backend-surface-parity.test.mjs` | a renderer backend declares every GLX member, absent ones as explicit `undefined` (§5) |
| `tests/unit/module-size.test.mjs` | the game.js line ceiling — a ratchet, so extraction lowers it and regrowth fails |
| `tests/unit/vstd-invariant.test.mjs` + `tools/vstd-lint.mjs` | no `.speed` compared against a numeric literal without a written reason (§3) |
| `tests/unit/comment-citations.test.mjs` | a comment citing another file names a symbol that exists; ratchet on the cross-file-citation population |
| `tests/unit/silent-catch.test.mjs` | ratchet on bare `catch {}` — the escape hatch is a comment saying why, not a log line |

Where one of these exists, the invariant has held; where the same class of
invariant had only a comment, it has not. The archived journal is ~950 lines of
evidence for that sentence.

---

## 2. The physics authority

**The player is a world-space rigid body.** `px`/`pz`/`head` are the authority;
the car integrates its own position from tyre forces and owes the road nothing.
Track coordinates `(s, x)` are **read back** every frame by `trackFrom()` — a
predictor plus local Newton steps onto the perpendicular foot, deliberately
local so it cannot snap onto the wrong leg of a hairpin the way a global search
does. Exactly two things move the player in road coordinates, both hard
constraints: the barrier clamp and car-to-car collision resolution (now one
deduplicated kernel, `pairContact()` in `js/game.js`), and both write back into
`px`/`pz`.

**"The arc must not reach the driver."** With assists off, nothing derived from
track curvature or the racing line may affect the player — and the discipline
covers non-force channels, because auditing forces alone missed most of them:
rendered position interpolates in world space, the drawn nose angle is the real
heading, tyre squeal comes from body slip angle, barrier alignment uses the
barrier's own tangent. This is a **cross-cutting invariant with no guard**,
spread across two files and a dozen call sites, held by a table in `CLAUDE.md`
and the habit of asking which column a new `Tracks.curvature()` read belongs
in. It has held so far. It is exactly the shape of thing that stops holding.

**The pace discipline.** `PACE` is a ground-speed scale, not a cap. Anything
that divides a speed by `VMAX` or compares one against a literal must go
through `vTop()`/`vStd()` (and accelerations through `aStd()`). Four defects of
this one class were found across three passes before the rule got its guard:
`tools/vstd-lint.mjs` + `tests/unit/vstd-invariant.test.mjs` now fail the suite on a
raw `.speed`-vs-literal comparison unless the absoluteness is justified in
place. The lint sees speeds only; the acceleration case is recorded in its
header rather than asserted. Physics constants now live in
`js/game/physics-consts.js`, extracted from game.js under the module-size
ratchet.

---

## 3. Two-tier simulation

Easy to mistake for one system:

- **The driving model** — the per-axle bicycle model: deterministic,
  authoritative, the only thing that decides where the player's car is.
- **`js/game/debrisworld.js`** — a Rapier side-world for debris and kinematic
  car mirrors. It **never moves a game car**; that is its whole contract.
- **`js/game/incidentsim.js`** — the bounded exception: a windowed takeover
  that *may* move a car, safety contract in its header. `startRace()` calls
  `IncidentSim.reset()` before `makeCars()` because ownership is by `cars[]`
  index and a stale index would own a different car.

---

## 4. The `G` façade

`js/game.js` is the largest file in the repo (the figure lives in
`tests/unit/module-size.test.mjs`, the only place it cannot go stale). Extracted
modules never reach into it: game.js builds one `G` object of live
getters/setters plus stable helpers and instantiates each module as
`Module.create(G)`.

What it does: gives extraction a mechanical, reviewable shape — add accessors
rather than rewrite call sites. What it does not do: enforce anything. `G` is a
plain object; nothing stops a module reading a global directly, and nothing
stops `G` growing until it is game.js's closure with extra steps. It is a
**migration device left in place as an architecture**, and the distinction
matters when deciding what to extract next: candidates should be ranked by
**boundary crossings, not line count**. The garage live preview is ~415 lines
but needs a car-drawing seam that does not exist; a light-store-sized module
with three crossings extracts in an afternoon. Ranking by size picks the wrong
one first.

---

## 5. The renderer seam

`js/render/gfx.js` selects a backend; three implement one surface: **GLX**
(WebGL2, the reference), **WGX** (WebGPU, feature-detected, falls back to GLX),
**TLX** (three.js r184/TSL, opt-in via `apex26.gfxBackend`). The fallbacks are
honest, and the two deferred backends (~550 KB nobody-runs code) are excluded
from the eager load with the three-way agreement asserted by
`load-order.test.mjs`.

**Installation is descriptor-copy onto GLX**, so every GLX call site keeps
working — with one sharp edge: a member the backend does not define keeps
GLX's *live function*, closing over a `gl`/`SHD`/`CHK` that stay null because
`GLX.init()` never ran. Every feature test written the obvious way
(`if (gfx.member)`) therefore passes, and the call dies one line later. This
bit twice, identically, before `tests/unit/backend-surface-parity.test.mjs` pinned
the fix (absent members declared as explicit `undefined`) — and found a second
instance on its first run.

**The cost is one look in three shading languages** — GLSL, WGSL, TSL, each
assembling the same lit/sky/fx/post chain. A visual change is three
implementations or it is a divergence. **WGX is not at parity and is frozen**:
no volumetrics, no MSAA path, no `gpuTimer`, no `createTextureArray`
(so no baked material pack and no procedural-material port either). It is
feature-detected honestly; it is not a peer.

---

## 6. Ideas worth preserving

Four decisions that solve their problem unusually well:

- **MAT-id-indexed material arrays** — one `TEXTURE_2D_ARRAY` whose layer index
  *is* the `MAT` id, so any surface textures from the per-vertex material id it
  already carries: no UV channel, no new attribute, blended not replaced, every
  failure path degrading to procedural without blocking boot.
- **The `FINISH_SURFACE` remap** — livery finishes applied by remapping the
  body-paint surface id, not by touching a shader. A material axis for the cost
  of an indirection.
- **Extrapolate along `s`** — a late multiplayer packet dead-reckons along the
  arc coordinate, which follows the road by construction, so extrapolation
  *cannot* put a rival into a barrier. The failure mode is deleted by choosing
  the right coordinate, not clamped after the fact.
- **`TrackGraph` records ops, not triangles** — scenery replay runs through the
  same guarded emitters, so geometry and on-track suppression are unchanged by
  construction, and `tools/graph-parity.cjs` proves it vertex-for-vertex
  against a baseline ref. That gate is the pattern to apply more widely.

---

## 7. Open defects

Verified against the current tree. Everything fixed has moved to the archived
journal; this is what remains.

- **Montreal: a bridge support floats 2.72 m off the ground** against a 0.05 m
  allowance (`tests/specs/montreal-foundation.spec.js`). Deliberately left
  failing — it wants a geometry fix, not a wider tolerance. It spent part of
  2026-08 hidden behind a stale count assertion in the same spec that failed
  first; with the count re-pinned, the pier assertion is visible again and the
  product question it asks is still unanswered.
- **Per-circuit vertex budgets are ad hoc; the repo-wide gate is missing.**
  Qatar itself is resolved — cut 340,858 → 299,386 (a redundant street-lamp
  dressing pass and an over-tripled flood run) with the budget re-set to
  310,000, justified in the spec's own comment — but Vegas builds 1,825,925
  prop vertices (~80 MB of GPU buffer at the real interleave, against the
  ~100 MB where iOS jetsams the page) with **no cap at all**.
  `verify-track.cjs` already computes the number; the gate is a threshold plus
  the existing ratchet pattern.
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
  two are stale. The hud-layout coverage gap
  is closed for landscape (`HUD_LANDSCAPE_ONLY` now checks `.hud-top`,
  `.hud-gaps`, `#minimap`, `#hud-sectors`); portrait is deliberately excluded,
  with the measured `.hud-top`/pausebtn overlap documented as unreachable
  behind the full-screen `#rotate-device` block.
- **A13 zoom/rect sites — closed.** `js/game/css-zoom.js` (`CssZoom`) is the
  shared helper: `viewportRect` / `localBox` / `toLocalDelta` (+ a one-shot
  `rectsAreVisual` probe). Call sites: garage lens shift (`game.js`
  `renderSetupPreview`), `menunav` `nearestPane` + wheel→`scrollTop`,
  `sheetshape` thresholds via `localBox` (clientWidth, engine-safe). **Data hub
  now scales:** `.dh-card { zoom: var(--ui-scale) }` with `--svhz`-based heights;
  telemetry scrubber uses `CssZoom.viewportRect`.
- **No CSP.** `index.html` ships no Content-Security-Policy of any kind.

### Found by the 2026-08 whole-codebase survey (unverified beyond a code read)

Each was found by reading the file, not by a failing test. The 2026-08-13
cleanup session worked most of this list off — the fixed entries are gone from
here and their narratives are in the archived journal — so what is left is what
survived a fix wave, plus what that session's own gates surfaced. Listed
most-load-bearing first.

- **A possible curvature-sign inconsistency**, flagged independently by three
  surveyors. The measured convention is `+k = LEFT` (`js/track/spline.js`, the
  `bankingProfile` fix, `js/game.js`, and the agent `CONVENTIONS` string all
  agree), but a stale `findCorners` header (`js/track/mesh.js`) reads
  `+ = right`, and several sites encode that reading: `buildKerbs` (which feeds
  `onKerb()` physics), the tyre-barrier pass and corner/braking signage in
  `tracks.js`, and the agent camera's outside-of-corner azimuth in
  `js/game/apex.js` (`cinematic()`/`tourShots`). They are mutually consistent,
  which is why nothing caught it — and the tracks ship with passing autopilot
  laps and visual specs, so the physics-facing signs are most likely correct and
  the *comments* are the drift. **Do not flip any sign without a rendered lap
  that shows kerbs/barriers on the wrong side** — settle it by observation, not
  by grep. If real, it puts kerbs and tyre walls on the inside of every corner.
  The 2026-08-13 barrier fix stayed deliberately **vertical only** for this
  reason: it moved wall heights onto the banking pivot and touched no lateral
  term and no sign.
- **The wall clamp is bypassed while `IncidentSim` owns the car.** A wall hit of
  severity ≥34 hands the car to the incident window, and the ownership check in
  `js/game.js`'s barrier step then skips the clamp entirely — so the player
  tumbles through the barrier instead of being held by it. Player-only, RNG-free
  and **pre-existing**: `tests/specs/collisions-deep.spec.js` fails 2/2 at the
  session-start commit with the identical values, and the spec now isolates the
  clamp through the sanctioned `__apex.incident` flags-off path so it tests the
  clamp rather than the takeover. The product question is untouched: should
  `wallAt` remain an outer bound during an R2 takeover, or is passing through
  the barrier the intended cost of a launch?
- **Red Bull Ring's barrier dressing coverage has collapsed.**
  `tests/specs/redbull-foundation.spec.js` asserts `walls.tightFrac > 0.99` and
  measures **0.225** — 16 tight nodes out of 1,071. Confirmed pre-existing: a
  headless recompute is byte-identical between the session-start commit and the
  fixed tree. This wants a dressing pass over the circuit, not a tolerance edit.
- **`__apex.scene()` disagrees with its own spec about corners behind the
  camera.** `tests/specs/agent-view.spec.js` asserts `|bearingDeg| > 120` for a
  corner flagged `behindCamera`; Monza measures **108.1°**, and the value is
  stable across camera states (107.7° before a `snapCam()`), so it is not a
  flake — it is a genuine disagreement between the bearing convention the spec
  encodes and the one the code computes. Neither side should move before the
  convention is settled.
- **Cross-backend shading divergences the parity test cannot see**: TLX ports the
  pre-fix wet-surface model (soaked grass mirrors the sky on three.js; the wet
  mirror floor is 0.15 vs GLSL's 0.55), and the MIRROR chrome surface id 27
  exists only in GLSL, so chrome liveries lose their mirror on both WGX and TLX.
  These are renderer-parity work, not GLX defects.
- **The relational agent policy under-drives, and the bench can finally say so.**
  `tests/specs/agent-drive-bench.spec.js` › "relational policy out-drives the
  blind baseline" was red on a premise nobody trusted: the episode started at
  lap fraction 0.02, where traffic cannot arrive, so the result was deal-luck
  and the spec's own comment said as much. With the start moved to a measured
  near-straight (0.4) the bench is honest and **still red** — `relational.dist`
  245 against a `> 327` / `naive×1.5` floor. That is now a real
  agent-policy/physics-tuning finding rather than a harness artifact.
  `test:agent` is not in the CI smoke job, which is why it sat unseen.
- **Test-quality gaps** (from the whole-`tests/` read). One true never-fail:
  `tests/specs/ui-button-touch.spec.js`'s "throttle button visible" wraps its only
  `expect` in `if (count > 0)`, so a missing button passes. `menu-survey` and
  `parts-catalog` join the known `ui-audit` gallery as assertion-light. The banked-reference measurement error (fixed in the Monza and
  Spa foundation specs with a local `Tracks.banking()` term) is still latent in
  **Zandvoort's** foundation spec and ~12 others whose probes miss a bankZone —
  the durable `groundY`/`overRoad` fix above is what retires the whole class.
  `tests/unit/coplanar-faces.test.mjs` kept the `>= 24` roster floor its sibling
  `prop-clipping.test.mjs` tightened to `=== roster`, so its sweep can silently
  drop 16 circuits. The lone `.test.cjs` suite is invisible to the doc-count
  regexes.
- **`js/data/live.js` still labels a missing gap "+1 LAP".** `F1API.positions()`
  no longer fabricates a 1.000 gap where it has no `timeDiff`, so the bar is
  correctly absent — but the label the bar carried was not fixed with it, and it
  is the half a viewer actually reads.
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

## 8. Backlog

Deferred with reasoning, none lost:

- **game.js extraction candidates**, ranked by boundary crossings (§4): garage
  live preview ~415 ln (blocked on a car-drawing seam), camera disclosure
  ~324, pre-race screens ~261, liveries ~161, sky state ~107. (Cam modes was
  taken: `js/game/cam-modes.js`.) The 2026-08-13 structure panel re-affirmed
  this list as the live decomposition plan and made it **forced rather than
  optional**: both ratchets are saturated (`js/game.js` and `js/game/apex.js`
  each sit one line under their ceiling), so the next net-positive edit to
  either file fails the suite. Candidates may be **added** only after
  re-measurement by function body (brace count) — the gap-to-next-function
  method inflated `endRace` from 64 lines to "383" by attributing the
  un-extractable `G` façade block to it, and figures derived that way are
  discredited. The `updateCar()` and `render()` megablocks stay fenced.
- **`wrapDelta` / shared `clamp`/`lerp` — RESOLVED.** All three now live on
  `M4` (`js/mat4.js`, the 2nd script tag, so every consumer including the
  deferred backends can bind them at eval; they hang off the existing global
  rather than becoming a third one). Consumers ALIAS
  (`const clamp = M4.clamp;`), so hot paths keep their old call shape. 16 clamp
  copies, 6 lerps and 5 of the 7 arc-wrap sites migrated;
  `tests/unit/shared-math.test.mjs` pins the semantics and RATCHETS against a
  new private copy. The divergent `js/track/scenery-structures.js` clamp
  (`Math.max(lo, Math.min(hi, v))`) was **not a bug** — the two forms differ
  only above an inverted range, on `-0`, and on a non-number argument, and all
  eight of its call sites pass finite numbers with `lo < hi`; migrated anyway,
  proven vertex-for-vertex by `tools/graph-parity.cjs --all`. Deliberately
  LEFT inline: `updateCar()`'s signed wrap (physics inner loop, and its
  characterization golden is a browser spec), and `headInterp`/`yawVisInterp`,
  which fold an unbounded heading and need a loop rather than one fold.
- **Elevation-profile drawing duplicated in `js/game/menus.js` — RESOLVED.**
  One local `drawElevProfile(cv, t, showEl)`; the only real difference between
  the two blocks was which element carries the `hidden` state.
- **`simTilt`/`tiltSteering`** now share `tiltTarget()`/`tiltSlew()`;
  `tests/specs/tilt-pipeline.spec.js` pins every stage so the next re-inlining fails.
- **Mobile-tier detection ×4 — RESOLVED.** `js/render/glx.js` is the one copy
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
  `tools/assert-audit.mjs` now grades every test in the tree
  asserting/implicit/vacuous and `tests/unit/assert-audit.test.mjs` fails on a
  vacuous body anywhere outside that one allow-listed file.
- **`tests/specs/tracks-visual.spec.js` baselines were never generated** — the spec
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
  `js/track/themes.js`'s `variants` tables (zero readers anywhere) and
  `CarMesh.getBoostFlame`.
- **The CSS class-count ratchet is installed; the collapses are not finished.**
  The 2026-08-13 panel recorded its non-installation as execution debt; a
  ceiling now exists in the `module-size.test.mjs` idiom, alongside a shell
  node-count ceiling guarding the premise the keep-the-monolith ruling rests
  on. The first three one-surface collapses took the count 543 → 538; the
  remaining clusters are ordered **behind** the zoom/data-density migration
  where they touch the same surfaces.

---

## 9. Lessons

**A guard nobody runs is prose with extra steps.** Two of the repo's own guards
sat red in the working tree before the CI gate existed; the gate's first clean
run surfaced fourteen failures that had been red for an unknown time. Nothing
had drifted that day — the observation had been missing.

**A test harness that lies produces defects that look like the product's.**
Three "product" failures in one pass were the harness: an orphaned process tree
faking ten timeouts, `fullyParallel` over circuit-building specs faking a
memory event, and a reporter slicing raw lines so one spec's `Received:` was
read as another's — recording a bit-stable build as nondeterministic.

**In markup, "no reference" means "no reference I looked for."** A scan of
`index.html`'s ids against `js/`+`css/` reported 45 unreferenced; the honest
removable count was 0 — 14 were `aria-*`/`for=` targets inside the HTML itself
and 31 were built by string concatenation at runtime. The parallel CSS audit
reported 224 dead classes and every one was produced by an `el(tag, className)`
helper. Never run a naive pruner here.
