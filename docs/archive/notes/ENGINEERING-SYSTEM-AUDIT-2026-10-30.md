# Engineering system audit — 2026-10-30

## Source and scope

Fetched origin deploy branch `claude/f1-game-project-26h3ng`, resolved
`7c6d11c68ad8fd670ee2a882d53bb2eec50c548b`; isolated worktree
`/workspace/apex-engineering-audit`, branch `cursor/engineering-audit-8e41`.
Original `/workspace/f1-game` was clean and was not pulled or edited.
Read current AGENTS.md, WORKERS.md, agent-config, worker/steward/ship/handoff roles,
Claude configuration rules, host configs and worker/reviewer personas.

Open-PR inspection (`gh pr list --limit 70 --json number,title,headRefName,files`)
found #4252 owns MCP/output implementation, AGENTS.md, AGENT-SURFACE.md and
check-changes; #4259 owns WORKERS.md, smoke recipes and skill registration.
Those paths are untouched. Gameplay, UI and garage code are outside scope.
Three native Codex workers independently audited instructions, tested capabilities,
and improved the handoff. They share this worktree; they are not Claude/Cursor sessions.
Parent retained integration and browser ownership. No browser was launched.

## Prioritized findings and changes

| Priority | Evidence at source | Result |
|---|---|---|
| P1 | Cursor apex-shared prohibited subscribe_github_* while WORKERS Per vendor required it | Replaced duplicate policy with canonical vendor link and actual-tool discovery |
| P1 | worker skill allowed send_later safety timers while WORKERS forbade timers | Watch procedure now delegates host behavior to canonical vendor contract |
| P1 | worker persona asserted every worker has isolation:worktree; native children here shared cwd | Requires cwd/root/SHA verification; Claude frontmatter cannot grant Codex isolation/tools/permissions |
| P1 | ship smoke selected nonexistent test name; Node 24 synthetic file pass satisfied minPass | Harness now rejects zero named subtests; real Node regression passes; recipe belongs to #4259 |
| P2 | New worktree smoke failed importing yaml despite dependencies in original checkout | Persona no longer claims Node walks into a sibling checkout; requires explicit matching-lockfile dependency resolution |
| P2 | Handoff treated persisted PR as sufficient transport and blindly switched branches | Requires remote PR readback, fetched SHA comparison and safe checkout selection; receipt differs from successor acknowledgement |
| P2 | Persona said hold stops push; WORKERS defines landing veto | Links landing semantics; explicit user commit/push holds remain binding, including WIP |
| P2 | Host-specific model and @parent names appeared universal | Handoff uses exposed model/messaging capabilities and distinguishes native children from independent lane adoption |

These fix observed contradictions or reproduced failures. No style-only rewrite or
context-cap increase was made. Hooks, settings, permission policy and agent tool
frontmatter are unchanged.

## Representative cold starts and task walkthroughs

| Host | Arrival → task → implementation → verification → PR → handoff |
|---|---|
| Codex (this session) | Fetched SHA/worktree verified; AGENTS and .agents skill mirrors inspected; user-scoped process task avoids backlog claiming; native workers exchanged nonce; disjoint edits integrated; focused node checks run; draft PR records Plan and Hand-off. No provider-session launch is inferred. |
| Claude | CLAUDE imports AGENTS; worker skill routes claim/draft task, persona worktree isolation is Claude-specific; git hook owns guards; vendor subscription and ship/ready-gate retain lane contract; persisted handoff requires readback. Walkthrough only: Claude executable/session service unavailable here. |
| Cursor | apex-shared routes AGENTS and shared skills; corrected vendor link resolves drafter/steward subscription contradiction; isolated VM setup differs from native workers; CLI fallbacks do not prove MCP attachment; vendor token limitations still require label relay in next. Walkthrough only: Cursor executable/session service unavailable here. |

Task walkthroughs covered a prose-only contract edit (docs fast path), a tool
verification defect (focused harness test plus tooling floor), and a takeover
(uncommitted work → remote SHA → PR readback → effective host capabilities).
They do not establish full end-to-end provider execution, PR notification delivery,
or browser rendering. The user requested process work; no gameplay verification is needed.

## Live capabilities and measurement

