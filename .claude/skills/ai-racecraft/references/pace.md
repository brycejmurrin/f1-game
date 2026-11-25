# AI pace (scripted vs catch-up)

Loaded from the ai-racecraft SKILL.md when the complaint is the FIELD's overall pace or a
rubber band, not how a car races.

`js/physics/ai-band.js` owns the gap-to-player catch-up band. **Default is
`scripted`**: vmax = `tierV × skill × DIFF.ai` (± `pacePhase`), no boost from
the player's gap. Opt-in `catchup` restores the legacy reverse-only rubber
band (`DIFF.band`, start + lapping gates). Setting: Race Settings › FIELD ›
AI PACE (`apex26.aiPace`). Do not edit `DIFF.*.band` literals here.

Pins: `node --test tests/unit/ai-band.test.mjs`; profile: `node tools/check/ai-race.mjs band`.

HARD's corner ceiling (`AiDrive.diffCorner`): a level's `corner` above 1 lets it corner past the AI envelope, up
to sqrt(`PLAYER_GRIP`) (the player's own); HARD sits there. Pin: `node --test tests/unit/ai-difficulty-pace-vm.test.mjs`
(per-level lap ratio vs a player-envelope reference); evidence `docs/notes/AI-HARD-PACE-2026-11-25.md`.
