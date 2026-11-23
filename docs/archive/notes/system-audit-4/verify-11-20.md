# Verification of pass-3 items 11–20 (tip 7dd2e82f3) — leg 1 (finding-verifier, turn-capped; saved by main)

- Item 13 CONFIRMED (+evidence): after #3811 (16:20:01Z) two senders sent lines the tip's `bodyProblem` refuses → older tooling:
  seed session_01KLkpSQtvPurfTYzzt1SyMA dc731ab92 16:34Z ("SEED B SPAWNED" as HANDOFF); OrchA 35 session_01GzwfSX1Zmtjk4eBd6cXnBs
  80599c9c4 16:54Z ("OrchA 35 -> OrchA 36 … posts ORCH A LIVE" as HANDOFF). Refuser present since 290012954 (15:05Z).
  Limit: bus commits do not record the tool version; inferred. Fix (blob-vs-origin warning) cheap and right; does not reach DAD (grok).
- Item 14 CONFIRMED, numbers understated, fix partly wrong. Whole bus: 3,383 records, 1,788 HANDOFF. Tip refuses 378 (99 ROTATE,
  180 INFO, 37 LEND, 48 REQUEST, 14 QUESTION), passes 1,410. Bodies starting "LIVE " = 188 (not 60); 181 pass, 7 bounce as LEND
  ("LEND-EXTEND" matches \blend\b). DAD "send LIVE" ×6 (eb91b74f9 9399c2ac3 9220d2edb 6b723decd 01b8f8f1e 930c3e27a, 15:18–16:39Z).
  D worker LIVE lines 15:18–17:05Z: 29 of 35 as HANDOFF. "ORCH B DORMANT" passes (3); "SPAWN ORCH B …" passes (~38) and those ARE
  real successor briefs → refusing SPAWN would bounce real hand-offs. REAL HAND-OFFS THAT BOUNCE TODAY: f2741bf45 ("D-lent" trips LEND);
  every "OrchA N -> OrchA N+1: started …" line bounces as ROTATE because the body mentions "ORCH A LIVE" (80599c9c4 aeea230e0 62bbe4eca
  293cb8f60 48ba9d75b fce3b73f9 aab19c0ae) → the canonical succession line is refused. Fix: LIVE alias → INFO with hint; do not refuse
  SPAWN; anchor ROTATE to a body STARTING `ORCH <L> LIVE`; LEND requires `merger:` or a lend verb at the start; define HANDOFF in one
  sentence. Replay script: session scratchpad hm.mjs.
