# Gardener survey 2: css/, the index.html shell and js/ui/, 2026-11-25

Kind: survey · Re-measure-by: 2027-01-15

Asked by Bryce through the orchestrator (session `session_017Yzwxzch8ixiVZuLUxQGt6`, 2026-11-25 ~02:28Z). It is the second
Gardener pass and follows `docs/notes/GARDENER-SURVEY-2026-11-25.md` (draft PR #6442, not yet merged), using that note's format
and role rules. The pass is read-only and looks at structure only (clarity, decoupling, duplication), not bugs, perf
or features. No source edits, no browser.

At ~02:29Z Bryce added: "use the apex-lsp MCP tools heavily … cite the query behind each number. Use grep only for
CSS and plain text." Every js/ number below names its query. A grep figure on js/ is labelled `text` and appears only
where the thing counted is an inline shape with no symbol (an anonymous keydown handler, an attribute string).

Base: `c1e4f959` (`origin/claude/f1-game-project-26h3ng`). Method:
- four `code-hunter` slices: `css/`; `index.html`; the js/ui menu and sheet side; the js/ui race-HUD side;
- one `prior-art-scout`;
- two `finding-verifier` passes covering 27 claims. 21 were confirmed and 6 corrected in place (the numbers below are the corrected ones);
- `tools/check/extract-module.mjs` for free names, `ratchets.mjs --json` for slack.

## Not re-reported (known)

- Survey 1, items 8 and 9 and the next tier: arm-confirm ×4, flash-label ×3, the double Escape route, SKIP ×6, the 4
  arrange editors, the ~15 element factories beside `Dom.el`, `fmtGap`/`fmtLap`/`wrapS`, and `photo-studio-ui.js`'s
  helper copies.
- `docs/notes/HUD-CODE-AUDIT-2026-10-10.md`:
  - F-13 (#4448): hud.css `!important`, and the HUD gauges split over 3 files in 2 layers. #6387 (slice 7, 69 → 56)
    is in flight. The css hunter re-found this as its findings 3, 9 and 12; they are F-13's, not new.
  - F-02: the `hStyle` cache bug. F-25: the `bc-on` hide lists.
- `docs/notes/UI-CONTRACT-2026-11-06.md` row 20: delete the `--bp-*` tokens (no consumer).
- `tests/unit/css-layers.test.mjs` already fails any rule outside its file's layer, so unlayered rules are guarded.
- `docs/COMPONENTS.md` §Defined in more than one file is the deliberate-sharing register
  (`component-inventory.test.mjs`). The items below are not on it.
- No dead CSS. A 1,720-token scan found 54 zero-hit selectors. All 54 were hex colours or string-built names
  (`"visor-bend-" + lvl`, `"ps-look-" + key`, `learn-studio` in `learn/`). A verifier spot-checked 174 more tokens
  and found every one live.

## What constrains every item: the tree ratchets are full

`ratchets.mjs --json` at `c1e4f959`:
- `eagerScripts` 299/299, `cssClasses` 670/670, `shellNodes` 2335/2335, `rawColor` 321/321,
  `dynamicIdReads` 76/76 and `eagerCodeBytes` all sit at **slack 0**;
- `js/ui/hud.js` is at slack 0 on both lines (2336) and codeLines (1483);
- `css/hud.css` has 20 lines of slack.

So the Gardener rule "ratchets only go down" bites here:
- a **new helper file costs `eagerScripts` +1**, so a helper goes into an existing module (`Dom`, `TopModal`,
  `SettingRow`), or the PR removes a file;
- a **new shared class costs `cssClasses` +1**, so a CSS primitive reuses an existing class through `:is()`;
- moving static markup into js **lowers `shellNodes`**, but a builder that writes `"x-" + id` can raise
  `dynamicIdReads`.

Every item below states which of these rows it moves.

## The plan (ranked by payoff ÷ risk)

Each item has the same fields as survey 1: What / where, Hurts, Shape, PRs, Pin first, Frees, Risk, Collides.

### 1. One roving-tab helper for the hand-built tab rows

- **What / where:**
  - The roving-tab keydown (ArrowLeft/Right, Home/End, then `aria-selected` and `tabIndex = on ? 0 : -1`) is
    written **5 times**, as inline handlers with no symbol (`text`, verifier-confirmed): `select-screen.js:736`,
    `settings-export-body.js:1025`, `photo-studio-ui.js:428`, `appearance-opts.js:267`, and `ltTabKey` at
    `js/lighting/tuner-panel.js:227`. The five already behave differently: four wrap, `appearance-opts` clamps
    (`Math.max(0, at - 1)`), and only `appearance-opts` ignores untrusted Up/Down.
  - `lsp_symbols {query:"setLtTab"}` → 2 definitions. `lsp_definition {body:true}` on each gives
    `tuner-panel.js:207` (20 lines) and `photo-studio-ui.js:353` (14 lines), the same select-tab body. The tuner
    copy also does `scrollIntoView` and resets `scrollTop`.
  - Tablists are built by hand in 7 js files (`text` on `role","tablist`): `scenery-panel.js:84`, `designer.js:830`,
    `settings-export-body.js:994`, `photo-studio-ui.js:345`, `livery-design-editor.js:220`, `setup-sheet.js:682`
    and `hub.js:195`. Three more are static in index.html (`#lt-tabs` 3585, `#ct-modes` 3625, `#fb-shots` 3677).
  - Eight more arrow-key handlers outside js/ui (`camera/tuner-panel.js:111`, `cam-picker.js:69`,
    `flyby-editor.js:457`, `data/hub.js:252`, …) are not yet classified as tab rows.
  - `lsp_symbols {query:"tabRow"}` and `{query:"roving"}` find no shared helper.
- **Hurts:**
  - Each new tab row copies the nearest one, so arrow behaviour differs per screen.
  - #6434 row 6b (the Data Hub arrows start from the selected tab, not the focused one; Up/Down drop focus to
    `<body>`) is this shape. Its fix lands in `hub.js` alone, and the other five stay as they are.
- **Shape:** `TopModal.roving(tabs, {wrap, vertical, onPick})` and `TopModal.selectTab(tabs, panels, name,
  {focus, scrollIntoView})`, inside the existing `modal.js` (`lsp_outline {file:"js/ui/modal.js"}`: 11 exports;
  focus already lives there). No new file.
- **PRs:**
  1. The helper, plus `settings-export-body.js` (the simplest caller).
  2. `tuner-panel.js` (`ltTabKey` + `setLtTab`).
  3. `select-screen.js`.
  4. `appearance-opts.js`, with `wrap:false` and its `isTrusted` guard as options, so it keeps its behaviour.
  5. `photo-studio-ui.js`, last.
- **Pin first:** a unit table per row: dispatch ArrowRight/Left/Home/End from each tab and assert the focused index,
  `aria-selected` and the wrap or clamp. Record the clamp as behaviour; Bryce decides whether to unify it.
- **Frees:** ~70 lines across 5 files. `eagerScripts` 0.
- **Risk:** low-med. Key handling only.
- **Collides:** `photo-studio-ui.js` (#6403, #6427): do it last. `hub.js` (the #6434 row 6b worker): land the helper
  first, or fold that fix into it afterwards. `select-screen.js` and `settings-export-body.js` are clear.

### 2. The race-HUD write-if-changed helpers become one stateless kit

- **What / where:**
  - `js/ui/hud.js:74-93` defines 8 helpers inside `create(G)`: `hText`, `hStyle`, `hUnstyle`, `hClass`,
    `hToggle`, `hAttr`, `hHidden` and `hData`. Four WeakMaps back them (verifier); the other four compare the DOM
    directly.
  - Fan-in, all from `lsp_references {files:true}`: `hText` 28 refs, 1 file; `hStyle` (hud.js:75) 38 refs,
    1 file; `hToggle` (hud.js:79) 17, 1 file; `hHidden` (hud.js:88) 7, 1 file.
  - `hud-radio-lane.js:15` takes them as `deps` (25 uses, `text`).
  - Four sibling modules cannot reach them, so each hand-rolls its own cache:
    - `hud-strategy.js:121` `set(k, v) { if (last[k] !== v) …textContent = v }`;
    - `hud-relative.js:138-148`, five `c.x !== x` blocks;
    - `hud-inputs.js:263` `lastGear`;
    - `hud-tyres.js:81`.
- **Hurts:**
  - Five caches for one idea. F-02 (a cache going stale after a bare `removeProperty`) can recur in each copy.
  - The PERF-P2-HTEXT text-node trick reaches `hud.js` only.
- **Shape:** the 8 helpers move unchanged to module level, outside `create(G)`, as `GameHud.write.{text, style, …}`.
  `hud.js` keeps `const { text: hText, … } = write`. The siblings call `GameHud.write.*`. No new file.
  `extract-module.mjs js/ui/hud.js 74 93` reports free names `_hudSty`×3, `_hudTxt`×2, `_hudCls`×2, `_hudTog`×2 and
  `I18n`×2, so there is no `G`.
- **PRs:**
  1. Hoist the helpers and drop the `deps` plumbing in `hud-radio-lane.js`.
  2. `hud-strategy.js`: its `set()` already returns "changed".
  3. `hud-inputs.js` and `hud-tyres.js`.
  4. `hud-relative.js`. Its cache drives a `dirty` relayout, so keep the comparison wherever `dirty` reads it.
- **Pin first:**
  - a unit test that a second identical `text`/`style`/`toggle` write on the same element performs no DOM write;
  - `tests/unit/hud-strategy.test.mjs`, which already exists.
- **Frees:** ~15 hud.js lines (slack 0 → 15) and ~25 lines in the siblings.
- **Risk:** low. `hText` must stay byte-identical.
- **Collides:** #6450 (`hud-layout.js`, `hud.css`) does not touch these files. Clear.

### 3. hud.js: carve the sector-delta painter

- **What / where:** `hud.js:219-330` holds `flashSector` 219, `sessionOf` 229, `paintHudDelta` 233,
  `signedFixed` 278 and `buildSecRows` 282: 112 lines. `extract-module.mjs js/ui/hud.js 219 330` lists 19 free
  names: `G`×5, `hData`×4, `_invalidateFit`×4, `els`×4, `_secFlashLog`/`GhostShare`/`Ghost`/`_trace`/`_deltaShown`
  ×3 each. `_invalidateFit` is a late-bound callback; the `secFlash` state is exported at `hud.js:2328`.
  `lsp_outline {file:"js/ui/hud.js"}` shows the block as its own run of functions.
- **Hurts:** hud.js is at slack 0, so any HUD feature forces a raise.
- **Shape:** `HudSectors.create(G, {hData, invalidateFit, trace})`, on the deps pattern of `hud-radio-lane.js:11-15`.
  It costs `eagerScripts` +1, so pair it with item 2 (no file) or fold it into an existing HUD module
  (`hud-readouts.js`, which owns the gap and lap formatting, is the natural home).
- **PRs:** one. Move the state, leave two one-line forwarders, re-point the `secFlash` export, then
  `--update --lower-only`.
- **Pin first:** drive `paintHudDelta` through a fake G before and after and compare `textContent` and `data-*`.
  Keep the `__apex.hudSecFlash` probe and the `SPLIT_DELTA_MS` timing.
- **Frees:** ~100 hud.js lines.
- **Risk:** low-med.
- **Collides:** none on `hud.js` today.

### 4. The static stepper rows in index.html go through `SettingRow.build`

- **What / where:**
  - index.html hand-writes **68 stepper rows** (`data-step="-1"` ×68, `class="set-row` on 78 lines, verifier).
    Each row is ~5 lines with 5 ids (`-label`, `-prev`, `-sel`, `-next` and the row).
  - `SettingRow.build` (`js/ui/setting-row.js:272`) emits the same skeleton. `lsp_references
    {symbol:"SettingRow.build", files:true}` → 45 refs in 24 files; pause-opts already uses it (the comment at
    index.html:1738-1743 says so).
  - Of the shell's 1,308 ids, 289 have no literal hit in js/, css/, tests/ or tools/; ~245 of those are the
    derived `-prev`/`-next`/`-sel`/`-label` ids.
  - The aria text is two sources. Static rows hand-write "Previous resolution"; `build()` derives
    `Previous ${label.toLowerCase()}`.
- **Hurts:** two ways to make one control, with announcements that can disagree. The shell holds a quarter of its
  ids only for this skeleton.
- **Shape:** each fold keeps an empty body in index.html and builds its rows at first open. The ids stay
  identical, because `apex-bridge.js:372` queries `rs-*-prev`/`-next`.
- **PRs:** one fold per PR (race settings, pause, audio, …), each lowering `shellNodes`.
- **Pin first:**
  - a static pin listing every stepper id and its aria-label as today's shell has them;
  - `shell-ids.test.mjs` and `menu-a11y-audit.test.mjs`. Each PR must leave the list identical.
- **Frees:** 250-350 shell lines and ~340 `shellNodes`. Watch `dynamicIdReads` (slack 0): if the builder reads
  ids by concatenation, have it return element references.
- **Risk:** med (e2e and the bridge query these ids by string).
- **Collides:** **#6405** (stepper-no-dropdown) edits `setting-row.js`. Start after it lands.

### 5. One "pressed" paint, and a written rule for AriaState

- **What / where:**
  - `setAttribute("aria-pressed"|"aria-checked", …)` is painted by hand **129 times in 50 files**; js/ui alone
    has 29 in 13 files (`text`; verifier-corrected from 28). Spellings: 38× `x ? "true" : "false"`, 20× a constant
    `"false"`, 9× `String(on)`, 6× an index comparison.
  - `lsp_outline {symbol:"AriaState", all:true}` → AriaState exports only `wrapOnOff` and `sync`. It observes 25
    hard-coded `ROOTS` and mirrors `.active`/`.on` onto `aria-pressed`.
  - Its `claimed()` (`aria-state.js:41-49`) skips any button that already has `aria-pressed`. So hand-painted and
    observed buttons coexist by exclusion, and nothing tells a new chip which to use.
  - `lsp_references {symbol:"AriaState", files:true}` → 4 refs in 2 files.
  - select-screen paints chips at `:718/:949/:974/:1022` and writes the same three attributes in its first build and
    in its refresh (`:712-719` vs `:946-951`).
- **Hurts:** three paths for one state, and the observer re-wakes ScrollFade on every aria write
  (`aria-state.js:72`).
- **Shape:**
  - `Dom.paintPressed(buttons, isOn)`: one call that sets `aria-pressed`, `.active` and `tabIndex`, added to
    `js/ui/dom.js` (4 exports today, no new file);
  - a header rule in `aria-state.js`: buttons painted by `Dom.paintPressed` are exempt.
- **PRs:**
  1. The helper plus select-screen's 4 loops (its `paintChip`/`pickFilter` pair).
  2. `appearance-studio-ui.js`'s 6 sites.
  3. One directory per PR after that.
- **Pin first:** per migrated row, flip selection and assert the `aria-pressed` strings and `.active`.
- **Frees:** ~40 lines in the first two PRs.
- **Risk:** low.
- **Collides:** `photo-studio-ui.js` and `photo-studio.js` (#6403, #6427): leave them out.

### 6. The light-theme token block, written twice

- **What / where:** `css/tokens.css:818-843` (`:root[data-ui-theme="light"]`) and `:845-866`
  (`@media (prefers-color-scheme: light) { :root[data-ui-theme="system"] }`) carry the same 20 custom properties
  with the same values, `--gold: #7a5600` included. The only difference: the light block also sets
  `color-scheme: light`.
- **Hurts:** a light-palette edit made once leaves SYSTEM-on-a-light-OS on the old colour. Nothing pins the two
  equal.
- **Shape:** no CSS can share one declaration list between a plain rule and a media-wrapped one. So pin them equal
  now, and later generate the system copy (`npm run gen`, with the block as source).
- **PRs:**
  1. The equality pin (zero CSS change).
  2. Optionally, the generator.
- **Pin first:** a `css-tokens.test.mjs` case: both bodies parse to the same property → value map, minus
  `color-scheme`.
- **Frees:** 0 lines with the pin alone; ~22 with the generator.
- **Risk:** low for the pin.
- **Collides:** **#6405** and the #6434 row 5 type-clamp worker both edit `tokens.css`. The pin touches only `tests/`,
  so it is clear now.

### 7. One tab look in CSS (the twin of item 1)

- **What / where:** four tab families each restate the active state (`background: var(--plate-on); border-color:
  var(--red); color: var(--text)`):
  - `.dh-tab` `data.css:163-187`;
  - `.lt-tab` `tuner.css:317-340`, keyed on the 3-id chain `#lt-tabs .lt-tab, #ct-modes .lt-tab, #fb-shots .lt-tab`
    in 5 rules;
  - `.cs-tab` `carsetup.css:588`;
  - `.td-tab` `editor.css:113-117`.

  `.dh-tab` and `.lt-tab` carry no-op `:hover`/`:active {color: var(--text)}` rules on a base that is already
  `var(--text)` (data.css:179, :181; tuner.css:335-338). `components.css:472-473` already groups
  `.lt-tab:active, .dh-tab:active` in the press-travel rule, so the seam exists.
- **Hurts:** a new tab row adds an id to every `.lt-tab` rule, and the four looks drift.
- **Shape:** one `:is(.dh-tab, .lt-tab, .cs-tab, .td-tab)` base and active rule in `components.css`, with local
  custom properties for padding and radius. **No new class** (`cssClasses` slack 0). Replace the 3-id chain with
  `.lt-tabs .lt-tab`. This keeps specificity, but check it against the chain's `(2,1,0)`.
- **PRs:**
  1. Drop the no-op rules.
  2. Replace the id chain.
  3. Hoist the shared active rule.
- **Pin first:** a computed-style snapshot (padding, radius, min-height, border-color, background) of the active and
  an inactive tab in all four rows. This is a parent-only browser measurement, run once before and once after.
- **Frees:** 40-60 css lines.
- **Risk:** med.
- **Collides:** **#6405** (`tuner.css`, `data.css`, `carsetup.css`, `editor.css`, `components.css`) and **#6444**
  (`carsetup.css`). Wait for both.

### 8. The dialog shells: one skeleton, one close button

- **What / where:**
  - 18 `<dialog class="screen dim">` shells (22 `<dialog>` tags in all; verifier-corrected from 20) repeat
    `.sheet` › `.sheet-head > h2#…` › `.sheet-body.pane` › `.sheet-foot > button.bigbtn.alt[autofocus]` nearly
    verbatim: career-offers, career-guide, career-history, standings, duel-picker, teampicker, vsfriend, howtoplay
    and others. There are 33 `data-esc-close` lines.
  - Heading ids follow three naming schemes (`dlg-*`, `*-title`, `*-name`).
  - Four js files build a `sheet-head` themselves (`text`): designer.js, hub.js, learn-door.js and
    share-card-chips.js.
  - The three `.dh-close` icon buttons differ: `index.html:2867` `#track-detail-close` has no `type="button"` and is
    labelled "Close", while :3795 and :3807 are `type="button"` and labelled "Close data hub" / "Close track
    designer".
  - `#rotate-device` (index.html:737) is the only `role="dialog" aria-modal` div among the 22 real dialogs.
- **Hurts:** each new dialog copies a neighbour's head, foot and autofocus choice.
- **Shape:**
  - a static contract first: every `<dialog>` has `aria-labelledby` → an `h2` inside it, one `data-esc-close`
    target, and one `autofocus`; every icon close is `type="button"` with `aria-label` `/^Close\b/`;
  - then optionally `Dom.sheet({id, title, body, foot})` for the js-built heads. The dialog element and its
    `data-esc-close` stay in the shell, because the boot Escape check reads them (index.html:3796).
- **PRs:**
  1. The pin, plus `type="button"` on `#track-detail-close`.
  2. One heading-id scheme.
  3. `Dom.sheet` for the 4 js builders.
- **Pin first:** the contract above as a `menu-a11y-audit.test.mjs` case.
- **Frees:** ~5 lines now; 80-100 if the 8 plain dialogs are built at first open (that lowers `shellNodes`).
- **Risk:** low for the pin, med for building them at first open.
- **Collides:** `hub.js` (the #6434 row 6b worker) and `learn-door.js` (#6410): leave those two js builders out.

### 9. The pause-menu compact override: one file, one prefix

- **What / where:** the prefix `body:is([data-density="compact"][data-shape="wide"], [data-pause-short]) #pausemenu`
  is written 21 times (verifier-corrected from 35): 18 in `overlays.css:1195-1256` (`@layer overlays`) and 3 in
  `dialogs.css:258, 262, 269` (`@layer components`), where the base pause card lives.
- **Hurts:** the prefix is ~80 characters with inflated specificity (body + 2 attributes + id). Every compact fix
  must match it exactly, and the compact pause card is spread over two files and two layers.
- **Shape:** one nested block in `overlays.css`, `body:is(…) #pausemenu { & .sheet-head {…} & #pm-resume {…} }`.
  The 3 `dialogs.css` rules move into it; specificity is unchanged.
  `helmet-visor.css` already uses native nesting.
- **PRs:**
  1. Move the 3 `dialogs.css` rules. Check the layer change: from `components` to `overlays`, they now win over
     anything in `components`.
  2. Nest the 18.
- **Pin first:** a computed-style snapshot of `#pausemenu`, `#pm-resume`, `#pm-quick-doors`, `#pm-now-card` and
  `#pm-quit` at 852×393 (Bryce's export) and 844×390, compact and pause-short.
- **Frees:** ~1.5 KB of css bytes, ~0 lines.
- **Risk:** low-med (the layer move).
- **Collides:** **#6405** (`overlays.css`). Wait.

### 10. Layer islands: one layer per file

- **What / where:** 7 files open more than one top-level `@layer` block (verifier-corrected from 13): `tuner.css` 7,
  `screen-arranger.css` 3, `settings-controls.css` 3, and `data.css`, `dialogs.css`, `overlays.css` and
  `responsive.css` 2 each.
  - `tuner.css:1461-1472` is a `@layer hud` island holding `#pc-toggle` overrides, there only because `hud.css` sets
    `#pc-toggle` in `hud` (comment at tuner.css:1448-1460).
  - `overlays.css:1495-1881` is a ~386-line `@layer components` tail (the pane-pair primitive) inside an `overlays`
    file.
  - `dialogs.css:523-529` repeats the "second layer on purpose" device.
- **Hurts:** a file name no longer says which layer a rule is in. That is the question css-play's loop §3 asks
  first, when "my edit changes nothing".
- **Shape:**
  - the `#pc-toggle` island moves into `hud.css` beside the rule it overrides;
  - the pane-pair tail moves to `components.css`, not a new file: a new file costs a lazy-manifest entry and
    `eagerScripts`/shell work.
  - extend `css-layers.test.mjs` to pin the (file, layer) set, so a new island fails.
- **PRs:**
  1. The pin, at today's 7.
  2. `#pc-toggle`.
  3. The pane-pair tail.
  4. The rest, one file each.
- **Pin first:** the (file, layer) pin, plus a computed-style snapshot of `#pc-toggle` compact in photo mode.
- **Frees:** ~25 lines of hack comments and 5 `@layer` wrappers.
- **Risk:** med (order within a layer moves).
- **Collides:** #6405 (`tuner.css`, `overlays.css`, `screen-arranger.css`, `data.css`) and #6403
  (`photo-studio.css`, beside `#pc-toggle`). Only the pin is clear today.

### 11. settings-tabs keeps a private copy of TopModal's focus kit

- **What / where:**
  - `js/ui/settings-tabs.js:189-206` defines `visible()` (~12 lines: `hidden`, `aria-hidden`, `DETAILS`,
    `checkVisibility`), `quietFocus()` (try/catch around `focus({preventScroll:true})`) and `restoreFocus()` with
    its own ResizeObserver.
  - `js/ui/modal.js:301-346` has the same pair as `usable`/`focusQuiet`/`focusShown`, with `keepFocus` on top.
    `lsp_references {symbol:"TopModal.keepFocus", files:true}` → 9 refs in 5 files (career-ui, season-ui,
    photo-studio-ui, results-sheet and modal). settings-tabs is not among them.
  - Opener capture is hand-rolled in `screen-arranger.js:323` and `dock-toolbar.js:86` (`text`). Whether those
    layers rely on UiLayers' focus return is unchecked (PLAUSIBLE).
- **Hurts:** two "is this focusable" predicates. The settings copy is stricter (it handles `DETAILS`), so a focus fix
  made in modal.js does not reach Settings.
- **Shape:** export `usable` and `focusQuiet` from `TopModal`. settings-tabs uses them and keeps only its
  ResizeObserver scroll-follow (#5358). If the `DETAILS` handling is the better rule, it moves into `usable`.
- **PRs:** one. Diff the two predicates first; any difference is a behaviour, and Bryce decides.
- **Pin first:** `tests/unit/settings-tabs.test.mjs` (it exists), plus a case of a page change with focus inside a
  closed `<details>`.
- **Frees:** ~18 lines.
- **Risk:** med (the stricter predicate).
- **Collides:** the #6434 row 6a worker (the ghost-tap shield in `modal.js`). Different functions, but one file:
  sync after it.

### 12. Small dedupes, one PR each

| what | where | measured | step | collides |
|---|---|---|---|---|
| inert micro-type copy | `select.css:1026-1037` = `race-setup.css:751-762` | 12 lines, 8 selector groups, same layer, same specificity; race-setup loads after select (index.html:122-123), so the select copy never wins | delete the select.css copy | #6405 (both files) |
| `byId` ×9 | appearance-opts:69, captions:32, layout-presets:91, look-avail:17, screen-looks:9, setting-deps:30, setting-row:37, title-fx:31, title-layout:504 | `lsp_symbols {query:"byId"}` → 9 module-level copies in js/ui, beside `G.$` (`shell-ids.test.mjs` header) | `Dom.byId`, only for the modules that read the global `document` (the 5 that inject `doc` keep their seam) | setting-row (#6405) |
| `_vpNow` = `_fitNow` | `hud.js:31`, `hud.js:441` | the same expression, verifier-confirmed | reuse `_vpNow` | — |
| hide triple ×2 | `overlays.css:100-105` `#rotate-device`, `:109-114` `#ios-install` | the same 3 `!important` declarations | one selector list | #6405 (overlays.css) |
| token literals | `hud.css:377, 561` `#aeea00` (= `--you`); `data.css:547`, `race-setup.css:217` `#f6d200` (= `--sec-slow`) | the colour-blind modes recolour these tokens, but the literals don't follow | **behaviour change in colour-blind modes**: an issue for Bryce, not a Gardener PR; it lowers `rawColor` | #6450, #6387 (hud.css), #6405 |
| breakpoint drift | all css/ | 41 distinct `@media` width bounds and 23 height bounds; off-by-one pairs 899/900, 699/700/701, 760/761, 743/744, 599/600 | a shrink-only ratchet on distinct bounds; normalising a value is a screenshot check at both widths | none for the ratchet |

## Next tier (measured, not ranked)

- **The title-car SVG is inline:** `index.html:2395-2415`, 21 lines, ~49 KB (13% of the 374,934-byte shell). 21 of
  the shell's 26 `style="` attributes are its `--i:N` stagger. Moving it is a first-paint question, so it is perf, not
  Gardener work. It is listed only for size.
- **Five layout `style=` attributes** (index.html:1113, 1117, 1121, 1248, 1251). Three are the same
  `display:block;min-height:var(--tap-paint)`. They overlap the #6434 tap-token work.
- **17 css-only ids**, e.g. `cs-budget-bar`, `cs-titlebar`, `fb-head`, `ga-head`, `hud-tyre-bar`. Ids used only as
  style hooks.
- **The four docked tuner shells** (lighting, camtune, flyby, garrival; index.html:3566-3715) share one region › sheet
  › tablist › rows › foot skeleton. This follows item 1.
- **hud.js leaves after item 2:** the fit ResizeObserver watch (~30 lines, 14 free names) and `speakHud`'s state
  (~25 lines). `fitPass` itself has ~50 free names over 795-1680, so it is not a candidate.
- **The shell/js split rule is unwritten.** There are 85 static empty containers for js to fill; the career screens
  are static chrome with js bodies (`Dom.el`: `lsp_references {files:true}` → career-ui.js 177 of 418). A one-line
  rule in index.html's header ("the shell owns chrome, js owns bodies") would settle where the next screen goes.
- **`Dom.el` adoption inside js/ui is 4 files** (`lsp_references {symbol:"Dom.el", files:true}`: learn-door,
  results-story, podium-beat, dom), against 314 raw `createElement` calls in 40 js/ui files (`text`). This is the
  measure behind survey 1's factory row.

## Collision map (open PRs touching css/, index.html or js/ui/ at survey time)

| PR | files in scope |
|---|---|
| #6405 stepper-no-dropdown | `js/ui/setting-row.js`; css: career-experience, career, carsetup, components, data, editor, garage-experience, menus, overlays, race-setup, screen-arranger, select, title, tokens, tuner, watch-transport |
| #6450 (#6434 rows 2–3) | `css/hud.css`, `js/ui/hud-layout.js` |
| #6444 (#6434 rows 1, 4) | `css/carsetup.css` |
| #6434 rows 5–7 workers (no PR yet) | type-clamp tokens (`tokens.css`), `--tap`/`--chip-h`, `modal.js` ghost-tap shield, Data Hub tab arrows (`hub.js`), `desktop-graphics.js` |
| #6387 F-13 slice 7 | `css/hud.css` |
| #6435 | `css/loading.css`, `js/ui/loading-screen.js` |
| #6403 | `css/photo-studio.css`, `js/ui/photo-studio-ui.js` |
| #6427 | `js/ui/photo-studio-ui.js` |
| #6410 | `js/ui/learn-door.js` |

**Free to start today:**
- items 2 and 3 (hud.js);
- item 1, except `photo-studio-ui` and `hub`;
- item 5, except photo-studio;
- item 6's pin;
- item 8's pin;
- item 10's pin;
- item 11, after the #6434 row 6a worker.

#6405 blocks most of the CSS side (items 4, 7, 9, the rest of 10, and two rows of 12). It is the one PR to watch.

## Tools used

My own calls: 8 `lsp_*` (3 `lsp_outline`, 3 `lsp_symbols`, 2 `lsp_references`) and 8 grep-type calls. Reported by
the subagents:

| who | `lsp_*` | grep-type |
|---|---|---|
| me | 8 | 8 |
| js/ui hunter | 13 | 18 |
| HUD hunter | 11 | 14 |
| index.html hunter | 6 | 17 |
| css hunter | 0 | 27 |
| verifier 1 | 7 | 17 |
| verifier 2 | 0 | 22 |
| **total** | **45** | **123** |

Of the grep-type calls, 49 were the two CSS-only agents (css hunter, verifier 2), which had no JS symbols to query.
The other 74 split into the index.html hunter's 17 (HTML, which has no symbols) and 57 on js/. Most of those 57 counted inline
shapes that have no symbol: anonymous keydown handlers, `aria-pressed` strings, `role="tablist"`. About 5 were JS names that an lsp query could have answered (the HUD hunter's count). That
is the gap to close next time.
