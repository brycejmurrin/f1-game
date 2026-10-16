# Strategy and career depth — plan (2026-09-30)

Status: **PLAN** — docs-only first; implementation in ordered slice PRs below.
Owner workstream: tyre severity coverage, engineer stop honesty, AI catalog
parts over seasons, career save export/import.
Ship base: `claude/f1-game-project-26h3ng`. Do **not** merge; Bryce's merge
worker lands one draft-at-a-time once full CI is green on the exact head.

## Goal

Close four measured holes in strategy and career longevity, each independently
shippable, without touching physics characterization when tyre wear is OFF,
without growing `js/game.js`, and without raising ratchets / loosening tests.

| # | Slice | Size | Outcome |
|---|---|---|---|
| D | Career save export / import | S | A CAREER FILE beside SETTINGS/GARAGE; slots round-trip through `migrateCareer` |
| A | Author `tyreSeverity` for the 45 circuits that lack it | S–M | Evidence-cited values in each circuit file under `js/circuits/`; wear-OFF discipline held |
| B | Engineer / plan cue: reduced cost, not FREE STOP | S | Measured pit loss + uncertainty in engineer + HUD plan cue |
| C | AI teams develop real catalog parts | M | `rolloverTeams` grows per-team owned/fitted catalogs under era legality |

Order is by size as requested: **D → A → B → C**.

## Current state (file / line evidence)

### (d) Career save export / import

- `js/ui/settings-export.js` header and `EXCLUDED` (≈L15–21, L206) state that
  neither SETTINGS nor GARAGE carries career or season saves.
- Mount note (≈L591): *"Career progress and accounts are not included."*
- Garage injects buttons from JS (`garageRow()`, ≈L612–624) so `index.html`
  shell node count does not grow — the pattern to copy.
- Saves live at `career.<flavour>.<i>` (`js/career/career.js` `slotKey`, L108;
  `SLOTS = 3` per flavour, L105). Read path is always
  `migrateCareer(store.get(...))` (`save-migrate.js` L116–163; `CAREER_V = 1`).
- Brainstorm ranked this S / score 3.5
  (`docs/notes/CAREER-BRAINSTORM-2026-09-21.md` §4 item 3).
- Tree ratchet: `shellNodes` ceiling **2037**, slack **25**
  (`tests/data/ratchets.json`). Prefer zero new static shell nodes.

### (a) `tyreSeverity`

- Only **7 of 52** circuit defs set it: Monaco 1.01, Silverstone 0.89, Suzuka
  0.85, Miami 1.22, Shanghai 0.45, Red Bull Ring 1.97, Albert Park 0.61
  (`js/circuits/monaco.js` (and silverstone, suzuka, miami, shanghai, redbull, albert_park)).
- Reader: `TyreModel.severity()` (`js/physics/tyre-model.js` L681–685) returns
  authored value clamped to **0.4–2.0**, else **1.0**. Multiplies life via
  `effLifeLaps` (L606–607); wear integration L718.
- Design split (`docs/research/TYRE-STRATEGY-DESIGN.md` §5.5): emergent load =
  layout work; `tyreSeverity` = surface / ambient / energy the geometry cannot
  know. Seven 2026 rates ÷ mean 0.0493 → the seven authored values. Doc
  deliberately left the rest at 1.0 rather than invent noise — this plan
  replaces that refusal with **sourced** values, not guesses.
- Wear-OFF discipline (`tyre-model.js` L33–43, `docs/PHYSICS.md` §Tyres):
  `LEVELS.off === 0` → `gripMul` / `tractionMul` / fuel muls return 1;
  characterization fixtures pin OFF. Authoring severity changes **nothing**
  while wear is off. Do not change the characterization pin or the OFF path.

### (b) Engineer stop advice

- Engineer already moved off the bare "FREE STOP" string for radio:
  - `callFor`: margin > 0 → `"CAUTION — STOP NOW LOSES NOTHING"`; else
    `"CAUTION — CHEAPER STOP, ABOUT Ns LOST"` (`js/race/engineer.js` L117–118).
  - `senseOf` already threads `pitLoss` / `marginS` from `PitLane.estimate`
    (L199, L276, L292–293).
  - Unit pins: `tests/unit/engineer.test.mjs` L148, L296–297.
- Remaining FREE STOP surface: **`PitLane.planInfo`** still paints
  `"FREE STOP · BOX NOW"` when `est.marginS > 0` (`js/race/pit-lane.js` L1531).
  HUD comment still names FREE STOP (`js/ui/hud.js` L886).
- Honesty gap: `estimate()` returns a point estimate with `estimated: true`
  (pit-lane.js L493–508) and no uncertainty band. `"STOP NOW LOSES NOTHING"`
  oversells a gap-behind minus lane-loss comparison that can flip when the car
  behind changes pace. Target language: **reduced / cheaper cost + measured
  loss + hedge**, never "free" / "loses nothing".

### (c) AI catalog parts

- AI cars resolve only `Parts.getFactorySetup(team)` /
  `FACTORY_PRESETS` (`js/game.js` ≈L1862, L1967–2017; `parts.js` L605+, L722).
  Player / MY TEAM mate alone use `getTeamParts`.
