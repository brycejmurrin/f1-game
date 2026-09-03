# Agent World API — showing the game to an LLM agent as JSON

**Status: implemented.** The surface ships in `js/agent/agentview.js` (+ the
rasters in `js/agent/agentview-raster.js`) — `world()`, `field()`, `trackInfo()`,
`scene()`, `describe()`, `query()`, `atmosphere()`, `objective()`, `carView()`,
`render()`, `survey()`, `rollout()`, `terminal()`, `agentHelp()` — the former
`frame()`/`plan()`/`worldModel()`/`visible()` aliases have been REMOVED (use
`render({what})`/`scene({visible})`) — plus the prop registry in
`js/track/tracks.js` and the scenery modules, and a CLI at `tools/agent.mjs`.
**Reference documentation is `docs/DEBUG-HOOKS.md` → "Agent world view"**; the
API also describes itself via `__apex.agentHelp()`. Tests:
`tests/specs/agent-view.spec.js` (`node tools/test-bg.mjs hooks`, 117 tests).
This document keeps the research and the reasoning — §2's audit describes the
state of the codebase **before** the work, and is retained because it explains
why the design is shaped the way it is.

The goal: let a text-only agent perceive and reason about the running game
without screenshots. Not as a fallback for lacking eyes — as the *better*
channel. This doc records the research behind that claim, an audit of what the
codebase can and cannot answer today, and a phased design.

---

## 1. Why JSON and not screenshots

The evidence is one-sided.

- **BALROG** (ICLR 2025) benchmarked LLMs and VLMs across six game
  environments and found multimodal models score *worse* when handed an image
  of the environment alongside the text description than with text alone.
  Adding pixels actively hurt. <https://arxiv.org/abs/2411.13543>
- **Chrome DevTools MCP** ships the same conclusion as product guidance: prefer
  `take_snapshot` (accessibility tree, text, stable `uid` per element) over
  `take_screenshot`; screenshots are "when the user needs to see visual state."
  <https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/skills/chrome-devtools/SKILL.md>
- **Gran Turismo Sophy** — superhuman at a game that is entirely visual to
  humans — drives from compact numeric measurements, not images.
  <https://www.nature.com/articles/s41586-021-04357-7>
- The counter-examples, **SIMA** and **CRADLE**, take pixels *by design*
  because they target software with no API. That is a generality research
  goal, not an efficiency claim. We own this game. Imitating them would be
  choosing their constraint for none of their reasons.
  <https://arxiv.org/abs/2403.03186>

So the modality question is settled. The hard part is payload design, and the
failure mode to design against is not "the agent can't see" — it is "the agent
can see forty numbers and still can't tell it's about to miss a braking point."

## 2. What the codebase can answer today

`window.__apex` exposes ~182 hooks. `obs()`
(`js/agent/apex.js:1064`) is already a better observation than most published
game-agent wrappers: egocentric signed wall clearances, lateral offset,
look-ahead scan, combined-slip state, applied-input echo, reward components.

The gaps, in order of how much they hurt:

### 2.1 Scenery is not queryable at all — the one true data gap

`buildProps()` returns only three vertex buffers (`js/track/tracks.js:1723`).
The rich placement data that exists *during* the build — the `barSegs`
footprint list, the `barGrid` spatial hash, the `mass` occupancy grid — are
function-local and garbage-collected on return. Raw geometry is nulled on
upload too (`js/render/glx/chunked.js:86,112`) unless
`Tracks.setKeepGeometry(true)` was called *before* the build
(`js/track/tracks.js:1996`).

What survives:

| Structure | Where | What it gives |
|---|---|---|
| `track.lampPosts` | `js/track/tracks.js:1659` | **The only semantic prop registry.** `{k, side, x, y, z, kind}` per lamp (street post or flood bank) |
| `track.barL` / `barR` | `js/track/tracks.js:499` | Per-node lateral barrier limit. No kind, no height |
| `track.kerbL` / `kerbR` | `js/track/core/mesh.js:152` | Which side has a kerb, per node |
| `track.meshes.props.chunks[]` | `js/render/glx/chunked.js:136` | 72 m XZ cells with AABBs — anonymous mixed geometry |
| `track.modelDiagnostics.emitted` | `js/track/tracks.js:392` | An inventory **with no positions**, composites only |
| `track.terrainGeo` | `js/track/tracks.js:201` | Retained unconditionally; `Tracks.terrainY()` raycasts it |

An agent cannot answer "is there a grandstand on my left", "what building is
that", "are there trees here". This is the only thing on the list that is
missing *data* rather than missing *presentation*.

Note `tools/track-build-vm.cjs` already wraps every `TrackGeom` emitter and
records per-primitive bounds, material, and an emission-group id that acts as a
model-identity proxy. The offline instrumentation is most of a scene graph
already; it just isn't wired to the shipped build path.

### 2.2 No corner semantics

