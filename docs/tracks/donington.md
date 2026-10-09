# Donington Park — Visual Design Brief

**Setting:** DAY, green theme (English parkland). ~4.00 km, 11 turns, clockwise.

## 1. Setting

English parkland in Leicestershire, mature broadleaf trees and a steep fall away from the pit straight. One World Championship race, the 1993 European Grand Prix, remembered entirely for Senna's opening lap in the wet — fifth to first before it ended. The circuit is otherwise a club and bike venue and looks like one: modest buildings, close trees. MotorSport Vision has operated the site since 2017.

## 2. Atmosphere & palette

Soft, overcast English green. Low contrast, cool light, damp-looking tarmac. Resist saturating it.

## 3. Elevation

Drops sharply from Redgate down through Craner Curves to the Old Hairpin, then climbs back. The Craner drop is the defining piece of terrain. Keep real hills; do not flatten or knife-edge the fall.

## 4. Landmarks & surroundings by lap position

Clockwise lap, so `+1` (right of the centreline) is the INFIELD — pits, paddock
and the ex-Collection hall sit on that side. `-1` is the outside, which is
where the parkland, the woods and most of the spectator banking live.

| s | Side | Distance | Box description |
|---|---|---|---|
| 0.005 | +1 | 14 | Pit lane and garages: one long, low `building` run — a club-circuit pit block, flat roof, no towers. A short `motorhome` row and a small `broadcastCompound` behind it in the paddock, with a `cameraTower` at the start/finish gantry line. |
| 0.022 | -1 | 20 | Start/finish `grandstandEx`, modest and mostly open — two shallow banks of seats, not a Grand Prix stand. `sponsorHoarding` runs the length of the debris fence in front of it. |
| 0.048 | +1 | 34 | **Ex-Donington Collection** (closed Nov 2018): long, low, flat-roofed exhibition `building` kept as a disused hall behind the paddock, coach/visitor apron and screening `hedge`. Do not present as an open museum. |
| 0.0663 | -1 | 12 | **Redgate.** `guardrail` then `tyreWall` on the outside of the right-hander, backed by the `spectatorHill` bank that carries the Hollywood-side crowd. A `marshalPost` at the apex and a single `billboard` on the exit fence. |
| 0.1698–0.19 | -1 | 16–24 | **Hollywood** (`donington-hollywood-stand` at authored s≈0.188): 2017–18 MSV permanent grandstand looking down Craner, positive rake, cantilever shade. Footprint probe: s≈0.17 rejects at any gap (Craner fold). **Garage 39** restaurant & bar behind the bank. `spectatorHill` banks either side. |
| 0.2500 | +1 | 26 | Mid-Craner infield — open parkland falling away, individual `tree` specimens well spaced on mown grass, a low `ridge` running with the slope. Keep it empty and green; this is the view the Hollywood bank is paying for. |
| 0.3212 | -1 | 13 | **Craner Curves.** `guardrail` hard against the outside edge with `tyreWall` on the two blind apexes, and mature `tree` cover close behind it so the corner reads as enclosed and dark against the open infield. |
| 0.3342 | +1 | 15 | **Old Hairpin.** The classic inside viewing bank: `spectatorHill` with a `hedge` line along its foot, a `marshalPost` at the apex and low `guardrail`. Lowest point of the lap. |
| 0.4552 | +1 | 10 | **Starkey's Bridge**, on the climb back out. `guardrail` both sides, `sponsorHoarding` on the crossing embankment, a `marshalPost` just past it, and a `ridge` carrying the ground up to the bridge abutment. Required `circuitKit.pedestrianBridge`. |
| 0.5162 | -1 | 22 | **Schwantz Curve**, the far end of the park — continuous `forestEdge` on the outside, no structures at all, just trees and a single `marshalPost`. |
| 0.5713 | +1 | 18 | **McLeans.** `tyreWall` on the inside, a small `spectatorHill` with a `marshalPost`, and scattered parkland `tree` beyond it. |
| 0.640 | -1 | 480 | **East Midlands Airport departure** — one low-poly airliner on climb-out (`donington-ema-airliner`). EMA runway west end is ~365 m from the track's east end ([Wikipedia — Donington Park](https://en.wikipedia.org/wiki/Donington_Park)); McLeans/Coppice sit under the departure path. Sky cue only — not a trackside prop. |
| 0.6803 | -1 | 14 | **Coppice** — named for the woodland it runs into. `forestEdge` tight to the outside of the uphill right, `tyreWall` at the apex, and a `guardrail` run through the exit. |
| 0.7592 | -1 | 12 | **Fogarty Esses.** `guardrail` and `tyreWall` through the flick, a small `grandstandEx` and a `billboard` on the outside, with `sponsorHoarding` on the fencing either side of the spectator tunnel. |
| 0.7887 | +1 | 20 | **Melbourne Hairpin**, the bottom of the GP loop (added 1985): sparse and rural. `tyreWall` on the inside, a `hedge` boundary beyond it, a `marshalPost`, and a shallow `ridge` closing the loop off from the infield. |
| 0.8700 | -1 | 30 | Melbourne loop return / Wheatcroft Straight approach — the least developed stretch. `hedge` field boundary with isolated `tree` beyond, plain `guardrail`, `groundPatch` of rough grass between track and hedge. |
| 0.9437 | +1 | 13 | **Goddards**, the last corner onto the pit straight. `tyreWall` on the inside, `sponsorHoarding` on the outside of the exit, a `marshalPost` at the apex, and the pit-exit `building` end wall just beyond. (No `grandstandEx` — crowdBank buried into the exit berm at every probed gap; viewing is `spectatorHill` + S/F stands.) |
| horizon | — | ~3400 | **Ratcliffe-on-Soar** (`donington-ratcliffe-power`): eight cooling towers (114 m, 87 m base, 55 m crown, ~150 m centres) + a 199 m chimney on the TRUE compass bearing 66.1° (ENE) from the lap centroid, not a road normal (8.8 km real, compressed to 3.4 km for fog; `scenery/fuji.js` pattern). Station closed Sept 2024; towers still standing — demolition not before 2029 ([Uniper](https://www.uniper.energy/united-kingdom/news/uniper-signs-up-erith-for-demolition-contract-at-ratcliffe-on-soar-power-station/)). |

## 5. Track features

- Craner Curves: a fast, blind, downhill left-right that is the whole character of the place.
- The Melbourne Loop, a slow out-and-back added for the Grand Prix (1985).
- Redgate, the first-corner right off the pit straight.
- Hollywood: top of the drop; permanent grandstand since the 2017–18 MSV works.

## 6. Modelling notes

- The Craner drop must read as a genuine fall in the terrain, not a flat curve.
- Mature broadleaf parkland trees, well spaced, not forest.
- Buildings are small and low — this is not a Grand Prix facility (except the Hollywood stand, which is the one large permanent structure).
- Frame debt: `startFrac` 0.9072 with residual `_sceneryShift` ≈ 0.10. Pit/S-F rows use `sl()`; corner landmarks stay in the authored frame. Do not edit `startFrac` / `sceneryStartFrac` without a full probe.

## 7. Sourced vs uncertain

| Claim | Status | Source |
|---|---|---|
| Hollywood Grandstand at Hollywood corner | **Sourced** | [MSV GP circuit map PDF](https://msvstatic.blob.core.windows.net/documents/DP%20Map_GP%20Circuit.pdf); [Wikipedia — Donington Park](https://en.wikipedia.org/wiki/Donington_Park) (2017–18 MSV works) |
| Garage 39 restaurant & bar | **Sourced** | Same Wikipedia MSV-works paragraph; MSV map label |
| Donington Collection / Exhibition closed Nov 2018 | **Sourced** | Wikipedia; Derby Telegraph via wiki refs — hall kept as **disused**, not an open museum |
| Craner → Old Hairpin → Starkey's → Schwantz → McLeans → Coppice → Fogarty Esses → Melbourne → Goddards naming | **Sourced** | MSV GP circuit map; Wikipedia |
| Exact Hollywood stand seat count / bay length | **UNCERTAIN** — silhouette approximate |
| Exact Garage 39 footprint / metres from verge | **UNCERTAIN** — modest block behind the bank |
| Whether any Collection building fabric remains on site today | **UNCERTAIN** — modelled as a closed hall for continuity with the brief |
| East Midlands Airport runway ~365 m east of track | **Sourced** | [Wikipedia — Donington Park](https://en.wikipedia.org/wiki/Donington_Park); OSM adjacency ([map](https://www.openstreetmap.org/#map=14/52.8305/-1.3700)) |
| McLeans / Coppice under EMA departure path | **Sourced** | Spotter / forum reports (PPRuNe thread on EMA + Donington); airport CTR wraps the estate ([Donington airport guidelines](https://www.donington-park.co.uk/airport-guidelines)) |
| Dunlop Bridge | **Removed** — Adroit 2010 rebuild left it out (MSA/FIA regs); do not re-add | Wikipedia — Donington Park |
