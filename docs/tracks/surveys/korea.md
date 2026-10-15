# Korea International Circuit — survey (2026-10-14)

**Circuit id:** `korea`  
**Brief:** `docs/tracks/korea.md`  
**Data:** `js/circuits/korea.js`, `js/circuits/scenery/korea.js`  
**Live:** [Korean GP on GitHub Pages](https://brycejmurrin.github.io/f1-game/) (picker: KOREA)

Anti-clockwise Tilke layout on reclaimed Yeongam tidal flats. Theme `green` (not `modern`) so the generic skyline emitter stays off; identity is empty run-off, salt fill, unfinished marina shells, seawall + haze.

## Code map

| Layer | Role |
|---|---|
| `js/circuits/korea.js` | OSM centreline (`path.pts`), `undulate: false`, `pit: { side: -1 }`, sectors/turns, palette, `furniture.tree: "none"`, `lamp: "none"`. |
| `js/circuits/scenery/korea.js` | Lazy `scenery(api)`: pit complex + main stand + marina shells + footbridge `modelGroup`s, split guardrails around road-occupied bands (header), `waterBand` / `cityFront` / shells. |
| `js/track/tracks.js` | Registry `build` / `LIST`; no korea-specific tables. |
| `tests/data/landmarks/korea.json` | Required models: `korea-pit-complex`, `korea-main-grandstand`, `korea-marina-shells`, `korea-final-footbridge`. |
| `js/lighting/presets.js` | Full `korea\|tod\|weather` grid (B1b donor `madrid` for day keys; look-survey deferred). |

**Engine checks (2026-10-14):**

```text
node tools/track/verify-track.cjs korea
node tools/track/audit-circuit.cjs korea --json
```

- Centreline: min node radius **8.03 m** at baked node 924 (s≈0.665, hw 8 m); **surface folds 0**.
- `KNOWN_TARMAC_FOLDS` in `verify-track.cjs` is **empty** (korea removed with 2026-10-10 running-surface fold clamp).
- Hairpin fleet gate (`circuit-def-fields.test.mjs`) passes for korea.

## Capture plan

| Set | Frames | Conditions | Status |
|---|---|---|---|
| Sector + landmarks | 32 | `day` / `dry` | `artifacts/shots/tracks/korea/*__day-dry.jpg` (force-added; JPEG q≈80, ≤1280 px) |
| Key views × weather/TOD | 4–6 × (dusk, night, overcast, rain, fog, wet) | **Blocked** | Waiting on shared PR *tools: shared shot tooling for circuit surveys* (batch TOD/weather, capture retries, `artifacts/shots/tracks/**` gitignore exception). |

**Weather / TOD API** (for follow-up): `__apex.race(id, tod, wx)`, `setTimeOfDay(tod)`, `weather(wx)` with `tod ∈ {dawn, day, dusk, night}` and `wx ∈ {dry, wet, rain, overcast, fog}` (`docs/DEBUG-HOOKS.md`).

Screenshots live in `artifacts/shots/tracks/korea/` (gitignored tree; this branch force-adds survey JPEGs). Image links below use `../../../artifacts/shots/tracks/korea/`.

---

## Sector 1 (s ≈ 0 – 0.33) — day / dry

| | | |
|---|---|---|
| ![Pit straight orbit](../../../artifacts/shots/tracks/korea/s01-pit-straight__day-dry.jpg) | ![Grandstand](../../../artifacts/shots/tracks/korea/s01-grandstand__day-dry.jpg) | ![Pit infield](../../../artifacts/shots/tracks/korea/s01-pit-infield__day-dry.jpg) |
| `s01-pit-straight` | `s01-grandstand` | `s01-pit-infield` |
| ![Turn 1 exit](../../../artifacts/shots/tracks/korea/s02-turn1-exit__day-dry.jpg) | ![Turn 1 runoff](../../../artifacts/shots/tracks/korea/s02-turn1-runoff__day-dry.jpg) | ![Sector 1 overview](../../../artifacts/shots/tracks/korea/sector1-overview__day-dry.jpg) |
| `s02-turn1-exit` | `s02-turn1-runoff` | `sector1-overview` |

---

## Sector 2 (s ≈ 0.33 – 0.68) — day / dry

| | | |
|---|---|---|
| ![Back straight](../../../artifacts/shots/tracks/korea/s02-back-straight__day-dry.jpg) | ![Emptiest view](../../../artifacts/shots/tracks/korea/s02-back-empty__day-dry.jpg) | ![Turn 3 braking](../../../artifacts/shots/tracks/korea/s02-turn3-braking__day-dry.jpg) |
| `s02-back-straight` | `s02-back-empty` | `s02-turn3-braking` |
| ![Turn 3 orbit](../../../artifacts/shots/tracks/korea/s02-turn3-orbit__day-dry.jpg) | ![Turn 3 infield](../../../artifacts/shots/tracks/korea/s02-turn3-infield__day-dry.jpg) | ![Turns 4–6](../../../artifacts/shots/tracks/korea/s02-turns4-6__day-dry.jpg) |
| `s02-turn3-orbit` | `s02-turn3-infield` | `s02-turns4-6` |
| ![Distant shells](../../../artifacts/shots/tracks/korea/s02-shells-distant__day-dry.jpg) | ![Seawall T7](../../../artifacts/shots/tracks/korea/s02-seawall-t7__day-dry.jpg) | ![Seawall water](../../../artifacts/shots/tracks/korea/s02-seawall-water__day-dry.jpg) |
| `s02-shells-distant` | `s02-seawall-t7` | `s02-seawall-water` |
| ![Sector 2 overview](../../../artifacts/shots/tracks/korea/sector2-overview__day-dry.jpg) | | |
| `sector2-overview` | | |

---

## Sector 3 (s ≈ 0.68 – 1.0) — day / dry

| | | |
|---|---|---|
| ![Turn 8 stand](../../../artifacts/shots/tracks/korea/s03-turn8-stand__day-dry.jpg) | ![Marina shells](../../../artifacts/shots/tracks/korea/s03-marina-shells__day-dry.jpg) | ![Marina city front](../../../artifacts/shots/tracks/korea/s03-marina-cityfront__day-dry.jpg) |
| `s03-turn8-stand` | `s03-marina-shells` | `s03-marina-cityfront` |
| ![Stadium entry](../../../artifacts/shots/tracks/korea/s03-stadium-entry__day-dry.jpg) | ![Turn 14 towers](../../../artifacts/shots/tracks/korea/s03-stadium-t14__day-dry.jpg) | ![Turn 15](../../../artifacts/shots/tracks/korea/s03-turn15__day-dry.jpg) |
| `s03-stadium-entry` | `s03-stadium-t14` | `s03-turn15` |
| ![Turn 17](../../../artifacts/shots/tracks/korea/s03-turn17__day-dry.jpg) | ![Footbridge](../../../artifacts/shots/tracks/korea/s03-footbridge__day-dry.jpg) | ![Footbridge deck](../../../artifacts/shots/tracks/korea/s03-footbridge-deck__day-dry.jpg) |
| `s03-turn17` | `s03-footbridge` | `s03-footbridge-deck` |
| ![Map context](../../../artifacts/shots/tracks/korea/map-context__day-dry.jpg) | ![Sector 3 overview](../../../artifacts/shots/tracks/korea/sector3-overview__day-dry.jpg) | |
| `map-context` | `sector3-overview` | |

---

## Key views (repeat targets for weather pass)

| | | |
|---|---|---|
| ![Key pit](../../../artifacts/shots/tracks/korea/key-pit__day-dry.jpg) | ![Key Turn 3](../../../artifacts/shots/tracks/korea/key-turn3__day-dry.jpg) | ![Key marina](../../../artifacts/shots/tracks/korea/key-marina__day-dry.jpg) |
| `key-pit` | `key-turn3` | `key-marina` |
| ![Key stadium](../../../artifacts/shots/tracks/korea/key-stadium__day-dry.jpg) | ![Key seawall](../../../artifacts/shots/tracks/korea/key-seawall__day-dry.jpg) | ![Key footbridge](../../../artifacts/shots/tracks/korea/key-footbridge__day-dry.jpg) |
| `key-stadium` | `key-seawall` | `key-footbridge` |

### Weather / lighting (deferred)

After rebase onto *tools: shared shot tooling for circuit surveys*, re-shoot **only** these six at: `dusk/dry`, `night/dry`, `day/overcast`, `day/rain`, `day/fog`, `dusk/wet`, `night/wet` (subset TBD to stay ≤36 total with sector set).

---

## Findings

| ID | Severity | Topic | Evidence | Notes |
|---|---|---|---|---|
| K1 | **Fixed (data)** | R3 centreline fold / “folded road” | `verify-track` centreline row; TE-1 chord points | Legacy 97°/4 m kink at f~0.064 cleared; min R 8.03 m at s≈0.665 (stadium approach), still above hw. No safe `path.pts` nudge without apex drift >2 m. |
| K2 | Low | Road-occupied scenery bands | `scenery/korea.js` header | s 0.062–0.065 (−1) and 0.291–0.309 (+1) — guardrails split; do not merge spans. |
| K3 | Low | Props near racing line | `agent.mjs korea survey` | Two `building` overlaps &lt;1 m (s≈0.76 infield) — monitor; no move this pass (cityFront density). |
| K4 | Info | Night lighting | `furniture.lamp: "none"` | Intentional empty venue; night presets rely on sky/city glow — **re-check after night weather pass** (missing floodlights risk). |
| K5 | Info | Pit model duplicate | verify diagnostics | `korea-pit-complex` suppressed when TrackPit owns pit — expected. |
| K6 | **Blocked** | Weather-specific issues | — | Z-fighting, rain, fog density, wet SSR — need shared batch capture. |

## Ranked improvements

1. **Done:** Document centreline fold status; confirm off `KNOWN_TARMAC_FOLDS`.
2. **Next (after shared tooling):** 24–30 weather/TOD frames on the six `key-*` views; note lamp/rain/fog issues in K4–K6.
3. **Optional:** Add 1–2 chord controls near ctrl 67 (s≈0.665) if a future path edit can raise min R above ~10 m without apex drift.
4. **Optional:** Slightly increase `cityFront` set-back at s≈0.76 if props-over-road spec ever flags the 0.83 m overlap.

## Verified (this PR)

- `node tools/track/verify-track.cjs korea` — OK  
- `node tools/track/audit-circuit.cjs korea` — OK (float/clip/coplanar/props/ground within baselines)  
- `node --test tests/unit/circuit-def-fields.test.mjs` (hairpin row includes korea)
