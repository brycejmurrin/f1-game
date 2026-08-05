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
| A13 | **A5's sibling, missed by the same sweep: the OVERTAKE arming speed floor is not pace-scaled.** `c.otArmed` requires a bare `c.speed > 15` — real m/s against a literal — while the ACTIVE AERO floor thirty lines below it is `vStd(c.speed) > X_MIN_SPEED`, with a comment marking it "a `vStd()` threshold". So the two straight-line aids in the same function disagree about what a speed means. Measured as a fraction of the car's own envelope, X-mode arms at a constant 35 % at every pace; overtake arms at 42 % of top speed at pace 0.5 and 16 % at pace 1.3. The error runs the wrong way for the player it reaches: the slower you set the game, the more of the lap you spend unable to use overtake at all | Found in the driving-controls pass. **FIXED** — `c.otArmed` now reads `vStd(c.speed) > OT_MIN_SPEED`, the floor named as a constant beside `X_MIN_SPEED` so the two aids are visibly on one scale |
| A14 | Two more raw-literal speed thresholds of the same class, both cosmetic rather than gameplay: brake-glow heating (`braking && c.speed > 12`) and the AI's marble lock-up estimate (`c.speed > 30`). At low pace the brake discs rarely reach the glow threshold at all. Also a stale comment — `js/game/steer-tuning.js` annotates `STEER_EXPO` as "(affects tilt + keys)", but it is applied to the unified steer command in `updateCar`, so it shapes pad, on-screen buttons and canvas touch identically; the note would mislead anyone tuning for a gamepad or an iPad | Found in the driving-controls pass. **FIXED** — brake glow reads `vStd(c.speed) > 12`, the marble estimate `vStd(c.speed) > 30`, and the `STEER_EXPO` note now says it shapes the unified steer command |
| A15 | **`simTilt` has drifted from `tiltSteering`, exactly as the duplication predicted.** The two restate one algorithm — dead zone, `MAX_TILT` map, asymmetric slew — instead of sharing it, and the hit-stop `timeScale` fix updated only the live path. For `simTilt` the omission happens to be *correct* (it takes an explicit dt and exists to be deterministic; `timeScale` is a live-loop concept), which is the dangerous kind of drift: right by luck, unstated, and with `tests/autopilot.spec.js`'s tilt lap riding on it. The fix is to share the target/slew maths and apply `timeScale` only in the live caller, so the next change to one cannot silently miss the other | Found in the driving-controls pass. **FIXED** — both call shared `tiltTarget()`/`tiltSlew()`, and `tests/tilt-pipeline.spec.js` now covers every stage so the next re-inlining is caught |
| A16 | **The THIRD and FOURTH instances of the A5/A13 class, both surfaced by the lint written to close it, and both in one particle-FX block of `js/game.js`.** (i) *Rain spray is unreachable at low pace.* The gate was `wet && c.speed > 15` and the strength ramp `clamp((c.speed - 15) / 45, 0, 1)` — 21 % → 83 % of `VMAX = 72`, i.e. a fraction of the pace-5 envelope, fed a raw ground speed. Measured: at pace 0.5 (`vTop` 36 m/s) strength tops out at `(36 - 15) / 45 = 0.47`, so full spray simply cannot happen; at pace 1.3 it saturates at 64 % of top speed and is pinned at 1 down every straight. (ii) *Launch wheelspin smoke never fires at low pace.* `clamp((_pax - 4.5) / 2.5, 0, 1)` compares the smoothed longitudinal accel against a literal — but `PACE` multiplies the accel curve exactly as it multiplies ground speed (`axEstTarget = ACCEL * PACE * …`), so peak getaway accel is 3.50 m/s² at pace 0.5 against a 4.5 floor: the effect does not exist at the bottom of the OVERALL SPEED slider, and at pace 1.3 it triggers at 56 % of peak instead of 73 %. Both are cosmetic — no physics reads either — which is precisely why five reviews walked past them. The second widens the class: it is an **acceleration**, not a speed, so the lint could never match it; it came out because the lint flagged the `c.speed > 0.5 && c.speed < 12` window on the same line and justifying that meant reading the line | Fixed — spray on `vStd(c.speed)` both halves, smoke on a new `aStd()` beside `vStd()` in `js/game.js`; identical at pace 5 by construction. Plus `tools/vstd-lint.mjs` + `tests/vstd-invariant.test.mjs`, landed with this work — a `.speed` compared against a numeric literal now fails the suite unless somebody writes down why it is absolute, which is the real fix. The lint sees `.speed` only, so the accel shape is recorded in its header rather than asserted | Re-derived independently before deploying, since this is verified by arithmetic and not by a spec: the defect is not confined to the bottom of the slider. At notch 3 (pace 0.75) the spray still caps at 0.867 and the launch smoke reaches only 0.300 — so BOTH effects were degraded across the whole lower half of OVERALL SPEED, which is precisely the half the player reported living in.
| A17 | **The BUTTONS steering mode's control column does not fit on any landscape phone, and in MANUAL gears two of its buttons are drawn on top of two others.** Found by `tests/hud-layout.spec.js` failing all four `buttons` cases (notched and small landscape, auto and manual) while `tilt` and `touch` pass in the same viewports — then diagnosed from `css/overlays.css` without a browser. (1) `body.steer-buttons` re-anchors throttle/brake/boost/ot/aero into ONE right-hand column at slots 0-4, so the stack is `16 + 4x84 + 76 = 428 px` tall against 393 px (notched) and 375 px (small) of viewport: the top control sits **53-56 px off the top of the screen** and cannot be pressed. (2) `#shift-down` and `#shift-up` are anchored at slots 0 and 1 of that same column and are NOT re-anchored by `body.steer-buttons`, so with manual gears `shift-down` lands on `btn-throttle` and `shift-up` on `btn-brake`. Both are tap targets; one is the accelerator | Found while merging the driving-controls branch into the deploy branch. NOT introduced by that merge — the branch changed no CSS at all, nothing in `js/game/hud.js`, and its only `index.html` edit is a slider inside a pause-menu panel that is closed during a race. **CONFIRMED pre-existing by diff rather than by a second run**: every input to this defect is byte-identical between the merged tree and the deploy branch — `css/overlays.css`, `css/hud.css`, `tests/hud-layout.spec.js`, and the control markup in `index.html` modulo the `?v=` bump. A layout failure that is a pure function of files nobody touched cannot have been introduced by touching other files. Fix pending, and it wants a visual check rather than only a green spec: the honest repair is probably a second column (`--btn-col` already exists for exactly that) rather than shrinking `--btn`, since these are thumb targets |
| A18 | **The GARAGE clips its controls at every UI SIZE from 100 % up, with no way to scroll to them.** `tests/ui-scale.spec.js` › *landscape › every main screen fits* passes at **80 %** and fails at **100 %, 130 % and 150 %** with `garage landscape @100% — controls clipped with no way to scroll to them`. The offending element is exactly ONE and the same one at every failing scale: **`#cs-back`, the garage's BACK button, 55 % shown** out of a 75x46 box, with no scrollable ancestor to reach the rest of it. (The raw diff reads `+ 10`, which is ten LINES of a pretty-printed array holding one object — worth saying, because "ten clipped controls" and "one clipped control" are different bugs and I recorded the wrong one first.) Its neighbour `#cs-done` in the same `.sheet-foot` is fine, so whatever cuts it is asymmetric — and `css/carsetup.css:420` sets `justify-content: center` on that bar under a comment reading "DONE is the only action", which has not been true since BACK was added beside it. Centred content that overflows spills off BOTH edges and the leading edge is the unreachable one. 100 % is the DEFAULT on desktop and the setting the UI SIZE knob was built around, so this is not an extreme-configuration edge case — it is what a mouse user sees | Found in the same merge as A17 and, like it, **proven pre-existing by diff**: `tests/ui-scale.spec.js`, `css/carsetup.css`, `css/components.css`, `css/menus.css`, `css/responsive.css`, `css/tokens.css` and `js/game/setup-ui.js` are all byte-identical to the deploy branch, and the driving-controls branch made zero edits to the garage markup. Fix pending. Note that 80 % passing and 100 % failing points at a fixed-height assumption rather than a proportional one — something is sized in px where the rest of the screen scales |
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

