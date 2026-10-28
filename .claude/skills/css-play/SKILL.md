---
name: css-play
description: "Use when tweaking one menu or HUD element (padding, font size, safe area, tap target) with screenshots, or restructuring screens, DOM or design tokens. Not for: a cramped screen → ui-menu-a11y; the whole-UI review → survey-ui-matrix; dead CSS → slim-bloat."
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

Routing rule (the same in both descriptions): a visual tweak on a NAMED element (more padding on
the pause chips, a bigger font) stays here; a screen that does not FIT or clips (short landscape
phone, UI scale) → **ui-menu-a11y**, which owns the diagnosis and hands back this edit loop.
Whole matrix → **survey-ui-matrix**.
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

Unknown screen or a sub-panel: `--click "#mb-foo" --root "#id"`. With `--screen`,
`--click` runs EXTRA clicks after the catalog path; only with `--root` (no catalog
id) does it REPLACE the path, so give the whole route: settings DISPLAY panel =
`--click "#mb-settings,#pm-open-display" --root "#pm-panel-display" --sel ".tune-row"`.
Door and screen ids drift: read them from `--list` (catalog ids are a subset of
`SCREENS` in `tools/ui/menu-screens.mjs`), not from this file.
Every step here is a browser run (Chromium via harness.mjs): session only, never a
subagent (AGENTS.md rule 10; bash-guard refuses it), never beside a Playwright group.
`--help`/`--list` need none. The default viewport is the phone touch shape (852×393);
Bryce's own is `--viewport 844x390` — shoot that first. `--desktop` is the exception.

Who owns a row (tune-row, set-row, the pause sheet and its chips): [references/loop.md §Who owns a row](references/loop.md#who-owns-a-row).
An edit that changes nothing on screen: a LATER `@layer` or a more specific rule wins (loop.md §3).

## Hard don'ts

1. **Hide `#game`.** A live canvas starves the compositor (survey-ui-matrix).
2. **Open through the app's buttons**, never `hidden = false` on a dialog.
3. **One browser at a time** — [mcp-probe traps](../mcp-probe/references/traps-chrome.md).
4. **Do not run `layout-audit` per edit or for one screen.** That is the matrix: once, as a restructure's before-count only.
5. **A change to TYPE METRICS invalidates a pixel golden — re-bless in the SAME
   commit.** `tests/specs/menu-baseline.spec.js` holds six blessed PNGs; the
   title, select and garage screens are pixel-compared at a 1% tolerance. A
   font-size, tracking, weight or gap change relays text and blows that budget.
   Which sheets select it is code, not prose: `node tools/ci/pick-tests.mjs`
   (group `baseline`) and `select-specs.mjs` (the spec) — when neither names it
   for your sheet, run the spec yourself (background, session only). Regenerate on
   the platform CI uses (SwiftShader parity; the spec header says why) and REVIEW the
   diff, never accept it blind:

   ```sh
   node tools/ci/test-bg.mjs --spec tests/specs/menu-baseline.spec.js   # does it still match?
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

## Evidence handoff

Use `--tokens` for computed design-token/control evidence. Build offline screenshot
reviews from the emitted `review.json` with `tools/ui/review-captures.mjs`.
See [free design tooling](../../../docs/DESIGN-TOOLS.md) for bounded manifests and
comparison controls. Accessibility scanning and interpretation stay with
**ui-menu-a11y**; existing browser ownership rules apply.
