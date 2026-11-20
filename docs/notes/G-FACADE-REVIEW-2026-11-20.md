# G façade review: how it works, what it costs, how to redesign

Kind: investigation · Re-measure-by: 2027-01-20

Base: `0794b7b7` (`origin/claude/f1-game-project-26h3ng`, 2026-11-20). Asked by Bryce
2026-11-20 ~08:36Z: "investigate the g facade and how it works and how to redesign".
Docs-only lane; no `js/` edits. Prior art this builds on (and does not repeat):
[research/ARCHITECTURE-REDESIGN-2026-08.md](../research/ARCHITECTURE-REDESIGN-2026-08.md)
(the Bedrock plan; its Phase 4 "seal and carve G" is option A below) and
[CHECKJS-ROLLOUT-2026-10-18.md](CHECKJS-ROLLOUT-2026-10-18.md).

How the numbers were made (re-run them; the scratch scripts are short):
`node tools/check/check-gctx.mjs --json` (both legs, tsc present) for the checked
surface; an espree census of `const G` plus the generated shadow
`artifacts/gctx/usage.ts` for kinds and fan-in; a comment-stripped
`(?<![\w.$])G\.<member>` text pass over `js/` for what the checker does not see;
`git merge-tree --write-tree` replays of every branch-sync merge inside merged PRs
for conflicts; apex-lsp `lsp_references` for single members.

**Headline:** G is big, but it is not where the pain is. The façade causes almost no
merge conflicts and costs nothing at boot. Its real costs are three:
1. **It is flat.** 297 members that are really about 10 domains, with no rule about
   who may write what.
2. **A blind spot.** About 584 uses in 30 files are outside the checker, and that is
   where the live drift is.
3. **Modules park private state on it.** Several modules keep their own state on G.

Recommendation: **(E+A-lite)**. Close the blind spot first, then carve G into typed
sub-façades one domain at a time, and only where a domain is actively changing.
Do not do DI or ESM.

---

## Part 1 — how it works

### 1.1 How G is built

`const G = { … }` is `js/game.js:3024-3444`. It is 421 lines inside the file's
`(async function () { … })()` wrapper, so `G` is **IIFE-local**: no other script can
name it. Every module reaches it only through a parameter. #5964 and #5965 were two
modules that assumed otherwise.

| Kind | Count | What it is |
|---|---:|---|
| accessor pair (`get x` + `set x`) | 93 | live mutable closure state that modules may write (`state`, `trackIdx`, `raceT`, `raceWeather`, …) |
| getter only | 43 | live read-only state (`track`, `cars`, `player`, `gfx`, `tyres`, `pits`, …) |
| arrow wrapper `(…a) => f(…a)` | 89 | a function, often **deferred** to a const made after G (§2.2) |
| shorthand function (`announce,`) | 43 | a hoisted game.js function, handed over as-is |
| shorthand const (`store, els, ttBoard,`) | 29 | a stable object or number |
| **total** | **297** | 136 state members (46%), 161 behaviour members (54%) |

Growth: about 210 members (2026-08-13, the `.d.ts` was transcribed) → 282 (10-01) →
291 (10-15) → 297 (11-01), then **flat for 20 days**. In that window game.js stayed at
9,590-9,616 lines. The ratchets are holding.

Some setters are verbs in disguise. Examples: `state` → `setState(v, "api")`,
`flow` → `setFlow(v)`, and `raceQuali` → a rule translation onto `raceGrid`. A write
`G.flow = "season"` runs logic. Bedrock §Phase 4 already calls for these to become
named verbs.

### 1.2 How modules receive and use it

- **98 factories** take the ctx (`declare const X: GameModuleFactory` roster). **93 of
  them** read or write it. There are about 105 `.create(G` calls in game.js, and
  several modules are created twice (the stub, then the real instance, §1.4).
- **5,327 checked sites** (tsc leg). Ten members account for 42% of them.
- **Fan-in per member** (modules that touch it):

| Modules | Members |
|---:|---:|
| 0 (in checked modules) | 4 (`camRoll`, `flybyShots`, `ttLaps`, `onPeerQualiLive`; all have readers in unchecked files, §1.3) |
| 1 | 116 |
| 2-3 | 96 |
| 4-9 | 50 |
| 10+ | 31 |

  So **39% of G is a private pipe to one module**. Most of the rest is a few shared
  nouns.
