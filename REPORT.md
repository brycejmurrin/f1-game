# D·W22h — #3609 Garage LIVERY EDIT +26.7 MB texturesSize

**Agent:** cursor:bc-0d0ebf9b-9264-5a48-87c8-38380cdf3e10  
**Branch:** `cursor/w22h-livery-tex-leak-3e10`  
**PR:** https://github.com/brycejmurrin/f1-game/pull/3643 (#3643)  
**head:** `7b20d2ede`  
**CI:** run https://github.com/brycejmurrin/f1-game/actions/runs/39934696112 (draft/fast; needs run-ci for full green)  
**fleet:** D / orchestrator: D  
**NEVER MERGE** — MERGE-HOLD: DAD merges

## Finding

SAVE & FIT in `setup-sheet.js` always mints `custom_<ts>` and only calls
`invalidateDecalTextures(team, true)` (draft keys). The new id cache-misses;
`schedulePlayerHiRes` uploads a 2048×2560 (~26.7 MB) atlas while the previous
fitted id's atlas stayed in `_decalTexCache`.

Prior W22h (bc-64edf996) BLOCKED needing `js/car/car-draw.js`; DAD UPDATE made
it OWNED. `setup-sheet.js` / `tlx.js` remain FORBIDDEN/HELD — fix is entirely in
`car-draw.js`.

## Fix

`dropSupersededFittedAtlases(team)` in `js/car/car-draw.js`: on player
`getCarDecalTexture`, drop every non-draft atlas for that team whose key is not
under the current `G.getLiveryId`. Skips while a draft is live so CANCEL still
keeps the saved 2048.

## memSample (stubbed CarDraw VM — same path as the bug)

| step | livId | textures | texMB | notes |
|---|---|---|---|---|
| garage open + hi-res | default | 1 | 26.67 | baseline |
| warm after 3 draft edits | default (draft) | 2 | ~33 | saved hi + draft prev |
| SAVE & FIT settled | custom_\<ts\> | **1** | **26.67** | old hi disposed |

**Before fix (prior agent sim):** settled at textures=2, texMB=**53.33** (hi@default + hi@custom).  
**After fix:** settled at textures=1, texMB=**26.67**; `hi@default` in `freed`.

Evidence: `artifacts/logs/w22h-memsample.json`, `node --test tests/unit/livery-tex-dispose.test.mjs` → 3 pass.

## Test

`tests/unit/livery-tex-dispose.test.mjs` — SAVE & FIT dispose, CANCEL preserve,
repeated SAVE & FIT no stack. Registered in `tests/groups.json` + gen outputs +
`tests/data/impact-map.d/w22h-livery-tex-dispose.json`.

## Not touched

`js/garage/setup-sheet.js`, `js/render/three/tlx.js`, ratchets, `impact-map.json`
hand-edits (gen only), FORBIDDEN paths.
