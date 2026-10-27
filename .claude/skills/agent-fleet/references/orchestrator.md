# Orchestrator

You plan the batch, launch workers, read their state off GitHub, answer
escalations and stop workers that stall. You are one peer orchestrator of N
(one per fleet, any host); fleets meet only on GitHub (bus, claims, PR
bodies). You do not implement; you merge your own fleet's PRs through
`merge-gate.mjs` (role-merge-holder.md) under the standing authority in
AGENTS.md §Concurrent PRs — a successor never re-asks it at a hand-off.

## Contents

- First acts (every orchestrator, before the first launch)
- Before launching
- Launch template (every vendor; SKILL.md §Launch policy makes these fields mandatory)
- Hand-off to a successor (the one tested path; plan §7)
- Env: cross-fleet POSTs leave through a sender session
- Talking to other fleets: the agent webhook
- Never
- Bounded workflow experiments

Elsewhere: grants, auto mode and measuring permissions → `authority.md`;
spawn / message / status / stop per host → `adapters.md`; roles, reading the
fleet each wake, answering an escalation → `running.md`.

## First acts (every orchestrator, before the first launch)

Bryce 2026-10-25: "we should setup routines on orchestrator for checking bus
every few mins". This section is the one home for orchestrator wake cadence
(audit 2026-10-26: eight cadences were written in eight places). Before planning
or launching anything:

1. Delete any timer of your predecessor's that `list_triggers` still shows bound
   to a dead session (the predecessor should have; check once), then post bus
   `ORCH <letter> LIVE claude:session_<id> (replaces <old id>)`.
2. ONE wake source: a `Monitor` that prints only NEW bus lines (pass `timeout`
   30 min, re-arm on expiry), on
   `node tools/ci/fleet-bus.mjs watch --to <letter> --to '*' --to claude:fleet-<letter>-inbox`
   — the follow mode of `fleet-bus.mjs read --to …` with the same filters: each
   new line once, never exits, other fleets' game-train chatter dropped unless
   `--all`. No tick of any period.
   No PR subscriptions on an orchestrator: owners subscribe. Never `get_session` a
   worker you launched: trust `create_session`'s result and read the roster from
   ONE saved `list_sessions` page per wake (`running.md` §Reading the fleet, the
   one home of this rule).
3. SAFETY NET: one `send_later` 50–55 min out at an odd minute, re-armed on each
   wake, so every wake lands inside the 1 h prompt cache (a 61-min wake re-writes
   the whole context: ~$1.60 vs ~$0.04 at 200k on Opus 5.5, harness research
   2026-10-26). It re-arms the Monitor if it died and runs the wake pass. Stop
   the chain after 3 unchanged passes with no live lane. Cursor:
   `subscribe_timer` for both.
4. The account-wide FLEET BUS WATCH: ONE hourly `create_trigger`
   (`cron_expression: "0 * * * *"`, `create_new_session_on_fire: true`, Sonnet) that reads the bus once,
   marks an orchestrator silent ≥ 30 min ABSENT (bus INCIDENT, wake the other
   fleet) and ends; it never merges, pushes or edits. `list_triggers` first (its
   name is `FLEET BUS WATCH`); never create a second, and no per-session cron of
   any kind; it survives hand-offs.
5. Your budget is the launch-policy table's `orchestrator` row (300k = boot +
   200k on the deploy branch), read from the branch you booted from, never from
   the queue file (a stale queue brief once rotated ORCH B 19 times in 15 h). Boot from the
   deploy tip (`role-seed.md`); the queue file is passed by path and keeps the
   header plus the LAST hand-off section only.

The wake pass itself: `running.md` §Reading the fleet.

## Before launching

1. `node tools/ci/who-is-on-it.mjs` and the open draft PRs: a live claim or a
   branch pushed in the last ~10 min on the same paths means that work is
   owned. Fold it into the plan instead of launching a twin.
