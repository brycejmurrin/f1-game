# Track research & scenery-density campaign — ledger

Goal: research every one of the 40 circuits against real-world reference
(TinyFish web search + targeted page fetches), fold the findings into that
circuit's brief, then **dress the circuit** so it reads as the real place.

This file is the resumable state. A track is DONE only when all four of its
columns are ticked and the commit landed. A track with no row below has not
been started; a partially-ticked row means the session was interrupted mid-track
and that track should be redone from its first unticked column.

## Method (per circuit)

1. **Research** — TinyFish `search` for trackside landmarks/grandstands/setting,
   then `fetch_content` on the 1–2 best sources (Wikipedia, racingcircuits.info,
   circuit guides). Capture *named, specific* things: grandstand names, building
   names, terrain, vegetation species, signage, skyline.
2. **Brief** — fold findings into `docs/tracks/<id>.md`: expand the
   landmarks-by-lap-position table, sharpen the palette and elevation notes.
3. **Dress** — add the missing geometry to `scenery(api)` in
   `js/circuits/<id>.js` using the `docs/SCENERY-API.md` toolkit.
4. **Verify** — `node tools/verify-track.cjs <id>` must print `OK`, then commit.

Cache-bust (`?v=N` + `version.json`) is bumped ONCE at the end of a batch, not
per track — it is the last edit before a commit that ships JS.

## Where this stands

- **Fully done** (researched → brief → dressed → `verify-track` OK → committed),
  **24 circuits — all of the season rounds**: bahrain, monaco, silverstone,
  spa, monza, suzuka, singapore, cota, interlagos, vegas, madrid, zandvoort,
  jeddah, albert_park, shanghai, miami, imola, montreal, redbull, hungaroring,
  baku, mexico, qatar, abudhabi.
- **Not started: the 16 retired classics** (#25–40) — hockenheim, nurburgring,
  catalunya, sepang, istanbul, paul_ricard, portimao, sochi, mugello,
  magny_cours, estoril, kyalami, watkins_glen, indianapolis, buenos_aires,
  jacarepagua.

**A pattern worth carrying forward.** In the second batch of nine, *most* banked
findings turned out to be **already implemented** — Zandvoort had all four,
COTA had both landmarks, Jeddah's 312 m fountain and Albert Park's golf course
and CBD skyline were all there. The value came from the second look: audit
first, and when the obvious landmark is already built, ask what the *place*
has that the circuit doesn't (Al-Balad's roshan, Imola's vine rows, Interlagos'
unpainted blockwork, the Floralies parterres). Grep before you build — and note
that `grep -i biosphere` misses `Biosphère`, which nearly cost a duplicate.

**"Nothing added" is a legitimate outcome, and it is most of batch three.** Of
the nine season rounds in that batch, **seven were already complete** against
their researched landmark lists — Madrid (IFEMA, La Monumental, both tunnels,
Barajas tower + airliner), Miami, Red Bull, Baku, Mexico, Qatar, Abu Dhabi.
Only Shanghai and Hungaroring needed geometry. Each verified circuit's brief
records what was checked, so a later pass does not redo the research.

**Two deliberate decisions that a naive research pass would undo.** Both are
now recorded in their briefs:
- **Qatar: do not add a mosque.** The hospitality villas explicitly *replaced*
  an earlier "mosque / marquees / Aspire" group recorded in the code as
  **fantasy landmarks**. "Qatar → mosque, minaret" is exactly the instinct that
  put them there the first time.
- **Suzuka: do not add coaster loops.** Removed on purpose so they stop
  competing with the Ferris rim on the main-straight skyline.
- Related trap: **Mexico → cactus is wrong.** The Autódromo is in an urban park
  at 2,240 m, not desert.

Guards last run green at build 1075: `test:tiny` 71/71, `test:tooling-fast`
350/350.

## Status

| # | Circuit | Researched | Brief | Dressed | Verified |
|---|---------|-----------|-------|---------|----------|
| 1 | bahrain | ✓ | ✓ | ✓ | ✓ |
| 2 | monaco | ✓ | ✓ | ✓ | ✓ |
| 3 | silverstone | ✓ | ✓ | ✓ | ✓ |
| 4 | spa | ✓ | ✓ | ✓ | ✓ |
| 5 | monza | ✓ | ✓ | ✓ | ✓ |
| 6 | suzuka | ✓ | ✓ | ✓ | ✓ |
| 7 | singapore | ✓ | ✓ | ✓ | ✓ |
| 8 | cota | ✓ | ✓ | ✓ | ✓ |
| 9 | interlagos | ✓ | ✓ | ✓ | ✓ |
| 10 | vegas | ✓ | ✓ | ✓ | ✓ |
| 11 | madrid | ✓ | ✓ | ✓ | ✓ |
| 12 | zandvoort | ✓ | ✓ | ✓ | ✓ |
| 13 | jeddah | ✓ | ✓ | ✓ | ✓ |
| 14 | albert_park | ✓ | ✓ | ✓ | ✓ |
| 15 | shanghai | ✓ | ✓ | ✓ | ✓ |
| 16 | miami | ✓ | ✓ | ✓ | ✓ |
| 17 | imola | ✓ | ✓ | ✓ | ✓ |
| 18 | montreal | ✓ | ✓ | ✓ | ✓ |
| 19 | redbull | ✓ | ✓ | ✓ | ✓ |
| 20 | hungaroring | ✓ | ✓ | ✓ | ✓ |
| 21 | baku | ✓ | ✓ | ✓ | ✓ |
| 22 | mexico | ✓ | ✓ | ✓ | ✓ |
| 23 | qatar | ✓ | ✓ | ✓ | ✓ |
| 24 | abudhabi | ✓ | ✓ | ✓ | ✓ |
| 25 | hockenheim | | | | |
| 26 | nurburgring | | | | |
| 27 | catalunya | | | | |
| 28 | sepang | | | | |
| 29 | istanbul | | | | |
| 30 | paul_ricard | | | | |
| 31 | portimao | | | | |
| 32 | sochi | | | | |
| 33 | mugello | | | | |
| 34 | magny_cours | | | | |
| 35 | estoril | | | | |
| 36 | kyalami | | | | |
| 37 | watkins_glen | | | | |
| 38 | indianapolis | | | | |
| 39 | buenos_aires | | | | |
| 40 | jacarepagua | | | | |
