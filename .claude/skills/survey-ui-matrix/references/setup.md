# UI-matrix setup ritual and screen enumeration

Load this before the first measurement. The SKILL.md index is the axes only.

## The setup ritual — all four steps, in order

Playwright MCP (preferred for resize / a11y / CSS):

```
browser_navigate   http://127.0.0.1:3456/index.html
browser_resize     width: 852, height: 393
browser_evaluate   hide #game + __apex.headless(true)  (body below)
browser_snapshot   boxes: true
```

Chrome DevTools MCP (emulate string; `resize_page` is unreliable here):

```
mcp__chrome-devtools__emulate      viewport: "852x393x3,mobile,touch,landscape"
mcp__chrome-devtools__navigate_page  http://localhost:3456/index.html
```

Start the server first (`python3 -m http.server 3456`), then in
`browser_evaluate` / `evaluate_script`:

```js
await new Promise(r => { const t = setInterval(() => {
  if (window.__apex && window.__apex.race) { clearInterval(t); r(); } }, 100); });
window.__apex.headless(true);
const g = document.getElementById('game');
if (g) g.style.visibility = 'hidden';
await new Promise(r => setTimeout(r, 500));
```

1. **`headless(true)` first.** The 3D scene starves the compositor.
2. **Hide `#game` before any screenshot.** MCP captures are correct once the
   WebGL canvas is hidden (`docs/archive/research/UI-SCALE-AND-ZOOM.md`
   blamed the MCP; re-measured 2026-08-08, the canvas was the problem).
3. **Bump `?v=N` + `version.json` BEFORE you reload** after a CSS/JS edit.
   Cost: a `min-height` fix measured as "not applied" because the browser
   served cached `menus.css`.
4. **Park the browser (`navigate_page about:blank`) before starting
   Playwright.** A live game page in the MCP browser held 21.7% CPU.

### Verify the instrument

```js
return { viewport: innerWidth + 'x' + innerHeight, dpr: devicePixelRatio,
  coarse: matchMedia('(pointer: coarse)').matches,
  bodyClass: document.body.className || '(none = touch)',
  tapRoot: getComputedStyle(document.documentElement).getPropertyValue('--tap').trim(),
  tapBody: getComputedStyle(document.body).getPropertyValue('--tap').trim(),
  uiScale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(),
  build: document.querySelector('script[src*="game.js"]').src.match(/v=(\d+)/)[1] };
```

`tapRoot` and `tapBody` differing IS the calibration — if they match you are
on a desktop pointer. `build` catches a stale cache.

### Tools that are not screenshots

- **`take_snapshot`** — a11y tree as text, with uids. Title screen is 14
  lines vs a 2556x1179 PNG. Drive menus with `click({uid})`.
- **`list_console_messages`** (`types: ["error","warn"]`) — a layout that
  only looks right because a script died is not right.
- **`lighthouse_audit`** (`mode: "snapshot"`) — expensive; do not run it
  while a Playwright suite is. Write reports under `artifacts/` (or
  negotiate MCP roots).

**Chrome `resize_page` does not reliably take on this page** — use `emulate`
with the full descriptor string, or Playwright MCP `browser_resize`.

**Serve on a port the test suite is not using** (3457) so a survey cannot
interfere with a run in flight. Chrome setup / park-before-Playwright:
`mcp-probe` `references/traps.md` §1.

## Enumerate screens FROM SOURCE

```sh
grep -nE '<dialog[^>]*id="[^"]+"' index.html
grep -nE '<div[^>]*class="[^"]*screen' index.html
grep -n "DEFS" -A 40 js/ui/layers.js
grep -n "data-shape\|data-pair" css/*.css js/ui/sheet-shape.js
```

Cross-check against `SCREENS` in `tools/ui/layout-audit.mjs`. A root present in
`index.html` and absent from `SCREENS` is a screen nobody measures.

Remember sub-views: `#career` is new-career SETUP *and* the season hub;
`#carsetup` is parts/livery/team/wheels. Measuring a root once is measuring
it once, not measuring the screen.