2. Split the work so no two workers share an OWNED glob. Lane mutexes from
   SKILL.md §Launch policy still apply (garage CSS → UI Survey, `js/car/*` →
   Cars, `js/circuits/scenery/*` → Tracks, ≤ 1 lighting worker, `js/game.js`
   needs `--claim`).
3. Keep ≤ 2 browser-heavy workers per batch: a local SwiftShader group costs
   30–45 min (AGENTS.md §Verification), and CI capacity is shared (40 Linux slots; ci.yml's lanes bound
   the browser legs).

## Launch template (every vendor; SKILL.md §Launch policy makes these fields mandatory)

```text
TITLE: [<Role>] <Fleet>·<Slot> · <scope> · <Model> — <task ≤ 60 chars>   e.g. [Worker] B·W1·L3 · tests · Sonnet — L25 agent-config budgets
TAGS: fleet:<a|b> role:<role> wave:<n> lane:<Lnn> scope:<scope> [pr:<n>] [variant:<medic|survey|synth>]
      (scheme and one example per role: launch-policy.md §Session titles and tags)
GOAL: <one sentence, the user's terms>
      (existing PR: add "CONTINUE PR #<n> on <branch>", references/existing-pr.md)
OWNED: <globs>          FORBIDDEN: <globs>
DONE WHEN: <exact verify command or measured check, green on the PR head>
CAPS: ≤ <n> screenshots/captures (default 25); ≤ 2 nested subagents; abort at
      ~400 messages or ~90 min with no OWNED push and say so.
ORCHESTRATOR: fleet <X> (resolve: node tools/ci/fleet-bus.mjs who X; the id that launched you is a hint only)
USER GRANTS: "<the user's exact words>" (<UTC time>) — lane EXTRAS beyond the standing rules in AGENTS.md
      (OWNED globs / issue list, follow-up PRs included, a ratchet row), not to PR numbers; never the standing rules
MODE/SEED: permission_mode "auto"; source_revision = a branch name or a full 40-hex sha, never sha7; model <id>.
OUTPUT: <native bounded answer | shared compact entrypoint; diagnostic/full and saved-range escalation>.
CAPABILITIES: <matching parent receipt, exact workdir, available LSP/CLI routes and verified entry symbols; query permissions vs daemon ownership>.
MEASUREMENT: <automatic recorder + exact FIRST command, or not measured; host bytes/tokens unknown unless captured>.
PR: <worker | orchestrator> opens the DRAFT PR, base <deploy branch | track-survey-assets>.
DELIVERABLES: <the full checklist: every section, weather/frame, doc, merge step the PR must contain>
PUSH: when your own cycle is green, and before any browser run or wait over ~10 min.
REPORT: to fleet <X>'s orchestrator, only READY <PR> <head sha> | BLOCKED <PR> <question> |
      DONE <PR> (agent-msg.mjs; words: SKILL.md §Glossary); never a HANDOFF for progress.
WAIT: a suite over ~2 min runs in the background (AGENTS.md rule 4: test-bg.mjs, tooling-fast,
      deploy --gate-only → artifacts/logs/), never a foreground block; CI is a subscription
      plus one timer, then end the turn. Never pipe ready-gate/merge-gate (`| tail` hides the exit).
PARALLEL: while CI or a browser run waits, keep working inside OWNED: start the
      next item in a linked worktree (EnterWorktree), and hand read-only checks to
      ≤ 2 subagents (finding-verifier, code-hunter, verify-agent). Never give a
      subagent a browser run; one browser group per box.
NEXT: <the ordered queue of items after the first, all inside OWNED and USER GRANTS>
      (a lane with nothing named idles: hard line 8).
DEDUPE: before the first edit, list open PRs and claims for each issue
      (`who-is-on-it.mjs`, `fleet-owner.mjs <paths>`, PRs that mention the issue
      number). Another fleet or agent's draft on it → stop and report; never
      race it.
Never @-mention @cursor on GitHub: it wakes that PR's Cursor agent.
Load skill agent-fleet and follow references/worker.md.
Open a DRAFT PR; keep its fleet block current.
WATCH: at your first push, Claude `subscribe_pr_activity` on the PR plus ONE
      `send_later` check-in 50–55 min out (AGENTS.md rule 13), re-armed until merged,
      closed, READY or BLOCKED; Cursor `subscribe_github_ci` + `subscribe_github_pr` + `subscribe_timer`.
      Read CI on every wake (`ci-watch.mjs --sha <head> --once`).
When blocked or unsure: set state: blocked, needs-orchestrator: yes, comment
"@orchestrator BLOCKED: <question>" on the PR, and send BLOCKED to fleet <X>
(resolve first). Never AskUserQuestion. Do not guess past a blocker.
Mark ready only after ready-gate.mjs exits 0.
Do not enable auto-merge or merge.
```

