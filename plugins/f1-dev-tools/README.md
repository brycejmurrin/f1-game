# F1 Dev Tools

A private skills plugin for Apex 26 / brycejmurrin/f1-game. Provides five workflows with executable helpers: scene reproduction, camera inspection, visual comparison, WATCH replay transition checks, and preset preview/export. The manifest advertises the repository MCPs that make those workflows reproducible.

Select this plugin in a coding session with the game checkout and browser execution available. Its skill reuses the game's existing Apex MCP server, browser integrations, camera tuner and production replay API. It needs no new hosted service or credentials. It does not add a new MCP server or run local game tools from a chat without an execution environment.

The browser helper is under `skills/f1-dev-tools/scripts/browser.js`; the Node comparison/report tool is alongside it. Instructions, examples, compatibility limits and the existing frozen cockpit capture caveat are in the skill's workflow reference.

## Existing MCPs

The plugin consumes the three MCP servers already configured by the game checkout; it does not start a second copy or add a hosted service. See [`docs/AGENT-SURFACE.md`](../../docs/AGENT-SURFACE.md) for the checkout-wide MCP catalog and concurrency rules.

| Server | Use | Fallback when the MCP is unavailable |
|---|---|---|
| `apex-tools` | `apex_status`, `apex_catalog`, `apex_doctor` and deterministic Apex probes | `bash tools/mcp/apex-tools-mcp.sh call <tool> '{}'` |
| `playwright-official` | Serialized navigation, DOM assertions and screenshots | The repository Playwright probe after reading `.claude/skills/mcp-probe/SKILL.md` |
| `chrome-devtools` | Serialized live-page console, network, heap and performance inspection | The repository Chrome/Playwright harness documented by the checkout |

Use one browser server and one browser process at a time. The repository MCP configuration is the source of truth; the plugin advertises these names for routing and does not install or launch them.

## Setup behavior

When the checkout is local, run the existing idempotent bootstrap before the first probe:

```sh
bash tools/env/ensure-mcp-ready.sh
```

It verifies the Apex wrapper, runs the MCP smoke checks, and discovers the available Chromium binary. Add `--strict` when a missing local dependency should fail the workflow. This does not change host trust, attach project `.mcp.json`, or edit a user's global Codex/Claude/Cursor configuration; those actions require the host's own settings and approval flow.

From the game repository, validate the plugin against the real game VM:

```sh
node --test tests/unit/f1-dev-tools.test.mjs
```

The test also runs in `test:docs-guards` and `test:tooling-fast`. VM checks verify state contracts; rendered camera motion requires the browser workflow in the skill. Source changes to this package do not automatically update the private account release.
