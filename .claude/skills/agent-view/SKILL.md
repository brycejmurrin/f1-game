---
name: agent-view
description: The text-native way to perceive and DRIVE the Apex 26 F1 game as an LLM agent — no screenshots. The window.__apex agent-view API (world/field/trackInfo/scene/atmosphere/describe/query/carView/render/survey/rollout/objective/terminal/seed/agentHelp) and the tools/agent.mjs CLI compose the ~90 debug hooks into one egocentric, typed, compact surface. Use this whenever you need to "see" or "drive" the game without eyes — read the car's situation, understand the track/scenery/car as JSON, run a closed-loop driving policy, reproduce a run deterministically, or check what winning even means. Triggers - "let the agent drive", "perceive the game as text", "what does the car see", "drive a lap headless", "agent world view", "world() / field() / rollout()", "read the track as JSON", "play the game without screenshots", "reproduce this run", "what is the agent trying to do".
---

# Agent view — perceive and drive the game as text

**TL;DR** — Perceive and drive Apex 26 as text, no screenshots. From a shell:
`node tools/agent.mjs <track> <tool> [flags]` (it stages `race`/`go`/`jump` +
frames for you). In-page: `window.__apex.<tool>(...)`. Read `agentHelp()` +
`objective()` once, then loop `world({detail:"drive"})` → decide →
`act(...)`/`rollout({policy})` → `terminal()`. Pin `seed(n)` before any A/B.
Failures are typed (`{ok:false, error, message, fix}`), never `null`.

An LLM cannot read a screenshot well enough to drive, and it does not need to:
this game exposes a **text-native** view of itself. `window.__apex` composes the
~90 raw debug hooks into one small surface that is **egocentric** (framed around
the car, not the world), **typed** (failures are `{ok:false, error, message,
fix}`, never `null`), **compact** (an identifier, never a whole record), and
**self-describing** (`agentHelp()` is the manifest, `objective()` is the game).

The evidence this is the right channel, not a fallback: LLMs drive *worse* with
an image than with structured text (BALROG, VideoGameBench), and every serious
LLM-plays-a-game system converts the world to text. So reach for these, not
screenshots.

Two ways in — same surface, different cost:
- `node tools/agent.mjs <track> <tool> [flags]` from a shell — it does the
  `race`/`go`/`jump` + render-frames staging correctly so you don't hand-roll it.
  **Each call boots its own browser (~30–40 s)**, so it is one read per boot:
  great for a single question, wasteful for many. Don't chain several in one
  shell command — they run serially and blow your timeout; if you must, launch
  them as parallel background jobs.
- `node tools/apex-eval.mjs <track> "<expr>"` — boots once and evaluates one
  expression where `a` = `window.__apex`. This is the door for **anything past a
  single read**: a multi-call sequence, a custom driving policy, a seeded A/B.
  Batch your reads into one expression (`JSON.stringify({x:a.world(), y:a.field()})`)
  and pay one boot instead of N. Note it stages only `race()` — see Staging.
- `window.__apex.<tool>(...)` inside a live page (Playwright `page.evaluate`, the
  browser console) when you already have one open.

**Start every session with `agentHelp()` and `objective()`.** The first names
the whole surface and a `fields` glossary (what each number means in terms of
*what to do about it*); the second says what the game is — win condition, the
trade-offs (track limits, ERS, overtake window, parts budget), the constraints.
Read both once; do not re-fetch per tick.

## The tools, by the question they answer

**Where am I? (dynamic — read per decision)**
- `world({detail})` — the spine. `brief|drive|full`. `drive` adds the corner
  sequence, `pacenotes` (rally-style road ahead), rivals, affordances, ERS and
  penalty state, the ideal-line-free honest geometry to choose a line from.
  `world({since:seq})` returns only what *changed* since a prior payload.
- `field({detail})` — the whole grid: race order, gaps, interval, AI pace.
- `scene({radius|visible})` — named scenery by distance + bearing (radius around
  the car), or `{visible:true}` for the camera's on-screen list.
- `atmosphere()` — the light as prose: day/night, sun/moon, floodlights, fog
  visibility, wet road.

**What is this place / thing? (static — fetch once)**
- `trackInfo({what})` — corners / sectors / elevation profile; grounded in the
  real circuit (`gp`, `realLengthKm`, `lengthErrorPct`).
