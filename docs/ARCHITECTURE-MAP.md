# Apex 26 — architecture map (new contributors)

A short tour of how the game is put together. The module **contract** (what each
file may assume) lives in [ARCHITECTURE.md](ARCHITECTURE.md). Working rules live
in [`AGENTS.md`](../AGENTS.md). This page is the mental model.

## What you are looking at

Unofficial WebGL F1 fan game. **No bundler, no framework.** Static files on
GitHub Pages. Every runtime JS file is a `"use strict"` IIFE that assigns **one
global**. The file you edit is the file the browser runs.

```
index.html          static DOM + <script> tags (?v=dev; Pages rewrites hashes)
css/                menus, HUD, overlays
js/game.js          entry: state machine, physics step, AI, race loop
js/*                domains (render, track, circuits, car, input, …)
tools/manifest.cjs  single source of truth for load order / lazy rosters
vendor/             three.js, Rapier, Trystero, jsQR (feature-gated)
assets/pack/        baked PBR material arrays (ships ON; failures degrade)
```

## Boot path

1. Browser loads `index.html`. Script tags follow `tools/manifest.cjs` (asserted
   by `tests/unit/load-order.test.mjs`). `js/core/log.js` is first.
2. `js/game.js` runs, builds the **`G` façade** (live getters over its closure
   state), and calls `Module.create(G)` on extracted subsystems. Modules must
   not reach into `game.js` internals — only through `G`.
3. Renderer pick (`js/render/gfx.js`): default **TLX** (three.js), explicit
   WebGL2 **GLX**, opt-in **WGX** (WebGPU). TLX/WGX are **DEFERRED** — injected
   at boot for the resolved choice, not always tagged.
4. First race builds a circuit: `js/circuits/<id>.js` data +
   `js/circuits/scenery/<id>.js` (lazy) through the track engine in `js/track/`.
5. Frame loop: input → physics/AI/race-control → HUD DOM → `gfx` draw/present.

Dev / test surface: `window.__apex` (`js/agent/apex.js`, lazy). Prefer JSON
hooks (`info`, `physState`, `world`) over screenshots. See [DEBUG-HOOKS.md](DEBUG-HOOKS.md).

## Layer map

| Layer | Where | Role |
|---|---|---|
| **Shell / DOM** | `index.html`, `css/` | All static UI; game only shows/hides and paints text |
| **Entry / loop** | `js/game.js` | `state ∈ {menu,count,race,results}`; `flow` × `session` mode axes |
| **Input** | `js/input/` | Keyboard / pad / tilt / touch → driving + menu nav |
| **Physics** | `js/physics/`, parts of `game.js` | World-space player rigid body; track `(s,x)` is a readback |
| **AI / race** | `js/physics/ai-*.js`, `js/race/` | Field, flags, pits, weather, quali, daily |
| **Career / season** | `js/career/`, season UI | Saves under `apex26.career.*` / season standings |
| **Track engine** | `js/track/` | Splines, meshes, scenery API, props |
| **Circuit data** | `js/circuits/` | One def + one scenery file per circuit |
| **Car / garage** | `js/car/`, `js/garage/` | Mesh, liveries, parts, ghosts, setup bay |
| **Render** | `js/render/{glx,three,webgpu,shared}/` | One draw seam; three backends |
| **Audio** | `js/audio/` | Engine, SFX, radio, music |
| **Net** | `js/net/` | VS Friend WebRTC + Nostr room codes |
| **Data hub** | `js/data/` | External F1 API tabs (optional) |
| **Persist** | `js/core/store.js` | `apex26.*` localStorage + durable IDB mirror |

## Data flow (one race frame)

```
Input.poll()
    → player forces / assists (assists OFF ⇒ no racing-line force)
    → AI field + RaceControl flags
    → Collide / debris / incidents (side worlds)
    → GameHud DOM + Particles / SkidMarks
    → gfx.begin → draw scene → present (post)
```

Coordinates: **+Y up**, metres, radians, arc `s`, lateral `x` (+right).
`+k` = LEFT turn. Frac-keyed scenery tables must respect `def._sceneryShift`.

## Modes (not one enum)

- **`flow`**: `gp | season | career` — what the run is for
- **`session`**: `race | tt | quali` — what this visit to the track is

Career is a championship that also applies economy / R&D rules. See
[CAREER.md](CAREER.md). Physics invariants: [PHYSICS.md](PHYSICS.md) and
`AGENTS.md` §Physics (`PACE` is a scale; the arc must not reach the driver).

## Build / test / deploy

There is **no compile step**. Generated artifacts (`index.html` script blocks,
`js/roster.js`, ladder figures, …) come from `npm run gen` / `tools/gen/*` —
never hand-edit those (see `AGENTS.md` rule 11).

| Command | When |
|---|---|
| `npx serve -l 3456 .` | Local play |
| `npm run test:tooling-fast` | Edit-loop unit/tooling gate (~2 min) |
| `node tools/ci/verify-change.mjs` | Fast gate + planned browser groups |
| `node tools/track/verify-track.cjs <id>` | One circuit build check |
| `node tools/ci/pick-tests.mjs` | Which browser GROUPS this diff needs |
| `node tools/ci/deploy.mjs --gate-only` | Full pre-push gate (no push) |

Ship branch: `claude/f1-game-project-26h3ng` → `ci.yml` then `pages.yml` →
https://brycejmurrin.github.io/f1-game/. Feature work: `claude/<topic>` or
`cursor/<topic>` branches; sync with `node tools/ci/sync-pr.mjs`, not hand merges.

Verification scales to the change — one browser group is expensive on
SwiftShader. Details: [TESTING.md](TESTING.md).

## Where to edit what

| Change | Edit |
|---|---|
| Circuit data / scenery dressing | `js/circuits/<id>.js` + `js/circuits/scenery/<id>.js` — see [SCENERY-AND-TRACK-BUILD.md](SCENERY-AND-TRACK-BUILD.md) |
| Shared spline / prop emitters | `js/track/` |
| Handling / pace / assists | `js/physics/`, tunables in `game.js` |
| Menu / pause / a11y | `js/ui/`, `css/`, DOM in `index.html` |
| Renderer bug | path-scoped rules in `.claude/rules/render-*.md` |
| New JS file | IIFE + `tools/manifest.cjs` + `npm run gen` |

## Related reading

- [ARCHITECTURE.md](ARCHITECTURE.md) — full module contracts + generated index
- [BUGS.md](BUGS.md) — verified open/fixed defects (incl. scenery S1–S10)
- [SCENERY-AND-TRACK-BUILD.md](SCENERY-AND-TRACK-BUILD.md) — track/scenery pipeline + accuracy levers
- [notes/ARCHITECTURE-REVIEW.md](notes/ARCHITECTURE-REVIEW.md) — founding bet & lessons
- [notes/DEFECT-LEDGER.md](notes/DEFECT-LEDGER.md) — historical open/fixed register
- [AGENT-SURFACE.md](AGENT-SURFACE.md) — skills, MCP, hooks map