`corners()` returns bare curvature-peak fractions. Each def
(`js/circuits/<id>.js`) has curated `turns:[frac…]` in driving
order, but `info().turns` surfaces only the *count*. No direction, no radius,
no name, no entry/apex/exit, no braking reference.

### 2.3 Look-ahead horizon is distance-scaled, not time-scaled

`obs().scan` is hardcoded to `[10, 30, 60]` m (`js/agent/apex.js:1081`). At
50 m/s that is 1.2 s of warning; at 10 m/s it is 6 s. Backwards. GT Sophy
samples ~6 seconds of travel — the span scales with velocity.

### 2.4 Rivals are under-described

`obs().gapAhead`/`gapBehind` are in metres and correct (`prog` is cumulative
metres). But there is no per-rival entry, no lateral offset, no rival speed,
no closing rate. GT Sophy encodes rivals as point masses with relative
position, velocity *and* acceleration; the 2025 GT7 follow-up found that
adding opponent *orientation* measurably improved overtaking.

### 2.5 No world position for AI cars

`cars()`/`carAt()`/`fieldState()` return Frenet `(s, x, prog)` only.
`carOrbit()` has to reconstruct world XZ itself (`js/agent/apex.js:558`)
because AI cars don't carry `px/pz`. Only the player has world coordinates
(`wsInfo()`).

### 2.6 Failure returns carry no signal

Hooks return bare `false` or `null` on failure. `obs()` returning `null`
because `player.px` is uninitialised is the exact case the docs warn about —
but the warning lives in the docs, not in the error. An agent gets nothing.

### 2.7 Nothing about what is on screen

`camState()` gives `{eye, tgt, fov, roll}`. There is no projection helper and
no visibility query. But the ingredients are all retained: `frame.viewProj`
(`js/game.js:3363`), `frame.cullDist`, and per-chunk AABBs. The frustum math
already exists at `js/render/glx/chunked.js:26-55` — it just isn't exported
(`GLXChunked` returns only four draw-path functions, `:202`).

## 3. Design principles, and where each comes from

**P1 — Egocentric, with the sign convention stated in the payload.**
Multiple 2025–26 benchmarks find LLMs have no explicit mechanism for reference-
frame management and struggle to rotate frames. Never make the agent convert.
<https://snorkel.ai/blog/introducing-snorkelspatial/>

**P2 — Ship the number *and* the label.** LLMs are more reliable consuming
categorical judgements than raw scalars. `k: 0.0222` is inert; `radiusM: 45,
dir: "L", severity: "medium"` is actionable. Keep both — the number for
precision, the label for the decision. This is the NLE language wrapper and
SC2Arena pattern.

**P3 — Round hard.** `s` to three decimals is more precision than any driving
decision needs, and decimals cost tokens.

**P4 — Progressive disclosure.** A `detail: "brief" | "drive" | "full"` enum,
brief under ~200 tokens. Anthropic's tool guidance recommends response-format
enums precisely for this.
<https://www.anthropic.com/engineering/writing-tools-for-agents>

**P5 — Deltas over snapshots.** *diff history* (ICML 2024) reports ~4× more
usable interaction history at fixed context by diffing consecutive text
observations. Keep a full resync escape hatch — diffs drift.
<https://arxiv.org/abs/2312.07540>

**P6 — Errors are prompts.** Typed class + what happened + **the next action**.

**P7 — Affordances, including the unavailable ones.** TextWorld and Jericho
both ship an admissible-action list, and agents depend on it. The
`unavailable` half stops the agent burning turns discovering constraints.

**P8 — The LLM must not be in the 60 Hz loop.** The real-time agent literature
is consistent that LLMs cannot sustain frame-level decisions; the fix is
hierarchical (reason at ~1 Hz, act at 60 Hz) or asynchronous.
`freeze()` + `headless()` + deterministic `step()` already convert this
real-time problem into a turn-based one. That trio is a bigger asset than any
observation-format tweak.

**P9 — Consolidate the toolbelt; keep the dev console.** ~182 hooks is a good
debug console and a poor agent interface — tool schemas alone can eat 20–40%
of context. Expose ~6 composed tools; leave `__apex` untouched underneath.

**P10 — Code as an escape hatch.** CodeAct reports up to +20% success and ~30%
fewer steps for executable code over JSON actions. One `eval` tool over
`__apex` turns ~182 hooks into one tool and lets the agent write filters we
didn't anticipate. <https://arxiv.org/abs/2402.01030>

## 4. The design

### Layer 0 — envelope

Every payload carries:

```json
{ "apiVersion": 1, "physicsVersion": 1, "seq": 1841, "t": 41.83,
  "conventions": "+x right of centreline, +k LEFT-hand turn, metres, m/s, radians" }
```

`physicsVersion` bumps whenever tuning changes could invalidate an
agent-authored strategy. PettingZoo's versioning discipline, and cheap.

### Layer 1 — `world({detail, since})`