- **Hottest members:** `track` (50 modules / 552 sites), `player` (42 / 399),
  `store` (42 / 133), `state` (40 / 155), `cars` (30 / 201), `soundOn` (27 / 164),
  `$` (25), `announce` (24 / 109), `els` (22 / 497 sites), `paused` (21), `vTop` (21),
  `raceT` (19), `raceWeather` (18), `trackIdx` (18), `gfx` (17 / 235).
- **Writes:** 77 members are written from outside game.js. 21 of them are written by
  3+ modules: `trackIdx` (11 writer modules), `flow` (7), `raceWeather` (7),
  `raceTimeOfDay` (7), `teamIdx` (8), `session` (5), `dbgCam` (6), `raceLaps` (6), …
  14 members are written **only** by `js/agent/*` / `js/perf/*` (test and agent
  surfaces), for example the steer tunables `STEER_*`, `YAW_*` and `frozen`.
- **Module breadth** (distinct members used): >40 members: 2 (`apex.js` 154,
  `agentview.js` 47); 16-40: 25; 6-15: 37; 1-5: 29.
  `race-settings.js` (39), `real-race.js` (38) and `net/lobby.js` (36, 20 of them
  writes) are the widest product modules.

### 1.3 How the contract is kept in sync, and where it drifts

`types/game-ctx.d.ts` (951 lines; `interface GameCtx` is 459 of them) is checked by
`tools/check/check-gctx.mjs` from `tests/unit/game-ctx-surface.test.mjs`:
1. **Parity (espree):** the `.d.ts` member set equals `const G`, and writable ⇔ accessor pair.
2. **Usage (tsc):** every `G.x` / `const {…} = G` reached through a module's
   `create(ctx)` parameter (eslint-scope, not grep) is lifted into a typed shadow and
   compiled.
3. **Unread:** a baseline of members nobody reads. `KNOWN_UNREAD` is empty.

All three are **clean today** (0 problems, 0 tsc errors). The drift lives where the
checker does not look. Leg 2 follows only a parameter of a function **named
`create`** (`check-gctx.mjs:120-130`). So it misses:

| Blind spot | Files | ~Sites | Example |
|---|---:|---:|---|
| `hooks(G, deps)` sub-surfaces spread into `__apex` (`js/agent/apex.js:1867-1870`) | 4 (`apex-cam`, `apex-lobby`, `apex-net`, `apex-track`) | ~300 | `G.flybyShots`, `G.camRoll`, `G.ttLaps` read only here |
| helpers that take G as a parameter inside a checked file | n/a | unknown | `js/race/cooldown-lap.js:17-24` `sessionEligible(G)` reads **`G.watchMode`, which is not a member** (always `undefined`), and `G.realRace.isWatch`, which the `.d.ts` types as only `{ status() }` |
| modules made by another module, or with a non-`create` entry (`bind`, `init`, `sceneFromG`) | ~26 more (`tv-graphics`, `designer`, `crowd`, `extra-rigs`, `hud-strategy`, `race-facts`, `session-stub`, …) | ~280 | `js/race/tv-graphics.js:75-76` reads **`G.lap`, `G.laps`, `G.flag`**. None is a member: lap and laps fall back, but `flag` is always `""` in the overlay frame |
| **total** | **30 files** | **~584** | |

