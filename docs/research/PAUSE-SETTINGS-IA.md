# Pause + settings information architecture

Updated 2026-09-15 after the code and rendered UI audit. Scope is the pause
and settings sheets; the shared help page follows the same names and paths.

Cited from `js/ui/settings-tabs.js`.

## Why the tabs died

The 2026-08 critique measured ~49% of settings content below the fold
(`docs/archive/research/UI-LAYOUT-CRITIQUE-2026-08.md`). Three peer tabs
made that worse, not better:

- MORE was overflow dressed as a destination. Title Settings restored
  `settingsCategory`, so a player could land on MORE with no idea why.
- DISPLAY became a wall once METRICS, sliders, the HUD sample, renderer
  recovery, and cockpit options shared one panel.
- Tabs cost a sticky row of chrome on the phone-landscape sheet that
  already cannot spare height (`docs/research/UI-DESIGN-PRINCIPLES.md`).

External pattern: a pause first screen is Resume / Settings / Restart /
Quit; settings themselves are a stack, not three equal hops
(Sense Central pause/settings; CheatGrid mobile nav — tabs only when the
destinations are peers you bounce between).

## Locked decisions

**Pause keeps RESUME in the fixed header.** RESTART | SETTINGS share the
first scrolling row. HOW TO PLAY stays one tap away; STANDINGS is
championship-only. Driving tools live together in Settings › Driving: coach,
practice goals, pit strategy and session review. Pause has no duplicate Driving
shortcut or practice controls.
QUIT stays the final destructive action, followed by playback and build info.

**Settings is a drill-down stack, not tabs, not one long scroll.**

Pages: `home` | `controls` | `driving` | `display` | `appearance` | `advanced` | `audio`.

Settings home (`#pm-settings-index`, `.pm-doors`) is a door list:

1. CONTROLS… — input, pedals and bindings.
2. DRIVING… — coach, practice and strategy.
3. DISPLAY… — interface, HUD and graphics.
4. APPEARANCE… — theme, menu accent and HUD accent.
5. STEERING & ASSISTS… — presets, response and aids.
6. MUSIC & SOUND… — playback, effects and volume.

STEERING & ASSISTS and MUSIC are in-sheet pages, with the same chrome as
DISPLAY (`#advanced` / `#audioset` inside `.pm-groups`). Lighting and camera
tuners open from DISPLAY › ADVANCED VISUALS. Their explanatory note says a
race is required for the live preview; unavailable buttons stay disabled.
BACK from a tuner returns to DISPLAY. BACK from a settings page returns to
home and restores focus to its originating door. BACK on home closes settings
to pause or title. Escape follows the same visible BACK control.

Each settings visit starts at home. Entering a page focuses its first visible,
enabled control after page updates. Hidden input sections and controls inside
closed disclosures are skipped; the disclosure summary itself is reachable.

**STEERING & ASSISTS is presets + OVERALL SPEED, then three stacked folds.** Presets
are the always-visible primary (set everything). PACE is the field-wide
slider, same heading + bare range as UI SIZE — it is not a handling feel
and does not live inside a fold. FEEL holds tilt sensitivity and the
four-way STEERING steps. AIDS holds driving help, racing line, adaptive
buttons, and brake cue. ADVANCED stays the granular knobs (`#adv-extra`).
Folds start closed. Summaries are disclosures (steel + rule + left
chevron) and carry the live choice (`FEEL · NORMAL · TILT 6`). No intro
paragraph — How to Play already covers this. Control ids stay.

**DRIVING starts with the coach setting and its latest tip.** PRACTICE A SECTION
groups the goal picker, saved starting point and retry action. PIT STRATEGY
contains next tyres and stint/energy estimates. SESSION REVIEW groups tip counts
and incidents; TECHNICAL DATA is a nested optional disclosure. The page refreshes
availability on entry, including from title. Practice stays limited to solo Time
Trial and marks the session unscored after saving a starting point.

**MUSIC is five closed folds.** MUSIC / SOUND / ENGINE TONE / YOUR TRACKS
/ SPOTIFY. Summaries carry state (`MUSIC · ON · ALL`). ON/OFF lives
inside the fold body so a summary tap only opens. MUSIC and SOUND start
closed, same as ENGINE TONE — the 2026-08 “leave the two most-used
open” default was the DISPLAY wall again. Control ids stay.

