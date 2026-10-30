# Agent messaging: APIs, triggers and staged setup

Proposal researched 2026-10-30 UTC for #4387; expands
[the feasibility study](AGENT-MESSAGE-HOSTING-2026-10-30.md). Not an adopted
coordination rule, deployed service, permission grant or provider delivery claim.
[WORKERS.md](../WORKERS.md) remains authoritative.

## Recommendation and scope

Build a small GitHub-backed inbox first. Add a shared read API only if measurements
justify it; add provider delivery one host at a time. Keep task selection, claims,
labels, PR handoffs, verification and landing in the existing engineering system.
Messages point to that state rather than duplicating it.

Separate four jobs that are easy to confuse:

| Job | Proposed implementation | What success proves |
| --- | --- | --- |
| Store a message | Existing GitHub issue/PR comment API | GitHub has a retrievable source record |
| Find relevant messages | Local SQLite index; optional shared D1 projection | A bounded query can retrieve the record |
| Notify or continue a session | Host-specific, authenticated provider adapter | Provider accepted a particular delivery/run |
| Confirm receipt | Allowed host route records a source-linked receipt | Receipt exists; session identity still needs validation |

A provider accepting a run does not prove the worker read the message, completed a
task, or passed verification. A queue ACK is internal transport bookkeeping; it
must never be displayed as a recipient acknowledgement. Distinguish a claimed
recipient receipt from one verified through a trusted per-session identity mapping.

## Checked repository base and live evidence

Research branch: `cursor/agent-comms-6614`, initial research commit
`ccd3f7ef52c9929582b8f707149e3e394ccb18b8`, based on fetched deploy
`661492189a1876fe90d6cda6b3fcca335926d025`. Re-fetched deploy during this expansion:
`413aa6dd893c7b2f76dfd8e420a1cddfe09f69ce`; AGENTS.md and WORKERS.md have no diff
between those bases. No other session's checkout was pulled or switched.

Live authenticated read-only GitHub calls confirmed:

- Repository is public; default branch is `claude/f1-game-project-26h3ng`.
- Pages uses workflow publishing and already serves the game at its project URL.
  The API's legacy source field says `/docs`; it is not proof that a new directory
  will be published by the current workflow.
- There are 27 registered workflows, including CI, Land and Process dashboard.
  The nightly process dashboard writes a derived metrics branch; it is not a
  message bus or agent wake mechanism.
- Current tracked `dispatch.json` disables automated Cursor dispatch and has no
  independent Codex launch adapter. Do not enable either as a side effect of inbox work.
- Open PR #4252 owns MCP refinements and #4293 owns dispatcher work at inspection.
  Recheck ownership before implementing their integration seams.
- `CURSOR_API_KEY`, `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` were absent in
  this executor. This checks only those environment variable names, not every
  connected service/account. No independent provider session API is exposed here.

Three native workers independently researched backend failure handling, provider
APIs and repository integration. They share this host; they are not independent
Codex, Claude and Cursor sessions.

## Architecture choices

### A. First increment: no new hosted service

```text
agent -> current GitHub transport -> issue/PR comment
agent -> bounded reader -> local SQLite projection -> inbox summary + source URL
supported recipient route -> current GitHub transport -> explicit receipt record
```

Use a CLI contract before adding MCP registrations. Each index is disposable and
rebuilt from GitHub. No shared writable database, webhook installation or new
provider credential is necessary for this phase. An agent checks the inbox at
task start and relevant handoff/check-in points; the first implementation does not
claim unattended background delivery. Respect vendor restrictions: current Cursor
rules forbid comments on its own PR because they echo as wakes, and its token
cannot post issue comments. Do not make Cursor post an ACK through that route or
broaden its permissions. Use an already allowed handoff update or a verified
owning dispatcher relay where supported; otherwise mark recipient ACK unavailable.

### B. Shared read service when useful

