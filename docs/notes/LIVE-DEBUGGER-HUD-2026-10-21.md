# Live debugger — HUD / menus / input (B·H28, 2026-10-21)

Lane: phone HUD, menus and input at 844x390 touch. Branch `cursor/live-debug-hud-1-a7k2`.

| id | file:line | severity | verdict | evidence |
|---|---|---|---|---|
| H28-1 | tests/specs/menu-traversal.spec.js:350 ("pause menu + DISPLAY page") | low | BY-DESIGN (box budget, not a product bug) | Local SwiftShader, `--repeat-each=3`: 3/3 hit the 120 s test timeout (twice parked in `openPause` at :371, once in `walk`'s rAF settle at :156). A rerun with a 20 s cap on that wait never fired its catch: the 120 s budget was already spent before :371, so the race boot + track build dominates here (spec-timings: ~25–52 s on llvmpipe). A bare boot, `race("bahrain")`, `park`, `headless(true)`, Escape opens the pause menu in under 0.1 s (`hidden:false`, top `pausemenu`). No 5 s wait reproduced; `waitWhereChanged`'s 5 s default (:175) is the only 5 s wait in the spec and its `where` key changes on every Escape/B. |

Not yet hunted: angles 1–4 (HUD clipping at 844x390/932x430, tap-target floor vs title fit, one-step title BACK, settings persistence). Angles 2 and 3 need Bryce's call before shipping.
