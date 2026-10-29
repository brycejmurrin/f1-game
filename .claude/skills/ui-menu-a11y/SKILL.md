---
name: ui-menu-a11y
description: "Use when menus, settings or dialogs misbehave: Escape or back, focus, keyboard navigation, screen readers, scrolling, UI scale, touch layout, or a cramped landscape phone screen. Not for: one element's styling → css-play; the whole-UI review → survey-ui-matrix; driving input → input-controls."
---

# Menu / HUD accessibility

One shared layer question plus declared screen exits: ask `UiLayers` what is
on top, and route Escape/back through the same button path a player would use.

A screen that does not FIT or clips (short landscape phone, UI scale) is diagnosed
and fixed here; **css-play** supplies the edit loop. A visual tweak on a NAMED element
(padding, font-size on one control) starts in **css-play** (same rule in both descriptions).

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

## Default-first visual verification

Bryce's profile first — 844×390 landscape, touch (AGENTS.md §Coordination): one cell is
`node tools/ui/layout-audit.mjs --viewports=ios-iphone-landscape-844 --screens=<id>` (parent only; the default
`ios-iphone-landscape` is 852×393, not his phone). Then shipped settings, stress cases labelled separately:
**survey-ui-matrix** §Default-first visual verification (one copy).

## Quick Reference

`apex_ui_inspect` / `apex_ui_diff` (MCP): one screen's DOM and its before/after without a screenshot.

Layer gate, dialog seam, `data-esc-close` door, `MenuNav`, `SheetShape`, `AriaState`
and `ScrollFade` (all `js/ui/<kebab>.js`): contracts in workflow steps 1-6 below.

```sh
node tools/ci/pick-tests.mjs js/ui/layers.js js/ui/modal.js css/components.css
node --test tests/unit/menu-a11y-audit.test.mjs   # STATIC Escape/door/layer pins, no browser; behaviour needs the specs
node tools/ci/test-bg.mjs --spec tests/specs/menu-keyboard.spec.js   # BROWSER, one spec, background; also ui-button-touch, ui-scale
node tools/ci/remote-group.mjs ui          # the whole `ui` group, on the PUSHED branch
node tools/ci/test-bg.mjs --spec tests/specs/ui-audit.spec.js   # BROWSER: captures — read the PNGs (a subagent reports browser runs not run)
node tools/ci/tooling-fast.mjs --changed --jobs=3 --quiet
```

`tests/specs/ui-audit.spec.js` asserts nothing — it is a capture harness.
Deep refs: `docs/research/PLATFORM-INPUT-NOTES.md`,
`docs/notes/ARCHITECTURE-REVIEW.md`. First tap silent on iPhone (audio unlock on a user gesture) → **audio-debug**.

## Load on demand

- Layer/Escape/zoom implementation, "Escape does nothing", pause-settings overlay, mistakes →
  [references/workflow.md](references/workflow.md).

## Local automated evidence

The existing CSS loop accepts `--axe` to scan the opened screen with the locked
local axe-core package. See [free design tooling](../../../docs/DESIGN-TOOLS.md).
Retain incomplete checks for review; automated results do not replace the
keyboard, touch, screen-reader, focus, and scroll checks above.
