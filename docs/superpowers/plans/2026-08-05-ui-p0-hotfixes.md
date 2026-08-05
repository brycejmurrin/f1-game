# UI P0 Hotfixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the P0 correctness repairs from the UI improvement program design so later type-scale / primitive / visual phases build on a sound shell.

**Architecture:** No new frameworks. Small CSS/JS contract fixes: restore `#track-detail` as a native `<dialog>`, extend `AriaState`, introduce a shared zoom-aware geometry helper before applying `--ui-scale` to the data hub, and close the known zoomed/unzoomed width and tap-target gaps.

**Tech Stack:** Vanilla IIFE JS, CSS cascade layers, Playwright specs in `tests/`, `tools/manifest.cjs` load order, `?v=` + `version.json` cache bump last.

**Spec:** [`docs/superpowers/specs/2026-08-05-ui-improvement-program-design.md`](../specs/2026-08-05-ui-improvement-program-design.md) §4 P0.

## Global Constraints

- No frameworks; `"use strict"` IIFE globals only.
- Phone landscape (852×393) is the hard legibility case.
- Do not edit `js/` or `css/` while a Playwright group is in flight.
- Bump `?v=N` and `version.json` to the same N as the **last** edit before each commit that changes JS/CSS.
- New `<script>` files must be added to both `index.html` and `tools/manifest.cjs`.
- Prefer measured fixes; do not refresh `menu-baseline` snapshots in P0 unless a dump proves an unavoidable intentional delta.
- Run at most one heavy Playwright group at a time on this box.

---

### Task 1: Restore `#track-detail` as a native `<dialog>`

**Files:**
- Modify: `index.html` (the `#track-detail` root around line 627)
- Modify: `css/track-detail.css` only if dialog UA styles fight the full-bleed layout (margin already zeroed)
- Test: `tests/menu-keyboard.spec.js` (Tab containment / `:modal` assertion)

**Interfaces:**
- Consumes: `TopModal` wires every `dialog.screen` via MutationObserver on `hidden`
- Produces: `#track-detail` matches `:modal` when open; Escape still routes through `data-esc-close="track-detail-close"`

- [ ] **Step 1: Write / confirm the failing assertion**

The existing spec already expects a real dialog:

```js
// tests/menu-keyboard.spec.js — "Tab cannot escape the track-detail dialog…"
expect(await page.evaluate(() =>
  document.getElementById("track-detail").matches(":modal")), "real top-layer dialog").toBe(true);
```

Run alone (quiet box first):

```sh
pgrep -cf pw-browsers; cat /proc/loadavg
mkdir -p artifacts/logs
node tools/run-playwright.mjs tests/menu-keyboard.spec.js -g "track-detail" --reporter=line \
  > artifacts/logs/p0-track-detail.log 2>&1
```

Expected: FAIL — element is a `DIV`, so `:modal` is false.

- [ ] **Step 2: Convert the markup**

Replace the opening/closing tags in `index.html`:

```html
<dialog id="track-detail" class="screen" aria-labelledby="track-detail-name" data-esc-close="track-detail-close" hidden>
  <!-- existing children unchanged -->
</dialog>
```

Remove `role="dialog"` and `aria-modal="true"` — the native dialog provides both. Keep `class="screen"` so `TopModal`’s `dialog.screen` query picks it up. Do **not** add `dim` (this overlay is opaque full-bleed, not a scrim-centred sheet).

- [ ] **Step 3: Re-run the track-detail keyboard spec**

```sh
node tools/run-playwright.mjs tests/menu-keyboard.spec.js -g "track-detail" --reporter=line
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
# bump cache last if CSS also changed; markup-only still needs ?v= if only HTML changed? 
# Shell version guard: HTML itself has no ?v= — bump version.json so PWAs reload shell.
```

Bump `version.json` `{ "build": 1019 }` and all `?v=` in `index.html` to `1019` (HTML structure change requires shell refresh).

```bash
git add index.html version.json css/track-detail.css
git commit -m "fix(ui): restore #track-detail as native <dialog>"
```

---

### Task 2: Extend `AriaState` for `.on` and missing roots

**Files:**
- Modify: `js/game/ariastate.js` (`ON`, `ROOTS`)
- Test: extend or add a focused assertion in `tests/menu-keyboard.spec.js` or a small unit-style evaluate in an existing ui spec