The egocentric snapshot. `brief` is what a control loop reads each tick.

```json
{ "ego": { "lap": 3, "pos": 4, "speedKph": 218, "gear": 6,
           "lateralM": -1.4, "headingErrDeg": 3.2, "onTrack": true,
           "grip": { "slipFactor": 0.62,
                     "state": "62% of lateral grip used, trail-braking" } },
  "nextCorner": { "turn": "T7", "name": "Ascari", "dir": "L", "radiusM": 52,
                  "severity": "medium", "distM": 84, "timeS": 1.7,
                  "apexSpeedKph": 148, "straightAfterM": 190, "exitsOntoStraight": true,
                  "suggestBrakeM": 62, "status": "brake in ~22 m" },
  "nextCorners": [ { "turn": "T7", "dir": "L", "distM": 84, "apexSpeedKph": 148,
                     "exitsOntoStraight": true, "suggestBrakeM": 62 },
                   { "turn": "T8-T9", "dir": "R", "distM": 260, "apexSpeedKph": 96,
                     "exitsOntoStraight": false, "suggestBrakeM": 110 } ],
  "ahead": { "horizonS": 4.0, "pts": [ {"d":20,"r":"straight"},
                                       {"d":84,"r":52,"dir":"L","turn":"T7"} ] },
  "rivals": [ { "id": 3, "rel": "ahead", "gapM": 22.4, "gapS": 0.46,
                "lateralM": 2.1, "closingMps": 1.8, "side": "right",
                "threat": "closing" } ],
  "aero": { "mode": "X", "flap": 1, "requested": true, "armed": true },
  "affordances": [ { "id": "deploy_ers", "why": "energy 0.74, 380 m straight" },
                   { "id": "active_aero_x_mode", "why": "straight road ahead" } ],
  "unavailable": [ { "id": "overtake_L", "why": "1.1 m to barrier" } ],
  "brief": "Lap 3, P4, 218 km/h in 6th, approaching T7 Ascari (left, 52 m), 1.4 m left of the line, car ahead 0.46 s and closing."
}
```

The `brief` string is ~30 tokens, generated in JS, and doubles as a human debug
line. Three independent lines of prior art converged on prose-over-numbers for
the summary layer; it is cheap and disproportionately effective.

**Radius, not curvature.** Report `1/k` in metres. "A 45 m corner" is
something the model has read a thousand sentences about; `k = 0.0222` is not.

**Time-scaled horizon.** `horizon = speed × horizonS`, clamped. Replaces the
fixed `[10,30,60]`.

### Layer 2 — `trackInfo({what})` — static, fetch once per session

Corners with names/radius/direction/entry/apex/exit, sector boundaries, DRS
zones, elevation profile. Constant for a session, so it must never ride in the
per-tick payload. Sources already exist: `def.turns`,
`def.sectors`, `TrackMaps` cache (which already computes `drsZones`).

### Layer 3 — scene graph

Two pieces, independently useful.

**3a. Prop registry (requires a build-path change).** One
`track.props.push({kind, id, center, size, side, k})` at the guarded-emitter
choke point (`js/track/tracks.js:402-490`). Cap it and record composites and
named `place()`/`building()`/`grandstand()` calls — *not* every window pane;
street circuits emit up to ~5 M verts.

Serialize as **semantic label + AABB min/max + relations**, which is the
canonical form in the 3D-scene-graph-for-LLM literature (3DGraphLLM et al.).
The accessibility-tree lesson applies directly: don't serialize the scene
graph, serialize the semantically-labelled *subset*.

**3b. `visible()` (shipped; now `scene({visible:true})`) — what is in frame (~10 lines).** Export
`_extractPlanes`/`_aabbInFrustum` from `GLXChunked` and test `frame.viewProj`
against the retained chunk AABBs. Gives the props cells the GPU is actually
drawing, plus track nodes and cars projected to NDC. Zero new build state.

### Layer 4 — the loop

Canonical protocol, documented as such:

```
freeze() → world() → decide → act(intent, n) → world()
```

Plus a **rollout summariser**: drive N seconds under a policy and return a
trajectory digest (min/max speed, apex speeds, off-track events, lap delta)
rather than 600 observation frames. This is the single biggest token win
available for physics and tuning work.

For actual racing rather than inspection, the hierarchical variant: the agent
sets intent at ~1 Hz (`{target_line: "late_apex", brake_point: 62}`), existing
driving code executes at 60 Hz.

### Layer 5 — the toolbelt

| Tool | Composes |
|---|---|
| `apex_world({detail, since})` | `obs` + `timing` + `fieldState` + `sectorState` |
| `apex_act({intent \| raw}, ticks)` | `act` / `setInput` / `step` |
| `apex_reset({track, frac, speed, weather, tod})` | `race` / `reset` / `jump` |
| `apex_track({what})` | `corners` / `trackProfile` / `wallStats` / markings |
| `apex_scene({radius \| visible})` | prop registry + frustum query |
| `apex_eval({js})` | escape hatch over the full ~182 hooks |

