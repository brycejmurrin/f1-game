# Unit group 30 — complete source map

Read-only mapping of all 23 manifest files, 4,911 lines. No tests or browser runs were executed, and no runtime/test source was edited. Case meanings below describe assertions, not passing results.

## Read evidence

Each test was returned as separate contiguous source windows of at most 80 lines and below 10,000 characters (75 windows total); the initial oversized aggregate was discarded and every line re-read in these bounded returns. SHA-256 identifies the exact bytes read. Ranges are inclusive.

| File | SHA-256 | complete read windows |
|---|---|---|
| `tests/unit/lsp-config-freshness.test.mjs` | `abb12c87649d0959128fbcb84a2669455c692e0df88835520dbaafbd9e971548` | 1-80, 81-85 |
| `tests/unit/lsp-mcp-fixture.test.mjs` | `b3c141bb6931a390b6fe11b73799a5679e9421c5470174abb9f12f97daeaa703` | 1-80, 81-160, 161-225 |
| `tests/unit/lsp-mcp.test.mjs` | `4278d2c5fb7dbcd6a95a0251630f51585473bf47930fa5080bca49d6d9646525` | 1-80, 81-160, 161-240, 241-320, 321-324 |
| `tests/unit/lsp-navigation-efficiency.test.mjs` | `f039398eba538edcd8cd0fb45897ad6d41a672b8bad5c04b8eac218f52c6817d` | 1-80, 81-160, 161-240, 241-252 |
| `tests/unit/lsp-reference-fixes.test.mjs` | `7b861d2b596d7dfe93c8ca1f1f663be1cf246b85ddf2eb033ae4a1a1a7a8b6ed` | 1-80, 81-110 |
| `tests/unit/lsp-workflow-fixes.test.mjs` | `ce634bc8fa3f9be7b5fb344c69ce5d9d785b13e5dff8077198b1265da7f4e30f` | 1-80, 81-160, 161-184 |
| `tests/unit/marshal-panels.test.mjs` | `8d605d43285064a492667d8366942aa989b1b70a941e180e373562817675e53b` | 1-80, 81-160, 161-240, 241-296 |
| `tests/unit/marshal-post-grounding.test.mjs` | `fe6b5477ec8bc167cfe2c64ce9ee948b2505ded482224825f36c0b7bf68eb2e1` | 1-80, 81-100 |
| `tests/unit/mcp-cli.test.mjs` | `da1bebdfcc77d5d097fea19426b90798d095e4dbda29af0dcf036b3a1e417369` | 1-80, 81-160, 161-240, 241-269 |
| `tests/unit/mcp-http-origin.test.mjs` | `02ccadf00851ebe0d7e2840127c1d439ac3966f2187e00f9cadda95303d4bb25` | 1-80, 81-84 |
| `tests/unit/mcp-listing-cost.test.mjs` | `cbeb58ad7c36ce3518f5b5cde40582fb7b3b3eefc24c93d2cfaf3282065b17dd` | 1-72 |
| `tests/unit/mcp-smoke.test.mjs` | `dbd8977c66c62aabbbe11afeb30ee57925432c348120d6768495932e13a79f82` | 1-80, 81-160, 161-207 |
| `tests/unit/measure-pr-ci-after-close.test.mjs` | `ac3f69a9f4fa41d9941d6e811655f2d9883214055dc536be3ac3f3a7dee937b9` | 1-80, 81-86 |
| `tests/unit/mechanics-coherence.test.mjs` | `16beba693064d455e01f23fe20a63ad65032df11629ccac7dd97a47d80eade8b` | 1-80, 81-128 |
| `tests/unit/mechanics-drills-vm.test.mjs` | `0cd2f56f900f9065be56771527ace1755bbfc98b4e71b482aba0b319dbe17b85` | 1-80, 81-160, 161-196 |
| `tests/unit/mechanics-integration-vm.test.mjs` | `f9bfe00abb27f90ace27abaebf0f8b3b653f9e079781e6326d8fa2566be849da` | 1-80, 81-160, 161-240, 241-277 |
| `tests/unit/mechanics-race-vm.test.mjs` | `ddc950a0b1797680c5dee210fc34c4b51fa30052c9599babbad9280b43595fae` | 1-80, 81-160, 161-240, 241-264 |
| `tests/unit/meeting-picker-labels.test.mjs` | `96eaf71f3eb487dcec7ff764440e285af70fc2ab85b54b443ef18d4695c00ce9` | 1-68 |
| `tests/unit/mem-census-growth.test.mjs` | `6bc05947759d6763b9cfc74ef5b9fd370c0b0fd987b5ab83e8124919de1aa4b2` | 1-80, 81-160, 161-240, 241-320, 321-357 |
| `tests/unit/mem-cycles-lib.test.mjs` | `e0ca055bcee207b320287e7d091d6b8dc48390c7b37ccb168d99452626e6e102` | 1-63 |
| `tests/unit/memory-sync.test.mjs` | `ddc1920116e0e3e5ef88a7070669e98be5ac551c7ee15f917a454b5baf610db1` | 1-80, 81-160, 161-240, 241-320, 321-330 |
| `tests/unit/menu-a11y-audit.test.mjs` | `ca26e85116b61b7e7d811a265b53a303014a0b900da1a19a7fa1c1f42cc12dbe` | 1-80, 81-160, 161-240, 241-320, 321-400, 401-480, 481-560, 561-640, 641-720, 721-800, 801-801 |
| `tests/unit/menu-capture.test.mjs` | `6f3a7a37c2253e3c2536c2d19145676e2b5e4906b02367aa46c88b6bd6f48b30` | 1-80, 81-133 |

## Navigation and fixture boundaries

Read repository AGENTS.md and `.claude/skills/code-nav/SKILL.md`. Local LSP shell outlines resolved MarshalPanels.create, MenuNav exports, TopModal exports, Collide.create, SetupTune.axleGrip, Ghost context/record APIs, NetSnapshot.createInterp, DrivingCoach.create, SessionRecords.create, Duel bumps, FlyingStart.create, PlayerForces.create, SceneryStructures.create and DataHub. A guessed coach path was rejected; the actual module is `js/race/driving-coach.js`. Tool modules outside js/ were navigated by source declaration scans and bounded source reads.

Production source reads: `tools/mcp/lsp-mcp.mjs:399-428,628-691,949-1038`; `tools/lib/mem-census.mjs:124-183`; `tools/lib/presentation.mjs:59-148,149-179`; `tools/gfx/mem-cycles-lib.mjs:1-75`; `tools/ci/measure-pr-ci-after-close.mjs:34-123`; `.claude/hooks/memory-sync.sh:1-100,101-200,201-233`. Other target locations are LSP outline/declaration evidence or explicit test source-load/config/read relationships; they do not imply a full production-file read.

Shared fixtures: `tests/helpers/lsp-fixture.mjs` creates/writes isolated compiler projects; `git-fixture-env.mjs` scrubs inherited Git hook state; `agent-output-launch.mjs` normalizes config; `seed-log.mjs` supplies VM logging; `abs-src.mjs` labels loaded sources; `tools/lib/game-vm.cjs` boots game code with stub DOM/renderer/storage/timers; `mini-dom.mjs`, `css-rules.mjs`, and `css-source.mjs` provide menu contracts. These helper relationships are identified from imports and use in the fully read tests, not asserted as separate fully read helper audits.

Generated fixture paths such as src/a.js, src/owner.js, types/game-ctx.d.ts inside temporary roots, mock-mcp.mjs, /fixture/gated-runtime.js, /tmp/out and /somewhere/else.js are synthetic input/output examples. They are not live repository references. Inline Python/shell/JS servers and fake GPU/page/GLX objects are likewise test doubles.

## Cases

Shared/helper assertion spans (inclusive): lsp-config-freshness 28,71; lsp-mcp initialization 47; lsp-navigation-efficiency 32 and mocked RPC 153; lsp-reference-fixes 67; lsp-workflow-fixes 87; mcp-cli dryRun 116; memory-sync rig.run 39; mechanics-drills-vm armed 35; mechanics-race-vm handoverErrDeg 177,188; menu-a11y-audit stringConst 662. These supplement callback-local spans rather than claiming every case executes every helper.

`range` covers each test declaration; `assertionSpans` records explicit assertion calls in its callback (including callbacks passed onward), not a predicate dump. Common helper assertions and lifecycle/setup checks are noted per file. Parameterized declarations are expanded below with shared source spans.

### tests/unit/lsp-config-freshness.test.mjs

Fixture/limits: Temporary Git/config graph with synthetic src/ and package config; real compiler, no game.
Common assertion seam: helper queries require successful tool results where used; temporary projects are stopped and removed in finally. Real-tree MCP initialization also asserts the server identity.

| name | range | assertionSpans | target | meaning | limits |
|---|---|---|---|---|---|
| diagnostics reload changed config graphs and never subtract against changed config | 14-55 | 28,32,38,39,44,47,48,51 | tools/mcp/lsp-mcp.mjs:175-237,399-412,628-689 | Root include changes and extended JSONC configuration reload the persistent project; restoring either recovers baseline subtraction. | File boundary above applies. |
| package-based extends reload and disable an unprovable HEAD baseline | 57-85 | 71,75,76,79,81 | tools/mcp/lsp-mcp.mjs:175-237,399-412,628-689 | Package-resolved config reloads after moduleDetection changes, and its unverifiable HEAD baseline always disables subtraction. | File boundary above applies. |

### tests/unit/lsp-mcp-fixture.test.mjs

Fixture/limits: Synthetic lspFixture workspace and real compiler; fixture src/ and types/ paths are generated examples, never live game refs.
Common assertion seam: helper queries require successful tool results where used; temporary projects are stopped and removed in finally. Real-tree MCP initialization also asserts the server identity.

| name | range | assertionSpans | target | meaning | limits |
|---|---|---|---|---|---|
| fixture workspace: freshness, ambiguity, window globals, honest misses | 16-65 | 27,28,31,33,34,35,37-38,39,41,41,43,43,46,47,48,49,50,52,54,56,62,63 | tools/mcp/lsp-mcp.mjs:308-341,533-627,628-689,705-1037 | Code uses outrank comments/strings; ambiguous bare names remain plural, module-file fallback states uncertainty, missing heads/members fail, window members include destructures and aliases, and disk edits move references. | File boundary above applies. |
| fixture: guarded typeof / \|\| {} head aliases feed member refs | 69-105 | 95,97,98,99,100,101,102,103 | tools/mcp/lsp-mcp.mjs:308-341,533-627,628-689,705-1037 | Five accepted guarded whole-head forms contribute alias reads; mismatched or arbitrary conditional heads do not. | File boundary above applies. |
| fixture workspace: callers, outline, body, paging, concise, diagnostics new since HEAD | 107-150 | 117,118,119,122,124,127,129,132,136,141,142,143,145,148 | tools/mcp/lsp-mcp.mjs:308-341,533-627,628-689,705-1037 | Caller grouping counts uses and deduplicates line labels; concise paging, module export/internal outlines and bounded bodies agree; new typo/arity diagnostics hide only the HEAD error and do not leak overlays. | File boundary above applies. |
| fixture: exportsIn reads the module's own return, never a nested one or a // in a string | 152-168 | 160,161,162,165,165 | tools/mcp/lsp-mcp.mjs:308-341,533-627,628-689,705-1037 | Only the outer module return contributes exports, including arrow values; nested returns and comment-like URL text do not, and diagnostics reject outside/non-JS files. | File boundary above applies. |
| fixture: declaration freshness, owner boundaries, lexical aliases, dependency baseline and file lifecycle | 170-224 | 183,185,187,188,189,190,191,192,193,194,195,196,197,199,200,200,201,202,205,206,209,211,213,221,222 | tools/mcp/lsp-mcp.mjs:308-341,533-627,628-689,705-1037 | Declaration edits invalidate ambient lookup; lexical ownership excludes foreign/shadow members, freeze/assign exports resolve, changed or moved dependencies disable HEAD subtraction, and rename/delete/create operations refresh lookup. | File boundary above applies. |

