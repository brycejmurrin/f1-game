# Pixel-perfect options and commands (load on demand)

Use after [SKILL.md](../SKILL.md) Entry. Full workflows: [workflows.md](workflows.md). Diff interpretation: [comparison/README.md](comparison/README.md).

## Key Options

| Option | Default | Use |
|--------|---------|-----|
| `maxDiffPixelRatio` | `0.01` | % pixels allowed to differ (`0.01` = 1%). Set to `0` for zero tolerance |
| `threshold` | `0.05` | Per-pixel color sensitivity (0–1). Raise to `0.1` only for font anti-aliasing false positives |
| `reducedMotion` | `'reduce'` | Sets `prefers-reduced-motion` CSS media query. Remove if you want to test the default (animated) visual state |
| `mask` | `[]` | Locators to black out (prices, timestamps, live data) |
| `fullPage` | `false` | Capture entire scrollable page |
| `animations` | `'disabled'` | Default — CSS + Web Animations API stopped at screenshot time |

## Quick Commands

```bash
npx playwright test                             # compare vs baseline
npx playwright test --project=Desktop           # specific viewport
npx playwright test tests/visual.spec.ts        # specific file
npx playwright test --update-snapshots          # update changed baselines
npx playwright test --update-snapshots=missing  # only add new baselines
```