**Interfaces:**
- Consumes: visual class `.on` on tuner TIME/WEATHER chips, camera mode chips, Spotify shuffle/repeat
- Produces: those buttons get `aria-pressed` like `.active` / `.dh-active` groups (unless already `role=tab` / `aria-selected` / `aria-checked` — `claimed()` skips those)

- [ ] **Step 1: Confirm current miss**

In DevTools or a Playwright evaluate after opening the lighting tuner: a TIME chip with class `on` has no `aria-pressed`.

- [ ] **Step 2: Update constants**

```js
const ON = ["active", "dh-active", "on"];
const ROOTS = "#overlay,#select,#career,#career-offers,#career-history,#career-guide,#teampicker,#carsetup,#howtoplay,#advanced," +
  "#pmsettings,#pausemenu,#lighting,#camtune,#audioset,#results,#quali,#standings," +
  "#race-settings,#customize,#datahub,#track-detail,#vsfriend,#spotifypanel";
```

`claimed()` already skips `role=tab` with `aria-selected`. Camera tuner tabs that set `aria-selected` stay alone; chips that only use `.on` gain `aria-pressed`.

- [ ] **Step 3: Campicker**

`#campicker` is built on `document.body` outside ROOTS. If it uses `.on` without `aria-*`, either:
- append `,\#campicker` to ROOTS once the element exists at boot, **or**
- observe `document.body` with a filter (avoid) — prefer adding the id to ROOTS if the node is present in `index.html`, else call a one-line `AriaState.observe(el)` if such an API exists; if not, add `observe(root)` export that attaches the same MutationObserver pattern used for ROOTS.

Minimal path: if `#campicker` is created lazily, after creation ensure it is in the observer set (read `ariastate.js` end of file — extend `syncAll` / boot to also watch `#campicker` when inserted via a document-level childList observer already present, or add `#campicker` to ROOTS and re-query on each sync tick).

- [ ] **Step 4: Verify**

Open lighting tuner; selected TIME chip reports `aria-pressed="true"`. Run `test:tooling-fast` if any docs mention AriaState class lists.

- [ ] **Step 5: Commit** (with cache bump)

```bash
git commit -m "fix(a11y): AriaState mirrors .on and covers vsfriend/spotify"
```

---

### Task 3: ScrollFade inventory parity

**Files:**
- Modify: `js/game/scrollfade.js` `SCREENS` list
- Cross-check: `js/game/uilayers.js` `DEFS` (already includes vsfriend/audioset/spotifypanel/track-detail — do not duplicate DEFS; only extend ScrollFade)

- [ ] **Step 1: Diff inventories**

```sh
node -e "
const fs=require('fs');
const u=fs.readFileSync('js/game/uilayers.js','utf8');
const s=fs.readFileSync('js/game/scrollfade.js','utf8');
console.log('uilayers', [...u.matchAll(/id: \"([^\"]+)\"/g)].map(m=>m[1]));
console.log('scrollfade', s.match(/SCREENS = ([^;]+)/s)?.[1]);
"
```

- [ ] **Step 2: Add missing scrollable overlays to `SCREENS`**

At minimum append `#vsfriend,#spotifypanel` if they contain `.pane` regions. Skip layers with no scroll panes (adding them is harmless but useless). Do **not** add `#overlay` unless it has a `.pane`.

- [ ] **Step 3: Commit**

```bash
git commit -m "fix(ui): ScrollFade watches vsfriend and spotify sheets"
```

---

### Task 4: Shared zoom geometry helper (`DomGeom`)

**Files:**
- Create: `js/game/domgeom.js`
- Modify: `tools/manifest.cjs` (add after `log.js` / before consumers — early, before `menunav.js` / `sheetshape.js` / `game.js`)
- Modify: `index.html` script tag
- Modify: `js/game.js` garage lens (~4983–4985)
- Modify: `js/game/menunav.js` `nearestPane` / `scrollPane` sites
- Modify: `js/game/sheetshape.js` `classifyPair` to use **local** width (`clientWidth` or RO `contentRect`), not viewportRect
- Test: small evaluate probe in a new or existing spec, or `node --test` if a pure probe is extractable

