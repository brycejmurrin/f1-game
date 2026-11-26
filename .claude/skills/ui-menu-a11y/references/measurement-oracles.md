# UI measurement oracles — axe, feedback, focus replacement

Moved from SKILL.md; the skill links here.

## Local automated evidence

The existing CSS loop accepts `--axe` to scan the opened screen with the locked
local axe-core package. See [free design tooling](../../../../docs/DESIGN-TOOLS.md).
Retain incomplete checks for review; automated results do not replace the
keyboard, touch, screen-reader, focus, and scroll checks in SKILL.md.

## Feedback measurement

Inspector output includes a separate bounded `feedback` inventory for nonempty
status/alert/live regions, including hidden descendants of an explicit root.
Its geometry and ARIA fields are observations: inactive panes and clipped
screen-reader announcements can be intentional. Summary rows say
`feedback-observation`, never an automatic accessibility failure.

For a journey requiring visible feedback, use the existing explorer replay:
`{"type":"assert","oracle":{"type":"feedback","selector":"#vs-status","text":"Paste their invite code first."}}`.
This requires one populated feedback element, matching rendered text and a fully inside
viewport/scrollport rectangle. It never scrolls, focuses or retries. CSS clips/masks, non-axis-aligned transforms and self-overflowing text remain
unmeasured. Occlusion, contrast and actual screen-reader delivery
need separate checks. Existing `text` and `visible` oracles keep their semantics.
Research and priorities: [agent UI measurement](../../../../docs/notes/AGENT-UI-MEASUREMENT-2026-10-30.md).

## Focus after controls are rebuilt

Arm a read-only witness while the expected starting control is focused, before
triggering the application update:

```json
{"type":"rememberFocus","id":"before-refresh","selector":"#team"}
```

Keep the player's ordinary click/keypress separate. Then use:

```json
{"type":"assert","oracle":{"type":"focus","selector":"#team","afterReplacement":"before-refresh","timeoutMs":3000,"stableMs":150}}
```

The oracle requires the remembered node to be disconnected and a unique new
matching node to hold sampled focus. A different expected selector permits an
intentional focus transfer. Same-node reinsertion never proves replacement.
Target changes, mismatches and sampling gaps restart the stability window; the poll
interval lives in `checkFocus`, the gap limit and timeline cap in `sampleFocus` (`tools/ui/explorer/browser.mjs`). Missing
witnesses, unobserved replacement, measured wrong focus and incomplete sampling
are distinct outcomes. A sampling gap is unmeasured time, not proof of a UI defect.

This v1 covers DOM replacement within one document. Updates retaining the old
node require a different completion witness; do not call their timeout a focus
failure. Each assertion consumes its witness; arm a fresh one for every update.
Reload clears witnesses; other navigation/evaluation errors propagate.
The check never focuses, scrolls or retries a player action. Sampling cannot prove
what happened between samples or after the observation window.
