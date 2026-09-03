# Architecture redesign panel — dated record (2026-08)

Dated research record. The question: **how would this codebase be redesigned
correctly** — knowing everything the audit and architecture review know, with
the historical failure mode (unsynchronized bulk change by parallel agents)
as the binding constraint.

Method: three independent designs were produced from fixed priors — a
zero-build native-ESM strangler ("Graphline"), a TypeScript+Vite conversion
("Typed Apex" — which in execution chose esbuild over Vite), and a
harden-the-IIFE-in-place plan ("Bedrock"). Two independent judges scored all
three on five criteria (agent safety, no-build ethos, migration risk,
determinism, payoff-per-effort), and a synthesis agent produced the final
recommendation from the designs plus both scorecards. The full outputs are
compressed in §The three designs and §Judge scores; the synthesis is included
verbatim in §Synthesis. The uncompressed panel output (all three full designs
and both complete scorecards) is
[`archive/research/raw/2026-08-redesign-panel.json`](../archive/research/raw/2026-08-redesign-panel.json).

**DECISION: Bedrock-with-grafts is the adopted direction. Native ESM
(Graphline) is not rejected — it is kept as the documented escalation path,
for which the adopted plan's early phases are a direct prefix.**

---

## The three designs

### Graphline — native-ESM strangler (zero build step)

