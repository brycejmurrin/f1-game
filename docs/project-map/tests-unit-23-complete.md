# Unit group 23 — complete source map

Read-only mapping of all 15 assigned files (4,940 lines). Every line was read in individually returned chunks of at most 150 source lines. No test, browser, build, commit, or runtime verification was performed. Hashes identify the observed working tree, not a claim that tests pass.

Case ranges include the complete test call; assertion spans include direct assertions and local assertion helpers (`closeTo`, `gt`, `lt`, `isNum`). A loop row covers every iteration named in its fixture; it is not an additional test case. Source-shape checks establish spelling/wiring only. VM checks execute real modules against the described synthetic environment; they do not establish browser layout, raster appearance, GPU execution, timing cost, or screen-reader output.

Navigation used `.claude/skills/code-nav/SKILL.md` and attached apex-lsp definitions/outlines. LSP resolved GameHud.create at hud.js:47 (export 2535), Helmets at helmets.js:27, Car3D.build at car3d.js:237 (export 2888), HudArrange at hud-arrange.js:23, HudLayout at hud-layout.js:40, HudElements at hud-elements.js:7, HudReadouts at hud-readouts.js:13, HomeWorld at home-world.js:3, TrackPit.at at pit.js:407 (export 488), and Dom.fmtRaceClock at dom.js:52 (export 61). `__apex.obs` was refused because the window façade has no statically resolved member; the apex.js outline resolved ApexApi.create at line 5 instead. Module-file fallback definitions for HudElements.effective:147–165, HudArrange.dragTo:29–32, and HudLayout.packPhoneRects:509 onward explicitly did not establish export/caller coverage. HudReadouts.fmtGapSec:47–51 and HomeWorld.create:16 onward were read through bounded definition bodies.

## Fixtures and boundaries

- headless-api-vm: one createGame boot (storage trackId monza), virgin-page cases first, loadRace awaits race then jump(0.1,40,0); shared mutable VM and close in after. `reset before init` actually accepts false OR any non-null object; its title overstates the false-only contract. Control loop may terminate early on done, so 50 completed ticks are not required.
- helmet-memo: seven cars cover stock/custom style, field, silhouette, matte/chrome; warm and fresh loadParts VMs compare five mesh arrays with Object.is. Fresh builder can itself memoize later same-design finish cases. No visual quality or speed measurement.
- helmets: real design/team/legend tables loaded with Function; sampled shell/painter grids and two altered-source/spy variants, plus one spawnSync --help case. Geometry metrics and sampled pattern coherence are proxies for appearance.
- home-world: 100-station synthetic track, real TrackPit.at, fixed Tracks.sample, Flyby point/floor stubs, rAF queue, readiness/eligibility/context toggles; Flyby mutation methods deliberately throw. No real Flyby camera solve or WebGL scene.
- hooks-documented: regex hook extraction and structured hand-section detection, generated hook table excluded; empty exception set. No semantic documentation accuracy check.
- html-sink-lint: JavaScript strings labelled f.js/fixture.js are synthetic parser inputs, not current repository files; last case audits current js/ and exact allowlist keys/counts/reasons. Detects unreviewed sink structure, not complete data-flow security.
- hud-announce-lane-cache: mini-dom, supplied rectangles, counters, fixed synthetic clock, optional fake ResizeObserver; stacks attribute reads to function names. Miss/read counts bound calls in this harness, not real milliseconds.
- hud-arrange: minimal custom El/store/layout/visibility/event/rAF/MutationObserver model; runtime editor listeners are exercised, but dimensions/safe areas/manual transforms are fixture calculations. The visibility policy is the real HudLayout module.
- hud-control-clearance: CSS regex pins plus synthetic rectangle/circle overlap analysis; joint heightCap body is extracted and executed over room/height/request grids. No browser cascade evaluation.
- hud-dock-pack: documentless HudLayout/CamGroups, DockLayout+CssZoom fake CSS measurement, and one visibleViewport/tyre/control runtime fixture. Mutable input snapshots verify read-only measurements.
- hud-elements: synchronous in-memory GameStore subscribers and body classes; later mini-dom checklist/navigation fixture. Preferences, effective reasons, and DOM metadata are covered; real storage and assistive technology are not.
- hud-feel: mini-dom G façade, synthetic timers/canvas paint logs, CSS parser, token-derived independent WCAG calculation; measuredHud counts dimensions and fitHarness forward-models transforms with a no-marker negative control. Additional clocks use extracted fmtTime and seeded Dom.
- hud-fit-idempotent: bootFlipHarness reflows supplied intrinsic rectangles synchronously on published zoom and can lag currentCSSZoom/add deterministic font quantization; bootOrderHarness models dirty DOM and forced reads, caching resize events. This model is not a browser performance trace.
- hud-gap-decimals: real HudReadouts in VM, extracted broadcast fmtGap, source delegation checks, sampled 9.9–10.1 boundary. Fixed character count is not measured glyph width.
- hud-helmet-placement: real shipped layout tables in VM plus parsed/regex CSS rules; phone placement and portrait suppression are contracts, not measured viewport screenshots.

## Case inventory

### tests/unit/headless-api-vm.test.mjs

Full read: 1–274; SHA-256 `e0cdf722ec58d758095ffea580ad65acccf3059169b2919f7cd3ece26c330d3f`. Targets: js/agent/apex.js; js/agent/agentview.js; tools/lib/game-vm.cjs.

| Case | Range | Assertion spans | Target / meaning and limit |
|---|---|---|---|
| obs() returns null before track load | 40–42 | 41–41 | js/agent/apex.js; js/agent/agentview.js; tools/lib/game-vm.cjs. Pins named module behavior on the fixture described above; no browser proof. |
| reset() returns false when player not yet initialised | 44–51 | 50–50 | js/agent/apex.js; js/agent/agentview.js; tools/lib/game-vm.cjs. Pins named module behavior on the fixture described above; no browser proof. |
| headless() returns false by default | 55–58 | 57–57 | js/agent/apex.js; js/agent/agentview.js; tools/lib/game-vm.cjs. Pins named module behavior on the fixture described above; no browser proof. |
| headless() can be set to true and read back | 60–64 | 63–63 | js/agent/apex.js; js/agent/agentview.js; tools/lib/game-vm.cjs. Pins named module behavior on the fixture described above; no browser proof. |
| headless() can be toggled off again | 66–71 | 70–70 | js/agent/apex.js; js/agent/agentview.js; tools/lib/game-vm.cjs. Pins named module behavior on the fixture described above; no browser proof. |
| obs() returns full observation object after jump | 75–127 | 78–78, 81–81, 84–84, 85–85, 88–88, 89–89, 90–90, 91–91, 94–94, 95–95, 98–98, 99–99, 102–102, 103–103, 104–104, 107–107, 110–110, 113–113, 114–114, 115–115, 116–116, 117–117, 119–119, 120–120, 124–124, 125–125, 126–126 | js/agent/apex.js; js/agent/agentview.js; tools/lib/game-vm.cjs. Pins named module behavior on the fixture described above; no browser proof. |
| obs().done is false when driving normally | 129–132 | 131–131 | js/agent/apex.js; js/agent/agentview.js; tools/lib/game-vm.cjs. Pins named module behavior on the fixture described above; no browser proof. |
| clearR and clearL are positive when on-track at centre | 134–140 | 138–138, 139–139 | js/agent/apex.js; js/agent/agentview.js; tools/lib/game-vm.cjs. Pins named module behavior on the fixture described above; no browser proof. |
| wallR > x (right wall is to the right of the car) | 142–146 | 145–145 | js/agent/apex.js; js/agent/agentview.js; tools/lib/game-vm.cjs. Pins named module behavior on the fixture described above; no browser proof. |
| wet weather sets gripMult to 0.82 | 148–154 | 152–152, 153–153 | js/agent/apex.js; js/agent/agentview.js; tools/lib/game-vm.cjs. Pins named module behavior on the fixture described above; no browser proof. |
| act() returns obs on first call | 158–164 | 161–161, 162–162, 163–163 | js/agent/apex.js; js/agent/agentview.js; tools/lib/game-vm.cjs. Pins named module behavior on the fixture described above; no browser proof. |
| throttle for 60 ticks increases speed from rest | 166–171 | 170–170 | js/agent/apex.js; js/agent/agentview.js; tools/lib/game-vm.cjs. Pins named module behavior on the fixture described above; no browser proof. |
| braking reduces speed | 173–178 | 177–177 | js/agent/apex.js; js/agent/agentview.js; tools/lib/game-vm.cjs. Pins named module behavior on the fixture described above; no browser proof. |
| input field in obs reflects what was passed to act | 180–186 | 183–183, 184–184, 185–185 | js/agent/apex.js; js/agent/agentview.js; tools/lib/game-vm.cjs. Pins named module behavior on the fixture described above; no browser proof. |
| act(null) clears test input | 188–193 | 192–192 | js/agent/apex.js; js/agent/agentview.js; tools/lib/game-vm.cjs. Pins named module behavior on the fixture described above; no browser proof. |
| n=10 steps advances further than n=1 | 195–202 | 201–201 | js/agent/apex.js; js/agent/agentview.js; tools/lib/game-vm.cjs. Pins named module behavior on the fixture described above; no browser proof. |
| headless mode does not break act() | 204–211 | 209–209, 210–210 | js/agent/apex.js; js/agent/agentview.js; tools/lib/game-vm.cjs. Pins named module behavior on the fixture described above; no browser proof. |
| reset() returns obs after reset | 215–220 | 218–218, 219–219 | js/agent/apex.js; js/agent/agentview.js; tools/lib/game-vm.cjs. Pins named module behavior on the fixture described above; no browser proof. |
| reset() places player near the requested lap fraction | 222–229 | 227–227, 228–228 | js/agent/apex.js; js/agent/agentview.js; tools/lib/game-vm.cjs. Pins named module behavior on the fixture described above; no browser proof. |
| reset() sets initial speed correctly | 231–235 | 234–234 | js/agent/apex.js; js/agent/agentview.js; tools/lib/game-vm.cjs. Pins named module behavior on the fixture described above; no browser proof. |
| reset() resets lap counter to 0 | 237–240 | 239–239 | js/agent/apex.js; js/agent/agentview.js; tools/lib/game-vm.cjs. Pins named module behavior on the fixture described above; no browser proof. |
| done is false immediately after reset | 242–245 | 244–244 | js/agent/apex.js; js/agent/agentview.js; tools/lib/game-vm.cjs. Pins named module behavior on the fixture described above; no browser proof. |
| can reset multiple times and always return valid obs | 247–255 | 251–251, 252–252, 253–253 | js/agent/apex.js; js/agent/agentview.js; tools/lib/game-vm.cjs. Pins named module behavior on the fixture described above; no browser proof. |
| 50-step control loop completes with valid final obs | 259–274 | 270–270, 271–271, 272–272, 273–273 | js/agent/apex.js; js/agent/agentview.js; tools/lib/game-vm.cjs. Pins named module behavior on the fixture described above; no browser proof. |