### tests/unit/lsp-mcp.test.mjs

Fixture/limits: Mix of real-tree MCP/real compiler, source/config scans, and Python hook subprocesses; no browser or gameplay.
Common assertion seam: helper queries require successful tool results where used; temporary projects are stopped and removed in finally. Real-tree MCP initialization also asserts the server identity.

| name | range | assertionSpans | target | meaning | limits |
|---|---|---|---|---|---|
| jsconfig.json makes js/ one script project with checkJs off | 52-58 | 54,55,56,57 | jsconfig.json | Project config enables JS/noEmit with project-wide checking disabled and includes runtime sources. | File boundary above applies. |
| .mcp.json launches apex-lsp with the repo server | 60-64 | 62,63 | .mcp.json; tests/helpers/agent-output-launch.mjs nativeMcpConfig | Native agent config points to the repository LSP shell launcher. | File boundary above applies. |
| argument errors come back as tool errors before tsc starts | 66-74 | 67,72,72 | tools/mcp/lsp-mcp.mjs:76-140,248-282,705-775,1091-1310 | Tool inventory and invalid arguments fail before compiler preparation. | File boundary above applies. |
| MCP client: definition, references and symbols on the real tree | 76-128 | 79,96,97,98,101,104,105,107,108,110,113,114,116,121,122,124,127 | tools/mcp/lsp-mcp.mjs:76-140,248-282,705-775,1091-1310 | Real-tree stdio replies resolve cross-file declarations, numerous semantic refs with owner labels, symbols, facade types, labelled window fallback, aliased callers, case suggestions and position lookup. | File boundary above applies. |
| MCP client: pipeline isolation and freeze/assign exports | 133-156 | 144,145,147,148,153,154 | tools/mcp/lsp-mcp.mjs:76-140,248-282,705-775,1091-1310 | Queued diagnostics and invalid arguments preserve later replies; frozen exports and assigned shader fragments resolve. | File boundary above applies. |
| tsc --lsp starts on the first call, exits when idle, and restarts on demand | 158-171 | 161,163,166,168,169 | tools/mcp/lsp-mcp.mjs:76-140,248-282,705-775,1091-1310 | Compiler creation is lazy, idle shutdown clears readiness, and a subsequent query starts another PID. | File boundary above applies. |
| real tree: PhysicsConsts.VMAX refs include PC.VMAX behind guarded aliases | 177-188 | 181,185 | tools/mcp/lsp-mcp.mjs:76-140,248-282,705-775,1091-1310 | Guarded PC aliases expose VMAX consumers in player forces, brake cue and driving audio. | File boundary above applies. |
| classify tags a row by the identifier at the column | 190-214 | 192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213 | tools/mcp/lsp-mcp.mjs:76-140 | Column-sensitive classification distinguishes declarations, aliases, exports and uses; quoted/comment occurrences are masked. | File boundary above applies. |
| lsp-hint.py (PostToolUse) names the apex-lsp call after a symbol search, and stays quiet otherwise | 219-239 | 221,227,229,230,231,232,233,234,237,238 | .claude/hooks/lsp-hint.py; .claude/settings.json | Advisory executable hook is registered only after Grep/Bash, suggests concrete LSP calls for symbols, and stays silent on irrelevant/malformed input. | File boundary above applies. |
| lsp-eval: every pinned question answered correctly on the real tree | 241-245 | 244 | tools/mcp/lsp-eval.mjs run | Every pinned evaluation question reports its own success. | File boundary above applies. |
| codeMask carries comment, template and regex state across a file | 248-259 | 250,251,252,253,254,255,256,257,258 | tools/mcp/lsp-mcp.mjs:103-140 | File masking distinguishes regex quotes, interpolations, multiline templates, division and comments. | File boundary above applies. |
| process lifecycle: a failed start is not cached; stop() and a tsc crash both recover | 261-281 | 265,265,270,272,275,278,278,279 | tools/mcp/lsp-mcp.mjs:76-140,248-282,705-775,1091-1310 | Failed startup retries; explicit stop and crash recover; ambiguous create refuses guessing while TrackModel resolves from declarations. | File boundary above applies. |
| lsp-hint.py: builtins and lowercase heads stay quiet; option values are not patterns | 283-297 | 291,296 | .claude/hooks/lsp-hint.py | Builtin/lowercase/non-runtime searches stay quiet; valid grep/rg patterns and runtime scope trigger advice despite option values. | File boundary above applies. |
| advertised argument constraints and JSON-RPC envelopes fail before starting tsc | 299-324 | 312,313,317,319,320,321,322,323 | tools/mcp/lsp-mcp.mjs:1108-1291 | Schema type/range/shape checks reject invalid tool inputs; JSON-RPC distinguishes invalid requests/params, notifications, null IDs and unsupported protocol fallback. | File boundary above applies. |

### tests/unit/lsp-navigation-efficiency.test.mjs

Fixture/limits: Synthetic Ops/Panel project; some cases replace RPC/process methods. Counts/cache semantics are not latency benchmarks.
Common assertion seam: helper queries require successful tool results where used; temporary projects are stopped and removed in finally. Real-tree MCP initialization also asserts the server identity.

| name | range | assertionSpans | target | meaning | limits |
|---|---|---|---|---|---|
| navigation scopes retain aliases and filter before paging at directory boundaries | 37-67 | 42,43,44,45,47,49,50,51,52,53,54,56,57,59,60,62,64,65 | tools/mcp/lsp-mcp.mjs:56-73,414-427,440-522,628-689,1057-1075,1108-1272 | Directory/file scope uses path boundaries, filters before pagination, preserves alias-derived callers, and omits out-of-scope definition bodies. | File boundary above applies. |
| file summaries avoid unused enclosing-function formatting | 69-78 | 74,75,76 | tools/mcp/lsp-mcp.mjs:56-73,414-427,440-522,628-689,1057-1075,1108-1272 | Files-only summaries never invoke enclosing-function formatting. | File boundary above applies. |
| overlapping compiler and alias routes count each source use once | 80-94 | 89,90,91,92 | tools/mcp/lsp-mcp.mjs:56-73,414-427,440-522,628-689,1057-1075,1108-1272 | Duplicate compiler locations and alias routes count each use once, retaining two calls on one line. | File boundary above applies. |
| concise formats preserve definition bodies and module export identities | 96-108 | 99,100,103,104,106 | tools/mcp/lsp-mcp.mjs:56-73,414-427,440-522,628-689,1057-1075,1108-1272 | Concise navigation retains requested bodies, export identities and caller names while bounding output. | File boundary above applies. |
| cached lexical owners refresh after edits and keep same-named methods distinct | 110-124 | 115,119,120,121,122 | tools/mcp/lsp-mcp.mjs:56-73,414-427,440-522,628-689,1057-1075,1108-1272 | Disk edits refresh lexical owners and qualify two same-named methods by their objects. | File boundary above applies. |
| invalid scopes are rejected before starting a compiler | 126-135 | 131,132 | tools/mcp/lsp-mcp.mjs:56-73,414-427,440-522,628-689,1057-1075,1108-1272 | Traversal/absolute/glob/empty scopes fail without starting a compiler. | File boundary above applies. |
| CLI forwards a scoped file summary | 137-141 | 139,140 | tools/mcp/lsp-mcp.mjs CLI --path | Shell refs forwards --path into a physics-only file summary. | File boundary above applies. |
| navigation benchmark help and argument validation need no compiler | 143-147 | 145,146 | tools/mcp/lsp-navigation-bench.mjs argument parser | Benchmark help and invalid iteration arguments exit without compiler work. | File boundary above applies. |
| cold outlines coalesce by document and generation without serializing files | 149-179 | 154,161,165,166,172,175 | tools/mcp/lsp-mcp.mjs:414-427,1057-1073 | Concurrent cold rows share one outline RPC per document while independent documents proceed; warm reuse is stable and failed entries retry. | File boundary above applies. |
| old outline completions cannot replace edited or restarted generations | 181-211 | 196,208,209 | tools/mcp/lsp-mcp.mjs:282,414-427 | Late old-file success and old-generation rejection cannot overwrite/delete newer outline cache entries. | File boundary above applies. |
| diagnostic cleanup preserves failures and leaves a replacement server alone | 213-252 | 220,221,222,223,232,233,235,236,246,247,248,249 | tools/mcp/lsp-mcp.mjs:628-689 | Diagnostic errors retain primary cause, close local overlays even on cleanup failure, expose standalone cleanup failure and preserve replacement-generation state. | File boundary above applies. |

### tests/unit/lsp-reference-fixes.test.mjs

Fixture/limits: Synthetic lexical/window/CommonJS source and real compiler; source marker fixtures are not repository files.
Common assertion seam: helper queries require successful tool results where used; temporary projects are stopped and removed in finally. Real-tree MCP initialization also asserts the server identity.

| name | range | assertionSpans | target | meaning | limits |
|---|---|---|---|---|---|
| fallback references use lexical heads and include literal bracket members | 71-80 | 75,76,78,78,78 | tools/mcp/lsp-mcp.mjs:786-925,949-1037 | Fallback includes literal bracket, direct and supported guarded aliases while excluding parameter/local/window shadows; declaration exclusion works. | File boundary above applies. |
| fallback definitions retain overwrites and qualify spread order | 82-99 | 86,86,87,89,89,90,91,93,95,96,97 | tools/mcp/lsp-mcp.mjs:786-925,949-1037 | All assignment contributions remain visible, with load-order/spread overwrite caveats and lexical spread source ownership. | File boundary above applies. |
| CommonJS fallback follows only the exported owner binding | 101-110 | 105,105,105,106,108 | tools/mcp/lsp-mcp.mjs:786-925,949-1037 | CommonJS aliases follow the exported binding and its base declaration without including a shadow owner. | File boundary above applies. |

### tests/unit/lsp-workflow-fixes.test.mjs

Fixture/limits: Generated CommonJS and repeated-IIFE owners; real compiler, with AST-call instrumentation in cache case.
Common assertion seam: helper queries require successful tool results where used; temporary projects are stopped and removed in finally. Real-tree MCP initialization also asserts the server identity.

