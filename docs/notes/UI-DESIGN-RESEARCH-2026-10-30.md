# UI design research for phone, desktop and TV — 2026-10-30

Companion to `DESIGN-PASS-1-2026-10-30.md`, written for the design pass #2 lanes (#4238 HUD, #4239 menus,
#4240 motion/title/loading, #4241 Data Hub/tokens). Four read-only research agents read the sources below on
2026-10-30. Apple's HIG pages were read through their JSON
(`developer.apple.com/tutorials/data/design/human-interface-guidelines/<page>.json`), and Material 3 values
through the androidx Compose token sources, because both sites render their HTML with JS. "Unverified" means
the agent saw only a search snippet or a summary.

## 1. What the sources say

**Touch and placement (phone, landscape)**
- Apple, designing for games and game controls: frequent controls at least 44x44 pt, less important ones
  such as menus at least 28x28 pt. Secondary controls (menus) go at the top of the screen. Keep buttons off
  the Home indicator and the Dynamic Island. Movement on the left, camera on the right. Show a visible and
  tactile press state. Hide movement controls until a touch to reduce overlap with the game. Menus must work
  in both orientations if both are supported.
  https://developer.apple.com/tutorials/data/design/human-interface-guidelines/designing-for-games.json ·
  https://developer.apple.com/tutorials/data/design/human-interface-guidelines/game-controls.json
- WCAG 2.2: 2.5.8 (AA) 24x24 CSS px or a 24 px spacing circle; 2.5.5 (AAA) 44x44 CSS px, recommended for
  frequent, hard-to-undo and hard-to-reach controls.
  https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html ·
  https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html
- Hoober (1,300+ observed users): thumbs make 75 % of touches; the top edge needs a stretch; accuracy is
  worst in the corners. No landscape reach data exists; landscape zones are inference.
  https://alistapart.com/article/how-we-hold-our-gadgets/
- Safe areas: Apple gives no iPhone numbers. Read `env(safe-area-inset-*)`; never hard-code insets. (Our
  shell already sets `viewport-fit=cover`; `tools/ui/menu-screens.mjs` models 844x390 as 47/21/47.)

**Layout across sizes**
- Material 3 window size classes, width: compact < 600, medium 600–839, expanded 840–1199, large 1200–1599,
  extra-large ≥ 1600 dp. Height: compact < 480, medium 480–899, expanded ≥ 900. A phone in landscape is
  medium width and **compact height**, where "two pane layouts are not practical".
  https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes
- Apple: "Layout should follow size classes, not device type or orientation"; "Don't change your app's
  functionality based on the space it occupies"; "even apps locked to one orientation, such as a
  landscape-only game, should still resize well."
  https://developer.apple.com/tutorials/data/design/human-interface-guidelines/layout.json
- Viewport units `svh/dvh/lvh`: Safari 15.4, Firefox 101, Chrome 108; "100vh on mobile is too tall on load".
  https://web.dev/blog/viewport-units · Container queries: Baseline since February 2023.
  https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@container · CSS `zoom`: Baseline
  2024. https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/zoom · View Transitions and style
  queries: Safari 18. https://webkit.org/blog/15865/webkit-features-in-safari-18-0/

**Text size**
- Apple iOS: body 17 pt default, **11 pt minimum**; caption 2 is 11 pt at every setting. Avoid light weights
  at small sizes. tvOS: 29 pt default, 23 pt minimum.
  https://developer.apple.com/tutorials/data/design/human-interface-guidelines/typography.json
- Steam Deck Verified: "The smallest on-screen font character should never fall below 9 pixels in height at
  1280x800"; Valve recommends 12 px, and user-configurable text size and contrast.
  https://partner.steamgames.com/doc/steamdeck/compat
- Xbox Accessibility Guideline 101 (body height, descender to ascender): console 26 px at 1080p, PC 18 px at
  1080p, mobile/streaming 18 px at 100 DPI scaling linearly; text must scale to 200 %; letter spacing ≥
  0.12×, line spacing ≥ 1.5 for multi-line text. https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/101
