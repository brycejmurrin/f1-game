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
| `tests/unit/test-groups.test.mjs` | the test taxonomy: every group real, every source dir routed, the topical browser groups DISJOINT (2026-09 regroup), `docs/TESTING.md` in step, `RENDER_SPECS` bidirectional |
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
**TLX** (three.js r185.1/TSL, opt-in via `apex26.gfxBackend`). The fallbacks are
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

**2026-08-18 cleanup sweep** tagged removals, false-positive dead exports, and
the next intended `game.js` extractions in
[`research/CLEANUP-SWEEP-2026-08-18.md`](research/CLEANUP-SWEEP-2026-08-18.md).

**2026-08-17 parallel survey** (provenance; several items absorbed): see
[`research/SURVEY-BUGS-PERF-2026-08-17.md`](research/SURVEY-BUGS-PERF-2026-08-17.md).
Career `trackIdx = -1`, VSC/SC player pace, net `predict()`, and Singapore
`lapMirror` portal remaps have landed in code. Remaining survey leftovers live
on the 08-18 perf-hunt board, not this register.

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
  `tools/test-solo.mjs` and both started at load 1.24: `HEAD` fails in 20.6 s,
  base fails in 18.4 s. No timeout on either side, so it is an assertion, not
  contention. This is the SECOND red test in this file — the `#track-detail`
  dialog regression above owns "Tab cannot escape the track-detail dialog" — so
  the file is worth one pass rather than two separate fixes. It is the only
  failure in `test:ui`, which otherwise runs 100/100.
- **`props-over-road` on COTA and Indianapolis — geometry fix landed;
  browser re-measure not run in this session.** COTA's amphitheater now emits
  from its declared origin (the 8 m declared-vs-built offset). Indianapolis
  shortens the oval stand and colour-band chords that covered the infield at
  racing 0.33. Re-measure with `tools/measure-props-over-road.mjs` before
  treating the spec as green.

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
- **A13 zoom/rect sites — closed.** `js/game/css-zoom.js` (`CssZoom`) is the
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
- **Menu state renders the full scene every frame** behind opaque sheets
  (GARAGE, DATA HUB, CAREER…) at the last race's render scale, and
  `PerfGov.tick()` is race-gated so nothing adapts — the mechanism behind
  PERF-FINDINGS' 39.7 s vs 0.1 s VS FRIEND control. Fix: reduced flyby
  cadence / capped scale when `UiLayers.top()` is a full-screen sheet.
- **`sw.js` activate deletes every other cache generation** while the old
  shell is still running: its lazy fetches (scenery, data, net, deferred
  backends) miss the cache; offline after the swap a circuit builds bare.
  Needs a two-generation repro before changing the sweep.
- **GLX `cullInstances(batch, planes, {upload:false})`**: GLX takes two
  args, so the shadow-recentre frame packs + uploads every instance set
  twice (light frustum, then camera). Give the batch two memo slots.
- **Storage quota is shared** by ghost (uncapped, ~40 KB/track), six career
  slots and the API cache; only the API cache evicts, and only its own keys.
- **Ten direct `localStorage.setItem` sites** bypass `store.write`
  (bodyattitude, cockpit-opts, gfx-quality, metrics, perf, apex) — no
  `noteBroken`, no cross-tab invalidation.
- AI brake-look loop redoes three wrap chains per sample (`Tracks.nodeAt`
  would resolve the index once); `for…of` iterators in the GLX instance
  cull; netplay allocates one `{id,car}` per remote per publish; career
  migration branches on `.durable` instead of `.ok`; `endRace` leaves the
  rain overlay on where `quitToMenu` clears it.

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

- **Bank-zone re-seat has no distance cap** (`js/track/mesh.js` ~:228-246). A
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
  by `tools/bake-elevation.mjs`, is in no manifest entry, so every circuit's
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

- **Curvature-sign convention — SETTLED (`+k = LEFT`).** `js/track/spline.js`
  `curvatureRaw`, `findCorners` / `buildKerbs` in `js/track/mesh.js`,
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
  ONE node per side on shifted circuits. Fixed in js/track/space.js by
  short-circuiting width >= 1 to {0, 1} — a whole lap is frame-invariant.
  Verified: fleet A/B shows redbull only (0.225 -> 1.000), characterization
  + redbull-foundation + tiny + guards all green.

- **`__apex.scene()` behind-camera bearing — SETTLED.** `behindCamera` means
  `|bearingDeg| > 90` (behind the look direction), not `project() === null`
  (behind the near plane). The spec asserts `> 90`. Monza's first behind
  corner at ~108° now flags correctly.
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