> **Update — cleanup pass, 2026-08.** Much of this tier has since been worked.
> Items now DONE are struck through in place rather than deleted, so the
> reasoning that deferred them stays readable next to what was actually done.
> Two entries did **not** survive re-checking and are marked accordingly: a
> register drifts exactly like any other prose, and this one had.

**~~A8 — lap double-count.~~ FIXED (2026-08).** Done as agreed below — a
symmetric `lap--` on a backward crossing, plus restoring `lapTime` so the
re-crossing re-times the same lap instead of stamping a sliver that would beat
`c.best` and become the stored ghost. Pinned by two tests in
`tests/audit.spec.js`, both of which fail without the fix. Original entry: `lap` increments on a forward line crossing and there
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

**CORRECTED after a full sweep — the first version of this entry was half
wrong.** It named `js/data/telemetry.js:942` as a site. It is not one: the data
hub is a top-level `<div id="datahub">` (`index.html:1391`), nothing in
`js/data/hub.js` ever adds a `sheet` class, and `css/data.css` contains **zero**
`zoom` declarations. Its scrubber reads `ev.clientX` and the canvas rect from
the *same* unzoomed space and is correct on every browser. Recorded here rather
than quietly deleted, because "a rect near a zoom" is not the defect — *mixing
two spaces* is, and the difference is the whole audit.

