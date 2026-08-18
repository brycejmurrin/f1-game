---
name: webgpu-inspector
description: Use when debugging WebGPU rendering issues, investigating GPU validation errors, inspecting GPU objects (buffers, textures, shaders, pipelines), profiling frame performance, or diagnosing visual artifacts in a web application that uses the WebGPU API
---

# WebGPU Inspector

Debug WebGPU applications from any MCP-capable LLM client (Claude Code, Claude Desktop, Cursor) via the **`webgpu-inspector-mcp`** server, or from a terminal via the **`webgpu-inspector-cli`** CLI. Both share the same Bridge — the MCP server keeps a single browser session alive across tool calls; the CLI is one-process-per-invocation, so multi-step CLI flows must run inside `repl` or you'll get "no active browser session" between commands.

## Setup

```bash
pip install webgpu-inspector-cli
python -m playwright install chromium
```

This installs both `webgpu-inspector-cli` (terminal) and `webgpu-inspector-mcp` (server).

### Configure the MCP server (recommended for agent use)

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

**Claude Desktop** — add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "webgpu-inspector": {
      "command": "webgpu-inspector-mcp"
    }
  }
}
```

Restart the client. Tools appear as `browser_launch`, `browser_eval`, `capture_frame`, `capture_buffer`, etc.

## How to choose: MCP vs CLI

| Use case | Use this |
|---|---|
| Driving from an LLM agent (Claude Code, Cursor, etc.) | **MCP** (`webgpu-inspector-mcp`) — one persistent session across calls |
| Interactive terminal debugging | **CLI REPL** (`webgpu-inspector-cli` with no subcommand) |
| One-shot terminal command, scripted | CLI with `--json`, but only do **one** command per process |

**The CLI lifetime gotcha:** each `webgpu-inspector-cli ...` invocation starts a fresh Python process. Running `webgpu-inspector-cli browser launch ...` and then `webgpu-inspector-cli capture frame` in two separate shell calls **will not work** — the browser dies with the first process. Use REPL or MCP for any multi-step flow.

## MCP-first workflow

Drive the page through tool calls. Order doesn't have to match this list — the bridge persists between calls.

```
1. browser_launch(url="https://your-app.com")
   # Optional: capture_console_path="/tmp/console.log" to record pre-bootstrap logs
   # Optional: user_data_dir="~/wgi-profile" if the app needs an existing browser profile

2. # Drive the page if it requires interaction past the initial load
   browser_wait(condition="window._scRenderer !== undefined", timeout_seconds=10)
   browser_click(selector="button.load-scene")
   browser_eval(js="window._scRenderer.setSceneURL('...')")

3. # Diagnose
   errors_list()
   status_summary()
   objects_list(type="Buffer")     # decoded usage flags appear in 'usageFlags'

4. # Capture a frame and read GPU state
   capture_frame()
   capture_commands()
   capture_buffer(id=42, format="f32-mat4")
   # Or with a struct decoder:
   capture_buffer(id=42, struct_spec="mat4x4 anchorToWorld; u32 chunkId; pad12")

5. # Hot-fix shaders, save textures
   shaders_view(id=8)
   shaders_replace(id=8, code="...new WGSL...")
   capture_texture(id=6, output_path="render_target.png")

