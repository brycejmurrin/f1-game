# Baku City Circuit (Azerbaijan) — Visual Design Brief

**Theme:** `street_night` · **Setting:** NIGHT-ish / dusk street race

## 1. Setting
A 6.0 km, 20-corner street circuit threading through the heart of Baku. The lap mixes wide modern boulevards along the Caspian Sea with a tight, twisting climb around the medieval walls of Içerisheher (the Old City). The Tilke-designed track wraps Government House, the Presidential Palace, and runs beneath the Flame Towers on the hill above. Two worlds collide: ancient sandstone fortress walls versus glass-and-steel Caspian-front towers.

## 2. Atmosphere & Palette
Dusk/early-evening: deep indigo-to-violet sky fading orange at the horizon over the sea. Streetlights, illuminated landmarks, and floodlit barriers pop against the dark.
- Sky / horizon: `[0.12, 0.10, 0.22]` deep, with warm band `[0.55, 0.30, 0.18]`
- Old-City sandstone walls: `[0.62, 0.50, 0.34]` warm, uplit `[0.85, 0.62, 0.30]`
- Modern glass towers: `[0.20, 0.28, 0.40]` cool, lit windows `[0.95, 0.88, 0.55]`
- Tarmac: `[0.10, 0.10, 0.12]`; kerbs red/white `[0.85,0.15,0.15]`/`[0.92,0.92,0.92]`
- Flame Towers glow: animated `[0.95, 0.35, 0.10]`

## 3. Elevation
Mostly flat (sea-level boulevards). One distinct climb: the Old City "Castle Section" ramps uphill from s≈0.38 to a crest near s≈0.46, then descends back toward the Maiden Tower and the seafront. Everything from s≈0.55 to 1.0 (the long straight) is dead flat.

## 4. Landmarks & Surroundings by Lap Position

| s | Side | Distance | Box-modelling description |
|------|------|----------|----------------------------|
| 0.00 | R | near | Government House: wide ornate twin-tower sandstone box, pit/start backdrop |
| 0.04 | L | mid | Square plaza framed by low rectangular civic blocks |
| 0.12 | both | near | First 90° squeeze: tall flat grey wall boxes channeling the turn |
| 0.22 | R | far | Flame Towers on hillside: three tapered tall boxes, animated flame glow |
| 0.30 | L | mid | Mixed modern mid-rise: stacked glass boxes, lit window grids |
| 0.38 | R | near | Old City wall begins: long crenellated sandstone box, uplit |
| 0.42 | L+R | very near | Castle Section squeeze (~7.6 m): tall walls both sides, near-vertical climb |
| 0.46 | R | near | Crest past castle gate: chunky stone bastion box at apex |
| 0.52 | L | near | Maiden Tower: stout cylindrical-look stepped sandstone tower (tall box) |
| 0.58 | L | far | Seafront opens: low boulevard rail + palm-row low green boxes |
| 0.65–0.95 | L | far | Caspian-front straight (~2.2 km): sea void left, sparse lit modern boxes right |
| 0.80 | R | mid | Cluster of glass Caspian-front towers, cool-blue lit |
| 0.97 | both | near | Braking zone into T1: stacked tyre-wall + barrier boxes |

## 5. Track Features
- The ~2.2 km flat-out straight (s≈0.62→0.99) along Neftchilar Avenue — the lap's defining feature, gentle curve, very wide.
- Narrow uphill Old City "Castle Section" (s≈0.38–0.50): claustrophobic, walls almost touching.
- Sequence of right-angle 90° corners in the city-centre opening sector.
- Continuous concrete walls and tyre barriers lining nearly the whole lap (street circuit, zero runoff).
- Red/white kerbs at apexes; flat tarmac throughout.

## 6. Modelling Notes
- Contrast is the identity: cluster warm sandstone crenellated boxes (notch the top edge) in the Old City vs. cool tall glass boxes with emissive window grids on the seafront.
- Place tall flame-glow boxes (animated emissive) on a raised tier far-right early in the lap so the Flame Towers read on the skyline, not the trackside.
- Make the Castle Section unmistakable: bring wall boxes very close on both sides and ramp the road geometry upward briefly.
- Line the whole lap with low repeating barrier/wall boxes; punctuate with floodlight poles (thin box + bright top) for the night mood.
- Keep the long straight visually empty on the sea (left) side — a dark void selling the open Caspian; concentrate lit boxes on the right.