- Managed environment status: connected, current readiness, enforced unrestricted HTTP policy.
- Hosted apex_status: UNAVAILABLE, MCP SSE probe HTTP 429. No successful game gateway call is claimed.
- Native worker spawn/readiness plus exact `ACK capability-8e41` follow-up succeeded.
- codex-cli 0.163.0 present; Claude, Cursor and plugin-eval executables absent.
  Plugin evaluation skill was consulted; no fabricated plugin-eval score or model benchmark.
- Chromium discovery returned `/usr/bin/chromium`; discovery is not rendered boot evidence.
- Skill mirror: 38 skills current. Initial dependency failure resolved locally with an
  ignored symlink to matching source-checkout node_modules; no install/config mutation.
- Output transport: 31 tests pass, 0 fail, 4,952 ms (worker observation), including
  byte paging, UTF-8 boundaries, omitted-range recovery, late failures and cleanup.
- Dispatcher selected contracts: 11 pass; dirty/unpushed handoff contract: 1 pass.
- Integrated instruction checks before harness edit: 133 tests, 132 pass, 1 skip,
  0 fail, 10,536 ms; gen:check and mirror check passed.
- Measured baseline AGENTS + WORKERS + worker/steward/ship/handoff: 55,677 bytes.
  Adding check-changes: 61,449 bytes. These are file bytes, not actual loaded tokens,
  provider usage or billing. No measured task-speed or token saving is claimed.
  Changes intentionally add capability checks rather than optimize for fewer words.

Local raw logs/pages are ignored under `scratch/engineering-audit/`; durable verdicts
are here and in the PR. Retrieval of source pages used ordinary HTTPS with TLS and
inherited proxy; web search connector returned an empty error, so curl was used.

## Current primary sources (retrieved 2026-10-30)

- [OpenAI subagents](https://developers.openai.com/codex/subagents/): host-specific
  agent configurations and inherited sandbox/approval constraints; repository personas
  cannot supply absent host capabilities.
- [Claude subagents](https://code.claude.com/docs/en/sub-agents): explicit worktree
  isolation and working-directory enforcement are Claude behavior, not a portable promise.
- [Cursor Cloud Agents](https://cursor.com/docs/cloud-agent): separate VMs with
  environment setup and MCP support; this does not establish an active connection here.
- [MCP authorization](https://modelcontextprotocol.io/specification/latest/basic/authorization):
  HTTP authorization and stdio environment credentials differ; advertised tool names
  alone establish neither service health nor authorization.

## Remaining decisions and bounded proposals

1. #4259 owner should repair ship smoke recipe's stale name (`guardsVerdict: aggregator
   success` versus actual `guardsVerdict: the aggregator decides`) and run its contract.
2. Universal 300k context wording in worker/handoff is not measured host usage; qualify
   effective host limits together in a dedicated policy pass rather than invent a new cap.
3. Resolve stale plugin coordination guidance that still recommends retired fleet-bus
   routes: current WORKERS explicitly retires them. This repository PR cannot update the
   installed private plugin. Use current repository GitHub coordination, not that old route.
4. Hook/settings proposal only: a host startup readiness receipt could record source,
   dependency health and actual tool exposure. Before wiring it into hooks/settings,
   Bryce must explicitly approve under .claude/rules/claude-config.md. No such edit made.
5. Independent authenticated Claude/Cursor launch, subscription, permission-denial and
   successor-ack scenarios remain not run; need those actual host services. Hosted MCP
   needs a successful fresh status call after the 429 before advertising readiness.

No safeguards were removed; no external provider session, deployment or merge was attempted.

## Final focused verification

After integration, agent-config/docs-integrity/skill-smoke: 83 tests, 82 pass,
1 skip, 0 fail (11,326 ms). Persistent real-Node zero-match regression added to
existing skill-smoke suite: 9 pass, 0 fail (720 ms). Mirror/gen checks passed.
No browser spec was selected by pick-tests (tooling group only); Cursor entry
was reported unclaimed by the selector and explicitly checked through instruction
walkthrough and agent configuration tests. Changed fast tooling gate verdict is
recorded in the PR; full PR CI remains separate.

Before/after bytes for the six-file role entry set: 55,677 → 55,969 (+292).
This is an observed file-size change, not a model-token or runtime measurement.
