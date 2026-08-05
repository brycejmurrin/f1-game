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
`js/game/topmodal.js` does this; `tests/ui-button-touch.spec.js` walks the whole
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
(`js/game/input.js` pedals, `js/game/photomode.js` sticks and hold buttons,
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

This game puts `zoom: var(--ui-scale)` on every `.sheet`, and `--ui-scale` is
**1.0 with a mouse and 1.15 by default under `(pointer: coarse)`**. That single
fact makes a whole class of bug desktop-invisible: any un-scaled arithmetic
against a zoomed panel is exact on every development machine and wrong by
15–30 % on a touch screen.

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

Note the distinction `js/game/perf.js:45` already draws: a **jetsam/OOM kill**
leaves no signal at all — no `pagehide`, no `contextlost`, no error. Context
loss is the recoverable case; the silent one is not.

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

## 8. Gamepad UI conventions are settled — do not invent a mapping

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

The one place the guidance does not apply: it advises hiding a visible back
button when B goes back. That is a system-back-stack convention, and the
opposite of this codebase's rule — here Escape and B press the screen's OWN
visible control precisely so there is never a second code path.

---

## 9. Escape is a desktop-and-keyboard story

Worth stating because it is easy to lose: a bare iPad has no Escape key, so none
of §1 or §5 reaches a tablet being used with fingers. Touch-side correctness is
§2, §3, §4 and §7. Keep the two halves of a "controls" change separate when
reasoning about who benefits.
