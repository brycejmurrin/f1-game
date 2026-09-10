# MCP probe traps (load on demand)

Measured war stories. Open only the slice you need:

| When | File |
|---|---|
| Playwright vs Chrome MCP conflict, park/`about:blank`, CPU starve | [traps-chrome.md](traps-chrome.md) |
| `snapCam` / free-cam / chase / rAF / lat vs gap | [traps-camera.md](traps-camera.md) |
| Soft-present, lights, `scene()`, occlusion, mid-air jump | [traps-scene.md](traps-scene.md) |

**Always:** never render in the MCP browser while Playwright runs — check
`node tools/ci/test-bg.mjs --status`, then `navigate_page(about:blank)` before
any `test-bg` launch. Details in traps-chrome.md.