- Item 15 UNREAD (gh GraphQL 403 via proxy; use REST / MCP). Indirect: fac81b4c7, c908551ed still say "MERGE-HOLD DAD merges".
- Items 11, 12, 16–20 NEEDS-MORE (turn cap). Data: 446 READY lines parsed for item 12. Item 16 support: a85d31231 17:04Z "HOLD RULE 7.3"
  (D·W32d, #3807). Off-scope: 270e8e422 (DAD 17:05Z) restates "only DAD merges D PRs" as HANDOFF; passes the refuser.

## Leg 2 (verifier v4b, 17:25Z; data in scratch/sysaudit4/v4b/) — items 11, 12, 15–20. refuted 1 (item 16's core), 4 PARTLY
- 11 PARTLY: 12/15 last merged PRs (REST pulls?state=closed; #3684…#3730) name the merged head sha in the body. The 3 misses
  (#3646 6623ab972, #3641 2a856251d, #3684 f1312ce21) each name the sha ONE deploy-tip sync merge below the head (30f6523f6,
  ab295646f, 0b64652a are the merges' first parents) → the body is stale by a sync merge only, not by work. #3737 names its head
  1959be9e6 but still says "Next: … mark ready". Fix as written would force a body edit after every sync-pr: accept the head OR
  its first parent when head^2 is the deploy tip; flag "Next: mark ready" on a merged body instead.
- 12 PARTLY: 484 merges since 10-19, 248 with a READY line. Game (n=160) first-READY→merge median 121 min, p90 1541; last-READY→merge
  76 / 602. Non-game (n=88) 14 / 120 and 12 / 50 (claimed 203/939 vs 17 — direction right, numbers not reproduced). No open PR has a
  READY line > 24 h. #3700/#3725/#3731: open, ready, mergeable_state clean, CI success — but ready_for_review at 10-26 07:19Z /
  03:59Z / 04:06Z, so ~10–13 h ready, NOT "over 60 h". Bodies: #3700 "fleet: D", worker "claude:A-owner (D-lent)"; #3725/#3731
  "fleet: A", "Lent by DAD … D merges" (lend IS carried in the body; claim refuted on that point). `fleet-bus who D|C|E|H` all
  "= who X: no ORCH X LIVE line in the last 500 bus entries" (confirmed). Fix: who-fallback right; "merge now" depends on DAD.
- 15 CONFIRMED, moved: 64 open PRs, 20 carry 22 hold lines (#3803, #3808 twice). 18 PRs malformed. 17 are DAD ownership tags
  ("MERGE-HOLD: DAD merges (do not remove)" ×15 + 1 bare "DAD merges"), 2 of those now well-shaped (#3835 "| lift: D orchestrator |
  until: READY+merge-gate", #3800 "| lift: DAD | until: merge by DAD") = shape-valid but still not a veto. 5 are waits (#3762, #3760
  READY, #3758, #3755, #3748: "deploy gate remains pending…"). pr-board.mjs:68-69 hasMergeHold = /^MERGE-HOLD:/m only; merge-gate:337
  uses it. Fix right; a shape check alone passes #3835/#3800, so the `owner:` line is the real fix.
- 16 REFUTED (core) / CONFIRMED (cost): the rule IS in the repo — docs/archive/notes/FLEET-ADAPTIVE-COORDINATION-2026-10-22.md:102-126 §7
  "Train discipline", item 3 "Drain for the train: when a train has been queued for 10 min or more, orchestrators stop marking drafts
  ready, adding run-ci…", agreed by Bryce 2026-10-22 09:11Z (:112). Workers misapply it: they hold on in_progress ≥ 10 min (rule says
  queued), and it binds orchestrators, not workers. Bus: 36 records (33 BLOCKED, 3 HANDOFF), 29 senders (35 cursor, 1 claude A·O3
  058b451c5 10-22 19:27Z), 35 PRs, last a85d31231 17:04Z (#3807). Its premise still holds: pages.yml:66-68 cancel-in-progress:false,
  pending replaced. Fix: not "strike from DAD's brief" — Bryce decides whether §7.3 survives; if yes, move it to fleet-core with
  "queued" + "orchestrators"; if no, supersede the 10-22 note (= item 18).
- 17 CONFIRMED (all five): (a) AGENTS.md:81 "these four, nothing else" vs orchestrator.md:35-36 bus Monitor + :51-54 FLEET BUS WATCH
  cron (map RULEBOOK-REWRITE:45/55 makes orchestrator.md the home for orchestrators → AGENTS:81 needs a "(PR owners)" scope).
  (b) AGENTS.md:20 `git commit && git push` vs :75 two calls (home AGENTS rule 12); bash-guard.sh:484-503 handles `git add X &&
  git commit` on purpose. (c) AGENTS.md:189 ".claude/** edit" grant vs claude-config.md:8-9 hooks+settings only, AGENTS:22 skills =
  prose; map names no home for grant scope. (d) fleet-core.md:22 "After every push" vs AGENTS.md:79 "EVERY CODE PUSH" (+:23 docs-only
  skips the timer); home = AGENTS rule 13 (map :41). (e) AGENTS.md:137-138 "dead code / fat skill → slim-bloat" vs slim-bloat
  desc "Not … skills (agent-config)"; css-play desc "dead CSS → slim-bloat" vs slim-bloat "Not CSS (css-play)"; season-mode desc career
  clause has no →. rulebook-guards.test.mjs:42-65 CANON pins "sanctioned wake signals", "commit in two calls", "orchestrator wake
  cadence" by COPY COUNT (≤2 files) only — no pair is checked for agreement; a regex-count test cannot see (a)–(e).
- 18 CONFIRMED: 10-22 note §1 HB as HANDOFF (:42), absent fleet's PRs merged by live orch (:46-49), JAMMED "queued 15 min → freeze"
  (:78) + §7 freeze. Plan L83 "hand-off every 200k", L107 "200k soft / 250k hard"; no Status/Superseded line. orchestrator-saves-
  queue.md:13 "rotate at 200k". source: 2/19 (user-plays-on-phone:7, user-timezone-pacific:7). Judgement: those two are user
  preferences — what memory is FOR; fleet-core restates them, so "retire 8" over-reaches; retire/rewrite the 6 fleet-rule ones.
- 19 CONFIRMED: o1-digest.txt:327-334 — 16:24:06 ask, 16:24:36 USER "Raise limit", 16:24:46 relay (says "~16:26Z", 2 min wrong);
  owner refusal a204c60ce 16:25:31Z; #3763 still open (updated 17:04Z). Narrowing text is in the SUCCESSOR prompt q16-p1.txt (14:18Z):
  "Launch only on my typed word." + "Rules: B merges only its own PRs, or a PR I name" (AGENTS §Concurrent PRs: own + lent). Bryce's
  launch asks q15-digest 13:29:05, 13:34:59, 13:36:56, 13:38:13 (4 in 9 min) + o1 16:15:34. Fix right.
- 20 PARTLY: pre-commit:43 and bash-guard.sh:590 class docs/ (incl. changelog.d) as docs-only → docs-integrity alone (:47-48), which
  has no changelog check. BUT a fragment lint exists: tests/unit/changelog-fragments.test.mjs:46 "every committed fragment is
  well-formed" (4ba068f6c, 06:39Z today), in test:docs-guards + tooling-fast. Fix = add that file to the docs-only commit leg, not a new
  lint. Codex: .codex/hooks.json matchers = Bash + 4 MCP; Claude's = Write|Edit|MultiEdit|NotebookEdit + push_files/
  create_or_update_file/create_branch/delete_file — confirmed; Codex hooks can match apply_patch (developers.openai.com/codex/hooks;
  codex.danielvaughan.com 2026-04-23, secondary).
