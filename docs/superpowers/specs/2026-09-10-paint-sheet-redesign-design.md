# Paint sheet redesign — zone sheet + design fills

**Status:** approved (user waived file review; implement next)  
**Date:** 2026-09-10  
**Branch:** `cursor/garage-angles-setup-69f7`

## Goal

Flexibility without redundant colour rows: keep knobs that own distinct surfaces; fold dead/duplicate keys; show design fills only when the current TOP/SIDE/BIND paints them; authored picks stay exact.

## Colour model

### Keep (authored keys)

| Key | Label | Role |
|---|---|---|
| `c1` / `c2` | PRIMARY / ACCENT | Bases |
| `accent` | DETAIL | Tertiary trim |
| `stripe` / `noseStripe` | BODY / NOSE STRIPE | Graphics |
| `nose` / `pod` / `cover` | Panels | Mesh overrides |
| `wing` / `rearWing` / `halo` | Wings / halo | Mesh |
| `fin` / `finArt` | TAIL FIN / GRAPHIC | Fin (gated) |
| `logo` / `logo2` / `logo3` | Mark slots | Brand |
| `spineTint` | BAND | Crown graphic fill |
| `saddleTint` | SADDLE | Shoulder / wrap shelf when ≠ band |
| `sideTint` | FLANK FILL | Side colour graphics when ≠ band |
| `sunTint` | SUN | WRAP disc |
| `bandTint2` | 2ND BAND | Tricolour second band |
| `plateTint` | PLATE | Plate/title board |

Unset → derive (unchanged). Authored → exact colour (unchanged).

### Fold / delete (migrate once, then stop reading)

| Dead key | Migrate |
|---|---|
| `ridgeTint` | → `spineTint` if spineTint empty; else drop |
| `airboxTint` | → `cover` if cover empty; else drop |
| `crestInk` | drop (auto-ink) |
| `plateInk` | drop (auto-ink) |

Williams stock: bake ridge into `spineTint`, remove `ridgeTint` from `teams.js`.

Runtime after migrate: `ridgeFill` always uses band; `airboxMeshColour` = sun under WRAP else cover; lettering/plate glyphs = `inkOn` only.

## Sheet layout + gating

**Always on:** body, panels, mark, finish/flaps/font/sponsors.

**Grey when dead:** fin rows (`finShape ≠ none`); wings (`flaps ≠ carbon`).

**Design pills first**, then colour rows only when live:

| Row | Live when |
|---|---|
| BAND | TOP ∈ `{saddle,panel,stripe,streaks,twin,chevron,wedge,rungs,tricolour,carbon,cap,ridge,fade}` |
| SADDLE | TOP=`saddle` OR BIND=`saddleWrap` OR SIDE ∈ `{shoulder,rake}` |
| FLANK FILL | SIDE ∈ `{band,sash,slash,rake,shoulder,starfield,ribbon}` |
| SUN | TOP=`wrap` |
| 2ND BAND | TOP=`tricolour` |
| PLATE | SIDE ∈ `{plate,title}` |

Matching chips include every **live** colour key (tints included).

## Out of scope

No new TOP/SIDE designs; no mesh geometry changes; no physics.

## Verification

Unit: `team-livery`, `fin-design`, `livery-contrast`, Williams stock.  
`verify-change --fast`. Browser groups optional / named not-run.
