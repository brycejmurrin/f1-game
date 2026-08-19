# WebGPU Inspector tools (load on demand)

MCP ↔ CLI parity tables and object-type names for `objects_list` /
`objects list --type`.

## Page-driving primitives (CLI + MCP parity)

| MCP tool | CLI command | Purpose |
|---|---|---|
| `browser_eval(js)` | `browser eval --js '...'` / `--file path.js` | Run any JS expression. Returns its value. |
| `browser_click(selector)` | `browser click '<sel>'` | Click DOM element. |
| `browser_type(selector, text)` | `browser type '<sel>' '<text>'` | Type into input. |
| `browser_wait(condition)` | `browser wait --condition '...' --timeout N` | Block until JS expression is truthy. |

These solve the "the inspector can't drive my app past the initial page load"
problem — no need to add `?autoload=1` URL hacks to your app.

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

Adapter, Device, Buffer, Texture, TextureView, Sampler, ShaderModule, BindGroup,
BindGroupLayout, PipelineLayout, RenderPipeline, ComputePipeline, RenderBundle.
