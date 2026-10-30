# UI hunt 3 — menu flows by touch, keyboard, gamepad and screen reader (2026-10-30)

PR #4212, branch `claude/apex-ui-flows-hunt-pzqtfy`. Follows round 1 (`UI-HUNT-FLOWS-2026-10-29.md` on
`cursor/ui-hunt-flows-6105`, fixes in #4194). Round 1 was confirmed live first: the live `apex-sha` is `2220af2c`, which contains
the #4194 merge `fa5795fe` (ghost-tap shield and BACK sentinel in `js/ui/modal.js` and `js/ui/deep-link.js`).

**Rig.** One headless Chromium (harness `launchChromium`), served from a static server. "Before" = a worktree at
`2220af2c`, "after" = this branch. Scratch driver `scratch/uihunt3/walk.mjs` (not committed) runs three profiles in one
browser: keyboard-only at 1280×800, touch at 844×390 (`hasTouch`, `isMobile`, DPR 2), and a **synthesized standard-mapping
gamepad** (`navigator.getGamepads` stub + `Input.poll()`, D-pad = button 12, the `gamepad.spec.js` idiom; arrow keys are
not used as a gamepad stand-in). Code hunts: four `code-hunter` slices (Escape/back stack + onboarding, MenuNav + gamepad
+ focus/live regions, settings persistence + export/import, wizard state machines) after a `prior-art-scout` pass.
Web research with cited URLs: `scratch/uihunt3/web-research.md` (summarised in §Research).

## Per-door table (after, 1280×800 keyboard; Escape and BACK = `history.back()` off the sentinel)

| Door | Opens | Focus lands | Escape → | BACK → | Final action reached | Persistence |
|---|---|---|---|---|---|---|
| RACE `#mb-race` | `#select` | `sel-go` | title, focus on door | title, focus on door | START → race setup → GO (3 taps) | picker search resets on a door open (round 2) |
| TIME TRIAL `#mb-tt` | `#select` | `sel-go` | title / door | title / door | START | — |
| PRACTICE `#mb-practice` | `#select` | `sel-go` | title / door | title / door | START | — |
| CAREER `#mb-career` | `#career` | first slot | title / door | title / door | slot → hub | abandoned NEW CAREER now gives the live slot back (fixed here) |
| SEASON `#mb-season` | `#select` | `sel-go` | title / door | title / door | START | season-setup discard confirm (round 1) |
| GARAGE `#mb-garage` | `#carsetup` | `cs-cam` | title, focus on **door** (was `<body>`: fixed here) | title, after the loading plate | DONE | garage tab memory |
| VS FRIEND `#mb-vs` | `#vsfriend` | `vs-close` | title / door; on a HOST/JOIN step Escape now steps back like BACK (fixed here) | same as Escape | HOST / JOIN | — |
| DATA HUB `#mb-data` | `#datahub` | `dh-tab-schedule` | title / door | title / door | ✕ reachable by Up from the tabs (fixed here) | per-door tab memory (round 1) |
| WATCH `#mb-watch` | `#datahub` | `dh-tab-race` | title / door | title / door | — | — |
| TRACK DESIGNER `#mb-designer` | `#trackdesigner` | first chip | title / door | title / door | — | — |
| PHOTO STUDIO `#mb-photo` | `#photo-studio` | `ps-close` | title / door | title / door | — | — |
| SETTINGS `#mb-settings` | `#pmsettings` | `pm-open-controls` | title / door; Escape in a non-empty FIND A SETTING clears it first (fixed here) | title / door | any row | query clears on every open (product call, below); 110/114 rows persist |
| HOW TO PLAY `#mb-help` | `#howtoplay` | `htp-close` | title / door | title / door (section links: see open leads) | — | — |
| DAILY `#mb-daily` | `#select` | `sel-go` | title / door | title / door | START | — |
| STANDINGS, PHONE PAD | not shown on a fresh profile | | | | | |

**Taps to a race (844×390 touch, fresh profile):** 3 — RACE → START → GO. **Lifecycle:** hiding the tab mid-race
(`visibilitychange` hidden) opens pause; returning (visible + `pageshow` persisted) keeps pause up and the HUD intact.
**Console:** 0 `pageerror` / `console.error` across both walks.

## Before → after (same rig)

