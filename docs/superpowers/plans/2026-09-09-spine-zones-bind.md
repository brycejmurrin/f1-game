# Spine Zones + Bind Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship optional cover anatomy tints (`saddleTint`, `ridgeTint`, `airboxTint`), coupling enums (`coverBind`, `finHandoff`), six new crown/flank recipes, and a four-team factory retune — without changing look when the new keys are absent.

**Architecture:** Atlas painters in `js/car/liverytex.js` own crown/flank graphics; `Car3D` mesh colour owns airbox; garage draft tables + `resolveLivery` + `Liveries.FIELDS` plumb every new key (same discipline as `spineTint`). Defaults omit keys so existing liveries are unchanged.

**Tech Stack:** IIFE modules (`LiveryTex`, `Liveries`, `Car3D`), garage setup sheet, Node unit tests (`fin-design`, `cover-legibility`, `team-livery`), `tools/car/spine-station.mjs`, `tools/shot/garage-angles.mjs`.

**Spec:** `docs/superpowers/specs/2026-09-09-spine-zones-bind-design.md` (code-audited revision).

## Global Constraints

- Field names (verbatim): `saddleTint`, `ridgeTint`, `airboxTint`, `coverBind`, `finHandoff`, `spineLogo`, `spineSide`, `spineTint`, `sideTint`, `sunTint`.
- New crown ids: `cap`, `ridge`, `fade`. New flank ids: `rake`, `shoulder`, `starfield` (not `stars` — that is `finStyle`).
- `coverBind` ∈ `independent|saddleWrap|spineOnly` (default / omit = `independent`).
- `finHandoff` ∈ `match|contrast|hardCut` (default / omit = `match`).
- Wrap airbox: resolved sun **wins** over `airboxTint`.
- No new atlas `REGIONS`; no tolerance widening on fin-design / cover-legibility / contrast.
- Plumbing must hit **all** of: `Liveries.FIELDS`, `LIV_DRAFT_COLORS` / `LIV_DRAFT_PILLS`, both arms of `resolveLivery` in `js/game.js`, `LIV_ROW_HINT`, and `KNOWN` in `tests/unit/team-livery.test.mjs`.

## File map

| File | Responsibility |
|---|---|
| `js/car/liverytex.js` | ID arrays, tint/bind resolution, `drawSpineTop` / flank painters, `saddleFlanks` fill colour |
| `js/car/car3d.js` | `airboxTint` mesh colour; `finHandoff` fin base colour |
| `js/car/liveries.js` | `FIELDS` + header docs |
| `js/game.js` | `resolveLivery` draft + stored arms |
| `js/garage/setup-sheet.js` | draft tables, colour/pill rows, hints |
| `js/data/teams.js` | four-team retune only |
| `tests/unit/fin-design.test.mjs` | frozen ID arrays + new painter ops |
| `tests/unit/cover-legibility.test.mjs` | auto-sweeps new ids (density floors) |
| `tests/unit/team-livery.test.mjs` | `KNOWN` + resolveLivery key list |
| `tests/unit/livery-contrast.test.mjs` | extend CROWN/SIDE hand lists if needed |
| `docs/notes/SPINE-ZONES-BIND-2026-09-09.md` | evidence |

---

### Task 1: Plumb fields + bind defaults (no visual change)

**Files:**
- Modify: `js/car/liveries.js` (`FIELDS` ~484–488 + header comment)
- Modify: `js/garage/setup-sheet.js` (`LIV_DRAFT_COLORS`, `LIV_DRAFT_PILLS`, `LIV_ROW_HINT`, colour/pill row insert ~920–1008)
- Modify: `js/game.js` (`resolveLivery` both arms ~1621–1660)
- Modify: `tests/unit/team-livery.test.mjs` (`KNOWN` ~105–108; resolveLivery key loop ~217)
- Test: `tests/unit/team-livery.test.mjs`

