# PR #3763 review: A·R3 (Fleet A), verify and test only

- PR: #3763 (Fleet E/Codex), `cursor/sol-deep-fixes-24-e8b1`, head `25ac0d2e7`, unchanged through the review.
- Date: 2026-10-25, about 21:00–22:00 PT.
- Merge: `git merge-tree` against deploy tip `616bd85` writes a clean tree, no conflicts. The branch is 10 commits ahead of the tip and 36 behind.

## Browser groups (remote-group.mjs → browser-group.yml, llvmpipe)

Every group that had not been run before: 9/9 passed, 0 failed shards.

| group | verdict | run |
|---|---|---|
| physics-core | passed 4/4 | https://github.com/brycejmurrin/f1-game/actions/runs/40269486729 |
| car | passed 4/4 | https://github.com/brycejmurrin/f1-game/actions/runs/40269490016 |
| circuits | passed 4/4 | https://github.com/brycejmurrin/f1-game/actions/runs/40269493967 |
| hooks | passed 4/4 | https://github.com/brycejmurrin/f1-game/actions/runs/40270218383 |
| input | passed 4/4 | https://github.com/brycejmurrin/f1-game/actions/runs/40270221919 |
| modes | passed 4/4 | https://github.com/brycejmurrin/f1-game/actions/runs/40270225578 |
| net | passed 4/4 | https://github.com/brycejmurrin/f1-game/actions/runs/40271399865 |
| tiny | passed 3/3 | https://github.com/brycejmurrin/f1-game/actions/runs/40271403755 |
| ui | passed 4/4 | https://github.com/brycejmurrin/f1-game/actions/runs/40271407539 |

Still not run: phone or real-iPhone performance. No device test of iOS data-channel delivery after the app is backgrounded (affects M1 and M2).

## Code review

Six code-hunter slices plus a physics-contract audit, then two finding-verifier passes, 15 claims in all:
- a: career/store
- b: race/pit/tyre
- c: track worker/render
- d: build/deploy/tools
- e: net
- f: data/sw/ghost/camera/audio

Clean slices:
- **Career atomic saves and Daily car cache (a):** no findings. 130/130 unit tests pass.
- **Physics contract:** no new curvature or racing-line read, no `xOn`, no PACE literal, no new Math.random or Date.now in sim code.
- **Track-worker transfer, stale-build, and GPU dispose paths (c):** clean.
- **Minifier (d):** worker output is byte-identical to the serial path (559 files).
- **Deploy (d):** every gate step is awaited.

Unit tests run by reviewers: 130 + 29 + 170 + 31 + 13 + 281, all pass.

### CONFIRMED findings, ranked (all introduced by this PR)

**Medium**

- **M1 · `js/net/transport.js:752-788`, called from `:547` and `:799`.** `listenRestart` starts `answerRestart` on a healthy link. `NetNostr.directExchange` expires after 12 s (`nostr.js:396`), and "expired" re-listens with no backoff. Result: about 7 relay WebSockets every 12 s for the whole session (about 1,000 over a 30-minute race) on every guest and phone-pad. This drains phone battery and data, and risks relay per-IP rate limits that would then block a real ICE restart. The test courier never expires, so the tests miss it.
  - Fix: listen only after a down or one-sided-outage cue, or hold one long-lived subscription, with backoff on "expired". Add a test with an expiring courier.
- **M2 · `js/net/netplay.js:1342-1354`.** The host sends one reliable STRATEGY event per AI car, retired and finished cars included, to each guest every second. The guest's `EVENT_INBOX_CAP=256` (`transport.js:444`) overflows into `shutdown("overflow")` (`:560-564`) after about 13 s without pumping with about 19 AI. This is less than the race's 25 s grace, so an iPhone app switch can drop the guest. The PR's own comment at `:1326-1328` names this hazard.
  - Fix: one coalesced event per second, or send on phase change and `peerArrived` only, skipping retired or finished cars. Add a VM test with a guest that does not pump for 15 s.