Cases: 24.

### tests/unit/helmet-memo.test.mjs

Full read: 1–51; SHA-256 `c1ec7e73eec2a76eb8151246ae130d7e3ce23ab2d96554c4406dd86cb6b8ebc4`. Targets: js/car/helmets.js; js/car/car3d.js; tools/car/parts-sweep.mjs.

| Case | Range | Assertion spans | Target / meaning and limit |
|---|---|---|---|
| a memo-replayed helmet is value-identical to a freshly painted one | 32–42 | 38–38, 39–39 | js/car/helmets.js; js/car/car3d.js; tools/car/parts-sweep.mjs. Compares mesh values/design separation for CASES; no rendering or timing claim. |
| the memo keys on the design: another number or helmet style still paints its own lid | 44–51 | 48–48, 49–49, 50–50 | js/car/helmets.js; js/car/car3d.js; tools/car/parts-sweep.mjs. Compares mesh values/design separation for CASES; no rendering or timing claim. |

Cases: 2.

### tests/unit/helmets.test.mjs

Full read: 1–440; SHA-256 `6012d5bb6ccea6d0ae7e59682445294a25a83e8644eca2d14b494969e536a130`. Targets: js/car/helmets.js; js/car/car3d.js; js/data/teams.js; js/data/legends.js; tools/car/helmet-sheet.mjs.

| Case | Range | Assertion spans | Target / meaning and limit |
|---|---|---|---|
| every driver on the grid has a hand-made design, not a generated one | 34–38 | 36–36, 37–37 | js/car/helmets.js; js/car/car3d.js; js/data/teams.js; js/data/legends.js; tools/car/helmet-sheet.mjs. Pins named design/mesh property on sampled real-data fixtures; no visual sign-off. |
| no helmet is the colour of the car it sits in | 40–49 | 48–48 | js/car/helmets.js; js/car/car3d.js; js/data/teams.js; js/data/legends.js; tools/car/helmet-sheet.mjs. Pins named design/mesh property on sampled real-data fixtures; no visual sign-off. |
| a design that WOULD blend falls back to its alt, and the alt is a real escape | 51–61 | 56–56, 58–58, 59–59 | js/car/helmets.js; js/car/car3d.js; js/data/teams.js; js/data/legends.js; tools/car/helmet-sheet.mjs. Pins named design/mesh property on sampled real-data fixtures; no visual sign-off. |
| every colour is a real rgb triple in range, and every zone kind exists | 63–78 | 65–65, 66–66, 74–74 | js/car/helmets.js; js/car/car3d.js; js/data/teams.js; js/data/legends.js; tools/car/helmet-sheet.mjs. Pins named design/mesh property on sampled real-data fixtures; no visual sign-off. |
| the painter answers for every point of the shell, and paints more than the base | 80–95 | 88–88, 93–93 | js/car/helmets.js; js/car/car3d.js; js/data/teams.js; js/data/legends.js; tools/car/helmet-sheet.mjs. Pins named design/mesh property on sampled real-data fixtures; no visual sign-off. |
| the visor is an aperture over the eyes: front only, and neither the crown nor the chin | 97–109 | 98–98, 99–99, 100–100, 101–101, 102–102, 103–103, 105–105, 108–108 | js/car/helmets.js; js/car/car3d.js; js/data/teams.js; js/data/legends.js; tools/car/helmet-sheet.mjs. Pins named design/mesh property on sampled real-data fixtures; no visual sign-off. |
| shell() marks the visor as glass and the paint as paint | 111–117 | 114–114, 115–115, 116–116 | js/car/helmets.js; js/car/car3d.js; js/data/teams.js; js/data/legends.js; tools/car/helmet-sheet.mjs. Pins named design/mesh property on sampled real-data fixtures; no visual sign-off. |
| the shell holds the proportions traced off the reference photographs | 119–179 | 134–134, 135–135, 136–136, 137–137, 140–140, 141–141, 147–147, 164–164, 169–169, 170–170, 173–173, 176–176, 178–178 | js/car/helmets.js; js/car/car3d.js; js/data/teams.js; js/data/legends.js; tools/car/helmet-sheet.mjs. Pins named design/mesh property on sampled real-data fixtures; no visual sign-off. |
| a number off the grid gets a design of its own, stable and distinct | 181–190 | 183–183, 184–184, 185–185, 186–186, 187–187, 189–189 | js/car/helmets.js; js/car/car3d.js; js/data/teams.js; js/data/legends.js; tools/car/helmet-sheet.mjs. Pins named design/mesh property on sampled real-data fixtures; no visual sign-off. |
| a legend or MY TEAM driver never wears a 2026 driver's design, whatever number he carries | 192–210 | 199–199, 200–200, 201–201, 202–202, 207–207, 209–209 | js/car/helmets.js; js/car/car3d.js; js/data/teams.js; js/data/legends.js; tools/car/helmet-sheet.mjs. Pins named design/mesh property on sampled real-data fixtures; no visual sign-off. |
| car3d keys the helmet on the legend / custom driver, not the number | 212–227 | 215–215, 216–216, 219–219, 220–220, 221–221, 222–222, 223–223, 224–224, 226–226 | js/car/car3d.js. Pins named design/mesh property on sampled real-data fixtures; no visual sign-off. |
| car3d builds the helmet through Helmets, and keeps no head geometry of its own | 229–235 | 231–231, 232–232, 233–233, 234–234 | js/car/car3d.js; js/ui/dom.js. Pins named design/mesh property on sampled real-data fixtures; no visual sign-off. |
| the profile is a spline through the traced rows, not nineteen straight segments | 237–251 | 250–250 | js/car/helmets.js; js/car/car3d.js; js/data/teams.js; js/data/legends.js; tools/car/helmet-sheet.mjs. Pins named design/mesh property on sampled real-data fixtures; no visual sign-off. |
| the mottle draws connected strokes, not one-cell speckle | 260–282 | 271–271, 279–280 | js/car/helmets.js; js/car/car3d.js; js/data/teams.js; js/data/legends.js; tools/car/helmet-sheet.mjs. Pins named design/mesh property on sampled real-data fixtures; no visual sign-off. |
| the mottle is resolution-free — the same doodle at any tessellation | 284–305 | 291–291, 298–298, 304–304 | js/car/helmets.js. Pins named design/mesh property on sampled real-data fixtures; no visual sign-off. |
| a quad splits only where the paint changes, and never moves the shell | 307–337 | 318–319, 322–322, 336–336 | js/car/helmets.js; js/car/car3d.js; js/data/teams.js; js/data/legends.js; tools/car/helmet-sheet.mjs. Pins named design/mesh property on sampled real-data fixtures; no visual sign-off. |
| maxSplit 0 is the unsplit grid, even on a busy design | 339–344 | 343–343 | js/car/helmets.js; js/car/car3d.js; js/data/teams.js; js/data/legends.js; tools/car/helmet-sheet.mjs. Pins named design/mesh property on sampled real-data fixtures; no visual sign-off. |
| simplePaint keeps the shell and visor without evaluating detailed zones per triangle | 346–367 | 357–358, 359–360, 361–361, 362–363 | js/car/helmets.js; js/car/car3d.js; js/data/teams.js; js/data/legends.js; tools/car/helmet-sheet.mjs. Pins named design/mesh property on sampled real-data fixtures; no visual sign-off. |
| the lid carries a rear gurney, a top intake and a visor strip, all small and on the shell | 373–423 | 383–383, 388–388, 389–389, 390–390, 391–391, 401–401, 404–405, 407–407, 408–408, 418–418, 419–419 | js/car/helmets.js; js/car/car3d.js; js/data/teams.js; js/data/legends.js; tools/car/helmet-sheet.mjs. Pins named design/mesh property on sampled real-data fixtures; no visual sign-off. |
| car3d's helmet note describes the lid helmets.js builds | 425–430 | 427–428, 429–429 | js/car/car3d.js. Pins source contract; formatting-sensitive, no runtime proof. |
| helmet-sheet.mjs --help exits 0 without rasterising | 432–440 | 436–436, 437–437, 439–439 | tools/car/helmet-sheet.mjs. Pins named design/mesh property on sampled real-data fixtures; no visual sign-off. |

Cases: 21.

### tests/unit/home-world.test.mjs

Full read: 1–152; SHA-256 `51b2995dbabfbdff84051e873b3a922405a51e02d082cb34f2646ddb5e360892`. Targets: js/ui/home-world.js; js/track/core/pit.js.

| Case | Range | Assertion spans | Target / meaning and limit |
|---|---|---|---|
| prepared world ownership is eligible, context scoped, idempotent and restores one snapshot | 40–53 | 42–42, 43–43, 44–44, 45–45, 47–47, 48–48, 49–49, 50–50, 51–51, 52–52 | js/ui/home-world.js; js/track/core/pit.js. Pins named ownership/camera/redraw transition on synthetic world; Flyby solve is stubbed. |
| still frames are acknowledged only after a ready, non-warming draw, and viewport changes repaint | 55–62 | 57–57, 58–58, 59–59, 60–60, 61–61 | js/ui/home-world.js; js/track/core/pit.js. Pins named ownership/camera/redraw transition on synthetic world; Flyby solve is stubbed. |
| ambient is bounded to 24fps, clamps stalled clocks, and never changes global Flyby playback | 64–72 | 69–69, 70–70, 71–71 | js/ui/home-world.js; js/track/core/pit.js. Pins named ownership/camera/redraw transition on synthetic world; Flyby solve is stubbed. |
| reduced motion freezes ambient but interactive photo camera still receives bounded redraws | 74–88 | 77–77, 78–78, 80–80, 81–81, 82–82, 83–83, 84–84, 86–86, 87–87 | js/ui/home-world.js; js/track/core/pit.js. Pins named ownership/camera/redraw transition on synthetic world; Flyby solve is stubbed. |
| pit framing follows real TrackPit bands, signed lane side and the sampled road elevation | 90–101 | 94–94, 95–95, 96–96, 99–99 | js/ui/home-world.js; js/track/core/pit.js. Pins named ownership/camera/redraw transition on synthetic world; Flyby solve is stubbed. |
| missing pit/Flyby data falls back to a finite scoped still without an endless render loop | 103–109 | 105–105, 106–106, 107–107, 108–108 | js/ui/home-world.js; js/track/core/pit.js. Pins named ownership/camera/redraw transition on synthetic world; Flyby solve is stubbed. |
| late world readiness cannot reactivate an ended ownership session | 111–115 | 113–113, 114–114 | js/ui/home-world.js; js/track/core/pit.js. Pins named ownership/camera/redraw transition on synthetic world; Flyby solve is stubbed. |
| the outdoor subject is shifted into the visible menu pane, and Photo restores the full frame | 117–125 | 120–120, 122–122, 124–124 | js/ui/home-world.js; js/track/core/pit.js. Pins named ownership/camera/redraw transition on synthetic world; Flyby solve is stubbed. |
| browser rAF defers prepareTrack so the title can paint first | 127–144 | 132–132, 133–133, 135–135, 136–136, 139–139, 143–143 | js/ui/home-world.js; js/track/core/pit.js. Pins named ownership/camera/redraw transition on synthetic world; Flyby solve is stubbed. |
| custom capture/restore run once across shots and read-only FOV restoration is safe | 146–152 | 148–148, 150–150, 151–151 | js/ui/home-world.js; js/track/core/pit.js. Pins named ownership/camera/redraw transition on synthetic world; Flyby solve is stubbed. |

