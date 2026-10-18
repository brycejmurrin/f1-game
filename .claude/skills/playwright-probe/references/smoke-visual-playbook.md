# Smoke, visual, bot-playtest templates (adapted)

<!-- Source: https://github.com/majidmanzarpour/threejs-game-skills
     Commit: 8286774b22a2566bf894dbc825825c16921866af
     License: MIT -->

Map upstream QA templates to Apex specs and CLIs:

| Template | Apex path |
|---|---|
| Smoke boot + menu | `tests/specs/smoke*.spec.js`, `npm run test:smoke` group |
| Visual regression | `shot.mjs`, `apex-capture.mjs`, `references/car-studio.md` |
| Bot playtest | `__apex` headless `obs/act/reset` (**agent-view**), not random clicks |
| Seeded drive | `rollout()`, fixed `Math.seed` in tests |

Keep specs deterministic; no paid asset APIs from upstream installers.