- `rolloverTeams` (`career.js` L1259–1267) moves only `career.tdev` (±8, halved
  toward baseline each winter). Measured in
  `docs/notes/CAREER-CEILING-FIX-2026-09-22.md` §1.
- Regulation eras **already ship** (`js/career/regulations.js`; CAREER.md
  §"Regulation eras"): legality filter via `Parts.setLegality`, symmetric
  because factory resolution goes through `_resolve`. They do **not** make AI
  leave the factory shelf — they only re-resolve the same presets under bans.
- Ceiling note §1 still holds for AI: factory presets + decaying tdev only.
  Brainstorm cure #2 ("AI teams develop parts too") remains unbuilt.

## Design

### D — CAREER FILE

Mirror the GARAGE FILE pattern inside `settings-export.js` (or extract a sibling
under `js/ui/` only if that file's ratchet forces it — check before growing):

- Format `apex26-career-v1`: `{ format, exportedAt, build, excluded, slots: { "driver.0": <save>, … } }`.
- Collect: read all six keys via the same `career.<flavour>.<i>` scheme; do **not**
  invent a parallel schema.
- Apply: for each present slot, run `migrateCareer` (reject null), then
  `store.set(slotKey, career)`. Never write settings / garage / account keys.
- UI: inject SAVE/LOAD from JS on the CAREER sheet (or FILES panel) the way
  `garageRow()` does — **zero** new `index.html` tags unless slack measurement
  proves headroom and a static id is required for a11y tests.
- Double-confirm load (existing `loadBtn` arm pattern). Reload after apply so
  `Career.load()` sees the new slots.
- Tests: extend `tests/unit/settings-export.test.mjs` (or a twin) — export
  omits garage/settings; import round-trips a fixture through `migrateCareer`;
  poisoned keys never land; newer-than-`CAREER_V` keeps version (no downgrade).

### A — Author remaining `tyreSeverity`

Method (must be reproducible in the PR / note):

1. **Keep the seven measured 2026 anchors** exactly as authored (P5 table).
2. For each remaining circuit, derive a severity from **published** relative
   evidence, then scale so the fleet mean of authored values stays near 1.0
   (same normalisation spirit as ÷ 0.0493). Preferred sources, in order:
   - Circuit-level deg rates from F1 Chronicle / Pirelli compound notes / race
     debriefs naming high or low deg weekends.
   - Pirelli tyre-allocation / energy-grade comments (C1–C5 selection as a
     proxy for expected surface severity when a rate is missing).
   - Surface class heuristics only as a **last** band: street / temporary
     (higher) vs permanent / smooth (lower), clamped and never outside 0.4–2.0.
3. Record each value + source URL / quote in a new notes file under
   `docs/notes/` named for this topic and date (created in the A1
   implementation PR, not this plan). Circuit file comment:
   `// <name> <rate or proxy> — <short cite>`.
4. **Wear-OFF gate:** `LEVELS.off` path and characterization fixtures untouched.
   Add / extend a unit assert that every `Tracks.LIST` def either omits the
   field or lands in `[0.4, 2.0]`, and that `severity()` default remains 1 when
   absent (regression for the reader). Optionally assert the seven anchors
   unchanged.
5. Split authoring across **two PRs** if the diff is large: (A1) calendar /
   well-sourced modern GPs; (A2) legacy / historic circuits with proxy bands.
   Each PR must still be shippable alone (partial coverage is fine; default 1.0
   remains valid).

### B — Reduced-cost stop advice

- Rename the plan cue state away from `"free"` / `"FREE STOP"` in
  `planInfo` (pit-lane.js L1531). Suggested copy:
  - `marginS > 0`: `"CHEAPER STOP · ~Ns · BOX NOW"` (loss from `est.lossS`,
    tilde = estimate).
  - else under caution: keep engineer-side cheaper-stop path; align HUD.
- Soften engineer absolute: replace `"STOP NOW LOSES NOTHING"` with wording that
  names the estimate and hedges, e.g.
  `"CAUTION — REDUCED COST, ABOUT Ns"` when `marginS > 0`, still using
  `Math.round(pitLoss)`. Keep `freeStop` as the **internal** flag name or
  rename to `cheapStop` in the same PR if tests are cheap to update — prefer
  rename so "free" disappears from the surface.
- Do **not** change `estimate()` physics formula in this slice; only presentation
  + optional exposure of `estimated: true` in the string.
- Tests: update `engineer.test.mjs` / any voice-pack cases; add a unit pin on
  `planInfo` text under a mocked caution+margin so FREE STOP cannot regress.

### C — AI teams develop catalog parts

Symmetric with the player economy, era-safe:

1. **State:** `career.aiParts[teamId] = { owned: string[], fitted: {cat: id} }`
   (or sparse deltas over factory). Default absent → current factory behaviour
   (byte-identical for saves that never rolled a winter). Migrate via optional
   field fill in `migrateCareer` (no `CAREER_V` bump if absent ≡ factory, same
   pattern as `objPick`).
2. **Winter (`rolloverTeams`):** after tdev shove, each real team may
   research/fit **one** legal catalog step toward a greedy-under-cap build
   (reuse cost / legality helpers `Parts` + `Regulations` already expose). Pace
   of unlock scales with constructors' position vs expectation (winners develop
   faster; backmarkers still move 0–1 step so the field does not freeze).
   Respect `Parts.isOptionAvailable` / era bans; never write banned ids into
   fitted.
