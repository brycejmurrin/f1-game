# Platform input & layout notes — the things that only bite on one device

Findings gathered while fixing the desktop Escape semantics and the iPad free
camera (build 1001). Each entry is here because it cost real time to work out,
is invisible on the machine most of this game is developed on, and would cost
the same time again next year.

The rule this file exists to serve: **a defect that only reproduces on one
platform will be attributed to the wrong cause unless the mechanism is written
down.** Every heading below is a mechanism, not a symptom.

---

## 1. A `<dialog>` opened during an Escape keypress is closed by the same press

**Symptom.** Escape appeared to do nothing. Measured: keydown → pause menu
shown, keyup → pause menu hidden again, one press, no visible change.

**Mechanism.** Chromium routes `<dialog>` Escape handling through the
**CloseWatcher** infrastructure, and a close request is tied to the key
*release* — the web-platform-tests suite has a file called
`close-watcher/esc-key/keyup.html`. Opening a dialog from a keydown handler
therefore creates a watcher that is live in time to consume that same
keypress's keyup.

**Fix.** `preventDefault()` on the Escape keydown you consume. This is portable
for two different reasons, which is the good kind of portable:

| engine | why Escape closes a dialog | why preventDefault stops it |
|---|---|---|
| Chromium | CloseWatcher close request on keyup | a canceled keydown suppresses the close request |
| WebKit | the older spec text — cancelling is the *default action* of the keydown | preventDefault cancels a default action |

WebKit's position on the CloseWatcher proposal is recorded as "No feedback so
far", so Safari is still on the older path. Do **not** `preventDefault()` an
Escape you did not handle: that suppresses closing for every dialog on screen.

**The related trap, from the same spec.** Anti-abuse rules group close watchers:

> if you open multiple `<dialog>`s within a single user activation, after using
> up your free one, a single close request will close both of them

and Chromium deliberately does **not** count Escape as a user activation. So an
Escape that closes one screen and opens another — exactly what a BACK ladder
does — is opening a dialog *during* a close request with no activation to spend.
Without the `preventDefault()` above, one press can collapse two screens.
`js/game/topmodal.js` does this; `tests/specs/ui-button-touch.spec.js` walks the whole
ladder to keep it honest.

Sources: WICG/close-watcher explainer (merged into the HTML Standard),
crbug 41484805, WPT `close-watcher/esc-key/`.

---

## 2. `setPointerCapture` throwing is spec'd behaviour, not a WebKit quirk

Pointer Events requires `setPointerCapture` to throw `NotFoundError` when the
`pointerId` "does not match any of the active pointers". The pointer can already
be gone by the time a `pointerdown` handler runs — a touch cancelled between the
event and the handler (a rapid tap, a gesture the system claimed) is the
documented trigger. Firefox threw `InvalidPointerId` before v82.

An unguarded throw aborts the rest of the handler, including any
`preventDefault()`, so the control reads as dead *and* the page keeps the
gesture. **Always wrap it.** Every call site in `js/` does now.

---

## 3. Touch pointers hold IMPLICIT capture, so hiding an element eats the `pointerup`

A touch `pointerdown` implicitly captures the pointer to the target element.
If that element is then removed or `display: none`'d **mid-hold**, the capture is
lost rather than released: `lostpointercapture` fires and **no `pointerup` is
ever delivered**. Any state the handler was holding — a movement vector, a hold
flag, a timer — latches at its last value forever.

`pointerleave` does not save you either: it does not fire for a captured pointer,
and it cannot fire on a `display: none` element.

**Net for every drag/hold control**, all four:

```js
el.addEventListener("pointerup", release);
el.addEventListener("pointercancel", release);       // iOS fires this routinely
el.addEventListener("lostpointercapture", release);  // the element being taken away
el.addEventListener("pointerleave", release);        // the mouse, which has no capture
```

This class of bug has now been fixed three separate times in this codebase
(`js/input/input.js` pedals, `js/camera/photo-cam.js` sticks and hold buttons,
`js/game.js` `#btn-cam`). If you add a fifth drag control, start from the list.

**And filter by `pointerId`.** A window-level `pointermove` that accepts any
pointer means a second finger anywhere on the glass drives a drag it never
started — which reads as "the control is broken" rather than "something else is
fighting it".