```text
GitHub App webhook -> Worker ingress -> durable queue -> consumer -> D1 projection
GitHub API reconciliation -------------------------------^          |
                                                      read API / MCP
                                                           |
                                                agents + dashboard
```

Keep source messages and durable recipient receipts in GitHub. D1 accelerates
queries and exposes freshness; it does not own claims or task completion. Durable
delivery scheduling/outbox state is an additional operational-state decision under
the present GitHub-only contract: specify and review that exception before adopting
it. Do not quietly treat a database row as a new authoritative agent instruction.

D1 is suited to indexed repository-wide queries. Durable Objects offer private,
strongly consistent SQLite storage per object and can coordinate a live thread;
cross-object aggregation adds work. Do not deploy both without a measured need.
An ordinary SQLite file on an HTTP/static host is not a shared write API.
[D1](https://developers.cloudflare.com/d1/),
[DO storage](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/),
[SQLite over networks](https://sqlite.org/useovernet.html).

### C. Dedicated hosted mailbox, only after an explicit decision

Worker + D1 could become the durable message store, with GitHub holding linked
task/PR state. This reduces comment noise but changes the current message authority,
requires backup/recovery and introduces another service to operate. The migration
needs one canonical transport contract, an export path, and a cutover/rollback
plan. Avoid dual authoritative writes to GitHub and D1: no transaction spans both.
This is a later alternative, not a requirement for A or B.

## Message and API contract to prototype

One versioned envelope, represented as data in a GitHub comment, could contain:

```json
{
  "schema": "apex.message.v1",
  "messageId": "<stable UUID>",
  "repo": "brycejmurrin/f1-game",
  "thread": {"kind": "pull_request", "number": 4388},
  "recipient": "<registered logical route>",
  "kind": "handoff",
  "sourceSha": "<full source SHA>",
  "replyTo": null,
  "expiresAt": "<UTC timestamp>",
  "body": "<bounded plain text>"
}
```

Store GitHub actor, comment ID, URL and timestamps from the API, not from claimed
fields. Separate authenticated principal, logical recipient, provider session ID
and run ID. A shared GitHub account/App does not cryptographically identify which
agent authored the envelope. Per-session identity requires an actual trusted
credential-issuance/mapping mechanism; a `from: claude` string is insufficient.

Candidate operations, names illustrative until coordinated with the MCP owner:

| Operation | Behavior |
| --- | --- |
| `messages.list` | Recipient/thread filter, opaque cursor, bounded previews and freshness |
| `messages.get` | One full message, immutable source identity and current source state |
| `messages.status` | Stored, attempts, receipt identity/trust level, last sync and errors |
| `messages.send` | Later: validated envelope written through current GitHub transport |
| `messages.ack` | Later: explicit recipient receipt; never inferred from a read |
| `delivery.plan` | Optional dry-run route/ownership/budget check; no provider execution |

Proposed starting limits: 20 previews/page, 160 Unicode code points/preview,
16 KiB response ceiling and 8 KiB body ceiling. These are tunable design defaults,
not measured optima. Enforce UTF-8 byte limits separately from character limits;
return a continuation cursor rather than silently truncating a record. Do not
expose arbitrary SQL, caller-selected URLs or generic shell execution.

Same ID + same immutable envelope is a retry; changed content is a conflict.
GitHub comment creation has no application idempotency key in the proposed path:
after an ambiguous timeout, search/read back the stable message marker before
retrying. A race may still create duplicate comments; collapse by message ID and
report conflicting copies. Do not claim exactly-once writes. Comment edits are
new source versions; for automatic delivery prefer a new message ID for changed
instructions rather than delivering mutable text without a pinned version/hash.

## GitHub Actions and event routing

| Trigger | Proposed use | Constraint to test |
| --- | --- | --- |
| `workflow_dispatch` | First manual dry-run; controlled replay/reconcile | Trusted workflow/ref and validated IDs |
| `issue_comment` | Optional structured message hint | Default-branch workflow; exclude feedback receipts |
| `repository_dispatch` | External service requests one bounded reconciliation | Custom event allowlist; no raw executable payload |
| `workflow_run` | CI-result notification linked to exact PR head | Revalidate repo/head; privileged successor must not execute untrusted inputs |
| `schedule` | Repair missed events and refresh projections | Delays/drops possible; not real-time delivery |

These are candidate uses of documented events, not new workflows installed here.
Five minutes is the documented minimum schedule interval. Route small source IDs
and re-fetch current GitHub state rather than shipping transcripts in dispatch
payloads. [GitHub event reference](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).

Prefer a named `workflow_dispatch` to a generic repository dispatch for narrowly
scoped external control: fine-grained dispatch permission is Actions(write),
whereas repository dispatch requires Contents(write). Neither permission is free
authority to run arbitrary jobs. Use a short-lived GitHub App installation token
scoped to the needed repository/operations rather than sharing a human PAT.
[Workflow API](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event),
[Repository API](https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event),
[App installation auth](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation).

Do not assume a comment posted with an Actions `GITHUB_TOKEN` starts an
`issue_comment` workflow: ordinary token-generated events are suppressed.
Explicit workflow/repository dispatch are exceptions. Design explicit continuation
and loop guards; changing token type can change event propagation.
[Triggering workflows](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

Proposed runner separation:

1. Resolver uses trusted default-branch code and read-only GitHub access; parses
   bounded data, verifies source/recipient/ownership and produces a delivery plan.
2. Optional delivery job uses only validated identifiers and trusted code with
   narrow provider credentials. Re-check current ownership, expected head,
   expiry and budget immediately before a side effect.
3. Result writer records a bounded receipt with source and provider operation ID.
   An unknown result stays unknown until reconciled; it is not automatically resent.

No PR checkout, PR dependency installation, arbitrary artifact/cache execution,
or direct comment interpolation in a privileged job. Pin actions; start with
workflow-level `permissions: {}` and explicit job permissions. Keep Land and
`LAND_TOKEN` out of messaging. [GitHub secure workflow guidance](https://docs.github.com/en/actions/reference/security/secure-use).

Actions concurrency is not a durable FIFO mailbox. Serialize recipient side
effects in a durable delivery mechanism, and leave authoritative records available
for reconciliation when runs coalesce or fail. A newer event must not erase an
older message. Queue only IDs/hints; coalesce redundant refreshes. Never cancel
existing Actions runs as an inbox cleanup operation.

## Webhooks, recovery and database behavior

Validate the raw-body HMAC before parsing/routing; check repository, event/action,
body size and delivery ID. Return success within GitHub's timeout only after
durable acceptance. GitHub retains the delivery ID on redelivery and does not
automatically retry failed deliveries. Recovery needs authorized redrive plus
periodic source reconciliation. [Validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries),
[Best practices](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks),
[Failed delivery handling](https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries).

Cloudflare Queues is an at-least-once buffer without ordering guarantees; it is
not the message archive. Make projection updates idempotent, use a dead-letter
path for poison events, and treat incoming events as hints to current source
state. An old edit after a delete must not resurrect a comment; retain tombstones
and periodically reconcile known threads. Do not call an arbitrary 404 a deletion
until distinguishing revoked access, wrong scope and actual missing source.
[Delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/),
[Queue behavior](https://developers.cloudflare.com/queues/reference/how-queues-works/).

Start D1 reads on the primary. If replicas are later used, propagate Sessions
bookmarks and test read-after-write explicitly. Use prepared statements and short
indexed queries; validate the local SQLite probe's statements against remote D1
instead of assuming identical APIs. [D1 sessions](https://developers.cloudflare.com/d1/best-practices/read-replication/),
[Prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/).

Candidate projection tables: source comments/versions, envelopes, receipt-source
references and reconciliation progress. Candidate delivery subsystem tables:
attempts, recipient mappings, dedupe keys and outbox. The latter requires the
operational-state decision above. Do not copy the earlier scratch schema into
production: it deliberately omitted production authorization and full-envelope
idempotency validation.

## MCP compatibility and identity

Expose the same application operations through CLI, HTTPS and MCP rather than
implementing three different mailboxes. Prefer pull/list/get as the interoperability
baseline. Tool availability, successful transport and a useful result are separate
checks. Discover actual client support before enabling subscriptions or Tasks.

Important current-doc change: `/specification/latest` resolves to 2026-07-28.
Its Streamable HTTP removes protocol sessions and the standalone GET stream;
resource updates use `subscriptions/listen`. Older 2025 revisions use different
mechanisms, and repo probes currently request 2025-06-18. Pin versions and test
fallback rather than upgrading gateway code inside this planning PR.
[Current transport](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http),
[Resources](https://modelcontextprotocol.io/specification/2026-07-28/server/resources).

Tasks is an optional extension for durable long-running operation handles; it
does not give a server authority to start model turns. Notification arrival,
host context refresh and agent execution require separate acceptance tests.
[Tasks](https://modelcontextprotocol.io/extensions/tasks/overview).

Remote MCP clients may need OAuth discovery/consent while noninteractive service
clients use another supported credential route. Cloudflare Access service-token
headers are not automatically supported by every MCP host or equivalent to MCP
OAuth. Test the actual client authentication flow; do not promise one generic
header configuration works everywhere. [MCP auth](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization),
[Service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/).

## Provider delivery: different adapters, not a universal wake

All provider facts in this table are documented, not live verified here.

| Route | Documented continuation | Setup boundary |
| --- | --- | --- |
| Codex app-server | Resume/start accessible thread, start turn; steer active turn | Operated runtime and authorized thread; not arbitrary cloud chats |
| OpenAI Agents API | Managed session input starts/steers turns; stream/webhook observation | Separate API session and access/billing; not an existing Codex Cloud chat |
| Claude Agent SDK | Resume persisted session; stream multi-turn input | Runner owns transcript/workspace and process lifetime |
| Claude Managed Agents | Separate beta session/event service | Separate API/account/environment; not the current Claude web session automatically |
| Cursor v1 | Follow-up run; optional active steering | Authorized agent ID, repository scope and verified ownership |
| Native children | Host's exposed collaboration controls | Same team; IDs and lifecycle differ from provider sessions |

[Codex app-server](https://learn.chatgpt.com/docs/app-server),
[Claude SDK sessions](https://code.claude.com/docs/en/agent-sdk/sessions),
[Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview),
[Cursor endpoints](https://cursor.com/docs/cloud-agent/api/endpoints).

For **new API-managed workers**, OpenAI's Agents API is another documented route:
the managed Codex harness maintains sessions and can provision an OpenAI-hosted
sandbox. Session input starts an idle turn or steers an active one; documented
session event submission supports a stable idempotency key. Session webhooks and
scheduled automations can replace a custom always-running observer for supported
operations. This needs its own access check and bounded canary, not reuse of this
chat's native child IDs. Model/tool/sandbox API charges are distinct from assuming
an existing subscription session. [Overview](https://developers.openai.com/api/docs/guides/agents-api/overview),
[Session input](https://developers.openai.com/api/docs/guides/agents-api/sessions),
[Session webhooks](https://developers.openai.com/api/docs/guides/agents-api/sessions/webhooks).

Make this a real architecture fork: continue existing provider-owned sessions
through their supported adapters, or deliberately create new API-managed workers.
The second can simplify lifecycle control, but it introduces new environments,
credentials and billing. Do not silently substitute it for the first.

Codex app-server's authentication guidance limits its legacy authentication to
local/open-source uses, and points hosted integrations to Sign in with ChatGPT.
Select a supported integration/auth route for the intended deployment rather
than copying desktop ChatGPT tokens into Actions or a Worker. This is an auth
boundary, not a claim that the app-server runtime itself cannot be hosted.
[Auth endpoints](https://learn.chatgpt.com/docs/app-server#auth-endpoints),
[Sign in with ChatGPT integration](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server).

Cursor v1 currently says webhooks are coming soon; legacy v0 webhook documentation
must not be applied to v1. An active run can reject follow-up as busy; uncertain
submission must be read back rather than blindly retried. The current local
Cursor client requires its own launch receipt in ignored
`artifacts/cursor-launched.json`. A fresh Actions runner lacks it: never populate
that allowlist from arbitrary discovered IDs. Design a trusted durable ownership
receipt/adoption route, or leave delivery on the original owning runner. Do not
pass replacement MCP settings as an incidental part of a message follow-up.

The existing dispatcher already emits `NUDGE_SESSION`; integrate there after
ownership review. It does not gain provider connectivity by running in Actions.
Preserve its locks, caps, cooldown, pause controls and foreign-session protection.
Provider IDs, task IDs and GitHub comment IDs must remain distinct.

For bounded new tasks, Actions can run an agent rather than continue an existing
session. Official Codex/Claude Actions and GitHub Agentic Workflows are candidates.
`gh-aw` compiles Markdown into Actions and offers separated validated safe outputs;
it is not a mailbox or a migration of existing chats. Compare a tiny read-only
workflow against a plain script before adding its compiler/configuration surface.
Use no LLM for routing, dedupe or reconciliation. [Codex Action](https://github.com/openai/codex-action),
[Claude Action](https://github.com/anthropics/claude-code-action),
[Agentic Workflows](https://docs.github.com/en/actions/tutorials/develop-agentic-workflows-in-github-actions),
[Safe outputs](https://github.github.com/gh-aw/reference/safe-outputs/).

## Dashboard and credential setup

Prefer a separate dashboard repository and origin; two independent publishers
must not replace the game's Pages artifact. A different project path on the same
`github.io` host is not a separate browser origin. An approved static public
snapshot is simplest. A private live view needs an authenticated API and deliberate
browser login/visibility design; putting it in a private repository does not by
itself establish a private site. [Pages model](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

Render message bodies as text, link to source, and show last successful sync,
source head, stale/error state and receipt meanings. Never put agent tokens,
provider keys or unredacted private payloads in assets/URLs. Start with JSON;
browser SQLite adds persistence/header compatibility work without shared writes.
The service should enforce user/repository access even when the frontend is public.

Proposed setup inventory (prepare before activation, not secrets to paste in chat):

- Repository/site owner, backend account/domain, staging and production separation.
- GitHub App installation permissions and webhook secret; no reuse of LAND_TOKEN.
- Separate service identities for agent API clients; user auth for the browser.
- Provider-specific credential, allowed recipient mapping and spend ceiling only
  for hosts whose delivery will be enabled.
- Retention/export/backup and a named operator for failed deliveries/dead letters.

OIDC can exchange short-lived Actions identity with a supporting service. A custom
Worker verifier would need validated issuer/audience/repository/ref/environment
claims; OIDC does not make a D1/Cloudflare deployment token appear automatically.
Compare this work with the chosen provider's supported deployment authentication.
[Actions OIDC](https://docs.github.com/en/actions/concepts/security/openid-connect).

## Measurements, budgets and rollout gates

Read-only API sample, one page per thread, maximum 30 comments, taken 2026-10-30:

| Thread | Rows | Raw response bytes | Bounded preview JSON bytes | Reduction |
| --- | --- | --- | --- | --- |
| Board #1780 | 19 | 93,305 | 5,932 | 93.6% |
| MCP PR #4252 | 7 | 34,427 | 2,172 | 93.7% |
| Fix PR #4311 | 1 | 3,830 | 309 | 91.9% |

Projection retained ID, updated time, URL and first 160 Python characters of body.
It omitted full bodies and API metadata. Full retrieval remains necessary on
demand. These are measured output bytes from a local transform, not a finished
index, tokenizer count, model savings or a cold/warm benchmark. Single request
times were 354/486/470 ms respectively; no distribution or latency claim follows.
Earlier local SQLite concurrency results are in the feasibility study.

Illustrative workload arithmetic, not measured usage: three continuously active
clients polling every five minutes make 864 checks/day; one shared reconciler at
that cadence makes 288, before pagination/conditional requests. A five-minute
Actions schedule also starts up to 288 jobs/day; at an assumed 30 seconds/job that
is 144 runner-minutes/day. This is not a bill estimate. Measure actual API calls,
rows read/written, queue operations, runner time and provider usage separately;
provider turns may dominate cost. Never create an LLM turn per receipt by default.

Suggested dependency-ordered implementation slices:

| Slice | Deliverable | Exit evidence |
| --- | --- | --- |
| 1 | Envelope fixtures + read-only CLI/local SQLite index | Bounded output, rebuild, edits/deletes, pagination and API-call/byte baseline |
| 2 | MCP read adapter | Actual list/get calls on each supported host; version/auth/fallback matrix |
| 3 | Manual dry-run Actions resolver | Trusted ref, scope checks, no provider secrets or side effects |
| 4 | Optional Worker/D1 read projection + webhook reconciliation | Signed-event fixtures; remote persistence; replay/outage rebuild; stale indicators |
| 5 | One ownership-preserving provider adapter | One authorized nonce acceptance + exact recipient ACK; idle/busy/unknown tests |
| 6 | Optional dashboard and automated hints | Credential-free build, origin/visibility tests, loop prevention and loss recovery |
| 7 | Remaining hosts and dispatcher integration | Independent canary per host; existing caps/ownership/gates preserved |

Slices 1–3 can be prepared without live provider delivery. Slice 4 is optional;
slice 5 can use the owning runner without requiring a shared backend. Do not build
all services before checking whether bounded GitHub readers solve the problem.

Acceptance fixtures: duplicate/out-of-order/edit/delete events; forged sender and
ACK; wrong repo; stale source SHA; expired message; unauthorized recipient; missing
ownership receipt; bot feedback loop; ambiguous write timeout; provider busy/403;
queue failure/poison event; revoked token; interrupted index rebuild; oversized or
malicious body; host without subscriptions. Tests must preserve a denied action
and must not execute message text as instructions to the delivery service.

Cold-start walkthrough: session reads current WORKERS and PR handoff, discovers
the actual inbox route, lists bounded summaries, retrieves one source, validates
ownership/head, records a receipt through a permitted vendor route (or explicitly
reports that route unavailable), does scoped work, verifies it and updates the
existing PR handoff. Restart walkthrough: missed events are repaired
from source; replay sends no second provider run; unknown acceptance remains
visible. Recipient acknowledgement never substitutes for task verification.

Rollout: local fixtures -> read-only shadow queries -> disposable authorized
one-message canary -> one host -> optional automation. Rollback disables new
delivery triggers/credentials, retains source comments and receipts, and rebuilds
or discards projections. It must not stop game CI, alter landing or delete source
messages. Propose exact hook/settings/permission-policy changes separately under
the existing explicit-approval requirements; this document changes none.

## Current verdict and remaining decisions

PASS: current primary-source reads, independent native-worker reviews, live
read-only GitHub repository/Pages/workflow checks and measured preview transform.
PASS from the earlier study: one-file local SQLite storage experiment.
NOT RUN: hosted D1/Queue/Worker, real webhook install/redrive, actual MCP mailbox
adapter, provider auth/nonce delivery, browser publication/login or production load.

Recommended default decisions: GitHub remains authoritative; local read tools
first; separate dashboard origin; pull as the compatibility baseline; no automatic
provider launch. Before activation decide owner/account/domain, data visibility,
recipient identity issuance, operational-state scope, spend/retention and which
specific host route is available. Implementation tasks and progress remain #4387
and the normal GitHub workflow, not this research document.
