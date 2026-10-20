# Browser and dev MCP servers: what they can do, where they fail

Tested hands-on on 2026-10-19 (Pacific). Cloud container with no GPU (SwiftShader), the game served at
`http://127.0.0.1:3456/`, main tip `d6383513`. Every claim below comes from a call made in this session.
Captures were in `artifacts/mcp-tour/` (git-ignored).

## Fixes from this pass (branch `cursor/mcp-integrate-perf-7q2k`)

- `tools/mcp/debug-chrome.mjs start | status | stop` (also MCP tool `apex_debug_chrome`) owns ONE shared headless Chromium on CDP 9222.
  - `phone-landscape` (the default) now also sends an iPhone user agent, which turns on the mobile render tier.
    Measured: `GLX.isMobile:true`, tier 2.
  - start writes `~/.config/chromium/DevToolsActivePort`, so browser-use attaches with no setup; stop removes it.
  - js-debugger's `debugger_targets` / `debugger_attach` default to this browser when no endpoint is given.
  - `apex_status` reports `debugChrome`. Browser `apex_*` tools refuse (`debug_chrome_up`) while it runs, so only one
    browser runs at a time.
- `tools/mcp/playwright-mcp.sh`, both read at server start:
  - `APEX_PW_CDP=http://127.0.0.1:9222` attaches to that browser. Measured: it saw browser-use's race tab, `state:"race"`.
  - `APEX_PW_DEVICE="iPhone 15 landscape"` (any Playwright device name) gives touch and the iPhone user agent.
    Measured: `page.touchscreen.tap` works.
- `tools/mcp/chrome-devtools-mcp.sh`: `APEX_CDT_BROWSER_URL=http://127.0.0.1:9222` attaches to the same browser.
  Measured: same page, heap 140 MB in a Monza race on the mobile tier.
- These variables only take effect when the MCP server starts. Set them in the environment settings, or run the wrapper by hand.

Sources: Playwright MCP flags from `npx @playwright/mcp@0.0.79 --help` (`--device`, `--cdp-endpoint`, `--user-agent`);
chrome-devtools-mcp 1.7.0 `browserUrl` option in its CLI source; https://github.com/microsoft/playwright-mcp ;
https://github.com/ChromeDevTools/chrome-devtools-mcp ; browser-use discovery from `browser_harness/daemon.py` (`_LINUX_PROFILES`).

## Pick the right one

| Need | Use | Why not the others |
|---|---|---|
| A real iPhone-landscape repro (notch insets, touch, mobile render tier) | **apex-tools** `apex_hud_shot` / `apex_ui_fit` | Only one that models the 59 px safe-area insets and boots with the repo's GPU flags |
| A number from the game (`__apex`) with no browser | **apex-tools** `apex_eval {vm:true}` | 7.7 s, no Chromium, no lock |
| Menu and DOM work, clicking by role | **Playwright** | Its snapshot text has a false positive (below); check accessibility claims with Chrome DevTools |
| What a screen reader actually gets | **Chrome DevTools** `take_snapshot` | Reads Chrome's real accessibility tree |
| Memory, heap, Lighthouse, load trace | **Chrome DevTools** | The only one with heap and Lighthouse tools |
| Values inside the 60 fps loop, locals at a line | **js-debugger** | Logpoints record without pausing |
| Python scripting over raw DevTools commands | **browser-use** | Least reliable here (5 s limit) |

## Chrome DevTools (`chrome-devtools`, 41 tools)

**Strengths**
- `emulate` does the whole phone profile in one call: viewport, DPR, `mobile`, `touch`, `landscape`, user agent.
  It sticks across navigations.
- `take_snapshot` is Chrome's real accessibility tree.
- `lighthouse_audit` (mobile): accessibility, best practices, SEO and agent browsing all scored 100.
- `performance_start_trace` gives LCP (984 ms) and CLS (0.00). `performance_analyze_insight` points at the source line.
- Heap tools: snapshot, summary, duplicate strings, dominators, retainers, compare.
- Network list, console, dialogs, file upload, CPU and network throttling.

