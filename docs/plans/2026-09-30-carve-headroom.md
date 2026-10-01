# Carve headroom — size-ratchet extractions (2026-09-30)

**Workstream:** open slack on saturated size ratchets so parallel feature agents
can land without raising ceilings. **Not** a physics rewrite, scenery wave, or
renderer parity pass.

**Audience:** Bryce (merge worker) + peer agents. Plan first (this PR), then one
small carve PR per slice. Do not merge; leave drafts until full CI is green on
the exact head, then undraft.

**Related (do not duplicate):**

| Doc | Role vs this plan |
|---|---|
| [`2026-09-24-refactor-readability.md`](2026-09-24-refactor-readability.md) | Ranked readability backlog. This plan **narrows** to ratchet headroom and the blocks peers are about to touch. |
| [`CLEANUP-ROADMAP.md`](CLEANUP-ROADMAP.md) | Earlier carve log; unfinished items stay there unless absorbed below. |
| [ARCHITECTURE.md](../ARCHITECTURE.md) §Reorg | Extraction lessons: boundary crossings, no leftover symbols, no fat `G`. |
| [slim-bloat / carves.md](../../.claude/skills/slim-bloat/references/carves.md) | Mechanical recipe (`extract-module.mjs`, `--update`, lockstep). |
| [ARCHITECTURE-MAP.md](../ARCHITECTURE-MAP.md) §Where new code goes | Home for new modules (added with this plan). |

---

## Goal

1. Lower `js/game.js` (and, later, other saturated files) size metrics with
   **behavior-identical** extractions into domain IIFEs.
2. Put the next wheel-slip / wall / weather / rubber-band / camera edits in
   named modules peers can own without fighting on `game.js`.
3. Never raise a ratchet. Never fatten `G` (`gMembers` is already at ceiling).

---

## Current state (evidence)

Measured on ship tip `40d137f41` (`claude/f1-game-project-26h3ng`, 2026-09-30):

```sh
node tools/check/ratchets.mjs --json   # every row slack: 0
```

| File / scope | Metric | Value = ceiling | Slack |
|---|---|---:|---:|
| `js/game.js` | lines | 9909 | 0 |
| `js/game.js` | codeLines | 5282 | 0 |
| `js/game.js` | gMembers | 279 | 0 |
| `js/game.js` | topLets | 159 | 0 |
| `js/car/car3d.js` | lines | 4118 | 0 |
| `js/agent/apex.js` | lines / codeLines | 3212 / 2273 | 0 |
| `js/render/glx/glx.js` | lines | 2766 | 0 |
| `js/net/lobby.js` | lines | 1868 | 0 |
| `js/track/tracks.js` | lines | 932 | 0 |
| `js/lighting/presets.js` | lines | 17318 | 0 |
| `(tree)` | bareCatches / cssClasses / shellNodes | 30 / 610 / 2037 | 0 |

`updateCar` spans **4682–6641** (~1960 lines). Priority blocks inside it
(line numbers at tip; re-measure before each carve — peers move this file):

| Block | Lines (tip) | ~code lines | Why peers need it |
|---|---|---:|---|
| Combined-slip / grip circle / Fy / integrate (“player forces”) | ~5879–6084 | ~88–206 | Enabler for real wheel-slip physics; every tyre force lives here |
| Wall / pit / gantry clamp + human writeback | ~6128–6301 | ~93–174 | Barrier / pit-wall / post work |
| `roadWetness` / `gripMult` | 949–950 | 2 | Already thin wrappers over `TyreModel`; ownership cleanup |
| Rubber band / `_bandNow` | ~4734–4739 | 6 | AI difficulty band; brake target reads `_bandNow` |
| Camera mode switch | mostly `js/camera/mode-switch.js` | leftovers in `game.js` | Phone/visor / XR wiring still closes over `camMode` |

`extract-module.mjs` free-ref samples (analyse-only):

- **5879–5946** (budget → `muF`/`muR`): many free names (`c`, `clamp`, `loadF`,
  `SetupTune`, `LONG_GRIP`, `gripMult`, …) — **do not** rewrite these onto `G`.
  Pass an explicit args bag / write results onto `c`.
- **949–950**: `TyreModel`, `raceWeather`, `wxArc` only — cheap fold.
- **6128–6301**: parses as a statement list (whole wall block).

### Relation to “do not split `updateCar`”

