# Live-debugger race weekend hunt — 2026-10-22 (fleet A, slot A·H1)

Lane: the race-weekend simulation in `js/race/**` (not `race-insights.js`).
Prior art: agent prior-art-scout over `docs/notes/DEFECT-LEDGER.md`, `docs/BUGS.md`,
the `LIVE-DEBUGGER-RACE-*` and `BUG-HUNT-*` notes and `git log -- js/race`; no
row below repeats a KNOWN item.

Rules checked against the FIA 2026 F1 Sporting Regulations, Section B, Issue 07
(https://api.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_b_sporting_-_iss_07_-_2026-06-25.pdf)
and the 2026 F1 Penalty Guidelines
(https://www.fia.com/sites/default/files/2026_f1_penalty_guidelines.pdf).

## Findings

| id | file:line | severity | verdict | evidence |
|---|---|---|---|---|
| R1 | `js/race/sporting-regs.js` createPassWatch, owed-debt drop | MED | CODE-TRACED → fixed | A place gained under SC/VSC from a HEALTHY car stays owed if that car is then stricken (beached, mid-incident, being rescued: game.js `stricken`). The debt dropped only for `exempt` (pit / retired / finished), so the player had to wait for a stuck car or take +10 s. The same predicate already makes passing a stricken car legal (B5.12.2(c), B5.13.2(c); the Penalty Guidelines charge a place *kept*, which needs a car to give it to). Fix: drop the debt on `fair()` (exempt OR troubled). Test: `tests/unit/sporting-regs.test.mjs` "a passed car that is then stricken … drops the debt" — fails on the deploy tip (penalty event), passes with the fix. |
| Q1 | `js/race/quali-net.js` onPeerQuali `mine` | MED | CODE-TRACED → fixed | Friend-race qualifying with every lap deleted (`qualiCut`, `lastLap` 0): endRace and q-sim give the player NO TIME (`driven(Infinity)`), but a rival's QUALI event arriving afterwards re-simulated with `mine = 0`, so `driven()` left the player out and quali-model handed back a MODEL lap — the deleted lap could take pole, and the two peers' grids disagreed (rival: NO TIME). A driver with no valid qualifying time starts from the back. Fix: the same `qualiCut ? Infinity : 0` fallback endRace uses. Test: `tests/unit/net-lobby-friend-quali.test.mjs` "a rival's lap arriving after ours was deleted …" — fails on the tip, passes with the fix. |
| P1 | `js/race/pit-lane.js` update() disarm guard | MED | CODE-TRACED → fixed (#3503) | A lapped AI still owing its second dry compound had its armed stop cleared once the LEADER took the flag (the `!owesCompound` exemption covered only its own final lap); think() never re-arms after `flagNow()`, so endRace's `applyCompoundRule` disqualified it (B6.3.6). Exemption now covers both clauses; the read uses the per-step `flagNow()` memo. Test: `tests/unit/pit-lane-vm.test.mjs` "a LAPPED AI that still owes … (A·H1 P1)" — fails on the tip, passes with the fix. |
| P2 | `js/race/pit-lane.js` aiClassFor | LOW | CODE-TRACED → fixed (#3503) | In the box before the fit `pitStops` already counts the stop; `seq[pitStops + 1]` read one slot ahead, so a tread flip back to dry mid-stop fitted the stop-after-next's class. Same slot expression as pickFor/nextCode. Test: "an AI in its box before the fit … (A·H1 P2)" — fails on the tip, passes. |
| P3 | `js/race/pit-lane.js` left-the-window branch | LOW | PLAUSIBLE, not fixed | A car leaving the window mid-box keeps an unfitted stop counted; reachable only via a teleport outside the red-flag path (clearArm covers the red flag). |

## Traced and cleared (not findings)

- RaceControl.classify: laps first, 90 % cut (`floor(0.9 · winner laps)`), retirements capped at the flag lap.
- lineTransition backward undo/recross, finishDelay penalty wait, shortRun with DSQ cars.
- Red-flag procedure: STOPPING 8 s → HELD 6 s → one restart request; `suspended` (level 4 at the flag) prices B6.3.6 at +30 s, not a DSQ.
- Two-compound rule: judged on the weather at the flag; any I/W set lifts it; retired cars not judged; ≥ 8 laps, not a sprint (BY-DESIGN, KNOWN 2026-10-17).
- Blue flags (per-lapper hold, one penalty per spell), jump start (throttle at green / launch inside 0.2 s), start lights, reliability arm, weather arc / rain cells / forecast algebra.
- PLAUSIBLE only, not filed: `RaceControl.setEnabled(false)` resets storm/scripted holds; whether CAUTIONS can toggle mid-race is unconfirmed.
