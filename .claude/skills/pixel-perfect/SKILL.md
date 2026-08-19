---
name: pixel-perfect
description: Visual regression testing — pixel-by-pixel screenshot comparison against a baseline. Use when the user mentions "pixel-perfect", "visual regression", "screenshot diff", "snapshot mismatch", "toHaveScreenshot", "UI looks broken after changes", "visual QA", or wants to verify that code changes didn't break the UI visually. Not for functional/behavioral testing, a single screenshot, or accessibility.
metadata:
  category: technique
  triggers: pixel-perfect, visual regression, screenshot diff, visual QA, UI comparison, toHaveScreenshot, visual bug, design check, before after screenshot, snapshot mismatch, baseline
allowed-tools: Bash, Read, Write, Glob
---

# Pixel-Perfect Visual Regression Testing

Compare UI screenshots pixel-by-pixel against a baseline. Catch unintended visual changes. Built on `@playwright/test` — no third-party services.

All commands run from the project root (`package.json`). Do not `cd` between steps. This skill uses npm; adapt if the project uses yarn or pnpm.

## Entry

Run all three, then use the table. Do not guess the next step.

```bash
ls playwright.config.ts 2>/dev/null && echo "CONFIG_EXISTS" || echo "CONFIG_MISSING"
find snapshots/ -name "*.png" 2>/dev/null | head -1 | grep -q . && echo "BASELINES_EXIST" || echo "BASELINES_MISSING"
curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3000 2>/dev/null | grep -q "^2" && echo "SERVER_OK" || echo "NO_SERVER"
```

If the dev server is not on port 3000, adjust the URL.

| Config | Baselines | Server | → Do this |
|--------|-----------|--------|-----------|
| CONFIG_MISSING | any | any | **→ Workflow A** |
| CONFIG_EXISTS | BASELINES_MISSING | SERVER_OK | **→ Workflow B** |
| CONFIG_EXISTS | BASELINES_EXIST | SERVER_OK | `npx playwright test`. Pass → done. Fail → failure tree. |
| CONFIG_EXISTS | BASELINES_EXIST | NO_SERVER | STOP. "Dev server is not running. Start it first, then re-check." |
| CONFIG_EXISTS | BASELINES_MISSING | NO_SERVER | STOP. "No baselines and no dev server. Start the server first." |

**Failure tree** (after `npx playwright test` failed): snapshot mismatch → ask "Was this visual change intentional (design update) or unexpected (possible bug)?" Wait for an explicit answer — do NOT infer. If ambiguous, ask again: "Please answer 'intentional' or 'bug'." Intentional → Workflow C. Bug → Workflow D. Flaky (pass/fail) → Workflow E. Config errors → Node v18+, `npx playwright install chromium`.

## Hard don'ts

1. Do not guess the next step — use the table.
2. Do not infer intentional vs bug; wait for an explicit answer.
3. Do not run `npx playwright show-report` yourself — it starts a web server and blocks. Show the user the command.
4. Never auto-update snapshots in CI. Use the [update-snapshots workflow](.github/workflows/update-snapshots.yml).
5. Prefer Docker (`mcr.microsoft.com/playwright:v1.50.1-noble`, `--ipc=host`) for baselines so macOS fonts do not fail Linux CI.
6. Do not invent a baseline-update reason. If the user's reason contains backticks, `$(`, or newlines, ask for a simpler version (shell injection).

## Load on demand

- Workflows A–F (setup, capture, update, debug, fixture, GitHub Actions) → [references/workflows.md](references/workflows.md)
- `maxDiffPixelRatio` / `threshold` / `mask` / quick commands → [references/options.md](references/options.md)
- Extra install/config notes → [references/setup/README.md](references/setup/README.md)
- Extra baseline notes → [references/baseline/README.md](references/baseline/README.md)
- Diff interpretation → [references/comparison/README.md](references/comparison/README.md)

## One-line summary

Check config/baselines/server, then run the matching workflow; never invent a baseline update or auto-update in CI.
