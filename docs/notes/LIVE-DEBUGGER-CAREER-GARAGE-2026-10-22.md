# Live debugger hunt: career, season and garage on a phone (A·H2, 2026-10-22)

Ask (Bryce, about 06:05Z, through OrchA 22): hunt for the bugs a phone player hits in DRIVER CAREER, MY TEAM, the
standalone SEASON screen and the GARAGE. The setup is iPhone, 844x390 landscape, touch. Fix only CONFIRMED
findings, and each fix carries a test that fails before it and passes after.
Branch `cursor/live-debug-career-1-a2h7`, base `72408e99`.

Box: cloud container with SwiftShader and no GPU. The screens were driven through Playwright MCP at 844x390.
Geometry came from `tools/ui/layout-audit.mjs`.

## Prior art

prior-art-scout (DEFECT-LEDGER, BUGS.md, and the LIVE-DEBUGGER-CAREER, LIVE-DEBUGGER-GARAGE and
LIVERY-EDITOR-AUDIT notes) listed about 30 known rows. On this tip they stand as follows:

- Points still awarded when a race ends on the time cap: `classified` is by design (season-cal.js `award` comment).
- Countback not reset at rollover: fixed (career.js `s.finishes = {}`).
- D13, the phone compact tier hiding the editor status line: fixed (garage-experience.css).

None of these was re-reported.

## Findings

| id | file:line | sev | verdict | evidence |
|---|---|---|---|---|
| G1 | js/garage/setup-sheet.js (keydown, `cs-liv-ed-cancel`) | medium | CONFIRMED-LIVE, FIXED | See below |
| L1 | 12 screens × 2 phone viewports | n/a | REFUTED | No defects found; see below |
| C1 | career setup validation (`cr-go`) | n/a | REFUTED | No defect found; see below |
| C2 | career hub `cr-facility` | n/a | REFUTED | No defect found; see below |
| C3 | career slot DELETE | n/a | REFUTED | No defect found; see below |
| C4 | career → GARAGE → Escape | n/a | REFUTED | No defect found; see below |
| H1 | js/career/career-ui.js:1490 `careerTotals().starts` | low | CODE-TRACED, not fixed | See below |
| H2 | js/career/custom-team.js:352 | low | BY-DESIGN?, not fixed | See below |

### G1: Escape on the paint editor closed the whole GARAGE (fixed)

**Repro.** GARAGE → LIVERY → Create livery → SOLAR, name it "My Solar", then one Escape. The result was
`garage:false`, and reopening showed the editor closed with the design gone. Escape had pressed
`#carsetup`'s door (`data-esc-close="cs-back"`), and `discardLivDraft()` dropped the draft on hide. Escape also
arrives from Bluetooth keyboards and gamepads.

**Fix.** The editor now claims Escape first, as the camera panel already does (setup-camera.js). Escape
presses the editor's CANCEL. When the draft differs from the design the editor opened with
(`designTools.dirty()`), CANCEL arms first as "DISCARD EDITS?" (the `G.armConfirm` idiom), so a stray touch
on CANCEL is also safe.

**Test.** `tests/specs/parts-livery-designs.spec.js` ("an edited design survives one stray Escape or CANCEL").

### L1: phone layout audit, no defects

`layout-audit --viewports=ios-iphone-landscape-844,ios-iphone-landscape-safari` measured 24 cells:

- season-setup, career, careerguide, careerhub, careerhistory and careeroffers
- garage, garagelivery, garageteam and garagewheels
- standings and resultsseason

The run reported "24 cells, 0 with something to look at", meaning 0 clipped, 0 under 24 px and no horizontal
overflow. Its only notes are deep-scroll ones: `#cs-options` is about 15 screens on the parts tab.

### C1: career setup validation, no defect

A blank name, code "1" and number -5, followed by a double tap on START CAREER, saved nothing. The three
inline errors were shown.

### C2: factory upgrade double tap, no defect

A double tap on `cr-facility` bought one level: 6200 → 3200, and the second tap was refused as SHORT.

### C3: slot delete, no defect

A double tap on DELETE only arms the button ("DELETE?"), and the save is kept. A keyboard Enter keeps focus on
the armed button.

### C4: Escape from the career garage, no defect

Escape from the GARAGE opened through the career hub returns to the hub, not the title screen.

### H1: race starts recounted from the current calendar (not fixed)

`careerTotals().starts` multiplies every archived season by the current calendar's length. It only drifts
when a build ships a different `Tracks.SEASON` length. It was left alone because fixing it means a new tally
key plus a migration.

### H2: logo upload is not undone by BACK (not fixed)

A logo upload in the customize screen saves at once, so BACK does not undo it. The control is labelled BACK,
not CANCEL. This needs a decision, not a code fix.

## Follow-ups (not owned here)

- Tapping CLOSE GARAGE (`cs-back`, js/game.js `garageBack`) while the editor is open still discards an edited
  design silently. js/game.js is outside this lane, so a game.js owner should arm it when
  `csLivCreating` is set and the draft is dirty.
