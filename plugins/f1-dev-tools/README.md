# F1 Dev Tools

A private skills plugin for Apex 26 / brycejmurrin/f1-game. Version 0.4.0 expands the existing scene, camera, WATCH and preset workflows with semantic UI inspection, CPU/heap/memory/leak diagnostics, graphics profiling, garage angles and car parts. The manifest advertises the repository MCPs that make those workflows reproducible.

Select this plugin in a coding session with the game checkout and browser execution available. Its skill reuses the game's existing Apex MCP server, browser integrations, camera tuner and production replay API. It needs no new hosted service or credentials. It does not add a new MCP server or run local game tools from a chat without an execution environment.

The browser helper is under `skills/f1-dev-tools/scripts/browser.js`; the Node comparison/report tool is alongside it. `F1Dev.diagnose()` produces a read-only evidence record with the exact page URL, document visibility/readiness, service-worker controller, Apex API manifest, renderer and viewport inspection. `F1Dev.checkAssets(urls)` hashes exact fetched bytes for release verification, and `F1Dev.storageReport()` records localStorage footprint and browser quota estimates without exposing saved values. Instructions, examples, compatibility limits and the existing frozen cockpit capture caveat are in the skill's workflow reference.

## Existing MCPs

The plugin consumes the five MCP servers already configured by the game checkout; it does not start a second copy or add a hosted service. See [`docs/AGENT-SURFACE.md`](../../docs/AGENT-SURFACE.md) for the checkout-wide MCP catalog and concurrency rules.

| Server | Use | Fallback when the MCP is unavailable |
|---|---|---|
| `apex-tools` | `apex_status`, `apex_catalog`, `apex_doctor` and deterministic Apex probes | `bash tools/mcp/apex-tools-mcp.sh call <tool> '{}'` |
| `playwright-official` | Serialized navigation, DOM assertions and screenshots | The repository Playwright probe after reading `.claude/skills/mcp-probe/SKILL.md` |
| `chrome-devtools` | Serialized live-page console, network, heap and performance inspection | The repository Chrome/Playwright harness documented by the checkout |
| `js-debugger` | Parent-owned source breakpoints, stepping and paused scopes on an existing local Chrome page | Persistent `bash tools/mcp/js-debugger-mcp.sh serve-http`, then separate `call debugger_*` clients; see [debugger setup](../../docs/research/AGENT-JS-DEBUGGER-MCP.md) |
| `apex-lsp` | Definition (with body), references with enclosing functions, callers, module outlines, hover and new-since-HEAD diagnostics over `js/` via TypeScript 7 `tsc --lsp` | `bash tools/mcp/lsp-mcp.sh def <Name|Head.member> --body` (`refs`, `callers`, `outline`, `sym`, `hover`, `diag`); see [LSP-MCP](../../docs/notes/LSP-MCP-2026-10-18.md) |

Use one browser server and one browser process at a time. The repository MCP configuration is the source of truth; the plugin advertises these names for routing and does not install or launch them.
The debugger attaches to that same parent-owned local page. A pause stops its
JavaScript: inspect the current pause token, resume before dependent browser
actions, and detach before finishing. Source inspection does not measure GPU
performance.

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

## Focused inspection workflows

Start with the skill’s [UI inspection](skills/f1-dev-tools/references/ui-inspection.md), [profiling and debugging](skills/f1-dev-tools/references/profiling.md), and [garage/parts](skills/f1-dev-tools/references/garage-parts.md) references. Discover current `tools/list` schemas and catalog IDs before execution; package updates do not upgrade checkout capabilities. Browser-owning operations share the repository lock and session lifecycle; long operations use bounded start/status/cancel jobs. Installation and CLI tests do not prove attached host tools or hardware GPU performance.

The repository source is a skills-only package and intentionally retains its own author, prompt, capabilities and newer diagnosis/asset/storage helpers. The separately exported private account package has its own bridge and release version; do not overwrite either variant’s metadata or helpers with the other. Neither source change publishes the account release.