| Check | Before (`2220af2c`) | After (this PR) |
|---|---|---|
| Data Hub: Up from the first tab, keyboard | `BUTTON` (wrapped to the bottom of the sheet) | `dh-close-btn` |
| Data Hub: Up from the first tab, synthesized pad D-pad | `BUTTON` | `dh-close-btn` |
| Garage → Escape, focus | `<body>` | `mb-garage` (after the fix in `js/ui/modal.js`; see the final walk in the PR's Verified section) |
| Settings: Escape in FIND A SETTING with text | closed the whole sheet (round 1 #5) | query cleared, sheet stays |
| Settings: reopen after a search | query kept | empty |
| Every other door: Escape / BACK / focus | title, focus on door | unchanged |

## Fixed in this PR

1. **D-pad reach (`js/ui/menu-nav.js` `step`).** Up from a `role=tab` rail with nothing above in its band picks the nearest
   control above anywhere (Y first, X as a light tie-break, the sideways pass on swapped axes) before the in-band edge
   wrap. Only tabs: plain controls keep the Zandvoort rule. Test: `menu-nav-spatial.test.mjs`.
2. **Rotation (`MenuNav.onResize`).** One frame after a resize, the focused control in the top layer is scrolled back in with
   `block:"nearest"` (Career's pane re-flowed 765 → 1374 px under a kept scrollTop). Test: same file.
3. **Settings search, the product call.** A fresh open (`SettingsNav.showCurrent`) clears the query. That is the circuit picker's rule
   (`select-screen-fixes.test.mjs`: a menu door opens it unfiltered; a return keeps it). BACK and return-to-search inside one session still keep
   the query. Escape, or pad B (which reaches a dialog as `cancel`), clears a non-empty query before anything closes.
   The old pin `a fresh settings session … preserving query` is rewritten to the new rule.
4. **BACK asks Escape first (`js/ui/deep-link.js`).** The back gesture pressed the layer's door directly, skipping every handler that
   takes Escape first: circuit search, the garage camera panel, a Settings peek. It now dispatches a synthetic Escape at the focused element;
   only an unclaimed one falls through to `TopModal.escapeTop()`. Our own synthetic key does not re-arm the sentinel.
5. **VS FRIEND Escape parity (`js/net/lobby.js`).** `data-esc-close` follows the visible BACK (`vs-back` on a sub-step,
   `vs-close` on the choice), the garage-arrival pattern. BACK with nobody connected re-offers JOIN / ROOM CODE and clears
   the room flag (an emptied room's INVITE ANOTHER had hidden them).
6. **Career (`js/career/career-ui.js` `close`).** A NEW CAREER draft abandoned on any route out gives the borrowed EMPTY slot back.
   On the START-refused path the picker's BACK reached `close()` with the draft already cleared, so the title showed no career
   and a reload re-homed the save.
7. **Garage focus (`js/ui/modal.js`).** Garage closes behind the loading plate and shows the title a beat later
   (`MenuTeardown.deferUi`). At hide time the opener's screen was neither up nor un-inerted, so round 1's fix (#4) never ran
   on this path. The opener is now parked and focused once its screen shows and is un-inerted. The first park holds:
   the plate's own opener cannot replace it. Test: `menu-a11y-audit.test.mjs` (fails without the fix).
8. **Screen readers in dialogs (`js/ui/live-region.js`).** `showModal()` makes everything outside the dialog inert, so every
   `LiveRegion.say()` made with Settings, results or any dialog open went to an unreadable `#announce-live`. Lines now go to
   a polite `[data-announce-modal]` twin inside the topmost `:modal`, made on first use and empty for the clear-then-write beat.
9. **Settings backup (`js/ui/settings-export.js`).** `buildWorker` is `perDevice` (an ALL file pinned the sender's auto-pick ON on
   a single-core phone). An unset JSON row imports as a removal, not the literal `"null"`. The reload label now counts SKIPPED values.

10. **Garage tablist (`js/garage/setup-sheet.js`).** The two tier rows were `role=group` inside `role=tablist`, which owns
    only tabs, so all 15 tabs lost their tablist parent (axe `aria-required-children` / `aria-required-parent`). The rows
    are now `role=none`, with the tier name in `data-tier` for tests. Lighthouse accessibility on the Garage: **88 → 100**.
11. **Career slot names (`js/career/career-ui.js`).** "Driver career slot 1, empty" did not contain the card's visible
    text (WCAG 2.5.3 label-in-name: a voice-control user says what they see). Names now lead with the visible text, then
    the mode ("SLOT 1 EMPTY Start a career here, Driver career"), and each block span ends with a word break so
    `textContent` is not "SLOT 1EMPTY…". The repo's locked axe-core 4.14 passes all six slot buttons. Lighthouse's bundled
    axe 4.12 still lists `label-content-name-mismatch` (an older containment check); the category score is 100 either way.

## Lighthouse (mobile, snapshot of the open screen, working tree)

| Screen | Accessibility | Best practices | Notes |
|---|---|---|---|
| Title | 100 | 100 | 0 failed |
| Settings | 100 | 100 | 0 failed |
| Garage | 88 → **100** | 100 | item 10 |
| Career | 100 | 100 | item 11 (see the axe-version note) |
| Data Hub | 100 | 100 | 0 failed |

Reports: `artifacts/lighthouse/<screen>/report.html` (not committed). Console across the DevTools session: 0 errors.

**The 4 of 114 rows that do not persist** (round 1): `pm-hl-set`, `pm-hl-el` and `pm-hl-visibility` are the HUD-layout editor's
pickers (which set / element is being edited: transient by design), and fullscreen cannot re-enter without a gesture
(a browser rule). None is a bug.

## Follow-up round (Bryce, 2026-10-30: "fix all")

12. **Dock edit mode vs BACK (`js/ui/deep-link.js`).** REPOSITION TOUCH CONTROLS is no UiLayers layer, so BACK skipped
    it: mid-race it paused, and Settings was not restored. While `body[data-dock-edit]` is up, BACK now sends the same
    synthetic Escape that dock-layout's document-capture listener ends edit mode on (restoring Settings). Test: `deep-link.test.mjs`.
13. **HOW TO PLAY section links (`DeepLink.onSectionLink`).** A contents link in `#htp-contents`, `#cg-contents` or `#ch-contents`
    scrolls in place and *replaces* the hash, so it adds no history entry for BACK to spend silently. `AriaState.sync()`
    repaints `aria-current`, which `replaceState` does not trigger through `hashchange`. Modified clicks and links with no
    target fall back to the browser.
14. **`?go=nextgp` (`deep-link.js` + `game.js` `#mb-data`).** The shortcut leaves a one-shot `data-open-tab="schedule"`
    on the DATA HUB door. The door's handler reads it and calls `openDataHub(tab)`, so the hub opens on SCHEDULE however
    slow the bundle is. This replaces the 10 s poll for `#dh-tab-schedule`.
15. **Results and qualifying cards are spoken (`results-sheet.js` `sayCards`, `quali-sheet.js` `open`).** The earnings,
    badge and winner-time cards were `role=status` regions built already filled, which is not announced. They are now
    `data-say` cards. Their words (leaf texts joined, so "BADGE UNLOCKED Pole") are said through `LiveRegion` once the sheet
    is visible, which puts them inside its dialog per item 8. A rebuild of the same classification stays quiet. Qualifying
    says the new pole badge on `open()`. Tests: `ui-sheets-audit.test.mjs`, `quali-persist.test.mjs`.

## Still open

- **Real iPhone not verified.** The BrowserStack MCP opens only a hand-driven Live session (iPhone 16 / iOS 18.6 Safari on the
  live site). It has no automation hook, so the edge-swipe back, real double-tap timing against the ghost-tap shield, and
  VoiceOver basics remain **not run**. Per the research, iOS skips `pushState` entries made without a user gesture
  (WebKit 248303). Our sentinel re-arms on `pointerdown`/`keydown`, which is inside a gesture, but the swipe itself needs a
  device to verify, and so does iOS standalone (no back button; the swipe works only with earlier history).

## Research (cited in `scratch/uihunt3/web-research.md`)

- APG tabs give no in-dialog arrow route from a tablist to Close; TV spatial-nav libraries use an explicit edge-exit
  (https://www.w3.org/WAI/ARIA/apg/patterns/tabs/, https://devportal.noriginmedia.com/docs/Norigin-Spatial-Navigation/guides/concepts).
  This is item 1's model. CSS spatnav (https://www.w3.org/TR/css-nav-1/) escalates to the parent container.
- Standard gamepad mapping: D-pad 12–15, A 0, B 1 (https://w3c.github.io/gamepad/).
- History: iOS 16+ and Chromium skip non-gesture `pushState` entries
  (https://bugs.webkit.org/show_bug.cgi?id=248303,
  https://chromium.googlesource.com/chromium/src/+/127.0.6533.99/docs/history_manipulation_intervention.md).
- CloseWatcher: Chrome 126 and Firefox 149; Safari only in preview, so it is absent on the target iPhone
  (https://developer.mozilla.org/en-US/docs/Web/API/CloseWatcher). Keep Escape + on-screen BACK as the iOS path.
- A live region outside an open modal is hidden by inertness (https://html.spec.whatwg.org/multipage/interaction.html#modal-dialogs-and-inert-subtrees),
  and screen readers ignore a hidden live region (https://adrianroselli.com/2026/01/live-region-support.html). This is item 8.
