# Interlagos (Autódromo José Carlos Pace, São Paulo) — visual reference

Visual research for Apex 26 procedural scenery. WebFetch was blocked at the proxy (403),
so facts come from WebSearch extracts with source URLs cited inline.

## Real-world surroundings

- "Interlagos" = "between lakes" — the circuit sits between two artificial reservoirs,
  **Guarapiranga** and **Billings**, in São Paulo's southern zone
  ([Wikipedia](https://en.wikipedia.org/wiki/Interlagos_Circuit)).
- ~**25 km south of downtown São Paulo**, so the city skyline lies broadly to the
  **north** ([F1.com](https://www.formula1.com/en/latest/article/samba-speed-and-interlagos-the-ultimate-fan-guide-to-sao-paulo.Mbl4MekNAMMFXEIOkNSTO)).
- ~**760 m altitude** — second-highest circuit on the calendar; volatile weather.
- **Favela / housing backdrop:** the track borders a favela; small multi-coloured
  apartment blocks ("prediozinhos") and a **Cingapura public-housing complex** stack up
  the hills, notably behind the back straight before the main straight
  ([SkyscraperCity](https://www.skyscrapercity.com/threads/arredores-do-aut%C3%B3dromo-de-interlagos-%C3%A9-uma-coisa-pavorosa.1252331/page-2)).
  (Not Paraisópolis — that favela is far north near Morumbi.)

## Signature landmarks

| Name | Description | Colour | Track position |
|---|---|---|---|
| **Senna S (S do Senna)** | iconic T1–2 downhill left-right esses, prime overtaking | red/white kerb | right after start/finish, highest point descending |
| **"Nosso Senna" mirrored statue** | 3.5 m, 550 kg faceted **mirror-aluminium** Senna figure | mirror-silver | inside permanent grandstand **Sector A** |
| **Eduardo Kobra Senna mural** | giant **27 m × 10 m** street-art portrait, vivid geometric | multicolour | just after the entrance tunnel |
| **Floodlight masts** | **21 towers ~every 200 m, 9 m high**, pivoting, 140k lm | grey masts, cool-white | ring the full track (since 2018) |
| **Curva do Sol (T3)** | wide sweeping left onto the back straight | red/white kerb | after the Senna S |
| **Subida dos Boxes (T14)** | long uphill left, ~10% climb to the line | red/white kerb | final corner before start/finish |

## Skyline & architecture

- **Distant São Paulo skyline to the north** (~25 km) — model a low band of distant
  towers on the **northern horizon**, not a close skyline
  ([F1.com](https://www.formula1.com/en/latest/article/samba-speed-and-interlagos-the-ultimate-fan-guide-to-sao-paulo.Mbl4MekNAMMFXEIOkNSTO)).
- **Immediate backdrop is residential, not corporate** — favela + Cingapura apartment
  blocks on the hills: small, irregular, **multi-coloured low-rise** stacked up hillsides,
  characteristic São Paulo periphery (esp. behind the Reta Oposta).
- **Old-school concrete grandstands** ring the track; pit/paddock rebuilt with enlarged
  garages but retains a classic feel; a concrete retaining wall behind Laranjinha.

## Water, vegetation & terrain

- **Lakes** (Guarapiranga, Billings) flank the *neighbourhood* — model as large water
  bodies in the **mid/far distance**, not at the armco
  ([Wikipedia](https://en.wikipedia.org/wiki/Interlagos_Circuit)).
- **"Lake" corners:** Descida do Lago (T4–5) descends toward the water reference; **T5 is
  the lowest point** of the track.
- **Bowl/amphitheatre topography** on natural hilly terrain — roller-coaster character,
  blind crests, grandstands ringing the action close.
- **Elevation:** sources spread **~40–56 m** total relief; highest at start/finish→T1,
  lowest at Descida do Lago. Start straight uphill; **Subida dos Boxes ~10%** climb back.
- **Vegetation:** tropical/subtropical green — leafy parkland, lagoons, trees on the
  hillsides interspersed with housing.

## Grandstands, kerbs, surface

- **Anti-clockwise**, 4.309 km, 15 corners.
- Grandstands: permanent fixed ~18,000, daily venue ~60,000; key stands — **Sector D**
  (end of main straight, start + Senna S entry), **Sector R** (Curva do Sol), **Sector A**
  (permanent, houses the Senna statue), Sector H. Classic concrete terraces.
- **Surface notoriously bumpy** — resurfaced **2024** (still bumpy) and **again 2025**
  (fresh asphalt T12→T1 and T3→Descida do Lago, drainage grooves). Model a **patchwork
  tarmac** with bumps and newer/older asphalt sections
  ([RaceFans](https://www.racefans.net/2025/11/06/interlagos-track-resurfaced-again-after-f1-drivers-criticised-very-bad-2024-work/)).
- **Red/white serrated kerbs**; run-off a mix of asphalt + gravel; barriers/grandstands
  close to the edge.

## Atmosphere / lighting / signage

- **Daytime/afternoon race** (~2 pm start); fully floodlit (21 towers) since 2018, so a
  dusk/evening render is plausible too.
- **Weather dramatic and volatile** — rain materialises fast, drenches one section while
  another stays dry; recent editions saw rare weather warnings, cyclones, heavy rain/wind.
  **Brooding storm clouds, broken skies, wet reflective tarmac** are on-brand.
- **National identity:** strong Brazilian **green-and-yellow**; Senna tributes (Senna S,
  mirror statue in Sector A, the 27×10 m Kobra mural at the tunnel); samba/carnival crowd.

## Gap analysis vs current game

Current `interlagos.js`: hillside favela (colourful buildings, tropical palette), São
Paulo CBD skyline cityFront + backdrop towers, Guarapiranga reservoir water.

- **Favela direction/character is right** — keep the multi-coloured low-rise stacked on
  hills; ensure it sits **close** (esp. behind the back straight), with the corporate
  skyline **far** on the **north** horizon (not a close cityFront wall encircling the lap).
- **Lakes should be mid/far distance**, not trackside; tie the **Descida do Lago** (T4–5)
  visually to the water reference and make T5 the low point.
- **Missing Senna tributes** — add the **mirror-aluminium "Nosso Senna" statue** (Sector
  A) and the **giant Kobra mural** near the entrance tunnel; both are signature.
- **Floodlight masts** should match the real **21 × 9 m** pivoting masts ringing the lap
  (and enable a dusk/night variant).
- **Surface:** model patchwork bumpy tarmac with newer asphalt T12→T1 and T3→Descida.
- **Atmosphere:** bias toward dramatic broken skies / storm clouds; wet-track variant is
  strongly authentic.

## Concrete scenery recommendations

1. **Close favela backdrop** — multi-coloured low-rise + Cingapura blocks stacked on green
   hills, strongest behind the Reta Oposta; distant SP towers as a low northern-horizon
   band only.
2. **"Nosso Senna" mirror statue** (~3.5 m faceted mirror-silver) at Sector A grandstand.
3. **Kobra Senna mural** — a tall multicolour geometric wall (~27×10 m) near the entrance
   tunnel.
4. **21 × 9 m floodlight masts** ringing the lap; support a dusk/night render.
5. **Lakes** (Guarapiranga/Billings) as large mid/far water bodies; Descida do Lago tied
   to the water, T5 as the low point.
6. **Bowl topography** — ~40–56 m relief, uphill start straight, ~10% climb up Subida dos
   Boxes; classic concrete grandstands ringing the track.
7. **Patchwork bumpy tarmac** (newer asphalt T12→T1, T3→Descida), red/white serrated
   kerbs, asphalt+gravel run-off.
8. Brazilian green-yellow signage; dramatic broken-sky / storm-cloud atmosphere with a
   wet-track variant.