`__apex` itself stays exactly as it is. This is a layer, not a replacement.

### No prescribed racing line — honest geometry instead

An earlier revision shipped `apexOffsetM` / `moveToApexM`, a prescribed "fast
line" modelled as *the apex kisses the inside edge*. The machine-observation
research is clear that this is **confidently wrong**: the correct apex is a
*position along the arc* (late apex is the default onto a straight — slower
entry, earlier throttle), chicanes and double-apexes are *linked sequences* you
compromise across, and tellingly GT Sophy was given **no** ideal line at all —
just honest geometry — and learned the line. A prescribed line that is wrong is
worse than none, so it was removed.

Instead the agent gets the geometry to **choose** a line, which is already most
of what it needs: `ego.lateralM` (offset from centre), `ego.headingErrDeg`
(heading vs the tangent), `world().ahead.pts` (curvature/width over a
velocity-scaled horizon), and per corner `radiusM` + `apexSpeedKph`. Added to
that, two honest road facts an agent would otherwise have to integrate for
itself: `nextCorner.straightAfterM` (metres of road from this corner's exit to
the next corner) and `exitsOntoStraight` (true past ~120 m) — the cue that a
corner is worth prioritising exit out of, without dictating how. `nextCorners`
previews the same over the next few corners. The `agent-drive-bench` spec drives
a fixed policy on *honest geometry only* (`headingErrDeg` + `lateralM` +
`status`) well past 1.5× a blind baseline.

## 5. Phasing

**Phase 1 — presentation only, no new data.** Envelope + versioning, `detail`
levels, `nextCorner` from `def.turns`, time-scaled look-ahead, radius
instead of curvature, per-rival rows, typed errors with a `fix` field, split
`done` into `{done, reason}`, the `brief` string. All of this is derivable from
state that already exists. Highest value per line of code.

**Phase 2 — `visible()` (shipped; now `scene({visible:true})`).** Export the two frustum functions; add the query.

**Phase 3 — prop registry.** The only phase that touches the build path, so
the only one that needs `tools/verify-track.cjs` and the scenery contract test
(`tests/unit/scenery-api-contract.test.mjs`, which freezes a 111-member API) run
against it. Vertex-budget sensitive.

**Phase 4 — rollout summariser and the toolbelt.**

Phase 1 is worth doing on its own and is independently shippable. Phase 3 is
the only one with real risk.

## 5b. What building it actually taught us

Three things the design got wrong, all found by testing rather than reading:

**Point curvature cannot describe a corner on this data.** `Tracks.curvature`
differentiates over 12 m. Through one Monza right it reads `+0.024, +0.022,
−0.039` across 50 m — literally "22 m hairpin, then a left". It is zigzag noise
in the OSM-derived centreline. Corners needed a 30 m smoothing window, radius
from heading swept across the whole corner, and apex snapping, before the table
was usable. Monaco's hairpin at 10.2 m (real ~10 m) is the check that it works;
integrated lap heading closing to exactly ±360° is the invariant that guards it.

**Curated apexes don't sit on the geometry.** A def's `turns` documents itself
as best-effort against this centreline, and it means it — apexes land tens of
metres off the real bend, and some circuits number a double-apex as two turns so
after snapping both land in the same corner. Hence snap-then-merge, with merged
corners keeping both numbers (`T9-T10`).

**`scene({visible:true})` reads the last rendered frame, and nothing says so.** Called
straight after `jump()`, it reported a camera 380 m from the car — and the
output looked entirely plausible. `framePending` and a `warning` now surface it.
The general lesson for this kind of API: a stale answer that looks well-formed
is worse than an error.

The registry, by contrast, was cheaper than feared: 169–1,887 placements per
circuit against a 40,000 cap, so the spatial-bias worry about truncation is
moot in practice. It is still reported, because a future circuit could change
that and silent truncation would read as complete coverage.

## 5c. Coverage — measured, not asserted

"Can the agent see the whole world?" deserves a number, not an adjective. The
measurement: build a circuit in the VM harness, then for every shipped primitive
ask whether its centroid falls inside some recorded placement's (padded) box.

| Circuit | named emitters only | with anonymous assemblies |
|---|---|---|
| Monza (park) | 85.5% | 99.6% |
| Monaco (street) | 31.3% | 99.5% |
| Vegas (street/city) | 20.9% | 99.8% |

The first column is what the registry achieved covering the shared scenery
toolkit — and it is a bad answer on street circuits, because each circuit's
bespoke `scenery()` calls the raw guarded emitters directly and that is where
most of a city goes. Vegas alone had 68k undescribed `addBox` calls: the casino
frontages, the pit complex, the grandstand backs.