3. **Race resolve:** in career only, AI `makeCars` / factory path reads
   `aiParts[team].fitted` when present, else `getFactorySetup`. Player path and
   GP/Season modes unchanged. `factoryCache` / `legalityKey` already key on
   ruleset — extend cache key if fitted set is part of identity.
4. **Economy watch:** run `tools/car/career-economy.mjs` before/after; AI must
   not all snap to `budgetCap` in one winter. Cap steps per winter (1) and keep
   tdev as the small pace wobble it is today.
5. **Tests:** unit — rollover under a fixed seed grows `aiParts` for a podium
   team and leaves GP mode on factory; era ban prevents fitting a banned id;
   browser career spec smoke that an AI car's resolved option id can leave its
   FACTORY_PRESETS row after N simulated winters (`__apex.careerSim`).

## Ordered slices (shippable PRs)

| PR | Branch pattern | Touches (expected) | Tests / measurements |
|---|---|---|---|
| 0 Plan (this doc) | `cursor/strategy-career-plan-6e6c` | `docs/plans/…` only | docs-integrity / tooling-fast |
| 1 **D** Career file | `cursor/career-save-export-6e6c` | `settings-export.js`, career-ui hook, unit test; **no** `index.html` if injectable | `settings-export` unit; shellNodes ≤ ceiling; node count delta 0 |
| 2 **A1** Severity (sourced GPs) | `cursor/tyre-severity-calendar-6e6c` | subset of circuit files under `js/circuits/`, notes doc, small unit | tyre-model / tracks unit; characterization still OFF-green |
| 3 **A2** Severity (legacy / proxy) | `cursor/tyre-severity-legacy-6e6c` | remaining circuits + note rows | same gates; fleet mean ≈ 1.0 report in PR |
| 4 **B** Reduced-cost copy | `cursor/engineer-reduced-cost-6e6c` | `engineer.js`, `pit-lane.js`, hud comment, unit tests | engineer + planInfo unit; no physics change |
| 5 **C** AI catalog parts | `cursor/ai-catalog-parts-6e6c` | `career.js`, `save-migrate.js`, `game.js` **hook only** (extract if growth into a new module under `js/career/` if the rollover logic does not fit) | career unit + economy script delta; career.spec smoke |

Each PR: draft until **full** CI green on that head, then undraft. No merge.
Sync to ship only on conflict or tip-red required check (AGENTS §Concurrent PRs).

## Risks

| Risk | Mitigation |
|---|---|
| Invented severity looks like data | Cite every value; prefer leaving 1.0 over a weak proxy; document refusals |
| Characterization / baselines move | Never change OFF path; do not retune `LOAD_REF` / life constants in A |
| shellNodes / game.js growth | Inject UI; put AI parts logic in `js/career/` module; extract if game.js grows |
| AI parts unbalance / era asymmetry | 1 step/winter; legality filter; economy script before/after |
| Parallel agents on circuits / career / export | Touch only owned paths; claim via `who-is-on-it`; tiny diffs |
| "FREE STOP" regressions in voice packs | Grep + unit pins on both engineer and planInfo |

## NOT doing

- Changing tyre wear shipped default or characterization OFF pins.
- Reworking emergent load / `LOAD_REF` / compound `life` ladder (catalog problem in TYRE-STRATEGY-DESIGN §6).
- De-owning player parts; regulation eras already cover the reset (ceiling-fix §3).
- Inverse-scaled research income (rejected in ceiling-fix §2).
- Season-save export, ghosts, leaderboards, accounts.
- Pit-lane geometry / `lossAt` formula retune (B is copy + uncertainty language only).
- Growing suppression / quarantine lists, loosening tolerances, or raising file-size ratchets (lowering stale caps is fine).
- Merging PRs or force-pushing ship.

## Verification ladder (every implementation PR)

1. `node tools/ci/pick-tests.mjs` — name groups.
2. `npm run test:tooling-fast` (or `tooling-fast.mjs --jobs=3`) after all edits.
3. Targeted unit / one browser group if pick-tests names one (career / engineer).
4. `node tools/ci/deploy.mjs --gate-only` before push when the ladder requires it.
5. Push → draft PR → watch `ci-watch.mjs --sha <head>` → fix root causes →
   undraft only when full tier is green on that SHA.

## Final report fields (fill when slices land)

- PR links + head SHAs (plan + D/A/B/C).
- Shipped vs deferred (e.g. A2 proxy circuits deferred if evidence missing).
- Before/after: shellNodes delta; authored severity count 7→N; economy script
  seasons-to-cap / AI fitted divergence; engineer/planInfo string corpus
  (`rg "FREE STOP"` → 0 in `js/`).