Cases: 10.

### tests/unit/hooks-documented.test.mjs

Full read: 1–123; SHA-256 `c0f5278a0336061947a012411bf05e8dd1d72d5ff66625637b423785865bf7a7`. Targets: js/agent/apex.js; js/game.js; docs/DEBUG-HOOKS.md.

| Case | Range | Assertion spans | Target / meaning and limit |
|---|---|---|---|
| no NEW __apex hook ships undocumented | 76–82 | 79–81 | js/agent/apex.js; js/game.js; docs/DEBUG-HOOKS.md. Pins hand-documentation/source wiring contract; regex extraction only. |
| the undocumented list does not name a hook that has since been documented | 84–89 | 87–88 | js/agent/apex.js; js/game.js; docs/DEBUG-HOOKS.md. Pins hand-documentation/source wiring contract; regex extraction only. |
| the undocumented list does not name a hook that no longer exists | 91–96 | 94–95 | js/agent/apex.js; js/game.js; docs/DEBUG-HOOKS.md. Pins hand-documentation/source wiring contract; regex extraction only. |
| openf1 and jolpica guard a missing path instead of fetching garbage | 98–112 | 104–104, 105–105, 106–106, 109–109, 110–110 | js/agent/apex.js. Pins hand-documentation/source wiring contract; regex extraction only. |
| jump synchronises the HUD instead of depending on the next animation frame | 114–123 | 117–118, 120–120, 121–122 | js/game.js; js/agent/apex.js. Pins hand-documentation/source wiring contract; regex extraction only. |

Cases: 5.

### tests/unit/html-sink-lint.test.mjs

Full read: 1–84; SHA-256 `de6d64c77808eb0624fed0e4c2639bcb33d25f54cdd7e85934f26161682b47ea`. Targets: tools/check/html-sink-lint.mjs; tests/data/html-sink-allowlist.json.

| Case | Range | Assertion spans | Target / meaning and limit |
|---|---|---|---|
| constant markup is not a site | 19–30 | 29–29 | tools/check/html-sink-lint.mjs; tests/data/html-sink-allowlist.json. Parser/audit classification for the named input population; no taint-flow proof. |
| anything that interpolates a value is a site, keyed by receiver and sink | 32–43 | 33–33, 34–34, 35–35, 36–36, 37–37, 38–38, 39–39, 40–40, 41–42 | tools/check/html-sink-lint.mjs; tests/data/html-sink-allowlist.json. Parser/audit classification for the named input population; no taint-flow proof. |
| srcdoc, createContextualFragment and document.write are sinks too | 45–55 | 46–46, 47–47, 48–48, 49–49, 50–50, 52–52, 53–53, 54–54 | tools/check/html-sink-lint.mjs; tests/data/html-sink-allowlist.json. Parser/audit classification for the named input population; no taint-flow proof. |
| the constant test is structural, not a regex over the text | 57–63 | 59–59, 60–60, 61–61, 62–62 | tools/check/html-sink-lint.mjs; tests/data/html-sink-allowlist.json. Parser/audit classification for the named input population; no taint-flow proof. |
| a malicious-shaped site in a fixture is caught | 65–69 | 68–68 | tools/check/html-sink-lint.mjs; tests/data/html-sink-allowlist.json. Parser/audit classification for the named input population; no taint-flow proof. |
| every HTML sink in js/ is constant or audited, and the allowlist is exact | 71–84 | 73–73, 74–76, 77–77, 78–78, 80–80, 83–83 | js/ui/dom.js. Parser/audit classification for the named input population; no taint-flow proof. |

Cases: 6.

### tests/unit/hud-announce-lane-cache.test.mjs

Full read: 1–299; SHA-256 `8b5003caf1cb3924080ff3b9d2c7c1bbdb684cf27d22acc19edb1edf8e47cbc4`. Targets: js/ui/hud.js.

| Case | Range | Assertion spans | Target / meaning and limit |
|---|---|---|---|
| source: lane memo buckets gaps empty/non-empty; caches rects; invalidateFit clears | 162–173 | 164–164, 165–165, 166–166, 167–171, 172–172 | js/ui/hud.js. Pins source contract; formatting-sensitive, no runtime proof. |
| PERF: steady ticks + gap digit rolloff → 0 announceLane getBoundingClientRect | 175–218 | 187–187, 196–196, 209–209, 213–213, 217–217 | js/ui/hud.js. Pins named module behavior on the fixture described above; no browser proof. |
| delayed primary packing invalidates the cached tyre lane rectangle | 221–233 | 230–230, 232–232 | js/ui/hud.js. Pins named module behavior on the fixture described above; no browser proof. |
| PERF #2151: phone ticks with a radio card up → no painted-collapse re-read, BOOST measured once per probe | 240–278 | 245–245, 262–263, 266–267, 273–273, 277–277 | js/ui/hud.js. Pins named module behavior on the fixture described above; no browser proof. |
| PERF: settled backoff skips fitHud layout reads; a dirty observer still probes | 283–299 | 292–292, 293–293, 298–298 | js/ui/hud.js. Pins named module behavior on the fixture described above; no browser proof. |

Cases: 5.

### tests/unit/hud-arrange.test.mjs

Full read: 1–612; SHA-256 `6246cc59822815b0b0b99034213910668f1bd147621f2b7e2e4e5a2a2a5ff9bf`. Targets: js/ui/hud-arrange.js; js/ui/hud-layout.js; js/ui/setting-row.js.

