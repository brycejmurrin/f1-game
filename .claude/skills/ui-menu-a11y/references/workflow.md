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

6. **Make visual state audible.** If a group uses `.active` or
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
   If JS/CSS changed, `node tools/gen/gen-shell.mjs --check` (no cache bump: tags read `?v=dev` and the deploy stamps the hashes; after a `tools/manifest.cjs` change run `node tools/gen/gen-shell.mjs`) before commit.

### Pause settings overlay

Opening pause settings hides `#pausemenu` so only `#pmsettings` is visible.
Escape routes through `data-esc-close="pm-settings-close"` (same ladder in
`tests/specs/ui-button-touch.spec.js`). Scroll region:
`#pmsettings-inner .sheet-body.pane`.

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
- Editing JS/CSS and forgetting the cache bump.
