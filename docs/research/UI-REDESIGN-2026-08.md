# The menu system, reconsidered from scratch

Measured 2026-08-08 against the live page at 852x393 — the primary play shape —
with the Chrome DevTools MCP, plus a corrected `tools/layout-audit.mjs` sweep of
380 cells. Everything numbered below was read off the running app, not inferred
from the stylesheet.

This is a design proposal, not a description of current behaviour. The current
behaviour is in `docs/LAYOUT-AUDIT.md` (mechanism), `docs/COMPONENTS.md`
(inventory) and `docs/research/UI-SCALE-AND-ZOOM.md` (the scale mechanism and
its measured costs). This document argues that those three describe **three
systems doing one job**, and proposes collapsing them to one.

---

## 1. The diagnosis: it is not a list of bugs

Seven defects were confirmed live this session. Listed as bugs they look
unrelated:

| # | screen | defect | measured |
|---|---|---|---|
| 1 | garage | panel overlaps the camera bar | **61px** at the SHIPPED default; 222px at 150% |
| 2 | garage | BACK/DONE foot taller than the content it sits beside | foot **132px** vs category rail **88px** |
| 3 | garage | the one number the screen exists for, truncated | "BUDGET: 600 / 600 cr rema…" |
| 4 | select | circuit facts clipped and **unreachable** | 12px past a `overflow:hidden` box with 11px of scroll range and no `.pane` |
| 5 | race settings | chip labels truncated | **6 of them** — "CLOUDY" needs 62px, gets 52 |
| 6 | race settings | keyboard focus ring drawn on a touch device | `#rs-body` takes focus on open, `:focus-visible` matches |
| 7 | data hub | ignores UI SIZE entirely | zoom 1.0 and 52px tab height at 80%, 115% AND 150% |

They are not unrelated. Every one is a consequence of one of three overlapping
systems, and #1, #3 and #7 are the *same* system failing three ways.

### The three systems

**A. Two scale mechanisms that must not touch each other.** `zoom` scales four
subtrees; the `--tap`/`--pad`/`--gap` token ladder deliberately does *not* scale,
because a token consumed inside a zoomed subtree would be counted twice
(`css/tokens.css:357-366` explains this well and is correct). So authors hold two
rules in their head, and the boundary between them is invisible in the source.

