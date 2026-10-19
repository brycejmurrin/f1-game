# Offline capability preflight

**Use when:** checking local probe prerequisites or running without attached
Chrome tools or `tmux`.

**Inputs:** checkout root, available host tools, discovered Chromium and one
owned terminal for a persistent fallback.

**Verification:** record the exact command, target (local or deployed), and returned evidence.

**Writes/ownership:** no game source edits; the parent owns browser startup,
temporary page state and serialized MCP use.

## Offline capability preflight

`node tools/check/doctor.mjs --json` and `probe-mcp.py status` launch no browser.
Chromium lookup honors explicit/cache settings then executable system PATH;
status reports browser discovery and doctor reports the tmux prerequisite. Daemon health must
match service/protocol/root/session identity: a port collision is distinct from
DOWN. Failed termination keeps ownership state and reports failure; verify the
owned daemon is absent after stop. Validate backend/wait arguments before boot.

If a host tool/connector is unavailable, supply its metadata with
`doctor.mjs --catalog <file> --json` and use the local CLI adapter where present.
This diagnoses a supplied capability; it does not repair or invent upstream
connector resources, account permissions or hosted skill-package access.

## Persistent calls without tmux

The wrapper prefers a usable local build, otherwise its pinned npm package.
`Bin: missing` in status describes the optional clone, not the fallback's
availability. Use the checkout dependencies (`npm ci` on a fresh checkout) and
Chromium discovery from [bootstrap](../../../../docs/AGENT-SURFACE.md#bootstrap-auto-setup).
An uncached pinned package needs npm egress; a clone/build is not a remedy for
blocked egress. Keep an actual package or browser startup error visible.
The combined status/listing can also mention TinyFish DOWN; it does not block
Chrome probing and is not a reason to provision an unrelated service.

Before either daemon mode, check `node tools/ci/test-bg.mjs --status`,
`apex_status` (or its CLI fallback), CPU and existing daemon health. Do not start
beside another browser or a live suite. `chrome-start` checks for a live run;
the foreground command below does not perform that preflight for you.

If `tmux` is missing, start this in one parent-owned terminal and keep it alive:

```sh
python3 tools/mcp/probe-mcp.py chrome-daemon
```

Wait for `probe-chrome daemon listening`, then use `status` and separate
`call chrome_<tool> '<JSON>'` clients. `list-tools` starts the backend too;
it is not a browser-free availability check. A healthy daemon preserves the
same page across calls; configuration alone does not attach chat tools.

Finish by parking the owned page to `about:blank`, then send Ctrl-C to that
owned terminal (or SIGTERM to its recorded daemon PID). The daemon's `finally`
closes its upstream client/browser and removes its state file. `chrome-stop`
controls the tmux mode; it cannot stop this foreground terminal. Confirm status
reports DOWN and check remaining owned processes before starting tests. Preserve
ownership evidence and report failed cleanup rather than killing other sessions.
