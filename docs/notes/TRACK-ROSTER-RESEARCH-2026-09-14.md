# Track roster — what is missing (2026-09-14)

What Apex 26 ships against every circuit that has hosted a Formula One World
Championship Grand Prix, and what it would cost to close each gap. Dated by
design: the calendar half of this goes stale, the venue half does not.

## 1. What ships today

40 circuit defs in `js/circuits/` — 24 `SEASON` rounds plus 16 `classic: true`.
Enumerate them from `tools/manifest.cjs`, never from a list in a doc.

**The upstream trace dataset is exhausted.** `tools/track/import-circuit-path.mjs`
projects `bacinger/f1-circuits`; that GeoJSON carries exactly 40 features and the
game had all 40 (`COMMITTED` + `CLASSICS` in that tool == the whole file, verified
by diffing the fetched feature ids on 2026-09-14). Every circuit added from here
needs a trace from somewhere else — see §4.

> **Acted on, same day.** `tools/track/stitch-osm-ring.mjs` now recovers a
> centreline from OpenStreetMap directly, and **eleven of the circuits below
> shipped**: `fuji`, `okayama`, `korea`, `jerez`, `donington`, `anderstorp`,
> `brands_hatch`, `zolder`, `dijon`, `buddh`, `mont_tremblant`. The roster is 51.
> The table in §2 is left as it was measured — it is the gap as it stood before
> that work — and §5 records what the eleven cost in practice.

## 2. The gap as measured: 38 World Championship venues were not in the game

Wikipedia's [List of Formula One circuits] carries 78 rows: 77 venues that have
hosted a WC race, plus the Madring which had not yet raced when the table was
written. The game holds 39 of the 77 hosts, plus the Madring. The 38 absentees,
by how many Grands Prix each held:

| Venue | Country | GPs | Years |
|---|---|---|---|
| Brands Hatch | UK | 14 | 1964–1986 |
| Reims-Gueux | France | 11 | 1950–1966 |
| Adelaide Street Circuit | Australia | 11 | 1985–1995 |
| Zolder | Belgium | 10 | 1973–1984 |
| Jarama | Spain | 9 | 1968–1981 |
| Long Beach | USA | 8 | 1976–1983 |
| Mosport Park | Canada | 8 | 1967–1977 |
| Detroit Street Circuit | USA | 7 | 1982–1988 |
| Jerez | Spain | 7 | 1986–1997 |
| Anderstorp (Scandinavian Raceway) | Sweden | 6 | 1973–1978 |
| Dijon-Prenois | France | 6 | 1974–1984 |
| Aintree | UK | 5 | 1955–1962 |
| Bremgarten | Switzerland | 5 | 1950–1954 |
| Rouen-Les-Essarts | France | 5 | 1952–1968 |
| Valencia Street Circuit | Spain | 5 | 2008–2012 |
| Charade (Clermont-Ferrand) | France | 4 | 1965–1972 |
| Fuji Speedway | Japan | 4 | 1976–2008 |
| Korea International Circuit | South Korea | 4 | 2010–2013 |
| Montjuïc | Spain | 4 | 1969–1975 |
| Buddh International Circuit | India | 3 | 2011–2013 |
| Phoenix Street Circuit | USA | 3 | 1989–1991 |
| Prince George Circuit (East London) | South Africa | 3 | 1962–1965 |
| Caesars Palace | USA | 2 | 1981–1982 |
| Circuito da Boavista | Portugal | 2 | 1958, 1960 |
| Mont-Tremblant | Canada | 2 | 1968, 1970 |
| Nivelles-Baulers | Belgium | 2 | 1972, 1974 |
| Pedralbes | Spain | 2 | 1951, 1954 |
| TI Circuit Aida (Okayama) | Japan | 2 | 1994–1995 |
| Ain-Diab (Casablanca) | Morocco | 1 | 1958 |
| AVUS (Berlin) | Germany | 1 | 1959 |
| Bugatti Circuit (Le Mans) | France | 1 | 1967 |
| Dallas Fair Park | USA | 1 | 1984 |
| Donington Park | UK | 1 | 1993 |
| Monsanto (Lisbon) | Portugal | 1 | 1959 |
| Pescara | Italy | 1 | 1957 |
| Riverside | USA | 1 | 1960 |
| Sebring | USA | 1 | 1959 |
| Zeltweg Airfield | Austria | 1 | 1964 |

