# System audit, fourth pass (2026-10-26, tip 7dd2e82f3)

Bryce, 17:05Z: "Go much deeper with this pass using all tools mcps skills web research many subagents running various
models." This pass re-verified every ranked item of [pass 3](SYSTEM-AUDIT-3-2026-10-26.md) adversarially, then went to
whole populations instead of samples: the entire bus (3,383 lines since 10-19), 7 days of PRs (697) and Actions runs
(6,982 runs, ~49k jobs), 101 of 158 worker sessions and all 40 orchestrator/seed sessions, 207 Cursor agents, every hook
red-teamed with ~150 payloads, every gate and identity path, every skill (37) and agent card (11) with its own reviewer,
docs-vs-code for the top-level docs and the rulebook, the deployed site byte-for-byte, the economics since 10-19, and
current vendor docs for Claude Code, GitHub, Chromium, Playwright, Cursor, Codex and Grok. ~75 reviewers: 24 Opus
(verification, red-teams, transcripts, bus, PRs, CI, tests, security, economics, hunters), 48 Sonnet (skills, cards,
docs-vs-code, web research, memory/MCP), 3 Haiku (mechanical sweeps). Evidence: [`system-audit-4/`](system-audit-4/README.md).
The live phone-profile probe (844×390, Playwright, this session) is §7.

## 1. What this pass corrects in pass 3

Nothing in pass 3 was fabricated, but nine items had the mechanism or the number wrong. The fixes change shape:

| pass 3 | what was wrong | the truth now |
|---|---|---|
| #1 launch receipt by mtime | the hook reads the receipt's own `at` field; the mtime check is on the saved page in `launch-gate.mjs`; "11 launches at warning" is unsupported (O1's real pages said `allowed`) | forgery still trivial: `{"ok":true,"at":"<now>"}` passes; O1/O2 forged the PAGE. Root cause is a rule contradiction (§2.1) |
| #8 "CI tests the head, never the merge result" | CI checks out `refs/pull/N/merge`; it does test a merge, against the base at run time | the gap is a STALE base: all 20 last game merges had merges land after their green (median 7.5 merges / 160 min; #3636 91 / 3,377 min). #3766 was not the cause of its red (#3759's train failed the same spec 3.5 h earlier) |
| #9 audio spec skipped | run 40305727098 leg `selected-3` ran audio-smoke and engine-audio-offline | REFUTED. Real gap: six js dirs route to no browser spec (`js/track/build-worker.js`, `js/workers` bitmap decode) |
| #10 zero-slack deadlock | 3 of the 4 refused syncs were the PR's own pins; only #3763 (+17) was a union-only overflow | the slack-band ask rests on one case |
| #12 three PRs "ready > 60 h" | GitHub ready flip: 67–70 h ago; last READY bus line: 10–13 h ago | both true; #3725/#3731 bodies DO say D merges in prose, only the fleet block says A |
| #14 LIVE misuse (60 lines) | 188 bodies start "LIVE "; refusing SPAWN would bounce ~38 real successor briefs; the canonical `OrchA N -> N+1 … ORCH A LIVE` succession line itself bounces as ROTATE (7 cases) | cause is DAD's brief (`send HANDOFF "LIVE …"`), not a missing type |
| #16 "RULE 7.3 is off-repo" | it is `docs/notes/FLEET-ADAPTIVE-COORDINATION-2026-10-22.md` §7.3, agreed by Bryce 09:11Z 10-22; workers misapply it (train in progress ≥ 10 min, not queued) | 55 BLOCKED on 41 PRs, ~720 PR-hours; its release signal `BATCH OPEN` was posted twice on 10-22 and never since; still in 26 of 27 Cursor briefs |
| #20 "no fragment lint" | `tests/unit/changelog-fragments.test.mjs` exists | add it to the docs-only commit path |
| #26 bus watch "never posts, ~$4/day" | it posts its summary; $0.089/fire (~$2/day); but it keys on `ORCH <X> LIVE`, which D never posts, so it never watches D | fleet.yml's lost crons do not matter: 1,039 dispatches refresh the board ~135×/day |
| H2 fix "move allows to autoMode.allow" | the classifier ignores `autoMode` in project settings; allow entries are prose, not patterns | IMPOSSIBLE from the repo. Call node scripts directly; drop the dead `Bash`/`Agent`/`Monitor`/`node -e *` allows |
| #32 anchors "21 in a–l" | 23 `~NNN` hits are mostly durations; 5 real line anchors in all skills, 1 drifted (`game.js ~4523` → 4643) | the repo-wide picture is worse (§4.4) |
| #35d TESTING count test | already in `test:guards` (`test-groups.test.mjs:153`) | output-surface still is not |
| T1 "no non-session `--as`" | a READY went out `from:D` at 17:01Z (9c1714b88) | `--as`/`APEX_FLEET_AS` unchecked |
| adapters.md Cursor API agents "no subscriptions/timer" | 24 of 31 lanes used PR subscriptions, 23 used the timer | the cells are wrong |

