---
name: css-play
description: "Use when iterating on one menu/HUD stylesheet or screen (a token or class change, before/after screenshots, no full layout audit), and when RESTRUCTURING screens, menus, dialogs, the DOM or the CSS class/token system: collapsing duplicate component families, adding or removing a screen layer, splitting index.html, height-responsive layout, or judging a CSS methodology (BEM/CUBE/ITCSS/utilities). Cramped screen: ui-menu-a11y; every screen: survey-ui-matrix; dead selectors: slim-bloat."
---

# Playing with menu / HUD CSS

Host the working tree, open **one** screen, dump structured DOM, edit `css/`,
hot-swap the stylesheet, screenshot. No cache bump in the loop (`bump-cache`
only stamps the deploy's staged copy).

## When to Use

- "Tweak the settings sheet", "the garage tabs wrap", "try this token".
- Before/after pixels of a named menu, plus boxes / computed styles.
- Restructuring screens, the DOM or the class/token system (duplicate component
  families, a screen layer, splitting `index.html`, class counts) →
  [references/restructure.md](references/restructure.md) first.

**Not this skill:** a cramped / clipped screen, a short landscape phone, UI scale
(**ui-menu-a11y** owns the fit; this skill keeps the edit loop once you are in it); whole matrix → **survey-ui-matrix**.
One Escape/a11y bug → **ui-menu-a11y**.
Canvas / 3D → **playwright-probe**.

## Command

```sh
node tools/ui/css-play.mjs --list
node tools/ui/css-play.mjs --screen settings
node tools/ui/css-play.mjs garage --sel "#cs-tabs" --css css/carsetup.css
./tools/mcp/playwright-mcp.sh play --screen settings
./tools/mcp/playwright-mcp.sh dom  --screen settings --sel .sheet
```

`--css css/menus.css` reloads that `<link>` as `?play=<mtime>` (server is
`no-store`). `--inject ".sheet{…}"` is an overlay. Output:
`artifacts/css-play/<screen>-<stamp>/{shot.png,dom.json,meta.json}`.

Unknown screen or a sub-panel: `--click "#mb-foo" --root "#id"`. `--click`
REPLACES the catalog path, so give the whole route: settings DISPLAY panel =
`--click "#mb-settings,#pm-open-display" --root "#pm-panel-display" --sel ".tune-row"`
(door ids: `pm-open-{controls,driving,display,appearance,files}`, `pm-advanced`,
`pm-audio`). Catalog ids are a subset of `SCREENS` in `tools/ui/menu-screens.mjs`.
Every step here needs a browser (Chromium via harness.mjs); `--help`/`--list` do not.

Who owns a row (tune-row, set-row, the pause sheet): [references/loop.md §Who owns a row](references/loop.md#who-owns-a-row).

## Hard don'ts

1. **Hide `#game`.** A live canvas starves the compositor (survey-ui-matrix).
2. **Open through the app's buttons**, never `hidden = false` on a dialog.
3. **One browser at a time** — [mcp-probe traps](../mcp-probe/references/traps-chrome.md).
4. **Do not run `layout-audit` for one screen.** That is the matrix.
5. **A change to TYPE METRICS invalidates a pixel golden — re-bless in the SAME
   commit.** `tests/specs/menu-baseline.spec.js` holds six blessed PNGs; the
   title, select and garage screens are pixel-compared at a 1% tolerance. A
   font-size, tracking, weight or gap change relays text and blows that budget.
   Which sheets select it is code, not prose: `node tools/ci/pick-tests.mjs`
   (group `baseline`) and `select-specs.mjs` (the spec) — when neither names it
   for your sheet, run the spec yourself. Regenerate on this box and REVIEW the
   diff, never accept it blind:

   ```sh
   npm test -- tests/specs/menu-baseline.spec.js            # does it still match?
   npm run test:baseline -- --update-snapshots              # re-bless all six; only the moved one changes
   ```

   Skipping the re-bless has left `menu-baseline` red on the deploy branch and blocked Pages.

Live MCP session (already on localhost): `browser_resize` →
`browser_evaluate` the `collectDomInfo` body from `css-play.mjs` →
`browser_take_screenshot`. Hide `#game` first.

## Load on demand

- Screen catalog, DOM fields, hot-swap traps →
  [references/loop.md](references/loop.md).
- **Restructuring** — the before-numbers you must record (a restructure with no
  before/after count is an opinion), and the governing question *does it reduce
  a COUNT, or does it rename things?* →
  [references/restructure.md](references/restructure.md); the 15 checkable
  rules (screens/layers, CSS variation, DOM size, anti-methodology) in
  [references/restructure-screens-css-rules.md](references/restructure-screens-css-rules.md).