- Material 3 type scale (sp): label S/M/L 11/12/14, body S/M/L 12/14/16, title M 16, headline S 24, display
  S 36. https://raw.githubusercontent.com/androidx/androidx/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/TypeScaleTokens.kt
- `clamp()` for text: the maximum must be relative and at least twice the minimum so 200 % zoom still works
  (WCAG 1.4.4). https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/clamp

**Contrast (APCA, the dark-UI model)**
- Bronze: Lc 90 preferred and Lc 75 minimum for body text (Lc 75 at 18/400, 16/500, 14/700). Lc 60 minimum
  for other content text (24/400, 21/500, 18/600, 16/700). Lc 45 headlines and pictograms. Lc 30 placeholder,
  disabled and large solid icons. Lc 15 is invisible. Silver: content text ≥ 13 px, non-content ≥ 10 px.
  https://git.apcacontrast.com/documentation/APCA_in_a_Nutshell · https://readtech.org/ARC/

**Motion**
- Material 3 durations (ms): short 50/100/150/200, medium 250/300/350/400, long 450/500/550/600,
  extra-long 700/800/900/1000. Easing: standard (0.2,0,0,1), emphasized decelerate (0.05,0.7,0.1,1),
  emphasized accelerate (0.3,0,0.8,0.15), standard accelerate (0.3,0,1,1).
  https://raw.githubusercontent.com/androidx/androidx/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/MotionTokens.kt
- Apple: make motion optional; let people cancel it; avoid motion on frequent interactions; 30–60 fps;
  avoid oscillation near 0.2 Hz. https://developer.apple.com/tutorials/data/design/human-interface-guidelines/motion.json
- NN/g: 0.1 s feels instant, 1 s keeps the flow. https://www.nngroup.com/articles/response-times-3-important-limits/
- WCAG 2.3.3 (AAA): interaction-triggered motion can be turned off.
  https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions.html

**Colour**
- Material 3 dark surfaces by tone: surface 6, container lowest/low/default/high/highest 4/10/12/17/22.
  https://raw.githubusercontent.com/androidx/androidx/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ColorDarkTokens.kt
- Okabe-Ito (secondary sources): #E69F00, #56B4E9, #009E73, #F0E442, #0072B2, #D55E00, #CC79A7. Avoid red text
  on near-black. Timing colours need a non-colour cue (the game already has ★ ▼ ▲).
- Game Accessibility Guidelines: readable default size, adjustable size, high contrast, no information by
  colour alone. https://gameaccessibilityguidelines.com/full-list/

**Racing games and broadcast**
- EA F1 25: every HUD element toggles; the whole HUD toggles; colour-blind modes; 2D/3D HUD. No HUD scale or
  menu text size. https://www.ea.com/able/resources/f1-25
- F1 TV 2026: gaps to the car ahead and the leader show ONE decimal, truncated (0.999 → 0.9), and fans
  complained. https://www.gpfans.com/en/f1-news/1078428/f1-2026-tv-broadcast-new-timing-tower-graphic/
- F1 brand (2017, Wieden + Kennedy London): faces F1 Regular / Turbo / Torque, proprietary.
  https://itsnicethat.com/news/wieden-and-kennedy-formula-1-graphic-design-271117
- Forza Motorsport (We Are Royale): built one graphic language first (black + gold accent), 800+ assets;
  UI contrast tiers, text scaling, colour-blind colours. https://weareroyale.com/case-studies/forza-motorsport/
- Gran Turismo 7: the World Map hub reveals modes progressively (reviews only).

**Haptics:** `navigator.vibrate` has no iOS Safari support (caniuse, through Safari 27.2); Android Chrome has
it. https://caniuse.com/vibration

## 2. Apex 26 measured against it (this tree, 2026-10-30)

