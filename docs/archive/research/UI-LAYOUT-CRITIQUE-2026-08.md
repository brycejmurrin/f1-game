# Every menu, measured and criticised — 2026-08-08

A screen-by-screen read of the menu DOM at **852x393, the primary play shape**,
taken against the running page with the Chrome DevTools MCP. Numbers here were
measured, not inferred. Companion to `UI-REDESIGN-2026-08.md`, which proposes
the architecture; this document is the evidence.

---

## The one-sentence critique

**The layout system is sophisticated about width and structurally blind to
height — and height is the axis this game is starving on.**

Three facts, each verifiable by grep:

1. `container: sheet / inline-size` (`css/components.css:141`) is the **only**
   container declaration in 6,365 lines of CSS. `inline-size` cannot answer a
   height question; that is what the keyword means.
2. Therefore every height decision has to be a viewport `@media (max-height: …)`,
   and there are **eight** uncoordinated height thresholds — 500, 520, 560, 599,
   600, 620, 640, 700 — spread across five files.
3. It is also why `data-shape` had to be invented in JavaScript at all.
   `js/game/sheetshape.js:2-35` reasons it out correctly: `container-type: size`
   would apply size containment in both axes, and a size container may not take
   its size from its contents, which every sheet here does.

The primary play shape is 852x393. **Width is abundant. Height is scarce.** The
app has a principled mechanism for the axis it has plenty of, and a scattering
of hand-picked numbers for the axis it runs out of.

**Every defect below is a height failure. Not one is a width failure.**

---

## The vertical budget

Measured per screen: how much of the sheet is chrome (fixed head + fixed foot)
before any content is drawn, and how much content is hidden.

| screen | head | foot | chrome | hidden below the fold |
|---|---|---|---|---|
| **garage** | **155px** | **132px** | **76%** | 1721px |
| career | 66px | 70px | 36% | 234px |
| select | 41px | 70px | 29% | 1373px |
| settings | 41px | 70px | 29% | 279px — **only 49% of the screen is visible** |
| how to play | 41px | 70px | 29% | 1618px — **14% visible** |
| VS friend | 41px | 70px | 29% | 98px |
| race settings | 41px | 70px | 29% | 46px |

**The garage spends 76% of its sheet on head and foot.** 155 + 132 of 377px,
leaving ~90px for the twelve part categories the screen exists to show. The
floor of that budget — 29% — is already high for a 393px window; the garage is
not an outlier in kind, only in degree.

---

## Screen by screen

### Title (`#overlay`) — dead space and overflow on the same screen

Not a `.sheet`. 56 nodes, 10 buttons in three tiers.

- The left column is **~60% empty** below the disclaimer while the button column
  **overflows the bottom by 132px at UI SIZE 150%** (measured: `#overlay`
  scrollHeight 569 vs clientHeight 393). Abundant space and exhausted space, in
  the same composition, because the two columns do not trade.
- **"RACE A FRIEND" wraps to two lines while its grid partner "SEASON" does
  not**, so the row is ragged and the two cells differ in height.
- The floating **♪ ON chip collides with the CAREER MODES button**, and with
  FREE BUILD in the garage. It is positioned over the sheet rather than in it.

### Circuit select (`#select`) — the most-used screen, 39 rows too small

`.pane-pair`, `data-shape="wide"`, `data-pair="on"`. 173 nodes, 42 buttons.

- **40 of 42 controls are under the 52px touch floor.** `.track-row` measures
  45px — 39 rows, each 7px short. This is the screen players use most.
- **The facts chip row is clipped 12px and is unreachable.** `#sel-preview-info`
  escapes `#sel-track-section`, which is `overflow: hidden`, has **11px of live
  scroll range**, and is not a `.pane` — so the content exists, scrolls, and has
  no affordance to reach it. Visible in a capture as "5 DRS zones" and
  "T1 slowest" sliced through the middle by the BACK/START bar.
- The map takes ~45% of the left column while the facts under it are the part
  that gets cut.

### Garage (`#carsetup`) — the foot is bigger than the content

295 nodes, 56 buttons. The worst screen in the app.

- **The BACK/DONE foot is 132px tall; the category rail beside it is 88px.**
  The foot is 1.5x the content. Cause: `.sheet-foot .bigbtn` has a 142px
  min-content floor (110px `min-width` + 2x16px padding) against a
  `minmax(112px, 27%)` rail, so the two buttons can never sit side by side —
  and stacked they take 132px of a 220px column.
- **`#cs-inner` overlaps `#cs-stack` (the camera bar) by 61px at the shipped
  default**, 130px at 130%, 222px at 150%. `--cs-sheet-w` is
  `min(100%, max(430px, 54vw), 500px)`, consumed **zoomed** by `#cs-inner` and
  **unzoomed** by `#cs-stack`. The CSS width never changes; the painted width
  goes 460 → 529 → 598 → 690.
