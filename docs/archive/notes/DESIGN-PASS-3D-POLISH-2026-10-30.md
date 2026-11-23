# Design pass #3, lane D: header, disclaimer, garage tabs (2026-10-30)

PR #4281's three deferred findings from `DESIGN-PASS-1-2026-10-30.md`. Cell: iPhone landscape 844x390, touch, TLX.

## 1. Career hub header "YOU · HAAS" in red text: already fixed
Pass 2b (#4239, `e1e254d4`) made `#cr-sub[data-team]` white ink with a skewed 4 px stripe in the team colour
(`css/carsetup`-independent, `css/career.css` lines 62-67, set from `js/career/career-ui.js` `--cr-team`). Nothing left to
change. Evidence: `layout-audit` careerhub @844 reports 0 findings.

## 2. Title disclaimer border: already fixed
Pass 2c made the border `1px solid transparent` (`css/menus.css` `#disclaimer`), keeping `--plate-opaque`; forced-colours
still draws it (`css/responsive.css`). `css/experience.css` home-scene rule only sets background and colour. No edit.

## 3. Garage tab strip (the work)
Measured at 844x390 (live, `css-play`): 14 tabs, 1,050 px of strip in about 470 px of view, each tab two lines
(label plus the fitted part's name), 48 px tall; 6 tabs visible. A scroller with an edge fade already exists.

Variants injected live and shot at 844x390 (gallery: https://claude.ai/artifact/MzZzAt6iqW5KMrQRZVZdxD). Diff is the
share of pixels whose RGB moved more than 48 against the baseline:

| variant | diff | verdict |
|---|---|---|
| A tight: one-line tabs, 44 px, padding 0.5 gap | 4.78 % | **picked**: frees 56 px for the parts list, 7 tabs visible |
| B fade + tier divider | 0.04 % | rejected: indistinguishable, a fade already exists |
| C two-row column grid | 6.83 % | rejected: costs 56 px, DOM order reads column-first, still scrolls |

Why A: the complaint was crowding and the parts list (card 131 of 209 px) starving, not the scroller; only A returns
height without reordering tabs for keyboard and screen-reader users. Cost: the fitted-part subtitle is hidden in compact
(it is named in the list below); the cyan underline still marks upgrades without hue. Icon+label was not built: 14
categories need 14 new glyphs and the strip would still scroll.

Change in place in `css/carsetup.css` (net bytes about +0): compact/tall tab floor `var(--tap-paint, var(--tap))` ->
`44px`, padding 0.9 -> 0.5 gap, and `.cs-tab-cur` hidden in compact density. Pair-on (rail) and tall-only unchanged
for the subtitle.

## Evidence
- `layout-audit` before/after, garage cells: `= diff ok: 0 new` (tapSoft 1 -> 4 because tabs are 44-46 px; it is the
  informational soft count, not a finding).
- `css-critical-path`, `apca-timing`: pass.