**Interfaces:**
- Consumes: existing optional-tint pattern (`spineTint`)
- Produces: liveries may carry `saddleTint|ridgeTint|airboxTint` (`[r,g,b]|null`) and `coverBind|finHandoff` (string|null); omitted = current look

- [ ] **Step 1: Extend the failing guard expectations**

In `tests/unit/team-livery.test.mjs`, add to `KNOWN`:
`saddleTint`, `ridgeTint`, `airboxTint`, `coverBind`, `finHandoff`.

In the resolveLivery key loop (~217), add the same five keys (colours + pills as appropriate — all five must appear in `resolveLivery` source).

- [ ] **Step 2: Run test — expect FAIL**

```bash
node --test tests/unit/team-livery.test.mjs
```

Expected: FAIL on resolveLivery / FIELDS / draft parity for the new keys.

- [ ] **Step 3: Minimal plumbing**

1. `Liveries.FIELDS` — append `"saddleTint", "ridgeTint", "airboxTint", "coverBind", "finHandoff"`.
2. Header comment in `liveries.js` — document each (copy ownership from the spec).
3. `LIV_DRAFT_COLORS` — append `"saddleTint", "ridgeTint", "airboxTint"`.
4. `LIV_DRAFT_PILLS` — add `coverBind: "independent"`, `finHandoff: "match"`.
5. `LIV_ROW_HINT` — SADDLE / RIDGE / AIRBOX / COVER BIND / FIN HANDOFF text from the spec (airbox: mesh; WRAP → SUN wins; starfield ≠ fin stars).
6. Colour rows after `spineTint` / near cover cluster; pill rows near SPINE TOP/SIDE.
7. `resolveLivery` — both arms pass the five keys through as `|| null` (pills: pass string or null; do not force default strings into stored liveries).

- [ ] **Step 4: Re-run team-livery — expect PASS**

```bash
node --test tests/unit/team-livery.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add js/car/liveries.js js/garage/setup-sheet.js js/game.js tests/unit/team-livery.test.mjs
git commit -m "feat(livery): plumb saddle/ridge/airbox tints and coverBind/finHandoff"
```

---

### Task 2: Resolution helpers + saddleFlanks colour (still no new recipes)

**Files:**
- Modify: `js/car/liverytex.js` (`buildAtlas` ~1909+, `saddleFlanks` ~1496, call site ~2178)
- Test: `tests/unit/fin-design.test.mjs` (spineTint isolation + new source guards)

**Interfaces:**
- Consumes: `colors.saddleTint|ridgeTint|coverBind|spineTint|sideTint|cover`
- Produces: helpers used by later painters:
  - `coverBindOf(liv) → "independent"|"saddleWrap"|"spineOnly"`
  - `finHandoffOf(liv) → "match"|"contrast"|"hardCut"`
  - `saddleFill(liv, bandC, coverPaint) → rgb` — `saddleTint` or today’s `bandC` under saddle/`saddleWrap`
  - `ridgeFill(liv, bandC) → rgb` — `ridgeTint` or `bandC`

- [ ] **Step 1: Failing test — saddleTint owns saddle flank fill**

Add a fin-design (or small unit) assertion: with `spineLogo:"saddle"`, `spineTint:A`, `saddleTint:B`, flank saddle pixels match B (not A). Mirror existing tint-ownership tests.

- [ ] **Step 2: Run — expect FAIL**

```bash
node --test tests/unit/fin-design.test.mjs
```

- [ ] **Step 3: Implement helpers + wire `saddleFlanks`**

```javascript
// near tint resolution in buildAtlas
const bind = coverBindOf(colors); // invalid → "independent"
const saddleC = colors.saddleTint || (
  (spineLogo === "saddle" || bind === "saddleWrap") ? bandC : null
);
// call site:
if (spineLogo === "saddle" || bind === "saddleWrap") {
  saddleFlanks(ctx, saddleC || bandC);
}
```

Under `spineOnly`, do **not** call `saddleFlanks` for crown recipes that previously spilled (cap will respect this in Task 4). For existing `saddle` logo with omit bind, keep today’s `saddleFlanks(ctx, bandC)` behaviour when `saddleTint` unset.

