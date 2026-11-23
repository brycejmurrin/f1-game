# R2 Opus hunt: js/physics, js/car, js/race
F1 low bug js/physics/player-forces.js:190-196 (+ wheel-state.js:256) — with WheelState ON, flatSpot + lock rumble follow the old heuristic lock, not κ (WheelState overwrites wheelLock after). Fix: under useWheel, step flatSpot/haptic after stepPlayer. CODE-TRACED
F2 low perf js/physics/wheel-state.js:192-194 — axleStep builds 2 closures per call (~240 allocs/s). Hoist to module scope. CODE-TRACED
§Physics: no violation. Not covered: all js/car, most js/race, ai-drive/collide beyond 04bd3d6b diff.
