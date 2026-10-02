# Wetness and lighting — workstream plan (2026-09-30)

Status: **PLAN** — docs-only first. Implement (a) continuous track wetness in
ordered slices after this PR lands; implement (b) lighting grids as small
per-shard PRs in parallel with (a) once the wetness contract exists (or with
explicit `wetness: -0.05` / AUTO so new grids cannot reintroduce the look≠drive
bug).

### Wet asphalt mirrors (SSR / puddles / ripples) — already shipped

Do **not** rebuild a WGX-only wet SSR stack. As of 2026-10-01 tip:

| Feature | GLX | TLX | WGX | Notes |
|---|---|---|---|---|
| Wet darken / polish / puddle mask | yes | yes | yes | Lit wet block; porous mats skip sheen |
| Rain ripples (`frame.rain`) | yes | yes | yes | PR [#649](https://github.com/brycejmurrin/f1-game/pull/649) |
| Wet-road SSR (half-res / composite) | yes | yes | yes | Strength `frame.wetness * ssrWetMul`; shed tier ≥ 2 / LITE |
| Analytic envBlend (gloss fallback) | yes | yes | yes | When SSR sheds or a march misses |
| World env-probe in `envBlend` + sun-glint knee | open [#660](https://github.com/brycejmurrin/f1-game/pull/660) | same | same | Lit shaders / `params4.w` — do not collide |

Remaining look work that still belongs here is the **wetness contract** (A1–A3:
look=drive), not another SSR pass. Optional later: puddle-weighted SSR cover in
`*-post.js` only (post files are safe vs #660). Stale “Phase-4 SSR pending”
comments in `wgsl-chunks.js` were scrubbed when this status landed.

Ship base for this plan: tip of `claude/f1-game-project-26h3ng` at writing
(`24c8fc534`). Workstream owner: this agent. Other agents own scenery,
career/strategy, multiplayer, UI — do not edit their files beyond a one-line
hook when a consumer must move onto the shared wetness read.

## Goal

1. **(a) One continuous track-wetness value** that grip (`js/game.js`
   `roadWetness` / `gripMult`), `TyreModel.wetness`, AI compound / pit rules
   (`engineer.js`, `PitLane`, `AiDrive` via `gripMult`), `weather-arc.js`, and
   the wet shaders in GLX / TLX / WGX (wet SSR, puddles, road darken) all read,
   so the track cannot look dry and drive wet (or look wet and drive dry).
   Start with a **global** continuous value. Spatial / sector drying is later.
2. **(b) Bake full `tod × weather` lighting preset grids** for the twelve
   circuits that fall through to `"*"` alone: anderstorp, brands_hatch, buddh,
   dijon, donington, fuji, jerez, korea, mont_tremblant, mosport, okayama,
   zolder. Do not over-lift `day|dry` or wash out rain character.

## Current state (file / line evidence)

### Continuous wetness already exists for physics — but render can disagree

| Path | What it does today |
|---|---|
| `js/physics/tyre-model.js` `wetness(weather, arc)` (~515–520) | Maps `dry→0`, `wet→0.5`, `rain→1`; during an arc **lerps** `from→to` by `arc.t/arc.dur`. `overcast` / `fog` map to **0**. |
| `js/game.js` `roadWetness()` / `gripMult()` (~949–950) | Physics grip reads `TyreModel.wetness(raceWeather, wxArc.arc)` then `TyreModel.weatherGrip(tread, w)` against `PhysicsConsts.WET_GRIP`. |
| `js/physics/consts.js` `WET_GRIP` (~125–128) | Slick / inter / wet rows for wet and rain tiers. |
| `js/race/weather-arc.js` | Owns the discrete weather enum flip (`setWeatherLive`) and arc stage walk on `LADDER = ["dry","wet","rain"]`. Mid-arc it **stage-flips** `raceWeather` while `TyreModel.wetness` already interpolates — consumers that only read the enum disagree with grip. |
| `js/game.js` frame wetness (~7538–7548) | **If `LT.wetness >= 0`, `frame.wetness = LT.wetness` (preset / tuner override). Else** ramp toward `roadWetness()` at `dt * 0.8`. |
| `js/lighting/knobs.js` `wetness` (~176) | Range `-0.05…1`, default `-0.05` (= AUTO). Help text: "Override the road wetness ramp". |
| Shipped presets | **80 `*|dry` conditions pin `wetness` ≥ 0** (dawn 0.685, night 0.545 measured across abudhabi…zandvoort). Comment at `js/game.js` ~7706: dry night presets pin ~0.55 sheen. That means **dry races look wet on the road material / SSR while grip stays dry**. 40 wet conditions also pin `wetness` (usually 1). |
| Render upload | GLX `uWetness` (`glx.js` ~1914), TLX `U.wetness` (`tsl-lit.js` ~332), WGX `params1.z` (`wgx.js` ~3129 / `wgsl-chunks.js` ~955) all take `frame.wetness`. Wet SSR amount is `frame.wetness * LT.ssrWetMul` (`game.js` ~8528). Separate dry sheen knobs exist (`ssrDryNight`, `ssrDryDay`) that do **not** need the wetness override. |
| Engineer / pits | `engineer.js` ~197 and `pit-lane.js` (~628, 1320, 1577, 1691) already call `TyreModel.treadFor(G.raceWeather, G.roadWetness())` — physics path is shared; they do **not** read `frame.wetness`. |
| `AiDrive` | No direct weather read; lateral / yaw scales take `gripMult(c)` from game.js. |
| Characterization | `physics-characterization` / its VM twin do **not** pin weather (default dry). `mechanics-integration-vm.test.mjs` (~35–49) asserts continuous grip through an arc but **does not assert `frame.wetness === roadWetness()`**. |

The September 14 survey (§6 / weather row) and `docs/plans/2026-09-15-racing-depth.md`
still list "Spatial wetness / drainage / drying / puddles" as pending a
**shared** surface field. The mechanics-coherence plan claimed "one continuous
global wetness drives grip and rendered road wetness", but the `LT.wetness`
preset override re-broke look≠drive for any condition that ships a pinned value.

Lamp-plan context (`docs/notes/LAMP-POPPING-PLAN-2026-09-24.md`): wet-phone
per-chunk floor keys off `frame.wetness > 0.75` (game.js ~7706). Any wetness
contract change must keep that gate coherent with real wet/rain, not dry sheen.

### Lighting grids: 40 full, 12 fallthrough

`docs/LIGHTING.md` Progress (§): 40 of 52 circuits have a full 20-key
`tod × weather` grid (800 keys + `"*"` + ULTRA `"*|<tod>"`). The twelve listed
in the goal have **zero** `track|…` keys and resolve to `"*"` alone
(verified by parsing `js/lighting/presets.js`).

Campaign lattice already knows them (`tools/lighting/campaign/config.mjs`
`TRACKS` / `SHARDS` / `CAMERA_FRACTIONS`). Look-survey sheets exist only for the
first wave (`docs/look-survey/README.md`); none of the twelve have a sheet yet.

Themes (from each `js/circuits/<id>.js`): nine `green` day-default, jerez
`desert`, korea `modern`. All day-default (`night: false`). Natural donors for
a first bake: green → estoril / kyalami / watkins_glen family; desert → bahrain
day looks (not night-default stadium); modern → madrid / mexico day looks.
Never copy a night-default street grid onto these.

## Design

### (a) Shared global `trackWetness`

**Single source of truth.** A continuous scalar `w ∈ [0,1]` owned by
`WeatherArc` (or a tiny new module under `js/race/` — proposed path
`js/<new>/race/track-wetness.js` — created by WeatherArc and exposed on `G`).
Every consumer that today reads weather-for-grip or weather-for-road-look must
go through it:

| Consumer | Must read |
|---|---|
| `gripMult` / `roadWetness` | `G.trackWetness()` (alias kept) |
| `TyreModel.treadFor` / engineer / pits | wetness arg only (weather arg becomes optional / ignored when wetness is finite — already the case) |
| `frame.wetness` (all three backends) | same value after ramp (or equal when settled) |
| Rain particles / thunder / `isRaining` | may stay enum-gated, but thresholds must be functions of wetness (e.g. rain FX when `w ≥ ~0.72`) so mid-arc cannot show dry rain overlay on a wet road |
| Lighting atmosphere (`applyRaceSettings`) | keeps discrete weather for sky / fog profiles, but must **not** pin road wetness |

**Kill the look≠drive override path for shipped looks.**

- Preset / tuner `LT.wetness >= 0` must **not** replace physics wetness for the
  road material in a race. Prefer one of:
  1. **Preferred:** `LT.wetness` becomes diagnostic-only (AUTO always in shipped
     presets); dry night sheen stays on `ssrDryNight` / `ssrDryDay` / `roadRough`.
  2. Or split into `roadWetnessOverride` (agent/tuner, never baked into
     `LightPresets`) vs decorative sheen already covered by dry SSR knobs.
- Migration: strip `"wetness": …` from every shipped `track|tod|wx` (and refuse
  merge-proposals that reintroduce it). Measured today: 80 dry + 40 wet pins.
- Keep `__apex.lightTune({ wetness })` for live A/B in the tuner (documented as
  non-shipping).

**Arc continuity.** While an arc runs, `trackWetness` lerps `from→to` (same
math as `TyreModel.wetness` today). Stage flips of `raceWeather` remain for
atmosphere presets, but grip and `frame.wetness` never jump at the stage
boundary. After the arc ends, wetness equals the target tier's canonical value
(`dry=0`, `wet=0.5`, `rain=1`; lateral `overcast`/`fog` stay 0 unless a later
slice assigns a small dampness — **out of scope** unless measurements demand it).

**Characterization pins.** Every physics / grip characterization fixture that
boots a race must set an explicit weather (at least `dry`) and assert
`roadWetness()` / settled `frame.wetness` match the pin. Arc tests assert
look-and-grip equality at sampled times.

**Spatial later (NOT this workstream's ship).** Sector wetness, drainage,
drying racing line, local puddles / aquaplaning stay deferred
(`docs/plans/2026-09-15-racing-depth.md` remaining register). The global
contract is the prerequisite.

### (b) Preset grids for the twelve

Follow the existing bake path (`docs/LIGHTING.md`, lighting-tuner `bake.md`):

1. Propose per track → `artifacts/lighting/proposals/<id>.json`
2. Parent merges with `merge-proposals.mjs` (never hand a partial object to
   `bake.mjs`)
3. Shoot look-survey contact sheets into `docs/look-survey/`
4. Update the Progress table in `docs/LIGHTING.md`

**Taste rules (from LIGHTING.md + this brief):**

- Do **not** over-lift `day|dry` (the first wave drifted toward overcast; sun/key
  must stay readable so rain/overcast keep the murk).
- Rain / wet keep cooler tint, higher `ssrWetMul` / `wetDark` / fog — not a
  brightened day with drizzle particles.
- No shipped `"wetness"` knob (see (a)); use dry sheen knobs for night asphalt.
- Batch by campaign shards (already 4-wide) so each PR touches few shared files
  (`presets.js` merge + one docs row + sheets).

Suggested ship order (matches `SHARDS` and keeps PRs small):

| Batch | Circuits | Size |
|---|---|---|
| B1 | fuji, okayama, korea, jerez | M (4 × 20 keys) |
| B2 | donington, anderstorp, brands_hatch, zolder | M |
| B3 | dijon, buddh, mont_tremblant, mosport | M |

If a batch still fights CI / merge conflicts on `presets.js`, split to 2+2.

## Ordered slices (independently shippable)

### Slice A0 — Plan (this PR) — S

Docs only: this file. No runtime change.

**Tests:** `docs-integrity` / prose commit path.

### Slice A1 — Contract + kill preset wetness override — S/M

- Introduce `G.trackWetness()` (or promote `roadWetness` to the documented
  contract name) returning the continuous value; keep `roadWetness` as alias.
- Change `js/game.js` frame path so shipped / resolved `LT.wetness` no longer
  replaces physics wetness for `frame.wetness` (tuner diagnostic path only, or
  default AUTO).
- Strip `"wetness"` keys from `js/lighting/presets.js` via a one-shot script /
  merge (do not raise ratchets; presets.js may grow/shrink — it is data).
- Unit test: dry night condition with a historical 0.545 pin would have set
  `frame.wetness≈0.545` while `roadWetness()===0`; after A1 both are 0.
  Rain settles both to 1. Arc mid-point: both track the lerp (±ramp lag on the
  first frames only; assert after settle or with ramp forced).
- Guard: `merge-proposals` / a small check refuses baking `"wetness"` into
  shipped presets (or documents AUTO-only).

**Files (owned):** `js/game.js` (minimal), `js/race/weather-arc.js` and/or the
proposed `js/<new>/race/track-wetness.js`, `js/lighting/presets.js` (data strip),
tests under `tests/unit/`, possibly `tools/check/` or lighting-tuner merge script.
**Avoid:** renderer shader math, AI planner internals, scenery.

**Measure:** before/after on monza `night|dry` and `day|rain`:
`roadWetness()`, settled `frame.wetness`, `gripMult({tread:0})`.

### Slice A2 — Enum consumers that disagree — S

Audit and convert remaining discrete weather reads that affect **grip, tread,
or road look** so they cannot disagree with `trackWetness`:

- Rain overlay / audio thresholds as functions of wetness (keep enum for menu
  chips and atmosphere profiles).
- Any AI / pit path still calling `treadFor(weather)` without wetness.
- Agent / coach / insights surfaces that expose wetness.

**Test:** mid-arc sample where `raceWeather` has flipped to `"wet"` but lerp is
still near dry — tread advice and road look follow wetness, not the enum alone.

### Slice A3 — Characterization pins — S

- Pin weather (and assert wetness) in physics-characterization VM + browser
  fixtures / shared boot helpers used by grip-sensitive gates.
- Extend `mechanics-integration-vm` (or a sibling) to assert
  `frame.wetness` tracks `roadWetness` under dry / wet / rain / arc.
- Do **not** regenerate `physics-baseline.json` unless numbers move for a
  documented reason; prefer pinning dry explicitly so the baseline stays valid.

### Batches B1–B3 — Lighting grids — M each

Per batch PR:

1. Author proposals for four circuits (donor-copy then hand-trim day|dry and
   rain; no wetness key).
2. `merge-proposals.mjs` → commit `presets.js` + LIGHTING.md status rows.
3. Look-survey sheets when the box can shoot (else name "sheets deferred" and
   keep draft until sheets land — do not claim visual sign-off from software
   GL alone).
4. Gate: `test:tooling-fast`; lighting unit tests; no browser group required
   for data-only preset merges unless a shader hook changed (it should not).

Prefer B1 after A1 so new grids never reintroduce wetness pins. If A1 is
blocked, B batches may ship with `"wetness": -0.05` omitted (AUTO) and a PR
note that they depend on A1 for the contract story.

## Tests and measurements per slice

| Slice | Automated | Measurement |
|---|---|---|
| A0 | docs-integrity | — |
| A1 | new unit (VM): dry/rain/arc look=drive; strip count of preset wetness keys → 0; merge-proposals refuse | monza night-dry / day-rain `roadWetness` vs `frame.wetness` before/after |
| A2 | unit: mid-arc tread + FX thresholds follow wetness | engineer wantTread vs wetness ladder |
| A3 | characterization VM green with explicit weather pin; mechanics look=drive | baseline unchanged on dry pin |
| B* | tooling-fast; preset key count +20×4; gen:check | look-survey sheet per circuit; day\|dry luma vs rain\|day (rain darker / murkier, not washed) |

Hard rules for every PR: no skipped tests, no loosened tolerances, no ratchet
raises without extraction, no quarantine growth. `js/game.js` stays at zero
slack — extract into `weather-arc` / new module rather than grow the entry.

## Risks

- **Presets.js merge conflicts** — many agents; keep B batches small; sync only
  when GitHub reports conflict or tip red (`AGENTS.md` concurrent-PR protocol).
- **Dry night sheen regression** — removing wetness pins may dull intentional
  damp asphalt. Compensate with `ssrDryNight` / `roadRough` only, never by
  re-pinning wetness.
- **Phone wet lamp floor** (`frame.wetness > 0.75`) — after A1, dry nights no
  longer trip it (good); confirm rain still does.
- **Characterization baseline** — pinning weather must not silently change
  default boot; assert dry explicitly.
- **Arc + atmosphere** — flipping `raceWeather` mid-arc still swaps lighting
  presets stepwise; that is acceptable for A1–A2. A later optional slice could
  blend atmosphere by wetness; not required for look=drive on the road.

## What this workstream is NOT doing

- Spatial / sector wetness, drainage, drying racing line, aquaplaning puddles.
- Re-tuning the existing 40 circuits' full grids (unless a wetness-key strip in
  A1 forces a mechanical delete of that one knob).
- Raising lamp caps, rebaking lamp pools, or WGX/GLX shader feature work beyond
  reading the shared wetness uniform.
- Career / strategy / pit-loss economics (other workstream).
- Scenery density on the twelve circuits (other workstreams own wave6 scenery).
- Merging PRs — Bryce's merge worker merges one at a time; this agent undrafts
  only when full CI is green on the exact head.

## PR protocol for this workstream

1. A0 docs-only draft PR (this file) → CI → undraft when green; do not merge.
2. A1, A2, A3 each their own draft PR; watch CI to green; undraft; do not merge.
3. B1, B2, B3 each their own draft PR the same way.
4. After every push: `node tools/ci/ci-watch.mjs --sha <head>`; fix root causes.
5. Final report: PR links, head SHAs, shipped vs deferred, before/after
   wetness equality measurements and preset key counts.
