# apex-lsp and tool usage by agents: measured 2026-11-20

Kind: measurement · Re-measure-by: 2026-12-20 (re-run Part 1 on 13 recent workers after the alwaysLoad change;
re-run `node tools/mcp/lsp-coverage.mjs` when TypeScript 7.1 stable ships).

Ask: Bryce, 2026-11-20 ~07:05Z: "my sessions haven't been using our lsp or tools as much as I think they should.
Launch a session to investigate session transcripts and also test and use the lsp a ton to find bugs, coverage
issues, so web research how to fix so it can be used to really be helpful for agents".

## 1. Usage: workers never call it

The sample is 13 recent worker sessions, children of the orchestrator, run between 11-19 09:00Z and 11-20 06:41Z. They made 658 tool calls. Seven sessions were read back to their start; the other six cover only their newest ~90 assistant events.

| Measure | Count |
|---|---|
| apex-lsp MCP calls / `lsp-mcp.mjs` shell calls | **0 / 0** |
| apex-tools calls | 0 |
| ToolSearch calls | 11, all for GitHub, Monitor or TaskStop; **0 for lsp** |
| Skill calls | 8, all `steward`; `code-nav` 0 |
| Subagent launches | 1 (`ci-red-triage`, which has no lsp tools) |
| Bash grep calls / Grep tool calls | 181 / 1 |
| Bash `sed -n` / `cat` / `head` reads / Read tool calls | 247 / 4 |
| Symbol-shaped greps / aimed at js/ (the LSP answers these) | 42 / ~19, in 8 sessions |
| Times the `lsp-hint.py` hook would fire on those 396 calls | 2 (it matched 3 of the 42 symbol greps) |

Examples the LSP answers directly:
- `grep -n 'penaltyWhy' js/game.js …`
- `grep -rn "openTrackDetail" js tests … | grep -v "^js/ui/select-screen.js:14"` (a hand-made "uses except the definition")
- `grep -n "^function setRoomy\|const setRoomy" js/core/store.js`
- six chained hunts for `mirrorMips\|TEXTURE_MAX_LEVEL`, `mipCap`, `function bootGlx\|bootGlx =`

