# Apex 26 — architecture review

A review, not a reference. [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) is the
module contract and [`CLAUDE.md`](../CLAUDE.md) is the working reference; both
describe the system as it is meant to be. This describes **how it is actually
built, what that costs, and what has drifted** — and carries the defect register
the review produced, including the items deliberately left undone.

Written after a pass over the whole codebase. Every claim below was checked
against the code, and where a number appears it was measured, not recalled.

---

## 1. What this is

An unofficial WebGL2 Formula 1 fan game. ~150 JavaScript files, no build step,
no bundler, no framework, no dependency at runtime that is not vendored into the
repo. `index.html` carries 140 `<script>` tags; `tools/manifest.cjs` lists 137
eagerly-loaded files plus 2 deferred renderer backends. It is served as static
files from GitHub Pages.

The scope is not small: 40 circuits, three renderer backends, a career mode with
six save slots, a four-player peer-to-peer multiplayer stack with no server, a
procedural car with a twelve-category upgrade catalog, and a text-native agent
API for driving the game without a screen.

---

## 2. The founding bet, and what it forces

**No build step.** Every file is a `"use strict"` IIFE assigning one global.
Load order is hand-maintained. There is no `import`, no `export`, no transpile,
no minify, no source map.

What it buys is real and worth naming: the file you edit is the file the browser
runs. There is no build to be stale, no bundler config to be wrong, no moment
where the deployed artifact and the source diverge. On a project with no team and
no CI, that eliminates an entire category of failure.

What it costs is the rest of this document.

Because nothing is **generated**, every consistency property that a compiler
would enforce has to be enforced some other way — or not at all. Three
consequences follow, and every defect the review found falls under one of them:

1. **Load order is a hand-maintained global invariant.** 137 files, where B
   reading A's global at evaluation time is a real dependency with no
   declaration.
2. **Every module boundary is a convention.** Nothing prevents any file from
   reaching into any global. The `G` façade (§5) is a discipline, not a
   mechanism.
3. **Consistency between two places is manual** — a field authored here and read
   there, a doc describing code, a count quoted in prose.

### The governing law

> **What a test asserts stays true. What only prose says drifts.**

This is the single strongest pattern in the codebase, and it holds in both
directions with almost no exceptions. Every invariant with a guard behind it is
intact. Nearly every invariant stated only in a comment or a doc has rotted —
and, crucially, the rot is usually **silent**, because the fallback path is
always a legitimate value.

The project already knows this. Its answer is a family of tests that assert
structure rather than behaviour, and they work:

| Guard | What it holds |
|---|---|
| `tests/load-order.test.mjs` | `index.html` matches `tools/manifest.cjs` exactly, including eval-time `HARD_EDGES` |
| `tests/scenery-api-contract.test.mjs` | the 107-member `scenery(api)` surface every circuit file was written against |
| `tests/test-groups.test.mjs` | the test taxonomy: every group real, every source dir routed, `docs/TESTING.md` in step |
| `tests/docs-integrity.test.mjs` | live docs reference only files that exist; CLAUDE.md's counts match the repo |
| `tests/deploy-staging.test.mjs` | every path shipped code can fetch is inside the Pages upload allow-list |
| `tools/graph-parity.cjs` | scene-graph migrations are vertex-for-vertex identical to a baseline ref |

The lesson the review kept re-learning: **where one of these exists, the
invariant held; where the same class of invariant had only a comment, it did
not.** §7 is the evidence.

### The gap under all of it

**There is no CI gate.** `.github/workflows/` holds two workflows. `pages.yml`
fires on a push to the deploy branch and deploys — it runs no tests. Nothing else
runs tests either. 101 Playwright specs and 37 `node --test` suites are gated by
whether a human remembered.

This is why two of the repo's own guards were found **red on arrival** during
this review (§7, B2). Not stale by months — red, in the working tree, with the
test file sitting right there. The suite is good. Nothing runs it.

---

## 3. The physics model, and its inverted authority

The single most important thing to understand before touching `js/game.js`.

**The player is a world-space rigid body.** `px`/`pz`/`head` are the authority.
The car integrates its own position in world metres from tyre forces and owes
the road nothing. The track coordinates `(s, x)` are **read back** off that
position every frame by `trackFrom()` — a predictor plus two local Newton steps
onto the perpendicular foot — purely so the rest of the game can ask "where on
the track is that?" for lap timing, walls, kerbs, race position and the HUD.