**Interfaces:**
- Consumes: `Element.getBoundingClientRect()`, `element.currentCSSZoom`
- Produces:

```js
window.DomGeom = {
  // true if getBoundingClientRect returns PRE-zoom values (legacy WebKit)
  rectNeedsZoomScale: function () { /* cached boolean from boot probe */ },
  // DOMRect in real viewport CSS pixels
  viewportRect: function (el) { /* ... */ },
  // width in the element's local (unzoomed layout) space — for --pair-at etc.
  localWidth: function (el) { return el.clientWidth; }
};
```

- [ ] **Step 1: Implement boot probe + helpers**

```js
"use strict";
window.DomGeom = (function () {
  let needsScale = null;

  function probe() {
    if (needsScale != null) return needsScale;
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-9999px;top:0;width:100px;height:100px;zoom:2;";
    const inner = document.createElement("div");
    inner.style.cssText = "width:50px;height:50px;";
    host.appendChild(inner);
    document.documentElement.appendChild(host);
    const w = inner.getBoundingClientRect().width;
    host.remove();
    // If rect is already scaled, width ≈ 100; if pre-zoom, width ≈ 50.
    needsScale = w < 75;
    return needsScale;
  }

  function viewportRect(el) {
    const r = el.getBoundingClientRect();
    const z = el.currentCSSZoom || 1;
    if (!probe() || z === 1) return r;
    return new DOMRect(r.x * z, r.y * z, r.width * z, r.height * z);
  }

  function localWidth(el) {
    return el.clientWidth;
  }

  return { rectNeedsZoomScale: probe, viewportRect, localWidth };
})();
```

- [ ] **Step 2: Wire manifest + script tag** before `sheetshape.js` / `menunav.js` / `game.js`

- [ ] **Step 3: Garage lens uses viewport width for both sides**

```js
const panelFrac = clamp(
  DomGeom.viewportRect(panelEl).width / canvasEl.getBoundingClientRect().width,
  0, 0.85);
```

(`#game` is unzoomed; `getBoundingClientRect().width` ≡ `clientWidth` there — either is fine.)

- [ ] **Step 4: `sheetshape.js` — compare local width to `--pair-at`**

In `classify` / observer callbacks, pass `DomGeom.localWidth(el)` (or RO `contentRect.width`) into `classifyPair`, **not** `getBoundingClientRect().width`.

- [ ] **Step 5: `menunav.js` — nearestPane uses `viewportRect`; wheel delta divides by pane zoom when adding to `scrollTop`**

```js
const r = DomGeom.viewportRect(el);
// ...
pane.scrollTop = before + px / (pane.currentCSSZoom || 1);
```

Only adjust the redirect path that currently adds raw `deltaY` to `scrollTop`.

- [ ] **Step 6: Commit**

```bash
git commit -m "fix(ui): DomGeom viewport/local rects for zoom coordinate space"
```

---

### Task 5: Garage `--cs-sheet-px` for unzoomed `#cs-stack`

**Files:**
- Modify: `css/carsetup.css` (`--cs-sheet-w` declaration site and `#cs-stack` `right:`)

**Interfaces:**
- Mirror `--dock-px` pattern from `css/tuner.css`

- [ ] **Step 1: Publish painted width**

Beside `--cs-sheet-w` on `#carsetup`:

```css
#carsetup {
  --cs-sheet-w: min(100%, max(430px, 54vw), 500px);
  /* #cs-inner is zoomed; #cs-stack is not. Reserve the painted sheet width. */
  --cs-sheet-px: calc(var(--cs-sheet-w) * var(--ui-scale));
}
```

Update every media-query branch that sets `--cs-sheet-w` so `--cs-sheet-px` stays in sync (either recompute on `#carsetup` always from the live `--cs-sheet-w`, which custom properties do automatically if defined once as the calc above — **define `--cs-sheet-px` once** on `#carsetup` as `calc(var(--cs-sheet-w) * var(--ui-scale))` and only override `--cs-sheet-w` in queries).

- [ ] **Step 2: Consume in `#cs-stack`**

```css
#cs-stack {
  right: calc(var(--safe-r) + var(--cs-sheet-px) + var(--gap));
}
```

- [ ] **Step 3: Spot-check at 852×393, UI SIZE 115% and 150%** — camera bar must not slide under the panel.

