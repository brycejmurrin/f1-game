# Unit group 59 — complete source map

Read-only source review of all 15 assigned files, 3,811 lines, 170 top-level cases. Every assigned line was returned in individually bounded source reads (at most 100 source lines and 10,000 characters); aggregate-truncated middle output was reread in separate bounded calls. Source hashes below bind this inventory to the reviewed bytes. No tests, browser, runtime edits or commits were performed.

Assertion spans are inclusive source lines, including multiline callback predicates. Each case lists its full declaration span and every direct assertion call; assertions in shared helpers are listed separately. The quoted case name and assertion operands describe the oracle, not a claim that it passed. Fixtures and file-level limits apply to every case in that section.

## Source manifest

| Source | Full reviewed range | SHA256 |
|---|---|---|
| `tests/unit/ui-layers-reflow.test.mjs` | 1–146 | `dbd335f64d9c2cba70030d2324aa025bfb7b64dc58ccecea0fbf054bac5cbe60` |
| `tests/unit/ui-sheets-audit.test.mjs` | 1–1061 | `2d07d6abcd37b5d6be1acea8fa040976ad89f7f6a583dcdff01c0e4b861dd5e0` |
| `tests/unit/uilayers-modal-order.test.mjs` | 1–411 | `88a446aa6a45e12f59fbacd796d3ce3f1dfdb5bfa7803a0b90d73177e500092d` |
| `tests/unit/validation-cli.test.mjs` | 1–455 | `f867d6a51d81065ad450ef00b828fa43231c562342d65834e236be0c278b4d27` |
| `tests/unit/vegas-day-strip.test.mjs` | 1–67 | `828e09f4e58622128fb4e9d692029d6be14eb7d44ba0c88a5e8f1e15b1738bd4` |
| `tests/unit/vehicle-tick-alloc.test.mjs` | 1–229 | `e14dea3fb06deb1095312a4bdb5a39530e319dfbd78273177e5ca14b2c9e1011` |
| `tests/unit/vendor-licences.test.mjs` | 1–38 | `98eca0016f0f85b7d9b741d3a830487b0b3c280d4f89182ea60a39322a9df5d7` |
| `tests/unit/verify-live.test.mjs` | 1–287 | `8699a07545f6572f2def474fc2ba711476c9478ea17dbadf46eeef013da06bb3` |
| `tests/unit/vertex-pack.test.mjs` | 1–334 | `1203165bb4104ec50e059b8ac01b652490709e306e3fa0f72e7f69721b086c66` |
| `tests/unit/viewer.test.mjs` | 1–105 | `35e962687f37cfbf2b1c3ad5386c5b497cbc8bdc01a2054df6e0e311c5f7dc3f` |
| `tests/unit/visor-optics.test.mjs` | 1–389 | `c3c675dd3437a8e2d3f68daf753ca4108a04ae1d01ee26583a132755306f72bc` |
| `tests/unit/visual-oracle.test.mjs` | 1–15 | `b035427ec8076a24d39b48ba6f67807f6fc392cf771a0a5f908d35e74ad4612b` |
| `tests/unit/vm-debug-preload.test.mjs` | 1–62 | `b368eebb1c3e28d48eec773fdb961d8dd6c260243b2049fd4e44898bfdc1cd7b` |
| `tests/unit/vm-filename-lint.test.mjs` | 1–59 | `0a97925a623d8da52a09da3c15ee5fa3ef6b5e11dbd9032f1b87b4d69572838d` |
| `tests/unit/vm-page-lifecycle.test.mjs` | 1–153 | `bb117a373cc4ed14e5a78138cd91d39a759d6c4093361db4fc6aee8d14f9b0c4` |

## Production navigation evidence

Project code-nav shell LSP was used from this checkout. `refs --files` located UiLayers (97 references / 14 files; text fallback for untyped window export), TopModal (19 / 7; same fallback), GameResults (3 / 2, game consumer), SeasonCal (136 / 18), RendererPicker (46 / 12), AudioPanel (12 / 5; two declarations, panel declaration selected), SettingRow (267 / 32; text fallback), Vehicle (3 / 2, player-forces consumer), PlayerForces (3 / 2, game consumer), WheelState (4 / 2, player-forces consumer), VertexPack (15 / 5, WGX and GLX consumers; multiple declarations), VisorOptics (8 / 3, droplets/game), Droplets (6 / 2, game) and Car3D (134 / 12). Counts include declarations and are navigation evidence, not test coverage.

Definition queries resolved `UiLayers.top` to `js/ui/layers.js:198`, `GameResults.create` to `js/ui/results-sheet.js:122`, `PlayerForces.create` to `js/physics/player-forces.js:30`, and `VertexPack.pack` to `js/render/shared/vertex-pack.js:79`. `VisorOptics.lightMap` resolved to `js/fx/visor-optics.js:165` by module-file fallback: no direct qualified runtime use was found, so export/caller coverage remains unverified for that particular lookup. Tool/helper imports are mapped directly from the reviewed imports; the project LSP runtime index is not claimed to cover tools or test adapters.

## `tests/unit/ui-layers-reflow.test.mjs`

Targets: `js/ui/layers.js`: `UiLayers.anyOpen`, `top`, `navOpen` and their `shownLayer` visibility path.

Fixtures and setup: Lines 12–87 boot a fresh VM, Proxy-counted style writes, counted rect/computed-style reads, five layer nodes, a queued-record MutationObserver and fixed clock. Assertions compare read counters across style writes; wrapper children retain the layout-measurement path.

Limits: Synthetic DOM only: counters establish absence/presence of API calls, not browser layout duration, native dialog behavior or pixels.

### shownLayer: open dialog skips layout after a style write (Settings path)

Case 89–101.
- 96–96: `assert.ok(t.styleWrites.n >= 1, "style write landed")`.
- 98–98: `assert.equal(t.U.anyOpen(), true)`.
- 99–99: `assert.equal(t.reads.rect, before.rect)`.
- 100–100: `assert.equal(t.reads.style, before.style)`.

### top(): ordinary layers skip layout after a style write (focusin path)

Case 103–121.
- 114–114: `assert.ok(t.styleWrites.n >= 1, "style write landed")`.
- 117–117: `assert.ok(top === settings || (top && top.id === "pmsettings"), "settings ranks on top")`.
- 119–119: `assert.equal(t.reads.rect, before.rect)`.
- 120–120: `assert.equal(t.reads.style, before.style)`.

### shownLayer: zero-size wrapper still measures children

Case 123–137.
- 135–135: `assert.equal(t.U.anyOpen(), true)`.
- 136–136: `assert.ok(t.reads.rect > before, "lighting still pays a layout read for the child walk")`.

### shownLayer without open still measures ordinary layers (VM memo pins)

Case 139–146.
- 144–144: `assert.equal(t.U.navOpen(), false)`.
- 145–145: `assert.ok(t.reads.rect > 0 || t.reads.style > 0, "non-dialog path still touches layout APIs")`.


## `tests/unit/ui-sheets-audit.test.mjs`

Targets: Targets vary by case as specified below: real results/calendar/story modules; renderer picker/preset; audio panel/setting rows; shell/CSS; agent finish helper.

Fixtures and setup: Shared setup 27–52: CSS readers/parser, mini DOM, seedLog/seedDom/seedSaveMigrate/seedStore, absolute VM filenames, source lexical-const rewrite and Map store. `bootResults` 90–122 loads real SeasonCal, RaceControl, results-story and results-sheet against three tracks/two teams and fake game façade. `tiedSeason` 124–135 gives equal points with unequal win count; `clear`, `rowsOf`, `nameOf` 139–141 compensate for mini-DOM textContent and nested ranking lists. `makeStorage` 369–372 and `bootGfx` 374–433 use strict lookups, destructive SELECT textContent, deferred DOMContentLoaded, three available backend stops, fake clock/storage/reloads and manually fired timers. `bootAudio` 522–588 supplies four slider rows, mutable track/tone/layers, audio Proxy, optional observer/interval maps, real SettingRow and AudioPanel.

Limits: Mini-DOM cannot validate native focus, rendering or viewport geometry. Audio methods are stubs; no sound is produced. Renderer tests schedule fake reloads and timers, never boot a GPU. CSS/source pins constrain text or a limited selector cascade, not a browser style engine.

Shared helper assertions: `assert.equal` 427–427; `assert.equal` 428–428.

### fold summaries preserve identical DOM, including normalized entities, and repaint changed content

Case 54–87.
Exercised target: `Dom.paintFold` through the real seeded DOM helper.
- 69–69: `assert.equal(writes, 1)`.
- 70–70: `assert.equal(html, '<span data-fold="k">MUSIC &amp; SOUND</span><span data-fold="sep"> · </span><span data-fold="on">ON</span><span data-fold="sep"> · </span><span data-fold="val">&amp; MY TRACKS</span>')`.
- 72–72: `assert.equal(writes, 1)`.
- 75–75: `assert.equal(writes, 2)`.
- 76–76: `assert.equal(html.includes('<span data-fold="off">OFF</span>'), true)`.
- 77–77: `assert.equal(html.includes('<span data-fold="val">2 TRACKS</span>'), true)`.
- 80–80: `assert.equal(writes, 3)`.
- 82–82: `assert.equal(writes, 3)`.
- 84–84: `assert.equal(html, "")`.
- 84–84: `assert.equal(writes, 4)`.
- 86–86: `assert.equal(writes, 4)`.

### unscored practice results suppress points in every classification row while scored races retain them

Case 143–160.
Exercised target: GameResults / SeasonCal / results-story.
- 150–150: `assert.equal(story.children[0].children[1].textContent, "Unscored session · P1")`.
- 151–151: `assert.deepEqual(points(), ["Unscored", "Unscored"])`.
- 152–152: `assert.deepEqual(rowsOf(h.els.resultsTable).map(r => r.children[0].textContent), [1, 2])`.
- 155–155: `assert.deepEqual(points(), ["25 pts", "18 pts"])`.
- 159–159: `assert.equal(rowsOf(scored.els.resultsTable)[0].children.find(c => c.classList.contains("res-pts")).textContent, "26 pts +FL")`.

### RESULTS top-10 and the CHAMPION panel rank by countback, like STANDINGS

Case 162–187.
Exercised target: GameResults / SeasonCal / results-story.
- 165–165: `assert.equal(h.SeasonCal.rank(season, "a", "b") > 0, true)`.
- 170–170: `assert.equal(standings[0], "BBB Bravo")`.
- 176–176: `assert.deepEqual(drivers, ["BBB Bravo", "AAA Alpha"])`.
- 177–177: `assert.equal(h.els.resNext.textContent, "NEXT ROUND")`.
- 182–182: `assert.equal(h.els.resultsTitle.textContent, "WORLD CHAMPION")`.
- 184–184: `assert.equal(banner.textContent, "BBB Bravo")`.
- 185–185: `assert.equal(rowsOf(table).map(nameOf)[0], "BBB")`.
- 186–186: `assert.equal(h.els.resNext.textContent, "MAIN MENU")`.

### RESULTS and STANDINGS share the career constructor tie policy

Case 189–206.
Exercised target: GameResults / SeasonCal / results-story.
- 197–197: `assert.deepEqual(rowsOf(h.dom.byId("standings-body")).slice(2).map(nameOf), ["BLUE", "RED"])`.
- 199–199: `assert.deepEqual(rowsOf(h.els.resultsTable).slice(4).map(nameOf), ["BLUE", "RED"])`.
- 202–202: `assert.ok(h.SeasonCal.rankTeams(season, "blue", "red") < 0)`.
- 203–203: `assert.equal(h.SeasonCal.rankTeams(season, "red", "red"), 0)`.
- 205–205: `assert.ok(h.SeasonCal.rankTeams(season, "red", "blue") < 0, "points remain decisive")`.

### a WATCHED real race (REAL REPLAY / HIGHLIGHTS) awards no badge and draws no YOUR RACE card; a driven one does

Case 208–233.
Exercised target: GameResults / SeasonCal / results-story.
- 227–227: `assert.equal(watched.onRace.length, 0)`.
- 228–228: `assert.deepEqual(watched.cards, [])`.
- 230–230: `assert.equal(driven.onRace.length, 1)`.
- 231–231: `assert.ok(driven.cards.some((t) => /^YOUR RACE · P1/.test(t)), "a driven finish keeps its YOUR RACE card: " + JSON.stringify(driven.cards))`.
- 232–232: `assert.ok(driven.cards.some((t) => /^BADGE UNLOCKED/.test(t)), "and its badge card: " + JSON.stringify(driven.cards))`.

### YOUR RACE says where you started, the places gained, your best lap and the penalty carried

Case 235–257.
Exercised target: GameResults / SeasonCal / results-story.
- 250–250: `assert.match(p2, /· FROM P5 \(▲3\)/)`.
- 251–251: `assert.match(p2, /· BEST 1:21\.000(?! ★)/)`.
- 252–252: `assert.match(p2, /· PEN \+5s$/)`.
- 254–254: `assert.match(lost, /· FROM P1 \(▼1\) · BEST 1:19\.000 ★$/)`.
- 256–256: `assert.match(same, /· FROM P2 · BEST/)`.

### a GUEST's RESULTS labels DNF from the host's verdict, not from its own reliability plan

Case 259–279.
Exercised target: GameResults / SeasonCal / results-story.
- 271–271: `assert.equal(nameOf(rows[0]), "BBB Bravo")`.
- 272–272: `assert.equal(pts(rows[0]), "25 pts")`.
- 273–273: `assert.equal(nameOf(rows[1]), "AAA Alpha (engine)")`.
- 274–274: `assert.equal(pts(rows[1]), "DNF")`.
- 278–278: `assert.equal(nameOf(rowsOf(solo.els.resultsTable)[1]), "BBB Bravo (gearbox)")`.

### race RESULTS shows host-corrected elapsed and same-lap gaps only when fields are present

Case 281–329.
Exercised target: GameResults / SeasonCal / results-story.
- 303–303: `assert.match(table.children[0].textContent, /OFFICIAL WINNER ELAPSED.*WIN.*1:40\.00/)`.
- 307–307: `assert.deepEqual(gaps(rows[0]), [])`.
- 308–308: `assert.deepEqual(gaps(rows[1]), ["+5.000s"])`.
- 309–309: `assert.deepEqual(gaps(rows[2]), ["+0.000s"])`.
- 310–310: `assert.deepEqual(gaps(rows[3]), [])`.
- 311–311: `assert.match(nameOf(rows[4]), /\(engine\)/)`.
- 319–319: `assert.equal(noOfficial.els.resultsTable.children.some((e) => e.classList.contains("sel-label")), false)`.
- 320–321: `assert.equal(rowsOf(noOfficial.els.resultsTable).some((r) => r.children .flatMap((c) => c.children || []).some((c) => c.classList.contains("q-time"))), false)`.
- 326–327: `assert.equal(unclassified.els.resultsTable.children.some((e) => e.classList.contains("sel-label")), false)`.

