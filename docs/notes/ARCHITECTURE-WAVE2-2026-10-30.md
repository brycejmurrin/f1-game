# Architecture implementation wave 2

Base: fetched deploy `30c38ef6c01e08126ba9d75e825f41bd090c80d2`.
Branch: `cursor/architecture-wave2-30c38ef6`, isolated `/workspace/apex-wave2`.
Implements a larger follow-up to the [architecture evolution design](../plans/2026-10-30-architecture-evolution.md).
The separate RaceControl capability pilot is PR #4322; this wave does not depend
on its unmerged files or edit its paths. No directory moves, new runtime globals,
framework, bundler, module-format conversion or new loading edges.

## Implemented boundaries

| Area | Policy / state owner | Effect / compatibility owner | What remains compatible |
|---|---|---|---|
| Reliability | Private scalar retirement risk, sampled plan and resolved-cost quality functions | Existing adapter reads Career/Parts, consumes hashes, mutates cars and logs | Public functions, seeded outcomes, conditional draw order and network build-relief rules |
| Script loading | Per-file admission/readiness/retry/evaluation; separate group graph scheduler | Private browser attempt owns DOM tag, responsive deadlines and cleanup | Public create/load, strict sharing, partial loaded sets, synchronous load-event readiness, SRI/URL/preload and failure semantics |
| F1 API transport | Private request/cache/retry/pacing/quota/generation policy | Per-instance effect owner manages fetch/body deadlines, AbortController/listeners, cancellable waits, storage, clock and logging | Existing create signature and six instance methods, dedupe, stale/auth policy, late-result invalidation and quota history across cancel/reopen |
| Dependency contracts | Explicit module/function contracts consumed by a scope-aware checker | Existing load-order unit suite invokes the checker as a structural gate | Classic IIFE runtime and existing test registration; no new runtime checker dependency |

The transport capability object is private; injected consume callbacks still
interpret HTTP bodies/status. Its deadline covers both headers and body, including
broken implementations that ignore abort. Methods use live platform lookup and
original receivers, matching the prior implementation. Each instance owns its
controllers and timer waits. cancelAll still invalidates policy generation before
releasing effects, so a late body cannot publish into cache.

The loader's graph does not create script elements, touch evaluated registries or
own browser timers. It drains already-started siblings on a strict failure and
retains successful files for retry. The attempt adapter does not decide which
bundle/file is eligible or whether a failed readiness check merits retry.
Readiness remains inside the load event; moving it to a later promise turn would
change successor admission. Existing page-wide evaluation and in-flight registries
remain in their original owner; they are not duplicated into each graph.

Reliability snapshots development/build inputs at the old sampling boundary.
It draws the failure sample first and only draws time/reason for a retiring car.
The functional core does not read Career/Parts, draw randomness, log or mutate
cars. Planning-time objects are bounded to race setup; no immutable world copies
or new per-frame state stores were introduced.

## Enforceable contracts

`tests/data/module-boundaries.json` declares four whole-module contracts
(Hash32, PaceMath, WxHash and ThermalDrift) plus three Reliability helper contracts
and the transport policy factory contract. `scan-globals.mjs --boundaries` checks lexical
free references in eager and deferred bodies, narrow permitted members, global
writes, extra exports and common ambient/global-code-generation escape forms.
Function extraction requires one unambiguous named declaration and preserves
source locations. Date.parse is allowed only as a decoder; Date.now, Date
construction, browser storage/network/DOM globals and undeclared dependencies
are refused inside these contracts. Destructuring and for-loop write targets are
covered without mistaking computed keys/default-value expressions for writes.

Run `node tools/check/scan-globals.mjs --boundaries --json`. The existing load-order suite
runs these contracts in the normal structural floor, avoiding a second test
registration source. Negative fixtures prove rejection of Career/Parts/fetch/clock
reintroduction, shadowing correctness, missing/duplicate function extraction and
unauthorized writes. The ScriptLoader suite separately checks the graph/attempt
lexical authority alongside lifecycle behavior.

This is dependency discipline, not a security sandbox or a proof of mathematical
purity. PaceMath is stateful and retains a reviewed optional PhysicsConsts object
capability. Alias/data-flow effects and injected callbacks are not analyzed; the
contracts make reviewed authority visible rather than claiming to infer it all.
No new tree-wide ratchet or baseline of existing violations is introduced. The
checker extends the existing global-analysis CLI; graph mode remains unchanged.
This avoids adding another CLI and editing the shared output-policy registry
currently owned by other sessions.

## Coordination and verification

Four native implementation workers owned disjoint paths; the lead integrated.
Reliability and transport had independent behavioral/API review; the checker
worker independently reviewed the loader. A lead review reproduced a destructuring
write-check gap; negative fixtures and the checker were corrected before the
combined floor. No worker launched a browser or changed shared manifest, GameCtx,
game.js, test groups or generated output. Those paths have active owners in other
PRs. The lead alone regenerates derived metadata and owns serialized browser runs.

Worker evidence before integration:

- Reliability plus lazy-session suites: 18 passed. A pre-change characterization
  over 24 scenarios ×120 cars matches after extraction, including complete mutated
  plans and hash/development call order (SHA256
  `de11f14025fdff1a49758705f9d3e693b6df876f7effcd2dd1a987361954114d`).
- Transport suite: 67 passed, including cleanup, live host replacement, synchronous
  fetch failure, cross-instance cancellation and late-body cache rejection.
  Independent VM API comparison preserves module freeze, create arity 2 and all
  six public instance method arities.
- Loader original four suites: 32 passed; expanded retry/evaluation suite: 7 passed.
  Graph topology check passed. Eager raw source delta: +903 bytes; no budget raise.
- Load-order/boundary suite: 48 passed; CLI: eight scopes, zero violations.

These are scoped worker results, not a claim the combined change or rendered game
has passed. The PR body records integrated generation, ratchets, structural floor,
actual browser runs and CI separately. Software browser evidence is not physical
GPU/mobile performance evidence. No frame-rate/startup speed claim is made.

## Guidance and remaining work

Primary guidance used: [ports/adapters](https://alistair.cockburn.us/hexagonal-architecture/),
[functional core / imperative shell](https://www.destroyallsoftware.com/screencasts/catalog/functional-core-imperative-shell),
[fetch response/body lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/Window/fetch),
[abort lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/AbortController/abort),
and [ESLint scope analysis](https://eslint.org/docs/latest/extend/scope-manager-interface).
The fetched API references and detailed worker receipts live under this checkout's
ignored scratch directories; the source/contracts/tests and summarized evidence
are durable in Git. No fetched source is treated as an Apex benchmark.

Old public façades coexist with private boundaries, so callers and save formats
need no migration. Further consumer migration, state relocation, renderer contract
work and ESM experiments remain separate decisions; this wave establishes usable
core/effect and dependency seams before asking those consumers to change.