Update flankBg selection: if `saddleTint` set and (saddle or saddleWrap), flank bg uses `saddleTint` instead of `bandC`.

- [ ] **Step 4: Run fin-design + cover-legibility — expect PASS**

```bash
node --test tests/unit/fin-design.test.mjs tests/unit/cover-legibility.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add js/car/liverytex.js tests/unit/fin-design.test.mjs
git commit -m "feat(livery): resolve coverBind/saddleTint into saddleFlanks fill"
```

---

### Task 3: `airboxTint` mesh path + `finHandoff`

**Files:**
- Modify: `js/car/car3d.js` (cover/airbox colour ~2172–2410; fin colour resolution near fin paint)
- Test: extend `tests/unit/fin-design.test.mjs` or a focused car3d colour unit if one exists; otherwise source-level + garage-angles spot later

**Interfaces:**
- Consumes: `liv.airboxTint`, `liv.spineLogo`, `LiveryTex.sunColour`, `liv.finHandoff`, `liv.fin`, `liv.cover`, saddle/crown colours
- Produces: airbox mesh uses `airboxTint` unless wrap (sun wins); fin base colour respects `finHandoff`

- [ ] **Step 1: Write failing expectation**

Document in test or a tiny pure helper test:
- wrap + airboxTint → sun colour on airbox
- non-wrap + airboxTint → airboxTint
- `finHandoff:"contrast"` with white saddle / red body → fin resolves dark/red contrast (not white)

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

In `car3d.js` where `sunC` / `coverC` feed airbox verts:

```javascript
const sunC = (liv.spineLogo === "wrap" && LiveryTex.sunColour)
  ? (LiveryTex.sunColour(teamId, liv) || coverC) : coverC;
const airboxC = (liv.spineLogo === "wrap")
  ? sunC
  : (_ckAcc(liv.airboxTint) || coverC);
// use airboxC for airbox/snorkel/intake verts; keep coverC for cover loft
```

For `finHandoff`:
- `match` — current fin colour path
- `contrast` — pick/require fin colour with contrast ≥ existing fin floors vs saddle/cover block (`pickOn` / existing ink helpers)
- `hardCut` — skip any crown→fin wash continuation (atlas fin region already separate; ensure no crest graphic is sampled onto fin)

- [ ] **Step 4: Run unit gates touched — expect PASS**

```bash
node --test tests/unit/fin-design.test.mjs tests/unit/team-livery.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add js/car/car3d.js tests/unit/fin-design.test.mjs
git commit -m "feat(car3d): airboxTint mesh paint and finHandoff contrast/hardCut"
```

---

### Task 4: Crown recipes `cap`, `ridge`, `fade`

**Files:**
- Modify: `js/car/liverytex.js` (`SPINE_LOGO_IDS` ~1224, `drawSpineTop` ~1517, `drawTailTop` if bands continue, export list)
- Modify: `tests/unit/fin-design.test.mjs` (frozen `SPINE_LOGO_IDS` deepEqual ~282)
- Modify: `tests/unit/livery-contrast.test.mjs` (add ids to CROWN hand list if present)
- Test: fin-design + cover-legibility

**Interfaces:**
- Consumes: helpers from Task 2; `REGIONS.crest` / `tail`
- Produces: three new painters registered in `SPINE_LOGO_IDS`

- [ ] **Step 1: Update frozen ID array in test first (will fail until source matches)**

Append `"cap", "ridge", "fade"` to the expected `SPINE_LOGO_IDS` array in `fin-design.test.mjs` (keep source order identical to `liverytex.js`).

- [ ] **Step 2: Run — expect FAIL (array mismatch / no paint ops)**

- [ ] **Step 3: Implement painters**