[do-not.md](../../.claude/skills/slim-bloat/references/do-not.md) and the
readability plan forbid **splitting** `updateCar` / `render` into a new state
struct or multi-step megafunction. This workstream does **not** do that. It
moves cohesive **helpers** that `updateCar` already calls conceptually into
`js/physics/*.js`, leaving one integration site that calls
`PlayerForces.step(…)` / `WallClamp.apply(…)`. Continuous integration stays in
`updateCar`; the math gets a home.

---

## Design

### Extraction shape (every slice)

1. Analyse: `node tools/check/extract-module.mjs js/game.js <start> <end>`.
2. New file: hyphenated IIFE, one global, `create(G)` only if session state is
   required; prefer **pure / static helpers** with explicit args (TyreModel /
   BrakeCue pattern) so `gMembers` does not grow.
3. Lockstep same commit: file + `tools/manifest.cjs` (+ `HARD_EDGES` if
   eval-time) + `node tools/gen/gen-shell.mjs` +
   `node tools/check/ratchets.mjs --update` (**lower only**).
4. `grep` every removed symbol. No copied constants left behind
   (ARCHITECTURE § leftovers).
5. One carve → one PR. Announce the carve in the PR body so peers take it on
   sync. Sync to ship **only** on conflict or tip-red required check
   (`AGENTS.md` §Concurrent PRs).

### Avoid a fat `G`

| Do | Don't |
|---|---|
| Pass `c`, `dt`, `track`, scratch, and already-computed locals as args | Add 10–30 `G` getters for mid-`updateCar` locals |
| Write outputs onto `c.*` fields the rest of the frame already reads | Invent a parallel force-state object the characterization suite cannot see |
| Keep `shake` / audio / rumble side-effects as callbacks or a small `fx` bag (Collide pattern) | Pull `GameAudio` / `Input` through new façade members |

### Target modules

| Slice | New / extended home | Call site |
|---|---|---|
| A | `js/physics/<player-forces>.js` (`PlayerForces`, proposed) | `updateCar` human slip branch |
| B | `js/physics/<wall-clamp>.js` (`WallClamp`, proposed) — **not** Collide (Collide owns car–car; header “barrier clamp” is the post-contact soft clamp) | `updateCar` after lateral move |
| C | Fold `roadWetness`/`gripMult` into `TyreModel` session API (or keep thin re-exports on `G` that already exist) | existing call sites |
| D | `AiDrive.rubberBand(…)` or tiny `js/physics/<rubber-band>.js` (proposed) | `updateCar` vmax block |
| E | Phone/visor cam leftovers → `js/camera/mode-switch.js` or `js/input/` phone pad | game.js boot wiring |

---

## Ordered slices (each independently shippable)

### Slice 0 — this plan + “where new code goes” (S) — docs only

- Add this file under `docs/plans/`.
- Short note on [ARCHITECTURE-MAP.md](../ARCHITECTURE-MAP.md): saturated
  ratchets ⇒ new logic goes in domain modules, not `game.js` growth.
- **Tests:** `docs-integrity` / tooling-fast (docs-only commit path).
- **Measure:** n/a (no ratchet change).

### Slice A — PlayerForces (M) — **first implementation PR**

- Move combined-slip budget → axle µ → soft tyre sat → rigid-body integrate
  (~5879–6084) into `PlayerForces.step(c, ctx)` in `js/physics/<player-forces>.js`
  (exact span re-probed at carve time; keep marble / haptic cues with the forces
  they read).
- `updateCar` keeps the human/AI branch and assist inputs; one call replaces the
  inline block.
- **Tests that would fail before:** unit VM on `PlayerForces` (budget / µ /
  integrate invariants from known inputs); `physics-characterization` must stay
  bit-identical with tyre wear off. Prefer a new
  `tests/unit/<player-forces>.test.mjs` that pins the extracted pure pieces.
- **Measure:** `ratchets.mjs --json` before/after — expect `js/game.js` lines and
  `codeLines` down; `gMembers` flat or down; new file uncapped until it earns a
  ratchet (do not add a ceiling preemptively).
- **Risk:** characterization drift if float order changes — move statements,
  do not rewrite math.

### Slice B — WallClamp (M)

- Move wall / pit-wall / gantry / human barrier scrub / laneMin writeback
  (~6128–6301) to `WallClamp.apply(c, ctx, fx)` in `js/physics/<wall-clamp>.js`.