**Weak points**
- It is its own browser. It doesn't take `apex-browser.lock`, so `apex_status` can't see it.
  Running it next to a Playwright run breaks AGENTS.md's one-browser rule without warning.
- A heap snapshot of the menu is a 31 MB file. Delete it afterwards.
- No breakpoints or logpoints; that's js-debugger.
- `close_page` refuses to close the last tab. Navigate to `about:blank` to unload the game.

**Found with it**
- With the iPhone user agent, the "Add to Home Screen" banner covers the "Unofficial fan project — not affiliated with FIA
  or Formula 1" disclaimer. See `cdt-menu-iphone.png`. No other server showed it, because none sent an iOS user agent.
- Strings are 22.4 MB of the 37 MB JavaScript heap on the menu. The largest duplicates are generated three.js (TLX)
  shader source kept 4–10 times, about 0.4–0.7 MB each. Lead for skill `perf-memory-census`.
- The 25 ms forced reflow in the trace is the inline first-paint script in `index.html`, which is there on purpose
  (it prevents a 0.6 layout shift).

## Playwright (`playwright-official`, 25 tools)

**Strengths**
- Accessibility snapshot with element references, `browser_find` to search it, click and type by reference.
- `browser_run_code_unsafe` gives the full Playwright API, including `page.context().newCDPSession(page)`.
  That reaches anything in the DevTools protocol.
- Network list with `static:false` hides the 508 static assets and shows the data requests.

**Weak points**
- **The snapshot text is a false positive for accessibility.** It printed about 50 ▾/▴ symbols plus "SIZE PREVIEW", "GAS"
  and empty quotes as page text. That text comes from CSS `content:` on screens that aren't open. Chrome's real tree
  (Chrome DevTools `take_snapshot`) has none of it. Never file an accessibility bug from Playwright's snapshot alone.
- Launched `--isolated --headless` with no device preset (`tools/mcp/playwright-mcp.sh`), so:
  - `browser_resize` sets the size only. There's no touch, no mobile user agent, and `GLX.isMobile` stays false.
  - `page.touchscreen.tap` throws: "hasTouch must be enabled on the browser context".
  - **Workaround, tested:** in `browser_run_code_unsafe`, open a DevTools session and send
    `Emulation.setTouchEmulationEnabled`, `Emulation.setUserAgentOverride` (iPhone) and `Emulation.setDeviceMetricsOverride`
    (mobile, DPR 2). After `page.goto`, `GLX.isMobile` is true and the touch-only "Use as controller" button shows. For taps,
    `Input.dispatchTouchEvent` produced the real sequence `pointerdown:touch → touchstart → pointerup → touchend → click`,
    and Settings opened.
- `browser_take_screenshot` fails with ENOENT if the output folder doesn't exist. Create it first.
- It isn't under the apex lock either: `apex_status` reports it as "hostMcp" and allows it.

## browser-use (`plugin:browser-use`, 2 tools: `browser_exec`, `browser_screenshot`)

**Strengths**
- A Python session that persists between calls, with helpers (`new_tab`, `js`, `cdp`, `click_at_xy`) and raw DevTools access.
- `browser_screenshot` worked even when `browser_exec` was timing out.

**Weak points**
- **It needs a browser that is already running.** With no `BU_CDP_URL` set, it looks for `DevToolsActivePort` in
  `~/.config/chromium` and similar folders. Headless Chromium doesn't write that file. Fix:
  1. Start Chromium with `--user-data-dir=/root/.config/chromium --remote-debugging-port=9222`.
  2. Write the file yourself from `/json/version`: the port, then the `/devtools/browser/<id>` path.
- **Hard 5-second limit on every DevTools command.** Under SwiftShader:
  - `wait_for_load()` after a reload,
  - any `js()` while the Garage's 3D scene renders,
  - `await __apex.race('monza')`

  all fail with `_IPCResponseTimeout`. The page keeps going after the timeout, so fire the command, sleep in Bash, then check.
  `browser_exec` itself gives up after 60 s.
- `click_at_xy` sends mouse events, not touch. One Settings tap was ignored; a JavaScript `.click()` worked.
  For touch, use `cdp("Input.dispatchTouchEvent", …)`.
