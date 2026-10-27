# F1 restored-task startup

Read /workspace/f1-game/AGENTS.md, applicable rules and
/workspace/f1-game/tools/environment/ENVIRONMENT.md.
Discover actual hosted F1 tools and call hosted apex_status when exposed.
For this attached prepared executor, source
/workspace/f1-game/tools/environment/activate.sh and run
/workspace/f1-game/tools/environment/bin/f1-env resume.
Startup must not install dependencies. On dependency failure inspect f1-env doctor,
explicitly run f1-env install if needed, then retry resume. Missing sources must
be restored from the repository; missing profiles or credentials require restoring
the existing bindings. Never create replacement apps/tunnels or print credentials.

Canonical installation builds both packages. Local Codex registration is optional:
run f1-env plugin-install only when that host supports local plugins and its
configured Codex home is writable. A read-only active configuration is a host
limitation; do not change credential bindings or switch the active Codex home.
An isolated writable Codex home can test packaging but does not update the active
host or account. Discover supported account management tools separately.
Use canonical sources in tools/environment, tools/env/chat-mcp-service.mjs and
tools/mcp; never run a retained duplicate runtime. Compatibility binding is
bash /workspace/f1-game/tools/environment/bind-canonical.sh.

Preserve CONTROL_PLANE_API_KEY, APEX_CHAT_MCP_PROFILE, APEX_TUNNEL_CLIENT_BIN,
PLAYWRIGHT_BROWSERS_PATH, existing app/tunnel identities and proxy/TLS settings.
Keep private profiles, dependencies, caches and live state outside Git.
The lifecycle owns the only tunnel and uses native health discovery plus the
initialized-notification shim. Repeat resume after lifecycle edits to verify PID reuse.
Run f1-env verify for regressions. Serialize browser workflows; shader compilation
is separate. Do not launch the historical f1-mcp-app HTTP proof of concept.

Verify actual hosted apex_status and apex_doctor with a fresh host catalog.
Local success cannot substitute for hosted calls. Report absent capabilities
as external blockers, and distinguish source push/PR, account update, saved
configuration, snapshot publication and fresh-instance restoration.
This skill is agent-executed startup, not an automatic provider boot hook.
