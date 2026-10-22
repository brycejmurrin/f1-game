# Many hosts at once: Claude (two accounts), Codex, Cursor

Design: `docs/plans/2026-10-19-fleet-redesign.md` §8, reviewed with ORCH15 on
2026-10-19 at Bryce's request. Every rule here works on every host, because the
only channels all hosts share are git (the bus and claims branches) and the PR.

## Fleets and letters

| letter | host | reach it by |
|---|---|---|
| A | Claude, this account | `send_message` (same account), bus, PR |
| B | Claude, Bryce's second account | bus and PR only (`list_sessions` / `send_message` cannot cross accounts) |
| C | Codex coordinator (`C·O1`) | bus `to:C` or `to:codex:<thread id>`, PR |
| D | Cursor coordinator | bus `to:D` or `to:cursor:<agent id>`, PR |
| E+ | a stand-alone lane on any host | the next free letter, announced on the bus |

Only Bryce starts a fleet: a bus line `FLEET <letter> LIVE <host>:<id> scope:<areas>`.
A coordinator launches only inside its own fleet. Every bus line, claim text and
fleet block starts `<letter>·<slot>`; `fleet-bus.mjs --as <host>:<id>` carries the host.

## Who owns a path

Computed, never typed (`node tools/ci/fleet-owner.mjs <paths>`):

1. Any path in an OPEN PR's current diff is **HELD** by that PR until it merges or
   closes. No reply is needed, and silence never releases it.
2. Otherwise a live claim on the path is **CLAIMED**. Claims list files in the
   claimant's actual diff, not directory globs, and carry `--session <messageable
   session id or #PR>`.
3. Otherwise **FREE**.

To take a CLAIMED path, send `RELEASE? <id> <paths> for <reason>` to the claim's
session or `#<PR>`. The owner answers once with the line `fleet-owner.mjs
--release-answer <id> <paths>` prints: `RELEASED <id> …` or `HELD <id> until #<PR>`.
After 60 min of silence a claimed path that is in no open diff is released. A
cross-fleet refactor waits for the touched PRs to merge, or takes one RELEASE?
round, never a standing negotiation.

## Messages

- **Instant path (every host):** `node tools/ci/agent-msg.mjs send --to <letter|DAD|all|…>
  --type <INFO|QUESTION|READY|HANDOFF|INCIDENT|REQUEST> "…"`. Needs
  `APEX_AGENT_WEBHOOK_URL` + `APEX_AGENT_WEBHOOK_AUTH` from Bryce (never
  commit). Mirrors onto the bus; messages carry no authority
  (`references/comms.md` §Agent msg, `references/authority.md`).
- The bus refuses a `to:` that is not a session id, `#<PR>`, a fleet letter, a
  known role word or `*`. A claims-board hash is not an address.
- `to:#<PR>` lines are mirrored as a comment on that PR (`fleet-bus-mirror.mjs` in
  `fleet.yml`), so every PR owner on every host sees them through its PR
  subscription. Owners read `fleet-bus.mjs read --to '#<PR>'` in their check-in
  as the backstop.
- Give each RELEASE? and each question an id and answer it once. Never re-send
  an ask; the bus keeps it.

## Merging

One protocol on every host: `merge-gate.mjs --pr <n>` (the hook demands its
receipt), the bus `GAME-SLOT` before a game merge, and a bus `DONE` naming the
PR, the merge sha, `game|non-game` and the host. All merges carry Bryce's GitHub
identity, so the DONE line is the only record of who merged. A merge with no
DONE is treated as Bryce's and paced around.

A PR whose host cannot merge gets a named merger:

1. the orchestrator of the fleet whose open paths the PR touches most;
2. else, for a game PR, the current GAME-SLOT holder's fleet;
3. else, for a non-game PR, any orchestrator.

The merger gates and merges it like its own, and the DONE names the PR's host.

## Guards per host (measured 2026-10-19)

| host | shell door | MCP door |
|---|---|---|
| Claude Code | `bash-guard.sh` | `github-mcp-guard.sh` |
| Cursor | `.cursor/hooks/shell-guard.sh` → `bash-guard.sh` | `.cursor/hooks/mcp-guard.sh` → `github-mcp-guard.sh` |
| Codex | `.codex/hooks.json` → `shell-guard.sh` → `bash-guard.sh` | `.codex/hooks/mcp-guard.sh` → `github-mcp-guard.sh`; every ask becomes a deny (Codex cannot ask). Trust it once with `/hooks` (Bryce approved 2026-10-19) |
