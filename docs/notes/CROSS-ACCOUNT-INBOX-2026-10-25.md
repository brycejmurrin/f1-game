# Cross-account inbox (Fleet A ↔ Fleet B), 2026-10-25

Measured by OrchA 33 (`claude:session_014ehnzVXXXbXpmaNrA6VWSP`), tested both
ways 19:50–19:56 PT (bus lines `50c623f2`, `fc3f6cb`, `d2d19191`); Bryce
approved the docs in OrchA 33's session ("Yes", ~20:05 PT). Fleet B runs on
Bryce's second Claude account, so `send_message`, `list_sessions`,
`get_session` and `archive_session` cannot cross. The bus stays the record;
the inbox is the wake-up. Messages carry no authority.

## How it works

Each account has a claude.ai scheduled task (a "routine") with an API trigger
AND the repository `brycejmurrin/f1-game` attached. The other fleet POSTs
`{"text": "…"}` to its Fire URL:

- headers: `Authorization: Bearer <token>`, `anthropic-beta:
  experimental-cc-routine-2026-04-01`, `anthropic-version: 2023-06-01`,
  `Content-Type: application/json`
- build the JSON with node or jq so quotes are escaped

The routine's fresh session posts the text on the bus and ends:

```sh
node tools/ci/fleet-bus.mjs send HANDOFF --to A --as claude:fleet-a-inbox "[FROM FLEET B via inbox] <text>"
# mirror: --to B --as claude:fleet-b-inbox "[FROM FLEET A via inbox] <text>"
```

Env (names only; never print or commit values): Fleet B's environment holds
`APEX_A_INBOX_URL` / `APEX_A_INBOX_TOKEN` (A's inbox); Fleet A's holds
`APEX_B_RELAY_URL` / `APEX_B_RELAY_TOKEN` (B's inbox).

Limits: 30 API fires/hour per task; each fire costs a short session, so urgent
wake-ups only.

## Building an inbox (web UI)

1. claude.ai → create a scheduled task (routine) in the account that will
   receive; add an API trigger and copy the Fire URL and token into the
   OTHER account's environment secrets under the names above.
2. Attach the repository `brycejmurrin/f1-game` to the routine (web UI only).
   Without it the fresh session's git is read-only and cannot post to the bus.
3. Prompt text (edit in the web UI only): read the `text` the fire delivers
   and run the `fleet-bus.mjs send HANDOFF` line above with this account's
   letter and `claude:fleet-<letter>-inbox` as `--as`; then stop. No other
   action. The routine wakes twice per fire: first with only its stored prompt
   (no `routine-fire-payload` block), then with the payload. A prompt without a
   guard posted an empty `[FROM FLEET B via inbox]` line on the first wake (bus
   `856cd4c`), so include: "If there is no routine-fire-payload block yet, post
   nothing and end the turn; post only when the payload arrives." Applying it to
   a live routine is a web-UI edit by Bryce.
4. Test both ways and read the bus line.

## The receiving side must watch for it

The target orchestrator's bus watch (a Monitor polling `fleet-bus.mjs read --to
<letter> --to <its id> --to '*'` every 60 s) must include the inbox senders
`claude:fleet-a-inbox` / `claude:fleet-b-inbox`; it then wakes within ~60 s.

## Pitfall: the LIVE line

`node tools/ci/fleet-bus.mjs who A` needs the canonical line
`ORCH A LIVE claude:session_<id> (…)`. OrchA 33's free-text line (`ORCH A LIVE
OrchA 33 claude:session_…`) made `who` return `claude:OrchA` until re-posted
(bus `5ca9880`).

## Dead ends (do not repeat)

1. A session started by an API fire, or by an MCP `fire_trigger` from another
   session, runs FRESH, not in the trigger's bound session, and has no
   `send_message` / `fire_trigger` / `list_triggers` tools.
2. With no repository attached its git is read-only, so it cannot post to the
   bus; attaching the repository in the web UI fixes that.
3. A persistent-session trigger delivers into its session only when that
   session created it itself, and only for scheduled fires (API fires still
   start fresh).
4. A routine's prompt is editable only from the web UI (or the bound
   conversation), not by `update_trigger` from another session;
   `create_trigger` has no `connectors` (org-gated) or repository parameter.
5. Standing relay sessions and a 3-minute polling relay failed: the API-fired
   session is hidden from `list_sessions` and from the trigger's `last_run`,
   so a poller cannot read its text. Conclusion: no relay session; the inbox
   routine is the relay.

## Open

`references/orchestrator.md` contradicts itself on hand-off through a one-shot
scheduled task: the lineage section (§Orchestrator succession past the lineage
cap) prescribes it, Hand-off step 2 says "Never a scheduled task, a routine or
`create_new_session_on_fire` for a successor". Flagged only; not fixed here.