### STANDINGS title says which half of a sprint weekend it stands on, and the pause menu's NEXT line is the race in progress

Case 331–366.
Exercised target: GameResults / SeasonCal / results-story.
- 338–338: `assert.equal(h.SeasonCal.sprintOn(), true)`.
- 339–339: `assert.equal(h.SeasonCal.rounds(), 3)`.
- 346–346: `assert.equal(title(), "CHAMPIONSHIP — AFTER ROUND 2 / 3")`.
- 347–347: `assert.match(last(), /^NEXT: ROUND 3 — MELBOURNE/)`.
- 350–350: `assert.equal(h.SeasonCal.midWeekend(season), true)`.
- 352–352: `assert.equal(title(), "CHAMPIONSHIP — AFTER THE SPRINT, ROUND 3 / 3")`.
- 353–353: `assert.match(last(), /^NEXT: GRAND PRIX, ROUND 3 — MELBOURNE/)`.
- 359–359: `assert.equal(title(), "CHAMPIONSHIP — AFTER ROUND 2 / 3")`.
- 360–360: `assert.match(last(), /^IN PROGRESS: ROUND 3 — MELBOURNE/)`.
- 364–364: `assert.equal(title(), "FINAL CHAMPIONSHIP")`.
- 365–365: `assert.doesNotMatch(last(), /^(NEXT|IN PROGRESS)/)`.

### an unconfirmed in-race RENDERER tap keeps the picker's options, and the question expires

Case 435–450.
Exercised target: RendererPicker / GfxQuality.
- 440–440: `assert.equal(h.sel.dataset.armed, "1")`.
- 441–441: `assert.equal(h.pendingReload(), false)`.
- 442–442: `assert.equal(h.sb.localStorage.getItem("apex26.gfxBackend"), null)`.
- 443–443: `assert.equal(h.sel.options.length, 3)`.
- 444–444: `assert.deepEqual(h.optText(), ["WEBGL2", "RENDERER: END THIS RACE & RELOAD?", "WEBGPU"])`.
- 447–447: `assert.equal(h.sel.dataset.armed, undefined)`.
- 448–448: `assert.deepEqual(h.optText(), ["WEBGL2", "THREE.JS", "WEBGPU"])`.
- 449–449: `assert.equal(h.sel.value, "three")`.

### an in-race RENDERER confirm belongs to the value that asked (H29): a different pick re-asks instead of reloading

Case 452–465.
Exercised target: RendererPicker / GfxQuality.
- 457–457: `assert.equal(h.sel.dataset.armed, "1")`.
- 460–460: `assert.equal(h.pendingReload(), false)`.
- 461–461: `assert.equal(h.sb.localStorage.getItem("apex26.gfxBackend"), null)`.
- 462–462: `assert.equal(h.sel.dataset.armed, "1")`.
- 464–464: `assert.equal(h.sb.localStorage.getItem("apex26.gfxBackend"), "three")`.

### a stale arm never carries into the next race; out of a race it is cleared, not consumed

Case 467–498.
Exercised target: RendererPicker / GfxQuality.
- 472–472: `assert.equal(h.sel.dataset.armed, "1")`.
- 480–480: `assert.equal(h.pendingReload(), false)`.
- 481–481: `assert.equal(h.sel.dataset.armed, "1")`.
- 484–484: `assert.equal(h.pendingReload(), true)`.
- 485–485: `assert.equal(h.sb.localStorage.getItem("apex26.gfxBackend"), "three")`.
- 492–492: `assert.equal(reset.textContent, "RESET RENDERER: END THIS RACE & RELOAD?")`.
- 493–493: `assert.equal(g2.pendingReload(), false)`.
- 496–496: `assert.equal(g2.pendingReload(), true)`.
- 497–497: `assert.equal(reset.textContent, "RESET RENDERER — RELOADING…")`.

### THREE PATH and SCREENSHOTS confirms expire back to their real labels

Case 500–519.
Exercised target: RendererPicker / GfxQuality.
- 506–506: `assert.equal(pathBtn.textContent, "THREE PATH: END THIS RACE & RELOAD?")`.
- 507–507: `assert.equal(h.pendingReload(), false)`.
- 509–509: `assert.equal(pathBtn.textContent, "THREE PATH: AUTO")`.
- 510–510: `assert.equal(h.Gfx.readThreePath(), "auto")`.
- 515–515: `assert.equal(shotBtn.textContent, "SCREENSHOTS: END THIS RACE & RELOAD?")`.
- 517–517: `assert.equal(shotBtn.textContent, "SCREENSHOTS: AUTO")`.
- 518–518: `assert.equal(h.Gfx.readShotMode(), "auto")`.

### MUSIC & SOUND names the gate that is shut and captions DEFAULT as DEFAULT

Case 590–612.
Exercised target: AudioPanel / SettingRow.
- 594–594: `assert.equal(h.dom.byId("as-music-sel").value, "on")`.
- 595–595: `assert.equal(h.dom.byId("as-mvol").disabled, true)`.
- 596–596: `assert.equal(h.dom.byId("as-now").textContent, "Sound off")`.
- 597–597: `assert.match(h.dom.byId("as-now-src").textContent, /^Master sound is off/)`.
- 602–602: `assert.equal(on.dom.byId("as-now").textContent, "Song A")`.
- 603–603: `assert.equal(on.dom.byId("as-now-src").textContent, "Default")`.
- 604–604: `assert.equal(on.dom.byId("as-src-sel").value, "builtin")`.
- 605–605: `assert.equal(on.dom.byId("as-src-sel").children.find((o) => o.value === "user").disabled, true)`.
- 606–606: `assert.equal(on.dom.byId("as-src-note").textContent, "Playing the 4 shipped tracks only.")`.
- 611–611: `assert.equal(off.dom.byId("as-now").textContent, "Music off")`.

### pause music timer updates the visible card without syncing hidden audio settings

Case 614–654.
Exercised target: AudioPanel / SettingRow.
- 620–620: `assert.equal(h.timers.size, 1)`.
- 635–635: `assert.equal(h.counts.tuneReads, 0)`.
- 636–636: `assert.equal(hiddenWrites + disabledWrites + ariaWrites + replacements, 0)`.
- 639–639: `assert.equal(now.textContent, "Song B")`.
- 640–640: `assert.equal(h.dom.byId("pm-now-src").textContent, "My tracks")`.
- 641–641: `assert.equal(replacements, 0)`.
- 642–642: `assert.equal(h.dom.byId("as-now").textContent, "Song A")`.
- 644–644: `assert.equal(h.dom.byId("as-now").textContent, "Song B")`.
- 645–645: `assert.ok(h.counts.tuneReads > 0)`.
- 647–647: `assert.equal(now.textContent, "Music off")`.
- 647–647: `assert.equal(card.hidden, true)`.
- 647–647: `assert.equal(next.disabled, true)`.
- 649–649: `assert.equal(now.textContent, "Sound off")`.
- 649–649: `assert.equal(play.disabled, true)`.
- 651–651: `assert.equal(card.hidden, false)`.
- 651–651: `assert.equal(next.disabled, false)`.
- 651–651: `assert.equal(play.disabled, false)`.
- 653–653: `assert.equal(h.timers.size, 0)`.

### engine tone sync skips unchanged readouts and layer ARIA while retaining immediate edits

Case 656–673.
Exercised target: AudioPanel / SettingRow.
- 665–665: `assert.equal(textWrites + ariaWrites, 0)`.
- 668–668: `assert.equal(out.textContent, String(Math.round(h.tone.pitch * 100)))`.
- 669–669: `assert.equal(textWrites, 1)`.
- 671–671: `assert.equal(layer.getAttribute("aria-pressed"), "false")`.
- 672–672: `assert.equal(ariaWrites, 1)`.

### the pause → settings → sub-sheet Escape ladder presses each sheet's own BACK

Case 676–718.
Exercised target: index.html / sheet CSS.
- 678–678: `assert.ok(m, id)`.
- 680–680: `assert.equal(via("pausemenu"), "pm-resume")`.
- 681–681: `assert.equal(via("pmsettings"), "pm-settings-close")`.
- 682–682: `assert.equal(via("howtoplay"), "htp-close")`.
- 683–683: `assert.equal(via("lighting"), "lt-close")`.
- 684–684: `assert.equal(via("camtune"), "ct-close")`.
- 685–685: `assert.equal(via("standings"), "standings-close")`.
- 686–686: `assert.match(esc("results"), /data-esc="none"/)`.
- 688–688: `assert.ok(html.includes('id="${id}"'), '${id} exists for Escape to press')`.
- 690–691: `assert.doesNotMatch(html, /id="as-close"|id="adv-close"/)`.
- 699–699: `assert.deepEqual(ids, ["pm-resume", "pm-restart", "pm-settings", "pm-strategy", "pm-review", "pm-practice", "pm-photo", "pm-howto", "pm-checkpoint-save", "pm-checkpoint-retry", "pm-checkpoint-rewind", "pm-standings", "pm-skip-results", "pm-quit"])`.
- 702–703: `assert.deepEqual(doors, ["pm-open-controls", "pm-open-driving", "pm-open-display", "pm-open-appearance", "pm-open-a11y", "pm-audio", "pm-open-files", "pm-open-graphics", "pm-open-visual", "pm-open-progress"])`.
- 704–704: `assert.doesNotMatch(settingsIndex, /id="pm-advanced"/)`.
- 705–705: `assert.match(html, /id="pm-panel-controls"[\s\S]*id="pm-advanced"[^>]*>ADVANCED INPUT &amp; HANDLING/)`.
- 709–709: `assert.match(driving, new RegExp('id="${id}"'))`.
- 710–710: `assert.doesNotMatch(pause, new RegExp('id="${id}"'))`.
- 712–712: `assert.doesNotMatch(pause, /id="pm-driving"/)`.
- 715–715: `assert.match(display, new RegExp('id="${id}"'))`.
- 716–716: `assert.match(pause, /<div id="pm-now-card" class="as-now-card" hidden>/)`.
- 717–717: `assert.match(pause, /id="pm-resume" autofocus/)`.

### pause, settings, results and standings all scroll inside the sheet on a short viewport

Case 720–741.
Exercised target: index.html / sheet CSS.
- 722–722: `assert.equal(decl(comp, ".sheet", "grid-template-rows"), "auto minmax(0, 1fr) auto")`.
- 723–723: `assert.equal(decl(comp, ".pane", "overflow-y"), "auto")`.
- 724–724: `assert.equal(decl(comp, ".pane", "overflow-x"), "hidden")`.
- 725–725: `assert.equal(decl(comp, ".sheet-body", "min-height"), "0")`.
- 729–729: `assert.ok(m && /class="[^"]*\bpane\b/.test(m[0]), '#${id} is a .pane scroll region')`.
- 731–731: `assert.ok(/<div class="sheet-body pane stack">/.test(html.slice(html.indexOf('id="pausemenu"'), html.indexOf('id="pmsettings"'))), "the pause stack is a pane")`.
- 732–733: `assert.equal(decl(comp, "#pm-settings-index[hidden], .pm-groups > [role=\"region\"][hidden]", "display"), "none !important")`.
- 737–737: `assert.equal(decl(comp, /#pm-metrics-details > \[role="group"\]/, "display"), "flex")`.
- 738–738: `assert.equal(decl(comp, /#pm-hud-details > \[role="group"\]/, "display"), "flex")`.
- 739–740: `assert.equal(decl(comp, /#pm-metrics-details > \[role="group"\]/, "max-height"), null)`.

### a CLASSIFIED late retirement shows the points award() paid, with its reason in the name

Case 743–759.
Exercised target: GameResults / results-story.
- 753–753: `assert.match(nameOf(rows[1]), /\(engine\)/)`.
- 754–754: `assert.match(pts(rows[1]), /^\d+ pts/)`.
- 758–758: `assert.equal(rowsOf(un.els.resultsTable)[1].children.find((c) => c.classList.contains("res-pts")).textContent, "DNF")`.

### a flagged finisher below the distance floor reads NC with zero points and no podium or badge

Case 761–791.
Exercised target: GameResults / results-story.
- 776–776: `assert.equal(rows[1].children[0].textContent, "NC")`.
- 777–777: `assert.equal(rows[1].children.find((c) => c.classList.contains("res-pts")).textContent, "0 pts")`.
- 778–778: `assert.match(nameOf(rows[1]), /\(\+2 LAPS\)/)`.
- 779–779: `assert.equal(rows[1].classList.contains("p2"), false)`.
- 780–780: `assert.deepEqual(badgeCalls, [])`.
- 782–782: `assert.equal(personal.children[0].textContent, "YOUR RACE · NC")`.
- 784–784: `assert.equal(story.children[0].children[1].textContent, "NC · 0 points")`.
- 786–786: `assert.equal(podium.children.some((c) => c.children[1].textContent === player.code), false)`.
- 788–788: `assert.equal(rows[0].children.find((c) => c.classList.contains("res-pts")).textContent, '${points[0]} pts')`.
- 789–789: `assert.equal(rows[2].children.find((c) => c.classList.contains("res-pts")).textContent, '${points[2]} pts')`.

### an UNFINISHED car on the lead lap reads no "+1 LAP"; a genuinely lapped car still does

Case 793–814.
Exercised target: GameResults / results-story.
- 809–809: `assert.equal(names[0], "WIN Winner")`.
- 810–810: `assert.equal(names[1], "RUN Running")`.
- 811–811: `assert.equal(names[2], "FLG Flagged (+1 LAP)")`.
- 812–812: `assert.equal(names[3], "LAP Lapped (+1 LAP)")`.
- 813–813: `assert.equal(names[4], "TWO Twice (+2 LAPS)")`.

### a winner who never took the flag discounts BOTH sides alike (bug-hunt 5.4)

Case 816–833.
Exercised target: GameResults / results-story.
- 830–830: `assert.equal(names[1], "RUN Running")`.
- 831–831: `assert.equal(names[2], "LAP Lapped (+1 LAP)")`.
- 832–832: `assert.equal(names[3], "TWO Twice (+2 LAPS)")`.

### RESULTS: your row keeps its lime ink and OPAQUE sticky ground on the podium

