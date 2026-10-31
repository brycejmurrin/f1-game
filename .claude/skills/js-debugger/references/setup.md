# js-debugger setup

Moved out of SKILL.md so the recipe stays on top. Read when the daemon is down, the tools are not attached, or no Chrome is running.

Requires Node 22+ and Bash for the wrapper. The debugger itself needs no npm
package; source navigation and the game launcher need the checkout dependencies
(`npm ci` on a fresh checkout). See [bootstrap and host attachment](../../../docs/AGENT-SURFACE.md#bootstrap-auto-setup).
Prefer attached `debugger_*` tools when the session lists them. Otherwise inspect
the local schemas without a daemon or browser:

```sh
bash tools/mcp/js-debugger-mcp.sh list-tools
bash tools/mcp/js-debugger-mcp.sh status
```

A down status is expected before setup. If no daemon exists, start
`bash tools/mcp/js-debugger-mcp.sh serve-http` in one owned terminal and keep it
alive between independent `call <tool> '<JSON object>'` clients. Do not start a
second controller. `APEX_DEBUGGER_PORT` selects the bridge port on daemon and
callers; the Chrome CDP endpoint is a separate address supplied by its owner.
Starting a process does not attach tools to the chat; project MCP changes need
client reload/trust. After an edit to `tools/mcp/js-debugger-*.mjs` (`apex_status`'s
`server.stale` watches only apex-tools' own files): restart the MCP (client reload or `/mcp`)
and the owned `serve-http` daemon (Ctrl-C, start again), then re-attach; every
old pause token dies with it. Never edit global agent instructions for this workflow.

## Get a Chrome to attach to (the launch line)

```sh
node tools/mcp/debug-chrome.mjs start --headless-game
node tools/mcp/debug-chrome.mjs status
```

This starts the static server on 3456 and headless Chromium on 9222 at 844×390
with touch (`--device desktop` selects 1280×720); it refuses beside a test run.
`--headless-game` suppresses game drawing for logic hunts on software GL; omit
it when pixels are required. Reuse an existing authorized browser instead of
starting another. The launcher is a CLI (MCP: `apex_debug_chrome`); the debugger
never launches Chrome. With it running, `debugger_targets`/`attach` need no `endpoint`.

Once the browser is ready, check daemon health and discover targets (attached
MCP users make the equivalent `debugger_targets` call):

```sh
bash tools/mcp/js-debugger-mcp.sh status
bash tools/mcp/js-debugger-mcp.sh call debugger_targets '{"endpoint":"http://127.0.0.1:9222"}'
```
