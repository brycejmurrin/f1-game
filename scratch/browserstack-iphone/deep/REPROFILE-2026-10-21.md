# Apex iPhone 15 re-profile — BLOCKED (BrowserStack minutes exhausted)
Attempted Thu Oct 22 2026, ~1:40 AM PT.

- Live build `apex-sha` = **9f9db7fc**, 49 commits ahead of 2ec3877b (so #3478 ULTRA cap, #3485 voice deferral, #3486 physics step are all live).
- plan.json before start: Free plan, 0 sessions running, 0 queued. Started both planned runs (`REP=post node deep.mjs race:monza:default:medium:soak=150` and `REP=post node deep.mjs ui`).
- Both failed at session creation with `WebDriverError: Automate testing time expired.` No data collected, no session left running. Logs: log-r2-race.txt, log-r2-ui.txt.
- The Free Automate allowance (~78 min used earlier + previous suites) is used up. Re-profile needs more minutes (plan upgrade or allowance reset) before it can run.
- Baseline for comparison is unchanged: RANKED-FIXES.md. Harness is ready (~6 min total).
