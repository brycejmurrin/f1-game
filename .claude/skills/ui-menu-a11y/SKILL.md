---
name: ui-menu-a11y
description: "Use when menus, settings, dialogs, Escape/back behavior, keyboard navigation, selected-state announcements, screen-reader output, scroll affordances, UI scale, touch layout, a cramped or clipped screen (short landscape phone), or menu/HUD accessibility regressions change. DOM/class restructure or the token system is css-play; the full matrix → survey-ui-matrix. In-race driving input → input-controls."
---

# Menu / HUD accessibility

One shared layer question plus declared screen exits: ask `UiLayers` what is
on top, and route Escape/back through the same button path a player would use.

A cramped / clipped single screen (short landscape phone, UI scale) is diagnosed
and fixed here; **css-play** only supplies the edit loop.

## Where things live (HUD / menus / a11y)

| Area | Path | Symbols to open first |
|---|---|---|
| In-race HUD DOM | `js/ui/hud.js` | `GameHud.create(G)` → `updateHud`, `invalidateFit`, `syncPhoneFit`; dock/lane fit (`fitHud`, `_dockL`/`_dockR`); `paintHudDelta`; flag chip via `cautionInfo()` |
| HUD layout prefs | `js/ui/hud-layout.js`, `js/ui/hud-elements.js`, `js/ui/dock-layout.js` | `HudLayout.apply`, `HudElements.apply` (both call `GameHud.invalidateFit()`) |
| Strategy/tyre HUD panels | `js/ui/hud-strategy.js`, `js/ui/hud-tyres.js` | Opt-in race panels — not the main tower |
| Layer / Escape gate | `js/ui/layers.js`, `js/ui/modal.js` | `UiLayers.top()`, `anyOpen()`; driving keys gated with **input-controls** |
| Agent probes (HUD/menu) | `js/agent/apex.js` | `__apex.render({what:"view"|…})`, `physState()`, `inputState()` (gate + focus), `agentHelp()` manifest |
| UI scale | `js/ui/scale.js` | the scale knob and `zoom` (workflow step 7) |
| Static HUD shell | `index.html` + `css/hud.css`, `css/touch-controls.css` | `#game` overlay ids (`#hud-*`, `.touchbtn`); class toggles from `hud.js` |

Menu-only work rarely needs `game.js`; race HUD numbers come from `G.player` / `G.cars` each `updateHud` tick.

## Quick Reference

Layer gate, dialog seam, `data-esc-close` door, `MenuNav`, `SheetShape`, `AriaState`
and `ScrollFade` (all `js/ui/<kebab>.js`): contracts in workflow steps 1-6 below.

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