The numbers are a text pass: comment-stripped `G.<real member>` matches in files with
≥2 of them that have no shadow function. Treat them as ±10%.
The `typeof G` cases (#5964 visor glint, #5965 race-entry stall cover) were this same
blind spot. They are fixed in #5971.

**Type precision:** the 297 members are typed. 11 interface lines use `unknown`/`any`.
Domain objects (`TrackModel`, `CarState`, …) carry index signatures by design
(`.d.ts` header), so `G.player.anything` always type-checks. The contract proves that
**names exist**, not what shape they have.

### 1.4 Lazy bundles

G is captured **live, by closure, at boot**: `LazyBundles.create({ getContext: () => G, … })`
(`js/game.js:75-76`), read back through `ctxOrNull()` (`js/core/lazy-bundles.js:8`).
Lazy modules get the same object, never a copy, so every getter stays live. There are
three shapes:
- **Re-create on ready:** `onAudioReady` and `onRaceSessionReady` (`js/game.js:80-106`)
  run `X.create(G)` again once the bundle's real globals land. They replace the stub
  instances held in game.js `let`s (`pits`, `engineer`, `startLights`, `records`, …).
  Module state from the stub is dropped. The `prepareDaily()` re-arm at `:96` exists
  because of that.
- **Stub then hydrate:** `RealRace.create(G)` (`js/race/real-race-boot.js:46-54`)
  returns a stub that makes `RealRaceBody.create(G)` once `LAZY_REAL_RACE` lands.
- **Agent surface:** `bindAgent` runs `window.__apex = ApexApi.create(G)` (`js/game.js:79`).
  `CrowdAudio.bind(ctxOrNull())` is wired from lazy-bundles itself (`:757-761`), the
  one place outside game.js that hands G over.

`check-gctx`'s roster includes the lazy lists (`check-gctx.mjs:99-111`), so lazy
modules **are** checked when their entry point is `create`.
A quirk: `getContext: () => G` is defined at line 76, before `const G` exists at
3024. Calling it before G is initialised would throw a TDZ `ReferenceError`. Today
nothing calls it that early because the bundles resolve later.

### 1.5 Test fakes

A static espree scan of all of `tests/` found:
- **Real G:** `tools/lib/game-vm.cjs` `createGame()` boots the whole manifest through
  `js/game.js` in a Node VM and captures G by wrapping `ApexApi.create` (~line 705).
  150 test files use it. `tests/unit/game-vm.test.mjs:35` is the check that the
  capture works.
- **Fake G:** about 85 test files hand-roll about 277 fake G objects (210 object
  literals in 81 files, plus helper-built ones). There is **no shared factory**:
  `stubG` is copied into 4 net tests (`netplay-resilience:32`, `net-roster:89`,
  `net-start-arming:39`, `net-authority:188`), and `makeCtx`, `makeG`, `raceG` and
  `poseG` are one-offs. **0 fakes are typed against `GameCtx`**, and
  `game-ctx-surface.test.mjs` never reads tests.
- **Drift (fake → real):** 11 files feed names G does not have.
  - `isRaining` in 6 weather/lighting fakes (`storm-weather.test.mjs:50` even calls
    `G.isRaining()`). It is a top-level game.js function, not a member.
  - Fake-only state in the net stubs: `announced`, `caughtCautions`, `caughtQuali`,
    `caughtQLive`, `announcements`, `groundY`, `trackAt`, `swaps`.
  - About 10 unique invented names.
  - The other direction (a fake *missing* a member that the module reads) was not
    measured. Those tests would fail loudly anyway, so it is the lower risk.
- **563 test files use `node:vm`.** That is the strongest single
  fact against option D.

### 1.6 What else is shared besides G

- **~300 script globals.** Every eager file is an IIFE that assigns one global (309
  `FULL` files). `HARD_EDGES` (236 pairs) records the eval-time order.
  `tests/unit/global-registry.test.mjs` pins each global's single writer.
- **`window.__apex`** (`ApexApi.create(G)`, lazy): a second façade over the same
  state. It is the agent/test API, and it is the widest G consumer (154 members, 40 of
  them written).
- **`GameStore.store`** (also `G.store`), `Log`, `PhysicsConsts` (a plain data global
  destructured at eval), and `TrackDefs` (growable, `js/circuits/`).
- **Second-order façades:** `deps` objects passed next to G (`FlyingStart.create(G, { realRace })`,
  `JumpStartPenalty.create(G, { autoThrottle, inputOf, … })`, `ApexCam.hooks(G, { smp, … })`).
  These are already narrow, explicit injection in miniature (§3 B).

---

## Part 2 — what it costs

| # | Cost | Evidence | Severity |
|---|---|---|---|
| C1 | **Unchecked G uses (blind spot).** About 584 sites in 30 files, and the live drift sits there: `G.watchMode`, `G.lap/laps/flag`, and before #5971 the `typeof G` reads | §1.3 | **high**: the only class of G bug still landing |
| C2 | **Flat namespace, many concerns.** 297 names in one bag. A rough prefix clustering gives ~10 domains: session/flow ≈33, garage/setup ≈35, physics tunables ≈30, world/cars ≈25, camera ≈24, lighting/weather ≈23, race settings ≈23, net ≈16, ui/hud ≈15, audio ≈5, utils ≈8, rest ≈60. Nothing says which module may write `trackIdx` (11 writer modules) or `flow` (7) | §1.2 | medium: a reader cannot tell a module's footprint without the checker |
| C3 | **G as a scratchpad.** `_`-prefixed members that are another module's private state, routed through game.js because the module had nowhere else to keep it: `_photoPrevScale` (only `photo-cam.js` uses it, game.js has just the accessor, `:3306`), `_cloudBase`, `_ltBase/_ltFlash/_ltNextT` (backed by `stormFx`, written by `atmosphere.js:705-720`), `_spMeshKey` (setup-sheet + apex), `_ltStore` (`photo-studio.js:339,358`), `_studioRig` (apex-cam), `_testInput` (agent). Each costs game.js an accessor line and a `.d.ts` line for state game.js does not own | §1.4, ordering report | medium: game.js grows for other modules' state |
| C4 | **Setters that run logic.** `G.state = v` → `setState(v, "api")`, `G.flow = v` → `setFlow`, `G.raceQuali = v` → rule translation. A plain-looking assignment has side effects, which a reader (or an agent) does not expect | `js/game.js:3033,3039,3416` | low-medium |
| C5 | **Hidden ordering.** 9 explicit "defer" wrappers forward to consts created later (`setCamMode` → `CamModes` at `:9360`, `refreshHud` → `:3496`, `loadCarModel` → `CarDraw` `:3509`, `setScale`/`applyResMode` → `UiScale` `:3567`, `refreshLightTunePanel` → `:4143`, `applyRaceSettings` → `Atmosphere` `:3498`, …). About 6 getters read later lets (`_spMeshKey` → `setupCam`, `raceChangeable` → `wxArc`, `_ltStore` → `ltStore`). **No create() body was found calling one before its target exists.** The order is held by comments (`:3447-3449` "LightStore first", `:3278-3280` "SetupUI before Menus") and by the order of the create calls, not by a check. Module-scope `let G = null` singletons (`debris-world.js:14`: `prime()`/`hazards()` throw before create) carry the same risk | ordering report | low today, a trap for the next extraction |
| C6 | **Stub replacement drops state.** Re-create-on-ready swaps module instances. Anything captured from the stub is lost (the `prepareDaily` re-arm at `js/game.js:96` is the known patch) | §1.4 | low |
| C7 | **Contract proves names, not shapes.** Index-signature domain types, so `G.realRace.isWatch` passes even though the type says only `status()` | §1.3 | low |
| C8 | **Merge conflicts in game.js.** Since 11-06: 417 PRs, 667 branch-sync merges, 260 of them conflicted. Exactly **1** conflicted in `js/game.js` (#5499, at line ~6026, **outside** the G block). The top conflict files are `docs/NOTES-INDEX.md` (48), `docs/TESTING-COVERAGE.md` (34), `tools/shot/scenery-locations.json` (26), `package.json` (24), `catalog.json` (24), `impact-map.json` (19), `ratchets.json` (9) | `git merge-tree` replay | **none from G** |
| C9 | **Boot and runtime cost.** One object literal, built once. A getter read is ~7 ns against ~1-3 ns for a plain read in Node's JIT. Even 5,000 reads a frame is ~35 µs, which is 0.2% of a 16.7 ms frame | microbench | none |

**Tonight** (merged since 2026-11-19 17:00 PT): 23 PRs. 4 touched `js/game.js` (#5853,
#5834, #5792, #5934); none touched the G block or `types/game-ctx.d.ts`. All 23
branch-sync merges replayed: 9 conflicted, **0 in game.js**. The conflicts were
`ratchets.json`/`ratchets.test.mjs` (6), `share-code.js` (2), and scenery/impact-map
(2). Wider view: since 10-01, 391 of 3,377 merged PRs touched game.js (12%) and 65
touched the `.d.ts` (2%). Since 11-13: 16 of 212.

**Rule breaks found.** "A module never reaches into game.js" holds structurally: G is
IIFE-local and there is no `window.G`. The two `typeof G` readers were the only
attempts, and #5971 fixes them. The rule *is* bent in spirit by C3: modules writing
their own state through game.js accessors. It is also bent by a module reading a G
member that does not exist (C1).

**The LSP numbers (PR #5971).** apex-lsp resolves `G.member` from this `.d.ts`. Its
rows say "contract row in types/game-ctx.d.ts; uses are text matches". The
0 → 610/626 figure in #5971 is something else: reads of the **54 null-initialised
factory lets** in game.js (`let raceSettings = null`, `ltStore`, `wxArc`, …), typed
with `@type` so `raceSettings.openRaceSetup` resolves. Those lets are exactly the
deferred targets of C5. So the LSP gain and the façade share one root cause: game.js
is the composition root, and it wires by mutable `let`. Any redesign that makes
module instances typed constants (A or B) keeps that 610/626 without hand annotations.

---

## Part 3 — redesign options

| Option | What it is | Fixes | Migration cost | Risk |
|---|---|---|---|---|
| **A. Typed sub-façades** | `G.race`, `G.cam`, `G.net`, `G.light`, `G.garage`, `G.ui`, `G.audio`, `G.tune`, … each with its own interface in the `.d.ts`. A module header declares `@uses race, cam`, and a lint fails on any other sub-façade. Flat `G.x` stays as a deprecated alias until its last reader moves | C2 (footprints readable), C3 (a domain's private state moves into the domain's owner, off game.js), C4 (setters become verbs on the sub-façade), and the write-ownership half of C2 (one owner per sub-façade) | ~10 domain PRs of ~5-25 files each, plus 1 lint PR. Each is mechanical with `check-gctx`'s usage map. Physics-touching domains (`tune`, `race`) need the characterization gate | low-medium: aliases keep every step revertible. The cost is churn across many files per domain, and conflicts with live lanes in that domain |
| **B. Explicit DI** | each `create(deps)` takes only the narrow interfaces it uses. game.js (the composition root) builds them | C2, C5 (the wiring order becomes code: a dep that does not exist yet cannot be passed), C7 | 93 modules × a hand-written deps object. The 10+ fan-in nouns (`track`, `player`, `cars`) are *live* values swapped at every race, so they must stay getters or become `() => track` thunks. That is G again, per module | medium-high: 93 signatures change. Every VM test fake changes. It mostly re-spells `G.x` as `deps.x` |
| **C. Event bus** | publish/subscribe for cross-cutting signals (race start, flag, lap, weather change) | decoupling for the *push* half (announcer, radio, HUD cards react to events) | moderate per signal | medium: hidden control flow (who reacts to `lap`?), ordering within a frame matters for the deterministic physics step. It does not address the pull half (`G.track` reads), which is 90% of sites |
| **D. ES modules** | `<script type="module">`, real `import`. Natively supported in every target browser, import maps already present for three.js, GitHub Pages serves them fine | C5 (import graph = load order), C1 (the compiler sees every import) | **very high**: 309 eager + ~200 lazy files; **563 test files use `node:vm`** to load IIFEs, and `vm.SourceTextModule` is still experimental in Node; `HARD_EDGES`/manifest/gen-shell/sw.js precache/`?v=dev` content-hash staging all re-plumbed; module graph waterfall on a phone without a bundler (modulepreload needed for ~300 files). The 2026-08 panel scored this 64 against Bedrock's 87 | high: the "largest change in the repo's history" shape the 2026-08 panel rejected; and it does not remove G (game.js's state still has to be shared by *something*) |
| **E. Do nothing + targeted fixes** | extend check-gctx to every G parameter (C1), file the drift bugs, ban new `_` scratch members, a `deferred` marker lint (C5) | C1, C3 (stops it growing), C5 (makes it visible) | 2-3 small tooling PRs, 0 product risk | none, but leaves C2/C4 |

Web research, in short:
- Seemann's "Service Locator is an anti-pattern" argument is that a locator hides a
  class's dependencies from the compiler. Bogard's reply is that it is a trade-off,
  acceptable when dependencies are checked some other way. G is a service locator
  whose hidden-dependency cost is already paid back by check-gctx's per-module usage
  map: each module's footprint is computable, just not *declared*. Option A's
  `@uses` header is the declaration step.
- No-build ESM write-ups (Bryan Braun's year in production; Rails 8 import maps still
  fingerprint in a build step; Khan Academy reverting unbundled loading for first-load
  speed) agree that no-build ESM works for moderate apps. At this size, they say, it
  wants at least a fingerprint/preload step. Here that step is `pages.yml` staging,
  so D is *possible*, but the test harness, not the browser, is the blocker.

### Recommendation: E first, then A only where a domain is moving

1. **Why not B:** the top fan-in members are live values. Narrow DI either re-creates
   G per module (thunks) or forces 93 signature changes for the same checking A gets
   from a lint. B's real win (ordering made explicit) is reachable inside A by giving
   each sub-façade an owner that is created before it is published.
2. **Why not D:** it is the only option that breaks the 563 VM tests and the manifest
   or shell machinery at once. It is a strategy change, not a G redesign. Nothing in
   E or A blocks it later, because sub-façades map 1:1 onto future module exports.
3. **Why not C as a redesign:** keep it as a *tool* inside A for the push signals
   (flag, lap, weather), not as a replacement. Most uses are pulls.
4. **Why E first:** C1 is the only cost producing bugs today (#5964, #5965,
   `watchMode`, `flag`), and it is a tooling fix with zero product risk. The
   merge-conflict premise (C8) does not hold: G is not a conflict source.

**Incremental plan (each step one PR, shippable, testable):**

| Step | PR | Proves itself by |
|---|---|---|
| 1 | **check-gctx follows every G**: treat any function parameter that receives the façade as a ctx (the `hooks(G, deps)` params, helper params like `sessionEligible(G)`, `bind`/`init` entries, and modules created by other modules such as `TvGraphics.create(G, …)` from `broadcast.js`) through call-site tracing from the existing worklist. Expect red on `watchMode`, `lap`, `laps`, `flag` → baseline those 4 rows as a `KNOWN_DRIFT` set that may only shrink | `game-ctx-surface.test.mjs` with a positive control; sites rise from 5,327 to ~5,900 |
| 2 | **Fix the drift** found in step 1 (js/ PR: `cooldown-lap` drops `G.watchMode`; `tv-graphics` maps `flag` from `cautionLevel`/`cautionInfo` and lap/laps from `player.lap`/`lapsTarget`), emptying `KNOWN_DRIFT` | the VM tests for those modules + an overlay-frame assertion |
| 3 | **Freeze the scratchpad**: lint that a new `_`-prefixed G member fails (baseline the ~10). Move `_photoPrevScale` into `photo-cam.js` (the purest case) as the template | check-gctx parity + photo-cam test |
| 4 | **`Object.seal(G)`** landed alone (Bedrock Phase 4 step 1). An expando then throws in strict mode instead of silently going nowhere | full browser shard on the PR |
| 5 | **Sub-façade template on the quietest domain.** `G.cam` (≈24 members, mostly camera modules + apex) gets an interface, `@uses cam` headers and the lint that a module touches only the sub-façades it declares. Flat names stay as aliases | lint + check-gctx; aliases make it a no-op at runtime |
| 6+ | **One domain per PR, only when a lane is already working there**: `net` (16, self-contained), `light` (23, retires most `_lt*` scratch), `tune` (30, physics characterization gate, and setters become verbs), `race`/`session` last (widest writers) | per-domain pick-tests groups |

Stop after step 4 if the game is in maintenance mode (Bedrock §4's own advice).
Steps 1-4 are about 80% of the value.

**What would change this recommendation:**
- If step 1 finds the unchecked sites are mostly drift (say >10 real bugs, not 4), the
  façade is less safe than it looks. Move A (with sealing) up and run it across all
  domains.
- If merge conflicts start landing in the G block (C8 > ~5 a week), sub-façades in
  separate files become worth it on conflict grounds alone. That means splitting the
  literal into `js/core/ctx-<domain>.js` files.
- If Node's `vm` modules become stable and the VM tests can load ESM, or the owner
  accepts a build step, D's main blocker goes and it should be re-scored against the
  2026-08 panel.
- If the push-signal modules (announcer, radio, HUD cards, TV graphics) keep adding
  per-frame polling of the same state, introduce C for those signals inside A.

## Issues filed from this review

Grouped by area, each with at most 4 items:
- [#5980](https://github.com/brycejmurrin/f1-game/issues/5980) is tooling: the
  check-gctx blind spot (C1, plan step 1).
- [#5981](https://github.com/brycejmurrin/f1-game/issues/5981) is race: `G.watchMode`,
  `G.lap/laps/flag` (overlay `flag` always empty), and the `realRace` type being
  narrower than its use (plan step 2).
- [#5982](https://github.com/brycejmurrin/f1-game/issues/5982) is tests: fakes that
  invent `isRaining` and the stub-only names, and 4 `stubG` copies. The fix is a
  `GameCtx`-checked fake factory.

Already fixed elsewhere, not re-filed: #5964 and #5965 (`typeof G` from another
script), in #5971.
