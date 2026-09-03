# Chrome DevTools MCP — Apex playbook (2026-08-12)

Measured recipes for the **40** tools exposed by
`tools/chrome-devtools-mcp.sh` (local `scratch/chrome-devtools-mcp` clone).
Interactive twin of Playwright — not a CI gate. Skills:
`.claude/skills/mcp-probe`, `.claude/skills/survey-ui-matrix`.

---

## Setup traps (measured)

1. **UI work:** `__apex.headless(true)` then hide `#game` before snapshots /
   screenshots. A live WebGL canvas blacks out MCP captures and burns ~20% CPU.
2. **File writes:** advertise MCP `roots` capability and answer `roots/list`
   with `file:///workspace` (and/or write under `/tmp`). Without that,
   `take_heapsnapshot` / `performance_*` / `lighthouse_audit` fail with
   `Access denied: … not within any of the configured workspace roots`.
3. **Snapshot uids** look like `1_12`, never bare `1`. Prefer
   `take_snapshot` → `click({uid})` over `getElementById` when checking a11y.
4. **`resize_page` is unreliable** on this shell — use `emulate` with the full
   viewport descriptor (`852x393x3,mobile,touch,landscape`), or Playwright MCP
   `browser_resize` (`tools/playwright-mcp.sh`; never both browsers at once).
5. **Park `about:blank`** before starting Playwright groups.
6. **DO NOT JUDGE LAYOUT FROM AN MCP SCREENSHOT ON THIS SHELL.** `take_screenshot`
   here produces images that disagree with the DOM, in both directions, and it
   misled this project three times in one session:
   - At `deviceScaleFactor: 3`, the title screen captured with **duplicated,
     offset copies** of real elements — ghost `TIME TRIAL` and `RACE A FRIEND`
     ~131px below their true positions — surviving a 1.5 s settle,
     `display: none` on the WebGL canvas, and a forced repaint.
   - At `deviceScaleFactor: 1`, the same screen captured with the entire brand
     column (`#menu-brand`, `APEX 26`) **missing**, plus a phantom
     `F1 DATA HUB / GARAGE` row above the fold — with every animation on the
     subtree awaited to completion and `getAnimations()` reporting none running.
   In every case `getBoundingClientRect` was right and the picture was wrong:
   the brand measured x=86 w=348 h=325 at `opacity: 1` while the PNG showed
   empty space, and `take_snapshot` listed 20 painted elements with no
   duplicates. A Playwright capture of the identical page
   (`node tools/ui/layout-audit.mjs --screens=title --viewports=… --shots`)
   rendered correctly both times.
   **So: measure with `evaluate_script`, and if you need a picture, take it with
   Playwright.** An MCP screenshot is fine for "is the app up, roughly", never
   for "does this element overlap that one". This is `docs/LAYOUT-AUDIT.md`'s "a
   finding is a claim about the probe" inverted — here the MEASUREMENT is the
   reliable half and the PICTURE is the claim, which is the opposite of the
   usual assumption and the reason it costs so much time.
7. **`emulate` may or may not reset page state — always check which screen is
   actually open.** Observed both ways in one session: one `emulate` call left
   the app back on the title screen (a measurement of `#select` then silently
   described the title), and a later one left five screens open from earlier
   navigation. Neither is announced. Before measuring, assert the screen you
   think you are on (`document.querySelectorAll(".screen")` filtered by
   `hidden`), or reload and re-navigate through the app's own controls. A probe
   that measures the wrong screen returns clean numbers, which is the failure
   mode hardest to notice.
8. **Reloading does not pick up edited `js/`/`css/`** — the shell's `?v=N` URLs
   are cached. Use `navigate_page` with `ignoreCache: true` after any source
   edit, or you will verify a fix that is not loaded and conclude it failed.

---

## Tool map (what to reach for)

| Concern | Tools |
|--------|--------|
| Layout / readable type | `emulate`, `evaluate_script`, `take_snapshot`, `take_screenshot` |
| Drive menus | `click` / `press_key` / `wait_for` on snapshot uids |
| Did JS die? | `list_console_messages` (`error`/`warn`) + `get_console_message` |
| Stale `?v=` / fat assets | `list_network_requests`, `get_network_request` |
| A11y score (current DOM) | `lighthouse_audit` `mode:"snapshot"` (not performance) |
| Boot / interaction cost | `performance_start_trace` / `stop` / `analyze_insight` |
| Phone realism | `emulate.cpuThrottlingRate` (e.g. 4) + optional `networkConditions` |
| Leaks | `take_heapsnapshot` → `compare_heapsnapshots` → `get_heapsnapshot_*` |

Full schemas: run `tools/cdmcp-cli.py list-tools` or initialise the MCP and call
`tools/list`.

---

## Recipes that paid off

### A11y walk (title → garage → career → settings)

`take_snapshot` after each open. Measured @ build 1131 / phone-land 115%:

- Every title / garage / career / settings control carried a quoted accessible
  name (no unnamed buttons).
- SETTINGS is a real `dialog "SETTINGS"`.
- Toggle-like settings (`STEER: TILT`, `GEARS: AUTO`, …) often omit
  `pressed` in the tree — AriaState uses other signals; treat missing `pressed`
  as a review item, not an automatic bug.
- Lighting/camera tuners correctly `disabled` out of race.

### Cold-boot performance