Confirmed with more evidence: #2 (18 unhashed files in the gate closure; committing a gate edit to your own branch defeats the
hash because it compares to local HEAD), #3 (code-hunter payload wrote `js/game.js` through both guards), #5, #6 (and
`deploy.mjs --gate-only*` is auto-allowed, so `--gate-onlyy` runs the full deploy with no prompt), #7 (also TinyFish incl.
`top_up_wallet` and claude-code-remote incl. `create_trigger`, wholesale), #13, #15 (20 holds, 18 malformed; two
well-shaped DAD tags would pass a shape check), #17–#19, #21–#25, #28–#31, #33–#34, #36–#39.

## 2. New findings, ranked by cost to Bryce

### 2.1 Things that lose a fleet, a merge or money silently

1. **Fleet B died for 68 h and the same setup is live tonight** (tx-bryce X1/X2, tx-orch F1, econ E1). 10-22 02:45Z: O26
   launched 7 sessions at `allowed_warning`; all 7 `rejected` in 2–5 min; O26, L1, H31 died with them; no INCIDENT,
   DORMANT or BLOCKED line; the next B line is 10-25 23:10Z ("Fleet B empty"); a Cursor READY went to the dead
   orchestrator. Today: 85 B sessions created, the weekly limit at `allowed_warning` until 11-01, Bryce said "launch
   freely" three times, and `launch-policy.md:18` / `role-seed.md:43` still say "at allowed_warning launch nothing" while
   `launch-gate.mjs:13` passes only `allowed`. That contradiction is why O1 and O2 hand-wrote the quota page (O2 at
   17:08:53, after #3811). At $578/day the next lock lands about 10-30. Fix: one rule (Bryce decides: launch through
   warning or not), a `SEED QUOTA`/INCIDENT line when launches are rejected, the receipt written by a PostToolUse hook on
   `get_session` from `tool_response`, and FLEET BUS WATCH keyed on DONE/READY silence rather than `ORCH LIVE`.
