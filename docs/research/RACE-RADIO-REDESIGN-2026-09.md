# Race radio & commentary redesign — 2026-09

What shipped, why it is shaped this way, and the outside sources it leans on.
Code: `js/race/race-radio.js` (rules + scheduler), `js/race/race-facts.js`
(timing loop + events), `js/race/radio-lines.js` (phrasebook). Tests:
`tests/unit/race-radio.test.mjs`.

## Before

- The **engineer** (`js/race/engineer.js`) called tyres and the pit plan, well —
  and nothing else. Nobody said "you gained a place", "Norris is closing",
  "five laps to go", "safety car", or the result.
- Every line was a fixed template: the same words every time.
- The **announcer** (`js/audio/announcer.js`) spoke once over the loading flyby
  and then went silent for the whole race.
- The HUD gap chips divide a distance by a speed, which swings by a second
  whenever either car brakes — fine for a glance, wrong for a sentence.

## After — the architecture

| Layer | What it does | Borrowed from |
|---|---|---|
| FACTS | A **timing loop**: each car's clock time at 32 checkpoints a lap. The gap is how much later B crossed the line A crossed; the gap trend is that gap now minus the same gap one lap ago. A pass counts only once the new order has **held for 1 s**, and a swap involving a car in the pit lane is a stop, not a pass. | How real F1 timing measures gaps |
| RULES | Each rule pairs a situation with a tier and a phrasebook pool. Event rules fire on an edge (a place gained, the flag, a retirement, a fastest lap). State rules are re-checked twice a second (in range to attack, a car closing, pulling away, out of reach, battery). | Valve's dynamic dialogue: facts matched against rules (Ruskin, GDC 2012) |
| QUEUE | One queue per channel, holding the newest line per rule. A line **expires** (ttl), and it is **dropped as soon as it stops being true** (`still`), so a defend call for a car that has fallen back is never said late. | Crew Chief's message expiry |
| GATE | Tier 5 (flags, last lap, result) always goes out. Below tier 5, a line waits until the card is free, the chatter level allows it, enough time has passed since the last line, and the driver is **not braking or loaded up in a corner**. | Real engineers stay quiet in braking zones; Crew Chief's "don't talk in corners" option |
| WORDS | Each pool is dealt like a deck: every variant is said once before any is said twice, never the same line twice in a row, from a seeded stream of its own (never Math.random and never the sim RNG). | Sports-game commentary anti-repetition |

## The two channels

- **Engineer** (to the driver). It uses the `info` card kind, or `race` at
  tier 5. The chatter setting has four levels:
  - `off`: tyres and stops only; the older engineer module still runs.
  - `key`: flags, places won and lost, the last lap, the result.
  - `normal` (the default): also attack and defend, gaps closing, laps to go,
    personal bests.
  - `chatty`: also status every lap, pace, battery, and cars pulling away.

  A tier-3 or higher event line needs only half the usual spacing.
- **Commentary** (to the viewer). It uses a new `comm` card kind with the
  lowest priority. WHO is COMMENTARY in gold, and there is no car-number plate.
  It is spoken in the announcer's voice and follows the ANNOUNCER switch.
  - `tv` (the default): talks only while a TV camera is up, the broadcast HUD
    is on, or the player's own race is over.
  - `on`: talks over every camera.
  - `off`: silent.

  It calls lights out, lead changes, passes near the front or involving the
  player, re-passes, sustained battles, charges through the field, fastest
  laps, retirements with the reason, pit stops in the top 5, flags, laps to go
  with the leader's margin, the last lap, and the winner (with a close-finish
  variant).
- **RADIO CHECK** (key T / d-pad down, rebindable). The driver asks, and the
  engineer answers with the position and both gaps.

## Rules we kept on purpose

- **One card, one queue.** Everything still goes through `announce()`, so
  nothing ever talks over a penalty or the pit cue. The engineer's tyre calls
  and the new race calls share one voice.
- **Nothing made up.** Until both cars have crossed a line since they were
  first seen, the gap is `null`, so the radio waits rather than say a guessed
  number. For the same reason nothing about gaps is said in the first 10 s.
- **Every line fits its card when spoken.** A test speaks every template,
  filled with its longest plausible values, through `RadioVoice.plan`.
- **Read-only on the sim.** No car field is written and no sim RNG is drawn,
  which also keeps the lap-curvature rule in `docs/PHYSICS.md` intact.

## Next steps (not built)

- Pre-race announcer storylines: grid position, the polesitter, standings in
  a season.
- Career memory ("third podium this season").
- Recorded voice packs in place of speech synthesis.
- An LLM-written line layer, which would need an offline fallback because the
  game is a static site.

## Sources

- Crew Chief V4 — message priorities, expiry, "don't talk in corners", verbosity: https://github.com/mrbelowski/CrewChiefV4
- Elan Ruskin, *AI-driven Dynamic Dialog through Fuzzy Pattern Matching* (GDC 2012): https://gdcvault.com/play/1015317/AI-driven-Dynamic-Dialog-through
- How F1 team radio works (categories, timing discipline): https://www.formuladream.app/blog/how-f1-team-radio-works
- RaceFans team radio transcripts (phrasing): https://www.racefans.net/category/regular-features/team-radio-transcripts/
- Sports commentary beyond repetition: https://kotaku.com/taking-games-commentary-beyond-repeat-performances-5514192
- Web Speech API practicalities (voices load asynchronously, iOS needs a gesture, cancel before speak): https://www.voorhoede.nl/en/blog/exploring-the-web-speech-api
