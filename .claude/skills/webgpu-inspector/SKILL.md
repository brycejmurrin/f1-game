---
name: webgpu-inspector
description: Use when debugging WebGPU rendering issues, investigating GPU validation errors, inspecting GPU objects (buffers, textures, shaders, pipelines), profiling frame performance, or diagnosing visual artifacts in a web application that uses the WebGPU API
---

# WebGPU Inspector

Debug WebGPU apps via **`webgpu-inspector-mcp`** (persistent Bridge session across
tool calls) or **`webgpu-inspector-cli`** (one process per invocation — multi-step
CLI flows need `repl` or you get "no active browser session").

## Entry

```bash
pip install webgpu-inspector-cli
python -m playwright install chromium
webgpu-inspector-mcp          # MCP server (agent clients)
webgpu-inspector-cli          # CLI REPL (terminal multi-step)
```

Configure the MCP server in the client catalog, then restart so tools appear
(`browser_launch`, `browser_eval`, `capture_frame`, …). Full install + JSON
snippets → [`references/setup.md`](references/setup.md).

| Need | Use |
|---|---|
| LLM agent (Claude Code, Cursor, …) | **MCP** — one persistent session |
| Interactive terminal multi-step | **CLI REPL** (no subcommand) |
| One-shot scripted command | CLI with `--json`, **one** command per process |

## Hard rules (always)

1. **CLI is one-process-per-invocation** — `browser launch` then `capture frame`
   in two separate shells will not work; use REPL or MCP.
2. **`capture_buffer` needs a prior `capture_frame`** — data is collected via
   `mapAsync` during frame capture, not on demand.
3. Prefer MCP for agent-driven diagnosis; prefer REPL for terminal multi-step.

## Load on demand

- Install / MCP client JSON / CLI lifetime gotcha →
  [`references/setup.md`](references/setup.md).
- MCP-first and CLI REPL step sequences →
  [`references/workflows.md`](references/workflows.md).
- Tool ↔ CLI tables, page-driving primitives, object types →
  [`references/tools.md`](references/tools.md).
- Buffer formats / struct decoder / common failure recipes →
  [`references/recipes.md`](references/recipes.md).

## One-line summary

MCP keeps one browser alive across calls; CLI dies with each process — use
REPL or MCP for multi-step WebGPU diagnosis.
