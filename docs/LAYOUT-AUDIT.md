# Layout audit — how to measure the menus before changing them

Every layout bug this project has shipped lived in a **cell of a matrix**, not in
a screen: the circuit list stopped 49px above the sheet floor *only* in the
two-column branch; the garage stacked its category rail *only* at the sheet's
430px floor width; the preview card clipped its chip row *only* where the column
was shorter than the card; a full-width map band left the circuit list two pixels
*only* on a rotated monitor, where a portrait window holds a landscape-shaped
sheet. Each was found by looking at one screenshot, and each was invisible in
every other screenshot taken that day.

The cure is not more screenshots. It is enumerating the matrix and measuring it.

```sh
node tools/layout-audit.mjs                          # measure every cell
node tools/layout-audit.mjs --shots                  # + a PNG per cell (slow)
node tools/layout-audit.mjs --screens=select,garage --viewports=ios-*
```

Output lands in `artifacts/layout-audit/`: `audit.json` (the raw measurements,
diffable build to build) and `index.html` (a screen x viewport grid, green /
amber / red, hover a cell for the findings).

---

## Measure first, look second

Screenshots are slow here — the renderer is SwiftShader, and a 1440x900 capture
of a live 3D scene can take minutes — and they prove nothing you can grep. A
geometry probe reads the same truth out of the DOM in milliseconds:

| what it asks | why it is the question |
|---|---|
| does any visible box escape the thing that clips it | this is "text is cut off", stated in a way a machine can check. Scroll containers are exempt on **either** axis they scroll — that is what scrolling is |
| is any interactive element outside the viewport | a button you cannot reach is worse than one that looks wrong. "Reachable" means *some ancestor's computed `overflow` scrolls to it*, asked of the DOM rather than of a list of known pane selectors |
| is any tap target under 24px | WCAG 2.2 SC 2.5.8 (AA) — a conformance floor, so red |
| is any tap target under the `--tap` token | the house comfort floor (44, deliberately 40 on landscape phones). Above 24px this is a preference, so amber |
| is any text ellipsised | not always a bug — often the point — but it is the difference between SUSPENSION and SUSPENSI… |
| does the document scroll horizontally | always a bug on a fixed-viewport game |
| for each scroll region: how much is hidden, and how far it stops above the sheet floor | the measurement that caught the action bar stealing a row from the circuit list |
| did the page throw | a layout that only looks right because a script died is not right |

Only after the grid says *where* is a screenshot worth waiting for. `--shots`
takes them, and the gallery links each cell to its own.

**Stop the render loop first.** The probe calls `__apex.headless(true)` before
opening anything: the 3D scene starves the compositor, which makes every wait and
every capture an order of magnitude slower. A desktop screenshot that timed out
at four minutes took twenty seconds with the loop stopped.

---

## The viewports, and what each one is for

These are shapes a display can be, not devices people own. Each exists because
some branch turns on or off at it.

| viewport | why it is in the matrix |
|---|---|
| `ios-iphone-portrait` 393x852 | the phone as most people hold it |
| `ios-iphone-landscape` 852x393 | the shape the game is PLAYED in — 343px of sheet height for everything |
| `ios-ipad-portrait` 834x1194 | wide sheet, tall window: wants bands, not columns |
| `ios-ipad-landscape` 1194x834 | the two-column case at its smallest |
| `desktop-1280x800` | a small laptop |
| `desktop-1440x900` | the common desktop |
| `desktop-1920x1080` | full screen on a 1080p monitor |
| `desktop-windowed-1920x937` | the same monitor with browser chrome — 143px less, and browser chrome is why a "desktop" can land on a phone branch |
| `desktop-narrow-860x560` | a small window, or a maximised one at 125% zoom; below the 900x600 large-screen gate |
| `desktop-portrait-1080x1920` | a rotated monitor: a PORTRAIT window whose sheet is capped landscape by `#sel-inner { height: min(100%, 720px) }` |

The last two are the ones that keep finding bugs. A viewport's orientation does
not tell you the sheet's shape, and the sheet is what the layout keys on.

---

## The three ways a layout decision gets made here

Knowing which mechanism owns a decision is most of debugging one:

1. **Container queries on the sheet** (`@container sheet (min-width: …)`) — the
   default, and right for anything that depends on the room a panel actually got.
   **A container query cannot style its own container.** `#sel-inner` *is* the
   `sheet` container, so a rule for it inside `@container sheet` silently never
   applies; the column template has to live outside the block. This has now cost
   two debugging sessions.
2. **Media queries on the viewport** (`@media (orientation: …)`, `(max-height: …)`)
   — for what the *window* is, not what a panel got: orientation, the density
   token ladder in `css/tokens.css`, `body.desktop` behaviour.
3. **A class on `<body>`** — `desktop` is set from `pointer: coarse`, which is
   input, not size. Use it for input affordances, never for room.

Two traps worth writing on the wall:

- **Specificity ties are decided by source order, and container queries add
  none.** A single-ID rule inside `@container` loses to an identical single-ID
  rule declared later in the file. `--sel-map-w` exists as a custom property
  precisely so the map's width can be set by inheritance instead; where that is
  not available, use two IDs (`#sel-track-preview #sel-preview-map`).
- **An `auto` grid track's growth limit is max-content.** A scroll region that
  spans into an `auto` row hands that row its entire content height — a 24-row
  circuit list turned a 76px action bar into 358px. Use `min-content` for a track
  a scroller spans into.

---

## A finding is a claim about the probe until something else confirms it

Three times on this work a first reading was wrong, and each time the wrongness
looked exactly like a real bug:

1. A scroll measurement taken while Chromium was still *animating* the wheel
   scroll — the starved software compositor landed it seconds later. Fixed by
   `__apex.headless(true)` plus settle-polling.
2. A sweep that reported 100 clean cells and had measured nothing: in the
   **JavaScript** Playwright client `page.evaluate("(x) => …", arg)` evaluates the
   string as an expression and the argument never arrives. Pass a real function.
3. Two "unreachable control" findings (the data hub's tab strip, the career hub's
   slot list) that came from asking a hardcoded list of selectors whether an
   ancestor scrolls, instead of asking the computed style. `#cr-body` has 319px
   of scroll range; scrolling it moves SLOT 3 from y=728 to y=409.

So: **before fixing a cell the grid turned red, confirm the finding by a route
that does not run the probe's code** — a script that actually scrolls the
container, or a screenshot. A probe bug and a layout bug present identically, and
only one of them is fixed in `css/`.

---

## Reading the grid

- **green** — nothing clipped, nothing off screen, no horizontal overflow, no
  page errors.
- **amber** — every finding is a control below the house `--tap` floor but at or
  above WCAG's 24px. Expected on a landscape phone, where `--tap` is deliberately
  40, and on the circuit list, whose 40px full-width rows carry 24px+ of spacing
  — the case SC 2.5.8 explicitly allows.
- **red** — the count of real findings, tap targets under 24px among them. Hover
  for the list; `audit.json` has the element, its clipper, and how many pixels it
  escaped by.
- **skipped** — the screen could not be reached in that viewport. That is a
  finding too, and the reason is in the tooltip.

A cell going from green to red between builds is a regression with an address:
screen, viewport, element, and the number of pixels involved.
