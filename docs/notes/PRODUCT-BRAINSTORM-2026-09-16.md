# Product brainstorm — what to build next (2026-09-16)

Three inputs, one list. A screen-by-screen inventory read out of the source;
a walk through the running game in Chromium at desktop (1280×800) and phone
landscape (844×390), driving the real menus rather than reading about them;
and web research on what shipped racing games do in their modes and
out-of-car experience. Physics is deliberately out of scope here — that has
its own two notes (`PLAYER-PHYSICS-RESEARCH-2026-09.md`,
`PLAYER-PHYSICS-PLAN-TIER2-2026-09.md`).

## 1. What the walkthrough actually showed

The game is in far better shape than a list of gaps implies. The circuit
picker is genuinely good: flag strip, search, ALL/SEASON/CLASSICS tabs, a
hero still, the circuit map, length, turns, direction, DRS zones, slowest
corner and an elevation trace, with a CIRCUIT DETAIL door for more. The
garage reads as a product, not a debug panel. The settings hub splits five
sections with one-line descriptions. The pause sheet fits phone landscape
without clipping. The cockpit view renders the wheel with a live gear and
rev display.

Seven things stood out as worth fixing or building, in the order I met them.

**The main menu wastes half the screen.** At 1280×800 everything sits in a
right-hand column and the left half holds the title and nothing else. That
is the space where a "continue where you left off" card belongs: last
circuit, last result, career next round, a personal best to beat.

**Race settings are ten steppers and nothing else.** Every row is
`‹ value ›`. Setting a 50-lap race is 47 clicks on LAPS alone. There is no
preset (a quick race, a full weekend), no direct entry, and no way to save a
favourite configuration.

**The Data Hub's failure state is a dead end.** With no network it says
"Couldn't load data. Check your connection and try again." and offers RETRY.
It does not distinguish "you are offline" from "the upstream API is down",
and it shows nothing it already knows. Six tabs all fail the same way.

**Cockpit speed is illegible on a phone.** In cockpit view the speed and
gear live on the steering-wheel display, which at 844×390 is a few pixels
tall. The top HUD strip carries position, lap, time and best, but not speed.

**The first-lap coach message covers the road.** "TYRES ARE COLD — TAKE A
LAP" renders as large centred text across the middle of the screen at the
exact moment the lights go out.

**You start 22nd of 22 by default.** A new player's first experience is the
back of the grid on a three-lap race. That is a defensible choice for
simulation and a poor one for a first five minutes.

**Nothing brings you back tomorrow.** There is no daily seed, no ghost, no
streak, no reason to open the page a second time beyond wanting to drive.

## 2. What the source inventory added

The canonical screen list already exists in the repo as
`tools/ui/menu-screens.mjs` — 38 routes, used by the layout audit. Two
findings from reading against it:

- **Four settings keys are written by real UI but missing from the export
  registry** (`js/ui/settings-export.js`): the driving-coach toggle, the
  on-screen button opacity, the throttle latch and the tyre-wear rule. They
  survive neither SAVE nor LOAD of a settings file. This is a small, sharp
  bug with an obvious fix.
- **No dead buttons were found.** A grep for unreferenced ids flags about
  ninety, and every one checked resolves through delegation
  (`data-step` rows, `data-cs-view` camera buttons, a looped transport
  panel). The lesson for any future audit: click it, do not grep it.

Thin test coverage, by screen: the Spotify dock, the photo-mode controls,
the camera tuner, and career history. The Data Hub and the garage shell have
no screen-named spec; they are covered indirectly by the menu survey and
layout audit.

## 3. What shipped games do that applies here

From the research pass, keeping only what a static site with no backend can
actually do:

- **A date-seeded daily challenge is fully client-side.** Hash the date into
  the PRNG, get an identical circuit, weather and AI seed for everyone that
  day, and compare only against the player's own stored ghost. A shared
  leaderboard is the part that needs a server, and it is the part to skip.
