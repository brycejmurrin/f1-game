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
  // 2026-08-18: 1a3975c5 briefly added two 10px #subtitle eyebrows (3→5);
  // eedad021 restored the color system and those decls left (back to 3).
  // 2026-08-18: 3 → 4. 8d82b062 menu-hierarchy redesign added `#subtitle`
  // `font-size: 11px` on the title eyebrow (already red on deploy tip).
  // 2026-08-18: 4 → 5. 0ccd1b4c dashboard/season menu composition added another
  // sub-floor literal on the union.
  // 2026-08-18: 5 → 3. 864f5b32 / 8e01353c tokenised the title-screen menu
  // and locked the win back to the pre-redesign floor.
  // 2026-08-19: 3 → 4. adaptive-ui / audio work (build 1515) added one more
  // sub-floor literal (measured on deploy tip c3df0ee1).
  // 2026-08-27: 4 → 5, deliberate. The garage stacked-grid chip labels cap
  // at min(8px, --fs-micro - 3px): the relative form alone was written
  // against an 11px token and broke to 11px when the token moved to 14px
  // (labels ellipsised below tap size). 8px is measured against the 7-column
  // grid — SUSPENSION needs 47px in a 47px column interior at 852x393. The
  // comment at the declaration carries the measurement.
  subFloorFontSize: 5,
  // padding / gap / margin declarations containing a raw px literal.
  // POLICY (rewritten 2026-08-26, deliberately — user-approved): a raw px
  // spacing value converts when it has an EXACT token form, including
  // division forms (22/11 -> --pad; 12/24/18/9/6/3 -> --gap multiples;
  // 2/4/8/14/16 -> --gap sixths, thirds, two-thirds, 7/6, 4/3 written as
  // calc(var(--gap) / 3) style divisions so the arithmetic stays exact).
  // What stays literal: values with NO exact form (5/7/10px), measured
  // pairs whose comments record px arithmetic, position ANCHORS, and any
  // declaration inside a compact/rail-tier rule — those operate at
  // --gap: 8, where a 12-derived multiple is wrong at the rule's only
  // operating point. The old "a hairline should stay a hairline" rule was
  // retired when the tuner migration showed the density ladder SHOULD
  // tighten hairlines with everything else — that was the goal, not noise.
  // 2026-08-13: 529 -> 479. The four sheets that read NO spacing token at all
  // (data, hud, overlays, track-detail) were migrated in the same pass, for
  // exact simple ratios only (the division forms came 2026-08-26).
  // 2026-08-14: 475 -> 474. `.hud-gaps` lost an inert `gap: 4px` (it was never
  // a flex container) when the widget was resized in the HUD SIZE pass.
  // 2026-08-18: 471 -> 470. Data Hub Last Race column-hide rules lost a
  // duplicate landscape `padding` when they moved onto body[data-width].
  // 2026-08-18: 470 -> 467. Short-landscape HUD shrink left responsive.css
  // (`padding`/`gap` on .hud-box / .hud-top / #hud-sectors).
  // 2026-08-18: 467 → 476. Same 8d82b062 title-menu block added nine raw
  // padding/gap/margin decls (brand clamp, #subtitle, #menu-meta, button stacks).
  // 2026-08-18: 476 → 490. 0ccd1b4c dashboard/season menu block (+14 in menus.css).
  // 2026-08-18: 490 → 467. Title-screen tokenisation restored the 467 lock.
  // 2026-08-18: 467 → 481. Deploy `45dc6cb1` short-landscape / mid-width
  // menu compress (css/menus.css) added 14 raw padding/gap/margin decls
  // and did not remasure the ceiling; the union is 481.
  // 2026-08-18: 481 → 467. Tokenised that short-landscape / mid-width
  // compress onto --gap / --pad so density and UI SIZE still scale it.
  // 2026-08-18: 467 → 466. Settings remodel moved the 620px control pad
  // onto --pad so the list rows follow the density ladder.
  // 2026-08-19: 466 → 467. adaptive-ui / audio work (build 1515) added one
  // raw px spacing decl (measured on deploy tip c3df0ee1).
  // 2026-08-26: 467 → 466. Round-7 consistency sweep — one raw spacing decl
  // fell out with the token conversions (alpha-band / plate-family pass).
  // 2026-08-26: 466 → 453. Tuner spacing migration, the policy-safe set only:
  // 13 declarations with exact token ratios (6/3/9 -> --gap halves, quarters,
  // three-quarters) converted so the density ladder finally reaches the
  // lighting/camera panel's own layout. The hairline set (2/4/5/8/10px), the
  // measured pairs, the compact/rail tiers (already at --gap:8, so a 12-based
  // multiple is wrong at their only operating point), and the .lt-tabs
  // full-bleed triple stay raw per the policy note below.
  // 2026-08-26: 453 → 422. The 1b division set under the rewritten policy
  // above: 29 more tuner declarations onto exact --gap fractions (thirds,
  // sixths, two-thirds, 7/6, 4/3). Still raw in tuner.css: the .lt-tabs
  // full-bleed triple (next commit, atomic), the measured pairs, the
  // .adv-item 11px/7px inversion pair, and every compact/rail-tier value.
  // 2026-08-26: 422 → 419. The .lt-tabs full-bleed triple, atomically: the
  // panel's 18px inline pad and the strip's -18px margin + 18px re-pad are
  // ONE number three ways; all three are calc(var(--gap) * 1.5) now, so the
  // bleed stays exact at every density instead of only at --gap: 12.
  // 2026-08-26: 419 → 418. The track-detail close button's bespoke rule
  // (its padding: 0 among them) was deleted when the button joined the
  // shared .dh-close recipe.
  // 2026-08-27: 418 -> 363. css/data.css executed the division-form policy
  // (55 declarations; the hub was the largest single-file share). The three
  // negative pull-up margins (-2/-4 on the map legend, legend and delta
  // readouts) stay raw deliberately: they are optical anchors against a
  // canvas edge, the exclusion the policy names for anchors, and the tree
  // has no negative-division precedent to copy.
  // 2026-08-27: 363 -> 325. css/hud.css and css/overlays.css in one pass —
  // they share the HUD component (the hud-unit and gearbox sibling overrides
  // live across both), so migrating one alone would have split a single
  // widget's ladder across two densities. --btn-gap stays literal: it is a
  // token DEFINITION inside the measured --btn-pitch touch-dock pair, and
  // converting it would make the dock slot pitch density-dependent — a
  // behaviour change, not a spelling one. The centring anchors
  // (margin: -17px style) stay as anchors.
  // 2026-08-27: 325 -> 324. The career pressable-card carve deduplicated the
  // teamtile/seat padding pair into one shared declaration.
  // 2026-08-27: 324 -> 323. Round-13 season-row de-buttoning dropped the
  // rows' raw margin-bottom (the hairline grammar needs no stacking gap).
  rawSpacing: 323,
  // colour declarations carrying a raw literal (rgb()/rgba()/#hex in any
  // declaration value; tokens.css custom-property DEFINITIONS excluded — the
  // definition site is the system, not drift; url() interiors excluded).
  // POLICY: a literal converts when an existing token IS that value and that
  // meaning. What stays literal, with reasons in place: the mask-image alpha
  // stencils (a stencil's black is not a colour), the QR raster's pure
  // white/black (scanners), FIA flag signal colours (externally defined),
  // canvas-matched values whose comments record the pairing (.dh-gradbar,
  // .dh-canvas), gradient RAMP stops chosen against each other (tach,
  // energy), and the BOOST/OT/AERO ladder whose alphas are measured
  // compositing arithmetic. Set 2026-08-27 with the guard.
  // 2026-08-27: 379 -> 376. Round-11 de-buttoning: .trb-* and .tdf-* lost
  // their borders (three 0.3/0.4-alpha border tints left with them), .spf-dir
  // stepped under the hover fill, .spf-corner moved off --plate-on onto a
  // color-mix tint (no literal), .tdc-corner gained one sub-floor neutral.
  // 2026-08-27: 376 -> 377, deliberate. The season calendar rows adopt the
  // circuit-list hairline (the .track-row separator spelling, so distinct
  // stays flat); the rows they replace carried tokens only, nothing to trade.
  rawColor: 377,
  // distinct colour VALUES after normalising spelling: space-after-comma,
  // trailing zero, leading dot, and hex-vs-rgb notation all fold to one
  // canonical form. This is the fork guard — identical paint must not hide
  // behind different spellings, because grep-based dedup is how conversions
  // get planned. Set 2026-08-27 with the guard.
  // 2026-08-27: 194 -> 190 in the same pass — the deleted border tints were
  // the only users of their values.
  rawColorDistinct: 190,
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