| Case | Range | Assertion spans | Target / meaning and limit |
|---|---|---|---|
| dragTo: screen offsets remain unbounded and invalid gestures retain prior positions | 39–47 | 41–41, 42–42, 43–43, 44–44, 45–45, 46–46 | js/ui/hud-arrange.js; js/ui/hud-layout.js; js/ui/setting-row.js. Pins named math/editor state transition with simulated input and geometry; no native event/layout proof. |
| placedOrig: an auto-placed radio card's first drag starts from where it sits, measured from the fixed point | 49–56 | 52–52, 53–53, 55–55 | js/ui/hud-arrange.js; js/ui/hud-layout.js; js/ui/setting-row.js. Pins named math/editor state transition with simulated input and geometry; no native event/layout proof. |
| pinchTo: preserves any positive finite size without upper or visual lower bounds | 58–68 | 60–60, 61–61, 62–62, 63–63, 64–64, 65–65, 66–66, 67–67 | js/ui/hud-arrange.js; js/ui/hud-layout.js; js/ui/setting-row.js. Pins named math/editor state transition with simulated input and geometry; no native event/layout proof. |
| stepSize: toolbar grows beyond 200 and can repeatedly shrink below one percent | 70–78 | 72–72, 73–73, 74–74, 75–75, 76–76, 77–77 | js/ui/hud-arrange.js; js/ui/hud-layout.js; js/ui/setting-row.js. Pins named math/editor state transition with simulated input and geometry; no native event/layout proof. |
| clashes: only pairs overlapping by more than the margin on BOTH axes; touching and empty rects are not clashes | 80–97 | 93–93, 94–94, 95–95, 96–96 | js/ui/hud-arrange.js; js/ui/hud-layout.js; js/ui/setting-row.js. Pins named math/editor state transition with simulated input and geometry; no native event/layout proof. |
| create: inert without a document or HudLayout; the pure API is frozen | 99–103 | 101–101, 102–102 | js/ui/hud-arrange.js; js/ui/hud-layout.js; js/ui/setting-row.js. Pins named math/editor state transition with simulated input and geometry; no native event/layout proof. |
| editor: exit flushes the final drag once into its original camera/style and clears its frame | 202–212 | 205–205, 207–207, 208–208, 209–209, 210–210, 211–211 | js/ui/hud-arrange.js; js/ui/hud-layout.js; js/ui/setting-row.js. Pins named math/editor state transition with simulated input and geometry; no native event/layout proof. |
| editor: lifting either pinch finger rebases the remaining drag without a position jump | 214–225 | 223–223 | js/ui/hud-arrange.js; js/ui/hud-layout.js; js/ui/setting-row.js. Pins named math/editor state transition with simulated input and geometry; no native event/layout proof. |
| editor: keyboard entry selects a readout, focuses the selector and moves with arrows | 227–235 | 229–229, 231–231, 233–233, 234–234 | js/ui/hud-arrange.js; js/ui/hud-layout.js; js/ui/setting-row.js. Pins named math/editor state transition with simulated input and geometry; no native event/layout proof. |
| editor: title preview restores shell visibility on normal and interrupted exits without saving it | 237–252 | 241–241, 243–243, 244–244, 246–246, 247–247, 251–251 | js/ui/hud-arrange.js; js/ui/hud-layout.js; js/ui/setting-row.js. Pins named math/editor state transition with simulated input and geometry; no native event/layout proof. |
| editor: resizing preserves selection and pending movement, ends the old gesture and reflows once | 254–266 | 258–258, 259–259, 261–261, 263–263, 265–265 | js/ui/hud-arrange.js; js/ui/hud-layout.js; js/ui/setting-row.js. Pins named math/editor state transition with simulated input and geometry; no native event/layout proof. |
| editor: a required rotation prompt ends editing and restores its original dialog | 268–273 | 271–271, 272–272 | js/ui/hud-arrange.js; js/ui/hud-layout.js; js/ui/setting-row.js. Pins named math/editor state transition with simulated input and geometry; no native event/layout proof. |
| editor: a radio pinch rebases the remaining finger from its painted position | 276–286 | 281–281, 284–284, 285–285 | js/ui/hud-arrange.js; js/ui/hud-layout.js; js/ui/setting-row.js. Pins named math/editor state transition with simulated input and geometry; no native event/layout proof. |
| editor: first keyboard radio move starts at its painted position on phone landscape | 289–300 | 294–294, 295–295, 297–297, 299–299 | js/ui/hud-arrange.js; js/ui/hud-layout.js; js/ui/setting-row.js. Pins named math/editor state transition with simulated input and geometry; no native event/layout proof. |
| editor: opt-in readouts are selectable previews without enabling them and restore on exit | 302–338 | 308–308, 309–309, 310–310, 311–311, 312–312, 313–313, 315–315, 318–318, 319–319, 321–321, 322–322, 326–326, 327–327, 328–328, 330–330, 331–331, 332–332, 335–335, 336–336 | js/ui/hud-arrange.js; js/ui/hud-layout.js; js/ui/setting-row.js. Pins named math/editor state transition with simulated input and geometry; no native event/layout proof. |
| editor: visible optional readouts lift and restore producer drop state without replacing content | 341–351 | 346–346, 347–347, 349–349, 350–350 | js/ui/hud-arrange.js; js/ui/hud-layout.js; js/ui/setting-row.js. Pins named math/editor state transition with simulated input and geometry; no native event/layout proof. |
| editor: tower hide/show includes DELTA and leaves SPEED independent | 354–372 | 359–359, 361–361, 362–362, 364–364, 365–365, 369–369, 371–371 | js/ui/hud-arrange.js; js/ui/hud-layout.js; js/ui/setting-row.js. Pins named math/editor state transition with simulated input and geometry; no native event/layout proof. |
| editor: initial toolbar avoids the HUD using its visible content-sized box | 375–395 | 386–386, 387–387, 388–388, 393–393, 394–394 | js/ui/hud-arrange.js; js/ui/hud-layout.js; js/ui/setting-row.js. Pins named math/editor state transition with simulated input and geometry; no native event/layout proof. |
| editor: toolbar uses the clear middle when every edge covers HUD content | 397–409 | 405–405, 406–406, 408–408 | js/ui/hud-arrange.js; js/ui/hud-layout.js; js/ui/setting-row.js. Pins named math/editor state transition with simulated input and geometry; no native event/layout proof. |
| editor: toolbar stays inside asymmetric safe areas on a narrow, short screen | 411–418 | 417–417 | js/ui/hud-arrange.js; js/ui/hud-layout.js; js/ui/setting-row.js. Pins named math/editor state transition with simulated input and geometry; no native event/layout proof. |
| editor: first cleared-map edits adopt its painted origin on the whole-percent grid | 421–444 | 432–432, 438–438, 439–439, 440–440, 441–441, 442–442 | js/ui/hud-arrange.js; js/ui/hud-layout.js; js/ui/setting-row.js. Pins named math/editor state transition with simulated input and geometry; no native event/layout proof. |
| editor: explicit custom maps never adopt stale automatic clearance | 446–451 | 450–450 | js/ui/hud-arrange.js; js/ui/hud-layout.js; js/ui/setting-row.js. Pins named math/editor state transition with simulated input and geometry; no native event/layout proof. |
| editor: first edits preserve painted position and size across different automatic/manual homes | 453–486 | 460–460, 464–464, 465–465, 466–466, 467–467, 478–478, 479–479, 481–481, 482–482, 483–483 | js/ui/hud-arrange.js; js/ui/hud-layout.js; js/ui/setting-row.js. Pins named math/editor state transition with simulated input and geometry; no native event/layout proof. |
| editor: hidden map, gaps and mirror stay selectable and their owner modes can be restored | 488–502 | 492–492, 493–493, 494–494, 496–496, 498–498, 499–499, 500–500 | js/ui/hud-arrange.js; js/ui/hud-layout.js; js/ui/setting-row.js. Pins named math/editor state transition with simulated input and geometry; no native event/layout proof. |
| editor: auto-shown pieces grey VISIBILITY with a visible hint reason | 506–515 | 511–511, 512–512, 513–513, 514–514 | js/ui/hud-arrange.js; js/ui/hud-layout.js; js/ui/setting-row.js. Pins named math/editor state transition with simulated input and geometry; no native event/layout proof. |
| editor holds the MOVE & SIZE preview before hiding settings and releases after restoring them | 518–527 | 523–523, 524–524, 526–526 | js/ui/hud-arrange.js; js/ui/hud-layout.js; js/ui/setting-row.js. Pins named math/editor state transition with simulated input and geometry; no native event/layout proof. |
| editor: Bring Into View moves an offscreen widget inside safe bounds without resizing | 529–549 | 534–534, 536–536, 537–537, 538–538, 541–541, 542–542, 543–543, 546–546, 548–548 | js/ui/hud-arrange.js; js/ui/hud-layout.js; js/ui/setting-row.js. Pins named math/editor state transition with simulated input and geometry; no native event/layout proof. |
| editor: recovery pins oversized leading edges and preserves the requested size | 551–561 | 558–558, 559–559, 560–560 | js/ui/hud-arrange.js; js/ui/hud-layout.js; js/ui/setting-row.js. Pins named math/editor state transition with simulated input and geometry; no native event/layout proof. |
| editor: recovery uses the visible viewport and leaves an already visible widget alone | 563–572 | 566–566, 570–570, 571–571 | js/ui/hud-arrange.js; js/ui/hud-layout.js; js/ui/setting-row.js. Pins named math/editor state transition with simulated input and geometry; no native event/layout proof. |
| editor: recovery explains a hidden widget without changing placement or visibility | 574–582 | 578–578, 579–579, 580–580, 581–581 | js/ui/hud-arrange.js; js/ui/hud-layout.js; js/ui/setting-row.js. Pins named math/editor state transition with simulated input and geometry; no native event/layout proof. |
| editor: recovery flushes a pending gesture and prevents its queued frame undoing the move | 584–593 | 590–590, 592–592 | js/ui/hud-arrange.js; js/ui/hud-layout.js; js/ui/setting-row.js. Pins named math/editor state transition with simulated input and geometry; no native event/layout proof. |
| editor: size labels are concise without rounding stored fractional or tiny positive sizes | 595–612 | 600–600, 601–601, 603–603, 606–606, 608–608, 609–609, 611–611 | js/ui/hud-arrange.js; js/ui/hud-layout.js; js/ui/setting-row.js. Pins named math/editor state transition with simulated input and geometry; no native event/layout proof. |

Cases: 32.

### tests/unit/hud-control-clearance.test.mjs

Full read: 1–126; SHA-256 `1a27a0fba85b0419c8870ad5bf796a00ec8837bc167f2646a022b8b640e0c4e9`. Targets: css/hud.css; js/ui/hud.js; tools/lib/hud-geometry.mjs.

| Case | Range | Assertion spans | Target / meaning and limit |
|---|---|---|---|
| CSS: #hud-sectors clears the right dock on every phone steer mode | 27–42 | 33–35, 36–38, 39–41 | css/hud.css; js/ui/hud.js; tools/lib/hud-geometry.mjs. Pins source contract; formatting-sensitive, no runtime proof. |
| CSS: touch #hud-rel is capped above the left dock (steer / BRAKE) | 44–48 | 45–47 | css/hud.css; js/ui/hud.js; tools/lib/hud-geometry.mjs. Pins source contract; formatting-sensitive, no runtime proof. |
| CSS: #hud-inputs clears the right dock on touch and the gear box on desktop | 50–71 | 51–53, 54–56, 57–58, 59–60, 61–61, 62–64, 65–67, 68–70 | css/hud.css; js/ui/hud.js; tools/lib/hud-geometry.mjs. Pins source contract; formatting-sensitive, no runtime proof. |
| analyzeOverlap: survey clash shapes are the failure mode we clear | 73–101 | 80–80, 81–81, 82–82, 87–87, 93–94, 95–95, 100–100 | css/hud.css; js/ui/hud.js; tools/lib/hud-geometry.mjs. Pins named module behavior on the fixture described above; no browser proof. |
| joint dock height cap preserves default pedals and stays monotonic at larger requests | 104–126 | 106–106, 108–108, 109–109, 110–110, 111–111, 117–117, 118–119, 124–125 | css/hud.css; js/ui/hud.js; tools/lib/hud-geometry.mjs. Pins named module behavior on the fixture described above; no browser proof. |

Cases: 5.

### tests/unit/hud-dock-pack.test.mjs

Full read: 1–137; SHA-256 `070bf158a3d17acafbeb88cedd7d7e24bb749e56f0883e16380e452b2bf2fd0d`. Targets: js/ui/hud-layout.js; js/ui/dock-layout.js; js/ui/css-zoom.js.

| Case | Range | Assertion spans | Target / meaning and limit |
|---|---|---|---|
| clampXY keeps a dock between its safe-area home and MAX (no offset parks it past the edge) | 47–58 | 49–49, 53–53, 54–54, 56–56, 57–57 | js/ui/hud-layout.js; js/ui/dock-layout.js; js/ui/css-zoom.js. Pins named module behavior on the fixture described above; no browser proof. |
| HudLayout exports packPhoneRects for the 150% phone packer | 60–64 | 62–63 | js/ui/hud-layout.js; js/ui/dock-layout.js; js/ui/css-zoom.js. Pins named module behavior on the fixture described above; no browser proof. |
| dock packing resolves overlaps within the available viewport, not behind its edges | 66–81 | 76–76, 78–78, 80–80 | js/ui/hud-layout.js; js/ui/dock-layout.js; js/ui/css-zoom.js. Pins named module behavior on the fixture described above; no browser proof. |
| runtime phone packing respects visible bounds even for an unedited instrument | 83–99 | 97–97, 98–98 | js/ui/hud-layout.js; js/ui/dock-layout.js; js/ui/css-zoom.js. Pins named module behavior on the fixture described above; no browser proof. |
| dock packing lifts TYRES clear of BRAKE without moving the control | 101–110 | 107–107, 108–108, 109–109 | js/ui/hud-layout.js; js/ui/dock-layout.js; js/ui/css-zoom.js. Pins named module behavior on the fixture described above; no browser proof. |
| later dock pieces yield to earlier dock pieces | 112–119 | 117–117, 118–118 | js/ui/hud-layout.js; js/ui/dock-layout.js; js/ui/css-zoom.js. Pins named module behavior on the fixture described above; no browser proof. |
| portrait keeps the dock planted even when a touch target overlaps it | 121–128 | 127–127 | js/ui/hud-layout.js; js/ui/dock-layout.js; js/ui/css-zoom.js. Pins named module behavior on the fixture described above; no browser proof. |
| fixed plates stay put and an empty or invalid measure emits no corrections | 130–137 | 133–133, 135–135 | js/ui/hud-layout.js; js/ui/dock-layout.js; js/ui/css-zoom.js. Pins named module behavior on the fixture described above; no browser proof. |

