# Bounded agent workflow harness

`tools/mcp/workflow-harness.mjs` is an experiment bridge for comparing source-navigation workflows. It is deliberately separate from the MCP catalog: the bridge keeps the production `Lsp` and `callTool` implementation, adds bounded read/search/probe tools, and gives a worker a small authenticated HTTP client. It does not register another MCP server.

## Source and run model

Every run resolves a commit, creates one detached Git worktree, and records the original SHA plus every tracked path, mode, and blob ID in `source-manifest.json`. It separately records the SHA-256 of the imported production LSP backend because a historical requested source SHA does not imply a historical harness implementation. `Lsp` receives the detached directory as `root`; its executable may still come from the primary checkout's `node_modules`. Read, search, file listing, and probes use the detached tree. Before and after a call, the bridge compares the complete filesystem inventory and in-process Git blob hashes with the manifest, including ignored files and symlink targets. A mutation permanently invalidates the run. A run directory must be new, so a second launch cannot append to an old transcript accidentally.

This follows Git's documented detached-worktree form, `git worktree add --detach <path> <commit>`: <https://git-scm.com/docs/git-worktree>. Shutdown drains worker queues, stops each LSP child, removes the linked worktree, and writes `stopped.json`. The source manifest and transcripts remain as evidence.

The probe uses Node's `vm.runInContext` with explicit timeouts and an intentionally small context. Node states that `node:vm` “is not a security mechanism”; this probe is only for trusted agent-authored source experiments: <https://nodejs.org/api/vm.html>. It does not expose `process`, `require`, or network APIs, but those omissions must not be described as a sandbox.

## Starting a run

Create a plan outside the new run directory:

```json
{
  "workers": [
    {
      "id": "rg_audio_1",
      "condition": "rg-read baseline",
      "maxCalls": 36,
      "tools": ["read", "rg", "files", "probe"]
    },
    {
      "id": "lsp_audio_1",
      "condition": "LSP-assisted",
      "maxCalls": 36,
      "tools": ["read", "rg", "files", "probe", "lsp_definition", "lsp_references", "lsp_callers", "lsp_outline", "lsp_symbols", "lsp_hover", "lsp_diagnostics"]
    }
  ]
}
```

Then start the bridge:

```sh
node tools/mcp/workflow-harness.mjs --run-dir scratch/my-run --plan scratch/my-plan.json --sha HEAD
```

The server binds an ephemeral port on `127.0.0.1`. `endpoint.json` has mode 0600 and contains a random token required in `X-Workflow-Token`. Requests are capped at 64,000 characters; HTTP, LSP, ripgrep, VM, and client execution have configurable time bounds. The client defaults to 120 seconds so compiler queueing and a cold LSP can finish; `--timeout-ms` overrides it. Paths are exact repository-relative names with no globs, traversal, hidden components, or symlink escapes. Visible worker source is restricted to tracked files under `js/`, `types/`, `tests/`, `docs/`, and `css/`, plus root `index.html` and `controller.html`. The TypeScript compiler legitimately reads tracked project configuration and type dependencies outside that worker-visible list, along with its installed default libraries from the primary dependency tree; these are compiler dependencies, not worker read access. Tracked symlinks under `js/` or `types/` that escape the snapshot invalidate even a symbol-only LSP call.

Use the client with a file for any probe containing JavaScript:

```sh
node tools/mcp/workflow-harness-client.mjs \
  --endpoint scratch/my-run/endpoint.json \
  --id lsp_audio_1 --tool probe --args-file scratch/probe.json
```

`node tools/mcp/workflow-harness.mjs --help` prints the actual local and imported production LSP JSON Schemas used for request validation.

`probe.test` is evaluated as a script completion value. Use an expression or an IIFE such as `(() => { return GameAudio.context(); })()`. A top-level `return` is invalid. `--quiet` suppresses successful output while still printing semantic errors and exiting nonzero. Without `--quiet`, the worker sees only `{seq,error,errorCode,clipped,fullChars,output}`. Full arguments, output, RPC timings, condition, queue time, byte counts, and clipping state stay in append-only per-worker `transcript.jsonl` files. Calls rejected after a worker cap go to `rejected.jsonl` without extending its sequence.

Read windows are at most 120 lines and name the displayed range. Ripgrep reports its 25-matches-per-file bound. Returned output is clipped at 24,000 characters while `fullChars` preserves the pre-clip size. Missing and unknown arguments report the accepted schema. Failed calls within the budget are transcript rows and consume sequence numbers.

## Experimental limits

The bridge enforces assigned tool access and records observable calls. It cannot prevent a worker from using an unrelated host tool outside the bridge. Condition names and tool access may remain visible, so the bridge does not itself blind an experiment or support a causal claim. A causal comparison should use symmetric guidance, hidden condition labels where practical, randomized assignments, multiple workers per task-condition cell, and blinded validation. Timing under a shared compiler queue is operational telemetry, not a causal latency comparison.