---

## 4. `zoom` changes the layout box, and anything positioned against a zoomed
element must scale with it

`zoom` is standardised now (CSSWG issue 5623) and, unlike `transform: scale()`,
it **changes the layout box** — the element genuinely occupies its scaled size.

This game puts `zoom: var(--ui-scale)` on every `.sheet`, and `--ui-scale`
ships at **1.0 on every pointer** (touch used to default to 1.15 under
`(pointer: coarse)` until the type floor made that combo too big). Raising UI
SIZE still makes a whole class of bug desktop-invisible at 100%: any un-scaled
arithmetic against a zoomed panel is exact at the default and wrong by 15–30 %
when the player dials up.

Both terms scale, not just the width: a zoomed element's own `right`/`top`
insets are in its local space too. The docked tuner panel really occupies
`(width + inset) × --ui-scale` from the viewport edge, which is what `--dock-px`
in `css/tuner.css` publishes. Derive from that, never from the raw width.

Conversely, a **non**-zoomed element must not divide its safe-area insets by the
scale. Both mistakes existed in `css/hud.css` at the same time, in adjacent
rules, in opposite directions.

---

## 5. The top layer is not orderable by z-index

A `showModal()` dialog computes `z-index: auto`. Ranking layers with
`parseInt(getComputedStyle(el).zIndex)` therefore scores an open modal as `NaN`
→ 0, and any visible background screen with a real z-index wins. Measured here:
with the standings sheet open over the pause menu, the "topmost layer" resolved
to the *title screen*.

Use `el.matches(":modal")` and rank it above every z-index. Support is
Chrome 105 / Firefox 103 / **Safari 15.6 (iOS & iPadOS 15.6, macOS 12.5)** — old
enough to rely on, and cheap to `try/catch` back to the z-index path.

Among several open dialogs the platform rule is *last opened wins*, which DOM
order approximates well enough here.

---

## 6. iPadOS drops the WebGL context when Safari is backgrounded

Documented in WebKit bug 261331 (reported specifically on iPadOS) and reproduced
across engines — three.js, Babylon, Unity and Cesium all carry the same issue.
iOS Safari is the most memory-restrictive WebGL host in common use, and the
limit has been *lowered* by point releases.

Already handled here — `js/render/glx.js:225-234` listens for
`webglcontextlost`/`webglcontextrestored` and reloads on restore, and
`js/game.js` persists a flag so a device that has lost a context once starts
more conservatively. Noted so the next person does not re-diagnose it.

Note the distinction the crash-sentinel section of `js/perf/governor.js` (`:91`)
already draws: a **jetsam/OOM kill**
leaves no signal at all — no `pagehide`, no `contextlost`, no error. Context
loss is the recoverable case; the silent one is not.

**The flag is `apex26.envProbeOff`, and it is a LATCH.** It is set only on a loss
that happened while the page was VISIBLE — that is the memory-pressure signal, as
opposed to the benign backgrounding loss this section describes — and until
recently nothing could clear it: one `setItem`, one `getItem`, no UI, no docs. A
device that lost its context once kept the live env probe disabled forever, which
presents as "reflections are just worse on my phone" rather than as a setting.
`__apex.envProbe(on?)` is now the way out (see `docs/DEBUG-HOOKS.md`); the value
is latched at module init, so a change needs a reload.

For the memory numbers behind all of this — the ~80 MB one circuit uploads
against a page a current iPhone SE kills at ~100 MB — see
`docs/research/CI-RENDERING-PERFORMANCE.md` Part 2. And for the OTHER silent iOS
failure in the same family, localStorage returning a zero quota in Private
Browsing, see `docs/research/ENGINEERING-PRACTICE-NOTES.md` §4.

---

## 7. `(pointer: coarse)` describes the primary pointer only

An iPad with a Magic Keyboard reports `pointer: fine`. Anything gated on
`(pointer: coarse)` therefore treats it as a desktop — which is right for
sizing and wrong for "does this device have a keyboard". Use `any-pointer` when
the question is about the *union* of attached inputs (see the `.pc-hint` rule in
`css/hud.css`).

