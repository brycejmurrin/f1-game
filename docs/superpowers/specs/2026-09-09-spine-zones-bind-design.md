# Spine zones + bind — design (2026-09-09)

Approved approach: **2** (zones + coupling enums) with pack **C** (new colourable zones **and** a small crown/flank recipe set that uses them). Inspired by Chromium web refs under `/opt/cursor/artifacts/spine-refs/` (launch renders / concepts — colour-block language, not aero truth).

Prior spine pass (`2026-09-09-spine-design-pass-design.md`) polished **existing** recipe geometry. This pass adds **new paint planes**, **explicit cover↔flank / crown→fin coupling**, and **six new recipe ids**.

## Goals

1. **Independent cover anatomy** — optional tints for saddle, ridge, and airbox so Audi-style triple paint and Ferrari white blocks are authorable without overloading `spineTint` / `sideTint` / `cover`.
2. **Named coupling** — `coverBind` and `finHandoff` encode how crown colour relates to flanks and how the fin meets the cover (defaults preserve today’s look).
3. **Recipe vocabulary** — six new ids (`cap`, `ridge`, `fade` crowns; `rake`, `shoulder`, `stars` flanks) that read the new zones and stay placement-safe.
4. **Factory proof** — retune four teams (Audi, Ferrari, Mercedes, Williams) so the new language shows up on ship defaults; leave the other factories unchanged in v1.

## Non-goals

- Mesh / UV / new atlas `REGIONS` (paint on existing crest, flank, fin, airbox surfaces only).
- Full 11-team factory rewrite; nose / bargeboard / wing redesign.
- Per-side asymmetric editor UI (L/R regions already exist).
- Re-opening tint inheritance (`spineTint` must not paint sun or side; `sunTint` stays wrap-only).
- Shipping the full brainstorm backlog (`yoke`, `billboard`, `script`, `ladder`, …) — track as follow-ups.
- Widening `fin-design` / cover-legibility / contrast tolerances.

## Surfaces and knobs

### Existing (unchanged jobs)

| field | owns |
|---|---|
| `cover` | engine-cover base (airbox/roll structure when no override) |
| `spineTint` | crown **graphic fill** (bands, cap body, fade ground ink partner) |
| `sideTint` | flank **graphic fill** (band/sash/rake field) |
| `sunTint` | wrap sun disc only (crown + flanks + airbox under wrap) |
| `spineLogo` / `spineSide` | crown / flank recipe ids |
| `fin` / `finArt` | fin plate / motif wash |

### New optional colour zones

Unset = derived; set = owns that surface alone (same discipline as `spineTint`).

| field | paints | fallback when unset |
|---|---|---|
| `saddleTint` | shoulder shelf + upper-flank saddle block | under `saddleWrap`: behave like today’s saddle flank fill from cover/band path; else derived flank fill |
| `ridgeTint` | thin centreline ridge only | `spineTint` if set, else derived band colour |
| `airboxTint` | roll-hoop / snorkel / intake lips only | `cover`. **Exception:** when `spineLogo === "wrap"`, `sunTint` (resolved sun) still wins the disc/airbox — document and enforce sun > airbox |

### Coupling enums

**`coverBind`** (default `independent` — omit key = independent):

| value | meaning |
|---|---|
| `independent` | cover / saddle / ridge / flank each free (Audi) |
| `saddleWrap` | `saddleTint` (or its fallback) paints crown shoulders **and** upper flanks as one block; ridge and fin may still break |
| `spineOnly` | crown/ridge strip is the accent; shoulders stay body/`cover`; flanks do not inherit crown fill (McLaren-style) |

**`finHandoff`** (default `match` — omit key = match):

| value | meaning |
|---|---|
| `match` | fin follows cover / current fin resolution |
| `contrast` | fin resolves for contrast vs crown/saddle block (Ferrari red fin on white cover) |
| `hardCut` | fin ignores crown graphic continuation; clean break at fin root |

### Hard rules

1. Optional keys only — missing fields = pre-change behaviour for all existing liveries.
2. `saddleWrap` must not smuggle colour through `spineTint` or `sideTint`.
3. One field, one job — never let `spineTint` paint ridge and cap and sun.
4. Field lists: add new keys to `js/car/liveries.js` copy list **and** `LIV_DRAFT_COLORS` / `LIV_DRAFT_PILLS` in `js/garage/setup-sheet.js` (and hints). No third hand-written list.
5. Unknown recipe ids continue to fall back safely (same as today).

## Recipe pack (v1)

### New `spineLogo` ids