| name | range | assertionSpans | target | meaning | limits |
|---|---|---|---|---|---|
| CommonJS fallback keeps its owner identity and finds unshadowed browser-global consumers | 91-119 | 97,99,102,103,106,107,108,112,114 | tools/mcp/lsp-mcp.mjs:814-925,949-1037 | CommonJS fallback keeps owner identity across unbound global consumers, optional/bracket/destructured/whole aliases, file summaries and callers, excluding local/foreign owners. | File boundary above applies. |
| repeated script-global IIFEs expose every member declaration without inventing aliases | 121-148 | 126,127,128,129,130,131,134,135,136,138,141,143 | tools/mcp/lsp-mcp.mjs:814-925,949-1037 | Repeated global IIFEs return both member generations and their real consumers, with load-order caveats and no injected or same-member aliases. | File boundary above applies. |
| repeated-IIFE discovery parses only plausible owner files and caches each text revision | 150-168 | 157,158,159,160,162,163 | tools/mcp/lsp-mcp.mjs:814-925,949-1037 | Reinjection discovery parses only plausible owner files and reuses its text-revision cache; an ordinary global parses none. | File boundary above applies. |
| same-statement reinjections contribute each distinct member definition once | 170-184 | 176,178,179 | tools/mcp/lsp-mcp.mjs:814-925,949-1037 | Repeated declarators in one statement each contribute one distinct location alongside the two original owners. | File boundary above applies. |

### tests/unit/marshal-panels.test.mjs

Fixture/limits: VM road/G fixtures with Particles stub, except explicit real geometry/particle cases; no raster or physical GPU evidence.

| name | range | assertionSpans | target | meaning | limits |
|---|---|---|---|---|---|
| a local yellow lights only its sector's posts, waved; the sector follows the authored splits | 39-58 | 44,45,47,48,53,57 | js/race/marshal-panels.js:33; js/track/scenery/structures.js:5; js/fx/particles.js; js/game.js | Authored sector splits select three posts, panel height is correct, local yellow brightness waves, and unauthored splits use thirds. | File boundary above applies. |
| VSC and the safety car light every post steady yellow; a red flag waves red; green is dark | 60-76 | 66,67,71,72,75 | js/race/marshal-panels.js:33; js/track/scenery/structures.js:5; js/fx/particles.js; js/game.js | Full-course levels illuminate all posts steadily yellow, red illuminates red, and a clean initial green emits nothing. | File boundary above applies. |
| when a caution clears every post shows green for a few seconds, then goes dark | 78-94 | 88,89,93 | js/race/marshal-panels.js:33; js/track/scenery/structures.js:5; js/fx/particles.js; js/game.js | Clearing a caution illuminates every post green temporarily then returns to darkness. | File boundary above applies. |
| a red-flag restart: the green is armed on the clear but spent only in the race, not on the countdown grid | 96-113 | 103,107,111,112 | js/race/marshal-panels.js:33; js/track/scenery/structures.js:5; js/fx/particles.js; js/game.js | Countdown preserves an armed red-clear green period until racing resumes. | File boundary above applies. |
| quitting under a caution does not leave a green armed for the next race | 115-129 | 128 | js/race/marshal-panels.js:33; js/track/scenery/structures.js:5; js/fx/particles.js; js/game.js | Menu exit clears caution history so the next race starts dark. | File boundary above applies. |
| only the nearest posts to the eye light under a full-course caution, and nothing outside the race | 131-145 | 138,139,143,144 | js/race/marshal-panels.js:33; js/track/scenery/structures.js:5; js/fx/particles.js; js/game.js | Full caution caps rendering at the nearest sixteen posts, skips menu state, and tolerates no track. | File boundary above applies. |
| a marshal post carries a dark, still panel — no waving flag in a hash colour — and its glow lights that panel | 179-206 | 182,183,185,188,194,197,201,202,204 | js/race/marshal-panels.js:33; js/track/scenery/structures.js:5; js/fx/particles.js; js/game.js | Real post geometry emits no cloth flag or bright unlit colors, registers each board center, and its panel flare matches that point. | File boundary above applies. |
| game.js wires MarshalPanels after the gantry lamps | 208-212 | 210,211 | js/game.js MarshalPanels create/update order | Source wiring creates the panel module and updates it between start lights and particles. | File boundary above applies. |
| a steady caution is equally bright at 30, 60 and 144 Hz, uses no pool slot, and the cars' flares cannot starve it | 246-262 | 250,252,254,259,260 | js/race/marshal-panels.js:33; js/fx/particles.js flare/update/draw | Real particle quads have comparable brightness at 30/60/144 Hz, occupy no particle pool, and reserve all panels despite saturated brake flares on mobile/desktop. | File boundary above applies. |
| the pooled nearest-16 select lights the same posts in the same order as the stable sort it replaced | 266-296 | 288,294,295 | js/race/marshal-panels.js nearest selection/showing | Seeded integer-grid/tie trials match stable-sort nearest selection for full/local cautions, and showing reuses its result/color objects. | File boundary above applies. |

### tests/unit/marshal-post-grounding.test.mjs

Fixture/limits: Flat straight road and recorded instance operations for seven styles; AABB/local-Y support checks do not prove terrain-wide support or rendered look.

| name | range | assertionSpans | target | meaning | limits |
|---|---|---|---|---|---|
| marshalPost styles seat the roof on the wall and chain the pole to the hut | 62-100 | 65,68,73,74,79,83,86,98 | js/track/scenery/structures.js:5 | All seven recorded model styles contain a deeply sunk signal pole, supporting mass and seated roof; pole lateral bounds touch a hut or brace box. | File boundary above applies. |

### tests/unit/mcp-cli.test.mjs

Fixture/limits: Source scans, dry-run plans and stubbed/mock subprocesses; no actual browser/package download, GPU or external network.
dryRun() also requires zero CLI status before parsing plans.

| name | range | assertionSpans | target | meaning | limits |
|---|---|---|---|---|---|
| chrome-devtools-mcp.sh clone/build never prompts npx | 20-25 | 22,23,24 | tools/mcp/mcp-cli.mjs:81-174; tools/mcp/chrome-devtools-mcp.sh; tools/mcp/playwright-mcp.sh; tools/mcp/probe-mcp.py | Clone/build source passes --yes to npx compiler tools. | File boundary above applies. |
| chrome-devtools-mcp.sh help lists clone / verify / run | 27-36 | 32,33,34,35 | tools/mcp/mcp-cli.mjs:81-174; tools/mcp/chrome-devtools-mcp.sh; tools/mcp/playwright-mcp.sh; tools/mcp/probe-mcp.py | Shell help exposes clone, verify and run commands. | File boundary above applies. |
| mcp-cli.mjs drives chrome via chrome-devtools-mcp.sh, not a hard-coded pw path | 39-44 | 41,42,43 | tools/mcp/mcp-cli.mjs:81-174; tools/mcp/chrome-devtools-mcp.sh; tools/mcp/playwright-mcp.sh; tools/mcp/probe-mcp.py | CLI uses the Chrome wrapper instead of a hardcoded browser executable. | File boundary above applies. |
| Chrome MCP network fallback is pinned to the audited release | 46-50 | 48,49 | tools/mcp/mcp-cli.mjs:81-174; tools/mcp/chrome-devtools-mcp.sh; tools/mcp/playwright-mcp.sh; tools/mcp/probe-mcp.py | Chrome fallback package uses the audited exact version. | File boundary above applies. |
| Playwright MCP network fallback is pinned to the audited release | 53-68 | 55,60,61,62,64,65,66,67 | tools/mcp/mcp-cli.mjs:81-174; tools/mcp/chrome-devtools-mcp.sh; tools/mcp/playwright-mcp.sh; tools/mcp/probe-mcp.py | Playwright fallback uses exact pin, resolves discovered Chromium, avoids conflicting isolation/profile and public-port flags, and matches native config. | File boundary above applies. |
| browser MCP launches prefer cached exact pins while retaining cold-cache downloads and Chrome runtime gate | 70-110 | 95,97,98,99,100,103,105,106,107,108 | tools/mcp/mcp-cli.mjs:81-174; tools/mcp/chrome-devtools-mcp.sh; tools/mcp/playwright-mcp.sh; tools/mcp/probe-mcp.py | Stubbed shell launch argv prefers offline cache without requiring it, preserves device/CDP choices and passes resolved Chrome package through runtime gating. | File boundary above applies. |
| probe --backend sets the pick BEFORE reloading (order is the whole point) | 120-132 | 123,126,127,129,130-131 | tools/mcp/mcp-cli.mjs:81-174; tools/mcp/chrome-devtools-mcp.sh; tools/mcp/playwright-mcp.sh; tools/mcp/probe-mcp.py | Probe call plans set backend storage before reload and evaluation, honor wait duration, and use the root URL. | File boundary above applies. |
| gfx-probe --tlx-webgpu unpins TLX ForceGL and --lavapipe uses the Lavapipe ICD | 134-153 | 136,137,138,139,140,141-142,143-144,145-146,147-148,150,151-152 | tools/mcp/mcp-cli.mjs:81-174; tools/mcp/chrome-devtools-mcp.sh; tools/mcp/playwright-mcp.sh; tools/mcp/probe-mcp.py | Gfx source carries TLX GPU/Lavapipe options, awaits soft presentation and captures the visible overlay path. | File boundary above applies. |
| mcp-cli exits non-zero when an MCP tool returns isError | 155-190 | 185,186 | tools/mcp/mcp-cli.mjs:81-174; tools/mcp/chrome-devtools-mcp.sh; tools/mcp/playwright-mcp.sh; tools/mcp/probe-mcp.py | Inline stdio mock returning tool isError causes a nonzero CLI exit and preserves failure text. | File boundary above applies. |
| probe --backend three pins three to WebGL2 unless --tlx-webgpu / --tlx-auto | 192-210 | 196-197,198-199,200-201,202-203,204-205,208 | tools/mcp/mcp-cli.mjs:81-174; tools/mcp/chrome-devtools-mcp.sh; tools/mcp/playwright-mcp.sh; tools/mcp/probe-mcp.py | Three backend plans write ForceGL/auto latches correctly; other backend plans avoid TLX pins. | File boundary above applies. |
| probe --console appends the console dump; --eval carries the body | 212-217 | 214,215,216 | tools/mcp/mcp-cli.mjs:81-174; tools/mcp/chrome-devtools-mcp.sh; tools/mcp/playwright-mcp.sh; tools/mcp/probe-mcp.py | Probe plans append console listing after requested evaluation and retain evaluation body. | File boundary above applies. |
| probe rejects an unknown flag instead of silently probing the default | 219-223 | 221,222 | tools/mcp/mcp-cli.mjs:81-174; tools/mcp/chrome-devtools-mcp.sh; tools/mcp/playwright-mcp.sh; tools/mcp/probe-mcp.py | Unknown probe flags produce a nonzero exit with an explicit error. | File boundary above applies. |
| the Chrome wrapper passes the flags WebGPU and software WebGL need | 225-236 | 229,230,231,233,234,235 | tools/mcp/mcp-cli.mjs:81-174; tools/mcp/chrome-devtools-mcp.sh; tools/mcp/playwright-mcp.sh; tools/mcp/probe-mcp.py | Chrome wrapper consumes the shared WebGPU/software-WebGL argument module. | File boundary above applies. |
| probe retains oversized JSON exactly while compact and full calls preserve errors | 238-269 | 268,268 | tools/mcp/mcp-cli.mjs:81-174; tools/mcp/chrome-devtools-mcp.sh; tools/mcp/playwright-mcp.sh; tools/mcp/probe-mcp.py | Python bridge compact output retains full oversized Unicode/error JSON in private artifacts; full mode returns identical original JSON with failure exit. | File boundary above applies. |