This is an inversion of the obvious design, and it was arrived at the hard way.
The refinement is deliberately **local**: it never leaves a few metres of last
frame's `s`, so it cannot snap onto the wrong leg of a hairpin the way a global
`Tracks.project()` search does. That locality is what the road-frame integration
originally bought — and doing it this way keeps that robustness without
surrendering the car's independence.

Exactly two things may move the player in road coordinates, because both are
hard constraints rather than suggestions: the barrier clamp and car-to-car
collision resolution. Both write back into `px`/`pz`.

### "The arc must not reach the driver"

The more subtle half, and the one worth preserving. With the assists off,
**nothing derived from the track's curvature or its racing line may affect the
player** — and the discipline explicitly covers channels that are not forces,
because auditing forces alone missed most of them. Rendered position must
interpolate in world space, not lerp `(s, x)`. The drawn nose angle must be the
real heading. Tyre squeal must come from body slip angle, not `|k| * speed`.
Barrier alignment must use the barrier's own tangent.

The reason to name this in a review: it is a **cross-cutting invariant with no
guard**, spread across two files and a dozen call sites, held together by a
table in `CLAUDE.md` and the habit of asking which column a new read belongs in.
It has held so far. It is exactly the shape of thing that stops holding.

### The pace discipline

`PACE` is a ground-speed scale, not a speed cap. Everything measured in speed is
pace-normalised through two helpers next to `VMAX`: `vTop()` and `vStd(v)`. So
`VMAX`, `GEAR_TOP`, `GRASS_V` and `STEER_SPEED_REF` keep their literal values
while the gearbox still sweeps 1→8 and the dial still reads 0 → ~259 km/h at
every setting. Only lap times move.

The rule: **anything that divides a speed by `VMAX`, or compares one against a
literal, must pick `vTop()` or `vStd()`.** A bare `VMAX` silently makes the
slider shrink the player's envelope again.

This is a genuinely good piece of design. It is also, again, a convention with
no guard — and §7's A5 is precisely what happens when one site forgets it. The
comment above that line stated the invariant it was breaking.

---

## 4. Two-tier simulation

Worth naming because it is easy to mistake for one system:

- **The driving model** is the per-axle bicycle model above: deterministic,
  authoritative, and the only thing that decides where the player's car is.
- **`js/game/debrisworld.js`** is a Rapier side-world for debris and kinematic
  car mirrors. It **never moves a game car** — that is its whole contract.
- **`js/game/incidentsim.js`** is the bounded exception: a windowed takeover that
  *may* move a car, with its safety contract in its own header.

The separation is enforced by convention and by IncidentSim's hand-back
protocol. `startRace()` calls `IncidentSim.reset()` first, before `makeCars()`,
specifically because ownership is by `cars[]` index and a stale index would
otherwise own a completely different car.

---

## 5. The `G` façade — what it does and does not do

`js/game.js` is 8,078 lines and owns the closure state. Extracted modules in
`js/game/*` never reach into it directly: game.js builds one `G` object of live
getters/setters plus stable helpers and instantiates each module as
`Module.create(G)`.

**What it does:** gives extraction a mechanical, reviewable shape. A module can
be lifted out of game.js by adding accessors to `G` rather than by rewriting
call sites, which is why the extraction has got as far as it has.

**What it does not do:** enforce anything. `G` is a plain object; nothing stops a
module from reading a global directly, and nothing stops `G` from growing until
it is simply game.js's closure with extra steps. It is a *migration* device that
has been left in place as an *architecture*, and the distinction matters when
deciding whether the next extraction should widen it again.

It also does not shrink game.js on its own: 8,078 lines is up from the ~6,100 the
architecture doc still claims (§7, deferred/docs).

---

## 6. The renderer seam, and its price

`js/render/gfx.js` selects a backend; three implement the same surface:

- **GLX** — WebGL2, the default, the reference implementation.
- **WGX** — WebGPU, feature-detected, falls back to GLX.
- **TLX** — three.js r184 / TSL, opt-in via `apex26.gfxBackend = "three"`.

The seam is real and the fallbacks are honest. Two things about *how* a backend
is installed matter more than the seam itself:

**Installation is descriptor-copy onto GLX.** game.js does
`Object.defineProperties(GLX, Object.getOwnPropertyDescriptors(backend))`, so
every GLX call site keeps working unchanged. The consequence is sharp: **a name
the backend does not define keeps GLX's own function** — which closes over a
`gl`/`SHD`/`CHK` that stay null because `GLX.init()` never ran. The missing
feature therefore presents as a *live function*, so every feature test written
the obvious way (`if (gfx.lampShadowBegin)`, `if (!GLX.makeFrustumPlanes)`)
**passes**, and the call dies one line later inside GLX.

