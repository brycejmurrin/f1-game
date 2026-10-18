# Lighthouse a11y and quality (adapted)

<!-- Source: https://github.com/addyosmani/web-quality-skills
     Commit: afa8da942115f2961fdbfa80807ea0b232ff6c00
     License: Apache-2.0 -->

Use chrome-devtools `lighthouse_audit` on `http://localhost:3456` for menus/HUD.

| Audit | Apex focus |
|---|---|
| Accessibility | `#menu`, `#hud`, `aria-selected` / `aria-pressed`, focus trap |
| Best practices | No bare `console.*` — use `Log` |
| Performance | Shell weight → **pwa-cache-service-worker** |

Full UI matrix across shapes → **survey-ui-matrix**. One cramped screen → this skill.
