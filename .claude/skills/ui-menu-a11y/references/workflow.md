# Menu / a11y implementation and mistakes

Load this when adding a screen, wiring Escape, or chasing a touch/zoom
geometry bug.

## Workflow

1. **Identify the layer first.** If keys, wheel, or Escape go to the wrong
   place, inspect `UiLayers.top()` / `UiLayers.anyOpen()` before touching
   individual modules. New full-screen overlays must be added to the internal
   `DEFS` array in `js/ui/layers.js` (only `LAYER_IDS` is exported — do
   not assign `UiLayers.DEFS`).

2. **Use the declared close door.** For real dialogs, let `TopModal` mirror
   `hidden` to `showModal()`/`close()`. Add
   `data-esc-close="<button-id>"` to name the same action the visible back
   button uses. Use `data-esc="none"` only for screens that must refuse
   Escape.

3. **Respect the platform top layer.** A modal dialog has `z-index: auto`;
   do not sort it with `parseInt(zIndex)`. `UiLayers` treats `:modal` as
   above every z-index.

4. **Keep keyboard and wheel routing menu-local.** `MenuNav` owns desktop
   wheel redirect and arrow-key focus movement. Do not redirect a wheel that
   already landed on a scroll region. The photo/free-camera sub-layer is not
   a menu; arrows belong to the camera.

5. **Measure the actual thing CSS needs.** `SheetShape` classifies `.sheet`
   geometry and writes attributes for CSS. Do not replace it with viewport
   orientation: a portrait viewport can contain a wide sheet. Classify in the
   same tick a screen opens; waiting only for `ResizeObserver` creates a
   one-frame wrong layout.

6. **Make visual state audible.** If a group uses `.active`, `.on`, or
   an equivalent selected state, ensure `AriaState` observes that root/class
   or add explicit semantics (`aria-selected`, `aria-checked`, `role=option`,
   `role=tab`). Keep HUD roots out of broad observers.

7. **Handle touch/UI-scale geometry carefully.** `.sheet` uses
   `zoom: var(--ui-scale)`; `getBoundingClientRect()` returns the scaled box.
   On touch, `--ui-scale` defaults above 1.0, so raw-width arithmetic can be
   right on desktop and wrong on iPad. `(pointer: coarse)` is the primary
   pointer only; use `any-pointer` when the question is "does any attached
   input exist?"

8. **Verify.** `npm run test:tooling-fast`, then `node tools/ci/test-bg.mjs ui`.
   If JS/CSS changed, `node tools/gen/gen-shell.mjs --check` ([shell/cache](../../check-changes/references/bump.md): `?v=dev`, no bump) before commit.

### Pause settings overlay

Opening pause settings hides `#pausemenu` so only `#pmsettings` is visible.
Escape routes through `data-esc-close="pm-settings-close"` (browser ladder in
`tests/specs/ui-button-touch.spec.js`). Scroll region:
`#pmsettings-inner .sheet-body.pane`.

Back-stack (Escape/BACK goes to the wrong screen): Escape -> `TopModal`
`cancel`/`onEscape` (`js/ui/modal.js`) -> clicks `#pm-settings-close` ->
`js/game.js` `if (settingsNav.back()) closeSettings()`. `SettingsNav.back()`
(`js/ui/settings-tabs.js`) pops a page to `home` and returns `false`; only on
`home` does it return `true`, and `closeSettings()` then unhides `#pausemenu`
**only if `paused`** (title-menu settings, `#mb-settings`, has no pause menu to
return to, so it closes to the title). The pause key takes the same path via
`Input.init` `onPause`. Suspect `paused` / `state` first, then whether
`hidden` on `#pmsettings` was flipped by something other than the door.
Node-level pins (no browser, run singly):
`node --test tests/unit/menu-a11y-audit.test.mjs` (Escape/door lockstep, "repeated
keyboard Escape advances one dialog page"), `tests/unit/ui-improve-pass.test.mjs`
(SettingsNav on mini-DOM: BACK pops to home, then reports close),
`tests/unit/uilayers-modal-order.test.mjs` (`top()` ranking).

### A selected chip is not announced (track picker and kin)

Two paths, check which the control is on. (a) Hand-built groups set
`aria-pressed` themselves and toggle it in place: `js/ui/select-screen.js`
filter chips (`data-filter`), `#sel-daily`, and `.track-row` tiles (the click
handler re-writes `aria-pressed` on every tile; `aria-label` = circuit name, so
the compact strip that hides `.track-row-name` still speaks). `AriaState`
deliberately leaves these alone (`claimed()`: existing `aria-pressed` not in its
`labelled` set). (b) Class-only groups (`.active`/`.on`, no attribute) are
labelled by `AriaState` inside a `#`-root of `ROOTS`, after `setTimeout 0`, and
only once one sibling is on. No live region is involved: the state is read on
focus, and `#announce-live` (polite, `role=status`) is for `G.announce` text
only. Suspect in order: a rebuilt row that skipped the `aria-pressed` write;
a chip whose parent is not the button group (`syncGroup` walks direct children);
a root missing from `ROOTS`. Pins (no browser): `menu-a11y-audit.test.mjs`
("ScrollFade.SCREENS and AriaState.ROOTS cover every UiLayers layer",
"#announce is a live region", MenuNav landing on `aria-pressed='true'`) —
NOTHING node-level asserts that `select-screen.js` writes `aria-pressed` on the
tiles; the browser ladder is `tests/specs/menu-keyboard.spec.js`. A fix there
should add a source-regex pin to that unit file.

### Cramped single screen (phone shape, UI scale)

Static route: `SheetShape` writes `data-density="compact"` on the sheet
(`#sel-inner`); `css/menus.css` `#sel-inner[data-density="compact"] ...` drops
row names, elevation, and the `.track-row` `min-height` (deliberately below the
`--tap` rung, flags-only strip). Rungs live in `css/tokens.css`: `--tap` 44 /
`--chip-h` 40 on a mouse pointer, 52 / 46 on `body:not(.desktop)`, each
`max(N, 24px / --ui-scale)`. Pins: `menu-a11y-audit.test.mjs` (tap/chip rungs
and the `.sel-chip` boxes), `ui-improve-pass.test.mjs` ("compact catalogue
keeps a pannable toolbar"), `sheetshape-density-scale.test.mjs` (zoom-aware
density). Measured fit is BROWSER-only (`tools/ui/menu-fit.mjs`,
`ui-scale-axis.mjs`, `ui-scale.spec.js`); record the cell (viewport, scale,
pointer) and the unrun tool in the PR.

## Common mistakes

- Closing a dialog by setting `open`/`close()` directly instead of `hidden`.
- Adding a screen to markup/CSS but not to `UiLayers`, `ScrollFade`, or
  `AriaState`.
- A second Escape path instead of clicking the `data-esc-close` control.
- Ranking a `<dialog>` by z-index.
- Using viewport orientation as a proxy for sheet shape.
- Forgetting that `zoom` changes layout boxes.
- Using `requestAnimationFrame` for non-visual ARIA/scroll bookkeeping that
  must also run when rendering is suspended.