- [ ] **Step 4: Commit**

```bash
git commit -m "fix(ui): --cs-sheet-px so garage controls clear the zoomed sheet"
```

---

### Task 6: Apply `--ui-scale` to the data hub (after DomGeom)

**Files:**
- Modify: `css/data.css` (`.dh-card` or `.dh-overlay > *`)
- Modify: `js/data/telemetry.js` scrubber (~942) to use `DomGeom.viewportRect` if the canvas lives inside the zoomed card
- Test: `tests/ui-scale.spec.js` already lists `"datahub"` — run that screen’s scale cases

- [ ] **Step 1: Zoom the card, not the overlay padding**

```css
.dh-card {
  zoom: var(--ui-scale);
  /* viewport units inside the card must use --vwz / --svhz */
}
```

Keep `.dh-overlay` safe-area padding **outside** zoom (same contract as `.screen`).

- [ ] **Step 2: Sweep viewport units inside `.dh-card`**

Replace live `vw`/`svh`/`dvh` inside the zoomed subtree with `--vwz` / `--svhz` equivalents (see `tokens.css`). Do not divide tokens that are already outside the card.

- [ ] **Step 3: Telemetry scrubber**

```js
const rect = DomGeom.viewportRect(canvas);
const x = ev.clientX - rect.left;
```

- [ ] **Step 4: Run ui-scale datahub coverage**

```sh
node tools/run-playwright.mjs tests/ui-scale.spec.js -g "datahub" --reporter=line
```

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(ui): data hub respects UI SIZE via zoom + DomGeom scrubber"
```

---

### Task 7: Tap targets + tuner duplicate block

**Files:**
- Modify: `css/data.css` `.dh-lane-x`
- Modify: `css/track-detail.css` `.tdc-close-btn`
- Modify: `css/tuner.css` delete duplicated photo-mode comment/rules (lines 74–87 duplicate 60–73)

- [ ] **Step 1: Raise targets**

```css
.dh-lane-x {
  width: var(--tap-sm); height: var(--tap-sm);
  /* was 20px — below house ladder */
}
.tdc-close-btn {
  width: var(--tap); height: var(--tap);
  /* was 36px */
}
```

- [ ] **Step 2: Delete the second identical photo-mode furniture block in `tuner.css`**

Keep the first `--dock-w` override + furniture `display:none` block; remove the duplicated comment + identical selectors that follow immediately.

- [ ] **Step 3: Commit**

```bash
git commit -m "fix(ui): tap floors for lane-remove/track-detail close; drop tuner dup"
```

---

### Task 8: P0 verification + PR update

- [ ] **Step 1: Cache bump once more if needed** so all P0 commits end on one consistent `?v=` (squash bump strategy: bump on each JS/CSS commit as required above).

- [ ] **Step 2: Quiet-box checks**

```sh
node tools/test-bg.mjs --stop
pgrep -cf pw-browsers   # expect 0
cat /proc/loadavg       # expect < 3
node tools/pick-tests.mjs js/game/ariastate.js js/game/domgeom.js js/game/menunav.js js/game/sheetshape.js css/data.css css/carsetup.css css/track-detail.css css/tuner.css index.html
```

- [ ] **Step 3: Start `ui` group in background; do not poll**

```sh
mkdir -p artifacts/logs
node tools/test-bg.mjs ui
```

Arm a completion watcher on the log; meanwhile update the program PR description with P0 checklist status.

- [ ] **Step 4: On completion, triage real failures only; re-run timing-shaped failures alone**

- [ ] **Step 5: Push branch; update PR**

---

## Spec coverage (self-review)

| P0 design item | Task |
|---|---|
| `#track-detail` → real `<dialog>` | Task 1 |
| `AriaState` `.on` + roots | Task 2 |
| UiLayers / ScrollFade / MenuNav inventory | Task 3 (+ UiLayers already OK) |
| `--cs-sheet-w` zoomed/unzoomed | Task 5 |
| `#datahub` `--ui-scale` | Task 6 (after DomGeom) |
| tuner.css duplicate | Task 7 |
| sub-`--tap` targets | Task 7 |
| `viewportRect` / A13 helper | Task 4 |

No placeholder steps. B4 / visual redesign explicitly out of P0.
