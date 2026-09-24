/* THE LOADING CARD'S GEOMETRY — the three numbers the flyby editor authors.
 *
 * js/ui/loading-screen.js is a DOM screen and nothing here boots one. What is
 * checkable without a browser is the part that decides what reaches the
 * stylesheet, and that part is where this feature can actually break a player's
 * game rather than just look wrong:
 *
 *  1. A PARTIAL OR HOSTILE GEOMETRY MUST NOT REACH CSS. The value comes out of
 *     localStorage, so it can be a save from a future build, a hand-edited
 *     blob, or half an object. `NaNvw` in a custom property is not an error CSS
 *     reports — the declaration is dropped and the card silently keeps whatever
 *     it had, which is the one failure mode nobody would think to look for.
 *  2. NULL IS WHAT "UNCHANGED" IS STORED AS. The flyby shot list learned this
 *     the expensive way (see persist() in js/camera/flyby-panel.js): storing a
 *     copy of the defaults pins the player to today's numbers and silently
 *     ignores every later change to them.
 *
 * Run: node --test tests/unit/loading-card.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

/** LoadingScreen's module surface, evaluated on its own — the same `const` ->
 *  `var` rewrite tests/unit/flyby-panel.test.mjs uses for the other UI modules. */
function load() {
  const sb = { Math, JSON, Object, Array, Number, String, isFinite, Date, console };
  sb.window = sb;
  vm.runInNewContext(read("js/ui/loading-screen.js").replace(/^const\b/gm, "var"), sb,
    { filename: "js/ui/loading-screen.js" });
  assert.ok(sb.LoadingScreen, "js/ui/loading-screen.js assigns the LoadingScreen global");
  return sb.LoadingScreen;
}

const LS = load();
const { CARD, CARD_KEYS, clampCard, cardPristine, cardVars } = LS;

test("the registry is complete: every key has a range, a step, a label and a default inside it", () => {
  assert.ok(CARD_KEYS.length >= 3, "size and both axes, at least");
  for (const k of CARD_KEYS) {
    const d = CARD[k];
    assert.ok(d, `${k} has no definition`);
    assert.ok(d.label && d.label.length > 2, `${k} has no label for its slider`);
    assert.ok(Number.isFinite(d.min) && Number.isFinite(d.max) && d.min < d.max, `${k} has no usable range`);
    assert.ok(d.step > 0, `${k} has no step`);
    assert.ok(d.def >= d.min && d.def <= d.max, `${k}'s shipped default is outside its own slider`);
  }
});

test("clampCard fills EVERY field from anything at all — the store can hand back a fragment", () => {
  for (const hostile of [null, undefined, {}, [], "1.2", 7, { scale: "big" }, { scale: NaN }, { x: Infinity }]) {
    const g = clampCard(hostile);
    for (const k of CARD_KEYS) {
      assert.ok(Number.isFinite(g[k]), `${k} came back ${g[k]} from ${JSON.stringify(hostile)}`);
      assert.ok(g[k] >= CARD[k].min && g[k] <= CARD[k].max, `${k} came back out of range`);
    }
  }
});

test("a partial save keeps what it has and defaults the rest — it is not thrown away whole", () => {
  const g = clampCard({ x: 12 });
  assert.equal(g.x, 12);
  assert.equal(g.scale, CARD.scale.def);
  assert.equal(g.y, CARD.y.def);
});

test("an out-of-range value is CLAMPED, never dropped — a card three times the screen is a card nobody can move back", () => {
  const big = clampCard({ scale: 99, x: 5000, y: -5000 });
  assert.equal(big.scale, CARD.scale.max);
  assert.equal(big.x, CARD.x.max);
  assert.equal(big.y, CARD.y.min);
  const small = clampCard({ scale: -3 });
  assert.equal(small.scale, CARD.scale.min);
});

test("the shipped geometry is pristine, and one moved field is not", () => {
  assert.equal(cardPristine(null), true, "no save at all is the shipped card");
  assert.equal(cardPristine({}), true);
  const def = {};
  for (const k of CARD_KEYS) def[k] = CARD[k].def;
  assert.equal(cardPristine(def), true, "a geometry equal to the defaults must still store as null");
  assert.equal(cardPristine(Object.assign({}, def, { x: 3 })), false);
  // …and a value that CLAMPS back onto the default is pristine, because what
  // the card ends up at is what "unchanged" means.
  assert.equal(cardPristine(Object.assign({}, def, { scale: "nonsense" })), true);
});

test("cardVars emits parseable CSS for every input, hostile ones included", () => {
  for (const hostile of [null, { scale: NaN, x: "left", y: {} }, { x: 1e9 }]) {
    const v = cardVars(hostile);
    // A bare number for the scale: the stylesheet divides the width cap by it,
    // and a unit there makes the whole calc() invalid.
    assert.match(v["--ld-card-scale"], /^[0-9]+(\.[0-9]+)?$/, JSON.stringify(v));
    // The offsets carry the SCREEN's units, not the card's. A percentage would
    // be a percentage of the card, so the same saved number would move a scaled
    // card further than an unscaled one.
    assert.match(v["--ld-card-x"], /^-?[0-9]+(\.[0-9]+)?vw$/, JSON.stringify(v));
    assert.match(v["--ld-card-y"], /^-?[0-9]+(\.[0-9]+)?vh$/, JSON.stringify(v));
    for (const s of Object.values(v)) assert.ok(!/NaN|undefined|Infinity/.test(s), s);
  }
});

