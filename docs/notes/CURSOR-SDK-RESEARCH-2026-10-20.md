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