And the answer **changes while the game is running**: docking or undocking a
keyboard flips it live. A `MediaQueryList` stays live, but a class computed from
it once at boot does not — subscribe to `change` (`Input.onPointerKindChange`).

---

## 8. SHIPPED: gamepad menu navigation, on the settled UWP mapping

Microsoft's UWP "Gamepad and remote control interactions" guidance is the
closest thing to a cross-industry standard, and it defines the mapping as a
translation of the KEYBOARD one rather than a separate scheme:

| keyboard | gamepad / remote |
|---|---|
| arrow keys | **D-pad, and the left stick too** |
| Enter / Space | **A / Select** |
| Escape | **B / Back** |
| PageUp / PageDown | left / right **triggers** |
| — | left / right **bumpers** page horizontally |

Consequences worth keeping in mind here:

- **A menu that works from the keyboard is most of the way to working from a
  pad.** The guidance says so outright: "A good way to ensure that your app will
  work well with gamepad/remote is to make sure that it works well with keyboard
  on PC." `js/game/menunav.js` already does the hard half (spatial XY movement,
  band-scoped, with wrap); a pad needs a seam into it, not a second
  implementation.
- **B is Escape.** Which means a pad's back button should press the same
  `data-esc-close` control the Escape key does, not a parallel path.
- **A held direction needs a repeat, and XY navigation only moves up/down/left/
  right** — a control reachable by neither axis from the current focus is
  unreachable, so the guidance's "inaccessible UI" warning applies to any layout
  with a diagonal relationship.
- **Focus must always be visible.** "One focus visual should always be visible on
  the screen so that the user can pick up where they left off" — on a pad the
  focus ring is the cursor, so an unfocused screen is a lost user. This is
  stricter than the keyboard case, where nothing is shown until you press a key.

**Gamepads do work on iOS/iPadOS** — Safari has had the Gamepad API since 10.3
and Apple ships the standard Xbox-style mapping, so the pad path is worth
building for tablets and not only desktops. One caveat to verify: there are
reports of pads being recognised in a Safari **tab** but not in a **home-screen
PWA** — the same tab-vs-standalone split as the Wake Lock bug in §9b, and worth
testing in one sitting since they are probably the same class of gap.

The one place the guidance does not apply: it advises hiding a visible back
button when B goes back. That is a system-back-stack convention, and the
opposite of this codebase's rule — here Escape and B press the screen's OWN
visible control precisely so there is never a second code path.

### The fix, shipped

`js/input/input.js`'s `pollGamepad()` now dispatches this exact mapping as REAL
synthetic `KeyboardEvent`s once `UiLayers.anyOpen()` is true — D-pad and the
left stick become arrow keys (with a hand-rolled hold-repeat: ~450 ms initial
delay, ~130 ms steady cadence, since a polled pad has no OS key-repeat of its
own), the triggers become PageUp/PageDown, the bumpers page horizontally
(there being no distinct horizontal-pane concept in this codebase, they
dispatch ArrowLeft/ArrowRight — the closest existing primitive). This is a SEAM
into `js/game/menunav.js`, not a second focus-mover: the dispatched events flow
through exactly the same `window`/`document` listeners a real keyboard drives,
so a menu that already worked from the keyboard picked up pad navigation for
free, as the guidance above predicted. `padActivate()`/`padEscape()` seed focus
the same way the first real arrow press already does (`MenuNav.currentItem()`)
so a lone A or B press before any direction still leaves one focus visual on
screen, per this section's own "focus must always be visible" note.

**One thing the research above did not anticipate, found while building this:**
B cannot simply dispatch a synthetic Escape keydown and rely on "the exact same
path a real Escape key already does" — because for the sixteen-plus screens
that are real `<dialog>`s (§1, §5), "Escape closes it" is a browser DEFAULT
ACTION tied to a **trusted** key event (Chromium's CloseWatcher takes the key's
*release*; WebKit's older path takes the keydown's default action). Neither
fires for a synthetic, `isTrusted: false` `KeyboardEvent` — measured directly
against a bare `<dialog>` with no listeners: an untrusted Escape keydown left
it open, where a real keypress (`page.keyboard.press`) closed it. This is the
same class of gotcha as `.click()` being required for A (see the guidance's own
"Enter/Space activates the focused button" caveat) — a default action needs
trust, a JS-registered listener does not. The fix meets `js/game/topmodal.js`'s
existing seam at a different point: for a `<dialog>` layer, B dispatches the
`cancel` `Event` that `TopModal.wire()` already listens for on every
`dialog.screen` (an ordinary `addEventListener` callback, which does not care
about trust), which does exactly what a real Escape does — presses the
screen's own `data-esc-close` control. For the handful of screens that never
became `<dialog>`s, `TopModal.onEscape` is itself an ordinary `document`
keydown listener, so a synthetic keydown reaches it exactly like a real one and
needs no special-casing.