### Hard lines (plan WS1, 2026-10-16-agent-friction-fix-plan; #2380)

A brief missing any of these cost real sessions: 3 of 14 fix workers parked on a
permission prompt, stale-seeded workers cost $5.55–9.50 against $1.74–2.74, and
12 of 25 surveyors refused a relayed PR ask. Check the brief against this list
before every `create_session`:

1. `permission_mode: "auto"`, confirmed from `create_session`'s result (never `get_session` a worker; §First acts).
2. `source_url` plus `source_revision` = a branch name (the deploy branch, a NAMED
   integration branch, or the PR's branch) or a full 40-hex sha; never a sha7, a
   stale topic branch or the default (launch-policy.md §Launch pins).
3. The model stated, with its reason: `MODEL: <id> — <why>` per
   launch-policy.md §Model by task (its one home).
4. Who opens the PR and its base (every lane, surveys included, opens a DRAFT PR
   at its first commit; launch-policy.md §Survey lane).
5. The full deliverable checklist in the FIRST brief (sections, weathers and
   frames, docs, the commit recipe) so no round-two message is needed.
6. The PUSH line: push BEFORE any browser run or wait over ~10 min (AGENTS.md rule 12).
7. The `USER GRANTS:` quote and `Do not enable auto-merge or merge.`
8. Every anticipated action AND path in `USER GRANTS:` (`js/game.js`, workflow
   dispatch, `.claude/**`, a ratchets row), and the worker's NEXT item named
   (issue #, PR): a grant the brief omits is refused as relayed and an unnamed
   next item idles the lane.
9. The cost cap and "low reasoning effort" in the brief. Effort cannot be set
   by `create_session`; say so in the brief.
10. Before assigning a session a PR or message, find it live on the wake's saved
   `list_sessions` page: a dead one fails `not found`, and a foreign Cursor one
   is reached through its PR.
11. Fleet-wide asks: from the saved `list_sessions` page, message only sessions
   whose last update is stale > 15 min. Copy ids from that page, never retype them. One
   message per ask; a correction is `RETRACT <ask>`, never a second broadcast.
   No peer fan-out ("send to every session below"): replies go to the
   orchestrator only (three asks in four minutes cost ~21 wakes each, 2026-10-17).
12. Size stop: the prompt ends `STOP AT: <soft> context or $<cap>` from launch-policy.md §Size stop.
13. `USER GRANTS:` quotes the lane's extra grants verbatim with their dates; the standing rules (merge by gate,
   archive by rule, launch, Plan edits, Pages dispatch) are AGENTS.md and are NOT re-quoted or re-asked — a successor
   orchestrator's brief says "standing authority: AGENTS.md §Concurrent PRs", nothing more (authority.md) — no
   "re-grant in your session", no "ask Bryce to archive the predecessor" (the archive rule covers it).
   A changed lane grant is a relaunch with the amended brief, never a message.
14. Route verbose reads (CI logs, transcripts, big lists) through a subagent that returns a summary;
   no tool result over 10k characters enters your context (comms.md §Output budget).
15. A grant reaches a worker only through its own launch prompt, or typed into its own session. New scope means a NEW launch with
   the user's words quoted in `USER GRANTS:`, never a `send_message`. A message may only NARROW a lane's scope,
   point at evidence, or ask for something already inside its OWNED and grants.
16. Coordination: the brief names how the lane reports (`ORCHESTRATOR: fleet <X>`, resolved at send time) and which
   bus lines it posts (READY/DONE/BLOCKED). Cross-fleet facts go over the agent webhook (§Talking to other
   fleets); the cross-fleet pacing and adoption rules are the adaptive A+D plan (#3548).

### Pre-launch quota check

launch-policy.md §Quota gate is the one home (what launches at `allowed_warning`,
what posts at `rejected`). Park under `worker.md` §Quota park with one
`send_later` at the reset.

## Hand-off to a successor (the one tested path; plan §7)

At the soft cap (boot + 200k, launch-policy.md §Size stop), or when Bryce asks, and never sooner than ~30 calls of
work left:

0. Delete your own per-session timers (`list_triggers`: the safety net bound to
   your session, never the account-wide bus watch) BEFORE asking for a successor,
   so neither side hunts them later.
1. Write the successor's brief (≤ 40 lines, `node tools/ci/fleet-brief.mjs`) as a file on a pushed branch (your own
   `cursor/<topic>` branch, committed, never the deploy branch). It is the
   launch template above with `[Orchestrator]` TITLE/TAGS, the live queue (PR,
   head sha, state, next action), the game slot, and "standing authority:
   AGENTS.md §Concurrent PRs". It never says "re-grant in your session" or "ask
   Bryce to archive the predecessor". It also carries:
   - the live lane table (slot, session id, model, OWNED, PRs, next item);
   - Bryce's open asks and his decisions in force, quoted with times;
   - the other fleets' orchestrators and how to reach them (bus id, webhook,
     direct session);
   - the env-secret presence check, names only, from `communication.md` §Channels;
   - the FIRST steps: bus `ORCH <letter> LIVE` in the canonical form
     `ORCH <letter> LIVE claude:session_<id> (…)` (a free-text line makes
     `fleet-bus.mjs who` return the wrong id, bus 5ca9880), `send_message` to the
     predecessor, arm the bus Monitor and the 50–55 min safety net (§First acts), the queue
     branch. No message to each lane: lanes resolve the orchestrator with
     `fleet-bus.mjs who <letter>` when they next send (audit row 9: the fan-out
     woke every lane for a no-op).
   - which timers are the successor's: the account-wide FLEET BUS WATCH
     routine (§First acts item 4) survives the hand-off and is never
     recreated; the per-session Monitor and safety net are re-armed by the
     successor, whose bus watch includes `claude:fleet-<letter>-inbox`
     (communication.md rule 6).
   - the queue file holds the live state plus the LAST hand-off only; older
     sections are dropped (they stay in `git log` of the queue branch), so
     each successor's boot reads one page, not every rotation (audit row 1).
