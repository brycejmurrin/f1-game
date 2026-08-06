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
| `tests/load-order.test.mjs` | `index.html` == `tools/manifest.cjs`, including `HARD_EDGES` and the three-way `DEFERRED`/`BACKEND_FILES`/sw.js precache agreement |
| `tests/scenery-api-contract.test.mjs` | the 107-member `scenery(api)` surface every circuit file was written against |
| `tests/test-groups.test.mjs` | the test taxonomy: every group real, every source dir routed, `docs/TESTING.md` in step, `RENDER_SPECS` bidirectional |
| `tests/docs-integrity.test.mjs` | live docs reference only files that exist; counts match the repo; no live doc reaches into the archive |
| `tests/deploy-staging.test.mjs` | every path shipped code can fetch is inside the Pages upload allow-list |
| `tools/graph-parity.cjs` | scene-graph migrations are vertex-for-vertex identical to a baseline ref |
| `tests/backend-surface-parity.test.mjs` | a renderer backend declares every GLX member, absent ones as explicit `undefined` (§5) |
| `tests/module-size.test.mjs` | the game.js line ceiling — a ratchet, so extraction lowers it and regrowth fails |
| `tests/vstd-invariant.test.mjs` + `tools/vstd-lint.mjs` | no `.speed` compared against a numeric literal without a written reason (§3) |
| `tests/comment-citations.test.mjs` | a comment citing another file names a symbol that exists; ratchet on the cross-file-citation population |
| `tests/silent-catch.test.mjs` | ratchet on bare `catch {}` — the escape hatch is a comment saying why, not a log line |

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
`tools/vstd-lint.mjs` + `tests/vstd-invariant.test.mjs` now fail the suite on a
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
`tests/module-size.test.mjs`, the only place it cannot go stale). Extracted
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
bit twice, identically, before `tests/backend-surface-parity.test.mjs` pinned
the fix (absent members declared as explicit `undefined`) — and found a second
instance on its first run.

**The cost is one look in three shading languages** — GLSL, WGSL, TSL, each
assembling the same lit/sky/fx/post chain. A visual change is three
implementations or it is a divergence. **WGX is not at parity and is frozen**:
no volumetrics, no PCSS, no MSAA path, no `gpuTimer`, no `createTextureArray`
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
  allowance (`tests/physics-montreal-foundation.spec.js`). Deliberately left
  failing — it wants a geometry fix, not a wider tolerance.
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
- **A19 residue.** Dead CSS tokens `--btn-col` (`css/overlays.css:32`) and
  `--ped`/`--act` (`:465`) have no consumer anywhere; `css/overlays.css` still
  carries mutually inconsistent measured cluster widths in comments (the
  "467px" family) of which at least two are stale. The hud-layout coverage gap
  is closed for landscape (`HUD_LANDSCAPE_ONLY` now checks `.hud-top`,
  `.hud-gaps`, `#minimap`, `#hud-sectors`); portrait is deliberately excluded,
  with the measured `.hud-top`/pausebtn overlap documented as unreachable
  behind the full-screen `#rotate-device` block.
- **The A13 zoom/rect sites are all still open.** UI SIZE is `zoom` on four
  subtrees, and four call sites mix zoomed and unzoomed coordinate spaces: the
  garage lens shift (zoomed `#cs-inner` rect over unzoomed canvas width),
  `menunav`'s `nearestPane()` (viewport point vs zoomed pane rects) and its
  wheel delta (viewport `deltaY` onto local `scrollTop`), and `sheetshape`'s
  `classifyPair()` (viewport rect width vs a local-space `--pair-at`
  threshold — the one where pre-26.4 WebKit is *right* and Chrome is wrong, so
  the Chromium suite has no baseline for it). No shared `currentCSSZoom`
  helper exists yet, and it is necessary but not sufficient: two sites need
  the opposite conversion. Related: **the data hub does not scale at all** —
  `#datahub` sits outside every zoomed subtree and `css/data.css` has zero
  `zoom` declarations; the helper must land before that changes, or the hub's
  scrubber becomes a new A13 site.
- **No CSP.** `index.html` ships no Content-Security-Policy of any kind.

