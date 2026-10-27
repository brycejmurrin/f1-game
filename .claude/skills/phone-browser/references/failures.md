# When browser-http-up.mjs fails or the address looks dead

- It throws "could not download cloudflared", "tunnel did not come up" or "browser mcp did not come up".
  Read the tail of the tunnel log (`LOG` in `tools/mcp/browser-http-up.mjs`, under `scratch/browser-http/`), retry once.
- Still failing: tell the user in plain words that the tunnel could not start and that you will retry; never ask
  them to run anything. The download needs outbound GitHub access through the session proxy.
- A fresh container has no saved state, so `new` is the expected result there; `reuse` only follows a run in the
  same checkout. The script can take ~20 s; it leaves the tunnel and server detached.
- The printed URL carries a secret token (SKILL.md §The tunnel URL is a credential): user only; rotate by deleting
  `scratch/browser-http/state.json` and re-running.
- No outbound GitHub (cloudflared download refused): there is no fallback tunnel; say so plainly. The comments in
  `tools/mcp/browser-http.mjs` still say ngrok — the script uses cloudflared (trycloudflare); trust the script.
- After they re-paste it, `browser_status` is the cheap check that the connector answers; `browser_open` takes
  `orientation` (`landscape` | `portrait`).
- The page is an emulated phone on software GL, not the user's GPU: no evidence about their real rendering.
