# Logo-only mark colours (drop CREST INK / PLATE INK selectors)

**Date:** 2026-09-10  
**Status:** approved  
**Branch:** `cursor/flank-logo-color-69f7`  
**Scope:** marks + lettering only (not spine/saddle/ridge/side/sun/airbox)

## Intent

Players colour the team mark with three rows only — TEAM LOGO / LOGO DETAIL /
OUTLINE (`logo`, `logo2`, `logo3`). Those colours apply everywhere the mark is
drawn. Lettering and plate boards auto-contrast; CREST INK and PLATE INK leave
the paint sheet.

## Surfaces

| Row | Owns |
|---|---|
| `logo` | Mark shape: crown, fin badge (when logo), flank logo/emblem/lockup, garage wall |
| `logo2` | Second mark shape / shield-disc; authored plate survives flank `noPlate` |
| `logo3` | Mark outline / rim only |

| Removed from sheet | Behaviour |
|---|---|
| CREST INK (`crestInk`) | Not offered. Lettering uses `inkOn(surface)`. Stored values still read for one release so old garage files do not jump. |
| PLATE INK (`plateInk`) | Not offered. Plate/title board text uses `inkOn(board)`. Stored values still read if present. |

PLATE PANEL (`plateTint`) stays — it colours the board, not the mark or glyph ink.

## Rules

1. Authored `logo` / `logo2` / `logo3` are never silently re-picked; halo if weak.
2. Flank `noPlate` suppresses brand/derived plates only; authored `logo2` keeps.
3. Starfield dots: `sideTint` → auto. No `crestInk` fallback.
4. Mark image halos use field `inkOn`, not crestInk.
5. Hints name only the surfaces each row owns; crestInk/plateInk hints go.
6. `LIV_DRAFT_COLORS` drops `crestInk` and `plateInk` so a re-save of a custom
   no longer carries them. `resolveLivery` / `buildAtlas` still accept them on
   stored liveries until cleared.

## Out of scope

Spine/saddle/ridge/side/sun/airbox consolidation (option B). FinArt stays.

## Tests

- Authored logo/logo2 reach flank logo/emblem (existing).
- Sheet does not offer crestInk / plateInk rows; draft tables omit them.
- Lettering (flank number) still paints when crestInk absent.
- Starfield does not change when a leftover crestInk is set on the liv object
  without sideTint (optional guard).