- **"BUDGET: 600 / 600 cr remaining" is truncated** — needs 200px, gets 183px.
  It is the one number the screen exists to communicate.

### Race settings (`#race-settings`) — a grid that truncates its own labels

- **Six chip labels are truncated** by a fixed 52px column: "☁ CLOUDY" needs
  62px, "57 (FULL)" 58px, "DEFAULT" and "NORMAL" 57px, "💧 WET" and "🌧 RAIN"
  54px. A fixed 3-column grid clips rather than reflows.
- **A white keyboard focus ring is drawn on a touch device.** `#rs-body` takes
  focus when the screen opens and matches `:focus-visible`.

### Career (`#career`) — prose above the choices

`.pane-pair`, two columns (348px / 365px).

- Head plus two two-line descriptions consume the top ~215px, leaving 207px for
  the slots. **1.5 of 3 slots are visible per column**; the columns hide 144px
  and 90px.
- Structurally sound — 0 clipped, 0 truncated. The criticism is priority: the
  player came to pick a slot and the slots are what got pushed off.

### Settings (`#pmsettings`) — half the screen is below the fold

- **279px hidden — 49% of the content is off-screen**, and the only cue is a
  ~4px red bar in the corner.
- Buttons are enormous for their payload: "STEER: TILT" is a ~90px box for a
  one-line label. That is why only three rows fit.
- Four group headers across three columns: DRIVING and DISPLAY are one section
  each, while AUDIO and HELP stack in the third — so the columns read with
  different rhythms.
- **The white focus ring again.** Two screens now; it is systemic.

### VS friend (`#vsfriend`) — an entire path below the fold

- Two buttons in an 823x371 sheet, then **98px hidden containing the whole
  room-code path** — "…or use a short room code", NEW CODE, ENTER CODE. On the
  primary play shape one of the two ways to start a multiplayer race is
  invisible.
- 94 nodes but 42 buttons: every wizard step is in the DOM at once.
- **The white focus ring, third screen.**

### How to play (`#howtoplay`) — 14% visible

1618px hidden in a 264px body. Legitimately long content, but nothing paginates
or sections it; it is one scroll with a corner bar for a cue.

### Data hub (`#datahub`) — outside every system

Not a `.sheet`. `display: flex`, `.dh-card`, 15 nodes at the shell level.

- **Ignores UI SIZE entirely** — zoom 1.0 and a 52px tab height at 80%, 115%
  *and* 150%.
- Not a container, so **`css/data.css` has 28 media queries and 0 container
  queries**. The two-pane split is gated `(orientation: landscape) and
  (max-height: 520px)`, so a phone gets the good layout and a 1920x1080 desktop
  stacks everything in one column.

---

## Cross-cutting defects

1. **`.sheet-foot` behaves two different ways under one class name.** Settings,
   VS friend and race settings get a full-width foot. Garage and career put it
   inside the `pair-side` rail, where it is destructive. Same primitive, two
   layouts, and nothing names the difference.
2. **A keyboard focus ring on a touch device, on every screen with a scrolling
   body** (3 of 3 checked). A scroll container is being focused on open.
3. **Truncation is the default failure mode.** Garage budget, six race-settings
   chips. Fixed-width grids clip their own labels instead of wrapping.
4. **Scroll affordance is a ~4px bar in a corner** carrying 98px, 279px, 1373px
   and 1618px of hidden content on different screens.
5. **Opting out of `.sheet` opts a screen out of everything at once** —
   container queries, scaling, and the type ladder. The only two screens that
   did are `#overlay` and `#datahub`, and they are the two worst.
6. **There is no `@supports` idiom.** Zero blocks in 6,365 lines, which is why
   every modern-CSS candidate reads as all-or-nothing rather than as a
   progressive layer.

---

## What follows

The redesign document proposes the architecture. The specific correction this
critique adds to it:

**Height needs a first-class mechanism, and it does not have one.** Container
queries cannot supply it (`inline-size` by definition; `size` is unusable for
content-sized sheets). So the honest options are to keep and *extend*
`data-shape` — the JS answer this repo already built and reasoned out correctly
— rather than to keep adding `max-height` media queries in whichever file needs
one next. Today `data-shape` is consumed by exactly one screen (`#select`,
`css/menus.css:295-383`); `#carsetup` and `#career` carry `data-pair` but no
`data-shape`, which is why neither has a band layout available when the sheet is
tall.

The cheapest real win is unrelated to any of that: **give the head and foot a
height budget**. At 29% floor and 76% worst case, the chrome is the single
largest consumer of the axis the game has least of.