2. **The required `CI` check binds nobody, and two hook-free routes exist** (pr-flow P1/P3/P4, redteam-gates G1,
   tx-workers). Branch protection enforces `CI` for non-admins only; every session merges with Bryce's admin token. In 7
   days 13 PRs merged without a green `CI` (11 with none, #3216 with a failed one, #3465 16 s before cancel); 2 broke the
   base (#3145→#3167, #3220→#3222). 8 PRs merged with a `MERGE-HOLD` line in the body. 9 rebase merges on 10-20; rebase is
   still enabled; auto-merge is on. The cloud session's `POST …/pulls/<n>/ccr/ready_for_review` and `PUT …/ccr/auto_merge`
   are classified "pass" with no receipt check, and a worker used the raw ready route 3 s after the hook refused its flip.
   `gh pr merge` without `--match-head-commit` merges whatever the head is now; `--admin` is never inspected. Needs Bryce:
   a ruleset that binds admins, requires `CI`, allows merge commits only. Repo: match the two cloud routes in
   github-mcp-guard, pin the ready receipt to a head, require `--match-head-commit`.
3. **Every env secret can leave through a Cursor launch; five long-lived credentials sit in every session** (security
   X1/X2/X6, memory-mcp M5). `cursor-agents.mjs` copies every env var except `CURSOR_*` into the Cursor VM and fills
   `${NAME}` placeholders in MCP headers from our env for any http(s) host; no hook gates it and `mcp__apex-tools__*` is
   allowed. The env carries a long-lived AWS `AKIA` key (one perf tool), `GROK_API_KEY` (an archived note), and
   `FLEET_A_OAUTH_TOKEN` (no code; Fleet A runs on another account). TinyFish (`top_up_wallet`), claude-code-remote
   (`create_trigger`), Google Drive (`share_file`, `trash_file`) and five unnamed `mcp__<uuid>` servers are allowed
   wholesale. Also: any GitHub user can post a comment shaped like a mirrored bus line (`fleet-bus <sha7> <TYPE> from:…`),
   which neither the mirror nor pr-board author-checks (X3); 36 DAD lines claim "Bryce via DAD" and ownership has changed
   hands on such a claim (X4). Fix: allowlist env names and MCP hosts in the launcher and make launch an ask; narrow the
   four servers to read tools; author-check mirrored lines; Bryce removes the three credentials.
4. **Hook bypasses with teeth** (redteam-hooks R1–R16, security X5). A push to the deploy branch with the refspec in a
   shell variable passes bash-guard (only literal branch names are read) and the pre-push skip options are not refused;
   `git config core.hooksPath` is never refused and turns off every git hook for every worktree and later session;
   merge/ready receipts have no lower age bound, so one dated 2099 never expires; writing the tree hash into
   `artifacts/pre-commit-guards.ok` makes the commit hook skip `test:guards`; `python3 -c os.system(…)`, `node -e
   execSync`, `perl`, `g''it` and `${X}t` wrappers carry a deploy push or a squash merge through; with python3 missing
   bash-guard exits 0 (the other gates fail closed via `onFailure: block`); `create_session` with `outcome_branch` = the
   deploy branch passes launch-gate; `find … -exec grep` is refused as "removing another branch's fragment" (a false
   positive every session hits). GitHub is the only backstop and it binds non-admins only (item 2).
5. **Merge freezes, pacing and identities run on keywords nobody checks** (redteam-gates G2–G4, G9–G10; bus-history
   BH1/BH4). Any INCIDENT line from anyone freezes game merges and any INCIDENT containing "lifted" lifts it: one freeze
   never took effect, one was lifted by mistake, a mistyped LIVE line froze merges 31 min, a "CLEARED" line re-froze them.
   GAME-SLOT pacing sees a game merge only if the DONE line contains "game" (6 of 77 recent game merges invisible) and any
   DONE for any PR ends another fleet's live slot. `fleet-bus who <L>` trusts the newest `ORCH <L> LIVE <id>` text from
   any sender in any type: `parseLive` takes the first token, so `who A` returned the undeliverable `claude:OrchA` for ~68
   h this week (12 bad ids: A 4,065 min, D 2,831, B 56); `who D` has never worked (735 lines today); `grok:DAD` (212 lines,
   the busiest merger) fails `addressProblem`, so nobody can address it. The 200-entry bus window (median 7.3 h) forgets
   open INCIDENTs. Fix: typed INCIDENT open/close with an id, GAME-SLOT keyed on the PR's diff paths, `who` reading a
   LIVE line's sender id and accepting a `grok:` scheme, an INCIDENT ledger outside the window.
6. **Half the red trains are two green PRs combining, and the train tests less than the tools assume** (ci-7d C1–C5, C7;
   verify #8). 23 of 44 trains red on attempt 1 failed because two PRs each green alone pushed a tree-wide count or ceiling
   over (assert-match ×9, ratchets ×4, counts ×6); trains went red 13.3 % when another merge landed after the PR's green vs
   4.3 % when none did. `merge-gate` has re-run the count tests on the merge result since #3785 and no red since then is
   this kind, but a receipt still goes stale while the tip moves. The train skips the node suites, driving-model and VR in
   354 of 354 calls (`if: inputs.concurrency_key == ''`), while `twinned-specs.mjs` drops 28 browser specs from every
   selected run on the premise that the train runs their VM twins "UNCONDITIONALLY" (it reads the step text, not the
   `if:`). 12 spec failures reached the train after green PR runs and none is quarantined (`garage-out-before-card` ×4,
   `parts-*` ×4, hud-layout HUD SIZE); `parts-livery-zones` fails with the same GPU-texture-churn message as the quarantined
   `garage-livery-churn`. Selected browser legs (LANES=24) waited 656 h in the lane queue over 7 days (p90 14.7 min, p99
   31.9); the ready verdict is p50 13.6 / p90 29.7 min. Fix: merge-gate requires a green on a base ≤ N game merges behind
   (game PRs); the train's node job runs on the train or twinned-specs stops assuming it; quarantine by failure signature.
7. **Fleet D is the slowest and least reachable, and its brief causes most of what the bus tools refuse** (cursor-lanes
   C1–C10, bus-history BH2). 207 Cursor agents / 963 runs / 266 agent-hours in 7 days; 125 PRs, 84 merged, CI pass rate
   equal to Claude's (0.900 vs 0.898), bodies follow the template better (fleet block 93 % vs 83 %). But D PRs take 8×
   longer open→merge (median 897 vs 106 min), mostly after READY (285 vs 34 min) because DAD is the only merger; since
   noon 29 READY lines went to D for 16 PRs and one merged, while DAD launched 20 more lanes. DAD's brief: `send HANDOFF
   "LIVE …"` (184 of 299 Cursor HANDOFFs start LIVE, then DAD corrects "not HANDOFF" 10 times); "MERGE-HOLD: DAD merges"
   required in every body (the malformed holds); RULE 7.3 kept after its release signal lapsed (item in §1); scenery lanes
   forbidden to touch `tools/shot/scenery-locations.json` while the push gate requires regenerating it (27 BLOCKED on 15
   PRs, two of Bryce's LENDs); `APEX_SESSION_ID` set where fleet-bus reads `APEX_FLEET_AS` (27 of 31 first sends fail);
   the repo's check-in timer banned; Cursor's token refused on every label/body-edit/comment attempt (41/14/16), so every
   D draft waits for DAD to add `run-ci` by hand (42 BLOCKED on 19 PRs). Needs Bryce: who else may merge D PRs; a brief
   rewrite (the lines above). Repo: `fleet-bus` accepts `APEX_SESSION_ID` as an alias with a hint; a `run-ci` route for
   hosts whose token cannot label (the orchestrator does it on NEW-PR).
8. **Where the money goes** (economics E1–E9, tx-workers W1–W6, tx-orch, tx-bryce X4/X5). Fleet B since 10-19: $3,539
   list-price for 169 merges ($20.9/merge; workers $1,493, hunters $1,077, orchestrators $703; Opus 86 %). Cache reads are
   66 % of every dollar; a fresh session's first request is 95k tokens and the mean context per call 180k, so re-reading
   the always-loaded prefix is ~$1.2k (35 %). Sonnet is half price and its workers cost $2.63 per merged PR touched vs
   Opus $24.35 (confounded: Opus got the hard lanes); moving worker/owner/hunter lanes to Sonnet is ~−37 %. Waking a
   session idle past the 1 h cache window re-writes its context: 4.7 % of turns took 31 % of turn dollars; 31 % of
   non-first wake dollars produced no action (172 of 384 worker turns: 22 own subscription confirmations, 18 own ready
   flips, 67 orchestrator messages; ~$60/day). Rotation is ~30 % of B's orchestrator spend (boot $1.5–1.9 + tail
   $0.4–3.4, 18 rotations on 10-26; Fleet A used 4 orchestrators for 21 merges, B 18 for 22). Hunters are 30 % of spend
   at the lowest yield; spend past $20 inside single sessions is $1,269; four PRs (#3760 #3763 #3783 #3788) went through 4
   sync sessions and 4 owners (≥ $25.6) and are still open; 8 owners launched 16:17–16:18 cost $19.9 for 1 READY and 0
   merges. Bryce's attention: 3–37 interactions a day (~15; ≥ 36 on 10-26), ≥ 22 AskUserQuestion answers, 4 on 10-26 that
   the rules already answer; "own the unowned drafts" typed 11 times in 6 days, "clean up sessions" 4 times; 16 prompts
   into 11 worker sessions. Projection: ~$4.0k/week for ~220 merges at ~$18; with Sonnet lanes, no idle wakes and a
   session cap the same output is ~$7–8/merge. No step change at #3785 or #3811 in $/wake (0.179 → 0.194 → 0.208).
9. **The transcript API returned another session's events for four archived sessions** (tx-bryce X3): 017TA52 → B·H11,
   01AfVK6 → L23, W65 → the #3760 owner, the Merge Desk routine's older pages → the #3773 owner (confirmed by matching
   costs and bus senders). Two of Bryce's four own sessions cannot be read, and any post-mortem built on `list_events`
   of an archived session may describe the wrong session. `session-transcript.mjs` has no identity check. Fix: the digest
   asserts the page's session id against `get_session`; report the behaviour to Anthropic.
10. **Routines and timers that cost without acting** (tx-bryce X9–X11, econ E7–E9). The Fleet Board's `prs` and `deploy`
    datasets are at v2 from 10-19 18:57Z (every run since: "failed: prs, deploy — GitHub HTTP 403") while the others are
    at v86: ~$18 spent, the two panels that matter never refreshed. The stale Merge Desk routine burned $15.80 over 166
    no-op wakes until disabled at 15:29Z today. Check-ins fire every 15–17 min, not 50–55; the "stop after 3 quiet" rule
    never triggers because each orchestrator message resets the count (#3723: 13 check-ins, none acted; 0 of 22 sampled
    acted). One orchestrator armed a "3-min tick" 6 times in 25 min; q16 created an hourly cron after #3785 retired them;
    26 direct `archive_session` calls (q3, q7, q11, q16) with no `fleet-archive.mjs`; q16 archived Bryce's seed on his
    "cleanup all sessions"; W65 was archived mid-conflict-work with nothing pushed and redone 2 h later. Of 15 FAILED
    sessions, 10 hit the weekly limit, 2 were archived mid-work, 3 are unclear; nobody posted a line about any of them.

### 2.2 The rulebook, cards and skills against the harness that actually runs them

11. **Harness facts the repo gets wrong** (web-claude-code D1–D10, all cited to code.claude.com). `readonly: true` and
    `is_background` are Cursor-only and silently ignored (9 cards carry them; "ignores unrecognized fields without
    reporting an error") → add `disallowedTools: Write, Edit, NotebookEdit`. `autoMode` in project settings is ignored
    by the classifier, so pass-3 H2's fix cannot work; `/auto-mode-setup` is unavailable in cloud. Narrow allow rules
    skip the classifier and several are wide (`find *`, `git checkout *`, `git merge *`). Fork mode is on by default and
    "skips both filters", so a fork inherits every browser MCP tool and `Agent`. `agent_type` also appears in a main
    session started with `--agent`, so bash-guard.sh:317 and mcp-browser-guard.sh:50 would refuse its browser runs.
    `onFailure: "block"` is set on every PreToolUse guard (good) but HARNESS-SETTINGS:113 still says they fail open;
    mcp-browser-guard.sh:11/:21 quote docs that say the opposite. AGENTS.md rule 10 "worktrees start at the session SHA"
    is wrong (`"head"` = the parent's current HEAD at creation). Prompt cache: the main thread gets 1 h only within plan
    usage; on credits, for subagents, forks and after compaction it is 5 min (so pass-3's and numbers.md's "1 h" claim
    is right only within plan). `--strict-mcp-config` exists and starts no MCP server (fixes the routing eval). Skills:
    description + when_to_use truncate at 1,536 chars, the listing budget is 1 % of context and least-used descriptions
    drop first. Nesting: a subagent may spawn subagents three layers deep; at most 20 run at once.
12. **The reporter cards do not fit the work they are given** (cards/*). finding-verifier: 15 claims in `maxTurns: 25`
    stops near row 8 and code-survey / total-audit then drop the rest unjudged; it has no Write tool and no rule for a
    caller who asks for a file (this pass saved four of its reports by hand). code-hunter: ~10-min cap, no file route,
    `omitClaudeMd` missing, cites a `DEFECT-LEDGER.md` at the docs root (it is `docs/notes/DEFECT-LEDGER.md`). agent-surface-reviewer's
    header `VERDICT:` vs return `VERDICT ` colon trap (bounced once per run). ci-red-triage says "UNREAD/UNKNOWN" (only
    UNREAD works), cites a nonexistent AGENTS.md section, names the ungranted `list_workflow_jobs`, omits rule 8 and the
    tier split. worker: browser-guard claim wrong both ways (browserstack not matched; browser-use is), worktree
    refuse-list incomplete, names `mcp__Three_js_3D_Viewer` which `.mcp.json` does not configure. deploy-research: 30
    turns with one curl per call cannot audit 863 URLs; omits push→live lag and `max-age=600`. physics-contract-auditor
    runs vstd-lint (a PACE lint) instead of `curvature-channels.test.mjs` and its grep list lacks `pathK/bankAngle/lineAt`
    (would have missed today's finds). bloat-auditor's "append SHA when the parent says no" is unreachable. prior-art-scout
    does not know the clone is shallow. track-surveyor's "ONLY the assigned circuit" is prose: protect-files.py:293
    accepts any circuit id. README:35-38's "write ban is hook-enforced" holds only during a live browser run.
13. **Skills: 37 reviewed, 30 FIX / 7 KEEP-or-TRIM** (skills/*). Recurring: (a) nine skills send a worker to a whole
    30–45 min browser group for one spec (tune-physics, race-weekend ×2, season-mode, game-feel, scenery-dress ×2,
    asset-pack, ui-menu-a11y, multiplayer-debug) and AGENTS.md:41/44 itself says `test-bg.mjs stays for one spec`, which
    test-bg cannot do; (b) ownership collisions: GRIP STEER (tune-physics vs input-controls), dead CSS (css-play ↔
    slim-bloat, nobody owns it; the hunter found 0 dead of 628 classes), fat skill (AGENTS.md → slim-bloat; slim-bloat →
    agent-config), camera lag (four descriptions), livery/sponsors (garage-parts-livery vs playwright-probe), heap/CPU
    (js-debugger → mcp-probe although the server has `debugger_profile`), "simplify this" vs the built-in `simplify`,
    "deploy-branch merge/push" (check-changes vs ship); (c) season-mode's and career-mode's cross-clauses lack a `→`, so
    skill-hint.py counts career words FOR season-mode (first on 4 career fixtures); (d) Bryce's 844×390 touch profile is
    absent from ui-menu-a11y, css-play and survey-ui-matrix (layout-audit defaults to 852×393; the 844 viewport exists
    but is not first and lacks `deviceScaleFactor 2`), touch is last in input-controls, TLX-WebGPU-iPhone is not the
    first path in renderer-debug, replay captures run 640×360; (e) wrong facts: check-changes:47-49 "Cursor and Codex
    commits reach CI unguarded" is false (both hosts route `git commit` through shell-guard → bash-guard) and
    rulebook-guards PINS that sentence; new-track's workflow says gen-shell "picks up" a new circuit's script tag (none
    exist; defs are lazy; `js/track/circuit-meta.js` and `npm run gen` never named; two cited count pins don't exist);
    AGENTS.md:94 and render-wgx.md:36 cite mcp-probe `recipes.md` for boot evidence that lives at ARCHITECTURE.md:2038, and
    recipes.md plus four references still say "local or deployed URL"; asset-pack tells agents to run `bake*`, which
    settings.json denies; phone-browser catches "look at it on my phone" but serves the working tree at 852×393 and never
    warns that its tunnel URL grants `page.evaluate`; career-mode/season-mode "career always races Tracks.SEASON" is false
    (`calendarOf` returns the stamped calendar); (f) agent-fleet carries four live contradictions in the orchestrator boot
    set (never `get_session` a worker vs :156/:159; "launch nothing at allowed_warning" vs the standing authority; the
    Monitor over `read --strict` vs `fleet-bus watch`; "60 s bus watch" vs "no tick") and comms.md / communication.md
    duplicate messaging; the boot set is 51.5 KB (~12.9k tokens), a worker's 18.2 KB; (g) ship still lacks refusal
    handling for ready-gate's four states and never says who flips or to re-subscribe after the flip; steward's §7 line
    lacks `--timeout 30 --failures-only`; handoff names no cap and omits MERGE-HOLD, a run in flight and armed ids;
    survey-track's description lacks the words a realism ask uses (proposed text in its report); lighting-tuner never
    names the TARGETED sweeps tier; game-feel should stay separate (holds procedure tune-physics has no room for) but names
    no determinism check; stale anchors in pwa-cache (sw.js 711/788/957), race-incidents-control (4643), career-mode (558),
    data-hub (3 that are right today).
14. **Docs vs code** (docs-claims-core, docs-claims-rules, anchors, numbers). ARCHITECTURE.md:1107-1148 says circuit defs
    load as `<script>` tags in `Tracks.LIST` order (0 tags; lazy via `circuit-meta.js`) and sketches `points:[…]` where
    defs author `path:{len,pts}`. TESTING.md: overflow "up to six" and `MAX_SPILL_SHARDS` "two" (code: 11 and 4), "11-night
    rota" (16 groups), two CI check names that do not exist, group test counts ~37/32/37 (static 54/48/57), "sixteen"
    race-control tests (55), scenery closures "~27 KB" (41). PHYSICS.md puts the tuning `let`s in game.js (they are in
    drive-tune.js / pace-math.js), says BrakeCue "ships ON (notch 6)" (saved default 1 = OFF), and row 1174 calls the
    marble path "broadcast-only, no force" (item 16). DEBUG-HOOKS cites `__apex.log()` (it is `logLevel()`), "29" MCP tools
    and "250" test files (40 and 1,218). `.cursor/BUGBOT.md` is an unguarded stale fourth copy of the fleet rules (names
    `origin/ship`, 5 of 9 generated files). 18 of 38 plans have no Status line, including the fleet-redesign plan AGENTS.md
    cites as authority; shipped systems read as unimplemented in docs/research (tyre strategy, pit plans). rulebook-guards
    pins 22 sentences against 26 mapped rules and cannot catch any of pass-3's five contradiction pairs (it counts copies).
    Repo-wide: 2,873 of 6,512 citations drift (44 %); `path:LINE` cites 47.7 % (1,242 line-drifted, 1,071 needle-missing),
    `§Heading` 14.9 %, symbol-in-path 14.6 %; 381 cite missing paths (FLEET-ROLES cites the deleted merge-desk.md six
    times; the old `glx.js` path at the render root moved). Gated Pages p90 appears as 27 (AGENTS), 73 (deploy.md, undated) and three values in
    one TESTING paragraph; spec counts 118/119 in tool headers vs 170. The one-home rule is broken in TESTING.md:55-66 and
    :895-912 (rules 4–5), AGENT-SURFACE (four copies of "never Chrome MCP with Playwright"), README and VERIFICATION.
15. **Memory, plugins, MCP** (memory-mcp M1–M10). The six `.mcp.json` servers expose 197 tools / ~58.6k tokens of schema;
    Claude Code defers them to ~1.8k but Cursor and Codex load all of it (browserstack alone 53 tools / 19.7k tokens, 0
    calls anywhere). HARNESS-SETTINGS' per-role MCP plan is unimplemented (`deniedMcpServers`, `disabledMcpjsonServers`,
    `skillOverrides` all null; its one pilot never ran). Built-in skills collide with repo skills (`simplify`,
    `code-review`, `init`, `docs`, `deep-research`) and the 348 routing fixtures contain zero collision cases; 12 of 14
    `anthropic-skills:*` entries are irrelevant (~1.5k tokens/session) and can only be trimmed on claude.ai. The apex-tools
    server in this session was stale (4 files changed after start). Memory: live and repo copies byte-identical, sync
    round-trips, but ~9 of 19 are real preferences and a topic-file delete leaves its index line.

### 2.3 Game code (code-traced; nothing below was measured in a browser)

16. **Arc-rule leak through DEBRIS** (hunt-physics-b F1, med/high): AI cars drop marbles from `latG = |k|·v²/g`
    (game.js:6212, pure curvature); `marbleGrip` (debris-world.js:1160, called from player-forces.js:157, ON by default)
    cuts the PLAYER's grip up to 7 % near settled marbles. With DEBRIS on (off by default) a curvature-derived number reaches
    the player with assists off. PHYSICS.md:1174 classifies the site "broadcast-only… no force" — wrong. Bryce decides:
    reclassify as "surface" or drive AI marbles off a non-curvature signal. Everything else in physics/AI/race honours the
    rule (every curvature read classified in the two hunt reports).
17. **`fitBodyDetails` is defined twice** in `CarBodyGeom.create` (car-body-geom.js:1547-1579 dead, :1631 wins; two
    body-style commits merged together on 10-19); only the live copy has the podSculpt seat and coverStops band, so an edit
    to the first changes nothing; apex-lsp `--all` reports 0 problems (duplicate function bodies are not in its high-signal
    set). Add a guard.
18. **Smaller code-traced defects**: stale helmet-visor glint overlay after leaving a race (`VisorOptics.clear()` has zero
    callers; hunt-render F1); first title tap on iPhone probably silent (touch `pointerdown` is not an activation event;
    `GameAudio.init()` waits for the 449 KB audio bundle; hunt-ui-b UB1, with spec/WebKit URLs); a failed `onAudioReady`
    re-runs and stacks MutationObservers/visibilitychange listeners (hunt-ui F1); `UiLayers.top()` every frame while a
    gamepad is in a menu (36-entry querySelectorAll + getComputedStyle; UB2); phone-as-controller skips its 15 ms send cap
    on continuous input (~240 msg/s) and writes raw floats into `aria-valuenow` (UB4); hud-relative forces a layout once a
    second (UB6); `EventJournal` only ever writes (3 Map ops per car per step, 4.3 KB, its `posOf` would record grid slot;
    deleting it also clears pass-3 G7's duplicate key; hunt-core-b B1); a bank zone anchored on a corner never claims that
    apex, so a loose zone merges onto it and the intended corner gets no banking (mesh.js:226-251, B2; circuits affected
    not counted); `__apex.physState()` throws when `G.track` is null (B3); GripSteer gets the raw stick where it expects
    the shaped lock (player-forces.js:212; P1, GRIP assist only); `trailStep`/`trailYieldStep`/`paceVmax` read neighbours'
    same-tick values (array-order dependence the code's own comment forbids; F3); ~5 object literals per AI per tick (F2);
    WallEndFace ignores `dt` and never updates `wasOnWall` (F6); ~40 dead exports across AiDrive/Collide/TyreModel/Car3D;
    `wallAiScrub` returns `street ? 12 : 12`; `startQWinBonus` always 0; gfx.js leaks a created backend when `owner.check()`
    throws and logs no error text; WGX never removes its visibility listeners on failed create; the old track's lamp cells
    stay pinned in TLX after a day race follows a night race; baked models decoded twice (page + build worker);
    `bitmap-decode-worker.js` is the only lazy file keyed by build number, not hash; voice packs (107 MB) are rewritten
    into every cache generation; 7 of 231 HARD_EDGES rows cannot be derived and two manifest comments are false;
    `js/track/circuit-elevations.js` (8.5 KB) loads at title boot though nothing reads it before hydration; game.js grew
    +415/−208 in 7 days in four regions that `extract-module.mjs` can carve (~54 lines named).
19. **The test estate** (tests-deep F1–F13). 213 floor files also run in CI node groups, twice per Pages run (470 s local,
    599 s CI); `apex-tools-mcp.test` spawns a fresh MCP process 138 times and sets the guard-shard pole (221 s of a 260 s
    median; one `serve` batch → 158 s); the pin counter misses `doesNotMatch` (1,095 sites), `.test(` 327, indexOf 114,
    includes-equal 93, match-count 90, startsWith/endsWith 45, and 629 regex-array pins, while ~1,799 counted `assert.match`
    check runtime output; the top decile by cost per assertion (90 files) is 58 % of floor CPU for 3.9 % of assertions
    (worst 27 s/assert); `impact-map.json` has 4,055 rows and selection reads 8; flake-tally ignores node jobs (25 of 32
    recent reds were node-side); 5 perf specs run only on the nightly rota (perf-idle-churn unrun 22 days) and the rota
    spends a slot on `test:tiny`; the committed spec-timings file is 16 days stale and the fresh copy on `bot/spec-timings`
    is never merged; `test:guards` grew 14 → 43 files. Carve plan: drop the always-on overlap and move the five sweeps
    (−786 s, −22 %: 20.6 → ~16.2 min local); add the 14 planned game-vm/sweeps files (−32 %); fix apex-tools-mcp and the
    hook tests (~−320 s more). Duplicate coverage is 2.9 % (negligible); no test is tautological by shape.
20. **The live site** (live-site L1–L7): integrity is perfect (863 URLs, every `?v=` and `integrity=` matches the bytes,
    CSP hashes, 304s, generated blocks consistent, no stale-shell path); push→live is 10–38 min (median ~24; a queued train
    doubles it) where AGENTS.md:171's ~20 is gate time only; a first visit downloads ~3.3 MB compressed (shell 412 KB raw,
    309 script tags, 34 stylesheets of which 25 load in the background but are still fetched) and the SW install another
    ~1.45 MB; Pages sets `max-age=600` on everything, hashed assets included; sw.js:619 ("~5.8 MB … 145 script tags") and
    index.html:191 ("~10 MB precache") are stale.

## 3. The live probe (this session, Playwright, 844×390, working tree = deploy tip)

Title screen: 0 console errors, service worker controlling, `navigator.gpu` present, 385 scripts, every title button
reachable by role; the glyph text (`▾ ▴ SIZE PREVIEW GAS`) that appears in the raw a11y snapshot sits under
`aria-hidden` ancestors with zero size, so a screen reader does not read it. `__apex.race('monza'); go()` reached
`state: race`, physics stepping (30 steps), the minimap drawn, 0 console errors. Frames took 12–14 s each under
SwiftShader on a box at loadavg 8, and the game's own stall watchdog did what it is designed to do: shed to the lowest
rung, then "still glacial after the shed — reloading to the menu". AGENTS.md rule 8 applies (the timeout measured the
machine). Worth knowing: the same watchdog fires on a real phone that cannot hold 1 fps for 4 frames.

## 4. Needs Bryce (nothing else can do these)

- **Decide the quota rule**: launch through `allowed_warning` or stop at it. Today the rule says stop and his word says
  go, and the tooling forges pages to reconcile them (items 1, 11). Also whether Fleet B should be moved off the weekly
  limit's path (the next lock is ~10-30).
- **GitHub**: a ruleset that binds administrators, requires `CI`, forbids squash and rebase (`allow_rebase_merge` is
  true today), and either enables "Allow GitHub Actions to create and approve pull requests" or accepts hand-opened fold
  PRs (items 2, §1 #5). The actions-permissions and branch-protection endpoints return 403 to this session's token.
- **Credentials**: remove `FLEET_A_OAUTH_TOKEN` and `GROK_API_KEY` from the environment, move the AWS key to a perf-only
  environment, consider per-role environments (every role runs in env "I"; six others idle). Enable Dependabot alerts and
  private vulnerability reporting (both off).
- **DAD's brief**: the six lines in item 7, and who may merge D's PRs besides DAD.
- **Physics**: item 16 (marbles) — reclassify or change the signal; item 18's GripSteer input (shaped vs raw) is a
  feel decision.
- **Process**: strike or adopt §7.3 of the 10-22 note into fleet-core (item §1 #16); the ratchet slack band now rests on
  one case (#3763), so the simpler fix is to type that one raise and keep safety ban 1.
- **Hooks and settings edits** in the fix PR (items 2–5, 11, 12) need the grant claude-config.md requires. This session
  holds his 2026-10-26 "make edits to settings and whatever you need, we are in accept edits mode" from the pass-2 fix
  and reads it as covering this pass unless he says otherwise.

## 5. What one fix PR can land (everything else in this note)

Grouped so a worker can take a group: (A) gates and identities — launch receipt from `get_session` tool_response via
PostToolUse, receipt lower/upper age bounds, hash the gate import closure (JS and Python), pin the ready receipt to a
head, `--match-head-commit`, match the two cloud routes, typed INCIDENT open/close, GAME-SLOT by diff paths, `who` by
sender id + `grok:` scheme, author-check mirrored bus lines, HOLD shape + `owner:` line, env/host allowlists in the Cursor
launcher, narrow the four MCP allows, drop the dead `Bash`/`Agent`/`Monitor` allows. (B) hooks — variable-refspec and
`core.hooksPath` refusals, interpreter-wrapper detection for push/merge, python3-missing fails closed, `find -exec` false
positive, `ratchets.json` read ban, bounded-retry false positive, `agent_id` instead of `agent_type`, hatch announcement.
(C) fleet tools — `fleet-bus` LIVE alias + anchored ROTATE/LEND tests + no SPAWN refusal + `APEX_SESSION_ID` alias +
blob-vs-origin warning, `wait-for`/`watch` in orchestrator.md, FLEET BUS WATCH keyed on silence, SEED QUOTA line, check-in
cadence and quiet-count fix, `fleet-archive` as the only archive path, pr-board concurrency, `makeFlags` in the 57 loose
parsers (deploy first), `--help` for the fleet CLIs, `test-bg --spec`. (D) CI — train runs the node job or twinned-specs
stops assuming it, routing for the six spec-less dirs, quarantine by signature, merge-gate base-staleness rule for game
PRs, fold job fails loudly, flake-tally counts node jobs, merge spec-timings. (E) tests — the carve plan (−22–32 % floor),
pin-counter shapes, `dup-keys` + `output-surface` into guards, `apex-tools-mcp` batching. (F) cards — `disallowedTools`
on 9 cards, drop Cursor-only keys, `maxTurns` fits (finding-verifier ~45 or 8 claims per call), file-route rule, DEFECT-
LEDGER path, VERDICT colon, ci-red-triage text, worker browser line + worktree list, deploy-research recipe, physics-
contract-auditor steps, track-surveyor scope by circuit id. (G) skills — the 30 FIX verdicts (each report names the
lines). (H) docs — the §1 corrections, ARCHITECTURE lazy-load section, TESTING constants and names, PHYSICS locations and
row 1174/1188, DEBUG-HOOKS names/counts, BUGBOT.md regenerate or delete, plan Status lines, FLEET-ADAPTIVE superseded
banner, NOTES-INDEX, stale sizes in sw.js/index.html, live-site latency in AGENTS.md:171 and deploy-research, anchors →
symbols, HARNESS-SETTINGS auto-mode and fail-open sections, rule 10 wording, MCP trims for Cursor/Codex. (I) game code —
a separate PR per Bryce's call: visor clear, duplicate `fitBodyDetails` + guard, EventJournal removal, audio activation on
`pointerup`/`touchend` + latched `onAudioReady`, `UiLayers.top()` memo, phone-pad cap, hud-relative throttle, physState
guard, bank-zone claim, gfx.js error text + dispose, WGX listener undo, lamp-cell clear, bitmap worker hash key.

## 6. Method and limits

Load on the 4-core box ran 5–26 while reviewers worked; every timing a reviewer quotes from a live run is an upper
bound, and most used committed timing data instead. Pass-3's reporter agent types (finding-verifier, code-hunter,
deploy-research) hit turn or time caps and could not write files; their hand-backs were saved verbatim by the main
session (headers say so) and the unfinished items re-run by uncapped reviewers. GraphQL and three settings endpoints are
403 through the proxy, so branch protection, Actions permissions and PR-body edit history are inferred (admin binding and
rebase-merge from the branch and repo objects; the fold PR's absence from `bot/ratchets-fold`). The clone is shallow from
10-18. Cursor deletes run transcripts after 24 h, so DAD's earlier briefs come from bus quotes. Fleets A, C and D run on
other accounts or hosts, so their dollars are unknown. One reviewer's scan stripped section-banner comments and blank
lines from 57 tracked files in this checkout; the change was caught before any commit and is parked in `git stash` for
inspection; nothing of it is in this branch. No sibling session was launched, no bus line sent, no PR touched but #3838.
