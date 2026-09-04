# UI reference — components, ownership, and the layout axes

Two halves. **The component inventory** (below) is what exists in `css/`, who
owns it, and what is shared. **Layout axes** (further down, absorbed from the
old `LAYOUT-AUDIT.md`) is the screen x viewport grid: which mechanism owns which
layout decision, what the probe measures, and how to read the results. Why the
UI is sized the way it is stays in
[`research/UI-DESIGN-PRINCIPLES.md`](research/UI-DESIGN-PRINCIPLES.md) —
`css/tokens.css` and `tests/unit/game-ctx-surface.test.mjs` cite it by path.

## The component inventory — what exists, who owns it, what is shared

`css/` holds **507 classes in 54 families**, and until this document there was no
list of them. That absence has a cost, and it has already been paid: `.res-*` is
defined in `components.css` *and* `career.css`, which is something I found by
grepping in the middle of fixing an unrelated cascade-layer bug rather than by
looking it up. Cross-file coupling you cannot see is cross-file coupling you
break by accident.

Generated from `css/` and cross-checked against `index.html` and `js/`. The
family table is asserted by `tests/unit/component-inventory.test.mjs`, so a new family
cannot appear without this document noticing.

---

## Shared layout primitives

Everything else is built on these. They live in `css/components.css`.

| primitive | what it is |
|---|---|
| `.screen` | a full-viewport overlay, inset by the OS safe area, that centres its child |
| `.sheet` | a card with a fixed head, ONE scrolling body and a pinned foot; also the `sheet` **query container** every layout decision inside it keys on. Dense sheets may declare `--fit-at` (minimum functional local height); `SheetShape` then caps only that panel's effective zoom when the safe viewport cannot supply it. Phone-landscape floors: select / season / garage / career / settings / howtoplay / results / standings / customize / vs-friend / quali use `--compact-at: 480px`; audio / Spotify use `520px`; the generic floor is `380px` |
| `.pane` | a scroll region that says so — an edge fade on whichever side has more |
| `.pane-pair` | the shared **list-detail** layout (`.pair-side` + `.pair-main`), used by `#select`, `#season-setup`, `#carsetup` and `#career`. Default foot sits under the side column; `.pair-foot-full` spans BACK / YOUR CAR / NEXT (and season APPLY) across both. Slots are named by POSITION, not role — see the note in `css/components.css` |
| `.balanced-row` | a content-driven control cluster: items wrap from their preferred local width, every line shares its space evenly, and a lone final item fills the line without child-count-specific CSS |

## Families, and the file that owns each

"Owner" is the file with the most rules for that prefix; "also" means other files
add to or override it. A family with more than one file is a coupling — usually
deliberate (`responsive.css` re-tunes `hud-*` for large screens), occasionally
not.

| family | rules | owner | also in |
|---|---|---|---|
| `dh-` | 368 | `data.css` | `components.css` |
| *(unprefixed)* | 226 | `overlays.css` | components, carsetup, career, menus, tuner, hud, responsive, tokens |
| `cs-` | 132 | `carsetup.css` | components, menus, responsive |
| `cr-` | 75 | `career.css` | — |
| `lt-` | 61 | `tuner.css` | hud, components |
| `pc-` | 56 | `hud.css` | tuner |
| `vs-` | 38 | `overlays.css` | — |
| `sheet-` | 37 | `components.css` | tuner, overlays, career, carsetup, menus |
| `sel-` | 37 | `menus.css` | components, career, carsetup |
| `res-` | 30 | `components.css` | career |
| `hud-` | 26 | `overlays.css` | hud, responsive, tokens |
| `adv-` | 25 | `tuner.css` | components |
| `as-` | 19 | `tuner.css` | components |
| `opt-` | 17 | `tuner.css` | components |
| `tune-` | 15 | `tuner.css` | components |
| `cz-` | 14 | `menus.css` | components |
| `photo-` | 14 | `tuner.css` | — |
| `preset-` | 12 | `tuner.css` | components |
| `track-` | 12 | `menus.css` | components |
| `sp-` | 12 | `tuner.css` | — |
| `team-` | 11 | `menus.css` | components |
| `steer-` | 10 | `overlays.css` | — |
| `tdc-` | 10 | `track-detail.css` | — |
| `co-`, `pm-`, `pane-`, `music-` | ~9 each | career / components / components / tuner | — |

