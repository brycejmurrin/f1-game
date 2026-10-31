# Profiler controls must match the selected measurement

## Source and reproduction

Fetched deploy source `21561a26c0f326ef897f0aae13b1af665e367b05` before creating
the isolated `cursor/profile-contract-21561a` worktree. Dependencies match its
lock. The shared checkout was not pulled or edited. Current instructions and
open PR paths were checked; the MCP catalog owned by other PRs was excluded.

The baseline accepted `--mode cpu --repeat 3 --base <ref>` but invoked one
child with just the track. Hitch similarly discarded repeat/base requests.
Trace ignored those controls too. A successful subprocess exit therefore did
not mean the requested repeated comparison had happened.

The fresh-source reproduction used the real copied CLI and inert subprocesses,
with a harness that forbids browser/server acquisition. Sixty mode/control
probes and twenty boolean-assignment probes are retained under
`artifacts/profile-contract-attribution/`. Reaching a forbidden server in a
browser mode proves missing early rejection; source inspection establishes
which controls its measurement loop consumes. It does not establish browser
performance. The CLI already correctly preserves an explicit `--warm 0`.

## Contract

Track, mode and bare help remain common. Explicit measurement controls are:

| Mode | Supported controls |
| --- | --- |
| spans | frames, repeat, base, json, capture |
| cpu | none; one raw CPU profile |
| hitch | frames, capture |
| trace | frames, capture |
| step | steps, warm, repeat, base, json, capture, cpu-throttle |

Hitch retains its existing duration conversion:
`max(10, round(frames / 6))` seconds. Its explicit bare `--capture` now reaches
the child, which already implements that switch. This honors a requested
presentation path; it does not silently change the default path.

A pure shared policy rejects unsupported explicit controls before any child,
browser, server or worktree starts. Both value spellings, `--repeat 3` and
`--repeat=3`, receive the same compatibility decision. Explicit values equal
to defaults are still explicit requests; omitted defaults remain accepted.

Bare boolean switches remain supported where applicable. Assignments such as
`--capture=true`, `--json=false` and `--help=true` now fail with a usage error
instead of passing flag validation and being silently ignored. No new boolean
coercion rule was introduced. Bare `--help` and `-h` still succeed early.

The CLI returns exit 2 for these usage errors. The two MCP entry points share
their existing job builder and return native `bad_args` results before job
creation. Their existing frames/repeat/base fields receive the same policy;
the schema, mode enum and result protocol remain unchanged. In particular,
step remains a CLI mode and no new typed capture field is added.

## Verification and limits

Regression coverage executes the actual copied CLI with real inert children
and acquisition sentinels, and the actual MCP CLI in mock/dry-run mode. It
checks unsupported requests, supported plans/defaults, child arguments,
boolean spellings, help, and existing numeric/signal/spawn-failure outcomes.

```sh
node --test tests/unit/profile-lib.test.mjs tests/unit/profile-mcp.test.mjs tests/unit/assert-match-ratchet.test.mjs
node tools/ci/tooling-fast.mjs --changed --jobs=3 --quiet
```

Exact terminal verdicts and source identity belong in the PR Hand-off block.
No tolerance, measurement budget or ratchet is raised. Served game sources
and existing measurement-loop bodies are unchanged; only explicitly requested
hitch capture forwarding changes child arguments. These checks establish
planning/process behavior, not rendering, device FPS, thermal performance or
a faster game. Repeat/base comparisons still require matching source, scene,
settings, renderer/API, presentation path and host conditions.

References read during design:
[Node process.argv](https://nodejs.org/docs/latest-v24.x/api/process.html#processargv),
[MCP tool error handling](https://modelcontextprotocol.io/specification/latest/server/tools.md).
The implementation preserves the repository's existing error representation.
