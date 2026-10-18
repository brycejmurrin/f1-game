# PWA perf and CWV (adapted)

<!-- Source: https://github.com/addyosmani/web-quality-skills (performance + core-web-vitals)
     Commit: afa8da942115f2961fdbfa80807ea0b232ff6c00
     License: Apache-2.0 -->

| Vital | Apex lever |
|---|---|
| LCP | Shell `index.html`, defer heavy `js/`, soft-present gate in CI |
| INP | Menu handlers; avoid sync work on first tap |
| CLS | HUD scale tokens; **ui-menu-a11y** for layout shifts |

`version.json` + `sw.js` precache lists are generated — edit sources, `npm run gen`.
Mid-test `version.json` bump fails Playwright — see skill body.
