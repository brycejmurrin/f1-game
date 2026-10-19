# Cursor Cloud Agents API probe (CURSOR-API-2), 2026-10-19

Question: which Cursor agent-management operations work from a Claude cloud
session, so the fleet can coordinate Cursor agents without PR comments (fleet
bus, PR #3026)? Probed with `CURSOR_API_KEY` from the environment. The key value
was never printed, logged or committed; only HTTP codes and response key names
below.

## Docs (read 2026-10-19)

- https://cursor.com/docs/cloud-agent/api/endpoints (endpoint reference)
- https://cursor.com/docs/cloud-agent/api/overview (auth, limits)
- Third-party v0 listing (stop/followup/conversation names): https://docs.litellm.ai/docs/pass_through/cursor

Base URL `https://api.cursor.com`. Auth: Basic (`-u KEY:`) or `Authorization:
Bearer KEY`; Bearer used here. Current API is **v1**; v0 routes still answer.
Lists default to 20 items, max 100. Only one run is active per agent (a second
returns `409 agent_busy`). `/v1/repositories` is documented as "very strict":
1 request/user/minute, 30/hour. No other rate limit is documented. The docs
state no pricing; `GET /v1/agents/{id}/usage` returns token usage per run and
(observed) a `cost` object.

## Results

| op | request | HTTP | verdict |
|---|---|---|---|
| key info | `GET /v1/me` | 200 | works. Keys: apiKeyName, userId, createdAt, userEmail, userFirstName, userLastName (a **user-scoped** key, so it carries Bryce's identity and reach) |
| models | `GET /v1/models` | 200 | works. `items` (46), each id/displayName/aliases/variants. Includes claude-haiku-5-5, gpt-5.4-nano, `default` |
| repositories | `GET /v1/repositories` | 200 | works. `items` (11), each `{url}`. Rate limit 1/min, 30/h: cache the answer |
| list agents | `GET /v1/agents?limit=5` | 200 | works. `items` + `nextCursor`. Item keys: id, name, status, env, repos, url, createdAt, updatedAt, latestRunId, autoCreatePR, workOnCurrentBranch, openAsCursorGithubApp, skipReviewerRequest |
| get agent | `GET /v1/agents/{id}` | 200 | works (same keys as a list item) |
| list runs | `GET /v1/agents/{id}/runs` | 200 | works. Run keys: id, agentId, status, createdAt, updatedAt, durationMs, git |
| usage | `GET /v1/agents/{id}/usage` | 200 | works. Keys: totalUsage, cost, runs |
| conversation | `GET /v0/agents/{id}/conversation` | 200 | works (v0 only; no v1 route documented). Keys: id, messages (list) |
| launch | `POST /v1/agents` (haiku-5-5, env cloud, f1-game, autoCreatePR false) | **400** | **blocked**: `usage_limit_exceeded`, "On-demand usage is required. Enable on-demand usage ... dashboard settings". Billing, not auth or payload |
| follow-up | `POST /v1/agents/{id}/runs` | not run | untested: needs an agent this probe launched; none exists |
| stop | `POST /v1/agents/{id}/runs/{runId}/cancel` (v0: `/stop`) | not run | untested, same reason |
| delete | `DELETE /v1/agents/{id}` (also `archive` / `unarchive`) | not run | untested, same reason |

Only reads touched pre-existing agents (agent metadata, runs, usage, one
conversation, no content kept); no existing agent was messaged, stopped,
archived or deleted. Zero agents were created (launch refused), so nothing to
clean up.

## Limits, cost, security

- **Cost / blocker.** Launch and (very likely) follow-up need Cursor on-demand
  usage enabled on Bryce's account. Reads are free of that gate. Bryce must enable
  on-demand usage (and ideally set a spend cap) before any write op works.
- **Scope.** The key is user-scoped: it can list, read the conversations of,
  and (once launch works) message, stop and delete **every** agent Bryce owns,
  including DAD. A service-account key, if Cursor offers one for the team, would
  narrow identity but not agent reach; the fleet rule "touch only agents you
  launched" must be enforced in the tool, not by the key.
- **Storage.** Lives only in the cloud environment's secrets. Never in the repo,
  a PR body, a log or a transcript; pass as `"$CURSOR_API_KEY"` in a header only.
  `/v1/me` returns the owner's email and name: do not echo that response.
- **Conversation reads are sensitive** (prompts, code, possibly secrets): the
  tool must print counts and the last message's role and length, never bodies.

## Integration map (findings only, not built)

a new `cursor-agents.mjs` CLI in the tools/ci folder (not yet built), Node 22 `fetch`, no dependencies, key read from
`process.env.CURSOR_API_KEY` (exit 2 `BLOCKED no key` if absent), 20 s timeout,
one retry on 429/5xx honouring `Retry-After`.

- `list [--limit n]` -> one line per agent: `AGENT <id> <STATUS> <repo> <updatedAt> "<name≤40>"`.
- `status <id>` -> `AGENT <id> <STATUS> run=<latestRunId> runs=<n> durMs=<d> cost=<usd|n/a>`.
- `followup <id> --text "..."` -> `FOLLOWUP <id> run=<runId> <HTTP>`; refuses with `BUSY` on 409 and
  refuses any id not in an allow-list file (an allow-list file under the ignored artifacts folder, written by `launch`).
- `last <id>` -> `LAST <id> role=<r> chars=<n>` (v0 conversation, never the body).
- Later verbs (`launch`, `cancel`, `delete`) only after on-demand usage is on; `launch` records the
  id in the allow-list, `cancel`/`delete` accept only allow-listed ids.
- Fleet bus (#3026): map each Cursor agent to a bus peer `cursor:<id>`; a poll of `list` (one call
  per 3 min, within the watcher cadence) emits a bus event only when `status` or `latestRunId`
  changes; a bus message to `cursor:<id>` becomes `followup`; `409 agent_busy` is queued and retried
  on the next poll. The PR-comment path stays as the fallback for repos or agents the key cannot see.

## Recommended next step

1. Bryce enables Cursor on-demand usage (with a cap) so launch works, then re-run only the write test
   (launch haiku/nano on f1-game, status, follow-up, cancel, delete on that agent) in a short follow-up.
2. Meanwhile read-only coordination already works: build `cursor-agents.mjs` `list|status|last` first.
