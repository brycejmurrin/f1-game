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

## 2. The one content-loss finding left

`span.cs-tab-cur` truncates in **262 cells** on the garage's LIVERY and TEAM
tabs. The text is a livery name — "Kannapolis Compound" — shown under the
category label in the rail.

This is the only place in the app where content is still being cut, and it is
worth separating from the rest: it is not a layout failure, it is a name too long
for a rail that is 104-140 own units wide by design. The rail's width is set by
what "SUSPENSION" needs (see css/carsetup.css), and no width that fits a category
label fits an arbitrary livery name.

**Verdict: change, and cheaply.** The current value belongs on the OPTION LIST
side, which is 2-3x wider, not in the rail. Failing that, the rail entry should
show the category alone. Truncating a proper noun to "Kannapolis Comp…" tells the
player less than showing nothing would.

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

## 5. The mechanism for (c), and its one blocker

`<details name="…">` gives a **native exclusive accordion** — one section open at
a time — with no JS, correct keyboard handling and correct ARIA. It is the
"pick a group rather than scroll past all of them" pattern, and it is markup, not
a module. `#advanced` already hand-rolls exactly this with a
`<button aria-expanded>` driving a `<div hidden>`.

`interpolate-size` is **explicitly not Baseline** (MDN: "does not work in some of
the most widely-used browsers") and only buys the open/close animation. Skip it;
the collapse works everywhere without it.

**Per screen:**

- **`advanced` — do it.** The summary is plain text, so the conversion is clean.
  Four files: markup, the handler reduces to a `toggle` listener for the click
  sound, CSS for the summary box, and two specs that assert `hidden` on
  `#adv-extra` — an attribute `<details>` does not use. Prepared on
  `claude/menu-accordion`; **not yet verified in a browser.**
- **`audioset` — BLOCKED, and not by effort.** Two of its four sections carry
  ON/OFF toggles INSIDE the section head. Interactive controls inside `<summary>`
  mean tapping the toggle also opens and closes the section. Converting requires
  relocating them, which reverses a decision this file records (full-width halves
  made a four-control panel scroll on a landscape phone). Needs a design call
  first.
- **`customize` — needs sections invented.** 34 controls and no grouping, so
  there is nothing to convert. How liveries group is a product question.

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