/* ---- colours: the same ratchet, one structural difference. Colours appear
   across many properties (color, background, border-*, shadows, gradients),
   so the counter iterates declaration VALUES generically instead of anchoring
   on a property list — [^;{}] confines each match to one declaration, which
   is what keeps selectors out (verified: no selector in this tree contains a
   3/4/6/8-hex token or an rgb() call). Gradient and color-mix interiors are
   deliberately IN scope: they are where #fff and #000 hide. */
const COLOR_DECL = /(--[a-zA-Z0-9-]+|[a-z-]+)\s*:\s*([^;{}]*)/g;
const COLOR_LIT = /rgba?\([^)]*\)|#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
const URL_VALUE = /url\((?:"[^"]*"|'[^']*'|[^)]*)\)/g;

function colorLiterals() {
  const found = [];
  for (const { name, src } of sheets()) {
    for (const d of src.matchAll(COLOR_DECL)) {
      if (name === "tokens.css" && d[1].startsWith("--")) continue;
      const lits = d[2].replace(URL_VALUE, "").match(COLOR_LIT);
      if (lits) for (const v of lits) found.push({ file: name, v });
    }
  }
  return found;
}

/* One canonical spelling per paint value, so a fork cannot read as two
   colours: expand short hex, fold hex and rgb()/rgba() to the same rendering,
   parseFloat every channel (kills trailing zeros and leading dots). */
function normColor(v) {
  if (v[0] === "#") {
    let h = v.slice(1).toLowerCase();
    if (h.length <= 4) h = [...h].map((c) => c + c).join("");
    const ch = [0, 1, 2].map((i) => parseInt(h.slice(i * 2, i * 2 + 2), 16));
    const a = h.length === 8 ? Math.round(parseInt(h.slice(6, 8), 16) / 255 * 1000) / 1000 : 1;
    return `rgb(${ch.join()},${a})`;
  }
  const parts = v.slice(v.indexOf("(") + 1, -1).split(/[\s,/]+/).filter(Boolean).map(parseFloat);
  const [r = 0, g = 0, b = 0, a = 1] = parts;
  return `rgb(${[r, g, b].join()},${Math.round(a * 1000) / 1000})`;
}

test("no new raw colour literals", () => {
  const offenders = colorLiterals();
  const byFile = {};
  for (const o of offenders) byFile[o.file] = (byFile[o.file] || 0) + 1;

  assert.ok(offenders.length <= CEILING.rawColor,
    `${offenders.length} declarations carry a raw colour literal, ceiling is ${CEILING.rawColor}. ` +
    `Read a css/tokens.css colour (or mint one if the value has 4+ uses and one meaning); ` +
    `if the literal is deliberate (stencil, ramp stop, canvas-matched, signal colour), ` +
    `say why in a comment and raise the ceiling deliberately.\n` +
    JSON.stringify(byFile, null, 2));

  assert.equal(offenders.length, CEILING.rawColor,
    `raw colour declarations are now ${offenders.length}, below the ${CEILING.rawColor} ceiling — ` +
    `lower CEILING.rawColor in this file to ${offenders.length} to lock the win in.`);
});

test("colour spelling forks only ever fold", () => {
  const byNorm = new Map();
  for (const { v } of colorLiterals()) {
    const n = normColor(v);
    if (!byNorm.has(n)) byNorm.set(n, new Set());
    byNorm.get(n).add(v);
  }
  const distinct = byNorm.size;

  assert.ok(distinct <= CEILING.rawColorDistinct,
    `${distinct} distinct colour values after normalisation, ceiling is ${CEILING.rawColorDistinct}. ` +
    `A new distinct value means a colour outside the system — use a token or an existing value.\n` +
    "Largest fork groups (one value, several spellings):\n" +
    [...byNorm.entries()].filter(([, s]) => s.size > 1)
      .sort((a, b) => b[1].size - a[1].size).slice(0, 8)
      .map(([n, s]) => `  ${n} <- ${[...s].join(" | ")}`).join("\n"));

  assert.equal(distinct, CEILING.rawColorDistinct,
    `distinct colour values are now ${distinct}, below the ${CEILING.rawColorDistinct} ceiling — ` +
    `lower CEILING.rawColorDistinct in this file to ${distinct} to lock the win in.`);
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
