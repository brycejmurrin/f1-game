# Apex 26 — agent instructions

Cross-tool entry point for AI coding agents ([AGENTS.md standard](https://agents.md/),
[Cursor rules](https://cursor.com/docs/rules)). **Canonical reference:
[`CLAUDE.md`](CLAUDE.md)** — physics, load order, testing philosophy, logging,
cache busting, `__apex` hooks. This file: bootstrap, boundaries, which tool to use,
**when to wait / commit / push / open a PR**, and where deeper docs live.

---

## Start here

1. **Read [`CLAUDE.md`](CLAUDE.md)** before editing `js/`, `css/`, or tests.
2. **Invoke the matching skill** in [`.claude/skills/README.md`](.claude/skills/README.md)
   when one fits (`playwright-probe`, `check-changes`, `bump-cache`, `debug-state`, …).
3. Follow the **[work loop](#work-loop-edit--test--commit--push--pr)** below — do not invent
   a wait/commit order.

No build step. Static IIFE modules via `<script>` tags. Load order:
`tools/manifest.cjs` ↔ `index.html` (asserted by `tests/load-order.test.mjs`).

---

## Work loop (edit → test → commit → push → PR)

Do these in order. Skipping a step is how agents sit idle for ten minutes or ship
unreviewed work.

| Step | Do | Wait for? |
|---|---|---|
| **1. Edit** | Change only what the task needs. Docs/tools/tests are safe while a Playwright run serves another tree; **never** edit `js/`/`css/` in the same tree a run is serving (use a worktree). | No |
| **2. Pick tests** | `node tools/pick-tests.mjs` (or `--staged`). Trust the output — do not invent groups. | No (~instant) |
| **3. Fast gates** | Run whatever `pick-tests` named that finishes in seconds: usually `npm run test:tooling-fast`. Track edit → `node tools/verify-track.cjs <id>` first. Docs-only → **tooling-fast is enough** before commit. | **Yes — wait for these.** They are short. |
| **4. Cache bump** | If you touched `js/` or `css/`: bump `?v=N` + `version.json` **last**, after tests you care about for the edit are done or backgrounded. Never mid-run. | No |
| **5. Commit** | When the change set is coherent and fast gates are green. Descriptive message. Do **not** wait for a SwiftShader group to finish before the first commit. | No (beyond step 3) |
| **6. Push** | `git push -u origin <branch>` after commit. Cloud agents: push so the PR can track the branch. | No |
| **7. Open / update PR** | Create a **draft** PR after the first push (pre-review). Update the PR body when you push more commits. Do **not** wait for full browser CI before opening the draft — open it so humans can see the CL. | No |
| **8. Heavy Playwright** | Start `node tools/test-bg.mjs <group>` for groups `pick-tests` named. **Arm a log monitor and keep working** (docs, next fix, commit message). One heavy group at a time on 4 cores. | **Do not block.** Come back when the log shows a verdict (`N passed` / `N failed` / `Error:`). |
| **9. Ready for review** | Mark draft ready (or say so in the PR) when: fast gates green, required `pick-tests` groups green **or** waived with reason (e.g. docs-only), CI structural/smoke green if it has finished. | Wait only for **your** background groups / CI checks you claimed — not for idle loadavg. |

### What "wait" means

| Kind | Duration | Agent behaviour |
|---|---|---|
| `test:tooling-fast`, `verify-track`, `node --check` | seconds–~20 s | Run in foreground; fix failures before commit. |
| `test:tiny` / single smoke spec | ~1–3 min solo | Optional after core/`index.html` edits. Run alone on a quiet box; do **not** sit polling. Prefer background + monitor if you start it. |
| One Playwright **group** (`test-bg`) | minutes–tens of minutes | **Start and walk away.** Never `sleep` loops / `--wait` in the agent turn. |
| Full suite / CI browser jobs | long | Trust GitHub Actions after push. Locally: only the groups `pick-tests` named. |

**A timeout under high load is not a test result.** If `/proc/loadavg` is ≫ cores or stray Chromium is running, stop everything, wait for load to decay, re-run that **one** group alone — see [`CLAUDE.md`](CLAUDE.md) → Testing workflow.

### Quiet-box check (before starting browsers)

```sh
cat /proc/loadavg          # expect 1-min load < ~3 on 4 cores
pgrep -c chrome-headless-shell || true   # expect 0 (do NOT grep for "pw-browsers" —
                                         # that string matches the shell line itself)
node tools/test-bg.mjs --status
```

### Docs-only / skills-only diffs

Typical files: `AGENTS.md`, `CLAUDE.md`, `docs/**`, `.claude/skills/**` (no `js/`/`css/`).

1. `node tools/pick-tests.mjs` → expect `test:tooling-fast`.
2. Wait for **`npm run test:tooling-fast`** (must be green).
3. Commit → push → open/update **draft PR**.
4. Do **not** block on `test:tiny`, `shot.mjs`, or heavy groups unless you changed capture logic and want an optional smoke of that tool — and only on a quiet box.

### Code diffs (`js/` / `css/` / tracks)

1. Fast gates + `verify-track` / graph-parity when applicable.
2. Cache bump last.
3. Commit → push → draft PR (pre-review is fine **before** heavy groups finish).
4. Start `pick-tests` groups in background; update PR when they finish (pass or real fail).

---

## Boundaries

### Always

- Pick tests with `node tools/pick-tests.mjs` — do not guess groups.
- Run Playwright groups in the **background** (`node tools/test-bg.mjs <group>`).
- Bump `?v=N` in `index.html` **and** `version.json` together after any `js/` or `css/` change (see `bump-cache` skill).
- Use `Log.*` in game code — not bare `console.*` (see `CLAUDE.md` → Logging).
- Run `node tools/verify-track.cjs <id>` before pushing any track/scenery edit.
- Open a **draft PR** after the first meaningful push so the changelist is reviewable early.

### Ask first

- Adding npm dependencies (project ships with almost none).
- Changing physics or assist **defaults** (stored keys persist for existing players).
- Editing `js/track/graph.js` without a parity plan (`tools/graph-parity.cjs --all`).
- Marking a PR ready for review while a required `pick-tests` group is still red or unrun.

### Never

- Edit `js/` or `css/` while a Playwright run serves this tree (use a git worktree).
- Bump `version.json` mid-run (shell version guard force-reloads open pages → false timeouts).
- Run two **heavy** test groups at once on a 4-core box (`circuit`, `scenery`, `physics`, `behaviour`, `baseline`, `render`).
- Block the agent turn on a SwiftShader group or poll `--status` in a loop.
- Wait for "the box to feel quiet" instead of running the **fast** gate that `pick-tests` named.
- Push to `main` without review. Deploy branch: `claude/f1-game-project-26h3ng`.

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

## Validation (what to run)

Escalation (full rules: [`CLAUDE.md`](CLAUDE.md) → Testing workflow):

| Step | Command | When |
|---|---|---|
| 1 | `npm run test:tooling-fast` | Almost every edit; **required** for docs |
| 2 | `npm run test:tiny` | After core / `index.html` / load-order changes — not for docs-only |
| 3 | `node tools/verify-track.cjs <id>` | Any track edit |
| 4 | `node tools/graph-parity.cjs --all` | If `js/track/graph.js` moved |
| 5 | Groups from `pick-tests` via `test-bg.mjs` | Code that those groups cover — background, one heavy at a time |

### Definition of done

- [ ] `pick-tests` consulted; fast gates it named are green
- [ ] Heavy groups started in background **or** waived (docs-only / N/A) with reason in the PR
- [ ] Cache bump correct when `js/` or `css/` changed
- [ ] Track/graph guards green when those trees were touched
- [ ] Draft PR open with an accurate summary; pushed branch matches the PR
- [ ] No `js/`/`css/` edits made while a run was in flight

---

## Branches

```sh
git branch --show-current    # never hardcode a branch name in docs
```

Deploy branch (GitHub Pages): `claude/f1-game-project-26h3ng`.
