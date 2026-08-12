# Every menu, page and pop-up: the systematic review

**What this is.** One pass over all 40 surveyable screens, measured rather than
eyeballed, with an explicit verdict for each: leave it, change it, or blocked and
why. It closes the 2026-08 UI pass, which until now was a series of targeted
fixes to defects found one at a time.

**The evidence.** `tools/layout-audit.mjs` at `--scale=80,100,130,150` across all
ten viewport shapes: **1990 cells, 40 screens**. Plus a DOM inventory of every
`<dialog>`, and live A/B measurement through `tools/mcp-cli.mjs` where a
recommendation needed a number rather than a reading.

---

## 1. Structure: finished

**Zero** structural findings across 1990 cells — nothing clipped, nothing
starved, nothing off screen, nothing under the hardware insets, no horizontal
overflow, no page errors. Every screen, every shape, every size.

That is the end of a real arc. The same sweep at the start of this pass had 60
findings, and the classes that produced them are now closed by guards rather than
by vigilance:

| guard | catches | added because |
|---|---|---|
| `starved` (layout-audit) | a scroll region with no room | three 2-9px lists scored GREEN for months |
| `deepScroll` (layout-audit) | a body needing >3 screens | nothing divided scrollHeight by clientHeight |
| `scroll-strips.test.mjs` | strips that disagree about touch | four hand-rolled copies, two incomplete |
| `source-integrity` (HTML) | tags that do not nest | an unbalanced tag ships silently |
| `source-integrity` (dead CSS) | selectors that never match | seven inert rules shipped for months |

**Nothing on this axis is outstanding.** What follows is therefore not defect
triage; it is whether each screen is ARRANGED well.

---

## 2. The one content-loss finding: closed

`span.cs-tab-cur` truncated in **262 cells** on the garage's LIVERY and TEAM
tabs. The example that made the case was a livery name — "Kannapolis Compound"
— shown under the category label in the rail.

This was the only place in the app where content was still being cut, and it
was worth separating from the rest: it was not a layout failure, it was a name
too long for a rail that is 104-140 own units wide by design. The rail's width
is set by what "SUSPENSION" needs (see css/carsetup.css), and no width that
fits a category label fits an arbitrary livery name.

