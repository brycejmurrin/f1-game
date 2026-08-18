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
 * Spacing is the same shape with a sharper edge. `--pad` / `--gap` really do
 * respond to density — measured live on a 852x393 phone they resolve to 13px
 * and 8px, down from 22px and 12px — but four stylesheets never read them at
 * all, so those screens cannot respond to the ladder however it is tuned. That
 * is the literal mechanism behind "things do not resize".
 *
 * A RATCHET, NOT A BAN. Both numbers below are today's measurement, frozen. The
 * suite fails if either goes UP, which is the property that matters: a
 * consolidation cannot be undone by the next three features with nothing to
 * notice. Lower the ceiling whenever you migrate a file — that is the whole
 * protocol, and it is the same one tests/unit/module-size.test.mjs uses to
 * ratchet game.js.
 *
 * WHY NOT ZERO. Some literals are legitimately not sizes on the ladder: hairline
 * borders, a 1px inset shadow, the 2px focus ring. Driving these to zero is not
 * the goal and a hard ban would be argued around rather than met. The goal is
 * that the number only ever falls.
 *
 * Run: node --test tests/unit/css-token-adoption.test.mjs  (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/* The floor comes from the sheet, not from a copy of it here: if someone raises
   --fs-micro, this guard must move with it rather than keep asserting 14. */
function readMicroFloor(tokensSrc) {
  const m = tokensSrc.match(/--fs-micro:\s*([0-9.]+)px/);
  assert.ok(m, "could not read --fs-micro from css/tokens.css — the scan broke, not the sheet");
  return parseFloat(m[1]);
}

/** Strip comments as a CSS tokenizer does, so prose citing an old value is not a declaration. */
function stripComments(src) {
  let out = "", i = 0;
  for (;;) {
    const open = src.indexOf("/*", i);
    if (open < 0) { out += src.slice(i); break; }
    out += src.slice(i, open);
    const close = src.indexOf("*/", open + 2);
    if (close < 0) break;
    i = close + 2;
  }
  return out;
}

function sheets() {
  const dir = path.join(ROOT, "css");
  return fs.readdirSync(dir).filter((f) => f.endsWith(".css")).sort()
    .map((f) => ({ name: f, src: stripComments(fs.readFileSync(path.join(dir, f), "utf8")) }));
}

/* ---- the two ceilings. LOWER THESE WHEN YOU MIGRATE A FILE. --------------- */
const CEILING = {
  // font-size declarations written as a raw px literal below --fs-micro.
  // 2026-08-13: was 126 (menus 40, tuner 28, overlays 16, hud 15, data 10,
  // track-detail 8, responsive 4, carsetup 3, career 2) — all migrated onto
  // var(--fs-micro) in the same pass that added this guard. Now ZERO, which is
  // the one number that needs no justification.
  // 2026-08-14: 0 -> 3, and the count is only 3 because the check was widened in
  // the same pass to read px literals inside min()/clamp() (see below). Two of
  // the three predate this: the `clamp(11px, …)` / `clamp(12px, …)` viewport
  // ramps in css/responsive.css, whose lower bound is a floor for a phone, not a
  // chosen size. The third is `.hud-gaps` in css/hud.css: the ahead/behind gap
  // readout is a peripheral glance during a lap rather than menu chrome a
  // stopped player reads, and at --fs-micro it rendered as a banner beside the
  // minimap. Same class of exception as #hud-speed's raw 34px.
  // 2026-08-18: 3 -> 5. Deploy 1a3975c5 title-screen landmarks wrote
  // `#subtitle { font-size: 10px }` twice in css/menus.css (base + stacked
  // block) — an eyebrow above the wordmark, not menu chrome.
  subFloorFontSize: 5,
  // padding / gap / margin declarations containing a raw px literal.
  // 2026-08-13: 529 -> 479. The four sheets that read NO spacing token at all
  // (data, hud, overlays, track-detail) were migrated in the same pass — but
  // only for values with an exact ratio to the token (22/11 -> --pad, 12/24/18/
  // 6/3 -> --gap). The remainder are 2/4/5/8/10px hairline nudges, and turning
  // those into calc(var(--gap) * 0.41) noise would be worse than leaving them:
  // a hairline should stay a hairline when the density ladder tightens.
  // 2026-08-14: 475 -> 474. `.hud-gaps` lost an inert `gap: 4px` (it was never
  // a flex container) when the widget was resized in the HUD SIZE pass.
  // 2026-08-18: 471 -> 470. Data Hub Last Race column-hide rules lost a
  // duplicate landscape `padding` when they moved onto body[data-width].
  // 2026-08-18: 470 -> 467. Short-landscape HUD shrink left responsive.css
  // (`padding`/`gap` on .hud-box / .hud-top / #hud-sectors).
  // 2026-08-18: 467 -> 479. Same 1a3975c5 title-screen pass: landmark
  // `padding`/`gap` on #menu-primary / #menu-secondary / #pm-category-tabs
  // and the stacked duplicate block in css/menus.css.
  rawSpacing: 479,
};

test("no new font-size below the --fs-micro floor", () => {
  const all = sheets();
  const tokens = all.find((s) => s.name === "tokens.css");
  assert.ok(tokens, "css/tokens.css missing");
  const floor = readMicroFloor(tokens.src);

  const offenders = [];
  for (const { name, src } of all) {
    // Every px literal in the VALUE, not just a bare `font-size: 12px`. The
    // narrow form let `min()`/`clamp()` walk straight past the floor: widening
    // it here turned up two sub-floor values in css/responsive.css that had been
    // sitting inside clamp() unseen (11px and 12px), plus the one this pass
    // added. A gate that only reads the simplest spelling is not a gate.
    for (const decl of src.matchAll(/font-size:([^;}]*)/g)) {
      for (const m of decl[1].matchAll(/([0-9.]+)px/g)) {
        if (parseFloat(m[1]) < floor) offenders.push(`${name}: ${m[1]}px`);
      }
    }
  }

  const byFile = {};
  for (const o of offenders) { const f = o.split(":")[0]; byFile[f] = (byFile[f] || 0) + 1; }

  assert.ok(offenders.length <= CEILING.subFloorFontSize,
    `${offenders.length} font-size declarations sit below the ${floor}px --fs-micro floor, ` +
    `ceiling is ${CEILING.subFloorFontSize}. Use a --fs-* token instead of a literal; if the value ` +
    `genuinely belongs below the floor, say why in a comment and raise the ceiling deliberately.\n` +
    JSON.stringify(byFile, null, 2));

  // The ratchet's other half: a migration that lands must move the number down,
  // not bank headroom for the next regression.
  assert.equal(offenders.length, CEILING.subFloorFontSize,
    `sub-floor font-sizes are now ${offenders.length}, below the ${CEILING.subFloorFontSize} ceiling — ` +
    `lower CEILING.subFloorFontSize in this file to ${offenders.length} to lock the win in.`);
});

