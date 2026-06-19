# Jeddah Corniche Circuit — Saudi Arabia

**Setting:** NIGHT race · **Theme:** street_night

## 1. Setting
A blisteringly fast floodlit street circuit threaded along the Red Sea Corniche, ~12km north of downtown Jeddah. Cars run anticlockwise on a narrow strip of reclaimed waterfront — 27 corners, mostly flat-out flowing walled sweeps, hemmed by concrete barriers and lit by LED light towers. The Red Sea sits dark on one flank, modern Jeddah on the other.

## 2. Atmosphere & palette
Warm desert night sky, near-black with a faint haze glow `[0.04, 0.04, 0.08]`. Track surface bright under cool-white LED towers `[0.9, 0.95, 1.0]`. Waterfront warmth: amber path lamps and uplit buildings `[1.0, 0.78, 0.45]`. Sea is a black mirror catching warm spangles `[0.03, 0.05, 0.10]`. Saudi-green accents on signage/walls `[0.1, 0.55, 0.25]`. The King Fahd Fountain jet glows cool-white against the sky.

## 3. Elevation
Essentially flat — reclaimed sea-level land. The only notable feature is the banked left-hander at Turn 13 (~12% banking, ~s 0.50) and the gently banked Turn 1-3 complex (~s 0.05). Model these as subtle camber, not gradient. No hills.

## 4. Landmarks & surroundings by lap position
| s | Side | Distance | Box-modelling description |
|------|------|----------|----------------------------|
| 0.00 | both | near | Pit straight: long low pit building L, stepped grandstand R as box rows |
| 0.05 | L | near | T1-3 banked left complex; tall LED light tower boxes, green wall accents |
| 0.15 | R | far | **Red Sea** opens up: vast flat black water box to horizon |
| 0.20 | R | far | **King Fahd's Fountain**: thin tall white emissive column box far offshore |
| 0.28 | L | mid | **Modern Jeddah buildings**: cluster of lit-window high-rise boxes |
| 0.35 | both | near | Fast flowing esses (T4-12): continuous grey barrier walls hugging the line |
| 0.45 | R | mid | **Marina / Jeddah Yacht Club**: low pontoon boxes + slim yacht-hull boxes, mast spikes |
| 0.50 | L | near | **Banked T13**: cambered tarmac box, light towers, packed grandstand R |
| 0.60 | R | mid | Open Corniche lagoon: dark water gap, warm amber path-lamp dots |
| 0.70 | L | mid | Mixed mid-rise hotel/apartment boxes, emissive billboard panels |
| 0.80 | both | near | Tight technical sector (T22-26): close walls, bright kerb strips |
| 0.90 | R | near | Grandstand bank + light towers funnel toward final flat-out run |
| 0.96 | both | near | Walls + DRS straight back to start/finish |

## 5. Track features
The world's fastest street circuit: long flat-out sweeps and the lengthy flowing T4-T12 sequence taken near full throttle. 27 corners, more than any F1 track. Concrete barrier walls perilously close everywhere — no runoff. Bright sawtooth kerbs (red/white box strips). One banked corner (T13). LED light towers ring the entire lap.

## 6. Modelling notes
- Build a **continuous grey barrier wall** of boxes on both sides for the whole lap — the walls ARE the circuit; never open a gap.
- Make corners flow: long gentle box-chains rather than sharp 90° turns, to read as high-speed sweeps.
- Lean on **emissive faces** against the near-black sky — LED tower pools, lit windows, kerbs, billboards sell the night.
- Hero silhouettes by shape alone: Fountain = single thin tall glowing column far offshore; yachts = low hulls + mast spikes; skyline = layered lit-window slabs.
- Keep the Red Sea a flat black box with a few warm reflection specks; pin it on the outside (R) of the early/mid lap.
- Punctuate with tall LED **light-tower boxes** (dark pole + bright cap) at regular intervals to ring the whole circuit.