Case 835–877.
Exercised target: results CSS.
- 863–863: `assert.match(youBg, /var\(--surf-1\)/)`.
- 866–866: `assert.equal(winner(row, "color").value, "var(--you)")`.
- 868–868: `assert.equal(bg.value, youBg)`.
- 869–869: `assert.doesNotMatch(bg.value, /transparent/)`.
- 870–870: `assert.match(winner(row, "border-left").value, new RegExp('var\\(${METAL[p]}\\)'))`.
- 871–871: `assert.equal(winner(row, "color", ".res-pos").value, 'var(${METAL[p]})')`.
- 873–873: `assert.equal(winner(["res-row", p], "color").value, 'var(${METAL[p]})')`.
- 874–874: `assert.equal(winner(["res-row", p], "color", ".res-pos").value, 'var(${METAL[p]})')`.
- 876–876: `assert.match(winner(["res-row", "you"], "border-left").value, /var\(--you\)/)`.

### CONSTRUCTORS ties break like Career.teamStandings (points, then tier), not by insertion order

Case 879–888.
Exercised target: GameResults / results-story.
- 887–887: `assert.deepEqual(teams, ["BLUE", "RED"])`.

### the TIME TRIAL sheet prints YOUR BEST and the board to the thousandth

Case 893–904.
Exercised target: GameResults / results-story.
- 903–903: `assert.deepEqual(pts, ["1:21.163", "1:21.163", "1:21.167"])`.

### SettingRow wrap:false clamps the LAPS chevrons at the ends

Case 906–934.
Exercised target: SettingRow.
- 922–922: `assert.equal(built.prev.disabled, true)`.
- 924–924: `assert.equal(laps, 3)`.
- 926–926: `assert.equal(laps, 5)`.
- 928–928: `assert.equal(laps, 57)`.
- 929–929: `assert.equal(built.next.disabled, true)`.
- 931–931: `assert.equal(laps, 57)`.
- 933–933: `assert.equal(laps, 5)`.

### results next-button label is pinned by mode: WATCH AGAIN for a watched real race, RACE AGAIN for a driven one

Case 937–948.
Exercised target: GameResults / results-story.
- 941–941: `assert.equal(driven.els.resNext.textContent, "RACE AGAIN")`.
- 944–944: `assert.equal(watched.els.resNext.textContent, "WATCH AGAIN")`.
- 947–947: `assert.equal(raced.els.resNext.textContent, "RACE AGAIN")`.

### friend-race results are honest: RACE AGAIN (SOLO), a NEW FRIEND ROOM door, and a hint that the room closed

Case 951–965.
Exercised target: GameResults / results-story.
- 955–955: `assert.equal(friend.els.resNext.textContent, "RACE AGAIN (SOLO)")`.
- 956–956: `assert.equal(friend.els.resMenu.textContent, "NEW FRIEND ROOM")`.
- 958–958: `assert.ok(hint, "the sheet says the room is gone")`.
- 959–959: `assert.match(hint.children[0].textContent, /VS FRIEND/)`.
- 962–962: `assert.equal(solo.els.resNext.textContent, "RACE AGAIN")`.
- 963–963: `assert.equal(solo.els.resMenu.textContent, "MENU")`.
- 964–964: `assert.equal(solo.els.resultsTable.children.find((c) => c.getAttribute("data-results-part") === "room"), undefined)`.

### friend-race labels do not outlive the race: the next solo build restores MENU

Case 967–978.
Exercised target: GameResults / results-story.
- 972–972: `assert.equal(h.els.resMenu.textContent, "NEW FRIEND ROOM")`.
- 975–975: `assert.equal(h.els.resMenu.textContent, "MENU")`.
- 977–977: `assert.match(read("js/ui/results-sheet.js"), /function buildTTResults\(\) \{[\s\S]{0,400}resMenu\.textContent = "MENU"/)`.

### RESULTS scrolls .res-row.you into view when the sheet builds

Case 980–993.
Exercised target: GameResults / results-story.
- 991–992: `assert.ok(scrolls.some((s) => /\byou\b/.test(s.className)), "the player row must scrollIntoView on open (sticky alone leaves it below the fold)")`.

### RESULTS name clamps to two lines and drops pts on narrow before ellipsis

Case 995–1000.
Exercised target: results CSS.
- 997–997: `assert.match(css, /\.res-name \{[^}]*-webkit-line-clamp:\s*2/s)`.
- 998–999: `assert.match(css, /body\[data-width="narrow"\] #results-table > \.res-row > \.res-pos ~ \.res-pts \{ display: none; \}/)`.

### finishRace does not stamp the go() 0.5s floor as official winner elapsed

Case 1002–1008.
Exercised target: agent finishRace source.
- 1006–1006: `assert.match(apex, /clock = ran > 0\.5 \? ran : 0/)`.
- 1007–1007: `assert.match(apex, /c\.finishT = clock/)`.

### classification and championship lists are named and separate from result stories

Case 1011–1024.
Exercised target: GameResults / results-story.
- 1015–1015: `assert.deepEqual(lists.map(e => e.getAttribute("aria-label")), ["Race classification", "Driver standings", "Constructor standings"])`.
- 1017–1017: `assert.equal(row.getAttribute("role"), "listitem")`.
- 1018–1018: `assert.equal(row.children.find(e => e.classList.contains("res-swatch")).getAttribute("aria-hidden"), "true")`.
- 1020–1020: `assert.equal(lists[0].children.length, cars.length)`.
- 1021–1021: `assert.ok(h.els.resultsTable.children.find(e => e.getAttribute("data-results-part") === "story"))`.
- 1023–1023: `assert.deepEqual(h.dom.byId("standings-body").children.filter(e => e.getAttribute("role") === "list").map(e => e.getAttribute("aria-label")), ["Driver standings", "Constructor standings"])`.

### tyre stint details expose the same compound names and completed ranges as the strip

Case 1026–1040.
Exercised target: GameResults / results-story.
- 1034–1034: `assert.equal(details().tagName, "DETAILS")`.
- 1034–1034: `assert.equal(details().children[0].tagName, "SUMMARY")`.
- 1035–1035: `assert.equal(details().children[1].textContent, "Soft — completed laps 0-8; Medium — completed laps 8-20")`.
- 1036–1036: `assert.equal(strip().getAttribute("aria-label"), "Tyre stints: " + details().children[1].textContent)`.
- 1038–1038: `assert.equal(strip().children[0].style.flex, "1")`.
- 1038–1038: `assert.match(details().children[1].textContent, /0-0/)`.
- 1039–1039: `assert.equal(strip(), undefined)`.
- 1039–1039: `assert.equal(details(), undefined)`.

### career settlement displays final sponsor target, MET/MISSED and reason without changing legacy payouts

Case 1043–1061.
Exercised target: GameResults / results-story.
- 1055–1055: `assert.ok(missed.includes("Sponsor target — " + target + " | MISSED · Target missed"))`.
- 1056–1056: `assert.equal(missed.some(text => text.startsWith("Sponsor bonus")), false)`.
- 1058–1058: `assert.ok(met.includes("Sponsor target — " + target + " | MET · Target met"))`.
- 1059–1059: `assert.equal(met.filter(text => text === "Sponsor bonus | +125 cr").length, 1)`.
- 1060–1060: `assert.deepEqual(build(null), build(undefined))`.


## `tests/unit/uilayers-modal-order.test.mjs`

Targets: `js/ui/layers.js` (`UiLayers.top`, `anyOpen`, `navOpen`, `trackDialog`); `js/ui/modal.js` (`TopModal.onEscape`, `wire`, `wireLayer`); `js/ui/menu-nav.js`; `index.html`, `css/photo-studio.css`, `css/hud.css`.

Fixtures and setup: `fakeDom` 16–54 provides hidden/box/z-index/native-modal state, tracks wrappers and explicitly invokes showModal in chosen order. `escHarness` 168–199 supplies a Data Hub, nested popup, close button and synthetic Escape. `isolationHarness` 332–371 models inert-aware focus restoration and observer callbacks; other cases construct local close-event and disabled-door fixtures.

Limits: DOM query returns authored order, native close/cancel timing and focus are manually simulated. Source pins for focusin and measurement-cache release can reject harmless rewrites; they do not execute those handlers.

### the LAST-SHOWN dialog is top, even when it comes first in the DOM

Case 56–65.
- 63–64: `assert.equal(U.top().id, "pmsettings")`.

### DOM order still answers when it agrees with open order

Case 67–73.
- 72–72: `assert.equal(U.top().id, "teampicker")`.

### any modal outranks any z-index, and hidden layers never rank

Case 75–81.
- 80–80: `assert.equal(U.top().id, "teampicker")`.

### a zero-box modal still outranks the sized screen behind it

Case 83–97.
- 95–96: `assert.equal(U.top().id, "standings")`.

### with no dialogs open the z-index ranking is unchanged

Case 99–102.
- 101–101: `assert.equal(U.top().id, "select")`.

### #loading is a gated UiLayers entry: anyOpen while the plate is up

Case 104–115.
- 111–111: `assert.equal(U.top().id, "loading")`.
- 112–112: `assert.equal(U.anyOpen(), true)`.
- 114–114: `assert.equal(U.anyOpen(), false)`.

### navOpen: no querySelectorAll when nothing is open (it runs every frame for a pad player)

Case 117–134.
- 122–122: `assert.equal(U.navOpen(), false)`.
- 123–123: `assert.equal(scans, 0)`.
- 125–125: `assert.equal(U.navOpen(), true)`.
- 128–128: `assert.equal(U.navOpen(), true)`.
- 132–132: `assert.equal(U.navOpen(), true)`.
- 133–133: `assert.equal(scans, 0)`.

### Photo Studio owns focus and Escape above its borrowed fly-camera controls

Case 136–146.
- 140–140: `assert.ok(match, id + " has a stacking level")`.
- 145–145: `assert.equal(fakeDom(layers, []).top().id, "photo-studio")`.

### topmodal does not preventDefault a non-cancelable focusin (F9)

Case 148–153.
- 150–151: `assert.doesNotMatch(src, /focusin[\s\S]{0,1200}?e\.preventDefault\(\)/)`.
- 152–152: `assert.match(src, /No preventDefault: 'focusin' is NOT cancelable/)`.

### menunav releases its per-press measurement cache (F11)

Case 155–160.
- 157–158: `assert.match(src, /try \{ navKey\(e\); \} finally \{ _boxes = null; \}/)`.
- 159–159: `assert.match(src, /_boxes = new Map\(\);/)`.

### Escape over the telemetry popup leaves the Data Hub open (the popup's cancel runs)

Case 201–207.
- 204–204: `assert.equal(h.clicks(), 0)`.
- 205–205: `assert.equal(e.defaultPrevented, false)`.
- 206–206: `assert.equal(e.stopped, false)`.

### Escape on the Data Hub itself still presses its door

Case 209–214.
- 212–212: `assert.equal(h.clicks(), 1)`.
- 213–213: `assert.equal(e.defaultPrevented, true)`.

### Escape with a disabled data-esc-close door still consumes the key

Case 216–246.
- 243–243: `assert.equal(clicks, 0)`.
- 244–244: `assert.equal(e.defaultPrevented, true)`.
- 245–245: `assert.equal(e.stopped, true)`.

### a close event arriving after the screen reopened does not press its door

Case 253–282.
- 273–273: `assert.ok(listeners.close, "the close listener is wired")`.
- 277–277: `assert.equal(clicks, 0)`.
- 281–281: `assert.equal(clicks, 1)`.

### a :modal dialog that bypassed the showModal wrapper still outranks an earlier tracked one

Case 284–292.
- 290–291: `assert.equal(U.top().id, "standings")`.

### a zero-box :modal still ranks above a sized screen behind it

Case 294–301.
- 299–300: `assert.equal(U.top().id, "standings")`.

### close and reopen moves a dialog above the previously latest opening

Case 303–311.
- 305–305: `assert.equal(U.top().id, "teampicker")`.
- 308–308: `assert.equal(U.top().id, "pmsettings")`.
- 310–310: `assert.equal(U.top().id, "pmsettings")`.

### a repeated (held) Escape reaches no door and is consumed

Case 317–326.
- 320–320: `assert.equal(h.clicks(), 1)`.
- 321–321: `assert.equal(first.defaultPrevented, true)`.
- 323–323: `assert.equal(h.clicks(), 1)`.
- 324–324: `assert.equal(again.defaultPrevented, true)`.
- 325–325: `assert.equal(again.stopped, true)`.

### closing a dialog lifts #overlay's inert BEFORE close(), so focus returns to the opener

Case 373–385.
- 378–378: `assert.equal(h.layer.open, true)`.
- 379–379: `assert.equal(h.overlay.inert, true)`.
- 380–380: `assert.equal(h.doc.activeElement, h.inner)`.
- 382–382: `assert.equal(h.layer.open, false)`.
- 383–383: `assert.equal(h.overlay.inert, false)`.
- 384–384: `assert.equal(h.doc.activeElement, h.opener)`.

### hiding a non-dialog layer lifts #overlay's inert BEFORE refocusing the opener

Case 387–397.
- 392–392: `assert.equal(h.doc.activeElement, h.inner)`.
- 393–393: `assert.equal(h.overlay.inert, true)`.
- 395–395: `assert.equal(h.overlay.inert, false)`.
- 396–396: `assert.equal(h.doc.activeElement, h.opener)`.

### a dynamic nested modal owns navigation until it closes, then the hub resumes

Case 399–404.
- 401–401: `assert.equal(U.top().id, "telemetry-popup")`.
- 403–403: `assert.equal(U.top().id, "datahub")`.

### an unsupported :modal selector retains ordinary layer ranking

Case 406–411.
- 410–410: `assert.equal(U.top().id, "datahub")`.


## `tests/unit/validation-cli.test.mjs`

Targets: `tools/ci/pick-tests.mjs`, `tools/ci/verify-change.mjs`, `tools/ci/sync-pr.mjs`; `tools/check/episode-diff.mjs`, `extract-module.mjs`, `bloat-scan.mjs`, `ratchets.mjs`; `tools/track/import-circuit-path.mjs`; `tools/lighting/preset-validation.mjs`; lighting-tuner bake/merge scripts; `tools/gen/assets.mjs`; `tools/gfx/wgx-validate.mjs`; `tools/lib/process-tree.mjs`; source-only WGX pipeline descriptors.

Fixtures and setup: Imports 11–19 expose direct functions. `cli` 22–24 spawns Node with repo cwd, 10-second timeout and 4 MiB buffer. `fixture` 25–31 creates artifact temp directories removed by t.after. `mockGame` 120–130 records headless changes and provides deterministic rollout/field/reset envelopes. Other fixtures include fake git executable/log, temporary extraction source and empty GeoJSON, lighting snapshots, handcrafted HDR/PNG/material manifests, mutated shader text, injected stage runners, and a real child/grandchild timeout fixture.

Limits: These cases mix direct pure calls, source checks, injected runners and real short CLI/process tests when executed; this mapping executed none. Mock episode results do not establish game determinism. WGX source validation does not establish hardware support. Asset cases cover synthetic images/manifests.

