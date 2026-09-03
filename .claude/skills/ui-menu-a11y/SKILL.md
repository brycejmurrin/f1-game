---
name: ui-menu-a11y
description: "Use when menus, dialogs, Escape/back behavior, keyboard navigation, selected-state announcements, scroll affordances, UI scale, touch layout, or menu/HUD accessibility regressions are being changed or debugged. Single-screen bug only — full matrix → survey-ui-matrix. In-race driving input → input-controls."
---

# Menu / HUD accessibility

One shared layer question plus declared screen exits: ask `UiLayers` what is
on top, and route Escape/back through the same button path a player would use.

## When to Use

- Adding, removing, or restacking a menu/dialog/screen.
- Escape, BACK, focus, wheel/trackpad, arrow-key, or touch menu bugs.
- `.sheet` / `.pane` / selected chips / UI scale / HUD layout CSS.
- iPad/touch layout after `zoom`, `getBoundingClientRect()`, or
  `(pointer: coarse)` changes.

Do **not** use for in-race driving input (unless a menu leaks keys) —
**input-controls**. Data-hub tab logic → **data-hub**. Renderer/canvas
visuals outside menu/HUD layout are out. Whole-matrix review →
**survey-ui-matrix**. One-screen CSS try-on → **css-play**. Restructure
decisions → **css-play** (`references/restructure.md`).

## Quick Reference

| Surface | Owner | Contract |
|---|---|---|
| Topmost / input gate | `js/ui/layers.js` | `top()` ranks `:modal` above z-index; `anyOpen()` gates driving keys |
| Dialog seam | `js/ui/modal.js` | `hidden` is source of truth; `showModal()` mirrors it |
| Escape/back | `data-esc-close`, `data-esc="none"` | Press the named control |
| Desktop nav | `js/ui/menu-nav.js` | Redirect wheel only when no scroller owns it |
| Sheet class | `js/ui/sheet-shape.js` | Writes `data-shape` / `data-pair`; JS must not read it |
| Selected a11y | `js/ui/aria-state.js` | Mirrors visual selected → `aria-pressed` unless claimed |
| Scroll fade | `js/ui/scroll-fade.js` | Measures regions; writes fade/position classes |

```sh
node tools/pick-tests.mjs js/ui/layers.js js/ui/modal.js css/components.css
node tools/test-bg.mjs ui
node tools/test-bg.mjs gallery          # ui-audit captures — read the PNGs
npm run test:tooling-fast
```

`tests/specs/ui-audit.spec.js` asserts nothing — it is a capture harness.
Deep refs: `docs/research/PLATFORM-INPUT-NOTES.md`,
`../../../docs/notes/ARCHITECTURE-REVIEW.md`.

## Load on demand

- Layer/Escape/zoom implementation, pause-settings overlay, mistakes →
  [references/workflow.md](references/workflow.md).
