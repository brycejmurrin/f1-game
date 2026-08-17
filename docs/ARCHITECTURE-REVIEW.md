# Apex 26 — architecture review

A review, not a reference. [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) is the
module contract and [`AGENTS.md`](../AGENTS.md) is the working reference; both
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
| `tests/unit/scenery-api-contract.test.mjs` | the 111-member `scenery(api)` surface every circuit file was written against |
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
spread across two files and a dozen call sites, held by a table in `AGENTS.md`
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
implementations or it is a divergence. WGX now publishes the GLX draw-API
surface (gpuTimer, texture arrays, lamp shadows, instancing, particles,
MSAA 2×) and stays opt-in; GLX remains the default. The tax is keeping the
two shader trees in sync, not an API wall. See
[research/WEBGPU-PARITY.md](research/WEBGPU-PARITY.md).

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

**2026-08-17 parallel survey** (new candidates, not yet worked): see
[`research/SURVEY-BUGS-PERF-2026-08-17.md`](research/SURVEY-BUGS-PERF-2026-08-17.md)
— WGX shared-`writeBuffer` before submit, career finished-season `trackIdx =
-1`, Singapore `lapMirror` portal supports, VSC/SC player pace, net contact vs
`predict()`, GLX env-probe frustum restore, TLX `fwidth` in non-uniform TSL
`If`. Items below remain the standing register until a fix wave absorbs them.

- **Montreal: a bridge support floats 2.72 m off the ground** against a 0.05 m
  allowance (`tests/specs/montreal-foundation.spec.js`). Deliberately left
  failing — it wants a geometry fix, not a wider tolerance. It spent part of
  2026-08 hidden behind a stale count assertion in the same spec that failed
  first; with the count re-pinned, the pier assertion is visible again and the
  product question it asks is still unanswered.
- **`hud-layout` `notched-landscape` — FIXED, validated 25/25 across all four
  viewports.** `#hud-sectors`' top offset is now derived from `var(--tap)`
  (`css/hud.css`) instead of a hard-coded 56, and the short-landscape override
  that pulled it UP to 52 is gone (`css/responsive.css`). Kept below for the
  diagnosis, which is the reusable part. All six variants
  (tilt/buttons/touch × auto/manual gears) fail with three layout problems where
  the spec expects none; the other viewport rows pass, so it is the VIEWPORT —
  852×393 with real safe-area insets (`sal 59, sar 59, sab 21`) — not the input
  mode. Confirmed PRE-EXISTING at `d7a1158` by an A/B on a quiet box, both sides
  via `tools/test-solo.mjs` (which refuses to start above its load gate):
  `HEAD` 6/6 fail at 20.3–22.1 s, base worktree 6/6 fail at 21.7–22.8 s. No
  timeouts on either side — these are assertion failures, not contention. Repro:
  `node tools/test-solo.mjs tests/specs/hud-layout.spec.js -g notched-landscape`.

  **Diagnosed — one collision, and it IS player-visible.** A `--reporter=list`
  run gives the actual payload: `hudClash: ["#hud-sectors+pausebtn"]` (a single
  pair; the "Received +3" in the live reporter is diff LINES, not items). The
  arithmetic: `#pausebtn` is `width/height: var(--tap)` at `top: calc(8px + …)`
  (`css/overlays.css:477`), so on touch — where `--tap: 52px`
  (`css/tokens.css:405`) — it spans y 8→60. `#hud-sectors` is pinned at
  `top: calc(56px + …)` (`css/hud.css:156`). **A 4 px overlap.** The 56px
  constant works against the 44px desktop `--tap` (44+8 = 52 < 56) and stops
  holding at 52. `css/overlays.css:492` records a sibling of the same bug class
  ("on touch (--tap: 52px) CHASE overlapped…"), so this is a known trap, not a
  novel one.

  Why it matters more than the portrait case the spec already dismissed: that
  one (`.hud-top`+`#pausebtn`, a measured 8.7px collision) is unreachable
  behind the full-screen `z-index: 9000` `#rotate-device` block, which is why
  `HUD_LANDSCAPE_ONLY` exists and why the spec author correctly refused to move
  CSS nobody could see move. In LANDSCAPE `#rotate-device` is not up, so this
  collision is on screen: the sector splits sit on the pause button on a
  notched phone. The fix is to derive the sectors' offset from the button's
  real box (`8px + var(--tap) + gap`) instead of the hard-coded 56 — which
  leaves desktop unchanged (44+8+4 = 56) and moves touch down 8px. Note also
  that the two elements scale the safe-area inset differently (`#hud-sectors`
  divides `--sar`/`--sat` by `--hud-scale`, `#pausebtn` does not), so they
  additionally drift apart at non-default HUD SIZE — worth settling in the same
  pass.
