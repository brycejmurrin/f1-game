# F1 environment: canonical source and retained state

`brycejmurrin/f1-game` owns `tools/environment/` (installation, activation,
plugin manifests/skills, package builder and environment regressions),
`tools/env/chat-mcp-service.mjs` (the lifecycle owner), and `tools/mcp/`
(the gateway, doctor catalog adapter and protocol checks). The checkout's
package.json/package-lock.json already pin MCP SDK 1.32.2. Do not maintain a
second runtime or SDK lockfile. Read the checkout's AGENTS.md before edits.

The prepared Debian 13 x86-64 snapshot supplies Node >=22, Python, Chromium,
the existing tunnel executable/profile and platform credential bindings.
This installer restores declared dependencies and tools; it does not create
apps, tunnels, authorization, or an empty operating system.

```sh
source /workspace/f1-game/tools/environment/activate.sh
f1-env doctor
f1-env resume
f1-env resume  # must reuse the supervisor PID
```

Startup installs nothing. It serializes the existing lifecycle manager and
verifies one identity-checked supervisor, exactly one supervised tunnel,
native loopback health, readyz 200 and successful control-plane polling,
then uses a real stdio MCP client for tools/list and apex_status.
The tunnel uses the supported command override and initialized-notification
shim. Existing profile contents and credential references are preserved.

```sh
f1-env install        # explicit dependency/tool repair; does not start services
f1-env plugins       # deterministic archives with preserved app identities
f1-env plugin-install # local Codex registration only; new session may be needed
f1-env verify        # environment, lifecycle, package and developer checks
f1-env shaders       # separate serialized Chromium/Dawn compilation
```

`/workspace/f1-toolchain` is retained DATA: bin/root/packages/apt/cache/config,
plugin-dist, locks, private tunnel profiles and tunnel executable. Platform
bindings CONTROL_PLANE_API_KEY, APEX_CHAT_MCP_PROFILE,
APEX_TUNNEL_CLIENT_BIN and PLAYWRIGHT_BROWSERS_PATH remain unchanged. Never
commit or print their contents. Service state stays in ignored
`artifacts/run/chat-mcp/`. Compatibility links installed by
`bind-canonical.sh` point old source paths at this checkout; their previous
contents are archived outside Git. No startup path runs the historical
f1-mcp-app proof of concept.

Restoration: fetch this repository/review branch, retain the private runtime
bindings and data snapshot, run the canonical installer when dependencies
need repair, then resume twice. Test archive reconstruction from tracked
sources separately from a fresh published environment restore. The latter
requires an actual new instance and is not established by a local archive test.

Host attachment is separate: discover the current exposed F1 tools, call actual
hosted apex_status, and call hosted apex_doctor with a fresh hostToolNames array.
Caller names are bounded session evidence, not proof of hosted execution.
No exposed tools means hosted verification is blocked even if local MCP passes.
Builds and local Codex installation do not update account packages.
Use supported Plugin Management/Creator tools when exposed; never recreate
identities or edit credential profiles to attempt attachment.

Save the install script and MCP-STARTUP-SKILL.md through environment configuration.
Saving a draft does not publish it. Review/save and publish through the environment
product, then independently test a fresh restore. start_skill is agent-executed
recovery, not an unattended provider boot hook.

Tool installation preserves signed Debian package and actionlint checksum
verification. Debian resolution and the repository zizmor installer are not
fully pinned; retain verified binaries/archives for matching restoration.

References consulted during consolidation:
https://developers.openai.com/plugins/build/mcp-server
https://modelcontextprotocol.io/specification/2025-03-26/basic/lifecycle
https://docs.npmjs.com/cli/v11/commands/npm-ci/
