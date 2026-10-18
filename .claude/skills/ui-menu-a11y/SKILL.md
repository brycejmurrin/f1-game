---
name: ui-menu-a11y
description: "Use when menus, settings, dialogs, Escape/back behavior, keyboard navigation, selected-state announcements, screen-reader output, scroll affordances, UI scale, touch layout, a cramped or clipped screen (short landscape phone), or menu/HUD accessibility regressions change. DOM/class restructure or the token system is css-play; the full matrix → survey-ui-matrix. In-race driving input → input-controls."
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
- A cramped / clipped / cut-off single screen, a short landscape phone, UI scale:
  this skill owns the diagnosis and fix; **css-play** only supplies the edit loop.

Not for in-race driving input, hub tab logic, whole-matrix review or restructure:
see the description for the owning skills (restructure: css-play
`references/restructure.md`).

## Where things live (HUD / menus / a11y)

| Area | Path | Symbols to open first |
|---|---|---|
| In-race HUD DOM | `js/ui/hud.js` | `GameHud.create(G)` → `updateHud`, `invalidateFit`, `syncPhoneFit`; dock/lane fit (`fitHud`, `_dockL`/`_dockR`); `paintHudDelta`; flag chip via `cautionInfo()` |
| HUD layout prefs | `js/ui/hud-layout.js`, `js/ui/hud-elements.js`, `js/ui/dock-layout.js` | `HudLayout.apply`, `HudElements.apply` (both call `GameHud.invalidateFit()`) |
| Strategy/tyre HUD panels | `js/ui/hud-strategy.js`, `js/ui/hud-tyres.js` | Opt-in race panels — not the main tower |
| Layer / Escape gate | `js/ui/layers.js`, `js/ui/modal.js` | `UiLayers.top()`, `anyOpen()`; driving keys gated with **input-controls** |
| Agent probes (HUD/menu) | `js/agent/apex.js` | `__apex.render({what:"view"|…})`, `physState()`, `inputState()` (gate + focus), `agentHelp()` manifest |
| Static HUD shell | `index.html` + `css/hud.css`, `css/touch-controls.css` | `#game` overlay ids (`#hud-*`, `.touchbtn`); class toggles from `hud.js` |

Menu-only work rarely needs `game.js`; race HUD numbers come from `G.player` / `G.cars` each `updateHud` tick.

## Default-first visual verification

Follow AGENTS.md’s UI review baseline: fresh shipped appearance and device input defaults first; stress scales,
imported settings and legacy looks are separately labelled comparisons. Record requested scale and painted zoom.
Inspect original full-size images with DOM/computed-style evidence. Thumbnails and zero inspector findings are
insufficient. Exercise real scrolling both ways, the final action, keyboard focus visibility, and state retention
through resizing and disclosure changes. Capture initial, mid-scroll, end, return, open/closed, and focus/rotation checkpoints. Show individual original captures when reporting usability.

## Quick Reference

| Surface | Owner | Contract |
|---|---|---|
| Topmost / input gate | `js/ui/layers.js` | `top()` ranks `:modal` above z-index; `anyOpen()` gates driving keys |
| Dialog seam | `js/ui/modal.js` | `hidden` is source of truth; `showModal()` mirrors it |
| Escape/back | `data-esc-close`, `data-esc="none"` | Press the named control |
| Desktop nav | `js/ui/menu-nav.js` | Redirect wheel only when no scroller owns it |
| Sheet class | `js/ui/sheet-shape.js` | Writes `data-shape` / `data-pair`; JS must not read it |
| Selected a11y | `js/ui/aria-state.js` | Mirrors visual selected → `aria-pressed` unless claimed (select-screen chips/tiles write their own) |
| Scroll fade | `js/ui/scroll-fade.js` | Measures regions; writes fade/position classes |

```sh
node tools/ci/pick-tests.mjs js/ui/layers.js js/ui/modal.js css/components.css
node --test tests/unit/menu-a11y-audit.test.mjs   # Escape/door/layer pins, no browser
npm test -- tests/specs/menu-keyboard.spec.js   # BROWSER, background (AGENTS.md rules 4-5); also ui-button-touch, ui-scale
node tools/ci/remote-group.mjs ui          # the whole `ui` group, on the PUSHED branch
node tools/ci/test-bg.mjs gallery          # BROWSER: ui-audit captures — read the PNGs
npm run test:tooling-fast
```

`tests/specs/ui-audit.spec.js` asserts nothing — it is a capture harness.
Deep refs: `docs/research/PLATFORM-INPUT-NOTES.md`,
`docs/notes/ARCHITECTURE-REVIEW.md` (repo root).

## Load on demand

- Layer/Escape/zoom implementation, pause-settings overlay, mistakes →
  [references/workflow.md](references/workflow.md).