This has now bitten twice, identically (§7, A3). WGX's fix — declaring absent
members as explicit `undefined` — is the correct pattern, and is now asserted by
`tests/backend-surface-parity.test.mjs` rather than remembered.

**The cost is one look in three shading languages.** GLSL, WGSL and TSL, each
assembling the same lit/sky/fx/post chain. A visual change is three
implementations or it is a divergence. The deferred-loading decision (~532 KB
that every visitor used to parse for something almost nobody runs) was the right
call and is asserted three ways — `DEFERRED`, `BACKEND_FILES`, and the service
worker's precache seed must all agree, and `load-order.test.mjs` checks all
three. That is this codebase at its best.

---

## 7. Ideas worth preserving

Four decisions that solve their problem unusually well and should survive any
future refactor.

**MAT-id-indexed material arrays.** One `TEXTURE_2D_ARRAY` whose *layer index is
the `MAT` id*, so any surface can be textured from the per-vertex material id it
already carries. No UV channel, no new vertex attribute. Blended rather than
replaced (`albedo * tex.rgb * 2.0`), so per-track tarmac tint, racing-line wear
and per-vertex grain all survive. Every failure path — no pack, malformed pack,
a backend without `createTextureArray` — degrades to procedural, and boot never
awaits it.

**The `FINISH_SURFACE` remap.** Livery finishes (gloss/satin/chrome) are applied
by remapping the body-paint *surface id*, not by touching a shader. A whole
material axis for the cost of an indirection.

**Extrapolate along `s`.** A late multiplayer packet extrapolates along the arc
coordinate, which follows the road by construction — so dead reckoning
**cannot** put a rival into a barrier. The failure mode is deleted by choosing
the right coordinate rather than clamped after the fact. The same instinct shows
up in `s` and heading both wrapping the short way; getting that wrong sends a car
backwards down the lap once per lap.

**`TrackGraph` records ops, not triangles.** Scenery is a model library of
primitive ops in canonical space plus placement nodes, and replay runs through
the *same guarded emitters* — so geometry and on-track suppression are unchanged
by construction. What makes it trustworthy is the gate: `tools/graph-parity.cjs`
builds every track from a baseline ref *and* the working tree and diffs prop
geometry vertex for vertex. A migration that changes one vertex fails.

That gate is the pattern this codebase should apply more widely, and §2's law is
why.

---

## 8. The defect register

Everything the review found, with disposition. **Fixed in this pass** unless
marked otherwise.

### Tier A — live defects