The confirmed sites, wrong on pre-26.4 iOS *by default* since `--ui-scale`
ships at 1.15 on a coarse pointer:

- `js/game.js:5139` — the garage lens shift divides `#cs-inner`'s rect width
  (`class="sheet pane-pair"`, zoomed) by the **unzoomed** `#game` canvas's
  `clientWidth`. The turntable is framed as though the panel were narrower than
  it is, so the car sits partly under it.
- `js/game/menunav.js:114` — `nearestPane()` compares a viewport-space wheel
  point against pane rects taken inside `.sheet`. Every pane reads ~13 % closer
  to the origin than it paints, so a trackpad swipe over the right column of a
  two-column screen scrolls the left one. Fallback path only, so LOW.

Two more found by the same sweep are **not** WebKit-specific and are wrong
everywhere:

- `js/game/sheetshape.js:57` — `classifyPair()` compares
  `getBoundingClientRect().width` against `--pair-at`, but `--pair-at` is a
  **local-space** threshold paired with five real `@container sheet (min-width:
  620px)` rules, and `components.css:126` says so outright. Measured at 852×393
  with `--ui-scale: 1.15`: over local widths 506–610 px, `#sel-inner` carries
  `data-pair="on"` while every one of those container rules is still off — a
  two-column layout whose contents are styled for one column. The polarity is
  inverted from the rest of A13: **pre-26.4 WebKit is correct here and Chrome is
  wrong**, which is also why a Chromium-only suite has no baseline to catch it.
  Fix is `clientWidth` (or the `ResizeObserver` `contentRect` already in hand at
  `:120`), *not* the shared viewport-space helper — that would lock the wrong
  space in on every engine.
- `js/game/menunav.js:132` — adds a viewport-space `deltaY` to a local-space
  `scrollTop`, so panes inside a 1.15 sheet scroll ~15 % further than the finger
  moved. Wrong on all browsers; same root cause, different direction.

So a single `currentCSSZoom` helper is **necessary but not sufficient**: it
fixes two of the four, and two need the opposite conversion. It also needs a
one-time feature probe, because `currentCSSZoom` reports 1.15 on both engines
and does not say whether the rect already had it applied.

**A14 — the data hub does not scale at all.** Falls out of the same sweep:
`#datahub` is outside every zoomed subtree, so UI SIZE moves every screen in the
game except this one. Worth fixing and worth sequencing carefully — the moment
`.dh-card` gains a `zoom`, `telemetry.js:942` stops being a false positive and
becomes a real A13 site, so the helper must land first.

Deferred rather than fixed: both want a device to confirm on, and the honest fix
is a shared "rect in viewport space" helper (dividing by `currentCSSZoom`, or
reading `offsetX`) rather than two spot patches. **Worth doing before B4 decides
whether `zoom` stays** — it is the strongest argument found so far that it should
not. Note that `zoom` itself is otherwise sound: Baseline since May 2024, and
being standardised in CSS Viewport.

**Structural.**
- **~~No CI gate~~ FIXED (2026-08).** `.github/workflows/ci.yml` runs three jobs
  split by cost (guards / sweeps / smoke) and `pages.yml` now `needs:` it, so a
  red guard blocks the deploy. Adding it immediately paid for itself: it
  required fixing `test:tiny`, which turned out not to run one of the three
  specs it named.
- **No vertex budget gate** — `verify-track vegas` prints 1,825,925 prop verts
  and exits 0, on a codebase whose own comment names that VBO as the iOS jetsam
  trigger. **Now quantified** in `docs/research/CI-RENDERING-PERFORMANCE.md`
  Part 2: at the real 10-float interleave that is ~80 MB of GPU buffer for one
  circuit, against a page a current iPhone SE kills at ~100 MB. The gate is a
  threshold on a number `verify-track.cjs` already computes, and the
  clip/coplanar baseline files are the ratchet pattern to copy.
