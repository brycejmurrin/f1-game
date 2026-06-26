# Scenery accuracy — implementation progress

Implementing the per-track recommendations in `docs/track-research/*.md`. Workflow per
track: read research + current `js/tracks/<id>.js` → edit `scenery()` (and shared
`tracks.js` tables where needed) → `node tools/verify-track.cjs <id>` (headless build
gate) → `node tools/shoot-track.mjs <id>` (orbit screenshots around the lap) → review →
iterate → commit. Cache-bust `?v=` in `index.html` is bumped once per batch.

Status legend: ⬜ not started · 🟦 in progress · ✅ done & screenshot-verified · ⏭️ partial

## Tooling
- `tools/shoot-track.mjs <id> [outdir]` — loads track via `__apex`, captures 6 orbit/eye
  views around the lap. Server: `python3 -m http.server 3456`.
- `tools/verify-track.cjs <id>` — headless build check (catches scenery() throws).

## Priority order & status

### Tier 1 — wrong setting / palette (highest impact)
| Track | Change | Status |
|---|---|---|
| zandvoort | golden dune sand (drop pine forest); keep banking dramatic; grey-green marram; drop turbines | ✅ |
| shanghai | remove Pudong/Pearl skyline; build own lotus canopies + Moon-Gate arches + paddock lake | ⬜ |
| miami | remove downtown skyline; stadium hero + aqua run-off; boats on cradles not floating | ⬜ |
| madrid | demote Cuatro Torres to far cluster; low wide IFEMA pavilions; keep Monumental bowl | ⬜ |
| bahrain | remove Manama skyline; Sakhir sail-canopy; pale sand; flat | ⬜ |
| hungaroring | remove fake infield pond; dry straw palette; open banks not dense forest | ⬜ |

### Tier 2 — wrong time of day
| Track | Change | Status |
|---|---|---|
| baku | day race (not night); Flame Towers ~182 m teardrop + LED-image flame; Maiden ~29 m flat-top | ⬜ |
| mexico | park day (not desert/night); Foro Sol encloses track; Palacio copper dome; Día de Muertos | ⬜ |
| abudhabi | dusk→night; flat island + mangroves (not dunes); LED arch over track; Ferrari World | ⬜ |

### Tier 3 — cheap high-value landmark adds
| Track | Change | Status |
|---|---|---|
| suzuka | red ~50 m ferris wheel near S/F; figure-8 crossover bridge | ⬜ |
| montreal | Biosphère steel dome + Olympic Basin + La Ronde wheel; 1m walls; Bonjour Québec | ⬜ |
| monza | ruined banked oval; deciduous-dominant trees; Tifosi red | ⬜ |
| imola | seated bronze Senna statue (replace white box); river hugs Tamburello wall | ⬜ |
| interlagos | mirror Senna statue + Kobra mural; favela close + skyline far; lakes mid/far | ⬜ |
| jeddah | offshore water-jet fountain; turquoise-dome Floating Mosque; sparse low-rise | ⬜ |
| singapore | bay landmarks across water; Flyer 150 m; Merlion; taller CBD; reflections | ⬜ |

### Tier 4 — landmark accuracy corrections
| Track | Change | Status |
|---|---|---|
| vegas | oblate Sphere; bronze curved towers (Wynn/Encore/RW); themed resort colour clusters | ⬜ |
| redbull | bull rusted Corten + gold horns, infield; Wing spoiler profile; lower/greener mountains | ⬜ |
| silverstone | Wing silver not white; flat airfield (remove mountain rings); copses not dense forest | ⬜ |
| monaco | Casino trio (Hôtel de Paris + Casino + Café de Paris); green-copper roofs; Tour Odéon | ⬜ |
| cota | remove fictional Velocity tower; dark-brown clay; rolling prairie not ridges | ⬜ |
| albert_park | Eureka gold crown + 297 m; add Australia 108; skyline across lake; palms+gums | ⬜ |
| spa | Belgian-flag run-off paint; Wallonia kerbs; pit-straight tower; conifer wall; gravel | ⬜ |
| qatar | 402 m record pit building hero; flat tan plain not dunes; artificial-grass border ring | ⬜ |

## Log
- **zandvoort** ✅ — replaced dense dark pine `forestEdge` belts with sparse low grey-green
  inland scrub + extra bare dune mounds; removed wind turbines; desaturated marram to
  grey-green; pushed `pal.grass`/`runoff` toward dune sand. Screenshot-verified: now reads
  as open golden North-Sea dunes, banking intact. (`js/tracks/zandvoort.js`)
