# When browser-http-up.mjs fails or the address looks dead

- It throws one of: "fetch failed" or "could not download cloudflared" (the download), "browser mcp did not come up"
  (the :3001 server; its log is `scratch/browser-http/server.log`), "tunnel did not come up" (the tunnel log, `LOG`
  in `tools/mcp/browser-http-up.mjs`, under `scratch/browser-http/`), "public mcp did not come up" (a tunnel host
  was printed but its `/healthz` never answered), or "a server is live on :3001 with no recorded token" (state was
  deleted under a running server: stop it by its listed PID, AGENTS.md rule 7). Read the matching log, retry once.
- In a proxied Claude cloud container both network steps fail by design, not by chance: Node's `fetch` ignores
  `HTTPS_PROXY` unless `NODE_USE_ENV_PROXY=1` (so the download throws "fetch failed"), and `cloudflared` needs
  direct egress to Cloudflare's edge (port 7844, QUIC/HTTP2), which the session proxy does not carry
  (`/root/.ccr/README.md`). Do not retry there: say plainly the tunnel cannot start from this container, and
  offer the live URL (SKILL.md §First, which route).
- A run that failed after starting the server leaves it detached: `node tools/mcp/browser-http-up.mjs --stop` stops
  whatever the state file recorded; an unrecorded one is stopped by its listed PID.
- A fresh container has no saved state, so `new` is the expected result there; `reuse` only follows a run in the
  same checkout. The script can take ~20 s; it leaves the tunnel and server detached.
- Token rotation and teardown: SKILL.md §The tunnel URL is a credential.
- After they re-paste it, `browser_status` is the cheap check that the connector answers; `browser_open` takes
  `orientation` (`landscape` | `portrait`).
- The page is an emulated phone on software GL, not the user's GPU: no evidence about their real rendering.
