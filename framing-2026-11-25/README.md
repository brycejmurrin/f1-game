# UI framing survey 2026-11-25: evidence

**This is Chromium emulation on a cloud box, not Safari on the device.** Bryce's iPhone 15 Home Screen app: 852×393 landscape (insets L59/R59/B20) and 393×852 portrait (T59/B34), isMobile, hasTouch, iPhone UA, CDP safe-area override. display-mode stays `browser`.

- Settings: `tests/data/settings-live-export-2026-11-25.json`, exported 10:32Z, branch `claude/settings-export-intake-6583` at `713e092e`. Seeded by `openBrycePhone` (bryce-phone.mjs, profile re-pointed locally).
- Build: the deploy tip `49a453a8`, served locally.
- `matrix/`: layout-audit `bryce-standalone` (= landscape) and `bryce-portrait`, 63 screens × 2. Captured at DPR 3 and downscaled to DPR 2.
- `hud/`: race HUD, Bahrain, his stored camera (HELMET). DPR 2.
- `entries/`: title entries the matrix does not open. DPR 2.
- `data/`: audit.json, the settings read-back JSON, HUD rects and entry rects. The `*.mjs` scripts sit beside this README.
