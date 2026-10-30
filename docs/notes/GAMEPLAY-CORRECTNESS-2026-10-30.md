# Gameplay correctness investigation

Base: `7c6d11c68ad8fd670ee2a882d53bb2eec50c548b`, fetched from `origin/claude/f1-game-project-26h3ng`. Isolated branch `cursor/gameplay-correctness-8d4a`; shared checkout preserved.

## Ownership and data flow

Session entry resolves configuration and builds the grid; qualifying supplies the weekend order. Countdown releases fixed simulation ticks. The player integrates authoritative world coordinates; track coordinates are a readback. AI consumes tick snapshots and the AiDrive planner/actuator envelope. PitLane owns stop state and compound service; TyreModel records stints. RaceControl owns cautions and finishing eligibility. At completion, endRace captures flag-time weather/suspension before resetting them, closes stints, applies sporting sanctions, classifies the field and assigns positions. SeasonCal awards standalone rounds; Career.scoreRound owns career points plus economy/save settlement. Results and RaceCeremony consume the classification afterward. Ceremony presentation does not award points. Subsequent session entry builds a new field.

## Reproduced and fixed

- Dry 10-lap Monza, REAL tyres, player retires, red flag, pause, SKIP TO RESULTS: live one-compound rivals received 0 seconds rather than 30. The actual pause handler regression failed before and passes after allowing suspended races through the compound gate without a finisher. Retired player remains exempt. Red flag is staged through the structured caution seam.
- Calling the real completion boundary twice advanced season and career from round 0 through round 2 and added another ledger row. The regression now preserves the entire serialized outcome after the first call. This is a boundary idempotence reproduction, **not** a reproduced duplicate delivery by ordinary UI/network traffic. Completion accepts race/count only, retaining replay completion during countdown.

Rule grounding: FIA 2026 Sporting Regulations Section B Issue 07, article B6.3.6: https://api.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_b_sporting_-_iss_07_-_2026-06-25.pdf (retrieved and text checked this session). Suspended races that cannot restart receive 30 seconds instead of disqualification for this breach.

## Investigation limits

Physics worker: 53 existing tests passed; poisoning curvature to -0.5/0/+0.5 over 30 identical seeded unassisted ticks produced bit-identical own-state outputs. AI worker: initial 42 strategy/pass/queue tests passed. No new handling or AI defect reproduced. The track-frame comment before updateCarBicycle is stale; actual integration is world-space. No balance, assists, PACE, fixed stepping, garage or shared G-contract changes.

Current mechanics plan is shipped; reviewed damage PR #3970 (merged, opt-in), ERS #3981 (open), and career #4015/#4143 (merged). EndRace-only ownership coordinated on open overlapping PRs #4262 and #3981. Broad multiplayer, full-season and device coverage remains outside the bounded checks; exact final verification belongs in the PR hand-off.
