# Browser specs map — batch 01

Mapped all 160,000 assigned bytes in nine parts. Whole-file, part and chunk SHA-256 values, imports, hooks, case spans and every intersecting assertion site are in `specs-01-evidence.json`. Whole-file hashes match the assignment manifest. Byte ranges are half-open UTF-8; line ranges below are inclusive. No tests or browser runs were performed.

Eight files are fully assigned. `tests/specs/assets-api.spec.js` is assigned only [0,5707) of 11,242 bytes, ending inside the unload case; its later assertions belong to batch 02. The enclosing case span is structural AST context, not a claim to raw-read its unassigned suffix.

## `tests/specs/abudhabi-foundation.spec.js`

Day/night Yas Marina elevation 6–14 m, required hotel overhead/support emission and 4.8 m clearance, water presence, valid geometry/walls and sampled ground gap <=0.18 m. Plain Playwright test plus BOOT_MS; no failure-attachment fixture.

| Case source lines | Contract / scenario | Assertion sites |
|---|---|---:|
| 41–125 | Abu Dhabi foundation contracts hold at ${…} | 24 |

## `tests/specs/active-aero.spec.js`

Fixture-backed Monza 844×390 headless simulation. Covers exposed state, Z default, zone arming/disarming, finite flap travel/brake closure, relative speed/grip trade and AI/world affordance. Straight chosen from authoritative zones, corner from wrap-safe uncovered mask.

| Case source lines | Contract / scenario | Assertion sites |
|---|---|---:|
| 79–86 | aero() reports mode, flap travel, request and arming | 4 |
| 88–94 | the car starts in Z-mode with the flaps shut | 3 |
| 96–108 | obs(), physState() and carAt() all expose the flap travel | 3 |
| 110–114 | aero() returns null with no player on track | 1 |
| 120–134 | arms on a straight and the flap opens | 3 |
| 136–149 | does NOT arm in the tightest corner, and asking for X-mode there does nothing | 3 |
| 151–169 | un-arming drops the request, so the flap does not spring back open | 3 |
| 175–193 | the flap takes time to open — it is not a step change | 4 |
| 195–216 | braking slams it shut, and faster than it opened | 3 |
| 222–238 | X-mode reaches a higher top speed down the same straight | 1 |
| 240–273 | X-mode costs aero grip: the same input turns the car less | 4 |
| 279–290 | AI cars run X-mode too | 1 |
| 292–300 | the agent world view reports the aero block and the affordance | 4 |

## `tests/specs/aero-zones.spec.js`

Fixture-backed authored counts (Monza/Baku/Qatar/Albert Park), Monaco disabled, 210 m minimum only on Monza, rebuild-at-pace log witness, wrap membership and rounded next-zone distance <=1.5 m. Separates opening-lap overtake gate from active aero. Wing sweep reloads localStorage settings and uses test.slow().

| Case source lines | Contract / scenario | Assertion sites |
|---|---|---:|
| 44–51 | a fast circuit has zones, and every one clears the three-second minimum | 3 |
| 53–56 | MONACO has no zone at all — 2026 switches active aero off there | 1 |
| 76–84 | ${…} gets the real number of zones, not a derived guess | 2 |
| 87–107 | with no zone, the mode can never arm however hard it is asked for | 3 |
| 109–136 | zones are a property of the CIRCUIT — the pace slider cannot add or remove one | 6 |
| 138–166 | inZone and zoneAhead agree with the zone list, wrap included | 4 |
| 168–195 | outside a zone, zoneAhead is the distance to the next zone start | 5 |
| 208–245 | stays disabled for the whole opening lap, then arms when the LEADER starts lap 2 | 4 |
| 247–265 | active aero is NOT gated by the opening lap — it arms inside a zone on lap 1 | 3 |
| 277–321 | X-mode buys X_VMAX_GAIN of vmax and gives up X_DF_LOSS of the aero load | 9 |
| 322–376 | a bigger wing trades HARDER — both halves scale with the aero part | 7 |

## `tests/specs/agent-determinism-frame.spec.js`

Real rAF comparison around seed 42, reset without reseeding, one-second rollout/grid digest. No stream-position positive control: only leaks that influence later digest are caught.

| Case source lines | Contract / scenario | Assertion sites |
|---|---|---:|
| 19–57 | cosmetic randomness does not draw from the seeded stream | 1 |

## `tests/specs/agent-determinism.spec.js`

