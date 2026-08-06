# Jeddah Corniche Circuit — Saudi Arabia

**Setting:** NIGHT race · **Theme:** street_night

## 1. Setting
A blisteringly fast floodlit street circuit threaded along the Red Sea Corniche, ~12km north of downtown Jeddah. Cars run anticlockwise on a narrow strip of reclaimed waterfront — 27 corners, mostly flat-out flowing walled sweeps, hemmed by concrete barriers and lit by LED light towers. The Red Sea sits dark on one flank, modern Jeddah on the other.

## 2. Atmosphere & palette
Warm desert night sky, near-black with a faint haze glow `[0.04, 0.04, 0.08]`. Track surface bright under cool-white LED towers `[0.9, 0.95, 1.0]`. Waterfront warmth: amber path lamps and uplit buildings `[1.0, 0.78, 0.45]`. Sea is a black mirror catching warm spangles `[0.03, 0.05, 0.10]`. Saudi-green accents on signage/walls `[0.1, 0.55, 0.25]`. The King Fahd Fountain jet glows cool-white against the sky.

## 3. Elevation
Essentially flat — reclaimed sea-level land. The notable features are the banked left-hander at Turn 13 (~12% banking, ~s 0.50), a second 6° banked sweeper just after it (~s 0.55), and the 6° banked final right onto the pit straight. Model these as camber, not gradient. No hills.

## 4. Landmarks & surroundings by lap position
| s | Side | Distance | Box-modelling description |
|------|------|----------|----------------------------|
| 0.00 | both | near | Pit straight: long low pit building L, stepped grandstand R as box rows |
| 0.05 | both | near | T1-3 banked left complex; pale grey canyon + green/gold accents; cool LED heads |
| 0.15 | R | far | **Red Sea** opens up (no seaward city wall): vast flat black water box to horizon |
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
The world's fastest street circuit: long flat-out sweeps and the lengthy flowing T4-T12 sequence taken near full throttle. 27 corners, more than any F1 track. Pale grey concrete canyon walls (~1.3–1.5 m) with intermittent Saudi green/gold accent stripes — not a solid green night rail. Bright sawtooth kerbs (red/white box strips). Banked corners at T13 (7°), the sweeper after it and the final right (both 6°).`
- OLD: `T1-3 banked left complex; pale grey canyon`
- NEW: `T1-3 left complex; pale grey canyon Slim cool-white LED heads densify both sides (~every 40 m) as a light tunnel.

## 6. Modelling notes
- Build a **continuous pale grey concrete canyon** on both sides for the whole lap; punctuate with intermittent green/gold stripe boxes (never a solid green wall).
- Make corners flow: long gentle box-chains rather than sharp 90° turns, to read as high-speed sweeps.
- Lean on **cool-white LED heads** as the primary night rhythm; keep tall floods/towers sparse.
- Hero silhouettes by shape alone: Fountain = single thin tall glowing column far offshore; Floating Mosque; yachts = low hulls + mast spikes; skyline = inland lit-window slabs.
- Keep the Red Sea open on the outside (R) of the early/mid lap (~s 0.05–0.40): no seaward cityFront/backdrop there — sea, mosque, and fountain must read.
- City mass stays inland (L); only thin seaward frontage near the start/finish pocket.