Recording each primitive was never an option — that IS the vertex buffer, only
more expensive. The fix accumulates consecutive primitives that stay within 30 m
of a running centroid into one anonymous `structure` with measured bounds and a
part count, flushed when emission jumps elsewhere. Primitives are emitted
assembly-by-assembly, so adjacency in emission order is a good proxy for "one
thing". Vegas's 68k boxes become 1,847 structures — a 37x compression that
describes 99.8% of the geometry.

Two bugs surfaced only because the measurement was taken:

- **Anchor-based emitters return GROUND level.** `building`, `tree`, `pine`,
  `palm`, `bush`, `tower`, `house`, `motorhome`, `billboard`, `marshalPost` and
  `signBoard` all anchor at the pavement, and the registry stored that as the
  object's centre. A 40 m building's box therefore ran from −20 m to +20 m about
  the ground: half of it underground, and its upper floors outside their own
  bounds. `at:[x,y,z]` was wrong by `h/2` for every one of those kinds.
- **`Tracks.project`'s hint is a search window, not a seed.** Passing `0` means
  "search ±16 nodes around the start line", so every anonymous structure on the
  circuit projected to `s ≈ 0` and reported itself sitting on the start/finish
  straight. The hint must be omitted for a global search.

What is still NOT covered: vertex data (by design — see `trackGeometry()`),
kerbs and the road surface itself, and materials/colours. Sizes for a few
vegetation kinds are nominal envelopes rather than measured bounds, noted at the
call sites.

## 5d. Replacing the screenshot — and checking it against one

`render({what:"view"})` rasterises the scene into a character grid with per-cell depth
sorting. The justification is the same finding the whole design rests on: BALROG
measured VLMs scoring *lower* with an image than with text alone, so a few
hundred tokens of raster is not a degraded screenshot, it is the better channel
for composition and occlusion.

**It was validated against an actual render at the same pose**, and that is the
only reason it works. Four bugs survived reasoning and died on contact with the
picture:

1. **A tree beside the car painted the whole frame.** A box straddling the near
   plane was widened to full screen, on the theory that its visible corners
   understate it. But "partly behind the camera" also describes a 22 m pine
   standing 20 m to the *side*, and the render came back 100% tree. The centre
   must be in front of the eye or the object is not in shot, whatever its
   corners do.
2. **One structure owned 74% of the frame.** Depth was the box's nearest corner,
   so a 100 m assembly sorted as if its far end were against the lens. Depth is
   now the centre.
3. **A 32×31 m hull of lamp bases blocked the sky.** Anonymous assemblies are
   loose hulls, mostly air. They now carry a `fill` ratio (summed primitive
   volume ÷ hull volume) and sparse ones are skipped as occluders.
4. **The road read as 6% of a frame it half fills.** Sampling a wide surface as
   isolated points cannot cover it; the road is now scan-filled as trapezoids
   between its projected edges.

Every one of those produced confident, well-formed, plausible output. That is
the fourth time in this work that the failure mode was *plausible staleness*
rather than an error — enough to call it the characteristic risk of this kind of
API, and the reason `render({what:"view"})` documents its approximations inline rather than
presenting the grid as ground truth.

The fix in (3) also improved the registry generally: named placements now take
**measured** bounds from the primitives they emit, instead of the nominal
envelopes their call sites guessed.

Measuring the error rather than assuming it turned out to matter. The first
version of this note claimed the guesses were wrong "in a consistent direction",
extrapolating from reading `pine()`'s cone radius. Checked across Monza, they are
wrong in *both*: pines measure **0.39×** their guessed width (a 24.6 m pine is
5.7 m across, not 11.1 m) and broadleaf trees **1.55×** it. Over-wide pines
closed up the sky in the raster; under-wide trees under-stated clearance in every
proximity query. A one-directional fudge factor would have fixed one and worsened
the other — which is the argument for measuring rather than correcting a guess
with another guess.

Remaining honest limit: tree canopies are cones drawn as boxes, so a dense
treeline still closes gaps of sky a render shows. Sky is under-reported in
wooded scenes and the docs say so.

## 5e. Replacing the car viewer

`carView()` returns team identity, livery colours, the full parts spec with its
stat effects, the per-team chassis silhouette knobs, and geometry **measured
from a real `Car3D.build`** — 5.95 m long, 2.10 m wide, 1.01 m tall, 3.30 m
wheelbase. That is everything `tools/car/render-car.mjs` conveys except appearance
itself: reflections, decal placement and whether a paint scheme reads are still
render questions, and the tool stays for them.

## 5f. What using the API taught us

The design was validated by driving it, not by reading it. Three findings, one
of which invalidated a feature's rationale.

**It is sufficient to drive on.** Interlagos — a circuit never inspected during
development — was learned entirely through `render({what:"circuit", detail:"sections"})` in
25 KB, then driven by a policy using *only* `nextCorner`, `ego.lateralM` and
`ego.headingErrDeg`. Against a naive full-throttle baseline over the same 40 s:
302 m → **1,358 m**, off-track 34.8 s → 11.0 s, mean speed 61.6 → 127.2 km/h.
The API's own `"BRAKE NOW"` hint drove the braking. That an agent acting on the
payload does materially better is stronger evidence than any shape assertion.