### selection receipts retain uncovered config in a mixed change and route skill-only changes

Case 33–43.
Exercised target: `selectionReceipt`.
- 36–36: `assert.equal(mixed.reason, "partial")`.
- 37–37: `assert.deepEqual(mixed.unclaimed, ["playwright.config.js"])`.
- 38–38: `assert.deepEqual(mixed.receipts.map((r) => r.claimed), [true, false])`.
- 40–40: `assert.equal(skill.reason, "matched")`.
- 41–41: `assert.ok(skill.receipts.every((r) => r.groups.includes("tooling-fast")))`.
- 42–42: `assert.equal(selectionReceipt(["docs/DEBUG-HOOKS.md"], {}).reason, "unmatched")`.

### selector and verifier reject typo and missing-value flags before diff selection

Case 45–58.
Exercised target: `validateSelectionArgs; pick-tests and verify-change CLI`.
- 47–47: `assert.throws(() => validateSelectionArgs(args), /Unknown|requires/)`.
- 50–50: `assert.equal(result.status, 2)`.
- 51–51: `assert.match(result.stderr, /Unknown|requires/)`.
- 55–55: `assert.equal(plan.status, 0)`.
- 56–56: `assert.equal(JSON.parse(plan.stdout).selection, "partial")`.
- 57–57: `assert.deepEqual(JSON.parse(plan.stdout).unclaimed, ["playwright.config.js"])`.

### sync plan only reads cached refs, and does not invent conflict evidence

Case 60–70.
Exercised target: `cachedPlan`.
- 66–66: `assert.ok(calls.every((args) => ["rev-parse", "merge-base", "log"].includes(args[0])))`.
- 67–67: `assert.equal(plan.source, "cached-remote-refs")`.
- 68–68: `assert.equal(plan.conflictsChecked, false)`.
- 69–69: `assert.equal(plan.conflicts, null)`.

### sync-pr's failure path aborts a merge in progress, checks the checkout, and says where the tree is

Case 72–100.
Exercised target: `returnTo`.
- 93–93: `assert.ok(a.calls.includes("merge --abort"), "a merge in progress is aborted before the checkout")`.
- 94–94: `assert.equal(r1.ok, true)`.
- 95–95: `assert.match(r1.line, /back on claude\/x; the attempt is kept on branch sync-pr-x/)`.
- 98–98: `assert.equal(r2.ok, false)`.
- 99–99: `assert.match(r2.line, /could NOT return to claude\/x .*the working tree is on sync-pr-x/)`.

### sync --plan CLI never fetches or changes branches

Case 102–118.
Exercised target: `sync-pr --plan CLI`.
- 114–114: `assert.equal(result.status, 0)`.
- 115–115: `assert.equal(JSON.parse(result.stdout).source, "cached-remote-refs")`.
- 117–117: `assert.deepEqual(calls.map((args) => args[0]), ["rev-parse", "rev-parse", "merge-base", "log"])`.

### episode requests validate numeric bounds before boot or headless mutation

Case 132–141.
Exercised target: `episodeLeaks; episode-diff CLI`.
- 135–135: `assert.rejects(episodeLeaks({ ...opts, game }), /seconds|episodes|seed/)`.
- 136–136: `assert.deepEqual(game.headless, [])`.
- 139–139: `assert.equal(result.status, 1)`.
- 140–140: `assert.equal(JSON.parse(result.stdout).ok, false)`.

### episode evidence checks rollout envelopes, finite digest and field count; restores headless on errors

Case 143–156.
Exercised target: `episodeLeaks`.
- 146–146: `assert.rejects(episodeLeaks({ game }), /Rollout/)`.
- 147–147: `assert.deepEqual(game.headless, [true, false])`.
- 150–150: `assert.rejects(episodeLeaks({ game }), /Field/)`.
- 151–151: `assert.deepEqual(game.headless, [true, false])`.
- 153–153: `assert.equal(valid.digestsMatch, true)`.
- 154–154: `assert.equal(valid.episodesChecked, 3)`.
- 155–155: `assert.equal(valid.carsChecked, 1)`.

### episode rejects an empty or changing car field and a failed reset

Case 158–165.
Exercised target: `episodeLeaks`.
- 160–160: `assert.rejects(episodeLeaks({ game: empty }), /empty field/)`.
- 163–163: `assert.rejects(episodeLeaks({ game: changed }), /Car count/)`.
- 164–164: `assert.rejects(episodeLeaks({ game: mockGame({ reset: () => false }) }), /reset failed/)`.

### extraction rejects nonnumeric, reversed, oversized and empty ranges

Case 167–179.
Exercised target: `extract-module CLI`.
- 172–172: `assert.equal(result.status, 1)`.
- 173–173: `assert.match(result.stderr, /range|no source/)`.
- 176–176: `assert.equal(valid.status, 0)`.
- 177–177: `assert.match(valid.stdout, /external/)`.
- 178–178: `assert.match(valid.stdout, /offset/)`.

### bloat scan reports missing explicit scopes alongside successfully scanned files

Case 181–196.
Exercised target: `bloat-scan CLI`.
- 184–184: `assert.equal(result.status, 1)`.
- 186–186: `assert.equal(report.ok, false)`.
- 187–187: `assert.deepEqual(report.coverage.missing, [missing])`.
- 188–188: `assert.ok(report.coverage.scanned.includes("tools/check/extract-module.mjs"))`.
- 191–191: `assert.equal(emptyResult.status, 1)`.
- 192–192: `assert.equal(JSON.parse(emptyResult.stdout).coverage.emptyScopes.length, 1)`.
- 194–194: `assert.equal(absolute.status, 0)`.
- 195–195: `assert.ok(JSON.parse(absolute.stdout).coverage.scanned.includes("tools/check/extract-module.mjs"))`.

### ratchet preview is read-only, lower-only receipt exposes skipped raises

Case 198–207.
Exercised target: `update / updateReceipt / DATA`.
- 202–202: `assert.deepEqual(fs.readFileSync(DATA), before)`.
- 203–203: `assert.equal(data.files["tools/check/extract-module.mjs"].lines, 1)`.
- 205–205: `assert.equal(receipt.skippedRaises.length, 1)`.
- 206–206: `assert.deepEqual(receipt.changes.map((r) => r.file), ["smaller"])`.

### importer imports without fetching, and help/invalid options are validated before fetching

Case 209–221.
Exercised target: `import-circuit-path main / project`.
- 214–214: `assert.equal(await importMain(["--help"]), 0)`.
- 216–216: `assert.rejects(importMain(args), /Unknown|requires|Unsupported|Expected|Pass/)`.
- 217–217: `assert.equal(calls, 0)`.
- 219–219: `assert.throws(() => project([]), /coordinates/)`.
- 220–220: `assert.throws(() => project([[1, 2], [NaN, 3], [4, 5]]), /coordinates/)`.

### self-check error ignores a constant shift and a differing vertex count

Case 223–233.
Exercised target: `meanError`.
- 226–226: `assert.ok(meanError(ring, shifted).err < 0.01)`.
- 229–229: `assert.ok(meanError(ring, extra).err < 0.01)`.
- 232–232: `assert.ok(meanError(ring, moved).err > 5)`.

### importer does not claim success when source has no requested circuit coverage

Case 235–245.
Exercised target: `import-circuit-path self-check CLI`.
- 239–239: `assert.equal(result.status, 1)`.
- 241–241: `assert.equal(report.ok, false)`.
- 242–242: `assert.equal(report.requested, 1)`.
- 243–243: `assert.equal(report.checked, 0)`.
- 244–244: `assert.equal(report.skipped.length, 1)`.

### lighting snapshots share exact profile/knob/range/grid validation

Case 247–252.
Exercised target: `validatePresets / presetChanges`.
- 248–248: `assert.deepEqual(validatePresets({ "monza|night|wet": { keyMul: 1.005 }, "*|dusk": { keyMul: 1 }, "*|dawn|dry": { ambientMul: 0.5 }, "custom-1234abcd|day|dry": { keyMul: 1 } }), [])`.
- 250–250: `assert.ok(validatePresets(obj).length > 0)`.
- 251–251: `assert.deepEqual(presetChanges({ z: { keyMul: 1 }, a: { keyMul: 1 } }, { a: { keyMul: 2 }, b: {} }), { added: ["b"], deleted: ["z"], changed: ["a"] })`.

### lighting check mode reports actual snapshot/delta changes without writing shipped presets

Case 254–288.
Exercised target: `lighting-tuner bake and merge-proposals CLI; shipped preset bytes`.
- 261–261: `assert.equal(result.status, 0)`.
- 263–263: `assert.equal(report.mode, "check")`.
- 265–265: `assert.deepEqual(report.changes, { added: [], deleted: [], changed: ["monza|night|wet"] })`.
- 268–268: `assert.deepEqual([report.changes.added, report.changes.changed], [[], ["*"]])`.
- 269–269: `assert.ok(report.changes.deleted.includes("monza|night|wet"), "bake reports shipped profiles it would delete")`.
- 270–270: `assert.equal(report.profiles, 1)`.
- 273–273: `assert.deepEqual(fs.readFileSync(path.join(ROOT, "js/lighting/presets.js")), before)`.
- 276–276: `assert.equal(bad.status, 1)`.
- 277–277: `assert.ok(bad.stderr.includes(path.relative(ROOT, edits)), "diagnostic retains the input path")`.
- 284–284: `assert.equal(wet.status, 1)`.
- 285–285: `assert.match(wet.stderr, /wetness must not be baked/)`.
- 287–287: `assert.deepEqual(fs.readFileSync(path.join(ROOT, "js/lighting/presets.js")), before)`.

### HDR sampler preserves valid run/literal and flat scanlines

Case 290–306.
Exercised target: `sampleRadianceHdr`.
- 299–299: `assert.ok(Math.abs(result.sky[c] - sky[c] * 2 / 255) < 1e-12)`.
- 300–300: `assert.ok(Math.abs(result.ground[c] - ground[c] / 255) < 1e-12)`.
- 302–302: `assert.equal(result.height, 2)`.
- 304–304: `assert.equal(rle.width, 8)`.
- 305–305: `assert.equal(flat.width, 2)`.

### HDR sampler rejects zero, truncated and overrunning RLE packets

Case 308–321.
Exercised target: `sampleRadianceHdr`.
- 320–320: `assert.throws(() => sampleRadianceHdr(image(payload)), error)`.

### material PNG decoder rejects damaged signature, CRC and truncated image data

Case 323–331.
Exercised target: `encodePNG / decodePNG`.
- 325–325: `assert.equal(decodePNG(png).h, 34)`.
- 327–327: `assert.throws(() => decodePNG(signature), /signature/)`.
- 329–329: `assert.throws(() => decodePNG(crc), /CRC/)`.
- 330–330: `assert.throws(() => decodePNG(png.subarray(0, png.length - 4)), /truncated|IEND/)`.

### asset verifier checks material bytes, shape and low-tier licensing/identity

Case 333–364.
Exercised target: `assets verify CLI with APEX_PACK_DIR`.
- 348–348: `assert.equal(verify().status, 0)`.
- 351–351: `assert.equal(bad.status, 1)`.
- 352–352: `assert.ok(/md5 missing/.test(bad.stderr + bad.stdout), bad.stderr + bad.stdout)`.
- 355–355: `assert.equal(bad.status, 1)`.
- 355–355: `assert.match(bad.stderr, /materials.low.*licence/)`.
- 358–358: `assert.equal(bad.status, 1)`.
- 358–358: `assert.match(bad.stderr, /PNG/)`.
- 360–360: `assert.equal(bad.status, 1)`.
- 360–360: `assert.match(bad.stderr, /shape/)`.
- 363–363: `assert.equal(bad.status, 1)`.
- 363–363: `assert.match(bad.stderr, /match high tier/)`.

### WGX sky gate requires both descriptors and exact comparison/write state

Case 366–378.
Exercised target: `skyDepthErrors; authored WGX source descriptors`.
- 368–368: `assert.deepEqual(skyDepthErrors(source), [])`.
- 373–373: `assert.ok(skyDepthErrors(changed).some((e) => e.startsWith(name)), '${name} ${to} must fail')`.
- 375–375: `assert.ok(skyDepthErrors(source.replace('${name} = device.createRenderPipeline', '${name} = device.notAPipeline')).length > 0)`.
- 377–377: `assert.ok(skyDepthErrors("// skyPipeline depthCompare: less-equal depthWriteEnabled: false").length > 0)`.

### WGX diagnostic invokes lastFailure and serializes the returned record

Case 380–390.
Exercised target: `wgx-validate diagnostic expression`.
- 383–383: `assert.ok(expression, "page diagnostic must collect lastFailure")`.
- 387–387: `assert.equal(calls, 1)`.
- 388–388: `assert.deepEqual(JSON.parse(record), { lastFailure: { reason: "adapter denied", at: 42 } })`.
- 389–389: `assert.match(source, /lastFailure: state\.lastFailure/)`.

### #2186: sync-pr's fast verify of a docs-only diff skips the VM suites, runs tooling-fast --jobs=3, and times every stage

Case 394–408.
Exercised target: `verifyStages / VERIFY_MODES`.
- 398–398: `assert.deepEqual(fast[0].args, ["tools/ci/tooling-fast.mjs", "--changed", "--jobs=3"])`.
- 399–399: `assert.ok(!names.some((n) => /^test:game-vm-/.test(n)), names.join(" "))`.
- 400–400: `assert.ok(names.includes("test:net-unit"), "a cheap unscoped suite still runs")`.
- 401–401: `assert.ok(st.timeoutMs > 0 && st.timeoutMs <= 20 * 60e3, '${st.name} has a timeout inside the 30-min ceiling')`.
- 403–403: `assert.deepEqual(full.map((s) => s.name), ["tooling-fast", ...suites, "verify-track:spa"])`.
- 404–404: `assert.deepEqual(full[0].args, ["tools/ci/tooling-fast.mjs", "--jobs=3"])`.
- 405–405: `assert.deepEqual(verifyStages({ verify: "fast", changed: null, circuits: [], suites }).map((s) => s.name), ["tooling-fast", ...suites])`.
- 406–406: `assert.deepEqual(verifyStages({ verify: "none", changed: [], circuits: [], suites }), [])`.
- 407–407: `assert.deepEqual(VERIFY_MODES, ["none", "fast", "full"])`.

### #2186: runStages stops at the first failure or timeout, names the stage, and resumes from it

