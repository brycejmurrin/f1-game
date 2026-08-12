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

`title`, `career`, `datahub`, `vsfriend`, `pause`, `hud` (+ `hudtouch`,
`hudbuttons`, `hudmanual`), `trackdetail`, `standings`, `careerhistory`,
`careeroffers`, and all six data-hub tabs (`datatelemetry`, `dataschedule`,
`datastandings`, `datalastrace`, `datalive`, `dataexport`).

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
| `resultsseason` | 13.8 | a results table |
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

## 6. Known open defect

**The garage sheet does not re-lay-out when the viewport shrinks while it is
open.** Measured at phone-landscape: fresh gives 420x377 (ratio 0.898, `wide`);
resizing desktop -> phone-landscape leaves it **420x876** (ratio 2.086, `tall`) —
876px tall inside a 393px viewport.

**Pre-existing, and confirmed so.** Identical to the pixel on build 1085, before
any of this pass. `tests/specs/ui-resize.spec.js` catches it and should stay red
until the sheet is fixed; both Playwright and the MCP reproduce it independently,
so it is not a harness artifact.

Two hypotheses were wrong on the way here and are recorded so nobody re-derives
them: it is NOT the hysteresis dead-band (2.086 is nowhere near 0.95-1.05), and
it was NOT introduced by this pass.

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
6. The resize bug looked like the hysteresis dead-band, and like mine.

The rule that follows: **any layout claim gets a number before it gets a
commit.** `tools/mcp-cli.mjs` exists for that, and its A/B form — two trees on
two ports, same page, one variable — is what caught (2) and (5).