Same-seed exact digest with movement witness, different-grid positive control, seed round-trip/reset ordering and repeated full car-state equality with nonempty field/car witnesses. Fixed Monza episodes do not establish determinism for all tracks/inputs.

| Case source lines | Contract / scenario | Assertion sites |
|---|---|---:|
| 58–69 | the same seed replays an episode exactly | 3 |
| 71–80 | a different seed deals a different grid | 1 |
| 82–94 | seed() round-trips and reset({seed}) applies before the grid is built | 2 |
| 104–138 | reset() leaves no episode state on the cars | 4 |

## `tests/specs/agent-drive-bench.spec.js`

Seed 1234 clear-track start at fraction 0.4; Monza/Interlagos relational geometry policy must exceed blind distance by 1.5× and exceed 300 m within 500 six-tick actions. Also rejects prescribed line fields and validates straight-exit facts/ordered corner previews. Bounded benchmark does not prove general driving quality.

| Case source lines | Contract / scenario | Assertion sites |
|---|---|---:|
| 117–127 | relational policy out-drives the blind baseline on ${…} | 2 |
| 134–147 | no racing line is prescribed — apexOffsetM/moveToApexM are gone | 3 |
| 149–164 | corners carry honest road facts: straightAfterM and exitsOntoStraight | 5 |
| 166–184 | nextCorners previews the sequence, ordered by distance | 7 |

## `tests/specs/agent-view.spec.js`

Shared worker page, awaited race thenable plus two rAFs, jump/go and waitAgentViewReady. Covers typed errors, compact detail/delta contracts, egocentric rivals/field, corner/elevation/camber geometry, atmosphere, query/describe drill-down, approximate semantic rasters, mesh/parts/world aggregation, rollout, discovery, scenery registry, camera visibility and terminal. renderFrames snaps camera then waits for camera readiness. Conditional boot error branches may take happy paths; VM twins force absent-track cases. Semantic raster assertions do not certify pixels or hardware rendering.