- `carView({detail})` — the car as JSON: team, parts spec + effects, measured
  geometry; `detail:"parts"` adds per-part boxes.
- `objective()` — what the game is (see above).

**Drill down (pull, never dump)**
- `describe(id)` — everything about ONE thing: `prop:1980`, `corner:T3`,
  `car:4`, `span:2`. Ids come from the list rows.
- `query({kind, near, fromS, toS})` — a bounded slice as prototype + instances
  (6 pines cost ~1 KB, not 6 records), and it reports what it withheld.

**Show it (optional, APPROXIMATE)**
- `render({what})` — the ONE raster: `view` | `map` | `circuit` | `car`. Flagged
  approximate on purpose — a character grid reads *worse* than the numbers it is
  drawn from, so this is for composition/debugging, not for reading geometry.

**Act & check**
- `rollout({seconds, policy|input})` — drive an interval, get a DIGEST (speed
  min/max/mean, off-track events, min clearance, per-corner min speed, terminal
  reason), not every frame. `policy` is `world => {steer,throttle,brake}`.
- `terminal()` — `{done, reason}`: finished | wrong_way | rescued.
- `survey()` — geometry DEFECTS (floating/buried props, terrain through the
  road) — for track authoring, not driving.

## The driving loop

```
objective()                       // once — what winning is
trackInfo({what:"corners"})       // once — the static map
loop:
  w = world({detail:"drive"})     // where am I, what's ahead
  decide from w.nextCorner / w.pacenotes / w.rivals / w.ego
  act({steer,throttle,brake}, dt, n)   // or rollout({seconds, policy})
  terminal().done ? stop : repeat
```

An LLM cannot decide at 60 Hz — that is what `rollout({policy})` is for: it runs
your policy at `policyHz` (default 10) while physics steps every tick, and hands
back a digest. Use it for a lap; use `world()`+`act()` for a single decision.

## Determinism — pin the seed before any comparison

The simulation is seeded. `seed(n)` sets it; `reset(frac, speed, x, seed)`
reproduces an episode exactly — **same seed + same inputs ⇒ same result**. Any
A/B (a physics tweak, two policies) is noise unless both runs share a seed, and
`world({full}).session.seed` makes a snapshot self-describing (replay it with
`reset(...,seed)`). Cosmetic randomness (particles, camera shake) is deliberately
unseeded so it can never perturb the sim.

## Staging (the sharp edges the CLI handles for you)

In-page you must stage before reading, or you get plausible-but-wrong answers:

```js
__apex.race("monza"); __apex.go(); __apex.jump(0.1, 55);  // load, start, place
// obs()/physState()/world()/describe() need player.px — jump() or one step() first
// visible()/render({what:"view"}) read the LAST RENDERED frame — let frames draw
// scene() reads placed props — a heavy street circuit (Singapore, Monaco, Baku)
//   finishes its prop build a few frames after race(); an empty scene() means
//   "not built yet", not "nothing there" — let frames draw, or just re-call it
```

`node tools/agent.mjs monza world --detail drive` does all of this for you.
**`apex-eval` does not** — it boots and calls `race()` only, so a player-placed
tool returns a not-placed error until you stage inside the expression:
`node tools/apex-eval.mjs monza "(a.go(), a.jump(0.1,55), a.world())"`.

You rarely need to memorise this, because **the errors tell you the fix.** Every
agent-view failure is `{ok:false, error, message, fix, state}` — `fix` names the
exact call to make (`"call __apex.jump(frac, speed) first"`,
`"props are indexed 0..2834; call scene()/query()"`) and `state.playerReady`
says whether you are staged. Read `fix` and do what it says; the surface is
built to be driven by its own error messages.

## Reference

- `docs/DEBUG-HOOKS.md` → "Agent world view" — the full per-tool reference (every
  field, every option, the typed errors).
- `docs/AGENT-WORLD-API.md` — the design and the research behind each choice.
- `__apex.agentHelp()` — the live manifest, including the `fields` glossary and
  the `read`/`control` sections listing the raw hooks and the drive/stage verbs.
- Tests: `npm run test:agent` (`tests/agent-view.spec.js`,
  `tests/agent-drive-bench.spec.js`, `tests/agent-determinism.spec.js`).
