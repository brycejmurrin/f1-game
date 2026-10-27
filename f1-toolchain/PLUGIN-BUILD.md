# Rebuild private F1 plugins

Activate the retained toolchain, then build:

```sh
source /workspace/f1-toolchain/activate.sh
f1-build-plugins
f1-build-plugins --check
```

Sources are under `/workspace/f1-toolchain/plugin-sources/`. Edit that private
package source when changing a release; keep the two Dev Tools manifest versions
in sync. This is separate from the repository's skills-only plugin. The builder
checks manifests and app bindings, runs the package tests, and creates repeatable
ZIPs with dotfiles at their root. It needs Python 3 and Node, not a plugin manager,
host tool attachment, credentials, or the temporary uploaded archives.

Output is under `/workspace/f1-toolchain/plugin-dist/`, with `SHA256SUMS` and
`build-receipt.json`. Rebuilding replaces the outputs for the current versions
only after both packages validate. It never imports or publishes them.

These workspace paths are local build artifacts. They are not downloadable chat
attachments. Deliver them through a supported file-export or plugin-import tool
when the host provides one; do not present sandbox links as verified downloads.
The environment install/startup scripts cannot add host file-export tools or
change the account-side app-to-tunnel association.

Keep `plugin-sources/` in the published environment snapshot. If it is missing,
restore the private package sources before running the installer. Do not copy the
repository's separate plugin package over these private account sources.

Current releases: f1-dev-tools 0.2.5 and f1-cloud-mcp 1.0.4. The builder rejects
root-level local MCP auto-discovery in these hosted account packages, requires
their declared skills and preserves the existing app binding. Dev Tools optional
executor configs are retained below executor/. Older ZIPs can remain in dist;
use build-receipt.json and SHA256SUMS to identify the current release artifacts.


## Branch-independent runtime repair, 2026-10-26

Retain `/workspace/f1-toolchain/runtime/` including its three JavaScript entry
points, package.json, package-lock.json, tests and provenance.json. The SDK is
locked independently of the game. Installation restores its dependencies;
startup installs nothing. Doctor now rejects missing gateway files. Startup
uses the supported `--mcp.command` override, leaving the original profile and
credential references unchanged. No merge of verification PR #3788 is required.
The game checkout remains unchanged. Runtime provenance records the retained
source commit and original hashes; local adaptations bind it to the checkout.

Run `f1-env doctor`, `f1-env verify`, then `f1-env start`. Repeat start to verify
PID reuse. Activation skips the optional Chrome DevTools clone; the exact pinned
npm distribution is available and is exercised by the live gateway catalog check.
Use one browser workflow at a time. Do not launch the historical HTTP proof of
concept under f1-mcp-app. Package releases are Dev Tools 0.2.5 and Cloud MCP 1.0.4.
Local builds do not import account plugins or attach host tools. A saved startup
skill is agent-executed recovery, not evidence of unattended provider startup.

Current documentation consulted:
https://developers.openai.com/plugins/build/mcp-server
https://modelcontextprotocol.io/docs/2026-07-28/develop/build-server
https://docs.npmjs.com/cli/v11/commands/npm-ci/

## Local Codex installation

Run `f1-env plugin-install`. This validates the archives, registers the retained
local f1-workspace marketplace, and uses `codex plugin add` to install both
packages. Confirm with `codex plugin list --marketplace f1-workspace --json`.
The command is repeatable. CLI cache/registration may be ephemeral under /run,
so the saved startup instructions repeat registration after restoration.
This installs local CLI plugins; it does not import account plugins or change
the current hosted chat tool list. Account catalog access returned HTTP 451 in
this instance. No credentials were replaced to work around that failure.

Current verified package sources: Dev Tools 0.2.5; Cloud MCP 1.0.5. Cloud MCP documents the bounded hostToolNames doctor input.