| id | draws | reads |
|---|---|---|
| `cap` | Solid crown block airbox→mid/aft, hard rear cut; shoulders follow `coverBind` | fill: `spineTint`, or `saddleTint` under `saddleWrap`; optional `ridgeTint` hairline |
| `ridge` | Thin centreline only (not a fat band) | `ridgeTint` → else `spineTint` |
| `fade` | Micro-field (stars/hash) density dying aft | field ink from `spineTint` / crest ink; ground = `cover` |

### New `spineSide` ids

| id | draws | reads |
|---|---|---|
| `rake` | Single hard diagonal colour cut (distinct from parallel-edge `sash`) | `sideTint` (or `saddleTint` under `saddleWrap`) |
| `shoulder` | Upper-third shelf only; lower flank stays cover/body | `saddleTint` → else `sideTint` |
| `stars` | Micro star/dot field on the flank panel | ink from `sideTint` / crest ink; ground from bind |

### Intended pairings (examples)

- `cap` + `saddleWrap` + `shoulder` + `finHandoff: contrast` ≈ Ferrari white block / red fin  
- `ridge` + `independent` + `rake` ≈ Williams / Audi rake language  
- `fade` + `spineOnly` + `stars` ≈ Mercedes field on dark/silver cover  

Existing ids stay; this pack is additive. `rake` must not collapse into `sash` at garage distance; `stars`/`fade` need a density floor so they read as design, not noise.

## Factory retune (v1 — four teams)

| team | spineLogo | spineSide | coverBind | finHandoff | tints |
|---|---|---|---|---|---|
| audi | `cap` (or keep `saddle` if cap needs follow-up) | `rake` | `independent` | `match` | `saddleTint` red rake partner; `ridgeTint` dark; cover stays titanium-ish |
| ferrari | `cap` | `shoulder` | `saddleWrap` | `contrast` | `saddleTint` white |
| mercedes | `fade` | `stars` | `spineOnly` | `match` | optional `ridgeTint` teal hairline; cover as now |
| williams | `ridge` | `rake` | `independent` | `match` | `ridgeTint` cyan; `sideTint` for rake |

All other factories: unchanged pairings; omit new keys. Custom default stays `number` / `number`.

Exact Audi crown id (`cap` vs retuned `saddle`) is chosen at implement time by spine-station + lit garage-angles — prefer `cap` if it clears gates; else keep `saddle` + `rake` + tints.

## Garage UI

- Colour rows after engine-cover / spine cluster: **SADDLE**, **RIDGE**, **AIRBOX** (`saddleTint`, `ridgeTint`, `airboxTint`) with `LIV_ROW_HINT` text matching the ownership table above.
- Pill rows: **COVER BIND**, **FIN HANDOFF** with the enum values above; defaults = current behaviour.
- **SPINE TOP** / **SPINE SIDE** pickers include the six new ids.
- New tint rows stay always-visible optionals (like `spineTint`), not gated on recipe — predictable authoring.
- `SUN` remains wrap-contextual as today.

## Verification

1. **Plumb first** — ship zones + enums with defaults; assert untouched factories byte-stable / visually unchanged (spine-station factory map + spot garage-angles).
2. **Recipes** — implement six painters; `spine-station` placement clear for each; `--team=all` catalog smoke.
3. **Gates** — `fin-design`, cover-legibility, contrast green; **no tolerance widening**.
4. **Factory four** — retune; lit garage-angles hero / side / rear before·after under `/opt/cursor/artifacts/spine-zones-bind/`.
5. **Regression** — teams not in the retune set keep prior `spineLogo` / `spineSide` and look unchanged when new knobs absent.

## Rollout order

1. Plumb `saddleTint` / `ridgeTint` / `airboxTint` + `coverBind` / `finHandoff` (defaults preserve look).  
2. Implement six recipes + picker registration.  
3. Retune Audi, Ferrari, Mercedes, Williams.  
4. Measure, lit sheets, evidence note under `docs/notes/`.

## Risks

- `saddleWrap` + existing `saddle` painter interaction — measure Ferrari/Audi/Cadillac paths; prefer routing wrap fill through `saddleTint` helpers, not forking `saddleFlanks` twice.
- Wrap vs `airboxTint` — sun wins; document in hints so authors are not surprised.
- `fade`/`stars` performance — keep field draws cheap (no per-star shadow); atlas is CPU canvas once per livery build.
- Recipe edits affect every consumer of an id — carve one id at a time; factory retune after painters are green.

## Follow-ups (out of v1)

`yoke`, `blade`, `inset`, `billboard`, `speedlines`, `fin-root`, `coverBind` presets in factory templates UI, full-grid retune, asymmetric flank authorship.