### tests/unit/mcp-http-origin.test.mjs

Fixture/limits: Header fixtures and actual loopback HTTP in APEX_MCP_MOCK mode; handler tools are never spawned.

| name | range | assertionSpans | target | meaning | limits |
|---|---|---|---|---|---|
| httpRefusal: loopback Host, absent/loopback Origin and JSON pass; anything else is named | 34-49 | 36,37,38,39,40,41,42,44,47 | tools/mcp/apex-tools-mcp.mjs httpRefusal/cmdServeHttp | Header gate accepts loopback host/origin and JSON, naming Host, Origin or Content-Type for malformed/foreign values. | File boundary above applies. |
| serve-http: the probe's cross-origin request is 403, a local MCP client still gets 200 | 51-84 | 67,68,69,70,75,77,80 | tools/mcp/apex-tools-mcp.mjs httpRefusal/cmdServeHttp | Actual ephemeral loopback HTTP server rejects attack combinations with 403/no CORS/no handler data while local client and loopback-page catalog requests succeed in mock mode. | File boundary above applies. |

### tests/unit/mcp-listing-cost.test.mjs

Fixture/limits: Inline two-tool stdio server; budgets cover fixture schema overhead, not every possible upstream schema or model tokenization.

| name | range | assertionSpans | target | meaning | limits |
|---|---|---|---|---|---|
| sizeListing: chars, names-only cost and the largest entries | 25-35 | 28,29,30,31,32,33,34 | tools/mcp/mcp-listing-cost.mjs:25-97; tools/mcp/output-level-mcp.mjs | Listing meter counts descriptions, serialized schemas, deferred names, instructions, token estimate and largest entry. | File boundary above applies. |
| listServer runs initialize + tools/list and returns the instructions | 37-41 | 39,40 | tools/mcp/mcp-listing-cost.mjs:25-97; tools/mcp/output-level-mcp.mjs | Inline stdio server handshake/list retrieves both tools and upstream instructions. | File boundary above applies. |
| the output-level gateway adds a bounded amount per tool to tools/list | 43-61 | 52,53,55,58,59,60 | tools/mcp/mcp-listing-cost.mjs:25-97; tools/mcp/output-level-mcp.mjs | Gateway tool metadata stays within plain/typed budgets, centralizes level prose in output_read, and appends advice after upstream instructions. | File boundary above applies. |
| a server with no instructions of its own gets its preface, then the gateway hint | 63-72 | 68,69,71 | tools/mcp/mcp-listing-cost.mjs:25-97; tools/mcp/output-level-mcp.mjs | Servers without instructions get only their registered short preface plus gateway advice; unknown servers invent no preface. | File boundary above applies. |

### tests/unit/mcp-smoke.test.mjs

Fixture/limits: Plans/source scans and mock CLI except locations/profile-query synthetic real tree calls; no real browser/tool fleet availability proof.

| name | range | assertionSpans | target | meaning | limits |
|---|---|---|---|---|---|
| bootstrap preserves machine-readable smoke evidence separately from console output | 14-32 | 27,28 | tools/mcp/mcp-smoke.mjs:37-314; tools/env/ensure-mcp-ready.sh; tools/env/cloud-agent-install.sh; tools/mcp/apex-tools-mcp.sh | Extracted bootstrap shell function leaves the machine-readable smoke JSON valid despite console output. | File boundary above applies. |
| mcp-smoke --dry-run pokes the two attached shell wrappers and never launches Chromium | 43-67 | 48,50,51,54,58,61,62,63,64,65,66 | tools/mcp/mcp-smoke.mjs:37-314; tools/env/ensure-mcp-ready.sh; tools/env/cloud-agent-install.sh; tools/mcp/apex-tools-mcp.sh | Dry-run catalogs expected shell probes and excludes removed attachments, browser launches and heavy verification; no steps execute. | File boundary above applies. |
| smokePlan chrome (and any CLI-only wrapper it still pokes) stays status/help | 69-85 | 72,73,74,77,78,82,83 | tools/mcp/mcp-smoke.mjs:37-314; tools/env/ensure-mcp-ready.sh; tools/env/cloud-agent-install.sh; tools/mcp/apex-tools-mcp.sh | Wrapper plans use Chrome/Playwright status and optional TinyFish help rather than launch/setup. | File boundary above applies. |
| apex-tools-mcp.sh smoke --dry-run delegates | 87-97 | 93,95,96 | tools/mcp/mcp-smoke.mjs:37-314; tools/env/ensure-mcp-ready.sh; tools/env/cloud-agent-install.sh; tools/mcp/apex-tools-mcp.sh | Shell smoke subcommand delegates the dry-run plan. | File boundary above applies. |
| help names the never-wrap and the write path | 99-105 | 101,102,103,104 | tools/mcp/mcp-smoke.mjs:37-314; tools/env/ensure-mcp-ready.sh; tools/env/cloud-agent-install.sh; tools/mcp/apex-tools-mcp.sh | Help states excluded heavy wrapper and evidence file paths. | File boundary above applies. |
| cloud-agent-install notes TinyFish key and chrome-devtools clone | 107-117 | 109,110,111,112,113,114,115,116 | tools/mcp/mcp-smoke.mjs:37-314; tools/env/ensure-mcp-ready.sh; tools/env/cloud-agent-install.sh; tools/mcp/apex-tools-mcp.sh | Installer documents TinyFish key acquisition, clone/setup operations and skip control without embedded keys. | File boundary above applies. |
| mcp-smoke names the TinyFish home URL when the key is missing and never reports a fallback | 119-132 | 120,122,126,127,129,130 | tools/mcp/mcp-smoke.mjs:37-314; tools/env/ensure-mcp-ready.sh; tools/env/cloud-agent-install.sh; tools/mcp/apex-tools-mcp.sh | Missing shell key resolves only from env-file or missing, with acquisition URL/warning where necessary. | File boundary above applies. |
| tracked source never embeds a TinyFish key | 134-138 | 136,137 | tools/mcp/mcp-smoke.mjs:37-314; tools/env/ensure-mcp-ready.sh; tools/env/cloud-agent-install.sh; tools/mcp/apex-tools-mcp.sh | Smoke source reads the environment variable and embeds no key prefix. | File boundary above applies. |
| smoke --real: tree tools only, judged on ok + a result, exit 0 in mock mode | 140-163 | 146,147,148,149,150,151,152,153,154,155,156,158,159,160,161,162 | tools/mcp/mcp-smoke.mjs:37-314; tools/env/ensure-mcp-ready.sh; tools/env/cloud-agent-install.sh; tools/mcp/apex-tools-mcp.sh | Tree-only selection excludes browser/mutating tools; judgment requires successful process and meaningful result; mock CLI reports exactly three passes. | File boundary above applies. |
| smoke --real --browser adds the browser checks, opt-in, and judges them the same way | 167-177 | 169,171,173,174,175,176 | tools/mcp/mcp-smoke.mjs:37-314; tools/env/ensure-mcp-ready.sh; tools/env/cloud-agent-install.sh; tools/mcp/apex-tools-mcp.sh | Browser checks are opt-in, preserve defined order and share the tree verdict in mock mode. | File boundary above applies. |
| real smoke supplies fresh-checkout inputs for locations and profile query, then removes its synthetic fixture | 179-188 | 183,184,185,186,187 | tools/mcp/mcp-smoke.mjs:37-314; tools/env/ensure-mcp-ready.sh; tools/env/cloud-agent-install.sh; tools/mcp/apex-tools-mcp.sh | Real locations/profile-query smoke prepares valid synthetic inputs and cleans its temporary profile fixtures. | File boundary above applies. |
| misspelled, empty, unsupported and mixed selections fail before running any tool | 190-198 | 193,194,195,196 | tools/mcp/mcp-smoke.mjs:37-314; tools/env/ensure-mcp-ready.sh; tools/env/cloud-agent-install.sh; tools/mcp/apex-tools-mcp.sh | Unknown/empty/mixed/unsupported selections exit 2 before any pass is printed. | File boundary above applies. |
| invalid smoke timeouts are errors instead of silently restoring defaults | 200-207 | 203,204,205 | tools/mcp/mcp-smoke.mjs:37-314; tools/env/ensure-mcp-ready.sh; tools/env/cloud-agent-install.sh; tools/mcp/apex-tools-mcp.sh | Invalid timeout values exit 2 with empty stdout rather than restoring defaults. | File boundary above applies. |

### tests/unit/measure-pr-ci-after-close.test.mjs

Fixture/limits: Pure supplied run/PR/job maps; no GitHub collection/pagination, billing or current CI measurement.

| name | range | assertionSpans | target | meaning | limits |
|---|---|---|---|---|---|
| minutesBetween and median | 6-9 | 7,8 | tools/ci/measure-pr-ci-after-close.mjs:17-92; tools/ci/github-api.mjs CI_PATH/DEPLOY | Timestamp delta returns ninety minutes and odd median returns the center. | File boundary above applies. |
| analyzePrCi counts job-minutes that start after the PR closed | 11-27 | 23,24,25,26 | tools/ci/measure-pr-ci-after-close.mjs:17-92; tools/ci/github-api.mjs CI_PATH/DEPLOY | Only jobs starting after closure count toward post-close cost, giving half of a two-job fixture's twenty minutes. | File boundary above applies. |
| analyzePrCi peak-hour median wall minutes | 29-40 | 38,39 | tools/ci/measure-pr-ci-after-close.mjs:17-92; tools/ci/github-api.mjs CI_PATH/DEPLOY | Most populated UTC start-hour wins and its wall median excludes the off-hour run. | File boundary above applies. |
| analyzePrCi: a lone qualifying run is the peak (control for the filter cases) | 51-55 | 53,54 | tools/ci/measure-pr-ci-after-close.mjs:17-92; tools/ci/github-api.mjs CI_PATH/DEPLOY | One qualifying twelve-minute run establishes hour fifteen as a positive filter control. | File boundary above applies. |
| analyzePrCi: a cancelled run adds no wall sample | 58-62 | 60,61 | tools/ci/measure-pr-ci-after-close.mjs:17-92; tools/ci/github-api.mjs CI_PATH/DEPLOY | Each cancelled/skipped/stale conclusion contributes no wall sample. | File boundary above applies. |
| analyzePrCi: a skipped run adds no wall sample | 58-62 | 60,61 | tools/ci/measure-pr-ci-after-close.mjs:17-92; tools/ci/github-api.mjs CI_PATH/DEPLOY | Each cancelled/skipped/stale conclusion contributes no wall sample. | File boundary above applies. |
| analyzePrCi: a stale run adds no wall sample | 58-62 | 60,61 | tools/ci/measure-pr-ci-after-close.mjs:17-92; tools/ci/github-api.mjs CI_PATH/DEPLOY | Each cancelled/skipped/stale conclusion contributes no wall sample. | File boundary above applies. |
| analyzePrCi: an unfinished run (no conclusion) adds no wall sample | 65-67 | 66 | tools/ci/measure-pr-ci-after-close.mjs:17-92; tools/ci/github-api.mjs CI_PATH/DEPLOY | In-progress run without conclusion contributes no wall sample. | File boundary above applies. |
| analyzePrCi: a run under 3 minutes of wall time is excluded; exactly 3 counts | 69-72 | 70,71 | tools/ci/measure-pr-ci-after-close.mjs:17-92; tools/ci/github-api.mjs CI_PATH/DEPLOY | Wall duration just under three minutes is excluded while exactly three counts. | File boundary above applies. |
| analyzePrCi: a PR whose base is not the deploy branch is skipped, jobs included | 74-81 | 78,79,80 | tools/ci/measure-pr-ci-after-close.mjs:17-92; tools/ci/github-api.mjs CI_PATH/DEPLOY | Other-base and unknown PRs contribute neither job cost nor peak-hour samples. | File boundary above applies. |
| analyzePrCi: non-CI workflows and non-pull_request events are skipped | 83-86 | 84,85 | tools/ci/measure-pr-ci-after-close.mjs:17-92; tools/ci/github-api.mjs CI_PATH/DEPLOY | Other workflows and push events contribute no peak sample. | File boundary above applies. |

