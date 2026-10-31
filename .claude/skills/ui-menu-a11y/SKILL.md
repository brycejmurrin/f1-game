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
**survey-ui-matrix** `references/verification.md` §Default-first visual verification (one copy).

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
FLOWS (door/Escape, double-tap bleed, focus return, Back, persistence, search reset, rotation, D-pad reach) at
844×390 touch: `node tools/ui/flows.mjs [--checks=…] [--diff=<old flows.json>]` (parent-only browser; `--list`/`--help` none).
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

## Feedback measurement

Inspector output includes a separate bounded `feedback` inventory for nonempty
status/alert/live regions, including hidden descendants of an explicit root.
Its geometry and ARIA fields are observations: inactive panes and clipped
screen-reader announcements can be intentional. Summary rows say
`feedback-observation`, never an automatic accessibility failure.

For a journey requiring visible feedback, use the existing explorer replay:
`{"type":"assert","oracle":{"type":"feedback","selector":"#vs-status","text":"Paste their invite code first."}}`.
This requires one populated feedback element, matching rendered text and a fully inside
viewport/scrollport rectangle. It never scrolls, focuses or retries. CSS clips/masks, non-axis-aligned transforms and self-overflowing text remain
unmeasured. Occlusion, contrast and actual screen-reader delivery
need separate checks. Existing `text` and `visible` oracles keep their semantics.
Research and priorities: [agent UI measurement](../../../docs/notes/AGENT-UI-MEASUREMENT-2026-10-30.md).

## Focus after controls are rebuilt

Arm a read-only witness while the expected starting control is focused, before
triggering the application update:

```json
{"type":"rememberFocus","id":"before-refresh","selector":"#team"}
```

Keep the player's ordinary click/keypress separate. Then use:

```json
{"type":"assert","oracle":{"type":"focus","selector":"#team","afterReplacement":"before-refresh","timeoutMs":3000,"stableMs":150}}
```

The oracle requires the remembered node to be disconnected and a unique new
matching node to hold sampled focus. A different expected selector permits an
intentional focus transfer. Same-node reinsertion never proves replacement.
Sampling runs every50ms; target changes, mismatches and gaps over100ms restart
the stability window. Timelines retain64samples plus omission counts. Missing
witnesses, unobserved replacement, measured wrong focus and incomplete sampling
are distinct outcomes. A sampling gap is unmeasured time, not proof of a UI defect.

This v1 covers DOM replacement within one document. Updates retaining the old
node require a different completion witness; do not call their timeout a focus
failure. Each assertion consumes its witness; arm a fresh one for every update.
Reload clears witnesses; other navigation/evaluation errors propagate.
The check never focuses, scrolls or retries a player action. Sampling cannot prove
what happened between samples or after the observation window.
