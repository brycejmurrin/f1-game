# Agent transport adapters

## Native team

Use host collaboration calls directly. This conversation's team is distinct from vendor session lists. For a setup probe, give one worker read-only instructions, ask it to message READY, send `SETUP-PING <nonce>` using a follow-up, and check for the exact `SETUP-PONG <nonce>`. Do not launch unrelated game work as a transport test.

## Cross-session coordination (GitHub)

The checkout's `docs/WORKERS.md` is the one home: issues are tasks, labels are state, the PR body is the only hand-off and comments are the only inter-agent message. Use shell `gh` when authenticated, else the discovered GitHub connector's issue, label, pull-request and comment calls. There is no fleet-bus branch or bus helper; never append commits to a coordination ref. A posted comment confirms the write, not recipient acknowledgement.

## External provider launch

For Claude Code, use create/list/message session tools only if actually exposed and authenticated. Same-account service restrictions still apply. For Cursor, inspect the current checkout's `tools/ci/cursor-agents.mjs --help`: it supports reads, launch and follow-up, plus lifecycle controls restricted to agent IDs recorded by that tool's launch. A configured key does not prove authentication or authorize a launch. Check `tools/ci/dispatch.json` for automated host enablement and `docs/WORKERS.md` for the lane contract; a disabled dispatcher route does not remove the client's capabilities. For independent Codex Cloud tasks, use a supported environment/task connection; native collaboration is not that connection.

If a provider is missing, prepare the supported adapter and tell the user the precise remaining connection requirement. Never print credentials or request secrets pasted into chat. Do not install a CLI just to suggest that subscription authentication has been supplied. OpenAI API agents and subscription Codex Cloud tasks have separate setup and billing; do not silently substitute one for the other.

Source: [Codex Cloud](https://learn.chatgpt.com/docs/cloud) and [cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environments), checked 2026-10-19.
