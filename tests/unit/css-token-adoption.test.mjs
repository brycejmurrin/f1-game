/* css-token-adoption.test.mjs — the OTHER direction of the token contract.
 *
 * `css-tokens.test.mjs` asserts tokens -> consumers: no token in css/tokens.css
 * may go unread. Nothing asserted the converse — that a rule needing a size
 * READS a token instead of writing a literal — and the gap is exactly where a
 * year of layout drift accumulated. Measured 2026-08-13, on a sheet whose own
 * prose says the type scale is chosen for a landscape phone at arm's length:
 *
 *   372 font-size declarations, 158 via var(--fs-*), 198 raw literals,
 *   126 of them BELOW the deliberate 14px --fs-micro floor.
 *
 * That floor is not a preference. docs/research/UI-DESIGN-PRINCIPLES.md derives
 * it from the hardest legibility case this UI has and states outright that "a
 * rung that forces the smallest label UP is a feature, not a regression — that
 * was the original complaint". 126 declarations quietly opting out of it is how
 * the complaint survived being fixed.
 *
 * WHERE THE NUMBERS LIVE NOW. The four COUNTS this file used to freeze inline
 * (sub-floor font sizes, raw px spacing, raw colour literals, distinct colour
 * values) are `tree` entries in tests/data/ratchets.json, measured by
 * tools/check/tree-counts.mjs and checked by tests/unit/ratchets.test.mjs. They
 * carry `slack: 0`, which is how the ratchet spells the exact equality this
 * file always asserted: a migration must LOWER the number, not bank headroom
 * for the next three features. Ceiling history: docs/notes/CEILING-HISTORY.md.
 * The breakdown behind a failure — per-file counts, colour-fork groups —
 * is `node tools/check/tree-counts.mjs --offenders`.
 *
 * WHAT STAYS HERE is the half a count cannot express: the POLICY that says
 * which literals are legitimate, and the sheet LIST whose content is which
 * screen is density-blind rather than how many are.
 *
 * A RATCHET, NOT A BAN. Some literals are genuinely not sizes on the ladder:
 * hairline borders, a 1px inset shadow, the 2px focus ring. Driving these to
 * zero is not the goal and a hard ban would be argued around rather than met.
 *
 * SPACING policy (rewritten 2026-08-26, user-approved): a raw px spacing value
 * converts when it has an EXACT token form, including division forms (22/11 ->
 * --pad; 12/24/18/9/6/3 -> --gap multiples; 2/4/8/14/16 -> --gap sixths,
 * thirds, two-thirds, 7/6, 4/3, written as calc(var(--gap) / 3) style divisions
 * so the arithmetic stays exact). What stays literal: values with NO exact form
 * (5/7/10px), measured pairs whose comments record px arithmetic, position
 * ANCHORS, and any declaration inside a compact/rail-tier rule — those operate
 * at --gap: 8, where a 12-derived multiple is wrong at the rule's only
 * operating point. The old "a hairline should stay a hairline" rule was retired
 * when the tuner migration showed the density ladder SHOULD tighten hairlines
 * with everything else — that was the goal, not noise.
 *
 * COLOUR policy (set 2026-08-27 with the guard): a literal converts when an
 * existing token IS that value and that meaning. What stays literal, with
 * reasons in place: the mask-image alpha stencils (a stencil's black is not a
 * colour), the QR raster's pure white/black (scanners), FIA flag signal colours
 * (externally defined), canvas-matched values whose comments record the pairing
 * (.dh-gradbar, .dh-canvas), gradient RAMP stops chosen against each other
 * (tach, energy), and the BOOST/OT/AERO ladder whose alphas are measured
 * compositing arithmetic.
 *
 * SUB-FLOOR font sizes that stay: the `clamp(11px, …)` / `clamp(12px, …)`
 * viewport ramps in css/responsive.css (a lower bound is a floor for a phone,
 * not a chosen size); `.hud-gaps` in css/hud.css (a peripheral glance during a
 * lap, not menu chrome a stopped player reads — at --fs-micro it rendered as a
 * banner beside the minimap, same class as #hud-speed's raw 34px); and the
 * garage stacked-grid chip labels at min(8px, --fs-micro - 3px), measured
 * against the 7-column grid (SUSPENSION needs 47px in a 47px column interior
 * at 852x393; the relative form alone broke to 11px when the token moved).
 *
 * Run: node --test tests/unit/css-token-adoption.test.mjs  (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "../../tools/check/ratchets.mjs";
import { zeroSpacingSheets, microFloor, sheets } from "../../tools/check/tree-counts.mjs";

/* The four counts must stay RATCHETED. Deleting an entry from ratchets.json is
   a silent way to retire this guard, and the file that used to hold the numbers
   is the one place a reader looks for them — so it asserts they are still
   there and still exact. */
test("the four token-adoption counts are ratcheted at exact equality", () => {
  const tree = load().tree;
  for (const metric of ["subFloorFontSize", "rawSpacing", "rawColor", "rawColorDistinct"]) {
    const e = tree[metric];
    assert.ok(e, `${metric} left tests/data/ratchets.json — the adoption ratchet is gone, not passing`);
    assert.equal(e.slack, 0,
      `${metric} must keep slack 0: a migration lowers the number, it does not bank headroom ` +
      `for the next three features. That exactness is the whole property this guard has.`);
  }
});

/* The floor is read from the sheet, not copied here: if someone raises
   --fs-micro, the guard moves with it rather than keep asserting 14. This
   pins that the read still resolves — a broken scan reads as adoption. */
test("the --fs-micro floor still resolves from css/tokens.css", () => {
  const floor = microFloor(sheets());
  assert.ok(floor >= 10 && floor <= 30, `--fs-micro read as ${floor}px — the scan broke, not the sheet`);
});

/* The four sheets that read no spacing token at all. This is the list the
   migration works through; an entry LEAVING it is the win, and a new entry
   joining it is a new screen that cannot respond to density. */
test("the zero-spacing-token sheet list only shrinks", () => {
  /* data.css, hud.css, overlays.css and track-detail.css came OFF this list on
     2026-08-13 — they now read --pad / --gap and so move with the density
     ladder, which is what "things do not resize" actually meant.
     2026-08-18: responsive.css left too — the desktop title column now reads
     --gap for the skew gutter (CAREER hang). Remaining raw px there are
     viewport-absolute caps, not a density-blind sheet. */
  const KNOWN_ZERO = [];
  const zero = zeroSpacingSheets();

  const added = zero.filter((f) => !KNOWN_ZERO.includes(f));
  assert.deepEqual(added, [],
    `${added.join(", ")} spaces itself entirely in raw px and reads neither --pad nor --gap, ` +
    `so it cannot respond to the density ladder. Read the tokens, or add it to KNOWN_ZERO with a reason.`);

  const fixed = KNOWN_ZERO.filter((f) => !zero.includes(f));
  assert.deepEqual(fixed, [],
    `${fixed.join(", ")} now reads spacing tokens — remove it from KNOWN_ZERO in this file to lock that in.`);
});
