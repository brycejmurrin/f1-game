# UI hunt 5: feedback, composition and background focus

Five product mechanisms were reproduced on fetched deploy
`9e5063c78d4db11e8763342b74777a9b4bfa08e3` in an isolated worktree. Their
relevant source files remain unchanged through fetched deploy `661492189`.
The baseline excludes pending menu redesign #4297; its known Home text reflow
work was not refiled as a new defect.

A prior-art scout excluded 30 recorded items. Three read-only source hunters
and independent verifiers traced candidates before the parent ran browser
probes. One pending-import race suspicion was withdrawn: `scheduleDraft`
already invalidates the replacement generation. No worker used a browser.

## Findings and ownership

| Finding | Measured behavior | Tracking |
|---|---|---|
| Designer status hidden | Native invalid import at 844×390 writes an error into the sole status region, but computed display is none and its rectangle is 0×0. | #4382; CSS owned by open #4300. |
| Composing keys intercepted | Synthetic isComposing:true ArrowDown moves Settings search focus to a result; composing Escape closes Settings. | #4385; MenuNav owned by open #4279. Native OS IME remains unmeasured. |
| Delete confirmation loses focus | Native SAVE → MY CIRCUITS → keyboard DELETE moves focus from DELETE to BODY. Confirmation remains after a pane round trip. | #4383; designer.js owned by open #4301. Confirmation lifetime is a separate product-policy decision. |
| Home synthetic paging no-op | At 200% UI size, gamepad-equivalent PageDown changes no scroll position in landscape or portrait. Native keyboard PageDown does move the internal column. | #4384; MenuNav owned by open #4279. Hardware gamepads remain unmeasured. |
| LIVE AUTO loses sort focus | A successful mocked refresh disconnects focused TEAM; its replacement stays selected, but focus becomes BODY. The next native arrow jumps to LIVE. | #4386; ready. |

Relevant current PR diffs and open issues were checked. #4273 and #3108 cover
different findings; #4360 concerns a weak test wait, not the Home paging
behavior. Four product issues carry ownership-blocked labels. The research
does not implement or close them.

## Reproduction and causal evidence

**Designer feedback:** Home → Track Designer → SHARE & FILES → IMPORT; choose
an invalid text/JSON file. The real importer writes `That share code was
refused (magic)`, but the status is not rendered. `designer.js:813` creates
`.td-msg`; `workspace.js:38` moves it into the footer. Short landscape selects
`data-foot=in` and `css/editor.css:785` hides it. A typed MCP inspection and
native import independently confirm the mechanism. Save/storage-warning
messages share that container, but not every message variant was replayed.

**Composition:** open Settings, fill and focus Find a setting, then dispatch
cancelable bubbling KeyboardEvents with `isComposing:true`. Assert that the
property actually reads true. ArrowDown is prevented and moves focus to a
result button; Escape is prevented and closes the dialog. Global handlers in
`menu-nav.js:561–572` and `modal.js:145–170` omit the guard that already exists
in `SettingsSearch.onEscape`. These are handler-contract checks, not a claim
about every physical IME's event sequence.

**Deletion:** save the initial valid circuit in disposable storage, open MY
CIRCUITS, focus DELETE and press Enter. `renderLibrary` removes the focused
card at `designer.js:1504,1519` without preserving logical focus. The measured
focus loss is the defect. Whether leaving the library should cancel the
still-visible DELETE? confirmation is a design decision; no second deletion
or unsafe data loss was demonstrated.

**Paging:** use the real UI-size path at 200%, focus CAREER MODES and dispatch
the synthetic PageDown used by `padDispatchKey`. Home's internal column has
299 layout-pixel client height / 467 content in landscape and 511 / 904 in
portrait. All scroll positions remain zero. Native keyboard paging moves the
child. `MenuNav` omits `#menu-buttons` from its scroller list and it has no pane
class; synthetic events lack the browser's native scroll fallback. Extend
paging coverage to this region, not just the circuit strip.

**AUTO:** use the full shell and native Data Hub → LIVE controls with mocked
provider data. Enable AUTO, select/focus TEAM, invoke the app's captured
30-second callback and resolve a deferred successful batch without another
input action. `live.js:253` clears the data pane and recreates sort controls
at `:351–360`. Session-generation guards do not preserve current-response
focus. Failed/auth-gated updates preserve the old pane and are a different
path. Extend the existing AUTO-settlement case in `data-lifecycle.spec.js`
with logical-focus and next-arrow assertions.

Eight completed adversarial cases recorded zero JavaScript page errors. An
initial LIVE probe used a button-role locator for a tab and stopped before
AUTO; correcting the harness selector and rerunning only that case did not
change product source or tolerances. Original and targeted records were kept.

## Research used to define the checks

- [W3C Focus Not Obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)
  permits partial component visibility at its minimum level. Complete control
  visibility and focus-ring visibility are separate checks; partial clipping
  alone was not called a conformance failure.
- [W3C Error Identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html)
  requires identifying invalid input and describing the error in text. It
  does not mandate one focus or presentation mechanism.
- [W3C Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)
  scopes its two-dimensional exception to parts that require that layout.
  Ordinary menu/form controls were assessed separately from the design canvas.
- [Xbox XAG 113](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/113)
  and [XAG 115](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/115)
  informed focus continuity, recoverable feedback and confirmation checks.
- [MDN isComposing](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/isComposing)
  describes the composition-session flag. Native browser/IME compatibility is
  a further test, not established by a synthetic event.

This is scoped engineering evidence, not accessibility certification.
Physical iOS/Safari, OS IME, hardware gamepad, screen-reader speech, live
OpenF1 reliability and GPU behavior remain unmeasured. Screenshots supplement
interaction/focus/DOM records; they do not establish them alone.

## Tooling finding and evidence transfer

#4389 records a separate observed tooling race on merge `69bd078a` (published
c6fb802f plus fetched661492189). The 731-file local run ended 729 pass / 2 fail:
known linked-worktree assumption #4317, and shell-ids opening a deleted
temporary probe module. The sole writer in `prepush-floor.test.mjs:148–155`
creates/removes the probe in the shared checkout; the scanner enumerates then
reads. Their logged intervals overlap on that path. Cause is source-traced;
a paired standalone replay and dynamic base comparison were not performed.
Source equality with the base does not establish a base-red verdict.

Proposed correction: serialize that mutating fixture through existing
`isolatedFiles`, or move it to an independent repository fixture. Do not weaken
the scanner to ignore arbitrary missing files. No quarantine or retry was
used to turn the observed result green.

Hosted F1 MCP status/help/doctor worked; its busy remote browser was left
untouched. Local typed `apex_ui_inspect` recorded exact SHA, viewport and the
hidden status style. The advertised ownership tool was unknown to its server,
so supported GitHub REST supplied current PR diffs. Local source LSP and
parent-owned Chromium supplied the remaining trace and interaction evidence.

Raw JSON, identities, PNGs and reproduction scripts stay in ignored
`artifacts/menu-hunt/` in the research worktree. The user-facing evidence bundle
is checksum-verified; GitHub issues above retain complete portable repro steps.
CI artifacts for #4297 return Forbidden, so its exact selected-2 assertion is
still unread; the separate CI-repair status belongs in that PR's live Plan.
