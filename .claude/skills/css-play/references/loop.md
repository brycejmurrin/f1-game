# CSS-play loop — screens, DOM dump, hot-swap

Load from the SKILL.md index when opening a non-catalog screen, reading a
`dom.json`, or a swap "did nothing".

## 1. Host + open

`tools/ui/css-play.mjs` uses `harness.mjs` (`Cache-Control: no-store`, loopback).
Default viewport is the play-shape **852×393**. `--desktop` is 1280×720.

Boot ritual (already in the CLI; paste into `browser_evaluate` only for a
live MCP tab):

```js
await new Promise((r) => { const t = setInterval(() => {
  if (window.__apex && window.__apex.race) { clearInterval(t); r(); }
}, 100); });
window.__apex.headless(true);
const g = document.querySelector("#game");
if (g) g.style.visibility = "hidden";
```

Catalog (`node tools/ui/css-play.mjs --list`):

| id | root | clicks |
|---|---|---|
| title | `#overlay` | (boot) |
| select | `#select` | `#mb-race` |
| garage | `#carsetup` | `#mb-garage` |
| settings | `#pmsettings` | `#mb-settings` |
| career | `#career` | `#mb-career` |
| datahub | `#datahub` | `#mb-data` |
| howtoplay | `#howtoplay` | `#mb-settings` → `#pm-tab-more` → `#pm-howto` |
| vsfriend | `#vsfriend` | `#mb-vs` |
| pause | `#pausemenu` | `__apex.race` → `#pausebtn` |

Aliases: `overlay`/`menu` → title, `pmsettings` → settings, `carsetup` →
garage, `help` → howtoplay, `vs` → vsfriend.

Anything else: `--click "#mb-settings,#pm-advanced" --root "#advanced"`.
Reach through the player's door. The authoritative inventory is `SCREENS`
in `tools/ui/layout-audit.mjs`.

Wait for the open transition (`opacity !== 0`, no running animations) before
measuring. `#pmsettings` can take ~1.2 s.

## 2. DOM dump (`dom.json`)

Written every run. `--no-shot` / `playwright-mcp.sh dom` skips the PNG.

| field | meaning |
|---|---|
| `viewport` / `dpr` / `bodyClass` | instrument check (`body.desktop` vs touch) |
| `tokens.tap` / `chipH` / `uiScale` | `--tap` off **body**, not `:root` |
| `layer` | `UiLayers.top()` |
| `root` | catalog root: box (CSS px / `currentCSSZoom`), computed layout styles, one level of kids |
| `hits` | `--sel` matches (up to 20) |

Computed keys are layout-facing (`display`, `overflow*`, `width`/`height`,
`padding`/`margin`, `flex`/`grid`, `zIndex`, `zoom`, …). Text is truncated.

`--sel .sheet` is the usual first probe. A zero box + `opacity: 0` means
you measured mid-transition, not a broken stylesheet.

## 3. Hot-swap

After editing `css/menus.css` (or any catalog sheet):

```sh
node tools/ui/css-play.mjs --screen settings --css css/menus.css
```

The tool finds the `<link rel="stylesheet">` whose href contains that path
and sets `href` to `css/menus.css?play=<mtime>`. Same cascade / `@layer`
order as boot. The `?v=<sha256>` on `index.html` is left alone.

`--inject ".sheet{max-height:80vh}"` writes `#apex-css-play` for a snippet
that is not a file yet. Prefer `--css` once the rule belongs in a sheet.

If the swap "did nothing": the `<link>` was not found (wrong `--css` path),
or you edited a file the screen does not load. `index.html` `<link>` order
is `MANIFEST.CSS`.

## 4. Screenshot

Viewport PNG, `#game` hidden. Compare two runs with the same
`--screen` / `--viewport` / `--scale`. Do not treat a SwiftShader canvas
shot as UI evidence.

## 5. Ship

When the look is right: `node tools/gen/gen-shell.mjs --check` (no cache bump is needed (tags read `?v=dev`; `pages.yml` stamps the hashes at deploy) — after a `tools/manifest.cjs` change run `node tools/gen/gen-shell.mjs`) (last edit),
then the ui / gallery group if the change is more than a token. One-screen
play is not a matrix proof.

## Mistakes

| what happened | why |
|---|---|
| CSS edit invisible after reload | hashed `?v=` still pointed at the old file; use `--css` / `?play=` |
| Screen "missing" | measured during the fade (`opacity: 0`) |
| Tap floor wrong | read `--tap` off `:root` (desktop 44) instead of `body` |
| Boxes look huge | forgot `currentCSSZoom` on `.sheet` |
| Dialog state poisoned | un-hid a `<dialog>` instead of clicking `#mb-*` |
