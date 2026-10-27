# Claude Code fleet transcripts — deep read for the orchestration redesign (2026-10-27)

Read-only. Transcripts are data. Scope: 300 sessions listed on this account (`mine:true`, 3 pages, has_more still true past 10-16);
24 sessions paged (60 pages of 100 events, kinds user/assistant/result/system), saved under
`scratchpad/claude-tx/<id>-pN.json`, digested with `tools/ci/session-transcript.mjs` + two scratch scripts (`turns.py` turn
classifier, `ingest2.py` page→session mapper). Not repeated here: the 13 Fleet B sessions in
`docs/archive/notes/FLEET-B-TRANSCRIPT-AUDIT-2026-10-26.md` and the population rows in `docs/notes/system-audit-4/tx-*.md`.

## Coverage and caveats

| set | sessions (id · title · pages · window read) |
|---|---|
| orchestrators | O3 `01NRtVTfyeVigiLu3tbvManN` 5p 19:01–19:13Z; O4 `014HdnqgzCk6oQ8f2tvnkUJX` 5p 19:18–21:52; O5 `01MTd78BQBUPAFC8qc1BQM2x` 5p 22:57–01:10; O6 `01T14HCB1tmB2eH3FeuKoF8u` (Bryce-opened "Project clone and understanding", became ORCH B·O6) 4p 01:25–01:47 10-27; q15 `013JaBx1DysyB8dLCgGryvWL` 3p 14:15–14:24; q11 `01QkKVXRjTYNjA1FN9AjHANH` 2p 07:37–07:49; O24 `01MEA1rbzmm59CeZRognYgza` (10-20, $137.63) 3p 03:23–03:42 10-21; O26 `01WeajNossivepp1z8e1mgCq` (10-21, quota death) 3p 02:24–03:16 10-22 |
| seeds | `01Qv3HqSwsMuESkV9sSvb4f1` (iOS, 593k) 3p 08:41–14:19; `01KLkpSQtvPurfTYzzt1SyMA` (Sonnet) 4p 16:33–19:38 |
| relays | R1 `01PfAQjrkJvDyTMsca9X2aFo` 2p 17:20–17:32; one-shot `01U1e8CCnfnaFVSDdSVmoFhE` 1p (whole session) |
| workers/owners | owner #3749 `018Zzz94mfwSsGbtQsSiow6q` 3p (merged fast); owner #3763 `01F1bh3xrtWqfthQyGb2kBmR` 2p; T1 `01KXTBkjAtgxAuuNa3CUDY5k` 3p; T2 `01PBZdcHcKhm8L6RU9tbx34z` 2p; X9 `0184mTTer8GYFdAo8HNTL7i1` (656k) 2p; W11 `01GvgaEXjiHbDmx1spq3tgop` (614k) 2p; W1·L6 `01PiZA8whEUSJRjjpvmxkgv3` (FAILED 10-19) 1p; H16 `01TC31we79tZ7DYLFuS5N6P1` (FAILED) 3p; W65 `01WpXjamk31DLmGRZkML3ssa` (archived mid-commit) 2p |

