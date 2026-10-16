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
| `airboxTint` | DROP (never promoted: it painted a strict subset of `cover`, and `cover` is also the surface the atlas inks the crest against — promoting it repainted the loft and flipped the crown ink on any file that set it) |
| `crestInk` | drop (auto-ink) |
| `plateInk` | drop (auto-ink) |

Williams stock: bake ridge into `spineTint`, remove `ridgeTint` from `teams.js`.

Runtime after migrate: `ridgeFill` and the `fade` crown use BAND — an authored BAND as-is, a derived one re-picked to clear the cover; `airboxMeshColour` = sun under WRAP else cover; lettering/plate glyphs = `inkOn` only.

## Colour vs legibility — two parameters (as built)

A mark's COLOUR is authored (the player's TEAM LOGO row, or the team's
`livery` block in `teams.js`) and `markPalette` never substitutes it. Its
LEGIBILITY is a separate parameter: the OUTLINE row (`logo3`), a plate, or —
for a DERIVED mark nobody authored — an automatic halo. A shipped car whose
brand mark matches its own cover (Mercedes, McLaren, Alpine, Racing Bulls)
authors `logo3` in team data, the same row a player uses for the same job.
The sheet ADVISES a player whose pick will not read (ratio + fix under TEAM
MARK) and never overrides it.

Instruments, one model each: `cover-legibility` scores contrasting AREA and
owns bands / saddles / suns / sashes; `crest-marks` scores mark + outline +
halo per background and owns every mark, asserting team data reads and a
player's pick is exact.

## Sheet layout + gating

**Always on:** body, panels, mark, finish/flaps/font/sponsors.

**Grey when dead:** fin rows (`finShape ≠ none`); wings (`flaps ≠ carbon`).

**Design pills first**, then colour rows only when live:

| Row | Live when |
|---|---|
| BAND | TOP ∈ `{saddle,panel,stripe,streaks,twin,chevron,wedge,rungs,tricolour,carbon,cap,ridge,fade}` (declared in `LiveryTex.FILL_SURFACES`, proven by `fill-gating.test.mjs`) |
| SADDLE | TOP=`saddle` OR BIND=`saddleWrap` OR SIDE=`shoulder` (`rake` reads SADDLE only under the bind — measured) |
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