6. browser_close()
```

## CLI REPL workflow (terminal)

```bash
webgpu-inspector-cli                       # enters REPL
> browser launch --url https://your-app.com --capture-console /tmp/console.log
> browser wait --condition 'window._scRenderer !== undefined' --timeout 10
> browser click 'button.load-scene'
> browser eval --js 'window._scRenderer.objectCount'
> --json errors list
> --json objects list --type Buffer        # shows decoded usage flags
> capture frame
> capture buffer --id 42 --format f32-mat4
> capture buffer --id 42 --struct 'mat4x4 anchorToWorld; u32 chunkId; pad12'
> browser close
> exit
```

`--capture-console <path>` attaches a console listener **before** navigation so page-bootstrap and pthread-init logs are captured.

## Page-driving primitives (CLI + MCP parity)

| MCP tool | CLI command | Purpose |
|---|---|---|
| `browser_eval(js)` | `browser eval --js '...'` / `--file path.js` | Run any JS expression. Returns its value. |
| `browser_click(selector)` | `browser click '<sel>'` | Click DOM element. |
| `browser_type(selector, text)` | `browser type '<sel>' '<text>'` | Type into input. |
| `browser_wait(condition)` | `browser wait --condition '...' --timeout N` | Block until JS expression is truthy. |

These solve the "the inspector can't drive my app past the initial page load" problem — no need to add `?autoload=1` URL hacks to your app.

## Buffer decoding

`capture_buffer` (MCP) and `capture buffer` (CLI) require a prior `capture_frame` — buffer data is collected via `mapAsync` during frame capture, not on demand.

Format flags:
- `hex` (default), `hex-dump` (xxd-style)
- `u32-list`, `i32-list`, `f32-list` — little-endian decoded arrays
- `f32-mat4` — 4×4 column-major matrices
- `raw` — base64 (pipe to a file)

Struct decoder (`--struct` / `struct_spec`):
```
mat4x4 anchorToWorld; u32 chunkIdDebug; pad12
```
Supports `u8/i8/u16/i16/u32/i32/u64/i64/f32/f64/bool`, `vec2/vec3/vec4` (f32), `mat2x2/mat3x3/mat4x4` (f32, column-major), and `padN` (skip N bytes).

## Tool / Command reference

| MCP tool | CLI equivalent | Purpose |
|---|---|---|
| `browser_launch` | `browser launch` | Launch Chromium, navigate, inject inspector |
| `browser_close` | `browser close` | Shut down session |
| `browser_navigate` | `browser navigate --url` | Navigate + re-inject |
| `browser_screenshot` | `browser screenshot -o` | Save page screenshot |
| `browser_status` | `browser status` | URL/title/GPU |
| `browser_eval` | `browser eval --js / --file` | Run JS in page |
| `browser_click` | `browser click <sel>` | Click element |
| `browser_type` | `browser type <sel> <text>` | Type into input |
| `browser_wait` | `browser wait --condition` | Wait for truthy expr |
| `objects_list` | `objects list [--type]` | List GPU objects (buffers show usage flags) |
| `objects_inspect` | `objects inspect --id` | Full descriptor + stacktrace |
| `objects_search` | `objects search --label` | Find by label substring |
| `objects_memory` | `objects memory` | Memory breakdown |
| `capture_frame` | `capture frame` | Capture next frame's commands |
| `capture_commands` | `capture commands` | Show captured GPU commands |
| `capture_texture` | `capture texture --id [-o]` | Read texture pixels |
| `capture_buffer` | `capture buffer --id [--format / --struct]` | Read decoded buffer |
| `shaders_list` | `shaders list` | List shader modules |
| `shaders_view` | `shaders view --id` | View WGSL source |
| `shaders_replace` | `shaders compile --id --file/--code` | Hot-replace shader |
| `shaders_revert` | `shaders revert --id` | Restore original |
| `errors_list` | `errors list` | All validation errors |
| `errors_clear` | `errors clear` | Reset error history |
| `status_summary` | `status summary` | Object counts, FPS, memory |

## Object types (for `objects_list` `type=` / `objects list --type`)

Adapter, Device, Buffer, Texture, TextureView, Sampler, ShaderModule, BindGroup, BindGroupLayout, PipelineLayout, RenderPipeline, ComputePipeline, RenderBundle.

## Common debugging scenarios

- **Validation errors:** `errors_list` shows message + creation stacktrace pinpointing the bad API call.
- **Missing rendering:** `objects_list(type="RenderPipeline")` to confirm pipelines exist; `objects_inspect(id)` for full descriptor.
- **Buffer OOB / suspicious values:** `capture_frame` then `capture_buffer(id, format="u32-list")` or with a `struct_spec`. Indirect-draw buffers are easy to spot in `objects_list(type="Buffer")` via the `usageFlags` column.
- **Visual artifacts:** `capture_frame` then `capture_texture(id, output_path="rt.png")` to inspect render targets pixel-by-pixel.
- **Shader bugs:** `shaders_view(id)` to read source; `shaders_replace(id, code=...)` to hot-fix; `shaders_revert(id)` to undo.
- **App needs interaction to render anything:** Use `browser_eval` / `browser_click` / `browser_wait` instead of adding URL-param load hacks to your app.