- It adds 🐴 to the tab title (`BH_TAB_MARKER=0` turns it off).
- Started by hand without the repo's GPU flags, its Chromium drew **fixed white bands** across the race view.
  The same Monza HUD through apex-tools' own Chromium was clean, so the bands came from the launch flags, not the game.
- It's another browser outside the apex lock. Kill it by its main process ID when done; `pkill -f` is blocked by the hook.

## js-debugger (`js-debugger`, 24 tools)

**Strengths**
- `debugger_collect`: set logpoints, wait, read, remove, all in one call. A logpoint on `tickBody` (`js/game.js:8342`)
  recorded 181 hits in 3 s (menu at 60 fps, 17 ms frames) without pausing the game.
- `debugger_break`: a conditional breakpoint returns the stack and locals in one call.
  Bare paths match any `?v=` (`js/game.js`).
- `debugger_exception_log` records caught and uncaught exceptions without pausing. A Monza race start: 0 exceptions.
- `debugger_listeners` (110 window listeners on the menu), `debugger_instances` (57 AudioNodes), for leak hunts.
- `debugger_incident` saves a JPEG plus the `__apex` state to `scratch/debug-incidents/`.
- `debugger_node_test` runs Node tests under the inspector with no browser: `docs-integrity` gave 39/39 in 4.2 s.

**Weak points**
- It only attaches, so it needs a Chromium with `--remote-debugging-port`. The Chrome DevTools and Playwright servers
  communicate over pipes, so it can't attach to their browsers.
- **A breakpoint in a per-frame loop re-pauses on the next frame** if you resume before removing it. Remove it, then resume.
- Safe evaluate refuses `matchMedia()` and storage reads as "possible side effect". Pass `allowSideEffects:true`.
- Locals come back in scope order with closure variables mixed in, capped at `maxLocals`. Useful values get crowded out,
  so evaluate a named expression instead.
- `listeners` and `instances` refuse while the page is paused.

## apex-tools (`apex-tools`, about 46 tools)

**Strengths**
- Knows the repo: track, camera, HUD-device (16) and UI-screen (60) lists come from `apex_catalog`.
- `apex_hud_shot`: one phone HUD cell, 41 measured elements, a findings list and a PNG (52 s).
  Boots with the repo's renderer flags.
- `apex_ui_fit` on `ios-iphone-landscape` models the notch (59 px left and right insets, 21 px bottom) and checks against
  the repo's own tap thresholds (24 px minimum, 52 px comfortable). The title screen has 17 buttons under 52 px, none under 24.
- `apex_eval {vm:true}`: no browser at all (Monza: 11 named turns, 24 corners, 7.7 s).
- `apex_track_audit`, `apex_doctor` (262 pass), `apex_who_is_on_it`, `apex_ci_status`: offline checks and fleet state.
- Takes `apex-browser.lock`, so its runs don't collide with each other.
- Long jobs run in the background (`apex_job_start` / `apex_job_status {wait}`), and results are saved to `artifacts/agent-output/`.

**Weak points**
- Compact output cuts every list to 3 items. You have to call `output_read {format:"collection", pointer}` to see the rest.
- Render timings measure the container, not the game: `apex_profile monza` gave a 2,055 ms median frame and
  2,169 ms render p95. Only the CPU spans mean anything here (physics 13 ms median, AI 2 ms).
- `apex_job_status {wait:120}` went over the tool's time limit and was moved to the background. Keep waits at 100 s or less.
- The lock doesn't cover the Chrome DevTools, Playwright or browser-use browsers (`apex_status` says so).

## Cross-cutting

- **Viewport plus touch is not a phone.** With 844×390, touch, a coarse pointer and DPR 2 but a desktop user agent,
  `GLX.isMobile` was false and the render tier was 0. With an iPhone user agent it was `isMobile:true` and tier 2,
  plus the iOS-only install banner. Every phone repro needs the user agent too.
- One browser at a time is up to you. Only apex-tools enforces it.
- Calling the game's API: `__apex.race('monza')` takes a string. Passing an object returns without starting a race.