- **Ghosts are shareable as files, not services.** Trackmania stores replays
  locally and people trade them as plain files. A ghost here is already
  JSON-serialisable state.
- **Code sharing is the one proven no-backend virality mechanic.** PolyTrack
  grew on short track codes pasted into Discord. The equivalent here is a
  short string for a setup, a livery or a ghost, and a URL that opens the
  game with it loaded.
- **Graded micro-drills beat free-form advice.** What reviewers consistently
  praise in GT7 is the licence tests and Circuit Experience: short, graded,
  bronze/silver/gold, immediate right-or-wrong. What they call filler is the
  narrative wrapper. The driving coach here is the right organ; it just
  gives continuous advice where a graded drill would give a verdict.
- **Audio driving cues are the standout accessibility feature.** Forza's
  blind driving assists (a braking tone, turn-direction speech, gear cues)
  opened the genre to players who could not play it at all. Colourblind
  palettes and full remapping are now baseline rather than remarkable.
- **The browser is the advantage, not the handicap.** What the web racers do
  better than console ones is zero-friction restart and link-based sharing.

## 4. The list, ranked

Score is impact × confidence ÷ cost. S is a session or less, M is a few, L
is more.

| # | Idea | Cost | Score | What it changes |
|---|---|---|---|---|
| 1 | **Fix the four orphaned settings keys** in the export registry | S | 4.0 | A settings file that actually round-trips. Sharp, provable, already diagnosed |
| 2 | **Speed on the HUD strip**, not only on the cockpit wheel | S | 3.5 | Cockpit view becomes usable on a phone |
| 3 | **Race-settings presets** (Quick Race, Full Weekend, Endurance) plus direct lap entry | S | 3.0 | Removes the 47-click lap counter; makes the screen a choice, not a chore |
| 4 | **Move the first-lap coach line off the racing line** — a corner toast, not centred text | S | 3.0 | Stops the game covering the road at the start |
| 5 | **A "continue" card in the empty half of the main menu** | S–M | 2.5 | Fills dead space with the one thing a returning player wants |
| 6 | **Daily seeded challenge** with a local ghost and a streak counter | M | 2.5 | The missing reason to come back tomorrow. No backend |
| 7 | **Share-a-code** for setup, livery and ghost, plus a URL that loads one | M | 2.5 | The one virality mechanic proven to work without a server |
| 8 | **Graded drills** built on the existing coach: brake marker, trail brake, throttle out, with bronze/silver/gold | M | 2.0 | Turns advice into a loop with a verdict, the piece reviewers praise |
| 9 | **Audio driving cues** (braking tone, corner-direction call) reusing the AI's curvature data, assist-gated | M | 2.0 | The highest-novelty accessibility win; legal under the arc rule as an audio assist |
| 10 | **Grid-position choice** or a sensible default better than last | S | 2.0 | A first race that is a race, not a recovery drive |
| 11 | **One-click screenshot with a lap-time overlay** | S | 1.8 | Most of photo mode's social value at almost no cost |
| 12 | **Data Hub offline state**: distinguish offline from upstream failure, and show the last good data | S–M | 1.5 | An honest empty state instead of a dead end |
| 13 | Colourblind palette and a settings search box | M | 1.2 | Baseline expectations, noticed by absence |
| 14 | Screen-named specs for the Data Hub and garage shells | M | 1.0 | Closes the two largest coverage gaps |

Cheap and obvious first: 1, 2, 3, 4. Those are a single session together and
every one is a defect or a papercut rather than a feature debate.

The one that changes the product rather than polishing it is 6 plus 7: a
daily challenge whose result is a shareable code. That is the whole loop a
static site can own, and neither half needs a server.

## 5. Decisions this needs from the owner

- Is a daily challenge in scope, and may it change the default landing
  experience?
- Does the first race stay at the back of the grid?
- Is a settings search box wanted, or is the five-section hub considered
  finished?
- How much HUD real estate may a speed readout take on a phone?
