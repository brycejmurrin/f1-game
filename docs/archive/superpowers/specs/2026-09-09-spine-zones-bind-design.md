# Spine zones + bind — design (2026-09-09)

Approved approach: **2** (zones + coupling enums) with pack **C** (new colourable zones **and** a small crown/flank recipe set that uses them). Inspired by Chromium web refs under `/opt/cursor/artifacts/spine-refs/` (launch renders / concepts — colour-block language, not aero truth).

Prior spine pass (`2026-09-09-spine-design-pass-design.md`) polished **existing** recipe geometry and explicitly barred new ids. **This pass supersedes that non-goal** for the six recipes and coupling knobs below; it does **not** reopen tint-inheritance (`spineTint` still must not paint sun or side).

## Goals

1. **Independent cover anatomy** — optional tints for saddle, ridge, and airbox so Audi-style triple paint and Ferrari white blocks are authorable without overloading `spineTint` / `sideTint` / `cover`.
2. **Named coupling** — `coverBind` and `finHandoff` encode how crown colour relates to flanks and how the fin meets the cover (defaults preserve today’s look).
3. **Recipe vocabulary** — six new ids (`cap`, `ridge`, `fade` crowns; `rake`, `shoulder`, `starfield` flanks) that read the new zones and stay placement-safe.
4. **Factory proof** — retune four teams (Audi, Ferrari, Mercedes, Williams) so the new language shows up on ship defaults; leave the other factories unchanged in v1.

## Non-goals

- New atlas `REGIONS` or cover UV splits (crown stays `REGIONS.crest` + `tail`; flanks stay `spineSide` / `spineSideL`; fin stays `fin` / `finBadge`).
- Full 11-team factory rewrite; nose / bargeboard / wing redesign.
- Per-side asymmetric editor UI (L/R regions already exist).
- Re-opening tint inheritance (`spineTint` ↛ sun/side; `sunTint` stays wrap-only).
- Shipping the full brainstorm backlog (`yoke`, `billboard`, `script`, `ladder`, …).
- Widening `fin-design` / cover-legibility / contrast tolerances.

## Code truth (baseline)

Exact identifiers in tree today:

| kind | truth |
|---|---|
| Crown field / ids | `spineLogo` + `LiveryTex.SPINE_LOGO_IDS` = `logo,none,wrap,bigmark,saddle,panel,stripe,twin,chevron,wedge,rungs,tricolour,wordmark,carbon,number` |
| Flank field / ids | `spineSide` + `SPINE_SIDE_IDS` = `none,number,logo,code,plate,wordmark,duo,ribbon,lockup,title,emblem,band,sash` |
| Tints | `spineTint`, `sideTint`, `sunTint`, `crestInk`, `bandTint2`, `plateTint`, `plateInk` |
| Saddle flanks | `saddleFlanks(ctx, bandC)` already paints upper flanks with **`spineTint`-derived `bandC`** when `spineLogo === "saddle"` |
| Airbox colour | **mesh**, not atlas — `Car3D` uses `coverC`, or `LiveryTex.sunColour(...)` when `spineLogo === "wrap"` (`js/car/car3d.js` ~2172–2406) |
| Fin motif `stars` | already `finStyle` / `TAIL_STYLE_IDS` (Mercedes default) — **do not reuse `stars` as a flank id** |
| Field plumbing | `Liveries.FIELDS`, `LIV_DRAFT_COLORS` / `LIV_DRAFT_PILLS`, both arms of `resolveLivery` in `js/game.js`, `LIV_ROW_HINT` — guarded by `tests/unit/team-livery.test.mjs` |
| Frozen id arrays | `tests/unit/fin-design.test.mjs` `deepEqual` on `SPINE_LOGO_IDS` / `SPINE_SIDE_IDS` |
| Auto-sweep | `tests/unit/cover-legibility.test.mjs` walks every pickable crown/flank id × team |