### Found by the 2026-08 whole-codebase survey (unverified beyond a code read)

Each was found by reading the file, not by a failing test; none is fixed here
(a cleanup pass must not change behaviour without the test that pins it). Listed
most-load-bearing first.

- **Multiplayer event channel is not authority-gated** (`js/net/netplay.js`
  `bindSession`). The A4 fix gated the *state* channel (host routes on
  `remoteFor(fromId)`, drops unknown senders) but the *reliable event* channel
  applies `EV.CAUTION`/`EV.START`/`EV.RESULT` from any peer, and `EV.QUALI`
  accepts a caller-supplied `driverId` — so a guest can raise a caution, re-arm
  the start clock, or post another driver's qualifying time. Receipt of these
  should be gated `role === "guest"` (guests trust the host by construction; the
  host must not trust a guest). Needs the net suite to pin it.
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
- **Banked-reference class, in geometry this time** (not just the test probes of
  the entry above): the tyre-barrier and street-barrier loops in `tracks.js`
  place walls off `py[k]` without `bankOffsetAt`, so on Zandvoort's 18–19°
  banking a tyre wall sits ~2.3 m off the tarmac.
- **`incidentsim.js`**: `RETAIN_FLOOR` collapses to the measured speed unless it
  is exactly 0 (contradicting its "never dead-stopped into instant rescue"
  comment), and the `notifyCar` gate makes the r2-airborne-only launch path
  unreachable.
- **`career.js`** `matePts` is recomputed from finishing position without the
  `mate.retired` check the comment six lines above warns is required — corrupting
  a MY TEAM sponsor "double" fact.
- **`js/game/agentview.js` `describe("span:N")`** treats a span's `s0/s1` as arc
  metres, but the registry stores lap fractions — every `fromS/toS/lengthM` it
  returns is off by a factor of `track.total`, while `worldModel()` handles the
  same records correctly.
- **`js/game/spotify.js`** the setup-panel PLAY button calls `player.resume()`,
  null in remote mode, so it silently does nothing (should be `BACKEND.start()`).
- **`gridUp()` draws `simRnd()` inside an `Array.sort` comparator**
  (`js/game.js`), so the seeded position after a grid-up depends on the engine's
  sort implementation — forfeiting the cross-engine half of the "same seed +
  same inputs → same result" contract that `driverSkill()` protects one function
  above. A random comparator is also formally inconsistent. Draw the jitter into
  a keyed array first, then sort on the key.