Case 410–421.
Exercised target: `runStages`.
- 414–414: `assert.deepEqual(ran, ["a", "b"])`.
- 415–415: `assert.deepEqual({ ok: r.ok, failedAt: r.failedAt }, { ok: false, failedAt: "b" })`.
- 416–416: `assert.match(r.error, /b timed out after 1 min/)`.
- 418–418: `assert.equal(runStages(stages, { from: "b", run: (st) => { again.push(st.name); return 0; } }).ok, true)`.
- 419–419: `assert.deepEqual(again, ["b", "c"])`.
- 420–420: `assert.match(runStages(stages, { from: "zz", run: () => 0 }).error, /no stage named zz/)`.

### a stage timeout stops the stage with SIGTERM, so a runner that leads its own process groups can terminate them

Case 423–455.
Exercised target: `runStage / processAlive`.
- 442–442: `assert.equal(code, 124)`.
- 444–444: `assert.ok(gcPid > 0)`.
- 450–450: `assert.equal(alive(), false)`.


## `tests/unit/vegas-day-strip.test.mjs`

Targets: `js/circuits/scenery/vegas.js` source text: desert count/radius, casino palette, Sphere, Bellagio and Paris sign authored geometry.

Fixtures and setup: Single read-only source fixture at line 14; local `meanRgb` 16–18 and `has` 20–22; numeric regex extraction and bounded landmark sections.

Limits: Static authoring pins only; no scenery build, camera, day lighting, raster or landmark recognition evidence.

### vegas day Strip: desert hinterland is sparse (#3363)

Case 24–29.
- 26–26: `assert.ok(m, "desertN is authored")`.
- 27–27: `assert.ok(Number(m[1]) <= 14, 'desertN=${m[1]} must stay ≤ 14 so sand does not own the day orbit')`.
- 28–28: `assert.equal(has(SRC, "trad + 680"), true)`.

### vegas day Strip: signature casino towers use cream hotel walls (#3363)

Case 31–43.
- 32–32: `assert.equal(has(SRC, "casinoDayWall"), true)`.
- 34–34: `assert.ok(block, "casinoDayWall array present")`.
- 37–37: `assert.equal(colors.length, 8)`.
- 39–39: `assert.ok(meanRgb(c) >= 0.52, 'tower wall ${c} mean ${meanRgb(c).toFixed(2)} must read as hotel cream by day')`.
- 41–42: `assert.equal(/wall: \[0\.22, 0\.20, 0\.22\]/.test(SRC), false)`.

### vegas day Strip: Sphere has day panel contrast + meridian ribs (#3363)

Case 45–51.
- 47–47: `assert.equal(has(sphere, "Meridian ribs"), true)`.
- 48–48: `assert.equal(has(sphere, "for (let m = 0; m < 12; m++)"), true)`.
- 49–49: `assert.equal(has(sphere, "SPHERE = [0.10, 0.28, 0.42]"), true)`.
- 50–50: `assert.equal(has(sphere, "seat.box(stage, [a.c[0], baseY, a.c[2]]"), true)`.

### vegas day Strip: Bellagio cream façade + day water jets (#3363)

Case 53–58.
- 55–55: `assert.equal(has(bel, "BEL = [0.78, 0.72, 0.60]"), true)`.
- 56–56: `assert.equal(has(bel, "Arcade colonnade"), true)`.
- 57–57: `assert.equal(has(bel, "Fountain jets — white/cyan water columns"), true)`.

### vegas day Strip: Paris Montgolfier is a plaza sign, not a sky balloon (#3363)

Case 60–67.
- 62–62: `assert.ok(start >= 0, "landmark id vegas-paris-balloon kept")`.
- 64–64: `assert.equal(has(chunk, "size: [14, 22, 14]"), true)`.
- 65–65: `assert.equal(has(chunk, "center: vadd(a.c, a.u, 9)"), true)`.
- 66–66: `assert.equal(has(SRC, "PLAZA SIGN"), true)`.


## `tests/unit/vehicle-tick-alloc.test.mjs`

Targets: `js/physics/vehicle.js`, `player-forces.js`, `wheel-state.js`, plus real mat4/constants/tyre-model/grip-steer dependencies. Main exercised path: `PlayerForces.create(G).step` passing `Vehicle.grip` / `Vehicle.wheel`.

Fixtures and setup: Lines 23–54 retain exact scratch and literal substitute hunks; `literalSource` 60–67 asserts both replacements applied. Fresh contexts 69–105 seed logging and setup/debris/input stubs, omit Vehicle only for literal comparison, then load real physics. Car/context/snapshot/constants/tyre factories 108–155 fix dt=1/60 and eighteen compared output fields. Last test uses an enabled WheelState spy.

Limits: Five steps for one authored car/input and one fixed tyre configuration establish selected-field parity, not general physics equivalence or allocation rate. WheelState allocation checks inspect text rather than count allocations; identity checks cover only supplied bags.

Shared helper assertions: `assert.notEqual` 63–63; `assert.notEqual` 65–65.

### Vehicle exports only the two scratch bags (forPlayer/stepWheel had no caller; audit4 P3)

Case 157–164.
- 161–161: `assert.deepEqual(Object.keys(V).sort(), ["grip", "wheel"])`.
- 162–162: `assert.equal(V.grip, V.grip)`.
- 163–163: `assert.notEqual(V.grip, V.wheel)`.

### WheelState.stepPlayer builds no object literal per tick (pooled axleStep bags; audit4 P2)

Case 166–171.
- 169–169: `assert.equal(/axleStep\(\s*\{/.test(body), false)`.
- 170–170: `assert.equal(/\{\s*dt\s*,/.test(body), false)`.

### player step with the scratch matches the fresh-literal path (grip steer on)

Case 173–197.
- 175–175: `assert.equal(shipped.includes("GripSteer.forPlayer(driverDelta, c, {"), false)`.
- 176–176: `assert.equal(shipped.includes("WheelState.stepPlayer(c, {"), false)`.
- 192–192: `assert.deepEqual(snap(cOn), snap(cOff))`.
- 194–194: `assert.equal(grip.dt, DT)`.
- 195–195: `assert.equal(grip.shaped, Math.pow(0.35, G.STEER_EXPO))`.
- 196–196: `assert.ok(grip.muF > 0)`.

### player step reuses the wheel bag when WheelState is on

Case 199–229.
- 224–224: `assert.equal(seen.length, 2)`.
- 225–225: `assert.equal(seen[0], wheel)`.
- 226–226: `assert.equal(seen[1], wheel)`.
- 227–227: `assert.equal(seen[1].dt, DT)`.
- 228–228: `assert.ok(Number.isFinite(c.yawRateCur))`.


## `tests/unit/vendor-licences.test.mjs`

Targets: `vendor/` package directories, each licence file and optional package.json metadata.

Fixtures and setup: Lines 9–15 derive current directories, exclude first-party three-patches, and recognize only Apache-2.0/MIT text markers.

Limits: Presence and marker consistency do not establish full licence provenance/compliance. Unrecognized SPDX identifiers and packages lacking metadata are skipped by text matching; checked>=1 is a coverage floor.

### every vendor/ package has a licence file

Case 17–22.
- 20–20: `assert.ok(files.some((f) => /^(SPDX-)?[A-Z-]*LICEN[CS]E/i.test(f)), 'vendor/${d.name}: no licence file')`.

### a declared SPDX licence matches its licence text

Case 24–38.
- 32–32: `assert.ok(f, 'vendor/${d.name}: package.json says ${spdx} but no LICENSE file')`.
- 34–34: `assert.match(text, MARKERS[spdx])`.
- 37–37: `assert.ok(checked >= 1, "rapier (Apache-2.0) must be covered")`.


## `tests/unit/verify-live.test.mjs`

Targets: `tools/ci/verify-live.mjs`: `verifyLive` and `fetchBytes`.

Fixtures and setup: Shared SRI hash helper 10 and ephemeral loopback HTTP server 12–22. Per-case temporary checkout trees and response maps contain shell/lazy bytes. Retry fixtures include 503/404 servers, injected fetch/sleep functions, wrapped/aggregate/cyclic/deep Error causes and Response objects.

Limits: Local HTTP and injected fetch establish byte comparison/retry logic; no actual deployed site/CDN is queried by these unit cases. Error-graph tests bound diagnostics, not every transport implementation.

### verifyLive checks secondary HTML, service worker, and every lazy integrity byte

Case 24–41.
- 37–37: `assert.equal(result.ok, true)`.
- 38–38: `assert.deepEqual(result.errors, [])`.
- 39–39: `assert.ok(result.checked.includes("js/core/lazy-bundles.js"))`.

### verifyLive reports a stale lazy response with exact hashes

Case 43–58.
- 53–53: `assert.equal(result.ok, false)`.
- 55–55: `assert.ok(msg.includes(sri(stale)), 'live hash named: ${msg}')`.
- 56–56: `assert.ok(msg.includes(sri(expected)), 'shell hash named: ${msg}')`.

### verifyLive flags live bytes that match the shell but differ from the checked-out commit

Case 60–73.
- 70–70: `assert.equal(result.ok, false)`.
- 71–71: `assert.deepEqual(result.errors, ["[synthetic script name]: live bytes differ from checked-out commit"])`.

### verifyLive reports live index.html bytes that differ from the checkout

Case 75–85.
- 81–81: `assert.equal(result.ok, false)`.
- 82–82: `assert.ok(result.errors.some((e) => e.startsWith("index.html: live bytes differ")), result.errors.join("\n"))`.
- 83–83: `assert.ok(result.errors.includes("index.html: missing apex-lazy-integrity"), "a shell without the lazy block is an error")`.

### verifyLive retries transient HTTP 503 then accepts the body

Case 87–118.
- 115–115: `assert.equal(result.ok, true)`.
- 116–116: `assert.ok(hits >= 3, 'expected retries, got ${hits} hits')`.

### verifyLive fails a persistent HTTP 503 after retries run out

Case 120–149.
- 145–145: `assert.equal(result.ok, false)`.
- 146–146: `assert.ok(result.errors.some((error) => /HTTP 503/.test(error)), result.errors.join("\n"))`.
- 147–147: `assert.equal(hits, retries + 1)`.

### verifyLive still fails a persistent HTTP 404 without endless retry

Case 151–181.
- 177–177: `assert.equal(result.ok, false)`.
- 178–178: `assert.ok(result.errors.some((error) => /HTTP 404/.test(error)))`.
- 179–179: `assert.equal(hits, 1)`.

### fetchBytes recovers from wrapped transport and aggregate timeouts within its retry budget

Case 187–211.
- 207–207: `assert.equal(actual.toString(), "recovered")`.
- 208–208: `assert.equal(calls, 2)`.
- 209–209: `assert.deepEqual(sleeps, [400])`.

### fetchBytes exhausts its finite budget and retains URL plus aggregate cause diagnostics

Case 213–231.
- 219–228: `assert.rejects(fetchBytes(url, { retries: 2, sleep: async (ms) => sleeps.push(ms), fetchImpl: async () => { calls++; throw failure; }, }), (error) => { assert.ok(error.message.includes(url)); assert.match(error.message, /fetch failed.*AggregateError.*all addresses failed.*UND_ERR_SOCKET.*socket closed/); assert.equal(error.cause, failure); return true; })`.
- 224–224: `assert.ok(error.message.includes(url))`.
- 225–225: `assert.match(error.message, /fetch failed.*AggregateError.*all addresses failed.*UND_ERR_SOCKET.*socket closed/)`.
- 226–226: `assert.equal(error.cause, failure)`.
- 229–229: `assert.equal(calls, 3)`.
- 230–230: `assert.deepEqual(sleeps, [400, 800])`.

### fetchBytes fails unknown, permanent and cyclic causes without treating generic fetch failures as transient

Case 233–253.
- 242–250: `assert.rejects(fetchBytes("https://example.invalid/fixture-permanent.bin", { sleep: async () => assert.fail("permanent errors must not retry"), fetchImpl: async () => { calls++; throw failure; }, }), (error) => { assert.match(error.message, /fixture-permanent\.bin/); assert.ok(error.message.length < 5000, "diagnostics must bound deep/cyclic error graphs"); if (failure.cause?.code) assert.ok(error.message.includes(failure.cause.code)); return true; })`.
- 243–243: `assert.fail("permanent errors must not retry")`.
- 246–246: `assert.match(error.message, /fixture-permanent\.bin/)`.
- 247–247: `assert.ok(error.message.length < 5000, "diagnostics must bound deep/cyclic error graphs")`.
- 248–248: `assert.ok(error.message.includes(failure.cause.code))`.
- 251–251: `assert.equal(calls, 1)`.

### verifyLive identifies the failing lazy asset and wrapped network cause while preserving byte checks

Case 255–287.
- 276–276: `assert.equal(result.ok, false)`.
- 277–277: `assert.equal(hits, mode === "network" ? 2 : 1)`.
- 278–278: `assert.ok(result.errors.every((error) => error.includes(rel)), result.errors.join("\n"))`.
- 280–280: `assert.match(result.errors[0], /https:\/\/example\.invalid\/fixture-network-lazy\.bin.*ETIMEDOUT.*connection interrupted/)`.
- 281–281: `assert.match(result.errors[0], /HTTP 404/)`.
- 283–283: `assert.ok(result.errors.some((error) => error.includes("does not match shell")))`.
- 284–284: `assert.ok(result.errors.some((error) => error.includes("live bytes differ from checked-out commit")))`.


## `tests/unit/vertex-pack.test.mjs`

Targets: `js/render/shared/vertex-pack.js`: encode constants, `pack`, `bindAttribs`, `toHalf`; `js/render/glx/shaders/glsl-lit.js` packed attribute declarations/scales; extracted TLX half encoder in `js/render/three/tlx-chunked.js`.

Fixtures and setup: VM pack loader 27–33, GLSL define extractor 38–42, typed-array roundtrip 64–79 and shader-macro mirror 179–182; independent half decoder 214–219 and adjacent-double DataView helper 270–278. Fixtures include GL pointer spy, three distinct vertices, 2,000 sampled normals, all 65,536 half bit patterns, every finite-half midpoint and 200,001 TLX colour samples.

Limits: Strong numeric/byte contracts without GPU execution. Shader decode is mirrored in JS, pointer calls are spies, GLSL is text-inspected. Sampled normals/colours are bounded coverage; exhaustive half values/midpoints do not imply a browser backend boots.

Shared helper assertions: `assert.ok` 40–40.

### the GLSL decode scales equal the JS encode scales

Case 44–54.
- 45–46: `assert.equal(glslDefine("COL_SCALE"), P.COL_SCALE)`.
- 47–48: `assert.equal(glslDefine("MAT_SCALE"), P.MAT_SCALE)`.
- 50–50: `assert.match(LIT, /layout\(location=1\) in vec4 aNrmP;/)`.
- 51–51: `assert.match(LIT, /layout\(location=2\) in vec4 aColMat;/)`.
- 52–53: `assert.doesNotMatch(LIT, /layout\(location=3\) in float aMat;/)`.

