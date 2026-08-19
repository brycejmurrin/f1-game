# WebGPU Inspector recipes (load on demand)

Buffer decoding and common debugging scenarios. Workflows →
[`workflows.md`](workflows.md); tool tables → [`tools.md`](tools.md).

## Buffer decoding

`capture_buffer` (MCP) and `capture buffer` (CLI) require a prior
`capture_frame` — buffer data is collected via `mapAsync` during frame
capture, not on demand.

Format flags:
- `hex` (default), `hex-dump` (xxd-style)
- `u32-list`, `i32-list`, `f32-list` — little-endian decoded arrays
- `f32-mat4` — 4×4 column-major matrices
- `raw` — base64 (pipe to a file)

Struct decoder (`--struct` / `struct_spec`):
```
mat4x4 anchorToWorld; u32 chunkIdDebug; pad12
```
Supports `u8/i8/u16/i16/u32/i32/u64/i64/f32/f64/bool`, `vec2/vec3/vec4` (f32),
`mat2x2/mat3x3/mat4x4` (f32, column-major), and `padN` (skip N bytes).

## Common debugging scenarios

- **Validation errors:** `errors_list` shows message + creation stacktrace
  pinpointing the bad API call.
- **Missing rendering:** `objects_list(type="RenderPipeline")` to confirm
  pipelines exist; `objects_inspect(id)` for full descriptor.
- **Buffer OOB / suspicious values:** `capture_frame` then
  `capture_buffer(id, format="u32-list")` or with a `struct_spec`.
  Indirect-draw buffers are easy to spot in `objects_list(type="Buffer")` via
  the `usageFlags` column.
- **Visual artifacts:** `capture_frame` then
  `capture_texture(id, output_path="rt.png")` to inspect render targets
  pixel-by-pixel.
- **Shader bugs:** `shaders_view(id)` to read source;
  `shaders_replace(id, code=...)` to hot-fix; `shaders_revert(id)` to undo.
- **App needs interaction to render anything:** Use `browser_eval` /
  `browser_click` / `browser_wait` instead of adding URL-param load hacks to
  your app.
