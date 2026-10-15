# F1 Dev Tools

A private skills plugin for Apex 26 / brycejmurrin/f1-game. Provides five workflows with executable helpers: scene reproduction, camera inspection, visual comparison, WATCH replay transition checks, and preset preview/export.

Select this plugin in a coding session with the game checkout and browser execution available. Its skill reuses the game's existing Apex MCP server, browser integrations, camera tuner and production replay API. It needs no new hosted service or credentials. It does not add a new MCP server or run local game tools from a chat without an execution environment.

The browser helper is under `skills/f1-dev-tools/scripts/browser.js`; the Node comparison/report tool is alongside it. Instructions, examples, compatibility limits and the existing frozen cockpit capture caveat are in the skill's workflow reference.

From the game repository, validate the plugin against the real game VM:

```sh
node --test tests/unit/f1-dev-tools.test.mjs
```

The test also runs in `test:docs-guards` and `test:tooling-fast`. VM checks verify state contracts; rendered camera motion requires the browser workflow in the skill. Source changes to this package do not automatically update the private account release.