Pinned by `tests/specs/gamepad.spec.js`'s "Gamepad menu navigation" suite — in
particular "B closes a native `<dialog>` screen (pause menu)", which is the one
that would have passed against a naive synthetic-Escape-only implementation in
a mocked-event test harness and only failed in a real browser.

---

## 9. Screen-edge system gestures — what is real, and what was a false alarm

**Investigated and closed with NO code change.** Recorded in full because the
first pass got it wrong in an instructive way.

**The claim.** A community iOS-PWA-games guide reports an undocumented touch
**dead zone** along the top edge in landscape on recent iPhones: taps silently
do not fire, and `env(safe-area-inset-top)` still reports 0px so nothing in CSS
reveals it. Acting on that would have meant moving five controls.

**What the evidence actually supports.** Every authoritative source describes
**swipe/pan recognisers, not taps**:

- Apple's `preferredScreenEdgesDeferringSystemGestures` exists so a native app
  can make the system ignore the FIRST *swipe* at a chosen edge.
- Before iOS 11, hiding the status bar implied that deferral; since iOS 11 it
  must be requested explicitly.
- Unity exposes the same thing as `deferSystemGesturesMode`: "the system ignores
  the first swipe".
- **Web content cannot request it at all** — WICG/proposals#146 (open since
  April 2024) asks for a web equivalent, and its stated use case is "Cloud
  Gaming PWAs to prevent accidental app closures", i.e. *swipes* dismissing the
  app.

No Apple documentation, WebKit bug, or independent developer report corroborates
a **tap** dead zone. One community guide is not enough to move five controls.

**And our exposure was overstated even if it were true.** `--tap` is 52px on a
coarse pointer, and these are `width/height: var(--tap)` boxes at
`top: calc(8px + var(--sat))`. On an iPhone in landscape (`--sat` = 0) the pause
button spans **8px → 60px**: roughly two thirds of it sits below any plausible
~20px reserved band, so the control would be *degraded*, not unreachable. On
iPad the status bar makes `--sat` non-zero and pushes it further clear.

**The real, documented risk that does apply to us is a DRAG that starts in an
edge band** — the system's Control/Notification Centre pan can claim it, and a
web page gets no say. That affects the free-camera look-drag, the garage
turntable and the telemetry scrub, none of which are buttons. The correct
mitigation is not to move anything; it is to survive losing the pointer — which
is exactly the `pointercancel` / `lostpointercapture` release net in §3, added
for iOS's habit of cancelling touches. The two problems have one fix, and it is
already in.

**The lesson worth keeping:** "a source said X breaks" is a hypothesis. Check
whether the mechanism the authoritative docs describe is even the same mechanism
(here: swipe vs tap), and measure your own exposure (here: a 52px button is not
"flush against the edge") before changing anything.

---

## 9a. FIXED: `#track-detail` claimed to be modal and was not

Verified in code, not inferred. `index.html` used to declare:

```html
<div id="track-detail" role="dialog" aria-modal="true" …>
```

but it was a plain `<div>`: no `showModal()`, so no top layer and **no inert
background**, and `grep` found **no focus trap anywhere in this codebase** —
`js/game/topmodal.js` gets containment from the platform, and nothing else
implements it by hand.

`aria-modal="true"` is not decoration. It instructs assistive technology to
treat everything outside the element as inert, so a screen reader removes the
rest of the page from its virtual cursor. Keyboard focus, meanwhile, walked
straight out of the div into `#select` behind it. The AT user was told the
rest of the page was gone and then Tab landed them in it — the worst
combination, and strictly worse than never having made the claim.

