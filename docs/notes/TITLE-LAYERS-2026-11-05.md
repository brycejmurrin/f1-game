# Title screen: two independent layers (#5126)

Kind: design · Re-measure-by: 2026-12-05

Bryce, 2026-11-05 ~05:15Z, on his iPhone after #4906: "now I can't slide the buttons to the right fully. Really
reconsider the design to make the title drawing and buttons independent." #4906 placed the cluster with
`margin-inline-end: clamp(0%, -X, free)`, so a rightward X clamped to 0 and LEFT/RIGHT only moved away from the
anchored edge. LEFT also could not reach the far edge at a small WIDTH: X was capped at ±50 vw, and that was
multiplied by the cluster's zoom (UI SIZE × SIZE). At 932×430 and WIDTH 20, X −50 moved the cluster 424 px, but the
free room was 676 px.

## The two layers

| layer | pieces | controls it owns | placed by |
|---|---|---|---|
| **Title art** | `#menu-brand` (logo, underline, SOUND, disclaimer), `#title-car` (the drawing) | TITLE SIZE / X / Y, CAR DRAWING SIZE / X / Y | its own grid column (brand) or its foot (drawing), then its own `translate` / `zoom` / `scale` |
| **Button cluster** | `#menu-buttons` | WIDTH, SIZE, LEFT/RIGHT, UP/DOWN, SIDE, LAYOUT | in landscape with a WIDTH: the WHOLE overlay row, then one start margin (below) |

Neither layer reads the other's tokens. The cluster spans the whole overlay (`grid-column: 1 / -1`), so the title
column never limits it. The cluster's width and margin do not size the brand's grid track, and the drawing is not a
grid item. The spec holds both art boxes to 0.5 px through every WIDTH and LEFT/RIGHT step.

**SIDE** is the one control that touches both layers, by definition: SWAPPED trades their sides (the brand takes the
other column). Within one SIDE, nothing in the cluster moves the art.

Both layers persist per orientation. The per-shape store `apex26.titleLayout {v: 2, wide, tall}` already does this
(#4529), so this change adds nothing for it.

## How the cluster's controls compose (landscape, WIDTH set)

Everything is in the overlay's content box. The safe areas are already its padding (`--safe-l` / `--safe-r`).

```
width = max(16.5rem, WIDTH% of the screen), capped at the content box
free  = max(0, content width - width)                    the room beside the cluster
home  = free (SIDE AUTO: right edge) | 0 (SWAPPED: left)  the anchored edge
start = clamp(0, home + LEFT/RIGHT, free)                 one margin-inline-start
```

- **WIDTH** grows the cluster from its anchored edge. The edge stays still, unless the clamp pushes it.
- **LEFT/RIGHT** is a percentage of the screen (`btns.x`, −100..100), not of the zoomed box. CSS divides it by the
  cluster's zoom once (`--_tl-bx`, `css/responsive.css`), and every placement reads that value. ±100 reaches the
  opposite edge at every WIDTH and SIZE. X 0 is the anchored edge: fully right on AUTO, fully left on SWAPPED.
- **The clamp:** the box never leaves the content box, so it never goes under the notch. A WIDTH change keeps the
  cluster where LEFT/RIGHT put it, except where the clamp has to pull it back inside.
- **UP/DOWN** is unchanged: a vh `translate` on Y only, with `max-height` shrinking by the same amount, so the
  scroller stays on screen.
- **SIZE** zooms the doors. Width and position are in screen terms, so SIZE never moves the cluster's edge.
- **AUTO width** (no WIDTH) keeps the shipped layout and its plain translate. It is not clamped: AUTO has no anchored
  box to clamp against, the same follow-up #4906 deferred.
- **Portrait** keeps its column-centring margin. Its X is the same screen-% translate.

## Migration: no visible jump

Before #5126, `btns.x` was zoomed vw: a translate or margin inside a box zoomed by UI SIZE × SIZE. A layout now
carries `xUnit: "screen"`. An unmarked layout (Bryce's export, any older save, an old preset snapshot) is read
through today's zoom when it is read:

    x_screen = round(x_old × UI SIZE × SIZE / 100, 0.1)

`TitleLayout.normalize` and `index.html`'s first-paint copy apply the same arithmetic
(`tests/unit/title-layout.test.mjs` holds the two equal). Reading migrates nothing in the store. The next write
stores the marker and the screen value. Until that write, an old save behaves as it always did and still follows UI
SIZE. The rounding error is at most 0.05 vw, under half a pixel at 932 px. For Bryce's layout (X −2, SIZE 91, UI SIZE
1.09) the cluster moves less than 0.2 px.

## Pins

- `tests/specs/title-cluster.spec.js`: Bryce's export, the real WIDTH and LEFT/RIGHT sliders, 844×390 and 932×430,
  SIDE AUTO and SWAPPED, a 59 px notch (Chromium CDP). At WIDTH 20..100, X −100 and X +100 put the cluster on
  the left and right content edges (±1 px), and the art boxes do not move. Migration: the unmarked save lands where
  the old zoomed translate put it, and stays there through a write and a reload.
- It runs in Chromium on CI (`test:ui`), and in WebKit by hand:
  `APEX_WEBKIT=1 node tools/ci/run-playwright.mjs --project=webkit tests/specs/title-cluster.spec.js`
  (`playwright.config.js` `DUAL_ENGINE_SPECS`; it needs a WebKit binary, which this container does not have).
- `tests/unit/title-layout.test.mjs`: clamps, the marker, the migration and the first-paint copy.

## Not measured

Bryce's iPhone. Measured off-device (Chromium, 932×430, Bryce's export): the right edge was reachable under
#4906's rule whenever X ≤ 0. So this note cannot explain the extra ~60 px gap in his screenshot (cluster at 892–1718
of 2000 px; the safe area accounts for ~150 px). This change does not explain it either. It replaces the one-sided
end margin with a start margin that both directions move, and the spec pins full reach to both edges. Check on the
phone: WIDTH 20, LEFT/RIGHT to 100% RIGHT, then to 100% LEFT. If a gap remains, read it with the phone bridge's
`layout` command (`.claude/skills/phone-bridge/references/commands.md`).