- **`menu-keyboard` › "left/right move along a chip row without leaving it" is
  red** (`tests/specs/menu-keyboard.spec.js`, the desktop keyboard/trackpad
  block). Confirmed PRE-EXISTING at `d7a1158` by a quiet-box A/B, both sides via
  `tools/test-solo.mjs` and both started at load 1.24: `HEAD` fails in 20.6 s,
  base fails in 18.4 s. No timeout on either side, so it is an assertion, not
  contention. This is the SECOND red test in this file — the `#track-detail`
  dialog regression above owns "Tab cannot escape the track-detail dialog" — so
  the file is worth one pass rather than two separate fixes. It is the only
  failure in `test:ui`, which otherwise runs 100/100.
- **`props-over-road` is red on COTA and Indianapolis** — `cota` 4.65 m and
  `indianapolis` 4.74 m over the road against a 0.2 m cap
  (`tests/specs/props-over-road.spec.js`). COTA is one of the 15 circuits that
  spec's own header calls "fully clean (max=0)", so this is a regression, not a
  residual.

  **Both offenders are located and are the same class: a big bespoke
  `structure`, not foliage, barriers or lighting.** Measured with
  `TRACK=<id> PORT=<p> node tools/measure-props-over-road.mjs`, then matched to
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
  WRONG: `js/track/models.js` does preflight every group. It just checks the
  wrong thing — it tests the bounds the author DECLARED and never looks at what
  was actually emitted, so a group can pass the guard and then put its geometry
  somewhere else. `cota-amphitheater` declares
  `center = vadd(vadd(a.c, a.r, 8), a.u, 13)` and emits its stage deck at the
  anchor, so the tested box sits 8 m further from the circuit than the geometry.
  `modelGroup` now measures this (`diagnostics.escaped`, read via
  `__apex.modelDiagnostics()`): the amphitheater escapes its declared box by
  **9.0 m along the RIGHT axis** — laterally, toward the track — which is the
  4.79 m of geometry over the racing line. Reported, not rejected: enforcing
  would delete authored scenery across 40 circuits on an unmeasured rule.

  **Indianapolis is NOT this bug.** Same instrument: 15 of its 21 groups escape
  their declared bounds, but every one is vertical (≤0.44 m aprons/greens) and
  **zero escape laterally**, so the declared-bounds gap cannot be what puts
  geometry over its road. Its offender still needs a cause. (COTA: 4 of 12
  escape; only the amphitheater does so sideways.) The vertical population is
  large enough on both circuits that any future promotion to a hard rejection
  must be lateral-only, or it will fail 40 circuits on harmless apron slack.
  Confirmed PRE-EXISTING at
  `d7a1158`, not introduced by the instancing-key hoist: `BASE=HEAD~1 node
  tools/graph-parity.cjs cota indianapolis` returns exact parity
  (max |Δpos| 0.0e+0 m), and a geometry test over identical geometry returns an
  identical verdict. Unseen because `test:scenery` is not in the CI smoke job —
  the same gap that let `agent-drive-bench` sit red, and the standing argument
  for why "a guard nobody runs is prose with extra steps" (§9).
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
- **Red Bull Ring's barrier coverage — FIXED (2026-08-13), and the mechanism
  was general.** tightFrac 0.225 was not missing dressing: sceneryRange()
  collapsed every authored full-lap span to zero width (wrap01(1) === 0)
  before the full-lap guard could see it, so lap-round barriers tightened
  ONE node per side on shifted circuits. Fixed in js/track/space.js by
  short-circuiting width >= 1 to {0, 1} — a whole lap is frame-invariant.
  Verified: fleet A/B shows redbull only (0.225 -> 1.000), characterization
  + redbull-foundation + tiny + guards all green.

- **`__apex.scene()` disagrees with its own spec about corners behind the
  camera.** `tests/specs/agent-view.spec.js` asserts `|bearingDeg| > 120` for a
  corner flagged `behindCamera`; Monza measures **108.1°**, and the value is
  stable across camera states (107.7° before a `snapCam()`), so it is not a
  flake — it is a genuine disagreement between the bearing convention the spec
  encodes and the one the code computes. Neither side should move before the
  convention is settled.
- **Title-screen CLS — FIXED, and the method is the point.** The title screen
  used to paint in the wrong shape and relay out: `body[data-density]` picks
  `#overlay`'s one- vs two-column grid, and `js/game/sheetshape.js` wrote it on
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
  `js/track/themes.js`'s `variants` tables (zero readers anywhere) and
  `CarMesh.getBoostFlame`.
- **The CSS class-count ratchet is installed; the collapses are not finished.**
  The 2026-08-13 panel recorded its non-installation as execution debt; a
  ceiling now exists in the `module-size.test.mjs` idiom, alongside a shell
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
