# Cursor SDK and Cloud Agents API: research for `tools/ci/cursor-agents.mjs` (2026-10-20)

Question: what do the Cursor SDKs and the Cloud Agents API offer that our CLI does not use, and which gaps are
worth closing? Method: Context7 (`/cursor/cookbook`, `/websites/cursor_api`, `/websites/cursor_cli`), TinyFish
page fetches and search, the OpenAPI spec, then three read-only live checks. Companion to
`CURSOR-AGENTS-API-PROBE-2026-10-19.md` (what works from a Claude cloud session).

## Sources (read 2026-10-20)

- TypeScript SDK: https://cursor.com/docs/sdk/typescript (`@cursor/sdk` 1.0.40; public beta since 2026-04-29,
  https://cursor.com/changelog/sdk-release)
- Python SDK: https://cursor.com/docs/sdk/python
- Cloud Agents API spec: https://cursor.com/docs-static/cloud-agents-openapi.yaml
- API overview, auth, limits: https://cursor.com/docs/api
- Webhooks (v0): https://cursor.com/docs/cloud-agent/api/webhooks
- CLI headless: https://cursor.com/docs/cli/headless, parameters: https://cursor.com/docs/cli/reference/parameters
- Cookbook examples: https://github.com/cursor/cookbook (agent-kanban, coding-agent-cli)
- Rate limits per key, not per team (staff, forum): https://forum.cursor.com/t/how-to-scale-cursor-api-usage/169111

## Measured live (read-only, existing fleet agent)

| claim | result |
|---|---|
| `X-RateLimit-*` headers on normal responses | **absent on a 200**; the spec lists `Retry-After` and `X-RateLimit-*` on 429 only. A client cannot pre-throttle, only back off. |
| stream retention | `X-Cursor-Stream-Retention-Seconds: 86400`: **a run's transcript expires 24 h after it starts** (spec: `410 stream_expired`). |
| `GET /v1/agents/{id}/usage` | returns `totalUsage`, `cost{rawCostCents,chargedCents}`, per-run rows, but **all zeros** for a plan-included cloud agent; the SDK docs say `chargedCents` is 0 for plan-included, BYOK and credit-grant usage. Not a spend meter here. |
| artifacts | `GET /v1/agents/{id}/artifacts` works and a fleet agent had already written a handoff file under `artifacts/`; download returns a 15-minute presigned S3 URL for a path under `artifacts/`. |
| list paging | `nextCursor` present; `limit` max 100; `prUrl` and `includeArchived` filters exist. |

## Gaps in our CLI, ranked

1. **`dump` aborts the batch on the first expired stream** (`tools/ci/cursor-agents.mjs`, the `stream` throw). With a
   24 h window, any dump of older runs dies at the first 410. It should skip with a typed `EXPIRED` line and say how
   many runs fell outside the window; dumps need running within a day of the run, which argues for a `dump` step at
   hand-back time.
2. **429 handling ignores `Retry-After`.** `api()` waits 5 s x 2^n. The spec documents `Retry-After`; honour it, cap it.
3. **`list` ignores `nextCursor`, `--pr` and `--include-archived`.** The `prUrl` filter finds the agent behind a PR
   directly, which the fleet needs; archived agents are hidden by default, so an archived worker looks deleted.
4. **No `wait`.** Callers poll `status` by hand (I did, twice). `wait <id> --timeout` printing the terminal status,
   plus `launch --wait`, replaces that. Polling is fine: the stream replays `status` on reconnect and
   `Last-Event-ID` resumes, but a poll needs no connection state.
5. **No `artifacts` / `artifact <id> <path>`.** A worker can hand back files without a PR comment; the presigned URL
   expires in 15 min, so download immediately into ignored `artifacts/`.
6. **No `usage <id>`.** Cheap to add, but see the zeros above: label it token counts, not spend.
7. **Launch options the spec has and we omit:** inline `mcpServers` (HTTP `headers`/`auth` stay server-side and out
   of the VM; stdio `env` enters it), `customSubagents`, `envVars` (cannot combine with a client `agentId`, which our
   idempotent create uses; trade-off to decide, not a free add), and `images`.
8. **Name the agent after the work.** `--name` exists; a `launch` from the fleet should pass the PR or issue, since
   `list` shows only the name.

## SDK-only or CLI-only, not in the REST spec

| feature | where | note |
|---|---|---|
| `cloud.metadata` string tags, returned by `Agent.list/get` | TypeScript SDK | not in the v1 REST create body; would let a fleet tag agents by PR or role. Needs the SDK or a spec update. |
| per-run `envVars` on `send()` (removed after the run) | TypeScript SDK | the REST run body has none; useful for rotating deploy tokens. Not for public repos. |
| `run.steer()` mid-run message | TypeScript SDK | **local runs only**; cloud always falls back to a follow-up. Cannot steer a cloud worker. |
| `auto-smart` Cursor Router, `optimize_for` | SDK, Teams and Enterprise | model catalog shows it only when enabled for the team. |
| `Agent.messages.list`, `Agent.prompt()` one-shot | SDK | `messages` is a namespace (`Agent.messages.list`), not a method. |
| `cursor-agent -p --output-format stream-json` | CLI | headless runs on the machine that runs it, with `--api-key`; in this container `status` said "Not logged in" even with a key, `models` worked. |
| self-hosted workers and pools (`cursor-agent worker`, `/v1/workers`, `/v1/pools`) | CLI and REST | personal "My Machines" workers need no Enterprise plan; pools need Enterprise plus a service-account key. Unevaluated: could run Cursor agents on our own box. |

