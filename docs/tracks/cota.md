# Circuit of the Americas (COTA) — Visual Design Brief

**Setting:** DAY · Green theme (Texas Hill Country)
**Layout:** 5.513 km, 20 corners, counterclockwise, ~20 m total elevation change.

## 1. Setting
A purpose-built motorsport park on 1,500 acres in the rolling hills southeast of
downtown Austin, Texas. Manicured infield lawns and asphalt ribbon laid over
naturally undulating Hill Country terrain, ringed by scrub, oak/cedar groves and
distant ridgelines. Modern, sculptural architecture (tower, grandstands) rises
above open green parkland — clean and engineered, not urban.

## 2. Atmosphere & Palette
Bright, hazy Texas-blue sky with a faint heat shimmer. Dry, sun-bleached grass and
low scrub in warm yellow-greens. Reddish-brown Central Texas soil and gravel runoff.
Suggested tints: sky `[0.55,0.72,0.92]`, dry grass `[0.55,0.62,0.30]`, scrub green
`[0.38,0.50,0.28]`, red soil `[0.62,0.34,0.24]`, asphalt `[0.22,0.22,0.24]`.
Light fog mood: thin warm haze low on the ridgelines, fading distant boxes to a
pale dusty green-gray.

## 3. Elevation
- `s≈0.08–0.12` — steep Turn 1 climb, the signature ~18 m ascent from the start
  line to a blind hairpin apex (steepest braking zone of the year).
- `s≈0.12–0.28` — rapid descent off T1 into the flowing Esses, rolling up-and-down.
- `s≈0.46–0.62` — long back straight with a subtle crest ~1/3 along (briefly blind).
- `s≈0.78–0.90` — gentle undulation through the multi-apex sweepers.

## 4. Landmarks & Surroundings by Lap Position

| s | Side | Distance | Box-model description |
|------|------|----------|-----------------------|
| 0.00 | R | near | Main grandstand: long tall stepped box, dark grey with light seat rows |
| 0.02 | L | near | Pit/paddock block: flat low wide box, white/grey |
| 0.09–0.13 | L | mid | Turn 1 Big Red: packed crowd terrace + stands on red-soil climb (no tower) |
| 0.10 | R | mid | Uphill Turn 1: red-soil bank box rising sharply, kerb stripe at apex |
| 0.18 | both | far | Esses spectator mounds: low green grass-ramp boxes flanking the track |
| 0.30 | R | far | Scattered oak/cedar: small dark-green clustered boxes on dry-grass field |
| 0.38–0.55 | L | far | Thin Austin skyline haze: sparse low boxes only — Hill Country first |
| 0.46 | L | mid | Back-straight grandstand: low thin seating box, then open green run |
| 0.55 | R | far | Hill Country ridgeline: long low layered green-gray silhouette boxes |
| 0.63 | R | near | Turn 12 hairpin braking zone: wide grey runoff box, big kerb |
| 0.65 | R | far | Red-and-white grandstand framework/tower: open red lattice box + white panels |
| 0.76–0.80 | R | mid/far | Austin360 Amphitheater + 251 ft Observation Tower: pale shaft + red tube veil canopy over stage (T16–18) |
| 0.83 | L | far | Multi-apex sweeper backdrop: dry-grass field + oak/cedar cluster boxes |
| 0.95 | R | near | Final-corner grandstand: stepped seating box leading onto main straight |

## 5. Track Features
- **Uphill Turn 1:** dramatic blind crest hairpin — heavy braking while still climbing.
- **The Esses (T3–6):** fast, flowing left-right Maggotts-style transitions, kerb-clipping.
- **Back straight (T11→T12):** ~1 km flat-out DRS run, crest near the middle.
- **Big braking zones:** T1 and the T12 hairpin — wide grey runoff, deep markers.
- **Triple-apex (T16–18):** long Istanbul-style right sweeper at `s≈0.80–0.86`.
- **Kerbs:** bold red/white striped low boxes at every apex and exit.

## 6. Modelling Notes
- Lead with the **251 ft Observation Tower** as a pale shaft + cascading **red tube
  veil** at the amphitheater (T16–18, `s≈0.76–0.80`) — not at Turn 1. The veil
  spills down to form the stage canopy; drop rainbow LED rings.
- Sell **Turn 1 as Big Red only**: steep red-soil banks, packed crowd terraces, and
  hill stands — no tower competing for the climb silhouette.
- Keep the frame **Hill Country first**: sparse far skyline haze, no Velocity Tower
  / fantasy mid-ground landmarks; layer ridgeline boxes for depth.
- Keep infield **open and grassy** — few boxes, warm yellow-green ground plane.
- Use the **red lattice grandstand** and **amphitheater + tower** as the mid/late-lap
  landmark cluster.
- Dust the mid-distance with sparse **dark-green oak/cedar clusters** over dry grass;
  fade everything into thin warm haze at the edges.

## Research pass — outcome

Checked the three researched figures against what was already built. COTA turned
out to be in better shape than expected: **both** landmarks were already
modelled and correctly sited.

- **The Observation Tower** was already at T16–18 on the right, built as the
  Miró Rivera design (pale tapered shaft, red tube veil cascading into the
  stage canopy). ✅ position and form — but its **height was wrong**. COTA
  publishes **251 ft (76.5 m) at the highest point, with the deck 22 storeys
  up**. The deck was correctly at 70 m, but the crown then carried an 8 m mast
  with a beacon at deck+16, topping out near **86 m** — ~12 % over the one
  dimension the venue actually states. **Fixed:** the cone and finial now land
  the tip at exactly 76.5 m.
- **Austin360 Amphitheater** was already there and already wrapped round the
  tower's foot (proscenium shell, three-arc fan canopy, LED video wall, PA
  line-array towers, speckled lawn crowd). ✅ nothing to do.
- **Turn 1's 133 ft hill — NOT changed, and deliberately so.** The def puts
  Big Red at racing s≈0.108 with `rise: 18`, against a
  quoted 133 ft ≈ 40.5 m. That may well be understated, but `elevations` is
  **physics, not scenery**: it moves the racing line, lap times and the
  reference times the AI is calibrated against. It should be changed as a
  deliberate handling decision with a physics re-check, not folded into a
  scenery pass. Flagged here for that separate call.