Factory map today (unchanged until retune task): Mercedes `twin`/`sash` + `finStyle:"stars"`; Ferrari `saddle`/`plate` + white `cover`; McLaren `panel`/`wordmark`; Red Bull `wrap`/`duo`; Alpine `tricolour`/`band`; Racing Bulls `chevron`/`sash`; Haas `panel`/`number`; Williams `stripe`/`code` + dark `cover`; Audi `saddle`/`band` + dark `cover`; Aston `stripe`/`logo` + `spineTint`; Cadillac `saddle`/`plate`; custom `number`/`number`.

## Surfaces and knobs

### Existing (unchanged jobs)

| field | owns |
|---|---|
| `cover` | engine-cover base mesh (+ airbox when no override) |
| `spineTint` | crown **graphic fill** (bands, cap body, fade ink partner) — and today’s saddle flank half via `saddleFlanks` until `saddleTint` / `coverBind` take that job |
| `sideTint` | flank **graphic fill** for `band` / `sash` / new rake-like fills |
| `sunTint` | wrap sun disc only (crown + flanks + airbox under wrap) |
| `spineLogo` / `spineSide` | crown / flank recipe ids |
| `fin` / `finArt` / `finStyle` / `finBadge` | fin plate / motif / badge |

### New optional colour zones

Unset = derived; set = owns that surface alone.

| field | paints | implementation surface | fallback when unset |
|---|---|---|---|
| `saddleTint` | shoulder shelf + upper-flank saddle block | atlas: crest shoulders + `saddleFlanks` / `shoulder` painter | under `saddleWrap` or `spineLogo==="saddle"`: today’s `bandC` path; else derived flank fill |
| `ridgeTint` | thin centreline ridge only | atlas overdraw inside `REGIONS.crest` (+ `tail` if continued) | `spineTint` if set, else derived band colour |
| `airboxTint` | roll-hoop / snorkel / intake lips | **`Car3D` mesh colour only** (no atlas region exists) | `cover`. **Exception:** when `spineLogo === "wrap"`, resolved sun still wins — sun > airbox |

### Coupling enums

**`coverBind`** (default `independent`; omit key = independent):

| value | meaning |
|---|---|
| `independent` | cover / saddle / ridge / flank each free (Audi) |
| `saddleWrap` | `saddleTint` (or its fallback) paints crown shoulders **and** upper flanks as one block; ridge and fin may still break |
| `spineOnly` | crown/ridge strip is the accent; shoulders stay body/`cover`; flanks do not inherit crown fill |

**`finHandoff`** (default `match`; omit key = match):

| value | meaning |
|---|---|
| `match` | fin follows cover / current fin resolution |
| `contrast` | fin colour resolves for contrast vs crown/saddle block (Ferrari red fin on white cover) |
| `hardCut` | fin ignores crown graphic continuation into `REGIONS.fin`; clean break at fin root (motif/badge still apply) |

### Hard rules

1. Optional keys only — missing fields = pre-change behaviour for all existing liveries.
2. `saddleWrap` must not smuggle colour through `spineTint` or `sideTint`; prefer extending the existing `saddleFlanks` helper to take an explicit fill colour from `saddleTint` resolution, not a second flank painter.
3. One field, one job — never let `spineTint` paint ridge and cap and sun.
4. Field lists (all of these, no third list): `Liveries.FIELDS`, `LIV_DRAFT_COLORS` / `LIV_DRAFT_PILLS`, both arms of `resolveLivery`, `LIV_ROW_HINT`.
5. Unknown recipe ids continue to fall back safely; new ids must be registered in `SPINE_*_IDS` **and** the frozen `fin-design` arrays or they silently no-op / fail CI.
6. Flank id **`starfield`**, not `stars` — avoids colliding with Mercedes `finStyle:"stars"`.

## Recipe pack (v1)

### New `spineLogo` ids

| id | draws | reads |
|---|---|---|
| `cap` | Solid crown block airbox→mid/aft, hard rear cut; shoulders follow `coverBind` | fill: `spineTint`, or `saddleTint` under `saddleWrap`; optional `ridgeTint` hairline |
| `ridge` | Thin centreline only (not a fat band) | `ridgeTint` → else `spineTint` |
| `fade` | Micro-field density dying aft | field ink from `spineTint` / `crestInk`; ground = `cover` |

### New `spineSide` ids