- **`buildStudioRig()` emits 14-float light records into the stride-15 light
  pipeline** (`js/game.js` vs `glx.js`'s `nL = L.length/15`), so every
  `__apex.studio()` lamp after the first is misread and one is dropped; the
  sibling `buildSetupPreviewLights` pushes the correct 15. Dev-hook only.
- **Cross-backend shading divergences the parity test cannot see**: TLX ports the
  pre-fix wet-surface model (soaked grass mirrors the sky on three.js; the wet
  mirror floor is 0.15 vs GLSL's 0.55), and the MIRROR chrome surface id 27
  exists only in GLSL, so chrome liveries lose their mirror on both WGX and TLX.
  These are renderer-parity work, not GLX defects.
- **`tests/agent-drive-bench.spec.js` › "relational policy out-drives the blind
  baseline on interlagos" is red** and predates this cleanup — the untouched
  session-start commit fails it with the identical value (`relational.dist` 251
  against a `> 300` / `naive×1.5` floor), so the relational agent policy simply
  under-drives Interlagos. An agent-policy/physics-tuning issue, not a
  cleanup regression; `test:agent` is not in the CI smoke job, which is why it
  sat unseen.
- **`#track-detail` regressed from a real `<dialog>` back to a
  `<div role="dialog">`** in a merge (the markup at `index.html`), so it no
  longer traps focus or joins the top layer — `tests/menu-keyboard.spec.js`'s
  "Tab cannot escape the track-detail dialog" fails, and `topmodal.js`'s own
  comment still says it "migrated to a real dialog". Confirmed pre-existing (red
  at the session-start commit) and left for a dedicated fix: it is a modal
  migration, not a markup swap — the show path (`menus.js` `modal.hidden=false`,
  view-transition-wrapped), the close path (`data-esc-close`/uilayers), and
  `css/track-detail.css`'s fullscreen positioning all have to move to
  `showModal()`/`close()`/`dialog.screen` together. The restoring change already
  exists on an unmerged commit (`33976903`); cherry-pick it rather than
  reconstruct blind.
- **`results.js`** the human-rival " PLAYER" tag is `appendChild`-ed and then
  destroyed by a `textContent` assignment on the next line, so it never renders
  (quali.js does the same thing in the correct order).
- **Test-quality gaps** (from the whole-`tests/` read). One true never-fail:
  `tests/ui-button-touch.spec.js`'s "throttle button visible" wraps its only
  `expect` in `if (count > 0)`, so a missing button passes. `menu-survey` and
  `parts-catalog` join the known `ui-audit`/`ui-desktop` galleries as
  assertion-light. The banked-reference measurement error (fixed in the Monza and
  Spa foundation specs with a local `Tracks.banking()` term) is still latent in
  **Zandvoort's** foundation spec and ~12 others whose probes miss a bankZone —
  the durable `groundY`/`overRoad` fix above is what retires the whole class.
  `tests/coplanar-faces.test.mjs` kept the `>= 24` roster floor its sibling
  `prop-clipping.test.mjs` tightened to `=== roster`, so its sweep can silently
  drop 16 circuits. The lone `.test.cjs` suite is invisible to the doc-count
  regexes.
- **Smaller, catalogued but not itemised here**: `api.js` gives an upcoming GP's
  session list the 7-day historic cache TTL; `sdp.js` `pack()` over-allocates one
  byte (a stray `0x00`, decode-harmless); `live.js`'s gap bars read a `timeDiff`
  field `F1API.positions()` never returns (also in the archived audit); the
  EXPORT data tab still hardcodes its year list; several dev tools have
  exit-0 error paths and hardcoded chromium/port assumptions. The full 11-part
  survey with line references is the backlog record for the cleanup.

---

## 8. Backlog

Deferred with reasoning, none lost:

- **game.js extraction candidates**, ranked by boundary crossings (§4): garage
  live preview ~415 ln (blocked on a car-drawing seam), camera disclosure
  ~324, pre-race screens ~261, cam modes ~168, liveries ~161, sky state ~107.
- **`wrapDelta` helper** — the shortest-way arc-wrap idiom is hand-written at
  4 sites; one wrong copy sends a car backwards down the lap once per lap.
- **Elevation-profile drawing duplicated in `js/game/menus.js`** — two
  near-identical canvas blocks around its two `TrackMaps.elevProfile()` calls.
- **Shared `clamp`/`lerp`** — many local copies, one divergent
  (`js/track/scenery-structures.js`).
- **`simTilt`/`tiltSteering`** now share `tiltTarget()`/`tiltSlew()`;
  `tests/tilt-pipeline.spec.js` pins every stage so the next re-inlining fails.
- **Mobile-tier detection ×4** — reimplemented in four files; `js/game.js`
  omits `_forceMobile`, defeating `apex26.forceMobileTier` there.
- **`TUNE_DEFS` hand-mirrors** — the registry is restated in six places.
- **`GameStore`** has no cross-tab `storage` listener; two tabs silently
  overwrite each other's saves.
- **Assertion-free specs**: `tests/ui-audit.spec.js` (34 tests, 0 `expect`)
  and `tests/ui-desktop.spec.js` (5/0) are screenshot galleries presenting as
  tests — rename them as galleries or give them assertions.
- **`tests/tracks-visual.spec.js` baselines were never generated** — the spec
  is skip-gated on the snapshot dir existing; generating 40 circuit baselines
  on Linux/SwiftShader is its own operation.
- **Catalogued dead exports (~60)**, each wanting re-verification before
  deletion — the catalogue has been wrong before (`NetSnapshot.predict()` and
  `EV.BYE` were both re-reported dead while having live callers, and the GLX
  instancing path listed dead is exercised by `tests/instanced-draw.spec.js`).
  Still believed dead: `Career.isOwned`, `TrackSpline.centerline()` and the
  authored-`segs` path, the SRTM elevation branch, 8 of `Reliability`'s 14
  exports.

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
