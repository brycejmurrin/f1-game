# Livery open gaps + flank placement — design

Date: 2026-09-09  
Status: awaiting user review  
Branch base: `claude/f1-game-project-26h3ng` (tip includes spine design pass + garage-aero harden)

## Goal

Close the four photo-grounded open gaps in `docs/notes/LIVERY-2026-REFERENCE.md`, and ship the already-drafted flank-mark placement fix (#100), as one coordinated pass with separate PRs per lane where that keeps review sane.

## Non-goals

- Inventing Alpine pink without attempting a second source (see Alpine gate).
- Reintroducing culled sticker SIDEs (`bars` / `split` / `chevron` six-bar sheets).
- Changing #97 perf or #96 garage-angles in this pass (call them out if they should join).
- Per-side **wing** or **wheel** colours.

## Workstreams

### 0 — Ship #100 flank placement (rebase, do not merge dirty)

**Problem:** Wrap+none and saddle+logo crests sit too close to the shoulder crease.

**Design (already on `cursor/spine-flank-placement-242d`):**

- Introduce `flankMarkStation(spineLogo, sideFrom, spineSide)` and extend `FLANK_MARK` with saddle-aware `u` / `v` (mid-band, slightly smaller box).
- Tip values today: `v: 0.40`, saddle path missing. Target: default/wrap `v ≈ 0.45`, saddle `v ≈ 0.36`, slightly reduced `halfW` / `halfH`.

**Ship rules:**

- Rebase onto current tip.
- **Keep tip’s SPINE_SIDE cull** (`slash`/`bars`/… absent). Port only `FLANK_MARK` + `flankMarkStation` (+ tests/docs that describe placement).
- Do not drag the branch’s old `garage-angles` rewrite if tip already rewrote that tool — resolve by taking tip’s tool and re-applying only placement docs if needed.
- Fix or re-run Selected specs; known flake was garage-aero open (already hardened on tip) — confirm green before merge.
- Merge + `node tools/ci/deploy.mjs` (or `--pr` if push-to-deploy is blocked).

### 1 — Alpine pink crown stripe

**Intent:** BWT pink band on the engine-cover crown when a second source confirms the single photo read.

**Mechanism (exists):** `spineLogo: "stripe"` + explicit `spineTint` (Aston precedent). Alpine `color2` is already BWT pink `[1.0, 0.529, 0.737]`.

**Data change (when gated):** in `js/data/teams.js` Alpine livery:

- `spineLogo: "stripe"` (from `tricolour`)
- `spineTint: <BWT pink>` — same triple as `color2`, or a documented slightly darker pink if contrast vs cover blue fails the band floor

**Gate:** Before applying, attempt a second independent source (remote browser / host fetch of an official gallery or a second launch article that names or clearly shows the crown band). Record the URL and one-sentence observation in `LIVERY-2026-REFERENCE.md`.

- If second source **confirms** → apply data + update the Alpine “settled” section.
- If still **single-source** → do **not** invent: leave Alpine data unchanged, keep the open-gap bullet, and note the attempt in the reference file. Other workstreams still ship.

**Tests:** contrast/band assert for Alpine’s authored `spineTint` when applied; no change to the “no invented cover colour” Alpine settlement.

### 2 — Restore SIDE `slash` as a real design (not a sticker)

**Intent:** One raked stroke on the cover flank — the pre-cull painter intent — available in `SPINE_SIDE_IDS` for garage + any team that wants it.

**Design:**

- Re-add `"slash"` to `SPINE_SIDE_IDS` and `SIDE_FILL` (or equivalent fill table) in `js/car/liverytex.js`.
- Painter: **single** diagonal sash-like stroke via `eachFlank`, coloured by flank band colour (`sideTint` / derived), not a multi-bar decal sheet.
- Garage: restore pill + hint in `js/garage/setup-sheet.js`.
- **Mercedes stays on `sash`.** Do not force W17 onto `slash` unless a photo pass says the sash is wrong; slash is the restored vocabulary, not an automatic Merc remap.
- Update `tests/unit/fin-design.test.mjs` (and any cull pins) so `slash` is allowed again; keep `bars`/`split`/`chevron` culled.

### 3 — Racing Bulls cover streaks

**Intent:** Blue parallel streaks on the white cover crown (and optionally flanks), not a flat `cover:` colour.

**Design:**

- New `spineLogo` id: `"streaks"` in `SPINE_LOGO_IDS` + `drawSpineTop` branch: 3–5 parallel strokes along `REGIONS.crest`, rake matching existing fin `streak` language where possible.
- Tint: `spineTint` if set, else team `color2` (RB blue).
- Optional follow-up (same PR if cheap): SIDE twin is **not** required for v1; do not restore culled `"bars"`.
- Racing Bulls team data: `spineLogo: "streaks"`, keep `spineSide: "sash"` (or current), set `spineTint` to RB blue if derived contrast fails on white cover.
- Update reference open-gap → applied.

### 4 — Cadillac full body L/R split (chosen scope **B**)

**Intent:** Launch look — black on one half of the car, white on the other, including monocoque, sidepods, nose/hood paint, and engine cover — not atlas-only.

**New livery field:** `bodySplit: "lr"` (absent = today’s single `c1` body).

**Colour mapping (car space, +X = right):**

- `side < 0` (left) → primary body `c1` (Cadillac black)
- `side ≥ 0` (right) → secondary `c2` (Cadillac white)
- Confirm left/right against one reference still during implementation; if photos are mirrored vs this convention, swap in team data by swapping `color`/`color2`, not by inventing a third field.

**Mesh (`js/car/car3d.js`):**

- Helper `bodyPaint(side)` / `bodyPaintX(x)` used wherever body paint currently takes a single `c1` for Cadillac-relevant parts:
  - `buildSidepodBodywork` — already loops `side`; pass `bodyPaint(side)`.
  - `buildEngineCoverBodywork` — split each centre-crossing loft into left/right halves (two colours); do not leave the cover one flat `coverC` when `bodySplit` is set (Cadillac has no separate `cover` today; split body **is** the cover story).
  - `buildSharedChassis` / hood / nose paint spans — emit left and right halves (or two half-width spans) with `bodyPaint(±1)`.
- Surfaces that stay shared: carbon, intakes, halo rules unchanged, wings still use existing wing/`c2` rules unless they are clearly body-coloured panels.
- Cockpit dimming (`_ckAcc`) still applies per resolved colour.

**Atlas (`liverytex`):**

- Crown / wrap paths that assume one `coverPaint` must ink left vs right when `bodySplit === "lr"` (crest split on canvas centre; flanks already separate regions — feed each flank its side’s body colour as the local field).
- Keep `spineLogo: "saddle"` / `spineSide: "plate"` unless split makes saddle nonsense; adjust only if the white saddle fights the white body half (then prefer plate/number on the black half’s contrast rules).

**Garage / schema:**

- Add `bodySplit` to the draft field tables (`LIV_DRAFT_*` / `Liveries.FIELDS` / `forTeam` copy list) and a garage pill (`off` / `lr`).
- Validate in `applyGarage` shape checks.

**Team data:** Cadillac `livery.bodySplit: "lr"`; keep black/white `color` / `color2`.

**Tests:**

- Unit: field round-trip; unknown `bodySplit` ignored.
- Mesh: build Cadillac → sample vertex colours on −X vs +X body paint differ (black vs white).
- Liverytex: crest left/right field colours differ under `bodySplit`.
- Update `LIVERY-2026-REFERENCE.md` open gap → applied; note model capability.

**Risk:** chassis helpers are large; prefer minimal surgical splits at emit sites over a post-pass vertex recolour (recolour risks painting carbon/wing verts). Cap the first PR at body paint sites listed above; floor/plank edges only if they read as body in garage shots.

## PR / branch shape

| Order | Branch | Contents |
|------|--------|----------|
| 1 | rebase `cursor/spine-flank-placement-242d` | #100 placement only → merge/deploy |
| 2 | `cursor/livery-slash-streaks-0fe5` | slash restore + RB streaks (atlas-only, shared liverytex) |
| 3 | `cursor/cadillac-body-split-0fe5` | `bodySplit` + car3d + Cadillac data |
| 4 | `cursor/alpine-pink-crown-0fe5` | Alpine data **only if** second source confirms |

Alpine last so a failed photo gate does not block the rest. Slash+streaks can share one PR; Cadillac stays separate because it touches `car3d.js`.

## Verification

- Per AGENTS.md: `verify-change --fast` / tooling-fast for docs+unit; garage/livery specs when those files change; `pick-tests` for browser group budget (cap two groups).
- Visual: `__apex` / garage-angles or carview shots for Cadillac ¾ front and Alpine/RB/Merc flanks — evidence in PR, not as assert source.
- Deploy via `deploy.mjs` after each mergeable lane (or one deploy after the stack lands on tip).

## Open question — resolved

- Cadillac scope: **B — full body L/R mesh materials** (not atlas-only).
