---
name: survey-ui-matrix
description: Use when systematically reviewing Apex 26's UI across orientations, viewport shapes, UI/HUD scale and pointer type — enumerating every screen from source, measuring each cell for clipping/truncation/tap-targets/overflow, and capturing screenshots. Use it to find layout defects before a restructure, to prove a CSS change did not regress another shape, or when asked to "check every menu on every device". For a single known layout bug use ui-menu-a11y; for the restructure decisions themselves use restructure-screens-css.
---

# Surveying the whole UI across the whole matrix

For a single known layout bug use `ui-menu-a11y`. Batch matrix: `tools/layout-audit.mjs`. Interactive probes/traps: [references/probes.md](references/probes.md).

A layout bug in this app is never "on a screen" — it is in a **cell of a matrix**:
screen x viewport x scale x pointer. `tools/layout-audit.mjs` measures that matrix
in Playwright and is the batch instrument. **This skill is the INTERACTIVE one**:
the Chrome DevTools MCP against a live page, where you can resize, re-measure and
look, in seconds per question rather than minutes per sweep.

**Measure with the MCP; capture with either — but read the traps first.** Every
number below was wrong at least once this session before the trap that produced it
was found.

---

## 0. The setup ritual — all four steps, in order

```
mcp__chrome-devtools__emulate      viewport: "852x393x3,mobile,touch,landscape"
mcp__chrome-devtools__navigate_page  http://localhost:3456/index.html
```

Start the server first (`python3 -m http.server 3456`), then in `evaluate_script`:

```js
await new Promise(r => { const t = setInterval(() => {
  if (window.__apex && window.__apex.race) { clearInterval(t); r(); } }, 100); });
window.__apex.headless(true);                       // 1. STOP THE RENDER LOOP
const g = document.getElementById('game');
if (g) g.style.visibility = 'hidden';               // 2. HIDE THE CANVAS
await new Promise(r => setTimeout(r, 500));         // 3. let layout settle
```

1. **`headless(true)` first.** The 3D scene starves the compositor; every wait and
   every capture is an order of magnitude slower without it.
2. **Hide `#game` before any screenshot.** `docs/archive/research/UI-SCALE-AND-ZOOM.md`
   records MCP captures of this page coming back with the left 400px solid black
   and concludes "measure with the MCP, capture with Playwright". **That conclusion
   is too broad** — re-measured 2026-08-08, MCP captures are correct once the WebGL
   canvas is hidden. The canvas was the problem, not the MCP.
3. **BUMP `?v=N` + `version.json` BEFORE you reload**, every time you edit CSS or
   JS. Cost this session: a `min-height` fix measured as "not applied" for two
   rounds because the browser served the cached `menus.css?v=1041` that predated
   the edit. The CSSOM told the truth — see the diagnostic in §5.
4. **Park the browser (`navigate_page about:blank`) before starting Playwright.**
   A live game page in the MCP browser held **21.7% CPU** and was a measurable
   contributor to a `test-solo` refusal and one false test failure.

### Verify the instrument before you trust it

One `evaluate_script` that proves the harness is measuring what you think. If any
line is wrong, every number after it is too:

```js
return { viewport: innerWidth + 'x' + innerHeight, dpr: devicePixelRatio,
  coarse: matchMedia('(pointer: coarse)').matches,
  bodyClass: document.body.className || '(none = touch)',
  tapRoot: getComputedStyle(document.documentElement).getPropertyValue('--tap').trim(),  // expect 44px
  tapBody: getComputedStyle(document.body).getPropertyValue('--tap').trim(),             // expect 52px on touch
  uiScale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(),
  build: document.querySelector('script[src*="game.js"]').src.match(/v=(\d+)/)[1] };     // vs version.json
```

`tapRoot` and `tapBody` differing IS the calibration — if they match you are on a
desktop pointer, not the touch ladder. `build` catches a stale cache before it
costs you a debugging round.

### The three tools worth using that are not screenshots