| what | ours | the sources | verdict |
|---|---|---|---|
| `--dim` secondary ink on `--bg` | #9a9aa8, APCA Lc 48.2 (WCAG 7.0:1) | Lc 60 for 16/700 labels, Lc 75 for 14/700 | **too faint for 14 px labels**; #b4b4c2 is Lc 62.3, #bdbdca Lc 67.4 |
| `--slower` red as text (ghost delta, gaps) | #ff3b30, Lc 40.3 | Lc 60+ for numbers you read | **too faint**; #ff7a6e is Lc 52.6, a lighter red-orange needs a family check with apca-timing |
| `--text` | Lc 102.0 | Lc 90 preferred | fine |
| smallest touch label `--touch-label-floor` | 10 px | Apple 11 pt minimum; APCA Silver non-content 10 px | at the floor of the weakest rule |
| `--fs-micro` / `--label` | 14 px | M3 label L 14; Apple caption 11–12 | fine |
| digits | Barlow Condensed has `tnum` (default digits are proportional, 274–459 units); Titillium Web has no `tnum` but every digit is 560 units | timers need fixed-width digits | `tabular-nums` must stay on every Barlow timer; Titillium is already tabular (fontTools, `assets/fonts/*.woff2`) |
| motion tokens | `--dur-1` 120, `--dur-3` 320, `--dur-4` 600 ms; `--ease-out` (0.22,1,0.36,1) | M3 short 100–200 for state changes, medium 250–400 for sheets; emphasized decelerate in, accelerate out | durations line up; **no exit (accelerate) easing token** |
| pulse rate | 0.8 s (1.25 Hz), redline 0.4 s (2.5 Hz), one clock since #4213 | < 3 flashes/s; avoid ~0.2 Hz oscillation | fine |
| blocking CSS | 238,951 B raw, **77.9 KB gzip** (six title-critical sheets) | ~14 KB compressed for the first round trip | 5.5x over the first-round-trip guidance; the byte ceiling stops growth but no plan shrinks it |
| viewport | `viewport-fit=cover`; `svh/dvh` used in 5 sheets; 37 container queries; 40 `:focus-visible` rules | | in line |
| haptics | — | none on iOS Safari | use sound and visual press states on Bryce's phone |

## 3. Rules for Apex 26 (proposals; each lane decides within its files)
1. **Design for compact height first.** 844x390 is medium width and compact height: one pane, no two-column
   sheet that scrolls both columns. Desktop (expanded/large width, medium height) may add the second pane.
2. **Touch tiers:** 44 CSS px painted for frequent and hard-to-undo doors (RESUME, QUIT, RACE AGAIN, pedals),
   28 px only for rare secondary menus, 24 px never below. The project's 52 px "comfort floor" stays a
   target, not a requirement.
3. **Menus top, driving bottom.** Pause and secondary chips at the top edge clear of the island side;
   pedals and steering at the bottom corners; nothing frequent along the bottom centre (home indicator).
4. **Text floor 11 px** for any text, 12 px for decision text (positions, gaps, tyre codes), timers in
   Barlow with `tabular-nums`. Keep a HUD SIZE and a TEXT SIZE setting (Valve and the GAG ask for it; EA has none).
5. **Contrast by APCA:** body ≥ Lc 75, labels ≥ Lc 60, disabled ≥ Lc 30. Proposal for lane 2d: lift
   `--dim` to about #b4b4c2 (Lc 62) and give red-as-text its own lighter token (`--slower` as text Lc 40 today).
6. **Every colour state has a second cue** (the ★ ▼ ▲ pattern), and every HUD element can be toggled.
7. **Motion:** state changes 100–200 ms, sheets 250–400 ms, decelerate in and accelerate out; add an exit
   easing token; nothing pulses slower than 1 Hz; everything off under reduced motion.
8. **Gaps to one decimal on the HUD?** F1's 2026 tower did it and fans pushed back: keep three decimals in
   timing tables and consider one decimal only for the glanceable on-track gap (lane 2a decides).
9. **Press states are visual and audible** on iOS (no vibration API); haptics only as an Android extra.
10. **Blocking CSS:** the 14 KB guidance is far away; the realistic step is moving post-paint rules out of
    the six title-critical sheets, which also gives the next title change some room.

## 4. Gaps (not read; do not rely on)
Shipped mobile racing HUD layouts (F1 Mobile Racing, Real Racing 3, Asphalt, GRID: no teardown found); Game
UI Database; Material layout/canonical-layout pages; iPhone landscape inset numbers; Paul Tol's primary
note; condensed-type legibility research; the exact XAG table text (read through a summary).
