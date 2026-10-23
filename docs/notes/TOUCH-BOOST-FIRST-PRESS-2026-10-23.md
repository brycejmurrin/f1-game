# First BOOST press freezes ~0.74 s on iPhone (A·W15, 2026-10-23)

Bryce: "whenever I am in buttons steering mode and I take my finger off of throttle to hit boost the game lags".
PR #3611. Fleet A worker A·W15.

## 1. Result

| run (AWS Device Farm, iPhone 18 Pro Max, iOS 27.0, three.js WebGPU) | first BOOST tap, worst rAF gap in the 400 ms after it | later BOOST taps | control window (GAS held) |
|---|---|---|---|
| 3: live site, BEFORE | **742 ms** | 21–37 ms | max 19 ms |
| 4: live site, AERO tapped first | **737 ms** (first AERO tap: 47 ms) | 19–25 ms | max 33 ms |
| 5: four page loads in one Safari session | load 0 **734 ms**; loads 1–3 (incl. a no-warm control) 22–23 ms | 19–28 ms | — |
| 6: AFTER | see PR #3611 | | |

- **One-time, per Safari process.** Run 5's last load had no warm-up and no stall: the cost is paid once per process
  and survives a reload. A home-screen app launch is a fresh process, so the player meets it on the first BOOST of
  every session.
- **Outside the game tick.** `PerfSpans` during the 737 ms gap: frame max 24 ms (physics 20, render 5, hud 4,
  audio 2). The page also saw no event for 735 ms after BOOST's `pointerdown`. The time is WebKit's
  (style/paint/compositing of the HUD change), not `js/render/` and not the input handlers, which only set a flag.
- **BOOST-specific.** AERO's first tap (its own lit state, same glow family) cost 47 ms. Energy never deployed in
  these runs (ERS stayed 4.0 MJ with the thumb off GAS), so the energy-bar pulse animation was not involved.
- **Not throttle-specific.** The lift only matters because one right thumb works GAS and BOOST; the stall follows the
  first `#btn-boost.on`, whatever came before it.

## 2. Fix

`js/ui/hud.js` `boostWarmFrame`: the first time `#btn-boost` is on screen, the HUD draws `.on` for two frames and
clears it, so WebKit's one-time cost lands at race reveal instead of under the player's thumb. Paint only: the car's
`boostOn` is untouched, and the class goes through `hToggle` so its cache stays true. Pinned by
`tests/specs/touch-boost-warm.spec.js` (group `input`). Chromium does not show the stall; the device run is the proof.

## 3. Method

- Local (`tools/perf/touch-boost-probe.mjs`): CDP `Input.dispatchTouchEvent` at 844x390 hasTouch, rAF intervals, a
  `devtools.timeline` trace, tap vs control windows, `--from/--to none` controls. It cannot see this bug: this
  container has no GPU, TLX never ticks a race here and GLX runs ~1–2 fps under SwiftShader, and any DOM change costs
  the same ~300 ms of software recomposite (lift-only and tap-only alike).
- Device (`tools/perf/devicefarm-iphone.mjs run --touch N`): a remote access session + Appium endpoint; the race is
  started through `__apex` (Pages loads it only with `?apex`); real fingers are NATIVE_APP W3C touch actions. CSS px map
  to points as `(x·k, screenH − innerH·k + y·k)`: the WebView element's rect includes Safari's 64 pt top bar (run 2
  landed every tap 64 pt high). The page logs rAF gaps, the pointer stream, `PerfSpans` and the `Log` ring.
  `--variants a@live,b@fix --fix-url URL --cold` loads one page per entry, with a fresh Safari process between entries.
- Instance: AWS returns no `instanceArn`/`deviceUdid` for remote sessions; `mobile: deviceInfo` gives a per-phone
  uuid (run 4 `034D496E…`, run 5 `32CFAFDB…`), recorded per run. Safari's caches outlive a session on one phone
  (OrchA27 / A·D1), which is why run 6 compares BEFORE and AFTER inside one session with cold processes.
- Device minutes: runs 1–2 were tooling failures (about 2–3 metered minutes each); trial balance ~800 min at start.
