---
name: ui-menu-a11y
description: "Use when menus, dialogs, Escape/back behavior, keyboard navigation, selected-state announcements, scroll affordances, UI scale, touch layout, or menu/HUD accessibility regressions are being changed or debugged."
---

## Overview

Menu correctness is one shared layer question plus declared screen exits: ask
`UiLayers` what is on top, and route Escape/back through the same button path a
player would use.

## When to Use

Use this for:

- Adding, removing, or restacking a menu/dialog/screen.
- Fixing Escape, BACK, focus, wheel/trackpad scroll, arrow-key navigation, or
  touch menu bugs.
- Changing `.sheet`, `.pane`, scroll regions, selected chips, UI scale, or HUD
  layout CSS.
- Debugging iPad/touch-only layout issues, especially after `zoom`,
  `getBoundingClientRect()`, or `(pointer: coarse)` changes.

Do **not** use this for:

- In-race driving input unless the bug is that a menu lets keys reach the car.
- Data-hub telemetry logic; use it only for the overlay's menu behavior.
- Renderer/canvas visuals outside menu/HUD layout.

## Quick Reference

| Surface | Owner | Contract |
|---|---|---|
| Topmost screen / input gate | `js/game/uilayers.js` | `UiLayers.top()` ranks `:modal` above any z-index; `UiLayers.gateOpen()` decides if keys may drive |
| Dialog top layer seam | `js/game/topmodal.js` | `hidden` remains source of truth; `<dialog>.showModal()` mirrors it |
| Escape/back | `data-esc-close`, `data-esc="none"` | Press the named control; do not invent a second close path |
| Desktop menu navigation | `js/game/menunav.js` | Redirect wheel only when no scroll region owns it; arrow keys move by geometry |
| Sheet layout classification | `js/game/sheetshape.js` | Writes `data-shape` / `data-pair` for CSS; JS consumers should not read it |
| Selected-state a11y | `js/game/ariastate.js` | Mirrors visual selected classes to `aria-pressed` unless semantics are already claimed |
| Scroll affordance | `js/game/scrollfade.js` | Measures menu scroll regions and writes fade/position CSS classes |

Commands:

```sh
node tools/pick-tests.mjs js/game/uilayers.js js/game/topmodal.js css/components.css
node tools/test-bg.mjs ui
npm run test:tooling-fast
```

Relevant specs in `test:ui`:

| Spec | What it tends to catch |
|---|---|
| `tests/menu-keyboard.spec.js` | Arrow-key movement, wheel redirect, open-layer targeting |
| `tests/ui-button-touch.spec.js` | Escape/back ladder, touch controls, dialog cancel paths |
| `tests/ui-scale.spec.js` | UI-size/zoom and coarse-pointer layout regressions |
| `tests/hud-layout.spec.js` | HUD safe-area, touch landscape, control docking |
| `tests/ui-desktop.spec.js`, `tests/ui-audit.spec.js` | Desktop/menu galleries and smoke coverage |

Deep references:

- `docs/research/PLATFORM-INPUT-NOTES.md`
- UI notes in `docs/AUDIT-2026-08.md`
- `check-changes` skill for picking/running validation groups.

## Workflow / Implementation

1. **Identify the layer first.**
   - If keys, wheel, or Escape go to the wrong place, inspect
     `UiLayers.top()`/`gateOpen()` before touching individual modules.
   - New full-screen overlays must be represented in `UiLayers.DEFS` unless they
     deliberately do not gate driving input.

2. **Use the declared close door.**
   - For real dialogs, let `TopModal` mirror `hidden` to `showModal()`/`close()`.
   - Add `data-esc-close="<button-id>"` to name the same action the visible back
     button uses.
   - Use `data-esc="none"` only for screens that must refuse Escape.

3. **Respect the platform top layer.**
   - A modal dialog has `z-index: auto`; do not sort it with
     `parseInt(zIndex)`.
   - `UiLayers` treats `:modal` as above every z-index. Keep any new ranking
     logic there, not in each consumer.

4. **Keep keyboard and wheel routing menu-local.**
   - `MenuNav` owns desktop wheel redirect and arrow-key focus movement.
   - Do not redirect a wheel gesture that already landed on a scroll region; a
     pinned pane should contain the gesture, not donate it sideways.
   - The photo/free-camera sub-layer is not a menu; arrows belong to the camera.

5. **Measure the actual thing CSS needs.**
   - `SheetShape` classifies `.sheet` geometry and writes attributes for CSS.
   - Do not replace it with viewport orientation: a portrait viewport can contain
     a wide sheet.
   - When a screen opens, classify in the same tick; waiting for only
     `ResizeObserver` creates a one-frame wrong layout.

6. **Make visual state audible.**
   - If a group of buttons uses `.active`, `.dh-active`, or an equivalent visual
     selected state, ensure `AriaState` observes that root/class or add explicit
     semantics (`aria-selected`, `aria-checked`, `role=option`, `role=tab`).
   - Keep HUD roots out of broad observers; the HUD mutates every frame.

7. **Handle touch/UI-scale geometry carefully.**
   - `.sheet` uses `zoom: var(--ui-scale)`; `getBoundingClientRect()` returns the
     scaled box.
   - On touch, `--ui-scale` defaults above 1.0, so raw-width arithmetic can be
     right on desktop and wrong on iPad.
   - `(pointer: coarse)` is the primary pointer only; use `any-pointer` when the
     question is "does any attached input exist?"

8. **Verify through the grouped tests.**
   - Run `npm run test:tooling-fast` for docs/load-order/style inventory checks.
   - Run `test:ui` via `tools/test-bg.mjs`; see `check-changes`.
   - If JS/CSS changed, use `bump-cache` before committing.

## Common Mistakes

- Closing a dialog by setting `open`/`close()` directly instead of changing
  `hidden`, which desynchronizes the app state machine.
- Adding a new screen to markup/CSS but not to `UiLayers`, `ScrollFade`, or
  `AriaState` where applicable.
- Handling Escape in a second bespoke code path instead of clicking the
  `data-esc-close` control.
- Ranking a `<dialog>` by z-index; the browser top layer is not orderable that
  way.
- Using viewport orientation as a proxy for sheet shape.
- Forgetting that `zoom` changes layout boxes, so touch UI scale changes all
  measured geometry.
- Using `requestAnimationFrame` for non-visual ARIA/scroll bookkeeping that must
  also run when rendering is suspended.
- Editing JS/CSS and forgetting the `?v=N` plus `version.json` cache bump.
