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
   viewport descriptor (`852x393x3,mobile,touch,landscape`).
5. **Park `about:blank`** before starting Playwright groups.

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

## Stdio client note

Cursor-hosted MCP catalogs may only expose `cursor-cloud`. Local agents drive
chrome-devtools via `tools/chrome-devtools-mcp.sh run` over stdio (see
`tools/cdmcp-cli.py`, `tools/ui-readable-survey-mcp.py`). When writing a custom
client, handle **server→client** `roots/list` or restrict artifact paths to
`/tmp`.
