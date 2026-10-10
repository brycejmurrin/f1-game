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
