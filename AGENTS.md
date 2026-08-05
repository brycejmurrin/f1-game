# Apex 26 — agent instructions

Instructions for AI coding agents (Cursor, Claude Code, Copilot, etc.). The
**canonical engineering reference is [`CLAUDE.md`](CLAUDE.md)** — read it for
physics, load order, testing rules, logging, cache busting, and the full
`__apex` hook list. This file is the **entry point**: bootstrap, which tool to
reach for, and where the deeper docs live.

---

## Start here

1. **Read [`CLAUDE.md`](CLAUDE.md)** before editing `js/`, `css/`, or tests.
2. **Pick a skill** in [`.claude/skills/README.md`](.claude/skills/README.md)
   when the task matches (physics, tracks, lighting, screenshots, career, …).
3. **Run the smallest check that fits** — see [Validation](#validation) below.

---

## Bootstrap (fresh clone / cloud VM)

```sh
npm install
npx playwright install chromium    # required unless a sandbox binary is present
```

Headless tools look for a preinstalled Chromium at `/opt/pw-browsers/chromium`
(see `tools/harness.mjs` `pickChromium()`). When that path is missing, Playwright
downloads its own build — the install step above is mandatory.

Serve the game locally (static files, no build step):

```sh
python3 -m http.server 3456 .      # reliable; no npx confirmation prompt
# or:
npx -y serve -l 3456 .
```

Then open `http://127.0.0.1:3456/` in a browser. Cloud agents with computer-use
can drive the UI visually; headless Playwright is faster for probes and tests.

---

## Which tool when

| Goal | Use |
|---|---|
| One `__apex` expression → JSON | `node tools/apex-eval.mjs <track> "<expr>"` |
| Agent world / scene / rollout | `node tools/agent.mjs <track> <cmd>` — `help` lists surfaces |
| One deterministic track screenshot | `node .claude/skills/playwright-probe/shot.mjs <track> <frac> [cam] [out.png]` |
| Parallel screenshot sweeps | `node tools/apex-capture.mjs cameras\|tracks\|modes […]` |
| Track build guard (no browser, ~2 s) | `node tools/verify-track.cjs <id>` |
| Pick tests for your diff | `node tools/pick-tests.mjs [--staged\|--bg]` |
| Full Playwright suite | `npm run test:tiny` → groups from `pick-tests` → `node tools/test-bg.mjs <group>` |
| Tool index (all scripts) | [`tools/README.md`](tools/README.md) |
| `__apex` API reference | [`docs/DEBUG-HOOKS.md`](docs/DEBUG-HOOKS.md) |
| Agent-view JSON API | [`docs/AGENT-WORLD-API.md`](docs/AGENT-WORLD-API.md) |

**Skills with Playwright detail:** `playwright-probe`, `agent-view`, `debug-state`,
`debug-tracks`, `debug-cameras`, `check-changes`, `bump-cache`.

### Quick examples

```sh
# Physics snapshot at Monza T1
node tools/apex-eval.mjs monza "(a.go(), a.jump(0.03, 55), a.physState())"

# Full driving context for an agent
node tools/agent.mjs monza world --detail drive

# Orbit shot at ~18% lap
node .claude/skills/playwright-probe/shot.mjs monza 0.18 orbit scratch/captures/playwright-probe/monza.png

# Smoke gate (~2 min solo on a small box)
npm run test:tiny
```

---

## Headless screenshots (easy to get wrong)

`park()` freezes **physics**, not rendering — the WebGL loop keeps redrawing under
SwiftShader, so a naive `.screenshot()` can hang or time out.

Before capturing the canvas in a custom script or spec:

1. Let the scene settle (~300 ms after `race()` + mesh build).
2. Frame the camera (`orbit` / `eye` / `park` + **`snapCam()`** for chase rigs).
3. Call **`__apex.headless(true)`** — stops `render()` so Playwright reads a quiet
   compositor (see `parkForScreenshot()` in `tests/smoke.spec.js`).

Official specs and `shot.mjs` follow this pattern. Do not use `canvas.toDataURL()`
for verification — WebGL buffers are often blank without `preserveDrawingBuffer`.

---

## Cache busting (ship JS/CSS changes)

Every `js/` / `css/` edit needs **both**:

- all `?v=N` tags in `index.html` incremented to the same N
- `version.json` `{ "build": N }` set to that same N

See **Critical conventions** in [`CLAUDE.md`](CLAUDE.md) and the `bump-cache`
skill. **Never bump `version.json` while a Playwright run is in flight** — the
shell version guard force-reloads open pages and causes false timeouts.

---

## Validation

Escalation order (full rules in [`CLAUDE.md`](CLAUDE.md) → Testing workflow):

| Step | Command |
|---|---|
| 1 | `npm run test:tiny` |
| 2 | `npm run test:tooling-fast` |
| 3 | `node tools/verify-track.cjs <id>` (any track edit) |
| 4 | Groups from `node tools/pick-tests.mjs` — run **one heavy group at a time** via `node tools/test-bg.mjs <group>` |

**Never block on a test run.** Start background groups, arm a log monitor, and keep
working. Do not edit `js/` or `css/` while tests serve the working tree.

---

## Branches

```sh
git branch --show-current    # where you work — never hardcode a branch name in docs
```

Deploy branch (GitHub Pages): `claude/f1-game-project-26h3ng` — see
[`CLAUDE.md`](CLAUDE.md) → Git branch.
