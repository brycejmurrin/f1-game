# Apex 26 — architecture review

A review, not a reference. [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) is the
module contract and [`AGENTS.md`](../../AGENTS.md) is the working reference; both
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
| `tools/track/graph-parity.cjs` | scene-graph migrations are vertex-for-vertex identical to a baseline ref |
| `tests/unit/backend-surface-parity.test.mjs` | a renderer backend declares every GLX member, absent ones as explicit `undefined` (§5) |
| `tests/unit/ratchets.test.mjs` + `tests/data/ratchets.json` | the game.js size ceilings (lines, code lines, `G` members, column-0 lets) — a ratchet, so extraction lowers them and regrowth fails |
| `tests/unit/vstd-invariant.test.mjs` + `tools/check/vstd-lint.mjs` | no `.speed` compared against a numeric literal without a written reason (§3) |
| `tests/unit/comment-citations.test.mjs` | a comment citing another file names a symbol that exists; ratchet on the cross-file-citation population |
| `bareCatches` (`tests/data/ratchets.json`) | ratchet on bare `catch {}` — the escape hatch is a comment saying why, not a log line |

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
`tools/check/vstd-lint.mjs` + `tests/unit/vstd-invariant.test.mjs` now fail the suite on a
raw `.speed`-vs-literal comparison unless the absoluteness is justified in
place. The lint sees speeds only; the acceleration case is recorded in its
header rather than asserted. Physics constants now live in
`js/physics/consts.js`, extracted from game.js under the size
ratchet.

---

## 3. Two-tier simulation

Easy to mistake for one system:

- **The driving model** — the per-axle bicycle model: deterministic,
  authoritative, the only thing that decides where the player's car is.
- **`js/physics/debris-world.js`** — a Rapier side-world for debris and kinematic
  car mirrors. It **never moves a game car**; that is its whole contract.
- **`js/physics/incident-sim.js`** — the bounded exception: a windowed takeover
  that *may* move a car, safety contract in its header. `startRace()` calls
  `IncidentSim.reset()` before `makeCars()` because ownership is by `cars[]`
  index and a stale index would own a different car.

---

## 4. The `G` façade

`js/game.js` is the largest file in the repo (the figure lives in
`tests/data/ratchets.json`, the only place it cannot go stale). Extracted
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
[research/WEBGPU-PARITY.md](../research/WEBGPU-PARITY.md).

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
  construction, and `tools/track/graph-parity.cjs` proves it vertex-for-vertex
  against a baseline ref. That gate is the pattern to apply more widely.

---

## 7-8. Open defects and backlog

Carved out on 2026-09-03 into [`DEFECT-LEDGER.md`](DEFECT-LEDGER.md) — the register
churns on every fix, the assessment above does not.

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