[List of Formula One circuits]: https://en.wikipedia.org/wiki/List_of_Formula_One_circuits

## 3. Calendar drift in circuits we already ship

Four shipped defs carry the wrong `classic` flag for the 2027 season. Each is a
one-line data edit — the geometry already exists.

| Def | Ships as | Should be | Why |
|---|---|---|---|
| `portimao` | `classic: true` | season | F1 announced a two-year return, 2027–2028 (Dec 2025). |
| `istanbul` | `classic: true` | season | Turkish GP returns 2027 on a five-year deal to 2031 (Apr 2026). |
| `zandvoort` | season | classic | No contract beyond 2026; widely reported as leaving after the 2026 race. |
| `catalunya` | `classic: true` | rotational | Barcelona GP announced as a rotational race to 2032, taking the 2028 and 2030 slots Belgium sits out. There is no third state in `Tracks.LIST` — it is season-or-classic, so this one is a judgement call, not a defect. |

The 2027 calendar is not final (F1 has said 24 races, publication delayed to
autumn 2026 over Middle East scheduling), so re-check before acting. Nothing on
the provisional 2027 grid is missing from the game.

Beyond 2027 the named candidates are all greenfield or absent: a Bangkok street
circuit targeted for 2028, plus interest from Rwanda, Malaysia (Sepang — shipped),
South Africa (Kyalami — shipped), South Korea, India, New York and Chicago.

## 4. What it costs to add one — measured, not guessed

OSM is the only realistic trace source now that the upstream file is exhausted.
Queried `overpass.private.coffee` on 2026-09-14 for `highway=raceway` ways in a
±0.018° box around each candidate (`overpass-api.de` and `kumi.systems` both
returned dispatcher timeouts; the private.coffee mirror answered every query).

**Tier A — one closed ring ≥ 2 km already in OSM, and it is the F1 layout.**
Nearest to a paste-in: Fuji Speedway (4.54 km ring; the 2007–08 layout is the
current one), Okayama/TI Aida (3.69 km), Korea International (5.60 km, tagged
`YEONGAM F1 Track`).

**Tier B — mapped, but as per-corner segments that must be stitched into one
ring.** Brands Hatch is the extreme case: 51 named ways (`Paddock Hill`,
`Druids Bend`, `Clark Curve`…), no closed ring at all. Same shape for Jerez (29),
Zolder (25), Donington (20), Anderstorp (18), Dijon-Prenois (15), Buddh (13),
Mont-Tremblant (20), Sebring (27), Le Mans Bugatti (79, tangled with the Circuit
C.I.K. kart track), Zeltweg (16), Prince George (5). `import-circuit-path.mjs`
takes a single closed ring, so each of these needs a stitching step in front of
the projection.

**Tier C — OSM has a ring, but it is NOT the F1 layout.** Jarama's modern circuit
is 3.85–3.93 km against the 3.312 km F1 configuration; Charade is the shortened
3.94 km version against the 8.055 km road course; Aintree is the 2.45 km club
circuit against the 4.828 km GP course. Usable as a starting point, wrong as a
finished trace.

**Tier D — nothing to import.** Zero `highway=raceway` ways: Reims-Gueux,
Valencia, Nivelles-Baulers, Riverside, Pescara, AVUS, Bremgarten. Add to that
every street circuit whose roads still exist but carry ordinary highway tags
(Adelaide, Long Beach, Detroit, Phoenix, Dallas, Caesars Palace, Montjuïc,
Pedralbes, Boavista, Monsanto, Ain-Diab, Rouen). These need the centreline
digitised from historical maps or traced along the public roads by hand.

## 5. Where the value went — outcome, 2026-09-14

Eleven circuits shipped. What the tiering above got right and wrong:

- **Tier A was right and cheap.** Fuji, Okayama and Korea are one OSM way each
  and needed nothing but the projection.
- **Tier B was right about the mechanism and wrong about the difficulty.** The
  cycle search is ~100 lines and lands inside 0.5% on every fragmented circuit
  — including Silverstone, which was never a candidate and was used as the gate.