1. Append ids to `SPINE_LOGO_IDS` in the same order as the test.
2. `cap` — filled rect/poly on crest from airbox toward aft with hard rear edge; if `coverBind==="saddleWrap"`, shoulders use `saddleFill`; if `spineOnly`, no flank spill; optional `ridgeFill` centre hairline.
3. `ridge` — thin centre band only (`ridgeFill`), continue on `drawTailTop` like `stripe`/`twin`.
4. `fade` — cheap hashed/star micro-field with density falloff aft (no per-dot shadow); ground `coverPaint`; ink from `spineTint`/`crestInk` with contrast ≥ 2.0 over enough area for cover-legibility (≥3% crest).

- [ ] **Step 4: Run gates**

```bash
node --test tests/unit/fin-design.test.mjs tests/unit/cover-legibility.test.mjs
node tools/car/spine-station.mjs --logo=cap --png=/opt/cursor/artifacts/spine-zones-bind/cap
node tools/car/spine-station.mjs --logo=ridge --png=/opt/cursor/artifacts/spine-zones-bind/ridge
node tools/car/spine-station.mjs --logo=fade --png=/opt/cursor/artifacts/spine-zones-bind/fade
```

Expected: tests PASS; station shows readable crowns.

- [ ] **Step 5: Commit**

```bash
git add js/car/liverytex.js tests/unit/fin-design.test.mjs tests/unit/livery-contrast.test.mjs
git commit -m "feat(livery): crown recipes cap, ridge, fade"
```

---

### Task 5: Flank recipes `rake`, `shoulder`, `starfield`

**Files:**
- Modify: `js/car/liverytex.js` (`SPINE_SIDE_IDS` ~1737, flank switch in `buildAtlas` ~2204+, `SIDE_FILL` if fills need wrap-bull layering)
- Modify: `tests/unit/fin-design.test.mjs` (frozen side id array ~445 + both-flanks paint loop ~292)
- Modify: `tests/unit/livery-contrast.test.mjs` (SIDE hand list)
- Test: fin-design + cover-legibility

**Interfaces:**
- Consumes: `sideTint`, `saddleFill`, `FLANK_SEEN`, layer order (fills → wrap bull → lettering)
- Produces: three flank painters; `rake`/`shoulder` likely `SIDE_FILL` entries if they paint a base field under marks

- [ ] **Step 1: Update frozen `SPINE_SIDE_IDS` expectation — append `rake`, `shoulder`, `starfield`**

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

1. Register ids on `SPINE_SIDE_IDS`.
2. `rake` — one diagonal polygon (single cut), not parallel dual-edge like `sash`; fill `sideTint` or `saddleFill` under `saddleWrap`; clamp content to `FLANK_SEEN`.
3. `shoulder` — upper ~⅓ band only; lower flank stays `flankBg`.
4. `starfield` — micro dots/stars with density floor for ≥1.5% flank area contrast; **do not** name it `stars`.
5. Add `rake`/`shoulder` to `SIDE_FILL` if they act as base fills under wrap bull (same rule as `band`/`sash`).

- [ ] **Step 4: Run gates + station**

```bash
node --test tests/unit/fin-design.test.mjs tests/unit/cover-legibility.test.mjs
node tools/car/spine-station.mjs --team=all --occlude
```

Expected: PASS; all flanks `clear`.

- [ ] **Step 5: Commit**

```bash
git add js/car/liverytex.js tests/unit/fin-design.test.mjs tests/unit/livery-contrast.test.mjs
git commit -m "feat(livery): flank recipes rake, shoulder, starfield"
```

---

### Task 6: Factory retune (Audi, Ferrari, Mercedes, Williams)

**Files:**
- Modify: `js/data/teams.js` (four `livery:` blocks only — one key per team)
- Test: `tests/unit/team-livery.test.mjs`, cover-legibility, fin-design
- Evidence: `tools/shot/garage-angles.mjs` → `/opt/cursor/artifacts/spine-zones-bind/`

**Interfaces:**
- Consumes: Tasks 1–5
- Produces: ship defaults showing the new language

- [ ] **Step 1: Capture before sheets (optional but preferred)**