Escape already worked here (`data-esc-close="track-detail-close"`, §1). What
was missing was containment.

**Fix, shipped: made the claim true rather than withdrawing it.** `#track-detail`
is now a real `<dialog class="screen dim">` in `index.html`, migrated by the
exact same seam every other screen used — `js/game/topmodal.js`'s `MutationObserver`
on `hidden` already mirrors it onto `showModal()`/`close()`, and its `scan()`
selector (`dialog.screen`) picked the element up with zero code changes once the
class was added, so nothing in that file changed except a stale header comment
that still counted it among the non-dialog screens. `role="dialog"` and
`aria-modal="true"` were removed — the native element and `showModal()` now
supply that semantics for real, so the hand-written attributes would only have
been redundant duplicates of what the platform now asserts on its own.
`js/game/uilayers.js`'s `isModal()` (`el.matches(":modal")`) picked it up
unchanged too, since `#track-detail` was already in its `DEFS` list with no
special flags.

The one thing that needed a real check rather than reasoning on paper: a bare
`<dialog>`'s UA stylesheet defaults to `margin: auto`, and `css/track-detail.css`'s
`position: fixed; inset: 0` full-bleed layout had no explicit `margin` of its
own. `#track-detail`'s ID-selector rule already outranks the generic
`dialog.screen` class rule on every property both declare, so the existing
`display: flex` full-bleed layout survived unchanged; an explicit `margin: 0`
was added to `css/track-detail.css` anyway to remove any doubt rather than rely
on the auto-margin-resolves-to-zero case of the CSS2.1 abspos algorithm holding
identically across engines.

`tests/specs/menu-keyboard.spec.js` — "Tab cannot escape the track-detail dialog into
the select screen behind it" — pins the actual defect: opens `#track-detail`
from the select screen's circuit preview, confirms `showModal()` parked focus
inside it, walks Tab six times asserting focus never leaves the dialog, and
confirms it never lands on a control in `#select` sitting behind it.

---

## 9b. FIXED: the screen could sleep in the middle of a race

`grep` for `wakeLock` used to find exactly **two** hits, both in
`js/net/lobby.js` (`holdWake`/`dropWake`, lines ~1491-1554). The VS FRIEND
waiting room kept the screen awake. **A race did not.**

So on any phone or tablet the system idle timer runs during a Grand Prix and the
display dims, then locks. Severity depends on how you steer, and the worst case
is the one this game is proudest of:

| steer mode | events reaching the OS while driving | outcome |
|---|---|---|
| **tilt** | **none at all** — orientation is a sensor read, not user input | idle timer never resets; screen dims mid-race |
| touch / buttons | a `touchstart` and then a long *hold* | a hold is one event, not continuous activity |
| keyboard / pad | desktop; idle timer is not the same problem | fine |

Tilt is the mode with no input events by construction, so it is the one that
will always time out.

The API is available where it matters — Screen Wake Lock reached Safari/iOS
**16.4** and is now in every major browser. And the pattern is already written
in this repo: `lobby.js` requests `"screen"`, tolerates rejection, and — the
part that is easy to miss — **re-acquires on `visibilitychange`**, because the
platform releases the lock whenever the page is hidden and does not give it
back. Copy that shape; do not write a second one.

### The fix, shipped

`holdRaceWake`/`dropRaceWake` in `js/game.js` copy `lobby.js`'s shape exactly.
Held in `startRace` (so it covers every driving session, including the
count-in), dropped in `endRace` and in `quitToMenu` — the mid-race PAUSE > QUIT
exit that never reaches `endRace` at all, and the one `tests/specs/wake-lock.spec.js`
exists specifically to keep honest. The re-acquire needed **no new listener**:
the existing `visibilitychange` handler in `js/game.js` gained a third clause
beside the two it already had (auto-pausing a hidden race, arming/disarming the
crash sentinel).

Both requirements the lobby version encodes survived the copy: `navigator.wakeLock`
being absent and the request **rejecting** are both tolerated silently — see the
two dedicated specs in `tests/specs/wake-lock.spec.js`.