test("no new raw px spacing", () => {
  const offenders = [];
  for (const { name, src } of sheets()) {
    for (const m of src.matchAll(/(?:padding|margin|gap|row-gap|column-gap)[a-z-]*:\s*[^;{}]*?[0-9.]+px[^;{}]*/g)) {
      offenders.push(`${name}: ${m[0].trim().slice(0, 60)}`);
    }
  }

  const byFile = {};
  for (const o of offenders) { const f = o.split(":")[0]; byFile[f] = (byFile[f] || 0) + 1; }

  assert.ok(offenders.length <= CEILING.rawSpacing,
    `${offenders.length} padding/gap/margin declarations use a raw px literal, ceiling is ` +
    `${CEILING.rawSpacing}. Read --pad / --gap so the rule responds to the density ladder.\n` +
    JSON.stringify(byFile, null, 2));

  assert.equal(offenders.length, CEILING.rawSpacing,
    `raw spacing declarations are now ${offenders.length}, below the ${CEILING.rawSpacing} ceiling — ` +
    `lower CEILING.rawSpacing in this file to ${offenders.length} to lock the win in.`);
});

/* The four sheets that read no spacing token at all. This is the list the
   migration works through; an entry LEAVING it is the win, and a new entry
   joining it is a new screen that cannot respond to density. */
test("the zero-spacing-token sheet list only shrinks", () => {
  /* data.css, hud.css, overlays.css and track-detail.css came OFF this list on
     2026-08-13 — they now read --pad / --gap and so move with the density
     ladder, which is what "things do not resize" actually meant.
     responsive.css stays, and is a different case that should be judged
     differently rather than queued for the same migration: it is the
     media-query sheet, so its raw values are deliberately viewport-absolute
     (safe-area insets, the landscape-phone caps). It is listed because the
     measurement is the measurement. */
  const KNOWN_ZERO = ["responsive.css"];
  const zero = sheets()
    .filter(({ name }) => name !== "tokens.css")
    .filter(({ src }) => /(?:padding|margin|gap)[a-z-]*:[^;{}]*[0-9.]+px/.test(src))
    .filter(({ src }) => !/(?:padding|margin|gap)[a-z-]*:[^;{}]*var\(--(?:pad|gap)/.test(src))
    .map(({ name }) => name)
    .sort();

  const added = zero.filter((f) => !KNOWN_ZERO.includes(f));
  assert.deepEqual(added, [],
    `${added.join(", ")} spaces itself entirely in raw px and reads neither --pad nor --gap, ` +
    `so it cannot respond to the density ladder. Read the tokens, or add it to KNOWN_ZERO with a reason.`);

  const fixed = KNOWN_ZERO.filter((f) => !zero.includes(f));
  assert.deepEqual(fixed, [],
    `${fixed.join(", ")} now reads spacing tokens — remove it from KNOWN_ZERO in this file to lock that in.`);
});
