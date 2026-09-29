# Buddh International Circuit — Visual Design Brief

**Setting:** DAY, modern / green theme (Greater Noida plain). ~5.14 km, 16 turns, clockwise.

## 1. Setting

Tilke-designed on flat farmland outside Greater Noida, Uttar Pradesh (Jaypee Greens Sports City). Three Indian Grands Prix, 2011–2013, then lost to a tax dispute; MotoGP returned 2023. Wide, modern, and built with deliberate artificial elevation on an otherwise flat plain — the Turn 10–12 multi-apex sits at the bottom of a constructed drop.

**Sourced:** [Wikipedia — Buddh International Circuit](https://en.wikipedia.org/wiki/Buddh_International_Circuit); [RacingCircuits.info](https://www.racingcircuits.info/asia/india/buddh-international-circuit.html) (5.137 km GP length). Brief `lengthKm` 5.138 matches the authored def.

## 2. Atmosphere & palette

Hot, hazy, dust-shifted. The light is diffused by haze rather than clean. Grass is dry and patchy; earth is reddish. Brick kilns and a pylon line mark the Greater Noida plain behind the outfield.

## 3. Elevation

Engineered rather than natural: a climb into Turn 3 and a long drop to the Turn 10–12 complex. Read as banked earthworks, not hills. Do not flatten or add knife-edge grade spikes.

## 4. Landmarks & surroundings by lap position

Clockwise, so **+1 (right of travel) is the infield** — pits, paddock, broadcast.
The outfield (−1) is open farmland almost the whole way round.

| s | Side | Distance | Box description |
|---|---|---|---|
| 0.005 | +1 | 14 | Pit lane and the pit block: one long low modern `building` with a flat roof and a continuous glazed band, `guardrail` running the length of the pit wall, `marshalPost` at the exit. Keep it low and horizontal. |
| 0.022 | −1 | 24 | **Main grandstand** — required `modelGroup("buddh-main-grandstand")`: stepped seating rising away from the track under a **sea-wave aluminium cantilever** (steel truss bays at varying elevations). Camera tower at the northern end; sponsor band along the seating base. Everything else on the lap should read as smaller than this. |
| 0.060 | +1 | 45 | Paddock behind the pits: coach ranks, hospitality units, `broadcastCompound` at the far end. Hard flat concrete apron, no grass. |
| 0.108 | −1 | 32 | Braking zone into Turn 1: very wide pale `runoffApron`, `tyreWall` set well back, billboard pair beyond. |
| 0.125 | +1 | 20 | Inside of Turn 1, dusty: reddish earth, marshal post, low bush clumps. |
| 0.185 | −1 | 140 | First open outfield: cultivated strips, bunds, sparse field-boundary trees, low sheds / mud farmstead. |
| 0.235 | +1 | 26 | Infield through Turn 2–3: marshal post, sponsor hoarding, dry patchy grass. |
| 0.300 | −1 | 38 | Outside of Turn 4–5: modest open `scaffoldStand` (no canopy), tyre wall, pale runoff in front — scaffold gap kept clear of the apron plane. |
| 0.372 | +1 | 38 | Infield at Turn 6–7: marshal post, billboard, shallow graded earthwork bank. |
| 0.430 | −1 | 55 | Run down toward the double-apex: ridge shoulder on the outside holding the drop. |
| 0.495 | −1 | 40 | Spectator earth bank at the bottom of the drop (`spectatorHill`) — second landmark of the lap. |
| 0.515 | +1 | 24 | Inside the double apex: tyre wall, marshal post, low sponsor hoarding. |
| 0.565 | +1 | 28 | Turn 12 climbing out: camera tower on the infield, tree pair behind. |
| 0.720 | −1 | 900 | **The haze** — low ridge + flat silhouettes dissolved into dust. |
| 0.790 | −1 | 34 | East stand cluster at the end of the back straight: two `grandstandEx` blocks, tyre wall, widest runoff. |
| 0.870 | +1 | 26 | Final corner onto the main straight: marshal / billboard (pinched infield — sit slightly later), pit-entry building end wall. |

## 5. Track features

- A long back straight into a heavy braking zone.
- The Turn 10–12 multi-apex right, taken at increasing radius.
- Very wide tarmac run-off throughout.

## 6. Modelling notes — sourced vs uncertain

**Sourced (build from these):**
- Sea-wave aluminium main-grandstand roof with steel trusses at different elevations — [ENR, 2011-05-23](https://www.enr.com/articles/5043-india-speeding-to-the-finish-on-its-first-formula-one-racetrack) (“roof is shaped like a sea wave, consisting of 56 trusses… 50,000-sq m aluminium roof”).
- Cantilever soffit cladding at ~40 m access height — [Eurosafe case study](https://www.eurosafeuk.com/knowledge/case-studies/buddh-int-circuit-new-delhi).
- Circuit length ~5.137 km, Tilke, opened Oct 2011, Greater Noida / Jaypee Sports City — Wikipedia / RacingCircuits.info.

**UNCERTAIN — do not treat as surveyed fact (flagged in PR):**
- Exact stand height (slideshare 30 m vs ENR 50 m), length 138 m, 40 m cantilever projection, 56 truss count, 41 pit garages — slideshare single-source or conflicting. The in-game model uses a game-scale silhouette (~14 truss bays, ~140 m length cue) rather than those numbers as hard dimensions.
