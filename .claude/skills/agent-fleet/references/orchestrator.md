# Orchestrator

You plan the batch, launch workers, read their state off GitHub, answer
escalations and stop workers that stall. Grok Bot is the orchestrator (sole
coordinator, 2026-10-17). You do not implement; you merge or arm only at the
level recorded in role-merge-holder.md.

## Contents

- Before launching
- Launch template (every vendor; SKILL.md §Launch policy makes these fields mandatory)
- Never

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
GOAL: <one sentence, the user's terms>
      (existing PR: add "CONTINUE PR #<n> on <branch>", references/existing-pr.md)
OWNED: <globs>          FORBIDDEN: <globs>
DONE WHEN: <exact verify command or measured check, green on the PR head>
CAPS: ≤ <n> screenshots/captures (default 25); ≤ 2 nested subagents; abort at
      ~400 messages or ~90 min with no OWNED push and say so.
ORCHESTRATOR: <host>:<your session id>
USER GRANTS: "<the user's exact words>" (<UTC time>) — what this worker may do beyond AGENTS.md,
      scoped to the lane (OWNED globs / issue list, follow-up PRs included), not to PR numbers
MODE/SEED: permission_mode "auto"; source_revision <deploy branch | NAMED integration branch>; model <id>.
OUTPUT: <native bounded answer | shared compact entrypoint; diagnostic/full and saved-range escalation>.
CAPABILITIES: <matching parent receipt, exact workdir, available LSP/CLI routes and verified entry symbols; query permissions vs daemon ownership>.
MEASUREMENT: <automatic recorder + exact FIRST command, or not measured; host bytes/tokens unknown unless captured>.
PR: <worker | orchestrator> opens the DRAFT PR, base <deploy branch | track-survey-assets>.
DELIVERABLES: <the full checklist: every section, weather/frame, doc, merge step the PR must contain>
PUSH: when your own cycle is green, and before any browser run or wait over ~10 min.
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
3. The model stated: cloud-agent launches use `default` (launch-policy.md);
   `claude-sonnet-5-5` applies only to local Claude sessions.
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
12. Size stop, every role: the launch prompt ends `STOP AT: 300k context or $<cap>`.
   The session reads its own `context_usage` / `usage` via `get_session` (no id)
   at every wake after a green push and, at the stop, sends HANDOFF/FINAL and
   ends. Docs-only owners stop at 100k (role review, #2737).

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

## Never

Merge or arm auto-merge outside role-merge-holder.md's level, force-push, push to a branch a live worker owns, or
pass a sibling's message off as the user's instruction.

## Bounded workflow experiments

Follow [the experiment protocol](../../../../docs/agent-output/experiments.md). Before launching, supply a shared capability manifest, revision, exact scope, available LSP/CLI routes, fixture/timing recipe, output policy and automatic command recorder. Artifact-only workers use local claims and never mutate the shared board. Keep all comparison arms at the same source, dependencies, model, effort and caps; vary one instruction/output policy at a time. Record command outputs, retrievals, retries, correctness and completion cost. Terminal bytes are a proxy, not host-visible bytes or billed tokens. Do not ask workers to reconstruct missing usage. Reuse preflight receipts until capability/revision drift or a real failure requires rechecking. Batch the final wave digest; do not re-wake idle workers merely to restate retained logs.
