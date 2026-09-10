---
name: agent-view
description: Use when the user wants to see or drive Apex 26 without screenshots, asks what the car sees, wants agent world view/world()/field()/rollout(), wants a headless lap, deterministic run reproduction, or asks what the agent is trying to do, what the car is doing, telemetry, slip/grip, field order/gaps, sector timing, lightState, or a headless control/obs/act/reset loop. Also the TRACK GEOMETRY hooks — corners, elevation, curvature, map/bounds, wall/barrier audits, terrain-over-road gaps, groundY/scan/wallStats, comparing circuits, "how many corners does this track have". Editing a circuit is new-track; a picture-driven accuracy pass is survey-track.
---

# Agent view — perceive and drive the game as text

Prefer `node tools/shot/agent.mjs <track> help` / `__apex.agentHelp()` when you
only need one tool. MCP wrap: `./tools/mcp/apex-tools-mcp.sh call apex_agent
'{"track":"monza","command":"world"}'`. Full surface catalog, staging, and
driving policy → [references/surface.md](references/surface.md). Design notes:
`docs/DEBUG-HOOKS.md`.

**TL;DR** — Drive Apex 26 as text, not screenshots. Shell:
`node tools/shot/agent.mjs <track> <tool> [flags]` (stages for you). In-page:
`window.__apex.<tool>(...)`. Start with `agentHelp()` + `objective()` once,
then `world({detail:"drive"})` → decide → `act`/`rollout` → `terminal()`. Pin
`seed(n)` before any A/B. Failures are `{ok:false, error, message, fix}` (two
quiet exceptions: empty `scene()` while props build; stale `render({what:"view"})`
under headless — stage first).

**Three ways in** (cost differs — details in surface.md): CLI one-shot boot,
`apex-eval.mjs` multi-call one boot, or live `page.evaluate` after staging
(`race` → `go` → `jump` + frames). Cap parallel CLI boots at 2–3.

**Vocab:** `frac` = lap 0→1; `s` = metres along centreline; `lateralM` = +right.

## Reference

<<<<<<< HEAD
- `__apex.agentHelp()` — live manifest + fields glossary
- Tests (browser-gated): `node tools/ci/test-bg.mjs hooks`
=======
- `docs/DEBUG-HOOKS.md` → "Agent world view" — the full per-tool reference (every
  field, every option, the typed errors).
- `../../../docs/DEBUG-HOOKS.md` — the design and the research behind each choice.
- `__apex.agentHelp()` — the live manifest, including the `fields` glossary and
  the `read`/`control` sections listing the raw hooks and the drive/stage verbs.
- Tests: `node tools/ci/test-bg.mjs hooks` (`tests/specs/agent-view.spec.js`,
  `tests/specs/agent-drive-bench.spec.js`, `tests/specs/agent-determinism.spec.js`).
- Seeded replay field diff (VM): `node tools/check/episode-diff.mjs`
>>>>>>> 50e26922 (chore(tools): archive applied moves and closed gfx/orphan CLIs)

## Load on demand

- Tool catalog, policy, determinism, staging sharp edges → [references/surface.md](references/surface.md)
- Telemetry / headless `reset`/`act` loop → [references/state.md](references/state.md)
- Track geometry hooks + sweeps → [references/track-geometry.md](references/track-geometry.md),
  [references/debug-tracks-sweeps.md](references/debug-tracks-sweeps.md)

Folded 2026-09-03: `debug-tracks`. `new-track` / `survey-track` stay separate acts.