### the scales are exact divisors of 65535, so whole ids decode to themselves

Case 56–61.
- 57–57: `assert.equal(P.COL_Q, 65535 / P.COL_SCALE)`.
- 58–58: `assert.equal(P.MAT_Q, 65535 / P.MAT_SCALE)`.
- 59–59: `assert.ok(Number.isInteger(P.COL_Q), '65535 / ${P.COL_SCALE} must be a whole number')`.
- 60–60: `assert.ok(Number.isInteger(P.MAT_Q), '65535 / ${P.MAT_SCALE} must be a whole number')`.

### every material id in use decodes bit-exactly

Case 81–92.
- 87–87: `assert.equal(r.mat, id)`.
- 90–90: `assert.equal(Math.trunc(r.mat + 0.5), id)`.

### the FLAG wave weight in the fractional part survives

Case 94–102.
- 98–98: `assert.equal(Math.trunc(r.mat + 0.5), 15)`.
- 99–100: `assert.ok(Math.abs((r.mat - 15) - w) < 1 / P.MAT_Q, 'wave weight ${w} drifted to ${r.mat - 15}')`.

### colours keep emissive headroom and quantise far finer than 8 bits

Case 104–115.
- 110–111: `assert.ok(Math.abs(r.col[0] - c) <= P.COL_SCALE / 65535 / 2 + 1e-9, 'colour ${c} came back ${r.col[0]}')`.
- 113–114: `assert.ok(P.COL_SCALE / 65535 < 1 / 255, "the packed colour must be finer than the 8-bit alternative it replaces")`.

### values past the ceiling saturate rather than wrap

Case 117–127.
- 121–121: `assert.equal(hot.col[0], P.COL_SCALE)`.
- 122–122: `assert.equal(hot.col[1], 0)`.
- 123–123: `assert.equal(hot.mat, P.MAT_SCALE)`.
- 125–126: `assert.ok(Math.abs(n.nrm[0] - 1) < 1e-4 && Math.abs(n.nrm[1] + 1) < 1e-4, "a denormalised normal clamps to ±1 instead of wrapping the signed short")`.

### normals quantise to well under a tenth of a degree

Case 129–142.
- 141–141: `assert.ok(worst < 0.01, 'worst normal error ${worst.toFixed(4)}° is too coarse')`.

### the stride and the field offsets are the ones bindAttribs points at

Case 144–175.
- 145–145: `assert.equal(P.STRIDE, 28)`.
- 146–146: `assert.equal(P.STRIDE_TRK, 40)`.
- 147–147: `assert.equal(roundTrip([1, 2, 3], [0, 1, 0], [1, 1, 1], 0).bytes, 28)`.
- 149–149: `assert.equal(withTrk.bytes, 40)`.
- 150–150: `assert.deepEqual(withTrk.pos, [1, 2, 3])`.
- 151–152: `assert.deepEqual(withTrk.trk, [1234.5, -2.25, 6])`.
- 164–164: `assert.deepEqual(calls.map((c) => c.idx), [0, 1, 2])`.
- 167–167: `assert.equal(c.offset % width[c.type], 0)`.
- 168–168: `assert.equal(c.stride, P.STRIDE)`.
- 172–172: `assert.deepEqual(calls.map((c) => c.idx), [0, 1, 2, 4])`.
- 173–173: `assert.equal(calls[3].offset, 28)`.
- 174–174: `assert.equal(c.stride, P.STRIDE_TRK)`.

### a multi-vertex buffer decodes every vertex at its own stride (T5-20)

Case 184–209.
- 196–196: `assert.equal(buf.byteLength, 3 * stride)`.
- 201–201: `assert.deepEqual([f32[fo], f32[fo + 1], f32[fo + 2]], pos.slice(p, p + 3))`.
- 202–202: `assert.ok(Math.abs(i16[so + 6 + k] / 32767 - nrm[p + k]) < 1e-4, '${tag} normal ${k}')`.
- 204–204: `assert.ok(Math.abs(d.col[k] - col[p + k]) <= P.COL_SCALE / 65535 / 2 + 1e-9, '${tag} colour ${k}: ${d.col[k]} vs ${col[p + k]}')`.
- 205–205: `assert.ok(Math.abs(d.mat - mat[v]) <= P.MAT_SCALE / 65535, '${tag} material ${d.mat} vs ${mat[v]}')`.
- 206–206: `assert.deepEqual([f32[fo + 7], f32[fo + 8], f32[fo + 9]], trk.slice(p, p + 3))`.

### toHalf round-trips every whole number a material id can be

Case 221–226.
- 224–224: `assert.equal(decodeHalf(P.toHalf(i)), i)`.

### toHalf is unbiased, which a truncating encoder is not

Case 228–243.
- 240–240: `assert.ok(Math.abs(bias / n) < 1e-7, 'mean signed bias ${bias / n} — is this truncating?')`.
- 242–242: `assert.ok(worst <= 1 / 2048 + 1e-9, 'worst relative error ${worst} exceeds the format')`.

### toHalf handles the edges rather than wrapping them

Case 245–256.
- 246–246: `assert.equal(decodeHalf(P.toHalf(0)), 0)`.
- 247–247: `assert.equal(decodeHalf(P.toHalf(-1)), -1)`.
- 248–248: `assert.equal(decodeHalf(P.toHalf(65504)), 65504)`.
- 249–249: `assert.equal(decodeHalf(P.toHalf(1e9)), Infinity)`.
- 250–250: `assert.equal(decodeHalf(P.toHalf(-1e9)), -Infinity)`.
- 251–251: `assert.ok(Number.isNaN(decodeHalf(P.toHalf(NaN))))`.
- 253–253: `assert.ok(Math.abs(decodeHalf(P.toHalf(3.4)) - 3.4) < 1 / 2048 * 3.4)`.
- 255–255: `assert.ok(decodeHalf(P.toHalf(1e-6)) > 0)`.

### toHalf preserves every half value, signed zero, infinity and canonical NaN

Case 258–266.
- 262–262: `assert.equal(P.toHalf(value), expected)`.
- 264–264: `assert.equal(P.toHalf(Number.MIN_VALUE), 0)`.
- 265–265: `assert.equal(P.toHalf(-Number.MIN_VALUE), 0x8000)`.

### toHalf keeps magnitude-up midpoints and adjacent doubles without double rounding

Case 280–295.
- 290–290: `assert.equal(P.toHalf(sign * below), bits | h)`.
- 291–291: `assert.equal(P.toHalf(sign * midpoint), bits | (h + 1))`.
- 292–292: `assert.equal(P.toHalf(sign * above), bits | (h + 1))`.

### TLX's own half-float encoder agrees with this one, and rounds

Case 297–326.
- 309–309: `assert.ok(from > 0 && to > from, "could not find _toHalf in [synthetic script name]")`.
- 318–318: `assert.equal(tlxHalf(v), P.toHalf(v))`.
- 321–322: `assert.ok(Math.abs(bias / n) < 1e-7, 'TLX _toHalf mean signed bias ${bias / n} — it is truncating again')`.
- 324–324: `assert.equal(decodeHalf(tlxHalf(i)), i)`.

### the packed format is materially smaller than the float32 layout it replaced

Case 328–334.
- 331–331: `assert.ok(P.STRIDE <= 28, "a regression here silently gives the bytes back")`.
- 332–332: `assert.ok(P.STRIDE_TRK <= 40)`.
- 333–333: `assert.ok(P.STRIDE / 40 <= 0.7, "the world VBO saving must stay at 30 % or better")`.


## `tests/unit/viewer.test.mjs`

Targets: `tools/viewer/viewer-data.mjs`, `build-viewer.mjs`, `viewer-shots.mjs`, `tools/car/parts-sweep.mjs`; real car roster mesh builders and sampled circuit payloads.

Fixtures and setup: VM executes exact embedded carBundle and compares Ferrari geometry with loadParts; Monza/Monaco payloads; synthetic valid selection list and CLI args; optional sharp generates 10x10 solid PNG pairs in a temporary directory.

Limits: Only one team mesh is compared and selected circuits sampled. No viewer browser boot, screenshots or interactive selection. Pixel diff case explicitly skips if sharp cannot import; PNG files are removed in finally.

### the page's embedded car roster builds the same mesh the game's loader does

Case 19–42.
- 37–37: `assert.equal(page.pos.length, ref.pos.length)`.
- 38–38: `assert.deepEqual(Array.from(page.idx), Array.from(ref.idx))`.
- 39–39: `assert.ok(page.pos.every((v, i) => v === ref.pos[i]), "same positions")`.
- 40–40: `assert.ok(Liveries.forTeam(team).length > 20, "the page offers the garage's full livery list")`.
- 41–41: `assert.ok(!carBundle().match(/<\/script/i), "nothing in the bundle can close its <script>")`.

### a circuit payload keeps the built lap and a closed, sampled centreline

Case 44–53.
- 46–46: `assert.ok(D.total > 5000 && D.total < 6500, 'monza lap ${D.total} m')`.
- 48–48: `assert.equal(D[k].length, n)`.
- 49–49: `assert.ok(n >= 300 && n <= 1000, '${n} nodes')`.
- 52–52: `assert.ok(Math.abs(len - D.total) / D.total < 0.02, 'sampled loop ${len.toFixed(0)} m vs built ${D.total} m')`.

### the page carries the data intact and nothing can close its <script>

Case 55–65.
- 57–57: `assert.ok(!html.includes("/*@DATA*/null"), "marker replaced")`.
- 60–60: `assert.deepEqual(data.cars, ["haas"])`.
- 61–61: `assert.ok(html.includes("const Car3D"), "the car roster is embedded when a car is asked for")`.
- 62–62: `assert.ok(!viewerHtml({ circuits: ["monaco"] }).includes("const Car3D"), "and left out when none is")`.
- 63–63: `assert.deepEqual(Object.keys(data.circuits), ["monaco"])`.
- 64–64: `assert.ok(!json.includes("</"), "no </ inside the inline script")`.

### build-viewer: selection defaults, 'all', and refusals

Case 67–87.
- 69–69: `assert.deepEqual(resolveSelection({}, valid), { cars: ["ferrari", "haas"], circuits: DEFAULT_CIRCUITS.filter((c) => valid.circuits.includes(c)) })`.
- 70–70: `assert.deepEqual(resolveSelection({ cars: "all" }, valid), { cars: ["ferrari", "haas"], circuits: [] })`.
- 71–71: `assert.deepEqual(resolveSelection({ circuits: "imola" }, valid), { cars: [], circuits: ["imola"] })`.
- 72–72: `assert.throws(() => resolveSelection({ cars: "ferari" }, valid), /unknown team: ferari/)`.
- 73–73: `assert.throws(() => parseArgs(["--car=x"]), /unknown argument/)`.
- 74–74: `assert.deepEqual(parseArgs(["--cars=a,b", "--json"]).cars, "a,b")`.
- 75–75: `assert.equal(parseArgs(["--shots"]).shots, true)`.
- 76–76: `assert.equal(parseArgs([]).shots, false)`.
- 77–77: `assert.equal(parseArgs(["--sheet=liveries:ferrari"]).sheet, "liveries:ferrari")`.
- 78–78: `assert.equal(parseArgs(["--match=^neo_"]).match, "^neo_")`.
- 79–79: `assert.equal(parseArgs(["--frame=nose"]).frame, "nose")`.
- 80–80: `assert.deepEqual(parseSheet("bodies:haas"), { kind: "bodies", team: "haas" })`.
- 81–81: `assert.deepEqual(parseSheet("parts:aero:haas"), { kind: "parts", cat: "aero", team: "haas" })`.
- 82–82: `assert.deepEqual(parseSheet("finishes:haas"), { kind: "finishes", team: "haas" })`.
- 83–83: `assert.deepEqual(parseSheet("bodies:haas"), { kind: "bodies", team: "haas" })`.
- 84–84: `assert.throws(() => parseSheet("wheels:haas"), /unknown --sheet kind/)`.
- 85–85: `assert.throws(() => parseSheet("parts:aero"), /parts:<category>:<team>/)`.
- 86–86: `assert.ok(teamIds().includes("ferrari"))`.

### close-ups: every part category has a frame the page defines

Case 89–92.
- 91–91: `assert.match(html, new RegExp('\\b${f}:\\s*\\[\\['))`.

### close-ups: the pair diff measures pixels

Case 94–105.
- 102–102: `assert.equal(await pixelDiffPct(a, b), 0)`.
- 103–103: `assert.equal(await pixelDiffPct(a, c), 100)`.


## `tests/unit/visor-optics.test.mjs`

Targets: `js/fx/visor-optics.js`: port geometry/image, lightMap, sunFacing, lampAdapt, tintRGB, tick/stats, blendMode; `js/fx/droplets.js` clear integration; `css/hud.css` and `css/helmet-visor.css` source guards.

Fixtures and setup: `ctx2d` 19–30 is a drawing-counter stub. `load` 32–63 constructs synthetic DOM/canvas/Path2D, CSS lens tokens, cockpit options/listeners, quality and optional renderer picker/query. DAY/NIGHT scenes 65–66 and stride-15 lamp factory 69 drive projection/intensity checks. Options are isolated per fresh VM.

Limits: No actual canvas composition, SVG filter rendering or optical appearance. Camera/light fixtures establish mapping geometry and gating only. The bad-knob case title mentions a throwing canvas, but its body supplies malformed knobs and NaN sun colour, not a throwing canvas.

### visor port: a wide aperture with a clear centre on the phone, the desktop and a tall phone

Case 71–93.
- 75–75: `assert.ok(b.pw / b.ph >= 1.6, '${w}x${h}: the port is wide (${(b.pw / b.ph).toFixed(2)})')`.
- 76–76: `assert.ok(b.pw >= w * 0.9, '${w}x${h}: the port spans the width')`.
- 77–77: `assert.ok(b.x0 >= 0 && b.x1 <= w && b.y0 >= 0 && b.y1 <= h, '${w}x${h}: inside the viewport')`.
- 80–80: `assert.ok(b.y0 < h * 0.2 && b.y1 > h * 0.78, '${w}x${h}: the centre column is clear (${b.y0.toFixed(0)}..${b.y1.toFixed(0)} of ${h})')`.
- 81–81: `assert.ok(b.y0 < h * 0.4 && b.y1 > h * 0.6, '${w}x${h}: a slot across the middle (${b.y0.toFixed(0)}..${b.y1.toFixed(0)} of ${h})')`.
- 84–84: `assert.deepEqual(legs, ["M", "C", "C", "L", "C", "L", "C", "L", "C", "Z"])`.
- 87–87: `assert.ok(Math.abs(nums[1] - nums[7]) < 1 && (nums[1] - nums[3]) < b.ph * 0.08, "the brow is a shallow arch, not a dome")`.
- 88–88: `assert.ok(V.portPath(w, h, 8) !== d, "an inset changes the outline")`.
- 91–91: `assert.ok(img.startsWith('url("data:image/svg+xml,') && img.includes("fill-opacity='0.18'"), "the tint is baked into the port image")`.
- 92–92: `assert.ok(!V.portImage(844, 390).includes("rgb(80,61,32)"), "no tint for the clear visor")`.