- **No CSP.**

**~~Dated.~~ FIXED (2026-08).** Both now read the clock, and
`tests/docs-integrity.test.mjs` fails if a season literal comes back. Not
Ergast's `/current` alias, which would be tidier but could not be verified from
the sandbox (its egress proxy blocks the host) — an unverified API dependency
would be a worse bug than the one being fixed.

**Silent failure.**
- 340 `catch` blocks in `js/`; 59 `Log` call sites in the entire codebase. The
  great majority of failures are swallowed.
- ~~`js/net/` had zero `Log` call sites and `js/game/audio.js` still has none.~~
  **PARTLY FIXED (2026-08).** `audio.js` 0 → 4 (context-resume refusal, sample
  and music decode failure — the three that present as "there is no sound") and
  `transport.js` 0 → 3 (TURN credential fetch failure, connection state). The
  broad 469-catch problem stands; these were the paths where a documented debug
  namespace could not emit a single line.
- ~~`apex26.envProbeOff` is a one-way latch~~ **FIXED (2026-08).**
  `__apex.envProbe(on?)` is the clear path, documented in `docs/DEBUG-HOOKS.md`.

**Convention drift.**
- ~~`js/track/markings.js` is the only file of ~150 with no `"use strict"`~~
  **FIXED (2026-08)** — wrapped in the standard IIFE; all 150 files now comply.
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

**Dead code.** Partly cleared 2026-08: `X_LOOK_MAX`, `X_K_MAX` (both left behind
when `buildAeroZones()` replaced the rolling look-ahead), `CarMesh.getPedalBar`
with its two cache slots and its dead import, and the `window.__APEX` bridge
gated on a `window.__APEX_DEBUG` flag nothing has ever set. **`EV.BYE` is NOT
dead** — re-checked, it is used at `js/net/netplay.js:323`. Still open:
`Career.isOwned`; GLX's instancing path;
`TrackSpline.centerline()` and the authored-`segs` path; the SRTM elevation
branch; 8 of `Reliability`'s 14 exports; ~60 further dead exports catalogued.
Three deserve individual mention because they are not merely unused:

- ~~**`NetSnapshot.predict()`** — implemented, tested, exposed, and never
  called.~~ **NO LONGER TRUE (re-checked 2026-08):** it has a caller at
  `js/net/netplay.js:691`. Recorded so it is not re-reported a third time.
- ~~**`NetRendezvous.configured()`** is `() => true`~~ **RESOLVED (2026-08), but
  not as written.** The function is CORRECT and deliberately so — room codes
  always work via the public relay pool, and a test pins it. The defect was the
  two unreachable lobby branches and their message, which told the user "Room
  codes need a relay deployed" — the opposite of true. Both deleted.
- **`seal`/`open`/`topicFor`** are tested with zero production callers, while
  `httpPut` posts plaintext — so `CLAUDE.md`'s claim that "the operator relays
  bytes it cannot read" is **false for the private Worker path**. This one is a
  security-relevant documentation error, not just dead code, and should be
  either implemented or the claim withdrawn. **CLAIM WITHDRAWN (2026-08)**, in
  `docs/MULTIPLAYER.md` and in the source header: the public Nostr path IS
  encrypted by Trystero, and only the optional private Worker posts plaintext.
  Implementing was rejected for now because `worker/rendezvous.js`'s
  single-writer rule compares stored bytes against incoming, and AES-GCM's
  random IV would make a host re-posting its own offer look like a second host
  and take a 409 — a change needing a deployed Worker to test.

---

## 9. If you fix one thing

Add a CI gate. Not because the suite is weak — it is unusually good, and §2's
law is a genuinely strong idea, well executed in six places. Because a guard
nobody runs is prose with extra steps, and this review found two of them red in
the working tree, from the same day's work, having stopped anyone exactly
nothing.

---

## 10. Open test failures and the plan to fix them (Aug 2026)

Measured on a QUIET box, after `tools/test-bg.mjs`'s two orphan bugs were fixed.
Everything below is an **assertion** failure, not a timeout — the ten "failures"
recorded before those fixes were all the machine and are not in this list.

### T1 — water models: Monaco and Abu Dhabi. ONE root cause, highest value