**Thesis.** The founding bet ("the file you edit is the file the browser
runs") is worth keeping; what must die is the hand-maintained substitute for a
compiler. Native ES modules make the import graph the load-order authority
(retiring `tools/manifest.cjs` FULL/HARD_EDGES/DEFERRED_EDGES), `tsc --checkJs
--noEmit` makes module boundaries checker-enforced instead of conventional,
and a generated import map becomes the one place `?v=N` lives. The enabling
fact: `defer` classic scripts and `type="module"` scripts execute in shared
document order after parse, so each of the ~156 IIFEs converts one file per PR
by swapping its own tag in place — converted modules `expose()` their global
through a bridge shim so every unconverted IIFE, every `GLX.*`-patching spec,
and `window.__apex` keep working at every intermediate commit. G dissolves
into typed domain stores behind a ratcheted compatibility façade; the
descriptor-copy renderer install becomes a real RendererPort with an explicit
capability table. Every retired prose/manifest invariant is replaced by the
module system itself or a generated-file-plus-guard pair — never by
convention.

**Module system.** Native ESM, zero build. Internal imports are relative,
never bare, so the game boots even without import-map support; the existing
inline import map (already present for vendored three) grows a generated
section mapping each module URL to its `?v=N` form, written by
`tools/gen-importmap.mjs` (checked-in output — a generator is not a build
step). During migration, tags stay per-file: classic tags get `defer`,
converted tags become `type="module"` in place, document order preserved; end
state is one module entry script. Circuit order stops being tag order —
`js/circuits/index.js` exports the curated 40-entry array (24 season rounds
first, preserving the stored `apex26.track` positional-index contract).
DEFERRED backends become honest dynamic `import()`, killing the DEFERRED map,
DEFERRED_EDGES, and game.js's BACKEND_FILES table. The sw.js precache derives
from a generated, committed `precache.json`. Types arrive via JSDoc +
`jsconfig.json` + a `tsc --checkJs --noEmit` CI job over a per-file allowlist.
`js/bridge.js` exports `expose(name, api)` (module bindings are invisible to
classic scripts) and `legacy(name)` (typed getter over `window[name]`); an
import-hygiene guard forbids raw `window.X` reads and ratchets `legacy()`
calls to zero. Node consumers (verify-track, foundation tests, carview) drop
the VM script-loader for native `import()` in a child process per track.

**State design.** G dissolves into ~8 typed domain stores under `js/state/`
(`race`, `tuning`, `camera`, `atmo`, `garage`, `timing`, `net`, `debug`) —
each a module exporting one mutable plain object plus effectful named setters;
no proxies, no event bus, no getter magic. Side effects that today hide in G's
setters become named functions (`setFlow()` the only flow writer, `setPace()`
carrying the GameCams re-inject). What does NOT move: `updateCar()`/`render()`
locals and the ~40 interdependent tyre-model temporaries; `cars[]`/`player`/
`track` stay owned by game.js. Transition: `js/game/g-facade.js` `createG()`
reproduces today's exact G surface so every `Module.create(G)` signature is
untouched on day one; modules then migrate to importing store slices
directly, and a new g-ratchet test counts façade members monotonically down.
End state: G is gone.

**Renderer seam.** `js/render/port.js` defines a RendererPort typedef (~40
members transcribed from gfx.js's header) plus a `caps` table (`textureArray,
gpuTimer, msaa, pcss, volumetrics, hdr`). Backends carry `@implements`, so a
missing member is a type error — installation stops copying members onto the
GLX object entirely; `Gfx.create()` returns the selected port. Feature checks
move from `if (gfx.member)` (the trap that bit twice) to `if
(gfx.caps.x)`, backed by a caps-honesty spec exercising each declared cap per
backend. For the ~8 specs that monkey-patch `GLX.*`, `window.GLX = port`
(alias, not member copy) preserves `gfx === GLX` on every path; those specs
migrate one-by-one to a sanctioned `__apex.gfx()` handle. WGX stays frozen,
its non-parity finally machine-readable.

**Guards retired:** load-order's tag-order half and all HARD_EDGES/
DEFERRED_EDGES assertions (only at the final step); `tools/manifest.cjs`
entirely; backend-surface-parity's explicit-undefined mechanism; the
bump-cache sed ritual (replaced by gen-importmap + an importmap test); the
DEFERRED/BACKEND_FILES/sw.js three-way agreement; the "no ES modules"
convention line; the G façade itself, gradually via ratchet.

**Guards kept:** physics-characterization (THE migration invariant, run after
every step touching game.js/state/physics-adjacent modules);
scenery-api-contract; module-size (joined by the g-ratchet); vstd-lint +
vstd-invariant; graph-parity; docs-integrity, comment-citations, silent-catch;
deploy-staging; test-groups and the whole spec taxonomy. New guards:
importmap.test.mjs, import-hygiene.test.mjs (relative-imports-only, cycle
check, legacy() ratchet), the tsc CI job, circuit-order.test.mjs.

**Migration plan.**
1. S0 truth check: an espree tool derives the real eval-time global graph and
   asserts manifest order is a valid toposort; record characterization + smoke
   baselines. No product edits.
2. S1: add `defer` to every classic tag (semantics preserved); prove the
   interleaving in the Playwright harness.
3. S2: land bridge, port typedef, jsconfig + tsc job, gen-importmap +
   gen-precache, the three new guards. Zero behavior change.
4. S3: convert Node-side consumers first (verify-track, VM-based foundation
   tests) to child-process `import()`.
5. S4: leaf wave, one file per PR, tag swapped in place, `expose()` keeps the
   global (log, mat4, shaders, geom, data tables, teams, physics-consts, …).
6. S5: track engine in dependency order, graph-parity + verify-track per PR.
7. S6: all 40 circuits to `export default` + `js/circuits/index.js` in one
   deliberate multi-file commit (pure data), verified over all 40.
8. S7: renderer — glx family, gfx, gltf, assets; descriptor-copy → alias flip
   in the gfx.js PR; caps table + honesty spec; then webgpu/three to dynamic
   import, deleting the DEFERRED machinery.
9. S8: js/data/, js/car/, js/net/ (HARD_EDGES rows become imports).
10. S9: state layer — js/state/ stores + createG(); game.js closure lets
    migrate in small batches; characterization after EVERY batch (the
    highest-determinism-risk phase); render()/updateCar() never split.
11. S10: js/game/* modules one per PR, then direct store-slice imports,
    ratcheting G down; apex.js last.
12. S11: game.js becomes the module entry; index.html collapses to importmap +
    one module tag; manifest.cjs deleted. Full suite.
13. S12: close-out — legacy() ratchet to zero, expose() removed except
    `__apex`/`GLX`/`Log`/`LightPresets`, tsc allowlist == repo, docs pass.

**Risks.** Determinism drift from module-eval reorder of side effects (S9/S10
the single scariest failure; characterization must pin quali/grid paths too);
the import-map support floor (iOS 16.4+/Chrome 89+) with a degraded freshness
path leaning on sw.js and up to 10 min of mixed-version exposure; the
defer/module interleaving assumption must be proven under SwiftShader before
anything depends on it; parallel-agent races on shared generated files
(importmap block, tsc allowlist, shrinking manifest) recreating the historical
failure mode; the ~8 GLX-patching specs during S7 if alias sequencing slips;
child-process `import()` slower than today's VM reuse (verify-track's 2 s
promise must be re-measured); tsc surfacing hundreds of latent nits; the sw.js
precache transition risking installed PWAs; scope seams where an IIFE secretly
reads another file's top-level const by bare identifier.

**Cost.** ~155 conversion PRs plus ~15 infrastructure PRs. Leaf/data files
30–60 min each; engine/renderer/game files 2–6 h; four heavy steps (S6, S7,
S9, S11) at 1–2 focused days each. Wall-clock dominated by SwiftShader group
runtime: roughly 10–14 weeks of steady background work with 2–3 worktrees.
Every step independently shippable; pausable indefinitely at any green point;
HARD_EDGES rows start dying in week 1.

### Typed Apex — esbuild + TypeScript, contracts as types

**Thesis.** The no-build bet stops paying the moment the maintainer is a
population of parallel AI agents: every consistency property a compiler gives
for free is re-implemented here as a hand-built guard. manifest.cjs +
HARD_EDGES + load-order.test.mjs are a hand-rolled import graph; 164
hand-bumped `?v=N` URLs are hand-rolled content hashing; the 200+-member G
façade with its documented drift bugs (the dead `countT` accessor, the dead
duplicate `setLightTune` key) is a hand-rolled typed interface;
backend-surface-parity's explicit-undefined rule is a hand-rolled mapped type;
the 107-member scenery contract test is a hand-rolled interface freeze. The
repo's own governing law — "what a test asserts stays true; what only prose
says drifts" — is an argument FOR a compiler: a type is an assertion checked
on every keystroke of every parallel session. The fix is deliberately
minimal: esbuild driven from `tools/build.mjs` + `tsc --noEmit` as guard, no
framework, no Vite dev-server dual-semantics, ES2022, no minification until
physics-characterization proves it safe. What breaks is named and
compensated: edit-is-run becomes <100 ms watch rebuilds plus shipped
sourcemaps; `?v=N` becomes build-written content hashes feeding the same shell
version guard; window globals and `__apex` are kept alive by an explicit
compatibility module so all 111 Playwright specs stay green untouched. One
mechanical, script-verified cutover (an IIFE→ESM codemod emitting
byte-diffable per-file IIFE output) gated by the full suite plus bit-stable
physics.

**Module system.** ESM in `src/` mirroring the current `js/` layout, compiled
by esbuild (~200 ms for 156 files); tsc checks, esbuild strips. Each IIFE's
single global becomes its named export. One generated `src/globals.ts`
assigns every window global — a PUBLISHED, test-asserted surface, not a shim
to delete (specs, the console workflow, and tools/shot/agent.mjs all reach page
globals). Eval-time HARD_EDGES become literal import statements seeded from
the manifest, cycles failing the codemod; the curated circuit order — product
data, not a load-order artifact — survives as `src/circuits/index.ts`.
DEFERRED backends become esbuild code-split dynamic imports; sw.js precache
and version.json generate from esbuild's metafile; vendored three stays
behind an alias. index.html stays hand-authored except one marked
build-rewritten script block. Node-VM consumers switch to direct ESM imports.
Migration-interim mode: the build can emit per-file IIFE `dist/js/*.js` with
today's filenames and global names, so the ESM cutover commit changes zero
bytes of index.html and keeps load-order.test.mjs passing until the bundle
flip retires it.

**State design.** Three moves, none touching render()/updateCar() internals.
(1) Type the façade first: `interface GameCtx` declares every ~200 G member
with real types and `readonly` where meant; every `create(G)` is checked
under checkJs via JSDoc before any renaming — retiring the façade-drift
defect class inside the session that creates it. (2) Execute the
already-planned "pass 2" under type cover: promote game.js closure lets
domain-by-domain into a typed GameState whose properties G's getters become
plain references to; the module-size ratchet keeps lowering. (3) Extraction
candidates keep being ranked by boundary crossings — now typed interface
members, making the blocked garage-live-preview extraction tractable.
vstd-lint stays (semantic, not structural); a branded `ScaledSpeed` type is
explicitly NOT on the critical path.

**Renderer seam.** `interface RendererBackend` (~40 members from gfx.js's
header); GLX implements it fully as the reference; WGX and TLX are typed as a
mapped `BackendSurface` where every member is `RendererBackend[K] |
undefined` — the parity test's explicit-undefined rule enforced at compile
time; the runtime test retires only after all three backends are TS-checked.
Deferred loading via dynamic-import chunks; a failed chunk fetch resolves to
null → GLX fallback, preserving honest degradation. The descriptor-copy
install is RETAINED deliberately as the object-identity contract for the ~8
GLX-patching specs (`gfx === GLX` on every path). Known cross-backend shading
divergences are flagged out of scope so "typed" is not mistaken for "at
parity". WGX stays frozen.

**Guards retired:** load-order + the manifest FULL/HARD_EDGES/DEFERRED
machinery (at the bundle flip); the `?v=N` scheme, the bump-cache skill, and
hand-synced version.json; the sw.js precache three-way agreement;
backend-surface-parity (once all backends are under tsc);
scenery-api-contract (once all 40 circuits are checked); the
"don't edit js/ or css/ mid-run" hazard (Playwright serves `dist/` built at
run start — the mixed-build failure mode is deleted, not policed); the
"never bump mid-run" hazard (versioning is a build output); deploy-staging
reduced to dist completeness; the manual new-file checklist collapses to
"write the import".

**Guards kept:** physics-characterization promoted to the migration's master
gate (bit-stable at every phase boundary — esbuild transforms are the one new
way numerics could drift); vstd-invariant + vstd-lint; graph-parity;
module-size; the terrain/props/foundation specs and verify-track;
docs-integrity, test-groups, hooks-documented, comment-citations,
silent-catch; the entire Playwright suite as-is, kept green by the
window-globals compatibility module and retained GLX identity; pick-tests
remapped to src/; the "arc must not reach the driver" table — explicitly NOT
claimed as solved by types.

**Migration plan.**
1. Phase 0a: typescript devDep, tsconfig (allowJs, noEmit), hand-authored
   `types/globals.d.ts` (~30 core globals) + GameCtx transcribed from the G
   region; `npm run typecheck` in tooling-fast and ci.yml. Zero runtime
   change.
2. Phase 0b: rolling per-file `// @ts-check` in leaf modules — annotations
   only, never behavior; GameCtx starts catching real façade drift while
   still no-build.
3. Phase 1: `tools/build.mjs` in shadow mode (dist mirrors source, asserted);
   Playwright learns to build-then-serve dist/; full suite proves the serving
   seam.
4. Phase 2 (the one mechanical cutover, in a drained-parallel-sessions
   window): a codemod on the repo's existing espree/eslint-scope tooling
   converts js/** → src/** ESM; per-file IIFE output keeps index.html and
   load-order.test.mjs unchanged. Gate: full suite, bit-stable physics, and a
   scripted AST-equivalence diff. Docs and skills updated in the same commit.
5. Phase 3 (bundle flip): one hashed module entry + code-split chunks; real
   dynamic import for backends; generated precache/version.json; retire
   load-order, the DEFERRED machinery, and `?v=N`. Gate includes a real-phone
   PWA smoke.
6. Phase 4: TS by domain, leaf-first — data, mat4/log, track engine against
   new TrackDef/BuiltTrack/SceneryApi interfaces, the 40 circuit files,
   render (retire parity test), js/game/* against GameCtx, js/net/ with typed
   wire structs. `strict:false` repo-wide, per-file strict pragmas ratcheted.
7. Phase 5: game.js last — rename, then "pass 2" under type cover;
   characterization gates every commit touching game.ts.
8. Continuous: docs/skills pass; ARCHITECTURE-REVIEW gains a ledger of which
   guard was retired by which compiler feature.

**Risks.** Phase 2 is the largest single change in the repo's history — the
exact unsynchronized-bulk-change shape that caused the historical damage
(mitigated by scripting, AST-equivalence, gates, and a drained window; if the
gate fails the commit is dropped, not patched forward). Determinism drift from
esbuild transforms or a future minifier. Boot-timing semantics shift
(parse-time classic execution → deferred module graph) threatening the
self-init modules and the Log-loads-first guarantee. The compatibility surface
rotting into "two ways to reach everything" (compensated by an eslint rule
making src/ import-only). Sourcemapped debugging is honestly worse on
SwiftShader and phones. Agent-instruction lag across the dozens of skills/docs
encoding the no-build workflow. any-poisoning laundering the very drift the
migration exists to catch. Import cycles today's call-time indirection
tolerates. The Pages/PWA cutover against old installed service workers.

**Cost.** Roughly 25–35 agent-days over 4–6 weeks, front-loaded on safety
tooling: Phase 0 ~2 days, Phase 1 ~1, Phase 2 ~4–6, Phase 3 ~2–3, Phase 4
~12–18 (parallelizable by domain once tsc arbitrates cross-session
consistency), Phase 5 ongoing. CI +5–10 s per run. Payback: retires the
manifest/tag/HARD_EDGES bookkeeping, the entire cache-bump ritual, and the
façade-drift, backend-parity, and circuit-field-typo defect classes.

### Bedrock — the hardened IIFE plan (guards become the compiler)

**Thesis.** The IIFE+globals architecture is not the problem — unsynchronized
bulk change by parallel agents is, and every catalogued defect class
(hand-maintained load order, G-façade expandos like the netStartArm `countT`
bug, descriptor-copy zombie members, mirror-comment drift, the unguarded arc
invariant) is a missing observation, not a missing module system. Keep the
founding bet — uniquely valuable when the maintainers are agents debugging
live pages — and finish the repo's own governing law by converting every
remaining prose invariant into a generator or a guard. Three mechanisms do
the compiler's job without a compiler: (1) `tsc --checkJs` in script mode,
which natively type-checks cross-file global references across no-module
files — the IIFE architecture is accidentally the ONE architecture TypeScript
can check with zero migration; (2) a generated manifest whose HARD_EDGES are
derived by espree/eslint-scope (already devDeps) from actual eval-time
destructures; (3) G dissolved into six sealed, owned state objects with a
frozen surface snapshot. This beats ESM on payoff-per-risk (ESM is a class
change that invalidates the safety net's own foundations — the 8 GLX-patching
specs, the descriptor-copy identity contract, sw.js's tag-parsing precache,
verify-track's VM loader) and beats full TS because checkJs delivers ~80% of
the defect-catching at zero runtime diff, per-file incrementality, and full
reversibility. For a fan game maintained by parallel agents, migrations are
the risk surface; guards are the payoff surface. This plan is all guard, no
migration.

**Module system.** UNCHANGED at runtime: every file stays a `"use strict"`
IIFE assigning one global, script tags, zero runtime deps, GitHub Pages
static. What changes is that its invariants become machine-derived. (a)
`tools/gen-manifest.mjs` becomes the writer of manifest.cjs, the index.html
tag block, and sw.js's DEFERRED precache seed — inputs are per-file
`/* @global X @after Y(eval) */` headers plus an espree/eslint-scope scan
(`tools/check/scan-globals.mjs`) deriving HARD_EDGES from actual eval-time
destructures; call-time-but-pinned edges stay in a small hand-curated
CALL_EDGES list; the CIRCUITS calendar stays hand-owned product data; a drift
test asserts regeneration is a byte-identical no-op; gen-manifest never
touches `?v=N` — bump-cache stays the sole version writer. (b) A global
registry guard asserts every file assigns exactly its one declared global and
reads only declared globals — a linker for the globals architecture,
replacing the post-extraction "grep the removed symbols" ritual. (c)
`jsconfig.json` scoped to js/**, `tsc --noEmit --checkJs` in CI: script-mode
files share one global scope so cross-file surface checking works natively;
`types/globals.d.ts` covers un-annotated globals; files opt in with
`// @ts-check` under an adoption ratchet. TypeScript is a devDependency only.

**State design.** G's ~140 flat members dissolve into six sealed,
singly-owned state objects in game.js's closure, G retained as a thin
delegating façade so no consumer or spec breaks mid-flight: S.cam, S.tuning
(the mutable physics lets; immutables stay in PhysicsConsts), S.race,
S.world, S.garage, S.debug — each with a declared writer set. Mechanical
rules: (1) every S object is `Object.seal()`ed — the netStartArm `G.countT`
expando would have been a TypeError on day one; (2) state objects are dumb
data — any write with a side effect (PACE's GameCams re-init, aero-mode's
button repaint) becomes a named verb (`setPace()`, `setAeroMode()`), never a
property setter; (3) ownership is a checked table
(docs/STATE-OWNERSHIP.md + a scan-driven test failing non-owner writes); (4)
the G+S surface is a frozen snapshot test in the mould of the 107-member
scenery contract, so widening the façade is a deliberate, merge-conflict-loud
diff; (5) a flat-member-count ratchet shrinks G as consumers migrate.
render()/updateCar() bodies untouched; characterization gates every carve.

**Renderer seam.** Formalize the port as data while keeping descriptor-copy
as the compatibility contract. `js/render/port.js` (global GfxPort:
`{VERSION, MEMBERS[~40], OPTIONAL}`) moves the contract out of gfx.js's
header comment and the parity test's hardcoded roster. `Gfx.install(backend)`
absorbs the descriptor-copy from game.js — preserving the object-identity
contract the ~8 GLX-patching specs rely on — and MECHANIZES the zombie-member
fix: any MEMBERS name the backend omits is written as explicit `undefined` by
the installer, instead of each author remembering the idiom that bit twice.
The parity test rebases onto GfxPort.MEMBERS bidirectionally.
`types/gfx.d.ts` + `@implements` on GLX/TLX/WGX gives signature-level checks
the parity test structurally cannot do. Backends declare honest `caps` flags
reported by `__apex.info()`; known cross-backend shading divergences get a
tracking table keyed to GfxPort.VERSION — parity work, explicitly out of
scope, but now enumerated.

**Guards retired:** HARD_EDGES as a hand-maintained artifact (the assertion
survives, derived); the three-way DEFERRED/BACKEND_FILES/sw.js hand agreement
(collapses to one generation-drift check); the post-extraction grep ritual
(subsumed by the global registry); the TUNE_DEFS mirror-comment invariants;
backend-surface-parity's hand-listed roster; the per-backend explicit-
undefined AUTHOR discipline (mechanized in the installer); docs-integrity's
count-regex fragility for the test census.

**Guards kept:** physics-characterization (promoted to mandatory gate per
S-carve); load-order (now also "regeneration is a no-op");
scenery-api-contract (and the template for the new g-contract snapshot);
module-size; vstd-lint/invariant; graph-parity; backend-surface-parity
(rebased); the structural family (test-groups, docs-integrity,
deploy-staging, comment-citations, silent-catch); verify-track + TRACK_VM
(gains the vertex-budget gate); the pick-tests/test-bg discipline. New
guards: global-registry, g-contract snapshot, state-ownership, arc-lint +
arc-invariant (allowlisted `Tracks.curvature()` sites tagged
AI-only|assist-gated|broadcast-only|surface), ts-check ratchet, vertex
baseline (Vegas grandfathered at 1,825,925, ratchet-down), and a
net-authority spec pinning guest-role gating of EV.CAUTION/START/RESULT/QUALI.

**Migration plan.**
1. Land `tools/check/scan-globals.mjs` emitting a dep-graph artifact; add the
   global-registry test in baseline-ratchet mode. Pure tooling, green by
   construction.
2. Prove the scanner against reality: derived eval-edges ⊇ every current
   HARD_EDGES pair; split manifest edges into generated EVAL_EDGES +
   hand-curated CALL_EDGES.
3. Ship `tools/gen-manifest.mjs`; first run byte-identical to committed
   files; add the regeneration-no-op drift test.
4. jsconfig + `types/globals.d.ts` + typecheck in ci.yml; first `// @ts-check`
   tranche (small extracted leaves); adoption ratchet. No runtime bytes.
5. Renderer port: GfxPort + `Gfx.install()` with mechanized backfill; rebase
   the parity test; `@implements` on all three backends; gate on the ~8
   GLX-patching specs.
6. Freeze the façade: expando audit, then `Object.seal(G)` landed ALONE
   (instantly bisectable) + the g-contract snapshot.
7. Carve S.cam first (lowest coupling, no physics); G accessors delegate;
   consumers and specs untouched.
8. Carve S.tuning (side-effectful setters → named verbs; full
   characterization gate), then S.garage, S.race, S.world, S.debug as five
   further single-domain PRs; characterization re-runs for S.race/S.world.
9. Land STATE-OWNERSHIP.md + the ownership test; migrate consumers
   `G.camEye` → `S.cam.eye` module-by-module, ratcheting G down.
10. Promote the arc invariant: arc-lint's allowlist seeded from the
    PHYSICS.md legitimate-sources table; unlisted site fails.
11. Close the review's named guard gaps: vertex-budget gate, the
    net-authority fix landed WITH its pinning spec, `test:agent` on a
    scheduled CI job.
12. Expand `// @ts-check` in tranches; type the S objects and GfxPort;
    rewrite ARCHITECTURE.md's reorg section under docs-integrity.

**Risks.** Static-scan false negatives (`window['Name']`, string-built reads
— treat the scanner as evidence, never a pruner); tsc script-mode noise at
scale (one shared global scope; the error baseline must be a ratchet, not a
wall); `Object.seal(G)` breaking an unaudited expando writer (audit first;
seal lands alone); determinism regression from S carves (characterization per
carve; busy-box timeouts re-run solo before believed); parallel-agent skew
mid-migration (one domain per PR, worktrees, carve branches under a week);
gen-manifest rewriting index.html adjacent to the `?v=N` convention (byte-
identical-first-run requirement; the sw.js seed is the subtlest output);
`Gfx.install()` timing for the 8 patching specs, with TLX/WGX near-zero-
coverage paths shipping dark (add an opt-in-backend boot smoke); guard
fatigue — ~7 new guards on an ~11-guard family, each of which must fit the
~15 s tooling-fast budget and carry a vstd-style escape hatch.

**Cost.** Roughly 18–28 focused agent-days over 6–10 weeks of small,
independently-green PRs — no freeze window at any point. Scanner + registry +
edge derivation ~3 days; gen-manifest ~2–3; typecheck bootstrap ~2; renderer
port ~2–3; façade freeze ~1; six S-domain carves ~6–8 (dominated by
browser-group gate runs); ownership + consumer migration ~2; arc-lint/vertex/
net-authority/CI ~3–4; typing tranches ongoing at ~0.5 day each. Zero
runtime-payload cost (one ~1 KB port.js), zero new runtime dependencies, no
user-visible change at any step. Worst-case rollback at every single step is
`git revert` of one PR with the suite green on both sides.

---

## Judge scores

Five criteria, 1–10 each, per judge. J1 and J2 scored independently.

| Design | J1 safety | J1 no-build | J1 mig-risk | J1 determ | J1 payoff | J1 total | J2 safety | J2 no-build | J2 mig-risk | J2 determ | J2 payoff | J2 total | Combined |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Graphline (zero-build ESM) | 8 | 9 | 6 | 6 | 5 | **34** | 7 | 9 | 4 | 6 | 4 | **30** | 64 |
| Typed Apex (esbuild + TS) | 9 | 3 | 4 | 5 | 6 | **27** | 9 | 2 | 4 | 6 | 6 | **27** | 54 |
| Bedrock (hardened IIFE) | 7 | 10 | 9 | 9 | 9 | **44** | 7 | 10 | 9 | 9 | 8 | **43** | **87** |

**Judge 1 verdict:** "Bedrock wins decisively under the agent-operations lens
(44 vs Graphline 34 vs Typed Apex 27)." The question is not which design
produces the best architecture in the abstract but which best prevents
parallel agent sessions from drifting out of sync while the change is in
flight; Bedrock is the only design whose risk profile matches its own
diagnosis — all guard, no migration, every step a one-PR revert with the
safety net fully valid on both sides. Typed Apex ranks last despite the best
end-state tooling because its Phase 2 codemod plus freeze window IS the
historical failure shape; Graphline is the credible middle path and the right
template if the repo later wants real modules.

**Judge 2 verdict:** "Bedrock wins decisively for this repo, at this scale,
with these maintainers (43 vs 30 vs 27)." Two of the three designs propose —
with excellent engineering — more bulk change; Bedrock is the only plan whose
per-step blast radius matches a solo-owner fan game. Its end state is
admittedly weaker than a real compiler, but checkJs + scanner-derived edges +
sealed state captures roughly 80% of the defect classes for perhaps 20% of
the risk, and it is a strict no-regrets prefix of Graphline. Caveats accepted
with eyes open: the `?v=N` ritual and the no-edits-mid-run hazard survive
Bedrock — if either becomes the top source of agent damage, that is the
signal to take Graphline's S1–S2 next, not to jump to a bundler.

**Best idea per design (both judges converged):**

- **Graphline:** the S0 dependency-truth check — an espree tool deriving the
  REAL eval-time global graph and asserting the hand-maintained manifest
  order is a valid toposort BEFORE anything moves — plus the in-place
  `defer`/`type=module` tag-swap mechanism, the only credible zero-build path
  to real modules and the template if the repo ever goes ESM.
- **Typed Apex:** Phase 0 — author `interface GameCtx` (and RendererBackend/
  SceneryApi) as `.d.ts` transcriptions of the existing runtime contracts and
  check every `create(G)` under JSDoc `@ts-check` before any build step,
  rename, or runtime change exists; the cheapest possible cross-session
  synchronizer, adoptable today under any of the three plans. (J1 runner-up:
  serving a per-run build snapshot to Playwright to delete the mixed-build
  hazard.)
- **Bedrock:** sealed, singly-owned state objects with a frozen surface
  snapshot (expandos die as TypeErrors at the write site; façade widening
  becomes a loud merge conflict), and the mechanized explicit-`undefined`
  backfill inside a centralized `Gfx.install()` — a twice-failed author
  discipline converted into installer code that cannot be forgotten.

---

## Synthesis (the adopted plan)

The synthesis agent's output, verbatim (headings demoted to fit this
document):

### Final Recommendation: Harden the IIFE Architecture (Bedrock), with Typed Apex's interfaces and Graphline's dependency-truth scanner grafted in

#### 1. The winning direction and why

**Bedrock wins, and it is not close: 43 + 44 = 87 combined, vs Graphline 64 (30+34) and Typed Apex 54 (27+27).** Both judges converged independently on the same reasoning, which is the strongest signal in the exercise:

- **Migration risk is the dominant axis for this repo, and Bedrock is the only plan that scores 9/9 on it from both judges.** The constraint list says the historical damage came from unsynchronized bulk change by parallel agents. Typed Apex's Phase 2 is — by its own admission — "the largest single change in the repo's history" requiring a drained-sessions freeze window, a coordination primitive a population of parallel agents demonstrably cannot execute. Graphline avoids the big bang but replaces it with a 10–14 week mixed IIFE/ESM world where ~170 PRs contend over shared generated files (importmap block, tsc allowlist) — a *new* cross-session contention surface. Bedrock's worst-case rollback at every single step is `git revert` of one PR with the 111-spec suite green on both sides.
- **Determinism: 9/9 for Bedrock vs 6/6 and 6/5.** Bedrock never routes physics bytes through a transpiler and never reorders eval relative to today's tag order; only `let`s already published through G move, gated by `tests/specs/physics-characterization.spec.js` per carve.
- **The score gap where Bedrock loses — agentSafety (7 vs Typed Apex's 9) — is the one it can close by grafting.** Typed Apex's core insight is correct: the guards ARE a hand-rolled compiler, and a type error delivered inside the session that creates the drift is the synchronizer agents lack. Bedrock's own step 4 already gestures at this; the synthesis below adopts Typed Apex's interface-authoring verbatim, because **script-mode `tsc --checkJs` natively type-checks cross-file globals across no-module files** — the IIFE architecture is accidentally the one architecture TypeScript can check with zero migration. That captures ~80% of the compiler payoff at ~20% of the risk.
- **Bedrock is a no-regrets prefix of Graphline.** Its scanner is Graphline's S0; its typecheck is Graphline's tsc bootstrap. Nothing done here is thrown away if the repo later wants native ESM.

#### 2. The synthesized architecture

**Base: Bedrock — the IIFE+globals runtime is unchanged; every remaining prose invariant becomes a generator or a guard.** Three grafts from the runners-up, all named "best idea" by at least one judge:

1. **From Typed Apex (graft into Phase 1, done first and most precisely): authored `.d.ts` contracts.** `types/globals.d.ts` (~30 core globals), `interface GameCtx` transcribed from the G region at `js/game.js:2540–2772`, `interface RendererBackend` (~40 members from gfx.js's header), `interface SceneryApi` (the 107 members `tests/unit/scenery-api-contract.test.mjs` freezes). `tsc --noEmit --checkJs` in ci.yml; files opt in per-file with `// @ts-check`; an adoption ratchet test (same idiom as `tests/unit/module-size.test.mjs`) keeps coverage monotonic. This retires the façade-drift defect class (the dead `countT` accessor, dead duplicate `setLightTune` key) in the session that creates it.
2. **From Graphline (graft into Phase 0): the dependency-truth check.** `tools/check/scan-globals.mjs` (espree/eslint-scope — both already devDeps at package.json:60–61) derives the real eval-time global graph and **asserts `tools/manifest.cjs` order is a valid topological sort and derived edges ⊇ the 5 hand-recorded HARD_EDGES entries** before anything moves. Zero product edits; surfaces every undeclared edge; keeps the door open for Graphline's proven in-place `defer`/`type=module` tag-swap strangler later.
3. **Bedrock's own sharpest mechanisms, kept exactly as designed:** generated manifest with byte-identical-first-run bootstrap (three outputs: manifest.cjs, index.html tag block, sw.js precache seed); `Object.seal()`ed single-owner state objects (S.cam/S.tuning/S.race/S.world/S.garage/S.debug) with side effects as named verbs, never property setters; the `g-contract` snapshot making façade widening a loud merge conflict between parallel sessions; and mechanized explicit-`undefined` backfill inside a centralized `Gfx.install()`, preserving `gfx === GLX` identity for the ~8 monkey-patching specs.

Explicitly out of scope, eyes open: `render()`/`updateCar()` internals (determinism spec forbids it), the ?v=N bump ritual, and the no-edits-mid-test-run hazard. The last two are the acknowledged Graphline-only wins; see §4.

#### 3. Phased migration plan (every phase ends green; guard changes listed per phase)

All new guards must fit the ~15 s `test:tooling-fast` budget (all are static scans) and carry the vstd-lint-style in-place escape hatch — a guard agents `--force` around is worse than no guard.

**Phase 0 — Observe (no runtime bytes change, no cache bump).**
Land `tools/check/scan-globals.mjs` emitting `artifacts/dep-graph.json`; Graphline's toposort assertion against manifest order; `tests/global-registry.test.mjs` in baseline-ratchet mode (one declared global per file, no undeclared reads — replaces the "grep removed symbols" post-extraction ritual). Split manifest edges into derived EVAL_EDGES + hand-curated CALL_EDGES (net family, career→quali, with rationale comments).
*Guards added:* global-registry, toposort assertion. *Retired:* nothing. *Gate:* test:tooling-fast.

**Phase 1 — Types (Typed Apex graft; still zero runtime change).**
`jsconfig.json` (js/** only, vendor/ excluded), `types/globals.d.ts`, `GameCtx`, `RendererBackend`, `SceneryApi` authored as precise interfaces *before* any consumer opts in. First `// @ts-check` tranche: physics-consts, tables, light-store, racecontrol, aerozones, skidmarks. `npm run typecheck` in ci.yml + `tests/ts-check-ratchet.test.mjs`.
*Guards added:* typecheck job, ts-check ratchet. *Retired:* nothing yet — but façade-drift and "read a G member that doesn't exist" become compile errors for opted-in files. *Gate:* test:tooling-fast.

**Phase 2 — Generate the manifest.**
`tools/gen-manifest.mjs` consumes CIRCUITS (still hand-curated calendar data — it IS `Tracks.LIST`/picker order), per-file `@global` headers, and the scan; emits manifest.cjs FULL/DEFERRED, rewrites the marked index.html tag block, writes sw.js's optional precache seed. **First run must be byte-identical to committed files** (topo-sort seeded with current order). Regeneration-no-op drift test added. gen-manifest never touches ?v=N — bump-cache stays the sole version writer.
*Guards added:* regeneration drift test. *Retired:* **HARD_EDGES as a hand-maintained artifact; the three-way DEFERRED/BACKEND_FILES/sw.js hand agreement collapses to one drift check.** `tests/unit/load-order.test.mjs` survives, now asserting "did you run the generator." *Gate:* test:tooling-fast + pwa group (background, per test-bg discipline).

**Phase 3 — Renderer port.**
`js/render/port.js` (GfxPort: VERSION/MEMBERS/OPTIONAL/caps) + `Gfx.install()` absorbing descriptor-copy from game.js with mechanized explicit-undefined backfill; `@implements` on GLX/TLX/WGX against `RendererBackend`; `__apex.info()` reports caps, making WGX's frozen non-parity machine-readable.
*Guards changed:* `tests/unit/backend-surface-parity.test.mjs` rebased onto GfxPort.MEMBERS (its hardcoded roster retires; the file survives); the "explicit undefined" author discipline retires into installer code. *Gate:* pick-tests groups **plus all 8 GLX-patching specs** (webgl-probes, parts-mesh-cache, custom-team, lighting-ab, …) to prove the identity contract held. Bump ?v=N last.

**Phase 4 — Seal and carve state.**
Expando audit, then `Object.seal(G)` **landed alone** (instantly bisectable) + `tests/g-contract.test.mjs` snapshot. Then six single-domain PRs: S.cam first (lowest coupling), then S.tuning (side-effectful setters → named verbs `setPace()`/`setAeroMode()`; **full physics-characterization gate**), then S.garage, S.race, S.world, S.debug — characterization re-runs for S.race/S.world. `docs/STATE-OWNERSHIP.md` + `tests/state-ownership.test.mjs` (non-owner write fails CI). Consumers migrate G.camEye → S.cam.eye module-by-module; G's flat-member ratchet and the module-size ceiling go down together. A busy-box timeout is a measurement of the machine — re-run any red or green solo before believing it.
*Guards added:* g-contract, state-ownership, G flat-member ratchet. *Retired (gradually):* delegating G accessors; the silent-expando class dies at seal time. *Gate:* physics-characterization + pick-tests groups per carve; each carve branch lives under a week.

**Phase 5 — Close the review's named guard gaps.**
`tools/arc-lint.mjs` + `tests/arc-invariant.test.mjs` (allowlisted `Tracks.curvature()` sites tagged AI-only|assist-gated|broadcast-only|surface — promoting the PHYSICS.md table from prose to assertion); vertex-budget gate in verify-track (Vegas grandfathered, ratchet-down); the net-authority fix landed **with** its pinning spec in one PR; `test:agent` on a scheduled CI job.
*Guards added:* arc-invariant, vertex baseline, net-authority spec. *Retired:* the last "exactly the shape of thing that stops holding" prose invariants.

**Phase 6 — Continuous.** Expand `// @ts-check` in tranches (ratchet-enforced); type the S objects and GfxPort; rewrite ARCHITECTURE.md's reorg section (G = thin verb façade over six owned domains) under docs-integrity; TUNE_DEFS mirror-comments replaced by a checked mapping.

**Never retired, at any phase:** physics-characterization (the master gate), scenery-api-contract (until/unless SceneryApi typing of all 40 circuits fully subsumes it — keep both regardless, it's cheap), module-size, vstd-lint/invariant, graph-parity, docs-integrity, test-groups, deploy-staging, silent-catch, comment-citations, verify-track, and the pick-tests/test-bg operational discipline.

#### 4. When NOT to do this

Do not run this plan if the repo's observed pain shifts to the two frictions Bedrock deliberately leaves standing: if post-mortems start showing that most agent damage comes from **the ?v=N bump ritual** (missed bumps, mid-run bumps force-reloading test pages) or **the js/-edit-during-a-browser-run mixed-build hazard**, then the correct move is Graphline's S0–S2 (defer tags + generated import map + bridge) — for which Phases 0–1 here are a direct prefix — not more guards; a guard cannot delete a workflow hazard, only police it. Likewise, if the parallel-agent population grows to the point where test-time checking is chronically too late (drift merged before any suite runs) and the owner can genuinely tolerate a toolchain on the deploy path, Typed Apex's compile-on-keystroke regime becomes worth its freeze-window risk — but only executed via Graphline's incremental strangler, never via the Phase-2 codemod. And if the honest trajectory is maintenance-mode (a finished fan game with occasional track edits), stop after Phase 2: the scanner, the typed interfaces, and the generated manifest are the 80% payoff; sealing and carving G is only worth it while active extraction work continues. Finally, if any new guard cannot stay inside the ~15 s tooling-fast budget or starts getting `--force`'d, delete it — guard fatigue converts this plan's payoff surface into its failure mode.

---

## Status

Recorded 2026-08. Implementation is to be reconciled with the audit workflow's
FIX-NOW/RESTRUCTURE synthesis before any phase lands.

**Phase 0 landed 2026-08-13** (`679e85c9` + `a2bb2aac`, merged at `0f0c3b84`):
`tools/check/scan-globals.mjs` — a ~2.8 s scan of all 159 eagerly-loaded files — plus
`tests/unit/global-registry.test.mjs`, which pins every global's writer and
declares its consumers three ways. The evidence it produced is what makes the
later phases derivable rather than speculative: the manifest's FULL order **is**
a valid toposort over the 65 eval-time edges; `HARD_EDGES`' 62 pairs decompose
into 30 eval-time + 29 call-time + 3 underivable-or-stale, with one stale entry
in `DEFERRED_EDGES` too; `window[expr]` bracket access is **extinct** in `js/`;
and every undeclared read has an explanation (a future slot, an SDK injection,
or an inline global in the shell). One deviation from the plan, forced by
review: `TrackDefs` is registered **growable** — a location rule (`^js/circuits/`)
with no count cap — because a frozen count would fail on the next circuit added
while a rogue writer outside `js/circuits/` still fails.

**Phase 1, first half, landed 2026-08-13**: `types/game-ctx.d.ts` (the `GameCtx`
interface — all **210** members of `const G` at `js/game.js:2562-2812`, plus the
`GameModuleFactory` roster), `tools/check/check-gctx.mjs` and
`tests/unit/game-ctx-surface.test.mjs`. ~5 s, zero runtime bytes, no cache bump.
Two deviations from the plan as written, both forced by the constraints:

- **No `// @ts-check` tranche, and the modules are not compiled directly.**
  Binding a module's `create(G)` parameter to `GameCtx` needs a JSDoc line inside
  that file — a `js/` edit, which drags the `?v=N` ritual into a types-only
  change. Instead the tool resolves every `G` reference through eslint-scope
  (scope-accurate, so the minimap's 2D `ctx` cannot masquerade as the façade) and
  emits a generated shadow typed against the interface: 1,741 reference sites
  across 24 ctx modules, checked in one `tsc --noEmit`. A member that does not
  exist and a write to a getter-only member are both compile errors, reported at
  the real `js/` file:line. What it does NOT check is expression types *inside*
  the modules; the per-file `@ts-check` opt-in is still the second half.
- **TypeScript is not a devDependency**, so the tsc leg is skipped-with-a-notice
  when no `tsc` resolves, and the espree parity leg (`.d.ts` member set ==
  `const G` member set, `readonly` == getter-with-no-setter) is the
  unconditional gate that runs in CI today. Making the compile leg mandatory is
  one `npm i -D typescript` away and is a deliberate decision, not a side effect.

The façade came out **clean**: no undeclared write, no dead member, no readonly
violation across all 1,741 sites. `RendererBackend` and `SceneryApi` are not
authored yet — `SceneryApi` stays frozen by `scenery-api-contract.test.mjs`,
`RendererBackend` belongs with Phase 3's `GfxPort`.

**Phase 2 (`gen-manifest`) is the authorized next step**; the 2026-08-13 structure
re-decision panel re-affirmed Phase 2 as the gating item for the Q3 renames and
the Q6 `js/ui/` wave, which are sequenced explicitly behind it. Phase 2 should
split the scanner's single edge list into `EVAL_EDGES` and `CALL_EDGES` along
the classification Phase 0 already computes, and ship a `--check` mode that
fails on drift — byte-identical on its first run, regeneration a no-op, and the
generator never touching `?v=N`.
