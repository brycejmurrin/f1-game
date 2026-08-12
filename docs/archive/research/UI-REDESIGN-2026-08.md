# The menu system, reconsidered from scratch

Measured 2026-08-08 against the live page at 852x393 — the primary play shape —
with the Chrome DevTools MCP, plus a corrected `tools/layout-audit.mjs` sweep of
380 cells. Everything numbered below was read off the running app, not inferred
from the stylesheet.

This is a design proposal, not a description of current behaviour. The current
behaviour is in `docs/LAYOUT-AUDIT.md` (mechanism), `docs/COMPONENTS.md`
(inventory) and `UI-SCALE-AND-ZOOM.md` (the scale mechanism and
its measured costs). This document argues that those three describe **three
systems doing one job**, and proposes collapsing them to one.

> **REVISION 2026-08-08 — read §9 before acting on §2 or §3.** An adversarial
> review of this document found four errors in it, two of them load-bearing:
> the claim that the tap ladder does not scale is FALSE, and `--u` as first
> drafted would have introduced a container-query overflow bug. §9 records what
> was wrong and what replaces it. The corrected type scale is in §9, not §3.

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

`../research/UI-DESIGN-PRINCIPLES.md` already fixes the rule — the smallest
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

---

## 9. Revision — what this document got wrong

Written 2026-08-08 after an adversarial review of §2–§4 against the CSS specs
and the source. Four errors, two of them load-bearing. The corrections stand;
the sections above are kept unedited so the reasoning that produced the errors
stays visible.

### 9.1 "The tap ladder is deliberately NOT scaled today" — FALSE

`css/tokens.css` says the *token* does not multiply by the scale. It then states
the painted result outright: `--tap: 52px` inside `zoom: 1.15` **paints at
59.8px**. The tap target already scales — at the consumption site rather than
the declaration site. Measured live: a `.track-row` given `min-height: var(--tap)`
paints at 60px on a coarse pointer, not 52.

This matters twice. It means §2's table understated what `zoom` does correctly,
and it means the `--u` migration must decide the question explicitly rather than
inherit it. **The ceiling should scale and the floor must not**: a fingertip is a
physical constant, and WCAG 2.5.8's understanding text is explicit that the
requirement "is independent of the zoom factor of the page". So:

```css
--tap:    max(44px, calc(52 * var(--u)));
--chip-h: max(40px, calc(46 * var(--u)));
```

The bare `44px`/`40px` are lint allow-list entries with that reason. This also
closes a live hole: at UI SIZE 80%, `52 x 0.8 = 41.6px`, under both Apple's HIG
floor and this project's own stated intent.

A third member of the `--cs-sheet-w` / `--dock-w` family falls out of the same
fact: `--tap` paints **59.8px inside a sheet and 52px in the data hub**, because
the hub is outside every zoomed subtree. One token, two touch targets.

### 9.2 `--u` as drafted would break container queries — the real error

`css/components.css` argues, correctly, that under `zoom` "at 130% you need 30%
more REAL width to afford two columns, which is the honest answer". Under a `--u`
length token that stops being true: the sheet's inline size is real px and
`@container sheet (min-width: 620px)` compares real px, so at 150% a sheet flips
to two columns at the same real width **while its contents are 50% bigger**. That
is an overflow bug this document would have introduced, in five files.

The fix is to express container thresholds in `em` on a container whose
`font-size` comes from `--u`. CSS Containment 3 §5.1: *"Relative length units in
container query conditions are evaluated based on the computed values of the
query container"* — explicitly unlike media queries. The condition grammar
rejects `var()`; it accepts `em`.

```css
.sheet { font-size: var(--t-body); container: sheet / inline-size; }
@container sheet (min-width: 38.75em) { /* 620px at 1.0, 713 at 1.15, 930 at 1.5 */ }
```

This is strictly better than what `zoom` gives, because it is specified
behaviour rather than the thing engines disagree about — see 9.5.

### 9.3 Anchor `--u` to `rem`, not `px`

```css
.u-menu { --u: calc(var(--ui-scale)  * 0.0625rem); }   /* 1 unit == 1px at a 16px root */
.u-hud  { --u: calc(var(--hud-scale) * 0.0625rem); }
```

Authoring is unchanged — `calc(16 * var(--u))` is still "16px at defaults" — but
the game's slider and the browser's font-size setting then **compose** instead of
one shutting the other out. Requires never setting a root font-size.

Related, and it undercuts §5 of `UI-SCALE-AND-ZOOM.md`: that document argues the
in-game slider settles the `px`-vs-`rem` question. It does not. WCAG 1.4.4's
sufficient technique G178 requires on-page controls that resize text **up to
200%**; this slider runs 80–150%, i.e. 1.30x from its shipped 115% default. It
does not discharge 1.4.4. The shell also ships `maximum-scale=1, user-scalable=no`,
which MDN and the axe `meta-viewport` rule both call an accessibility failure —
inert on iOS since iOS 10, honoured on Android Chrome.

### 9.4 The type scale in §3 has the same defect it diagnoses

§3 proposed 12/14/16/19/24/34/48 at ~1.2. The bottom three steps are **2px, 2px**
— sub-perceptual, and therefore a re-creation of the 11/12/13 failure one notch
up. A constant ratio always does this: it compounds multiplicatively, so it gives
invisible steps at the small end and cliffs at the top.

Six hand-set rungs, ratio rising 1.23 -> 1.41, every adjacent pair >= 3px apart:

| token | px | replaces |
|---|---|---|
| `--t-label` | 13 | 8, 9, 10, 11 |
| `--t-body` | 16 | 12, 13 |
| `--t-lead` | 20 | 14, 15, 17, 18 |
| `--t-title` | 26 | 20, 22 |
| `--t-hero` | 34 | *(the gap)* |
| `--t-brand` | 48 | 48+ |

The seventh rung (units, chip superscripts) becomes a **relative modifier**,
`.t-unit { font-size: 0.78em }`, not a global token — a global micro rung is
exactly what became the body rung last time.

Two corrections to §1's evidence while here. "Nothing between 20 and 48" is true
of the eight screens sampled, **not of the stylesheet** — 22px x4, 24px x2 and
28px x3 exist. And the count is ~260 raw `font-size` declarations against 2,046
raw `px` occurrences overall, so §8's "type first, subtractive, no behaviour
change" is ~250 edits and is **not** behaviour-neutral: raising the floor from
8-9px to 13px will cost a row on some 393px-tall screens. Label it a deliberate
change.

**No `clamp()` on the ladder.** WCAG failure technique F94 names viewport units
in `font-size` as a 1.4.4 failure, and the conformance rule that falls out of the
arithmetic is that max must be <= 2.5x min. This ladder spans 13->48 = 3.7x, so a
single fluid expression across it fails. `cqi` is right in exactly three places —
text that must fit a box it cannot wrap out of (`#announce`, the `#title`
wordmark, the big HUD digits) — and only with a `--u`-anchored minimum.

### 9.5 Why the conclusion survives anyway

The strongest case for keeping `zoom` is that four declarations reach ~2,046 raw
px sites while `--u` reaches only what someone migrated — and a half-migration is
worse than the thing it replaces, which this document already concedes.

What decides it is not that `zoom` is bad. It is where the residual risk sits.
`csswg-drafts#10268` — "[css-viewport] [css-contain] Zoom and container queries",
open since 2024-04-29 — records that **Safari disagrees with Chrome and Firefox**
on zoom x container-query behaviour. The primary target is iOS Safari; the entire
test suite is Chromium; `@container sheet` is used in five files. The mechanism's
one unresolved interop question sits exactly on the axis with zero observability
— the same structural blind spot as A13.

`--u`'s residual risk is "has this file been migrated yet", which a lint answers
deterministically. **Trade an unobservable risk for an observable one.**

Two process corrections follow. Retire `zoom` **per scope, not globally**: it is
four selectors (`.sheet`, `#overlay > *`, the HUD cluster list, `.dock`), and each
can be dropped the day the lint reports zero un-allow-listed bare px in the files
that feed it. And register the tokens with `@property` (`--ui-scale`/`--hud-scale`
as `<number>`, `--u` as `<length>`) — an unregistered custom property that goes
invalid at computed-value time takes the whole consuming declaration down, and
for a `font-size` fed by a custom property the fallback is the *initial* value,
which flattens the entire type hierarchy rather than breaking one rule.

### 9.6 What the modern-CSS research changed

The premise of "adopt newer CSS to delete hand-written layout JS" is mostly
**wrong here**, and that is worth recording so it is not re-litigated. The layout
JS in this repo produces **lengths and ratios** (`scrollTop/max`, thumb height in
px); every shipping CSS feature evaluated produces **booleans**.

- **`@container scroll-state()`** would express `scrollfade.js`'s fade predicate
  exactly — but it is boolean-only, so `--sf-h`/`--sf-y` stay in JS; a container
  query cannot style its own container, and the fade is a mask on the `.pane`
  itself; and there is no Safari version, with WebKit's standards-position open
  since 2023. **Parked.**
- **Anchor positioning** would delete three lines of CSS and zero lines of JS.
  `web-features#3558` ("Anchored Fixed position elements is broken in Safari")
  is open, `#campicker` is `position: fixed`, and its anchor is in a different
  zoom space. **Parked.**
- **Popover** deletes ~10–15 lines in `cam-modes.js` and, contrary to
  `UI-SCALE-AND-ZOOM.md` §5c, deletes **none** of `ariastate.js` — `aria-pressed`
  is a toggle state, `aria-expanded` is a disclosure relationship, and the 24
  option-group chips are neither. Behind a feature detect only: `[popover]`'s
  `display: none` is a UA rule, so an unsupporting engine leaves `#campicker`
  permanently over the race.
- **`@starting-style`** would delete nothing — the dialog fade is already pure
  CSS — and its exit half needs `overlay`, which is Chrome-only.

What *is* worth taking: `text-box-trim: trim-both; text-box-edge: cap alphabetic`
(Safari 18.2) removes the hand-tuned asymmetric padding around the heavy italic
headings; `inert` on the five non-dialog screens; and **an `@supports` idiom at
all** — there are currently **zero `@supports` blocks in 6,365 lines of CSS**,
which is why every candidate above reads as all-or-nothing instead of as a
progressive layer. Land one before anything risky is proposed.

### 9.7 Corrections to §1's inventory

- There are **three** screens outside every zoomed subtree, not two: `#overlay`,
  `#datahub` and **`#track-detail`** (`class="screen dim"` with no `.sheet`).
- The `<canvas>` elements inside zoomed sheets are replaced elements, so `zoom`
  multiplies their *natural size* and resamples them. `#vs-qr` is 320x320 painted
  at 368x368 through a non-integer scale — **a QR code, read by another phone's
  camera**. Same class: `#sel-preview-map`, `#sel-preview-elev`, `#minimap`
  (which renders at ~0.36x its device pixels at the default HUD scale, and gets
  worse as the user asks for a bigger HUD). None size their backing store from
  `devicePixelRatio`. `--u` fixes this class; `zoom` cannot.