| # | Defect | Disposition |
|---|---|---|
| A1 | MY TEAM sponsors stop paying after season 1: `paidSponsors` records a season-relative window index, `rollover()` cleared everything but it, so every season-2 window collided with an already-paid index and returned 0 *before* checking `met`. The hub still displayed progress, because that reads the cleared `career.results` | **Already fixed** before this pass, with a two-season regression test. Verified, not re-fixed |
| A2 | One guest dropping ended the race for everyone at 3+ players. The lobby's `sessions` list carried a connection `id`; the `peers` list beside it did not, so every joiner collapsed onto NetPlay's `PEER_ONE` fallback while sessions stayed keyed `g1`/`g2`. `remoteFor(id)` was therefore always null and the close handler fell through to `stop()`. Indistinguishable from correct at two players | Fixed |
| A3 | `__apex.scene({visible})` threw on TLX: neither `makeFrustumPlanes` nor `aabbInFrustum` was defined, so the descriptor-copy left GLX's arrows in place, closing over a null `CHK`. agentview's `!GLX.makeFrustumPlanes` guard is truthy for an inherited live function, so it passed and the next line threw | Fixed, plus `tests/backend-surface-parity.test.mjs`, which immediately found a second instance (TLX declared none of GLX's five instanced-draw members) |
| A4 | A guest could move any other player's car: `onState` routed every entry on the id in the packet with no check against the sending peer — and the host **relayed** the result, so it landed on every screen under the host's own name | Fixed |
| A5 | Beached-rescue gate not pace-scaled. The off-track speed floor is `GRASS_V * 0.6 * max(PACE, 0.05)`; the gate above it was a bare `GRASS_V * 0.6 + 1.5`, true only at `PACE = 1`. Above ~1.14 a beached car is never rescued; below ~0.57 a driver in full control is teleported to `x = 0`. Both are the bugs the comment directly above it says were fixed | Fixed |
| A6 | `yawVisInterp` lerped across the ±π seam, rendering a spinning car as briefly facing forward | **Already fixed** before this pass. Verified |
| A7 | `sectorBests`/`sectorLast` leaked between races: reset only inside `loadTrack`'s rebuild gate, so racing the same circuit twice at the same time of day kept session one's splits. Changing the time of day cleared them — two identical sessions differing on an unrelated setting | Fixed (moved into `startRace()`) |
| A9 | A failed `version.json` fetch defeated the peer build gate three ways: both peers failing gave `checkBuild(0, 0) → ok`, waving mismatched physics onto the same track; one failing produced "reload to update" advice that could not work, because the failure was memoised for the tab's lifetime; and the fetch lacked the cache-buster the shell guard uses, while `sw.js` falls back to cache after 3 s — so a slow link could reject a *matched* peer | Fixed, with a regression test |
| A10 | Five circuit-def fields silently dropped by the `Tracks.LIST` copy — `sunAzimBias`, `sceneryTheme`, `sceneryThemeOverrides`, `ownPitStraight`, `undulate` — all authored, all read off the *copied* def, all `undefined` at runtime. Qatar fell back to `desert` and Albert Park to `permanent`; Monza's pit opt-out did not opt out, so the generic fallback kept landing on the Tribuna Centrale, which is the exact bug the field was added to fix. The same trap had bitten once before and was fixed for one field only | Fixed, plus `tests/circuit-def-fields.test.mjs` — the guard is the real fix |
| A11 | Duplicate `__apex.diag` key: two `diag` members of one object literal, so the device/render diagnostic was unreachable, and `DEBUG-HOOKS.md` documented *that* dead version verbatim | Fixed — dead version deleted, its unique fields (canvas vs backing store, PerfGov tier/floor/strikes, GL capability probes, stored overrides) merged into the live `diag(opts)` |
| A12 | Career budget upgrade unreachable and advertised: `upgradeBudget()`/`budgetUpgradeCost()` have no caller outside `career.js`, so `budgetLvl` is permanently 0 — while the guide told the player, twice, that they got "three upgrades" | Text corrected and the mechanic marked not-yet-wired. **Wiring the UI is a feature and was deliberately not done here** |

### Tier B — the meta-guards

| # | Defect | Disposition |
|---|---|---|
| B2 | `tests/component-inventory.test.mjs` belonged to no `test:*` group, so nothing ever ran it — and it was **red**: `docs/COMPONENTS.md` still listed a `foot` class family and three dead classes since deleted from `css/`. Separately, `docs/TESTING.md` and `README.md` both quoted stale suite counts while `CLAUDE.md` was correct, because `docs-integrity.test.mjs` only checks `CLAUDE.md` | Fixed: doc corrected, test added to `test:tooling` and `test:tooling-fast`, all three counts reconciled |

Also folded in: `js/game/reliability.js` and `js/car/driver-ratings.js` both
asserted `makeCars()` spends "exactly one" `simRnd()` draw per driver. It spends
**two** — `driverSkill()` and the lane jitter. Determinism is unaffected, since
both are unconditional and unconditionality is what the contract actually needs,
but the count was wrong in the two places a reader would check before touching
the seeded stream.

### Tier C — deferred, with the reasoning

Recorded here rather than fixed. Nothing below is lost.

**A8 — lap double-count.** `lap` increments on a forward line crossing and there
is no `lap--` anywhere in `js/`, while `c.prog` *is* symmetric. Crossing the
line, being pushed back over it by `shiftLong` (up to ~4–5 m) or reversing, then
crossing again adds a second lap; `c.finished` can fire a full lap early.
Deferred because the fix touches race classification and wants its own test pass.
**Agreed approach when taken up: symmetric decrement** — mirror the `ds > 0` case
with a `lap--` on a backward crossing, matching `prog`.

**A13 — `getBoundingClientRect()` inside a zoomed subtree, on Safari.** The UI
SIZE / HUD SIZE feature is implemented as `zoom` on four subtrees (`.sheet`,
`#overlay > *`, the HUD clusters, `.dock`). WebKit returned **pre-zoom** rects
from `getBoundingClientRect()` for thirteen years
([bug 77998](https://bugs.webkit.org/show_bug.cgi?id=77998)); it was fixed only
in **Safari 26.4 (May 2026)**, so a large share of installed iOS is still wrong
today. Chrome and Firefox always returned the scaled values, which is why none
of this reproduces in the test suite — every spec here runs Chromium.

Two call sites mix a rect from inside a zoomed subtree with a coordinate from
outside one, and are therefore wrong on older iOS *by default*, because
`--ui-scale` ships at **1.15** on a coarse pointer:

- `js/data/telemetry.js:942` — `attachScrub()` maps `ev.clientX` (real viewport
  px) through `canvas.getBoundingClientRect()` (inside `.sheet`). Scrubbing the
  telemetry trace lands at the wrong time.
- `js/game.js:5139` — the garage lens shift divides `#cs-inner`'s rect width by
  the **unzoomed** canvas's `clientWidth`. The turntable is framed as though the
  panel were narrower than it is, so the car sits partly under it.

Deferred rather than fixed: both want a device to confirm on, and the honest fix
is a shared "rect in viewport space" helper (dividing by `currentCSSZoom`, or
reading `offsetX`) rather than two spot patches. **Worth doing before B4 decides
whether `zoom` stays** — it is the strongest argument found so far that it should
not. Note that `zoom` itself is otherwise sound: Baseline since May 2024, and
being standardised in CSS Viewport.

**Structural.**
- **No CI gate** — the headline. `.github/workflows/pages.yml` deploys
  unconditionally on push and runs nothing; 101 specs + 37 suites are gated by
  memory. Every other item in this document is downstream of this one.
- **No vertex budget gate** — `verify-track vegas` prints 1,825,925 prop verts
  and exits 0, on a codebase whose own comment names that VBO as the iOS jetsam
  trigger.
- **No CSP.**

**Dated.** Four hardcoded `/2026/` Jolpica URLs in `js/data/api.js` plus `YEARS`
in `js/data/hub.js` — the data hub silently empties in 2027.

**Silent failure.**
- 340 `catch` blocks in `js/`; 59 `Log` call sites in the entire codebase. The
  great majority of failures are swallowed.
- `js/net/` had **zero** `Log` call sites until A9's fix added the first, and
  `js/game/audio.js` still has none — so `Log.level("net:debug")` and its audio
  equivalent, both documented as the way to debug those subsystems, could not
  emit a line.
- `apex26.envProbeOff` is a one-way latch: one `setItem`, one `getItem`, no
  clear path, no UI, no docs.

**Convention drift.**
- `js/track/markings.js` is the only file of ~150 with no `"use strict"`, and the
  only bare-object-literal global.
- Mobile-tier detection is reimplemented four times, and `js/game.js` omits
  `_forceMobile` — defeating `apex26.forceMobileTier`.
- `GameStore` has no cross-tab `storage` listener.
- `TUNE_DEFS` is hand-mirrored in six places.

**Docs.** `docs/ARCHITECTURE.md` says a circuit "can destructure any of those 84
names" two lines after correctly calling it the 107-member contract, and says
game.js is "~6,100 lines" against a measured 8,078. `docs/DEBUG-HOOKS.md` and
`docs/AGENT-WORLD-API.md` both say "~89 hooks" (the latter annotated "measured at
runtime") against ~180 members on the object today.

Two further doc defects were reported to this review and did **not** survive
checking, recorded here so they are not re-reported: the parts catalog is
consistently documented as 12 categories in both `CLAUDE.md` and `README.md`,
which matches `Parts.CATALOG`; and `js/car/driver-ratings.js` is present in
`CLAUDE.md`'s file layout. Neither needed a fix.

**Dead code.** `Career.isOwned`; `EV.BYE`; GLX's instancing path;
`TrackSpline.centerline()` and the authored-`segs` path; the SRTM elevation
branch; 8 of `Reliability`'s 14 exports; ~60 further dead exports catalogued.
Three deserve individual mention because they are not merely unused:

- **`NetSnapshot.predict()`** — implemented, tested, exposed, and never called.
  Its docstring says contact must not be resolved against the delayed drawn
  pose; because nothing calls it, contact *is* resolved against a ~100 ms-stale
  pose.
- **`NetRendezvous.configured()`** is `() => true`, which makes two lobby error
  paths and the `NO_RELAY` string unreachable.
- **`seal`/`open`/`topicFor`** are tested with zero production callers, while
  `httpPut` posts plaintext — so `CLAUDE.md`'s claim that "the operator relays
  bytes it cannot read" is **false for the private Worker path**. This one is a
  security-relevant documentation error, not just dead code, and should be
  either implemented or the claim withdrawn.

---

## 9. If you fix one thing

Add a CI gate. Not because the suite is weak — it is unusually good, and §2's
law is a genuinely strong idea, well executed in six places. Because a guard
nobody runs is prose with extra steps, and this review found two of them red in
the working tree, from the same day's work, having stopped anyone exactly
nothing.
