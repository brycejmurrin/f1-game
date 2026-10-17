# UI lane B round 2 — notch insets, UI scale, save health (continues UI-LANE-B-MENUS-2026-10-17.md)

Round 1's table lives in the #2632 branch's `UI-LANE-B-MENUS-2026-10-17.md`; rows here continue it.

Tools: `menu-fit.mjs 932x430 --safe=0,59,21,59` and `844x390 --safe=0,47,21,47`, then `--scale=125|150`; live probes in Playwright (touch, dsf 2).

| id | screen | file | severity | verdict | evidence |
|---|---|---|---|---|---|
| B5 | settings › Appearance › preset tiles at 932x430, UI SIZE 150 | `css/appearance-studio.css:228-240` | medium | CONFIRMED | `BROADCAST` clips to `BROADCAS`: button scrollWidth 73 > 66 (strong 69 > 60). The phone-landscape guard stopped at `max-width: 900px`; the iPhone Pro Max landscape is 932 wide, so five 67px tiles stayed. Guard widened to 960px; spec 5 columns before, 3 after |
| B6 | race settings preset blurbs (`small`) | `css/race-setup.css` | — | NOT-A-BUG | scrollHeight 21 > clientHeight 19 (2px) at 844/932 and every scale, glyphs fully visible in the screenshot |
| B7 | track detail `#track-detail-canvas-wrap` | `css/track-detail.css` | — | NOT-A-BUG | 2px canvas overflow, nothing painted lost |
| B8 | settings › Files › STORAGE HEALTH & RESTORE POINTS | `css/save-health.css` | — | NOT-A-BUG | 57px-tall buttons, no overflow at 844x390 touch with the panel and restore list open |
| B9 | Appearance preview mock | `js/ui/appearance-studio.js:310` | — | NOT-A-BUG | the clipped div at 125% is the illustrative Home mock, clipped by design (aria-label "Illustrative appearance preview") |

Notch insets (932x430 and 844x390): race-settings, select, teampicker, customize, carsetup, settings pages, advanced, track-detail all reported no unsafe cells.
Not covered: confirm dialogs reached only by gameplay state (career reset, restore confirm with a real restore point).
