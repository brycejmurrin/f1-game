# 1356 browser evidence
Taken at 844x390, touch, SwiftShader, on cursor/bh1-game 6e5526dce (window.__apexFullIntro = true so the automation gate is off). Phase read from #loading data-phase + __apex.garageCam().

| file | proves | result |
|---|---|---|
| gp-1-garage-driveout.png | menu GP: garage drive-out plays first (phase=garage) | PASS |
| gp-2-card.png | menu GP: race card raised only after the drive-out (phase=run) | PASS |
| gp-3-flyby.png | menu GP: flyby follows (phase=run, +9 s) | PASS |
| tt-1-garage-driveout.png | time trial: garage drive-out | PASS |
| tt-2-card.png | time trial: session card after it | PASS |
| tt-3-flyby.png | time trial: flyby | PASS |
| quali-0-sheet.png | qualifying sheet (DRIVE button) before the start | n/a |
| quali-1-garage-driveout.png | quali DRIVE: garage drive-out | PASS |
| quali-2-card.png | quali DRIVE: card after it | PASS |
| quali-3-flyby.png | quali DRIVE: flyby | PASS |
| restart-skip-straight-to-grid.png | pause RESTART: straight to the grid (state=count, no loading phase, no garage, no flyby) | PASS |

Not shown here (probe lines only): DAILY, quali TO THE GRID, Hub JUMP IN lap 1, season NEXT RACE, RACE AGAIN / TT TRY AGAIN, automation, headless/hidden = PASS. Designer TEST DRIVE = FAIL (js/editor/designer.js:2200 calls G.startRace directly). WATCH / HIGHLIGHTS / JUMP IN startLap>1 skip the drive-out but still play card+flyby (by design).
