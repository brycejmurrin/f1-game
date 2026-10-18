# Three.js WebGPU performance: work avoided and ownership fixes

The primary target is TLX on WebGPU. Baseline: `4bc2f4bc00fe64caf9f2da37bc224060a6cf3007`,
which includes the garage flap-cache and texture-pool fix #2812. Five bounded
audits covered shadows, lighting/materials, instance/chunk selection, garage
rebuilds and asynchronous resource ownership. A separate reviewer checked the
combined cache, mirror, fog-height and disposal contracts.

## Instance budgets

Chunked scenery already used `Frustum.radialCulled`; instanced scenery only
tested frustum planes. TLX now applies the same conservative distance/fog
predicate before packing instances. GLX/WGX retain API parity. Each backend
uses its latched main/mirror eye and budget; shadows keep their independent
selection. Plane-cache snapshots include the eye, radius, fog density and
height. Cell-key hits preserve both physical-pack snapshots. With no budget,
moving the eye does not invalidate the pack.

Three fresh pages per arm, 30 main renders each: Vegas, normal chase camera
frozen at 10%, 640x360, tier/resolution held, fog density multiplier 3.625
(effective density 0.00489375, height falloff 0.018). Three's WebGL2 renderer
with stubbed shader links provides renderer counters, not accepted hardware
draws, pixel correctness, frame timing or FPS. The same TLX JavaScript culler
serves WebGPU, but these percentages are not hardware WebGPU measurements.

| Renderer-counted triangles/frame | Baseline runs | Candidate runs | Mean change |
|---|---|---|---|
| Main instanced scenery | 67385, 67039, 67064 | 47856, 47700, 48018 | -28.7% |
| All passes | 209326, 209239, 209136 | 189927, 190034, 190088 | -9.2% |

There were no mirror renders in this fixed chase scenario. Mirror origins and
cache transitions have separate production-function regression tests; the
hardware request switches chase to cockpit to exercise the mirror path.

Use the reusable census without a free camera:

```sh
node tools/gfx/pass-census.mjs vegas --frames 30 --warm 10 --camera chase --park --tune fogDensityMul=3.625 --by-object --json artifacts/profiles/vegas-parked.json
```

The exploratory opportunity counters were outside the 30-render window and
read original batch handles, which do not describe mirror views. Do not use
their totals for A/B savings. Free-camera `eyeAt()` also deliberately disables
fog culling: a zero-saving free-camera control is not evidence about gameplay.

## Decal bake sampling

The decal pool previously sampled the bake indirection and atlas before
checking whether baking was enabled, the point was in range, and the tile
was occupied. Explicit-LOD reads now sit inside those gates. Real vendored
WGSL and GLSL builders place the reads at branch depths 1 and 2 instead of 0
and 0; no implicit-derivative sample was moved into a nonuniform branch.

`tools/gfx/decal-bake-probe.mjs` executes the production pool on WebGL2 and
compares baseline/candidate pixels for disabled placeholders, a valid tile,
outside extent, an empty tile and disabled live textures. All five match;
the positive control is `[64,128,191,255]`, the others `[0,0,0,255]`.
No GL or page errors occurred. This is an isolated shader check on software
graphics, not a full-scene/WebGPU visual check or measured GPU-time win.

```sh
node tools/gfx/decal-bake-probe.mjs --base 4bc2f4bc --json artifacts/probes/decal-bake-ab.json
```

## Garage and shadow ownership

Truss and dress UV geometry depend only on fixed dimensions, so retain them
through paint/team/context changes and bind the current atlas when drawing.
Production builders with a recording renderer, initial prepare plus 20
changes: 319 ordinary + 131 UV handles become 299 + 11 (450 to 310, seven
avoided per edit). Resident handles remain 32: this measures churn, not a
growing live-mesh leak. Release now also frees the omitted reflection-fade
mesh, and replacing renderer owners releases resources through the old owner.

Mobile renderers expose dynamic-shadow hooks but create no corresponding
targets. The producer now checks nonallocating capability getters before
resolving silhouettes or culling props. A 60-frame production-producer test
goes from 60 daytime caster resolutions to zero, and from 30 night resolutions
plus 60 prop culls to zero. Restoring capability resumes work. Zero shadow
darkness skips the car map while preserving static sun data for god-rays.

## Other cleanup and rejected leads

Superseded Data Hub schedule loads created detached nodes with document-wide
observers. Explicit disposal retires stale completions and replaced cache
entries; native Chromium's 40-load regression retains one current observer
instead of 40, while reopening the cached view still works.

Tighter instance AABBs saved only about 4% in synthetic views. Although Vegas
has sheared placements, checking every transformed vertex found no actual
bounds violation. Do not report that algebraic suspicion as a shipped bug.
The palette DOM optimization was left separate because an active editor PR
owns that code. Mirror road density remains a larger structural lead needing
LOD design and visual proof.

TLX already supports asynchronous WebGPU timestamps. Three requests supported
device features independently of the timer's initial off state; the earlier
macOS census's `supported:false` is not a missing timer integration. Do not
rebuild that instrumentation or interpret repeated timestamp results as fresh
frame samples.

A local full-game night capture was black despite zero GPU errors and the
probe's `ok:true`; it is not accepted visual evidence. Full-scene WebGPU
correctness must come from the macOS census verdict. That request uses night
Vegas and chase-to-cockpit, not the dense-fog A/B scenario above.