**The hooks agree with each other.** At a fixed pose every kind `render({what:"view"})`
rasterises is one `scene()` independently reports (`unexplainedKinds: []`), and
the corner `world()` calls next is one `scene({visible:true})` independently puts on screen.
Four hooks, four code paths, no disagreement — the check that would catch a
projection or registry mismatch.

**Delta mode was built on a precondition that does not hold here.** The
diff-history result it was modelled on (~4× more usable context,
<https://arxiv.org/abs/2312.07540>) comes from NetHack, where the world is
discrete and mostly static between actions. A racing sim is the opposite.
Measured across a 20-step driving loop, exact diffing saved **1.17×** — nothing.

Adding a deadband (a change smaller than the agent could act on is not a change,
with the baseline advancing only by what was reported so drift stays bounded)
took it to 1.20×. Still not a win. The temptation was to widen the deadband until
the number looked good; that would only have started hiding real changes.

Measuring where the lever actually is settled it:

| call | bytes/step | vs `full` |
|---|---|---|
| `full` | 12,089 | 1× |
| `drive` | 3,501 | 3.5× |
| `drive` + `since` | 2,908 | 4.2× |
| `brief` | 1,026 | 11.8× |
| `brief` + `since` | **355** | **34×** |

`detail` is the dominant lever, not `since`. And `since` is worth 2.9× on
`brief` against 1.20× on `drive`, because the unchanging envelope is a much
larger share of a small payload — a combination never tested until the numbers
forced the question. The feature earns its place, but not for the reason it was
built, and not where it was expected to.

## 5g. Why the view raster (`render({what:"view"})`) is not ASCII art

The obvious reading of "render the game to text" is a luminance ramp: shade the
scene, map brightness to `.:-=+*#%@`, done. That is how every ASCII renderer
works and it is the wrong target here, because the reader is a model rather than
an eye.

[ASCIIEval](https://arxiv.org/abs/2410.01733) benchmarks exactly this and finds
LLMs "remain far behind human performance in shape recognition" from character
art. A luminance ramp asks the reader to reconstruct a shape from shading — the
documented weak spot. Semantic glyphs skip the step entirely: the character
already says what it is, so nothing has to be recognised.

Three further findings from the same work, each of which changed a default:

- **Accuracy is sensitive to the LENGTH of the art**, and a *low-resolution*
  prompting strategy improves perception. More cells is not more legible. The
  default grid is small deliberately and the docs say so, against the natural
  instinct to raise resolution when something reads poorly.
- **Text-and-image together scores below image alone**, which retires the idea
  of shipping the raster next to a screenshot as belt-and-braces.
- **Text input beats image input** for this content, which is the same direction
  BALROG found for game observations generally.

What the renderer literature *did* contribute is the geometry. A character cell
is about twice as tall as it is wide, so a grid whose ratio matches the
viewport renders squashed — the fixed 48x18 default was an effective 1.33
against a 2.16 viewport, stretching a square object 1.6x vertically. Rows are
now derived from the real aspect unless pinned.

And the one photometric idea worth keeping is the one that is *measured* rather
than modelled: a depth channel. The raster already builds a depth buffer to
solve occlusion, so reading it out costs nothing, it is a genuine render target,
and interpreting "3" as seven metres needs no shape recognition at all.

## 5h. Agent view as the text-native debug mirror

The clarifying frame, arrived at late: agent view is not "a driving observation"
— it is the **text-native mirror of the whole `__apex` debug toolkit**.
Everything a developer inspects with the ~182 hooks and screenshots, an agent
should do in text. That reframes the surface into three kinds of thing:

1. **Curated calls that COMPOSE and render** the spatial/visual questions a dev
   would otherwise screenshot: `world()`, `field()`, `scene()`, `trackInfo()`,
   `carView()`, `render()`, `survey()`.
2. **Raw read hooks that already return clean JSON** — `physState()`,
   `lightState()`, `camState()`, `viewState()`, `timing()`, `cars()`, … — which
   need no wrapper; the agent calls them directly. `agentHelp().read` names them.
3. **Control verbs** — `act()`, `jump()`, `weather()`, `setTimeOfDay()`, … —
   surfaced in `agentHelp().control` so they are discoverable, not guessed.

Two concrete products of the reframe:

- **`field({detail})`** — the allocentric standings mirror of `fieldState()`:
  every car by position with gap-to-leader and interval in seconds.
  `world().rivals` stays the *egocentric*, saliency-capped nearest-few for a
  driving decision; `field()` answers "where is everyone".
- **Compact rivals.** Dogfooding the live `world()` caught the accreted
  anti-pattern every research stream warns against: each rival was spreading the
  entire team **object** (colour float-arrays, both drivers, stats, `_cssColor`)
  — ~180 lines of noise around ~5 useful fields. Rivals (and `field()` rows) now
  carry a team **id string**. The `world({drive})` payload dropped from ~5 KB to
  ~2.7 KB, and it reads.

The rule the whole redesign enforces: **emit an identifier, never the record**;
compact, egocentric, saliency-capped; render what you *read*, expose what you
*do*.

## 5i. High detail without the dump — the drill-down layer

"Make it a full, highly detailed text renderer" and "keep it readable" are only
compatible one way. The evidence is unambiguous: flat-serialising a rich scene
graph is *both* infeasible (a small robotics scene graph runs ~7M tokens) *and
less accurate* than exposing it queryably — and thousands of near-identical
objects are the worst case, because semantic similarity is what drives context
rot. Monza registers **2835 props**. So the answer is not a bigger payload:

**The world is stored in full and never dumped. Detail is pulled.**

- **Stable ids** — `prop:<n>`, `corner:<turn>`, `car:<n>`, `span:<n>` — derived,
  not stored, so they survive a rebuild. Every list row carries one, and they
  cross-reference (a prop names its `nearestCorner` as an id).
- **`describe(id)`** returns everything about exactly one entity (~314 bytes for
  a prop). Unbounded detail about *one* thing is cheap; unbounded detail about
  everything is the failure mode.
- **`query({kind, near, fromS, toS, limit})`** returns a bounded slice as
  **prototype + instances** — one shape per kind, then a position each, with a
  size repeated only when it differs >25%. Six pines cost ~1.1 KB instead of six
  full records, and the response says what it withheld.

Meanwhile the per-tick `world({detail:"drive"})` stays ~3.2 KB *with* the new
banking/gradient/kerb fields, guarded by a test. Detail belongs in the
drill-down, not the hot path.

### What dogfooding caught that the tests did not

Every bug in this phase was found by *reading the output as its consumer*, while
the shape assertions were green:

- Rivals were spreading the **entire team object** — ~180 lines of colour arrays,
  driver lists and `_cssColor` around ~5 useful fields.
- `atmosphere()` reported **"sun to your right" over a floodlit midnight**: at
  night the renderer keeps the sun direction and dims it to moonlight, so sun
  elevation still reads +43°. The same bad signal suppressed the floodlight
  phrase entirely.
- Banking read **0° on every banked corner**, because the populated source is
  `def.bankZones → track.bankP → Tracks.banking()`, not `Tracks.bankAngle()`.
  Once fixed, the sign was inverted and all six read "off-camber" — the opposite
  of what an authored bank zone means.
- The CLI's `--kind` filter **silently didn't bind**, so `query` returned all
  2835 props and looked like it was working.

Tests prove a thing is correct; dogfooding proves it is good.

## 5j. Higher-fidelity raster — a deliberate, informed exception

Everything above argues for structured text over rasters. Asked directly
whether to also raise the raster's fidelity, given that the evidence says
denser character grids read *worse* for LLMs, the answer was still yes — as a
**human-facing** inspection aid, not a change to what an agent should read.

- `render({what:"view"})`: `cols` default stays 48, cap raised
  8→400. `rows` derives from the true viewport aspect either way.
- `render({what:"map"})`: `cols` cap raised 200→300, `rows` to 150.
- `render({what:"car"})`/`carView({detail:"render"})`: gained a supersampling
  knob, `ss` (1–6, default 3), through the *existing* Sobel-on-depth pipeline —
  no new glyphs, just more samples per cell before composing down to one
  character. Dogfooding confirmed `ss:1` and `ss:6` render visibly differently.
- Every cap **clamps rather than hangs the tab** on an unreasonable request
  (`cols:5000` → 400; `cols:100000, ss:999` → 300/6) — this was a real gap
  before: `carRender`'s `cols` was previously unclamped end to end.

Defaults are untouched and verified so (a fresh `render({what:"view"})` is
still 48 columns), `agentHelp()` still points decisions at `world()`/`scene()`/
`trackInfo()`, and the `aid: "APPROXIMATE…"` flag stays on every raster
response. The honest framing: this is for looking at, not measuring from.

## 5k. Determinism, and the state that was invisible

Two production artefacts from Luden.io (the article *AI Agents in Game
Development*, Jun 2026, and their `WebGameTemplateForAgents` repo) validated this
architecture and exposed two gaps it had.

Their central finding — "the most game-changing thing is any state management
architecture that lets you inspect the current world state *and its changes* in a
text format, **even better if it's deterministic**" — describes `world()` +
`since=` deltas exactly. Their March-2026 scenario-testing breakthrough, a "fake
input layer between real player input and game logic", is `setInput()`/`act()`.
So the shape was right. What was missing:

**1. The sim was not deterministic.** Their rule is absolute: *"`Math.random()`
forbidden."* Here, `js/track/`, `js/car/` and `js/circuits/` were already clean
(the track build is hash-seeded), but five sites in `js/game.js` fed the
simulation from `Math.random()` — AI lane jitter, AI skill, grid order, the
start-lights hold, and **the AI overtake decision, which fires every tick for
every AI car**. That last one made two runs of one scenario diverge immediately,
so `rollout()` and `agent-drive-bench` were comparing runs that were never
comparable.

Seeding those five (a ten-line LCG, `simSeed`/`simRnd`) then made two further
leaks *visible* — both only findable once a run could actually be repeated:

- `gridUp()` clears the race-level fields but not the drivetrain, so gear, rpm
  and smoothed steering leaked between episodes.
- `prog` accumulates from `c._prevS` (written by `updateCar()` in
  `js/game.js`), which `reset()` never
  cleared — so the first tick of a fresh episode banked one delta measured
  against the *previous* episode's final position. Measured as ~1 m of drift over
  a 4 s rollout at identical seed and inputs.

Cosmetic randomness (camera shake, lightning, particles, audio) deliberately
stays on `Math.random()`: if it drew from the seeded stream, whether a spark
spawned would change where a car ended up. A test asserts exactly that.

**2. Some state was invisible everywhere.** Mapping all 79 car fields against
both `agentview.js` and `apex.js` found state no hook exposed. The worst was
`penalty`/`cuts`: an agent could accrue track-limit penalties, be scored on them,
and have no way to perceive them — it could not learn to stop doing the thing it
was being punished for. Also missing: ERS deployment and the overtake window
(only `energy` was exposed), AI `skill` (every rival looked equally fast), engine
`rpm`, and recovery state (`offroad`, `stuckT`, `wallT`).

**3. The game was undocumented as a game.** `agentHelp()` described the API;
nothing said what ERS is *for* or what winning is. The fix is one small call,
`objective()`, not a document — and it states static facts only. The evidence:
attaching domain meaning to identifiers an agent already reads is the best
measured token spend (BIRD text-to-SQL, **+20pp** from one evidence sentence),
and reading a game's rules can beat a lot of experience (SPRING, NeurIPS 2023).
But *fixed dynamics* rules improve then **degrade** an agent (Cogito Ergo Ludo
ablation), and standing context files measurably fail to help while costing
>20% more tokens (ETH Zurich, arXiv 2602.11988). So `objective()` says what the
game is and refuses to say how the car behaves.

## 6. Open questions

- **Prop registry granularity.** Per composite model, or per emitted
  primitive? Per-primitive is what `track-build-vm.cjs` already produces but
  would be enormous on a street circuit.
- **Does the registry ship, or is it opt-in** behind a flag like
  `setKeepGeometry`? Memory cost on Vegas/Baku is the deciding factor.
- **Racing line.** Several recommendations here (lateral offset relative to
  the *line*, not the centreline; suggested brake points) assume a reference
  trajectory exists. There isn't one today. Deriving one per circuit is its
  own project — Trajectory-Aided Learning is the relevant prior art.
- **Where the toolbelt lives.** In-page JS reachable via `apex-eval.mjs`, or a
  real MCP server wrapping the Playwright harness?

## 7. Sources

Modality and observation format — BALROG <https://arxiv.org/abs/2411.13543> ·
diff history <https://arxiv.org/abs/2312.07540> ·
Voyager <https://voyager.minedojo.org/> ·
CRADLE <https://arxiv.org/abs/2403.03186> ·
NLE language wrapper <https://openresearchsoftware.metajnl.com/articles/10.5334/jors.444>

Racing state vectors — GT Sophy <https://www.nature.com/articles/s41586-021-04357-7> ·
vision-based GT7 <https://arxiv.org/pdf/2504.09021> ·
Trajectory-Aided Learning <https://arxiv.org/abs/2306.07003> ·
DeepRacer reward inputs <https://docs.aws.amazon.com/deepracer/latest/developerguide/deepracer-reward-function-examples.html> ·
LanguageMPC <https://arxiv.org/pdf/2310.03026> ·
DiLu <https://arxiv.org/pdf/2309.16292>

Tool and context design — writing tools for agents
<https://www.anthropic.com/engineering/writing-tools-for-agents> ·
CodeAct <https://arxiv.org/abs/2402.01030> ·
Chrome DevTools MCP <https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md> ·
Agent-E <https://arxiv.org/pdf/2407.13032>

Real-time — AgileThinker <https://arxiv.org/html/2511.04898> ·
Hierarchical Language Agent <https://www.ifaamas.org/Proceedings/aamas2024/pdfs/p1219.pdf> ·
Speculative Interaction Agents <https://arxiv.org/html/2605.13360>

Scene graphs and spatial reasoning — 3DGraphLLM <https://arxiv.org/abs/2412.18450> ·
SnorkelSpatial <https://snorkel.ai/blog/introducing-snorkelspatial/> ·
WebArena <https://webarena.dev/static/paper.pdf>
