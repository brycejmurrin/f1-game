# WebGPU Inspector setup (load on demand)

Install and MCP client wiring. Return to [`../SKILL.md`](../SKILL.md) for
entry / don'ts / dispatch.

## Install

```bash
pip install webgpu-inspector-cli
python -m playwright install chromium
```

This installs both `webgpu-inspector-cli` (terminal) and `webgpu-inspector-mcp`
(server).

## Configure the MCP server (recommended for agent use)

**Claude Code** — add to `~/.claude/mcp.json` or project `.mcp.json`:

```json
{
  "mcpServers": {
    "webgpu-inspector": {
      "command": "webgpu-inspector-mcp"
    }
  }
}
```

**Claude Desktop** — add to
`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "webgpu-inspector": {
      "command": "webgpu-inspector-mcp"
    }
  }
}
```

Restart the client. Tools appear as `browser_launch`, `browser_eval`,
`capture_frame`, `capture_buffer`, etc.

## How to choose: MCP vs CLI

| Use case | Use this |
|---|---|
| Driving from an LLM agent (Claude Code, Cursor, etc.) | **MCP** (`webgpu-inspector-mcp`) — one persistent session across calls |
| Interactive terminal debugging | **CLI REPL** (`webgpu-inspector-cli` with no subcommand) |
| One-shot terminal command, scripted | CLI with `--json`, but only do **one** command per process |

**The CLI lifetime gotcha:** each `webgpu-inspector-cli ...` invocation starts
a fresh Python process. Running `webgpu-inspector-cli browser launch ...` and
then `webgpu-inspector-cli capture frame` in two separate shell calls **will
not work** — the browser dies with the first process. Use REPL or MCP for any
multi-step flow.