### visor mapping: nothing is added in the dark, and every term scales with the reflections level

Case 95–113.
- 98–98: `assert.equal(dark.sun, null)`.
- 98–98: `assert.equal(dark.rim, null)`.
- 98–98: `assert.equal(dark.glints.length, 0)`.
- 99–99: `assert.ok(dark.haze < 0.01 && dark.fringe === 0, "no haze, no fringe without light")`.
- 101–101: `assert.ok(day.sun && day.sun.k > 0.1, "the sun glints by day")`.
- 102–102: `assert.ok(day.sun.y < 0 && day.sun.y >= -0.08 * 390, "a high sun glows from the top edge of the shield")`.
- 103–103: `assert.equal(day.ghost, null)`.
- 105–105: `assert.equal(far.sun, null)`.
- 106–106: `assert.ok(day.rim && day.rim.k > 0.01, "the rim catches the sun")`.
- 107–107: `assert.ok(day.haze > 0.02 && day.fringe > 0.05, "sky haze and a chromatic fringe exist by day")`.
- 109–109: `assert.ok(strong.sun.k > day.sun.k && strong.rim.k > day.rim.k && strong.fringe > day.fringe, "STRONG adds more light")`.
- 111–111: `assert.equal(off.sun, null)`.
- 111–111: `assert.equal(off.glints.length, 0)`.
- 112–112: `assert.ok(V.lightMap(DAY, 844, 390, { level: 1, fringe: 0 }).fringe === 0, "refraction OFF: no fringe")`.

### visor mapping: the sun's glint sits where the sun is and slides across as the heading turns

Case 115–135.
- 118–118: `assert.ok(Math.abs(ahead.sun.x - 422) < 1, "sun dead ahead: glint on the centre line")`.
- 119–119: `assert.ok(ahead.sun.y < 195, "a sun above the horizon glints above the centre")`.
- 121–121: `assert.ok(right.sun.x > 500, "sun to the right of the nose: glint to the right")`.
- 122–122: `assert.ok(right.ghost.x < 344, "its ghost mirrors through the centre")`.
- 123–123: `assert.ok(right.rim.dx > 0.5, "the rim sheen leans to the sun's side")`.
- 126–126: `assert.ok(Math.abs(turned.sun.x - 422) < 20, 'facing the sun recentres the glint (${turned.sun.x.toFixed(0)})')`.
- 128–128: `assert.equal(behind.sun, null)`.
- 129–129: `assert.equal(behind.rim, null)`.
- 131–131: `assert.equal(set.sun, null)`.
- 131–131: `assert.equal(set.rim, null)`.
- 133–133: `assert.ok(ahead.rays && ahead.rays.x === ahead.sun.x && ahead.rays.k > 0.05, "a sun in the frame streaks across the shield")`.
- 134–134: `assert.equal(V.lightMap(DAY, 844, 390, { level: 1 }).rays, null)`.

### visor sun-behind (A·W46): no glare from a sun behind the eye; lamps glint against the daylight they compete with

Case 137–164.
- 140–140: `assert.equal(V.sunFacing(-1), 0)`.
- 141–141: `assert.equal(V.sunFacing(-0.5), 0)`.
- 142–142: `assert.equal(V.sunFacing(0.2), 1)`.
- 142–142: `assert.equal(V.sunFacing(1), 1)`.
- 143–143: `assert.ok(V.sunFacing(0) > 0.6 && V.sunFacing(0) < 0.8, "level with the eye: most of it (it rakes the shield)")`.
- 144–144: `assert.ok(V.sunFacing(z + 0.05) >= V.sunFacing(z), "monotonic in the forward component")`.
- 149–149: `assert.equal(behind.sun, null)`.
- 149–149: `assert.equal(behind.rays, null)`.
- 149–149: `assert.equal(behind.rim, null)`.
- 152–152: `assert.ok(ahead.sun && ahead.sun.k > 1 && ahead.rays, "a low sun ahead still blinds: glint and rays kept")`.
- 154–154: `assert.equal(V.lampAdapt(0), 1)`.
- 154–154: `assert.equal(V.lampAdapt(0.14), 1)`.
- 155–155: `assert.ok(V.lampAdapt(0.95) > 0.25 && V.lampAdapt(0.95) < 0.35, 'dusk ≈ 0.3 (${V.lampAdapt(0.95).toFixed(2)})')`.
- 156–156: `assert.ok(V.lampAdapt(1.5) < V.lampAdapt(0.95), "more daylight, fainter glints")`.
- 161–161: `assert.equal(night.glints.length, 3)`.
- 163–163: `assert.ok(sum(dusk) < sum(night) * 0.4, 'dusk: the lamps no longer flood the shield (${sum(dusk).toFixed(2)} vs ${sum(night).toFixed(2)})')`.

### visor mapping: a bright flood leaves a beam along its aim; BLOOM AMOUNT and LENS GLARE scale the halos

Case 166–181.
- 170–170: `assert.ok(m.glints[0].beam && m.glints[0].beam.dy > 0.9, "the beam points down the screen, the way the fixture aims")`.
- 172–172: `assert.ok(big.glints[0].r > m.glints[0].r, "more bloom: wider halos")`.
- 175–175: `assert.ok(glare.glints[0].k > V.lightMap({ ...NIGHT, lights: soft }, 844, 390, { level: 1 }).glints[0].k, "more lens glare: brighter cores")`.
- 176–176: `assert.ok(m.glints[0].star && m.glints[0].star.len > m.glints[0].r * 2, "the brightest flood gets a star flare wider than its halo")`.
- 178–178: `assert.equal(many.glints.filter((g) => g.star).length, 3)`.
- 180–180: `assert.ok(dim.glints.length === 0 || !dim.glints[0].beam, "a weak glint carries no beam")`.

### visor beams: VISOR BEAMS scales the lamp beams, the sun's rays and the star flares, and OFF keeps the glints alone

Case 183–216.
- 190–190: `assert.ok(strong.glints[0].beam.len > med.glints[0].beam.len && med.glints[0].beam.len > light.glints[0].beam.len, "STRONG > MEDIUM > LIGHT beam length")`.
- 191–191: `assert.ok(strong.glints[0].beam.k > med.glints[0].beam.k && strong.glints[0].star.k > med.glints[0].star.k, "STRONG: brighter beams and star flares")`.
- 192–192: `assert.equal(off.glints.length, med.glints.length)`.
- 193–193: `assert.equal(off.glints[0].beam, null)`.
- 193–193: `assert.equal(off.glints[0].star, null)`.
- 194–194: `assert.ok(Math.abs(off.glints[0].k - med.glints[0].k) < 1e-9 && off.glints[0].r === med.glints[0].r, "…at the same brightness and size: beams never touch the glints")`.
- 196–196: `assert.ok(V.lightMap(sunIn, 844, 390, { level: 1, beams: V.BEAMS.strong }).rays.len > V.lightMap(sunIn, 844, 390, { level: 1, beams: V.BEAMS.medium }).rays.len, "STRONG: longer god rays")`.
- 197–197: `assert.equal(V.lightMap(sunIn, 844, 390, { level: 1, beams: 0 }).rays, null)`.
- 198–198: `assert.ok(V.lightMap(sunIn, 844, 390, { level: 1, beams: 0 }).sun.k > 0.1)`.
- 199–199: `assert.ok(V.lightMap(sunIn, 844, 390, { level: 1, beams: NaN }).rays, "a non-numeric level falls back to MEDIUM")`.
- 205–205: `assert.ok(noBeams.V.stats().paints === 1 && noBeams.V.stats().glints >= 1, "VISOR BEAMS 0 %: the glints still paint")`.
- 208–208: `assert.ok(word.V.stats().paints === 1 && word.V.stats().glints >= 1, "a level word still reads")`.
- 214–214: `assert.equal(calls.props["--visor-port"], port)`.
- 215–215: `assert.equal(live.stats().paints, 2)`.

### visor mapping: lamps glint where they project, the brightest first, capped and with tail-lights in their colour

Case 218–237.
- 222–222: `assert.ok(m.glints.length >= 3 && m.glints.length <= V.MAX_GLINTS, 'glints: ${m.glints.length}')`.
- 223–223: `assert.ok(m.glints.every((g) => g.x > -130 && g.x < 974), "every glint is on or just off the frame")`.
- 225–225: `assert.ok(left && rightG, "the pair of lamps sits either side of the nose")`.
- 226–226: `assert.ok(m.glints[i - 1].k >= m.glints[i].k, "brightest first")`.
- 228–228: `assert.ok(red, "a tail-light glints red")`.
- 229–229: `assert.ok(!m.glints.some((g) => g.y > 390), "a lamp behind the eye never glints (nothing projects below the frame)")`.
- 230–230: `assert.ok(m.glints[0].k > 0.3 && m.glints[0].k <= 1.2, 'a flood 40 m out is a clear glint (${m.glints[0].k.toFixed(2)})')`.
- 232–232: `assert.equal(dim.glints.length, 0)`.
- 234–234: `assert.ok(red.r >= m.glints[m.glints.length - 1].r, "near lamps smear wider than far ones")`.
- 236–236: `assert.equal(V.lightMap({ ...NIGHT, lights: many }, 844, 390, { level: 1 }).glints.length, V.MAX_GLINTS)`.

### visor tick: helmet cam only, the port image per size and tint, reflections OFF paints nothing

Case 239–273.
- 243–243: `assert.ok(calls.inserted && calls.inserted.id === "fx-visor", "the canvas is built beside #game")`.
- 244–244: `assert.ok(calls.attrs["data-visor-port"] === "1" && String(calls.props["--visor-port"]).startsWith('url("data:image/svg+xml,'), "the port image lands on body")`.
- 245–245: `assert.equal(calls.inserted.hidden, false)`.
- 246–246: `assert.ok(V.stats().paints >= 1 && V.stats().sun > 0, "the first tick paints (a resize paints at once)")`.
- 249–249: `assert.equal(calls.props["--visor-port"], portBefore)`.
- 250–250: `assert.ok(V.stats().paints < 12, '~15 Hz, not 60 (${V.stats().paints} paints in 31 frames)')`.
- 254–254: `assert.equal(V.stats().paints, p)`.
- 258–258: `assert.ok(off.calls.attrs["data-visor-port"] === "1", "the eye-port stands with reflections OFF…")`.
- 259–259: `assert.equal(off.V.stats().paints, 0)`.
- 262–262: `assert.equal(none.V.stats().paints, 0)`.
- 263–263: `assert.equal(none.calls.attrs["data-visor-port"], undefined)`.
- 264–264: `assert.equal(none.calls.props["--visor-port"], undefined)`.
- 267–267: `assert.equal(chase.calls.attrs["data-visor-port"], undefined)`.
- 268–268: `assert.equal(chase.V.stats().paints, 0)`.
- 271–271: `assert.ok(String(smoke.calls.props["--visor-port"]).includes("rgb(80,61,32)"), "TINTED amber bakes the lens colour into the port")`.
- 272–272: `assert.ok(smoke.V.stats().sun > V.stats().sun, "a tinted lens reflects harder")`.

### visor tick: switching HELMET VISOR to OFF mid-race takes the oval eye-port down (and CLEAR brings it back)

Case 275–291.
- 279–279: `assert.equal(calls.attrs["data-visor-port"], "1")`.
- 283–283: `assert.equal(calls.attrs["data-visor-port"], undefined)`.
- 284–284: `assert.equal(calls.props["--visor-port"], undefined)`.
- 288–288: `assert.equal(calls.attrs["data-visor-port"], "1")`.
- 290–290: `assert.match(read("css/hud.css"), /body\[data-helmet-cam\]:not\(\[data-helmet-visor="off"\]\) #hud::before \{/)`.

### visor tick: falls back to camState + lightState without visorScene, and reads nothing without __apex

Case 293–302.
- 297–297: `assert.ok(V.stats().sun > 0 && V.stats().glints === 0, "the fallback has the sun but no lamp positions")`.
- 300–300: `assert.equal(bare.V.stats().paints, 0)`.
- 301–301: `assert.ok(bare.calls.attrs["data-visor-port"] === "1")`.

### visor tick: a bad knob or a throwing canvas never reaches the render loop

Case 304–311.
- 308–308: `assert.ok(V.stats().paints === 1 && V.stats().errors === 0, "a non-numeric knob falls back to the shipped default")`.
- 310–310: `assert.doesNotThrow(() => boom.V.tick(1 / 60, true, 0, false), "a NaN scene paints nothing and throws nothing")`.

### visor tint: the lens colour is the resolved --visor-lens token (css/tokens.css), the table only as a fallback

Case 313–318.
- 314–314: `assert.deepEqual([...load({ color: "amber" }).V.tintRGB("amber")], [80, 61, 32])`.
- 315–315: `assert.deepEqual([...load({ color: "neutral" }).V.tintRGB("neutral")], [12, 12, 20])`.
- 316–316: `assert.deepEqual([...load({ color: "ice" }).V.tintRGB("ice")], [35, 59, 80])`.
- 317–317: `assert.deepEqual([...load({ color: "rose" }).V.tintRGB("rose")], [76, 45, 60])`.

### visor clear (audit4 R1): Droplets.clear() at race exit takes the light layer down with the water

Case 320–329.
- 324–324: `assert.equal(V.stats().shown, true)`.
- 327–327: `assert.equal(V.stats().shown, false)`.
- 328–328: `assert.equal(calls.inserted.hidden, true)`.

### visor size (audit4 R2): turning the visor ON mid-helmet sizes the new canvas before its first paint

Case 331–340.
- 337–337: `assert.ok(calls.inserted, "the canvas is built")`.
- 338–338: `assert.equal(calls.inserted.width, 844)`.
- 339–339: `assert.ok(V.stats().paints >= 1, "and it paints at once")`.

### visor refraction: the rim bend map and its three filters are built once per size when refraction is on

Case 342–350.
- 346–346: `assert.equal(V.stats().bend, "medium")`.
- 349–349: `assert.equal(off.stats().bend, "")`.

### visor refraction builds and resizes with reflections OFF in a fresh helmet session

