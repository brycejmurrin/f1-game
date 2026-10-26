# Verification of pass-3 items 21–30 (tip 7dd2e82f3) — finding-verifier (turn-capped; saved by main). refuted 0/10

- 21 CONFIRMED (+): ratchets.test.mjs full `measure()` at :13, :35, :130, plus autoRaise() :136 → ratchets.mjs:574 (a 4th) and :93 every
  TREE_METRIC; measure() has no memo (ratchets.mjs:423-445) → 4+1, not three. .githooks/pre-commit:55 measures again (--auto-raise).
  ratchets.test 68.0 s (tests/data/tooling-fast-timings.json) / 98.1 s (audit2b log); guards 43 files = 186 s. Full runs 1214.7 s and
  1234.9 s; AGENTS.md:57 "2–15 min". Six sweeps = 531 s committed (357 s local) and not in test:sweeps; 4 test:sweeps files ALSO run in
  tooling-fast. 43 import parts-sweep (as claimed); ~117 import lib/game-vm (not 14). Fix right; memoise measure() per process first.
- 22 CONFIRMED: pr-snapshot.mjs:60-70 synchronous transport, no concurrency; pr-board.mjs:294-327 2–5 serial calls per PR (+needsSync per
  SYNC/FIX row :405). Timing not re-measured. Pool of 4–6 sound.
- 23 CONFIRMED: bash-guard.sh python3 :75 on every call; with a trigger word python3 :121 :135 :306 and git :186 :191 → 4+2. Not re-timed.
- 24 CONFIRMED: AGENTS.md 200 lines, 29 > 160 chars. Descriptions 10,217 chars (claim 10,389, ~2 % high). Orchestrator read set 79,938 B.
  settings.json has no `Skill` matcher; session-transcript tallies tools, not skills.
- 25 CONFIRMED: launch-lane.mjs:93 twin = same fleet+lane tags → every lane:owner collides. `fleet-bus watch` exists (:36, :498) but
  orchestrator.md:35-36 still prescribes Monitor over `read --strict` re-armed every 30 min (doc swap). "Odd minute" already at
  orchestrator.md:44. $ figures not verified.
- 26, 27 NEEDS-MORE (no Actions API calls made; eval data not checked).
- 28 CONFIRMED (skill count PARTLY): test-bg.mjs:234-263 positional groups only; spec path fails :525; forwards only workers/--last-failed
  (:443). AGENTS.md:44 "test-bg.mjs stays for one spec" wrong as written. Explicit one-spec asks: tune-physics:52, race-weekend:62,
  ui-menu-a11y workflow:54, race-incidents-control workflow:77, AGENTS.md:41/44; season-mode:32 and scenery-dress instancing:31/84 run
  the whole group for one spec; no matching line in multiplayer-debug; renderer-debug:85 only mentions a spec.
- 29 CONFIRMED: ship/SKILL.md:24 ready-gate without --wait; no wait-for --merged; no two-call commit. steward has all three (:149 :154 :160).
- 30 CONFIRMED: steward/SKILL.md:98 lacks --timeout/--failures-only; ci-watch.mjs:80 DEFAULT_TIMEOUT_MIN=120.

## Leg 2 (verifier v4b, 17:25Z) — items 26, 27
- 26 PARTLY: fleet.yml since 10-19 = 1,084 runs: schedule 45 (cron "23,53 * * * *" → ~370 expected, 12 %; claim confirmed) but
  workflow_dispatch 1,039 (who-is-on-it/fleet-bus dispatch) → the board refreshes ~135×/day anyway; dropped crons cost nothing.
  10-26 dispatch page: 83 ok / 4 failure / 13 cancelled. ci-cancel-on-close 628, merge-attribution 216, spec-timings 572 = 1,416 runs
  (~184/day; 207 on 10-26 by 17Z), newest 100 each: 0 failures. Routines (list_triggers): "Apex Fleet Board hourly refresh"
  trig_01SbgX9JrMK3yx1fW7GVdWt3 since 10-19, fired 16:51Z — duplicate confirmed. FLEET BUS WATCH trig_01ANsLrvbDGnMapUzqRYmnVL was
  created 14:48Z TODAY (Sonnet, :48); 0 bus lines from claude:fleet-bus-watch, but it posts only on ABSENT by design, and step 2 keys
  on `ORCH <X> LIVE`, so D (never LIVE) is never watched. "$4/day, never posted" premature; blindness to D is the real defect.
  Fix: cut the board routine (right); keep fleet.yml cron as backstop; bus-watch should fall back to last DONE sender like `who`.
- 27 CONFIRMED (date PARTLY): skill-routing-eval.py:2,22 header 2026-09-30, baseline 214/216; a later number exists —
  SKILL-TOOLING-PROPOSALS-2026-10-05.md:182 "213/224 under load". Fixtures now 348 queries in 37 files, 0 with expect null.
  :110 `claude -p` with no --strict-mcp-config; results written once at :266. Pilot pilot.json: 33 rows, 30 correct / 3 none /
  0 wrong (misses are no-skill, not misroutes). Fix right.
