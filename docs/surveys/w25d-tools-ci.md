# W25d — tools/CI js-debugger smoke for perf agents (2026-10-24)

Ship slice. Branched from `dd923f859` (`claude/f1-game-project-26h3ng`).

fleet: D · orchestrator: D · session: `cursor:bc-98737390-9621-5024-9f11-7a600f3e2ecf`

Bryce (7:14 PM PT 2026-10-23): more agents; perf; heavily use js debugger.
OrchA 32 + A·H16 (~7:45 PM PT): option (1) ACK — add `@doc`, `npm run gen` for
`tools/README.md`; do not hand-edit it. HELD on that generated file is shared;
second merger runs `sync-pr.mjs`.

## Paths this PR touches (vs A·H16 / #3694)

| path | action |
|---|---|
| `tools/ci/js-debugger-smoke.mjs` | **NEW** — only intentional `tools/ci` source |
| `tools/README.md` | regenerated via `npm run gen` (one `@doc` row) |
| `docs/surveys/w25d-tools-ci.md` | NEW (this file) |
| `docs/changelog.d/w25d-tools-ci.md` | NEW |
| `docs/README.md` | index row for `surveys/` (plural) |

**Not touched:** `tools/ci/tooling-fast.mjs`, tooling-timings, timings JSON,
`tests/groups.json`, shard packing, `--jobs` defaults, hud-layout split.
**Not touched (W25a):** `tools/mcp/js-debugger*`.

## What shipped

```sh
node tools/ci/js-debugger-smoke.mjs
```

1. `bash tools/mcp/js-debugger-mcp.sh list-tools` — clear fail on empty / non-JSON / missing tools.
2. No-browser `cpuprofile-summary` on a temp fixture.
3. Per-step wall ms. No daemon, no Chromium. Also `--self-test`, `--json`.

## #3117-shaped wall-time help

H16 owns shard-balance / timings-table. This slice is the agent-facing fail-fast
before Device Farm / phone minutes. A `tests/unit/` twin stays deferred while
`tests/groups.json` / tooling-fast remain in the H16/#3576 HELD union.