### tests/unit/mechanics-coherence.test.mjs

Fixture/limits: Real selected modules in VM with synthetic cars/storage/net timestamps and stub world; bounded fixtures do not establish full driving behavior.

| name | range | assertionSpans | target | meaning | limits |
|---|---|---|---|---|---|
| the actual collision candidate accepts two rotated humans across the lap seam | 18-31 | 28,29 | js/physics/collide.js:281 pairContact; js/physics/contact-geometry.js | Real collision candidate accepts rotated human support near and across the lap seam but rejects large lateral separation. | File boundary above applies. |
| AI corner planning solves the same speed-dependent envelope as steering | 33-41 | 38,39 | js/physics/ai-drive.js cornerSpeed/lateralScale | Corner targets satisfy the steering lateral envelope across pace/grip/curvature samples and decrease with grip. | File boundary above applies. |
| roll stiffness shifts grip between axles while works settings stay identical | 43-50 | 45,46,48,49 | js/garage/setup-tune.js:101 axleGrip | Neutral/straight roll bias preserves axle grip; opposite biases transfer grip in opposite bounded directions. | File boundary above applies. |
| ghost classes isolate records, retain legacy laps and survive immediate switching | 52-63 | 56,58,59,60,61,62 | js/car/ghost.js:192-218,234-321 | Canonical context keys ignore property order, physics classes isolate laps, and legacy/default records survive immediate switching. | File boundary above applies. |
| network strategic state clamps telemetry and never changes car pose | 65-74 | 70,71,71,71,71,73,73 | js/net/netplay.js strategyState/applyStrategy | Strategy packet clamps tyre wear, applies tyre data without changing pose/speed, and rejects mismatched physics atomically. | File boundary above applies. |
| adaptive interpolation reacts to arrival jitter, stays bounded, and preserves prediction | 76-87 | 83,84,85,86 | js/net/snapshot.js:192 createInterp | Arrival jitter grows bounded adaptive delay while fixed delay and predicted progress remain unchanged; clear resets delay. | File boundary above applies. |
| adaptive presentation cannot rewind when a burst grows the delay | 90-99 | 96,98 | js/net/snapshot.js:192 createInterp sample/predict | A burst that grows display delay cannot move sampled progress backward; prediction does not advance display time. | File boundary above applies. |
| every difficulty carries both dimensions, the ladder is monotonic, and no AI out-drags the player | 101-128 | 108,109,110,114,115,118,120,126,127 | js/physics/consts.js DIFF/BAND_CEIL; js/data/teams.js TIER_V | Difficulty dimensions are positive and monotonic, mistake rate decreases to hard baseline, and top-team/banding scales remain below player pace. | File boundary above applies. |

### tests/unit/mechanics-drills-vm.test.mjs

Fixture/limits: createGame real runtime/geometry with inert DOM/render services; default Albert Park, separate Monza boots for tip/report cases. Physics stepped explicitly, no rendered frame clock.
Helper armed() asserts startDrill succeeds before braking/slalom cases; drive() explicitly steps input.

| name | range | assertionSpans | target | meaning | limits |
|---|---|---|---|---|---|
| driving trace reads actual brake demand and feedback remains observational | 19-28 | 23,23,26,27 | js/race/driving-coach.js:50; js/race/race-insights.js; js/car/ghost.js:234-370; js/agent/apex.js; js/game.js | Actual braking populates coach trace; advisory evaluation returns brake-release advice without mutating the car. | File boundary above applies. |
| braking drill: a tap and a coast fails with its reason; a held brake passes and scores the stopping distance | 37-51 | 41,41,41,42,46,48,49,50 | js/race/driving-coach.js:50; js/race/race-insights.js; js/car/ghost.js:234-370; js/agent/apex.js; js/game.js | Coasting after a brake tap fails explicitly without mastery; held brake succeeds near physics stopping distance and writes mastery/journal. | File boundary above applies. |
| slalom drill: a pad-sized steer the stick threshold never saw completes on the car's real direction changes | 53-61 | 57,59,60 | js/race/driving-coach.js:50; js/race/race-insights.js; js/car/ghost.js:234-370; js/agent/apex.js; js/game.js | Small shaped steering below the former input gate still completes a clean slalom from actual direction changes. | File boundary above applies. |
| the braking-into-turn tip fires from a full dry-track brake, which the friction-circle gate never reached | 63-90 | 73,81,81,82,83,84,87 | js/race/driving-coach.js:50; js/race/race-insights.js; js/car/ghost.js:234-370; js/agent/apex.js; js/game.js | Dry braking while turning fires the trail tip from real brake use despite lower friction-circle fraction, on tarmac with announcement text. | File boundary above applies. |
| a tip is filed under the curated turn it happened at, on real circuit geometry | 92-122 | 105,111,117,117,118,119,120 | js/race/driving-coach.js:50; js/race/race-insights.js; js/car/ghost.js:234-370; js/agent/apex.js; js/game.js | Real Monza curated apex fractions align with independent curvature peaks and a coasting approach files one tip under Turn 4. | File boundary above applies. |
| launch drill: a standing start is timed from the first throttle to half of top speed | 124-135 | 127,131,132,133,134 | js/race/driving-coach.js:50; js/race/race-insights.js; js/car/ghost.js:234-370; js/agent/apex.js; js/game.js | Stationary waiting is excluded from launch timing; acceleration to half top speed yields a clean bounded formatted score. | File boundary above applies. |
| corner drill: a pure-pursuit test driver through Curva Grande completes with minimum and exit speeds | 137-151 | 144,147,148,149,150 | js/race/driving-coach.js:50; js/race/race-insights.js; js/car/ghost.js:234-370; js/agent/apex.js; js/game.js | A test-side centerline pursuit completes a clean corner drill with min/exit speeds and mastery entry on Albert Park. | File boundary above applies. |
| the recover key restores the practice checkpoint instead of rescuing the car | 153-162 | 155,156,159,160,161 | js/race/driving-coach.js:50; js/race/race-insights.js; js/car/ghost.js:234-370; js/agent/apex.js; js/game.js | Synthetic recover key restores the marked checkpoint, activates practice and journals an unscored session. | File boundary above applies. |
| the lap report runs on a real circuit's turns and a real recorded ghost | 164-196 | 176,189,190,191,192,194 | js/race/driving-coach.js:50; js/race/race-insights.js; js/car/ghost.js:234-370; js/agent/apex.js; js/game.js | Real recorded constant-speed ghost and scripted lap with loss only in Turn 4 produce one report segment per curated turn and isolate about 1.5 seconds loss. | File boundary above applies. |

### tests/unit/mechanics-integration-vm.test.mjs

Fixture/limits: Shared Monza createGame VM, explicit session resets and targeted state pokes; inert DOM/renderer and explicit stepping do not establish visual/browser behavior.

| name | range | assertionSpans | target | meaning | limits |
|---|---|---|---|---|---|
| a time trial binds records after the fitted car is ready and segregates changed physics | 14-33 | 17,20,20,25-26,29,30,30,32 | js/race/session-records.js:5; js/car/ghost.js; js/game.js announce | Ready-car record fingerprint matches current physics; one lap combines medal/record announcement; changed wheelbase invalidates class and restoring it recovers ghost best. | File boundary above applies. |
| weather grip is continuous through the old discrete transition boundaries | 35-54 | 42,46-47,49,49,50,51,52,53,53 | js/game.js weatherArc/frame/gripMult; js/race/session-records.js:5 | Scheduled wetness keeps event identity, aligns frame and physical wetness, changes grip continuously/monotonically and clears on explicit dry pin. | File boundary above applies. |
| A3: settled frame.wetness matches trackWetness for dry/wet/rain pins | 56-67 | 61,62,63-64 | js/game.js weather/frame.trackWetness | Dry/wet/rain pins settle to matching frame/track wetness values. | File boundary above applies. |
| a race can be armed for practice, which unlocks checkpoints and spoils the session | 69-83 | 72,73,74,75,76,77,78,81,82 | js/race/session-records.js:5; js/race/driving-coach.js:50; js/race/duel.js:41,95-134; js/race/daily-challenge.js; js/game.js; js/agent/apex.js | Scored race initially refuses checkpoint/rewind, can arm practice once and then invalidates records while enabling checkpoint. | File boundary above applies. |
| the START drill can be set where it says to: on the grid, before the lights | 85-94 | 88,89,90,91,92,93 | js/race/session-records.js:5; js/race/driving-coach.js:50; js/race/duel.js:41,95-134; js/race/daily-challenge.js; js/game.js; js/agent/apex.js | Practice and start drill/checkpoint can be armed during the grid countdown. | File boundary above applies. |
| rewind steps the player back about ten seconds, and never rewinds a penalty | 96-118 | 99,102,104,105,106,107,108,109,110,117 | js/race/session-records.js:5; js/race/driving-coach.js:50; js/race/duel.js:41,95-134; js/race/daily-challenge.js; js/game.js; js/agent/apex.js | Buffered rewind restores earlier position, preserves player penalty/cut consequences, invalidates lap, spends buffer and does not fail drill merely for the jump. | File boundary above applies. |
| rewind never hands the player's wheel back to the AI (flying-start hand-over role flags) | 120-129 | 126,127,128 | js/race/session-records.js:5; js/race/driving-coach.js:50; js/race/duel.js:41,95-134; js/race/daily-challenge.js; js/game.js; js/agent/apex.js | Restoring an AI-run-up sample cannot demote current player's human/isPlayer role. | File boundary above applies. |
| rewinding a race with other cars puts the WHOLE race back, not just the player | 131-155 | 134,136,138,141,142,145,147,148,149,152,153 | js/race/session-records.js:5; js/race/driving-coach.js:50; js/race/duel.js:41,95-134; js/race/daily-challenge.js; js/game.js; js/agent/apex.js | Practice rewind restores rival pose and race clock alongside player while preserving only player's later penalty. | File boundary above applies. |
| aiPlace clears the teleport accumulators, exactly as jump() does | 157-172 | 166,167,168,168,169,169,169,170,171 | js/race/session-records.js:5; js/race/driving-coach.js:50; js/race/duel.js:41,95-134; js/race/daily-challenge.js; js/game.js; js/agent/apex.js | AI placement clears rescue/wall/wrong-way/offtrack state and aligns previous pose anchors. | File boundary above applies. |
| the duel rival is not bumped on the axis that makes it concede | 174-186 | 181,182,184-185 | js/race/duel.js:41; js/data/driver-ratings.js | Duel bump raises racecraft without raising caution-like awareness and thus does not make the rival concede sooner. | File boundary above applies. |
| a duel trims the grid to the player and one bumped rival | 188-226 | 191,193,194,195,197,198,199,205,209-210,211,215,220,221,222,225 | js/race/duel.js:41,95-134; js/game.js field/session setup | Duel builds exactly one real bumped rival with normalized/racecraft-dominant skill lift, proves it drives, and restores full grid when disabled. | File boundary above applies. |
| a DUEL setting does not trim a season round to two cars (ed11e6108) | 228-250 | 239,243,244,244,245,246 | js/game.js season startRace field construction | Sticky duel setting cannot trim or bump a championship round; new season field retains ordinary grid size. | File boundary above applies. |
| practice restores the driving checkpoint and cannot be armed in a normal race or daily | 252-277 | 253,256,259,260,261,262,262,262,263,263,264,268,268,269,270,272,275,275,275 | js/race/driving-coach.js:50; js/race/daily-challenge.js; js/race/session-records.js:5 | Checkpoint retry restores pose/tyre history and removes later temporary primitive state; new session clears practice; standard daily fixes physics/rejects custom settings without overwriting preference, and open class restores user settings. | File boundary above applies. |

