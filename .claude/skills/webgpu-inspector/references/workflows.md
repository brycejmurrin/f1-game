# WebGPU Inspector workflows (load on demand)

MCP-first and CLI REPL sequences. Tool tables →
[`tools.md`](tools.md); buffer decode / scenarios → [`recipes.md`](recipes.md).

## MCP-first workflow

Drive the page through tool calls. Order doesn't have to match this list — the
bridge persists between calls.

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

`--capture-console <path>` attaches a console listener **before** navigation so
page-bootstrap and pthread-init logs are captured.