Cases: 8.

### tests/unit/hud-elements.test.mjs

Full read: 1–227; SHA-256 `3995b972eea7f092f3de8e1cdaa85e6f46f639d766d385e5cca3364a63303822`. Targets: js/ui/hud-elements.js; js/ui/hud-layout.js; css/hud.css; index.html.

| Case | Range | Assertion spans | Target / meaning and limit |
|---|---|---|---|
| defaults every chrome element on; hide writes data-hud-hide | 53–64 | 56–56, 58–58, 59–59, 60–60, 63–63 | js/ui/hud-elements.js; js/ui/hud-layout.js; css/hud.css; index.html. Pins named module behavior on the fixture described above; no browser proof. |
| stored offs restore on load | 66–74 | 69–69, 70–70, 71–71, 72–72, 73–73 | js/ui/hud-elements.js; js/ui/hud-layout.js; css/hud.css; index.html. Pins named module behavior on the fixture described above; no browser proof. |
| opt-in readouts ship OFF, store only an explicit on, and hide via data-hud-hide | 76–90 | 79–79, 80–80, 82–82, 83–83, 85–85, 87–87, 88–88, 89–89 | js/ui/hud-elements.js; js/ui/hud-layout.js; css/hud.css; index.html. Pins named module behavior on the fixture described above; no browser proof. |
| CSS contracts: hide selectors and no new class sprawl for the checklist | 92–97 | 94–94, 95–95, 96–96 | css/hud.css. Pins named module behavior on the fixture described above; no browser proof. |
| REL ships ON for the broadcast profile only; STRATEGY and INPUTS stay off | 99–123 | 101–101, 102–102, 103–103, 104–104, 107–107, 108–108, 109–109, 112–112, 113–113, 114–114, 115–115, 116–116, 117–117, 118–118, 119–119, 122–122 | js/ui/hud-elements.js; js/ui/hud-layout.js; css/hud.css; index.html. Pins named module behavior on the fixture described above; no browser proof. |
| broadcast REL default yields to an explicit store override and follows a style switch | 125–148 | 127–127, 128–128, 131–131, 132–132, 136–136, 138–138, 141–141, 143–143, 144–144, 146–146, 147–147 | js/ui/hud-elements.js; js/ui/hud-layout.js; css/hud.css; index.html. Pins named module behavior on the fixture described above; no browser proof. |
| HudLayout eval survives HudElements.apply reading profile() (no TDZ abort) | 150–183 | 179–179, 180–180, 181–181, 182–182 | js/camera/cam-groups.js; js/ui/hud-layout.js. Pins named module behavior on the fixture described above; no browser proof. |
| SPEED hide covers the whole #hud-speed plate (number + unit), not a second chip | 185–193 | 190–190, 191–191, 192–192 | css/hud.css. Pins named module behavior on the fixture described above; no browser proof. |
| effective HUD reasons distinguish saved OFF, style/camera suppression and missing session data | 195–208 | 197–197, 198–198, 199–199, 200–200, 201–201, 202–202, 203–203, 204–204, 205–205, 206–206, 207–207 | js/ui/hud-elements.js; js/ui/hud-layout.js; css/hud.css; index.html. Pins named module behavior on the fixture described above; no browser proof. |
| actual HUD checklist refreshes contextual reasons and keeps requirement navigation separate from checkbox | 210–227 | 221–221, 222–222, 224–224, 225–225, 226–226 | js/ui/dom.js. Pins named module behavior on the fixture described above; no browser proof. |

Cases: 10.

### tests/unit/hud-feel.test.mjs

Full read: 1–1446; SHA-256 `6814f3abae9647fa8c7c975eb573d739c136a0ec153134f91996d1bdf33d0afc`. Targets: js/ui/hud.js; js/ui/hud-minimap.js; js/ui/hud-skin.js; css/hud.css.