- **M3 · `js/data/api-transport.js:227`, `:371`.** A 429 with `Retry-After` over 90 s stores the full window in `lane.pauseUntil`. Later requests on that provider re-wait in 90 s chunks inside the serialized queue, so the picker, LIVE, and telemetry spin "loading…" until the server deadline. They never reach the stale fallback (`:425`) or the RETRY button. This contradicts the module's own rule at `:15-16`, and `data-api-status.test.mjs:1330` asserts a 30-day hold.
  - Fix: when the remaining pause is over `RETRY_AFTER_MAX_MS`, throw a 429 so the request falls back to stale data or RETRY.

**Low**

- **L1 · `js/net/netplay.js:259-263`, `:296`.** An invalid stint entry makes `strategyLog` return null, and the sender sends `tyreLog: []`. The receiver overwrites its log, `compoundShort([])` is true, and the car gets a wrongful one-compound DSQ. The mechanism is confirmed; the trigger (`real-race.js:606` with `lap1` undefined) is unproven.
  - Fix: omit `tyreLog` when it is invalid.
- **L2 · `js/net/netplay.js:297` with `race-control.js:66-71`.** A guest STRATEGY carrying `compoundShortAtFinish:null` overwrites the boolean the host froze at the flag. The window is narrow, and the fallback is the pre-PR behaviour.
  - Fix: never let null replace a boolean once `c.finished`.
- **L3 · `js/race/pit-lane.js:1208-1210`, `:1551-1556`, and `engineer.js:399`.** With the flag-time freeze, a final-lap second-compound stop at a box after the line can no longer count. The AI stays armed and the HUD still says pit. Logic only, not run.
- **L4 · `.githooks/pre-commit:87-118`.** On `git commit -a`, the auto-raise ratchet fragment is staged into `index.lock`. A guard failure rolls that back, leaving the fragment untracked. Every retry `-a` is then refused until a manual `git add`.
- **L5 · `.githooks/pre-commit:63`.** `require_index_worktree_match` now runs before docs-only and pathspec commits, so they are refused when an unrelated tracked file has unstaged edits. This is a behaviour change; confirm it is intended.
- **L6 · `tools/mcp/job-admission.mjs:44-45` and `apex-extras.mjs:774`.** If `release()` throws, the admission epoch stays held by a live MCP server, and every other owner gets "another owner is admitting a job" until the holder starts another job or exits.
- **L7 · `tools/desktop/minify-worker.mjs:44-47`.** The Worker is created without `execArgv`, so it inherits the parent's flags. Under `node --input-type=module -e` every worker dies. Reproduced by hunter (d). This does not affect `pages.yml`.
  - Fix: `execArgv: []`.
- **L8 · `js/track/build-worker.js:153-157`.** The 64 MiB budget charges `pos/3*60 + idx*64` bytes, about 4–8x the measured real extra payload. Hunter (c) measured this in a VM: vegas estimates 38.5/29.3 MiB against 7.3/5.6 actual. Vegas's second prop record is refused and prepared on the main thread in 8 ms slices, adding frames to a track switch on iPhone. It is conservative, so no OOM risk.
  - Fix: charge the real attribute and index bytes.
- **L9 · `js/data/hub.js:774`.** Picker RETRY removes its own focused button, so focus falls to body.
- **L10 · `js/car/input-ghost.js:326`.** A corrupt packed ghost is never purged except by LRU. It needs pre-existing corruption.
- **L11 · `js/car/ghost.js:272`.** A failed or non-durable ghost write re-arms with no cap, so every later flush (pause, results, visibility) repeats trim, stringify, and setItem. Not a hot loop.

Refuted: `setup-camera.js:130` hullKeyOf. "none" also changes geometry (`car3d.js:1937-1940`), so keying on the full string is conservative. It is a minor perf cost only.

## Recommendation

**Merge after fixes.** Every browser group is green and the core of the PR (atomic saves, tyre freeze, mesh prep, minifier) is sound.

Before merge, fix M1 and M2: both are multiplayer regressions this PR introduces that hit Bryce's phone path. Fix M3, or at least cap the pause so the stale fallback is reached. L1 and L7 are one-line fixes worth taking in the same push.

L2–L6 and L8–L11 can follow up. After the fix push, re-run `net` and `ui`, plus the tooling-fast floor.
