# Public-web research recipes

**Use when:** this recipe family is the narrowest match for the question.

**Verification:** record the exact command, target (local or deployed), and returned evidence.

**Writes/ownership:** read-only; the parent owns browser startup and serialized MCP use.

## Research recipes (public web — no Chrome)

Use these when the question is the **deployed** artifact or the **public web**.
For a long fetch/search that would flood the main context, delegate to the
`deploy-research` subagent (`.claude/agents/deploy-research.md`) instead of
inlining every page.

| Goal | Command |
|---|---|
| Live vs deploy tip | deploy-research: WebFetch `version.json` + `git show origin/<deploy>:version.json` |
| Confirm a marker shipped | deploy-research: fetch `js/<path>.js?v=<live hash>` then grep the unique string |
| External grounding | WebSearch / hosted TinyFish `search`, then fetch the best URLs |
| Box WITH egress only | `./tools/mcp/tinyfish-mcp.sh deploy-check --tip` / `deploy-js --marker RE js/<path>.js` (CLI, not attached; key from shell / gitignored `.env`, no tracked fallback) |

Do **not** use a public-web fetcher for the working tree (localhost). Do **not**
use Chrome DevTools MCP for `github.io` from this container (egress proxy).

**Upstream TinyFish quirk (measured 2026-08-17, hosted connector):
`create_browser_session` returns `session_id: "tf-<uuid>"`, but
`run_web_automation`/`run_web_automation_async` validate `session_id` as a
BARE UUID** — pass the id with the `tf-` prefix stripped or the call fails
`Invalid UUID` without ever reaching the session. Heavier goals from
`list_runs` history took 12–20 minutes, so poll `get_run` at the interval the
queue message suggests, not in a loop.

---