**B. Three ways to ask "how much room did I get".** `@media` on the viewport,
`@container sheet` on the panel, and a `data-shape` attribute written by
`js/game/sheetshape.js`. The correct answer is documented
(`docs/LAYOUT-AUDIT.md`'s seven axes) and is genuinely good. It is also
routinely disobeyed: `css/data.css` has **28 media queries and 0 container
queries**, and decides a two-pane split on `(orientation: landscape) and
(max-height: 520px)` — so the phone gets the good layout and a 1920x1080 desktop
stacks everything in one column.

**C. No shared vocabulary of sizes.** Measured across eight screens:

| | distinct values | the tell |
|---|---|---|
| font-size | 11 | **90% of all text is 11/12/13px** — three rungs within 2px; then nothing between 20 and 48 |
| gap | 19 | includes 2.8, 4.4, 5.6, 6.4, 7.2, 9.1, 10.4, 11.7, 12.8 |
| padding-top | 18 | includes 3.25, 4.55, 7.074, 7.15 |
| border-radius | 5 | 3px, 6px and 8px all in heavy use |
| text colour | 22 | |
| background | 28 | |
| font-weight | 4 | **800 is the most common** (121), above 700 (93) and 400 (92) |

The fractional values are not decisions. They are `zoom` multiplying integers —
system A leaking into system C. There is no spacing scale to violate, so nothing
violated one.

**And the structural tell.** The only two screens that do not use `.sheet` are
`#overlay` (title) and `#datahub` — and they are exactly the two with the worst
problems. `#overlay` overflows its own viewport by 132px at 150%; `#datahub` is
outside every zoomed subtree, so it is the one screen the UI SIZE slider cannot
reach. `container: sheet / inline-size` is declared **exactly once in the
codebase**, so opting out of `.sheet` means opting out of container queries,
opting out of scaling, and opting out of the type ladder, all at once, silently.

---

## 2. Principle 1 — one scale mechanism, and it is not `zoom`

**`zoom` breaks the identity between a CSS pixel and a layout pixel.** Every
known scale defect in this repo is a correction for that breakage, or a missing
correction:

- **4 correction tokens** exist solely because viewport units resolve against the
  unzoomed viewport and are then multiplied (`--vwz`, `--svhz`, `--vwzh`,
  `--svhzh`). Using the wrong one of the pair is worse than using none.
- **12+ hand-written `position: fixed` compensations**, because compensation
  lives on the declaration and not the element.
- **The A13 class**: `getBoundingClientRect()` inside a zoomed subtree compared
  against a coordinate from outside one. Four known sites, and the Chromium-only
  test suite is structurally incapable of seeing the WebKit half of it.
- **"One variable, two consumers, one of them zoomed"** — `--cs-sheet-w` is
  defect #1 above (61px, shipped default), `--dock-w` is the same shape.
- **The data hub is excluded on purpose**, because adding `zoom` to it would
  mint new A13 sites. Defect #7 is the cost of that decision.

### The replacement: a scale-carrying length token

```css
:root      { --ui-scale: 1.15; --hud-scale: 1.15; }
.u-menu    { --u: calc(var(--ui-scale)  * 1px); }   /* sheets, #overlay, hub */
.u-hud     { --u: calc(var(--hud-scale) * 1px); }   /* clusters, docks       */
```

and every length becomes `calc(N * var(--u))`.

Why this is strictly better, point for point:

| property | `zoom` | `--u` |
|---|---|---|
| `getBoundingClientRect()` truthful | no | **yes** — the whole A13 class ceases to exist |
| `position: fixed` needs compensation | yes, 12 sites | **no** |
| viewport units usable | no, need `--vwz` family | **yes**, bare units are correct |
| container queries | open CSS spec question | **normal** |
| two consumers can disagree | yes (defects #1, #7) | **impossible** — there is no zoomed/unzoomed distinction |
| compounds when nested | n/a | **no** — a custom property re-declares, it does not multiply (unlike `em`) |
| catches px you never migrated | **yes** | no |

That last row is the honest cost, and it is the only one. `zoom` reaches the 238
raw px font-sizes that nobody got to; `--u` does not. **So a half-migration is
strictly worse than `zoom`** — which is exactly what `UI-SCALE-AND-ZOOM.md`
already says, and why the type scale must land first.

**Make it enforced, not remembered.** The repo already has the pattern:
`tools/vstd-lint.mjs` + `tests/unit/vstd-invariant.test.mjs` fail the build on a
bare speed literal without a written reason. Mirror it exactly — a
`tools/uiunit-lint.mjs` that fails on a bare `px` length inside a `.u-*` scope,
with an allow-list (hairlines, borders, icon glyphs, the tap floor itself) where
each entry carries a written reason. An invariant this repo asserts holds; an
invariant it writes down drifts. Both facts are in its own history.

---

## 3. Principle 2 — one type scale, with a floor set by the phone

Today: 11 sizes, 90% of text crammed into 11/12/13px, and a chasm from 20 to 48.
Three sizes within 2px of each other cannot express hierarchy, so hierarchy is
carried by *weight* instead — which is why `800` is the most common weight in the
app. That is the tell of a type system with no range: everything is bold because
nothing can be bigger.

`docs/research/UI-DESIGN-PRINCIPLES.md` already fixes the rule — the smallest
rung must be legible **on a landscape phone at arm's length**, and the desktop is
then allowed to be generous. The current floor is 9px. Seven rungs, ~1.2 ratio:

| token | px | replaces | used for |
|---|---|---|---|
| `--t-micro` | 12 | 9, 10, 11 | units, chip superscripts — never a sentence |
| `--t-label` | 14 | 11, 12 | labels, captions, meta |
| `--t-body` | 16 | 13 | body, list rows, option names |
| `--t-lead` | 19 | 14, 15, 16, 17 *(11 uses total)* | emphasised row, card title |
| `--t-title` | 24 | 20 | sheet and section headings |
| `--t-hero` | 34 | — *(the gap)* | screen title |
| `--t-brand` | 48+ | 48 | the wordmark only |

Two things this buys beyond tidiness: the floor rises 9→12px, which *is* the
original "my HUD and buttons are smaller than they were" complaint; and the 20→48
chasm is filled, so a screen title no longer has to choose between "slightly
bigger than body" and "the size of the logo".

## 4. Principle 3 — one spacing and radius scale

```
--s1 4   --s2 8   --s3 12   --s4 16   --s5 24   --s6 32   --s7 48
--r-sm 4   --r-md 8   --r-lg 14   --r-full 999
```

19 gaps and 18 paddings collapse to 7. The fractional values disappear on their
own the moment `zoom` does — they are its residue, not anyone's choice. The three
heavily-used radii (3/6/8) become one (`--r-md`), because at those sizes the eye
reads the difference as sloppiness rather than as a level.

## 5. Principle 4 — every panel is a container, and four named steps

`container: sheet / inline-size` appears once. Make `.sheet`, `.dh-card`,
`#overlay`, `#track-detail` and `.dock` all containers, then retire the magic
numbers. Measured today: **24 distinct breakpoints, 12 of them used exactly
once**, and "is this a phone?" is asked with six different numbers spanning a
43px window (700, 700, 720, 720, 740, 743).

Four steps, derived from the clusters that actually exist:

| step | at | meaning |
|---|---|---|
| `compact` | < 420px | a rail, a narrow column |
| `regular` | ≥ 420px | a phone sheet |
| `wide` | ≥ 620px | the two-column threshold |
| `full` | ≥ 900px | tablet / desktop landscape |

`wide: 620` is not invented — it is already the one number in the codebase with a
single consistent meaning (5 container sites plus both `--pair-at` values).

**`@media` keeps only what is genuinely about the window**: the density ladder
(`pointer: coarse`), the safe area, the rotate nag, and `prefers-reduced-motion`.
Everything else moves to `@container`. `css/data.css`'s 28 media queries become
container queries and the desktop stops getting the phone's stacked layout.

A query condition cannot take a `var()` — so enforce the four numbers with a test
that greps `css/` and fails on any threshold outside the sanctioned set. Same
shape as the lint above, same reason.

**Keep `data-shape`.** JS must answer container *shape* because `container-type:
size` would break sheets that take their size from their contents
(`js/game/sheetshape.js:2-35` reasons this out correctly). Extend it to
`#carsetup` and `#career`, which today carry `data-pair` but no `data-shape` and
therefore have no band layout available on a tall sheet.

## 6. Principle 5 — structural repairs that follow from the above

- **`#overlay` and `#datahub` become sheets.** They inherit scaling, container
  queries and the type ladder, and defects #7 and the title's 132px overflow both
  close as a side effect rather than as patches.
- **The sheet foot spans the full sheet width, below both pair columns** — not
  inside the rail. This is defect #2: `.sheet-foot .bigbtn` has a 142px
  min-content floor (110px + 2×16px padding) against a `minmax(112px, 27%)` rail,
  so the two buttons *always* stack, and stacked they take 132px of a 220px
  column while the twelve garage categories get 88px.
- **Chips size to their content** (`max-content` with wrapping), not a fixed
  3-column grid. That is defect #5, all six labels.
- **`#sel-track-section` becomes a `.pane`.** It is `overflow: hidden`, has 11px
  of live scroll range and no scroll affordance, which is defect #4 — content
  that exists, scrolls, and cannot be reached.
- **Scroll containers must not take focus on open.** Defect #6 draws a keyboard
  focus ring on a touch device because `#rs-body` is focused programmatically.

## 7. Menu structure — the part that is a product call

Mechanical fixes above are unambiguous. These are proposals, flagged as such:

- **The title screen's second tier breaks its own grid.** "RACE A FRIEND" wraps
  to two lines while "SEASON" does not, so the row is ragged and the two cells
  are different heights. Either equalise the cells or use a one-word label.
- **The ♪ ON chip is positioned over the sheet, not in it** — it collides with
  the CAREER MODES button on the title screen and with FREE BUILD in the garage.
  It belongs in the sheet head.
- **The pre-race flow is four screens** (Select → Garage → Race Settings →
  drive). Race Settings is seven option rows; on a `wide` sheet it fits as the
  right-hand pane of Select, which removes a screen from the path to driving.
  This changes a flow players know, so it should be decided, not slipped in.

## 8. Order of work, and why this order

1. **Type, spacing, radius tokens** (§3, §4). Subtractive, no behaviour change,
   one file per commit with a before/after size dump.
2. **Containers and the four named steps** (§5), plus the threshold test.
3. **Structural repairs** (§6). Each closes a measured defect above.
4. **`--u` replaces `zoom`** (§2), plus the unit lint. **Last**, because a
   half-migration is worse than the thing it replaces.

Steps 1–3 are worth doing whether or not step 4 ever happens. Step 4 is the one
that deletes a whole class of bug rather than fixing instances of it, and it is
only safe once step 1 has left no raw px behind.

**Re-measure between every step.** `node tools/layout-audit.mjs` is now correct
(it was scoring phones against the 44px desktop floor, measuring screens
mid-fade, and dropping three desktop columns to boot timeouts — all three fixed
2026-08-08). A cell going green→red between builds is a regression with an
address, and that is the only reason to trust any of the numbers above.