| test | asserts | got |
|---|---|---|
| `physics-monaco-foundation.spec.js:87` | `waterCoverage.models >= 20` | **3** |
| `physics-abudhabi-foundation.spec.js:93` | emitted water models `> 8` | **2** |

Albert Park's water/fountain test **passes**, so this is not global — it is the
two harbour circuits.

Monaco calls `waterSurface()` exactly **once** and Abu Dhabi twice, yet the
tests expect 20 and 8 models. So the count comes from inside the emitter: a
single call rasterises a basin into fine cells and merges occupied cells into
flat quad runs. Getting 3 where 20 are expected means either the merge is
producing far fewer runs than it did, or per-cell suppression is eating the
basin. `waterSurface` rejects on `onTrack(center, sz[0] / 2 + 4)` — a 4 m
margin — and Monaco is the tightest circuit on the calendar, which makes
over-rejection the first hypothesis to test.

**Plan.** (1) Measure before touching anything: `waterCoverage` in the Monaco
spec reports `models`, `vertices` AND `area`, and the spec asserts all three
(`>= 480` verts, `>= 45 000` m²). If area and vertices still pass while `models`
fails, the geometry is fine and the emitter has simply merged into fewer, larger
runs — in which case **the assertion is stale and counting the wrong thing**,
and the fix is to assert coverage rather than model count. If area fails too,
the basin genuinely collapsed and it is a geometry regression. Those two
outcomes want opposite fixes, so do not guess. (2) `node
tools/verify-track.cjs monaco` is the cheap loop here — no browser. (3) Whatever
the outcome, both circuits are one fix.

### T2 — `mugello`: 36 uncaught page errors

`elevation-tracks.spec.js` fails `expect(errors).toEqual([])` with **36**
`pageerror` entries. `tools/verify-track.cjs mugello` builds clean (637 712 prop
verts, exit 0), so it is a RUNTIME throw during the race, not a build throw.
Intermittent — the retry passed, and no failure artifacts survived.

**Plan.** Reproduce with the error text captured: run the single spec with
`APEX_LOG=scenery:debug` and read `__apex.logs({ns})` rather than scraping the
console, per the house rule. 36 is a suspiciously round-ish number for a
per-frame or per-prop throw, so the first question is whether it is 36 distinct
errors or one error 36 times — the ring buffer answers that directly.

### T3 — `sochi`: 120 s timeout. Probably mine, verify before believing

The only timeout in the clean run, and I was driving a WebGL page through the
DevTools MCP at that moment — exactly what `docs/PARALLEL-WORK.md` says not to
do. **Re-run alone before treating it as a defect.**

### T4 — `spa bounded`: the projection snap

`tracks-walls.spec.js:91` asserts `maxAbsX < 60` and measured 181–185 across
three earlier runs. `x` is lateral metres from the centreline, so the car is
being reported 180 m off track — too large for runoff, too consistent for noise.

**Hypothesis:** `trackFrom()` refines `(s, x)` with *local* Newton steps
precisely so it cannot snap onto the wrong leg, and Spa is the 7 km circuit
where two legs run closest together. 180 m looks like the distance between legs,
not a car position.

**Plan.** Runs in `test:circuit` / `test:barriers`, not `test:physics`, so it
needs its own pass. Confirm the number on a quiet box, then use
`__apex.projTest(frac, lateral)` and `wsInfo()` to find the fraction where the
foot jumps. If it is the wrong-leg snap, the fix belongs in `trackFrom`'s
locality guard, not in the test — 180 m is genuinely wrong.

### T5 — Monza terrain gap

`physics-monza-foundation.spec.js:64` asserts `probe.gap <= 0.18`. **The `-11`
in the failure message is the LATERAL PROBE OFFSET, not the gap** — the test
sweeps `lat ∈ {-11, +11}`. The magnitude is still unknown.

**Plan.** Read the real number from the current run. frac 0.30 is the Roggia,
which the same spec asserts sits below −1 m, so terrain rising above road level
11 m off the centreline beside a sunken section may well be correct scenery — in
which case the assertion is too strict rather than the geometry being wrong.
Decide from the number, not from the shape of the test.

### T1 outcome and the six that remain (measured Aug 2026)

**Fixed: Monaco, Abu Dhabi (day+night), Montreal's water count.** All were
counting the emitter's TESSELLATION. Measured before editing:

| circuit | asserted models | actual | runs | verts | area |
|---|---|---|---|---|---|
| Monaco | >= 20 | 3 | 79 | 316 | 42 840 m2 |
| Abu Dhabi | > 8 | 2 | 93 | 396 | 161 746 m2 |
| Montreal | > 40 | 10 | 795 | 3 252 | 618 088 m2 |