One caveat to verify on hardware: WebKit bug **254545** reports the Wake Lock
API working in a Safari tab but **not** in a home-screen PWA. Sources conflict
(iOS 16.4's release notes claim home-screen support). If it does fail there,
it fails in the exact host most likely to be used for a long session.

**It used to compound with §9c**: Low Power Mode is reported to force auto-lock
to **30 seconds**, so on a phone in Low Power Mode, steering by tilt, the
screen went dark about half a minute into the race — at the same time the
governor was finishing its own collapse. The two worst mobile defects in this
codebase bit in the same state, which is probably why "it goes wrong on my
phone" never resolved into one reproducible complaint. Both are fixed now.

---

## 9c. FIXED: Low Power Mode made the game degrade itself for nothing

**iOS throttles `requestAnimationFrame` to 30 fps in Low Power Mode.** Well
attested — WebKit bug 173434 discusses it as intended behaviour, and it applies
to CSS animations too. Low Power Mode is not rare: it turns itself on at 20 %
battery and plenty of people simply leave it on.

Now read `js/perf/governor.js` against that. The governor:

- downscales the render resolution when the frame EMA is **> 19 ms**;
- having downscaled, HOLDS (`_downHold`) and only creeps back up under sustained
  headroom of **< 12.5 ms**;
- and when the scale floor is reached, starts **shedding features** — env probe,
  lamp shadows and SSR, the car's sun shadow, then SSAO, god rays and bloom.

A 30 fps cap is a **33 ms** frame. That is nowhere near 19 ms, so the governor
downscales immediately; and it can never reach 12.5 ms no matter how much it
sheds, because the clock is clamped externally and has nothing to do with how
long the frame took to draw. The ladder therefore runs all the way to the
bottom and stays there.

**The result on a phone in Low Power Mode is that the game drives its own
resolution to the floor and switches off every optional effect, permanently, in
response to a battery policy rather than a performance problem.** Nothing in
the UI explains it, and it looks exactly like "this game runs badly on iOS".

### Simulated against the real constants

Replaying `tick()`'s own thresholds with every frame at 33.3 ms:

```
  t+ 1.5s  scale -> 0.9      t+14.0s  tier -> 1
  t+ 4.0s  scale -> 0.8      t+18.5s  tier -> 2
  t+ 6.5s  scale -> 0.7      t+23.0s  tier -> 3
  t+ 9.0s  scale -> 0.6      t+27.5s  tier -> 4
  t+11.5s  scale -> 0.5
```

**Twenty-seven seconds into a race it is at minimum resolution with every
optional feature switched off, and it stays there for the whole session** —
recovery needs `< 12.5 ms`, and no amount of shedding moves a clamped clock.

### Root cause, stated precisely

The governor uses frame **interval** as a proxy for frame **cost**, against a
hardcoded 60 fps budget. Those two are the same number only while the display
is the thing you are competing with. Under any externally imposed cap — Low
Power Mode, a 30 Hz panel, a browser throttle — they decouple completely, and
the governor spends the session optimising a number it cannot move.

There is **no way to detect Low Power Mode from a page**: the Battery Status
API is not in Safari at all, and `w3c/battery#9` ("Detect power saving mode")
has been open since 2017. Apple exposes `isLowPowerModeEnabled` to native code
only. So any fix has to be inferential.

### Two fixes, shipped, and they are complementary

**A — derive the budget instead of hardcoding it.** `PerfGov._floorMs` in
`js/perf/governor.js` tracks the *floor* of observed frame intervals (a low
percentile, not the mean — that is the fastest this display will go), pulled
down fast toward a newly observed faster frame and crept up slowly toward a
slower one, and the degrade/restore thresholds are relative to it instead of
the old hardcoded 19 / 12.5 ms. On a 60 Hz panel the floor settles near
16.7 ms and every threshold keeps its original value; under a 30 fps cap the
floor rises to ~33.3 ms and the device is correctly judged to be *meeting* its
budget. This restores the thing "19 ms" was always standing in for.

**B — make the degrade causal.** `PerfGov._pendingVerify` marks every
downscale/tier-shed step provisional: the *next* evaluation compares the EMA
before and after, and if it did not improve by a small margin, fill rate was
not the bottleneck, so the step is reverted and the governor holds off rather
than repeating it. This catches every cause of capping the derived budget does
not anticipate, at the cost of one wasted step — measured while tuning it: the
margin has to be small (0.5 ms here, not "meaningfully better"), or it also
discards real, working steps on a genuinely slow device and turns a settle
into an endless down/up cycle instead.

A is the right model; B is the safety net for when the model is wrong.
`tests/unit/perf-governor.test.mjs` exercises both against the real `tick()` logic:
a 30 fps-capped device settles at full quality, a genuinely GPU-bound one still
downscales and holds, and a reverted step does not repeat forever.

This was, on measured impact, probably the largest single mobile-quality
defect in the codebase.

---

## 10. PWA standalone is a different runtime from a Safari tab

The game is installable, so it has two hosts with materially different
behaviour. Worth knowing which one a bug report came from:

| behaviour | Safari tab | PWA standalone |
|---|---|---|
| viewport height | toolbar makes `100vh` ≠ visible height | fixed; `100vh` = `100dvh` = `innerHeight` |
| edge swipe | back/forward navigation | disabled **only while there is no navigation history** |
| storage | shared | **isolated** — one-time cookie copy at install, then fully separate |
| backgrounding | tab may be suspended | **killed and restarted from scratch** |
| Fullscreen API | iPad yes, iPhone never | n/a — standalone IS the chrome-less mode |
| orientation lock | unsupported on all iOS | manifest `orientation` ignored |

Three consequences for this codebase:

- **Storage isolation** means `apex26.*` localStorage in the installed app is
  NOT the same store as in a Safari tab. A player who "lost their career" may
  simply be in the other host. Worth asking before debugging.
- **Killed on background** makes the persist-continuously design correct rather
  than merely tidy; there is no resume, only a cold start.
- **Single-page architecture keeps the back-swipe disabled.** This game is one
  page and should stay that way — a real navigation would re-arm the left-edge
  swipe over the driving surface.

The viewport-unit advice in that guide (`100vh` only, never `100dvh`, because
the dynamic units are wrong on PWA cold start until a rotation "exercises" the
viewport) is **the opposite of the usual Safari-tab advice** this codebase
follows with `100svh`. Both can be right — they are different hosts. If a
cold-start layout bug ever shows up only in the installed app, this is the first
thing to check.

---

## 11. Two WebKit memory limits worth designing around

- **Canvas resizing leaks.** A confirmed WebKit bug grows memory on every canvas
  resize until the tab dies around 1.25 GB. Never recreate a WebGL context;
  resize the existing one, and resize as rarely as you can. `js/perf/governor.js`
  already avoids scale churn for a frame-cost reason — the same restraint
  happens to be a memory fix.
- **All canvases on a page share a 256 MB budget.** At `devicePixelRatio` 3 a
  full-res backbuffer is a large fraction of that on its own, which is an
  argument for capping render scale at 2x rather than chasing native density.

---

## 12. Headless rAF can silently report ZERO frames

Hit during this work: an in-page probe counted `requestAnimationFrame`
callbacks and got **0**, which made a perfectly good fly-camera look broken. The
page was not foreground.

`playwright.config.js` already passes `--disable-background-timer-throttling`
and `--disable-renderer-backgrounding`. The third flag in that family,
**`--disable-backgrounding-occluded-windows`**, is not set — it is the one
repeatedly cited as required since Chrome 87 for offscreen automation, and k6's
browser docs list it as "done for tests to avoid nondeterministic behavior".

**Do not add it without measuring.** The comment above those args records a
measured trap in exactly this area: `--disable-frame-rate-limit` looked like the
cure for hanging menu clicks and made them *seven times slower*, because a CPU
rasteriser told to render flat out obliges. The lesson recorded there — "the rAF
rate is not the lever; CPU headroom is" — applies to any flag added here.

The practical rule for agents: **an animation assertion that reads zero is
suspect before the code is.** Assert input plumbing and layout geometry, which
are deterministic, and leave integrated motion to a device or a foreground page.

---

## 13. Escape is a desktop-and-keyboard story

Worth stating because it is easy to lose: a bare iPad has no Escape key, so none
of §1 or §5 reaches a tablet being used with fingers. Touch-side correctness is
§2, §3, §4 and §7. Keep the two halves of a "controls" change separate when
reasoning about who benefits.
