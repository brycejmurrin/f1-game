# Investigate with bounded navigation and explicit evidence

Use this reference for correctness investigations after locating the subsystem.
For ordinary symbol lookup, use the main code-nav skill.

## Choose the smallest useful view

For a known API, request its definition with a bounded body. For an unknown API,
start with exported members; `all:true` includes internal helpers and can turn a
large module outline into hundreds of rows. Expand internals for a concrete need.

For broad impact, first inspect global file counts, then expand the relevant
consumer rows. `file` plus line/column selects a binding; `path` filters results.
Narrowing the result scope does not prove that other files have no consumers.

```text
lsp_references {symbol:"InputGhost.record", files:true, includeDeclaration:false}
lsp_references {symbol:"InputGhost.record", path:"js/race", format:"concise", includeDeclaration:false}
lsp_callers {symbol:"GameAudio.init", files:true}
lsp_definition {symbol:"Input.reset", body:true, maxLines:60}
```

Read the response's binding and coverage qualifiers before interpreting counts.
Factory-returned properties, destructured aliases, conditional receivers,
callback registration and inline HTML can cross a boundary the static query
does not follow. For example, a helper returned by `RaceControl.create()` is used
through `raceCtl.takeRestart()`, and `GhostShare.at` is used through a conditional
`replayGhost` receiver. Follow creation, return/destructure, facade and consumer;
use one bounded text cross-check where the binding stops. A private helper should
be queried at its source position rather than assumed to be a static public member.
Definition-only output alone is inconclusive about runtime use.

Discover uncertain filenames before opening them. Search tests by a focused
filename or candidate API, then read the relevant assertions. Generic terms such
as `reset|menu|race` across the whole test tree can return mostly unrelated code.
Treat a clipped or per-file-bounded result as discovery, not a complete search.
Keep a record of source windows already read; after host-output truncation,
recover the missing intervals rather than repeating a large batch.

## Establish a reachable defect

Trace one value through its supported entry point, validation/normalization,
state mutation or persistence, and actual consumer. Compare accepted input
representations and the exact keys/fields cleared at reset. A current numeric
version and an accepted numeric-string version must not select different
migration ladders. A track-wide delete must match context-keyed records too.

For UI claims, read the disabled state and event gate before claiming a shared
picker or dialog is reachable. Distinguish normal recording/import, durable UI
mutation, legacy data, corrupt site data and deliberate storage editing. Existing
tests can document intentional compatibility; malformed data alone does not
establish a supported-ingress product bug.

Run the smallest actual-source probe once the hypothesis and consumer are clear,
leaving room for a corrected retry. A successful happy-path probe closes only
the input class it exercised. Do not spend the final call on the first untried
probe or substitute a model of the implementation for the actual source.

Inspect `isError` (or the harness's `error`) explicitly. Report source inspection,
inspected assertions, successful probes, executed suites and browser/device
evidence separately. For a no-finding, retain the strongest rejected hypotheses
and remaining runtime limits.

For recorded LSP-versus-search experiments, use the reusable
[workflow harness](../../../../docs/research/AGENT-WORKFLOW-HARNESS.md). Its schemas,
script/IIFE examples and file-based arguments address the experiment-specific
errors; they are not additional production LSP arguments.

## Evidence boundary

The guidance comes from twelve GPT-5.6 Sol real investigations at commit
`bbb0a7d9a7d0315477808bc7df2a9bc8241e38c6`: all 413 saved navigation/probe calls,
visible action logs and final answers were reviewed. There were nine probe
syntax/quoting errors, six harness argument mistakes and three guessed-path
errors. The LSP save worker received the relevant migration and admission code
but missed their inconsistent version interpretation. These observations support
the workflow rules; they do not measure the rules' future token savings or
establish a causal advantage for one tool.

The evidence bundle is local to the originating workspace under
`artifacts/mcp-validation/lsp-bughunt-v4/`; it is not a committed public artifact.
No private reasoning or billed-token telemetry was available.
