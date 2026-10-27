# Prepared F1 cloud environment

The current managed checkout is `/workspace/f1-game`; verify its identity and
read its AGENTS.md before editing it. The retained environment toolchain is
`/workspace/f1-toolchain`. Read its ENVIRONMENT.md before local recovery.

Discover actual exposed tools and call hosted apex_status first. If it returns
`Session terminated`, distinguish a stale hosted session from missing tools or
authorization. With this attached executor, run the read-only
`/workspace/f1-game/tools/environment/bin/f1-env doctor`, then the idempotent
`/workspace/f1-game/tools/environment/bin/f1-env resume` for local gateway recovery. Startup
reuses the lifecycle manager; do not launch duplicate tunnels or MCP servers.
Do not install dependencies as part of startup. A failed doctor requires the
documented installation or restoration process, not credential replacement.

Recheck the hosted status after local recovery. Local readiness does not prove
that the host session has reconnected. If it still fails, use documented checkout
CLI fallbacks and report hosted calls as unavailable. Do not recreate the app,
tunnel identity or connection to work around a stale session.

The cloud runtime status reports current readiness of PLAYWRIGHT_BROWSERS_PATH,
APEX_CHAT_MCP_PROFILE, APEX_TUNNEL_CLIENT_BIN and CONTROL_PLANE_API_KEY. Never
print their values, profiles, secret files or process environments. Existing
runtime bindings are the source of truth; use them rather than hardcoded values.
Browser localhost refers to the browser's own executor. Respect repository
occupancy and locks; use one browser workflow at a time.

Package builds: `/workspace/f1-game/tools/environment/bin/f1-build-plugins` and its `--check`
mode validate retained sources and archives without publishing. Account release
updates, local gateway readiness, hosted calls and rendered behavior must be
verified and reported separately. Do not require a local executor for working
hosted read-only tools. Do not request sandbox escalation in an environment whose
approval policy disables it; report the actual missing capability instead.

## Canonical checkout runtime

The lifecycle manager is tools/env/chat-mcp-service.mjs; gateway and contract
checker live in tools/mcp/. The checkout package-lock.json pins the SDK.
Startup uses the supported --mcp.command override, preserving private profiles
and credential bindings. Missing sources must be restored from the repository;
use f1-env install only for dependencies or tooling that actually need repair.
The npm Chrome DevTools pin is supported; the optional source clone is skipped
by default through activation. No `/opt/google/chrome/chrome` alias is required
when the repository wrapper supplies the discovered executable.

A healthy local catalog, readyz 200 and control-plane poll are local transport
checks. Still discover and call hosted tools before claiming chat attachment.

## Hosted initialization recovery (2026-10-27)

A successful local contract check starts a separate client and does not initialize
the tunnel's shared stdio child. Even readyz 200 and successful polling do not
prove that a hosted caller can use that child.

For HTTP 409 `mcp_initialization_required` ("send initialize and
notifications/initialized"), inspect the existing loopback `/health/mcp` operator
surface using its validated native health locator. Read only bounded lifecycle
fields, not profiles, credentials or raw requests. `initialize.ok` alone does not
prove that the notification was delivered. Do not repeatedly restart a healthy
service; every replacement child needs its own successful handshake.

The retained lifecycle launcher now enables the tunnel client's documented
`--mcp.stdio-send-initialized-notification` option. It supplies the notification
only after a successful forwarded initialize response and suppresses a duplicate
from the caller. It does not synthesize initialize or permit pre-initialize calls.
A missing initial handshake still requires the host to initialize the child.

After changing this launcher, use its PID-validated restart once, then `f1-env
resume` and verify reuse. Allow the normal bounded startup/host reconnection to
finish; do not treat an early timeout as the terminal result of a running startup.
Recheck an actual hosted `apex_status` after readiness. New-chat or connection
refresh advice is a fallback after checking the local handshake, not proof that
the current chat cannot recover. If the hosted request still fails, retain its
exact error and report the local and hosted verdicts separately.

Retain tools/env/chat-mcp-service.mjs, tools/environment/test-stdio-lifecycle.py
and tools/environment/fixtures/lifecycle-echo.mjs in the canonical repository.
The regression uses an isolated local in-memory tunnel proxy: initialize without
the notification fails with the shim off, succeeds with it on, rejects a call
before initialize, and safely suppresses a later duplicate notification.
This changed no App ID, tunnel ID, profile, credential or trust configuration.

Official behavior: https://github.com/openai/tunnel-client/blob/master/docs/configuration.md
