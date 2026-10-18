# Navigation efficiency: scope before expanding

Small responses help only when they answer the task. A six-task, three-condition
pilot on the game tree used GPT-5.6 Sol workers with persistent LSP sessions and
saved command/result logs. The tasks covered implementation lookup, aliases,
module exports, file impact, and livery fallback behavior.

| Condition | Navigation calls | Returned characters | Argument errors |
|---|---:|---:|---:|
| Ordinary navigation choices | 29 | 106,895 | 0 |
| Concise pages and short bodies | 41 | 55,206 | 8 |
| Concise pages plus directory scopes | 28 | 20,578 | 3 |

All six task answers in each condition met the independently reviewed task
criteria. The livery question was underspecified about which saved-selection
flow it meant; the audit accepted the real source paths instead of requiring
one particular resolver. This pilot does not establish exhaustive caller-graph
accuracy or a general model-token saving.

The scoped condition returned 80.75% fewer characters than the ordinary
condition. Guidance and backend behavior both changed; these are descriptive
observations, not a randomized causal estimate. The experiment used a logged
CLI proxy, not attached MCP schemas. Some early workers discarded asynchronous
command output and repeated a successful call. Concurrent cold project loading
also prevents comparing agent-run wall times. Billed model usage was unavailable;
characters and UTF-8 bytes are recorded as output-size metrics.

## Use the scope that matches the question

```text
lsp_definition {symbol:"M4.lerp", body:true, maxLines:15, format:"concise"}
lsp_references {symbol:"G.player", path:"js/ui", files:true}
lsp_callers {symbol:"M4.lerp", path:"js/physics", files:true}
lsp_callers {symbol:"M4.lerp", path:"js/physics", limit:10}
lsp_outline {symbol:"Ghost", format:"concise"}
```

`path` selects a repo-relative file or directory, using directory boundaries
rather than a raw string prefix. It filters resolved locations after alias
resolution and before paging; the answer names the scope and unfiltered count.
It does not select a lexical binding or resolve an ambiguous name. Definitions
outside a selected scope produce no scoped declaration body. `file` still means
a query position, not a result filter.

References and callers both support `files:true`. Caller summaries report use
and function counts for every file in the selected scope. Row pagination does
not discard files from those summaries. Concise formatting is available on
definitions, references, callers, and outlines; caller rows are already grouped.
Existing defaults remain compatible. The CLI exposes the same options through
`--path=js/physics`, `--files`, and `--concise` where applicable.

## Remove repeated work without retaining stale answers

A CPU profile of the real `M4.lerp` caller workload put most bridge samples in
`visitParents`: every reference caused another full syntax-tree walk to identify
its containing function. Indexing function intervals once per cached file text
preserves the existing labels and location keys. File changes discard the text
cache and its interval index together; this is not a project-wide result cache.

An isolated cache-only comparison retained byte-identical outputs for all nine
queries. Two warm caller samples fell from 20.39/20.27 seconds to 0.37/0.37
seconds on this host. The first caller sample fell from 22.20 to 4.11 seconds.
These are a bounded single-host measurement, not a latency guarantee. File-only
reference summaries also avoid building source rows and enclosing-function
lookups that would be discarded.

The experiments exposed two accuracy problems worth fixing before optimizing
the output further: nested aliases could select their containing module's
declarator, and overlapping reference routes could count one use repeatedly.
Alias lookup now selects the innermost containing declarator. Caller collection
deduplicates source positions while preserving separate calls on the same line
and excludes declaration/export/alias rows from use counts.

Reproduce current real-tree latency and output-size observations with:

```sh
node tools/mcp/lsp-navigation-bench.mjs --iterations=3
```

Run it without other test or browser workloads. Its JSON separates the first
sample of each query from warm samples and includes output hashes. It has no
timing threshold, browser workload, or tokenizer dependency. Correctness and
freshness belong in the registered LSP regression suites, not a speed assertion.

## Test realistic investigations as well as known-answer lookups

A second experiment assigned twelve independent GPT-5.6 Sol workers to six real
bug-hunting workflows: ghost recording, audio lifecycle, input state, livery
imports, race lifecycle, and career saves. Each task had an LSP-assisted worker
and an `rg`/file-read worker, with a 36-call budget, separate saved commands and
results, actual-source VM probes, and independent finding validation.

| Condition | Calls, including probes | Probe calls | Returned characters |
|---|---:|---:|---:|
| LSP-assisted | 192 | 6 | 762,581 |
| `rg` and reads | 201 | 8 | 849,450 |

LSP returned 10.23% less text overall, but its input investigation returned
51.01% more text than the paired `rg` investigation. These exploratory workers
chose different hypotheses; this is not an exhaustive recall or causal
efficiency comparison. The earlier known-answer pilot's 80.75% reduction does
not generalize to these workflows. No billed token usage was available.

Real investigations exposed two missing navigation cases: CommonJS-tailed
browser globals lost consumers in other scripts, and repeated top-level `var`
IIFEs used for lazy stub replacement hid inline exported members. The fixes
preserve lexical shadow filtering, report multiple implementation candidates,
and avoid guessing runtime load order or injected parameter aliases. Repeated
IIFE discovery skips implausible files and caches its index with each file's
text revision; ordinary lookups must not parse unrelated files for this case.

Validation also confirmed livery import state/ID conflicts and career migration
data loss for accepted string version markers. It rejected a dormant replay API
as intentional groundwork and treated existing held-key menu behavior as a
product-policy question. A WebKit activation concern remained unverified.
Finding count alone would have rewarded unsupported claims.

The harness contributed twelve invalid-scope errors and six malformed probe
attempts; one explicit production MCP error and successful-but-incomplete
semantic answers are counted separately. Broad search clipping, silently capped
file reads, bounded `rg` results, later path guidance, concurrent verification,
and the CLI proxy's explicit schemas limit interpretation. Keep those failures
in the evidence instead of rewriting the original runs after fixes.

Protocol reference: [MCP tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools).
The original server comparison is in [LSP over MCP](LSP-MCP-2026-10-18.md).
