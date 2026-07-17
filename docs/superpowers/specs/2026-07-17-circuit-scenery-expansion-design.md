# Circuit Scenery Expansion Design

## Goal

Expand Apex 26's scenery vocabulary with reusable circuit infrastructure,
theme-driven variants, and composable landmark forms. New models must improve
track identity without reintroducing road intrusion, floating geometry, invalid
meshes, or uncontrolled prop counts.

## Scope

The work adds three complementary layers:

1. `CircuitKit` for complete reusable facilities and track furniture.
2. `SceneryThemes` for coherent style defaults and density policies.
3. `LandmarkKit` for architectural forms composed by circuit definitions.

Existing track files opt into these layers explicitly. This design does not
replace bespoke `scenery(api)` callbacks or automatically redress every track.

## Architecture

### TrackModels

`TrackModels` remains the safety and emission foundation. Complete models stage
their geometry before commit, validate finite buffers and indices, check their
footprint or overhead clearance, and emit atomically. The new layers call these
contracts rather than writing directly into shared buffers.

### CircuitKit

`CircuitKit` provides parameterized, complete facilities:

- pit building and garage row
- hospitality suite and paddock pavilion
- race-control and timing tower
- pedestrian or sponsor bridge
- camera crane and broadcast platform
- marshal shelter and recovery bay
- service compound with parked support vehicles
- modular catch-fence gate, braking boards, DRS boards, and light/sign clusters

Each helper accepts a stable model ID, a track-relative anchor or sector, style
options, dimensions, and an optional `required` flag. Large models use
`modelGroup`; cross-track models use `overheadSpan`; terrain-following runs use
`groundedSegments` or `groundPatch`.

### SceneryThemes

`SceneryThemes` contains data-only defaults for `street`, `desert`, `park`,
`permanent`, and `night-event` presentations. A theme can define:

- material and accent palettes
- window/emissive behavior
- preferred roof and façade variants
- furniture spacing and sector density budgets
- vegetation, service-vehicle, and crowd defaults
- day/night substitutions

Themes never place geometry by themselves. Track files request models and may
override every theme value. This keeps track identity and placement ownership in
the circuit definition.

### LandmarkKit

`LandmarkKit` exposes composable architectural forms:

- curved, sawtooth, sail, and cantilever roofs
- stepped, glazed, louvered, and LED façades
- observation, lattice, and tapered towers
- stadium bowl and grandstand sections
- arches, colonnades, terraces, and podium plinths
- wheel, mast, dish, screen, and canopy assemblies

These are building blocks rather than named replicas. A track combines them
inside one atomic `modelGroup` to produce a recognizable landmark while sharing
safe geometry and validation.

## API and Data Flow

The scenery API exposes `circuitKit`, `landmarkKit`, and `sceneryTheme`.

1. The track chooses a theme and supplies explicit racing/source coordinates.
2. The selected helper resolves theme defaults with track overrides.
3. It samples the shared terrain profile and track frame.
4. It computes complete bounds and performs footprint, support, or clearance
   preflight checks.
5. It stages all constituent geometry.
6. `TrackModels` validates and atomically commits the model.
7. Model diagnostics record the ID, variant, vertex count, and suppression or
   validation reason.

No helper silently falls back to world origin, zero height, or partial emission.

## Budgets and Determinism

Every repeated helper accepts a spacing or count limit. Theme recipes define
default per-sector budgets, while tracks can choose lower values. Stable hashes
derived from track ID, model ID, and placement index select deterministic
variants. Loading the same track, time of day, and weather must produce identical
geometry and diagnostics.

Initial guidance:

- hero landmark: at most 50,000 vertices
- facility group: at most 25,000 vertices
- repeated furniture family: at most 10,000 vertices per sector
- no helper may create an unbounded per-node emission loop

The limits are validation defaults, not reasons to increase global prop budgets.

## Failure Handling

- Invalid dimensions, coordinates, or options suppress the whole model and add
  an `invalid` diagnostic.
- Road-overlapping supports or footprints add a `suppressed` diagnostic.
- Insufficient overhead clearance adds an `unsafe` diagnostic.
- A failed required hero model makes `verify-track` fail.
- Optional models fail closed and do not prevent the circuit from loading.
- Theme lookup failures use documented neutral defaults, never another track's
  theme.

## Testing

Pure Node tests cover:

- deterministic theme resolution and override precedence
- atomic success and failure for each complete facility
- finite geometry and valid indices for every landmark primitive
- terrain grounding across sloped endpoints
- support rejection and minimum overhead clearance
- density and vertex-budget enforcement

Playwright coverage adds representative builds for one street, desert, park,
permanent, and night-event circuit. Tests assert clean model/geometry diagnostics,
no new prop-over-road readings, stable day/night manifests, and finite wall
boundaries. Visual galleries provide review evidence but are not the only safety
gate.

## Rollout

1. Add and test the three shared layers without changing shipped tracks.
2. Migrate one representative circuit per theme.
3. Run full track verification, terrain/prop audits, and visual review.
4. Tune helper defaults from those migrations.
5. Adopt the kit incrementally in the remaining track files.

The current per-track improvement batch remains independently integratable. Its
results should land before representative circuits are selected, preventing
duplicate landmark work and preserving the latest track-owned fixes.