**Fixed the LIVERY tab, the "failing that" branch of the verdict below.**
`js/game/setup-ui.js`'s LIVERY pseudo-tab no longer passes the current livery's
name as the rail's sub-label — it shows "LIVERY" alone, same as the category
label on every other tab. The full name was never lost: it is already shown in
full on the option-list row, 2-3x wider and un-truncated. Moving the value
there instead (the verdict's first-choice fix) was not needed because it was
already true.

**The TEAM tab's driver surname was left as-is, deliberately, not by
oversight.** It shares `.cs-tab-cur` with LIVERY and some of the 262 cells
above are its, but a driver surname is a fixed, curated vocabulary (~20 real
F1 names) close in length to "SUSPENSION" itself, not the open-ended,
player-typed text a livery name is — the same "known desktop three-pixel case"
this section already carves out below, not the multi-character content loss
the livery name produced. Bundling the two under one number is what made this
look like a bigger problem than the actionable part of it was.

(`span.cs-tab-lbl` truncating "SUSPENSION" in 4 cells is the known desktop
three-pixel case already documented in css/carsetup.css. Left alone.)

---

## 3. Arrangement: 19 screens need nothing

Measured clean AND shallow (worst scroll ≤ 3 screens at every size):

`title`, `career`, `careerhub`, `datahub`, `vsfriend`, `pause`, `hud`
(+ `hudtouch`, `hudbuttons`, `hudmanual`), `trackdetail`, `standings`,
`careerhistory`, `careeroffers`, `teampicker`, `racesettings`, `spotify`, and
all six data-hub tabs (`datatelemetry`, `dataschedule`, `datastandings`,
`datalastrace`, `datalive`, `dataexport`).

Four of those earn a word each, because they were fixed DURING this pass rather
than being clean all along:

| screen | what it took |
|---|---|
| `teampicker` | 12 clipped tiles at 150% — the `auto-fill` floor could not shrink below itself |
| `racesettings` | rides on `#rs-body`'s compact tier; clean at every cell once `data-density` reached the tokens |
| `careerhub` | shares `.pane-pair` with `select`; the `--pair-at` unit fix corrected it for free |
| `spotify` | 11 controls, one section, never deep — nothing was ever wrong here |

**Verdict: leave.** Half the app is done. Recording that explicitly matters as
much as the list of problems — it is the difference between a review and a
backlog.

---

## 4. Deep scroll: three different things, and only one is a defect

21 screens exceed 3 screens of scroll somewhere. Sorted by worst case, they split
three ways, and conflating them is what made this list look alarming:

### (a) Long by nature — leave

| screen | worst | what it is |
|---|---|---|
| `select` | 23.8 | forty circuits |
| `howtoplay` | 24.6 | a prose document |
| `careerguide` | 31.9 | a prose document |
| `results` | 6.9 | a results table |
| `resultsseason` | 13.8 | the same table, a season round |
| `quali` | 9.5 | a classification table |

A list of forty things is forty things. `deepScroll` cannot tell "a form that
should have been arranged better" from "a list with forty items", because that
distinction is about what the content MEANS — which is why the check reports as
information and colours nothing.

### (b) Constrained by physics — leave, with the lever named

| screen | worst | why |
|---|---|---|
| `lightingtuner` | 39.4 | ~180 sliders behind a category chip |
| `lightingtunerfly` | 48.2 | the same, in a 120-unit-wide flying panel |
| `cameratuner` | 11.7 | six knobs x 13 camera modes |
| `garage` / `garageteam` / `garagewheels` | 11-17 | 14 categories in 67 units of rail |

The chip strip already filters these; the depth is per-category and that is what
a tuner is. **Three redesign attempts here were measured and all lost:**

- `#cs-tabs` as two columns — the rail is 127 own units and a chip needs 104, so
  it truncates.
- the livery list as a grid — 34.3 screens became **78.1**, because at 124 units
  each row wraps to several lines.

`garagelivery` deserves naming on its own: at **86.2 screens** on a landscape
phone at 150% it is the deepest cell in the entire 1600, more than twice the
next. It is 70 livery rows one per line in a 274-unit column. It belongs in this
category and not in (c) for one measured reason — the obvious fix makes it 2.3x
worse. A swatch GRID without full-width text rows would be the real answer, and
that is a visual-design decision about dropping labels, not a layout one.
- the stat block as one line — clipped CORNERING and BRAKING.

The one lever that moves all of them is the garage HEADER, and its cheap wins are
already taken (FREE BUILD off the full tap ladder, budget bar hidden when
compact: 146 -> ~110 own units). What remains is the 46-unit stat block, and
removing it is a product decision about whether SPEED/ACCEL/CORNERING/BRAKING is
feedback you need WHILE choosing parts. **Not a CSS decision. Escalated, not
guessed.**

### (c) Genuinely improvable — change

| screen | ctrls | sections | verdict |
|---|---|---|---|
| `customize` | 34 | **0** | densest screen in the app with no grouping at all |
| `audioset` | 30 | 4 | already grouped — one open at a time would collapse it |
| `advanced` | 25 | 0 | plus one hand-rolled disclosure |

`settings` was in this group and is fixed: five of its sixteen controls were
DOORS, not settings, and separating them took the body from 780 to 655 own units
(1.55 -> 1.30 screens) on a portrait phone.

---

## 5. The mechanism for (c): all three done

`<details>` gives a **native disclosure** — no JS, correct keyboard handling and
correct ARIA — for "pick a group rather than scroll past all of them," and it is
markup, not a module. `#advanced` used to hand-roll a single disclosure this way
— a `<button aria-expanded>` driving a `<div hidden>` — before the conversion
below.

**None of the three below use `name="…"` (the exclusive-accordion form, one
section open at a time).** It reads as the obvious choice for "reduce a busy
screen" and was the first thing tried here, but every one of these three
screens turned out to have more than one group a player needs visible at once
— required form fields in two places on `customize`, MUSIC and SOUND EFFECTS
both worth a glance while balancing a mix on `audioset`. Exclusivity would have
fixed the density at the cost of fighting that. Independent `<details>`, each
collapsible on its own with its own default open/closed state, is what's below
in every case — the density win comes from which state is default, not from
forcing a choice between sections.

`interpolate-size` is **explicitly not Baseline** (MDN: "does not work in some of
the most widely-used browsers") and only buys the open/close animation. Skipped
everywhere below; the collapse works fine without it.

**Per screen:**

- **`advanced` — done.** `#adv-more`/`#adv-extra` (button + `hidden` div) is now
  `<details id="adv-details"><summary id="adv-more">`/`<div id="adv-extra">`,
  both ids kept so nothing else that referenced them had to move. The claim
  this section used to make — "prepared on `claude/menu-accordion`; not yet
  verified in a browser" — overstated what that branch actually held: a
  scripted edit had tried this exact conversion, died mid-edit after inserting
  a closing `</details>` with no matching open tag, and was caught and reverted
  by eye (that incident is why `source-integrity.test.mjs` now asserts every
  tag in `index.html` nests correctly — see that test's own commit). No working
  markup ever landed; "not yet verified" was a euphemism for "was broken and
  rolled back." Converted again from scratch this time, checked against that
  guard after every edit, plus `js/game/steer-tuning.js` (the handler is now a
  bare `toggle` listener for the click sound — `<details>` owns open state,
  keyboard toggling and the expanded announcement itself) and `css/tuner.css`
  (`<summary>` gets no styling from tokens.css's base `button` rule, so the
  button look is repeated explicitly, with the default marker swapped for one
  that flips on `[open]`). `tests/specs/sliders.spec.js`'s disclosure test now
  reads `#adv-details.open` instead of `#adv-extra.hidden` — the attribute a
  `<details>` doesn't use, exactly as this section predicted.
- **`audioset` — unblocked without relocating anything.** The blocker as
  originally written assumed the ON/OFF switches had to move out of the
  section head to make `<summary>` work; they didn't. A click on the switch
  still bubbles up through the summary by default, but a `stopPropagation()`
  in the switch's own click handler (`js/game/audio-panel.js`) stops it there
  — the section only toggles when the click lands on the label text, exactly
  as it should. The full-width-halves decision this section used to cite is
  untouched: same small inline switches, same position, same size. All four
  `.as-sec` are now `<details>`. MUSIC and SOUND EFFECTS — the two controls
  every player actually uses — open by default, switch reachable either way
  since it's in the summary itself. YOUR TRACKS and SPOTIFY — an upload
  workflow and a 15-control integration that's "dormant until a Client ID is
  entered" — close by default; together they were most of this screen's 30
  controls. `tests/specs/music-library.spec.js` exercises exactly those two
  sections through Playwright locators that need real visibility, so its one
  shared `openAudioPanel()` helper now force-opens both before any test body
  runs, rather than touching each assertion.
- **`customize` — done, scoped to the section that was actually optional.**
  The 34 controls already split three ways by what they're FOR, not just by a
  `.cz-sep` label: identity (name, short code, primary, accent — 4 controls,
  required), paint (12 rows, already labelled "EXTRA PAINT — OPTIONAL" in the
  markup before this pass), and driver (name, code, number — 3 controls,
  required). Only the paint block — the actual bulk of the 34, and the one
  group already telling players it's skippable — became a `<details>`,
  collapsed by default, wrapping `#cz-paint-rows` (its own nested grid, same
  `display:contents`-doesn't-work lesson as `#advanced` above applies here
  too). Identity and driver stay flat: they're required, small, and hiding a
  field the player MUST fill in behind a disclosure they might not open is a
  worse trade than the scroll it would save. On a landscape phone this took
  the whole form from scrolling past the SAVE button to fitting above the fold
  with paint collapsed, without touching a field anyone has to fill in to
  finish the form. Exclusive accordion (`name=`) was considered and rejected:
  identity and driver are two more required groups, and forcing the player to
  close one to see the other fights a fill-out-this-form flow rather than
  helping it — that pattern fits `advanced`'s browse-one-topic-at-a-time
  screen, not this one.

---

## 6. Closed: what looked like a stuck sheet was a slow measurement

**The garage sheet's SIZE is always correct, instantly.** Every reproduction —
manual, scripted, Playwright — agreed on this without exception:
`getBoundingClientRect()` read the resized box within ~250ms of every resize,
every time. The claim recorded here earlier ("876px tall inside a 393px
viewport, pre-existing on build 1085") was wrong. It compared two builds using
the same one-shot, non-headless measurement, which is exactly the methodology
that turned out to be unreliable — so the "identical on both builds" reading
was two unreliable measurements agreeing with each other, not two builds
sharing a bug.

**What is real: `data-shape` can lag the box by anywhere from ~250ms to several
seconds**, specifically after opening the garage — which runs a live 3D car
preview (`renderSetupPreview`) regardless of race state — and then resizing.
It always converged to the CORRECT value in every run; the question was only
*when*, and *when* varied by an order of magnitude between otherwise-identical
runs. Three confounds stacked before the real cause was isolated:

1. **A leftover MCP browser tab.** The garage's live preview was left rendering
   in a chrome-devtools-mcp session for 37+ minutes while Playwright tests ran
   concurrently on the same 4-core box — one Chrome process measured at 363%
   CPU. This is the exact mistake `.claude/skills/mcp-probe/SKILL.md` names and
   warns against: park the MCP page to `about:blank` the moment you are done
   with it.
2. **The render loop's own cost.** Even with that tab parked, `data-shape`
   still lagged on a genuinely idle box, because the PAGE UNDER TEST keeps its
   own 3D preview rendering unless told not to — and SwiftShader software
   rendering is expensive enough, per frame, to starve the same page's JS
   timers and DOM event delivery. This is the identical class of bug CLAUDE.md
   already documents for `waitForFunction` on a rendering page; it turns out to
   also reach plain `setTimeout` and `ResizeObserver` under enough load, not
   only rAF-based polling.
3. **The test not calling `headless(true)`.** Every other layout tool in this
   repo (`tools/layout-audit.mjs`, the menu-survey specs) stops the render loop
   before doing timing-sensitive DOM waits, for reason (2). `ui-resize.spec.js`
   was the one file that did not.

**The fix, in `tests/specs/ui-resize.spec.js` and `js/game/sheetshape.js`:**
`waitReady()` now calls `headless(true)`, matching the rest of the suite; the
convergence wait's budget went from 5s to 15s, with the measured 7.1s outlier
that motivated it recorded in the comment; and SheetShape's `resize` listener
now calls `reclassify()` (which updates every observed sheet) instead of
`classifyBody()` alone (which only ever updated the body's own density). That
last change is real and kept, but — said plainly, because the first version of
this document overstated it — it is belt-and-braces, not the fix for the
measured symptom: the actual delay traced to general main-thread starvation
under the render loop, which affects `resize` events and `ResizeObserver`
callbacks alike, so switching which one drives `reclassify()` does not bound
the delay on its own. It stays because a second, independent delivery path for
the same question is cheap and costs nothing on an event that fires rarely —
the same argument `watchScale()` two functions up already makes for the same
class of gap.

Verified: `tests/specs/ui-resize.spec.js`, 4 tests, 3 consecutive full runs, 12
executions, 0 failures.

---

## 7. What this pass should be remembered for

**Layout intuition here has a poor hit rate, and the instrument is cheap.** Six
predictions read from the CSS were reversed by measurement:

1. `#cs-tabs` at 16.7 screens looked like a sizing bug — it is 14 items in room
   for 1.5.
2. The livery grid would "halve" the scroll — it was 2.3x worse.
3. The one-line stat block "keeps all four numbers" — it clips two.
4. `.sheet-head h2` shrinking as UI SIZE grows looked like a defect — it is
   deliberate, and the clamp's px bounds do scale.
5. The settings door row was an obvious win — it REGRESSED landscape until the
   threshold was moved to the 2/3-column boundary.
6. The "stuck sheet" looked like the hysteresis dead-band, then like a real
   product bug identical across two builds, then like an under-scheduled
   ResizeObserver. It was main-thread starvation from a live 3D render loop —
   partly my own leftover MCP tab, partly the page's own per-frame cost — none
   of which a single measurement could distinguish from the others. It took
   parking the tab, disabling rendering, and three separate scripted repros
   with increasingly controlled variables to find.

The rule that follows: **any layout claim gets a number before it gets a
commit** — and when a number is surprising, ask whether the MEASUREMENT itself
could be the thing that's wrong, not only the code it's measuring. `tools/
mcp-cli.mjs` exists for the first half, and its A/B form — two trees on two
ports, same page, one variable — is what caught (2) and (5). The second half
had no tool; it took noticing a 363%-CPU process in `top` while three
consecutive "confirmations" of the same wrong conclusion sat in the transcript.
