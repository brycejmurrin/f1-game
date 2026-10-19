# Mobile UI capture profiles

Use complete Playwright device descriptors for representative mobile captures.
`hasTouch` alone retains desktop UA and viewport behavior; a small desktop window
is a separate test. `tools/lib/ui-device-profile.mjs` supplies coherent UA,
mobile viewport behavior, touch, screen dimensions and DPR. The browser engine
is recorded separately: Chromium with an iPhone descriptor is not Safari.
Playwright Test specs use `uiTestOptions()` from the same module; it passes
`screen` through the supported `contextOptions` fixture and restores complete
desktop identity in nested mouse cases.

```sh
node tools/ui/explorer.mjs inspect --screen garage --device 'iPhone 13' --settings scratch/phone-settings.json
node tools/ui/explorer.mjs inspect --screen trackdesigner --device 'iPhone 13 landscape' --settings scratch/phone-settings.json
```

`--settings` accepts an actual Apex settings export, imports it through the game,
checks the import result, then reloads. Without it the fresh context uses shipped
defaults. Reports record that distinction. Do not silently substitute fresh
defaults when reproducing a supplied settings export. Do not commit player saves.

Device descriptors distinguish browser content viewport from screen size. In the
installed Playwright catalog, iPhone 13 portrait has a 390×664 CSS content viewport
and a 390×844 screen; landscape has a 750×342 content viewport. The historically
named full-screen layout-audit cells explicitly pin 393×852, 852×393 and 844×390,
so a descriptor update cannot silently add browser toolbar deductions to them.
These are full-screen geometry approximations, not physical Safari captures.

Custom `--boot` / `--viewports` dimensions are CSS pixels and are labeled custom
or resize stress cases. They do not establish the user's browser Page Zoom.
DPR changes raster resolution, not CSS breakpoint selection. Fast HUD/geometry
sweeps deliberately use DPR 1; device-profile explorer captures retain native DPR
and save menu images at CSS scale so image dimensions remain understandable.
Scene images retain the renderer's capture contract.

Every explorer image records requested device, actual engine, measured layout
and visual viewports, screen, DPR, UA, pointer/hover, app UI scale and relevant
appearance values. Inspect original images alongside DOM evidence. Capture top,
mid-scroll, end and return states using real input, and check the final action.
A clean DOM inspector alone is not a usability verdict.

Do not enlarge a CSS viewport to make a screenshot resemble a reference and then
call it a realistic phone profile. Measure or obtain the phone's model, browser,
browser Page Zoom and viewport before claiming an exact reproduction. Browser
chrome, safe areas, toolbar resizing and hardware still require device checks;
explicit safe-area probes supplement the descriptor rather than being implied
by its name.

Reference: [Playwright device emulation](https://playwright.dev/docs/emulation).