| Case | Range | Assertion spans | Target / meaning and limit |
|---|---|---|---|
| the tach redline latches with hysteresis instead of flickering on the 92 % line | 148–157 | 151–151, 152–152, 153–153, 154–154, 155–155, 156–156 | js/ui/hud.js; js/ui/hud-minimap.js; js/ui/hud-skin.js; css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| under cockpit-cam the hidden gear/tach writes wait; the redline latch keeps its history | 162–184 | 165–165, 166–166, 169–169, 170–170, 174–174, 175–175, 176–176, 181–181, 182–182, 183–183 | css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| the OVERTAKE chip spells every state differently and reads the 2026 allowance in MJ | 187–236 | 190–190, 191–191, 192–192, 193–193, 197–197, 198–198, 199–199, 200–200, 204–204, 205–205, 206–206, 207–207, 210–210, 211–211, 214–214, 220–220, 221–221, 224–224, 225–225, 226–226, 229–229, 231–231, 232–232, 234–234, 235–235 | js/ui/hud.js; js/ui/hud-minimap.js; js/ui/hud-skin.js; css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| automatic active aero identifies its mode while the manual control stays unavailable | 238–247 | 243–243, 244–244, 245–245, 246–246 | js/ui/hud.js; js/ui/hud-minimap.js; js/ui/hud-skin.js; css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| sector splits carry ★/▼/▲ against sectorBests, timing-screen colours | 249–290 | 257–257, 258–258, 263–263, 264–264, 265–265, 266–266, 271–271, 272–272, 276–276, 277–277, 283–283, 284–284, 288–288, 289–289 | js/ui/hud.js; js/ui/hud-minimap.js; js/ui/hud-skin.js; css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| a sector split shows its GAIN on the previous best for 3 s, then the split again | 292–323 | 304–304, 307–307, 308–308, 310–310, 312–312, 315–315, 316–316, 322–322 | js/ui/hud.js; js/ui/hud-minimap.js; js/ui/hud-skin.js; css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| in a race the lap clock holds the lap just driven for 3 s — green on a personal best | 325–357 | 330–330, 334–334, 335–335, 337–337, 339–339, 340–340, 343–343, 344–344, 350–350, 355–355, 356–356 | css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| the speed digits, energy bar and sector red are set up to be read at a glance | 359–385 | 369–371, 372–372, 373–373, 375–375, 376–376, 377–377, 382–382, 383–383, 384–384 | css/hud.css; js/ui/hud.js. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| the TIME box's shell placeholder is fmtTime's own zero, so the first tick does not reflow it | 387–392 | 390–390, 391–391 | js/ui/hud.js; js/ui/hud-minimap.js; js/ui/hud-skin.js; css/hud.css. Pins source contract; formatting-sensitive, no runtime proof. |
| the race gap readout is smoothed: braking halves the divisor, the tenths do not double in one tick | 394–409 | 401–401, 403–403, 405–405, 408–408 | js/ui/hud.js; js/ui/hud-minimap.js; js/ui/hud-skin.js; css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| the gap widget's DROP rule follows the viewport in a time trial as well as a race | 411–423 | 416–417, 421–422 | js/ui/hud.js; js/ui/hud-minimap.js; js/ui/hud-skin.js; css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| the ahead gap slot keeps one line so the behind line never jumps when the leader has nobody ahead | 425–429 | 427–428 | css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| empty .hud-gaps collapses — no junk chip when both gap lines are empty | 435–443 | 438–438, 440–440, 442–442 | css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| empty #hud-sectors collapses — no junk plate before buildSecRows fills it | 445–449 | 447–448 | css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| the POS box flashes on a position change and the gap chips carry the neighbour's team colour | 452–464 | 457–457, 459–459, 461–461, 462–462, 463–463 | js/ui/hud.js; js/ui/hud-minimap.js; js/ui/hud-skin.js; css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| timing columns use the bundled condensed numerals with tabular figures | 466–477 | 469–469, 470–470, 473–473, 475–476 | css/overlays.css; css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| the ahead chip marks the slipstream from player.towing | 479–487 | 484–484, 486–486 | js/ui/hud.js; js/ui/hud-minimap.js; js/ui/hud-skin.js; css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| every banner is the SAME small radio card — no kind gets billboard type back | 489–511 | 496–496, 497–497, 498–498, 499–499, 500–500, 501–501, 504–504, 507–507, 510–510 | css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| the number plate is the card's identity anchor, and it collapses to a stripe with no number | 513–533 | 519–519, 520–520, 521–521, 522–522, 523–524, 525–525, 526–526, 530–531, 532–532 | css/hud.css; js/race/announce-banner.js. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| coach and practice keep their own channel and priority, and practice is its own kind | 535–557 | 539–539, 542–542, 543–543, 548–549, 553–553, 554–554, 556–556 | css/hud.css; js/race/announce-banner.js; js/audio/radio-voice.js; js/race/race-insights.js; js/race/driving-coach.js. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| sector flash, limits chip, and announce queue are wired in source | 559–566 | 561–561, 562–562, 563–563, 564–564, 565–565 | js/game.js; css/hud.css. Pins source contract; formatting-sensitive, no runtime proof. |
| a team with no tokens.css row gets its OWN colour on the plate, not the last one skinned | 582–596 | 587–588, 589–589, 594–595 | js/ui/hud.js; js/ui/hud-minimap.js; js/ui/hud-skin.js; css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| the plate's ink is whichever token stands further from the team colour | 598–617 | 614–615 | js/ui/hud.js; js/ui/hud-minimap.js; js/ui/hud-skin.js; css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| a garage colour edit re-skins the plate — the id has not changed | 619–633 | 628–628, 632–632 | js/ui/hud.js; js/ui/hud-minimap.js; js/ui/hud-skin.js; css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| Team menu accent follows team changes while an independent HUD accent stays selected | 635–645 | 641–641, 643–643, 644–644 | js/ui/hud.js; js/ui/hud-minimap.js; js/ui/hud-skin.js; css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| lap clocks carry the minute: never 1:60.00 or 1:010.00 (round first, then split) | 647–660 | 655–655, 656–656, 659–659 | js/ui/dom.js. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| race clocks roll over to hours and carry every unit (Dom.fmtRaceClock) | 665–678 | 671–671, 672–672, 673–673, 675–675, 676–676, 677–677 | js/ui/results-sheet.js; js/ui/watch-transport.js; js/data/results.js; js/ui/dom.js. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| MOTION: REDUCED stops every HUD pulse, not only the OS query | 698–738 | 706–706, 707–708, 709–710, 711–711, 712–712, 713–713, 724–724, 729–729, 734–734, 735–735, 737–737 | css/hud.css; css/overlays.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| MOTION: REDUCED keeps RELATIVE fit geometry out of transitions | 740–751 | 744–744, 747–747, 749–749, 750–750 | css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| the minimap's armed pit marker pulses — unless motion is reduced, by SETTINGS or by the OS | 762–778 | 765–765, 771–771, 772–772, 777–777 | js/ui/hud.js; js/ui/hud-minimap.js; js/ui/hud-skin.js; css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| a caution flag is SPOKEN through #announce-live, once per change | 780–808 | 784–785, 790–790, 791–791, 792–792, 793–793, 795–795, 797–797, 799–799, 801–801, 803–803, 805–805, 807–807 | js/ui/hud.js; js/ui/hud-minimap.js; js/ui/hud-skin.js; css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| minimap sector arcs are the podium metals from tokens — no purple, no red/green pair | 810–844 | 816–816, 818–818, 819–819, 824–824, 826–826, 830–830, 836–836, 840–840, 841–841, 842–842, 843–843 | js/ui/track-maps.js; js/ui/hud.js; js/ui/hud-minimap.js. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| minimap measures actual raster/layout changes, not changing gap spelling | 867–891 | 873–873, 874–874, 877–877, 878–878, 888–888 | js/ui/hud.js; js/ui/hud-minimap.js; js/ui/hud-skin.js; css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| HUD conditional widgets skip stable attribute writes and repair external DOM edits | 893–935 | 910–910, 912–912, 913–913, 914–914, 919–919, 920–920, 924–924, 925–925, 926–927, 929–930, 933–933, 934–934 | js/ui/hud.js; js/ui/hud-minimap.js; js/ui/hud-skin.js; css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| a moved / resized tower, map, sector box or gearbox leaves every fit cap where it was | 1004–1015 | 1006–1006, 1009–1009, 1014–1014 | js/ui/hud.js; js/ui/hud-minimap.js; js/ui/hud-skin.js; css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| the safe-area inset comes from --sar, never from the sector plate's right edge (touch dock stand-off) | 1028–1041 | 1033–1033, 1034–1034, 1040–1040 | js/ui/hud.js; js/ui/hud-minimap.js; js/ui/hud-skin.js; css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| a dropped gap strip carries the radio card's caution step down with the flag chip | 1043–1057 | 1048–1048, 1049–1050, 1051–1052, 1053–1054, 1055–1055, 1056–1056 | css/hud.css; js/ui/hud.js. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| an empty timing tower still fits the bottom band and writes the dock cap | 1059–1070 | 1062–1062, 1063–1063, 1064–1064, 1069–1069 | js/ui/hud.js; js/ui/hud-minimap.js; js/ui/hud-skin.js; css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| GameHud.invalidateFit forces the next tick to re-fit; HudElements.apply calls it | 1072–1081 | 1077–1077, 1079–1079, 1080–1080 | js/ui/hud-elements.js. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| the radio card's top-row slot is published at 1/SIZE when MOVE & SIZE scales the card | 1083–1091 | 1085–1085, 1090–1090 | js/ui/hud.js; js/ui/hud-minimap.js; js/ui/hud-skin.js; css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| survey leads: SECTORS x-20, MAP y+40, SPEED & GEAR x40 / s200 leave every fit cap where it was | 1094–1103 | 1101–1101 | js/ui/hud.js; js/ui/hud-minimap.js; js/ui/hud-skin.js; css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| the radio card's top-row slot ends at a touch dock group in the tower's rows | 1105–1121 | 1109–1109, 1114–1114, 1117–1117, 1120–1120 | js/ui/hud.js; js/ui/hud-minimap.js; js/ui/hud-skin.js; css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| the radio card's top-row slot ends at #hud-sectors in the wrapping band | 1123–1143 | 1126–1126, 1132–1132, 1133–1133, 1134–1134, 1135–1135, 1136–1136, 1137–1137, 1138–1138, 1139–1139, 1142–1142 | js/ui/hud.js; js/ui/hud-minimap.js; js/ui/hud-skin.js; css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| a previous radio clearance cannot collapse a newly measured lane | 1145–1159 | 1156–1157, 1158–1158 | js/ui/hud.js; js/ui/hud-minimap.js; js/ui/hud-skin.js; css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| the top-right corner slot: the HUD mirror in its rows ends it on the left; no room, no slot | 1161–1184 | 1170–1170, 1171–1171, 1172–1172, 1177–1177, 1178–1178, 1183–1183 | js/ui/hud.js; js/ui/hud-minimap.js; js/ui/hud-skin.js; css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| on touch the radio card is left-aligned in the gap between the dock groups | 1186–1288 | 1195–1195, 1196–1196, 1201–1201, 1202–1202, 1205–1205, 1209–1209, 1215–1216, 1221–1222, 1223–1223, 1224–1225, 1229–1229, 1234–1234, 1237–1237, 1243–1243, 1248–1248, 1251–1251, 1260–1260, 1269–1269, 1272–1273, 1276–1276, 1277–1277, 1280–1280, 1281–1281, 1282–1282, 1283–1283, 1284–1285, 1286–1286, 1287–1287 | js/ui/hud.js; css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| a dock lane that goes dark and lights again republishes every lane var (hStyle cache) | 1290–1308 | 1300–1300, 1303–1304, 1307–1307 | js/ui/hud.js; js/ui/hud-minimap.js; js/ui/hud-skin.js; css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| MOVE & SIZE on the tower re-derives the radio card's slot at invalidateFit, not a tick later | 1310–1317 | 1312–1312, 1316–1316 | js/ui/hud.js; js/ui/hud-minimap.js; js/ui/hud-skin.js; css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| the mirror's PAINTED bottom is published for the centre column (MOVE & SIZE can grow or lower it) | 1319–1337 | 1324–1324, 1327–1327, 1330–1330, 1333–1333, 1335–1336 | css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| a moved (data-hl) piece that unhides after the fit re-runs it, so HudLayout.fit can clamp it | 1339–1353 | 1348–1348, 1350–1350, 1352–1352 | js/ui/hud.js; js/ui/hud-minimap.js; js/ui/hud-skin.js; css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| a moved (data-hl) piece whose words change width re-fits on the next tick, not on the 3 s timer | 1355–1378 | 1369–1369, 1371–1371, 1373–1373, 1375–1375, 1377–1377 | js/ui/hud.js; js/ui/hud-minimap.js; js/ui/hud-skin.js; css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| the caution step-aside needs the card's other slot to really apply; TEXT LARGER grows the ERS bar | 1380–1395 | 1383–1383, 1384–1384, 1385–1385, 1392–1392, 1393–1393 | css/hud.css; css/tokens.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| a car alongside lights its screen edge: trafficSide → #hud[data-along], under the numbers, no pulse under REDUCE MOTION | 1400–1423 | 1406–1406, 1407–1407, 1409–1409, 1412–1412, 1413–1413, 1415–1415, 1416–1416, 1417–1417, 1418–1418, 1420–1420, 1421–1421, 1422–1422 | css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| dock size does not follow race readouts or HUD SIZE | 1425–1435 | 1433–1433 | js/ui/hud.js; js/ui/hud-minimap.js; js/ui/hud-skin.js; css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |
| broadcast height fitting reserves control space without changing button zoom | 1438–1446 | 1442–1442, 1443–1443, 1444–1444, 1445–1445 | js/ui/hud.js; js/ui/hud-minimap.js; js/ui/hud-skin.js; css/hud.css. Pins named HUD output/fit/CSS property in its fixture; no browser layout/timing proof. |

Cases: 55.

### tests/unit/hud-fit-idempotent.test.mjs

Full read: 1–817; SHA-256 `96115f01abf43083082d93176ec179bcce55eba3409068b861e5871c5cec59c4`. Targets: js/ui/hud.js; js/ui/hud-layout.js; css/hud.css.

