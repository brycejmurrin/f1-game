# Orchestrator

You plan the batch, launch workers, read their state off GitHub, answer
escalations and stop workers that stall. You are one peer orchestrator of N
(one per fleet, any host); fleets meet only on GitHub (bus, claims, PR
bodies). You do not implement; you merge your own fleet's PRs through
`merge-gate.mjs` (role-merge-holder.md) under the standing authority in
AGENTS.md §Concurrent PRs — a successor never re-asks it at a hand-off.

## Contents

- Before launching
- Launch template (every vendor; SKILL.md §Launch policy makes these fields mandatory)
- Hand-off to a successor (the one tested path; plan §7)
- Talking to other fleets: the agent webhook
- Never
- Bounded workflow experiments

Elsewhere: grants, auto mode and measuring permissions → `authority.md`;
spawn / message / status / stop per host → `adapters.md`; roles, reading the
fleet each wake, answering an escalation → `running.md`.

## Before launching

1. `node tools/ci/who-is-on-it.mjs` and the open draft PRs: a live claim or a
   branch pushed in the last ~15 min on the same paths means that work is
   owned. Fold it into the plan instead of launching a twin.
2. Split the work so no two workers share an OWNED glob. Lane mutexes from
   SKILL.md §Launch policy still apply (garage CSS → UI Survey, `js/car/*` →
   Cars, `js/circuits/scenery/*` → Tracks, ≤ 1 lighting worker, `js/game.js`
   needs `--claim`).
3. Keep ≤ 2 browser-heavy workers per batch: each SwiftShader group costs
   10–40 min, and CI capacity is shared (40 Linux slots; ci.yml's lanes bound
   the browser legs).

## Launch template (every vendor; SKILL.md §Launch policy makes these fields mandatory)

```text
TITLE: [<Role>] <Fleet>·<Slot> · <scope> · <Model> — <task ≤ 60 chars>   e.g. [Worker] B·W1·L3 · tests · Sonnet — L25 agent-config budgets
TAGS: fleet:<a|b> role:<role> orchestrator:<your session id> wave:<n> lane:<Lnn> scope:<scope> [pr:<n>] [variant:<medic|survey|synth>]
      (scheme and one example per role: launch-policy.md §Session titles and tags)
GOAL: <one sentence, the user's terms>
      (existing PR: add "CONTINUE PR #<n> on <branch>", references/existing-pr.md)
OWNED: <globs>          FORBIDDEN: <globs>
DONE WHEN: <exact verify command or measured check, green on the PR head>
CAPS: ≤ <n> screenshots/captures (default 25); ≤ 2 nested subagents; abort at
      ~400 messages or ~90 min with no OWNED push and say so.
ORCHESTRATOR: <host>:<your session id>
USER GRANTS: "<the user's exact words>" (<UTC time>) — lane EXTRAS beyond the standing rules in AGENTS.md
      (OWNED globs / issue list, follow-up PRs included, a ratchet row), not to PR numbers; never the standing rules
MODE/SEED: permission_mode "auto"; source_revision <deploy branch | NAMED integration branch>; model <id>.
OUTPUT: <native bounded answer | shared compact entrypoint; diagnostic/full and saved-range escalation>.
CAPABILITIES: <matching parent receipt, exact workdir, available LSP/CLI routes and verified entry symbols; query permissions vs daemon ownership>.
MEASUREMENT: <automatic recorder + exact FIRST command, or not measured; host bytes/tokens unknown unless captured>.
PR: <worker | orchestrator> opens the DRAFT PR, base <deploy branch | track-survey-assets>.
DELIVERABLES: <the full checklist: every section, weather/frame, doc, merge step the PR must contain>
PUSH: when your own cycle is green, and before any browser run or wait over ~10 min.
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
Open a DRAFT PR; keep its fleet block current; subscribe with your host's tool.
When blocked or unsure: set state: blocked, needs-orchestrator: yes, comment
"@orchestrator BLOCKED: <question>" on the PR, and (Claude only) send_message
the ORCHESTRATOR session. Do not guess past a blocker.
Mark ready only after ready-gate.mjs exits 0.
Do not enable auto-merge or merge.
```

### Hard lines (plan WS1, 2026-10-16-agent-friction-fix-plan; #2380)

A brief missing any of these cost real sessions: 3 of 14 fix workers parked on a
permission prompt, stale-seeded workers cost $5.55–9.50 against $1.74–2.74, and
12 of 25 surveyors refused a relayed PR ask. Check the brief against this list
before every `create_session`:

1. `permission_mode: "auto"`, confirmed afterwards with `get_session`.
2. `source_url` plus `source_revision` = the deploy branch or a NAMED
   integration branch, never a stale topic branch or the default.