- **Tests:** unit cases for nose-in scrub sign, laneMin pin, `xPinned` world
  writeback; drift / wall specs if pick-tests names them.
- **Measure:** further `game.js` lines/codeLines drop.
- **Risk:** pit / post edge cases; keep DebrisWorld / IncidentSim hooks as
  callbacks on `ctx`.

### Slice C — weather grip ownership (S)

- Collapse `roadWetness` / `gripMult` wrappers into `TyreModel` (or a one-liner
  session helper on the existing create). Keep `G.gripMult` / `G.roadWetness`
  façades that already exist so callers do not churn.
- **Tests:** existing tyre-model unit tests + any caller that asserts the G
  methods.
- **Measure:** tiny `game.js` drop; mainly ownership clarity for wet-grip peers.

### Slice D — rubber band / `_bandNow` (S)

- Extract the `bandFactor` / `bandCap` / `_bandNow` block into `AiDrive` (preferred —
  already owns wall scrub helpers and difficulty coupling) or a 40-line module.
- **Tests:** unit: start-line gate, lapped gap, `BAND_CEIL` monotonicity
  (comments at 4728–4736 encode the bugs).
- **Measure:** small `game.js` drop; unlocks AI-load / rubber-band peers.

### Slice E — camera leftover wiring (S) — only if still in `game.js`

- `CamModes` already owns cycle/set/picker. Move phone-visor / ephemeral
  override helpers that still close over game.js lets into `mode-switch.js`
  **without** new `G` members (use existing `camMode` / `setCamMode`).
- **Defer** if a phone-controller PR owns the same lines — take only the
  residual after that lands.
- **Tests:** camera / phone-pad specs pick-tests names.

### Later (out of this workstream’s first batch)

Saturated non-`game.js` files (`car3d`, `apex`, `glx`, `lobby`, `tracks`,
`presets`) follow the readability plan ranks — one carve each, after A–D free
`game.js` slack for everyone. Tree ceilings (`bareCatches`, `cssClasses`,
`shellNodes`) are not extraction work; they shrink only when a CSS/DOM/catch
pass intentionally lowers them.

---

## Risks

| Risk | Mitigation |
|---|---|
| Parallel PRs on `game.js` | One small carve per PR; announce span + new path in PR body; sync only when required |
| Characterization red from reorder | Mechanical move; same statement order; run characterization after A/B |
| Fat `G` | Explicit args; reject any carve that needs ≥ ~8 new façade members |
| Collide header confusion | WallClamp is the driving-boundary clamp; do not merge into Collide |
| Raising ratchets under pressure | Forbidden; `--update` after extract must lower or no-op |

---

## What this workstream is NOT doing

- Rewriting tyre math, adding wheel-slip physics features, or changing pace /
  arc contracts (feature agents own those **after** Slice A lands).
- Splitting `updateCar` / `render` control flow or inventing a shared physics
  state struct.
- Raising any ratchet, widening tolerances, quarantining, or skipping tests.
- Growing `game.js` to “make room” for an extract.
- Presets → JSON, WGX split, scenery `buildProps` peel, circuit waves (other
  plans / workstreams).
- Merging PRs (Bryce’s merge worker).

---

## Execution checklist (every implementation PR)

```sh
node tools/check/ratchets.mjs --json          # before
node tools/check/extract-module.mjs js/game.js <start> <end>
# edit SOURCE + new module + manifest; gen-shell; ratchets --update
npm run test:guards
node tools/ci/pick-tests.mjs
node tools/ci/tooling-fast.mjs --jobs=3
# physics slices: physics-characterization (or verify-change plan)
node tools/ci/deploy.mjs --gate-only          # before push
git push && draft PR → watch CI → undraft when full tier green on head
```

Announce in the PR body: **Carve:** `<old span>` → `<new module>`; peers should
`sync-pr` only if they conflict on `game.js` / `ratchets.json` / manifest.

---

## Measurement stamp

| Field | Value |
|---|---|
| Tip SHA | `40d137f41` |
| Branch measured | `origin/claude/f1-game-project-26h3ng` |
| Date (UTC) | 2026-09-30 |
| Method | `ratchets.mjs --json`, `bloat-scan.mjs --json`, brace span of `updateCar`, `extract-module.mjs` free-ref samples |