Case 352–365.
- 355–355: `assert.equal(V.stats().bend, "medium")`.
- 356–356: `assert.equal(calls.bendMaps, 1)`.
- 357–357: `assert.equal(calls.inserted, null)`.
- 358–358: `assert.equal(V.stats().paints, 0)`.
- 360–360: `assert.equal(calls.bendMaps, 1)`.
- 363–363: `assert.equal(calls.bendMaps, 2)`.
- 364–364: `assert.equal(V.stats().paints, 0)`.

### visor blend (#3657): plus-lighter on WebGPU only; WebGL2, GLX and an unknown backend composite as plain over

Case 367–389.
- 371–371: `assert.equal(gpu.calls.attrs["data-visor-blend"], "add")`.
- 372–372: `assert.equal(gpu.V.stats().blend, "add")`.
- 373–373: `assert.equal(arm({ liveThreeApi: () => null, liveBackend: () => "webgpu" }).calls.attrs["data-visor-blend"], "add")`.
- 374–374: `assert.equal(arm({ liveThreeApi: () => "webgl2", liveBackend: () => "three" }).calls.attrs["data-visor-blend"], "over")`.
- 375–375: `assert.equal(arm({ liveThreeApi: () => null, liveBackend: () => "webgl2" }).calls.attrs["data-visor-blend"], "over")`.
- 376–376: `assert.equal(arm(undefined).calls.attrs["data-visor-blend"], "over")`.
- 377–377: `assert.equal(arm({ liveThreeApi: () => { throw new Error("mid-boot"); } }).calls.attrs["data-visor-blend"], "over")`.
- 378–378: `assert.equal(arm({ liveThreeApi: () => "webgl2" }, "?visorblend=add").calls.attrs["data-visor-blend"], "add")`.
- 379–379: `assert.equal(arm({ liveThreeApi: () => "webgpu" }, "?apex=1&visorblend=over").calls.attrs["data-visor-blend"], "over")`.
- 380–380: `assert.equal(arm({ liveThreeApi: () => "webgl2" }, "?visorblend=bogus").calls.attrs["data-visor-blend"], "over")`.
- 383–383: `assert.equal(off.calls.attrs["data-visor-blend"], undefined)`.
- 385–385: `assert.equal(gpu.V.blendMode(api, param), want)`.
- 388–388: `assert.match(css, /body\[data-visor-blend="over"\] #fx-visor \{ mix-blend-mode: normal; \}/)`.


## `tests/unit/visual-oracle.test.mjs`

Targets: `tests/helpers/visual-oracle.js`: `frameContent`, `frameDelta`.

Fixtures and setup: Line 4 creates 64 grayscale RGBA pixels; solids, alpha-zero gradient, visible gradient and reversed gradient are synthetic inputs.

Limits: Small numeric arrays only; no captured game content, PNG decoding or perceptual visual quality.

### visual content rejects black, white and transparent solid frames

Case 5–9.
- 6–6: `assert.equal(frameContent(frame(() => v)).nonblank, false)`.
- 7–7: `assert.equal(frameContent(frame((i) => i * 4).map((v, i) => i % 4 === 3 ? 0 : v)).nonblank, false)`.
- 8–8: `assert.equal(frameContent(frame((i) => i * 4)).nonblank, true)`.

### motion oracle rejects frozen frames and dimension mismatch

Case 10–15.
- 12–12: `assert.equal(frameDelta(a, a), 0)`.
- 13–13: `assert.ok(frameDelta(a, b) > 1)`.
- 14–14: `assert.throws(() => frameDelta(a, []), /dimensions/)`.


## `tests/unit/vm-debug-preload.test.mjs`

Targets: `tools/lib/vm-debug-preload.cjs`: preload patch, `stats`, `fix`; existing brake-cue and log sources supply filename-resolution fixtures.

Fixtures and setup: Lines 15–21 require preload and read/rewrite real brake-cue source. `probeStack` 23–36 appends an intentional throw in a small VM with time/math stubs; checks file URL stack and rewrite-counter growth.

Limits: Requires preload in this test process; does not test opt-out default or a real debugger breakpoint. Assertions accept alternate stack spellings and only two existing relative paths.

Shared helper assertions: `assert.fail` 31–31; `assert.ok` 33–33.

### brake-cue-style load with no filename reports a file:// URL

Case 38–48.
- 39–39: `assert.ok(BRAKE_SRC.length > 200, "fixture source must be long enough for hash match")`.
- 42–42: `assert.match(stack, /file:\/\//)`.
- 43–46: `assert.ok(stack.includes("[synthetic script name]") || stack.includes(BRAKE_URL) || stack.includes(BRAKE), 'stack must name [synthetic script name]:\n${stack}')`.
- 47–47: `assert.ok(preload.stats.hashFixed > before.hashFixed, "preload must count a hashFixed rewrite")`.

### a relative js/ filename becomes absolute

Case 50–56.
- 53–53: `assert.match(stack, /file:\/\//)`.
- 54–54: `assert.ok(stack.includes("[synthetic script name]"), 'stack must name [synthetic script name]:\n${stack}')`.
- 55–55: `assert.ok(preload.stats.relFixed > before.relFixed, "preload must count a relFixed rewrite")`.

### fix() returns absolute when given a relative that exists

Case 58–62.
- 60–60: `assert.ok(path.isAbsolute(o.filename), o.filename)`.
- 61–61: `assert.ok(o.filename.endsWith('${path.sep}js${path.sep}core${path.sep}[synthetic script name]'), o.filename)`.


## `tests/unit/vm-filename-lint.test.mjs`

Targets: `tools/check/vm-filename-lint.mjs`: `lintSource`, `lintAll`, `count`, `countSrc`; `tools/check/ratchets.mjs`: `pinVerdict`; `tests/helpers/abs-src.mjs`.

Fixtures and setup: Synthetic VM-call snippets classify relative/missing/absolute/synthetic labels; live helper path joining; full scanned test/helper tree and ratchet receipt.

Limits: Parser/source analysis only, no V8 coverage or breakpoint attachment. Unknown identifier filename is treated as relative. Missing snippet names are informational; only source-load count ratchets. Literal paths in negative snippets are fixtures, not dependencies.

### VF1 a relative or bare literal filename is flagged, for every vm entry point

Case 15–20.
- 16–16: `assert.deepEqual(kinds('vm.runInContext(s, c, { filename: "js/game.js" });'), ["relative"])`.
- 17–17: `assert.deepEqual(kinds('vm.runInNewContext(s, c, { filename: "[synthetic script name]" });'), ["relative"])`.
- 18–18: `assert.deepEqual(kinds('vm.runInThisContext(s, { filename: "js/game.js" });'), ["relative"])`.
- 19–19: `assert.deepEqual(kinds('new vm.Script(s, { filename: f });'), ["relative"])`.

### VF2 an absolute filename (call or ROOT-built) passes; a synthetic label names no file

Case 22–27.
- 23–23: `assert.deepEqual(kinds('vm.runInContext(s, c, { filename: absSrc(f) });'), [])`.
- 24–24: `assert.deepEqual(kinds('vm.runInContext(s, c, { filename: path.join(ROOT, f) });'), [])`.
- 25–25: `assert.deepEqual(kinds('vm.runInContext(s, c, { filename: ROOT + "/js/game.js" });'), [])`.
- 26–26: `assert.deepEqual(kinds('vm.runInContext(s, c, { filename: "vm-page:evaluate" });'), [])`.

### VF3 a load with no filename is informational, and non-vm calls are ignored

Case 29–33.
- 30–30: `assert.deepEqual(kinds('vm.runInContext(s, c);'), ["missing"])`.
- 31–31: `assert.deepEqual(kinds('vm.runInContext(s, c, { timeout: 5 });'), ["missing"])`.
- 32–32: `assert.deepEqual(kinds('foo.runInContext(s, c, { filename: "js/game.js" });'), [])`.

### VF4 absSrc joins a repo-relative path onto ROOT and leaves an absolute one alone

Case 35–39.
- 36–36: `assert.ok(path.isAbsolute(absSrc("js/game.js")))`.
- 37–37: `assert.ok(absSrc("js/game.js").endsWith(path.join("js", "[synthetic script name]")))`.
- 38–38: `assert.equal(absSrc("/[synthetic script name]"), "/[synthetic script name]")`.

### VF5 the tree has no relative vm filename and every scanned file parses

Case 41–47.
- 44–44: `assert.deepEqual(bad, [])`.
- 45–45: `assert.deepEqual(results.filter((r) => r.parseError).map((r) => r.file), [])`.
- 46–46: `assert.ok(count(results, "missing") >= 0)`.

### VF6 filename-less SOURCE loads are ratcheted (tree.vmSrcLoads), which only goes down; snippets stay free

Case 49–59.
- 51–51: `assert.deepEqual(src('vm.runInContext(SRC + "; this.X = X;", ctx);'), [true])`.
- 52–52: `assert.deepEqual(src('vm.runInContext(fs.readFileSync(f, "utf8"), ctx);'), [true])`.
- 53–53: `assert.deepEqual(src('vm.runInContext("X.y()", ctx);'), [false])`.
- 54–54: `assert.deepEqual(src('vm.runInContext(\'X.y()\', ctx);'), [false])`.
- 56–56: `assert.equal(v.value, countSrc(lintAll()))`.
- 57–57: `assert.ok(v.ok, '${v.value} filename-less source loads (ceiling ${v.ceiling}${v.base ? '; base ${v.base.value}/${v.base.ceiling}' : ""}): pass { filename: absSrc(rel) }')`.


## `tests/unit/vm-page-lifecycle.test.mjs`

Targets: `tests/helpers/vm-page.js`: `VmPage._awaitPumping`, `makeVmTest` hooks/fixtures/cleanup.

Fixtures and setup: `pumpingPage` 11–19 injects record/flushTimers/pumpFrame counters. `child` 58–74 removes NODE_TEST_CONTEXT, writes isolated tests under scratch, launches Node TAP with ten-second timeout, removes directory in finally and asserts spawn success. Embedded test names are fixture-only: body-passes, uses hook, outside suite, body-fails, registered before hooks, bad fixture, close rejects. Hook errors/console sentinels test process results.

Limits: Promise scheduling uses host promises and mock Date; frame/timer functions are supplied callbacks. Child TAP verifies adapter lifecycle and error propagation rather than a browser. No actual rendered page is needed.

Shared helper assertions: `assert.ifError` 72–72.

### VM evaluate observes fulfilled promise chains without advancing timers or frames

Case 21–26.
- 24–24: `assert.equal(await page._awaitPumping(ready), 42)`.
- 25–25: `assert.deepEqual(calls, { timers: 0, frames: 0 })`.

### VM evaluate preserves an already rejected promise without pumping a frame

Case 28–32.
- 30–30: `assert.rejects(page._awaitPumping(Promise.reject(error)), actual => actual === error)`.
- 31–31: `assert.deepEqual(calls, { timers: 0, frames: 0 })`.

### VM evaluate observes timer-resolved promise chains before pumping an unrelated frame

Case 34–40.
- 38–38: `assert.equal(await page._awaitPumping(pending), 7)`.
- 39–39: `assert.deepEqual(calls, { timers: 1, frames: 0 })`.

### VM evaluate continues to pump a pending animation-frame promise

Case 42–48.
- 46–46: `assert.equal(await page._awaitPumping(pending), 'frame ready')`.
- 47–47: `assert.deepEqual(calls, { timers: 1, frames: 1 })`.

### VM evaluate rejects timer settlement after the unchanged 60-second deadline

Case 50–57.
- 55–55: `assert.rejects(page._awaitPumping(pending), /promise did not settle in 60000ms/)`.
- 56–56: `assert.deepEqual(calls, { timers: 1, frames: 0 })`.

### VM async afterEach rejection fails the test and remaining cleanup runs

Case 76–85.
- 82–82: `assert.equal(r.status, 1)`.
- 83–83: `assert.match(r.out, /cleanup-failure/)`.
- 84–84: `assert.match(r.out, /remaining-cleanup-ran/)`.

### VM afterAll is awaited and its rejection fails the process

Case 87–94.
- 92–92: `assert.equal(r.status, 1)`.
- 93–93: `assert.match(r.out, /after-all-failure/)`.

### VM nested suite hooks survive declaration and run in their own scope

Case 96–107.
- 106–106: `assert.equal(r.status, 0)`.

### VM preserves a body failure while reporting a teardown failure too

Case 109–116.
- 114–114: `assert.equal(r.status, 1)`.
- 115–115: `assert.match(r.out, /VM test and cleanup failed/)`.

### VM honors hooks declared after tests and cleans up inner scopes first

Case 119–132.
- 131–131: `assert.equal(r.status, 0)`.

### VM fixture setup failure still closes its page and runs cleanup

Case 134–145.
- 141–141: `assert.equal(r.status, 1)`.
- 142–142: `assert.match(r.out, /no VM fixture named/)`.
- 143–143: `assert.match(r.out, /setup-cleanup-ran/)`.
- 144–144: `assert.match(r.out, /partial-page-closed/)`.

### VM page close failure fails the test

Case 147–153.
- 151–151: `assert.equal(r.status, 1)`.
- 152–152: `assert.match(r.out, /page-close-failure/)`.

## Cleanup and maintenance findings

- The first seven loopback-server cases in verify-live close their server in finally but leave their mkdtemp checkout directories behind. The final transport case registers recursive removal with t.after. This is a test-fixture cleanup gap, not a live-site issue.
- Validation CLI artifact fixtures register removal with t.after; its timeout process fixture kills the tracked grandchild group and removes its OS-temp directory in finally. The importer restores global fetch in finally. Stage timeout is intentionally a real-process test when run.
- Viewer removes its PNG directory in finally; absence of sharp skips only its pixel-diff case. VM lifecycle child directories are removed in finally and fixture setup/close/teardown failures are explicitly part of the oracle.
- Audio observer/interval fixtures use fresh isolated VMs and synthetic timers; the pause case explicitly requires polling to stop on close. No real timers, DOM listeners or network requests were started by this review.
- Vehicle exact source substitutions assert that both hunks changed, preventing accidental scratch-vs-scratch comparisons. Remaining source regex pins (Vegas, CSS, allocation patterns, WGX, agent finish clock) are intentionally refactor-sensitive and cannot replace runtime/visual evidence.
- Potential duplicate coverage: the two zero-box native-modal cases at 83–97 and 294–301 in the modal-order file overlap. The first layers two tracked dialogs; the second isolates the size gate against an ordinary sized background. Preserve that distinction if consolidating.
- The visor bad-knob/throwing-canvas case does not actually inject a throwing canvas. Add such a fixture if exception containment of canvas methods is the intended contract; current assertions establish malformed-knob/NaN-scene tolerance only.

No cleanup or runtime changes were made. Historical source filenames mentioned in test comments are intentionally omitted; synthetic/nonexistent script names in fixture operands are described generically.
