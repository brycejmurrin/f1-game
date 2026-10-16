# Offline capability preflight

**Use when:** this recipe family is the narrowest match for the question.

**Verification:** record the exact command, target (local or deployed), and returned evidence.

**Writes/ownership:** read-only; the parent owns browser startup and serialized MCP use.

## Offline capability preflight

`node tools/check/doctor.mjs --json` and `probe-mcp.py status` launch no browser.
Chromium lookup honors explicit/cache settings then executable system PATH;
status reports the override remedy and tmux prerequisite. Daemon health must
match service/protocol/root/session identity: a port collision is distinct from
DOWN. Failed termination keeps ownership state and reports failure; verify the
owned daemon is absent after stop. Validate backend/wait arguments before boot.

If a host tool/connector is unavailable, supply its metadata with
`doctor.mjs --catalog <file> --json` and use the local CLI adapter where present.
This diagnoses a supplied capability; it does not repair or invent upstream
connector resources, account permissions or hosted skill-package access.