| Case source lines | Contract / scenario | Assertion sites |
|---|---|---:|
| 61–72 | before a race is started, the error names the hook that fixes it | 5 |
| 74–86 | player not placed names the hook that fixes it | 3 |
| 88–94 | a bad detail level is rejected with the valid set | 3 |
| 102–120 | brief carries the envelope, ego and a one-line summary | 14 |
| 122–132 | drive adds lookahead, rivals and affordances | 6 |
| 134–146 | full adds session, terminal and raw physics | 8 |
| 148–155 | brief is materially smaller than full | 1 |
| 165–175 | horizon distance grows with speed at fixed horizonS | 1 |
| 177–185 | every look-ahead point carries a direction and a width | 3 |
| 193–206 | rivals are sorted by gap and framed relative to the player | 6 |
| 208–221 | lateralM is relative to the player, not the centreline | 2 |
| 231–257 | lists every car by position with second gaps, compactly | 11 |
| 259–268 | world().rivals stays compact — no team object is spread per rival | 3 |
| 280–295 | Spa's corners carry gradient and kerbs | 7 |
| 297–312 | authored bank zones read as banked INTO the turn, not off-camber | 4 |
| 314–321 | pacenotes pick up elevation and camber mutators | 2 |
| 323–329 | the added detail does not blow the world() budget | 1 |
| 341–354 | narrates a day scene and keeps the raw numbers | 6 |
| 356–368 | night is dark, floodlit, and names the moon — not a high sun | 5 |
| 370–385 | wet weather is called out and matches the grip model | 3 |
| 387–392 | visibility is a distance, not a raw fog density | 2 |
| 404–425 | expands a scene() row into everything known about that prop | 10 |
| 427–442 | resolves corner, car and span ids | 6 |
| 444–457 | unknown ids are typed errors that say how to find a real one | 6 |
| 463–479 | returns prototype + instances, not N near-identical records | 7 |
| 481–490 | is bounded and reports what it withheld | 4 |
| 492–505 | filters compose: kind, arc window, radius | 3 |
| 507–517 | ids from query resolve through describe | 1 |
| 525–538 | seq increments and a delta is smaller than the full payload | 3 |
| 540–546 | an unknown since returns the full payload with a note, not an error | 3 |
| 555–568 | dropping to a smaller detail level across a since chain returns the full payload | 4 |
| 570–579 | a same-detail chain is still a delta, not a full payload | 1 |
| 587–595 | Monaco's hairpin is resolved as a hairpin | 2 |
| 597–622 | corners are well-formed and non-overlapping | 12 |
| 624–645 | the lap closes: integrated heading is a full turn | 1 |
| 647–657 | sectors and profile are available and static | 4 |
| 659–670 | trackInfo never returns null — payload or typed error | 4 |
| 672–678 | an unknown `what` is rejected with the valid set | 3 |
| 692–701 | penalties are visible, with the rule that governs them | 5 |
| 703–713 | ERS reports deployment and the overtake window, not just charge | 4 |
| 715–726 | rivals carry pace, so one AI is distinguishable from another | 5 |
| 728–742 | full detail exposes engine, recovery and the live tunables | 5 |
| 748–757 | trackInfo grounds the circuit in the real world | 5 |
| 759–772 | a full snapshot carries the seed that reproduces it | 2 |
| 780–796 | states the goal, the trade-offs and the constraints, compactly | 9 |
| 798–803 | needs no track loaded — it is static | 2 |
| 809–818 | names a corner ahead with a braking hint | 6 |
| 820–834 | the braking hint grows with speed | 2 |
| 838–851 | pacenotes render the road ahead as a rally-style callout | 3 |
| 862–887 | renders any of the 15 camera modes without a live frame | 7 |
| 889–895 | an unknown camera errors with the valid set | 3 |
| 897–904 | orbit frames the car from a bearing | 3 |
| 906–919 | edges overlay directional glyphs on silhouettes only | 2 |
| 925–938 | rasterises the view into a labelled grid | 5 |
| 940–951 | driving on track, the road dominates the lower frame | 2 |
| 953–963 | the player car is drawn, and no single object owns the frame | 2 |
| 965–972 | sky sits above the horizon row and ground below | 2 |
| 974–982 | objects are ranked by how much of the frame they hold | 2 |
| 984–995 | rows are derived so the image is not squashed | 3 |
| 997–1004 | pinned rows are honoured and flagged as uncorrected | 3 |
| 1006–1023 | the depth channel is a real, monotonic depth buffer | 4 |
| 1025–1030 | depth is omitted unless asked for | 1 |
| 1032–1045 | never returns null — a render or an actionable error | 4 |
| 1047–1058 | flags a stale frame under headless | 2 |
| 1068–1084 | draws a car-up top-down map with a metric index | 8 |
| 1086–1091 | northUp switches to the world frame | 2 |
| 1093–1100 | a bigger radius covers more track | 1 |
| 1104–1110 | map never returns null — a grid, or NoTrackError with no track | 4 |
| 1118–1130 | measures the car from a real build | 8 |
| 1132–1145 | reports the full parts spec and its effect | 6 |
| 1147–1156 | carries team identity and the chassis silhouette knobs | 6 |
| 1158–1170 | a different team gives different geometry or identity | 2 |
| 1172–1192 | detail:render draws edge+shade elevations from the real mesh | 6 |
| 1194–1198 | render is omitted unless asked for | 1 |
| 1200–1206 | an unknown team errors instead of silently answering for another | 3 |
| 1217–1233 | Monza surveys clean | 8 |
| 1235–1241 | terrain carved under the road is not a cliff | 1 |
| 1243–1249 | no circuit ships a model the guard had to reject | 1 |
| 1251–1260 | props-over-road is labelled a screen, not a verdict | 3 |
| 1262–1271 | the lateral profile is only returned when asked for | 3 |
| 1274–1280 | survey never returns null — a summary, or NoTrackError with no track | 4 |
| 1288–1313 | measures every section of the car | 6 |
| 1315–1326 | instrumentation changed no geometry | 2 |
| 1328–1334 | parts are omitted unless requested | 3 |
| 1336–1364 | per-team silhouette shows up in measured geometry | 2 |
| 1376–1389 | summary aggregates thousands of objects into a readable document | 8 |
| 1391–1403 | no feature spans the whole lap | 3 |
| 1405–1419 | landmarks are structures, not repeated dressing | 6 |
| 1425–1440 | linear furniture is spans, not thousands of segments | 5 |
| 1442–1456 | sections walk the lap corner by corner | 6 |
| 1458–1484 | full paginates the raw object list | 7 |
| 1486–1494 | sign boards keep their meaning | 2 |
| 1496–1502 | rejects an unknown detail level | 3 |
| 1510–1524 | summarises an interval instead of returning frames | 8 |
| 1526–1542 | full throttle into Monza's first chicane goes off track | 3 |
| 1544–1558 | runs a closed-loop policy at policyHz | 3 |
| 1560–1569 | a throwing policy returns a typed error, not a crash | 4 |
| 1571–1584 | does not disturb the caller's delta chain | 2 |
| 1586–1596 | records minimum speed through corners actually driven | 3 |
| 1604–1664 | describes the surface without needing a track | 18 |
| 1681–1693 | the default view is unchanged; cols raises the resolution on request | 4 |
| 1695–1707 | ss raises supersampling on the car render and visibly changes it | 2 |
| 1709–1714 | stays flagged approximate and does not become the default surface | 1 |
| 1720–1743 | dispatches each what to the matching raster, flagged approximate | 9 |
| 1745–1751 | an unknown what is a typed error with the valid set | 3 |
| 1764–1776 | records every semantic placement, dropping none | 7 |
| 1778–1797 | props are egocentric, sorted, and inside the radius | 9 |
| 1799–1806 | a bigger radius can only find more, never fewer | 1 |
| 1808–1820 | the kinds filter narrows results without changing lap totals | 3 |
| 1822–1828 | truncation is reported rather than hidden | 3 |
| 1830–1836 | a street circuit has buildings and no trees | 2 |
| 1838–1846 | floodlight masts come through with their fixture kind | 3 |
| 1849–1855 | scene never returns null — a registry, or NoTrackError with no track | 4 |
| 1893–1905 | the player car projects near the centre of frame | 6 |
| 1907–1918 | screenPct is null for anything not in frame | 3 |
| 1920–1931 | a corner behind the camera is kept, flagged, and bears past 90 deg | 4 |
| 1933–1944 | headless is flagged, because the frame is then stale | 2 |
| 1952–1958 | splits done into a reason | 3 |
| 1960–1968 | reports finished after the race ends | 2 |

