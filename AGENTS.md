# Apex 26 — agent instructions

Cross-tool entry point for AI coding agents ([AGENTS.md standard](https://agents.md/),
[Cursor rules](https://cursor.com/docs/rules)). **Canonical reference:
[`CLAUDE.md`](CLAUDE.md)** — physics, load order, testing philosophy, logging,
cache busting, `__apex` hooks. This file: bootstrap, boundaries, which tool to use,
and where deeper docs live.

---

## Start here

1. **Read [`CLAUDE.md`](CLAUDE.md)** before editing `js/`, `css/`, or tests.
2. **Invoke the matching skill** in [`.claude/skills/README.md`](.claude/skills/README.md)
   when one fits (`playwright-probe`, `check-changes`, `bump-cache`, `debug-state`, …).
3. **Run the smallest check that fits** — [Validation](#validation) below.

No build step. Static IIFE modules via `<script>` tags. Load order:
`tools/manifest.cjs` ↔ `index.html` (asserted by `tests/load-order.test.mjs`).

---

## Bootstrap (fresh clone / cloud VM)

```sh
npm install
npx playwright install chromium    # required when no sandbox binary is present
```

Browser resolution (first match wins):

| Source | Used by |
|---|---|
| `$CHROME` or `$PW_CHROMIUM` | `tools/harness.mjs`, `playwright.config.js` |
| `/opt/pw-browsers/chromium*` | Preinstalled sandbox images (when present) |
| Playwright cache | Default after `npx playwright install chromium` |

Override install location with `PLAYWRIGHT_BROWSERS_PATH` ([Playwright docs](https://playwright.dev/docs/browsers#managing-browser-binaries)).

Serve locally:

```sh
python3 -m http.server 3456 .      # reliable; no npx confirmation prompt
npx -y serve -l 3456 .            # alternative
```

Open `http://127.0.0.1:3456/`. Cloud agents with **computer-use** can drive the UI
visually; headless Playwright is faster for probes and regression.

---

## Boundaries

### Always

- Pick tests with `node tools/pick-tests.mjs` — do not guess groups.
- Run Playwright groups in the **background** (`node tools/test-bg.mjs <group>`) — never block or poll in a loop.
- Bump `?v=N` in `index.html` **and** `version.json` together after any `js/` or `css/` change (see `bump-cache` skill).
- Use `Log.*` in game code — not bare `console.*` (see `CLAUDE.md` → Logging).
- Run `node tools/verify-track.cjs <id>` before pushing any track/scenery edit.

### Ask first

- Adding npm dependencies (project ships with almost none).
- Changing physics or assist **defaults** (stored keys persist for existing players).
- Editing `js/track/graph.js` without a parity plan (`tools/graph-parity.cjs --all`).

### Never

- Edit `js/` or `css/` while a Playwright run serves this tree (use a git worktree).
- Bump `version.json` mid-run (shell version guard force-reloads open pages → false timeouts).
- Run two **heavy** test groups at once on a 4-core box (`circuit`, `scenery`, `physics`, `behaviour`, `baseline`, `render`).
- Push to `main` without review. Deploy branch: `claude/f1-game-project-26h3ng`.

---

## Which tool when

| Goal | Command |
|---|---|
| One `__apex` expression → JSON | `node tools/apex-eval.mjs <track> "<expr>"` (`a` = `__apex`; `--raw`) |
| Agent world / scene / rollout | `node tools/agent.mjs <track> <cmd>` — `help` lists surfaces |
| One track screenshot | `node .claude/skills/playwright-probe/shot.mjs <track> <frac> [cam] [out.png]` |
| Parallel screenshot sweeps | `node tools/apex-capture.mjs cameras\|tracks\|modes\|identity […]` |
| Track build guard (~2 s, no browser) | `node tools/verify-track.cjs <id>` |
| Scene-graph migration gate | `node tools/graph-parity.cjs --all` (not routed by `pick-tests`) |
| Pick tests for your diff | `node tools/pick-tests.mjs [--staged\|--bg]` |
| Fast sanity (~30–60 s) | `node tools/quick-validate.mjs` |
| Smoke gate | `npm run test:tiny` |
| Single spec | `npx playwright test <spec> -g "<name>" --workers=1 --reporter=line` |
| Tool index | [`tools/README.md`](tools/README.md) |
| `__apex` / agent-view API | [`docs/DEBUG-HOOKS.md`](docs/DEBUG-HOOKS.md), [`docs/AGENT-WORLD-API.md`](docs/AGENT-WORLD-API.md) |
| Full test map | [`docs/TESTING.md`](docs/TESTING.md) |

**Skills:** `playwright-probe`, `agent-view`, `check-changes`, `bump-cache`,
`pwa-cache-service-worker`, `debug-state`, `debug-tracks`, `debug-cameras`.

### Quick examples

```sh
node tools/apex-eval.mjs monza "(a.go(), a.jump(0.03, 55), a.physState())"
node tools/agent.mjs monza world --detail drive
node .claude/skills/playwright-probe/shot.mjs monza 0.18 orbit scratch/captures/playwright-probe/monza.png
npx playwright test tests/smoke.spec.js -g "corner approach" --workers=1
```

Before a test run: `pgrep -cf pw-browsers` (expect 0) and `cat /proc/loadavg` (expect < ~3 on 4 cores).

---

## Headless screenshots (easy to get wrong)

`park()` / `freeze()` stop **physics**, not rendering. Under SwiftShader the WebGL
loop keeps redrawing, so naive `.screenshot()` can hang for 30–120 s or time out.

**Pattern for custom scripts** (from `parkForScreenshot()` in `tests/smoke.spec.js`
and `snapForward()` in `tests/track-helpers.js`):

1. `race()` → wait for track → settle (~300 ms–2.5 s on heavy circuits).
2. Frame the camera (`orbit` / `eye` / `park` + **`snapCam()`** for chase rigs).
3. **`__apex.headless(true)`** — stops `render()`; compositor keeps the last frame.
4. `page.locator('canvas#game').screenshot({ timeout: 60000 })`.

Do **not** use `canvas.toDataURL()` — WebGL backbuffer is often black. Do **not**
use `page.screenshot({ animations: 'disabled' })` under SwiftShader — measured to
hang (`tools/apex-capture.mjs` comment). `shot.mjs` and Playwright specs follow
the `headless(true)` pattern; `apex-capture.mjs` uses `waitFrames(2)` + long
timeouts on parallel workers instead.

In-race viewport: landscape **844×390** (avoids `#rotate-device` overlay).

---

## Cache busting (ship JS/CSS changes)

Both must match:

- every `?v=N` in `index.html`
- `version.json` `{ "build": N }`

See **Critical conventions** in [`CLAUDE.md`](CLAUDE.md), the `bump-cache` skill,
and `pwa-cache-service-worker` for PWA/service-worker coupling. Docs/tests/tools
edits alone do **not** need a bump.

---

## Validation

Escalation (full rules: [`CLAUDE.md`](CLAUDE.md) → Testing workflow):

| Step | Command |
|---|---|
| 1 | `npm run test:tiny` |
| 2 | `npm run test:tooling-fast` |
| 3 | `node tools/verify-track.cjs <id>` (any track edit) |
| 4 | `node tools/graph-parity.cjs --all` (if `js/track/graph.js` moved) |
| 5 | Groups from `pick-tests` — **one heavy group at a time** via `test-bg.mjs` |

### Definition of done

- [ ] Correct cache bump when `js/` or `css/` changed
- [ ] `pick-tests` groups started (background) or explicitly waived with reason
- [ ] Track/graph guards green when those trees were touched
- [ ] No `js/`/`css/` edits made while a run was in flight

---

## Branches

```sh
git branch --show-current    # never hardcode a branch name in docs
```

Deploy branch (GitHub Pages): `claude/f1-game-project-26h3ng`.
