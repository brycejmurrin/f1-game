# Agent transport adapters

## Native team

Use host collaboration calls directly. This conversation's team is distinct from vendor session lists. For a setup probe, give one worker read-only instructions, ask it to message READY, send `SETUP-PING <nonce>` using a follow-up, and check for the exact `SETUP-PONG <nonce>`. Do not launch unrelated game work as a transport test.

## GitHub connector fallback for the existing fleet bus

Use `scripts/github-fleet.cjs` at the plugin root. It is a small dependency-free module accepting three authenticated callbacks matching the discovered GitHub connector schemas:

```js
const { createFleetBridge } = require("/path/to/plugin/scripts/github-fleet.cjs");
const fleet = createFleetBridge({
  fetch: args => githubFetch(args),
  createCommit: args => githubCreateCommit(args),
  updateRef: args => githubUpdateRef(args),
});
const window = await fleet.read({ limit: 25, sinceSha: lastSeenSha,
  to: [actualSessionAddress, "#1234"] });
// Only after the user's requested coordination authorizes the message:
const receipt = await fleet.send({ type: "HANDOFF", to: recipientAddress,
  from: actualSessionAddress, text: "One bounded task and its evidence" });
```

`githubFetch`, `githubCreateCommit`, and `githubUpdateRef` above are callback placeholders, not invented host tool names. Bind the actual tools after discovering their schemas. In code-mode orchestration, load the packaged helper as trusted plugin code using the host's supported file/code-loading mechanism, and bind to the exposed connector. The helper does not read tokens or acquire shell credentials.

On hosts without module loading, use the same sequence directly through connector calls:

1. GET `/repos/brycejmurrin/f1-game/git/ref/heads/claude/fleet-bus`. Verify the exact ref and retain head H.
2. GET `/repos/brycejmurrin/f1-game/git/commits/H`. Verify H and retain its tree T.
3. Create a single-parent Git commit using parent H, unchanged tree T, and one typed message line.
4. Update only branch `claude/fleet-bus` to the created commit, with `force:false` and `expected_sha:H` when the connector supports that lease.
5. Read back the ref. A changed branch after successful appending is checked with compare/ancestry. Retry a rejected update only after observing actual concurrent branch movement, at most three attempts. A permission failure is not a race.

The message shape is `HANDOFF to:<address> from:<host:session-id> <text>`; supported informational types are READY, GREEN, BLOCKED, HANDOFF, DONE and INCIDENT. Lease modifications and GAME-SLOT claims stay with the repository's guarded tools. Recipient IDs come from live host evidence or existing verified fleet blocks. A 24-hex claims hash is not a session address.

The adapter never changes game files, creates branches, force-updates refs, or modifies the existing bus tree. `RECORDED` confirms the append, not recipient acknowledgement. The branch is public; keep coordination messages free of credentials and private data. Read windows are capped at 100 commits. `continuity:GAP` means the requested cursor was not found; preserve the gap and retrieve the missing bounded history before treating the read as complete.

Source: [GitHub refs API](https://docs.github.com/en/rest/git/refs), checked 2026-10-19. The existing repo's `tools/ci/fleet-bus.mjs` and fleet rules remain authoritative.

## External provider launch

For Claude Code, use create/list/message session tools only if actually exposed and authenticated. Same-account service restrictions still apply. For Cursor, the checkout's `tools/ci/cursor-agents.mjs` is read-only; it cannot launch or message agents merely because a key exists. Consult current Cursor API docs before adding write operations. For independent Codex Cloud tasks, use a supported environment/task connection; native collaboration is not that connection.

If a provider is missing, prepare the supported adapter and tell the user the precise remaining connection requirement. Never print credentials or request secrets pasted into chat. Do not install a CLI just to suggest that subscription authentication has been supplied. OpenAI API agents and subscription Codex Cloud tasks have separate setup and billing; do not silently substitute one for the other.

Source: [Codex Cloud](https://learn.chatgpt.com/docs/cloud) and [cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environments), checked 2026-10-19.
