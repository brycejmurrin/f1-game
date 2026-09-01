---
name: agent-view
description: Use when the user wants to see or drive Apex 26 without screenshots, asks what the car sees, wants agent world view/world()/field()/rollout(), wants a headless lap, deterministic run reproduction, or asks what the agent is trying to do, what the car is doing, telemetry, slip/grip, field order/gaps, sector timing, lightState, or a headless control/obs/act/reset loop. One-off geometry JSON (corners/groundY/walls) → debug-tracks.
---

# Agent view — perceive and drive the game as text

Prefer `node tools/agent.mjs <track> help` / `__apex.agentHelp()` over this skill when you only need one tool. MCP wrap (week-2 lock): `./tools/apex-tools-mcp.sh call apex_agent '{"track":"monza","command":"world"}'`. Per-tool catalog, policy, staging: [references/surface.md](references/surface.md). Full surface: `docs/AGENT-WORLD-API.md` + `docs/DEBUG-HOOKS.md`.

**TL;DR** — Perceive and drive Apex 26 as text, no screenshots. From a shell:
`node tools/agent.mjs <track> <tool> [flags]` (it stages `race`/`go`/`jump` +
frames for you). In-page: `window.__apex.<tool>(...)`. Read `agentHelp()` +
`objective()` once, then loop `world({detail:"drive"})` → decide →
`act(...)`/`rollout({policy})` → `terminal()`. Pin `seed(n)` before `race()`/`tt()`,
or pass it to `reset(frac, speed, x, seed)` for a replayable episode. Failures are typed
(`{ok:false, error, message, fix}`), never `null` — but two reads fail *quietly*
instead: `scene()` on a street circuit still building props returns a SUCCESSFUL
empty list, and `scene({visible:true})`/`render({what:"view"})` reuse the last **rendered**
frame. Stage first (see Staging) — an empty scene means "not built yet", not
"nothing there".

`window.__apex` composes the ~180 raw debug hooks into one small surface that is
**egocentric** (framed around the car), **typed** (failures are `{ok:false,
error, message, fix}`, never `null` — with the two quiet exceptions above),
**compact** (returns an identifier, not a whole record), and **self-describing** (`agentHelp()` is the manifest,
`objective()` is the game). LLMs drive *worse* from an image than from structured
text (BALROG, VideoGameBench) — so use these, not screenshots.

Three ways in — same surface, different cost:
- `node tools/agent.mjs <track> <tool> [flags]` from a shell — it does the
  `race`/`go`/`jump` + render-frames staging correctly so you don't hand-roll it.
  **Each call boots its own browser (~30–40 s)**, so it is one read per boot:
  great for a single question, wasteful for many. Don't chain several in one
  shell command — they run serially and blow your timeout. If you parallelise,
  cap it at **2–3 background jobs**: rendering is CPU-side (SwiftShader), so more
  browsers starve the box and reads stall for minutes. A few CLI subcommands are
  **renamed** from the in-page tool — `trackInfo`→`track`, `carView`→`car`,
  `agentHelp`→`help`, and `model` is `render({what:"circuit"})`; the legacy
  `frame`/`plan`/`visible` verbs still work and dispatch to
  `render({what:"view"})`/`render({what:"map"})`/`scene({visible:true})`;
  `terminal`/`seed` are in-page only.
  Run `agent.mjs` with no args (or `-h`) for the exact list.
- `node tools/apex-eval.mjs <track> "<expr>"` — boots once and evaluates one
  expression where `a` = `window.__apex`. The door for **anything past a single
  read**: a multi-call sequence, a custom driving policy, a seeded A/B. Batch
  reads into one expression (`JSON.stringify({x:a.world(), y:a.field()})`) and pay
  one boot instead of N. Catch: it stages `race()` only — you stage the rest
  inside the expression (see Staging), or use the CLI, which does it for you.
- `window.__apex.<tool>(...)` inside a live page (Playwright `page.evaluate`, the
  browser console) when you already have one open. **Nothing is readable until
  you stage** — `race(id)` → `go()` → `jump(frac, speed)`, then let two frames
  draw. Skip it and you get a `PlayerNotPlacedError` at best, a stale camera at
  worst. Full rules in Staging, below.

Two words used throughout: **`frac`** is position round the lap as 0→1, and
**`s`** is that same position in metres along the centreline (0 → `track.total`).
`lateralM` is metres from the centreline, + to the right.

**Start every session with `agentHelp()` and `objective()`.** The first names
the whole surface and a `fields` glossary (what each number means in terms of
*what to do about it*); the second says what the game is — win condition, the
trade-offs (track limits, ERS, overtake window, parts budget), the constraints.
Read both once; do not re-fetch per tick.

---

## Load on demand

- Tool catalog, starter policy, determinism, staging sharp edges → [references/surface.md](references/surface.md).
- Telemetry hooks (`probe` / `physState` / `obs` / `fieldState` / `timing` /
  `lightState`) and the headless `reset`/`act` control loop → [references/state.md](references/state.md).

## Reference

- `docs/DEBUG-HOOKS.md` → "Agent world view" — the full per-tool reference (every
  field, every option, the typed errors).
- `docs/AGENT-WORLD-API.md` — the design and the research behind each choice.
- `__apex.agentHelp()` — the live manifest, including the `fields` glossary and
  the `read`/`control` sections listing the raw hooks and the drive/stage verbs.
- Tests: `node tools/test-bg.mjs hooks` (`tests/specs/agent-view.spec.js`,
  `tests/specs/agent-drive-bench.spec.js`, `tests/specs/agent-determinism.spec.js`).