- No Fleet A session exists on this account (`get_session session_01FYKKz1…` → not found, R1 17:22Z); A is visible only through the bus. There are no sessions dated 10-23/10-24 on this account at all.
- The transcript API does not carry the session id in events; parallel `list_events` calls spill to files whose names collide (3 pages lost to collisions). I mapped pages by the hook container uuid and by id mentions; every page's time range was checked against `created_at`. W65's pages are its own this time (the prior audit saw foreign events for it).
- Timer, bus-Monitor and GitHub wakes do NOT arrive as `user` events under this filter (UserPromptSubmit hooks fire with no prompt text), so a turn with no prompt is a notification/timer wake. `--ctx` "first" is the context at the oldest page read, not true boot, except where noted.
- Whole sessions read end-to-end: the one-shot relay only; the rest are 2–5 newest pages (O3/O4/O5/O6/seed2/owner #3749 reach within ~8–30 min of boot). No subagent was available in this session (no Agent tool), so all reads are mine.

## 1. Orchestrator turn anatomy (67 turns across the 8 orchestrators)

| class | turns | share | $ (lower bound) | $ share | examples |
|---|---|---|---|---|---|
| no-op wake (timer/echo/Monitor re-arm, ≤2 steps, no send) | 26 | 39 % | 2.79 | 13 % | O5: 12 of 16 turns, incl. 3× "The bus watch expired, so I restarted it" (23:27, 23:57, 00:27); O24: 6 of 10, two of them "This scheduled check-in is out of date" (03:26:26, 03:27:07); O4 19:36:47 "That bus line is my own launch request echoing back" |
| relay / forward a message | 8 | 12 % | 3.36 | 16 % | O24 03:27:53 forwards W11 status; 03:32:51 "A late update from W12 came to me rather than to OrchB 25, so I forwarded it" |
| Bryce-triggered turn | 9 | 13 % | 2.74 | 13 % | see §3 |
| hand-off (own or predecessor's) | 9 | 13 % | 1.85 | 9 % | O3 19:09–19:13 four turns; q15 14:15–14:21 four turns |
| launch | 6 | 9 % | 6.42 | 31 % | O26 02:47:34 one turn: 22 steps, 303 s, 6 `create_session` + 2 archives, $1.54; O6 01:47:31 three lanes = 18 steps, 229 s, 3 `get_session` + 3 `create_session` (quota receipt stale after 120 s, 30 s stagger) |
| archive | 2 | 3 % | 1.13 | 5 % | q11 07:40:33 "That's 26 sessions archived tonight" after asking Bryce which 3; O4 19:22:50 five sessions on "Cleanup ssssikns" |
| ask Bryce (AskUserQuestion) | 2 | 3 % | 0.59 | 3 % | O6 01:26:41 first turn after boot (34 steps, 342 s) ends in a question; O4 19:36:36 |
| read bus / sessions / other work | 5 | 7 % | 1.82 | 9 % | q15 14:21:38 read-bus $0.86 |
| answer a peer | 1 | 1 % | 0 | — | O3 19:02:19 (stopped a duplicate train worker) |
| merging | 0 | 0 % | — | — | none on these pages: every merge in this window went through trains owned by workers, or waited on ORCH A |

- Boot: context at the first turn read — O4 138k (8 min after launch), O6 209k (8 min after launch, 34-step first turn), O3 230k (80 min in), O5 181k (3 h in), seed2 129k, relay R1 144k, owners 134k/218k, train workers 148–154k. The one-shot test session with no skill load sat at 63.5k, so the fleet boot set (AGENTS.md + rules + agent-fleet skill + role refs + queue file) costs ~70–150k before any act.
- Turns before the first useful action: O4 and O5 posted `ORCH B LIVE` within 60–80 s of launch (O3 19:11:39, O4 19:39:11), but O6's first act was an AskUserQuestion after 9.5 min, and O6 then re-read launch-policy + launch-gate + launch-gate.mjs fields (3 SAY lines 01:44:18–01:44:28) before the first launch.
- Dollar per wake: O5 $0.04–0.11 at 181–201k; O24 $0.30 per no-op at 708–765k; O3 $0.11–0.77 at 230–266k. The 1M window makes a 700k orchestrator cost 3–7× per identical wake.

## 2. How orchestrators actually ended, and what successors re-did

| session | end | evidence |
|---|---|---|
| O1→O2→O3 (10-26) | size stop at the brief's cap | seed2 16:34:45 "B·O1 hit its size stop and sent a handoff"; 17:43:43 same for O2; O3 handed off at 266k (19:09:05 "I've asked for a fresh Fleet B orchestrator") |
| O4 | **Bryce's word, at 177k after 27 min** | Bryce 19:34:10 "Spawn a new session to be orchestrator and coordinate with other fleets"; the brief for O5 says "replaced on Bryce's word". Bryce wanted cross-fleet coordination; the system read it as a rotation |
| q15 | size stop at 314k (overran the 200k brief) | 14:15:40 "I'm at about 314k context, past the handoff point" |
| O24 (10-20) | Bryce's "archive all older … spawn new ones" at 720k | 03:29:09; the O25 brief: "taking over from OrchB 24 … retiring at 720k context" (11,284-char brief) |
| O26 (10-21) | **quota death, no report** | last real turn 02:48:20 ($102.37) right after launching 7 sessions on Bryce's "Bruh we have many idle sessions…"; every one of the 7 is FAILED `weekly limit`; the digest ends `= state: quota-parked until Oct 25` |
| O6 (10-27) | alive; Bryce's own session took the role | 01:25:14 "I'm now ORCH B, but the fleet I took over has no running sessions. Two decisions need you" |

Hand-off briefs, verbatim heads (seed2 → O4, 2,148 chars): "GOAL: You are the Fleet B orchestrator, successor to B·O3 (session_01NRtVTfyeVigiLu3tbvManN, size stop). Load skill agent-fleet; follow references/orchestrator.md (§First acts: ONE filtered bus Monitor + a 50–55 min send_later safety net; the account-wide FLEET BUS WATCH trig_01ANsLrvbDGnMapUzqRYmnVL already exists — never create another) and running.md. Post bus `ORCH B LIVE claude:session_<your id> (replaces …)` in exactly that form. / BRIEF: `git fetch origin cursor/orchb-queu…". The iOS seed's briefs (q13–q16, 3.4–3.8k chars) open with a QUOTA paragraph: "Bryce was asked in the seed session and typed 'Launch it' for THIS launch only. That does not authorize you to launch workers: at allowed_warning or worse, launch NO further sessions and ask Bryce with AskUserQuestion before any launch."

Successor's first turns: O4's first observed turns (19:18–19:22) archived five sessions and answered Bryce; O6 spent its first 342 s unarchiving the seed and R1 ("Both are restored, and I've deleted the B·R-sys check-in. Now I'll record that in the queue file") — undoing the previous orchestrator's archive — and then asked Bryce. Every successor re-reads the queue branch, re-arms a bus Monitor and a safety timer, and re-resolves ORCH A; O5 re-armed its Monitor 3× in 2 h. Rotation cost observed: predecessor tail 3–4 turns ($0.9–1.3) + seed turn ($0.35–0.9) + successor boot (34 steps) ≈ $3–5 and 4–5 min with no live orchestrator (O3 19:07:35 → O4 LIVE 19:11:39; O4 19:34 → O5 LIVE 19:39).

## 3. What Bryce typed (21 prompts on the pages read; iOS `origin`), by intent

| intent | n | quotes (session, Z time) | would a correct design need it? |
|---|---|---|---|
| launch / start / spawn | 8 | "Launch it" (seed, quoted ×3 in q14–q16 briefs); "Give prompt" (seed 09:23:24); "Spawn a new session to be orchestrator and coordinate with other fleets" (O4 19:34:10); "Start a new season to do it wi the env" (R1 17:23:20); "Yes use the relay" (O6 01:27:32); "Meanwhile let's archive all older messages and spawn new ones to continue the current work and open PRs and more hunting" (O24 03:29:09); "Bruh we have many idle sessions and 9 open prs and over 200 issues; get all sessions working or hunting or spawn new ones" (O26 02:42:30) | No. All are re-grants of the standing authority or launch-gate workarounds; the quota gate turned every launch into a Bryce prompt |
| merge / priority | 4 | "I want all prs merged asap work with other fleets for Massive trains" (O3 19:02:59); "Yes let's cancel other ci runs to depend these up" (19:05:40, declined: "I didn't cancel anything, because it wouldn't make anything faster"); "How can we speed up?" (19:06:20); "Or how can we parallelize ? Freese" (19:06:41) | Yes — this is the one legitimate input: a priority. It should be one field, not four prompts |
| status / question | 4 | "Status" (O5 23:44:46); "Check bus" (O6 01:43:42); "Re read our last fable fleet review session is that pr all merged" (q15 14:20:03); "But re read it weren't there more steps for environment setup, settings etc" (q15 14:21:06, a correction after the agent checked only PRs) | No — a status page; the re-read question shows the audit's manual steps had no home |
| cleanup / archive | 2 | "Cleanup ssssikns" (O4 19:22:16); "Make sure you tell all you are archiving and have pushed to orchb 25" (O24 03:41:39) | No — archive by rule; the second is a trust check on the hand-off |
| fix / wire infra | 3 | "/check on it and fix to get it clean asap" (O26 02:36:20); "We need to re setup relay or this endpoint and generate token etc coordinate with Orch" (R1 17:29:56); "Or message a I want to test full relay paths" (R1 17:20:49) + pasted link to A's session (17:22:45, not found from this account) | Partly — the relay is infrastructure Bryce had to debug by hand through agents |
| typed into workers | 2 | "Ask coordinator" (X9 13:47:27 → 2 sends to dead orchestrators, $5.36 turn at 647k); "Sk orch26 or ask to be archived" (W11 05:55:14, $4.73 turn at 599k) | No — a worker at DONE should self-report and self-archive |
| pasted prompts | 2 | a read-only audit prompt into O4 (19:20:43); the agent-fleet skill text into O24 (03:29:22) | No — these are Bryce using an orchestrator as a terminal |

Latency when Bryce types into a live orchestrator: 12–54 s per answer (O3 19:03–19:07). Agents read phone typos correctly in all 4 cases here ("ssssikns", "Freese", "season", "Sk orch26").

## 4. Worker anatomy

| session | boot→first push | push→PR open | PR open→READY | READY→merge | notes |
|---|---|---|---|---|---|
| owner #3749 `018Zzz94mf` (16:17 launch, $2.72, 134→165k) | n/a (owned an existing PR) | — | gate re-run with 45-min cap after the 25-min default timed out (`FAIL 325/854 safety-bans-hook.test.mjs` at loadavg 2.6); ready 17:13:42 (56 min) | READY 17:26:02 → merged 17:27:32 (90 s, by the orchestrator) | 5 turns: 2 work, 1 no-op (its own ready_for_review echo: "That notice is just GitHub confirming my own 'mark ready'"), 2 PR reads |
| owner #3763 `01F1bh3xrt` (16:18, $5.81, 218→245k) | — | — | READY sent 17:30 | not merged by ledger time ("orchestrator to merge") | 4 turns; 1 no-op |
| T1 `01KXTBkjAt` (17:09, $2.78, 154→174k) | trains built in <15 min | — | — | stood down 17:29:15: "Fleet B's orchestrator moved both trains to a successor session" | **7 of 10 turns were no-op CI echoes in 2 min** (17:27:36–17:28:44, $0.03–0.10 each: "That event is the same train 2 failure I've already reported") |
| T2 `01PBZdcHcK` (17:41, $2.29) | — | — | — | — | hit "context cap" at **157k** on a 1M window and handed off; 4 hook blocks in one turn (test:guards red commit, ratchets.d rewrite via `git checkout`, push refused "gained 1 commit(s) on the remote", Stop hook uncommitted changes) |
| X9 `0184mTTer8` ($39.32, 647→657k) | — | — | #3792 ready | "coordinator unreachable" | Bryce's "Ask coordinator" → send_message to `01E4f2…` and `01XzhhVYuG…`, both `session_inactive` |
| W65 `01WpXjamk3` (14:10, archived 14:30) | — | — | ready flip attempted 3× (raw `gh api …/ready_for_review` ×2 → HTTP 503; MCP flip DENIED by the ready-gate hook 14:28:24) | — | last call 14:28:59 `git commit -q -F -` with no result: archived mid-commit on "clean up all sessions"; `tooling-fast --changed` moved to background after 600 s |
| H16 `01TC31we79` (FAILED, 282→317k) | — | — | — | — | worked in worktree `/home/user/f1-h16-warm`; one Edit denied (file not read); last turn a hand-off via task notice |

Turn budget by activity (owners + trains, 29 turns): CI/echo no-ops 11 (38 %), gate/ready-gate/verification 7, PR body/Plan edits 5, bus/fleet-block/claims 3 (W65 fixed a missing `fleet:`/`orchestrator:` block by `sed` at 14:27:51 to pass ready-gate), hand-rolled waits 0 (the only poll loop was O3's `for i in $(seq 1 25)… sleep` and the hook blocked it), re-reading rules 2 (O6).

Hook refusals and classifier blocks on all 60 pages: **8 hook blocks, 0 classifier denials** — bash-guard shell-poll-loop (O3 19:10), bash-guard test:guards-red commit (T2), protect-files ratchets.d rewrite (T2), bash-guard push-over-remote-commit (T2), Stop-hook uncommitted (T2), ready-gate receipt on the MCP flip (W65; the raw `gh api` path has no hook), SubagentHandback report-contract (O5 00:23, ci-red-triage report missing its `SHA … · run` line), agent-msg "HANDOFF is a successor hand-off only; this body is seed / heartbeat / status chatter" (seed/O3). All were correct refusals; none cost more than one retry.

## 5. Cross-session messaging

- Inbound envelopes as prompts on these pages: **3**, and all 3 were the harness wrapping a *SubagentHandback* as "Another Claude session sent a message: <agent-message …> [Subagent hand-back]" (q15 14:22, q11 07:39, O5 00:23). Peer traffic reached orchestrators through `ReadNotifications`/bus Monitors instead (task-notice wakes), so the actionable share of envelopes is 0/3; acks/relays 0/3; harness artefacts 3/3.
- Outbound `send_message` on the pages: 31 calls; 8 of them hand-off/LIVE announcements, 11 status forwards, 6 asks, 6 failures.
- **Sends to dead or unreachable sessions: 6** — O3 → seed2 "Cannot send events to inactive session" (19:09, the seed had just been archived by a cleanup); X9 → `01E4f2…` and `01XzhhVYuG…` (both inactive, 13:47); O6 → "the requested resource was not found" (01:27); R1 → `01FYKKz1…` (Fleet A, other account, 17:21) twice; `fleet-bus.mjs who A` returned that dead id from a 25-min-old bus line. `list_sessions {tags:["fleet:b"]}` → "tags filter is not currently available".
- The A↔B relay never carried a real message in the window: the one-shot test (`01U1e8CC`, $0.14, 69k) got HTTP 401 "OAuth access token is invalid" at 17:24; R1 then needed Bryce ×4 and handed the re-setup to O2; O6's 01:27 send "started ORCH A's inbox routine in session cse_01XbFtuB…" but the hand-over had already crossed on the bus three minutes earlier.

## 6. Failure modes seen

| mode | instances |
|---|---|
| no push / lost work | W65 archived mid-commit (14:28:59); q11 "commit c317c7cc likely lost" in its own summary; T2's push refused because the branch moved on the remote |
| quota death, no report | O26 02:48 + 7 lanes it launched at 02:44–02:48 (W15–W19, H34, H35) — all FAILED `weekly limit`, nothing on the bus |
| archived mid-work / wrong archive | W65 and owner `01TWc54d` (14:30, prior audit); O6 had to unarchive the seed and R1 at 01:26 because the 19:22 "Cleanup ssssikns" and later sweeps took them; O3's send to the archived seed failed |
| work redone by a successor | O6 restored sessions and re-derived the Fleet A id; every successor re-reads the queue branch and re-arms watches; T1's two trains were re-owned by T1b 20 min after T1 built them |
| AskUserQuestion parks | O6 01:26:41 (first act), O4 19:36:36, q11 "which 3 to archive", seed 09:23/10:17/14:18 (quota), O26's successor briefs instruct "ask Bryce with AskUserQuestion before any launch" |
| stale orchestrator ids in briefs / bus | X9 held `01E4f2…`/`01Xzhh…` as coordinator; `who A` → `01FYKKz1…` not found; the O-queue5/… brief chain names each predecessor by id, and briefs grew to 11,284 chars (O25) |
| wrong-base / branch drift | O3's `git worktree add scratch/wt-q origin/cursor/orchb-queue18-aq1h` failed on `.gitignore`; orchestrators boot from a queue branch (`cursor/orchb-queue*`) distinct from the deploy tip |
| context cap misread | T2 handed off at 157k; q15 and O24 overran to 314k/765k; X9/W11 sat at 600k+ where one Bryce prompt costs $4.7–5.4 |

## 7. What should change in the redesign

1. **Delete the seed and the relay roles.** The seed's only turns were launches (seed2: 4/4, iOS seed: 4/5), each preceded by a Bryce "Launch it"/"Give prompt" the quota gate demanded; the relay path never delivered a cross-fleet message (401, 404, dead ids) and consumed 5 Bryce prompts plus 3 sessions. Launch from the orchestrator through `launch-gate` with ONE standing grant recorded once (not per launch), and give fleets a mailbox (a routine or a bus line) rather than a session id to address.
2. **Keep exactly one wake source: the filtered bus Monitor, plus one safety timer.** No-op wakes are 39 % of orchestrator turns and 7/10 of a train worker's; GitHub check_run echoes and Monitor expiries ("bus watch expired, so I restarted it" ×3) produced nothing. Orchestrators and train workers should not subscribe to PRs; one coalesced CI verdict line per head sha on the bus is enough.
3. **Shrink the boot set to < 60k.** A bare session is 63.5k; fleet sessions land at 130–230k before their first act and O6 needed 34 steps and a question before doing anything. Boot = a 2k role card + the queue head (last hand-off only) + the standing-grant line; the full rulebook stays on disk for lookups.
4. **Rotate by cost, not by a token number, and never on an ambiguous Bryce line.** O4 was replaced at 177k after 27 min because "Spawn a new session to be orchestrator and coordinate with other fleets" was read as a rotation; T2 rotated at 157k. Each rotation costs ~$3–5 and 4–5 minutes without an orchestrator, and the successor's first acts are restoration and re-reading. Rotate at a measured $/wake threshold (O5 at 181–201k ran 5.5 h at $0.04–0.11/wake).
5. **Bryce's interface = one status page + three verbs.** Of 21 typed prompts, only the 4 priority lines were input a correct system needs; 8 were launch grants, 4 status checks, 2 cleanup, 3 infra wiring. Give him `priority <text>`, `stop`, `go` on a page that shows live sessions, trains, and the merge queue; archive by rule (never while a turn is mid-commit: W65), self-archive at DONE (X9/W11 prompts), and never ask him which sessions to archive or whether to launch.
6. **Make every send resolve liveness first.** 6 of 31 sends went to inactive or unknown sessions; `who` must verify the target with `get_session` (or the bus LIVE line's age) before sending, and a failed send must post to the bus so the ask is not lost (X9's "coordinator unreachable" sat in a worker summary).

Artifacts: `scratchpad/ledger.csv` (300 sessions: cost, ctx, status, role, summary), `scratchpad/out/<id>.txt` (per-turn classification per session), `scratchpad/claude-tx/*.json` (saved pages).