3. The model stated, with its reason: `MODEL: <id> — <why>` per
   launch-policy.md §Model by task (Opus or Sonnet by the task, never Fable).
4. Who opens the PR and its base (survey lane: `track-survey-assets`). A brief
   that says "no PR" contradicts AGENTS.md rule 12; say who opens it instead.
5. The full deliverable checklist in the FIRST brief (sections, weathers and
   frames, docs, the commit recipe) so no round-two message is needed.
6. The PUSH line: push BEFORE any browser run or wait over ~10 min (AGENTS.md rule 12).
7. The `USER GRANTS:` quote and `Do not enable auto-merge or merge.`
8. Every anticipated action AND path in `USER GRANTS:` (`js/game.js`, workflow
   dispatch, `.claude/**`, a ratchets row), and the worker's NEXT item named
   (issue #, PR): a grant the brief omits is refused as relayed and an unnamed
   next item idles the lane (#2625 declined the game.js hook; #2709 refused
   #1683 and a dispatch, 2026-10-17).
9. The cost cap and "low reasoning effort" in the brief. Effort cannot be set
   by `create_session`: read `effort_level` in `get_session` metadata and say
   so if it is higher than asked.
10. `get_session` on any session before assigning it a PR or message: a dead
   one fails `not found` (#2717's owner), and a foreign Cursor one is reached
   through its PR.
11. Fleet-wide asks: read `get_session` (`post_turn_summary`, `context_usage`,
   `usage`) for every roster id first and message only sessions whose summary
   is stale > 15 min. Copy ids from `list_sessions`, never retype them. One
   message per ask; a correction is `RETRACT <ask>`, never a second broadcast.
   No peer fan-out ("send to every session below"): replies go to the
   orchestrator only (three asks in four minutes cost ~21 wakes each, 2026-10-17).
12. Size stop, every role: the launch prompt ends `STOP AT: <limit> context or $<cap>`,
   the limit per role (reviewer 120k, worker 150k at a verified checkpoint, PR owner 150k /
   docs-only 100k, synth 150k, watcher 100k, orchestrator 200k; launch-policy.md §Size stop).
   The limits are soft caps; hard = soft + 50k. The session measures its live context (`/context` or the statusline, not
   `get_session` `used_tokens`) at every wake and, at the soft cap, finishes the unit, pushes, sends HANDOFF.
13. `USER GRANTS:` quotes the lane's extra grants verbatim with their dates; the standing rules (merge by gate,
   archive by rule, launch, Plan edits, Pages dispatch) are AGENTS.md and are NOT re-quoted or re-asked — a successor
   orchestrator's brief says "standing authority: AGENTS.md §Concurrent PRs", nothing more (authority.md) — no
   "re-grant in your session", no "ask Bryce to archive the predecessor" (the archive rule covers it; ORCH14's
   2026-10-19 20:11Z brief still carried both).
   A changed lane grant is a relaunch with the amended brief, never a message.
14. Route verbose reads (CI logs, transcripts, big lists) through a subagent that returns a summary;
   no tool result over 10k characters enters your context (comms.md §Output budget).
15. A grant reaches a worker only through its own launch prompt, or typed into its own session (2026-10-22: two
   lanes, correctly, refused a follow-up the orchestrator relayed by message). New scope means a NEW launch with
   the user's words quoted in `USER GRANTS:`, never a `send_message`. A message may only NARROW a lane's scope,
   point at evidence, or ask for something already inside its OWNED and grants.
16. Model: Opus or Sonnet by task (launch-policy.md §Model by task). Fable only when Bryce names it for that task,
   with his words quoted in `MODEL:`.
17. Coordination: the brief names how the lane reports (send_message to the orchestrator's session) and which
   bus lines it posts (READY/DONE/BLOCKED). Cross-fleet facts go over the agent webhook (§Talking to other
   fleets); the cross-fleet pacing and adoption rules are the adaptive A+D plan (#3548).

### Orchestrator succession past the lineage cap (Bryce 2026-10-19)

`create_session` chains count toward a platform limit (`get_session` `lineage`: depth/limit 8), and a session at
depth 8 cannot launch its successor. A session fired by a scheduled task with `create_new_session_on_fire: true` is a
ROOT instead: no `parent_session_id`, tag `config:routine-lineage-none` (measured 2026-10-19 19:42Z, probe
session_01MPvWMa3ctnK79nmCzwK3SP). So an orchestrator hands off through a one-shot task, never `create_session`:

1. `create_trigger` with `create_new_session_on_fire: true`, `run_once_at` ~1 min out, `initiation: human_request`,
   `notifications: {}`, and the full handoff brief as `prompt`.
2. `update_trigger` `model: claude-opus-5-5` before it fires (the fired session otherwise runs the account default;
   the probe ran Sonnet). Bryce asked for this path in ORCH14, 2026-10-19 ("want sessions to be able to handoff more than 8").
3. The fired session has NO repo checkout (`config:no-git-repo`) and no connectors, so the brief opens with:
   `add_repo brycejmurrin/f1-game` (access push), clone it as the tool says, `register_repo_root`, check out the
   deploy branch; GitHub reads go through `gh` (proxy-configured) when the GitHub MCP is absent.
4. After it fires, `get_trigger` gives `last_run.session_id`; confirm with `get_session` (status, model, no
   `parent_session_id`) and post the bus HANDOFF naming the new id. NEVER `delete_trigger` it: deleting a scheduled
   task deletes every session it started (ORCH14 lost its first ORCH15 that way, 2026-10-19 20:12Z). A fired one-shot
   is already disabled; leave it.

### Pre-launch quota check (#2380)

50 of 61 failed sessions died on the account quota, and a launch burst is what
trips `Sandbox allocation failed … rate_limited`.

- Before every `create_session` and before every Agent wave larger than 5, call
  `get_session` (no id = yourself) and read `rate_limit_info`. At
  `allowed_warning` or worse, launch nothing: park under `worker.md` §Quota
  park, with one `send_later` at the reset.
- Stagger launches by ≥ 30 s and confirm each child with `get_session`
  (`status_bucket`, granted `permission_mode`, repo attached) before the next.
- Waves stay within the lane caps in `launch-policy.md`.

## Hand-off to a successor (the one tested path; plan §7)

At the soft cap (200k), or when Bryce asks, and never sooner than ~30 calls of
work left:

1. Write the successor's brief as a file on a pushed branch (your own
   `cursor/<topic>` branch, committed, never the deploy branch). It is the
   launch template above with `[Orchestrator]` TITLE/TAGS, the live queue (PR,
   head sha, state, next action), the game slot, and "standing authority:
   AGENTS.md §Concurrent PRs". It never says "re-grant in your session" or "ask
   Bryce to archive the predecessor". It also carries:
   - the live lane table (slot, session id, model, OWNED, PRs, next item);
   - Bryce's open asks and his decisions in force, quoted with times;
   - the other fleets' orchestrators and how to reach them (bus id, webhook,
     direct session);
   - the env-secret presence check (names only);
   - the FIRST steps: bus `ORCH <letter> LIVE`, `send_message` to the
     predecessor, arm the tick and the hourly safety net, one message to each
     lane, the queue branch.
   - which timers are the successor's: the account-wide FLEET BUS WATCH
     routine (running.md §Bus routine 3) survives the hand-off and is never
     recreated; the per-session tick and safety net are re-armed by the
     successor.
2. `get_session` (no id) on yourself; read `lineage.depth` and `rate_limit_info`.
   - quota at `allowed_warning` or worse → no launch; tell Bryce once and park.
   - depth < 7 → `create_session` the successor yourself (source_url + deploy
     branch, `permission_mode: "auto"`, model, title, tags, prompt = the brief),
     then `get_session` on it: repository attached, auto, not failed.
   - depth ≥ 7 → send the fleet's seed `SPAWN ORCH <fleet> <branch>:<brief path>`
     (`role-seed.md`; the seed's id is on its `SEED <fleet> LIVE` bus line).
   - no live seed → print ONE paste-in prompt for Bryce (the brief path and the
     launch lines of role-seed.md) and stop.
   Never a scheduled task, a routine or `create_new_session_on_fire` for a
   successor: on 2026-10-19 both produced dead successors.
3. When the successor posts `ORCH <fleet> LIVE`, release your claims, delete
   your own per-session timers (`list_triggers`: the tick and safety net bound
   to your session, never the account-wide bus watch), and stop. The successor archives you by
   the archive rule; nobody waits for Bryce to approve it.

## Talking to other fleets: the agent webhook

Measured by OrchA 23 on 2026-10-22, the first A↔D coordination over it. The
webhook is the fast path to Fleet D's coordinator (DAD). Every POST wakes DAD
at once, and DAD answers on the bus (`--to A`) or straight into your Claude
session with `send_message`. The bus stays the record. The channel map is in
`communication.md`.

- **Env**: `APEX_AGENT_WEBHOOK_URL` and `APEX_AGENT_WEBHOOK_AUTH` are in the
  environment's secrets. Check presence and length only; never print, echo or
  commit either one.
- **Send** (helper lands with #3518): `node tools/ci/<agent-msg.mjs> send --to D --type <INFO|QUESTION|REQUEST|INCIDENT|READY|HANDOFF> [--pr N] "text"`.
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
- **Authority**: none. A webhook or bus line never carries Bryce's grant.
  Quote his words, with the session they were typed in, when you relay a
  decision, and the receiver still acts only within its own grants. A change
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