## `tests/specs/albert-park-foundation.spec.js`

racePage/pageErrors fixtures; two independent 300 s cases distinguish required fountain emission from lake/geometry/ground/wall safety. Selected sample gaps and required failures provide bounded geometry coverage.

| Case source lines | Contract / scenario | Assertion sites |
|---|---|---:|
| 52–58 | Albert Park emits two required lake fountains | 4 |
| 60–75 | Albert Park water, ground and walls stay safe | 13 |

## `tests/specs/assets-api.spec.js`

Shared GLX worker, beforeEach restores matTex(1)/pack load; freshTest factory-seat boot checks shipped default. Assigned prefix covers coherent state, pack upload/layers/scales, default mix, clamp/round-trip and tuner off path; unload setup crosses the assigned boundary and has no assigned assertion.

| Case source lines | Contract / scenario | Assertion sites |
|---|---|---:|
| 34–43 | assets() reports a coherent state | 4 |
| 45–65 | the committed pack loads and uploads its material layers | 10 |
| 67–87 | the baked materials are ON by default | 3 |
| 89–105 | matTex() round-trips and clamps | 5 |
| 107–121 | matTexMix is a real lighting-tuner knob, and 0 stays reachable | 4 |
| 123–133 (partial) | unload returns to the procedural state without erroring | 0 |

## Runtime ownership and dependencies

LSP resolves AgentView.create to `js/agent/agentview.js:104`, consumed by the apex façade; AeroZones.create to `js/physics/aero-zones.js:209`, consumed by game boot; Assets.load to `js/render/shared/assets.js:596`, used by apex and game. The evidence records bounded LSP query results. The suite exercises these through `__apex`, with circuit definitions, track scenery/model/ground diagnostics, physics stepping, car mesh/Parts and renderer texture upload beneath them. These are exercised targets, not mocks.

Common dependencies are `tests/helpers/fixtures.js`, its BOOT_MS and failure diagnostics, `tests/helpers/agent-view-ready.js` for lighting/camera state, and `tests/helpers/factory-seat.js` for the fresh assets boot. Parameterized case declarations expand at runtime: Abu Dhabi day/night, four authored zone counts, and two drive-bench circuits. Assertion-site counts are lexical and include loop bodies once.

## Comment cleanup findings

Fix outdated relative fixture comments in active aero, aero zones and agent view. Rename legacy raster suite headings to their canonical render/scene calls; replace the historical 117 shared-test count (119 current declarations). Consolidate duplicated caution-isolation comments/calls in the overtake lap case. Resolve the stale Abu Dhabi cross-reference recorded only in the support JSON. Keep measured tolerance/geometry rationale, seeded control limitations and await/snap-camera explanations: they explain what the tests can actually catch. Assets header fallback claims exceed the assigned prefix coverage. No source comments were edited.