```
performance_start_trace({ reload:false, autoStop:false, filePath:"/tmp/…/boot.json.gz" })
navigate_page → http://127.0.0.1:<port>/?v=N
# wait __apex, headless+hide canvas
performance_stop_trace
```

Parse **`## insight set id: NAVIGATION_N`** lines whose URL is the game (ignore
`about:blank` / `NO_NAVIGATION`). Then:

```
performance_analyze_insight({ insightSetId:"NAVIGATION_1", insightName:"LCPBreakdown" })
```

Useful names seen on a title-screen boot: `LCPBreakdown`, `CLSCulprits`,
`RenderBlocking`, `NetworkDependencyTree`, `DocumentLatency`, `ForcedReflow`,
`Cache`, `Viewport`.

**Measured (local python http.server, build 1131, phone-land):**

- LCP **988 ms**, element `#title` (text) — **99.7% element render delay**,
  TTFB ~3 ms. The delay is the serial IIFE script wall, not document fetch.
- `RenderBlocking` lists essentially every `<script>` / CSS in `index.html`
  (expected for the no-bundle load order).
- `DocumentLatency`: compression FAILED on SimpleHTTP (Pages gzip is different).

### Clean menu heap cycle (no Lighthouse first)

Re-navigate before heaps. Open/close settings→garage→career→select ×5, then
`compare_heapsnapshots`.

Measured top deltas were Blink style/`<span>` caches and JS arrays (~MB scale),
not axe/Lighthouse strings. **If you run `lighthouse_audit` in the same page
before a heap, `get_heapsnapshot_duplicate_strings` is dominated by
`dequeuniversity.com/rules/axe/…` — false leak signal.**

### Track switch heap (canvas visible)

Monza → Spa → Monza with `__apex.race` / `go` / `snapCam`. Monza→Spa grew
`JSArrayBufferData` / arrays (mesh rebuild). Monza→Monza2 still showed
multi‑MB buffer growth — treat as a lead for mesh-cache eviction work, not a
shipped verdict (SwiftShader + one session).

### Lighthouse snapshot (title shell, build 1136+)

Accessibility **92**, Best Practices **100**, SEO **100**, Agentic **100**.
Only remaining LH fail: `user-scalable=no` (intentional for tilt/drive).
Meta description ships in the shell. Console issue
`Interactive element inside of a <summary>` (MUSIC/SOUND ON·OFF) is a
documented accordion tradeoff — do not relocate those toggles without
re-reading the audio-panel HTML comment.

### Boot performance (chrome-devtools `performance_*`)

- Local HTTP/1 `python3 -m http.server`: ~145 sync scripts, ~6 MB transfer,
  DCL ~3.8 s. LCP on `#title` is almost all **element render delay** behind
  that serial IIFE wall (Slow 4G lab: LCP ~4.8 s, TTFB ~5 ms).
- `rel=preload` for `tokens.css` + `components.css` clears render-blocking
  CSS on Fast 4G traces; non-title sheets use `media="print"
  onload="this.media='all'"` so tuner/garage/hud/data CSS leave the critical
  path.
- Heap @ title (~44 MB): duplicate `"Poly Haven contributors"` ×50 is asset
  credit strings — not a boot regression. Never run Lighthouse before a
  heap (axe URL pollution).

Do not chase SEO on the fan game shell unless product asks.

---

### Background measure (logged)

```
node tools/cdmcp-bg.mjs boot --port 3462   # returns immediately
tail -f artifacts/logs/cdmcp-measure.log
node tools/cdmcp-bg.mjs --status | --wait | --stop
```

Or: `python3 tools/cdmcp-measure.py full --bg --port 3462`.

Writes `artifacts/logs/cdmcp-measure.log` + `.json`. Watcher MUST anchor on the
reporter terminal line — same rule as Playwright groups:

```
until grep -qE "= run (passed|failed|timedout|interrupted)" artifacts/logs/cdmcp-measure.log
do sleep 15; done
grep -E "= run " artifacts/logs/cdmcp-measure.log | tail -1
```

Profiles: `boot` (network/console/LCP/lighthouse), `ui` (settings@90 +
garage@115 floors), `full` (boot+ui+heap; heap always on a fresh nav after
lighthouse). Client answers `roots/list` so snapshots land under
`artifacts/tmp/cdmcp-measure/`.

Never run while a Playwright group is in flight.

---

## Stdio client note

Cursor-hosted MCP catalogs may only expose `cursor-cloud`. Prefer the unified
bridge:

```
python3 tools/probe-mcp.py list-tools
python3 tools/probe-mcp.py call chrome_<tool> '<json>'
python3 tools/probe-mcp.py serve   # .mcp.json "probe" entry — every chrome_* + tinyfish_* tool
```

A bare `call` spawns a fresh Chromium per invocation and loses all page state
(measured 2026-08-17). For multi-call flows run
`python3 tools/probe-mcp.py chrome-start` first — one persistent browser
behind `127.0.0.1:3712` that `call` auto-routes to — and `chrome-stop` before
any Playwright run. Details in `.claude/skills/mcp-probe`.

Local agents can also drive chrome-devtools via `tools/chrome-devtools-mcp.sh run`
over stdio (`tools/cdmcp-cli.py`, `tools/ui-readable-survey-mcp.py`,
`tools/mcp-cli.mjs`). When writing a custom client, handle **server→client**
`roots/list` or restrict artifact paths to `/tmp`.
