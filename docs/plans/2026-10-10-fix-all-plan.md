# Fix-all plan — bug hunts 1 + 2 and the launch sequence (2026-10-10)

Owner: session `claude/code-review-bug-hunt-mkrcf5`. Registers: `2026-10-09-bug-hunt-plan.md` (hunt 1, 75 rows,
every kept row already fixed on a batch branch) and `2026-10-10-bug-hunt-2-register.md` (hunt 2, 31 bug rows,
10 perf, cleanup census). Ship tip at writing: `928e21146` (#1298). Every fix lands by PR into the ship branch;
nothing is pushed there directly.

## Goal
1. Every solo "my racing" start plays the garage drive-out, then the race/session card, then the flyby and
   announcer: menu GP / one-off, time trial, qualifying GRID and DRIVE, season / career NEXT RACE, DAILY,
   Data Hub JUMP IN, designer TEST DRIVE. **Unchanged by decision (Bryce, 03:30Z):** pause RESTART, results
   RACE AGAIN / TRY AGAIN (TT retry included), WATCH / HIGHLIGHTS, automation (`LoadingScreen.isAutomation`,
   #1294/#1298), headless / hidden pages, online play, `__apex` hooks.
2. Land every verified row of both registers, batch by batch, each batch one ready PR.

## Where things stand (03:45Z)
| piece | state |
|---|---|
| Integration branch `claude/code-review-bug-hunt-mkrcf5` | = ship `2628dae2b` + hunt-1 batches + game batch (3.14) + 2 gate fixes; `96b71ef26`, pushed; **behind ship by #1298** (automation gate) |
| Gate `deploy.mjs --gate-only` on `96b71ef26` | **running** (`artifacts/logs/gate.log`; first run failed on 2 unit files, both fixed) |
| Hunt-1 batch branches on origin | persist, boot, editor, ui, media, race-phys (`cursor/bughunt-*-88f2`); **game batch not pushed yet** (`cursor/bughunt-game-88f2`, side worktree) |
| Hunt-2 wave 1 (done, in worktrees, not merged) | camera `cursor/bughunt2-camera-88f2` @be71bc988 (H3, H4, H28, P7, dead code); scenery `cursor/bughunt2-scenery-88f2` @5bb18f026 (H1, H26); audio `cursor/bughunt2-audio-88f2` @198e19d2b (H11, H12, H22, H25; H23 patches in scratchpad need an `index.html` edit; H24 was a wrong row); launch audit `worktree-agent-a1f6e28f726c32dd7` @6ef4d1ab9 (tests only: TT/DAILY/JUMP IN already comply) |
| Hunt-2 wave 2 (running) | editor (H7–H10 + TEST DRIVE via `G.raceIntro`), net (H5, H6, H30), ui (H13, H16–H18), race (H14, H19–H21) |
| Not started | xr/boot (H2, P4, H29 — `js/render/renderer-boot.js` is the render session's: coordinate first) |
| Held for Bryce | H15 ERS drain under braking (moves the physics baseline); 10.1 yaw-damp (parked on `handover/bughunt-10.1-speedyawdamp`); 7.7 queue-brake |
| Other lanes | P1/P2 TLX uploads + bake sampling → render session; `game.js` carve-outs (−300 lines) → after the three sessions' PRs merge; `hud-mirror` quarantine; 90 sleep-then-assert specs |

## Steps, in order
1. **Gate verdict** (`= run passed` in `artifacts/logs/gate.log`). Red → fix at the root, re-run. Green → step 2.
2. **Catch up with ship** (`git merge origin/claude/f1-game-project-26h3ng`; #1298 adds `isAutomation` and the
   `__apexFullIntro` opt-in that the launch worker's three new Playwright cases need). Conflicts expected only in
   `tests/data/ratchets.json` (`tools/check/ratchets.mjs --update`).
3. **Merge wave-1 worktree branches** into the integration branch (camera, scenery, audio, launch-tests), apply the
   H23 patches (`scratchpad/h23-panel-and-test.patch`, `h23-index.patch`; `index.html` lines 1862-1869 are outside the
   `@gen-shell` blocks, needs `touch .claude/allow-protected`), run each batch's unit files once more on the merged tree,
   `npm run gen:check`.
4. **Merge wave-2 branches** as they report (editor, net, ui, race), same checks. Any worker report that says "register
   wrong" → strike the row in the register with the reason.
5. **One gate on the merged tree**, background, 2 h cap, then **one browser batch** via `test-bg.mjs` on the specs
   `select-specs` names, capped at the garage/intro set: `garage-out-before-card`, `garage-first-frame`, `quali`,
   `steering`, `real-race`, `season`, `track-designer`, plus `net-lobby` and `camera` for the net/camera rows. A visual
   check of a tecpro circuit (cota / miami) for the tyre-wall colours (`render({what:"view"})` or one shot).
6. **PRs, ready not draft, one per batch, oldest first**, under `ready-full-cap` (0/3 live now) and `ready-gate.mjs`
   exit 0 on each tip: persist, boot, editor, ui, media, race-phys, game (hunt 1); then scenery, camera, audio,
   launch-tests, editor-2, net, ui-2, race-2 (hunt 2). Body from `.github/pull_request_template.md`: Goal,
   `session-status.mjs` output, Verified / Not run (name the groups not run), Next step, the required trailer.
   `ci-watch.mjs --sha <tip>` per PR; red → `ci-red-triage`, fix, push. Never auto-merge; CI Watch merges.
7. **Sibling overlap, before each PR**: #1289 (0ngtr5, 113 files) touches `js/game.js` only among our files; #1296
   touches `results-sheet.js` (our ui 5.4) — read its diff, rebase our row if it duplicates. Claims board:
   `who-is-on-it.mjs --claim` is set for the launch routes; `--release` after the game PR is up.
8. **Follow-ups after the merges**: xr/boot batch (with the render session), `game.js` carve-outs, the sleep→hook
   spec conversions, the hunt-2 perf rows P3, P5, P6 (bit-identical, game.js +3..+6 lines each), H2's VR rows.

## Decisions needed from Bryce
- **H15** ERS battery drains while braking with BOOST latched (human and AI). The fix moves the drain after the
  braking decision; the characterization baseline moves only if a scenario brakes with BOOST on. Land or hold?
- **Mid-race Hub JUMP IN** (start lap > 1) deliberately skips the drive-out ("not your car leaving the garage").
  Keep, or play it there too (one-line change in `studioOpen`)?
- **RACE AGAIN / TRY AGAIN**: read as "restart", left quick. Confirm.

## Verification contract (what "done" means per batch)
- Every row: a unit test that failed on the base commit and passes with the fix (reports name both).
- `node --check` on every edited file; `test:guards` on every commit (hook); `tooling-fast` ⊂ gate green on the merged tree
  once per wave; the browser specs above green or named as not-run in the PR body; no tolerance widened, no test skipped,
  no ratchet raised beyond what the hook absorbs (game.js 9178 → 9194 for 3.14 is the one raise so far).
