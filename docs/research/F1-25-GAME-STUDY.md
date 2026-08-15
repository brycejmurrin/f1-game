# F1 25 — a study, and what Apex 26 should take from it

Research pass, 2026-08-14. Sources are cited inline; everything here was read
from the linked page, not recalled. Companion documents go deeper on the three
areas that carry the mode:

- `docs/research/F1-25-DRIVER-CAREER.md`
- `docs/research/F1-25-MY-TEAM.md`
- `docs/research/F1-25-WEEKEND-STRUCTURE.md`

This file is the top-level view: what the game *is*, how its modes divide the
player's time, what reviewers and players actually said about it, and which of
those ideas survive contact with a no-build, phone-playable WebGL game.

---

## 1. What F1 25 is

Eighteenth entry in the series, Codemasters/EA Sports, released 30 May 2025 for
PS5, Xbox Series X|S and PC; holds the 2025 F1 and F2 licences.
([Wikipedia](https://en.wikipedia.org/wiki/F1_25))

**There is no separate "F1 26" game.** The 2026 season shipped as the *F1 25:
2026 Season Pack* DLC on 3 June 2026 — new regs, Audi and Cadillac, Madring, and
a fresh save requirement. ([EA 2026 deep
dive](https://www.ea.com/en/games/f1/f1-25/news/f1-25-features-deep-dive)) That
matters for us: **Apex 26 is a 2026-regulations game**, so the DLC is the closest
commercial reference point we have, not the base 2025 title.

Reception: 8/10 IGN ("comfortably the strongest the series has been since F1
2020"), 8/10 Traxion ("a feature-packed step forward").
([IGN](https://www.ign.com/articles/f1-25-review),
[Traxion](https://traxion.gg/f1-25-review/))

### The mode roster

| Mode | What it is | Retention hook | Apex 26 |
|---|---|---|---|
| **Grand Prix** | One-off weekend vs AI, fully configurable | none — it's the sandbox | **HAVE** (`RACE`) |
| **Time Trial** | Max grip, no wear, leaderboard chasing | global/friend leaderboards | **HAVE** (`TIME TRIAL`) |
| **Driver Career** | Custom or real driver, multi-season, R&D, recognition, accolades | long-arc progression | **HAVE** (`DRIVER CAREER`) |
| **My Team (2.0)** | You are the **team owner**; manage two drivers, drive one per weekend | management depth + team identity | **HAVE** (`MY TEAM`) — but as owner-driver, the *old* framing |
| **Braking Point 3** | Scripted story, ~2 seasons, driver-choice branches | narrative | MISSING |
| **F1 World** | Live-service hub: car parts as loot, scheduled events, invitationals | daily/weekly loop, Podium Pass | MISSING |
| **Podium Pass** | 50-tier seasonal XP track, free + VIP cosmetics | battle pass | MISSING |
| **Challenge Career / scenarios** | Bite-size standardised scenarios, community-voted | short sessions | MISSING |
| **Survival Challenge** (Season 4, Nov 2025) | 5-player, 2-minute elimination sprints, last car knocked out periodically; ≤5 min per event | limited-time token economy | MISSING |
| **Multiplayer / 2-player career** | Ranked, unranked, leagues, split-screen, co-op career | social | **PARTIAL** (`RACE A FRIEND`, 2–4p WebRTC) |

([Beginner's guide mode
list](https://simracingsetup.com/ea-sports-f1/f1-25-beginners-guide/),
[Season 4 announcement](https://www.ea.com/en/games/f1/f1-25/news/f1-25-season-four))

Apex 26 additionally has **SEASON** (a championship with no career layer), which
F1 25 folds into Grand Prix's custom-championship option.

---

## 2. My Team 2.0 — the headline change

The single largest shake-up since My Team's introduction in F1 2020, and the
reason both major reviews scored the game up.

The premise flip: you are no longer a driver/owner, you are a **team owner** who
recruits and manages **two drivers**, and then chooses *which of them to drive
as* each weekend. ([EA career deep
dive](https://www.ea.com/en/games/f1/f1-25/news/f1-25-career-deep-dive))

Structurally it is four facilities:

| Facility | What it owns |
|---|---|
| **Engineering** | R&D — and for the first time **research and development are separate steps**. A researched part must then be *fabricated*, one part at a time until you upgrade capacity, so you must pick which driver gets it first. |
| **Personnel** | Driver contracts — face-to-face negotiation with multiple drivers before the window; leaks to rivals can wreck a signing. Also **Workforce**: more staff = faster part development and faster facility builds, at a payroll cost against the cost cap. |
| **Corporate** | Finances and spend pacing across the season; also the livery **Decal Editor**. |
| **Team HQ** | The facility-upgrade tree; upgrades and resolved negotiations earn **owner XP → training points** for a personal perk tree. |

Three systems ride on top:

- **Resource-point income is inverted by championship position** — leaders get
  *fewer* RP, backmarkers get *more*, mirroring the real aero-testing handicap.
- **Accolades → Fan Rating.** Accolades (introduced in F1 24's Driver Career)
  now feed a team Fan Rating that unlocks ongoing perks, better title sponsors,
  and makes prestigious drivers easier to sign. Rivalries with specific
  competitors boost it further.
- **Driver Icons** can now be recruited by **AI teams too**, and career can add
  an **eleventh team** (Konnersport or APXGP). In the 2026 pack the grid is
  eleven real teams and My Team is the **twelfth**.

Reviewers' verdict on the change was consistently positive but with one clear
limit: it is *not* F1 Manager. "Opting to simulate a race weekend is essentially
still brushed over in a black loading screen calculation. You can't sit and watch
a race unfold as team principal" (IGN). And the driver market is "disappointingly
sparse" — no reserve drivers, no F1 Academy, and real drivers who exist in the
game are locked inside the story mode.

---

## 3. Driver Career — the mode that stood still

F1 24 rebuilt Driver Career around the **Driver Recognition** system:
reputation gates secret contract negotiations, rival offers, and a more motivated
R&D department; **Accolades** are long-arc milestones, blank-slate for a custom
driver and drawn from real achievements when you play as a pro.
([Operation Sports](https://www.operationsports.com/f1-24-career-mode-details-driver-recognition-system-rd-driver-accolades-and-more/))

F1 25 **added almost nothing to it**. IGN: "aside from a fresh injection of real
driver radio recordings, it hasn't changed. The entire intro to the mode being
totally recycled from F1 24, dialogue and all, certainly doesn't leave a great
first impression." Traxion agrees. The only genuine addition is the optional
eleventh team.

The loudest live complaint is **recognition being a grind wall**: players report
being world champion in season three with recognition still at 40–60 against
their team-mate, and therefore locked out of car development. A February 2026
thread has the same problem in F1 25 — "my recognition simply will not go above
50%… I cannot develop my car any further without being lead driver."
([r/F1Game 2026](https://www.reddit.com/r/F1Game/comments/1r9b1m6/recognition_on_driver_career/),
[Steam F1 24](https://steamcommunity.com/app/2488620/discussions/0/4516632262419489050/))

**The lesson for us is a negative one.** Apex 26's `rep` is already better
designed than F1 25's recognition: `docs/CAREER.md` "Objectives and reputation"
scales reputation against `expectedFinish(team)`, so beating a bad car raises it
and cruising in a good one does not. What we must not do is *gate car development
behind it*. That is exactly the wall players are still complaining about two
games later.

---

## 4. What the 2026 pack changed on track — and where we already are

The 2026 regs are the part of this research that maps most directly onto Apex 26,
because we are a 2026-season game:

| 2026 F1 25 feature | Apex 26 status |
|---|---|
| **Overtake Mode** — a deployable ~500 hp boost for wheel-to-wheel moves | **HAVE** — `js/game.js:3489` `c.otT`; "OVERTAKE IS FREE. Its push does not come out of the battery" (`js/game.js:3490`), with an armed/active wheel lamp at `js/game.js:1911` |
| **Active aerodynamics** — real-time front/rear wing state | **HAVE** — `c.aeroX` X-mode flaps, `aeroDfMult()` at `js/game.js:536`, open/close rates at `js/game.js:3619`, drawn on the car at `js/game.js:1863` |
| Lighter, smaller, more responsive cars | **HAVE** (physics model is ours; not a like-for-like claim) |
| Assists that can handle the new systems for you | **PARTIAL** — assists exist; unverified whether they cover OVERTAKE/aero |
| Eleven real teams, custom team is the twelfth | **HAVE** — `docs/CAREER.md` already says "you own the twelfth team" |
| Madring | MISSING (40 circuits shipped; Madrid is not one — unverified whether it is wanted) |

So the two systems EA sold the 2026 pack on, **we already ship**. That is worth
saying plainly: the gap between Apex 26 and the commercial game is not the car —
it is the *weekend* and the *management layer* around it.

---

## 5. What is missing from Apex 26's weekend

Measured against F1 25's Grand Prix weekend, read off our own source:

| Weekend feature | Apex 26 |
|---|---|
| Practice sessions + practice programmes | **MISSING** — `flow`/`session` has no practice value (`docs/CAREER.md` "The mode is two axes") |
| Qualifying | **HAVE** — `js/game/quali.js`, player drives, field is modelled |
| Qualifying format options (one-shot / short / full) | MISSING |
| Sprint weekends | MISSING |
| Race distance options | **PARTIAL** (race length is settable) |
| **Tyre compounds, wear, and a pit stop** | **MISSING** — tyres exist only as a *visual/parts tier* (`js/game.js:1418` `playerTyreTier`, `playerTyreId`); there is no compound model, no wear state, no pit lane |
| Safety car / VSC | **HAVE** — `js/game/racecontrol.js` |
| Reliability / DNFs | **HAVE** — `js/game/reliability.js` |
| Weather / changing conditions | **PARTIAL** — rain spray exists (`js/game.js:1625`); dynamic transitions unverified |
| Track limits and penalties | **HAVE** — the `clean` objective reads cuts and penalties (`docs/CAREER.md`) |
| Formation lap / parc fermé | MISSING |

**The single biggest hole is tyres.** Every strategic decision F1 25 hands the
player during a race — when to stop, which compound, how hard to push — is
unavailable to us, and it is also the cheapest missing system to add in terms of
rendering cost, because it is state and UI, not geometry. Practice programmes are
second, and unusually cheap for us specifically: `Quali.lapTime()` already
models a lap quasi-steadily, so a programme's target time can be *scored* against
a model we already trust.

---

## 6. What players actually said

Worth separating from what reviewers said, because it points at different things.

**Praised:** handling over F1 24 ("smoother, more responsive… you can feel the
car shift under braking — left, right, even diagonally"); AI that makes mistakes
under pressure and runs *divergent strategies* mid-race ("some going long, some
short pitting, some staying out in changing conditions"); My Team finally feeling
like management ("you'll spend just as much time in menus and planning as you do
on track — and that's not a bad thing").
([r/F1Game first
impressions](https://www.reddit.com/r/F1Game/comments/1kzqat2/f1_25_game_first_impressions_from_a_longtime/))

**Disliked:** unskippable cutscenes; the recognition grind; a sparse driver
market; live-service noise. Traxion on F1 World: "superfluous 'invitational'
multiplayer events, which is to say a confusing mess of mobile-game-esque live
service nonsense." IGN: "I'll never be able to get behind its fascination with
clothing and emotes over meaningful classic F1 cars and content."

One player note is directly actionable for us: during Braking Point cutscenes,
"I'd prefer to see the team's performance chart and the current standings… all
F1 fans love a crazy stat chart." Apex 26 has a **DATA HUB** already; the
insight is that career screens should show *more* standings and history, not
fewer, and our career-history screen (`#career-history`) is on the right track.

---

## 7. What Apex 26 should take — and what it should refuse

### Take

1. **Tyre compounds, wear and a pit stop.** The missing strategic spine of a
   race. Enables the thing players praised most about F1 25's AI — divergent
   strategies — which is currently impossible for us to express.
2. **Practice programmes.** Cheap for us because `Quali.lapTime()` already
   exists, and they convert dead pre-race time into career income and setup
   knowledge.
3. **My Team as an owner of two drivers.** We already put two cars on the grid
   for the custom team (`Career.gridDrivers`), so the framing change is mostly
   UI and choice, not new simulation. Picking which car to drive each weekend is
   the highest-value/lowest-cost idea in the whole of F1 25.
4. **Research and development as two steps.** A researched part that must then
   be *built*, with limited capacity, turns our one-shot purchase into a
   scheduling decision — and it needs no new economy, only a queue.
5. **Inverted resource income by championship position.** One line in
   `settleRound()`'s prize maths, and it is a real anti-runaway mechanism the
   sport itself uses.
6. **Accolades as long-arc milestones.** We already derive career totals
   (`careerTotals()` in `js/game/career-ui.js`); accolades are a presentation
   layer over numbers we compute already.
7. **A scenario / challenge mode.** Standardised short situations ("recover from
   a puncture", "hold up traffic for your team-mate") reuse the entire race loop
   and add a mode for the player who has ten minutes. This is Braking Point's
   *mechanics* without its cutscene budget.

### Refuse

- **A battle pass, a currency store, cosmetic loot, or timed events.** F1 25's
  own reviewers called this out by name in both reviews we read. Apex 26 is a
  static-file fan game with no backend; a live-service loop needs a server, a
  clock, and a reason for the player to trust it. All three are absent.
- **A voiced, cutscene-driven story mode.** Braking Point's value is animation
  and voice acting — precisely the two things we cannot afford. Take the
  *scenario* format, leave the cinema.
- **Reverse circuit layouts.** IGN: "left me largely indifferent"; Traxion: "hardly
  a headline feature… quickly loses its appeal." For us it would also mean
  re-auditing scenery, DRS zones and the racing line per circuit — the
  per-circuit clip/float/coplanar baselines in `test:sweeps` are exact in both
  directions.
- **Reputation-gated car development.** The one design mistake in F1 25's career
  that players are still filing complaints about two years on.
- **A full management sim.** Even F1 25 stopped short — you cannot watch a race
  as principal. We should stop in the same place, for stronger reasons.

---

## 8. Sources

- EA, *Take the Lead in My Team 2.0 — F1 25 Deep Dive* (10 Apr 2025) — https://www.ea.com/en/games/f1/f1-25/news/f1-25-career-deep-dive
- EA, *F1 25: 2026 Season Pack Features Deep Dive* (26 May 2026) — https://www.ea.com/en/games/f1/f1-25/news/f1-25-features-deep-dive
- EA, *Season 4 Brings a New Mode and Even More Rewards* (10 Nov 2025) — https://www.ea.com/en/games/f1/f1-25/news/f1-25-season-four
- IGN, *F1 25 Review*, Luke Reilly (3 Jun 2025) — https://www.ign.com/articles/f1-25-review
- Traxion.GG, *F1 25 review: A feature-packed step forward*, Martin Bigg (27 May 2025) — https://traxion.gg/f1-25-review/
- Operation Sports, *F1 24 Career Mode Details* (25 Apr 2024) — https://www.operationsports.com/f1-24-career-mode-details-driver-recognition-system-rd-driver-accolades-and-more/
- SimRacingSetup, *F1 25 Beginner's Guide* (27 May 2025) — https://simracingsetup.com/ea-sports-f1/f1-25-beginners-guide/
- Wikipedia, *F1 25* — https://en.wikipedia.org/wiki/F1_25
- r/F1Game, *First Impressions from a Long-Time Player* (31 May 2025) — https://www.reddit.com/r/F1Game/comments/1kzqat2/f1_25_game_first_impressions_from_a_longtime/
- r/F1Game, *Recognition on driver career* (19 Feb 2026) — https://www.reddit.com/r/F1Game/comments/1r9b1m6/recognition_on_driver_career/
- Steam, *F1 24 — Recognition?* (30 Jul 2024) — https://steamcommunity.com/app/2488620/discussions/0/4516632262419489050/