- **The filter, not the search, was the hard part.** Twice a name filter deleted
  a real piece of the lap: `/pit/` took Silverstone's National Pit Straight and
  `/paddock/` took Brands Hatch's Paddock Hill Bend, each time collapsing the
  best ring to under half a lap. The judgement belongs in OSM tags
  (`sport`, `surface`), not names.
- **Tier C's real obstacle was not the data.** Brands Hatch and Zolder stitch
  cleanly; what they cannot give is the layout Formula One raced, because the
  venue was rebuilt. Brands Hatch ran 4.207 km and is 3.908 km today; Zolder ran
  4.262 km from 1975 to 1985 and has been 4.010 km since 2002. Both ship as the
  modern configuration, said so in the def header and the circuit brief.
- **One entry in §2 was simply wrong.** Dijon is listed at 3.886 km there, from
  the Wikipedia circuit list. The circuit is 3.801 km and has been since the
  1977 Parabolique extension — which is what F1 raced. The bad target is what
  made a good stitch look like a 4% miss.

Still missing after this round: 27 of the 77 venues.

## 6. What is left, measured rather than guessed (2026-09-14)

Every remaining venue with a permanent circuit was put through the stitcher to
find out what OSM can actually give, instead of reasoning about it. The result
splits cleanly, and not along the line §2 predicted:

| venue | GPs | stitched | vs target | is it the layout F1 raced? |
|---|---|---|---|---|
| **Mosport** (Canadian Tire Motorsport Park) | 8 | 3.948 km | −0.24% | **YES — unchanged since the 1967-77 races** |
| Le Mans Bugatti | 1 | 4.168 km | −0.40% | No. F1 ran 4.430 km in 1967; the circuit is 4.185 km now |
| Jarama | 9 | 3.910 km | +1.56% | No. F1 ran 3.312 km; the circuit is 3.85 km now |
| Charade | 4 | 3.943 km | −0.79% | No, and not close — F1 ran the 8.055 km road course |
| Aintree | 5 | 2.453 km | +0.11% | No. That is the club circuit; F1 used the 4.828 km Grand National perimeter |
| Sebring | 1 | 5.872 km | −2.45% | No. F1 ran 8.356 km in 1959 |
| East London (Prince George) | 3 | — | — | Only 5 disconnected ways, no ring |
| Zeltweg airfield | 1 | 0.606 km | −81% | Nothing usable; the circuit is gone |
| Adelaide | 11 | — | — | 1 way. A street circuit |
| Long Beach | 8 | 0.025 km | −99% | 25 metres of tagged raceway. A street circuit |

**The finding: Mosport is the only venue left that is both importable and
genuinely the circuit Formula One raced.** Eight Grands Prix, a clean 9-way
stitch inside a quarter of a percent, and a layout unchanged since. It should be
circuit 52.

Everything else importable is a modern rebuild of a venue whose F1 configuration
no longer exists — which is a defensible thing to ship (brands_hatch and zolder
already did) but is a different proposition, and the roster should not pretend
otherwise. Charade and Aintree are the extreme cases: what OSM holds is half the
circuit and a different circuit respectively.

The street circuits are closed to this approach entirely. Long Beach carries
25 m of `highway=raceway` and Adelaide one way; the tarmac is tagged as ordinary
streets because that is what it is for 51 weeks a year. Those need a centreline
digitised from historical maps, which the stitcher cannot help with.

Also found: the stitcher could not take a southern-hemisphere bbox in the space
form at all — cli-args ends a value at a leading `-` so a flag cannot swallow
the next flag, which is right for the library and wrong for a coordinate. East
London and Adelaide both failed with "--bbox is required" before that was fixed.

## 6. Layout variants, not new venues

The game ships one configuration per venue, always the most recent F1 one. These
historic layouts are absent and would be new defs against existing venues, not
new circuits: Nürburgring **Nordschleife** (the game's `nurburgring` is the
5.1 km GP-Strecke), the 14 km Spa (`spa` is the 7.0 km modern lap), the
Österreichring (`redbull` is the 4.3 km modern Red Bull Ring), pre-2002
Hockenheim with the forest loop (`hockenheim` is the 4.6 km Motodrom layout),
Fuji's 1976–77 layout, Monza with the banking, and Zandvoort before the 1990
truncation.