| id | draws | reads |
|---|---|---|
| `rake` | Single hard diagonal colour cut (distinct from parallel-edge `sash`) | `sideTint` (or `saddleTint` under `saddleWrap`) |
| `shoulder` | Upper-third shelf only; lower flank stays cover/body | `saddleTint` → else `sideTint` |
| `starfield` | Micro star/dot field on the flank panel | ink from `sideTint` / `crestInk`; ground from bind |

### Intended pairings

- `cap` + `saddleWrap` + `shoulder` + `finHandoff: contrast` ≈ Ferrari white block / red fin  
- `ridge` + `independent` + `rake` ≈ Williams / Audi rake language  
- `fade` + `spineOnly` + `starfield` ≈ Mercedes field on dark/silver cover  

Existing ids stay. `rake` must not collapse into `sash` at garage distance; `starfield`/`fade` need a density floor so cover-legibility’s area floors stay green.

## Factory retune (v1 — four teams)

| team | spineLogo | spineSide | coverBind | finHandoff | tints |
|---|---|---|---|---|---|
| audi | `cap` (or keep `saddle` if cap fails gates) | `rake` | `independent` | `match` | `saddleTint` red partner; `ridgeTint` dark; cover stays titanium-ish |
| ferrari | `cap` | `shoulder` | `saddleWrap` | `contrast` | `saddleTint` white; ensure `fin` contrasts |
| mercedes | `fade` | `starfield` | `spineOnly` | `match` | optional `ridgeTint` teal hairline; keep `finStyle:"stars"` (fin motif, separate enum) |
| williams | `ridge` | `rake` | `independent` | `match` | `ridgeTint` cyan; `sideTint` for rake |

All other factories: unchanged; omit new keys. Custom stays `number` / `number`.

Audi crown id chosen at implement time by spine-station + lit garage-angles — prefer `cap` if gates clear.

## Garage UI

- Colour rows after `cover` / near `spineTint`: **SADDLE**, **RIDGE**, **AIRBOX**.
- Pill rows: **COVER BIND**, **FIN HANDOFF**.
- **SPINE TOP** / **SPINE SIDE** pickers include the six new ids (via `SPINE_*_IDS`).
- New tint rows always-visible optionals (like `spineTint`), not recipe-gated.
- Hints must state: airbox is mesh paint; under WRAP, SUN wins; `starfield` is the flank field (fin STAR remains `finStyle`).

## Verification

1. Plumb zones + enums with defaults → untouched factories visually unchanged.
2. Six painters → `node tools/car/spine-station.mjs --team=all` placement clear.
3. Gates: `node --test tests/unit/fin-design.test.mjs tests/unit/cover-legibility.test.mjs tests/unit/team-livery.test.mjs` (+ contrast as needed) — **no tolerance widening**.
4. Factory four lit garage-angles hero/side/rear before·after → `/opt/cursor/artifacts/spine-zones-bind/`.
5. Teams not retuned keep prior pairings when new knobs absent.

## Rollout order

1. Plumb fields + `coverBind` / `finHandoff` resolution helpers (defaults preserve look).  
2. `airboxTint` mesh path in `Car3D` (sun > airbox).  
3. Six recipes + id-array / test updates.  
4. Retune Audi, Ferrari, Mercedes, Williams.  
5. Evidence note under `docs/notes/`.

## Risks

- `saddleWrap` vs existing `saddle` + `saddleFlanks(bandC)` — one helper, explicit fill colour; do not double-paint.
- Wrap vs `airboxTint` — sun wins on mesh; document in `LIV_ROW_HINT`.
- `fade` / `starfield` area floors in cover-legibility — density floor, not quieter thresholds.
- `finHandoff: contrast` must set `fin` (or resolve path) without breaking fin-design badge contrast.
- Recipe edits affect every consumer of an id — carve one id at a time; factory retune after painters are green.

## Follow-ups (out of v1)

`yoke`, `blade`, `inset`, `billboard`, `speedlines`, `fin-root`, dedicated airbox atlas island (would need mesh UVs), `coverBind` presets in templates UI, full-grid retune, asymmetric flank authorship.
