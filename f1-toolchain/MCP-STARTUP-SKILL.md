# F1 environment startup — branch-independent runtime
Read /workspace/f1-toolchain/ENVIRONMENT.md and source /workspace/f1-toolchain/activate.sh in each shell. Use the existing /workspace/f1-game checkout; do not create a worktree unless requested. Read AGENTS.md and applicable rules before repository edits.

At the beginning of each restored task:

1. Read /workspace/f1-toolchain/ENVIRONMENT.md.
2. If local Codex plugin registration/cache is missing, run:
   /workspace/f1-toolchain/bin/f1-env plugin-install
3. Run:
   /workspace/f1-toolchain/bin/f1-env resume
4. Discover hosted F1 tools and call hosted apex_status if available.

The saved install script prepares dependencies, tools, plugins and verifies the environment during image preparation. Startup uses the prepared snapshot and does not install dependencies routinely. If resume fails, run f1-env doctor and inspect the failure. For missing or invalid dependencies or tooling, run f1-env install, then f1-env plugin-install if local registration is missing, and retry f1-env resume. If retained sources, credentials, profile or tunnel client are missing, restore or repair the corresponding existing binding; do not recreate identities or use installation as a workaround. Report any failure that remains.

Local plugin installation does not establish account installation or
hosted attachment. Newly installed plugins require a new chat or CLI
session. Preserve the existing app, tunnel, profile and credentials.

Inspect local registration with `codex plugin list --marketplace f1-workspace --json`.
Confirm both expected packages are installed/enabled and their cached files exist.
The retained runtime is independent of the current game branch. Missing sources
must be restored from the prepared snapshot, not generated during startup.


The resume command uses the existing private profile and the tunnel client's supported --mcp.command override. It must verify one PID-validated supervisor, exactly one supervised tunnel, readyz HTTP 200, successful control-plane polling, a complete local MCP catalog and a successful local apex_status. Repeat resume when changing lifecycle code to confirm PID reuse. Health discovery uses the native --health.url-file locator with loopback validation, supervisor start identity, child ownership, duplicate detection and control-plane polling. It must not require ptrace-gated /proc/PID/exe or /proc/PID/fd symlinks. Use the lifecycle manager; do not launch tunnel-client directly or start the historical f1-mcp-app HTTP proof of concept.

For dependency repair only: f1-env install. Installation preserves repository manifests/lockfiles and separately installs the pinned runtime SDK. It does not start services. Run f1-env verify for environment/runtime regressions, skill mirrors, workflow lint, static GLSL and package integrity. Optional naga WGSL checks may skip; f1-env shaders separately compiles GLSL and complete WGSL with Chromium/Dawn. Serialize all browser workflows. A browser MCP probe is not physical GPU certification.

For private plugin work, read /workspace/f1-toolchain/PLUGIN-BUILD.md. Run f1-build-plugins then f1-build-plugins --check. Retained corrected releases are F1 Dev Tools 0.2.5 and F1 Cloud MCP 1.0.5. The app binding and author metadata must stay unchanged. Packages are hosted-first with no root local stdio auto-discovery; optional local configs stay under executor/. Preserve runtime/, plugin-sources/, plugin-dist/, lockfiles and canonical helper sources in the snapshot.

Discover actual hosted F1 tools. If exposed, execute hosted apex_status. Local readiness, a healthy control-plane poll and plugin tags do not establish hosted chat attachment. If tools remain absent, report the precise host attachment limitation; do not recreate apps/tunnels, replace credentials or change trust. Account plugin import requires an actual Plugin Management capability. Building ZIPs alone is not account installation.

For local gameplay, reuse a responsive server or start python3 -m http.server 3456 --bind 127.0.0.1 from /workspace/f1-game in a managed session. Verify its page contains js/game.js. Do not present loopback links as user previews. The pinned npm Chrome DevTools fallback is supported and tested; activation skips its optional source clone. An /opt/google/chrome/chrome alias is unnecessary when wrappers pass discovered Chromium.

Never print secrets, profiles or process environments. Preserve CONTROL_PLANE_API_KEY, APEX_CHAT_MCP_PROFILE, APEX_TUNNEL_CLIENT_BIN, PLAYWRIGHT_BROWSERS_PATH, proxy/TLS verification and the original tunnel/app identities. Do not copy authentication profiles. Do not publish without explicit user instruction.

This startup skill is agent-executed recovery. Saved configuration does not execute, publish or prove unattended provider startup. Report current-instance validation, account import, hosted calls, snapshot publication and fresh-restoration evidence separately.

This startup skill runs when an agent follows it; it is not an automatic provider boot hook.

The retained launcher uses --mcp.stdio-send-initialized-notification for hosted initialization. Preserve the runtime, lifecycle test and fixture in the snapshot. Verify hosted apex_status and apex_catalog after restoration.

## Doctor host catalog input

Inspect the exposed schema first. The retained gateway adds `hostToolNames` to
`apex_tools__apex_doctor`: pass an array of current names actually exposed in
this chat. The adapter accepts at most 2000 names, accepts no file paths or
checkout overrides, and labels the report as caller-supplied session evidence.
Do not substitute the gateway catalog for the host catalog. Without supplied
names, the existing doctor route still warns that host metadata is unavailable.
The adapter uses the doctor in the gateway checkout, preserving its dependency
checks. A successful supplied-catalog check is not proof that tools execute.

Retain runtime/doctor-catalog.mjs and runtime/doctor-catalog.test.mjs in the snapshot.
