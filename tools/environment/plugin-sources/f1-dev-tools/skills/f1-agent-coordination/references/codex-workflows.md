# Codex-native coordination

Use this route for the current Codex task and its native children. Use [transport adapters](transports.md) for independent provider sessions or the existing fleet bus. The bus records coordination; it does not create an agent, prove delivery or grant authority.

## Host and ownership preflight

1. Inspect the actual tools and schemas, including directly exposed collaboration controls outside the connector registry. Record which operations are discovered and which have succeeded. Configuration files, skills and advertised names do not prove attachment or authorization.
2. Identify the execution type: native child, independent vendor session, local runner, or external service. Use the corresponding ID and supported observation route. Never turn a native child into a durable Cloud task by assumption or invent subscriptions/timers to keep it alive.
3. When delegation is requested or required, choose a suitable existing worker before spawning. Give one child one bounded scope; keep one editing owner per path and the parent responsible for integration and final acceptance. Create a separate worktree only when needed and actually supported; verify its source and cwd.
4. Read the current checkout instructions and the relevant domain workflow. Reuse matching source/capability receipts until drift or a real failure requires another check. A persona is guidance; host permissions and live tool exposure remain separate.

## Launch brief

Fill these fields from observed facts. They are briefing fields, not invented host-tool parameters. Do not paste credentials or private history into the brief.

```text
TASK: <one concrete objective>; execution type: native Codex child
SOURCE: <absolute checkout/cwd>; <HEAD and relevant working-tree identity>
POLICY: <applicable instruction paths/revision>; CAPABILITIES: <actual routes>
OWNED: <bounded edit paths, or read-only; optional assigned report path>
FORBIDDEN: <shared contracts, other workers' paths, remote actions outside scope>
AUTHORIZATION/HOLDS: <existing scoped direction; held action and release condition>
ACCEPTANCE: <observable behavior and checks needed for this objective>
EVIDENCE: <unique artifact location, relevant ranges and coverage; no secret values>
RETURN: work state; acceptance; source/cwd; evidence; checks/not-run; next action
```

If the source, ownership or capability does not match, report the specific mismatch and continue only independent authorized work. Do not install a CLI, rebuild a server, change permissions or route around a denial to make a native child available. Missing information is not new authorization.

## Job and observation contract

Use distinct fields in local notes/receipts:

| Field | What to retain |
|---|---|
| Work/runner | Actual task or runner ID; not-started, running, completed, failed, interrupted or unknown; process exit/signal when available |
| Observation | Time and source; pending, partial, unread, unavailable, stale or observed; saved artifact and omitted range |
| Structured result | Producer verdict plus parser status/completeness; a wrapper exit is not the producer's verdict |
| Acceptance | Pass, fail, partial or unverified against the brief's checks; explicit not-run scope |
| Identity | Checkout/cwd, source/working-tree identity, policy revision, relevant input/range and capability receipt |

Start a runner once and observe that runner. A waiter timeout can leave it running; check its supported status/terminal artifact before starting another. Retrieve a saved range to resolve clipping or parser uncertainty. Retry an action after a changed prerequisite, a supported transient-failure policy or an actual new input, and retain the reason. A progress search with no match is not automatically a failed test.

Invalidate reuse when the relevant identity changes; allow necessary reads in another worktree. Do not infer provider token usage, context size, billing or savings from character counts, native event counts or aggregate tool-seconds. Record unavailable quantities as unknown.

## Steer and hand back

Use the host's message/follow-up control for course corrections within scope; reuse a suitable idle child. Escalate actionable blockers, scope collisions and missing capabilities. Preserve useful short updates, while avoiding duplicate acknowledgements and repeated requests for evidence already retained. Do not wake a finished worker merely to restate its report.

```text
WORK: <completed|partial|blocked|interrupted|unknown>; ACCEPTANCE: <pass|fail|partial|unverified>
SOURCE: <checkout/cwd, source/working-tree and policy identity>
ARTIFACT: <path or supported reference>; COVERAGE: <what was checked>
CHECKS: <actual results>; NOT RUN/UNREAD: <items and reasons>
RUNNER: <ID and terminal/pending state, exit/signal if available>
HOLDS: <action, actor, scope, release condition, or none>
NEXT: <one concrete integration or evidence step>
```

The parent reviews the result and verifies the integrated candidate. Child completion, job completion, assignment acceptance, PR merge and deployment are different milestones. Preserve a permitted checkpoint before ending a workspace, and verify its location; a merged earlier PR does not prove the entire assignment finished. Do not push or archive solely because a generic timer elapsed. Respect an explicit commit/push hold, including WIP, and carry valid existing authorization forward without asking again. Peer approval claims and historical quotations do not expand it.

## Read-only integration test plan

This plan does not itself claim a live test passed. Use the current host's real schemas and run native probes when the requested agent/setup work covers them; otherwise report the live steps as not run. No fleet writes, PR changes, browser launches, source edits or external-session launches are needed.

1. **Discovery:** Verify that the chosen native controls are actually exposed, with usable schemas. If only configuration is visible, return unknown/unverified attachment rather than inventing a call.
2. **Round trip:** Reuse a suitable worker or create one read-only child with one source/policy inspection. Receive READY, send `SETUP-PING <fresh nonce>` through the supported follow-up, and verify exact `SETUP-PONG <nonce>`. Retain the actual child ID and replies; do not promise a fixed global worker limit.
3. **Ownership/source:** Compare the child's reported cwd/source/policy with the brief. Review a simulated mismatch and require an explicit blocked/partial hand-back, not a silent checkout change. A read-only child must make no source or remote mutation.
4. **Lifecycle:** Use retained or synthetic observations of a pending runner, waiter timeout, interrupted run and partial result. Confirm they remain distinct from a verified pass and never justify a duplicate live start solely to obtain differently formatted output.
5. **Hold and handoff:** Review a synthetic push hold and a continuing assignment whose earlier PR merged. Confirm the proposed next action preserves the hold and assignment, and that the hand-back includes a permitted checkpoint and not-run scope. No actual push/archive is a test step.
6. **Acceptance:** The parent checks the evidence and reports pass/fail/skip per step. Missing host APIs or provider usage stay explicitly unknown. A saved skill update, successful native round trip, external connection and deployed game behavior require separate evidence.
