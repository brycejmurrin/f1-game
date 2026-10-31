# CSS-play loop — screens, DOM dump, hot-swap

Load from the SKILL.md index when opening a non-catalog screen, reading a
`dom.json`, or a swap "did nothing".

## Contents
- 1. Host + open
- Who owns a row
- 2. DOM dump (`dom.json`)
- 3. Hot-swap
- 4. Screenshot
- 5. Ship
- Mistakes
- Input and wait contract

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

Catalog: `node tools/ui/css-play.mjs --list` is the truth (ids, roots, clicks and aliases such as `menu` → title, `help` → howtoplay, `paused` → pause); `pause` boots a Monza race, `hud`/`hudpause` use `?APEX_SURVEY_HUD=1` with no race.

Anything else: `--click "#mb-settings,#pm-advanced" --root "#advanced"`
(`--click` replaces the catalog path, so include `#mb-settings`).
Reach through the player's door. The authoritative inventory is `SCREENS`
in `tools/ui/menu-screens.mjs` (imported by `layout-audit.mjs`).

Wait for the open transition (`opacity !== 0`, no running animations) before
measuring. `#pmsettings` can take ~1.2 s.

## Who owns a row

Find the class in `index.html`, then `grep -n 'tune-row' css/*.css`.
Settings sliders (`label.tune-row` > `.tune-label` + `input[type=range]`): base
`css/tuner.css`, sheet override `.pm-group .tune-row` in `css/settings.css`,
DISPLAY panel `#pm-panel-display .tune-row` in `css/settings-controls.css`; sizes
are tokens `--slider`/`--tap` (`css/tokens.css`). Enumerated rows are `.set-row`
(`css/settings-controls.css`). The pause menu (`--screen pause` or `hudpause`) is
`#pausemenu`: its sheet and compact-density rules are in `css/dialogs.css` (`@layer
components`), but the tray chips (`#pm-quick-doors button`, `#pm-checkpoint summary`) are
owned by `css/experience.css` (base plus a `landscape and max-height: 500px` block) and
`css/overlays.css` (the `max-height: 400px` 2-col grid and `--tap` floor), both `@layer
overlays`, which beats components. At 844×390 both media blocks apply. `css/menus.css` is
the title chrome, not the pause sheet. Always `grep -n '<element id>' css/*.css` and read
each hit's `@layer` before editing.

**Sizing tokens** (`css/tokens.css`; read live values from `dom.json`, never
quote numbers): `--safe-t/r/b/l` and `--safe-w/h` are the notch/safe-area box;
`--tap` is the interactive floor (a 44 px base on `:root`, raised to a 52 px touch
ladder on `body:not(.desktop)`, so read it off `body`), with `--chip-h`, `--tap-sm`
and `--tap-min` for secondary sizes; `--vhz`/`--svhz` are `vh`/`svh` divided by
the UI scale.

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
order as boot. The shell tag is left alone ([shell/cache](../../check-changes/references/bump.md): `?v=dev`, no bump).

`--inject ".sheet{max-height:80vh}"` writes `#apex-css-play` for a snippet
that is not a file yet. Prefer `--css` once the rule belongs in a sheet.

If the swap "did nothing": (1) the `<link>` was not found (wrong `--css` path);
(2) you edited a file the screen does not load (`index.html` `<link>` order
is `MANIFEST.CSS`); (3) a LATER LAYER or a MORE SPECIFIC rule wins — layer order
is `reset, base, components, hud, overlays` (`css/tokens.css`), so a components-layer
edit loses to any overlays rule, and a few blocks sit outside every layer on purpose.
Probe the computed value with `--sel <element>` (dom.json `hits`) or `--tokens`.

## 4. Screenshot

Viewport PNG, `#game` hidden. Compare two runs with the same
`--screen` / `--viewport` / `--scale`. Do not treat a SwiftShader canvas
shot as UI evidence.

## 5. Ship

When the look is right: `node tools/gen/gen-shell.mjs --check` (last edit),
then the groups `node tools/ci/pick-tests.mjs` names if the change is more than a token. One-screen
play is not a matrix proof.

## Mistakes

| what happened | why |
|---|---|
| CSS edit invisible after reload | browser cache (or a served deploy copy with a hashed `?v=`); use `--css` / `?play=` |
| Screen "missing" | measured during the fade (`opacity: 0`) |
| Tap floor wrong | read `--tap` off `:root` (desktop 44) instead of `body` |
| Boxes look huge | forgot `currentCSSZoom` on `.sheet` |
| Dialog state poisoned | un-hid a `<dialog>` instead of clicking `#mb-*` |

## Input and wait contract

`--viewport` requires exactly two finite positive integers; `--scale` must be
finite and inside the UI's supported range. Extra `--click` values append to the
catalog's click route. With an explicit custom `--root`, the supplied clicks are
the complete route; inspect `screenClicks` when authoring a custom screen.
Open-state and stylesheet waits are bounded and identify the screen/root on
failure. Infinite decorative animations must not block transition readiness.

Computed token inspection also supports `--tokens`: `tokens.json` records custom
properties, selected computed styles, viewport/motion and bounded control samples.
Control and token truncation are explicit. See [design tools](../../../../docs/DESIGN-TOOLS.md).
