---
name: css-play
description: Use when iterating on Apex 26 menu/HUD CSS for a specific screen or sheet, trying a token or class change, or wanting before/after screenshots of a page without a full layout-audit. Not for whole-matrix review (survey-ui-matrix), restructure decisions (restructure-screens-css), or canvas/3D shots (playwright-probe).
---

# Playing with menu / HUD CSS

Host the working tree, open **one** screen, dump structured DOM, edit `css/`,
hot-swap the stylesheet, screenshot. No cache bump in the loop.

## When to Use

- "Tweak the settings sheet", "the garage tabs wrap", "try this token".
- Before/after pixels of a named menu, plus boxes / computed styles.

**Not this skill:** whole matrix → **survey-ui-matrix**. Restructure / class
counts → **restructure-screens-css**. One Escape/a11y bug → **ui-menu-a11y**.
Canvas / 3D → **playwright-probe**.

## Command

```sh
node tools/ui/css-play.mjs --list
node tools/ui/css-play.mjs --screen settings
node tools/ui/css-play.mjs garage --sel "#cs-tabs" --css css/carsetup.css
./tools/playwright-mcp.sh play --screen settings
./tools/playwright-mcp.sh dom  --screen settings --sel .sheet
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
4. **Park / close Playwright** before `test-bg` or Chrome MCP.
5. **Do not run `layout-audit` for one screen.** That is the matrix.

Live MCP session (already on localhost): `browser_resize` →
`browser_evaluate` the `collectDomInfo` body from `css-play.mjs` →
`browser_take_screenshot`. Hide `#game` first.

## Load on demand

- Screen catalog, DOM fields, hot-swap traps →
  [references/loop.md](references/loop.md).
