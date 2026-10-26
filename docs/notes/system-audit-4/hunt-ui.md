# hunt-ui (pass 4) — code-hunter leg 1 (time-capped; saved by main)

hunt-ui (pass 4): js/ui, js/input, js/audio, css, index.html static DOM. This is a partial report; I stopped at the ~10-minute time cap. I did not write scratch/sysaudit4/hunt-ui.md: my contract is read-only, I have no Write tool, and the contract forbids report .md files. Save this text as the file if you want it.

FINDING 1 | bug | sev low | /home/user/f1-game/js/core/lazy-bundles.js:599-607 + /home/user/f1-game/js/game.js:81-88 | Trigger: anything after the first two lines of onAudioReady throws (AudioPanel.create, RivalAudio.create or CarSfx.create). That clears audioLoad, so the next ensureAudio calls onAudioReady again, and RadioVoice.create and Announcer.create run a second time. Each run adds page-lifetime listeners that are never removed: announcer.js:589-594 (2 MutationObservers on #pausemenu/#carsetup plus a document visibilitychange listener) and radio-voice.js:851-853 (the same kind). Effect: the orphaned first instances keep firing stop()/halt() on pause or a hidden tab, and they stack up once per retry. | Proposed fix: create the audio instances once behind a flag and retry only the part that threw, or give create() a dispose() that disconnects its observers. | Test: make AudioPanel.create throw once, call ensureAudio twice, and assert the count of document visibilitychange listeners (game-vm resourceSnapshot or a counting stub). | CODE-TRACED

No medium- or high-severity findings. Every other suspect I traced is already guarded:
- **Duplicate ids:** index.html has 1,279 static ids and none is duplicated.
- **Shell ids:** shell-ids finds all 702 ids looked up by literal in the shell (1,516 declared, 73 built at runtime).
- **i18n:** i18n-lint reports 0 non-English locales, so there are no translations to check keys against yet.
- **iPhone touch input:** hold-buttons.js (read in full) and input.js init (lines 2164-2340) have intact release nets.
  - The `ready` flag stops a second init from wiring twice.
  - Window capture pointerup/pointercancel releases a lifted pointer.
  - The lostpointercapture filter treats one hold button taking capture from another as a steal, not a lift.
  - When `touches.length` hits 0, `holdReleaseAll(true)` releases everything but keeps the throttle latch, matching line 1385.
  - A second finger on GAS is not counted as a new press, so it does not flip the latch.
- **Escape and focus (modal.js, read in full):**
  - A held Escape's auto-repeat is swallowed.
  - A missing or disabled close button still owns Escape.
  - A nested :modal handles its own Escape.
  - A stale close event is ignored.
  - Isolation lifts before close().
  - Tab wraps inside the screens that are not dialogs.
  - Focus memory is in WeakMaps.
- **Listener leaks:** I checked all ~30 nested document/window addEventListener sites. Each is once-guarded or created once:
  - settings-tabs.js:293 has jumpWired, and SettingsNav.create runs once (game.js:8829).
  - title-layout.js:345 has ed.els, and :197 is guarded.
  - engine.js:819 has listenersAttached.
  - screen-looks.js:452's `up` handler removes itself.
  - key-binds.js:98/174 add and remove in pairs.
  - hud-arrange.js and dock-layout.js are init-once factories.
- **Safe area:** the viewport meta has viewport-fit=cover, tokens.css:257-297 derives --safe-* from env(), and touch-controls.css hard-codes no px edge offsets. touch-action is none on #game and on the in-race HUD chrome (tokens.css:1222-1234).
- **Touch targets:** --tap is 52px on touch screens (tokens.css:766). The smaller --tap-min (24px, the WCAG 2.5.8 floor) and --tap-sm (36px) are deliberate. The one control under 44px during a race is the perf overlay's #game-metrics-bar (hud.css:1628), and tests/unit/metrics.test.mjs:185 pins that size.
- **Per-frame HUD work:** hud.js writes go through cached setters (hText/hStyle/hClass/hToggle, lines 68-77). hlKey (482) runs only on the fit tick, and the computed-style reads are cached (504-519). Without a measurement there is no perf finding.

known-still-live: none. Pass-3 game-code G1–G9 are all outside this slice.
fixed-at-head: none checked.

covered: js/ui/modal.js, js/input/hold-buttons.js (in full); partial reads of input.js 2160-2340, hud.js 440-540 plus its function index, title-layout.js 280-410, settings-tabs.js 225-305, screen-looks.js 425-475, hud-arrange.js 550-611, engine.js 760-870, announcer.js 575-596, radio-voice.js 835-856, tokens.css 1170-1240 plus the tap tokens, the hud.css tap rules, and the lazy-bundles.js hook sites.
not covered: these were skipped for time.
- js/input/phone-pad.js (1,190 lines; I only grepped its listeners)
- menu-nav.js, pad-menu.js, select-screen.js, title-menu.js
- per-frame callers of hud-relative.js and hud-minimap.js
- the rest of js/audio (soundtrack, spotify, crowd)
- the CSS files other than tokens.css and hud.css
- the dead-CSS sweep (the dead-rule direction is tests/unit/component-inventory.test.mjs, which I did not run)
- a VM lifecycle census
measured:
- node -e scan of index.html: 1,279 ids, 0 duplicates
- node tools/check/shell-ids.mjs: 702 literal / 1,516 declared / 73 dynamic, ok
- node tools/check/i18n-lint.mjs: ok, 0 non-English locales
- /proc/loadavg was 0.74
- no timing figures
