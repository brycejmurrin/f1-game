# External CSS/UI scaling practices vs Apex 26

Cross-check of modern (2024–2026) web research on adaptive UI, zoom, safe-area,
viewport height units, and fluid components against the Apex 26 implementation.
Dated 2026-08-19.

Companion to:

- `docs/archive/research/UI-SCALE-AND-ZOOM.md` (measured `zoom` × viewport-unit faults)
- `docs/archive/research/ZOOM-ORIENTATION-STRUCTURE-2026-08.md` (coordinate spaces)
- `docs/research/UI-DESIGN-PRINCIPLES.md` (phone-as-10ft-view rule)
- `js/game/ui-scale.js`, `js/game/hud.js` (`fitHud`), `css/tokens.css`

---

## 1. External toolkit (summary)

| Mechanism | External consensus | Apex 26 |
|-----------|-------------------|---------|---|---|---|---|---|---|---|
| CSS `zoom` | Layout-aware scale; viewport units inside zoomed subtrees overflow. | Primary scale for `--ui-scale` / `--hud-scale`. Compensated units address overflow. |
| `transform: scale()` | Visual only. Prefer for animations. | Not used for UI size knobs (correct). |
| `clamp()` + `cqi`/`vw` fluid type | Must stay `rem`-anchored for WCAG 1.4.4. | Tokens + player zoom give continuous control. |
| Container queries | Component-relative responsiveness. | Used on `.sheet`; density via `data-density` + `sheetshape.js`. |
| `env(safe-area-inset-*)` + `viewport-fit=cover` | Required for edge-to-edge mobile. | Wired as `--sat/--sab/--sal/--sar`. |
| Viewport height units | See §2. | House unit for layout caps is **`svh`**. |
| Dual scale (menus vs HUD) | Rare in generic web; natural for games. | Explicit: `--ui-scale` vs `--hud-scale`. |
| Measured collision caps | Preferred when clusters compete. | `fitHud()` measures intrinsic width / `currentCSSZoom`. |

**Verdict:** Apex 26 dual-zoom + measured caps + compensated units is stronger than generic responsive advice for a phone-first racing HUD.

---

## 2. Viewport height units — investigation

### Spec definitions (CSS Values & Units Level 4)

| Unit | Meaning | Changes when browser chrome moves? |
|------|---------|-------------------------------------|
| **`vh`** | Legacy; in modern browsers **= `lvh`** (large viewport) | No (fixed at max) |
| **`lvh`** | Large viewport — toolbars **retracted** / hidden | No |
| **`svh`** | Small viewport — toolbars **fully visible** | No |
| **`dvh`** | Dynamic viewport — **current** visible height | **Yes** — reflows as chrome slides |

On desktop (no dynamic chrome), all four resolve to the same value. On mobile Safari / Chrome Android, they diverge by the address-bar / toolbar height (often 50–100 CSS px).

### Behaviour matrix

```
Toolbars visible:   100svh  <  100dvh (= 100svh)  <  100lvh (= 100vh)
Toolbars hidden:    100svh  <  100dvh (= 100lvh)  =  100lvh (= 100vh)
```

### When to use which

| Use case | Recommended | Why |
|----------|-------------|-----|
| Modals, fixed overlays, metrics panel, menu height **caps** | **`svh`** | Guaranteed to fit on first paint with chrome visible; no mid-scroll reflow |
| Hero / immersive full-bleed after scroll | `lvh` (or legacy `vh`) | Fills max screen once chrome is gone |
| Sticky footers / chat shells tracking visible area | `dvh` | Live match — **but causes layout shift** |
| Type / gap clamps that should not jump | fixed `px`/`rem` or `svh`-anchored tokens | Avoid `dvh` in driving HUD |

### Apex 26 house rule (`css/tokens.css`)

> THE HOUSE UNIT FOR A LAYOUT CAP IS `svh`, NOT `vh`.
> `vh` is the LARGE viewport — height with toolbars retracted — so a
> `max-height: 80vh` modal on iOS is capped against space not on screen while
> the toolbar is showing. `svh` is the small viewport you are guaranteed.
> `dvh` is deliberately NOT the house unit: it changes as the toolbar slides,
> so anything sized against it re-lays-out mid-scroll (jitter).

This matches external guidance for stable overlays and is correct for a racing HUD / menu system.

### Audit of current usage (2026-08-19)

| Location | Unit | Status |
|----------|------|--------|
| `css/tokens.css` policy | `svh` | Correct house rule |
| `css/data.css` overlays | `100vh` fallback + `100svh` | Correct progressive pattern |
| `css/data.css` max-heights | `100svh` − safe areas | Correct |
| `css/responsive.css` select sheet | `78svh` | Correct |
| `js/game/cockpit-opts.js` metrics injector | `100svh` | Correct |
| `js/game/metrics-panel-style.js` | `100svh` | Correct |
| **`js/game/metrics.js` PANEL_STYLE (pre-fix)** | **`100dvh`** | **Fixed this change** |

Keyboard caveat: none of `svh`/`lvh`/`dvh` account for the on-screen keyboard. Prefer `visualViewport.height` in JS if input sheets clip.

---

## 3. Metrics panel safe-area fix

| Property | Before | After |
|----------|--------|-------|
| `right` | `8px` | `calc(8px + var(--sar, 0px))` |
| `max-width` | `100vw - 16px` | also subtracts `--sal` / `--sar` |
| `max-height` unit | `100dvh` | `100svh` |
| Bottom clearance | hard `70px` | `max(80px, calc(72px + var(--sab, 0px)))` |

`metrics.js` now owns the correct style at source (prefers `__METRICS_PANEL_STYLE`). Unit tests assert `--sar`, `100svh`, `--sab`, `--sal` and reject `100dvh`.

---

## 4. What not to change

1. Do not replace `zoom` with `transform: scale()` for UI/HUD size.
2. Do not introduce pure `vw`/`cqi` font sizes without a `rem` base.
3. Do not switch height caps from `svh` to `dvh`.
4. Do not collapse `--ui-scale` and `--hud-scale`.

---

## 5. File map

| Concern | File(s) |
|---------|---------|
| Scale knobs | `js/game/ui-scale.js` |
| HUD collision caps | `js/game/hud.js` (`fitHud`) |
| Tokens / safe-area | `css/tokens.css` |
| Metrics panel style | `js/game/metrics.js` |
| Metrics early override | `js/game/metrics-panel-style.js` |
| Metrics mount re-apply | `js/game/cockpit-opts.js` |
| Unit contract | `tests/unit/metrics.test.mjs` |