### tests/unit/mechanics-race-vm.test.mjs

Fixture/limits: Real game VM with Monza/Monaco/Silverstone and explicit steps; feedback is intercepted and final takeover uses stub DebrisWorld. Radio enqueue only: no tickBody drain/expiry evidence.

| name | range | assertionSpans | target | meaning | limits |
|---|---|---|---|---|---|
| a driven race fills in the race-craft fields, debounced | 23-53 | 28,28,28,35,36,37-38,50,51 | js/game.js; js/physics/player-forces.js:30; js/race/flying-start.js:28; js/physics/incident-sim.js; js/race/race-control.js | Driven Monaco wall contact increments bounded debounced strikes; forced rival contact counts one graded collision rather than relaxation passes. | File boundary above applies. |
| VS FRIEND: a remote human's street-wall strike does not fire the local player's feedback | 60-103 | 74,86,87,88-89,99,100-101 | js/game.js; js/physics/player-forces.js:30; js/race/flying-start.js:28; js/physics/incident-sim.js; js/race/race-control.js | Remote-human wall strike causes no local haptic/audio feedback, with actual strike and untouched-player controls; local strike still triggers all three. | File boundary above applies. |
| the radio queue keeps a burst in priority order, and drops only what would arrive too late | 105-148 | 123,124,125-126,127-128,132,137,143,144,145,146 | js/game.js announce queue (enqueue/floor only) | Announcement enqueue admits equal-priority burst up to cap, accepts higher priorities without evicting floor-protected first card, and reports busy. | File boundary above applies. |
| ERS recovery needs the car moving: holding the brake or coasting at a standstill refills nothing | 150-166 | 159,164 | js/physics/player-forces.js:30 energy recovery | Pinned standstill brake/coast cannot refill ERS; braking from real speed still recovers energy. | File boundary above applies. |
| flying-start hand-over: the car takes the wheel pointing along the road (Silverstone bends; Monza control) | 190-199 | 192,196,197,197 | js/race/flying-start.js:28 handover | Time-trial AI run-up hands over within two degrees of real tangent on Monza/Silverstone and clears lateral/yaw velocities. | File boundary above applies. |
| flying-start: a session quit mid-countdown does not stop the next time trial arming its rolling start | 201-212 | 205,210,211 | js/race/flying-start.js:28 stop/update; js/game.js quitToMenu | Quitting a GP countdown resets lifecycle so next time trial arms AI rolling start. | File boundary above applies. |
| rescuePlayer deletes the lap in time trial and qualifying, not in a race and not for an AI car | 215-227 | 221,222,223,225 | js/game.js rescuePlayer | Player rescue invalidates TT lap and qualifying sheet, while ordinary race and AI rescue avoid those flags. | File boundary above applies. |
| a flipped human car handed back from a takeover is demoted once and is not counted as a fallback | 233-264 | 257,259,260,261,262,263 | js/physics/incident-sim.js handback/release | Real takeover with stubbed inverted debris pose hands both cars back, rescues human once, demotes its body once and records no fallback. | File boundary above applies. |

### tests/unit/meeting-picker-labels.test.mjs

Fixture/limits: Source patterns plus mirrored local label function, not execution of live private picker function or browser layout.

| name | range | assertionSpans | target | meaning | limits |
|---|---|---|---|---|---|
| the hub panel drops native titles on scroll | 33-36 | 34,35 | js/data/hub.js contentEl scroll titles | Hub source removes native title tooltips on content scroll. | File boundary above applies. |
| hub.js still hosts meetingPickerOptions with circuit + date disambiguation | 38-44 | 39,40,41,42,43 | js/data/hub.js meetingPickerOptions | Source still contains circuit/date disambiguation and passes its generated options into the picker. | File boundary above applies. |
| duplicate meeting names get a date; unique names stay short | 46-60 | 55,56,57,58,59 | test-local mirrored meetingPickerOptions; source-shape tie to js/data/hub.js | Mirrored option algorithm distinguishes duplicate name/circuit meetings by date, keeps unique label short and differentiates Bahrain/Sakhir. | File boundary above applies. |
| data hub tabs can shrink to scroll and wrap when height allows | 62-68 | 64,65,66,67 | css/data.css .dh-tabs/.dh-pick-fields | CSS permits shrinking/wrapping tab strip and stacked picker fields. | File boundary above applies. |

### tests/unit/mem-census-growth.test.mjs

Fixture/limits: Recorded heap arrays, stub page/GLX/log surfaces, and isolated extracted waiter snippets; not a new heap census, full renderer boot, physical scanout or GPU leak proof.

| name | range | assertionSpans | target | meaning | limits |
|---|---|---|---|---|---|
| the bound stays 10 MB | 14-14 | 14 | tools/lib/mem-census.mjs:124-137; tests/specs/track-switch-memory.spec.js GROWTH_MB | Browser spec's extracted growth bound remains ten. | File boundary above applies. |
| the leaks this spec was written for still fail it, every interval over the bound | 16-25 | 18,20,21,23,24 | tools/lib/mem-census.mjs:124-137; tests/specs/track-switch-memory.spec.js GROWTH_MB | All recorded continuous leak fixtures still exceed the growth budget, including eleven MiB increments. | File boundary above applies. |
| a Metal one-time warm-up step does not fail it, wherever the step lands | 27-35 | 29,30,31,33,34 | tools/lib/mem-census.mjs:124-137; tests/specs/track-switch-memory.spec.js GROWTH_MB | One-time hardware warm-up steps plateau under the new policy even when the former third-minus-second check fails. | File boundary above applies. |
| a step cannot hide a leak: growth in every later interval still fails | 37-39 | 38 | tools/lib/mem-census.mjs:124-137; tests/specs/track-switch-memory.spec.js GROWTH_MB | A warm-up step followed by continuing growth cannot hide a leak. | File boundary above applies. |
| fewer than three readings is an error, not a pass | 41-44 | 42,43 | tools/lib/mem-census.mjs:124-137; tests/specs/track-switch-memory.spec.js GROWTH_MB | Too few or nonfinite readings throw. | File boundary above applies. |
| presentation wall deadline bounds a page operation that never resolves | 49-51 | 50 | tools/lib/presentation.mjs:3-179 | Node wall deadline rejects an indefinitely pending page operation. | File boundary above applies. |
| picker receipt rejects stale same-track warm and freezes the final submission target | 63-78 | 67,70,72,73,75,77 | tools/lib/presentation.mjs:3-179 | Fresh matching build/warm logs freeze a submission target, reject stale receipt and later display resizing, and require target completion. | File boundary above applies. |
| warm log with failed/no submission is incomplete, even if an old read completes | 79-86 | 84,85 | tools/lib/presentation.mjs:3-179 | A warm log without actual submission cannot pass from an old completed read. | File boundary above applies. |
| WGX invalidates once and excludes an old-generation read while preserving pending | 87-105 | 94,97,99,101,102,104 | tools/lib/presentation.mjs:3-179 | WGX invalidates scene once without dropping pending read, requires both generation and final sequence completion, and refuses held presentation. | File boundary above applies. |
| native receipt registers before the final warm draw and requires its success notification | 106-124 | 111,114,118,119,123 | tools/lib/presentation.mjs:3-179 | Native frame waiter registers before final draw; only asynchronous success notification marks completion. | File boundary above applies. |
| picker timeout stops polling before cleanup even when its in-flight status resolves later | 129-145 | 141,144 | tools/lib/mem-census.mjs:158-181 | Timed-out in-flight status evaluation cannot restart polling after cleanup. | File boundary above applies. |
| picker observer detects replacement inside the stable GLX facade | 146-156 | 149,152,155 | tools/lib/presentation.mjs:3-179 | Replacing present function, TLX facade or its renderer invalidates receipt identity. | File boundary above applies. |
| diagnostics retain both surfaces and select visible WGX canvas over hidden stale overlay | 157-176 | 167,168,169,171 | tools/lib/presentation.mjs:3-179 | Diagnostics retain both surfaces but choose visible game canvas over hidden stale overlay; no visible surface yields null. | File boundary above applies. |
| shipped TLX and GLX native waiters resolve literal frame from their actual present notifications | 177-192 | 184,189,190 | js/render/three/tlx.js _awaitFrame/present; js/render/glx/soft.js _awaitFrame/present | Extracted shipped TLX/GLX frame waiters resolve literal frame on notification, and TLX requires painted success/public frame routing. | File boundary above applies. |
| median catches intermittent warmed drift without weakening the previous minimum policy | 194-208 | 196,197,198,199,200,201,202,205,206 | tools/lib/mem-census.mjs:124-137; tests/specs/track-switch-memory.spec.js GROWTH_MB | Median of raw warmed intervals catches intermittent positive drift missed by minimum and preserves known leak verdicts. | File boundary above applies. |
| all documented complete warm-up series stay within median budget; short records remain insufficient | 209-225 | 218,219,222,224 | tools/lib/mem-census.mjs:124-137; tests/specs/track-switch-memory.spec.js GROWTH_MB | All complete historical warm-up series meet median budget; fewer than five visits remain insufficient evidence. | File boundary above applies. |
| resource acquisition disposes a server or browser that resolves after its wall timeout | 228-241 | 234,236,239 | tools/lib/presentation.mjs:3-179 | Resource resolving after timed-out acquisition is disposed once for server and browser. | File boundary above applies. |
| successful acquisition retains ownership until caller teardown | 242-249 | 247,248 | tools/lib/presentation.mjs:3-179 | Successful resource acquisition transfers ownership without premature disposal. | File boundary above applies. |
| WGX final copy remains incomplete when the preceding same-scene copy is already shown | 250-263 | 259,260,262 | tools/lib/presentation.mjs:3-179 | Same WGX scene-generation success is insufficient until the final copy sequence completes. | File boundary above applies. |
| GLX soft picker arms its final warm copy on demand exactly once | 264-278 | 272,275,277 | tools/lib/presentation.mjs:3-179 | GLX on-demand copy is invalidated only for matching final warm draw and exactly once. | File boundary above applies. |
| raw median enforces unchanged 10 MiB boundary before display rounding | 279-286 | 281,282,283,284,285 | tools/lib/mem-census.mjs:124-137; tests/specs/track-switch-memory.spec.js GROWTH_MB | Raw 10.04-MiB increments exceed ten despite rounded display intervals; exact ten passes. | File boundary above applies. |
| picker permits display and epoch changes before final submission but rejects later changes | 287-299 | 290,294,296,298 | tools/lib/presentation.mjs:3-179 | Resize/epoch changes before target freeze are allowed; either after submission invalidates receipt. | File boundary above applies. |
| native receipt freezes dimensions after present synchronously resizes the final warm draw | 300-319 | 311,312,313,315,318 | tools/lib/presentation.mjs:3-179 | Native final draw's synchronous resize determines frozen dimensions/epoch and later resize fails. | File boundary above applies. |
| final warm backpressure accepts only the completed submission observed after the matching build | 320-336 | 329,330,331,332,333,335 | tools/lib/presentation.mjs:3-179 | Backpressured final no-op may use a completed earlier submission only from the same matching build. | File boundary above applies. |
| pre-build pending submission cannot satisfy a later final warm no-op | 337-346 | 344,345 | tools/lib/presentation.mjs:3-179 | Submission from before build cannot satisfy a later warm no-op. | File boundary above applies. |
| repeated same-track builds cannot reuse an earlier build submission receipt | 347-357 | 355,356 | tools/lib/presentation.mjs:3-179 | Repeated same-track builds cannot reuse a submission from an older build identity. | File boundary above applies. |

