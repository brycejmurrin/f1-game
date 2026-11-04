# Research D — the areas lane A never reached: UI/CSS touch targets, multiplayer wires, render boot (2026-11-04)

Kind: research · Re-measure-by: 2027-02-04

Lane D of the research hunt Bryce asked for (dispatcher chat, 2026-11-04 ~09:15Z: "launch two more fable hunters
in areas not covered, have them heavily use mcp tools like js debugger and apex lsp to help and web research and
opus subagents"). Scope: the "Not covered this round" list of `RESEARCH-A-TEST-GAPS-2026-11-04.md` minus the
slices lane C owns (race/sim, career/garage persistence, audio, CI tooling): the HUD, select, results and menu-nav
UI with `input.js`, all of `css/` and `index.html` (the ≥ 44 px touch-target check at BUTTON SIZE 245 %),
`js/net/lobby.js`, `netplay.js` 680–880 and 1280–1380, the quali/strategy/spectate wires, and `glx/*`,
`tlx-post`, `tlx-shadow`, `wgsl-*`, `js/lighting/*`, `renderer-boot.js`. Deploy tip `4fac7657`.

Method. `prior-art-scout` × 3 built the do-not-re-report list (DEFECT-LEDGER, docs/BUGS.md, every HUNT/BUG-HUNT/
RESEARCH note, the flaky quarantine, the open PR list: #4526–#4529 phone UI, #4752, #4754, #4772/#4790 BUTTON SIZE
label, #4782/#4806 HUD DOM budget, #4801, #4787/#4789/#4794 lane A fixes). Six `code-hunter` passes on Opus (HUD/
menus/input ×2, CSS/`index.html`, lobby/netplay wires, render boot ×2); every one hit its 35-turn cap, so the
"still not covered" list below is real. `apex-lsp` outlines on `lobby.js` (one 2,300-line `create`), `renderer-boot`;
`apex_select_specs` over the 34 in-scope files (all route; the gap is node-level, see lane A's coverage map).
Live: `tools/ui/layout-audit.mjs` geometry over 24 screens × {844×390, 390×844} (48 cells, `artifacts/logs/
layout-d.json`); `apex_hud_mock` at HUD 155 % / BUTTON 245 % over 5 cameras × 2 element sets; one Chromium through
chrome-devtools at 844×390 DPR 3 touch, iPhone UA, Bryce's 152-key export applied (`SettingsExport.applySettings`),
TLX `three` on the soft raster: title, select, portrait flips, a cold race entry timeline, rapid taps, rotation
mid-race. Node repros in the session scratchpad for rows 1, 3, 5 and 6 (the lobby lifecycle harness copied with
two new cases; the renderer-boot timeout harness with a claimed-refusal case; a throwing-storage select-screen
boot). `finding-verifier` on Opus over 25 rows: 20 CONFIRMED (several narrowed), 5 NEEDS-BROWSER, 0 refuted,
0 stale. `deploy-research` for the web (§Web research).

## Ranked findings

Rank is phone impact × confidence. CONFIRMED-LIVE = reproduced in Chromium this session; CONFIRMED-NODE = a node
repro in the scratchpad reproduces it on the tree; CONFIRMED = the verifier read the quoted lines; NEEDS-BROWSER =
the code matches but a real device decides. Effort: S < 1 h, M half a day, L more.

| # | Finding | Evidence | Why it matters on the iPhone | Proposed test / fix | Effort | Status |
|---|---|---|---|---|---|---|
| 1 | **The host leaving while a friend race is still building rewrites the guest's race rules under the build and starts a silent solo race.** Non-quali room: the guest's `finishStart` awaits `G.startRace()`. If the host's transport closes during that await, `G.state` is not yet `race`/`count` and `friendQualifying` is false, so `onClose` takes the "room is over" branch and runs `restoreOwnRules()` (its only guard is `netPlay.active()`, still false): laps, seed, difficulty, tyres are written while the build is reading them. `finishStart` resumes, `current()` is still true, and the `!sessions.size` arm does `close(); return` — no `G.announce`, no `quitToMenu` (the quali path at `:1364-1367` says "THE HOST LEFT"). | `js/net/lobby.js:302-311` (branch), `:919-921` (guard), `:1390-1397`; `js/ui/platform-session.js:368` (`inRace`); `js/game.js:2636` (`setState("count")` after the awaits). Node repro: harness `closableHarness`, GO with `revision` matching, `startRace` deferred, close the transport: `raceLaps` 3 → 5 and `difficulty` normal → hard before the build resolves, then no announce and `netPlay.start` never called. `net-lobby-lifecycle.test.mjs:2227` covers the quali path only. | A phone guest whose host backs out at the loading screen gets a race on the wrong rules against AI with no message; the "host left" line lands in the hidden lobby. | In `onClose`'s else-branch, when a start is in flight (flag or generation compare) skip `restoreOwnRules`/`show("pick")`/`setNetRoom`; let `finishStart`'s empty-room arm cancel + `quitToMenu` + announce, as the quali path does. Test: a non-quali twin of `:2227`. | S | CONFIRMED-NODE |
| 2 | **The host backing out of the friend-quali sheet leaves every guest to count down alone for 55 s.** Host BACK (`game.js:9072` → `quali-net.js:233-245`) reports NO TIME (`reportQuali(id, Infinity)`), which satisfies the guests' gate, but sends no cancel (QABORT is guest-only) and clears neither `selfReady` nor `_ready`. A guest's TO THE GRID → `finishStart` → NetPlay sends ARMED to the host's LOBBY session, which has no ARMED handler; the guest launches after `HOLD_MAX_MS` (55 s) and re-sends ARMED every second for the whole race. A second host START re-enters `openQualiForNet` on guests still on the sheet because the GO handler has no `friendQualifying` guard. | `js/net/lobby.js:2092-2103` (`abortQuali`, host branch), `:689-694` (GO), `js/net/netplay.js:1127-1135` ("LOBBY session pumps it, has no ARMED handler"), `:922` (`HOLD_MAX_MS = ARM_WAIT_MS + 10000`); `js/race/quali-net.js:83`, `:238`. The three `abortQuali` tests (`:2263/:2294/:2309`) are guest-only. | Qualifying is the normal GP-weekend flow; one BACK tap by the host strands the phone guest on a 55 s countdown with the host still showing the room. | Host `abortQuali` either refuses while guests qualify or broadcasts a `qcancel` that returns each guest to the room and clears `_ready`/`selfReady`; `!friendQualifying` guard on GO. Test: host in quali + `abortQuali()`, assert a cancel event per session and `roomState().selfReady === false`. | M | CONFIRMED |
| 3 | **A guest that un-readies inside one round trip of the host's START is dropped silently on both sides.** The guest's GO handler refuses (`!selfReady` at the host's revision) with `say(...)` only; nothing goes back. The host already ran `beginRace()`: it shows WAITING FOR RIVAL for 45 s, then hands the rival to AI; the guest sits in a live-looking room (the host's NetPlay pump keeps the heartbeat) and READY again goes to a NetPlay that ignores it. Un-ready paths: NOT READY, EDIT CAR (`setReady(false)` at `:2169`), a seat-clash move. | `js/net/lobby.js:689-694`, `:1297-1304` (START gate + `broadcast(GO, {revision})`), `:2169`; `netplay.js:913` (`ARM_WAIT_MS` 45000), `:1125`. Node repro: `selfReady` false, GO `{revision: 0}` → status "Review the host's race settings and press READY before starting.", zero events sent. | The window is one round trip, but EDIT CAR is a natural last-second tap on a phone; the result is a 45 s hang for the host and a dead room for the guest. | Auto-accept GO when `settingsAccepted` and `d.revision === settingsRevision` (the guest was ready at the revision the host saw), or send a NACK the host turns into an abort. Test: deliver GO at the current revision with `selfReady` false; assert start or NACK. | S | CONFIRMED-NODE |
| 4 | **At the WIDTH slider's low end (20–25) the landscape title grid collapses the CAREER MODES hero to 24 px wide.** Bryce's own export carries `titleLayout.wide.btns.width = 20` (the clamp minimum). The grid becomes 169 px; `#menu-hero` is one flex row, so `#mb-career` (min-width 24 px) is squeezed to 24 × 58 next to DAILY TIME TRIAL (131 px) and its label clips to "AREI / ODI"; SEASON and PRACTICE overflow their boxes. Sweep: 20 → CAREER 24 px; 25 → 63 px (TRACK DESIGNER overflows); 30 → 105 px, clean. No min-content floor exists on the grid or the hero row under `data-title-btnw`. | `js/ui/title-layout.js:69` (clamp 20..hi), `css/responsive.css:252-262` (`min-width: 0`; hero `width: 100%`), `css/components.css:685-699` (`min-width: var(--tap-min)`), `menus.css:776/:796` (compact floors). Live at 844×390 with the export: `#mb-career` 24×58, `scrollWidth` 38 > `clientWidth` 22; screenshot `artifacts/hud-mock-d/title-bryce-844.jpeg`. #4752 only centres the grid in portrait. | This is the setting on Bryce's phone: the one red hero door is untappable and unreadable at his WIDTH. | Floor the grid at its min-content (`width: max(var(--_tl-bw), min-content)`) or let the hero row wrap under ~30; or raise the wide-shape minimum to 30. Test: `title-menu-even.test.mjs` sibling that walks `--tl-btns-w` 20..40 in the VM and asserts `#mb-career` ≥ 44 px, or a `ui-scale`-style spec cell at 844×390 WIDTH 20. | S | CONFIRMED-LIVE |
| 5 | **A backend that claims the canvas and then refuses quickly is treated as a hang: the next cold boot runs WebGL2 and a strike is spent.** The `_initOwner.claimed` branch never checks `_createHung`; it reloads with `disarm=false`, the claim-skip boot keeps the probe (`!_claimSkipped`, since #4577), so the next cold start strikes ("never presented a frame — WebGL2 for this boot") and records `three:1`; `proved()` clears strikes only after a successful bind, so the ledger stays at 1 and one later jetsam or hang retires the pick. The file's own policy (`:401-402`, `:421-422`) says a live refusal keeps the pick and disarms the canary. iPhone path: TLX on three's WebGL2 leg (`tlxWebKitGL`/`tlxAutoGL`) claims `#game` through the lease (`tlx.js:553`, `gfx.js:252`), so any later `_fail()` is a claimed refusal. The `disposeKeepingContext` comment (`tlx.js:7159-7170`) describes a same-load GLX reuse that has been unreachable since 56500c0e. | `js/render/renderer-boot.js:373-375`, `:251`, `:271-289`, `:428`, `:445-447`. Node repro (the `renderer-boot-timeout` harness, `create()` claims `webgpu` then resolves null): boot 1 reloads once; boot 2 binds GLX, probe still `three`; boot 3 (backend healthy) warns "never presented a frame — WebGL2 for this boot", strike `three:1`; boot 4 binds three with the strike still in storage. `renderer-boot-timeout.test.mjs:118-169` covers hangs only. | Every "claimed refusal" costs Bryce one boot on WebGL2 and half of the two-strike budget that protects his TLX pick against a real jetsam. | Gate the claimed branch on `_createHung` (`reloadOnceIntoGlx(!_createHung)`); fix the stale tlx comment. Test: the claimed-refusal case beside `:143` asserting the probe is removed and no strike after the reload. | S | CONFIRMED-NODE |
| 6 | **Blocked `sessionStorage` shows "GRAPHICS RESET — retrying with lighter settings" on every boot, voiced, with RETRY starting a race.** `showCtxLostNotice` catches a throwing `getItem` with `pending = true` ("still show the card once if we were called") but it is also called unconditionally at module load with `G.state === "menu"`. | `js/ui/select-screen.js:205-211`, `:270`; `game.js:672`, `:4332` (the only other caller, a real loss). Node repro: throwing `sessionStorage` → card visible, `G.announce` and `LiveRegion.say` fired on a clean boot; working storage → hidden. `ctx-lost-notice.test.mjs` has no throwing-storage case. | Safari "Block All Cookies" (and some managed profiles) makes `sessionStorage` throw; the title then opens with a graphics-failure card and a spoken announcement every launch. | `pending = false` in the catch; the real-loss caller passes `{force: true}`. Test: a throwing-`getItem` case in `ctx-lost-notice.test.mjs`. | S | CONFIRMED-NODE |
| 7 | **Two tap-size tokens lose their floor once UI SIZE is lowered.** (a) `--tap-hud` is derived on `:root` from `--tap = max(44px, 24px / --ui-scale)`, so the menu UI SIZE slider at 40 % makes PAUSE and CAM 60 px and moves every `--tap-hud` anchor (right column, flag, radio card, track-detail). (b) The per-screen BUTTON HEIGHT look sets `--tap: calc(var(--tap-0) * look)` with no floor; at the coarse-pointer default (`--ui-scale` 1.09) 80 % paints ~45 px, but at UI SIZE 100 % it is 41.6 px and at 40 % 19.2 px, on `#select`, `#race-settings`, `#career`, `#carsetup`, `#datahub` and every dim popup. | (a) `css/hud.css:69-77`, `tokens.css:341`; consumers `hud.css:924,1177,1193,1255,1317,1347,2202,2275,2359,2481,2503`, `touch-controls.css:853,878,887,889,961,969,1010`, `track-detail.css:192-200`. (b) `css/overlays.css:1175-1180`, `js/ui/screen-looks.js:53`, `tokens.css:704/:712/:749`. No test pins either chain (`phone-touch-surface.test.mjs` pins `--tap` values and `--hud-btn-floor`). | Not Bryce's default, but both are one slider away and nothing measures them. | (a) build `--tap-hud` from a HUD-only base (44 px × `--hud-btn-z`); (b) `--tap: max(var(--tap-min), calc(...))` and the same for `--chip-h`. Test: `phone-touch-surface` asserting the `--tap-hud` chain never reaches `--ui-scale` and each `[data-look-*-btn]` rule carries a floor arm. | S | CONFIRMED |
| 8 | **Room-code hygiene: a full code room's code dies silently, and every HELLO re-sends the whole catch-up.** With three guests `reopenRoom(false)` consumes `codeReopen`; a later natural leave reopens or rotates only on a host eviction, so the code the host read out answers "Nobody answered" and the room says only "A player left". Separately, every accepted HELLO (≤ 5/s per peer) re-sends every other peer's HELLO plus `catchUpReady` to the sender, not only the first per connection. | `js/net/lobby.js:573`, `:525-527`, `:317-334` (`wasHostEvict` only); `:654-662`, `:795` (`HELLO_RATE`). | A phone host reads a dead code to the next friend; a chatty garage edit by one guest multiplies lobby traffic. | On a natural leave in a code room, `codeReopen = codeRoomCode; reopenRoom(true)` (or say "Room code closed — INVITE ANOTHER"); catch-up only on the first HELLO per connection id. Tests in `net-lobby-lifecycle`: full code room, close g2, assert `hostRoom` again; two HELLOs, count HELLOs sent back. | S | CONFIRMED |
| 9 | **Two small CSS misses on touch.** `#campicker` caps its height with `100dvh` against the house rule (svh; dvh deliberately not), so on iOS the CAM picker re-lays out as the toolbar slides. The season calendar tile's tooltip is `.track-row[data-tip]:active::before` on touch: it paints under the finger and only while pressed; season tiles are read-only divs with no other route to the "name · country" text. | `css/touch-controls.css:969`, `tokens.css:255-268`; `css/select.css:284`, `:303` (hover variant behind `(hover: hover)`), `js/ui/select-screen.js:795`, `:910`. | CAM picker jumps with the Safari toolbar; the season tip is unreadable on a phone. | `100svh`; show the tip in the hero/detail on selection (or a long-press popover). Test: a `dvh` grep guard with an allowlist; `phone-touch-surface` rule that no `[data-tip]` content is reachable only through `:active`/`:hover`. | S | CONFIRMED |
| 10 | **WGX's black-output probe can surrender a healthy night frame (desktop WGX only).** The probe reads a 4×4 patch of the HDR scene texture before exposure and calls three consecutive reads under `OUT_BLACK_EPS` 0.02 "black"; explicit-night ambient is ~[0.003, 0.005, 0.011] and the moon key ~0.1–0.2, so an unlit road or a dark car at the crosshair during the first 12 drawn frames trips `_outputBlackSurrender` → `_wgxEscalate` and a mid-session reload onto a slimmer rung. `_outProbeN` is never reset. Not Bryce's path: `_sceneProbeOn = !_outProbeOff && !WGX_LITE`. | `js/render/webgpu/wgx.js:497`, `:541`, `:681`, `:716-733`; `js/lighting/atmosphere.js:261`. `tests/unit/webgpu-lifecycle.test.mjs:59-78` already slices `_readOutputProbe` into a VM. | Desktop WGX at night; no effect on the iPhone (WGX_LITE). | Judge "black" by an absolute floor (~1e-5) or scale by 1/exposure and skip when key luminance < ~0.3; reset the counter on a scene rebuild. Test: the VM slice with f16 lanes ~0.004 (no surrender) and all-zero lanes (surrender after 3). | S | CONFIRMED mechanism; the trip NEEDS-BROWSER (the 12 probes are usually spent on the title flyby at `raceTimeOfDay` default, so only a default-night circuit's first frames or a night set before first draw can reach it) |
| 11 | **A guest that reloads and rejoins within the 6 s session timeout is moved off its own seat.** The rejoin mints `g(N+1)` while `gN` survives; the host relays the old profile with the lower rank, so `resolveSeatClash` on the returning player yields the seat ("X was taken"); both count toward `MAX_GUESTS`. Unproven: whether the old transport really outlives the reload (an SCTP abort would close it at once). | `js/net/lobby.js:24`, `:640`, `:648/:656`, `:1035`, `:1068-1103`; `js/net/session.js:22`. | A phone guest who pulls to refresh loses their driver. | Drop the older id when a new connection's HELLO matches a silent/departing peer. Device probe: reload the guest; log the host's "peer leave gN" vs "peer join gN+1" times. | S | NEEDS-BROWSER |
| 12 | **The reason a backend was refused never reaches the screen.** `apex26.gfxFallbackWhy` (canary strike, claim-skip, fetch timeout, hang) is read only by `__apex.diag()`, the bridge and bench; the player sees the SETTINGS label flip and, on a counted loss, the ctx-lost card. The opt-in `?gfxdebug=1` overlay prints `TLX REFUSED`/`WGX REFUSED` but never the canary/claim-skip reasons. | `renderer-boot.js:414-419`; readers `js/agent/apex.js:2428`, `apex-bridge.js:154`, `bench-run.js:197`; `gfx-debug-overlay.js:211-212`. | When Bryce's phone silently runs WebGL2 after a strike, nothing on the device says why (the phone bridge is the only read). | One line on the SETTINGS graphics row ("WebGL2 this boot: TLX never presented a frame last load"). | S | CONFIRMED (design gap) |

Narrow or by design, recorded, not filed: `input.js:1328-1337/:1820` stores canvas fingers in every steer mode so a
resting finger zeroes a released KEY's ramp-out in BUTTONS mode (needs a keyboard; not Bryce); the dock's
`--hud-z-dock` emergency floor of 0.5 paints 24/27 px taps on a crowded dock by design (`touch-controls.css:525-526`),
with a dead `calc(24px / max(1, s))` arm at `:494-495/:594-595`; the compact `.sheet` re-derives `--tap-paint` but not
`--tap-min` (`menus.css:866`), only min-width floors and only when the host is shorter than `--fit-at`; `100vw` caps
(`select.css:65/:68`, `touch-controls.css:966/:1010`, `overlays.css:234`, `responsive.css:314`, `hud.css:903`) are a
desktop-scrollbar issue; `#game-metrics` chips at 37.5 px are the debug overlay; `overlays.css:1586` raw
`env(safe-area-inset-bottom, 0)` is cosmetic; a `wire()` throw after `createNetwork` leaves an inert duplicate
`visibilitychange` listener (`lazy-bundles.js:412-419`, `lobby.js:2034`); the title rooms at 40 px and doors at
47 px in compact landscape are deliberate floors pinned by `title-menu-even.test.mjs:41/:46` (26/32 px) — under the
44 px the design note asks for frequent doors, but a decision, not a bug; `tlx.js:1104/:1121` `_shownAt` is also
stamped by a persisted `pageshow`, and the spec fires `visibilitychange` in the same task as the flag flip, so the
"loss resolves between the two" window is most likely closed (NEEDS-BROWSER, not filed).

Not reproduced live (leads): `hud-layout.js:746` writes the phone packer's moves as in-flow `margin-*` on cells that
share one max-content grid (`.hud-bottom`), so one cell's move can re-centre its siblings; after a rotate at Bryce's
settings the packer marked `#hud-speed` (−28.8 px) and `#hud-energy` and a 16-box pairwise check found no overlap.
One race entry (`go()` 2.5 s after `race()`, before the countdown) painted the right dock at full 245 % with
`--hud-z-dock` unset: BOOST at y −198 and BRAKE clipped at y −9; a cold entry through the countdown had the cap in
place before the buttons appeared, so this is a harness ordering, not a player path. The window error
"ResizeObserver loop completed with undelivered notifications" fired once more on race entry (lane A's lead).
`layout-audit` reported `#sel-preview-map` BLANK/undrawn at 844×390 but the live map is 44×64 CSS with a drawn
120×177 buffer: the audit samples before the first draw (a tool false positive worth a settle wait).

## Touch-target census at 844×390 and 390×844

`layout-audit` geometry (house floor `--tap` 52 on touch, WCAG floor 24), 48 cells, shipped settings: **no tap
under 24 px anywhere; no tap under 44 px except the title rooms/doors above**. 125 distinct controls sit between 44
and 52: every settings prev/next stepper (48×48), `.sel-chip` (48×48), the garage `#cs-tab-*` row (44–77 × 48),
`#track-detail-close`, `#vs-close`, `#cz-color`, the pause `#pm-strategy/#pm-review/#pm-practice` in portrait
(94×48). Clipped: `settingsappearance` portrait (3 layout-preset thumbnails, by design), `trackdetail` portrait
(`#track-detail-canvas` and legend past `#track-detail-canvas-wrap` by 64 px, a real clip at 390 wide). Deep
scrollers (> 3 screens): `#cs-options` 9–18 screens, `#pm-settings-body` on APPEARANCE 18 screens landscape, `#ss-cal`/
`#ss-pool` 5–6. `apex_hud_mock` at HUD 155 % / BUTTON 245 %, 5 cameras × {shipped, all-on}: 0 overlaps, 0 unsafe,
0 small taps, min font 14 px. Live with Bryce's export: 0 controls under 44 on select; race taps 90 px, holds 176 px.

## Web research (deploy-research, 2026-11-04)

WebKit, iOS 26 Safari and Home Screen: 254868 (open since 2023, touched 2026-06) `100svh`/`-webkit-fill-available`/
`visualViewport.height` short by the safe-area insets in standalone apps with `viewport-fit=cover`; 322900 and 323322
(NEW, 2026-08/09, Safari 26) standalone `visualViewport` permanently ~68 px short after the first keyboard, and a
phantom keyboard inset on resume; 300523 (NEW, iOS 26 Dynamic Island) viewport shifts up on scroll/keyboard close;
301994 (REOPENED 2026-10-22, iOS 26.1) status bar stays over fullscreen Home Screen apps; 191872 (open since 2018)
safe-area `env()` set some time after load in WKWebView; 328322 (Nightly) in-app browsers ignore `dvh/svh/lvh`;
240917/222632 `pointercancel` not fired with `touch-action: manipulation` / on drag start. WebGPU: 311598 (NEW,
2026-04) submitted compute buffers stall on iOS 26.3 with no device-lost; 315186 (RESOLVED 2026-05) black screen on
Safari 26.4 WebGPU (a buffer-map regression class: assert a non-black first frame on 26.4+); 312563 (NEW, 2026-04)
memory leak on repeated resolution changes forces a reload (render-scale and rotation texture recreation); 329399
(NEW, 2026-10-29) a long-lived `GPUTextureView` grows GPU-process memory per command encoder; MDN: `requestAdapter`
resolves `null`, never rejects. three.js r187 (2026-10-30): render-target dispose crash fix, depth-only targets,
parallel `compileAsync`, no device-loss entry; #35069 (closed 2026-10-19 as a browser issue) "Texture already
initialized" on iOS Safari during `compileAsync()` (shadow depth texture) on iOS 27 — wrap `compileAsync` in a
try/catch; PR #35068 handles a rejected `popErrorScope`. WebRTC on iOS: no authoritative 2026 source on ICE restart
or data channels while suspended; device evidence only. Techniques: axe-core 4.5+ `target-size` (WCAG 2.5.8, 24 px)
is off by default and needs the `wcag22aa` tag; Lighthouse tap-targets uses 48 px (pick one floor for a gate);
pixelmatch default threshold 0.1 with AA ignored; headless Chrome cannot screenshot a WebGPU canvas on Linux (pixel
readback only); WGSL CLI validators (naga, tint) not verified this round.

## Still not covered

Each hunter stopped at its cap. Unread: `hud.js` 100–460, 580–823, 1022–1440 (most of `fitPass`, the minimap);
`hud-layout.js` 1–150, 269–520, 780–1290 (MOVE & SIZE fold); `results-sheet.js` 1–250, 400–650, 794–913
(`buildStandings`, `ShareCardChips`); `select-screen.js` 1–140, 272–570, 1050–1636 (save banner, track-detail panel);
`input.js` 1–985, 1427–1540, 1650–1800, 2460–2635; most of `hud.css` (161 KB), `menus.css`, `overlays.css`,
`race-setup.css`, `settings*.css`, `title.css` outside the cited ranges, the portrait `data-shape="tall"` blocks and a
fixed-width-over-390 sweep; `lobby.js` 1520–1640 (`makeAnswer`, `acceptAnswer`, scan, the link path), `netplay.js`
1–480 and 1134–1280, `lobby-roster.js`, `lobby-settings.js` beyond RULES; all of `glx/shadow.js`, `wgx-shadow.js`,
`wgx-post.js`, `wgsl-chunks.js` (FrameU vs CPU scratch), `wgx.js` `_wgxEscalate` ladder and `device.lost` ~800,
`glx/post.js` 321–1150 (`present` ordering), `tlx-post.js` beyond 744, `tlx-shadow.js` beyond the outline,
`presets.js`/`profiles.js`/`frame-lights.js`/`track-lights.js`/`knobs.js` bodies (mid-race preset switch, race → menu
→ race state), `atmosphere.js` 425–655 (weather). Entry points no unit test reaches: `input.js` `onPointerKindChange`,
`lockLandscape`/`unlockLandscape` (an unlock landing while `lock()` is pending, `:2007-2021`), `onCanvasPointerMove`;
`select-screen.js` Escape-clears-search `:606-614`, F-key favourite `:583-598`, daily-chip reset `:984-993`,
`showCtxLostNotice` with throwing storage; `results-sheet.js` ghost COPY fallback `:711-723`, DOWNLOAD cancel/failure
labels `:766-768`; `hud-layout.js` `watchPackUnhide` (0 hits), blur → preview hand-off `:1381-1393`, `paintTap`
overlap naming `:1414-1431`; `hold-buttons.js` `secondaryTap` blur/resize/orientationchange clears,
`lostCaptureShouldRelease` for a synthetic press; `lobby.js` the GO-refusal branch, host `abortQuali`, `onClose`
during a non-quali build, code reopen on a guest leave, a rejoin while the old session lives, repeated QABORT, QGO with
`settingsAccepted` false; `renderer-boot.js` the claimed-refusal path, `cappedEarlyAdapter`'s 4 s null `:507-515`,
`proved()` with `_backendBound` false; `tlx.js` `onDeviceLost` hidden branch + `onVisible` reload, the within-3 s
branch, n ≤ 2 reload, n = 3 AUTO latch and `raceEntryActive` branches, `webglcontextrestored` budget `:1216-1224`,
`applyResize`/`resize`/`resizeNow` `:4685-4791` (DPR change, `maxTextureDimension2D` clamp, `_warmPending`); `gfx.js`
`createInitOwner` Proxy `set` after abort, `_ownedOrDiscard` dispose-on-revoke; `wgx.js` `_wgxEscalate` and
`_readOutputProbe` (regex pins only). Not done this round: a real two-device VS FRIEND run (rows 1–3 and 11 are
harness- and code-level), the live `:active` tooltip check on iOS, a real-iPhone read of rows 5 and 11.

## Issues filed

All `ready` plus an `area:*`; PR #4810 carries this note.

| Row | Issue |
|---|---|
| 1 | #4813 net: the host leaving while a friend race is still building rewrites the guest's rules under the build and starts a silent solo race |
| 2 | #4814 net: the host backing out of the friend-quali sheet leaves every guest to count down alone for 55 s |
| 3 | #4815 net: a guest that un-readies inside one round trip of START refuses GO silently |
| 4 | #4816 ui: the title WIDTH slider's low end collapses the CAREER MODES hero to 24 px (Bryce's export has WIDTH 20) |
| 5 | #4817 render: a claimed quick refusal is treated as a hang (WebGL2 next boot, a strike spent) |
| 6 | #4818 ui: blocked sessionStorage shows the GRAPHICS RESET card on every boot |
| 7 | #4819 css: `--tap-hud` inherits `--ui-scale`; BUTTON HEIGHT look scales `--tap` with no floor |
| 8 | #4820 net: dead room code after a full room's guest leaves; catch-up on every HELLO |
| 9 | #4822 css: `#campicker` 100dvh; season tile tooltip `:active`-only |
| 12 | #4824 render: `gfxFallbackWhy` never reaches the screen |

Not filed: row 10 (WGX night black-surrender: mechanism confirmed, the trip needs a real desktop GPU at night), row 11
(rejoin seat clash, NEEDS-BROWSER), and the narrow/by-design list.