**DISPLAY starts with UI SIZE and groups the HUD, metrics, cockpit, renderer
and advanced visual tuners in disclosures.** No reprint
HUD / RENDERER headings — the fold summaries are disclosures (steel +
rule + left chevron, same language as COCKPIT). A plate made them copies
of HALO / TURN CHASING. HUD fold: ON/OFF,
STYLE, LAYOUT, MAP, GAPS, HUD SIZE + sample. METRICS is a sibling fold.
RENDERER fold (`#pm-display-adv`) holds RESOLUTION, the backend picker,
GRAPHICS, RESET, THREE PATH, SCREENSHOTS, SAVE, COPY DIAG. LAYOUT AUTO
is always the full widget set (`fitHud` scales / stacks / drops gaps; it
does not hide a cluster). MAP and GAPS default ON; AUTO on the map still
hides onboard, OFF is the explicit hide. Sliders stay
settings rows (steel track, text value). UI SIZE uses the
same steel italic + rule as COCKPIT; HUD SIZE stays a caption.
Fold summaries are chip-height; the name is steel. Two pair kinds,
then names: gold / red is enablement (ON, OFF, MAP / GAPS when those
clusters show, NO MAP / NO GAPS). Green / blue is agency, and only
on a 2-state AUTO / MANUAL control (GEARS, ACTIVE AERO). AUTO on a
longer cycle (LAYOUT, RESOLUTION, THREE PATH, SCREENSHOTS, MAP: AUTO)
is a name and stays `--text`, like STANDARD / TILT / WEBGL2. Settings
`LABEL: VALUE` rows keep a space after the colon (NBSP + flex gap —
inline-flex collapses a wrap's ordinary space). The same wrap and
inks run on every menu AriaState already watches (title SOUND,
MUSIC & SOUND chips, Spotify REPEAT, career UNLIMITED, season
QUALIFYING / SPRINT, garage FREE BUILD, race-settings labels).
On an ON/OFF pair the selected word is the only selected mark — do not
also light the plate (a red ring on gold ON made red mean OFF and
chosen). The idle sibling stays steel. Named picks (presets, ALL /
DEFAULT, STEERING steps) still get a red ring, without the glow.
METRICS
is a quiet column; the closed summary carries ON/page state; SIDE is
`auto`/`left`/`right` (`apex26.metricsPos`, URL `?metricsPos=`); AUTO
docks left on a short or narrow viewport so the overlay cannot cover
GAS/BRAKE. SIZE is `s`/`m`/`l` (`apex26.metricsSize`, URL
`?metricsSize=`), default S; the overlay bar's S/M/L chip cycles it
and the panel also accepts a desktop corner drag (`resize: both`).
The overlay is `#game-metrics` + a tappable `#game-metrics-bar`. LOG
filters hide unless PAGE is LOG. SCREENSHOTS /
SAVE / COPY DIAG stay secondary rows under the RENDERER fold, not peer
plates of RESET.

**Control language stays.** Button = filled plate, no chevron. Door =
plate + `…`. Heading = steel + `--grad-rule`, not clickable. Disclosure
= steel + rule + left chevron. Picker = `‹ value ›`.

**No new class families.** Index reuses `.pm-doors`. Panels stay
`.pm-group`. Sheet `h2#dlg-settings` reads SETTINGS / CONTROLS / DRIVING / DISPLAY /
STEERING & ASSISTS / MUSIC & SOUND so the first-child `.pm-group-h` on those pages
stays hidden.

## Rejected

| Approach | Why not |
|---|---|
| Keep three tabs, restyle them | MORE is still a bin; DISPLAY is still a wall; sticky chrome still eats the phone row. |
| One long settings scroll | The 2026-08 fold measurement. Phone landscape cannot show 49% below. |
| Accordion of every group on one sheet | Same fold problem plus heading-vs-button confusion we just spent a pass killing. |
| Put HOW TO PLAY back under settings | It was buried there. Pause is the one-tap path. |

## Shared help and driving feedback

HOW TO PLAY starts with a short driving introduction and input disclosures.
The current device is first and open on entry; other devices remain available.
Keyboard and controller prompts come from the same live binding tables as
CONTROLS, including references within the racing and settings help.

The driving coach explains its advisory role and shows its latest tip with a
reason under SETTINGS › DRIVING. It never changes steering, throttle or brakes. Track-limit
warnings and WRONG WAY remain visible across driving camera modes. Overtake
reports the reason it cannot activate; automatic aero has an explicit HUD state.

UI reset controls use the shared small tap target without inheriting the full
width of a settings action. Reset keeps each scale's own device default.
Native slider targets use the sheet's actual fitted scale so they stay 32 px
tall even when a short viewport caps a larger UI size preference.
Rapid control taps keep their native click. The shell's double-tap fallback
exempts buttons, pickers and other interactive targets; noninteractive areas
retain the guard. Controls use `touch-action: manipulation`, following
[WebKit's fast-tap guidance](https://webkit.org/blog/5610/more-responsive-tapping-on-ios/).

These choices follow [Xbox focus guidance](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/112)
and [context guidance](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/114).
Rendered verification and its platform limits belong in the change report.
