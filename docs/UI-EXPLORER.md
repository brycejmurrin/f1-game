# UI explorer

`node tools/ui/explorer.mjs all` produces `artifacts/ui-explorer/index.html` and
machine-readable evidence. Open the HTML directly in Chrome; no report server is
needed. Use `--out /absolute/directory` to keep a run outside the checkout.

The eight modes share one Chromium and run sequentially. The default screenshot
budget is 25; `--max-shots 0` collects DOM/ARIA without images. Capture-budget
exhaustion is partial coverage, never a pass. Probe completion and UI correctness
are distinct: inspect the findings even when the command exits zero.

Menus use the shipped Three.js path. Scene diagnostics default to explicit GLX
(`--scene-backend webgl2`) for software-rendered inspection. Use
`--scene-backend three` for renderer-specific investigation; its review-angle
presentations exceeded the local deadline during development. A GLX scene pass
does not establish Three.js pixel equivalence. The selected backend is recorded.
Scene diagnostics use an 800 × 500 viewport; review angles hide the HUD. Fresh
presentation and pixel checks run before pausing rendering for DOM/ARIA capture.

| Mode | What it does | Evidence and limits |
|---|---|---|
| `missions` | Fresh-profile journeys: wet Monaco, create a livery, find controls from a race | Real actionable clicks and saved replay recipes, Playwright traces, checkpoint screenshots. Guided routes are separate from independent discoverability testing. |
| `atlas` | Builds a graph from observed before/after states and actions | Catalog coverage, clickable state evidence and unexplored roots. Unvisited does not mean unreachable. |
| `transitions` | Samples a real settings transition while it happens | Serial timestamped filmstrip plus Chromium performance trace. Sample spacing includes screenshot cost; this is not fixed-frame-rate video. |
| `responsive` | Resizes an open settings sheet, rotates back, enlarges root text and samples keyboard focus in a touch context | DOM boxes, advisory target/overflow findings, ARIA and images. Chromium emulation does not establish Safari behavior; fixed-pixel text may not enlarge. |
| `faults` | Aborts or delays asset requests, tests offline reload, restores connectivity and exercises settings | Interception receipts, failed requests and recovery evidence. No intercepted request is reported as incomplete injection. Fresh contexts block service workers, so this is not a service-worker recovery test. |
| `accessibility` | Samples Tab traversal and Escape, captures accessible structure and names | Bounded focus history and DOM screening, not WCAG certification or a complete focus graph. Canvas geometry needs scene evidence. |
| `minimize` | Replays an exact declarative bug oracle in a fresh context per candidate and removes unnecessary actions | Original/minimized counts, replay budget, completeness and replay JSON. Baseline false, replay errors and budget exhaustion stay explicit. Deletion-1-minimal is not globally shortest. |
| `scene` | Reconstructs a supplied game frame, or investigates an explicit circuit station, then captures alternate views | Camera/visible-scene JSON, original reproduction, original screenshot and two orbits. Review angles use a measured local station and 600 m far plane; the original frame retains its original lens. An image alone cannot locate its world geometry. |

Examples:

```sh
node tools/ui/explorer.mjs --list
node tools/ui/explorer.mjs all --out artifacts/ui-explorer/review
node tools/ui/explorer.mjs responsive --max-shots 4
node tools/ui/explorer.mjs replay artifacts/ui-explorer/evidence/first-race-final.replay.json
node tools/ui/explorer.mjs minimize failing-scenario.json --max-attempts 8
node tools/ui/explorer.mjs scene --repro player-repro.json --reference reported-frame.jpg
node tools/ui/explorer.mjs scene --track monaco --frac 0.4
node tools/ui/explorer.mjs scene --track monaco --frac 0.4 --scene-views 45,225
```

A replay is data, not executable JavaScript. Actions are `click` (selector or exact
role/name), `fill`, `select`, `press`, `viewport`, `textScale`, `offline`, `reload`,
`wait`, `checkpoint` and explicit `scene`. The schema rejects unknown fields and
unbounded numbers. Bug oracles select a specific visible element, text, console
message, actual game track/weather/state, or layout finding. Console matching uses literal text, not injected code.
Attach a specific oracle before minimizing; reaching a generic timeout does not
prove the original defect reproduced. Every candidate begins with empty storage.

## Browser plugin missions

Generate a hint-free task for the connected Browser Use tool:

```sh
node tools/ui/explorer.mjs brief --mission first-race --url https://your-pinned-preview/
```

The JSON contains a bounded `task`, deadline and cost cap matching Browser Use's
automation arguments. Run it through the connected tool, then retain its actual
result alongside this report. A hosted browser cannot reach this container's
localhost automatically. Use a reachable preview pinned to the intended commit.
No independent plugin run is claimed by producing a task brief. The other mission
IDs are `customize-car` and `return-settings`. Goals contain no selectors or debug
API hints; compare their real action histories against guided routes to find
discoverability problems.

## Reviewing evidence

The HTML uses local relative assets and inline script/style, so it works through
`file://`. Search and status filters cover observations and findings; expand an
observation for actions, DOM state, console errors and replay instructions.
Open `*.trace.zip` using Playwright Trace Viewer. Import
`settings-performance.trace.json` into Chrome DevTools Performance.
Screenshots are visual evidence; DOM findings are advisory, not screenshot-based
assertions. Do not turn a screenshot difference alone into a confirmed bug.

No product files are changed by exploration. Fresh contexts isolate settings and
liveries. The toolkit uses the repository harness, occupancy lock and teardown,
refuses a busy software-rendering host, and does not run browsers in subagents.

Sources checked during design:

- [Playwright locators and ARIA snapshots](https://playwright.dev/docs/api/class-locator#locator-aria-snapshot)
- [Context routing and service workers](https://playwright.dev/docs/api/class-browsercontext#browser-context-route)
- [Playwright tracing](https://playwright.dev/docs/api/class-tracing)
- [Chromium tracing protocol](https://chromedevtools.github.io/devtools-protocol/tot/Tracing/)
- [Chrome Recorder](https://developer.chrome.com/docs/devtools/recorder/overview)
