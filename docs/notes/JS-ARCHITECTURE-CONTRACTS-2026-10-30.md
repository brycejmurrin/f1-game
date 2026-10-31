# JavaScript architecture: current signals and restore contracts

Source: fetched deploy commit `9e5063c78d4db11e8763342b74777a9b4bfa08e3`,
inspected on 2026-10-30. Comparison: the earlier architecture review at
`7c6d11c68ad8fd670ee2a882d53bb2eec50c548b`. These are source measurements,
not runtime frequency, allocation rates or performance results.

## Current static signals

| Manifest roster | Files | Declared ordering edges | Earlier files / edges |
| --- | ---: | ---: | ---: |
| FULL | 325 | 247 | 325 / 247 |
| LAZY_DATA | 18 | 34 | 18 / 34 |
| LAZY_RACE_SESSION | 23 | 5 | 21 / 5 |
| LAZY_NET | 23 | 19 | 23 / 19 |
| LAZY_TRACK_BUILD | 17 | 17 | 17 / 17 |

The source of these constraints is `tools/manifest.cjs`. Ordering edges do
not describe all dependencies: the manifest deliberately excludes call-time
and construction-satisfied dependencies, including the M4 dependency of lazy
telemetry. Endpoint membership and a valid ordering cannot establish a complete
dynamic dependency graph.

The facade checker finds 297 actual and declared G members, 95 recognized
factories, and 5,172 reference sites. Parity and its TypeScript usage check are
clean. The earlier review found the same 297 members and 95 factories, with
5,171 sites. Usage collection scans 93 files. Of the surface properties, 93
are writable and 204 are readonly-equivalent; a readonly property can still
refer to mutable state or a function with effects.

Distinct referenced facade members are concentrated in the agent API (153),
agent view (47), race settings (39), real-race controller (38), network lobby
(36) and HUD (34). These are supported, scope-resolved source accesses. They
do not measure call frequency, transitive authority or deep mutation. The
agent API is deliberately a broad inspection/control adapter; its rank alone
does not justify splitting it.

Declared incoming evaluation edges concentrate in game.js (58), Data Hub (17)
and scenery build-props (13). Changes around those boundaries need explicit
load-order evidence. The checker handles supported aliases and factory
contexts, rather than arbitrary dynamic keys or every member-expression stash.
Its parity/usage check is not expression checking throughout every module.

## A boundary does not automatically reduce dependencies

The saved qualifying-row projection is a useful counterexample. Its existing
map callback already reads only the saved entry, index and live-car lookup.
Moving it into a private same-IIFE function would name the phase and narrow
its lexical scope, but would remove no actual external dependency or crossing.
That benefit is modest. Compatibility coverage is useful independently of
such an extraction.

The public restore contract includes details that a stricter rewrite could
silently change:

- Current driver metadata wins over obsolete labels in a saved entry.
- A positive legacy string time retains its stored representation, while gap
  arithmetic performs the existing numeric coercion.
- Human and NO TIME flags retain their existing boolean normalization;
  absence of the optional `noTime` property remains observable.
- Restoration leaves saved entries and live cars unchanged. Returned public
  rows are detached from both live metadata and cached classification.

The added `quali-persist` characterization exercises these through `results()`
on the existing implementation. It neither tightens validation nor adds a
test-only production export. Guard timing, facade reads and cache installation
remain untouched.

## Implications for later work

Keep instance state, persistence and lifecycle decisions visible at their owner.
Extract a calculation when explicit inputs establish a useful boundary; report
lexical authority separately from actual module dependency reduction. A line
count or reference count is not a performance claim.

Preserve the existing distinction between delayed context access and
evaluation-time dependencies. [ECMAScript Scripts and Modules](https://tc39.es/ecma262/multipage/ecmascript-language-scripts-and-modules.html)
(living 2027 draft, inspected 2026-10-30) defines different environments and
evaluation machinery for scripts and modules. ESM, bundling and broad typing
changes still require cycle, boot, lazy-failure and deployment baselines, plus
agreement with the repository's classic-script policy.

[TypeScript JSDoc](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html)
and [checkJs](https://www.typescriptlang.org/tsconfig/checkJs.html) (living docs,
inspected 2026-10-30) support narrower static contracts. They do not validate
stored data at runtime. Any normalization of legacy qualifying records needs
an explicit migration policy and acceptance cases.

No fresh CPU, heap, GPU or player-device performance result follows from this
static review. Hosted tools also need source identity: the available Apex MCP
reported `/workspace/f1-game` without establishing this isolated worktree's
commit identity. These current measurements therefore used the isolated
worktree's semantic CLI and checker. Matching checkout paths on separate hosts
do not establish matching files or revisions.