Nothing suppressed in any of them. `waterSurface()` merges occupied cells into
flat quad runs, so the counts fell as the merge improved while the water stayed
put. The area/vertex assertions are the real contract and were kept.

Monaco also had TWO failures hidden behind the water one — it was the only spec
demanding `models.suppressed` be entirely empty (Monza and Spa filter on
`required`), rejecting 22 `required: false` pontoons and balconies whose
footprint overlaps the road. That is the suppression system working. This is why
each circuit was measured rather than pattern-matched.

**The remaining six are six DIFFERENT defects, not one:**

| # | spec | assertion | value |
|---|---|---|---|
| a | monza:64 | `probe.gap <= 0.18` at frac 0.30, lat -11 | **0.525, then 0.294** |
| b | qatar:57 | `elevationRange < 0.25` — "night Qatar remains effectively flat" | **6.699** |
| c | spa:124 | `overlaps.road <= 0.18` | 0.525 |
| d | suzuka:50 | `audit.raw.bridges` toEqual `[{s:0.4235, halfM:150, rise:7}]` | mismatch |
| e | vegas:72 | `emitted.has("vegas-bellagio-lake")` | **false — a required model is missing** |
| f | zandvoort:210 | toEqual `["pit-building", "zandvoort-lighthouse"]` | mismatch |

**(a) IS NOT NONDETERMINISTIC. That claim was mine and it was wrong.** Monza is
bit-stable: identical geometry SHA1s across six separate processes, `gap` =
**0.294** every time, day/night/wet/dry alike, and `grep` for
`Math.random|Date.now|performance.now` across `js/track/` and `js/circuits/`
returns zero hits.

The variance was in the REPORTING. `tests/live-reporter.js:84` kept the first 4
**raw** lines of an error, and Playwright separates the custom assertion message
from the `Expected:`/`Received:` pair with **blank** lines. So an assertion with
a custom message loses its values past the cut, and one without keeps them —
Monza has a custom message, Spa does not. Monza's block was read, truncated, and
the next `Received:` in the file (Spa's 0.525, a different test) was taken as
Monza's. Monza has never measured 0.525. Correlation was 100 % across the whole
log: Abu Dhabi, Monaco, Montreal and Spa printed values; Monza, Qatar and Vegas
did not. Fixed by filtering empty lines — same 4-line budget, strictly more
information.

Both geometry numbers are stable and can be treated as fixed-value bugs:

- **Monza 0.294** at frac 0.30 / lat -11. Road half-width there is 8.00 m, so
  the probe sits **3 m beyond the road edge**, and the terrain ramps smoothly
  (lat -16: 0.137 -> lat -11: 0.294, null inboard). No spike. This is verge
  geometry measured against the CENTRELINE rather than the road edge — the fix
  should decide whether the comparison basis or the verge is wrong, not the
  tolerance.
- **Spa 0.525** at world (628.3, -802.4), frac ~0.758 (Stavelot), road triangle
  102672. A genuine road-surface-above-centreline excursion, probably camber.

**(e) WAS ALSO WRONG, also mine.** `vegas-bellagio-lake` is not missing — it was
SPLIT into `vegas-bellagio-lake-east` (required) and `-west` when the Bellagio
frontage was widened to the real ~300 m, because one box that long risked
clipping the T13 apex. Both emit with `water: true`, nothing suppressed. The
proof is in the failing run itself: spec:62 (required failures must be empty)
PASSED before line 72 failed, so a suppressed required lake would have failed
earlier. Fixed by pinning both new ids.

(d) Suzuka and (f) Zandvoort were stale assertions too. Suzuka's bridge was
deliberately retuned (rise 7 -> 13.5): at rise 7 the crossover deck's 6.7 m top
left 1.6 m and went through the upper ribbon, so the retune fixed a real defect
and the assertion pinned the pre-fix numbers. Zandvoort's required set simply
grew by two (the 2020-21 paddock club and the watertoren).

Montreal now fails on something real that the water assertion had masked: a
support's `minY` sits 2.72 m from `groundY` against a 0.05 m allowance.
Deliberately left failing — it wants a fix, not a wider tolerance.

### Order

T1 first (two failures, one fix, and the measurement is cheap and headless),
then T5 (a number is already coming), then T2, then T4 (needs its own run), then
T3 (probably not a defect at all).
