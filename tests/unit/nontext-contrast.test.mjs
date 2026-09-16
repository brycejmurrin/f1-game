/* nontext-contrast.test.mjs — WCAG 1.4.11 (Non-text Contrast) over the tokens.
 *
 * 1.4.11 asks 3:1 of the visual information needed to IDENTIFY a control or
 * its STATE, and of the graphics you must see to understand the UI. It does
 * not ask it of decoration, and it does not ask it of a boundary drawn around
 * a control that its own text label already identifies. Those two carve-outs
 * are why a blanket "every hairline clears 3:1" sweep would be wrong here and
 * is deliberately not what this file does — `--plate-line` measures 1.55:1
 * over the darkest ground and that is FINE, because the thing it outlines is a
 * button with a word in it.
 *
 * What is left after the carve-outs is small, and it is exactly what this
 * pins:
 *
 *   1. the FOCUS RING, which is pure non-text information — nothing else says
 *      where the keyboard is;
 *   2. the SELECTED state, which the menus signal with colour on a boundary
 *      ("THE ONE SELECTED LOOK" in css/tokens.css: `background: var(--plate-on);
 *      border-color: var(--red)`);
 *   3. the standing claim that `var(--accent)` is DECORATION. Two team skins —
 *      racingbulls #1634cb at 2.21:1 and williams #0f3cc9 at 2.33:1 over
 *      --bg — sit under 3:1, and they are allowed to because every consumer of
 *      that token today is ornament: a scroll-fade nub, a skewed tick before a
 *      section label, the HUD box's left stripe, an 18% wash gradient. The
 *      moment --accent carries a state or identifies a control, those two
 *      skins become a real failure, so the consumer list is frozen below and
 *      growing it fails this test with that argument attached.
 *
 * COLOUR RESOLUTION. The tokens are `color-mix(in oklab, …)`, so the test
 * carries an OKLab resolver rather than eyeballed hexes. It was checked once
 * against Chromium's own computed values (a page declaring these seven tokens,
 * read back off `background-color`), and agrees to ~5 decimal places on all of
 * them, including CSS's two awkward cases: a mix whose percentages sum under
 * 100% scales the result's ALPHA (--plate-hover lands at 0.86, --plate-press
 * at 0.96), and mixing with `transparent` is a premultiplied lerp, so
 * --plate-on keeps red's hue at alpha 0.18 rather than sliding toward black.
 * Getting either wrong would move a ratio by more than the margins here.
 *
 * Run: node --test tests/unit/nontext-contrast.test.mjs   (npm run test:tooling-fast)
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cssRules, decl } from "../helpers/css-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");
const tokens = cssRules(read("css/tokens.css"));
const token = (name) => {
  const v = decl(tokens, ":root", name);
  assert.ok(v, `css/tokens.css must declare ${name} on :root`);
  return v;
};

/* ── sRGB / OKLab ────────────────────────────────────────────────────────── */

const s2l = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const l2s = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

function toOklab([r, g, b]) {
  const R = s2l(r / 255), G = s2l(g / 255), B = s2l(b / 255);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
          1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
          0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
function fromOklab([L, a, bb]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * bb) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * bb) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * bb) ** 3;
  return [ 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
          -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
          -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s]
    .map((v) => Math.max(0, Math.min(255, l2s(v) * 255)));
}