| Case | Range | Assertion spans | Target / meaning and limit |
|---|---|---|---|
| fitHud: one-frame currentCSSZoom lag must not flip --hud-z-top between scale and the 0.4 floor | 212–229 | 225–226, 227–228 | js/ui/hud.js; js/ui/hud-layout.js; css/hud.css. Pins zoom, fit or read/write invariant in deterministic layout model; no device timing proof. |
| fitHud: two back-to-back fits with unchanged inputs publish identical zTop and dock inset | 231–247 | 242–242, 245–246 | js/ui/hud.js; js/ui/hud-layout.js; css/hud.css. Pins zoom, fit or read/write invariant in deterministic layout model; no device timing proof. |
| fitHud measures top-band intrinsics from the published --hud-z-top, not currentCSSZoom | 249–261 | 252–253, 254–255, 256–257, 259–260 | js/ui/hud.js; css/hud.css. Pins zoom, fit or read/write invariant in deterministic layout model; no device timing proof. |
| fitHud: on touch the tower clears the sector plate's row without shrinking the whole band | 268–281 | 276–276, 277–277, 280–280 | js/ui/hud.js; js/ui/hud-layout.js; css/hud.css. Pins zoom, fit or read/write invariant in deterministic layout model; no device timing proof. |
| fitHud: larger HUD SIZE never paints a smaller top band on the same phone viewport (#2882) | 283–298 | 293–294, 296–297 | js/ui/hud.js. Pins zoom, fit or read/write invariant in deterministic layout model; no device timing proof. |
| fitHud: hiding the sector plate frees the row (touch), and a plate level with the tower is not a row to clear | 300–315 | 310–310, 314–314 | js/ui/hud.js; js/ui/hud-layout.js; css/hud.css. Pins zoom, fit or read/write invariant in deterministic layout model; no device timing proof. |
| fitHud: portrait phone does not charge the stacked map beside the tower, and keeps a 10 CSS px floor | 330–342 | 335–336, 337–338, 341–341 | js/ui/hud.js; js/ui/hud-layout.js; css/hud.css. Pins zoom, fit or read/write invariant in deterministic layout model; no device timing proof. |
| portrait flag follows the sector plate after packing, then clears a hidden plate | 344–352 | 348–348, 351–351 | js/ui/hud.js; js/ui/hud-layout.js; css/hud.css. Pins zoom, fit or read/write invariant in deterministic layout model; no device timing proof. |
| fitHud: a small plate right of Boost does not trigger same-key collision retries | 368–380 | 379–379 | js/ui/hud.js; js/ui/hud-layout.js; css/hud.css. Pins zoom, fit or read/write invariant in deterministic layout model; no device timing proof. |
| fitHud: the top cap is measured at one canonical zoom, so HUD SIZE and the prior paint cannot move it (#2882) | 388–408 | 397–397, 399–399, 402–402, 403–403, 405–406 | js/ui/hud.js; js/ui/hud-layout.js; css/hud.css. Pins zoom, fit or read/write invariant in deterministic layout model; no device timing proof. |
| fitHud: --hud-top-h is the PAINTED tower's height after the cap moves the zoom (#2941) | 410–421 | 417–417, 419–419 | js/ui/hud.js; js/ui/hud-layout.js; css/hud.css. Pins zoom, fit or read/write invariant in deterministic layout model; no device timing proof. |
| fitHud still grows a map-only band when timing tiles are hidden | 423–429 | 428–428 | js/ui/hud.js; js/ui/hud-layout.js; css/hud.css. Pins zoom, fit or read/write invariant in deterministic layout model; no device timing proof. |
| fitHud: an unresolvable painted clash backs off to the 3 s cadence after a few tries | 431–451 | 444–444, 446–447, 450–450 | js/ui/hud.js; js/ui/hud-layout.js; css/hud.css. Pins zoom, fit or read/write invariant in deterministic layout model; no device timing proof. |
| fitHud: --hud-fit-stamp is written once in steady state, and again after a clash clears | 453–472 | 459–459, 461–461, 466–466, 470–470, 471–471 | js/ui/hud.js; js/ui/hud-layout.js; css/hud.css. Pins zoom, fit or read/write invariant in deterministic layout model; no device timing proof. |
| syncPhoneFit (the specs' probe) forces a fresh --hud-fit-stamp on every call, even in steady state | 474–486 | 479–479, 480–480, 482–482, 483–483, 485–485 | js/ui/hud.js; js/ui/hud-layout.js; css/hud.css. Pins zoom, fit or read/write invariant in deterministic layout model; no device timing proof. |
| fitHud: a steady tick skips the stamp probe, but a clash the key cannot see voids the stamp within the 3 s backstop (#2240) | 488–497 | 491–491, 495–495, 496–496 | js/ui/hud.js; js/ui/hud-layout.js; css/hud.css. Pins zoom, fit or read/write invariant in deterministic layout model; no device timing proof. |
| HUD tick: fit reads run before the frame's instrument writes, and the viewport is cached (5-perf F2) | 644–660 | 653–654, 657–657, 658–658, 659–659 | js/ui/hud.js; js/ui/hud-layout.js; css/hud.css. Pins zoom, fit or read/write invariant in deterministic layout model; no device timing proof. |
| HUD viewport cache: a resize re-fits from the new size, and fit results match the live-read path | 662–680 | 668–668, 671–671, 674–674, 679–679 | js/ui/hud.js; js/ui/hud-layout.js; css/hud.css. Pins zoom, fit or read/write invariant in deterministic layout model; no device timing proof. |
| publishing a changed top-control zoom requests one subsequent full fit | 683–723 | 688–688, 700–700, 701–701, 702–702, 705–705, 715–716, 720–720 | js/ui/hud.js. Pins zoom, fit or read/write invariant in deterministic layout model; no device timing proof. |
| fitHud tracer: off by default it logs nothing; on, it logs one line per CHANGE of the published fit | 725–737 | 732–732, 734–734, 735–735, 736–736 | js/ui/hud.js; js/ui/hud-layout.js; css/hud.css. Pins zoom, fit or read/write invariant in deterministic layout model; no device timing proof. |
| fitHud dock pass: a sector plate ABOVE the dock is not on it (agrees with HudLayout.clearControls), a plate level with it still yields | 739–751 | 749–749, 750–750 | js/ui/hud.js; js/ui/hud-layout.js; css/hud.css. Pins zoom, fit or read/write invariant in deterministic layout model; no device timing proof. |
| fitHud leaves a manually sized sector plate to HudLayout and releases stale automatic width | 753–771 | 764–764, 769–769 | js/ui/hud.js; js/ui/hud-layout.js; css/hud.css. Pins zoom, fit or read/write invariant in deterministic layout model; no device timing proof. |
| fitHud: intentional manual overlaps neither squeeze sectors nor reopen the fitter | 774–787 | 784–784, 785–785, 786–786 | js/ui/hud.js; js/ui/hud-layout.js; css/hud.css. Pins zoom, fit or read/write invariant in deterministic layout model; no device timing proof. |
| fitHud: a manually placed huge plate does not reduce the automatic top band's budget | 789–797 | 796–796 | js/ui/hud.js; js/ui/hud-layout.js; css/hud.css. Pins zoom, fit or read/write invariant in deterministic layout model; no device timing proof. |
| fitHud: a steady same-key full fit writes no root custom property (#2797) | 803–817 | 815–815, 816–816 | js/ui/hud.js; js/ui/hud-layout.js; css/hud.css. Pins zoom, fit or read/write invariant in deterministic layout model; no device timing proof. |

Cases: 25.

### tests/unit/hud-gap-decimals.test.mjs

Full read: 1–101; SHA-256 `f5177d124f20a9588cba137b6788b979aaa88d0b6eee19904a87d64cbbe9f054`. Targets: js/ui/hud-readouts.js; js/ui/hud-relative.js; js/race/broadcast.js; js/ui/hud.js.

| Case | Range | Assertion spans | Target / meaning and limit |
|---|---|---|---|
| standard profile: a 0.94 s gap renders with two decimals (Overtake threshold) | 25–31 | 27–27, 28–28, 29–29, 30–30 | js/ui/hud-readouts.js; js/ui/hud-relative.js; js/race/broadcast.js; js/ui/hud.js. Pins named module behavior on the fixture described above; no browser proof. |
| under ~10 s every profile uses two decimals; larger gaps stay compact | 33–48 | 36–36, 37–37, 40–40, 41–41, 43–43, 45–45, 46–46, 47–47 | js/ui/hud-readouts.js; js/ui/hud-relative.js; js/race/broadcast.js; js/ui/hud.js. Pins named module behavior on the fixture described above; no browser proof. |
| fmtGapSec length is stable under 10 s (tabular / no chip wobble) | 50–58 | 54–54, 55–55, 57–57 | js/ui/hud-readouts.js; js/ui/hud-relative.js; js/race/broadcast.js; js/ui/hud.js. Pins named module behavior on the fixture described above; no browser proof. |
| REL and the WATCH tower spell a gap exactly like the chip (one rule, no 1-dp copy) | 60–74 | 63–63, 64–64, 65–65, 68–68, 71–71, 72–72, 73–73 | js/ui/hud-relative.js; js/race/broadcast.js. Pins named module behavior on the fixture described above; no browser proof. |
| hud.js gapSec routes through HudReadouts (no private 1-dp ternary) | 76–81 | 78–78, 79–79, 80–80 | js/ui/hud.js. Pins named module behavior on the fixture described above; no browser proof. |
| gap chip is monotonic and fixed-width across the 9.95 s boundary (#2978) | 83–101 | 86–86, 87–87, 88–88, 89–89, 90–90, 94–94, 95–95, 99–99, 100–100 | js/ui/hud-readouts.js; js/ui/hud-relative.js; js/race/broadcast.js; js/ui/hud.js. Pins named module behavior on the fixture described above; no browser proof. |

Cases: 6.

### tests/unit/hud-helmet-placement.test.mjs

Full read: 1–51; SHA-256 `0dc0a0a864df5d17150e5fd66f4af276ac3d8a122bebf4bbf4ec0af0c3536468`. Targets: js/ui/hud-layout.js; css/hud.css.

| Case | Range | Assertion spans | Target / meaning and limit |
|---|---|---|---|
| touch HELMET docks ENERGY in the bottom strip (not mid-visor y:-37) | 28–34 | 31–31, 32–32, 33–33 | js/ui/hud-layout.js; css/hud.css. Pins named module behavior on the fixture described above; no browser proof. |
| touch helmet ENERGY stays in the cluster grid beside the gear (never anchored to the later-sibling tyre) | 36–43 | 39–40, 41–42 | js/ui/hud-layout.js; css/hud.css. Pins named module behavior on the fixture described above; no browser proof. |
| portrait helmet touch hides the PLAN row when it would crowd GEAR/SPEED | 45–51 | 47–49, 50–50 | js/ui/hud-layout.js; css/hud.css. Pins named module behavior on the fixture described above; no browser proof. |

Cases: 3.

## Production assertion anchors

The following exact ranges were resolved from current-source syntax after LSP established module ownership. They locate targets for assertion rows above; they do not claim all function bodies were fully reviewed. Nested façade object methods are included. Helmets.build was also read through LSP in full at 789–815: the JSON design/surface key, replay arrays and index rebasing, fresh paint, and bounded memo eviction explain the memo tests.

| Target file | Symbol / exact range |
|---|---|
| js/agent/apex.js | apiHook 99–105; jump 240–273; headless 1531–1535; obs 1702–1810; act 1812–1830; reset 2050–2133; openf1 2195–2195; jolpica 2197–2197 |
| js/car/helmets.js | generated 331–350; designFor 370–376; painter 411–421; isVisor 445–459; shell 463–472; pointAt 568–574; buildAero 702–778; build 789–815; paintLid 817–893 |
| js/car/car3d.js | helmetKey 166–182; build 237–2865 |
| js/ui/home-world.js | create 16–174; begin 45–71; end 72–78; needsFrame 86–95; camera 141–166; didRender 167–171 |
| js/ui/hud.js | create 47–2532; flashSector 207–214; gapDecimals 348–353; invalidateLaneRects 614–619; laneRect 620–628; announceLane 644–698; announceLaneTick 723–734; radioPaintedCollapse 811–850; _boostOnRightHalf 895–902; phonePaintedClash 933–959; phoneFitStampSync 961–1037; fitHud 1038–1147; paintInstruments 1926–1950; updateHud 1994–2439; invalidateFit 2495–2507 |
| js/ui/hud-arrange.js | dragTo 29–32; placedOrig 35–39; pinchTo 41–45; clashes 55–68; create 70–610 |
| js/ui/hud-layout.js | screenBounds 376–384; fit 401–473; packPhoneRects 509–598; clearControls 703–752; visibility 1103–1115; setVisibility 1116–1129 |
| js/ui/hud-elements.js | apply 113–121; isOn 123–123; set 125–128; effective 147–165; initUI 246–249 |
| js/ui/hud-readouts.js | gapDecimals 39–45; fmtGapSec 47–51; fmtGap 53–59 |
| js/ui/dock-layout.js | clampXY 27–32 |
| js/ui/dom.js | fmtLap 39–45; fmtRaceClock 52–59 |
| js/game.js | fmtTime 1046–1052 |
| js/race/broadcast.js | fmtGap 161–170 |
| js/track/core/pit.js | at 407–440 |
| tools/check/html-sink-lint.mjs | isConstantHtml 55–64; lintSource 74–94; readAllowlist 119–121; audit 124–137 |
| tools/lib/hud-geometry.mjs | analyzeOverlap 122–141; overlapArea 144–148 |

## Source and fixture fingerprint ledger

Ranges below cover whole dependency files for fingerprinting, not a claim of full dependency review. Full dependency reading is limited to the explicit LSP/source spans above; full test reading is complete. Current repository paths only are listed. Strings such as f.js and fixture.js remain parser labels described above.

| Path | Full file range | SHA-256 |
|---|---|---|
| .claude/skills/code-nav/SKILL.md | 1–84 | `ec73c911fa39f0d724037ee74bb963ac6208232a86a3ba33057d28eaa2da1353` |
| css/hud.css | 1–2526 | `ae4d6a5649088bc03a468e0d0686bc0a333f613440ffd78edb351ab41e1f75b1` |
| css/overlays.css | 1–1469 | `9b84e3b6694cd8d7798cdd42353791f1dd80e74659dfd09470084bc37f34e101` |
| css/tokens.css | 1–1361 | `baba959f43def9a6140099f4554f763dcf5566df1182bb9a8afd12dbceba007a` |
| docs/DEBUG-HOOKS.md | 1–5451 | `0e94c823800b00378c4038acdf19c8e522381daaea01190949c1a4e5f25a783b` |
| docs/project-map/unit-batches.json | 1–4664 | `b4438bfa4b85b6faa890d31291248ac23ce8528125ab45fbb979b88b129e8fd7` |
| index.html | 1–3970 | `198787c00ff4055628ee7c524dff5453c5bc90ee6724948304d4f41d32499348` |
| js/agent/agentview.js | 1–2320 | `7cbb75d8371fbed0e9f98b6f0dbb942f490a7d430be66f80f46a1da4b2c6d700` |
| js/agent/apex.js | 1–2495 | `fc763bef7f8648781baa4f884933265d07545630a54df8218197e6aa439c7fc1` |
| js/audio/radio-voice.js | 1–1004 | `f8a98e7ab66d88105f2db793bea781da8ecfb49bfdc86fb2618e6a248248968a` |
| js/camera/cam-groups.js | 1–44 | `9b66600b78e8e3fadda1b872fb7c6e301607c648be85e2865169e4bdf0945424` |
| js/car/car3d.js | 1–2899 | `d2ca91950cf1e65dc4161bda35b23148b409095016ed6618ca8ff7d0f714483e` |
| js/car/helmets.js | 1–898 | `5d3f8631f6c8110ce5b6c86a5eb7fc7d54d1198f1cf0f83083e4289961b7e2e0` |
| js/core/mat4.js | 1–98 | `8b80f0f6223622840031c736453f9d84862f049e70ce49a1709090098f7d121d` |
| js/data/legends.js | 1–498 | `3dcd92109f8eee13b9114412fe164340b4b323d37fec696773b037560e947ba3` |
| js/data/results.js | 1–388 | `748b88efd61472c06078c899649a6f519aa80a8404dc3b12833c615eb19563a8` |
| js/data/teams.js | 1–395 | `6ff73b5e60b9d510d9a9d4a17129f1947811ce217fda0dc8c1ccf8b64fdfe838` |
| js/game.js | 1–9554 | `20990458b493b2cdf6633be6df1eae91c6b820068be48522788d09467130334d` |
| js/race/announce-banner.js | 1–184 | `8ac250c9f99150e7acad993e88a5a2937b8070895cf677ace50d1f22568809eb` |
| js/race/broadcast.js | 1–497 | `1e3394765127925cc00ecfcef3274456b5ea783a7049d0d0bdf861e53486ddfb` |
| js/race/driving-coach.js | 1–804 | `38493215d619ae6e0c0e8680ffb4e007d529d7de1f19e66df7991aa50e29c127` |
| js/race/overtake-mode.js | 1–155 | `69e498cd080c996b49caef0ddd9d17b96f378566d7734b2f1db6c678a67a8019` |
| js/race/race-insights.js | 1–636 | `43f5438cdf48522439d1cba58eac6e732aabd14bc8013d5d9d95fd46ca8e29e4` |
| js/track/core/pit.js | 1–490 | `28d9e328f6b4b161c4212ad89725e73b254005a59cc973f0cc11eab5236ea872` |
| js/ui/css-zoom.js | 1–65 | `69e3f5fc1e2e8dc5127f88a0612dc3f414ec469ef509928a822418346fe87899` |
| js/ui/dock-layout.js | 1–333 | `1b8b719d448b6a186e3a32ff701c4616a030a1602a2aa7f87dfb7e34ac909241` |
| js/ui/home-world.js | 1–177 | `f8033e6b52cc778de78294fbabfab173f4dc7bba741892432f7d5757ec8285d8` |
| js/ui/hud-arrange.js | 1–614 | `3063e683eed366496e22c7f0dedb7c935ea33086a9248f394a82b021f75f2b18` |
| js/ui/hud-elements.js | 1–273 | `dd6fae0a8af4336f2763017995dd5494f302c7a65e0aac601c23395023f81e1e` |
| js/ui/hud-layout.js | 1–1355 | `512a4ce001b63fcad4003139cb36aa041fe36be45c5c8cdb1d9248e4aa514895` |
| js/ui/hud-minimap.js | 1–287 | `859d014f80f3bd14aa1df12aacce88597c9aa0919ae08d6752fbcfb8f76c70ea` |
| js/ui/hud-readouts.js | 1–308 | `4a47a3a0d4ea19791fd29f6199d25302f623e95d92d6af3eee4643b805cef8c0` |
| js/ui/hud-relative.js | 1–339 | `342ccab8160df88da89c637ebd9f1a45e103e87f3a98606fc2e9a7f0808d86b6` |
| js/ui/hud-skin.js | 1–86 | `0d2d2b6087b994fb06dc0f25b143cba4f1ac44f6f27ba5e16fa6369dde2b8352` |
| js/ui/hud.js | 1–2541 | `34025c6524ab09293553ea05907cc0e3b063a1d31b00a17e2f6707960477355f` |
| js/ui/live-region.js | 1–110 | `fa7f33bb32dd5969c997e473068141ebac23a13dc1b91d46e0b523f33952d6cc` |
| js/ui/results-sheet.js | 1–859 | `69bb166da8847b6fe21506fbf65ef1f7daf9d8ba613ef63f13f846ae3b12ebcc` |
| js/ui/setting-row.js | 1–233 | `0288cc4db3293c9bc61c73d1ebd61f2a1a782520bb2c570c8806ac013366acde` |
| js/ui/track-maps.js | 1–675 | `a9033bee5cd751c31e05fe82b80d3b6d6edb55b6aed92f6749d81a589c8f413c` |
| js/ui/watch-transport.js | 1–168 | `f367bd5b61e53587a26c949c12a0943b97b696c14d3ccd256f6cb1e8fa425181` |
| tests/data/html-sink-allowlist.json | 1–56 | `a65bbc89ce170c6d64673a5ae6f462975445545c52898972bed1c065d79d109a` |
| tests/unit/headless-api-vm.test.mjs | 1–274 | `e0cdf722ec58d758095ffea580ad65acccf3059169b2919f7cd3ece26c330d3f` |
| tests/unit/helmet-memo.test.mjs | 1–51 | `c1ec7e73eec2a76eb8151246ae130d7e3ce23ab2d96554c4406dd86cb6b8ebc4` |
| tests/unit/helmets.test.mjs | 1–440 | `6012d5bb6ccea6d0ae7e59682445294a25a83e8644eca2d14b494969e536a130` |
| tests/unit/home-world.test.mjs | 1–152 | `51b2995dbabfbdff84051e873b3a922405a51e02d082cb34f2646ddb5e360892` |
| tests/unit/hooks-documented.test.mjs | 1–123 | `c0f5278a0336061947a012411bf05e8dd1d72d5ff66625637b423785865bf7a7` |
| tests/unit/html-sink-lint.test.mjs | 1–84 | `de6d64c77808eb0624fed0e4c2639bcb33d25f54cdd7e85934f26161682b47ea` |
| tests/unit/hud-announce-lane-cache.test.mjs | 1–299 | `8b5003caf1cb3924080ff3b9d2c7c1bbdb684cf27d22acc19edb1edf8e47cbc4` |
| tests/unit/hud-arrange.test.mjs | 1–612 | `6246cc59822815b0b0b99034213910668f1bd147621f2b7e2e4e5a2a2a5ff9bf` |
| tests/unit/hud-control-clearance.test.mjs | 1–126 | `1a27a0fba85b0419c8870ad5bf796a00ec8837bc167f2646a022b8b640e0c4e9` |
| tests/unit/hud-dock-pack.test.mjs | 1–137 | `070bf158a3d17acafbeb88cedd7d7e24bb749e56f0883e16380e452b2bf2fd0d` |
| tests/unit/hud-elements.test.mjs | 1–227 | `3995b972eea7f092f3de8e1cdaa85e6f46f639d766d385e5cca3364a63303822` |
| tests/unit/hud-feel.test.mjs | 1–1446 | `6814f3abae9647fa8c7c975eb573d739c136a0ec153134f91996d1bdf33d0afc` |
| tests/unit/hud-fit-idempotent.test.mjs | 1–817 | `96115f01abf43083082d93176ec179bcce55eba3409068b861e5871c5cec59c4` |
| tests/unit/hud-gap-decimals.test.mjs | 1–101 | `f5177d124f20a9588cba137b6788b979aaa88d0b6eee19904a87d64cbbe9f054` |
| tests/unit/hud-helmet-placement.test.mjs | 1–51 | `0dc0a0a864df5d17150e5fd66f4af276ac3d8a122bebf4bbf4ec0af0c3536468` |
| tools/car/helmet-sheet.mjs | 1–223 | `cfd331a91ff5697451f90f5a9c93d55ade952be84b39f7a4674cc858be4e1036` |
| tools/car/parts-sweep.mjs | 1–1011 | `60df9d4b5ad7080a9c7a4444d892078d271c89030bbedf429efe1f7d01602949` |
| tools/check/html-sink-lint.mjs | 1–160 | `542d3287059fe79feead4f71ef581f25d378e7b9b4fe1a6df66421c567128e3e` |
| tools/lib/game-vm.cjs | 1–880 | `2fc70b5f4181bc698cbfdc51b6052e253f9b0fffab4fcd00ddfcb7ec0504ddc0` |
| tools/lib/hud-geometry.mjs | 1–148 | `c98a90747e10fdfc6411546b1670a21e1a343242615ab63a6fc01be4175cc108` |
