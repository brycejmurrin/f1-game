VERDICT: KEEP (do NOT fold into tune-physics); FIX the determinism step (SKILL.md:31-36)
Slice: skill game-feel (SKILL.md 51 lines, references/workflow.md 46, feedback-recipes.md 81). Ran: Read/Grep/ls only.

CLEAN: every js/ path named exists (game.js, vantage.js, particles, skidmarks, body-attitude, governor, audio/engine, wall-clamp, consts, hud, select-screen);
both VM tests and tests/data/physics-baseline.json exist; KERB_SHAKE 0.22 / KERB_CUE_HOLD 0.10 match consts.js:174,178;
`addShake(0.1 + incidence*0.3)` = wall-clamp.js:141; hitStop `impact*0.015` = game.js:4782; `simTime = dt*0.15` is really `dt - held*0.85` (8537) = same 0.15x effect;
kerb block game.js:5647-5657 matches (rumble 70 ms, vibrate/rumble 120 ms). Description 276 chars, third person, WHEN + exclusions.
Siblings named (tune-physics, playwright-probe, input-controls, f1-animation-cameras) all exist.

FOLD JUDGEMENT (pass3 S4, skills-a-l.md:26): REFUTE the fold.
- tune-physics already carries the hand-off twice: description "Shake/juice -> game-feel" (SKILL.md:3) and body :78-79. The arrow exists; folding adds nothing there.
- game-feel holds procedure tune-physics has zero room for: kerb-vs-kickup trap (workflow.md:11,14), the haptics path (game.js:4793-4794, 5657:
  Input.vibrate/rumble), the single sim-slowing hitStop exception and render-hold alternative (workflow.md:38-44, game.js:8528-8540), RNG isolation,
  trauma/easing/tiers/accessibility (feedback-recipes.md, 81 lines). tune-physics is 79 lines of knob tables; adding ~130 lines of juice would blow its focus and
  lose the description-level routing for "shake / hit-stop / kerb feels flat" prompts (tune-physics' trigger words are understeer/grip).
- Cost of keeping: 276 chars of 1,536 budget. Cheaper: trim description to ~200 chars, not a merge.
- Collision: audio-debug.md:3 already says "punchier audio polish ... (game-feel)"; camera-lag is named in game-feel, tune-physics and playwright-probe (pass3 S10). NOT FIXED.

WALKTHROUGH ("kerb hits feel flat, add punch, no physics change"): description routes right. Map -> kerb row workflow.md:11 gives consts + throttles + the PHYSICS warning lines: good.
Stuck at SKILL.md:31-36: step 3 "prove determinism" runs physics-characterization-vm + player-dynamics-vm, which check the committed physics baseline / player SHAPES
(physics-characterization-vm.test.mjs:157 "reproduces the browser baseline number for number"). They exercise the player model only, NOT cosmetic state touched by shake/FX/hit-stop
and not a race hash. The skill never says "race hash before == after".

DETERMINISM QUESTION: the promise "must NOT change physics or determinism" (description + SKILL.md:8-12) names no VM race hash. Nearest real tests, unnamed:
tests/unit/determinism-replay-vm.test.mjs (same seed replayed twice, AI finishing ORDER; ~20 s, runs in test:game-vm) and tests/specs/agent-determinism.spec.js (browser).
Only these catch RNG/state leaks from FX code into the AI (the 2026-09-08 incident, determinism-replay-vm header :6-12). Add them to step 3, plus a worker-run before/after
`obs()` compare when touching feel.hitStop (workflow.md:23-26 says compare sim vs wall time but gives no command).

PATHS: OK (all exist). COMMANDS: stale/wrong -> SKILL.md:36 `test-bg.mjs physics-core` runs a WHOLE browser group (test:physics-core = debris, longitudinal, offtrack, physics-*, pit-lane,
race-control, world-physics: groups.json:2339-2349), contradicting "spec ... once" and AGENTS.md table ("prefer single specs"): use `npm test -- tests/specs/physics-characterization.spec.js`
or remote-group. "~3 s" for both VM tests is unmeasured. Anchored tests are fine.

STRUCTURE: 51+46+81 lines, no line anchors (symbols grepped, good; workflow.md:10 "Lines drift"). workflow.md:21-26 "Workflow" section mostly pointer, fine. No CAPS bloat.
feedback-recipes.md:80 says "Expose accessibility through existing settings UI": reduce-motion already exists (game.js:940-947 motionReduced/camComfort; vantage reduceMotion
at 7350 gates kerb shiver) - recipe should say to read camComfort()/motionReduced(), and workflow.md:46 "ignoring reduce-intensity" should name it. Note feel.shake is NOT gated by
camComfort in the kerb cue (game.js:5654) - unverified whether render applies it (UNREAD). Phone/Bryce: haptics via Input.vibrate matter on iPhone (Safari has no navigator.vibrate) -
skill never says so; verify with input.js haptics before promising kerb rumble on the phone.
ENFORCEMENT: baseline "never regenerate" (SKILL.md:35) is repeated in the VM test header (:12) and protect-rules; keep one pointer. Nothing in a hook stops FX code reading Math.random in updateCar.

GAPS:
1. SKILL.md:31-36 - replace `test-bg physics-core` with the single spec; add determinism-replay-vm.test.mjs (and agent-determinism.spec.js) as the named race-determinism check. [NEW]
2. SKILL.md:3 - drop "haptics" ambiguity vs input-controls (rumble mapping) and shorten to ~200 chars; keep the skill. [STILL OPEN S4 as REFUTED fold; S10 camera owner]
3. feedback-recipes.md:76-81 / workflow.md:46 - point at motionReduced()/camComfort() (game.js:940-947), state iPhone haptics reality. [NEW]
OUT OF SCOPE: docs/notes/system-audit-3/skills-a-l.md:26 - S4 fold proposal (refuted above); README.md skill table row for game-feel (UNREAD).