test("the stylesheet reads exactly the custom properties this module writes, and gives each one a fallback", () => {
  // The two halves of this feature live in different files and neither imports
  // the other. A renamed property fails SILENTLY — CSS drops an unknown var()
  // and the card renders at its fallback, which looks exactly like "the player
  // never moved it".
  const css = read("css/overlays.css");
  for (const name of Object.keys(cardVars(null))) {
    assert.ok(css.includes(name), `css/overlays.css never reads ${name}`);
    assert.match(css, new RegExp(`var\\(${name},\\s*[^)]+\\)`),
      `${name} is read with no fallback — a browser with no saved geometry gets an invalid declaration`);
  }
});

test("the shipped default is the card that ships TODAY: no offset, no rescale", () => {
  // If this ever needs changing, the change belongs in the stylesheet, not
  // here: a non-identity default means every player's stored "unchanged" is a
  // different card from the one the CSS draws without JS.
  const v = cardVars(null);
  assert.equal(v["--ld-card-scale"], "1");
  assert.equal(v["--ld-card-x"], "0vw");
  assert.equal(v["--ld-card-y"], "0vh");
});

/* ── THE LETTERBOX ─────────────────────────────────────────────────────────
 * CSS only (css/overlays.css), so what is checkable here is the SOURCE: the
 * bars exist, are keyed on the flyby's run phase alone, are gated on landscape
 * and on motion being welcome, and the card paints above them. */

/** The body of the first `@media` block whose prelude matches `re`. */
function mediaBody(css, re) {
  const at = css.search(re);
  if (at < 0) return "";
  let i = css.indexOf("{", at), depth = 0;
  const start = i + 1;
  for (; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(start, i);
  }
  return "";
}

test("letterbox bars run over the flyby only, in landscape, and never under reduced motion", () => {
  const css = read("css/overlays.css");
  assert.match(css, /#loading::before,\s*#loading::after\s*\{[^}]*content:\s*none/,
    "the bars must be OFF by default — only the run phase turns them on");
  assert.match(css, /#loading::before,\s*#loading::after\s*\{[^}]*height:[^;]*2\.35/, "a 2.35:1 frame");
  const gated = mediaBody(css, /@media[^{]*orientation:\s*landscape[^{]*prefers-reduced-motion:\s*no-preference/);
  assert.ok(gated, "the bars are gated on landscape AND prefers-reduced-motion: no-preference");
  assert.match(gated, /#loading\[data-phase="run"\]::before/);
  assert.match(gated, /#loading\[data-phase="run"\]::after/);
  assert.match(gated, /content:\s*""/, "…and that is where they get their content");
  assert.match(gated, /var\(--ld-fly,\s*24s\)/, "timed to the run's budget, falling back to the shipped 24 s");
  // Nowhere else turns them on: not the no-world card, not the editor's hold.
  const outside = css.replace(gated, "");
  assert.ok(!/#loading\[data-phase="[a-z]+"\]::(before|after)/.test(outside),
    "a letterbox rule outside the landscape/motion gate");
  assert.ok(!/data-phase="(card|hold)"\]::(before|after)/.test(css), "the card and hold phases never letterbox");
  // They OPEN at the end: the last keyframe puts each bar back off-screen.
  for (const [name, dir] of [["ld-bar-top", "-100%"], ["ld-bar-bottom", "100%"]]) {
    const kf = css.match(new RegExp(`@keyframes ${name}\\s*\\{([\\s\\S]*?)\\n\\}`));
    assert.ok(kf, `@keyframes ${name} is missing`);
    assert.ok(new RegExp(`0%,\\s*100%\\s*\\{\\s*transform:\\s*translateY\\(${dir.replace(/[-%]/g, "\\$&")}\\)`).test(kf[1]),
      `${name} must start AND end off-screen — the bars open on the last beat`);
  }
});

test("the card paints ABOVE the letterbox, so the bottom bar never covers it", () => {
  const css = read("css/overlays.css");
  const card = css.match(/\n#ld-card\s*\{([\s\S]*?)\n\}/);
  assert.ok(card, "#ld-card rule not found");
  assert.match(card[1], /position:\s*relative/);
  const cz = +(card[1].match(/z-index:\s*(\d+)/) || [])[1];
  const bars = css.match(/#loading::before,\s*#loading::after\s*\{([^}]*)\}/);
  const bz = +(bars[1].match(/z-index:\s*(\d+)/) || [])[1];
  assert.ok(Number.isFinite(cz) && Number.isFinite(bz) && cz > bz, `card z ${cz} must exceed bar z ${bz}`);
  // The shipped placement is bottom-centre with no offset: the lower third
  // overlaps the bottom bar, which is why the stacking order matters at all.
  assert.equal(CARD.y.def, 0);
});
