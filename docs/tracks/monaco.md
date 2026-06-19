# Circuit de Monaco — Visual Design Brief

**Theme:** `street_day` (Mediterranean) · **Time:** DAY · **Render:** procedural colored boxes, no textures

## 1. Setting
A street circuit threaded through the principality of Monte Carlo on the French Riviera. The track hugs a steep coastal hillside that drops to a deep-blue Mediterranean harbour packed with super-yachts. Dense pastel apartment blocks, hotels, and the ornate Casino rise in tiers up the rock; there is no run-off — barriers sit inches from the racing line. Palm trees, marina railings, and grandstands line the streets.

## 2. Atmosphere & palette
Clear, bright midday sun, sharp shadows, warm Riviera glow. Minimal fog — just a faint haze over the harbour for depth.
- Sky: `[0.45, 0.68, 0.92]` clear blue
- Tarmac: `[0.32, 0.33, 0.35]` clean street asphalt
- Sea/harbour: `[0.10, 0.34, 0.55]` deep Mediterranean blue
- Buildings: warm pastels — cream `[0.92, 0.86, 0.72]`, terracotta `[0.80, 0.45, 0.32]`, ochre `[0.85, 0.70, 0.45]`
- Greenery (palms/planters): `[0.25, 0.45, 0.22]`
- Armco/barriers: galvanized grey `[0.70, 0.72, 0.74]`

## 3. Elevation
~42 m total change. Lowest at the harbour/start. Strong climb from Sainte Devote up Beau Rivage to the high point at Casino Square (s≈0.05→0.22). Sustained descent down Mirabeau to the Fairmont hairpin (s≈0.30→0.40), continuing down through Portier into the tunnel (s≈0.50→0.60). Track returns to harbour level for the flat back section (s≈0.62→1.0).

## 4. Landmarks & surroundings by lap position
| s | Side | Dist | Landmark — box-modelling note |
|------|------|-------|-------------------------------|
| 0.03 | R | close | Pit wall & start grandstand — long low grey box w/ thin railing boxes |
| 0.05 | R | mid | Sainte Devote chapel — small cream box, dark pitched-roof cap |
| 0.10 | both | mid | Beau Rivage climb buildings — stacked pastel blocks rising in tiers |
| 0.20 | L | close | Casino de Monte-Carlo — ornate cream box w/ green-tinted roof boxes |
| 0.22 | both | close | Casino Square — high-point plaza, low planter boxes, grey kerbs |
| 0.40 | R | close | Fairmont hairpin hotel — tall pale block wrapping the tight bend |
| 0.55 | both | close | Tunnel — dark grey box roof + side walls enclosing the track |
| 0.65 | L | mid | Harbour & yachts — deep-blue water plane + white deck-stacked boxes, thin mast boxes |
| 0.75 | R | mid | Tabac waterfront buildings — pastel block row facing the marina |
| 0.80 | L | close | Swimming Pool section — turquoise `[0.20,0.60,0.65]` rectangle, white pool-edge boxes |
| 0.90 | R | close | Rascasse / paddock buildings — low cream sheds, marina railing |
| all | both | close | Armco barriers — continuous thin grey boxes lining both sides |

## 5. Track features
- Uphill drag from Sainte Devote to Casino Square is the defining climb — exaggerate the ramp.
- The tunnel: dark enclosed box, then sudden bright emergence onto the harbourfront.
- Extremely tight barriers everywhere — boxes nearly touching the asphalt edge define the claustrophobic feel.
- Low red/white kerbs at chicanes and the hairpin; otherwise minimal kerbing, flat street surface.

## 6. Modelling notes
- Lean on tiered pastel building boxes climbing the hillside to read instantly as Monte Carlo.
- Make the deep-blue harbour plane + clustered white yacht boxes the signature visual on the back half.
- Continuous grey Armco boxes on both sides sell the "no margin" street-circuit identity.
- Use the dark tunnel box as a dramatic light/dark beat mid-lap.
- Keep tarmac clean grey and ground flat except for the Sainte Devote→Casino ramp and the descent to the tunnel.
- Turquoise pool rectangle and green palm/planter boxes add Riviera colour accents.
