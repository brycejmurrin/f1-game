# Agent World API — showing the game to an LLM agent as JSON

**Status: design. Nothing here is implemented yet.**

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

`window.__apex` exposes ~89 hooks (measured at runtime). `obs()`
(`js/game/apex.js:1064`) is already a better observation than most published
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
| `track.lampPosts` | `js/track/tracks.js:1659` | **The only semantic prop registry.** `{k, side, x, y, z, kind}` per floodlight/lamp |
| `track.barL` / `barR` | `js/track/tracks.js:499` | Per-node lateral barrier limit. No kind, no height |
| `track.kerbL` / `kerbR` | `js/track/mesh.js:152` | Which side has a kerb, per node |
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

`corners()` returns bare curvature-peak fractions. `CircuitMarkings`
(`js/track/markings.js`) has curated per-circuit `turns:[frac…]` in driving
order, but `info().turns` surfaces only the *count*. No direction, no radius,
no name, no entry/apex/exit, no braking reference.

### 2.3 Look-ahead horizon is distance-scaled, not time-scaled

`obs().scan` is hardcoded to `[10, 30, 60]` m (`js/game/apex.js:1081`). At
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
`carOrbit()` has to reconstruct world XZ itself (`js/game/apex.js:558`)
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

**P9 — Consolidate the toolbelt; keep the dev console.** ~89 hooks is a good
debug console and a poor agent interface — tool schemas alone can eat 20–40%
of context. Expose ~6 composed tools; leave `__apex` untouched underneath.

**P10 — Code as an escape hatch.** CodeAct reports up to +20% success and ~30%
fewer steps for executable code over JSON actions. One `eval` tool over
`__apex` turns 89 hooks into one tool and lets the agent write filters we
didn't anticipate. <https://arxiv.org/abs/2402.01030>

## 4. The design

### Layer 0 — envelope

Every payload carries:

```json
{ "apiVersion": 1, "physicsVersion": 1, "seq": 1841, "t": 41.83,
  "conventions": "+x right of centreline, +k right turn, metres, m/s, radians" }
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
                  "status": "brake in ~22 m" },
  "ahead": { "horizonS": 4.0, "pts": [ {"d":20,"r":"straight"},
                                       {"d":84,"r":52,"dir":"L","turn":"T7"} ] },
  "rivals": [ { "id": 3, "rel": "ahead", "gapM": 22.4, "gapS": 0.46,
                "lateralM": 2.1, "closingMps": 1.8, "side": "right",
                "threat": "closing" } ],
  "affordances": [ { "id": "deploy_ers", "why": "energy 0.74, 380 m straight" } ],
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
per-tick payload. Sources already exist: `CircuitMarkings`, `def.turns`,
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

**3b. `visible()` — what is in frame (~10 lines).** Export
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
| `apex_eval({js})` | escape hatch over the full ~89 hooks |

`__apex` itself stays exactly as it is. This is a layer, not a replacement.

## 5. Phasing

**Phase 1 — presentation only, no new data.** Envelope + versioning, `detail`
levels, `nextCorner` from `CircuitMarkings`, time-scaled look-ahead, radius
instead of curvature, per-rival rows, typed errors with a `fix` field, split
`done` into `{done, reason}`, the `brief` string. All of this is derivable from
state that already exists. Highest value per line of code.

**Phase 2 — `visible()`.** Export the two frustum functions; add the query.

**Phase 3 — prop registry.** The only phase that touches the build path, so
the only one that needs `tools/verify-track.cjs` and the scenery contract test
(`tests/scenery-api-contract.test.mjs`, which freezes an 84-member API) run
against it. Vertex-budget sensitive.

**Phase 4 — rollout summariser and the toolbelt.**

Phase 1 is worth doing on its own and is independently shippable. Phase 3 is
the only one with real risk.

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