```bash
mkdir -p /opt/cursor/artifacts/spine-zones-bind/before
APEX_HEADED=1 xvfb-run -a node tools/shot/garage-angles.mjs \
  --team=audi,ferrari,mercedes,williams --views=spine \
  --out=/opt/cursor/artifacts/spine-zones-bind/before
```

- [ ] **Step 2: Edit the four liveries** (exact keys)

| team | fields to set |
|---|---|
| audi | `spineLogo:"cap"` (or keep `saddle`), `spineSide:"rake"`, `coverBind:"independent"`, `saddleTint` red-ish, `ridgeTint` dark; keep dark titanium `cover` |
| ferrari | `spineLogo:"cap"`, `spineSide:"shoulder"`, `coverBind:"saddleWrap"`, `finHandoff:"contrast"`, `saddleTint:[0.95,0.95,0.96]` (or keep white cover + white saddleTint), ensure `fin` contrasts |
| mercedes | `spineLogo:"fade"`, `spineSide:"starfield"`, `coverBind:"spineOnly"`, keep `finStyle:"stars"`, silver `cover`; optional teal `ridgeTint` |
| williams | `spineLogo:"ridge"`, `spineSide:"rake"`, `coverBind:"independent"`, `ridgeTint` cyan, `sideTint` for rake; keep dark `cover` |

Do **not** touch other teams. No second `livery:` key.

- [ ] **Step 3: Run gates**

```bash
node --test tests/unit/team-livery.test.mjs tests/unit/fin-design.test.mjs tests/unit/cover-legibility.test.mjs
node tools/car/spine-station.mjs --team=all --occlude
```

If Audi `cap` fails legibility, fall back to `saddle` + `rake` + tints per spec.

- [ ] **Step 4: Lit after sheets + evidence note**

```bash
mkdir -p /opt/cursor/artifacts/spine-zones-bind/after
APEX_HEADED=1 xvfb-run -a node tools/shot/garage-angles.mjs \
  --team=audi,ferrari,mercedes,williams --views=spine \
  --out=/opt/cursor/artifacts/spine-zones-bind/after
```

Write `docs/notes/SPINE-ZONES-BIND-2026-09-09.md` with pairings, gate commands, artifact paths.

- [ ] **Step 5: Commit**

```bash
git add js/data/teams.js docs/notes/SPINE-ZONES-BIND-2026-09-09.md
git commit -m "feat(teams): retune Audi/Ferrari/Mercedes/Williams for spine zones bind"
```

---

### Task 7: Final verification + PR update

- [ ] **Step 1: Tooling-fast (or scoped units if load is high)**

```bash
node --test tests/unit/team-livery.test.mjs tests/unit/fin-design.test.mjs tests/unit/cover-legibility.test.mjs tests/unit/livery-contrast.test.mjs
# if box is quiet:
npm run test:tooling-fast
```

- [ ] **Step 2: Confirm non-retuned factories**

Spot `spine-station` / garage-angles on Red Bull + McLaren — still `wrap`/`duo` and `panel`/`wordmark` with no new keys.

- [ ] **Step 3: Update PR body** with before/after artifact paths and gate results.

- [ ] **Step 4: Commit any doc/PR fixes; push.**

---

## Spec coverage checklist

| Spec item | Task |
|---|---|
| `saddleTint` / `ridgeTint` / `airboxTint` | 1, 2, 3 |
| `coverBind` / `finHandoff` | 1, 2, 3 |
| Crowns `cap`/`ridge`/`fade` | 4 |
| Flanks `rake`/`shoulder`/`starfield` | 5 |
| Garage rows + hints | 1 |
| Factory four | 6 |
| Sun > airbox under wrap | 3 |
| No REGIONS / no tolerance widen | Global + 4–6 |
| Evidence note | 6–7 |

## Placeholder / consistency review

- No TBD steps; ids and file paths match the audited tree.
- Flank field is `starfield` everywhere (not `stars`).
- Airbox is mesh-only via `Car3D`, not a fake atlas region.
