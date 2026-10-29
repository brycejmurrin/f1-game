# Layout tokens

The shared sizes every screen should use. Declared in `css/tokens.css`.
`js/ui/scale.js` writes `html[data-layout]` and `html[data-fold]` from the
same numbers. A media query cannot read a custom property, so a breakpoint
that also needs `@media` repeats the pixel value; `tests/unit/layout-tokens.test.mjs`
fails if the copies drift.

## Spacing, type, safe area

| Token | Role |
|---|---|
| `--gap` `--pad` `--gut` | Space between controls, sheet padding, minimum edge air. Short landscape tightens all three. |
| `--fs-1` … `--fs-6` | Type scale. `--fs-micro` is the floor (14px). Do not invent a size below it. |
| `--tap` `--chip-h` `--tap-sm` `--tap-min` | Control heights. `--tap-min` is the painted 24px floor under UI SIZE zoom. |
| `--sal` `--sar` `--sat` `--sab` | `env(safe-area-inset-*)`. Notch and home indicator. |
| `--safe-t` `--safe-r` `--safe-b` `--safe-l` | Inset plus `--gut`. Use these for padding. |
| `--safe-w` `--safe-h` | Usable viewport. Width is `100svw` minus the side safe tokens; height is `svh` minus the block safe tokens, in menu-zoom units (`--svhz`). |
| `--vwz` `--svhz` | `1vw` / `1svh` divided by `--ui-scale`. Required inside a zoomed menu. |

`svh` / `svw` are the house viewport units. `dvh` / `dvw` change while the
browser toolbar moves and re-layout mid-scroll, so they are not tokens.
`vh` remains only on type and gap clamps, where a live change would be worse
than a few pixels of slack.

## Width tiers

Tiers are widths, not device names. A landscape phone can land in `tablet`.

| `data-layout` | Token | Min width |
|---|---|---|
| `phone` | `--bp-phone` | under 700px (the token itself is 480px, the small-phone ceiling) |
| `tablet` | `--bp-tablet` | 700px |
| `laptop` | `--bp-laptop` | 900px |
| `desktop` | `--bp-desktop` | 1440px |
| `wide` | `--bp-wide` | 1920px |
| `ultra` | `--bp-ultra` | 2200px |

`--layout-active` is the token for the tier the viewport is in. `--col-max`
(660px) is the widest a control column grows. Wide landscape
(`css/responsive.css`, min-width 1920px) centres the title's two columns at
that cap so a 2560-wide monitor does not pin the wordmark to the left edge.
That rule is `@layer layout`, ordered after `@layer responsive`, because the
live title's column tracks are set in `css/menu-destinations.css`. 1440×900
is the title desktop golden and stays on the older rule.

```css
width: min(100%, var(--col-max), var(--layout-active));
padding: var(--safe-t) var(--safe-r) var(--safe-b) var(--safe-l);
```

## Foldables

Chrome 138+ reports a folded dual-pane screen as
`horizontal-viewport-segments: 2` or `vertical-viewport-segments: 2`
([Viewport Segments API](https://developer.mozilla.org/en-US/docs/Web/API/Viewport_segments_API/Using)).
An open, flat foldable is one segment; the width tiers cover it.

| Token | Meaning |
|---|---|
| `--seg-w` `--seg-h` | First segment. Fallback: the whole viewport. |
| `--fold-gap` `--fold-gap-y` | Hinge thickness. Fallback: 0. |

`css/responsive.css` keeps `#overlay` and `.screen` on the first segment
when two exist. `html[data-fold]="horizontal"|"vertical"` is the same answer
for a rule that cannot use the media feature. One screen matches neither,
so the value stays unset.
