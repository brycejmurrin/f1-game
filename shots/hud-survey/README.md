# HUD layout shots — 2026-10-10 (ship tip 980eadd)

Made with `node tools/shot/hud-mock.mjs` (branch cursor/hud-survey-7c3a): the race HUD on BLACK, every
widget filled with mock content (radio card, flag, track-limits chip, damage), a labelled box per
element — readouts cyan, tap targets yellow dashed, overlapping pairs RED. 48 shots in 143 s.
Each sheet: cameras cockpit / chase / helmet × "shipped" (opt-in RELATIVE, STRATEGY, INPUTS off) and
"all-on". Mirror frame follows its own rule (AUTO = onboard cams); no 3D world behind the HUD.

| sheet | what it shows |
|---|---|
| phone-landscape-844x390.jpg | iPhone 12-14 landscape, 47px notch both sides. Cockpit shipped: clean. All-on: DAMAGE × INPUTS. Chase: radio card over the minimap (shipped) and over the flag; LIMITS × INPUTS. Helmet: GEAR × ERS bar. |
| phone-se-667x375.jpg | iPhone SE (no notch): same pattern; cockpit clean; chase/helmet radio × flag, DAMAGE × INPUTS, GEAR × ERS. |
| phone-max-932x430.jpg | Pro Max (59px notch): as 844x390 plus LIMITS × INPUTS in helmet. |
| phone-640x360.jpg | small Android: radio × flag, DAMAGE × INPUTS, helmet GEAR × ERS. |
| phone-landscape-left-844x390.jpg | notch on the LEFT only: chase shipped gets radio × map AND radio × flag. |
| phone-portrait-390x844.jpg | portrait (behind the rotate prompt): radio × map, SECTORS × DAMAGE, radio × RELATIVE/STRATEGY. |
| tablet-1180x820.jpg | iPad landscape: no overlaps. |
| desktop-1280.jpg | desktop 1280x720: LIMITS × INPUTS and DAMAGE × INPUTS when the opt-ins are on. |

## Batch 2 — sectors + limits to the left (branch cursor/hud-sectors-left-5d2e, on the band allocator)

BEFORE = ship tip (980eadd), AFTER = cursor/hud-sectors-left-5d2e @ 9a3782f, same mock (`tools/shot/hud-mock.mjs`,
LIMITS shown by a real strike via `__apex.strikes`). Rows: cockpit / chase × shipped / all-on, helmet all-on.

| sheet | what it shows |
|---|---|
| before-after-phone-landscape-844x390.jpg | S1-S3 as one row under the map with LIMITS under it on every camera (was: plate beside BOOST, LIMITS left in cockpit / right in chase); DAMAGE beside LIMITS; radio card centre-left under the flag (was: over the map / flag); the right column keeps INPUTS only. Only overlap left: helmet GEAR × ERS (PR #1351). |
| before-after-phone-se-667x375.jpg | the same on iPhone SE (no notch). With every opt-in on, STRATEGY drops (reported as "no room") instead of floating mid-track. |

## Choose: where the yellow flag + radio message go (phone, 844x390, every HUD piece on)

**option-A-under-tower.jpg — A: one line right under POS / LAP / TIME / BEST.**
- Covers: a strip of sky under the timing boxes; the track and the car stay clear, same spot on every camera.
- Crowds: the long radio text is cut short ("…") unless it scrolls or takes a 2nd line; in chase the opt-in INPUTS trace has to step down a little.

**option-B-bottom.jpg — B: one line low on the screen, between the steering arrows and the pedals.**
- Covers: road just ahead of the car (cockpit) / the space just above the gear number (chase).
- Crowds: it moves between cameras (bottom edge in cockpit, above GEAR / SPEED in chase) and sits where your thumbs are.