### tests/unit/mem-cycles-lib.test.mjs

Fixture/limits: Recorded numeric series and stub GPU constructors; counter byte estimates are approximate and this does not measure hardware residency/finalization timing.

| name | range | assertionSpans | target | meaning | limits |
|---|---|---|---|---|---|
| warm-up then flat (A·H12's SwiftShader series) reads plateau | 9-15 | 13,14 | tools/gfx/mem-cycles-lib.mjs:13-75 | Recorded SwiftShader warm-up then stable series classifies plateau from the second half. | File boundary above applies. |
| the macos-latest hardware series (gpu-census run 40061540893, TLX/WebGPU, 12 race>quit) reads plateau | 17-23 | 22 | tools/gfx/mem-cycles-lib.mjs:13-75 | Recorded alternating hardware GPU series remains plateau despite count noise. | File boundary above applies. |
| a steady per-cycle climb in the second half reads growing and names the field | 25-31 | 28,29,30 | tools/gfx/mem-cycles-lib.mjs:13-75 | Steady climb reports growing buffer count/bytes and renderer objects, with sixty buffers per cycle. | File boundary above applies. |
| fewer than six cycles cannot separate warm-up from growth | 33-36 | 34,35 | tools/gfx/mem-cycles-lib.mjs:13-75 | Null or fewer than six cycles reports insufficient observations. | File boundary above applies. |
| the counter tracks create minus destroy, sizes buffers and textures, and installs once | 38-63 | 48,54,55,56,57,59 | tools/gfx/mem-cycles-lib.mjs:13-75 | Stub GPU constructors/destructors track live count and MiB, avoid double wrapping, and tolerate double destruction. | File boundary above applies. |

### tests/unit/memory-sync.test.mjs

Fixture/limits: Real shell/Python/Git in throwaway repos under artifacts with isolated live config; no actual user memory is synchronized; failure paths use PATH git stub.
rig.run() asserts every real hook invocation exits zero; each case owns throwaway repo/config cleanup.

| name | range | assertionSpans | target | meaning | limits |
|---|---|---|---|---|---|
| a fresh container restores every tracked memory | 47-55 | 52,53 | .claude/hooks/memory-sync.sh:45-233 | Fresh restore copies tracked index and topic into live memory. | File boundary above applies. |
| a stale session never reverts memories other sessions added (the 2026-10-02 bug) | 57-73 | 68,69,70,71 | .claude/hooks/memory-sync.sh:45-233 | Unedited stale live memory cannot overwrite newer repo index/topic/addition and picks up new topic. | File boundary above applies. |
| this session's own edit, new memory and index line reach the repo | 75-89 | 85,86,87 | .claude/hooks/memory-sync.sh:45-233 | Session-owned topic edits/new files/index lines reach tracked store. | File boundary above applies. |
| both sides adding index lines merge; a topic edited on both sides keeps the repo copy and says so | 91-109 | 104,105,106,107 | .claude/hooks/memory-sync.sh:45-233 | Concurrent index additions merge with local removal; divergent topic keeps repo copy in both stores and reports conflict. | File boundary above applies. |
| a deletion travels only from the side that made it | 111-123 | 120,121 | .claude/hooks/memory-sync.sh:45-233 | Independent deletions propagate only from the side that changed relative to baseline. | File boundary above applies. |
| edit vs delete on a topic file honours the delete (never resurrects) | 128-149 | 138,139,140,145,146,147 | .claude/hooks/memory-sync.sh:45-233 | Edit/delete conflicts honor deletion in either direction and report the clash without resurrecting topic. | File boundary above applies. |
| a branch checkout that lacks a memory is not a deletion; a committed deletion still is (#2128) | 151-184 | 169,171,172,173,174,182 | .claude/hooks/memory-sync.sh:45-233 | Checkout absence preserves live memory and index, while a deletion in branch history retires it. | File boundary above applies. |
| an index line removed by this branch's own commit stays removed (2026-10-18, #2873) | 186-203 | 200,201 | .claude/hooks/memory-sync.sh:45-233 | Committed index deduplication propagates to live store instead of being re-added after HEAD changes. | File boundary above applies. |
| save from an unrelated PostToolUse edit does nothing | 205-214 | 212 | .claude/hooks/memory-sync.sh:45-233 | Unrelated hook edit does not trigger memory synchronization. | File boundary above applies. |
| H2: synced memory files are hidden from git status after save, and `unmark` shows them again | 216-233 | 226,227,229,231 | .claude/hooks/memory-sync.sh:45-233 | Save writes memory while hiding it from status; unmark exposes the change so a subsequent fixture commit includes it. | File boundary above applies. |
| memory conflicts use event-specific context without changing advisory control | 236-260 | 246,247,249,250,252,252,253,254,256,257 | .claude/hooks/memory-sync.sh:45-233 | Conflict uses PostToolUse additionalContext or Stop systemMessage without permission/continue fields; clean and resolved saves stay silent. | File boundary above applies. |
| shallow branch retirement defers without resurrecting topic and index | 266-298 | 285,286,288,289,290,291,294,295,296 | .claude/hooks/memory-sync.sh:45-233 | Both topic retirement and index-only retirement defer repeatedly on disconnected shallow roots, preserve all recovery stores, then complete after ancestry fetch. | File boundary above applies. |
| shallow branch retirement defers without resurrecting index-only removal | 266-298 | 285,286,288,289,290,291,294,295,296 | .claude/hooks/memory-sync.sh:45-233 | Both topic retirement and index-only retirement defer repeatedly on disconnected shallow roots, preserve all recovery stores, then complete after ancestry fetch. | File boundary above applies. |
| failed git merge-base defers memory sync before changing any store | 302-328 | 318,319,320,321,322,323,324,325,326 | .claude/hooks/memory-sync.sh:45-233 | Each failed merge-base/diff/log defers before changing repo/live/baseline, then recovers when git works. | File boundary above applies. |
| failed git diff defers memory sync before changing any store | 302-328 | 318,319,320,321,322,323,324,325,326 | .claude/hooks/memory-sync.sh:45-233 | Each failed merge-base/diff/log defers before changing repo/live/baseline, then recovers when git works. | File boundary above applies. |
| failed git log defers memory sync before changing any store | 302-328 | 318,319,320,321,322,323,324,325,326 | .claude/hooks/memory-sync.sh:45-233 | Each failed merge-base/diff/log defers before changing repo/live/baseline, then recovers when git works. | File boundary above applies. |

### tests/unit/menu-a11y-audit.test.mjs

Fixture/limits: mini-dom, manual MutationObserver notifications, synthetic geometry/computed style and CSS/source contracts; no native focus/caret execution, screen-reader speech, computed cascade or rendered touch target audit.
loadLayerIds/stringConst harness also checks source table existence; fake layer bounds/observer order are controlled by each case.

| name | range | assertionSpans | target | meaning | limits |
|---|---|---|---|---|---|
| MenuNav: D-pad Down leaves a focused search field; the caret keys stay with it | 143-158 | 149,150,154,155,157 | js/ui/menu-nav.js:207,382,452,542 | Search Down exits to the next row and is consumed; caret keys retain native editing and page keys are not field-owned. | File boundary above applies. |
| MenuNav: a synthetic pad Left/Right leaves a search field; a trusted one keeps the caret | 162-174 | 168,169,171,172,173 | js/ui/menu-nav.js:207,382,452,542 | Trusted search Right retains caret default while synthetic pad Right moves focus; Home remains field-owned. | File boundary above applies. |
| MenuNav: trusted arrows edit a textarea, while a synthetic pad arrow can leave it | 176-187 | 182,183,185,186 | js/ui/menu-nav.js:207,382,452,542 | Trusted textarea Down retains multiline editing; synthetic pad Down exits to next control. | File boundary above applies. |
| MenuNav: a range slider keeps Left/Right AND Home/End (ARIA slider ends); Up/Down leave | 189-203 | 197,200,202 | js/ui/menu-nav.js:207,382,452,542 | Range owns horizontal/end keys but vertical keys move to neighboring rows. | File boundary above applies. |
| MenuNav: a <select> keeps Left/Right and Home/End; Up/Down leave it for the next row | 207-229 | 219,220,223,224,227 | js/ui/menu-nav.js:207,382,452,542 | Select owns horizontal/end keys natively while consumed vertical keys leave without changing its value. | File boundary above applies. |
| MenuNav: Down leaves a horizontal tab rail and the key stops before the rail's own handler | 231-245 | 239,240,242,243,244 | js/ui/menu-nav.js:207,382,452,542 | Horizontal rail owns its axis; perpendicular Down leaves to panel and stops propagation to rail handler. | File boundary above applies. |
| MenuNav: Right leaves a vertical tab rail (the paired garage) and Down stays in it | 247-259 | 255,257,258 | js/ui/menu-nav.js:207,382,452,542 | Vertical rail keeps Down internal while Right exits to adjacent option and stops propagation. | File boundary above applies. |
| MenuNav: a declared aria-orientation beats the measured layout; a lone tab keeps the horizontal default | 261-279 | 268,269,270,271,277,278 | js/ui/menu-nav.js:207,382,452,542 | Declared vertical orientation overrides measured row layout; singleton rail defaults horizontal and page keys stay outside widget. | File boundary above applies. |
| MenuNav: a closed <details> offers its summary and none of its contents; open, the contents join | 281-307 | 297,300,302,305,306 | js/ui/menu-nav.js:207,382,452,542 | Closed details exposes only summary; opening adds inner controls and changes spatial navigation targets. | File boundary above applies. |
| MenuNav exports items/currentItem/ownsArrows for the focus-landing seam | 309-318 | 311,316,317 | js/ui/menu-nav.js:207,382,452,542 | Exported focus seam filters hidden items and prefers the selected control. | File boundary above applies. |
| repeated keyboard Escape advances one dialog page at a time | 322-340 | 337,338 | js/ui/modal.js:12,143,209,270,334,357 | Three Escape events each click one back door and consume native cancellation. | File boundary above applies. |
| TopModal non-dialog Tab wraps only the active layer's usable keyboard boundaries | 342-360 | 353,353,354,354,355,355,357,359 | js/ui/modal.js:12,143,209,270,334,357 | Active non-dialog Tab wraps usable endpoints only; middle/modifier/prevented/hidden-layer cases retain platform behavior. | File boundary above applies. |
| TopModal.onFocusIn pulls focus to the first SHOWN control, not the first in DOM order | 362-373 | 372 | js/ui/modal.js:12,143,209,270,334,357 | Focus containment skips hidden, zero-size and aria-hidden controls before choosing visible target. | File boundary above applies. |
| TopModal.onFocusIn pulls focus back when Tab parks on <body> outside an open dialog | 375-400 | 386,392,395-396,399 | js/ui/modal.js:12,143,209,270,334,357 | Body focus outside open dialog returns to first control; existing inside focus is preserved and dialog is programmatically focusable. | File boundary above applies. |
| TopModal: opening a non-dialog screen lands focus (autofocus > default > selected > first, never a text field) | 404-422 | 412,416,420,421 | js/ui/modal.js:12,143,209,270,334,357 | Opening hidden-toggled screens selects usable non-text landing, with selected/default-like first fallback and autofocus precedence. | File boundary above applies. |
| TopModal: BACK returns focus to the button that opened the screen | 424-451 | 435,438,450 | js/ui/modal.js:12,143,209,270,334,357 | Closing a screen restores its opener regardless of mutation notification order. | File boundary above applies. |
| TopModal: a screen reopens on the control it was left from (garage BACK → YOUR CAR) | 453-480 | 467,468,471,477,479 | js/ui/modal.js:12,143,209,270,334,357 | Nested garage navigation returns to YOUR CAR, including transitions that hide and show on different callbacks. | File boundary above applies. |
| TopModal: no focus is restored to a control whose screen is not up (a race started), and dialogs are left to the platform | 482-504 | 497,500,502,503 | js/ui/modal.js:12,143,209,270,334,357 | No restoration targets hidden screens after race start; native dialogs and self-managed rotate blocker retain their own focus ownership. | File boundary above applies. |
| TopModal.scanLayers wires every non-dialog UiLayers layer except the two that manage themselves | 506-511 | 508,509,510 | js/ui/modal.js:12,143,209,270,334,357 | Source exports focus seam and wires non-dialog layers while skipping rotate/photo controllers. | File boundary above applies. |
| TopModal isolates the title menu behind dialog and non-dialog sheets | 513-530 | 518,519,520,523,524,526,528,529 | js/ui/modal.js:12,143,209,270,334,357 | Opening dialog or garage makes title inert/aria-hidden; closing last sheet restores title accessibility. | File boundary above applies. |
| every layer in the shell is a named region or dialog, and #announce is a live region | 546-586 | 557,559,563,566,567,573,574,575,576,579,580,581,584 | index.html; js/ui/layers.js; js/data/hub.js dynamic accessible name | Shell layers have real region/dialog semantics and names; loading is named status/refuses Escape; spoken announcement twin is sole live region. | File boundary above applies. |
| Escape/back is one behaviour: every layer names its own door, and every door exists | 588-610 | 590,593,594,598,600,604,608,609 | index.html; js/ui/layers.js; js/ui/modal.js:44,143; js/ui/hud-arrange.js; js/ui/photo-studio.js | Every layer names existing close control or explicitly refuses Escape; dynamic doors resolve, and both cancel/key paths click same control. | File boundary above applies. |
| setting-row chevrons are pointer-only decoration; the named select owns accessibility | 612-620 | 614,615,616,618 | js/ui/setting-row.js pointerOnly; index.html data-step buttons | Setting row chevrons leave tab order/accessibility tree while shell step buttons retain labels. | File boundary above applies. |
| setting-row chevrons step from a disabled CUSTOM to its real neighbours | 623-644 | 639,641,642,643 | js/ui/setting-row.js wire/step | Disabled CUSTOM steps to real adjacent values and wrapping skips it in both directions. | File boundary above applies. |
| the steering Advanced disclosure exposes button and expanded state semantics | 646-655 | 648,649,650,651,652-654 | index.html #adv-more; js/input/steer-tuning.js | Advanced summary declares button, initial expanded state and controlled region; toggle source mirrors expansion. | File boundary above applies. |
| ScrollFade.SCREENS and AriaState.ROOTS cover every UiLayers layer that scrolls or selects | 666-682 | 678,679,681 | js/ui/layers.js; js/ui/scroll-fade.js SCREENS; js/ui/aria-state.js ROOTS | Scroll/ARIA root lists cover every eligible layer and contain no unknown layers, with documented self-managed/status exemptions. | File boundary above applies. |
| circuit tiles announce the chosen one: .track-row buttons get aria-pressed from AriaState | 684-712 | 689,690,691,692-693,694,708,711 | js/ui/select-screen.js trackTile; js/ui/aria-state.js sync; index.html | Tile source leaves semantics to AriaState; mini-DOM state mirrors active class into aria-pressed initially and after selection change. | File boundary above applies. |
| menus.css text colours clear AA over the darkest sheet ground | 738-749 | 742,745,746,748 | css/tokens.css; css/menus.css customize color rules | Token-resolved customize text passes 4.5 contrast against darkest ground and separator uses shared dim token. | File boundary above applies. |
| menu touch targets are token-sized, and the touch ladder lifts every token to ≥ 44px | 751-770 | 757,758,760,762,765,766,767,768,769 | css/tokens.css; css/menus.css; css/components.css | Primary controls use tap token, secondary controls inherit chip height, and touch overrides provide at least forty-four pixels without filter-chip shrinkage. | File boundary above applies. |
| the SAVING UNAVAILABLE banner is static, spoken once, dismissible, and stands down in a race | 777-801 | 779,780,781,783,784,787,788,789,790,791-792,793,794,797,798,799,800 | index.html #save-warning; js/ui/select-screen.js; css/overlays.css | Static hidden save banner is spoken through one live writer, shown only for write failure, dismissible with state, token-sized and hidden during racing/dialogs. | File boundary above applies. |

### tests/unit/menu-capture.test.mjs

Fixture/limits: Pure registry/path/URL helpers, static generated HTML and diff/list/help CLIs; does not take screenshots or establish browser layout/capture success.

| name | range | assertionSpans | target | meaning | limits |
|---|---|---|---|---|---|
| cellFileBase and cellPaths agree | 22-28 | 24,26,27 | tools/ui/menu-capture.mjs:44-71,253-272,400; tools/ui/layout-audit.mjs; tools/ui/audit-diff.mjs:16-78 | Stable screen/viewport base name agrees with PNG and DOM path suffixes. | File boundary above applies. |
| cellRecorded requires both png and dom | 30-33 | 32 | tools/ui/menu-capture.mjs:44-71,253-272,400; tools/ui/layout-audit.mjs; tools/ui/audit-diff.mjs:16-78 | Missing capture pair is not considered recorded. | File boundary above applies. |
| parseMenuGalleryArgv picks screens and viewports | 35-41 | 37,38,39,40 | tools/ui/menu-capture.mjs:44-71,253-272,400; tools/ui/layout-audit.mjs; tools/ui/audit-diff.mjs:16-78 | Gallery parser selects requested screen order, viewport and job count. | File boundary above applies. |
| pickScreens supports wildcards | 43-47 | 45,46 | tools/ui/menu-capture.mjs:44-71,253-272,400; tools/ui/layout-audit.mjs; tools/ui/audit-diff.mjs:16-78 | Wildcard screen selection yields only data-prefixed entries. | File boundary above applies. |
| listScreenIds matches SCREENS length | 49-51 | 50 | tools/ui/menu-capture.mjs:44-71,253-272,400; tools/ui/layout-audit.mjs; tools/ui/audit-diff.mjs:16-78 | Listed screen IDs count matches registry. | File boundary above applies. |
| layout-audit --list exits 0 without Chromium | 53-60 | 57,58,59 | tools/ui/menu-capture.mjs:44-71,253-272,400; tools/ui/layout-audit.mjs; tools/ui/audit-diff.mjs:16-78 | List CLI returns screen/viewport catalog without needing Chromium. | File boundary above applies. |
| layout-audit --help names gallery and survey | 62-71 | 66,67,68,69,70 | tools/ui/menu-capture.mjs:44-71,253-272,400; tools/ui/layout-audit.mjs; tools/ui/audit-diff.mjs:16-78 | Help advertises gallery/survey/screen/language options. | File boundary above applies. |
| urlWithLang appends lang query | 73-77 | 74,75,76 | tools/ui/menu-capture.mjs:44-71,253-272,400; tools/ui/layout-audit.mjs; tools/ui/audit-diff.mjs:16-78 | Language parameter appends with correct separator or leaves URL unchanged when absent. | File boundary above applies. |
| menu screenshot report renders responsive native screen navigation and DOM links | 79-95 | 88,89,90,91,92,93 | tools/ui/menu-capture.mjs:44-71,253-272,400; tools/ui/layout-audit.mjs; tools/ui/audit-diff.mjs:16-78 | Static generated report provides responsive native navigation/DOM links, two captured cards and explicit skipped listing without scripts/table/select. | File boundary above applies. |
| layout-audit --diff flags a new finding, credits a fix, and never counts a skip as a pass | 97-133 | 111-112,113,114,115,116,117,128,129,131 | tools/ui/audit-diff.mjs:16-78; tools/ui/layout-audit.mjs --diff | Audit diff counts new/fixed findings, isolates skipped and missing cells, prints verdict; CLI exits one for new findings and zero for identical reports before browser launch. | File boundary above applies. |

Total: 218 source test declarations; 223 concrete cases after expanding conclusion, retirement and Git-failure loops. Assertions within ordinary data loops remain one case, with all loop variants described in its meaning.

Status: complete source mapping; execution deliberately not performed.