## Webhooks

Documented as `statusChange` (only `ERROR` and `FINISHED`), HMAC-SHA256 in `X-Webhook-Signature`
(`sha256=<hex>` over the raw body), `X-Webhook-ID`, retried on non-2xx. The v1 create schema has no webhook field,
so it is v0-only, as `agent-fleet/references/adapters.md` already says. A cloud session has no inbound URL we own,
so polling `status` (one `list` per tick) stays the transport.

## Limits that bind a fleet

- Rate limits are per API key and default to 20 requests per minute per endpoint unless documented otherwise; the
  Cloud Agents API says only "standard rate limiting". Higher ceilings come from Cursor support (staff).
- One active run per agent: a second `POST /runs` is `409 agent_busy` and is not retryable until the run ends.
- Terminal but un-archived agents may keep occupying slots (third-party skill reference, unverified:
  https://github.com/JJJEEERRR/cursor-cloud-agent-skill/blob/main/cursor-cloud-agent/reference.md); archive on
  hand-back.
- `GET /v1/repositories`: 1 request per user per minute, 30 per hour (probe note).
- Billing: user keys bill the user's plan, service-account keys bill the owning team; both obey the account's
  on-demand setting, which refused every launch until it was enabled.

## Not verified

The "slot leak" claim, the self-hosted worker route, and whether `auto-smart` is available to this account. None was
exercised; none changes the ranked list above.

## Closed (same day, `tools/ci/cursor-agents.mjs`)

Gaps 1 to 6 are closed; each has a stubbed-fetch test in `tests/unit/cursor-agents.test.mjs`. Gap 7 (launch options)
stays open on purpose, and gap 8 is a caller convention (`--name`).

1. `dump` counts a 410 as `expired=N` and continues (`DUMP dir=... written= skipped= expired=`); other statuses throw.
2. `api()` honours `Retry-After` (seconds or HTTP date) via `retryAfterMs`, capped by `APEX_CURSOR_BACKOFF_CAP_MS`.
3. `list` follows `nextCursor` (100 per page), takes `--pr` (`prUrl`) and `--include-archived`.
4. `wait <id>` (exit 0 FINISHED, 1 ERROR/CANCELLED/EXPIRED, 124 timeout) and `launch --wait`.
5. `artifacts <id>` and `artifact <id> <path>`: path must be `artifacts/...` with no `..`; the presigned URL is fetched
   without the Authorization header into `artifacts/cursor-artifacts/<last8>/`.
6. `usage <id>`: token counts, not spend (plan-included agents report zeros); 403 `feature_unavailable` prints `UNAVAILABLE`.

## Transcript findings, 2026-10-20 (read with the tool itself; CORRECTED)

`cursor-agents.mjs dump` + `digest` over 56 retrievable runs (typed counts only, no bodies read).

**Correction.** The first version of this section, and the PR text that quoted it, counted `tool_call` *events*. One
call is several events with the same `callId` (running, running, completed), the tool name can change between them (an
`mcp` placeholder with empty args becomes `task`), and a transient error on a running event is replaced by the completed
one. Measured on these runs: 2,156 events but 678 distinct calls (3.2x). The figures from the event count were wrong:
"225 of 2,031 calls failed (11 %)", "172 `get_mcp_tools: Invalid arguments`", "retry storms in 8 runs, worst 16",
"344 discovery calls, 236 repeats" and "args elided on 36 % of calls". `digest` now folds events into calls
(`groupCalls`), and `transcript` reads the same way.

- **Failures, per call: 53 of 678 (8 %).** Most are `namespace "X" not found` for servers listed in `.mcp.json` but not
  attached in the VM (`Github`, `chrome-devtools`, `playwright-official`, `Browser-use`) and `mcp: ok:false endpoint is
  required` from `js-debugger` with no Chrome. Same failure back to back: worst streak 2, no run with 3 or more.
- **MCP discovery:** 92 `get_mcp_tools` calls, no exact repeat; args are elided on 3 % of calls once events are folded.
- **The retrievable sample is almost all MCP-survey agents**: 8 agents, 48 of the 56 runs and 637 of the 678 calls, all
  on the same question ("list the MCP servers"). That, not retries, is the case for the launch twin guard.
- **Edit results echo whole files**: `edit_file` results are 20 % of all stored result characters (435K of 2,147K),
  18 results over 20K; reads are repeated rarely (3).
- Hunters and PR owners are mostly gone: **43 of 45 of their runs were 410 expired**, all 37-50 h old; none younger than
  24 h was. The 2 old runs that answered 200 were cancelled and held only status, result and done (394 bytes). A client-side
  skip of runs older than the retention window loses nothing (`dump` does it, 5 min margin), and **a worker's transcript
  has to be dumped at hand-back, within a day**. This part came from run statuses and file sizes, not event counts.
- Not shown by this sample: how hunters and owners use tools, which is where the real cost is. That needs dumps taken at
  hand-back.

## Launch-time options built (gap 7), 2026-10-20

`launch` takes `--mcp-file F` (JSON array: stdio `{name, command, args?, env?}` or remote `{name, url, headers?, auth?}`),
`--subagent-file F` (JSON array of `{name, description, prompt, model?}`), and `--env NAME` / `--env-file F`;
`followup` takes `--mcp-file` (replaces the create-time inline servers for that run, per the spec). Shapes are from the
OpenAPI spec (`CreateAgentRequest`, `McpServer`, `CustomSubagent`); REST takes `mcpServers` as an array with a `name` per
entry, the SDK as a map.

- Secrets stay out of files, argv and output: MCP header, env and auth values may be `${NAME}` placeholders filled from
  our own environment, `--env NAME` reads the value from it, `DRYRUN` and `LAUNCH` print names and counts only, and a
  malformed JSON file gets a fixed message because `JSON.parse` quotes its input.
- Local refusals: `CURSOR_*` variable names, duplicate names, over-limit counts (50 servers, 20 subagents, 50
  variables, values 4096 bytes, prompt 8192 chars), a built-in subagent name (`explore`, `shell`, `debug`,
  `computerUse`, `cursorGuide`), a server with both or neither of `command`/`url`, credentials inside a URL, and
  `sse` (the capabilities page says cloud agents support http and stdio only).
- The spec forbids a client `agentId` together with `envVars`, which our idempotent create relies on. With
  `--env` the tool omits the id, does not retry a 5xx, records the id from the response, and resolves an ambiguous
  failure (5xx or a dropped connection) by looking the agent up by name; with no match it records nothing.
- Measured live (composer-2.5, read-only, `f1-game`): an agent launched with an inline stdio `apex-inline` server, one
  `--env` variable and one custom subagent reported the variable `set, length 11` (the planted length; the value was in
  no event of its transcript), `apex-inline` among its MCP namespaces with a read-only `apex_help` call OK, and
  `inline-prober` available. `wait` blocked until `FINISHED` (exit 0).
- Not verified: an HTTP remote server with `headers` or `auth` (no endpoint to point at), `followup --mcp-file` live,
  and whether `envVars` is silently ignored on an account where the beta is off (here it was delivered).

## Agent-to-agent, and MCP attach: read from a 15-run chat (`Mcp server listing`, 2026-10-20)

Source: `cursor-agents.mjs dump` of one agent that a person followed up 14 times in 45 minutes about why cloud agents
miss MCP servers; read by its final replies and its `task` tool calls (no secret read: dashboard JSON appeared only as
shapes with masked placeholders).

- **Correction to the messaging answer above.** A cloud agent can launch another cloud agent: its `task` calls carried
  `environment: SUBAGENT_EXECUTION_ENVIRONMENT_CLOUD`, two new `bc-` agents appeared while that run was in progress
  (created 21:01:40 and 21:01:47Z, env cloud, repo `f1-game`, names matching the task descriptions), and the call
  returned the child's conversation to the parent (4 calls, 283 s, so it blocks). A later call carried `resume`, which
  continues a subagent the parent launched: parent-to-child messaging exists; child-to-parent is only its final reply.
  Our own survey agent (launched through the API) reported `Task` as local-only, so the tool may differ by how an agent
  was started; not tested.
- **The MCP attach set is frozen at agent start.** A dashboard fix does not reach a running agent, and a local subagent
  inherits the parent's set; a cloud subagent or a new agent gets the current one. In the chat the three tree servers
  (`apex-tools`, `apex-lsp`, `js-debugger`) attached and the browser pair did not, until the dashboard entries were
  fixed: `chrome-devtools` used `start` (the script has only `run`), `playwright-official` used `Bash`, and one brace was
  missing. Our docs say `run` everywhere; the error was in the typed config.
- **Project `.mcp.json` is not auto-loaded in cloud runs** and `mcpServerAllowlist` only permits a launch string, it does
  not attach anything. Inline `mcpServers` at create (built in this PR) is the programmatic equivalent of the launch
  checkboxes; it is replaced per run, so a follow-up that needs the servers passes them again (`followup --mcp-file`).
- **Named environments are an API object**: `POST /v1/environments` takes `environmentJson` (a string, the
  `.cursor/environment.json` schema: `install`, `mcpServerAllowlist`), and create takes `env: {type: "cloud", name}`
  (`repos` is mutually exclusive with a named environment) or `{type: "pool"|"machine", name}` for self-hosted workers.
  Not built: `launch --environment NAME` and an `env` verb group.
- Unverified: a `task` call from an API-launched agent with `environment: cloud`; why the subagent probes read `loading`
  for five servers while a fresh agent saw them attached.