**Why**, in order of weight:
1. **The tools are deferred.** Claude Code shows only the names of MCP tools until a ToolSearch `select:` loads them (https://code.claude.com/docs/en/mcp.md#scale-with-mcp-tool-search). Workers load only the tools their brief or `steward` names, and nothing names apex-lsp.
2. **Nothing a worker reads mentions it.** `tools/ci/worker-prompt.md`, skill `steward` and the orchestrator brief have 0 mentions. AGENTS.md has one clause.
3. **The rule that does mention it never loads.** `.claude/rules/js-nav.md` is `paths: js/**`, so it loads when a js/ file is opened with Read. Workers read through Bash (247 to 4).
4. **The hook misses the common shapes.** `lsp-hint.py` needs a capitalised head and a whole-pattern match, so an `a\|b` alternation (24 of 42) and a camelCase local in js/ get nothing.

No LSP error was seen in the transcripts, because there were no calls to fail.

## 2. Accuracy: stress test of the tool on deploy tip d35f2e29

`node tools/mcp/lsp-coverage.mjs` (new) measures three things against a ground truth that does not come from the checker:
- **refs**: same-file reference recall for every function-scoped binding in the 8 largest files (eslint-scope).
- **members**: whether a sample of 400 `x.y` reads resolves.
- **defs**: whether `lsp_definition Module.member` is right for every export of 40 IIFE modules.

| Measure | Before (HEAD tool) | After (this PR) |
|---|---|---|
| refs: raw tsc 7.0.2 missed / 60,188 same-file refs (10,232 bindings) | 0 | 0 (the tool's lexical union also misses 0) |
| members: sampled reads resolving | 127/400 | 130/400 |
| defs: `Module.member` definitions correct | 474/475 (30 ms mean) | 474/475 (35 ms mean) |
| member reads on the 54 null-initialised factory variables | **0/626** | **610/626** |

The one "wrong" defs row (`RetiredCard.shown`) is a harness strictness case: the answer is right, but it is tagged as a module-file fallback. Most members-sample misses are untyped parameters (`a`, `c`, `p`), which no tool can resolve.

Repro battery (each was answered wrong before):

| Query | Before | After |
|---|---|---|
| `callers LoopHealth.recover` | error "has no member recover" | 0 uses + `index.html:306` named as a text match outside js/ |
| `def ApexRoster.DEFERRED` (`self.X = …`) | error | `js/roster.js:8` |
| `def PhysicsConsts.FIXED_DT` (member added after the declaration) | error | `js/physics/consts.js:286` |
| `callers js/race/start-lights.js:47` (no column) | "0 uses" (queried the indent) | 1 use, `game.js:8632 tickBody`, via the `startLights` instance |
| `callers js/race/pit-lane.js:882` (`update`, factory local) | 0 uses | 2 uses in `updateCar` via `pits`; no `update` noise from index.html |
| `def pits.update` | error (head resolved to `js/data/api.js`) | `js/race/pit-lane.js:882` |
| `def js/agent/apex-cam.js:248:21` (`G.track` where G is an untyped parameter) | 0 definitions | `types/game-ctx.d.ts:371` through the façade |
| `diag` with other js/ files edited | HEAD subtraction skipped (every old error listed) | the edited siblings are put back to HEAD in the overlay, so the result is true "new since HEAD" |
| `diag` on a file using `TrackScenery` | TS2552 false positive | quiet: `(window.X = …)` counts as a global |

What changed, in `tools/mcp/`:
- The clean-room audit's fixes (`claude/cleanroom-1119-audit` a8ef8ca), merged three-way; that branch is an orphan, comment-stripped tree. They cover:
  - the lexical union on references
  - `self.`/`globalThis.` globals and members added later
  - the façade guard when `types/` is absent
  - factory-instance callers
  - the file:line re-query on factory locals
  - the outside-js note
  - `member-check.mjs` (APX1 call / APX2 read of a member nothing defines)
- New fixes from this stress test:
  - line-only positions snap to the declared name
  - the outside-js note applies to script globals only
  - a qualified-name fallback for `Head.member` positions the checker cannot type
  - a local-head error that says how to ask instead
  - the HEAD overlay for edited siblings in diag
  - APX rows deduped against TS2551
  - parenthesised window assignments count as globals

Also: `APEX_LSP_TSC` selects another `tsc` for A/B runs, and 3 new `lsp-eval` questions pin the fixes.

**TypeScript pin: not taken.** The audit pinned `7.1.0-dev.20261119.1` because 7.0.2 dropped the first reference before a declaration. On the clean-room tree (no `types/`) I reproduced it: 622 of 44,434 refs dropped with 7.0.2, 0 with the 7.1 nightly. On the deploy tree, 7.0.2 drops 0 of 60,188, and the ported lexical union covers the latent bug. So `^7.0.2` stays. Move to 7.1 stable when it ships (the 7.1 beta shipped 2026-10-20: https://devblogs.microsoft.com/typescript/announcing-typescript-7-1-beta/).

Annotations: 54 `let x = null` declarations whose only other writes are `x = Module.fn(…)` now carry
`/** @type {ReturnType<typeof Module.fn> | null} */`. That is comment-only, 43 lines in 24 files, and each changed line is byte-identical to HEAD once the comment is removed (checked by script). Why it is needed: in JavaScript a null initialiser types the variable `any`, and a later assignment narrows it only along control flow in the same function (https://www.typescriptlang.org/docs/handbook/type-checking-javascript-files.html, https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-1.html). TS 7 also requires `typeof` for a value in a JSDoc type (https://raw.githubusercontent.com/microsoft/typescript-go/main/CHANGES.md).

Known limit left: `GLX` gets its members at run time through `Object.defineProperties(this, …)`, which the checker cannot follow. A single `Object.defineProperty` on a literal key is followed; `defineProperties` is not (research probe).

## 3. Bugs the tool surfaced in js/

Sweep: `lsp_diagnostics all` over 616 files took 46 s and produced 404 rows. Most are WebGPU and XR globals missing from `lib` (GPUBufferUsage …, 242 rows) and stub-typed callbacks (TS2349 / TS2554). Real defects, filed:
- **#5964** (area:render): `js/fx/visor-optics.js:319` reads `typeof G`, but `G` is a function-scoped `const` inside game.js's IIFE (eslint-scope: function scope; game.js has 0 global variables). On a build without `__apex` the visor reads no scene. Triage #5901 had marked audit A27 STALE on the strength of this read.
- **#5965** (area:perf): the same mechanism turns off three branches of `RaceEntryProfile.stallHandoffCover` (`js/perf/race-entry-profile.js:263-273`: countdown, loading phases, soft-raster intro).

Not filed, low impact:
- `js/car/cockpit-rig.js:265` passes a 10th argument (`21`) that `_rigBar` ignores.
- `js/ui/experience.js:177` APX2 reads `.shot`, which the scene never defines; the clean-room audit found the fallback unreachable.

## 4. Fixes to steering (PR B)

| Lever | Change |
|---|---|
| Deferral | `"alwaysLoad": true` on `apex-lsp` in `.mcp.json` / `.cursor/mcp.json` (https://code.claude.com/docs/en/mcp.md#exempt-a-server-from-deferral). The cost is 8 tool schemas, ~2,670 tokens per turn (`tools/mcp/mcp-listing-cost.mjs --only=apex-lsp`). |
| Briefs | the worker prompt, skill `steward` and the orchestrator brief name the calls |
| Hook | `lsp-hint.py` splits alternations and treats camelCase names inside js/ searches as symbols: 7 of 7 survey examples now hint, and the old quiet cases stay quiet |
| AGENTS.md | the loop's edit step says to find symbols with apex-lsp, not grep |

## Research (cited by the 2026-11-20 lane; not all re-verified)

- JSDoc types supported in JS: https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html; per-file `// @ts-check`: https://www.typescriptlang.org/docs/handbook/intro-to-js-ts.html
- tsgo status ("nearly all" language-service features): https://github.com/microsoft/typescript-go. A probe of 7.0.2 shows `callHierarchyProvider` works on JS, a candidate for `lsp_callers`.
- Agents use LSP tools rarely on "where is X" tasks, and do better when results carry each reference's line text inline. Sources: Xu, arXiv 2608.13568 (https://arxiv.org/abs/2608.13568) and https://agentconnect.md/blog/grep-beat-lsp-harness/. Forcing LSP-first hurt success, which is why this lane names the tool instead of blocking grep. Both are reported by the research subagent; I did not re-read them.
- Project references: https://www.typescriptlang.org/docs/handbook/project-references.html. Not worth it for one global scope with no imports, because splitting would route references through declaration files.