The long tail (`sf-`, `q-`, `cg-`, `tm-`, `spf-`, `ot-`, `ax-`, `flag-`, `sec-`, `limits-`,
`sur-`, `trb-`, `tdf-`, `tds-`, `tdd-`, `rs-`, `balanced-`, `rotate-`,
`cockpit-`, `budget-`, `over-`, `dock-`, `in-`, `btn-`, `chip-`,
`season-`, `pair-`, `build-`, `mb-`) is one file each and needs no map.

**A family leaves this list when it leaves `css/`.** The title screen's old
`.mb-stack` / `.mb-sub` pair was replaced by `#mb-career > span` and
`#mb-career-sub` when each dressed one element in one button; `.mb-sub`
RETURNED in round 10 as the shared door sub-line recipe — five uses (the
hero's save line plus the four static mode answers), which is the reuse the
original pair lacked. `.mb-label` is a span hook with no stylesheet rule.
The season-status chips on `#menu-status` left with that dashboard chrome.
Unused `.ui-panel` / `.ui-kicker` / `.ui-value` /
`.ui-muted` placeholders were removed rather than inventoried as dead.

A family can also shrink without disappearing, and `cs-` did: the garage's
preview bar had `.cs-view-btn` plus two variants that existed only to restate a
font-size, a padding and a line-height (`.cs-view-zoom`, `.cs-view-nudge`) on
buttons that all carry ids anyway, so those became `--vb-fs` / `--vb-pad` set on
the ids. `.cs-cam-lbl` went with them — its single declaration duplicated the
value `#cs-cam` already passed down by inheritance, so it could not change a
pixel. Nothing in this document is asserted about a family's SIZE, which is
exactly why the count needs the `cssClasses` ratchet (`tests/data/ratchets.json`) as well:
this table proves a family left, the ratchet proves the total came down.

`sel-` shrank the same way and for the same reason: `.sel-section` set one
declaration on one element in the whole app, and that element already had an id.

**The `(unprefixed)` row is the one to watch.** 226 rules across nine files, on
state classes rather than components — `.active`, `.on`, `.armed`, `.desktop`,
`.p1`, `.you`, `.dim`. State is *meant* to be cross-cutting, so this is not a
defect, but it is the least discoverable part of the system.

## Defined in more than one file

This is the list worth keeping in view. Every entry is a place where editing one
file changes a screen owned by another.

**Deliberate sharing — one component, re-tuned elsewhere:**

- `.balanced-row` — `components` + `menus`. Flex wrap that derives its column
  count from `--balance-basis` / `--balance-min` instead of `repeat(N, ...)`.
- `.bigbtn` — `components` + `menus` + `overlays` + `responsive` + `tokens`
- `.hud-box` / `.hud-label` / `.hud-value` / `.hud-gaps` / `.hud-top` — `hud` + `responsive` (+ `tokens`)
- `.hud-bottom` / `.hud-unit` / `.touchbtn` — `hud` + `overlays`
- `.dock` — `hud` + `overlays`. The touch-controls dock: defined in `overlays`,
  hidden by a `hud` rule when the pause card is up.
- `.minibtn` — `menus` + `responsive`
- `.cs-stat-*` (4 classes) — `carsetup` + `menus` + `responsive`
- `.dh-card` / `.dh-tab` / `.dh-row` / `.dh-pill` / `.dh-dchip` / `.dh-sortbtn` / `.dh-race-sub` / `.dh-error-msg` — `data` + `components`
- `.build-tag` — `components` + `menus`. The footer version tag: styled in
  `menus`, overridden by a compact-density selector in `components`.
- `.cs-liv-swatch` / `.tm-colour` / `.swatch` / `.res-swatch` / `.dh-swatch` —
  their owning files (`carsetup` / `menus` / `menus` / `components` / `data`)
  + `tokens`. The whole swatch family appears once more in `tokens`' single
  `forced-colors` block: colour IS the content on a swatch, so they all opt
  out of forced-color-adjust together — one rule, deliberately, rather than
  five copies of the same carve-out.

**Cross-SCREEN reuse — a component borrowed by a screen that does not own it:**

- `.res-row` / `.res-pos` — `components` + `career`. The championship table
  deliberately reuses the results-screen row so standings do not look like a
  different game depending on where you are. **This is the one that bit us**: it
  is invisible from either file alone.
- `.sel-label` — `components` + `menus` + `career` + `carsetup`. The skewed red
  section heading, used by four screens.
- `.sel-chip` — `components` + `menus` + `career`; `.sel-edit` — `components` +
  `menus` + `carsetup`; `.sel-edit-row` — `menus` + `carsetup`.
- `.cs-tab` / `.cs-opt` / `.cs-unlimited-btn` — `carsetup` + `components`
- `.lt-tab` — `components` + `tuner`; `.pc-nopanel` — `hud` + `tuner`;
  `.adv-sec` / `.adv-help` / `.as-note` — `components` + `tuner`

**State classes** (`.active`, `.on`, `.armed`, `.desktop`, `.p1`, `.you`,
`.screen`, `.dim`, `.in-race`) are shared by design and are listed here only so nobody
mistakes them for components.

**Found by the guard, not by hand** — these were defined in more than one
file and named nowhere, which is exactly the drift the new assertion in
`tests/unit/component-inventory.test.mjs` now prevents. `.sheet-foot` is the
most-shared class in the project and had no entry at all:

- `.alt` — `components` + `menus`. Alternate `.bigbtn` look on Select / Career;
  defined on `.bigbtn.alt` in `components`, re-tinted per-screen in `menus`
- `.adv-item` — `components` + `tuner`
- `.adv-more-btn` — `components` + `tuner`
- `.cs-stat-bar-wrap` — `carsetup` + `menus` + `responsive`
- `.cs-stat-label` — `carsetup` + `menus` + `responsive`
- `.cs-stat-row` — `carsetup` + `menus` + `responsive`
- `.cs-stat-val` — `carsetup` + `menus` + `responsive`
- `.cz-liv-none` — `components` + `menus`
- `.opt-btn` — `components` + `tuner`
- `.pm-group` / `.pm-group-h` — `components` + `menus`. Pause-settings group and
  its heading; `menus` re-tints them under `#pmsettings`
- `.preset-btn` — `components` + `tuner`
- `.preset-row` — `components` + `tuner`
- `.res-name` — `career` + `components`
- `.res-pts` — `career` + `components`. Compact Career history / qualifying /
  standings / results wrap the shared points cell instead of ellipsizing it.
- `.season-upcoming-row` — `components` + `menus`
- `.sf-scroll` — `components` + `tuner`
- `.sheet-foot` — `career` + `carsetup` + `components` + `menus` + `overlays` + `tuner`
- `.sheet-head` — `components` + `overlays`
- `.sheet-body` — `components` + `overlays`. How to Play, Career guide, and
  Career history place the shared body on the sheet grid for the wide contents
  rail (`#htp-contents` / `#cg-contents` / `#ch-contents`).
- `.team-tile` — `components` + `menus`
- `.track-row` — `components` + `menus`
- `.tune-label` — `components` + `tuner`
- `.tune-row` — `components` + `tuner`

## Dead classes

None, out of 507 — a class defined in `css/` and referenced from neither
`index.html` nor any `js/` file. The three this section used to name
(`dh-leg-swatch`, `dh-sectors`, `foot-end`) have since been deleted from `css/`,
and the last of them took its whole class family with it — which is why no
"foot" prefix is listed above any more.

That the count reached zero is the real headline of this exercise: the
stylesheet was never carrying rot, it was just carrying no map. Keep this
section even at zero — `tests/unit/component-inventory.test.mjs` asserts that every
dead class is named here, so the number moving is a prompt to decide whether the
class is unfinished work or a leftover, and an empty list is a claim worth
being held to.

---

## How to use this

- **Before editing a class, check whether it appears above under "more than one
  file".** If it does, you are editing more than one screen.
- **Before adding a family**, ask whether an existing one already covers it. The
  audit grid (`docs/LAYOUT-AUDIT.md`) measures 38 screens; a new family usually
  means a new one-off, and one-offs are what `.pane-pair` was built to retire.
- **Regenerate with the same method** the test uses if the numbers here drift:
  `node --test tests/unit/component-inventory.test.mjs` will say so first.

## Layout axes — the screen x viewport grid

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
node tools/ui/layout-audit.mjs --help
node tools/ui/layout-audit.mjs --list
node tools/ui/layout-audit.mjs                          # geometry matrix
node tools/ui/layout-audit.mjs --shots --dom            # + PNG / DOM per cell
node tools/ui/layout-audit.mjs --screens=select,garage --viewports=ios-*
node tools/ui/layout-audit.mjs --scale=100,130,150       # each viewport at each UI size
node tools/ui/layout-audit.mjs --gallery                 # fast PNG+DOM (no geometry probe)
node tools/ui/layout-audit.mjs --screen=settings         # one cell
node tools/ui/layout-audit.mjs --survey                  # title-path recipe (+ shots)
```

Geometry output: `artifacts/layout-audit/{audit.json,index.html}`.
Gallery output: `artifacts/layout-audit/gallery/{manifest.json,shots/,dom/}`.
npm: `ui:audit` / `ui:gallery` / `ui:survey`.

---

### Measure first, look second

Screenshots are slow here — the renderer is SwiftShader, and a 1440x900 capture
of a live 3D scene can take minutes — and they prove nothing you can grep. A
geometry probe reads the same truth out of the DOM in milliseconds:

| what it asks | why it is the question |
|---|---|
| does any visible box escape the thing that clips it | this is "text is cut off", stated in a way a machine can check. Scroll containers are exempt on **either** axis they scroll — that is what scrolling is |
| is any interactive element outside the viewport | a button you cannot reach is worse than one that looks wrong. "Reachable" means *some ancestor's computed `overflow` scrolls to it*, asked of the DOM rather than of a list of known pane selectors |
| is any tap target under 24px | WCAG 2.2 SC 2.5.8 (AA) — a conformance floor, so red |
| is any tap target under the `--tap` token | the house comfort floor (44 base, raised to 52 on touch — the tool reads the live `--tap` token). Above 24px this is a preference, so amber |
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

**But stopping the loop also starves `requestAnimationFrame`, and that makes
every OBSERVER-dependent measurement unreliable.** ResizeObserver and
IntersectionObserver deliver on the frame loop, so with the loop stopped they
fire late or not at all inside the probe's window — and the grid then records
the *pre-observer* state as if it were the final layout. MEASURED 2026-08-13 at
834x1194 under the audit's own conditions: the first rAF after a click took
**5346 ms** and the card's ResizeObserver fired at 5402 ms; with the render loop
running the same observer fired in **29 ms**.

This is not hypothetical. It is how the circuit preview map came to be reported
as `map 80x119` — a cosmetic-looking resolution note — when the real behaviour
on deploy was a map rendering permanently at a tenth of its size in a 762x500
card. The metric was right about the pixels and wrong about the cause, and the
cause was the probe.

**So: any check whose answer arrives via an observer must be confirmed with the
loop RUNNING before it is believed, in either direction** — a clean cell may be
hiding a defect the observer would have fixed, and a dirty one may be reporting
a state no player ever sees. `__apex.headless(false)`, or drive it through the
Chrome DevTools MCP without calling `headless` at all.

---

### The viewports, and what each one is for

These are shapes a display can be, not devices people own. Each exists because
some branch turns on or off at it.

| viewport | why it is in the matrix |
|---|---|
| `ios-iphone-portrait` 393x852 | the phone as most people hold it |
| `ios-iphone-landscape` 852x393 | the shape the game is PLAYED in — 343px of sheet height for everything |
| `ios-iphone-landscape-safari` 852x344 | landscape Safari with the toolbar collapsed. The device descriptor's 393px is the FULL-SCREEN/PWA height; a browser tab is ~50px shorter, and until 2026-08 no cell sat between 344 and 393 — the hole that hid the fixed-chrome sheets' worst case |
| `ios-ipad-portrait` 834x1194 | wide sheet, tall window: wants bands, not columns |
| `ios-ipad-landscape` 1194x834 | the two-column case at its smallest |
| `desktop-1280x800` | a small laptop |
| `desktop-1440x900` | the common desktop |
| `desktop-1920x1080` | full screen on a 1080p monitor |
| `desktop-windowed-1920x937` | the same monitor with browser chrome — 143px less, and browser chrome is why a "desktop" can land on a phone branch |
| `desktop-narrow-860x560` | a small window, or a maximised one at 125% zoom; below the 900x600 large-screen gate |
| `desktop-portrait-1080x1920` | a rotated monitor: a PORTRAIT window. `#sel-inner` is capped at `min(100%, max(720px, 78svh))`, so here the sheet is genuinely TALL and takes the band layout — it used to be capped landscape at a flat 720px, which is what made the circuit list two pixels high |

The last two are the ones that keep finding bugs. A viewport's orientation does
not tell you the sheet's shape, and the sheet is what the layout keys on.

---

### The screens, and how to reach each one

The other half of the matrix. `SCREENS` in `tools/ui/layout-audit.mjs` is the
executable version of this table — **it is the inventory**, so a screen missing
from it is a screen nobody measures.

The first draft of this grid held twelve entries and reported "130 cells, 0 red",
which read as full coverage. It was not: the app has far more screen roots than
that (**24** top-level ones are tabled below; counting the sub-views, `SCREENS`
in `tools/ui/layout-audit.mjs` now spans 34 cells over 24 distinct roots — that
inventory, not this prose, is the count that matters), and
several change shape entirely between states behind one root. Qualifying, the
livery editor, the standings table, both tuner panels and every career
sub-screen had never been measured once. The first sweep that included them
found a real WCAG failure in the lighting tuner within a minute.

**Top-level screens** — one root each, reached the way a player reaches it:

| cell | root | route |
|---|---|---|
| `title` | `#overlay` | boot |
| `select` | `#select` | `#mb-race` |
| `garage` | `#carsetup` | `#mb-garage` → ENGINE tab |
| `career` | `#career` | `#mb-career` (new-career SETUP state) |
| `datahub` | `#datahub` | `#mb-data` |
| `howtoplay` | `#howtoplay` | `#mb-help` |
| `settings` | `#pmsettings` | `#mb-settings` |
| `vsfriend` | `#vsfriend` | `#mb-vs` |
| `teampicker` | `#teampicker` | garage → TEAM tab → `#cs-team-card` |
| `racesettings` | `#race-settings` | select → `#sel-go` (NEXT) |
| `seasonsetup` | `#season-setup` | `#mb-season` → SETUP |
| `trackdetail` | `#track-detail` | select → `#sel-map-btn` / `#sel-detail-chip` |
| `quali` | `#quali` | race settings → QUALIFYING LAP **on** → `#rs-go` |
| `standings` | `#standings` | in-race → pause → `#pm-standings` |
| `customize` | `#customize` | garage → **TEAM** tab → `#cs-customize` |
| `advanced` | `#advanced` | settings → `#pm-advanced` |
| `audioset` | `#audioset` | settings → `#pm-audio` |
| `spotify` | `#spotifypanel` | shown directly (no account to connect) |
| `careerguide` | `#career-guide` | career → HOW CAREER WORKS |
| `careerhistory` | `#career-history` | career → SEASON BY SEASON |
| `careeroffers` | `#career-offers` | `__apex.careerRollover()` → `#cr-go` |
| `results` | `#results` | `__apex.finishRace()` |
| `pause` | `#pausemenu` | in-race |
| `hud` | `#hud` | in-race |

**Sub-views** — same root, materially different layout. These are not extra
polish: a screen measured in one state is a screen measured once, and the
lighting tuner's failure was in a state the grid had no entry for.

| cell | why it is its own cell |
|---|---|
| `careerhub` | `#career` is the new-career SETUP on a fresh profile and the SEASON HUB once one exists — two layouts, one root. Hub left: next race + contract/car + `#cr-funds` disclosure; right: upcoming + championship + market ladder |
| `garagelivery` | colour pickers and swatch grids, not option rows |
| `garageteam` | team card + driver chips + EDIT MY TEAM |
| `datatelemetry` | the trace viewer/map/playback — the densest thing in the app |
| `dataschedule` | a wide table, the case that wants horizontal scroll |
| `lightingtuner` | `#lighting`, a docked slider panel; `#lt-rail` goes `display: contents` when wide |
| `cameratuner` | `#camtune`, the same shape for the 13 camera modes |
| `hudmanual` | MANUAL moves the gearbox into the right thumb column and relocates BOOST/OT/AERO — a different control stack, not a restyle |

Also measured, added when the gaps above were closed: `datastandings`,
`datalastrace`, `datalive`, `dataexport` (the rest of the hub's tabs),
`resultsseason` (the same root carrying a championship table, ten rows taller
than a Grand Prix classification), `hudtouch` and `hudbuttons` (the two remaining
steering modes — "touch" hides the gas pedal, "buttons" adds an explicit GAS), and
`garagewheels`.

**`garagewheels` exists to MEASURE a claim rather than assert it.** The line used
to read "the garage's other ten part tabs share one layout, so one stands for
all", which is the kind of statement that is true until it is not. WHEELS is the
last tab, so it also exercises the rail scrolled to its end. It measures clean,
which is what earns the other nine their exemption.

**One real gap remains:** a screen that needs `page.reload()` to reach cannot be
a cell. Reload destroys the execution context, and the first version of the
steering-mode cells did exactly that — every screen AFTER them failed with
"Execution context was destroyed", and two viewports ran out of budget and failed
to boot: 98 skipped cells, not one a layout finding. Reach the state through the
app's own controls (`#pm-steer` cycles the mode) or leave it unmeasured.

---

### Seven axes, and which mechanism owns each

**Read this before adding any layout rule.** Every layout bug this project has
had was one axis being answered by a mechanism that belongs to a different one —
not a missing technique, a misrouted question. The rotated monitor was *viewport
shape* answering for *container shape*. The garage/select divergence was two
screens answering *container size* with two different sets of hand-picked
thresholds.

| axis | the question it asks | mechanism that owns it |
|---|---|---|
| **viewport size** | how big is the window | `@media (min-width: …)` |
| **viewport shape** | is the WINDOW tall or wide | `@media (orientation: …)` — and almost nothing should need this |
| **container size** | how much room did this PANEL get | `@container sheet (min-width: …)` |
| **container shape** | is the PANEL tall or wide | `data-shape="tall\|wide"`, written by `js/ui/sheet-shape.js` — CSS cannot ask (see below) |
| **input modality** | finger, mouse, or both | `pointer` / `any-pointer` / `any-hover`; `body.desktop` |
| **density** | how big should a target be | the `--tap` / `--pad` / `--gap` token ladder in `css/tokens.css` |
| **safe area** | what hardware is in the way | `env(safe-area-inset-*)` via the `--safe-t/r/b/l` tokens |

Two axes are worth extra care because they *look* like each other:

- **Viewport shape is not container shape.** A portrait window can hold a
  landscape sheet — `css/responsive.css` caps `#sel-inner` at 720px tall, so on a
  rotated 1080x1920 monitor the sheet is wider than it is tall inside a portrait
  window. Gating a band layout on `@media (orientation: portrait)` gave that
  screen the tablet layout and left the circuit list two pixels high.
- **Input modality is not size.** A 1024px iPad is not a desktop. `body.desktop`
  comes from `pointer: coarse`, which is the right kind of question; use it for
  affordances, never for room.

**Why container shape needs JavaScript at all:** querying height, `aspect-ratio`
or `orientation` on a container requires `container-type: size`, which applies
size containment in both axes — and a size container may not take its size from
its contents, which every sheet here does. So `sheetshape.js` measures with a
`ResizeObserver` and writes the answer to an attribute. An attribute rather than
a custom property deliberately: attribute selectors carry specificity, and
container queries add none (see the trap below).

### The three mechanisms in detail, and their traps

The table above says which axis owns what. This is how the three CSS mechanisms
behind it actually behave, including the ways they have misled us:

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
- **A modal in the TOP LAYER ignores z-index entirely.** Every `.screen.dim` is a
  `<dialog>` opened with `showModal()` (`js/ui/modal.js`), so nothing in the
  document can paint over it and no `overflow: hidden` or transformed ancestor
  can clip it. Do not add a `z-index` to one — it does nothing, and an inert
  number that looks like a working ladder is worse than a ladder. Ordering
  between two open modals is the order `showModal()` was called in.
- **Anything outside a cascade layer beats everything inside one.** Unlayered
  normal declarations outrank every `@layer`, so a one-ID unlayered rule defeats a
  two-ID layered one and no amount of specificity closes the gap. A stray `}` put
  200 lines of `css/menus.css` outside `@layer components` and quietly defeated
  the phone layout's own overrides. `tests/unit/css-layers.test.mjs` guards it now.
  (`!important` inverts the order: unlayered `!important` is the *weakest*, and
  the first layer declared wins — that is the emergency hatch, not a habit.)

---

### A finding is a claim about the probe until something else confirms it

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
4. Thirty-four "clipped" findings on the lighting tuner, the first time that
   screen was ever measured. `#lt-rail` is `display: contents` on a wide sheet,
   so it has a 0x0 rect while its children lay out normally — and the probe was
   treating it as a clipper everything escaped. The tell was in the numbers: an
   element cannot overflow its clipper by 1071px on the left AND 1413px on the
   right. A clipper must generate a box.
5. "Every checkbox in the app is a 13x13 WCAG failure" — the probe was measuring
   the `<input>`, but these are wrapped in a `<label>`, and clicking the label is
   what toggles them. The activation target is the union of the two. Correcting
   it did not make the finding go away, it made it TRUE: the real target was
   342x16, and 16 still fails the 24px floor. A miscalibrated probe does not just
   cry wolf, it hides the size of the actual wolf.

There is a matching harness lesson about ORDER. The sweep boots once per viewport
and walks the screens in sequence, so a cell can be poisoned by its predecessor:
forcing `#pmsettings.hidden = false` desynced that screen's internal state, and
every tuner cell in the sweep skipped while passing in isolation. **Reach a screen
through the app's own door** (`pause` -> SETTINGS) rather than by unhiding its
element, and add its root to `OVERLAY_IDS` so the reset closes it.

So: **before fixing a cell the grid turned red, confirm the finding by a route
that does not run the probe's code** — a script that actually scrolls the
container, or a screenshot. A probe bug and a layout bug present identically, and
only one of them is fixed in `css/`.

---

### Reading the grid

- **green** — nothing clipped, nothing off screen, no horizontal overflow, no
  page errors.
- **amber** — every finding is a control below the house `--tap` floor but at or
  above WCAG's 24px. Expected on a landscape phone, where compact rows sit
  under the touch ladder's `--tap: 52px`, and on the circuit list, whose 40px full-width rows carry 24px+ of spacing
  — the case SC 2.5.8 explicitly allows.
- **red** — the count of real findings, tap targets under 24px among them. Hover
  for the list; `audit.json` has the element, its clipper, and how many pixels it
  escaped by.

  **`starved` is the one finding here that is not about POSITION.** Every other
  check asks whether something is in the wrong place — clipped, off screen, under
  the notch. A scroll region crushed to a couple of pixels is in exactly the
  right place: it clips nothing, it overflows nothing, it sits inside its parent,
  and until 2026-08-12 every one of those cells scored **green**.

  Three real ones, all found by eye, none by this tool:

  - `#sel-tracks` got TWO PIXELS on a rotated monitor. `js/ui/sheet-shape.js`
    exists because of it; the header of that file is the write-up.
  - `#sel-tracks` again, on a landscape phone at UI SIZE 150% — the same two
    pixels down a different path (flex shrink), while portrait scored green at
    80, 100 and 130 the whole time it was broken.
  - `#cs-options`, the garage's parts list, NINE PIXELS on a portrait phone at
    150%. A screen whose entire purpose is choosing parts, showing none.

  The shape never varies: `scrollHeight` says there is content, `clientHeight`
  says there is nowhere to put it. Both numbers were already being recorded under
  `scrollers` and nothing compared them. The floor is **44 DEVICE px**, not own
  units — this asks what a player can see and touch, so it is asked in the pixels
  their eyes are on, the same reasoning as `tinyTaps`. `hidden > 8` keeps an
  empty list out of it (that is a data state, not a layout defect), and it tests
  `overflow-y` only so a horizontal chip strip is not dragged in by its height.

  A green cell means *nothing was found*, which is not the same as *nothing is
  wrong* — it is only ever as strong as the list of questions above it. This
  check turned four green cells red on its first run.
- **skipped** — the screen could not be reached in that viewport, so **nothing
  was measured**. A skip is not a pass and it is not a finding; the reason is in
  the tooltip and the summary line counts skips on their own, with the command to
  re-run exactly those cells.

  **A click timeout is almost always the box, not the app.** The runner sets a
  12 s default timeout so an unreachable cell costs seconds instead of thirty,
  and on a loaded four-core SwiftShader machine that budget lapses on clicks that
  are fine. Measured 2026-08-12: five cells across a full matrix came back
  `page.click: Timeout 12000ms exceeded`, survived a `--jobs=1` re-run, and read
  for an afternoon like a button that could not be clicked. Probed on a quiet
  box, every one of those clicks landed in ~200 ms, and re-running the two
  viewports gave 78 cells / 0 findings / 0 skips. **Re-run a skipped cell alone
  before drawing any conclusion from it** — the same rule AGENTS.md states for a
  Playwright timeout, for the same reason.

  This was folded into the "something to look at" total until 2026-08-12, which
  made both readings wrong at once: a run with 40 skips looked like a run with 40
  defects, and once the eye learned to discount that number, a run with 5 skips
  read as clean. It cost time three times before the number was split.

A cell going from green to red between builds is a regression with an address:
screen, viewport, element, and the number of pixels involved.
