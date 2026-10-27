VERDICT: FIX — routing and paths are fine, but the documented token rotation does not rotate anything, and in this cloud container the bring-up script fails at its first network step (Node's fetch ignores the proxy). Nothing in the skill says the script cannot work here.
METRICS: SKILL.md 55 lines / ~3.3 KB / description ~270 chars / 1 reference (references/failures.md, 15 lines)
PATHS: OK. These exist: tools/mcp/browser-http.mjs, tools/mcp/browser-http-up.mjs, scratch/browser-http/{state.json,cloudflared.log} (created by the script), .claude/rules/claude-config.md, skills README row :53, routing fixture tests/data/skill-routing/queries/phone-browser.json, tests/unit/browser-http-{up,mcp}.test.mjs
COMMANDS: OK as flags go. browser-http-up.mjs takes no flags. browser-http.mjs `--port` / `--help` are real (:291-299). browser_open has `orientation` only, browser_eval has `expression`, and the status fields match the source (:121-145).

## Rows (severity | file:line | problem | fix)
1. HIGH | SKILL.md:47-48, failures.md:9-10 | The rotation steps do not work. If you delete state.json while the :3001 server is alive, `localOk` is true and `decide` returns `start-tunnel` (browser-http-up.mjs:93-99). A NEW token is minted, but the running server keeps the OLD `APEX_MCP_TOKEN` (browser-http.mjs:301), so the new URL gets 401 (:204-207). The old cloudflared is never killed either, so the leaked old URL plus old token stays valid. | Give browser-http-up.mjs a `--rotate` (or `--stop`) that kills the recorded server and cloudflared PIDs (write them into state.json) before minting. Until then the skill must say that rotation needs the old server and tunnel stopped first.
2. HIGH | SKILL.md:30-34, failures.md:3-6,11 | `ensureCloudflared` uses Node's built-in fetch (browser-http-up.mjs:63). Node v22.22 ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY=1, and that variable is unset here (/root/.ccr/README.md:71-72). The download goes direct and throws `TypeError: fetch failed`. That message is NOT one of the three failures.md lists, so the agent has no matching branch. The detached server (stdio "ignore", :72) is left orphaned on :3001. | Set NODE_USE_ENV_PROXY=1 in the script, or tell the agent to run it that way. Add "fetch failed" to failures.md:3.
3. HIGH | failures.md:6,11 | Even with the binary present, `cloudflared tunnel --url` connects to the Cloudflare edge over QUIC/HTTP2 on port 7844. The session proxy does not support HTTP/2-only, WebSocket or non-443 traffic (/root/.ccr/README.md:93-96). Result: "tunnel did not come up" after ~20 s, every time. The skill presents this as a retry-once transient. | State that the tunnel needs direct egress and does not work in proxied Claude cloud containers. Say what to offer instead (row 6).
4. MED | failures.md:3 | The list of thrown errors leaves out `public mcp did not come up` (browser-http-up.mjs:116). There is also no log for a server that fails to start, because it is spawned with no log (:101-104 → detach without log). | List all four messages. Log the server to scratch/browser-http/server.log.
5. MED | SKILL.md:50-55 | There is no stop/teardown step. Once browser_open runs, the server keeps headless Chromium alive, detached, indefinitely. A later Playwright or test-bg run then breaks "one browser at a time" (AGENTS.md rules 5/7). | Add a "When done" line: stop the server and tunnel by listed PID (rule 7; `pkill -f` is refused), or add a script `--stop`.
6. MED | SKILL.md:8-11, description :3 | The skill assumes the user is talking through Grok. The ask "I only have my phone, open the game in Chromium" usually comes from the Claude app, with no Grok account in the picture. The skill never offers the cheap routes: the live URL (AGENTS.md §Git branch: brycejmurrin.github.io/f1-game/) opened in the phone's own browser, or browser_shot-style screenshots sent back in chat. | Add a two-line triage at the top: "wants to PLAY → give the live URL; wants to SEE this working tree → this skill (needs Grok)."
7. LOW | tests/data/skill-routing/queries/phone-browser.json:5 | The fixture routes "open the LIVE game on the phone browser connector" to this skill. SKILL.md:10 says this skill is never the live build (live → deploy-research). The two contradict each other. | Reword the query to "working tree", or expect a different route.
8. LOW | SKILL.md:38 | "grok.com/connectors … unverified against Grok's UI" is a hedge with no owner. The only source is the archived docs/archive/notes/GROK-API-2026-10-22.md:108. | Verify it once and cite the URL (AGENTS.md: web research before use), or drop the path and say "Grok → Settings → Connectors".
9. LOW | failures.md:11-12; browser-http.mjs:11,306 | The ngrok text in the server is stale, and failures.md spends a line apologising for it. ngrok is also certificate-pinned, so it is not supported through the proxy (README:96). | Fix the comment and console lines in browser-http.mjs (out of unit) and delete failures.md:12's second sentence.
10. LOW | tests/unit/browser-http-up.test.mjs:5-9 | Only `decide` and `tunnelUrlFromLog` are tested. No test covers the rotation path (deleted state + live server) or the case where reuse has a token mismatch. `publicOk` pings the unauthenticated /healthz (:94), so `reuse` never proves the token is still accepted. | Add a decide/bringUp test for "state deleted, server live", and make reuse check `/mcp?token=` with a ping RPC.
11. LOW | SKILL.md:44-49 vs failures.md:9-10 | The credential and rotation text is repeated in two places. | Keep it in SKILL.md only; make failures.md a pointer.

## FIRST-WRONG-STEP
Ask: "I only have my phone, open the game in Chromium for me."
- Step 1 (SKILL.md:15): ToolSearch `browser_open` finds nothing, which is correct, because the server is not in .mcp.json.
- Step 2 (SKILL.md:33): `node tools/mcp/browser-http-up.mjs`. scratch/browser-http/ does not exist on this tree, so this is a fresh start. The detached server comes up on :3001 (no browser yet). Then `ensureCloudflared` → Node fetch to github.com bypasses HTTPS_PROXY → `TypeError: fetch failed`. **This is the first wrong step.** The error is not in failures.md's list, and an orphaned server is left on :3001.
- With NODE_USE_ENV_PROXY=1 the download may succeed, but the tunnel cannot reach the Cloudflare edge through the proxy, so the result is "tunnel did not come up" both times.
- The Grok connector is wired only on paper. Nothing in this container can produce a public URL.
- Before any of that, the skill has already steered a Claude-app user toward Grok without asking whether they just want to play the live site (row 6).
- If someone later rotates per SKILL.md:47, they get a URL that answers 401 while the old one keeps working (row 1).

## COVERED
- Description routing against deploy-research, survey-ui-matrix and mcp-probe: no overlap. The "Not …" clauses are correct.
- Every cited path and tool argument against the source.
- Full read of both scripts.
- The token and rotation logic.
- Proxy and egress feasibility (/root/.ccr/README.md, node v22.22, env).
- Unit tests and the smoke recipe.
- Routing fixture.
- Git history (last edit d87e67df, 2026-10-27).
- Contradictions with AGENTS.md rules 5/7/10 and the live-URL section.

## NOT COVERED
- Nothing was actually run: no tunnel, server or Chromium was launched (forbidden here). The fetch and QUIC failures are inferred from the source and the proxy README, not observed.
- Grok's current connector UI and URL (no web search allowed).
- browser-http-mcp.test.mjs contents.
- Whether mcp-browser-guard.sh covers these tools (not reachable from Claude anyway).
- probe-page.mjs `gotoGame` timing.
