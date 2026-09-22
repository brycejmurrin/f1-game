---
name: css-play
description: Use when iterating on one menu/HUD stylesheet or screen (a token or class change, before/after screenshots without a full layout audit), and when RESTRUCTURING screens, menus, dialogs, the DOM or the CSS class/token system: collapsing duplicate component families, adding or removing a screen layer, splitting index.html, height-responsive layout, or judging whether a CSS methodology (BEM/CUBE/ITCSS/utilities) is worth adopting. A single screen that is cramped, clips, or misbehaves on Escape/focus is ui-menu-a11y.
---

# Playing with menu / HUD CSS

Host the working tree, open **one** screen, dump structured DOM, edit `css/`,
hot-swap the stylesheet, screenshot. No cache bump in the loop.

## When to Use

- "Tweak the settings sheet", "the garage tabs wrap", "try this token".
- Before/after pixels of a named menu, plus boxes / computed styles.

**Not this skill:** whole matrix → **survey-ui-matrix**. Restructure / class
counts → `references/restructure.md`. One Escape/a11y bug → **ui-menu-a11y**.
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

Unknown screen: `--click "#mb-foo" --root "#id"`. Catalog ids are a subset of
`SCREENS` in `tools/ui/layout-audit.mjs`.

## Hard don'ts

1. **There is no cache bump.** `bump-cache` only stamps the deploy's staged copy; hot-swap is the reload. Regenerate
   once, last edit before commit, when the look ships.
2. **Hide `#game`.** A live canvas starves the compositor (survey-ui-matrix).
3. **Open through the app's buttons**, never `hidden = false` on a dialog.
4. **One browser at a time** — [mcp-probe traps](../mcp-probe/references/traps-chrome.md).
5. **Do not run `layout-audit` for one screen.** That is the matrix.
6. **A change to TYPE METRICS invalidates a pixel golden — re-bless in the SAME
   commit.** `tests/specs/menu-baseline.spec.js` holds six blessed PNGs; the
   title, select and garage screens are pixel-compared at a 1% tolerance. A
   font-size, tracking, weight or gap change relays text and blows that budget.
   `pick-tests` already selects the spec when `css/` changes, so the signal is
   there — the failure mode is pushing without running it. Regenerate on this
   box (goldens are portable; the runner and a dev container agree to within
   1-17 px) and REVIEW the diff, never accept it blind:

   ```sh
   npm test -- tests/specs/menu-baseline.spec.js            # does it still match?
   npm run test:baseline -- --update-snapshots              # re-bless all six; only the moved one changes
   ```

   Incident 2026-09-16: an 8px -> 9px garage tab label shipped without the
   re-bless. `menu-baseline` went red on the deploy branch, `needs: ci` never
   passed, and FIVE consecutive Pages runs (#2351-#2355) published nothing
   until another session blessed the golden.

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