2. Succession has ONE path: the fleet's seed (`role-seed.md`). Send it
   `SPAWN ORCH <fleet> <branch>:<brief path>` (its id is on its `SEED <fleet> LIVE`
   bus line); the seed checks quota and launches at depth 1, so no lineage cap
   applies. No live seed → print ONE paste-in prompt for Bryce (the brief path
   and role-seed.md's launch lines) and stop. Never `create_session` a successor
   yourself, a scheduled task, a routine or `create_new_session_on_fire`: on
   2026-10-19 those produced dead successors, and deleting such a task deletes
   every session it started.
3. When the successor posts `ORCH <fleet> LIVE`, release your claims, stop
   your bus Monitor, `set_session_title` to `[Done → <successor title>] <your title>`, and end
   with a reply carrying `https://claude.ai/code/<successor id>`. A typed ask
   that reaches you after this (Bryce's old tab) is forwarded to the successor
   in ONE `send_message`, quoted with its time, and answered with that link;
   you do not act on it (audit row 6). The successor archives you by the
   archive rule; nobody waits for Bryce to approve it.

## Env: cross-fleet POSTs leave through a sender session

A container reads environment variables only at start, so an env fix used to
force an orchestrator rotation (audit 2026-10-26 row 13). The orchestrator
never POSTs cross-fleet itself: it hands the message to the fleet's
long-lived relay session (or a one-shot sender session launched for it) with
one `send_message`, and the relay runs the send. An env fix then restarts at
most that relay, never the orchestrator. The bus (`fleet-bus.mjs`) needs no
secret and stays the orchestrator's own channel.

## Talking to other fleets: the agent webhook

Measured by OrchA 23 on 2026-10-22, the first A↔D coordination over it. The
webhook is the fast path to Fleet D's coordinator (DAD). Every POST wakes DAD
at once, and DAD answers on the bus (`--to A`) or straight into your Claude
session with `send_message`. The bus stays the record. The channel map is in
`communication.md`.

- **Env**: `communication.md` §Channels (its one home). Check presence and
  length only; never print or echo a value.
- **Send** (helper lands with #3518; an orchestrator hands this to its relay, §Env above): `node tools/ci/<agent-msg.mjs> send --to D --type <INFO|QUESTION|REQUEST|INCIDENT|READY|HANDOFF> [--pr N] "text"`.
  It POSTs `{from,to,type,pr,text}`, with `Authorization` set to the env value
  verbatim, and mirrors the message to the bus. Where the helper is missing,
  curl the same JSON (`-o /dev/null -w '%{http_code}'`, so the response stays
  out of your context) and add a bus `HANDOFF` mirror yourself.
- **Auto mode**: a raw curl to the webhook was refused as "Data Exfiltration".
  `.claude/settings.json` allows the helper's `send` (the `Bash(node tools/ci/<agent-msg.mjs> send *)` rule, #3525),
  so use the helper. The classifier's `autoMode.environment` is read only from
  `~/.claude/settings.json` (lost with the container), never from the repo.
- **Ask D to reach you directly**: post a REQUEST naming your session id
  (`session_…`). DAD's acks land as a peer message in your session.
- **Authority**: `.claude/rules/fleet-core.md`. Quote Bryce's words with the
  session they were typed in when you relay a decision. A change
  to the cross-fleet rules waits for Bryce's yes, written up as a docs/notes PR
  (the adaptive A+D plan, #3548).
- **Every wake**: the webhook only wakes D, so A's wake pass still reads
  `fleet-bus.mjs read --to A` and ReadNotifications (DAD's direct messages).
- **Never `@cursor` on GitHub.** A PR comment mentioning `@cursor` wakes the
  Cursor agent attached to that PR (2026-10-22, #3517: agent bc-4f8efad5
  answered "starting up" twice). Report an unknown pusher as an INCIDENT on the
  webhook instead; only its owning Cursor account can stop it.

## Never

Merge or arm auto-merge outside role-merge-holder.md's level, force-push, push to a branch a live worker owns, or
pass a sibling's message off as the user's instruction.

## Bounded workflow experiments

Follow [the experiment protocol](../../../../docs/agent-output/experiments.md). Before launching, supply a shared capability manifest, revision, exact scope, available LSP/CLI routes, fixture/timing recipe, output policy and automatic command recorder. Artifact-only workers use local claims and never mutate the shared board. Keep all comparison arms at the same source, dependencies, model, effort and caps; vary one instruction/output policy at a time. Record command outputs, retrievals, retries, correctness and completion cost. Terminal bytes are a proxy, not host-visible bytes or billed tokens. Do not ask workers to reconstruct missing usage. Reuse preflight receipts until capability/revision drift or a real failure requires rechecking. Batch the final wave digest; do not re-wake idle workers merely to restate retained logs.