// Relative luminance / WCAG ratio. Note the 0.03928 knee: that is the WCAG
// definition, a hair off the sRGB 0.04045 above, and the difference is real
// enough at these near-black grounds to keep both spellings.
function lum([r, g, b]) {
  const c = [r, g, b].map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a, b) => {
  const x = lum(a.rgb), y = lum(b.rgb);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/* ── a colour: straight (un-premultiplied) sRGB + alpha ─────────────────── */

const hex = (h) => (h.length === 4
  ? [1, 2, 3].map((i) => parseInt(h[i] + h[i], 16))
  : [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
const TRANSPARENT = { rgb: [0, 0, 0], a: 0 };

/** Composite `fg` over the opaque `bg` in sRGB — what the screen actually shows. */
function over(fg, bg) {
  if (fg.a >= 1) return { rgb: fg.rgb, a: 1 };
  return { rgb: fg.rgb.map((v, i) => v * fg.a + bg.rgb[i] * (1 - fg.a)), a: 1 };
}

/** `color-mix(in oklab, A pA%, B pB%)`, premultiplied, with CSS alpha scaling. */
function mixOklab(A, pA, B, pB) {
  const total = pA + pB;
  const wA = pA / total, wB = pB / total;
  const a = A.a * wA + B.a * wB;
  // A fully transparent operand contributes no colour, only its (zero) weight.
  const LA = A.a === 0 ? [0, 0, 0] : toOklab(A.rgb);
  const LB = B.a === 0 ? [0, 0, 0] : toOklab(B.rgb);
  const L = [0, 1, 2].map((i) => (LA[i] * A.a * wA + LB[i] * B.a * wB) / (a || 1));
  return { rgb: a === 0 ? [0, 0, 0] : fromOklab(L), a: a * (total < 1 ? total : 1) };
}

/** Resolve one token value: a hex, `var(--x)`, `rgba(…)`, or a two-operand color-mix. */
function resolve(value, seen = new Set()) {
  const v = String(value).trim();
  let m;
  if (v === "transparent") return TRANSPARENT;
  if (v.startsWith("#")) return { rgb: hex(v), a: 1 };
  if ((m = v.match(/^var\((--[\w-]+)\)$/))) {
    assert.ok(!seen.has(m[1]), `token cycle at ${m[1]}`);
    return resolve(token(m[1]), new Set(seen).add(m[1]));
  }
  if ((m = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/))) {
    return { rgb: [+m[1], +m[2], +m[3]], a: m[4] == null ? 1 : +m[4] };
  }
  if ((m = v.match(/^color-mix\(\s*in oklab\s*,\s*(.+)\)$/i))) {
    const [a, b] = splitTop(m[1]);
    const one = (s) => {
      const p = s.trim().match(/^(.*?)\s+([\d.]+)%$/);
      return p ? { c: resolve(p[1], seen), p: +p[2] / 100 } : { c: resolve(s, seen), p: null };
    };
    const A = one(a), B = one(b);
    // CSS: one omitted percentage is 100% minus the other; both omitted is 50/50.
    const pA = A.p != null ? A.p : (B.p != null ? 1 - B.p : 0.5);
    const pB = B.p != null ? B.p : 1 - pA;
    return mixOklab(A.c, pA, B.c, pB);
  }
  assert.fail(`cannot resolve colour: ${v}`);
}

/** Split "a, b" at top level (commas inside nested parens belong to the operand). */
function splitTop(s) {
  const out = []; let d = 0, last = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") d++;
    else if (s[i] === ")") d--;
    else if (s[i] === "," && d === 0) { out.push(s.slice(last, i)); last = i + 1; }
  }
  out.push(s.slice(last));
  assert.equal(out.length, 2, `expected a two-operand color-mix, got: ${s}`);
  return out;
}

/* ── the grounds a control can sit on ───────────────────────────────────── */

const BG = resolve(token("--bg"));

// Every opaque surface a focus ring can land against, named the way the token
// comments name them. Translucent plates are composited over the page, which
// is the darkest thing under them and therefore the worst case for a light
// ring and the best case for a dark one.
function grounds() {
  const g = { "--bg": BG };
  for (const name of ["--surf-1", "--surf-3", "--panel", "--plate", "--plate-hover", "--plate-press", "--plate-on", "--red"]) {
    g[name] = over(resolve(token(name)), BG);
  }
  return g;
}

/* ── 1. the focus ring ──────────────────────────────────────────────────── */

test("the focus ring clears 3:1 against every surface it can land on", () => {
  // 2px of white outline is the ONLY thing that says where the keyboard is —
  // there is no second channel, so this is 1.4.11 in its purest form (and
  // 2.4.11 Focus Appearance, which asks the same 3:1 of the indicator against
  // adjacent colours). css/tokens.css already argues this in prose at
  // `--focus`; the numbers behind that argument live here.
  const focus = resolve(token("--focus"));
  const bad = [];
  for (const [name, g] of Object.entries(grounds())) {
    const r = ratio(focus, g);
    if (r < 3) bad.push(`${name} ${r.toFixed(2)}:1`);
  }
  assert.deepEqual(bad, [],
    "--focus " + token("--focus") + " must clear 3:1 on every ground. Red (#e10600) " +
    "measures ~2.6:1 on the page, which is why the ring is white and must stay a " +
    "light neutral — see the --focus comment in css/tokens.css");
});

test("the focus ring is a light neutral, not the brand red", () => {
  // Two independent reasons, both in the token comment: contrast (above) and
  // MEANING — red already says SELECTED, so a red ring on an already-selected
  // chip renders the two states identically.
  assert.equal(token("--focus"), "#fff",
    "--focus is white by argument, not by default; changing it needs the contrast " +
    "sweep above AND a new answer to 'what distinguishes focused from selected?'");
  const outline = decl(tokens, ":focus-visible", "outline");
  assert.ok(outline && /var\(--focus\)/.test(outline),
    `:focus-visible must draw its outline from --focus (found: ${outline})`);
  assert.match(outline, /max\(2px,/,
    "the ring must not thin below 2px when the player shrinks the UI scale");
});

/* ── 2. the selected state ──────────────────────────────────────────────── */

test("the selected boundary is perceivable against the ground and the idle edge", () => {
  // THE ONE SELECTED LOOK is `background: var(--plate-on); border-color:
  // var(--red)`. The fill is red at 18% — a tint, not a signal — so the BORDER
  // carries the state, and 1.4.11 wants it 3:1 against what sits either side.
  const red = resolve(token("--red"));
  const outside = ratio(red, BG);
  assert.ok(outside >= 3,
    `the selected border --red ${token("--red")} is ${outside.toFixed(2)}:1 over --bg; ` +
    `1.4.11 needs 3:1 or the selected chip stops reading as selected`);
  const fill = over(resolve(token("--plate-on")), BG);
  const inside = ratio(red, fill);
  assert.ok(inside >= 3,
    `the selected border is ${inside.toFixed(2)}:1 against its own --plate-on fill — ` +
    `at less than 3:1 the border dissolves into the tint and the control loses its edge`);
});

test("the idle control edge is exempt, and this test says why out loud", () => {
  // --plate-line is 1.55:1 over --bg. That is not a bug and must not be
  // "fixed" by a sweep: 1.4.11 exempts a boundary around a control that its
  // own visible text already identifies, which is every plate in these menus.
  // Asserting the number keeps the exemption a DECISION — if someone ever puts
  // an unlabelled control on a plate, the reviewer meets this comment first.
  const line = over(resolve(token("--plate-line")), BG);
  const r = ratio(line, BG);
  assert.ok(r < 3,
    `--plate-line now measures ${r.toFixed(2)}:1 — if it was deliberately raised to ` +
    `clear 3:1, delete this test; the exemption below is no longer what is happening`);
  assert.ok(Math.abs(r - 1.55) < 0.05,
    `--plate-line moved to ${r.toFixed(2)}:1 (was 1.55:1). A change to the de-facto ` +
    `control edge is a whole-UI change; re-judge it, do not re-baseline it here`);
});

/* ── 3. --accent is decoration, and stays decoration ────────────────────── */

// Frozen: every `var(--accent)` consumer, and why each is ornament rather than
// information. A team skin under 3:1 is only safe while this list is.
const ACCENT_DECOR = {
  "css/components.css": [
    "the scroll-fade nub — a 3px bar that repeats the scrollbar's own message",
    "`.sel-label::before` — a skewed tick giving section labels a shared left edge",
  ],
  "css/hud.css": [
    "`.hud-box` border-left — the team stripe on a box whose value is the readout",
    "`body.hud-prof-broadcast .hud-gaps` border-left — the same stripe, broadcast skin",
    "`--accent-dim` on the sector rows — the same stripe again, dimmed",
    "`#announce` border-left — the radio card's team stripe; the kinds that carry state (warning, penalty) recolour it with their own token",
  ],
  "css/tokens.css": [
    "`--accent-dim` derivation",
    "`--grad-accent` — an 18% wash that fades to transparent by 62%",
  ],
};

test("every var(--accent) consumer is decoration, so the dark team skins are exempt", () => {
  // racingbulls #1634cb 2.21:1 and williams #0f3cc9 2.33:1 over --bg. Both are
  // real brand colours and neither can be brightened without lying about the
  // team, so the invariant that keeps them legal is the one asserted here:
  // --accent never carries state and never identifies a control.
  const found = {};
  for (const file of Object.keys(ACCENT_DECOR)) {
    found[file] = (read(file).match(/var\(--accent(?:-dim)?\)/g) || []).length;
  }
  const expect = Object.fromEntries(Object.entries(ACCENT_DECOR).map(([f, u]) => [f, u.length]));
  assert.deepEqual(found, expect,
    "the --accent consumer list changed. If the new use is ORNAMENT, add it to " +
    "ACCENT_DECOR with a one-line reason. If it carries a STATE or identifies a " +
    "control, it is a WCAG 1.4.11 failure on two team skins today (racingbulls " +
    "2.21:1, williams 2.33:1 over --bg) and needs a second channel or a lighter " +
    "token — do not just bump the count");
  // And nowhere else may read the token at all.
  const others = fs.readdirSync(path.join(ROOT, "css"))
    .filter((f) => f.endsWith(".css") && !ACCENT_DECOR[`css/${f}`])
    .filter((f) => /var\(--accent(?:-dim)?\)/.test(read(`css/${f}`)));
  assert.deepEqual(others, [], "a new stylesheet reads --accent — see the message above");
});

test("a team accent may be dark, but --red and --focus must not follow it", () => {
  // The team skin re-points --accent only. The two tokens that DO carry
  // information — the selected border and the focus ring — are fixed, and a
  // future "skin the whole UI" change would silently push both under 3:1.
  const skins = [...read("css/tokens.css").matchAll(/:root\[data-team="([\w-]+)"\]\s*\{([^}]*)\}/g)];
  assert.ok(skins.length >= 11, `expected the team skin blocks, found ${skins.length}`);
  for (const [, team, body] of skins) {
    const props = [...body.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);
    assert.deepEqual(props, ["--accent"],
      `:root[data-team="${team}"] may only re-point --accent (found ${props.join(", ")}). ` +
      `Skinning --red or --focus would drop the selected border or the focus ring ` +
      `under 3:1 on the darker teams`);
  }
});