- **`take_snapshot`** — the a11y tree as text, with uids. The tool's own guidance
  is *"Prefer taking a snapshot over taking a screenshot"*, and it is dramatically
  cheaper: the title screen is **14 lines** against a 2556x1179 PNG. It also shows
  what a screenshot cannot — accessible names, roles, pressed/checked state, and
  the ABSENCE of landmarks. Use it as the default structural probe and reach for a
  screenshot only when the question is visual. Uids are compound (`1_12`); drive
  menus with `click({uid})` rather than guessing DOM ids when checking labels.
- **`list_console_messages`** (`types: ["error","warn"]`) — the layout-audit probe
  asks "did the page throw", and an interactive sweep should too. A layout that
  only looks right because a script died is not right.
- **`lighthouse_audit`** (`mode: "snapshot"`) — accessibility/SEO/best-practices
  scoring on the CURRENT state without a reload. Excludes performance, which is
  `performance_start_trace`. Expensive; do not run it while a Playwright suite is.
  Write reports under `/tmp` (or negotiate MCP roots) — see
  `docs/research/CHROME-DEVTOOLS-MCP.md`.

**`resize_page` does not reliably take on this page** — measured, it reported the
old viewport back. Use `emulate` with the full descriptor string instead; that
works every time.

**Serve on a port the test suite is not using.** Playwright starts its own server;
if you also need one, pick a different port (3457) so a survey can never interfere
with a run in flight.

---

## 1. Enumerate screens FROM SOURCE, never from a hand-kept list

A hardcoded screen list is how a screen stops being measured. Derive it:

```sh
# every dialog-based screen, with its declared back control
grep -nE '<dialog[^>]*id="[^"]+"' index.html
# every non-dialog screen root
grep -nE '<div[^>]*class="[^"]*screen' index.html
# the layer stack's own answer — the registry that gates input
grep -n "DEFS" -A 40 js/game/uilayers.js
# screens that are TWO layouts on one root (career setup vs hub, garage sub-tabs)
grep -n "data-shape\|data-pair" css/*.css js/game/sheetshape.js
```

Cross-check against `SCREENS` in `tools/layout-audit.mjs` — that table is the
executable inventory. **A root present in `index.html` and absent from `SCREENS`
is a screen nobody measures**, and is itself a finding worth reporting.

Remember sub-views: one root can be several layouts (`#career` is new-career SETUP
*and* the season hub; `#carsetup` is parts/livery/team/wheels). Measuring a root
once is measuring it once, not measuring the screen.

---

## 2. The axes, and why each is in the matrix

| axis | values worth running | why |
|---|---|---|
| viewport | `852x393` (primary play shape), `393x852`, `834x1194`, `1194x834`, `1440x900`, `1920x1080`, `1080x1920` | a portrait WINDOW can hold a landscape SHEET; the rotated monitor is the cell that keeps finding bugs |
| orientation | both, per device | not a proxy for sheet shape — see `data-shape` |
| UI scale | 80, 100, **115** (formerly the coarse-pointer default, now player-selectable), 130, 150 | `__apex.uiScale(n)`; the default is 100 on EVERY pointer (css/tokens.css) — run above it anyway, that is where the bugs are |
| HUD scale | same range, independently | `__apex.hudScale(n)` — they must not move together |
| pointer | `mobile,touch` vs desktop | `body.desktop` flips the whole density ladder |

`emulate` string form: `"<w>x<h>x<dpr>[,mobile][,touch][,landscape]"`.

**Always test 115, not just 100.** Three of this session's confirmed defects were
invisible at 100% and present at 115 — including a 61px panel overlap in the
garage. 115 was the coarse-pointer default when those were found; it ships at
1.0 on every pointer now (`css/tokens.css`, and `docs/research/PLATFORM-INPUT-NOTES.md`
records why), so 115 is a scale players dial rather than one they land on — the
cell still finds bugs, it just is not the default any more.

---

## Load on demand

- Probe JS (clip/trunc/tap/overflow) + screen routes + CSS-cache diagnosis + the measured mistake list → [references/probes.md](references/probes.md).
- Chrome setup / park-before-Playwright → `mcp-probe` `references/traps.md` §1.
