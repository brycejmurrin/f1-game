---
name: f1-cloud-mcp
description: Diagnose the existing private F1 Cloud MCP connection, tool attachment and workspace readiness.
---

# F1 Cloud MCP

Use the existing private app connection. This package needs no local process launcher.
Discover actual callable F1 tools in this session, inspect their schemas, and call the
exposed apex_status route before workspace actions. A host prefix may precede
apex_tools__apex_status. Use apex_help and apex_catalog for current schemas and IDs.

If tools are absent, report hosted attachment as unavailable. Installed skills,
a local catalog and a running tunnel do not prove that chat is connected. Preserve
the existing app, tunnel identity and credential bindings. Do not recreate them
or change trust settings to attempt attachment.

With an attached managed executor, read its cloud runtime instructions and verify
the intended checkout before local fallbacks. For the prepared F1 environment,
read /workspace/f1-toolchain/ENVIRONMENT.md and run the existing f1-env doctor
and f1-env resume commands when local recovery is necessary. Startup is separate
from installation. Do not require executor startup before a working hosted call.
Do not print profiles, secret values or process environments.

Use the F1 Dev Tools skill for inspection, rendering and debugging. Respect
checkout browser occupancy and locks; use one browser workflow at a time.
Report package validation, local readiness and actual hosted calls separately.
A plugin update cannot grant missing host permissions or publish the environment.

## Prepared runtime recovery (1.0.4)

The retained gateway lives at `/workspace/f1-toolchain/runtime/`, with a separate
locked MCP SDK. It works across game branches. `f1-env doctor` checks its source
files before startup. `f1-env resume` reuses the PID-validated lifecycle owner,
verifies exactly one tunnel, readyz HTTP 200, successful control-plane polling,
and the complete local catalog with apex_status. Repeat startup to verify reuse.
Readiness uses the native health URL locator and requires no ptrace permission changes.

Startup overrides only the MCP command through the existing tunnel client's
supported flag. Preserve the original private profile, app identity and credential
bindings. Do not copy profiles or recreate apps/tunnels. Missing host tools remain
a host attachment issue after local recovery; local tools cannot install account
plugins. Build corrected packages with `f1-build-plugins`, and keep build, account
import, environment publication and hosted calls as separate verdicts.

## Doctor host catalog input

Inspect the exposed schema first. The retained gateway adds `hostToolNames` to
`apex_tools__apex_doctor`: pass an array of current names actually exposed in
this chat. The adapter accepts at most 2000 names, accepts no file paths or
checkout overrides, and labels the report as caller-supplied session evidence.
Do not substitute the gateway catalog for the host catalog. Without supplied
names, the existing doctor route still warns that host metadata is unavailable.
The adapter uses the doctor in the gateway checkout, preserving its dependency
checks. A successful supplied-catalog check is not proof that tools execute.
