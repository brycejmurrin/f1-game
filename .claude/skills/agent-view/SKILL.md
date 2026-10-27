---
name: agent-view
description: "Use when seeing or driving Apex 26 without screenshots: world()/field()/rollout(), headless laps, deterministic runs, telemetry and slip/grip readouts, field order and gaps, sector timing; TRACK GEOMETRY hooks — corners(), trackProfile() grade/curvature, trackShape(), map/bounds, groundY/scan/wallStats, terrain-over-road. Read-only; geometry fixes → new-track / survey-track; handling → tune-physics."
---

# Agent view — perceive and drive the game as text

Use `node tools/shot/agent.mjs help <hook>` for static hook help, or
`node tools/shot/agent.mjs <track> help --vm` for the VM manifest without Chromium.
Numeric one-offs can use `node tools/shot/agent.mjs monza world --vm --detail brief`;
the VM has no last-drawn frame, so raster/camera evidence still needs a browser.
MCP wrap: `./tools/mcp/apex-tools-mcp.sh call apex_agent
'{"track":"monza","command":"world"}'`. Full surface catalog, staging, and
driving policy → [references/surface.md](references/surface.md). Design notes:
`docs/DEBUG-HOOKS.md`.

**TL;DR** — Drive Apex 26 as text, not screenshots. Shell:
`node tools/shot/agent.mjs <track> <tool> [flags]` (stages for you). In-page:
`window.__apex.<tool>(...)`. Start with `agentHelp()` + `objective()` once,
then `world({detail:"drive"})` → decide → `act`/`rollout` → `terminal()`. Pin
`seed(n)` in-page before any A/B (the VM CLI ignores `--seed`; seed a VM batch with
`createGame({search:"?seed=42"})`, surface.md §Three ways in). Failures are `{ok:false, error, message, fix}` (two
quiet exceptions: empty `scene()` while props build; stale `render({what:"view"})`
under headless — stage first).

**Entry routes** (cost differs — details in surface.md): CLI VM or browser boot,
`apex-eval.mjs` multi-call one boot, or live `page.evaluate` after staging
(`race` → `go` → `jump` + frames). Browser boots are serialized by AGENTS.md rules 5 and 10; use the Node VM for numeric batches.
A subagent may run the Node VM route (`game-vm.cjs` / `createGame`); `agent.mjs` boots Chromium, so bash-guard refuses it there.

**Vocab:** `frac` = lap 0→1; `s` = metres along centreline; `lateralM` = +right.

## Reference

- `docs/DEBUG-HOOKS.md` → "Agent world view" — the full per-tool reference (every
  field, every option, the typed errors).
- `__apex.agentHelp()` — the live manifest, including the `fields` glossary and
  the `read`/`control` sections listing the raw hooks and the drive/stage verbs.
- Tests, one spec at a time (`npm test -- tests/specs/<file>`, session only):
  `agent-view.spec.js` and `agent-drive-bench.spec.js` (group `test:hooks`),
  `agent-determinism.spec.js` (group `test:ui`); `select-specs.mjs` names them per diff.
- Seeded replay field diff (VM): `node tools/check/episode-diff.mjs`

## Load on demand

- Tool catalog, policy, determinism, staging sharp edges → [references/surface.md](references/surface.md)
- Telemetry / headless `reset`/`act` loop → [references/state.md](references/state.md)
- Track geometry hooks + sweeps → [references/track-geometry.md](references/track-geometry.md),
  [references/debug-tracks-sweeps.md](references/debug-tracks-sweeps.md)

This skill only READS (e.g. `groundY().overRoad > 0`, terrain-over-road). The fix for what it finds: **new-track**
(circuit def), **survey-track** (one-circuit grounding pass), **tune-physics** (understeer, grip, pace),
**mcp-probe** (poking a live canvas).
