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

## The track announcer (follow-up)

`js/audio/announcer.js` read the same paragraph on every visit to a circuit.
Three changes:

- **Race storylines** are pure rows over `info.story`, which `storyFor()`
  gathers from G with every read guarded:
  - the seat and teammate;
  - the championship (the round, the leader, your position and gap, "the final
    round");
  - the career target;
  - a changeable-weather forecast ("Rain is on the way, in about 5 minutes");
  - your time-trial best here.

  Every row is priority 1–3, so a short budget drops the story before it drops
  the welcome, the venue or the lights cue.
- **The sprint** now states the sprint distance (`SeasonCal.lapsFor`), not the
  full race's lap count. The venue line also rotates between three phrasings,
  seeded by the race counter.
- **The wrap-up** (`wrapUp`, called from `endRace` after the results are
  built) reads the winner, the margin, your finish against your grid slot, and
  the fastest lap.
  - RadioVoice's card-hidden observer now cancels speech only if the radio
    itself is speaking. The card expiring would otherwise cut the wrap-up
    mid-sentence.

## Audio realism (follow-up)

Quick wins, all in `js/audio/engine.js` plus one driver module,
`js/audio/car-sfx.js`. Tests: `tests/unit/audio-tune.test.mjs`,
`tests/unit/rival-audio.test.mjs`.

- **Camera mix.** `GameAudio.setCameraMix(id)` is called from
  `setCamMode`. It applies multipliers, and the chase camera is exactly 1, so
  every level measured there is unchanged.
  - Onboard (cockpit, hood, T-cam, rear): the engine is a little closer and the
    wind and reverb drier.
  - TV (heli, side, cinematic, low, overhead): your car sits back (engine 0.55,
    duller filter), the field comes forward (rivals 1.25) and the venue reverb
    opens up (1.8).
- **Downshift blip.** A downshift now flares the note by up to 5%, dying over
  about 90 ms, on top of the gain dip it already had. Upshifts stay a cut.
- **Tyres and surface.** These are driven only from the car's own state, never
  the road's curvature (the "surface" column in `docs/PHYSICS.md`):
  - scrub: `frontUtil` past the grip peak;
  - lock-up squeal: `wheelLock`;
  - off-road rumble: `offroad`, scaled by speed.
- **Pit lane.** On the limiter the engine stutters (an 11 Hz square into the
  engine gain, the same audio-thread trick as the rev limiter). The wheel guns
  rattle as the car drops into the box and again as it is released.
- **Rival voices.** Each nearby car now uses its own power unit's `rateTrim`
  and `cutTrim` from `ENGINE_VOICES`, so a Ferrari passing you does not sound
  like your Mercedes.

### Recorded radio voice and the spotter

The engineer now speaks in a recorded voice. Lines are built by splicing
recorded clips, the same way Crew Chief does it:
`js/audio/voice-pack.js` plays them and `tools/gen/voicepack.mjs` makes them.

- **The pack.** It holds about 440 clips in one file,
  `assets/voice/george.bin`, indexed by `george.json`. There are four kinds of
  clip:
  - every literal run of every `eng.*` template and every engineer.js call,
    cut at the template's slots and punctuation;
  - positions P1–P22, the numbers 0–60, and gaps from 0.1 to 9.9 plus
    "seconds";
  - the surnames of the grid and the legends;
  - the spotter's calls.

  The phrases are harvested from the code rather than listed by hand, so
  adding a line means re-running the tool.

- **The voice.** Kokoro-82M's `bm_george`, rendered on the CPU. It is trimmed
  and stored as 24 kHz mono MP3, because every browser can decode MP3.

- **Composing a line.** The line is matched greedy-longest over the pack's
  keys. **Nothing is half-said:** a line with even one word the pack does not
  hold goes to speech synthesis instead. That covers lap times, other
  channels and names outside the roster.
  - `tests/unit/voice-pack.test.mjs` proves every `eng.*` line without a lap
    time composes, for every driver on the grid.

- **Playback.**
  - Clips are decoded on first use, with an LRU of 80. Decoding the whole
    pack would take about 60 MB.
  - Playback goes through `GameAudio.radioVoice`: the 300 Hz–3.4 kHz band,
    a tanh soft-clip and a compressor, into master.
  - The speech waits for the courtesy figure to finish, the same as
    synthesis does.
  - The card's deadline still cuts the line.
  - A RADIO VOICE setting chooses RECORDED (the default) or SYSTEM (always
    synthesis).

- **The spotter.** `js/race/spotter.js` calls "car left", "car right", "three
  wide", "clear" and "still there".
  - A car is alongside when it is within a car length nose to tail and
    0.9–4.2 m to the side.
  - A 0.2 s debounce stops a car darting in and out from causing a call.
  - "Clear" is said only after a call was made. "Still there" is said once,
    after 4 s.
  - It uses the recorded voice only. Speech synthesis starts too slowly for
    "car left" to be any use.
  - It has its own SPOTTER switch (on by default). It needs the master sound
    on, not TEAM RADIO.

- **Licences.** Kokoro's model, its ONNX export and its voices are all
  Apache-2.0 (`assets/voice/CREDITS.txt`). Piper's British voices descend
  from the lessac dataset, whose licence is reported as non-commercial, so
  they were not used.

### Multi-sample engine: sources (not built yet)

- There is no CC0 Assetto-Corsa-style bank of recordings at discrete RPMs.
- The closest CC0 option is OpenGameArt's six-loop racing set, which is quiet
  and needs normalising.
- The MIT engine-sound-generator (a procedural waveguide model) could pre-render
  loops at chosen RPMs, but it has no offline render built in.

Sources:
- Kokoro-82M: https://huggingface.co/hexgrad/Kokoro-82M
- kokoro-js: https://www.npmjs.com/package/kokoro-js
- OpenGameArt racing loops: https://opengameart.org/content/racing-car-engine-sound-loops
- engine-sound-generator: https://github.com/Antonio-R1/engine-sound-generator

## Next steps (not built)

- Pre-race announcer storylines: grid position, the polesitter, standings in
  a season.
- Career memory ("third podium this season").
- A recorded commentary voice (the `comm` channel still uses synthesis), and
  lap-time clips ("one thirty-two point four").
- An LLM-written line layer, which would need an offline fallback because the
  game is a static site.

## Sources

- Crew Chief V4 — message priorities, expiry, "don't talk in corners", verbosity: https://github.com/mrbelowski/CrewChiefV4
- Elan Ruskin, *AI-driven Dynamic Dialog through Fuzzy Pattern Matching* (GDC 2012): https://gdcvault.com/play/1015317/AI-driven-Dynamic-Dialog-through
- How F1 team radio works (categories, timing discipline): https://www.formuladream.app/blog/how-f1-team-radio-works
- RaceFans team radio transcripts (phrasing): https://www.racefans.net/category/regular-features/team-radio-transcripts/
- Sports commentary beyond repetition: https://kotaku.com/taking-games-commentary-beyond-repeat-performances-5514192
- Web Speech API practicalities (voices load asynchronously, iOS needs a gesture, cancel before speak): https://www.voorhoede.nl/en/blog/exploring-the-web-speech-api
